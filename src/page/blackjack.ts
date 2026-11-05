/**
 * Blackjack in HF's page world. `show` replays a response through HF's own
 * blackjack.js, mirroring what its `_doRequest` success handler and button
 * handlers (btnDeal, btnHit, btnDouble, btnSplit) do with a server answer, so
 * the cards fly and flip exactly as when playing by hand.
 */
import { hfWindow, Loose, onHfAjax, PageGame } from "./types";

export const blackjackPage: PageGame = {
  show(action, response, bet) {
    const page = hfWindow();
    const bj = page.Blackjack;
    const res = response as Loose;
    if (!bj || !res?.data) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const state = res.data;
      state.is_split = parseInt(state.is_split, 10);
      const apply = () => {
        bj.waitingOnServer = false;
        bj.gameState = state;
        page.remaining_balance = parseFloat(res.balance);
      };
      // HF's own wrap-up after every answer: settle hands, counters, buttons.
      const finish = () =>
        bj._CheckTurns(() => {
          bj.updateBalanceCounters();
          bj.showAvailableButtons();
          resolve();
        });
      const showActiveHand = () =>
        bj._showHand(
          state[`hand${bj.playingHand}`],
          `playerHand${bj.playingHand}`,
          finish
        );

      switch (action) {
        case "deal":
          bj.clearMessage();
          bj.ClearHands();
          bj.curBet = bet ?? parseFloat(state.bet);
          bj._showBet();
          apply();
          bj.playingHand = 1;
          bj._showHand(state.hand1, "playerHand1", () =>
            bj._showHand(state.dealer, "dealerHand", finish)
          );
          break;
        case "hit":
          apply();
          showActiveHand();
          break;
        case "double":
          apply();
          bj.curBet *= 2;
          bj._showBet();
          bj.curBet /= 2;
          showActiveHand();
          break;
        case "split": {
          apply();
          const $ = page.jQuery;
          $("#playerHand2 .cardsContainer").append(
            $("#playerHand1 .cardsContainer .card:nth-child(2)")
          );
          bj._positionCardsInContainer("playerHand2");
          bj._showSplit(() =>
            bj._showHand(state.hand1, "playerHand1", () =>
              bj._showHand(state.hand2, "playerHand2", finish)
            )
          );
          break;
        }
        default: // stand, surrender: no new player cards
          apply();
          finish();
      }
    });
  },

  sync(balance) {
    const page = hfWindow();
    page.remaining_balance = balance;
    page.Blackjack?.updateBalanceCounters?.();
  },

  watch(report) {
    // Every answer, so the assistant can follow the hand; the panel records
    // the hand once its answer says it has ended.
    onHfAjax("blackjack_action.php", (response, _request, url) => {
      const res = response as Loose;
      if (!res?.success || !res.data) return;
      report({
        action: url.searchParams.get("action") ?? "unknown",
        response: res,
        bet: null,
      });
    });
  },
};
