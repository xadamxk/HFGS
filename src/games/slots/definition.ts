import { GameDefinition } from "../types";

export interface SlotsSettings {
  bet: number;
  gamesPerSession: number;
  runUntilStopped: boolean;
}

/**
 * The bets HF's own bet buttons can produce (slots.js change_bet: 1, 2, 3, 5,
 * 10, 20, 25, 50, 100, then steps of 100 up to maxBet 1000), checked 2026-11-05.
 */
export const SLOTS_BETS = [
  1, 2, 3, 5, 10, 20, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
];

export const slots: GameDefinition<SlotsSettings> = {
  id: "slots",
  name: "Slots",
  description: "Spins HF's slot machine at a fixed bet.",
  path: "/slots.php",
  settings: [
    {
      type: "number",
      id: "bet",
      label: "Bet",
      description:
        "The bet for each spin. HF's machine takes 1, 2, 3, 5, 10, 20, 25, 50, 100, then hundreds up to 1000; other amounts snap to the nearest.",
      default: 1,
      min: 1,
      max: 1000,
      step: 1,
      unit: "βytes",
      allowed: SLOTS_BETS,
    },
    {
      type: "number",
      id: "gamesPerSession",
      label: "Spins per session",
      description: "How many spins to play each time you start the bot.",
      default: 25,
      min: 1,
      max: 10000,
      step: 1,
    },
    {
      type: "checkbox",
      id: "runUntilStopped",
      label: "Run until stopped",
      description:
        "Ignore spins per session and keep spinning until you stop the bot or a stop-loss or take-profit limit is hit.",
      default: false,
    },
  ],
};
