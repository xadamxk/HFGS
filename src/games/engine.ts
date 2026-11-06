import { HfClient } from "../core/HfClient";
import { HistoryEntry, RoundResult } from "../core/history";
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

/** Who played a blackjack action or spin: the bot, or the user with HF's buttons. */
export type PlayedBy = "bot" | "you";

/**
 * A live helper shown in the game's panel (e.g. blackjack's strategy
 * assistant). It's given every answer HF sends during a round, whoever played.
 */
export interface GameAssistant {
  title: string;
  element: HTMLElement;
  /** CSS for the assistant, added to the page once. */
  css?: string;
  /** `action` is HF's action name ("deal", "hit", "spin"...). */
  update(action: string, response: unknown, by: PlayedBy): void;
}

export interface HistoryViewContext {
  /** When the bot's current session started, or null while it's stopped. */
  sessionStartedAt: number | null;
  gameSettings: SettingValues;
}

/** An extra panel section drawn from the game's history (e.g. martingale sets). */
export interface HistoryView {
  title: string;
  element: HTMLElement;
  css?: string;
  /** Whether to show it with these settings. */
  visible(gameSettings: SettingValues): boolean;
  /** Redraw from the history (newest first). */
  render(entries: HistoryEntry[], context: HistoryViewContext): void;
}

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
  /** Tell the assistant about every answer HF sends (after it's drawn, if drawn). */
  observe?: (action: string, response: unknown) => void;
}

export type EngineFactory = (context: EngineContext) => GameEngine;

/** One line shown before a session starts, e.g. "Play 10 hands at 2 βytes?" */
export type RunSummary = (gameSettings: SettingValues) => string;

export interface GameBot {
  createEngine: EngineFactory;
  summarize: RunSummary;
  /**
   * The status line when the round limit ends a session, e.g. "Finished 10
   * sets (23 hands)." Defaults to "Finished 10 rounds."
   */
  describeRounds?: (
    rounds: number,
    played: number,
    gameSettings: SettingValues
  ) => string;
  /**
   * A finished round from a request HF's own page sent (the user playing by
   * hand), or null if that request didn't finish a round.
   */
  /** An extra history section for the panel. */
  createHistoryView?: () => HistoryView;
  /** A live assistant for the panel, starting from the page's state. */
  createAssistant?: (page: PageState) => GameAssistant;
  fromPage?: (
    action: string,
    response: unknown,
    bet: number | null
  ) => RoundResult | null;
}
