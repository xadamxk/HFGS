/**
 * The blackjack strategy assistant: a panel section that shows, live, what the
 * strategy table is given and what it answers, for the bot's hands and for
 * hands played with HF's own buttons alike. Headless Mode doesn't matter: it
 * works from HF's answers, not from what's drawn on the table.
 */

import { el } from "../../core/Dom";
import { formatAmount } from "../../core/ui/format";
import { GameAssistant, PlayedBy } from "../engine";
import { ACTION_LABELS, Analysis, analyze, Decision } from "./analysis";
import { formatCard, formatCards } from "./cards";
import type { BjGameState } from "./engine";
import {
  Action,
  CHART_ROWS,
  chartCell,
  ChartCell,
  ChartKind,
  handTotal,
  UPCARDS,
} from "./strategy";

const DECISIONS = new Set<string>([
  "hit",
  "stand",
  "double",
  "split",
  "surrender",
]);

const LETTERS: Record<Action, string> = {
  hit: "H",
  stand: "S",
  double: "D",
  split: "P",
  surrender: "R",
};

const OUTCOME_TEXT: Record<string, string> = {
  WIN: "Win",
  "WIN-BLACKJACK": "Blackjack",
  LOSE: "Loss",
  // HF's word for a bust
  FOLD: "Bust",
  TIE: "Push",
  SURRENDER: "Surrendered",
};

export const ASSISTANT_CSS = `
.hfgs-assist { display: flex; flex-direction: column; gap: 8px; }
.hfgs-assist-head { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.hfgs-assist-who { opacity: 0.75; }
.hfgs-assist-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.hfgs-assist h4 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.7; }
.hfgs-assist dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; }
.hfgs-assist dt { opacity: 0.75; }
.hfgs-assist dd { margin: 0; }
.hfgs-assist-best { font-size: 22px; font-weight: bold; letter-spacing: 0.04em; }
.hfgs-assist-ev { border-collapse: collapse; margin-top: 4px; }
.hfgs-assist-ev td { padding: 1px 10px 1px 0; }
.hfgs-assist-ev td:last-child { text-align: right; padding-right: 0; }
.hfgs-assist-ev tr.hfgs-best td { font-weight: bold; }
.hfgs-assist-chip { display: inline-block; padding: 0 6px; margin: 0 4px 2px 0; border-radius: 3px; border: 1px solid currentColor; font-size: 11px; }
.hfgs-assist-chip.hfgs-off { opacity: 0.35; text-decoration: line-through; }
.hfgs-assist-note { opacity: 0.8; font-size: 11px; }
.hfgs-chart-table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 2px; font-size: 10px; }
.hfgs-chart-table th, .hfgs-chart-table td { padding: 2px 0; text-align: center; overflow: hidden; }
.hfgs-chart-table th.hfgs-rowhead { width: 38px; text-align: right; padding-right: 4px; }
.hfgs-chart-table td { border-radius: 3px; background: rgba(255, 255, 255, 0.06); }
.hfgs-chart-table td.hfgs-a-stand { background: rgba(74, 144, 217, 0.3); }
.hfgs-chart-table td.hfgs-a-double { background: rgba(0, 181, 0, 0.3); }
.hfgs-chart-table td.hfgs-a-split { background: rgba(170, 100, 220, 0.35); }
.hfgs-chart-table td.hfgs-a-surrender { background: rgba(255, 33, 33, 0.3); }
.hfgs-chart-table .hfgs-col { box-shadow: inset 0 0 0 1px rgba(245, 197, 66, 0.45); }
.hfgs-chart-table td.hfgs-here { box-shadow: 0 0 0 2px #f5c542; font-weight: bold; }
.hfgs-chart-table tr.hfgs-row th { color: #f5c542; }
.hfgs-assist-trail .hfgs-pos, .hfgs-assist-trail .hfgs-neg { font-weight: bold; }
`;

const pct = (p: number) => `${Math.round(p * 100)}%`;
const ev = (n: number) => (n > 0 ? `+${n.toFixed(3)}` : n.toFixed(3));
const tone = (n: number) => (n > 0 ? "hfgs-pos" : n < 0 ? "hfgs-neg" : null);

function cellText(cell: ChartCell): string {
  if (!cell.otherwise || cell.best === "split") return LETTERS[cell.best];
  return LETTERS[cell.best] + LETTERS[cell.otherwise].toLowerCase();
}

