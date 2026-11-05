/**
 * The blackjack panel's Martingale section: the set in progress and how past
 * sets ended. Shown only while martingale betting is on.
 */

import { el } from "../../core/Dom";
import { HistoryEntry } from "../../core/history";
import { formatAmount } from "../../core/ui/format";
import { SettingValues } from "../../settings/definitions";
import { HistoryView, HistoryViewContext } from "../engine";
import { BLACKJACK_MAX_BET, BlackjackSettings } from "./definition";
import { nextBet } from "./engine";
import {
  martingaleSets,
  MartingaleSet,
  RESULT_LABELS,
  summarizeSets,
} from "./martingale";

const SHOWN = 10;

export const MARTINGALE_CSS = `
.hfgs-mg { display: flex; flex-direction: column; gap: 6px; }
.hfgs-mg-table { width: 100%; border-collapse: collapse; }
.hfgs-mg-table th, .hfgs-mg-table td { padding: 2px 8px; text-align: right; }
.hfgs-mg-table th:first-child, .hfgs-mg-table td:first-child,
.hfgs-mg-table th:last-child, .hfgs-mg-table td:last-child { text-align: left; }
.hfgs-mg-note { font-size: 11px; opacity: 0.75; }
.hfgs-mg-cap { font-size: 10px; padding: 0 4px; margin-left: 4px; border: 1px solid currentColor; border-radius: 3px; opacity: 0.8; }
`;

const tone = (n: number) => (n > 0 ? "hfgs-pos" : n < 0 ? "hfgs-neg" : null);
const pct = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 100)}%` : "–";

/** How many more losses until the bet reaches the cap. */
function lossesToCap(bet: number, settings: BlackjackSettings): number {
  const cap = Math.min(settings.maxBet, BLACKJACK_MAX_BET);
  let losses = 0;
  for (let next = bet; next < cap && losses < 50; losses++) {
    const raised = nextBet(settings, next, -next);
    if (raised <= next) break;
    next = raised;
  }
  return losses;
}

export class MartingaleView implements HistoryView {
  readonly title = "Martingale";
  readonly css = MARTINGALE_CSS;
  readonly element = el("div", { class: "hfgs-mg" });

  visible(gameSettings: SettingValues): boolean {
    return gameSettings.martingale === true;
  }

  render(entries: HistoryEntry[], context: HistoryViewContext): void {
    const settings = context.gameSettings as unknown as BlackjackSettings;
    const sets = martingaleSets(entries, context.sessionStartedAt);
    const open = sets.find((s) => s.result === "open") ?? null;
    this.element.replaceChildren(
      this.current(open, settings, context.sessionStartedAt !== null),
      this.summary(sets),
      sets.length ? this.table(sets.slice(0, SHOWN)) : "",
      el(
        "div",
        { class: "hfgs-mg-note" },
        "A set runs from your base bet to the win that ends the progression (pushes keep it going), across the latest 500 results. When the bot stops before that win, the set is abandoned: the next start begins a new set at your base bet. Hands you play yourself aren't part of a set."
      )
    );
  }

  private current(
    open: MartingaleSet | null,
    settings: BlackjackSettings,
    running: boolean
  ): HTMLElement {
    if (!open) {
      return el(
        "div",
        null,
        running
          ? `Next hand starts a new set at ${formatAmount(settings.baseBet)} βytes.`
          : `Start the bot to begin a set at ${formatAmount(settings.baseBet)} βytes.`
      );
    }
    const bet = nextBet(settings, open.last.bet, open.lastNet);
    const toCap = lossesToCap(bet, settings);
    return el("div", null, [
      el("strong", null, "Set in progress: "),
      `step ${open.last.step + 1} next, `,
      el(
        "span",
        { class: tone(open.net) },
        `${formatAmount(open.net, true)} βytes`
      ),
      ` so far over ${open.hands} hand${open.hands === 1 ? "" : "s"}. Next bet `,
      el("strong", null, formatAmount(bet)),
      toCap > 0
        ? ` (cap ${formatAmount(Math.min(settings.maxBet, BLACKJACK_MAX_BET))}: ${toCap} more loss${toCap === 1 ? "" : "es"} to reach it).`
        : " (at the cap: a win here may not cover the set's losses).",
    ]);
  }

  private summary(sets: MartingaleSet[]): HTMLElement {
    if (!sets.length)
      return el("div", { class: "hfgs-mg-note" }, "No martingale sets yet.");
    const s = summarizeSets(sets);
    return el("div", null, [
      `${s.sets} set${s.sets === 1 ? "" : "s"}: `,
      el("strong", null, `${s.recovered} recovered`),
      ` (${pct(s.recovered, s.finished)} of finished)`,
      s.short ? `, ${s.short} won short` : "",
      `, ${s.abandoned} abandoned · average ${s.averageHands} hands · longest ${s.longest} · worst `,
      el("span", { class: tone(s.worstNet) }, formatAmount(s.worstNet, true)),
      " · net ",
      el("strong", { class: tone(s.net) }, formatAmount(s.net, true)),
    ]);
  }

  private table(sets: MartingaleSet[]): HTMLElement {
    return el("table", { class: "hfgs-mg-table" }, [
      el(
        "thead",
        null,
        el(
          "tr",
          null,
          ["Started", "Hands", "Peak bet", "Wagered", "Net", "Result"].map(
            (h) => el("th", null, h)
          )
        )
      ),
      el(
        "tbody",
        null,
        sets.map((set) =>
          el("tr", null, [
            el(
              "td",
              null,
              new Date(set.startedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            ),
            el("td", null, String(set.hands)),
            el("td", null, [
              formatAmount(set.peakBet),
              set.hitCap
                ? el(
                    "span",
                    { class: "hfgs-mg-cap", title: "Reached the bet cap" },
                    "cap"
                  )
                : "",
            ]),
            el("td", null, formatAmount(set.wagered)),
            el("td", { class: tone(set.net) }, formatAmount(set.net, true)),
            el(
              "td",
              {
                class:
                  set.result === "recovered"
                    ? "hfgs-pos"
                    : set.result === "open"
                      ? null
                      : "hfgs-neg",
              },
              RESULT_LABELS[set.result]
            ),
          ])
        )
      ),
    ]);
  }
}
