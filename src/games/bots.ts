import { GameBot } from "./engine";

/**
 * Each game's bot, keyed by game id. Kept apart from the game definitions so
 * the options page doesn't bundle bot code. A game without an entry gets its
 * panel (history and totals) but no Start button.
 *
 * Blackjack arrives in Phase 3, slots in Phase 4.
 */
export const BOTS: Record<string, GameBot> = {};
