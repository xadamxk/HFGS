/**
 * Runs in the page's own JavaScript world (manifest `"world": "MAIN"`) so it
 * can read HF's page variables, which the content script's isolated world
 * can't see. It only reads and reports them (see core/pageBridge.ts); it never
 * changes the page.
 */
import { BRIDGE_SOURCE, CONTENT_SOURCE, PageState } from "./core/pageBridge";

type HfWindow = Window & {
  my_post_key?: unknown;
  windowID?: unknown;
  openGameState?: unknown;
  blackjackPayout?: unknown;
  machineName?: unknown;
};

function snapshot(): PageState {
  const page = window as HfWindow;
  return {
    postKey: typeof page.my_post_key === "string" ? page.my_post_key : null,
    windowId:
      typeof page.windowID === "string" || typeof page.windowID === "number"
        ? String(page.windowID)
        : null,
    // A plain object from HF's JSON, or null when no game is in progress
    openGameState:
      page.openGameState && typeof page.openGameState === "object"
        ? JSON.parse(JSON.stringify(page.openGameState))
        : null,
    blackjackPayout:
      typeof page.blackjackPayout === "number" ? page.blackjackPayout : null,
    machineName: typeof page.machineName === "string" ? page.machineName : null,
  };
}

function send(): void {
  window.postMessage(
    { source: BRIDGE_SOURCE, type: "state", state: snapshot() },
    location.origin
  );
}

window.addEventListener("message", (event) => {
  if (
    event.source === window &&
    event.data?.source === CONTENT_SOURCE &&
    event.data.type === "request-state"
  ) {
    send();
  }
});

// Announce once on load too, in case the content script asked before this ran.
send();
