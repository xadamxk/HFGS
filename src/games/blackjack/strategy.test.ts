/**
 * Checks the strategy against the published multi-deck basic strategy chart
 * (dealer hits soft 17, no double after split, late surrender). Moved here from
 * scripts/test-strategy.js.
 *
 * Chart codes: H hit, S stand, D double (else hit), Ds double (else stand),
 * R surrender (else hit), Rs surrender (else stand), P split, Rp surrender (else split).
 */
import { Action, getAdvice, handTotal } from "./strategy";

const ALL = { double: true, split: true, surrender: true };
const UP = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "1"];
const card = (rank: string) => `${rank}s`;

const HARD: Record<number, [string, string]> = {
  5: ["2", "3"],
  6: ["2", "4"],
  7: ["2", "5"],
  8: ["2", "6"],
  9: ["2", "7"],
  10: ["2", "8"],
  11: ["2", "9"],
  12: ["10", "2"],
  13: ["10", "3"],
  14: ["10", "4"],
  15: ["10", "5"],
  16: ["10", "6"],
  17: ["10", "7"],
  18: ["10", "8"],
};
const CHART_HARD: Record<number, string> = {
  5: "H H H H H H H H H H",
  6: "H H H H H H H H H H",
  7: "H H H H H H H H H H",
  8: "H H H H H H H H H H",
  9: "H D D D D H H H H H",
  10: "D D D D D D D D H H",
  11: "D D D D D D D D D D",
  12: "H H S S S H H H H H",
  13: "S S S S S H H H H H",
  14: "S S S S S H H H H H",
  15: "S S S S S H H H R R",
  16: "S S S S S H H R R R",
  17: "S S S S S S S S S Rs",
  18: "S S S S S S S S S S",
};
const CHART_SOFT: Record<string, string> = {
  2: "H H H D D H H H H H",
  3: "H H H D D H H H H H",
  4: "H H D D D H H H H H",
  5: "H H D D D H H H H H",
  6: "H D D D D H H H H H",
  7: "Ds Ds Ds Ds Ds S S H H H",
  8: "S S S S Ds S S S S S",
  9: "S S S S S S S S S S",
};
const CHART_PAIRS: Record<string, string> = {
  2: "H H P P P P H H H H",
  3: "H H P P P P H H H H",
  4: "H H H H H H H H H H",
  5: "D D D D D D D D H H",
  6: "H P P P P H H H H H",
  7: "P P P P P P H H H H",
  8: "P P P P P P P P P Rp",
  9: "P P P P P S P P S S",
  10: "S S S S S S S S S S",
  1: "P P P P P P P P P P",
};
const EXPECT: Record<string, Action> = {
  H: "hit",
  S: "stand",
  D: "double",
  Ds: "double",
  R: "surrender",
  Rs: "surrender",
  P: "split",
  Rp: "surrender",
};

function cells(label: string, ranks: string[], codes: string) {
  return codes.split(" ").map((code, i) => ({
    label: `${label} vs ${UP[i] === "1" ? "A" : UP[i]}`,
    player: ranks.map(card),
    dealer: [card(UP[i]), "XX"],
    expected: EXPECT[code],
  }));
}

const CHART = [
  ...Object.entries(CHART_HARD).flatMap(([t, codes]) =>
    cells(`hard ${t}`, HARD[Number(t)], codes)
  ),
  ...Object.entries(CHART_SOFT).flatMap(([x, codes]) =>
    cells(`soft A,${x}`, ["1", x], codes)
  ),
  ...Object.entries(CHART_PAIRS).flatMap(([p, codes]) =>
    cells(`pair ${p}s`, [p, p], codes)
  ),
];

describe("basic strategy", () => {
  it("covers all 320 chart cells", () => expect(CHART).toHaveLength(320));

  it.each(CHART)("$label: $expected", ({ player, dealer, expected }) => {
    expect(getAdvice(player, dealer, ALL)?.best).toBe(expected);
  });

  it("falls back when HF doesn't offer an action", () => {
    const none = { double: false, split: false, surrender: false };
    // 11 vs 6 doubles, else hits
    expect(getAdvice(["5c", "6d"], ["6h", "XX"], none)?.best).toBe("hit");
    // 8,8 vs 10 with no split or surrender plays as hard 16: hit
    expect(getAdvice(["8c", "8d"], ["10h", "XX"], none)?.best).toBe("hit");
    // A,7 vs 3 doubles, else stands
    expect(getAdvice(["1c", "7d"], ["3h", "XX"], none)?.best).toBe("stand");
  });

  it("never offers double or surrender after the first two cards", () => {
    const advice = getAdvice(["2s", "3h", "6d"], ["5c", "XX"], ALL);
    expect(advice?.ev).not.toHaveProperty("double");
    expect(advice?.ev).not.toHaveProperty("surrender");
    expect(advice?.best).toBe("hit");
  });

  it("treats face cards as ten and splits them by value", () => {
    const advice = getAdvice(["12s", "13h"], ["6c", "XX"], ALL);
    expect(advice?.ev).toHaveProperty("split");
    expect(advice?.best).toBe("stand");
  });

  it("returns null for a bust or a missing card", () => {
    expect(getAdvice(["10s", "9h", "5d"], ["5c", "XX"], ALL)).toBeNull();
    expect(getAdvice(["10s"], ["5c", "XX"], ALL)).toBeNull();
    expect(getAdvice(["10s", "5d"], ["XX"], ALL)).toBeNull();
  });

  it("counts soft and hard totals", () => {
    expect(handTotal(["1s", "6d"])).toEqual({ total: 17, soft: true });
    expect(handTotal(["1s", "6d", "10c"])).toEqual({ total: 17, soft: false });
    expect(handTotal(["1s", "1d"])).toEqual({ total: 12, soft: true });
  });
});
