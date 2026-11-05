import { HfClient } from "../core/HfClient";
import { PageState } from "../core/pageBridge";
import { GameEngine } from "../core/Runner";
import { SettingValues } from "../settings/definitions";
import { GlobalSettings } from "../settings";

export interface EngineContext {
  client: HfClient;
  page: PageState;
  /** Current settings; read them each round so changes apply mid-session. */
  gameSettings: () => SettingValues;
  globalSettings: () => GlobalSettings;
}

export type EngineFactory = (context: EngineContext) => GameEngine;

/** One line shown before a session starts, e.g. "Play 10 hands at 2 βytes?" */
export type RunSummary = (gameSettings: SettingValues) => string;

export interface GameBot {
  createEngine: EngineFactory;
  summarize: RunSummary;
}
