#!/usr/bin/env node
/*
 * Compares HFBJStrategy decisions with the published multi-deck basic strategy chart
 * (dealer hits soft 17, no double after split, late surrender).
 * Usage: node scripts/test-strategy.js
 *
 * Chart codes: H hit, S stand, D double (else hit), Ds double (else stand),
 *              R surrender (else hit), Rs surrender (else stand), P split.
 */
const S = require("../js/modules/blackjack/strategy.js");
const UP = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "1"];
const card = (r) => r + "s";

// Two-card hands that produce each total without being a pair.
const HARD = {
    5: ["2", "3"], 6: ["2", "4"], 7: ["2", "5"], 8: ["2", "6"], 9: ["2", "7"], 10: ["2", "8"],
    11: ["2", "9"], 12: ["10", "2"], 13: ["10", "3"], 14: ["10", "4"], 15: ["10", "5"],
    16: ["10", "6"], 17: ["10", "7"], 18: ["10", "8"],
};
const CHART_HARD = {
    5: "H H H H H H H H H H", 6: "H H H H H H H H H H", 7: "H H H H H H H H H H", 8: "H H H H H H H H H H",
    9: "H D D D D H H H H H", 10: "D D D D D D D D H H", 11: "D D D D D D D D D D",
    12: "H H S S S H H H H H", 13: "S S S S S H H H H H", 14: "S S S S S H H H H H",
    15: "S S S S S H H H R R", 16: "S S S S S H H R R R", 17: "S S S S S S S S S Rs",
    18: "S S S S S S S S S S",
};
const CHART_SOFT = { // keyed by the non-ace card
    2: "H H H D D H H H H H", 3: "H H H D D H H H H H", 4: "H H D D D H H H H H",
    5: "H H D D D H H H H H", 6: "H D D D D H H H H H", 7: "Ds Ds Ds Ds Ds S S H H H",
    8: "S S S S Ds S S S S S", 9: "S S S S S S S S S S",
};
const CHART_PAIRS = { // P = split; otherwise the code for the hand's total
    2: "H H P P P P H H H H", 3: "H H P P P P H H H H", 4: "H H H H H H H H H H",
    5: "D D D D D D D D H H", 6: "H P P P P H H H H H", 7: "P P P P P P H H H H",
    8: "P P P P P P P P P Rp", 9: "P P P P P S P P S S", 10: "S S S S S S S S S S",
    1: "P P P P P P P P P P",
};

const EXPECT = { H: "hit", S: "stand", D: "double", Ds: "double", R: "surrender", Rs: "surrender", P: "split", Rp: "surrender" };

let checked = 0;
const diffs = [];
function check(label, cards, codes) {
    codes.split(" ").forEach((code, i) => {
        const adv = S.getAdvice(cards.map(card), [card(UP[i]), "XX"]);
        checked++;
        if (adv.best !== EXPECT[code]) {
            const margin = adv.ev[adv.best] - (adv.ev[EXPECT[code]] ?? NaN);
            diffs.push(`${label} vs ${UP[i] === "1" ? "A" : UP[i]}: chart ${EXPECT[code]}, table ${adv.best} (EV margin ${margin.toFixed(4)})`);
        }
    });
}

for (const t in CHART_HARD) check("hard " + t, HARD[t], CHART_HARD[t]);
for (const x in CHART_SOFT) check("soft A," + x, ["1", x], CHART_SOFT[x]);
for (const p in CHART_PAIRS) check("pair " + (p === "1" ? "A" : p) + "s", [p, p], CHART_PAIRS[p]);

// Multi-card hands: double/surrender must not be offered after the first two cards.
const three = S.getAdvice(["2s", "3h", "6d"], ["5c", "XX"]);
if ("double" in three.ev || "surrender" in three.ev) diffs.push("3-card hand offered double/surrender");
const bust = S.getAdvice(["10s", "9h", "5d"], ["5c", "XX"]);
if (bust !== null) diffs.push("bust hand returned advice");

console.log(`${checked} chart cells checked, ${diffs.length} differences`);
diffs.forEach((d) => console.log("  " + d));
process.exitCode = diffs.length ? 1 : 0;
