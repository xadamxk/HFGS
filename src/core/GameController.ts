/**
 * Runs one game page: mounts the panel, keeps its totals and history current,
 * and starts/stops the game's bot with the current settings and limits.
 */

import { GameBot } from "../games/engine";
import { GameDefinition } from "../games/types";
import { GlobalSettings, HfgsSettings, watchSettings } from "../settings";
import { SettingValues } from "../settings/definitions";
import { HfClient } from "./HfClient";
import { GameHistory, loadHistory, recordRound } from "./history";
import { Logger } from "./Logger";
import { PageState } from "./pageBridge";
import { describeStop, RunLimits, Runner } from "./Runner";
import { STORAGE_KEYS } from "./storage";
import { BotPanel } from "./ui/BotPanel";

export interface GameControllerOptions {
  game: GameDefinition;
  bot: GameBot | undefined;
  settings: HfgsSettings;
  page: PageState;
  /** Injectable for tests. */
  client?: HfClient;
  openSettings?: () => void;
}

/** The limits for a session from the current settings. */
export function limitsFrom(
  global: GlobalSettings,
  game: SettingValues
): RunLimits {
  return {
    maxRounds:
      game.runUntilStopped === true ? null : Number(game.gamesPerSession) || 1,
    stopLoss: global.stopLoss,
    takeProfit: global.takeProfit,
  };
}

export class GameController {
  readonly panel: BotPanel;
  private settings: HfgsSettings;
  private readonly client: HfClient;
  private runner: Runner | null = null;
  private history: GameHistory | null = null;
  private stopWatching: (() => void) | null = null;
  private readonly onStorageChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ) => {
    // History cleared from the options page (or written by another tab)
    if (
      area === "local" &&
      STORAGE_KEYS.history(this.options.game.id) in changes
    ) {
      this.refreshHistory().catch(() => undefined);
    }
  };

  constructor(private readonly options: GameControllerOptions) {
    this.settings = options.settings;
    this.client =
      options.client ??
      new HfClient({
        postKey: options.page.postKey,
        minIntervalMs: this.settings.global.actionDelayMs,
      });
    this.panel = new BotPanel({
      gameName: options.game.name,
      botAvailable: Boolean(options.bot),
      describeResult: options.game.describeResult,
      onStart: () =>
        this.start().catch((error) => Logger.error("Start failed", error)),
      onStop: () => this.runner?.stop(),
      onOpenSettings:
        options.openSettings ??
        (() => chrome.runtime.sendMessage({ type: "hfgs:open-options" })),
    });
  }

  private get gameSettings(): SettingValues {
    return this.settings.games[this.options.game.id];
  }

  /** Load history into the panel and follow settings and history changes. */
  async init(): Promise<void> {
    await this.refreshHistory();
    this.stopWatching = watchSettings((settings) => {
      this.settings = settings;
      this.client.minIntervalMs = settings.global.actionDelayMs;
    });
    chrome.storage.onChanged.addListener(this.onStorageChanged);
  }

  dispose(): void {
    this.stopWatching?.();
    chrome.storage.onChanged.removeListener(this.onStorageChanged);
  }

  async refreshHistory(): Promise<void> {
    this.history = await loadHistory(this.options.game.id);
    this.panel.setOverall(this.history.totals);
    this.panel.setHistory(this.history.entries);
  }

  /** Confirm if the settings say so, then run a session until it stops. */
  async start(): Promise<void> {
    const { bot, game } = this.options;
    if (!bot || this.runner) return;
    if (!this.options.page.postKey) {
      this.panel.setStatus(
        "No post key on this page. Are you signed in?",
        true
      );
      return;
    }
    if (this.settings.global.confirmStart) {
      const ok = await this.panel.confirm(bot.summarize(this.gameSettings));
      if (!ok) return;
    }

    const engine = bot.createEngine({
      client: this.client,
      page: this.options.page,
      gameSettings: () => this.gameSettings,
      globalSettings: () => this.settings.global,
      status: (message) => this.panel.setStatus(message),
    });
    const runner = new Runner(engine, {
      onState: (state) => this.panel.setState(state),
      onRound: async (entry, session) => {
        this.panel.setSession(session);
        try {
          bot.afterRound?.(entry);
        } catch (error) {
          Logger.warn("Couldn't update HF's page after a round", error);
        }
        this.history = await recordRound(game.id, entry);
        this.panel.setOverall(this.history.totals);
        this.panel.setHistory(this.history.entries);
      },
      onStop: (reason) => {
        this.panel.setStatus(describeStop(reason), reason.kind === "error");
        if (reason.kind === "error")
          Logger.warn(`${game.name} bot ${describeStop(reason)}`);
      },
    });
    this.runner = runner;
    this.panel.setSession(runner.session);
    this.panel.setStatus("Running…");
    try {
      await runner.start(limitsFrom(this.settings.global, this.gameSettings));
    } finally {
      this.runner = null;
    }
  }
}
