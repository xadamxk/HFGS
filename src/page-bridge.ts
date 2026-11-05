/**
 * Runs in the page's own JavaScript world (manifest `"world": "MAIN"`), where
 * HF's page variables and game scripts live; the content script's isolated
 * world can't reach them. Talks to the content script over window.postMessage
 * (see core/pageBridge.ts):
 *
 * - reports HF's page state (post key, windowID, an unfinished hand);
 * - draws the bot's results with HF's own animations (when Headless Mode is off)
 *   or brings HF's counters up to date (when it's on);
 * - reports the rounds the user plays by hand, so the panel counts them too.
 */
import {
  BRIDGE_SOURCE,
  CONTENT_SOURCE,
  gameIdForPath,
  PageState,
} from "./core/pageBridge";
import { blackjackPage } from "./page/blackjack";
import { slotsPage } from "./page/slots";
import { PageGame } from "./page/types";

const PAGE_GAMES: Record<string, PageGame> = {
  blackjack: blackjackPage,
  slots: slotsPage,
};

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

function post(message: Record<string, unknown>): void {
  window.postMessage({ source: BRIDGE_SOURCE, ...message }, location.origin);
}

const gameId = gameIdForPath(location.pathname);
const game = gameId ? PAGE_GAMES[gameId] : undefined;

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== CONTENT_SOURCE) return;
  const message = event.data;
  switch (message.type) {
    case "request-state":
      post({ type: "state", state: snapshot() });
      break;
    case "show": {
      const done = (ok: boolean, error?: string) =>
        post({ type: "shown", id: message.id, ok, error });
      if (!game) {
        done(false, "No page animations for this game");
        break;
      }
      game
        .show(String(message.action), message.response, message.bet ?? null)
        .then(
          () => done(true),
          (error) => done(false, String(error?.message ?? error))
        );
      break;
    }
    case "sync":
      try {
        game?.sync(Number(message.balance), message.details ?? {});
      } catch {
        // HF's page changed; the panel still has the numbers
      }
      break;
  }
});

game?.watch((round) => post({ type: "round", game: gameId, ...round }));

// Announce once on load too, in case the content script asked before this ran.
post({ type: "state", state: snapshot() });
