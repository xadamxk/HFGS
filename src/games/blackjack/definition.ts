import { GameDefinition } from "../types";
import { BET_GROUP, botSettings, BotSettings } from "../botSettings";
import { STOP_GROUP } from "../../settings/definitions";
import { describeBlackjack } from "./cards";

export interface BlackjackSettings extends BotSettings {
  baseBet: number;
  gamesPerSession: number;
  runUntilStopped: boolean;
  martingale: boolean;
  maxBet: number;
  showAssistant: boolean;
}

/** HF's table limits (#balanceCounterMin / #balanceCounterMax), checked 2026-11-05. */
export const BLACKJACK_MIN_BET = 2;
export const BLACKJACK_MAX_BET = 1000;

export const blackjack: GameDefinition<BlackjackSettings> = {
  id: "blackjack",
  name: "Blackjack",
  description:
    "Plays each hand by basic strategy for HF's table rules (dealer hits soft 17, double any two cards, one split, late surrender).",
  path: "/blackjack.php",
  describeResult: describeBlackjack,
  // Between HF's "βytes Blackjack" header and "Risk your βytes…" row
  settingsInGameTable: true,
  settings: [
    {
      type: "checkbox",
      id: "showAssistant",
      pageGroup: "Assistant",
      label: "Strategy assistant",
      description:
        "Show what the strategy table is given and what it answers for every decision, with the odds, whether the bot or you is playing.",
      default: true,
    },
    {
      type: "number",
      id: "baseBet",
      label: "Bet",
      description: `The bet for each hand (HF's table allows ${BLACKJACK_MIN_BET} to ${BLACKJACK_MAX_BET}).`,
      default: BLACKJACK_MIN_BET,
      min: BLACKJACK_MIN_BET,
      max: BLACKJACK_MAX_BET,
      step: 1,
      unit: "βytes",
    },
    {
      type: "checkbox",
      id: "martingale",
      group: "Martingale",
      pageGroup: BET_GROUP,
      label: "Use martingale",
      description:
        "Double the bet after each loss. A win ends the set and goes back to your bet; so does a loss when doubling would go past the bet cap.",
      detail:
        'A win after plain losses wins back the set plus your bet. After a lost double or split the set can end slightly down ("won short"), since those cost twice the bet. On the last 2 hands before a reset, the bot plays a hand out instead of surrendering it, so a win can still save the set. Each set counts as one round, so a losing streak can run past your Rounds.',
      warning:
        "A set can lose about twice the bet cap before it resets, more if it lost doubles or splits: set the cap to what you're willing to lose.",
      default: false,
    },
    {
      type: "number",
      id: "maxBet",
      group: "Martingale",
      pageGroup: BET_GROUP,
      label: "Bet cap",
      description:
        "The most a set bets on one hand. When doubling would go past it, the set resets to your bet.",
      detail:
        "After plain losses a set loses less than twice the cap before it resets. A doubled or split hand stakes twice its bet, so a lost one near the cap can cost up to twice the cap on its own.",
      default: 650,
      min: BLACKJACK_MIN_BET,
      max: BLACKJACK_MAX_BET,
      step: 1,
      unit: "βytes",
      enabledBy: "martingale",
    },
    {
      type: "number",
      id: "gamesPerSession",
      group: STOP_GROUP,
      disabledBy: "runUntilStopped",
      width: "half",
      label: "Rounds",
      description: "How many rounds to play each time you start the bot.",
      detail:
        "A round is one hand, or with martingale betting on, one whole set: from your bet up to the win that ends it.",
      default: 3,
      min: 1,
      max: 10000,
      step: 1,
    },
    {
      type: "checkbox",
      id: "runUntilStopped",
      group: STOP_GROUP,
      width: "half",
      label: "Run until stopped",
      description:
        "Ignore Rounds and keep playing until you press Stop or the stop-loss or take-profit is hit.",
      detail: "With both at 0, only Stop (or HF refusing a bet) ends the run.",
      default: false,
    },
    ...botSettings<BlackjackSettings>().stop,
    ...botSettings<BlackjackSettings>().display,
  ],
};
