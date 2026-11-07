/**
 * The one way game code talks to HF. Lessons from Phase 0 and the first live
 * run (docs/phase0-findings.md):
 * - HF has flood control: an action sent ~1s after the previous one gets an
 *   HTML page saying "You are trying to submit this form too quickly" and is
 *   NOT applied (balance and hand unchanged). So requests go one at a time, at
 *   least `minIntervalMs` after the previous response, and a flood rejection is
 *   retried after a growing wait.
 * - Other non-JSON answers, `success: false` and timeouts become HfError, so a
 *   bot stops instead of guessing.
 */

export type HfErrorKind =
  | "loggedOut" // HF says the session ended
  | "hfError" // HF answered success: false with a message
  | "flood" // HF's "submitting too quickly" page; the action wasn't applied
  | "nonJson" // An HTML page or other non-JSON answer
  | "http" // A non-2xx status
  | "network" // fetch failed or timed out
  | "noPostKey"; // The page had no post key (signed out?)

export class HfError extends Error {
  constructor(
    readonly kind: HfErrorKind,
    message: string
  ) {
    super(message);
    this.name = "HfError";
  }
}

export interface HfClientOptions {
  postKey: string | null;
  minIntervalMs: number;
  timeoutMs?: number;
  origin?: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Retries after a flood rejection (default 3); waits grow each time. */
  floodRetries?: number;
}

/** HF's flood-control page. */
const FLOOD_PATTERN = /submit\w* this form too quickly/i;

export type FormValues = Record<string, string | number>;

/**
 * fetch() as the page itself would make it, so HF's session cookies go along.
 * Chrome's content-script fetch already does; in Firefox a content script's
 * plain fetch runs as the extension, and `content.fetch` is the page-context one.
 */
export const pageFetch: typeof fetch = (input, init) => {
  const firefox = (globalThis as { content?: { fetch?: typeof fetch } })
    .content;
  return typeof firefox?.fetch === "function"
    ? firefox.fetch(input, init)
    : fetch(input, init);
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class HfClient {
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = -Infinity;
  private readonly postKey: string | null;
  private readonly timeoutMs: number;
  private readonly origin: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly floodRetries: number;
  minIntervalMs: number;
  /** How many flood rejections were retried (for diagnostics). */
  floodRetriesUsed = 0;
  /**
   * Extra spacing added after each flood rejection, for the rest of this
   * client's life, so a too-short delay doesn't keep getting actions rejected
   * (each rejection costs a request that has to be sent again).
   */
  floodPenaltyMs = 0;

  constructor(options: HfClientOptions) {
    this.postKey = options.postKey;
    this.minIntervalMs = options.minIntervalMs;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.origin = options.origin ?? "https://hackforums.net";
    this.fetchImpl = options.fetch ?? pageFetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.floodRetries = options.floodRetries ?? 3;
  }

  /**
   * POST a form to an HF endpoint (e.g. "/slots/spin.php") with the post key
   * added, and return the parsed JSON. Calls are queued: each waits for the
   * previous one to finish and for the minimum interval to pass.
   */
  post<T>(path: string, form: FormValues): Promise<T> {
    const run = () => this.sendWithRetry<T>(path, form);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Resend after HF's flood page, waiting longer each time. */
  private async sendWithRetry<T>(path: string, form: FormValues): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.send<T>(path, form);
      } catch (error) {
        if (
          !(error instanceof HfError) ||
          error.kind !== "flood" ||
          attempt >= this.floodRetries
        ) {
          throw error;
        }
        this.floodRetriesUsed++;
        this.floodPenaltyMs = Math.min(this.floodPenaltyMs + 500, 5000);
        // send() already holds the resend to the delay plus the penalty; later
        // retries back off further on top of that
        if (attempt > 0)
          await this.sleep(Math.max(this.minIntervalMs, 1000) * attempt);
      }
    }
  }

  private async send<T>(path: string, form: FormValues): Promise<T> {
    if (!this.postKey) {
      throw new HfError(
        "noPostKey",
        "No post key on the page. Are you signed in?"
      );
    }
    const wait =
      this.lastRequestAt +
      this.minIntervalMs +
      this.floodPenaltyMs -
      this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = this.now();
    try {
      return await this.request<T>(path, form, this.postKey);
    } finally {
      // Space the next request from when HF finished answering this one.
      this.lastRequestAt = this.now();
    }
  }

  private async request<T>(
    path: string,
    form: FormValues,
    postKey: string
  ): Promise<T> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(form))
      body.set(key, String(value));
    body.set("my_post_key", postKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    let text: string;
    // The timeout covers reading the reply too, not just its headers: a reply
    // that stalls halfway would otherwise hang the queue with no error.
    try {
      response = await this.fetchImpl(new URL(path, this.origin).toString(), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: body.toString(),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new HfError("http", `HF answered ${response.status}`);
      }
      text = await response.text();
    } catch (error) {
      if (error instanceof HfError) throw error;
      const aborted = (error as Error)?.name === "AbortError";
      throw new HfError(
        "network",
        aborted
          ? `HF didn't answer within ${this.timeoutMs / 1000}s`
          : `Request failed: ${(error as Error)?.message}`
      );
    } finally {
      clearTimeout(timer);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      const message = htmlErrorMessage(text);
      throw new HfError(
        FLOOD_PATTERN.test(message ?? text) ? "flood" : "nonJson",
        message
          ? `HF: ${message}`
          : "HF answered with a page instead of game data (a repeated or expired action?)"
      );
    }
    const data = json as { success?: unknown; error?: unknown };
    if (data && typeof data === "object" && data.success === false) {
      if (data.error === "loggedOut") {
        throw new HfError("loggedOut", "HF says you're signed out");
      }
      throw new HfError(
        "hfError",
        `HF: ${String(data.error ?? "request failed")}`
      );
    }
    return json as T;
  }
}

/**
 * The message from an HF (MyBB) error page, e.g. a flood-control or "invalid
 * request" notice: the text of the error table's body cell or an error box.
 * Returns null for pages without one. Only short visible text is kept, never
 * markup (HF pages carry session tokens in links).
 */
export function htmlErrorMessage(html: string): string | null {
  if (typeof DOMParser === "undefined" || !/<html|<body|<table/i.test(html)) {
    return null;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const candidates = [
    ...doc.querySelectorAll(".error, .red_alert, #content .tborder td.trow1"),
  ];
  for (const node of candidates) {
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (text) return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  }
  return null;
}