function cellTitle(cell: ChartCell): string {
  const main = ACTION_LABELS[cell.best];
  return cell.otherwise
    ? `${main}; if HF doesn't offer it, ${ACTION_LABELS[cell.otherwise].toLowerCase()}`
    : main;
}

interface TrailStep {
  handLabel: string;
  action: Action;
  advised: Action;
  by: PlayedBy;
}

export class BlackjackAssistant implements GameAssistant {
  readonly title = "Strategy assistant";
  readonly css = ASSISTANT_CSS;
  readonly element: HTMLDivElement;
  private readonly head = el("div", { class: "hfgs-assist-head" });
  private readonly body = el("div", { class: "hfgs-assist-grid" });
  private readonly chartRow = el("div");
  private readonly trail = el("div", { class: "hfgs-assist-trail" });
  private readonly accuracy = el("div", { class: "hfgs-assist-note" });
  private readonly fullChart: HTMLTableElement;
  private decision: Decision | null = null;
  private steps: TrailStep[] = [];
  private by: PlayedBy = "you";
  private yourDecisions = 0;
  private yourMatches = 0;
  private lastMiss: string | null = null;

  constructor(openGame: BjGameState | null = null) {
    this.fullChart = this.buildChart(CHART_ROWS.map((r) => r.kind));
    this.element = el("div", { class: "hfgs-assist" }, [
      this.head,
      this.body,
      this.chartRow,
      this.trail,
      this.accuracy,
      el("details", null, [
        el("summary", null, "Full strategy chart (first decision)"),
        el(
          "div",
          { class: "hfgs-assist-note" },
          "H hit · S stand · D double · P split · R surrender. A second letter is the play when HF doesn't offer the first (after the first decision, double and surrender aren't offered)."
        ),
        this.fullChart,
      ]),
    ]);
    this.show(analyze(openGame));
    this.renderAccuracy();
  }

  update(action: string, response: unknown, by: PlayedBy): void {
    const state = (response as { data?: BjGameState } | null)?.data;
    if (!state) return;
    this.by = by;
    if (action === "deal") this.steps = [];
    if (DECISIONS.has(action) && this.decision) {
      const advised = this.decision.advice.best;
      const taken = action as Action;
      this.steps.push({
        handLabel: this.decision.handLabel,
        action: taken,
        advised,
        by,
      });
      if (by === "you") {
        this.yourDecisions++;
        if (taken === advised) this.yourMatches++;
        else
          this.lastMiss = `${ACTION_LABELS[taken]} on ${this.decision.handKind.toLowerCase()} vs ${formatCard(this.decision.upcard)}; the table says ${ACTION_LABELS[advised].toLowerCase()} (${ev(this.decision.advice.ev[advised] ?? 0)} vs ${ev(this.decision.advice.ev[taken] ?? 0)} per βyte).`;
        this.renderAccuracy();
      }
    }
    this.show(analyze(state));
  }

  private show(analysis: Analysis): void {
    this.decision = analysis.phase === "playing" ? analysis.decision : null;
    const who = this.by === "bot" ? "The bot is playing" : "You're playing";
    switch (analysis.phase) {
      case "waiting":
        this.head.replaceChildren(
          el("strong", null, "Waiting for a hand"),
          el(
            "span",
            { class: "hfgs-assist-who" },
            "Deal on HF's table or start the bot: the next play shows here."
          )
        );
        this.body.replaceChildren();
        this.chartRow.replaceChildren();
        this.highlight(null);
        break;
      case "ended":
        this.renderEnded(analysis);
        break;
      case "playing":
        this.head.replaceChildren(
          el("strong", null, analysis.decision.handLabel),
          el("span", { class: "hfgs-assist-who" }, who)
        );
        this.renderDecision(analysis.decision);
        break;
    }
    this.renderTrail();
  }

