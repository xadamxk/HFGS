import { GameDefinition } from "../types";
import { describeBlackjack } from "./cards";

export interface BlackjackSettings {
  baseBet: number;
  gamesPerSession: number;
  runUntilStopped: boolean;
  martingale: boolean;
  martingaleMultiplier: number;
  maxBet: number;
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
      type: "number",
      id: "gamesPerSession",
      label: "Hands per session",
      description: "How many hands to play each time you start the bot.",
      default: 10,
      min: 1,
      max: 10000,
      step: 1,
    },
    {
      type: "checkbox",
      id: "runUntilStopped",
      label: "Run until stopped",
      description:
        "Ignore hands per session and keep playing until you stop the bot or a stop-loss or take-profit limit is hit.",
      default: false,
    },
    {
      type: "checkbox",
      id: "martingale",
      label: "Martingale betting",
      description:
        "Multiply the bet after each loss and go back to your bet after a win. A losing streak grows the bet fast: use a stop-loss.",
      default: false,
    },
    {
      type: "number",
      id: "martingaleMultiplier",
      label: "Martingale multiplier",
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
      label: "Martingale bet cap",
      description: "The bet never grows past this.",
      default: 100,
      min: BLACKJACK_MIN_BET,
      max: BLACKJACK_MAX_BET,
      step: 1,
      unit: "βytes",
      enabledBy: "martingale",
    },
  ],
};
