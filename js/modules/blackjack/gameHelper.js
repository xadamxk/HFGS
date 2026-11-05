function startNextGame() {
    if (isBotRunning) {
        setTimeout(function () {
            // Continuously
            if (runContinuously) {
                startNewGameConfirm();
            } else {
                if (gamesPlayed < gamesPerSession) {
                    gamesPlayed++;
                    startNewGameConfirm();
                } else {
                    alert("DONE RUNNING!");
                    gamesPlayed = 0;
                    isBotRunning = false;
                    $("#toggleBJBot").text("Start Bot");
                }
            }
        }, 1000);
    }
}

function startNewGameConfirm() {
    if (confirmEachGame) {
        if (confirm("Play Again?")) {
            console.clear();
            hfPostRequest(hfActionDealURL, dealHandBody, true);
        } else {
            isBotRunning = false;
            $("#toggleBJBot").text("Start Bot");
        }
    } else {
        console.clear();
        hfPostRequest(hfActionDealURL, dealHandBody, true);
    }
}

function updateWagerAmount(jsonObj) {
    if (useMartingaleStrat) {
        if (jsonObj.data.outcome1 == "FOLD"
            || jsonObj.data.outcome1 == "LOSE"
        ) {
            // Increase
            wagerAmt = wagerAmt * wagerMultiplier;
            if (wagerAmt > 500) {
                wagerAmt = 500;
            }
        } else if (jsonObj.data.outcome1 == "WIN-BLACKJACK"
            || jsonObj.data.outcome1 == "WIN") {
            // Reset
            wagerAmt = initialWager;
        }
    }
    $("#wagerAmt").text(wagerAmt);
    dealHandBody = "bet=" + wagerAmt + "&my_post_key=" + myPostKey;
}

function parseHFDealerHand(jsonObj) {
    setDealerHandTotal(jsonObj);
    var unparsedDealerHand = jsonObj.data.dealer.hand_cards;
    var handArray = [];
    Object.keys(unparsedDealerHand).forEach(function (key) {
        handArray[key] = unparsedDealerHand[key];
    });
    return handArray;
}