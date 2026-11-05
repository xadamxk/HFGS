/**
 * Runs one game page: mounts the panel, keeps its totals and history current
 * (bot rounds and rounds played by hand alike), and starts/stops the game's bot
 * with the current settings and limits. With Headless Mode off, the bot's
 * results are drawn on HF's page with HF's own animations.
 */

import { GameBot } from "../games/engine";
import { GameDefinition } from "../games/types";
import { GlobalSettings, HfgsSettings, watchSettings } from "../settings";
import { SettingValues } from "../settings/definitions";
import { HfClient } from "./HfClient";
import {
  addToTotals,
  emptyTotals,
  GameHistory,
  HistoryEntry,
  loadHistory,
  recordRound,
  RoundResult,
  toEntry,
  Totals,
} from "./history";
import { Logger } from "./Logger";
import {
  ManualRound,
  onManualRound,
  PageState,
  showOnPage,
  syncPage,
} from "./pageBridge";
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
  /** Draws a bot response on HF's page; injectable for tests. */
  showOnPage?: typeof showOnPage;
  /** Updates HF's counters in Headless Mode; injectable for tests. */
  syncPage?: typeof syncPage;
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
  /** Every round since this page opened, by the bot or by hand. */
  private visit: Totals = emptyTotals();
  private stopWatching: (() => void) | null = null;
  private stopManual: (() => void) | null = null;
  /** Rounds are written one at a time so totals never miss one. */
  private recording: Promise<unknown> = Promise.resolve();
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
    this.panel.setSession(this.visit);
    await this.refreshHistory();
    this.stopManual = onManualRound((round) => this.onManualRound(round));
    this.stopWatching = watchSettings((settings) => {
      this.settings = settings;
      this.client.minIntervalMs = settings.global.actionDelayMs;
    });
    chrome.storage.onChanged.addListener(this.onStorageChanged);
  }

  dispose(): void {
    this.stopWatching?.();
    this.stopManual?.();
    chrome.storage.onChanged.removeListener(this.onStorageChanged);
  }

  /** A round the user played with HF's own buttons. */
  private onManualRound(round: ManualRound): void {
    const { bot, game } = this.options;
    if (round.game !== game.id || this.runner || !bot?.fromPage) return;
    let result: RoundResult | null = null;
    try {
      result = bot.fromPage(round.action, round.response, round.bet);
    } catch (error) {
      Logger.warn("Couldn't read a round played by hand", error);
    }
    if (result) this.record(toEntry(result)).catch(() => undefined);
  }

  /** Count a finished round in this visit's totals and the stored history. */
  private record(entry: HistoryEntry): Promise<void> {
    this.visit = addToTotals(this.visit, entry);
    this.panel.setSession(this.visit);
    const write = this.recording.then(async () => {
      this.history = await recordRound(this.options.game.id, entry);
      this.panel.setOverall(this.history.totals);
      this.panel.setHistory(this.history.entries);
    });
    this.recording = write.catch((error) =>
      Logger.warn("Couldn't save a result", error)
    );
    return write;
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
      display: () => {
        if (this.settings.global.headless) return null;
        const show = this.options.showOnPage ?? showOnPage;
        return async (action, response, bet) => {
          if (!(await show(action, response, bet)))
            Logger.debug("HF's page didn't draw a bot action", action);
        };
      },
    });
    const sync = this.options.syncPage ?? syncPage;
    const runner = new Runner(engine, {
      onState: (state) => {
        this.panel.setState(state);
        document.body.classList.toggle("hfgs-running", state !== "idle");
      },
      onRound: async (entry) => {
        // Animated rounds already left HF's page up to date.
        if (this.settings.global.headless && typeof entry.balance === "number")
          sync(entry.balance, entry.details ?? {});
        await this.record(entry);
      },
      onStop: (reason) => {
        this.panel.setStatus(describeStop(reason), reason.kind === "error");
        if (reason.kind === "error")
          Logger.warn(`${game.name} bot ${describeStop(reason)}`);
      },
    });
    this.runner = runner;
    this.panel.setStatus("Running…");
    try {
      await runner.start(limitsFrom(this.settings.global, this.gameSettings));
    } finally {
      this.runner = null;
    }
  }
}
