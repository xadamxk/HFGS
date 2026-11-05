function hfPostRequest(url, data, cont) {
    setTimeout(function () {
        $.ajax({
            type: 'POST',
            url: url,
            data: data,
            async: false,
            success: function (data) {
                var jsonObj = jQuery.parseJSON(data);
                updateTableUI(); // ?
                if (jsonObj.balance) {
                    updatenewBytes(jsonObj);
                    // Update dealer's ahnd
                    setDealerHand(parseHFDealerHand(jsonObj));
                    // Update your hands
                    setYourHand(jsonObj.data.hand1.hand_cards);
                    // Update your hand total
                    updateYourHandTotal(jsonObj.data.hand1.hand_value);
                }
                // HF Response
                if (jsonObj.balance && cont) {
                    gameID = jsonObj.data.game_id;
                    actionID = jsonObj.data.action_id;
                    console.log("SINGLE GAME RESULT: " + getSingleGameResult(jsonObj));
                    if (getSingleGameResult(jsonObj) == "FOLD"
                        || getSingleGameResult(jsonObj) == "TIE"
                        || getSingleGameResult(jsonObj) == "WIN-BLACKJACK"
                        || getSingleGameResult(jsonObj) == "WIN"
                        || getSingleGameResult(jsonObj) == "LOSE"
                        || getSingleGameResult(jsonObj) == "SURRENDER") {
                        setGameResult(getSingleGameResult(jsonObj));
                        updateWagerAmount(jsonObj);
                        startNextGame();
                    } else {
                        playBestAction(jsonObj);
                    }
                } else {
                    console.log("Result: " + getSingleGameResult(jsonObj) + " (" + getSingleGamePayout(jsonObj) + ")");
                    setGameResult(getSingleGameResult(jsonObj));
                    updateWagerAmount(jsonObj);
                    startNextGame();
                }

            },
        });
    }, 500);
}

// Decide the next action from the baked strategy table (strategy.js) and send it to HF.
function playBestAction(jsonObj) {
    // Split hands aren't played yet, so pick the best of the remaining actions instead.
    var advice = HFBJStrategy.getAdvice(jsonObj.data.hand1.hand_cards, jsonObj.data.dealer.hand_cards, { canSplit: false });
    if (!advice) {
        console.log("No strategy advice for hand", jsonObj.data);
        return;
    }
    console.log("BEST OPTION: " + advice.best, advice.ev);
    setHandResult(advice.best);
    setOddsDisplay(formatActionEVs(advice.ev));
    updateYourHandTotal(String(advice.total));
    bestAction = advice.best;
    if (bestAction == "stand") {
        hfPostRequest(hfActionStandURL, generateHFRawData(), false);
    } else if (bestAction == "hit") {
        hfPostRequest(hfActionHitURL, generateHFRawData(), true);
    } else if (bestAction == "double") {
        hfPostRequest(hfActionDoubleURL, generateHFRawData(), true);
    } else if (bestAction == "surrender") {
        hfPostRequest(hfActionSurrenderURL, generateHFRawData(), false);
    }
}

// { stand: -0.16468, ... } -> { stand: "-16.5%", ... } (expected return as % of the bet)
function formatActionEVs(ev) {
    var formatted = {};
    Object.keys(ev).forEach(function (action) {
        var pct = (ev[action] * 100).toFixed(1);
        formatted[action] = (ev[action] > 0 ? "+" : "") + pct + "%";
    });
    return formatted;
}

function getSingleGamePayout(jsonObj) {
    return parseInt(jsonObj.data.payout) / wagerAmt;
}

function getSingleGameResult(jsonObj) {
    return jsonObj.data.outcome1;
}

function generateHFRawData() {
    return "gameId=" + gameID + "&actionId=" + actionID + "&my_post_key=" + myPostKey;
}
