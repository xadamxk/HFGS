/**
 * The extension's settings: global ones that apply to every game, plus each
 * game's own (see src/games). Stored together under one chrome.storage key.
 */

import { getItem, setItem, STORAGE_KEYS } from "./core/storage";
import { GAMES } from "./games/registry";
import { GameDefinition } from "./games/types";
import {
  defaultsOf,
  normalizeValues,
  SettingDefinition,
  SettingValues,
  STOP_GROUP,
} from "./settings/definitions";

export { STOP_GROUP };

export interface GlobalSettings {
  confirmStart: boolean;
  headless: boolean;
  muteSounds: boolean;
  actionDelayMs: number;
  stopLoss: number;
  takeProfit: number;
}

/** The global settings' other group; they apply to every game. */
export const DISPLAY_GROUP = "All games";

export const GLOBAL_SETTINGS: SettingDefinition<GlobalSettings>[] = [
  {
    type: "number",
    id: "stopLoss",
    group: STOP_GROUP,
    label: "Stop-loss",
    description:
      "Stop any run once it is down this many βytes, even with Run until stopped on or partway through a martingale set. It's checked after each hand or spin, so the last bet can take the run past it. Shared by all games; 0 turns it off.",
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
      "Stop any run once it is up this many βytes, even with Run until stopped on or martingale betting on. Shared by all games; 0 turns it off.",
    default: 0,
    min: 0,
    max: 1000000,
    step: 1,
    unit: "βytes",
  },
  {
    type: "checkbox",
    id: "confirmStart",
    group: DISPLAY_GROUP,
    label: "Confirm start",
    description: "Ask before a bot starts placing bets.",
    default: true,
  },
  {
    type: "checkbox",
    id: "headless",
    group: DISPLAY_GROUP,
    label: "Headless Mode",
    description:
      "Play in the background without drawing each hand or spin on HF's page; only HF's balance is updated. Turn it off to watch the bot play with HF's own card and reel animations (slower: each round waits for its animation).",
    default: true,
  },
  {
    type: "checkbox",
    id: "muteSounds",
    group: DISPLAY_GROUP,
    label: "Mute sounds",
    description:
      "Keep HF's blackjack and slots sounds off. Clicking HF's own sound button on a game page changes this too, so your choice is remembered next time.",
    default: false,
  },
  {
    type: "number",
    id: "actionDelayMs",
    group: DISPLAY_GROUP,
    label: "Action delay",
    description:
      "Wait this long between requests to HF (each hit, stand, deal or spin). HF rejects actions sent about a second apart as too quick, so keep this at 2 seconds or more.",
    default: 2000,
    min: 1000,
    max: 10000,
    step: 100,
    unit: "ms",
  },
];

export interface HfgsSettings {
  global: GlobalSettings;
  /** Keyed by game id; every registered game has an entry. */
  games: Record<string, SettingValues>;
}

export function defaultSettings(): HfgsSettings {
  return {
    global: defaultsOf(GLOBAL_SETTINGS),
    games: Object.fromEntries(
      GAMES.map((game) => [game.id, defaultsOf(game.settings)])
    ),
  };
}

/** Valid settings from anything stored, with defaults filling the gaps. */
export function normalizeSettings(stored: unknown): HfgsSettings {
  const source = (
    stored && typeof stored === "object" ? stored : {}
  ) as Partial<Record<"global" | "games", unknown>>;
  const games = (
    source.games && typeof source.games === "object" ? source.games : {}
  ) as Record<string, unknown>;
  return {
    global: normalizeValues(GLOBAL_SETTINGS, source.global),
    games: Object.fromEntries(
      GAMES.map((game) => [
        game.id,
        normalizeValues(game.settings, games[game.id]),
      ])
    ),
  };
}

/** One game's settings, typed by the caller (e.g. `gameSettings<BlackjackSettings>`). */
export function gameSettings<T = SettingValues>(
  settings: HfgsSettings,
  game: GameDefinition | string
): T {
  const id = typeof game === "string" ? game : game.id;
  return settings.games[id] as T;
}

export async function loadSettings(): Promise<HfgsSettings> {
  return normalizeSettings(await getItem(STORAGE_KEYS.settings));
}

export async function saveSettings(settings: HfgsSettings): Promise<void> {
  await setItem(STORAGE_KEYS.settings, normalizeSettings(settings));
}

/**
 * Call `listener` with the new settings whenever they're saved (the options
 * page saves on every change), so open game pages pick them up without a reload.
 */
export function watchSettings(
  listener: (settings: HfgsSettings) => void
): () => void {
  const onChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ) => {
    const change = changes[STORAGE_KEYS.settings];
    if (area === "local" && change)
      listener(normalizeSettings(change.newValue));
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
}
