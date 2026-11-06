/**
 * Runs one game page: mounts the panel, keeps its totals and history current
 * (bot rounds and rounds played by hand alike), and starts/stops the game's bot
 * with the current settings and limits. With Headless Mode off, the bot's
 * results are drawn on HF's page with HF's own animations.
 */

import { GameAssistant, GameBot, HistoryView, PlayedBy } from "../games/engine";
import { BotSettings, DISPLAY_GROUP } from "../games/botSettings";
import { GameDefinition } from "../games/types";
import {
  STOP_GROUP,
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

/** The limits for a session from the game's settings. */
export function limitsFrom(game: SettingValues): RunLimits {
  return {
    maxRounds:
      game.runUntilStopped === true ? null : Number(game.gamesPerSession) || 1,
    stopLoss: Number(game.stopLoss) || 0,
    takeProfit: Number(game.takeProfit) || 0,
  };
}

/** The game's bot settings, typed (each game has its own; see games/botSettings.ts). */
function botOf(game: SettingValues): BotSettings {
  return game as unknown as BotSettings;
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
        minIntervalMs: botOf(this.gameSettings).actionDelayMs,
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
   * The game's settings, editable on the game page. They
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
    this.limitsNote = el("div", { class: "hfgs-limits", role: "status" });
    this.gameForm.group(STOP_GROUP)?.append(this.limitsNote);
    // Confirm start, Headless Mode, sound and delay go beside the Start button
    const display = this.gameForm.group(DISPLAY_GROUP);
    if (display) this.panel.addToControls(display);
    this.updateLimitsNote();
    this.savedNote = el("span", { class: "hfgs-saved", role: "status" });
    const content = el("div", { class: "hfgs-settings-groups" }, [
      this.gameForm.element,
      el("div", { class: "hfgs-settings-note" }, [
        "Changes save right away and apply from the next round, even while the bot runs. Hover a setting for details.",
        this.savedNote,
      ]),
    ]);
    if (!(game.settingsInGameTable && this.mountInGameTable(content)))
      this.panel.addSection("Settings", content);
  }

  /**
   * Put the settings in HF's game table, right under its header row (for
   * blackjack: between "βytes Blackjack" and "Risk your βytes…"). False if
   * HF's page doesn't have that table, so they go in the panel instead.
   */
  private mountInGameTable(content: HTMLElement): boolean {
    const table = document
      .getElementById("PageContainer")
      ?.closest("table.tborder");
    const header = table?.querySelector("td.thead")?.closest("tr");
    if (!header) return false;
    // The panel's styles are scoped to .hfgs-panel: carry the class along
    const box = el("div", { class: "hfgs-panel hfgs-in-game" }, content);
    const toggle = el("button", {
      type: "button",
      class: "hfgs-collapse",
      "aria-controls": "hfgs-in-game-row",
    });
    const row = el(
      "tr",
      { class: "hfgs-in-game-row", id: "hfgs-in-game-row" },
      el("td", { class: "trow1", colspan: 2 }, box)
    );
    const setCollapsed = (collapsed: boolean) => {
      row.hidden = collapsed;
      toggle.textContent = collapsed ? "▼ Show" : "▲ Hide";
      toggle.title = collapsed ? "Show the settings" : "Hide the settings";
      toggle.setAttribute("aria-expanded", String(!collapsed));
    };
    // Remembered per game, on every page and tab
    const key = STORAGE_KEYS.settingsCollapsed(this.options.game.id);
    setCollapsed(false);
    chrome.storage.local
      .get(key)
      .then((stored) => setCollapsed(stored?.[key] === true))
      .catch(() => undefined);
    toggle.addEventListener("click", () => {
      const collapsed = !row.hidden;
      setCollapsed(collapsed);
      chrome.storage.local.set({ [key]: collapsed }).catch(() => undefined);
    });
    header.after(
      el(
        "tr",
        { class: "hfgs-in-game-head" },
        el("td", { class: "tcat", colspan: 2 }, [
          el("strong", null, "HF Gaming Suite settings"),
          el("div", { class: "float_right" }, toggle),
        ])
      ),
      row
    );
    return true;
  }

  private updateLimitsNote(): void {
    if (!this.limitsNote) return;
    const { text, warn } = describeLimits(
      limitsFrom(this.gameSettings),
      this.options.bot?.roundUnit?.(this.gameSettings)
    );
    this.limitsNote.textContent = text;
    this.limitsNote.classList.toggle("hfgs-warn", warn);
  }

  /** The sound state last sent to HF's page. */
  private mutedSent: boolean | null = null;

  private applyMuted(): void {
    this.mutedSent = botOf(this.gameSettings).muteSounds;
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
    if (botOf(this.gameSettings).muteSounds !== this.mutedSent)
      this.applyMuted();
    this.client.minIntervalMs = botOf(this.gameSettings).actionDelayMs;
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
      if (muted === botOf(this.gameSettings).muteSounds) return;
      this.persist({
        ...this.settings,
        games: {
          ...this.settings.games,
          [this.options.game.id]: { ...this.gameSettings, muteSounds: muted },
        },
      }).catch(() => undefined);
    });
    this.stopWatching = watchSettings((settings) => {
      this.settings = settings;
      this.client.minIntervalMs = botOf(this.gameSettings).actionDelayMs;
      this.setAssistantVisible?.(this.gameSettings.showAssistant !== false);
      this.renderHistoryView();
      if (botOf(this.gameSettings).muteSounds !== this.mutedSent)
        this.applyMuted();
      this.gameForm?.setValues(this.gameSettings);
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
    if (botOf(this.gameSettings).confirmStart) {
      const ok = await this.panel.confirm(bot.summarize(this.gameSettings));
      if (!ok) return;
    }

    const engine = bot.createEngine({
      client: this.client,
      page: this.options.page,
      gameSettings: () => this.gameSettings,
      status: (message) => this.panel.setStatus(message),
      observe: (action, response) => this.observe(action, response, "bot"),
      display: () => {
        if (botOf(this.gameSettings).headless) return null;
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
        if (
          botOf(this.gameSettings).headless &&
          typeof entry.balance === "number"
        )
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
      await runner.start(limitsFrom(this.gameSettings));
    } finally {
      this.runner = null;
    }
  }
}
