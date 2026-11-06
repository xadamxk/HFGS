import { GameDefinition } from "../types";
import { botSettings, BotSettings } from "../botSettings";
import { STOP_GROUP } from "../../settings/definitions";
import { describeBlackjack } from "./cards";

export interface BlackjackSettings extends BotSettings {
  baseBet: number;
  gamesPerSession: number;
  runUntilStopped: boolean;
  martingale: boolean;
  martingaleMultiplier: number;
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
  settings: [
    {
      type: "checkbox",
      id: "showAssistant",
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
      label: "Use martingale",
      description:
        "Multiply the bet after each loss and go back to your bet after a win. Each set (up to that win) counts as one round, so a losing streak can run past your Rounds and grows the bet fast: use a stop-loss.",
      default: false,
    },
    {
      type: "number",
      id: "martingaleMultiplier",
      group: "Martingale",
      label: "Multiplier",
      description: "How much the bet grows after each loss.",
      default: 2,
      min: 1.5,
      max: 3,
      step: 0.05,
      enabledBy: "martingale",
    },
    {
      type: "number",
      id: "maxBet",
      group: "Martingale",
      label: "Bet cap",
      description: "The bet never grows past this.",
      default: 100,
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
      label: "Rounds",
      description:
        "How many rounds to play each time you start the bot. A round is one hand, or with martingale betting on, one whole set: from your bet up to the win that ends it.",
      default: 10,
      min: 1,
      max: 10000,
      step: 1,
    },
    {
      type: "checkbox",
      id: "runUntilStopped",
      group: STOP_GROUP,
      label: "Run until stopped",
      description:
        "Ignore Rounds and keep playing until you press Stop or the stop-loss or take-profit is hit. With both at 0, only Stop (or HF refusing a bet) ends the run.",
      default: false,
    },
    ...botSettings<BlackjackSettings>().stop,
    ...botSettings<BlackjackSettings>().display,
  ],
};
