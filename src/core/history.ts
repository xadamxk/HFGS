/**
 * Results and totals per game, kept in chrome.storage.local under
 * `history:<gameId>`. Amounts are in βytes. `returned` is what HF paid back
 * (its `payout`/`payoutCredits`), so `net = returned - wagered`.
 */

import { getItem, removeItem, setItem, STORAGE_KEYS } from "./storage";

export interface RoundResult {
  /** Game-specific label, e.g. "WIN", "WIN-BLACKJACK", "LOSE", "SPIN". */
  outcome: string;
  /** Total staked this round (doubles and splits included). */
  wagered: number;
  /** Total HF paid back this round. */
  returned: number;
  /** Balance HF reported after the round, if known. */
  balance?: number;
  /** Anything the game wants to keep for display (cards, reels). Keep it small. */
  details?: Record<string, unknown>;
}

export interface HistoryEntry extends RoundResult {
  at: number;
  net: number;
}

export interface Totals {
  rounds: number;
  wins: number;
  losses: number;
  pushes: number;
  wagered: number;
  returned: number;
  net: number;
  biggestWin: number;
}

export interface GameHistory {
  totals: Totals;
  /** Newest first, at most MAX_ENTRIES. Totals cover every round ever. */
  entries: HistoryEntry[];
}

export const MAX_ENTRIES = 500;

export function emptyTotals(): Totals {
  return {
    rounds: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    wagered: 0,
    returned: 0,
    net: 0,
    biggestWin: 0,
  };
}

/** Totals plus one round. Amounts are rounded to cents to avoid float drift. */
export function addToTotals(totals: Totals, entry: HistoryEntry): Totals {
  const cents = (n: number) => Math.round(n * 100) / 100;
  return {
    rounds: totals.rounds + 1,
    wins: totals.wins + (entry.net > 0 ? 1 : 0),
    losses: totals.losses + (entry.net < 0 ? 1 : 0),
    pushes: totals.pushes + (entry.net === 0 ? 1 : 0),
    wagered: cents(totals.wagered + entry.wagered),
    returned: cents(totals.returned + entry.returned),
    net: cents(totals.net + entry.net),
    biggestWin: Math.max(totals.biggestWin, entry.net),
  };
}

export function toEntry(result: RoundResult, at = Date.now()): HistoryEntry {
  return {
    ...result,
    at,
    net: Math.round((result.returned - result.wagered) * 100) / 100,
  };
}

function normalizeHistory(stored: unknown): GameHistory {
  const source = (
    stored && typeof stored === "object" ? stored : {}
  ) as Partial<GameHistory>;
  const totals = { ...emptyTotals(), ...(source.totals ?? {}) };
  const entries = Array.isArray(source.entries) ? source.entries : [];
  return { totals, entries };
}

export async function loadHistory(gameId: string): Promise<GameHistory> {
  return normalizeHistory(await getItem(STORAGE_KEYS.history(gameId)));
}

/** Add a round to a game's history and return the updated history. */
export async function recordRound(
  gameId: string,
  entry: HistoryEntry
): Promise<GameHistory> {
  const history = await loadHistory(gameId);
  const updated: GameHistory = {
    totals: addToTotals(history.totals, entry),
    entries: [entry, ...history.entries].slice(0, MAX_ENTRIES),
  };
  await setItem(STORAGE_KEYS.history(gameId), updated);
  return updated;
}

export async function clearHistory(gameId: string): Promise<void> {
  await removeItem(STORAGE_KEYS.history(gameId));
}
