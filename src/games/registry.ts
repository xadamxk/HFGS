import { blackjack } from "./blackjack/definition";
import { slots } from "./slots/definition";
import { GameDefinition } from "./types";

/** Every supported game, in the order the options page shows them. */
export const GAMES: GameDefinition[] = [
  blackjack as unknown as GameDefinition,
  slots as unknown as GameDefinition,
];

export function getGame(id: string): GameDefinition | undefined {
  return GAMES.find((game) => game.id === id);
}

/**
 * The game played on a page, or undefined. Only the game page itself counts:
 * HF's stats views (e.g. blackjack.php?action=stats) share the path.
 */
export function gameForUrl(href: string): GameDefinition | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (url.hostname !== "hackforums.net" || url.searchParams.has("action")) {
    return undefined;
  }
  return GAMES.find((game) => game.path === url.pathname);
}
