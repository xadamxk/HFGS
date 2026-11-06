/**
 * The panel HFGS adds under each game: start/stop, session and overall totals,
 * and recent results. Built from HF's own table classes (tborder, thead, tcat,
 * trow1) so it follows the forum's theme.
 */

import { el } from "../Dom";
import { HistoryEntry, Totals } from "../history";
import { RunnerState } from "../Runner";
import { formatAmount, formatStreak, formatWinRate } from "./format";
import { NetChart } from "./NetChart";

export { formatAmount };

const CSS = `
.hfgs-panel { margin-top: 10px; width: 100%; }
.hfgs-panel .hfgs-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.hfgs-panel .hfgs-status { margin-left: 4px; }
.hfgs-panel .hfgs-status.hfgs-error { color: #ff2121; }
.hfgs-panel .hfgs-controls-extra { margin-left: auto; }
/* Settings beside the Start button sit in one line instead of a grid */
.hfgs-panel .hfgs-controls-extra .hfgs-settings-title { display: none; }
.hfgs-panel .hfgs-controls-extra .hfgs-settings-grid { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 20px; }
.hfgs-panel .hfgs-controls-extra .hfgs-setting-number { justify-content: flex-start; }
.hfgs-panel .hfgs-stats { width: 100%; border-collapse: collapse; }
.hfgs-panel .hfgs-stats td, .hfgs-panel .hfgs-stats th { padding: 3px 8px; text-align: right; }
.hfgs-panel .hfgs-stats th:first-child, .hfgs-panel .hfgs-stats td:first-child { text-align: left; }
.hfgs-panel .hfgs-history { max-height: 240px; overflow-y: auto; }
.hfgs-panel .hfgs-pos { color: #00b500; }
.hfgs-panel .hfgs-neg { color: #ff2121; }
.hfgs-panel .hfgs-empty { opacity: 0.7; }
.hfgs-panel .hfgs-chart-caption { margin-bottom: 4px; }
.hfgs-panel .hfgs-chart-area { position: relative; }
.hfgs-panel .hfgs-chart-plot { display: block; width: 100%; height: 120px; cursor: crosshair; }
.hfgs-panel .hfgs-chart-line { fill: none; stroke: #4a90d9; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.hfgs-panel .hfgs-chart-zero { stroke: currentColor; stroke-opacity: 0.35; stroke-width: 1; stroke-dasharray: 4 4; }
.hfgs-panel .hfgs-chart-cursor { stroke: currentColor; stroke-opacity: 0.5; stroke-width: 1; }
.hfgs-panel .hfgs-chart-tooltip { position: absolute; top: 4px; padding: 4px 8px; border-radius: 4px; background: rgba(0, 0, 0, 0.85); color: #fff; font-size: 11px; line-height: 1.5; pointer-events: none; white-space: nowrap; }
.hfgs-panel .hfgs-settings-groups { display: flex; flex-direction: column; gap: 8px; }
.hfgs-panel .hfgs-settings-group > .hfgs-settings-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.7; margin-bottom: 4px; }
.hfgs-panel .hfgs-settings { display: flex; flex-direction: column; gap: 10px; margin: 0; }
.hfgs-panel .hfgs-settings-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 6px 24px; }
.hfgs-panel .hfgs-limits { font-size: 11px; opacity: 0.8; margin-top: 4px; }
.hfgs-panel .hfgs-limits.hfgs-warn { color: #e0a000; opacity: 1; }
.hfgs-panel .hfgs-setting { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 26px; }
.hfgs-panel .hfgs-setting-check { justify-content: flex-start; }
.hfgs-panel .hfgs-setting label { cursor: pointer; }
.hfgs-panel .hfgs-setting.disabled { opacity: 0.45; }
.hfgs-panel .hfgs-field { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
/* HF's .textbox sets its own width; keep number inputs compact */
.hfgs-panel .hfgs-field input { width: 80px !important; min-width: 0; flex: none; box-sizing: border-box; }
.hfgs-panel .hfgs-setting > label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hfgs-panel .hfgs-settings-note { font-size: 11px; opacity: 0.75; }
.hfgs-panel .hfgs-settings-note .hfgs-saved { color: #00b500; margin-left: 6px; }
/* While a bot plays, HF's own controls would send conflicting requests. */
body.hfgs-running #buttonsContainer, body.hfgs-running #chipsContainer,
body.hfgs-running #spinButton, body.hfgs-running #betSpinUp, body.hfgs-running #betSpinDown { pointer-events: none; opacity: 0.4; }
`;

