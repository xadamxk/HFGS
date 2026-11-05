/**
 * Basic strategy for HF's blackjack table, from the baked EV table that
 * scripts/generate-strategy-table.js writes (rules verified in
 * docs/phase0-findings.md). No network calls.
 *
 * Cards use HF's format: rank 1-13 then a suit letter ("1s" = ace,
 * "12h" = queen), and "XX" for the dealer's face-down card.
 */
import TABLE from "./strategyTable.json";

export type Action = "stand" | "hit" | "double" | "split" | "surrender";

interface EvRow {
  stand: number;
  hit: number;
  double: number;
  surrender: number;
}
export type UpcardKey =
  "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "A";

interface StrategyTable {
  rules: Record<string, unknown>;
  overrides: Record<string, { best: Action; reason: string }>;
  hard: Record<string, Record<UpcardKey, EvRow>>;
  soft: Record<string, Record<UpcardKey, EvRow>>;
  split: Record<string, Record<UpcardKey, number>>;
  dealer: Record<UpcardKey, DealerOdds>;
}

/** How the dealer's hand ends for an upcard: chance of each final total or a bust. */
export interface DealerOdds {
  "17": number;
  "18": number;
  "19": number;
  "20": number;
  "21": number;
  bust: number;
}

const table = TABLE as unknown as StrategyTable;

/** Preference when two actions have the same EV. */
const ACTION_ORDER: Action[] = ["stand", "hit", "double", "split", "surrender"];

export interface Allowed {
  double: boolean;
  split: boolean;
  surrender: boolean;
}

export interface Advice {
  best: Action;
  total: number;
  soft: boolean;
  /** Expected value of each allowed action, per unit of the original bet. */
  ev: Partial<Record<Action, number>>;
  /** Set when a multi-deck correction overrode the table's best EV. */
  override?: string;
}

/** HF rank (1-13) to blackjack value, ace as 1. */
export function cardValue(card: string): number {
  const rank = parseInt(card, 10);
  return rank >= 10 ? 10 : rank;
}

export function visibleCards(cards: string[]): string[] {
  return cards.filter((card) => card && card !== "XX");
}

export function handTotal(cards: string[]): { total: number; soft: boolean } {
  let hard = 0;
  let hasAce = false;
  for (const card of visibleCards(cards)) {
    const value = cardValue(card);
    hard += value;
    if (value === 1) hasAce = true;
  }
  const soft = hasAce && hard + 10 <= 21;
  return { total: soft ? hard + 10 : hard, soft };
}

export function upcardKey(card: string): UpcardKey {
  const value = cardValue(card);
  return (value === 1 ? "A" : String(value)) as UpcardKey;
}

/**
 * The best play for a hand. `allowed` says which optional actions HF offers
 * right now (on HF: double, split and surrender only on the first decision of
 * hand 1, and split only on a pair by value). Returns null for a bust or an
 * incomplete hand.
 */
export function getAdvice(
  playerCards: string[],
  dealerCards: string[],
  allowed: Allowed
): Advice | null {
  const cards = visibleCards(playerCards);
  const up = visibleCards(dealerCards)[0];
  if (cards.length < 2 || !up) return null;

  const hand = handTotal(cards);
  if (hand.total > 21) return null;
  const upKey = upcardKey(up);
  const firstTwo = cards.length === 2;
  const pair = firstTwo && cardValue(cards[0]) === cardValue(cards[1]);

  const row = hand.soft
    ? table.soft[hand.total]
    : table.hard[Math.max(4, hand.total)];
  const entry = row[upKey];
  const ev: Partial<Record<Action, number>> = { stand: entry.stand };
  if (hand.total < 21) ev.hit = entry.hit;
  if (allowed.double && firstTwo) ev.double = entry.double;
  if (allowed.split && pair) {
    const rank = cardValue(cards[0]);
    ev.split = table.split[rank === 1 ? "A" : String(rank)][upKey];
  }
  if (allowed.surrender && firstTwo) ev.surrender = entry.surrender;

  let best: Action = "stand";
  for (const action of ACTION_ORDER) {
    const value = ev[action];
    if (value !== undefined && value > (ev[best] ?? -Infinity)) best = action;
  }
  // 4-deck corrections to the infinite-deck model, for the initial deal only
  const override =
    firstTwo &&
    table.overrides[`${hand.soft ? "soft" : "hard"}:${hand.total}:${upKey}`];
  if (override && ev[override.best] !== undefined && override.best !== best) {
    best = override.best;
    return {
      best,
      total: hand.total,
      soft: hand.soft,
      ev,
      override: override.reason,
    };
  }

  return { best, total: hand.total, soft: hand.soft, ev };
}

