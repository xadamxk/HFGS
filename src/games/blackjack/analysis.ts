/**
 * What the strategy assistant shows for a moment in a blackjack hand: the
 * lookup table's inputs (the hand, the dealer's upcard, what HF offers) and
 * outputs (the best play and every option's expected value), plus odds.
 * Pure, so the bot, HF's page and tests all read hands the same way.
 */

import type { BjGameState } from "./engine";
import {
  Action,
  Advice,
  bustChanceIfHit,
  cardValue,
  chartRowFor,
  ChartRow,
  DealerOdds,
  dealerOdds,
  getAdvice,
  handTotal,
  upcardKey,
  UpcardKey,
  visibleCards,
} from "./strategy";

export const ACTION_LABELS: Record<Action, string> = {
  hit: "Hit",
  stand: "Stand",
  double: "Double",
  split: "Split",
  surrender: "Surrender",
};

export interface Offered {
  hit: boolean;
  stand: boolean;
  double: boolean;
  split: boolean;
  surrender: boolean;
}

export interface Decision {
  /** "Hand", or "Hand 1 of 2" / "Hand 2 of 2" after a split. */
  handLabel: string;
  player: string[];
  upcard: string;
  total: number;
  soft: boolean;
  pair: boolean;
  /** How the table reads the hand, e.g. "Soft 16" or "Pair of 8s". */
  handKind: string;
  /** The table cell's address, e.g. "soft 16 × dealer 9". */
  lookup: string;
  row: ChartRow | null;
  column: UpcardKey;
  offered: Offered;
  advice: Advice;
  /** Options on offer, best expected value first. */
  ranked: { action: Action; ev: number }[];
  /** How much better the best play is than the next best, per βyte bet. */
  margin: number | null;
  bet: number;
  dealer: DealerOdds;
  bustIfHit: number;
}

export type Analysis =
  | { phase: "waiting" }
  | { phase: "playing"; decision: Decision }
  | {
      phase: "ended";
      player: string[][];
      dealer: string[];
      outcomes: string[];
      payout: number;
      wagered: number;
    };

function isEnded(state: BjGameState): boolean {
  return state.turn === "ended" || String(state.ended) === "1";
}

function describeHand(cards: string[]): {
  kind: string;
  total: number;
  soft: boolean;
  pair: boolean;
} {
  const visible = visibleCards(cards);
  const { total, soft } = handTotal(visible);
  const pair =
    visible.length === 2 && cardValue(visible[0]) === cardValue(visible[1]);
  if (pair) {
    const value = cardValue(visible[0]);
    const name = value === 1 ? "Aces" : value === 10 ? "10s" : `${value}s`;
    return {
      kind: `Pair of ${name} (${soft ? "soft" : "hard"} ${total})`,
      total,
      soft,
      pair,
    };
  }
  return { kind: `${soft ? "Soft" : "Hard"} ${total}`, total, soft, pair };
}

/** What HF's own page offers right now (its showAvailableButtons). */
export function offeredActions(state: BjGameState): Offered {
  const turn = state.turn === "hand2" ? "hand2" : "hand1";
  const hand = state[turn];
  const { total } = handTotal(hand?.hand_cards ?? []);
  const first = turn === "hand1" && state.hand1.action === "START";
  const cards = visibleCards(state.hand1.hand_cards);
  return {
    hit: total < 21,
    stand: total < 21,
    double: first,
    surrender: first,
    split:
      first &&
      cards.length === 2 &&
      cardValue(cards[0]) === cardValue(cards[1]),
  };
}

/** The table cells a decision reads, e.g. "soft 16 × dealer 9". */
function lookupLabel(
  hand: { total: number; soft: boolean; pair: boolean },
  splitOffered: boolean,
  cards: string[],
  column: UpcardKey
): string {
  const totals = `${hand.soft ? "soft" : "hard"} ${hand.total}`;
  if (!hand.pair || !splitOffered) return `${totals} × dealer ${column}`;
  const value = cardValue(visibleCards(cards)[0]);
  return `${totals} and pair ${value === 1 ? "A" : value} × dealer ${column}`;
}

export function analyze(state: BjGameState | null | undefined): Analysis {
  if (!state?.hand1 || !state.dealer) return { phase: "waiting" };

  const split = Number(state.is_split) === 1;
  if (isEnded(state)) {
    const bet = parseFloat(state.bet) || 0;
    const doubled = !split && state.hand1.action === "DOUBLE";
    return {
      phase: "ended",
      player:
        split && state.hand2
          ? [state.hand1.hand_cards, state.hand2.hand_cards]
          : [state.hand1.hand_cards],
      dealer: visibleCards(state.dealer.hand_cards),
      outcomes: [state.outcome1, split ? state.outcome2 : null].filter(
        (o): o is string => Boolean(o)
      ),
      payout: parseFloat(state.payout ?? "0") || 0,
      wagered: bet * (split || doubled ? 2 : 1),
    };
  }

  const turn = state.turn === "hand2" ? "hand2" : "hand1";
  const player = state[turn]?.hand_cards ?? [];
  const upcard = visibleCards(state.dealer.hand_cards)[0];
  const offered = offeredActions(state);
  const advice = upcard
    ? getAdvice(player, state.dealer.hand_cards, offered)
    : null;
  if (!upcard || !advice) return { phase: "waiting" };

  const hand = describeHand(player);
  const column = upcardKey(upcard);
  const ranked = (Object.entries(advice.ev) as [Action, number][])
    .map(([action, ev]) => ({ action, ev }))
    .sort((a, b) =>
      a.action === advice.best ? -1 : b.action === advice.best ? 1 : b.ev - a.ev
    );
  const bestEv = advice.ev[advice.best] ?? 0;
  const runnerUp = ranked.find((r) => r.action !== advice.best);
  const row = chartRowFor(player, offered.split);
  return {
    phase: "playing",
    decision: {
      handLabel: split ? `Hand ${turn === "hand2" ? 2 : 1} of 2` : "Hand",
      player: visibleCards(player),
      upcard,
      total: hand.total,
      soft: hand.soft,
      pair: hand.pair,
      handKind: hand.kind,
      lookup: lookupLabel(hand, offered.split, player, column),
      row,
      column,
      offered,
      advice,
      ranked,
      margin: runnerUp ? Math.round((bestEv - runnerUp.ev) * 1e5) / 1e5 : null,
      bet: parseFloat(state.bet) || 0,
      dealer: dealerOdds(upcard),
      bustIfHit: bustChanceIfHit(player),
    },
  };
}