  private renderDecision(d: Decision): void {
    const offered = (Object.keys(ACTION_LABELS) as Action[]).map((action) =>
      el(
        "span",
        {
          class: d.offered[action]
            ? "hfgs-assist-chip"
            : "hfgs-assist-chip hfgs-off",
        },
        ACTION_LABELS[action]
      )
    );
    const inputs = el("div", null, [
      el("h4", null, "Table inputs"),
      el("dl", null, [
        el("dt", null, "Your cards"),
        el("dd", null, [
          el("strong", null, formatCards(d.player)),
          ` · ${d.handKind}`,
        ]),
        el("dt", null, "Dealer shows"),
        el("dd", null, el("strong", null, formatCard(d.upcard))),
        el("dt", null, "Looked up"),
        el("dd", null, d.lookup),
        el("dt", null, "HF offers"),
        el("dd", null, offered),
      ]),
    ]);

    const best = d.advice.best;
    const bestEv = d.advice.ev[best] ?? 0;
    const outputs = el("div", null, [
      el("h4", null, "Table output"),
      el(
        "div",
        { class: "hfgs-assist-best" },
        ACTION_LABELS[best].toUpperCase()
      ),
      el(
        "table",
        { class: "hfgs-assist-ev", title: "Expected return per βyte bet" },
        d.ranked.map(({ action, ev: value }) =>
          el("tr", { class: action === best ? "hfgs-best" : null }, [
            el("td", null, ACTION_LABELS[action]),
            el("td", { class: tone(value) }, ev(value)),
            el(
              "td",
              { class: tone(value) },
              d.bet
                ? `${formatAmount(Math.round(value * d.bet * 100) / 100, true)} βytes`
                : ""
            ),
          ])
        )
      ),
      el("div", { class: "hfgs-assist-note" }, [
        "Expected return per βyte bet, and for this hand's bet",
        d.bet ? ` of ${formatAmount(d.bet)}` : "",
        ". ",
        d.margin !== null && d.ranked.length > 1
          ? `${ACTION_LABELS[best]} beats ${ACTION_LABELS[d.ranked[1].action].toLowerCase()} by ${d.margin.toFixed(3)}.`
          : "",
        d.advice.override
          ? ` Multi-deck correction: ${d.advice.override}.`
          : "",
        bestEv < 0 && best !== "surrender"
          ? " Every option loses on average here; this one loses least."
          : "",
      ]),
    ]);

    const dealer = d.dealer;
    const odds = el("div", null, [
      el("h4", null, "Odds"),
      el("dl", null, [
        el("dt", null, "If you hit"),
        el(
          "dd",
          null,
          d.soft
            ? "can't bust (soft hand)"
            : `${pct(d.bustIfHit)} chance to bust`
        ),
        el("dt", null, `Dealer with ${formatCard(d.upcard)}`),
        el("dd", null, [el("strong", null, `busts ${pct(dealer.bust)}`)]),
        el("dt", null, "Dealer ends on"),
        el(
          "dd",
          null,
          (["17", "18", "19", "20", "21"] as const)
            .map((t) => `${t}: ${pct(dealer[t])}`)
            .join(" · ")
        ),
      ]),
      el(
        "div",
        { class: "hfgs-assist-note" },
        "HF's rules: dealer hits soft 17 and checks for blackjack. Odds assume a shuffled shoe."
      ),
    ]);
    this.body.replaceChildren(inputs, outputs, odds);

    // The hand's row of the chart, with the dealer's column marked
    if (d.row) {
      const row = d.row;
      const table = this.buildChart([row.kind], row.key);
      this.chartRow.replaceChildren(
        el(
          "h4",
          null,
          `Chart row: ${row.kind === "pair" ? "pair" : row.kind} ${row.label}`
        ),
        table
      );
      this.markCell(table, row.kind, row.key, d.column);
    } else {
      this.chartRow.replaceChildren();
    }
    this.highlight(d);
  }

  private renderEnded(a: Extract<Analysis, { phase: "ended" }>): void {
    const net = Math.round((a.payout - a.wagered) * 100) / 100;
    const dealerTotal = handTotal(a.dealer).total;
    this.head.replaceChildren(
      el("strong", null, [
        "Hand over: ",
        el(
          "span",
          { class: tone(net) },
          a.outcomes.map((o) => OUTCOME_TEXT[o] ?? o).join(" / ")
        ),
        ` (${formatAmount(net, true)})`,
      ]),
      el("span", { class: "hfgs-assist-who" }, "Deal again for the next play.")
    );
    this.body.replaceChildren(
      el("dl", null, [
        el("dt", null, a.player.length > 1 ? "Your hands" : "Your hand"),
        el(
          "dd",
          null,
          a.player
            .map((cards) => `${formatCards(cards)} (${handTotal(cards).total})`)
            .join(" | ")
        ),
        el("dt", null, "Dealer"),
        el(
          "dd",
          null,
          `${formatCards(a.dealer)} (${dealerTotal > 21 ? "bust" : dealerTotal})`
        ),
        el("dt", null, "Bet / returned"),
        el(
          "dd",
          null,
          `${formatAmount(a.wagered)} / ${formatAmount(a.payout)}`
        ),
      ])
    );
    this.chartRow.replaceChildren();
    this.highlight(null);
  }

