/**
 * Slots in HF's page world. `show` replays a spin through HF's own slots.js,
 * mirroring its `spin()` with the answer already in hand: the reels spin, stop
 * on the result, and wins light up and count up as usual.
 */
import { hfWindow, Loose, onHfAjax, PageGame } from "./types";

function showBet(bet: number): void {
  const page = hfWindow();
  const $ = page.jQuery;
  page.slotMachine.curBet = bet;
  $("#bet").html(bet);
  // As HF's change_bet: the prize list shows payouts for the current bet.
  $("#prizes_list .tdPayout").each(function (this: Element) {
    const cell = $(this);
    cell.html(
      (cell.attr("data-payoutPrefix") || "") +
        parseInt(cell.attr("data-basePayout"), 10) * bet +
        (cell.attr("data-payoutSuffix") || "")
    );
  });
}

export const slotsPage: PageGame = {
  show(_action, response, bet) {
    const page = hfWindow();
    const sm = page.slotMachine;
    const $ = page.jQuery;
    const data = response as Loose;
    if (!sm || !$ || !Array.isArray(data?.reels) || sm.spinning)
      return Promise.resolve();

    return new Promise<void>((resolve) => {
      if (bet !== null && bet !== sm.curBet) showBet(bet);
      sm.spinning = true;
      sm.show_won_state(false);
      sm.disable_spin_button();
      // Credits before the payout, so HF's counter counts up to data.credits.
      $("#credits").html(data.credits - (data.prize?.payoutCredits ?? 0));

      sm._start_reel_spin(1, 0);
      sm._start_reel_spin(2, sm.secondReelStopTime);
      sm._start_reel_spin(3, sm.secondReelStopTime + sm.thirdReelStopTime);
      try {
        sm.sounds.spinning.play();
      } catch {
        // HF's sounds may not have loaded
      }

      // HF calls this last, after the payout count-up (if any) has finished.
      const original = sm._end_spin_after_payout;
      sm._end_spin_after_payout = function (spin: unknown) {
        sm._end_spin_after_payout = original;
        original.call(sm, spin);
        resolve();
      };

      // HF's timings from spin(): reels stop one by one, then the payout.
      const stop1 = sm.firstReelStopTime;
      const stop2 = stop1 + sm.secondReelStopTime;
      const stop3 = stop2 + sm.thirdReelStopTime;
      setTimeout(() => sm._stop_reel_spin(1, data.reels[0]), stop1);
      setTimeout(() => sm._stop_reel_spin(2, data.reels[1]), stop2);
      setTimeout(() => sm._stop_reel_spin(3, data.reels[2]), stop3);
      setTimeout(() => sm.end_spin(data), stop3 + sm.payoutStopTime);
    });
  },

  sync(balance, details) {
    const page = hfWindow();
    const sm = page.slotMachine;
    const credits = document.getElementById("credits");
    if (credits) credits.textContent = String(balance);
    document
      .querySelectorAll(".trPrize.won")
      .forEach((row) => row.classList.remove("won"));
    if (details.prizeId)
      document
        .getElementById(`trPrize_${details.prizeId}`)
        ?.classList.add("won");
    if (sm?.get_balance?.() >= sm?.curBet) sm.enable_spin_button();
  },

  watch(report) {
    onHfAjax("spin.php", (response, request) => {
      const bet = Number(request.get("bet"));
      report({
        action: "spin",
        response,
        bet: Number.isFinite(bet) && bet > 0 ? bet : null,
      });
    });
  },
};
