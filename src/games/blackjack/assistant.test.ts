import fs from "fs";
import path from "path";
import { analyze, offeredActions } from "./analysis";
import { BlackjackAssistant } from "./assistant";
import { BjGameState, BjResponse } from "./engine";
import {
  bustChanceIfHit,
  CHART_ROWS,
  chartCell,
  chartRowFor,
  dealerOdds,
  UPCARDS,
} from "./strategy";

const FIXTURES = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "fixtures",
  "responses"
);
const fixture = (name: string): BjResponse =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8")).response;

function state(
  hand1: string[],
  dealer: string[],
  extra: Partial<BjGameState> = {}
): BjResponse {
  return {
    success: true,
    balance: 1000,
    data: {
      game_id: "g",
      action_id: "1",
      bet: "4.000000",
      is_split: "0",
      turn: "hand1",
      outcome1: null,
      outcome2: null,
      ended: "0",
      payout: null,
      hand1: { action: "START", hand_cards: hand1 },
      dealer: { action: "", hand_cards: dealer },
      ...extra,
    },
  };
}

const row = (kind: string, key: string) =>
  CHART_ROWS.find((r) => r.kind === kind && r.key === key)!;

describe("strategy chart and odds", () => {
  it("reads chart cells from the table, with the fallback play", () => {
    expect(chartCell(row("hard", "16"), "10")).toEqual({
      best: "surrender",
      otherwise: "hit",
    });
    expect(chartCell(row("hard", "11"), "6")).toEqual({
      best: "double",
      otherwise: "hit",
    });
    expect(chartCell(row("hard", "12"), "4").best).toBe("stand");
    expect(chartCell(row("soft", "18"), "9").best).toBe("hit");
    expect(chartCell(row("pair", "8"), "6").best).toBe("split");
    expect(chartCell(row("pair", "10"), "6").best).toBe("stand");
  });

  it("has a full chart: 10 hard, 8 soft and 10 pair rows", () => {
    expect(CHART_ROWS.filter((r) => r.kind === "hard")).toHaveLength(10);
    expect(CHART_ROWS.filter((r) => r.kind === "soft")).toHaveLength(8);
    expect(CHART_ROWS.filter((r) => r.kind === "pair")).toHaveLength(10);
    for (const r of CHART_ROWS)
      for (const up of UPCARDS) expect(chartCell(r, up).best).toBeTruthy();
  });

  it("picks a hand's chart row: pairs only while split is offered", () => {
    expect(chartRowFor(["8s", "8h"])?.label).toBe("8,8");
    expect(chartRowFor(["8s", "8h"], false)?.label).toBe("16");
    expect(chartRowFor(["1s", "6h"])?.label).toBe("A,6");
    expect(chartRowFor(["2s", "3h"])?.label).toBe("5–8");
    expect(chartRowFor(["10s", "9h"])?.label).toBe("17+");
    expect(chartRowFor(["10s", "9h", "5c"])).toBeNull();
  });

  it("gives the dealer's final odds for each upcard and the bust chance on a hit", () => {
    for (const up of ["2s", "6s", "10s", "1s"]) {
      const odds = dealerOdds(up);
      const sum = Object.values(odds).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 3);
    }
    expect(dealerOdds("6h").bust).toBeGreaterThan(dealerOdds("10h").bust);
    expect(bustChanceIfHit(["10s", "6h"])).toBeCloseTo(8 / 13);
    expect(bustChanceIfHit(["10s", "2h"])).toBeCloseTo(4 / 13);
    expect(bustChanceIfHit(["10s", "1h"])).toBe(0);
    expect(bustChanceIfHit(["5s", "6h"])).toBe(0);
  });
});

