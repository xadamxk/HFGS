/**
 * Reads HF's page variables (post key, windowID, an unfinished blackjack game)
 * from the MAIN-world script in src/page-bridge.ts, over window.postMessage.
 */

export const BRIDGE_SOURCE = "hfgs-page-bridge";
export const CONTENT_SOURCE = "hfgs-content";

export interface PageState {
  /** HF's CSRF token, sent with every game request. Never log or store it. */
  postKey: string | null;
  /** Sent with slots spins. */
  windowId: string | null;
  /** Blackjack: the unfinished game HF restores on page load, else null. */
  openGameState: Record<string, unknown> | null;
  /** Blackjack: total returned on a natural (2.5 = 3:2). */
  blackjackPayout: number | null;
  /** Slots: the machine HF's page spins ("default"). */
  machineName: string | null;
}

function isPageState(value: unknown): value is PageState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return (
    (state.postKey === null || typeof state.postKey === "string") &&
    (state.windowId === null || typeof state.windowId === "string") &&
    (state.openGameState === null || typeof state.openGameState === "object") &&
    (state.blackjackPayout === null ||
      typeof state.blackjackPayout === "number") &&
    (state.machineName === null || typeof state.machineName === "string")
  );
}

/** The post key from HF's inline script, for when the bridge doesn't answer. */
export function postKeyFromHead(): string | null {
  return (
    document.head?.innerHTML.match(/my_post_key\s*=\s*"([a-f0-9]+)"/)?.[1] ??
    null
  );
}

/**
 * Ask the page bridge for the current page state. Falls back to reading the
 * post key from the page's markup if the bridge doesn't answer in time.
 */
export function readPageState(timeoutMs = 2000): Promise<PageState> {
  return new Promise((resolve) => {
    const finish = (state: PageState) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(state);
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.source === window &&
        event.data?.source === BRIDGE_SOURCE &&
        event.data.type === "state" &&
        isPageState(event.data.state)
      ) {
        finish(event.data.state);
      }
    };
    const timer = setTimeout(
      () =>
        finish({
          postKey: postKeyFromHead(),
          windowId: null,
          openGameState: null,
          blackjackPayout: null,
          machineName: null,
        }),
      timeoutMs
    );
    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: CONTENT_SOURCE, type: "request-state" },
      location.origin
    );
  });
}

/**
 * The game played on a page path, for the page bridge (which doesn't bundle
 * the game registry; a test checks the two agree).
 */
export const PAGE_GAME_PATHS: Record<string, string> = {
  "/blackjack.php": "blackjack",
  "/slots.php": "slots",
};

export function gameIdForPath(pathname: string): string | null {
  return PAGE_GAME_PATHS[pathname] ?? null;
}

function toBridge(message: Record<string, unknown>): void {
  window.postMessage({ source: CONTENT_SOURCE, ...message }, location.origin);
}

let nextShowId = 1;

/**
 * Have HF's page draw a response the bot received, with HF's own animations.
 * Resolves once the animation has finished (true), or with false if the page
 * couldn't draw it or took longer than `timeoutMs`; the bot carries on either way.
 */
export function showOnPage(
  action: string,
  response: unknown,
  bet: number | null,
  timeoutMs = 20000
): Promise<boolean> {
  const id = nextShowId++;
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(ok);
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.source === window &&
        event.data?.source === BRIDGE_SOURCE &&
        event.data.type === "shown" &&
        event.data.id === id
      ) {
        finish(event.data.ok === true);
      }
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    window.addEventListener("message", onMessage);
    toBridge({ type: "show", id, action, response, bet });
  });
}

/** Headless Mode: bring HF's own counters up to date after a bot round. */
export function syncPage(
  balance: number,
  details: Record<string, unknown> = {}
): void {
  toBridge({ type: "sync", balance, details });
}

/** A round HF's own page played (the user playing by hand). */
export interface ManualRound {
  game: string;
  action: string;
  response: unknown;
  bet: number | null;
}

/** Call `listener` for every round the user plays by hand on this page. */
export function onManualRound(
  listener: (round: ManualRound) => void
): () => void {
  const onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (
      event.source === window &&
      data?.source === BRIDGE_SOURCE &&
      data.type === "round" &&
      typeof data.game === "string" &&
      typeof data.action === "string"
    ) {
      listener({
        game: data.game,
        action: data.action,
        response: data.response,
        bet: typeof data.bet === "number" ? data.bet : null,
      });
    }
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
