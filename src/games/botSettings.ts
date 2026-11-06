/**
 * Settings every βytes game's bot has (blackjack and slots), each game with
 * its own values: the session limits and how the bot plays on the page. The
 * games add these to their own settings; see each definition.ts.
 */
import { SettingDefinition, STOP_GROUP } from "../settings/definitions";

export interface BotSettings {
  stopLoss: number;
  takeProfit: number;
  confirmStart: boolean;
  headless: boolean;
  muteSounds: boolean;
  actionDelayMs: number;
}

/** The game page shows this group on the Start bot row. */
export const DISPLAY_GROUP = "Display and pacing";

export const BOT_SETTING_IDS: (keyof BotSettings)[] = [
  "stopLoss",
  "takeProfit",
  "confirmStart",
  "headless",
  "muteSounds",
  "actionDelayMs",
];

/** Stop-loss and take-profit: they join the game's Stop the bot group. */
export const BOT_STOP_SETTINGS: SettingDefinition<BotSettings>[] = [
  {
    type: "number",
    id: "stopLoss",
    group: STOP_GROUP,
    label: "Stop-loss",
    description:
      "Stop a run once it is down this many βytes, even with Run until stopped on. It's checked after each round, so the last bet can take the run past it. 0 turns it off.",
    default: 0,
    min: 0,
    max: 1000000,
    step: 1,
    unit: "βytes",
  },
  {
    type: "number",
    id: "takeProfit",
    group: STOP_GROUP,
    label: "Take-profit",
    description:
      "Stop a run once it is up this many βytes, even with Run until stopped on. 0 turns it off.",
    default: 0,
    min: 0,
    max: 1000000,
    step: 1,
    unit: "βytes",
  },
];

/** How the bot plays on the page: shown on the game page's Start bot row. */
export const BOT_DISPLAY_SETTINGS: SettingDefinition<BotSettings>[] = [
  {
    type: "checkbox",
    id: "confirmStart",
    group: DISPLAY_GROUP,
    label: "Confirm start",
    description:
      'Ask before the bot starts placing bets ("Play 10 hands at 2 βytes?"). Off, Start bot starts betting straight away.',
    default: true,
  },
  {
    type: "checkbox",
    id: "headless",
    group: DISPLAY_GROUP,
    label: "Headless Mode",
    description:
      "Play in the background without drawing each round on HF's page; only HF's balance is updated. Turn it off to watch the bot play with HF's own animations (slower: each round waits for its animation).",
    default: true,
  },
  {
    type: "checkbox",
    id: "muteSounds",
    group: DISPLAY_GROUP,
    label: "Mute sounds",
    description:
      "Keep this game's sounds off. Clicking HF's own sound button on the game page changes this too, so your choice is remembered next time.",
    default: false,
  },
  {
    type: "number",
    id: "actionDelayMs",
    group: DISPLAY_GROUP,
    label: "Action delay",
    description:
      "Wait this long between requests to HF. HF rejects actions sent about a second apart as too quick, so keep this at 2 seconds or more.",
    default: 2000,
    min: 1000,
    max: 10000,
    step: 100,
    unit: "ms",
  },
];

/** A game's copy of the bot settings, typed for its own settings list. */
export function botSettings<T extends BotSettings>(): {
  stop: SettingDefinition<T>[];
  display: SettingDefinition<T>[];
} {
  return {
    stop: BOT_STOP_SETTINGS as unknown as SettingDefinition<T>[],
    display: BOT_DISPLAY_SETTINGS as unknown as SettingDefinition<T>[],
  };
}
