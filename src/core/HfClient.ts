/**
 * The one way game code talks to HF. Lessons from Phase 0 (docs/phase0-findings.md):
 * - Requests go one at a time, never overlapping: HF answers a repeated action
 *   with a full HTML page instead of JSON.
 * - At least `minIntervalMs` passes between requests (the "Delay between
 *   actions" setting), so bots stay gentle on HF's servers.
 * - Non-JSON answers, `success: false` and timeouts become HfError, so a bot
 *   stops instead of guessing.
 */

export type HfErrorKind =
  | "loggedOut" // HF says the session ended
  | "hfError" // HF answered success: false with a message
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
}

export type FormValues = Record<string, string | number>;

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
  minIntervalMs: number;

  constructor(options: HfClientOptions) {
    this.postKey = options.postKey;
    this.minIntervalMs = options.minIntervalMs;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.origin = options.origin ?? "https://hackforums.net";
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /**
   * POST a form to an HF endpoint (e.g. "/slots/spin.php") with the post key
   * added, and return the parsed JSON. Calls are queued: each waits for the
   * previous one to finish and for the minimum interval to pass.
   */
  post<T>(path: string, form: FormValues): Promise<T> {
    const run = () => this.send<T>(path, form);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async send<T>(path: string, form: FormValues): Promise<T> {
    if (!this.postKey) {
      throw new HfError(
        "noPostKey",
        "No post key on the page. Are you signed in?"
      );
    }
    const wait = this.lastRequestAt + this.minIntervalMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = this.now();

    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(form))
      body.set(key, String(value));
    body.set("my_post_key", this.postKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
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
    } catch (error) {
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

    if (!response.ok) {
      throw new HfError("http", `HF answered ${response.status}`);
    }
    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new HfError(
        "nonJson",
        "HF answered with a page instead of game data (a repeated or expired action?)"
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
