#!/usr/bin/env node
/*
 * Generates src/games/blackjack/strategyTable.json: expected values (EV) for every
 * blackjack decision under HF's table rules, so the bot never needs a remote advisor.
 *
 * Model: infinite deck (each rank drawn with fixed probability). This is the standard
 * approximation for "total-dependent" basic strategy; it differs from an exact 4-deck
 * calculation only on a few marginal plays, by fractions of a percent of EV.
 *
 * Rules (edit RULES and re-run to regenerate). Verified on HF 2026-11-05, see docs/phase0-findings.md:
 *   - Dealer hits soft 17
 *   - Dealer peeks for blackjack (EVs are conditioned on the dealer NOT having blackjack,
 *     which is the situation in which a player decision is ever asked for). NOT yet verified
 *   - Double on any first two cards, no double after split
 *   - One split only (2 hands max); split aces can be hit
 *   - Ace + ten-value on a split hand counts as blackjack and pays 3:2
 *   - Late surrender on the first two cards
 *
 * Usage: node scripts/generate-strategy-table.js
 */
const fs = require("fs");
const path = require("path");

const RULES = {
  model: "infinite-deck",
  dealerHitsSoft17: true,
  dealerPeeks: true,
  doubleOn: "any-two",
  doubleAfterSplit: false,
  maxSplitHands: 2,
  splitAcesOneCard: false,
  blackjackAfterSplit: true,
  blackjackPays: 1.5,
  lateSurrender: true,
};

// Cells where the exact 4-deck decision differs from the infinite-deck one (the player's own
// cards leaving the shoe tips them). The EVs stay as computed; only the decision is overridden.
// Verified against the published 4-8 deck H17 chart by src/games/blackjack/strategy.test.ts.
const OVERRIDES = {
  "soft:13:5": {
    best: "double",
    reason: "A,2 vs 5 doubles in 4+ deck shoes (infinite-deck margin 0.006)",
  },
};

const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1]; // 1 = ace, 10 = any ten-value card
const P = (r) => (r === 10 ? 4 / 13 : 1 / 13);
const UPCARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];
const UPCARD_KEY = (u) => (u === 1 ? "A" : String(u));

// A hand is { h: hard total counting aces as 1, a: whether it holds an ace }.
const value = (h, a) => (a && h + 10 <= 21 ? h + 10 : h);
const isSoft = (h, a) => a && h + 10 <= 21;

// ---------- Dealer ----------
// Returns the dealer's final distribution: { 17, 18, 19, 20, 21, bust }.
function dealerFinal(h, a, memo) {
  const key = h + "," + a;
  if (memo.has(key)) return memo.get(key);
  let dist;
  const v = value(h, a);
  if (h > 21) {
    dist = { bust: 1 };
  } else if (
    v > 17 ||
    (v === 17 && !(RULES.dealerHitsSoft17 && isSoft(h, a)))
  ) {
    dist = { [v]: 1 };
  } else {
    dist = {};
    for (const r of RANKS)
      addInto(dist, dealerFinal(h + r, a || r === 1, memo), P(r));
  }
  memo.set(key, dist);
  return dist;
}

function addInto(target, src, weight) {
  for (const k in src) target[k] = (target[k] || 0) + src[k] * weight;
}

// Dealer distribution given the upcard, conditioned on no dealer blackjack when peeking.
function dealerGivenUpcard(up) {
  const memo = new Map();
  const dist = {};
  let total = 0;
  for (const hole of RANKS) {
    const blackjack = (up === 1 && hole === 10) || (up === 10 && hole === 1);
    if (blackjack && RULES.dealerPeeks) continue;
    addInto(
      dist,
      dealerFinal(up + hole, up === 1 || hole === 1, memo),
      P(hole)
    );
    total += P(hole);
  }
  for (const k in dist) dist[k] /= total;
  return dist;
}

// ---------- Player ----------
function playerEVs(dealer) {
  const standMemo = new Map();
  const stand = (v) => {
    if (v > 21) return -1;
    if (standMemo.has(v)) return standMemo.get(v);
    let ev = dealer.bust || 0;
    for (let d = 17; d <= 21; d++) {
      const pd = dealer[d] || 0;
      if (v > d) ev += pd;
      else if (v < d) ev -= pd;
    }
    standMemo.set(v, ev);
    return ev;
  };

  // Best EV when only stand/hit are allowed (after a hit, or on a split hand without DAS).
  const playMemo = new Map();
  const hitEV = (h, a) => {
    let ev = 0;
    for (const r of RANKS) {
      const nh = h + r;
      ev += P(r) * (nh > 21 ? -1 : bestStandOrHit(nh, a || r === 1));
    }
    return ev;
  };
  const bestStandOrHit = (h, a) => {
    const key = h + "," + a;
    if (playMemo.has(key)) return playMemo.get(key);
    const v = value(h, a);
    const ev = v >= 21 ? stand(v) : Math.max(stand(v), hitEV(h, a));
    playMemo.set(key, ev);
    return ev;
  };
  const doubleEV = (h, a) => {
    let ev = 0;
    for (const r of RANKS) {
      const nh = h + r;
      ev += P(r) * (nh > 21 ? -1 : stand(value(nh, a || r === 1)));
    }
    return 2 * ev;
  };
  const splitEV = (rank) => {
    let perHand = 0;
    for (const r of RANKS) {
      const nh = rank + r;
      const na = rank === 1 || r === 1;
      // Ace + ten on a split hand: HF counts it as blackjack (dealer has none, given the peek).
      if (RULES.blackjackAfterSplit && na && nh === 11)
        perHand += P(r) * RULES.blackjackPays;
      else if (rank === 1 && RULES.splitAcesOneCard)
        perHand += P(r) * stand(value(nh, na));
      else perHand += P(r) * bestStandOrHit(nh, na); // no DAS, no resplit
    }
    return 2 * perHand;
  };

  const row = (h, a) => ({
    stand: stand(value(h, a)),
    hit: hitEV(h, a),
    double: doubleEV(h, a),
    surrender: -0.5,
  });

  return { row, splitEV };
}

// ---------- Build ----------
const round = (x) => Math.round(x * 1e5) / 1e5;
const roundRow = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));

const table = {
  rules: RULES,
  overrides: OVERRIDES,
  hard: {},
  soft: {},
  split: {},
};
for (let t = 4; t <= 21; t++) table.hard[t] = {};
for (let t = 12; t <= 21; t++) table.soft[t] = {};
for (const r of RANKS) table.split[r === 1 ? "A" : r] = {};

for (const up of UPCARDS) {
  const u = UPCARD_KEY(up);
  const { row, splitEV } = playerEVs(dealerGivenUpcard(up));
  for (let t = 4; t <= 21; t++) table.hard[t][u] = roundRow(row(t, false));
  // Soft total t = ace counted as 11, so hard sum is t - 10.
  for (let t = 12; t <= 21; t++) table.soft[t][u] = roundRow(row(t - 10, true));
  for (const r of RANKS) table.split[r === 1 ? "A" : r][u] = round(splitEV(r));
}

// The extension imports the table as JSON (src/games/blackjack/strategy.ts).
const jsonTarget = path.join(
  __dirname,
  "..",
  "src",
  "games",
  "blackjack",
  "strategyTable.json"
);
fs.writeFileSync(jsonTarget, JSON.stringify(table, null, 1) + "\n");
console.log("Wrote " + path.relative(process.cwd(), jsonTarget));
