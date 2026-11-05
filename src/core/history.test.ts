import {
  clearHistory,
  loadHistory,
  MAX_ENTRIES,
  recordRound,
  toEntry,
} from "./history";

describe("history", () => {
  it("starts empty", async () => {
    const history = await loadHistory("blackjack");
    expect(history.entries).toEqual([]);
    expect(history.totals.rounds).toBe(0);
  });

  it("computes net from what was wagered and returned", () => {
    // Phase 0: a doubled win on a 2 bet returns 8 for 4 staked
    expect(toEntry({ outcome: "WIN", wagered: 4, returned: 8 }, 1).net).toBe(4);
    // Blackjack pays 2.5x total
    expect(
      toEntry({ outcome: "WIN-BLACKJACK", wagered: 2, returned: 5 }, 1).net
    ).toBe(3);
    // Slots: payoutCredits 4 on a 1 bet
    expect(toEntry({ outcome: "WIN", wagered: 1, returned: 4 }, 1).net).toBe(3);
  });

  it("records rounds newest first and keeps per-game totals", async () => {
    await recordRound(
      "slots",
      toEntry({ outcome: "LOSS", wagered: 1, returned: 0 }, 1)
    );
    await recordRound(
      "slots",
      toEntry({ outcome: "WIN", wagered: 1, returned: 4 }, 2)
    );
    await recordRound(
      "blackjack",
      toEntry({ outcome: "TIE", wagered: 2, returned: 2 }, 3)
    );

    const slots = await loadHistory("slots");
    expect(slots.entries.map((e) => e.at)).toEqual([2, 1]);
    expect(slots.totals).toEqual({
      rounds: 2,
      wins: 1,
      losses: 1,
      pushes: 0,
      wagered: 2,
      returned: 4,
      net: 2,
      biggestWin: 3,
    });
    expect((await loadHistory("blackjack")).totals.pushes).toBe(1);
  });

  it("keeps at most MAX_ENTRIES results but counts every round in the totals", async () => {
    const entry = toEntry({ outcome: "LOSS", wagered: 1, returned: 0 }, 0);
    await chrome.storage.local.set({
      "history:slots": {
        totals: {
          rounds: MAX_ENTRIES,
          wins: 0,
          losses: MAX_ENTRIES,
          pushes: 0,
          wagered: MAX_ENTRIES,
          returned: 0,
          net: -MAX_ENTRIES,
          biggestWin: 0,
        },
        entries: Array(MAX_ENTRIES).fill(entry),
      },
    });
    const updated = await recordRound("slots", entry);
    expect(updated.entries).toHaveLength(MAX_ENTRIES);
    expect(updated.totals.rounds).toBe(MAX_ENTRIES + 1);
  });

  it("avoids float drift in totals", async () => {
    for (let i = 0; i < 10; i++) {
      await recordRound(
        "slots",
        toEntry({ outcome: "WIN", wagered: 0.1, returned: 0.2 }, i)
      );
    }
    expect((await loadHistory("slots")).totals.net).toBe(1);
  });

  it("clears one game's history", async () => {
    await recordRound(
      "slots",
      toEntry({ outcome: "WIN", wagered: 1, returned: 2 }, 1)
    );
    await recordRound(
      "blackjack",
      toEntry({ outcome: "WIN", wagered: 2, returned: 4 }, 1)
    );
    await clearHistory("slots");
    expect((await loadHistory("slots")).totals.rounds).toBe(0);
    expect((await loadHistory("blackjack")).totals.rounds).toBe(1);
  });
});
