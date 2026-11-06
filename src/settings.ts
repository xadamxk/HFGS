/**
 * The extension's settings: each βytes game's own (see src/games) and the
 * Hack Game's. Stored together under one chrome.storage key.
 */

import { getItem, setItem, STORAGE_KEYS } from "./core/storage";
import { GAMES } from "./games/registry";
import { HACKGAME_SETTINGS, HackGameSettings } from "./hackgame/settings";
import { GameDefinition } from "./games/types";
import {
  defaultsOf,
  normalizeValues,
  SettingValues,
  STOP_GROUP,
} from "./settings/definitions";

export { STOP_GROUP };

export interface HfgsSettings {
  /** Keyed by game id; every registered game has an entry. */
  games: Record<string, SettingValues>;
  /** The Hack Game's auto-play (not a βytes game, so not in GAMES). */
  hackgame: HackGameSettings;
}

export function defaultSettings(): HfgsSettings {
  return {
    games: Object.fromEntries(
      GAMES.map((game) => [game.id, defaultsOf(game.settings)])
    ),
    hackgame: defaultsOf(HACKGAME_SETTINGS),
  };
}

/** Valid settings from anything stored, with defaults filling the gaps. */
export function normalizeSettings(stored: unknown): HfgsSettings {
  const source = (
    stored && typeof stored === "object" ? stored : {}
  ) as Partial<Record<"global" | "games" | "hackgame", unknown>>;
  // Settings saved before each game had its own bot settings kept them
  // under "global": they're each game's starting values
  const legacy = (
    source.global && typeof source.global === "object" ? source.global : {}
  ) as Record<string, unknown>;
  const games = (
    source.games && typeof source.games === "object" ? source.games : {}
  ) as Record<string, unknown>;
  return {
    games: Object.fromEntries(
      GAMES.map((game) => [
        game.id,
        normalizeValues(game.settings, {
          ...legacy,
          ...(games[game.id] as object | undefined),
        }),
      ])
    ),
    hackgame: normalizeValues(HACKGAME_SETTINGS, source.hackgame),
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
