import { GameDefinition } from "../types";

export interface SlotsSettings {
  bet: number;
  gamesPerSession: number;
  runUntilStopped: boolean;
}

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
      // HF's machine starts at 1 (#bet); its maximum isn't shown on the page.
      description: "The bet for each spin.",
      default: 1,
      min: 1,
      max: 1000,
      step: 1,
      unit: "βytes",
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