export const UPCARDS: UpcardKey[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "A",
];

/** How the dealer's hand ends with this upcard showing (HF card code). */
export function dealerOdds(upcard: string): DealerOdds {
  return table.dealer[upcardKey(upcard)];
}

/** The chance one more card busts this hand (infinite deck, 4/13 ten-value). */
export function bustChanceIfHit(cards: string[]): number {
  const visible = visibleCards(cards);
  const { total, soft } = handTotal(visible);
  if (soft) return 0;
  let chance = 0;
  for (let value = 1; value <= 10; value++) {
    if (total + value > 21) chance += value === 10 ? 4 / 13 : 1 / 13;
  }
  return chance;
}

export type ChartKind = "hard" | "soft" | "pair";

export interface ChartRow {
  kind: ChartKind;
  /** Row id within its kind: the total ("8", "17"), or the pair rank ("A", "8"). */
  key: string;
  label: string;
  /** A two-card hand for this row, to look up its first-decision play. */
  cards: string[];
}

const card = (value: number, suit = "s") => `${value}${suit}`;

/** The strategy chart's rows, as printed basic-strategy charts show them. */
export const CHART_ROWS: ChartRow[] = [
  { kind: "hard", key: "8", label: "5–8", cards: [card(2), card(6, "h")] },
  ...[9, 10, 11, 12, 13, 14, 15, 16].map((total) => ({
    kind: "hard" as const,
    key: String(total),
    label: String(total),
    cards:
      total <= 11
        ? [card(2), card(total - 2, "h")]
        : [card(10), card(total - 10, "h")],
  })),
  { kind: "hard", key: "17", label: "17+", cards: [card(10), card(7, "h")] },
  ...[13, 14, 15, 16, 17, 18, 19, 20].map((total) => ({
    kind: "soft" as const,
    key: String(total),
    label: `A,${total - 11}`,
    cards: [card(1), card(total - 11, "h")],
  })),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rank) => {
    const name = rank === 1 ? "A" : String(rank);
    return {
      kind: "pair" as const,
      key: name,
      label: `${name},${name}`,
      cards: [card(rank), card(rank, "h")],
    };
  }),
];

const ALL: Allowed = { double: true, split: true, surrender: true };
const NONE: Allowed = { double: false, split: false, surrender: false };

export interface ChartCell {
  /** The first-decision play, with every option on offer. */
  best: Action;
  /** What to do instead when that option isn't offered (double, split, surrender). */
  otherwise: Action | null;
}

/** One cell of the chart: the first-decision play for a row against an upcard. */
export function chartCell(row: ChartRow, upcard: UpcardKey): ChartCell {
  const dealer = [upcard === "A" ? "1c" : `${upcard}c`];
  const best = getAdvice(row.cards, dealer, ALL)!.best;
  const otherwise =
    best === "double" || best === "split" || best === "surrender"
      ? getAdvice(row.cards, dealer, NONE)!.best
      : null;
  return { best, otherwise };
}

/** The chart row a hand is read from: pairs on the first two cards, else its total. */
export function chartRowFor(
  cards: string[],
  splitOffered = true
): ChartRow | null {
  const visible = visibleCards(cards);
  if (visible.length < 2) return null;
  const { total, soft } = handTotal(visible);
  if (total > 21) return null;
  if (
    splitOffered &&
    visible.length === 2 &&
    cardValue(visible[0]) === cardValue(visible[1])
  ) {
    const rank = cardValue(visible[0]);
    return (
      CHART_ROWS.find(
        (r) => r.kind === "pair" && r.key === (rank === 1 ? "A" : String(rank))
      ) ?? null
    );
  }
  if (soft) {
    return (
      CHART_ROWS.find(
        (r) => r.kind === "soft" && r.key === String(Math.min(total, 20))
      ) ?? null
    );
  }
  const key = String(Math.min(Math.max(total, 8), 17));
  return CHART_ROWS.find((r) => r.kind === "hard" && r.key === key) ?? null;
}

export const STRATEGY_RULES = table.rules;
