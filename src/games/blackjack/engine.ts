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
import { offeredActions } from "./analysis";
import { MartingaleTag } from "./martingale";
import { MartingaleView } from "./martingaleView";
import { BlackjackAssistant } from "./assistant";

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

/** Keeps martingale set ids unique even within one millisecond. */
let setCounter = 0;

const ACTION_URL = "/blackjack/blackjack_action.php?action=";
/** A hand never needs this many actions; more means something is off. */
const MAX_ACTIONS_PER_HAND = 12;

function isEnded(state: BjGameState): boolean {
  return state.turn === "ended" || String(state.ended) === "1";
}

/** The highest bet martingale may place: the bet cap, within HF's table limit. */
export function betCap(settings: BlackjackSettings): number {
  return Math.min(settings.maxBet, BLACKJACK_MAX_BET);
}

/**
 * The bet a martingale set needs after a loss: enough to win back the set's
 * losses (`setLoss`) plus the base bet, and at least double the previous bet.
 * After plain losses the two are the same; a lost double or split costs twice
 * its bet, so it takes the bet past double. (A surrender loses half, so
 * doubling already covers it.)
 */
export function neededBet(
  settings: BlackjackSettings,
  previousBet: number,
  setLoss: number
): number {
  return Math.max(
    BLACKJACK_MIN_BET,
    settings.baseBet,
    previousBet * 2,
    Math.ceil(Math.max(0, setLoss) + settings.baseBet)
  );
}

/**
 * How many plain losses in a row, starting with a hand at `bet`, end the set
 * at the cap, from what the set is down before that hand. 1 means losing this
 * hand resets the set.
 */
export function lossesToReset(
  settings: BlackjackSettings,
  bet: number,
  setLoss: number
): number {
  let losses = 0;
  let loss = Math.max(0, setLoss);
  for (let next = bet; losses < 50;) {
    loss += next;
    losses++;
    const needed = neededBet(settings, next, loss);
    if (needed > betCap(settings)) break;
    next = needed;
  }
  return losses;
}

/**
 * Within this many losses of a reset, the bot plays a hand out instead of
 * surrendering it: a win there saves the set. It costs a little on average
 * (surrender is only the table's play when it loses less) but means fewer
 * sets reset.
 */
export const NO_SURRENDER_WITHIN = 3;

/**
 * The next bet: the base bet, or the martingale progression after a loss (see
 * neededBet). `setLoss` is what the set in progress is down so far. A set
 * never bets less than it needs: when that's more than the bet cap, the set
 * ends and the next hand starts over at the base bet.
 */
export function nextBet(
  settings: BlackjackSettings,
  previousBet: number | null,
  previousNet: number | null,
  setLoss = 0
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
  const needed = neededBet(settings, previousBet, setLoss);
  return needed > betCap(settings) ? base : needed;
}

/**
 * HF's outcome for one hand, as the history shows it. HF calls a bust "FOLD",
 * which reads like a choice to give up, so it's recorded as "BUST".
 */
export function outcomeLabel(outcome: string | null | undefined): string {
  if (!outcome) return "UNKNOWN";
  return outcome === "FOLD" ? "BUST" : outcome;
}

