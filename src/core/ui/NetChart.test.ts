import { toEntry } from "../history";
import { chartPoints, NetChart } from "./NetChart";

const entry = (net: number, at: number) =>
  toEntry(
    {
      outcome: net > 0 ? "WIN" : "LOSS",
      wagered: 2,
      returned: 2 + net,
      balance: 100 + at,
    },
    at
  );

describe("NetChart", () => {
  it("runs the net oldest to newest over the latest results", () => {
    // History is stored newest first
    const entries = [entry(3, 4), entry(-2, 3), entry(-2, 2), entry(5, 1)];
    expect(chartPoints(entries, 3).map((p) => p.total)).toEqual([-2, -4, -1]);
    expect(chartPoints(entries, 10).map((p) => p.entry.at)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("waits for two results, then draws the line and names the running net", () => {
    const chart = new NetChart();
    chart.setEntries([entry(3, 1)]);
    expect(chart.element.textContent).toContain("starts after 2 results");
    expect(chart.element.querySelector("path")).toBeNull();

    chart.setEntries([entry(3, 2), entry(-1, 1)]);
    expect(chart.element.textContent).toContain(
      "Net βytes over the last 2 results: +2"
    );
    const d = chart.element.querySelector("path")!.getAttribute("d")!;
    expect(d.split("L")).toHaveLength(2);
    expect(chart.element.querySelector(".hfgs-pos")).not.toBeNull();
  });
});
