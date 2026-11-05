/*
 * Local blackjack strategy: looks up the best action and per-action EVs from the baked
 * HFBJ_STRATEGY_TABLE (see scripts/generate-strategy-table.js). No network calls.
 *
 * Cards use HF's format: rank 1-13 followed by a suit letter ("1s" = ace, "12h" = queen),
 * "XX" = face-down card.
 */
var HFBJStrategy = (function () {
    var table = typeof HFBJ_STRATEGY_TABLE !== "undefined" ? HFBJ_STRATEGY_TABLE : require("./strategyTable.js");
    var ACTION_ORDER = ["stand", "hit", "double", "split", "surrender"]; // tie-break preference

    // HF rank (1-13) -> blackjack value with ace as 1.
    function cardValue(card) {
        var rank = parseInt(card, 10);
        return rank >= 10 ? 10 : rank;
    }

    function visibleCards(cards) {
        return cards.filter(function (c) { return c && c !== "XX"; });
    }

    function handTotal(cards) {
        var hard = 0, hasAce = false;
        visibleCards(cards).forEach(function (c) {
            var v = cardValue(c);
            hard += v;
            if (v === 1) hasAce = true;
        });
        var soft = hasAce && hard + 10 <= 21;
        return { total: soft ? hard + 10 : hard, soft: soft, hard: hard };
    }

    /*
     * playerCards: e.g. ["11c", "6d"]; dealerCards: e.g. ["10c", "XX"] (first visible card is the upcard).
     * options (all optional): canDouble, canSplit, canSurrender. Defaults allow each one only on the
     * first two cards (and split only on a pair).
     * Returns { best, total, soft, ev: { action: EV per unit of the original bet } } or null if the
     * hand is not playable (bust or missing cards).
     */
    function getAdvice(playerCards, dealerCards, options) {
        options = options || {};
        var cards = visibleCards(playerCards);
        var up = visibleCards(dealerCards)[0];
        if (cards.length < 2 || !up) return null;

        var hand = handTotal(cards);
        if (hand.total > 21) return null;
        var upKey = cardValue(up) === 1 ? "A" : String(cardValue(up));

        var firstTwo = cards.length === 2;
        var isPair = firstTwo && cardValue(cards[0]) === cardValue(cards[1]);
        var canDouble = option(options.canDouble, firstTwo);
        var canSurrender = option(options.canSurrender, firstTwo);
        var canSplit = option(options.canSplit, true) && isPair;

        var row = hand.soft ? table.soft[hand.total] : table.hard[Math.max(4, hand.total)];
        var entry = row[upKey];
        var ev = { stand: entry.stand };
        if (hand.total < 21) ev.hit = entry.hit;
        if (canDouble) ev.double = entry.double;
        if (canSplit) ev.split = table.split[cardValue(cards[0]) === 1 ? "A" : cardValue(cards[0])][upKey];
        if (canSurrender) ev.surrender = entry.surrender;

        var best = null;
        ACTION_ORDER.forEach(function (action) {
            if (action in ev && (best === null || ev[action] > ev[best])) best = action;
        });
        // Two-card overrides only: the 4-deck effect they encode comes from the initial deal.
        var override = firstTwo && table.overrides && table.overrides[(hand.soft ? "soft:" : "hard:") + hand.total + ":" + upKey];
        if (override && override.best in ev) best = override.best;
        return { best: best, total: hand.total, soft: hand.soft, ev: ev };
    }

    function option(value, fallback) {
        return typeof value === "boolean" ? value && fallback : fallback;
    }

    return { getAdvice: getAdvice, handTotal: handTotal, table: table };
})();
if (typeof module !== "undefined") module.exports = HFBJStrategy;
