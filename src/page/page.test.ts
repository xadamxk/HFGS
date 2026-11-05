import fs from "fs";
import path from "path";
import { blackjackPage } from "./blackjack";
import { slotsPage } from "./slots";
import { Loose } from "./types";

const FIXTURES = path.join(__dirname, "..", "..", "fixtures", "responses");
const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8")).response;

const page = window as Loose;

afterEach(() => {
  delete page.Blackjack;
  delete page.slotMachine;
  delete page.jQuery;
  delete page.remaining_balance;
  jest.useRealTimers();
});

/** A stand-in for HF's Blackjack object that records calls and runs continuations at once. */
function fakeBlackjack() {
  const calls: string[] = [];
  const bj: Loose = {
    playingHand: 0,
    curBet: 0,
    calls,
    clearMessage: () => calls.push("clearMessage"),
    ClearHands: () => calls.push("ClearHands"),
    _showBet: () => calls.push(`_showBet ${bj.curBet}`),
    _showHand: (_hand: unknown, id: string, next?: () => void) => {
      calls.push(`_showHand ${id}`);
      next?.();
    },
    _showSplit: (next: () => void) => {
      calls.push("_showSplit");
      next();
    },
    _positionCardsInContainer: (id: string) => calls.push(`_position ${id}`),
    _CheckTurns: (next: () => void) => {
      calls.push("_CheckTurns");
      next();
    },
    updateBalanceCounters: () => calls.push("updateBalanceCounters"),
    showAvailableButtons: () => calls.push("showAvailableButtons"),
  };
  page.Blackjack = bj;
  return bj;
}

describe("blackjack page", () => {
  it("replays a deal like HF's btnDeal: clear, bet, player then dealer, then wrap up", async () => {
    const bj = fakeBlackjack();
    const deal = fixture("013-deal.json");
    await blackjackPage.show("deal", deal, 2);
    expect(bj.calls).toEqual([
      "clearMessage",
      "ClearHands",
      "_showBet 2",
      "_showHand playerHand1",
      "_showHand dealerHand",
      "_CheckTurns",
      "updateBalanceCounters",
      "showAvailableButtons",
    ]);
    expect(bj.playingHand).toBe(1);
    expect(bj.gameState).toBe(deal.data);
    expect(bj.gameState.is_split).toBe(0);
    expect(page.remaining_balance).toBe(parseFloat(deal.balance));
  });

  it("deals the new card to the hand in play on a hit, and shows the doubled bet", async () => {
    const bj = fakeBlackjack();
    bj.playingHand = 2;
    await blackjackPage.show("hit", fixture("015-hit.json"), null);
    expect(bj.calls).toContain("_showHand playerHand2");

    const bj2 = fakeBlackjack();
    bj2.playingHand = 1;
    bj2.curBet = 2;
    await blackjackPage.show("double", fixture("019-double.json"), null);
    expect(bj2.calls.slice(0, 2)).toEqual([
      "_showBet 4",
      "_showHand playerHand1",
    ]);
    expect(bj2.curBet).toBe(2);
  });

  it("splits like HF's btnSplit: move the second card, then both hands", async () => {
    const bj = fakeBlackjack();
    bj.playingHand = 1;
    const moved: unknown[] = [];
    page.jQuery = (selector: string) => ({
      append: (child: unknown) => moved.push([selector, child]),
      selector,
    });
    await blackjackPage.show("split", fixture("014-split.json"), null);
    expect(moved).toHaveLength(1);
    expect(bj.calls).toEqual([
      "_position playerHand2",
      "_showSplit",
      "_showHand playerHand1",
      "_showHand playerHand2",
      "_CheckTurns",
      "updateBalanceCounters",
      "showAvailableButtons",
    ]);
  });

  it("just wraps up on a stand", async () => {
    const bj = fakeBlackjack();
    bj.playingHand = 1;
    await blackjackPage.show("stand", fixture("017-stand.json"), null);
    expect(bj.calls[0]).toBe("_CheckTurns");
  });

  it("does nothing without HF's script, and syncs the balance in headless mode", async () => {
    await expect(
      blackjackPage.show("deal", fixture("013-deal.json"), 2)
    ).resolves.toBeUndefined();
    const bj = fakeBlackjack();
    blackjackPage.sync(2890, {});
    expect(page.remaining_balance).toBe(2890);
    expect(bj.calls).toEqual(["updateBalanceCounters"]);
  });

  it("reports each hand played by hand once, when it ends", () => {
    const handlers: Loose[] = [];
    page.jQuery = () => ({ ajaxSuccess: (fn: Loose) => handlers.push(fn) });
    const report = jest.fn();
    blackjackPage.watch(report);
    const send = (url: string, response: unknown) =>
      handlers[0]({}, { responseJSON: response }, { url, data: "a=1" });

    send(
      "blackjack/blackjack_action.php?action=deal",
      fixture("013-deal.json")
    );
    expect(report).not.toHaveBeenCalled();
    const ended = fixture("019-double.json");
    send("blackjack/blackjack_action.php?action=double", ended);
    send("blackjack/blackjack_action.php?action=double", ended);
    send("/other.php", ended);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({
      action: "ended",
      response: ended,
      bet: null,
    });
  });
});