/** What a finished hand cost and paid, from HF's final state. */
export function settle(state: BjGameState, balance?: number): RoundResult {
  const bet = parseFloat(state.bet) || 0;
  const split = Number(state.is_split) === 1;
  const doubled = !split && state.hand1.action === "DOUBLE";
  const wagered = bet * (split || doubled ? 2 : 1);
  const returned = parseFloat(state.payout ?? "0") || 0;
  const outcome1 = outcomeLabel(state.outcome1);
  const outcome = split
    ? `${outcome1} / ${outcomeLabel(state.outcome2)}`
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
  // The martingale set in progress this session: a new one starts on the
  // first hand and after each win (see martingale.ts).
  let setId: string | null = null;
  let step = 0;
  // The set's net so far, so the next bet can win back what it's down
  let setNet = 0;
  // One engine per bot run, so this marks which run each set belongs to.
  let runId: string | null = null;

  const post = (action: string, form: Record<string, string | number>) =>
    context.client.post<BjResponse>(ACTION_URL + action, form);

  return {
    async playRound() {
      const settings = context.gameSettings() as unknown as BlackjackSettings;
      let state: BjGameState;
      let balance: number | undefined;
      let dealt = false;
      // Martingale close to a reset: play the hand out instead of surrendering
      let noSurrender = false;
      const show = context.display?.() ?? null;

      // An unfinished game from before the page loaded: finish it first.
      const open = context.page.openGameState as BjGameState | null;
      if (open && !isEnded(open)) {
        context.page.openGameState = null;
        state = open;
        context.status?.("Finishing the hand that was already in progress…");
      } else {
        const setLoss = setId === null ? 0 : -setNet;
        const bet = nextBet(settings, previousBet, previousNet, setLoss);
        if (settings.martingale) {
          // A new set (first hand, after a win or a reset) starts from 0
          const newSet =
            setId === null || previousNet === null || previousNet > 0;
          noSurrender =
            lossesToReset(settings, bet, newSet ? 0 : setLoss) <=
            NO_SURRENDER_WITHIN;
        }
        const response = await post("deal", { bet });
        state = response.data;
        balance = response.balance;
        dealt = true;
        await show?.("deal", response, bet);
        context.observe?.("deal", response);
      }

      let actions = 0;
      while (!isEnded(state)) {
        if (++actions > MAX_ACTIONS_PER_HAND) {
          throw new Error("A hand took too many actions; stopped to be safe");
        }
        const action = decide(state, noSurrender);
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
        context.observe?.(action, response);
      }

      const result = settle(state, balance);
      const net = result.returned - result.wagered;
      const bet = parseFloat(state.bet) || 0;
      noteDealerPeek(result, dealt && actions === 0, actions > 0);
      // A lost hand after which the set would need more than the cap: the set
      // ends here, and the next hand starts a new one at the base bet
      let reset = false;
      if (settings.martingale && dealt) {
        if (setId === null || previousNet === null || previousNet > 0) {
          setId = `${Date.now()}-${++setCounter}`;
          step = 1;
          setNet = 0;
        } else {
          step++;
        }
        setNet = Math.round((setNet + net) * 100) / 100;
        reset = net < 0 && neededBet(settings, bet, -setNet) > betCap(settings);
        runId ??= `${Date.now()}-${++setCounter}`;
        const tag: MartingaleTag = {
          run: runId,
          set: setId,
          step,
          bet,
          cap: betCap(settings),
          ...(reset ? { reset: true } : {}),
        };
        result.details = { ...result.details, martingale: tag };
      } else {
        setId = null;
        setNet = 0;
      }
      previousBet = bet || null;
      // After a reset the next hand starts a new set at the base bet
      previousNet = reset ? null : net;
      // With martingale a round is a whole set: a loss or push keeps it going,
      // so it doesn't count toward the session's rounds. A reset ends it.
      const continues = Boolean(
        settings.martingale && dealt && net <= 0 && !reset
      );
      return { ...result, continues };
    },
  };
}

/** Basic strategy for the hand in play, with what HF offers at this point. */
function decide(state: BjGameState, noSurrender = false): Action {
  const turn = state.turn === "hand2" ? "hand2" : "hand1";
  const hand = state[turn];
  if (!hand) throw new Error(`HF's game state has no ${turn}`);
  // Only what HF's page offers now (double, split, surrender: hand 1's first
  // decision), less surrender when the set is close to resetting
  const offered = offeredActions(state);
  const advice = getAdvice(hand.hand_cards, state.dealer.hand_cards, {
    ...offered,
    surrender: offered.surrender && !noSurrender,
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
    const unit = s.martingale ? "set" : "hand";
    const count = s.runUntilStopped
      ? "until stopped"
      : `${s.gamesPerSession} ${unit}${s.gamesPerSession === 1 ? "" : "s"}`;
    const martingale = s.martingale
      ? `, martingale up to ${s.maxBet}. Each set keeps going until a win, or resets if it would need more than ${s.maxBet}`
      : "";
    return `Play ${count} at ${s.baseBet} βytes${martingale}?`;
  },
  roundUnit: (values) =>
    values.martingale === true ? ["set", "sets"] : ["hand", "hands"],
  describeRounds: (rounds, played, values) => {
    const hands = `${played} hand${played === 1 ? "" : "s"}`;
    if (values.martingale !== true && rounds === played)
      return `Finished ${hands}.`;
    return `Finished ${rounds} set${rounds === 1 ? "" : "s"} (${hands}).`;
  },
  createHistoryView: () => new MartingaleView(),
  createAssistant: (page) =>
    new BlackjackAssistant(page.openGameState as BjGameState | null),
  fromPage: (_action, response) => {
    const res = response as BjResponse | null;
    if (!res?.success || !res.data?.hand1 || !isEnded(res.data)) return null;
    return settle(res.data, Number(res.balance));
  },
};