const STAT_ROWS: {
  label: string;
  render: (t: Totals) => { text: string; tone?: number };
}[] = [
  { label: "Rounds", render: (t) => ({ text: String(t.rounds) }) },
  {
    label: "Won / lost / push",
    render: (t) => ({ text: `${t.wins} / ${t.losses} / ${t.pushes}` }),
  },
  { label: "Win rate", render: (t) => ({ text: formatWinRate(t) }) },
  { label: "Wagered", render: (t) => ({ text: formatAmount(t.wagered) }) },
  { label: "Returned", render: (t) => ({ text: formatAmount(t.returned) }) },
  {
    label: "Net",
    render: (t) => ({ text: formatAmount(t.net, true), tone: t.net }),
  },
  {
    label: "Biggest win",
    render: (t) => ({
      text: formatAmount(t.biggestWin, true),
      tone: t.biggestWin,
    }),
  },
  {
    label: "Biggest loss",
    render: (t) => ({
      text: formatAmount(t.biggestLoss, true),
      tone: t.biggestLoss,
    }),
  },
  {
    label: "Streak",
    render: (t) => ({ text: formatStreak(t.streak), tone: t.streak }),
  },
  {
    label: "Longest streaks",
    render: (t) => ({
      text: `${t.longestWinStreak} W / ${t.longestLossStreak} L`,
    }),
  },
];

export interface BotPanelOptions {
  gameName: string;
  /** False when the game has no bot yet: the panel shows history only. */
  botAvailable: boolean;
  onStart: () => void;
  onStop: () => void;
  onOpenSettings: () => void;
  /** Cards, reels etc. for a result, shown when hovering its row. */
  describeResult?: (details: Record<string, unknown>) => string;
}

function signClass(n: number): string | null {
  return n > 0 ? "hfgs-pos" : n < 0 ? "hfgs-neg" : null;
}

export class BotPanel {
  readonly element: HTMLTableElement;
  private readonly status: HTMLSpanElement;
  private readonly startButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private readonly confirmBox: HTMLSpanElement;
  private readonly statsBody: HTMLTableSectionElement;
  private readonly historyBody: HTMLTableSectionElement;
  private readonly chart = new NetChart();
  /** The controls row; game sections go right after it. */
  private readonly controlsRow: HTMLTableRowElement;
  private readonly controls: HTMLDivElement;
  private session: Totals | null = null;
  private overall: Totals | null = null;

  constructor(private readonly options: BotPanelOptions) {
    this.status = el("span", { class: "hfgs-status", role: "status" });
    this.startButton = el(
      "button",
      { type: "button", class: "button" },
      "Start bot"
    );
    this.stopButton = el(
      "button",
      { type: "button", class: "button", hidden: true },
      "Stop after this round"
    );
    this.confirmBox = el("span", { hidden: true });
    this.startButton.addEventListener("click", () => options.onStart());
    this.stopButton.addEventListener("click", () => options.onStop());
    if (!options.botAvailable) {
      this.startButton.disabled = true;
      this.setStatus(
        `The ${options.gameName.toLowerCase()} bot isn't available yet.`
      );
    }

    const settingsLink = el("a", { href: "#" }, "Settings");
    settingsLink.addEventListener("click", (event) => {
      event.preventDefault();
      options.onOpenSettings();
    });

    this.statsBody = el("tbody");
    this.historyBody = el("tbody");

    this.element = el(
      "table",
      {
        class: "tborder hfgs-panel",
        cellspacing: 0,
        cellpadding: 5,
        border: 0,
      },
      [
        el("tbody", null, [
          el("tr", null, [
            el("td", { class: "thead", colspan: 2 }, [
              el("strong", null, `HF Gaming Suite: ${options.gameName}`),
              el("div", { class: "float_right" }, settingsLink),
            ]),
          ]),
          (this.controlsRow = el("tr", null, [
            el("td", { class: "trow1", colspan: 2 }, [
              (this.controls = el("div", { class: "hfgs-controls" }, [
                this.startButton,
                this.stopButton,
                this.confirmBox,
                this.status,
              ])),
            ]),
          ])),
          el("tr", null, [
            el("td", { class: "tcat" }, el("strong", null, "Totals")),
            el("td", { class: "tcat" }, el("strong", null, "Recent results")),
          ]),
          el("tr", null, [
            el(
              "td",
              { class: "trow1", style: "vertical-align: top; width: 40%" },
              [
                el("table", { class: "hfgs-stats" }, [
                  el(
                    "thead",
                    null,
                    el("tr", null, [
                      el("th", null, ""),
                      el(
                        "th",
                        { title: "Rounds since this page opened" },
                        "This visit"
                      ),
                      el("th", null, "Overall"),
                    ])
                  ),
                  this.statsBody,
                ]),
              ]
            ),
            el("td", { class: "trow1", style: "vertical-align: top" }, [
              el("div", { class: "hfgs-history" }, [
                el("table", { class: "hfgs-stats" }, [
                  el(
                    "thead",
                    null,
                    el(
                      "tr",
                      null,
                      ["Time", "Result", "Wagered", "Returned", "Net"].map(
                        (h) => el("th", null, h)
                      )
                    )
                  ),
                  this.historyBody,
                ]),
              ]),
            ]),
          ]),
          el("tr", null, [
            el("td", { class: "trow2", colspan: 2 }, this.chart.element),
          ]),
        ]),
      ]
    );
    this.renderStats();
    this.setHistory([]);
  }

