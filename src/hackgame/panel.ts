/**
 * The Hack Game panel on HF's game pages (gamecp.php): Start/Stop, what the
 * bot is doing, its settings and the jobs it has played. Everything is read
 * from storage, so it shows a run going on in the background or another tab.
 */
import { el } from "../core/Dom";
import { HistoryEntry, loadHistory } from "../core/history";
import {
  loadSettings,
  saveSettings,
  watchSettings,
  HfgsSettings,
} from "../settings";
import { SettingValues } from "../settings/definitions";
import { settingsForm } from "../settings/form";
import { formatCountdown } from "./countdown";
import { jobsView } from "./jobsView";
import { HACKGAME_SETTINGS, HackGameSettings } from "./settings";
import {
  HACKGAME_ID,
  HACKGAME_KEYS,
  HackState,
  HackTotals,
  loadState,
  loadTotals,
  stalledReason,
  startRun,
  stopRun,
} from "./store";

export const HACKGAME_CSS = `
.hfgs-panel .hfgs-jobs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 2px 24px; margin-bottom: 6px; }
.hfgs-panel .hfgs-job { display: flex; align-items: center; gap: 6px; min-height: 24px; cursor: pointer; }
.hfgs-panel .hfgs-job-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hfgs-panel .hfgs-job-rate { opacity: 0.8; font-variant-numeric: tabular-nums; }
.hfgs-panel .hfgs-jobs-note { font-size: 11px; opacity: 0.75; margin: 2px 0; }
.hfgs-panel .hfgs-jobs-note.hfgs-warn { color: #e0a000; opacity: 1; }
.hfgs-panel .hfgs-last { font-size: 11px; opacity: 0.8; }
`;

