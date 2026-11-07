/**
 * A small line chart of running net βytes over the latest results, for the
 * game panel. One series, so no legend: the caption names it. Hovering shows
 * the result under the pointer (the results table beside it is the text view).
 */

import { el } from "../Dom";
import { HistoryEntry } from "../history";
import { formatAmount } from "./format";

const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 600;
const HEIGHT = 120;
const PAD_Y = 8;

export interface ChartPoint {
  entry: HistoryEntry;
  /** Running net after this result, counted from the first result shown. */
  total: number;
}

/** Oldest-first running totals for the newest `limit` entries (given newest first). */
export function chartPoints(
  entries: HistoryEntry[],
  limit: number
): ChartPoint[] {
  let total = 0;
  return entries
    .slice(0, limit)
    .reverse()
    .map((entry) => {
      total = Math.round((total + entry.net) * 100) / 100;
      return { entry, total };
    });
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs))
    node.setAttribute(name, String(value));
  return node;
}

export class NetChart {
  readonly element: HTMLDivElement;
  private readonly caption: HTMLDivElement;
  private readonly plot: SVGSVGElement;
  private readonly tooltip: HTMLDivElement;
  private points: ChartPoint[] = [];

  constructor(private readonly limit = 100) {
    this.caption = el("div", { class: "hfgs-chart-caption" });
    this.plot = svg("svg", {
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      preserveAspectRatio: "none",
      class: "hfgs-chart-plot",
      role: "img",
    });
    this.tooltip = el("div", { class: "hfgs-chart-tooltip", hidden: true });
    this.element = el("div", { class: "hfgs-chart" }, [
      this.caption,
      el("div", { class: "hfgs-chart-area" }, [this.plot, this.tooltip]),
    ]);
    this.plot.addEventListener("pointermove", (event) => this.hover(event));
    this.plot.addEventListener("pointerleave", () => this.clearHover());
  }

  setEntries(entries: HistoryEntry[]): void {
    this.points = chartPoints(entries, this.limit);
    this.render();
  }

  private scale() {
    const totals = this.points.map((p) => p.total);
    const low = Math.min(0, ...totals);
    const high = Math.max(0, ...totals);
    const span = high - low || 1;
    const steps = Math.max(this.points.length - 1, 1);
    return {
      x: (i: number) => (i / steps) * WIDTH,
      y: (v: number) => PAD_Y + ((high - v) / span) * (HEIGHT - PAD_Y * 2),
    };
  }

  private render(): void {
    this.clearHover();
    const count = this.points.length;
    if (count < 2) {
      this.caption.textContent = "Net βytes: the chart starts after 2 results.";
      this.plot.replaceChildren();
      this.plot.setAttribute("aria-label", "No chart yet");
      return;
    }
    const last = this.points[count - 1].total;
    this.caption.replaceChildren(
      `Net βytes over the last ${count} results: `,
      el(
        "strong",
        { class: last > 0 ? "hfgs-pos" : last < 0 ? "hfgs-neg" : null },
        formatAmount(last, true)
      )
    );
    this.plot.setAttribute(
      "aria-label",
      `Running net over the last ${count} results, ending at ${formatAmount(last, true)}`
    );

    const { x, y } = this.scale();
    const line = this.points
      .map(
        (p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`
      )
      .join(" ");
    this.plot.replaceChildren(
      svg("line", {
        x1: 0,
        x2: WIDTH,
        y1: y(0),
        y2: y(0),
        class: "hfgs-chart-zero",
        "vector-effect": "non-scaling-stroke",
      }),
      svg("path", {
        d: line,
        class: "hfgs-chart-line",
        "vector-effect": "non-scaling-stroke",
      }),
      svg("line", {
        x1: 0,
        x2: 0,
        y1: 0,
        y2: HEIGHT,
        class: "hfgs-chart-cursor",
        visibility: "hidden",
        "vector-effect": "non-scaling-stroke",
      })
    );
  }

  private hover(event: PointerEvent): void {
    const count = this.points.length;
    if (count < 2) return;
    const rect = this.plot.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(
      Math.max((event.clientX - rect.left) / rect.width, 0),
      1
    );
    const index = Math.round(ratio * (count - 1));
    const point = this.points[index];
    const { x } = this.scale();

    const cursor = this.plot.querySelector(".hfgs-chart-cursor");
    cursor?.setAttribute("x1", String(x(index)));
    cursor?.setAttribute("x2", String(x(index)));
    cursor?.setAttribute("visibility", "visible");

    const time = new Date(point.entry.at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const lines: HTMLElement[] = [
      el("div", null, `${time} · ${point.entry.outcome}`),
      el("div", null, [
        "Result ",
        el("strong", null, formatAmount(point.entry.net, true)),
      ]),
      el("div", null, [
        "Running net ",
        el("strong", null, formatAmount(point.total, true)),
      ]),
    ];
    if (typeof point.entry.balance === "number")
      lines.push(
        el("div", null, `Balance ${formatAmount(point.entry.balance)}`)
      );
    this.tooltip.replaceChildren(...lines);
    this.tooltip.hidden = false;
    const left = (index / (count - 1)) * rect.width;
    // Keep the tooltip inside the chart: flip it to the left of the cursor past the middle.
    this.tooltip.style.left = left > rect.width / 2 ? "" : `${left + 10}px`;
    this.tooltip.style.right =
      left > rect.width / 2 ? `${rect.width - left + 10}px` : "";
  }

  private clearHover(): void {
    this.tooltip.hidden = true;
    this.plot
      .querySelector(".hfgs-chart-cursor")
      ?.setAttribute("visibility", "hidden");
  }
}
