import { HfClient } from "../core/HfClient";
import { RoundResult } from "../core/history";
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
  /** Show a short progress line in the panel (e.g. the hand being played). */
  status?: (message: string) => void;
}

export type EngineFactory = (context: EngineContext) => GameEngine;

/** One line shown before a session starts, e.g. "Play 10 hands at 2 βytes?" */
export type RunSummary = (gameSettings: SettingValues) => string;

export interface GameBot {
  createEngine: EngineFactory;
  summarize: RunSummary;
  /** Optional: update HF's own page after a round (e.g. its balance counter). */
  afterRound?: (result: RoundResult) => void;
}
