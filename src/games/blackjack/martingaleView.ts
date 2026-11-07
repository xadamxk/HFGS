/**
 * The blackjack panel's Martingale section: the set in progress and how the
 * sets of the latest bot run ended. It starts over with each run. Shown only
 * while martingale betting is on.
 */

import { el } from "../../core/Dom";
import { HistoryEntry } from "../../core/history";
import { formatAmount } from "../../core/ui/format";
import { SettingValues } from "../../settings/definitions";
import { HistoryView, HistoryViewContext } from "../engine";
import { BlackjackSettings } from "./definition";
import { betCap, lossesToReset, nextBet, NO_SURRENDER_WITHIN } from "./engine";
import {
  latestRun,
  MartingaleRun,
  MartingaleSet,
  RESULT_LABELS,
  summarizeSets,
} from "./martingale";

const SHOWN = 20;

const time = (at: number) =>
  new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const plural = (n: number, word: string, many = word + "s") =>
  `${n} ${n === 1 ? word : many}`;

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

export class MartingaleView implements HistoryView {
  readonly title = "Martingale";
  readonly css = MARTINGALE_CSS;
  readonly element = el("div", { class: "hfgs-mg" });

  visible(gameSettings: SettingValues): boolean {
    return gameSettings.martingale === true;
  }

  render(entries: HistoryEntry[], context: HistoryViewContext): void {
    const settings = context.gameSettings as unknown as BlackjackSettings;
    const running = context.sessionStartedAt !== null;
    const run = latestRun(entries, context.sessionStartedAt);
    const sets = run?.sets ?? [];
    const open = sets.find((s) => s.result === "open") ?? null;
    this.element.replaceChildren(
      this.current(open, settings, running),
      this.summary(run, running),
      sets.length ? this.table(sets.slice(0, SHOWN)) : "",
      this.whyAbandoned(sets[0]),
      el(
        "div",
        { class: "hfgs-mg-note" },
        "Results start over each time you start the bot. A set runs from your base bet to the win that ends the progression (pushes keep it going), or resets once winning it back would take a bet over the cap. Hands you play yourself aren't part of a set."
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
    const bet = nextBet(settings, open.last.bet, open.lastNet, -open.net);
    const toReset = lossesToReset(settings, bet, -open.net);
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
      toReset === 1
        ? ` (cap ${formatAmount(betCap(settings))}: if this loses, the set resets).`
        : ` (cap ${formatAmount(betCap(settings))}: the set resets after ${toReset} more losses in a row).`,
      toReset <= NO_SURRENDER_WITHIN
        ? " This close to a reset, the bot plays hands out instead of surrendering."
        : "",
    ]);
  }

  /** The run ended on a set that hadn't won yet: say why it's abandoned. */
  private whyAbandoned(last: MartingaleSet | undefined): HTMLElement | string {
    if (last?.result !== "abandoned") return "";
    return el(
      "div",
      { class: "hfgs-mg-note" },
      `The last set is abandoned because the run stopped (you pressed Stop, a stop-loss or take-profit was hit, or an error) after ${plural(last.hands, "hand")} of it, before the win that ends a set. It finished ${formatAmount(last.net, true)} βytes. The next run starts a new set at your base bet.`
    );
  }

  private summary(run: MartingaleRun | null, running: boolean): HTMLElement {
    if (!run)
      return el(
        "div",
        { class: "hfgs-mg-note" },
        running
          ? "No martingale sets in this run yet."
          : "No martingale runs yet."
      );
    const s = summarizeSets(run.sets);
    return el("div", null, [
      el(
        "strong",
        null,
        `${running ? "This run" : "Last run"} (started ${time(run.startedAt)}, ${plural(run.hands, "hand")}): `
      ),
      `${s.sets} set${s.sets === 1 ? "" : "s"}: `,
      el("strong", null, `${s.recovered} recovered`),
      ` (${pct(s.recovered, s.finished)} of finished)`,
      s.reset ? `, ${s.reset} reset at cap` : "",
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
            el("td", null, time(set.startedAt)),
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
