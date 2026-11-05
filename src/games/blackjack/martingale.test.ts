import { HistoryEntry, toEntry } from "../../core/history";
import { defaultSettings } from "../../settings";
import { martingaleSets, summarizeSets } from "./martingale";
import { MartingaleView } from "./martingaleView";

let clock = 1000;
/** A bot hand in set `set` at `step` (bet doubling from 2), newest-first lists built below. */
function hand(set: string, step: number, net: number, cap = 100): HistoryEntry {
  const bet = Math.min(2 * 2 ** (step - 1), cap);
  return toEntry(
    {
      outcome: net > 0 ? "WIN" : net < 0 ? "LOSE" : "TIE",
      wagered: bet,
      returned: bet + net,
      details: { martingale: { set, step, bet, cap } },
    },
    clock++
  );
}
const manual = () =>
  toEntry({ outcome: "WIN", wagered: 2, returned: 4 }, clock++);
const newestFirst = (...entries: HistoryEntry[]) => entries.reverse();

describe("martingaleSets", () => {
  it("groups hands into sets and labels how each ended", () => {
    const entries = newestFirst(
      // recovered: lose 2, lose 4, win 8
      hand("a", 1, -2),
      hand("a", 2, -4),
      hand("a", 3, 8),
      manual(),
      // capped at 4: lose 2, lose 4, lose 4, win 4 → short
      hand("b", 1, -2, 4),
      hand("b", 2, -4, 4),
      hand("b", 3, -4, 4),
      hand("b", 4, 4, 4),
      // stopped after two losses → abandoned
      hand("c", 1, -2),
      hand("c", 2, -4)
    );
    const sets = martingaleSets(entries);
    expect(sets.map((s) => [s.id, s.result, s.hands, s.net])).toEqual([
      ["c", "abandoned", 2, -6],
      ["b", "short", 4, -6],
      ["a", "recovered", 3, 2],
    ]);
    expect(sets[1]).toMatchObject({ hitCap: true, peakBet: 4, steps: 4 });
    expect(sets[2]).toMatchObject({ hitCap: false, peakBet: 8, wagered: 14 });

    expect(summarizeSets(sets)).toEqual({
      sets: 3,
      finished: 3,
      recovered: 1,
      short: 1,
      abandoned: 1,
      averageHands: 3,
      longest: 4,
      worstNet: -6,
      net: -10,
    });
  });

  it("calls an unfinished set in progress only while its session is running", () => {
    const start = clock;
    const entries = newestFirst(hand("d", 1, -2), hand("d", 2, 0));
    expect(martingaleSets(entries, start)[0].result).toBe("open");
    expect(martingaleSets(entries, clock + 10)[0].result).toBe("abandoned");
    expect(martingaleSets(entries, null)[0].result).toBe("abandoned");
    expect(summarizeSets(martingaleSets(entries, start)).finished).toBe(0);
  });
});

describe("MartingaleView", () => {
  const settings = () => ({
    ...defaultSettings().games.blackjack,
    martingale: true,
    baseBet: 2,
    maxBet: 16,
    martingaleMultiplier: 2,
  });

  it("shows the set in progress with the next bet and the distance to the cap", () => {
    const view = new MartingaleView();
    const start = clock;
    view.render(newestFirst(hand("e", 1, -2), hand("e", 2, -4)), {
      sessionStartedAt: start,
      gameSettings: settings(),
    });
    const text = view.element.textContent!;
    expect(text).toContain(
      "Set in progress: step 3 next, -6 βytes so far over 2 hands. Next bet 8"
    );
    expect(text).toContain("cap 16: 1 more loss to reach it");
    expect(text).toContain("In progress");
  });

  it("summarizes past sets and says how the next set starts", () => {
    const view = new MartingaleView();
    view.render(
      newestFirst(hand("f", 1, -2), hand("f", 2, 4), hand("g", 1, -2)),
      {
        sessionStartedAt: null,
        gameSettings: settings(),
      }
    );
    const text = view.element.textContent!;
    expect(text).toContain("Start the bot to begin a set at 2 βytes.");
    expect(text).toContain(
      "2 sets: 1 recovered (50% of finished), 1 abandoned"
    );
    expect(view.element.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(text).toContain("Abandoned");
    expect(text).toContain("Recovered");
  });

  it("is only shown with martingale on", () => {
    const view = new MartingaleView();
    expect(view.visible({ martingale: true })).toBe(true);
    expect(view.visible({ martingale: false })).toBe(false);
  });
});
