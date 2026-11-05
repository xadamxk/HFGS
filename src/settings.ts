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
} from "./settings/definitions";

export interface GlobalSettings {
  confirmStart: boolean;
  headless: boolean;
  actionDelayMs: number;
  stopLoss: number;
  takeProfit: number;
}

export const GLOBAL_SETTINGS: SettingDefinition<GlobalSettings>[] = [
  {
    type: "checkbox",
    id: "confirmStart",
    label: "Confirm before starting",
    description: "Ask before a bot starts placing bets.",
    default: true,
  },
  {
    type: "checkbox",
    id: "headless",
    label: "Headless Mode",
    description:
      "Play in the background without drawing each hand or spin on HF's page; only HF's balance is updated. Turn it off to watch the bot play with HF's own card and reel animations (slower: each round waits for its animation).",
    default: true,
  },
  {
    type: "number",
    id: "actionDelayMs",
    label: "Delay between actions",
    description:
      "Wait this long between requests to HF (each hit, stand, deal or spin). HF rejects actions sent about a second apart as too quick, so keep this at 2 seconds or more.",
    default: 2000,
    min: 1000,
    max: 10000,
    step: 100,
    unit: "ms",
  },
  {
    type: "number",
    id: "stopLoss",
    label: "Stop-loss",
    description:
      "Stop a session once it has lost this many βytes. 0 turns it off.",
    default: 0,
    min: 0,
    max: 1000000,
    step: 1,
    unit: "βytes",
  },
  {
    type: "number",
    id: "takeProfit",
    label: "Take-profit",
    description:
      "Stop a session once it is up this many βytes. 0 turns it off.",
    default: 0,
    min: 0,
    max: 1000000,
    step: 1,
    unit: "βytes",
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