  /**
   * Add a titled section under the controls (e.g. the strategy assistant).
   * Returns a function that shows or hides it.
   */
  addSection(title: string, content: HTMLElement): (visible: boolean) => void {
    const head = el(
      "tr",
      null,
      el("td", { class: "tcat", colspan: 2 }, el("strong", null, title))
    );
    const body = el(
      "tr",
      null,
      el("td", { class: "trow1", colspan: 2 }, content)
    );
    this.controlsRow.after(head, body);
    return (visible) => {
      head.hidden = !visible;
      body.hidden = !visible;
    };
  }

  /** Put something on the right of the Start button's row (e.g. settings). */
  addToControls(content: HTMLElement): void {
    this.controls.append(el("div", { class: "hfgs-controls-extra" }, content));
  }

  static injectStyles(doc: Document = document): void {
    if (doc.getElementById("hfgs-panel-styles")) return;
    const style = doc.createElement("style");
    style.id = "hfgs-panel-styles";
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  setStatus(message: string, isError = false): void {
    this.status.textContent = message;
    this.status.classList.toggle("hfgs-error", isError);
  }

  setState(state: RunnerState): void {
    const running = state !== "idle";
    if (running) this.hideConfirm();
    this.startButton.hidden = running;
    this.stopButton.hidden = !running;
    this.stopButton.disabled = state === "stopping";
    this.stopButton.textContent =
      state === "stopping" ? "Stopping…" : "Stop after this round";
  }

  /** Ask before starting, inside the panel (no blocking browser dialog). */
  confirm(question: string): Promise<boolean> {
    return new Promise((resolve) => {
      const yes = el("button", { type: "button", class: "button" }, "Start");
      const no = el("button", { type: "button", class: "button" }, "Cancel");
      const answer = (value: boolean) => {
        this.hideConfirm();
        resolve(value);
      };
      yes.addEventListener("click", () => answer(true));
      no.addEventListener("click", () => answer(false));
      this.confirmBox.replaceChildren(
        el("span", null, question),
        " ",
        yes,
        " ",
        no
      );
      this.confirmBox.hidden = false;
      this.startButton.hidden = true;
    });
  }

  private hideConfirm(): void {
    this.confirmBox.hidden = true;
    this.confirmBox.replaceChildren();
    this.startButton.hidden = false;
  }

  setSession(totals: Totals | null): void {
    this.session = totals;
    this.renderStats();
  }

  setOverall(totals: Totals): void {
    this.overall = totals;
    this.renderStats();
  }

  setHistory(entries: HistoryEntry[], limit = 25): void {
    this.chart.setEntries(entries);
    if (!entries.length) {
      this.historyBody.replaceChildren(
        el(
          "tr",
          null,
          el("td", { colspan: 5, class: "hfgs-empty" }, "No results yet.")
        )
      );
      return;
    }
    this.historyBody.replaceChildren(
      ...entries.slice(0, limit).map((entry) =>
        el(
          "tr",
          { title: this.options.describeResult?.(entry.details ?? {}) || null },
          [
            el(
              "td",
              null,
              new Date(entry.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            ),
            el("td", { class: signClass(entry.net) }, entry.outcome),
            el("td", null, formatAmount(entry.wagered)),
            el("td", null, formatAmount(entry.returned)),
            el(
              "td",
              { class: signClass(entry.net) },
              formatAmount(entry.net, true)
            ),
          ]
        )
      )
    );
  }

  private renderStats(): void {
    const cell = (totals: Totals | null, row: (typeof STAT_ROWS)[number]) => {
      if (!totals) return el("td", null, "–");
      const { text, tone } = row.render(totals);
      return el(
        "td",
        { class: tone === undefined ? null : signClass(tone) },
        text
      );
    };
    this.statsBody.replaceChildren(
      ...STAT_ROWS.map((row) =>
        el("tr", null, [
          el("td", null, row.label),
          cell(this.session, row),
          cell(this.overall, row),
        ])
      )
    );
  }
}
