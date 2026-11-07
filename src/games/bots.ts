import { blackjackBot } from "./blackjack/engine";
import { GameBot } from "./engine";
import { slotsBot } from "./slots/engine";

/**
 * Each game's bot, keyed by game id. Kept apart from the game definitions so
 * the options page doesn't bundle bot code. A game without an entry gets its
 * panel (history and totals) but no Start button.
 */
export const BOTS: Record<string, GameBot> = {
  blackjack: blackjackBot,
  slots: slotsBot,
};