const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const cash = (n: number) => `$${n.toFixed(2)}`;
const pct = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 100)}%` : "–";

/** The status line for a state. */
export function describeState(
  state: HackState,
  now = Date.now(),
  runInBackground = true
): string {
  if (!state.running)
    return state.message || "Not running. Tick some jobs and press Start.";
  const stalled = stalledReason(state, runInBackground, now);
  if (stalled) return stalled;
  const next =
    state.nextAt && state.nextAt > now + 1000
      ? ` Next step at ${time(state.nextAt)} (${formatCountdown((state.nextAt - now) / 1000)}).`
      : "";
  return `${state.message}${next}`;
}

function totalsOf(entries: HistoryEntry[]): HackTotals {
  return entries.reduce(
    (t, e) => ({
      jobs: t.jobs + 1,
      successes: t.successes + (e.outcome === "SUCCESS" ? 1 : 0),
      money: t.money + e.returned,
      xp: t.xp + (Number(e.details?.xp) || 0),
    }),
    { jobs: 0, successes: 0, money: 0, xp: 0 }
  );
}

export class HackGamePanel {
  readonly element: HTMLTableElement;
  private readonly button = el(
    "button",
    { type: "button", class: "button" },
    "Start"
  );
  private readonly status = el("span", {
    class: "hfgs-status",
    role: "status",
  });
  private readonly mode = el("div", { class: "hfgs-last" });
  private readonly last = el("div", { class: "hfgs-last" });
  private readonly statsBody = el("tbody");
  private readonly recentBody = el("tbody");
  private readonly saved = el("span", { class: "hfgs-saved", role: "status" });
  private settings: HfgsSettings | null = null;
  private state: HackState | null = null;
  private form: ReturnType<typeof settingsForm> | null = null;
  private readonly jobs = jobsView("hfgs-hackgame", true);
  private readonly settingsCell = el("td", { class: "trow1", colspan: 2 });
  private stopWatching: (() => void) | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.button.addEventListener("click", () => this.toggle());
    const settingsLink = el("a", { href: "#" }, "Settings");
    settingsLink.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.runtime.sendMessage({ type: "hfgs:open-options" });
    });
    this.element = el(
      "table",
      {
        class: "tborder hfgs-panel",
        cellspacing: 0,
        cellpadding: 5,
        border: 0,
      },
      el("tbody", null, [
        el("tr", null, [
          el("td", { class: "thead", colspan: 2 }, [
            el("strong", null, "HF Gaming Suite: Hack Game"),
            el("div", { class: "float_right" }, settingsLink),
          ]),
        ]),
        el("tr", null, [
          el("td", { class: "trow1", colspan: 2 }, [
            el("div", { class: "hfgs-controls" }, [this.button, this.status]),
            this.mode,
            this.last,
          ]),
        ]),
        el("tr", null, [
          el(
            "td",
            { class: "tcat", colspan: 2 },
            el("strong", null, "Settings")
          ),
        ]),
        el("tr", null, this.settingsCell),
        el("tr", null, [
          el("td", { class: "tcat" }, el("strong", null, "Totals")),
          el("td", { class: "tcat" }, el("strong", null, "Recent jobs")),
        ]),
        el("tr", null, [
          el(
            "td",
            { class: "trow1", style: "vertical-align: top; width: 40%" },
            el("table", { class: "hfgs-stats" }, [
              el(
                "thead",
                null,
                el("tr", null, [
                  el("th", null, ""),
                  el(
                    "th",
                    { title: "Since you last pressed Start" },
                    "This run"
                  ),
                  el("th", null, "Overall"),
                ])
              ),
              this.statsBody,
            ])
          ),
          el(
            "td",
            { class: "trow1", style: "vertical-align: top" },
            el(
              "div",
              { class: "hfgs-history" },
              el("table", { class: "hfgs-stats" }, [
                el(
                  "thead",
                  null,
                  el(
                    "tr",
                    null,
                    ["Time", "Job", "Result", "Cash", "XP"].map((h) =>
                      el("th", null, h)
                    )
                  )
                ),
                this.recentBody,
              ])
            )
          ),
        ]),
      ])
    );
  }

  async init(): Promise<void> {
    this.settings = await loadSettings();
    this.mountSettings();
    await this.refresh();
    this.stopWatching = watchSettings((settings) => {
      this.settings = settings;
      this.form?.setValues(settings.hackgame as unknown as SettingValues);
      this.renderStatus();
    });
    chrome.storage.onChanged.addListener(this.onStorage);
    // The countdown after "Next step at" ticks every second
    this.clock = setInterval(() => this.renderStatus(), 1000);
  }

  dispose(): void {
    this.stopWatching?.();
    chrome.storage.onChanged.removeListener(this.onStorage);
    this.jobs.dispose();
    if (this.clock) clearInterval(this.clock);
  }

  private readonly onStorage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ) => {
    if (area === "local" && HACKGAME_KEYS.some((key) => key in changes))
      this.refresh().catch(() => undefined);
  };

  private mountSettings(): void {
    const values = this.settings!.hackgame as unknown as SettingValues;
    this.form = settingsForm(
      "hfgs-hackgame",
      HACKGAME_SETTINGS,
      values,
      (change) => this.persist(change as Partial<HackGameSettings>),
      { compact: true, title: "Mode" }
    );
    // The tick list goes at the top of the Jobs group
    this.form
      .group("Jobs")
      ?.querySelector(".hfgs-settings-title")
      ?.after(this.jobs.element);
    this.settingsCell.replaceChildren(
      el("div", { class: "hfgs-settings-groups" }, [
        this.form.element,
        el("div", { class: "hfgs-settings-note" }, [
          "Changes save right away and apply from the next step. Hover a setting for details.",
          this.saved,
        ]),
      ])
    );
  }

  private async persist(change: Partial<HackGameSettings>): Promise<void> {
    const current = await loadSettings();
    this.settings = {
      ...current,
      hackgame: { ...current.hackgame, ...change },
    };
    try {
      await saveSettings(this.settings);
      this.saved.textContent = "Saved";
    } catch (error) {
      this.saved.textContent = `Couldn't save: ${(error as Error)?.message}`;
    }
    setTimeout(() => (this.saved.textContent = ""), 2000);
    this.renderStatus();
  }

  private async toggle(): Promise<void> {
    if (this.state?.running) await stopRun("Stopped.");
    else await startRun();
  }

  private async refresh(): Promise<void> {
    const [state, totals, history] = await Promise.all([
      loadState(),
      loadTotals(),
      loadHistory(HACKGAME_ID),
    ]);
    this.state = state;
    this.renderStatus();
    const run = state.startedAt
      ? totalsOf(history.entries.filter((e) => e.at >= state.startedAt!))
      : totalsOf([]);
    const rows: [string, (t: HackTotals) => string][] = [
      ["Jobs", (t) => String(t.jobs)],
      ["Succeeded", (t) => `${t.successes} (${pct(t.successes, t.jobs)})`],
      ["Cash earned", (t) => cash(t.money)],
      ["XP earned", (t) => t.xp.toFixed(2)],
    ];
    this.statsBody.replaceChildren(
      ...rows.map(([label, f]) =>
        el("tr", null, [
          el("td", null, label),
          el("td", null, f(run)),
          el("td", null, f(totals)),
        ])
      )
    );
    const recent = history.entries.slice(0, 50);
    this.recentBody.replaceChildren(
      ...(recent.length
        ? recent.map((e) =>
            el("tr", null, [
              el("td", null, time(e.at)),
              el(
                "td",
                { title: String(e.details?.job ?? "") },
                String(e.details?.job ?? "")
              ),
              el(
                "td",
                { class: e.outcome === "SUCCESS" ? "hfgs-pos" : "hfgs-neg" },
                `${e.outcome === "SUCCESS" ? "Success" : "Fail"} (${e.details?.rate ?? "?"}%)`
              ),
              el("td", null, cash(e.returned)),
              el("td", null, (Number(e.details?.xp) || 0).toFixed(2)),
            ])
          )
        : [
            el(
              "tr",
              null,
              el(
                "td",
                { class: "hfgs-empty", colspan: 5 },
                "No jobs played by the bot yet."
              )
            ),
          ])
    );
  }

  private renderStatus(): void {
    const state = this.state;
    if (!state) return;
    this.button.textContent = state.running ? "Stop" : "Start";
    this.status.textContent = describeState(
      state,
      Date.now(),
      this.settings?.hackgame.runInBackground ?? true
    );
    this.status.classList.toggle(
      "hfgs-error",
      !state.running &&
        state.phase === "stopped" &&
        /error|signed out|Cloudflare|post key/i.test(state.message)
    );
    const background = this.settings?.hackgame.runInBackground ?? true;
    this.mode.textContent = background
      ? "Runs in the background: no HF tab needs to stay open while the browser runs."
      : "Runs from an open tab: keep an HF game page open (this one or another) while it plays.";
    this.last.textContent = state.last
      ? `Last job ${time(state.last.at)}: ${state.last.job}: ${state.last.success ? "Success" : "Fail"} (${state.last.rate}%)${
          state.last.success
            ? `, ${cash(state.last.money)}, ${state.last.xp.toFixed(2)} xp`
            : ""
        }.`
      : "";
  }
}
