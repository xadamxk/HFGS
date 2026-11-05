/**
 * The blackjack bot: plays one hand per round against HF's
 * /blackjack/blackjack_action.php, choosing each action by basic strategy.
 * Response shapes and rules come from captured fixtures (docs/phase0-findings.md).
 */

import { RoundResult } from "../../core/history";
import { Logger } from "../../core/Logger";
import { GameEngine } from "../../core/Runner";
import { EngineContext, GameBot } from "../engine";
import {
  BLACKJACK_MAX_BET,
  BLACKJACK_MIN_BET,
  BlackjackSettings,
} from "./definition";
import { formatCard, formatCards } from "./cards";
import { Action, getAdvice, handTotal, visibleCards } from "./strategy";

export { formatCard, formatCards };

export interface BjHand {
  action: string;
  new_card?: string | null;
  hand_value?: string;
  hand_cards: string[];
}

/** HF's game state. Every number arrives as a string. */
export interface BjGameState {
  game_id: string;
  action_id: string;
  bet: string;
  is_split: string | number;
  turn: "hand1" | "hand2" | "ended";
  outcome1: string | null;
  outcome2: string | null;
  ended: string | number;
  payout: string | null;
  hand1: BjHand;
  hand2?: BjHand;
  dealer: BjHand;
}

export interface BjResponse {
  success: boolean;
  data: BjGameState;
  balance: number;
}

const ACTION_URL = "/blackjack/blackjack_action.php?action=";
/** A hand never needs this many actions; more means something is off. */
const MAX_ACTIONS_PER_HAND = 12;

function isEnded(state: BjGameState): boolean {
  return state.turn === "ended" || String(state.ended) === "1";
}

/** The next bet: the base bet, or the martingale progression after a loss. */
export function nextBet(
  settings: BlackjackSettings,
  previousBet: number | null,
  previousNet: number | null
): number {
  const base = settings.baseBet;
  if (
    !settings.martingale ||
    previousBet === null ||
    previousNet === null ||
    previousNet > 0
  ) {
    return base;
  }
  if (previousNet === 0) return Math.max(base, previousBet);
  const raised = Math.round(previousBet * settings.martingaleMultiplier);
  const cap = Math.min(settings.maxBet, BLACKJACK_MAX_BET);
  return Math.max(BLACKJACK_MIN_BET, base, Math.min(cap, raised));
}

/** What a finished hand cost and paid, from HF's final state. */
export function settle(state: BjGameState, balance?: number): RoundResult {
  const bet = parseFloat(state.bet) || 0;
  const split = Number(state.is_split) === 1;
  const doubled = !split && state.hand1.action === "DOUBLE";
  const wagered = bet * (split || doubled ? 2 : 1);
  const returned = parseFloat(state.payout ?? "0") || 0;
  const outcome1 = state.outcome1 || "UNKNOWN";
  const outcome = split
    ? `${outcome1} / ${state.outcome2 || "UNKNOWN"}`
    : doubled
      ? `${outcome1} (double)`
      : outcome1;
  const dealer = visibleCards(state.dealer.hand_cards);
  return {
    outcome,
    wagered,
    returned,
    balance,
    details: {
      player: state.hand1.hand_cards,
      ...(split && state.hand2 ? { player2: state.hand2.hand_cards } : {}),
      dealer,
      split,
      doubled,
      dealerBlackjack: dealer.length === 2 && handTotal(dealer).total === 21,
    },
  };
}

export function createBlackjackEngine(context: EngineContext): GameEngine {
  let previousBet: number | null = null;
  let previousNet: number | null = null;

  const post = (action: string, form: Record<string, string | number>) =>
    context.client.post<BjResponse>(ACTION_URL + action, form);

  return {
    async playRound() {
      const settings = context.gameSettings() as unknown as BlackjackSettings;
      let state: BjGameState;
      let balance: number | undefined;
      let dealt = false;
      const show = context.display?.() ?? null;

      // An unfinished game from before the page loaded: finish it first.
      const open = context.page.openGameState as BjGameState | null;
      if (open && !isEnded(open)) {
        context.page.openGameState = null;
        state = open;
        context.status?.("Finishing the hand that was already in progress…");
      } else {
        const bet = nextBet(settings, previousBet, previousNet);
        const response = await post("deal", { bet });
        state = response.data;
        balance = response.balance;
        dealt = true;
        await show?.("deal", response, bet);
      }

      let actions = 0;
      while (!isEnded(state)) {
        if (++actions > MAX_ACTIONS_PER_HAND) {
          throw new Error("A hand took too many actions; stopped to be safe");
        }
        const action = decide(state);
        context.status?.(
          `${state.turn === "hand2" ? "Hand 2" : "Hand"}: ${formatCards(
            state[state.turn as "hand1" | "hand2"]?.hand_cards ?? []
          )} vs ${formatCard(state.dealer.hand_cards[0])} → ${action}`
        );
        const response = await post(action, {
          gameId: state.game_id,
          actionId: state.action_id,
        });
        state = response.data;
        balance = response.balance;
        await show?.(action, response, null);
      }

      const result = settle(state, balance);
      noteDealerPeek(result, dealt && actions === 0, actions > 0);
      previousBet = parseFloat(state.bet) || null;
      previousNet = result.returned - result.wagered;
      return result;
    },
  };
}

/** Basic strategy for the hand in play, with what HF offers at this point. */
function decide(state: BjGameState): Action {
  const turn = state.turn === "hand2" ? "hand2" : "hand1";
  const hand = state[turn];
  if (!hand) throw new Error(`HF's game state has no ${turn}`);
  // HF offers double, split and surrender only on hand 1's first decision.
  const first = turn === "hand1" && state.hand1.action === "START";
  const advice = getAdvice(hand.hand_cards, state.dealer.hand_cards, {
    double: first,
    split: first,
    surrender: first,
  });
  return advice?.best ?? "stand";
}

/**
 * Phase 0 couldn't tell whether HF checks for dealer blackjack before the
 * player acts. A dealer blackjack that ends the hand on the deal says yes; one
 * revealed after the player acted says no. Logged so it can be confirmed.
 */
function noteDealerPeek(
  result: RoundResult,
  endedOnDeal: boolean,
  playerActed: boolean
) {
  if (!result.details?.dealerBlackjack) return;
  if (endedOnDeal)
    Logger.log("Dealer blackjack ended the hand on the deal: HF peeks.");
  else if (playerActed)
    Logger.warn(
      "Dealer blackjack after the player acted: HF does NOT peek. The strategy table assumes it does."
    );
}

export const blackjackBot: GameBot = {
  createEngine: createBlackjackEngine,
  summarize: (values) => {
    const s = values as unknown as BlackjackSettings;
    const count = s.runUntilStopped
      ? "until stopped"
      : `${s.gamesPerSession} hand${s.gamesPerSession === 1 ? "" : "s"}`;
    const martingale = s.martingale
      ? `, martingale ×${s.martingaleMultiplier} up to ${s.maxBet}`
      : "";
    return `Play ${count} at ${s.baseBet} βytes${martingale}?`;
  },
  fromPage: (_action, response) => {
    const res = response as BjResponse | null;
    if (!res?.success || !res.data?.hand1 || !isEnded(res.data)) return null;
    return settle(res.data, Number(res.balance));
  },
};
