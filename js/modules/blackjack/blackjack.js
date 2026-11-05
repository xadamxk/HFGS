var confirmEachGame; // prompt for each new game (false for gamesPerSession)
var gamesPerSession; // how many games to play automatically
var runContinuously; // Run continuously
var useMartingaleStrat // initial wager * multiplier on lose, reset after win
var wagerMultiplier; // Keep between 2-3 for consistent results

// ------------------------------- Script -------------------------------
/* ========== DO NOT CHANGE ANYTHING BELOW THIS LINE ========== */
/* Global Constants */
const myPostKey = document.getElementsByTagName('head')[0].innerHTML.split('my_post_key = "')[1].split('";')[0];
const hfActionDealURL = "https://hackforums.net/blackjack/blackjack_action.php?action=deal";
const hfActionStandURL = "https://hackforums.net/blackjack/blackjack_action.php?action=stand";
const hfActionHitURL = "https://hackforums.net/blackjack/blackjack_action.php?action=hit";
const hfActionDoubleURL = "https://hackforums.net/blackjack/blackjack_action.php?action=double";
const hfActionSplitURL = "https://hackforums.net/blackjack/blackjack_action.php?action=split";
const hfActionSurrenderURL = "https://hackforums.net/blackjack/blackjack_action.php?action=surrender";
// Table rules for strategy decisions live in scripts/generate-strategy-table.js (RULES).
/* Global Variables */
var dealResponse;
var gameID;
var actionID;
var gamesPlayed = 0;
var origByteBalance;
var currentBalance = Math.max(0, parseInt($("#balanceCounterBalance").text()));
var newByteBalance;
var HFBJ = localStorage.getItem('hf-bj');
initializeLogFromMemory(); // Init Log
// Current Game Stats
var isBotRunning = false;
var latestWinAmt = 0;// TODO: Get value from local storage
var sessionTotalGames = 0;
var sessionTotalBet = 0;
var sessionTotalWon = 0;
var sessionTotalLost = 0;
var sessionNet = 0;
var overallTotalGames = HFBJ.totalGames;
var overallTotalBet = HFBJ.totalBet;
var overallTotalWon = HFBJ.totalWon;
var overallTotalLost = HFBJ.totalLost;
var overallTotalNet = HFBJ.totalWon - HFBJ.totalLost;
var wagerAmt = 0;
var initialWager = 0;
var dealHandBody = "";
var bestAction = "";

// Append warning
$('strong:contains("Risk your Bytes for a chance to win more!")').parent().parent()
    .after($("<tr>").css("color", "red").text("HF Gambling Suite: USE AT YOUR OWN RISK!"));

// Append UI Changes
appendSettings();
initialStats();
console.clear();

// Toggle Bot click event
$("#toggleBJBot").click(function () {
    if (!isBotRunning) {
        isBotRunning = true;
        $("#toggleBJBot").text("Stop Bot");
        if (confirm("Are you sure you want to start the blackjack bot?")) {
            setWagerTotal();
            dealHandBody = "bet=" + wagerAmt + "&my_post_key=" + myPostKey;
            initialWager = wagerAmt;
            hfPostRequest(hfActionDealURL, dealHandBody, true);
        }
    } else {
        isBotRunning = false;
        $("#toggleBJBot").text("Start Bot");
    }
});

$("#setBJBotMemory").click(function () {
    if (confirm("Are you sure you want to clear all log history?")) {
        localStorage.removeItem('hf-bj');
        clearStats();
    }
});

/* Functions */
function initializeLogFromMemory() {
    if (HFBJ === null) {
        HFBJ = {
            totalGames: 0,
            totalBet: 0,
            totalWon: 0,
            totalLost: 0,
            logs: [],

        }
    } else {
        HFBJ = JSON.parse(HFBJ);
    }
}