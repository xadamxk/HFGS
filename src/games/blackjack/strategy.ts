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
type UpcardKey = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "A";

interface StrategyTable {
  rules: Record<string, unknown>;
  overrides: Record<string, { best: Action; reason: string }>;
  hard: Record<string, Record<UpcardKey, EvRow>>;
  soft: Record<string, Record<UpcardKey, EvRow>>;
  split: Record<string, Record<UpcardKey, number>>;
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

function upcardKey(card: string): UpcardKey {
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
  if (override && ev[override.best] !== undefined) best = override.best;

  return { best, total: hand.total, soft: hand.soft, ev };
}

export const STRATEGY_RULES = table.rules;
