import { Totals, winRate } from "../history";

/** βytes as HF shows them: whole numbers bare, others to cents; `signed` adds "+". */
export function formatAmount(n: number, signed = false): string {
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return signed && n > 0 ? `+${text}` : text;
}

/** Wins as a share of won and lost rounds, e.g. "48%"; "–" before any. */
export function formatWinRate(totals: Totals): string {
  const rate = winRate(totals);
  return rate === null ? "–" : `${Math.round(rate * 100)}%`;
}

/** "3 wins", "2 losses" or "–" for the current run. */
export function formatStreak(streak: number): string {
  if (streak === 0) return "–";
  const n = Math.abs(streak);
  return streak > 0
    ? `${n} win${n === 1 ? "" : "s"}`
    : `${n} loss${n === 1 ? "" : "es"}`;
}
