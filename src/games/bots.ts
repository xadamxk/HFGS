import { blackjackBot } from "./blackjack/engine";
import { GameBot } from "./engine";

/**
 * Each game's bot, keyed by game id. Kept apart from the game definitions so
 * the options page doesn't bundle bot code. A game without an entry gets its
 * panel (history and totals) but no Start button.
 *
 * Slots arrives in Phase 4.
 */
export const BOTS: Record<string, GameBot> = {
  blackjack: blackjackBot,
};
