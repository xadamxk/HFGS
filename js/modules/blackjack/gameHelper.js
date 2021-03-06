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

function getDealerHand(json) {
    var jsonObj = jQuery.parseJSON(json);
    return jsonObj.data.dealer.hand_cards;
}

function getMyHand(json) {
    var jsonObj = jQuery.parseJSON(json);
    return jsonObj.data.hand1.hand_cards;
}

function parseHand(array) {
    var handArray = array;
    saveHand(handArray);
    var handString = "";
    for (var arrayIndex = 0; arrayIndex < array.length; arrayIndex++) {
        if (array[arrayIndex] !== "XX") {
            array[arrayIndex] = array[arrayIndex].replace(/\D/g, ''); // Remove all letters from string
            // Convert face cards to 10
            if (array[arrayIndex] == "11" || array[arrayIndex] == "12" || array[arrayIndex] == "13") {
                array[arrayIndex] = "10";
            }
            handString += array[arrayIndex];
            // Card seperator
            if (jQuery.inArray("XX", array) == 1) {
                // If not last
                if (arrayIndex + 2 < array.length) {
                    handString += "%2C";
                }
            } else if (arrayIndex + 1 < array.length) {
                handString += "%2C";
            }
        }
    }
    return handString;
}

function saveHand(handArray) {
    // Dealer Hand
    if (jQuery.inArray("XX", handArray) == 1) {
        setDealerHand(handArray);
    } else {
        setYourHand(handArray);
    }
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