import { HfClient } from "../core/HfClient";
import { RoundResult } from "../core/history";
import { PageState } from "../core/pageBridge";
import { GameEngine } from "../core/Runner";
import { SettingValues } from "../settings/definitions";
import { GlobalSettings } from "../settings";

/**
 * Draws a response the bot received on HF's page with HF's own animations,
 * resolving when they finish. `bet` is the stake for actions that set one
 * (deal, spin).
 */
export type PageDisplay = (
  action: string,
  response: unknown,
  bet: number | null
) => Promise<unknown>;

export interface EngineContext {
  client: HfClient;
  page: PageState;
  /** Current settings; read them each round so changes apply mid-session. */
  gameSettings: () => SettingValues;
  globalSettings: () => GlobalSettings;
  /** Show a short progress line in the panel (e.g. the hand being played). */
  status?: (message: string) => void;
  /**
   * The page display for this round, or null in Headless Mode. Engines read it
   * once at the start of a round so the setting never changes mid-hand.
   */
  display?: () => PageDisplay | null;
}

export type EngineFactory = (context: EngineContext) => GameEngine;

/** One line shown before a session starts, e.g. "Play 10 hands at 2 βytes?" */
export type RunSummary = (gameSettings: SettingValues) => string;

export interface GameBot {
  createEngine: EngineFactory;
  summarize: RunSummary;
  /**
   * A finished round from a request HF's own page sent (the user playing by
   * hand), or null if that request didn't finish a round.
   */
  fromPage?: (
    action: string,
    response: unknown,
    bet: number | null
  ) => RoundResult | null;
}