  private renderTrail(): void {
    if (!this.steps.length) {
      this.trail.replaceChildren();
      return;
    }
    this.trail.replaceChildren(
      "This hand: ",
      ...this.steps.flatMap((step, i) => {
        const matched = step.action === step.advised;
        return [
          i ? " → " : "",
          // After a split, say which hand each play was on
          step.handLabel === "Hand"
            ? ""
            : `${step.handLabel.replace(" of 2", "")} `,
          ACTION_LABELS[step.action],
          " ",
          el(
            "span",
            {
              class: matched ? "hfgs-pos" : "hfgs-neg",
              title: matched
                ? "Matches the table"
                : `The table said ${ACTION_LABELS[step.advised].toLowerCase()}`,
            },
            matched
              ? "✓"
              : `✗ (table: ${ACTION_LABELS[step.advised].toLowerCase()})`
          ),
          step.by === "bot" ? " (bot)" : "",
        ];
      })
    );
  }

  private renderAccuracy(): void {
    if (!this.yourDecisions) {
      this.accuracy.textContent =
        "Play with HF's buttons and your decisions are checked against the table here.";
      return;
    }
    this.accuracy.replaceChildren(
      `Your decisions this visit: ${this.yourMatches} of ${this.yourDecisions} matched the table (${pct(this.yourMatches / this.yourDecisions)}).`,
      this.lastMiss ? ` Last miss: ${this.lastMiss}` : ""
    );
  }

  /** A strategy chart with the given kinds of rows (hard, soft, pairs). */
  private buildChart(kinds: ChartKind[], onlyKey?: string): HTMLTableElement {
    const rows = CHART_ROWS.filter(
      (r) =>
        kinds.includes(r.kind) && (onlyKey === undefined || r.key === onlyKey)
    );
    const kindLabel: Record<ChartKind, string> = {
      hard: "Hard",
      soft: "Soft",
      pair: "Pairs",
    };
    const body: HTMLTableRowElement[] = [];
    let lastKind: ChartKind | null = null;
    for (const row of rows) {
      if (onlyKey === undefined && row.kind !== lastKind) {
        body.push(
          el(
            "tr",
            null,
            el(
              "th",
              { colspan: 11, class: "hfgs-rowhead", style: "text-align:left" },
              kindLabel[row.kind]
            )
          )
        );
        lastKind = row.kind;
      }
      body.push(
        el("tr", { "data-row": `${row.kind}:${row.key}` }, [
          el("th", { class: "hfgs-rowhead" }, row.label),
          ...UPCARDS.map((up) => {
            const cell = chartCell(row, up);
            return el(
              "td",
              {
                class: `hfgs-a-${cell.best}`,
                title: cellTitle(cell),
                "data-col": up,
              },
              cellText(cell)
            );
          }),
        ])
      );
    }
    return el("table", { class: "hfgs-chart-table" }, [
      el(
        "thead",
        null,
        el("tr", null, [
          el("th", { class: "hfgs-rowhead" }, "Dealer"),
          ...UPCARDS.map((up) => el("th", { "data-col": up }, up)),
        ])
      ),
      el("tbody", null, body),
    ]);
  }

  private markCell(
    table: HTMLTableElement,
    kind: ChartKind,
    key: string,
    column: string
  ): void {
    table
      .querySelectorAll(".hfgs-here, .hfgs-col, .hfgs-row")
      .forEach((node) =>
        node.classList.remove("hfgs-here", "hfgs-col", "hfgs-row")
      );
    table
      .querySelectorAll(`[data-col="${column}"]`)
      .forEach((node) => node.classList.add("hfgs-col"));
    const row = table.querySelector(`tr[data-row="${kind}:${key}"]`);
    row?.classList.add("hfgs-row");
    row?.querySelector(`td[data-col="${column}"]`)?.classList.add("hfgs-here");
  }

  private highlight(d: Decision | null): void {
    if (d?.row) this.markCell(this.fullChart, d.row.kind, d.row.key, d.column);
    else
      this.fullChart
        .querySelectorAll(".hfgs-here, .hfgs-col, .hfgs-row")
        .forEach((node) =>
          node.classList.remove("hfgs-here", "hfgs-col", "hfgs-row")
        );
  }
}
