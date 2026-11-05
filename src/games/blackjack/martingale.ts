/**
 * Martingale sets, read back from the history. A set is the run of bot hands
 * from a base bet up to the win that ends the progression; pushes keep it
 * going. The engine tags each hand (`details.martingale`); nothing else in the
 * history changes, so the results table and exports stay as they are.
 */

import { HistoryEntry } from "../../core/history";

/** Stored on each martingale hand's details. */
export interface MartingaleTag {
  /** Set id: when the set's first hand was played. */
  set: string;
  /** 1 for the set's first hand, then 2, 3… */
  step: number;
  /** The bet placed (before any double or split). */
  bet: number;
  /** The bet cap at the time. */
  cap: number;
}

export type SetResult =
  /** A win ended it and the set is up overall. */
  | "recovered"
  /** A win ended it, but the cap kept the bet too low to cover the losses. */
  | "short"
  /** Still being played this session. */
  | "open"
  /** The bot stopped (or hit a limit) before a win; the next start begins a new set. */
  | "abandoned";

export interface MartingaleSet {
  id: string;
  startedAt: number;
  endedAt: number;
  hands: number;
  peakBet: number;
  /** The highest step reached (the longest the progression ran). */
  steps: number;
  hitCap: boolean;
  wagered: number;
  net: number;
  result: SetResult;
  /** Last hand's tag, for the next bet of an open set. */
  last: MartingaleTag;
  lastNet: number;
}

export const RESULT_LABELS: Record<SetResult, string> = {
  recovered: "Recovered",
  short: "Won, short",
  open: "In progress",
  abandoned: "Abandoned",
};

export function tagOf(entry: HistoryEntry): MartingaleTag | null {
  const tag = entry.details?.martingale as MartingaleTag | undefined;
  return tag && typeof tag.set === "string" && typeof tag.step === "number"
    ? tag
    : null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Sets in the history (given newest first), newest first. A set whose last
 * hand wasn't a win is "open" if it was played in the session running now
 * (`sessionStartedAt`), else "abandoned".
 */
export function martingaleSets(
  entries: HistoryEntry[],
  sessionStartedAt: number | null = null
): MartingaleSet[] {
  const byId = new Map<string, MartingaleSet>();
  // Oldest first, so each set's last hand is the one seen last
  for (const entry of [...entries].reverse()) {
    const tag = tagOf(entry);
    if (!tag) continue;
    const set = byId.get(tag.set) ?? {
      id: tag.set,
      startedAt: entry.at,
      endedAt: entry.at,
      hands: 0,
      peakBet: 0,
      steps: 0,
      hitCap: false,
      wagered: 0,
      net: 0,
      result: "abandoned" as SetResult,
      last: tag,
      lastNet: 0,
    };
    set.hands++;
    set.endedAt = entry.at;
    set.peakBet = Math.max(set.peakBet, tag.bet);
    set.steps = Math.max(set.steps, tag.step);
    set.hitCap ||= tag.bet >= tag.cap;
    set.wagered = cents(set.wagered + entry.wagered);
    set.net = cents(set.net + entry.net);
    set.last = tag;
    set.lastNet = entry.net;
    byId.set(tag.set, set);
  }
  const sets = [...byId.values()];
  for (const set of sets) {
    if (set.lastNet > 0) set.result = set.net >= 0 ? "recovered" : "short";
    else
      set.result =
        sessionStartedAt !== null && set.endedAt >= sessionStartedAt
          ? "open"
          : "abandoned";
  }
  return sets.sort((a, b) => b.startedAt - a.startedAt);
}

export interface SetSummary {
  sets: number;
  /** Finished sets only (open ones left out of the rates). */
  finished: number;
  recovered: number;
  short: number;
  abandoned: number;
  averageHands: number;
  longest: number;
  worstNet: number;
  net: number;
}

export function summarizeSets(sets: MartingaleSet[]): SetSummary {
  const finished = sets.filter((s) => s.result !== "open");
  const count = (result: SetResult) =>
    sets.filter((s) => s.result === result).length;
  return {
    sets: sets.length,
    finished: finished.length,
    recovered: count("recovered"),
    short: count("short"),
    abandoned: count("abandoned"),
    averageHands: finished.length
      ? cents(finished.reduce((sum, s) => sum + s.hands, 0) / finished.length)
      : 0,
    longest: Math.max(0, ...sets.map((s) => s.hands)),
    worstNet: Math.min(0, ...sets.map((s) => s.net)),
    net: cents(sets.reduce((sum, s) => sum + s.net, 0)),
  };
}
