/**
 * Runs one game page: mounts the panel, keeps its totals and history current
 * (bot rounds and rounds played by hand alike), and starts/stops the game's bot
 * with the current settings and limits. With Headless Mode off, the bot's
 * results are drawn on HF's page with HF's own animations.
 */

import { GameAssistant, GameBot, HistoryView, PlayedBy } from "../games/engine";
import { GameDefinition } from "../games/types";
import {
  GLOBAL_SETTINGS,
  STOP_GROUP,
  GlobalSettings,
  HfgsSettings,
  saveSettings,
  watchSettings,
} from "../settings";
import { settingsForm, SettingsForm } from "../settings/form";
import { el } from "./Dom";
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
  onMuteButton,
  setPageMuted,
  PageState,
  showOnPage,
  syncPage,
} from "./pageBridge";
import { describeLimits, describeStop, RunLimits, Runner } from "./Runner";
import { STORAGE_KEYS } from "./storage";
import { BESIDE_CSS, mountBeside } from "./ui/beside";
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
  /** Mutes HF's sounds; injectable for tests. */
  setPageMuted?: typeof setPageMuted;
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

function injectCss(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
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
  private stopMuteButton: (() => void) | null = null;
  private readonly assistant: GameAssistant | null = null;
  private setAssistantVisible: ((visible: boolean) => void) | null = null;
  private readonly historyView: HistoryView | null = null;
  private setHistoryViewVisible: ((visible: boolean) => void) | null = null;
  private sessionStartedAt: number | null = null;
  private gameForm: SettingsForm | null = null;
  private globalForm: SettingsForm | null = null;
  /** In the Stop the bot group: when a run with the current settings stops. */
  private limitsNote: HTMLElement | null = null;
  private savedNote: HTMLElement | null = null;
  private savedTimer: ReturnType<typeof setTimeout> | undefined;
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
    if (options.bot?.createHistoryView) {
      this.historyView = options.bot.createHistoryView();
      if (this.historyView.css)
        injectCss("hfgs-history-view-styles", this.historyView.css);
      this.setHistoryViewVisible = this.panel.addSection(
        this.historyView.title,
        this.historyView.element
      );
      this.renderHistoryView();
    }
    // Sections stack under the controls, newest on top: settings go above
    this.mountSettings();
    if (options.bot?.createAssistant) {
      this.assistant = options.bot.createAssistant(options.page);
      injectCss(
        "hfgs-assistant-styles",
        BESIDE_CSS + (this.assistant.css ?? "")
      );
      // To the right of HF's game box; in the panel if HF's page changed
      this.setAssistantVisible =
        mountBeside(
          document.getElementById("PageContainer"),
          this.assistant.title,
          this.assistant.element
        ) ??
        this.panel.addSection(this.assistant.title, this.assistant.element);
      this.setAssistantVisible(this.gameSettings.showAssistant !== false);
    }
  }

  /**
   * The game's settings and the global ones, editable on the game page. They
   * save right away, like the settings page, and the bot reads them every
   * round, so changes apply from the next hand or spin.
   */
  private mountSettings(): void {
    const { game } = this.options;
    this.gameForm = settingsForm(
      `hfgs-${game.id}`,
      game.settings,
      this.gameSettings,
      (change) =>
        this.persist({
          ...this.settings,
          games: {
            ...this.settings.games,
            [game.id]: { ...this.gameSettings, ...change },
          },
        }),
      { compact: true, title: game.name }
    );
    this.globalForm = settingsForm(
      "hfgs-global",
      GLOBAL_SETTINGS,
      this.settings.global as unknown as SettingValues,
      (change) =>
        this.persist({
          ...this.settings,
          global: { ...this.settings.global, ...change } as GlobalSettings,
        }),
      { compact: true }
    );
    this.limitsNote = el("div", { class: "hfgs-limits", role: "status" });
    // The game's round settings and the global stop-loss and take-profit
    // both decide when a run ends: show them as one group.
    const gameStop = this.gameForm.group(STOP_GROUP);
    const globalStop = this.globalForm.group(STOP_GROUP);
    const grid = (box?: HTMLElement) =>
      box?.querySelector(".hfgs-settings-grid") ?? null;
    if (gameStop && globalStop) {
      grid(gameStop)?.append(...Array.from(grid(globalStop)?.children ?? []));
      globalStop.remove();
    }
    (gameStop ?? globalStop)?.append(this.limitsNote);
    this.updateLimitsNote();
    this.savedNote = el("span", { class: "hfgs-saved", role: "status" });
    this.panel.addSection(
      "Settings",
      el("div", { class: "hfgs-settings-groups" }, [
        this.gameForm.element,
        this.globalForm.element,
        el("div", { class: "hfgs-settings-note" }, [
          "Changes save right away and apply from the next round, even while the bot runs. Hover a setting for details.",
          this.savedNote,
        ]),
      ])
    );
  }

  private updateLimitsNote(): void {
    if (!this.limitsNote) return;
    const { text, warn } = describeLimits(
      limitsFrom(this.settings.global, this.gameSettings),
      this.options.bot?.roundUnit?.(this.gameSettings)
    );
    this.limitsNote.textContent = text;
    this.limitsNote.classList.toggle("hfgs-warn", warn);
  }

  /** The sound state last sent to HF's page. */
  private mutedSent: boolean | null = null;

  private applyMuted(): void {
    this.mutedSent = this.settings.global.muteSounds;
    (this.options.setPageMuted ?? setPageMuted)(this.mutedSent);
  }

  /** Redraw the game's extra history section, or hide it if it doesn't apply. */
  private renderHistoryView(): void {
    if (!this.historyView) return;
    const visible = this.historyView.visible(this.gameSettings);
    this.setHistoryViewVisible?.(visible);
    if (!visible) return;
    try {
      this.historyView.render(this.history?.entries ?? [], {
        sessionStartedAt: this.sessionStartedAt,
        gameSettings: this.gameSettings,
      });
    } catch (error) {
      Logger.warn(`Couldn't draw ${this.historyView.title}`, error);
    }
  }

  private async persist(next: HfgsSettings): Promise<void> {
    this.settings = next;
    this.renderHistoryView();
    if (next.global.muteSounds !== this.mutedSent) this.applyMuted();
    this.client.minIntervalMs = next.global.actionDelayMs;
    this.setAssistantVisible?.(this.gameSettings.showAssistant !== false);
    this.updateLimitsNote();
    try {
      await saveSettings(next);
      if (this.savedNote) this.savedNote.textContent = "Saved";
    } catch (error) {
      if (this.savedNote)
        this.savedNote.textContent = `Couldn't save: ${(error as Error)?.message}`;
    }
    clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => {
      if (this.savedNote) this.savedNote.textContent = "";
    }, 2000);
  }

  private get gameSettings(): SettingValues {
    return this.settings.games[this.options.game.id];
  }

  /** Load history into the panel and follow settings and history changes. */
  async init(): Promise<void> {
    this.panel.setSession(this.visit);
    await this.refreshHistory();
    this.stopManual = onManualRound((round) => this.onManualRound(round));
    this.applyMuted();
    // HF's own sound button: remember the choice
    this.stopMuteButton = onMuteButton((muted) => {
      if (muted === this.settings.global.muteSounds) return;
      this.persist({
        ...this.settings,
        global: { ...this.settings.global, muteSounds: muted },
      }).catch(() => undefined);
    });
    this.stopWatching = watchSettings((settings) => {
      this.settings = settings;
      this.client.minIntervalMs = settings.global.actionDelayMs;
      this.setAssistantVisible?.(this.gameSettings.showAssistant !== false);
      this.renderHistoryView();
      if (settings.global.muteSounds !== this.mutedSent) this.applyMuted();
      this.gameForm?.setValues(this.gameSettings);
      this.globalForm?.setValues(settings.global as unknown as SettingValues);
      this.updateLimitsNote();
    });
    chrome.storage.onChanged.addListener(this.onStorageChanged);
  }

  dispose(): void {
    this.stopWatching?.();
    this.stopManual?.();
    this.stopMuteButton?.();
    chrome.storage.onChanged.removeListener(this.onStorageChanged);
  }

  /** A round the user played with HF's own buttons. */
  private onManualRound(round: ManualRound): void {
    const { bot, game } = this.options;
    if (round.game !== game.id || this.runner) return;
    this.observe(round.action, round.response, "you");
    if (!bot?.fromPage) return;
    let result: RoundResult | null = null;
    try {
      result = bot.fromPage(round.action, round.response, round.bet);
    } catch (error) {
      Logger.warn("Couldn't read a round played by hand", error);
    }
    if (result) this.record(toEntry(result)).catch(() => undefined);
  }

  private observe(action: string, response: unknown, by: PlayedBy): void {
    try {
      this.assistant?.update(action, response, by);
    } catch (error) {
      Logger.warn("The assistant couldn't read HF's answer", error);
    }
  }

  /** Count a finished round in this visit's totals and the stored history. */
  private record(entry: HistoryEntry): Promise<void> {
    this.visit = addToTotals(this.visit, entry);
    this.panel.setSession(this.visit);
    const write = this.recording.then(async () => {
      this.history = await recordRound(this.options.game.id, entry);
      this.panel.setOverall(this.history.totals);
      this.panel.setHistory(this.history.entries);
      this.renderHistoryView();
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
    this.renderHistoryView();
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
      observe: (action, response) => this.observe(action, response, "bot"),
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
        // An unfinished martingale set is "in progress" only while its session runs
        if (state === "running" && this.sessionStartedAt === null)
          this.sessionStartedAt = Date.now();
        if (state === "idle") this.sessionStartedAt = null;
        this.renderHistoryView();
      },
      onRound: async (entry) => {
        // Animated rounds already left HF's page up to date.
        if (this.settings.global.headless && typeof entry.balance === "number")
          sync(entry.balance, entry.details ?? {});
        await this.record(entry);
      },
      onStop: (reason) => {
        const text =
          reason.kind === "rounds" && bot.describeRounds
            ? bot.describeRounds(
                reason.rounds,
                reason.played,
                this.gameSettings
              )
            : describeStop(reason);
        this.panel.setStatus(text, reason.kind === "error");
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
