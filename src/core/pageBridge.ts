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