describe("slots page", () => {
  function fakeSlots() {
    document.body.innerHTML = `<span id="credits">2871</span><span id="bet">1</span>
      <div id="trPrize_3" class="trPrize won"></div><div id="trPrize_8" class="trPrize"></div>`;
    const calls: string[] = [];
    const sm: Loose = {
      curBet: 1,
      spinning: false,
      firstReelStopTime: 667,
      secondReelStopTime: 575,
      thirdReelStopTime: 568,
      payoutStopTime: 700,
      sounds: {},
      calls,
      show_won_state: (won: boolean) => calls.push(`won ${won}`),
      disable_spin_button: () => calls.push("disable"),
      enable_spin_button: () => calls.push("enable"),
      get_balance: () =>
        parseInt(document.getElementById("credits")!.textContent!, 10),
      _start_reel_spin: (i: number) => calls.push(`start ${i}`),
      _stop_reel_spin: (i: number, outcome: string) =>
        calls.push(`stop ${i} ${outcome}`),
      end_spin: (data: unknown) => sm._end_spin_after_payout(data),
    };
    sm._end_spin_after_payout = () => {
      calls.push("end");
      sm.spinning = false;
    };
    page.slotMachine = sm;
    page.jQuery = (selector: string) => ({
      html: (value: unknown) => {
        const node = document.querySelector(selector);
        if (node) node.textContent = String(value);
      },
      each: () => undefined,
    });
    return sm;
  }

  it("spins the reels, stops them on the result with HF's timings, and resolves after the payout", async () => {
    jest.useFakeTimers();
    const sm = fakeSlots();
    const original = sm._end_spin_after_payout;
    const response = {
      success: true,
      reels: ["4.0", "4.0", "2.0"],
      prize: { id: "8", payoutCredits: 4, payoutWinnings: 4 },
      credits: 2874,
    };
    let done = false;
    const shown = slotsPage.show("spin", response, 1).then(() => (done = true));
    // Credits drop to before the payout, as HF's own spin does
    expect(document.getElementById("credits")!.textContent).toBe("2870");
    expect(sm.calls).toEqual([
      "won false",
      "disable",
      "start 1",
      "start 2",
      "start 3",
    ]);

    jest.advanceTimersByTime(667);
    expect(sm.calls).toContain("stop 1 4.0");
    expect(sm.calls).not.toContain("stop 2 4.0");
    jest.advanceTimersByTime(575 + 568);
    expect(sm.calls).toContain("stop 3 2.0");
    expect(sm.calls).not.toContain("end");
    jest.advanceTimersByTime(700);
    await shown;
    expect(done).toBe(true);
    expect(sm.calls).toContain("end");
    expect(sm._end_spin_after_payout).toBe(original);
  });

  it("changes HF's bet display when the bot bets differently", async () => {
    jest.useFakeTimers();
    const sm = fakeSlots();
    const shown = slotsPage.show(
      "spin",
      { success: true, reels: ["1", "2", "3"], prize: null, credits: 2861 },
      10
    );
    expect(sm.curBet).toBe(10);
    expect(document.getElementById("bet")!.textContent).toBe("10");
    jest.runAllTimers();
    await shown;
  });

  it("updates HF's credits and lights up the winning prize row in headless mode", () => {
    const sm = fakeSlots();
    slotsPage.sync(2874, { prizeId: "8" });
    expect(document.getElementById("credits")!.textContent).toBe("2874");
    expect(
      document.getElementById("trPrize_8")!.classList.contains("won")
    ).toBe(true);
    expect(
      document.getElementById("trPrize_3")!.classList.contains("won")
    ).toBe(false);
    expect(sm.calls).toContain("enable");
    slotsPage.sync(2873, {});
    expect(document.querySelectorAll(".trPrize.won")).toHaveLength(0);
  });

  it("reports spins played by hand with their bet", () => {
    const handlers: Loose[] = [];
    page.jQuery = () => ({ ajaxSuccess: (fn: Loose) => handlers.push(fn) });
    const report = jest.fn();
    slotsPage.watch(report);
    const response = {
      success: true,
      reels: ["1", "2", "3"],
      prize: null,
      credits: 5,
    };
    handlers[0](
      {},
      { responseText: JSON.stringify(response) },
      {
        url: "/slots/spin.php",
        data: "bet=5&windowID=1&machine_name=default&my_post_key=x",
      }
    );
    expect(report).toHaveBeenCalledWith({ action: "spin", response, bet: 5 });
  });
});