describe("analyze", () => {
  it("reads the captured A,A vs 4 deal: a pair, everything offered, split", () => {
    const analysis = analyze(fixture("013-deal.json").data);
    expect(analysis.phase).toBe("playing");
    if (analysis.phase !== "playing") return;
    const d = analysis.decision;
    expect(d).toMatchObject({
      handLabel: "Hand",
      handKind: "Pair of Aces (soft 12)",
      lookup: "soft 12 and pair A × dealer 4",
      column: "4",
      offered: {
        hit: true,
        stand: true,
        double: true,
        split: true,
        surrender: true,
      },
      bet: 2,
    });
    expect(d.advice.best).toBe("split");
    expect(d.ranked[0].action).toBe("split");
    expect(d.ranked).toHaveLength(5);
    expect(d.margin).toBeGreaterThan(0);
  });

  it("only offers hit and stand after the first decision, and says which split hand", () => {
    const analysis = analyze(fixture("015-hit.json").data);
    if (analysis.phase !== "playing") throw new Error(analysis.phase);
    expect(analysis.decision.handLabel).toMatch(/^Hand [12] of 2$/);
    expect(analysis.decision.offered).toEqual({
      hit: true,
      stand: true,
      double: false,
      split: false,
      surrender: false,
    });
    expect(Object.keys(analysis.decision.advice.ev).sort()).toEqual([
      "hit",
      "stand",
    ]);
  });

  it("summarizes an ended hand and waits without one", () => {
    const ended = analyze(fixture("019-double.json").data);
    expect(ended).toMatchObject({
      phase: "ended",
      wagered: 4,
      payout: 8,
      outcomes: ["WIN"],
    });
    expect(analyze(null)).toEqual({ phase: "waiting" });
  });

  it("matches what HF's page offers", () => {
    expect(offeredActions(state(["8s", "8h"], ["6c", "XX"]).data).split).toBe(
      true
    );
    expect(offeredActions(state(["8s", "9h"], ["6c", "XX"]).data).split).toBe(
      false
    );
    const after = state(["8s", "3h", "2c"], ["6c", "XX"], {
      hand1: { action: "HIT", hand_cards: ["8s", "3h", "2c"] },
    }).data;
    expect(offeredActions(after)).toMatchObject({
      double: false,
      surrender: false,
    });
  });
});

describe("BlackjackAssistant", () => {
  const text = (a: BlackjackAssistant) => a.element.textContent ?? "";

  it("waits for a hand, then shows the table's inputs and output", () => {
    const assistant = new BlackjackAssistant();
    expect(text(assistant)).toContain("Waiting for a hand");

    assistant.update("deal", state(["10s", "6h"], ["10c", "XX"]), "you");
    expect(text(assistant)).toContain("You're playing");
    expect(text(assistant)).toContain("10♠ 6♥ · Hard 16");
    expect(text(assistant)).toContain("hard 16 × dealer 10");
    expect(
      assistant.element.querySelector(".hfgs-assist-best")!.textContent
    ).toBe("SURRENDER");
    expect(text(assistant)).toContain("62% chance to bust");
    expect(text(assistant)).toContain("Chart row: hard 16");
    // The hand's cell is marked in the row and the full chart
    const marked = assistant.element.querySelectorAll("td.hfgs-here");
    expect([...marked].map((td) => td.textContent)).toEqual(["Rh", "Rh"]);
  });

  it("checks your decisions against the table and keeps a trail of the hand", () => {
    const assistant = new BlackjackAssistant();
    assistant.update("deal", state(["10s", "6h"], ["10c", "XX"]), "you");
    assistant.update(
      "stand",
      state(["10s", "6h"], ["10c", "8h"], {
        turn: "ended",
        ended: "1",
        outcome1: "LOSE",
        payout: "0",
      }),
      "you"
    );
    expect(text(assistant)).toContain("Hand over: Loss (-4)");
    expect(text(assistant)).toContain("This hand: Stand ✗ (table: surrender)");
    expect(text(assistant)).toContain("0 of 1 matched the table");
    expect(text(assistant)).toContain("Last miss: Stand on hard 16 vs 10♣");

    assistant.update(
      "deal",
      state(["10s", "1h", "2c"].slice(0, 2), ["6c", "XX"]),
      "bot"
    );
    expect(text(assistant)).not.toContain("This hand:");
    expect(text(assistant)).toContain("The bot is playing");
  });

  it("starts from a hand already in progress on the page", () => {
    const assistant = new BlackjackAssistant(
      state(["5s", "6h"], ["6c", "XX"]).data
    );
    expect(
      assistant.element.querySelector(".hfgs-assist-best")!.textContent
    ).toBe("DOUBLE");
  });
});

describe("BlackjackAssistant trail after a split", () => {
  it("names the hand for plays after the split", () => {
    const assistant = new BlackjackAssistant();
    assistant.update("deal", fixture("013-deal.json"), "you");
    assistant.update("split", fixture("014-split.json"), "you");
    assistant.update("hit", fixture("015-hit.json"), "you");
    expect(assistant.element.textContent).toContain(
      "This hand: Split ✓ → Hand 2 Hit ✓"
    );
  });
});
