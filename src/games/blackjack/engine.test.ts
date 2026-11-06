import fs from "fs";
import path from "path";
import { HfClient } from "../../core/HfClient";
import { PageState } from "../../core/pageBridge";
import { defaultSettings } from "../../settings";
import { PageDisplay } from "../engine";
import { BlackjackSettings } from "./definition";
import {
  blackjackBot,
  BjGameState,
  BjResponse,
  createBlackjackEngine,
  formatCards,
  nextBet,
  settle,
} from "./engine";

const FIXTURES = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "fixtures",
  "responses"
);
const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));

/** A client that expects these actions in order and answers each with a response. */
function scriptedClient(script: { action: string; response: BjResponse }[]) {
  const requests: { action: string; form: Record<string, string | number> }[] =
    [];
  const client = {
    post: async (url: string, form: Record<string, string | number>) => {
      const action = new URL(url, "https://hackforums.net").searchParams.get(
        "action"
      )!;
      requests.push({ action, form });
      const step = script.shift();
      if (!step) throw new Error(`Unexpected ${action}`);
      if (step.action !== action)
        throw new Error(`Expected ${step.action}, got ${action}`);
      return step.response;
    },
  };
  return { client: client as unknown as HfClient, requests, remaining: script };
}

function settings(
  overrides: Partial<BlackjackSettings> = {}
): BlackjackSettings {
  return {
    ...(defaultSettings().games.blackjack as unknown as BlackjackSettings),
    ...overrides,
  };
}

function engineWith(
  script: { action: string; response: BjResponse }[],
  options: {
    settings?: Partial<BlackjackSettings>;
    page?: Partial<PageState>;
    display?: PageDisplay | null;
  } = {}
) {
  const { client, requests, remaining } = scriptedClient(script);
  const page: PageState = {
    postKey: "k",
    windowId: "1",
    openGameState: null,
    blackjackPayout: 2.5,
    machineName: null,
    ...options.page,
  };
  const status = jest.fn();
  let current = settings(options.settings);
  const engine = createBlackjackEngine({
    client,
    page,
    gameSettings: () => current as unknown as Record<string, number | boolean>,
    globalSettings: () => defaultSettings().global,
    status,
    display: () => options.display ?? null,
  });
  return {
    engine,
    requests,
    remaining,
    page,
    status,
    setSettings: (s: Partial<BlackjackSettings>) => (current = settings(s)),
  };
}

let nextId = 100;
/** A synthetic HF response in the captured shape. */
function state(
  partial: Partial<BjGameState> & Pick<BjGameState, "hand1" | "dealer">
): BjResponse {
  return {
    success: true,
    balance: 1000,
    data: {
      game_id: "g1",
      action_id: String(nextId++),
      bet: "2.000000",
      is_split: "0",
      turn: "hand1",
      outcome1: null,
      outcome2: null,
      ended: "0",
      payout: null,
      ...partial,
    },
  };
}
const hand = (action: string, cards: string[]) => ({
  action,
  hand_cards: cards,
});

describe("blackjack engine", () => {
  it("replays the captured split hand: A,A vs 4 → split, hit A,4, stand on soft 18", async () => {
    const deal = fixture("013-deal.json");
    const split = fixture("014-split.json");
    const hit = fixture("015-hit.json");
    const stand = fixture("017-stand.json");
    const { engine, requests, remaining } = engineWith([
      { action: "deal", response: deal.response },
      { action: "split", response: split.response },
      { action: "hit", response: hit.response },
      { action: "stand", response: stand.response },
    ]);

    const result = await engine.playRound({ stopRequested: false });

    expect(remaining).toHaveLength(0);
    expect(requests.map((r) => r.action)).toEqual([
      "deal",
      "split",
      "hit",
      "stand",
    ]);
    // Each action sends the game and the latest action id, like HF's own client did
    expect(requests[1].form).toEqual({
      gameId: "557620951",
      actionId: deal.response.data.action_id,
    });
    expect(requests[2].form.actionId).toBe(split.response.data.action_id);
    expect(requests[3].form.actionId).toBe(hit.response.data.action_id);
    expect(result).toMatchObject({
      outcome: "WIN-BLACKJACK / TIE",
      wagered: 4,
      returned: 7,
      balance: 2880,
      details: { split: true, doubled: false },
    });
  });

  it("settles the captured double: 4 staked, 8 returned", () => {
    const result = settle(fixture("019-double.json").response.data, 2884);
    expect(result).toMatchObject({
      outcome: "WIN (double)",
      wagered: 4,
      returned: 8,
    });
  });

  it("settles a captured loss and a captured win", () => {
    expect(settle(fixture("005-stand.json").response.data)).toMatchObject({
      outcome: "LOSE",
      wagered: 2,
      returned: 0,
    });
    expect(settle(fixture("007-stand.json").response.data)).toMatchObject({
      outcome: "WIN",
      wagered: 2,
      returned: 4,
    });
  });

  it("doubles 11 vs 6 and stops after the one card", async () => {
    const { engine, requests } = engineWith([
      {
        action: "deal",
        response: state({
          hand1: hand("START", ["5c", "6d"]),
          dealer: hand("START", ["6h", "XX"]),
        }),
      },
      {
        action: "double",
        response: state({
          turn: "ended",
          ended: "1",
          outcome1: "WIN",
          outcome2: "",
          payout: "8.000000",
          hand1: hand("DOUBLE", ["5c", "6d", "10s"]),
          dealer: hand("HIT", ["6h", "10c", "8d"]),
        }),
      },
    ]);
    const result = await engine.playRound({ stopRequested: false });
    expect(requests.map((r) => r.action)).toEqual(["deal", "double"]);
    expect(result).toMatchObject({
      wagered: 4,
      returned: 8,
      details: { doubled: true },
    });
  });

  it("surrenders 16 vs 10 on the first decision", async () => {
    const { engine, requests } = engineWith([
      {
        action: "deal",
        response: state({
          hand1: hand("START", ["10c", "6d"]),
          dealer: hand("START", ["13h", "XX"]),
        }),
      },
      {
        action: "surrender",
        response: state({
          turn: "ended",
          ended: "1",
          outcome1: "SURRENDER",
          outcome2: "",
          payout: "1.000000",
          hand1: hand("SURRENDER", ["10c", "6d"]),
          dealer: hand("START", ["13h", "7c"]),
        }),
      },
    ]);
    const result = await engine.playRound({ stopRequested: false });
    expect(requests.map((r) => r.action)).toEqual(["deal", "surrender"]);
    expect(result).toMatchObject({
      outcome: "SURRENDER",
      wagered: 2,
      returned: 1,
    });
  });

  it("only hits or stands after the first decision", async () => {
    // 2,3 vs 6: hit to 2,3,6 = 11, which would double on the deal but can't now
    const { engine, requests } = engineWith([
      {
        action: "deal",
        response: state({
          hand1: hand("START", ["2c", "3d"]),
          dealer: hand("START", ["6h", "XX"]),
        }),
      },
      {
        action: "hit",
        response: state({
          hand1: hand("HIT", ["2c", "3d", "6s"]),
          dealer: hand("START", ["6h", "XX"]),
        }),
      },
      {
        action: "hit",
        response: state({
          hand1: hand("HIT", ["2c", "3d", "6s", "9h"]),
          dealer: hand("START", ["6h", "XX"]),
        }),
      },
      {
        action: "stand",
        response: state({
          turn: "ended",
          ended: "1",
          outcome1: "WIN",
          outcome2: "",
          payout: "4.000000",
          hand1: hand("STAND", ["2c", "3d", "6s", "9h"]),
          dealer: hand("HIT", ["6h", "10c", "9d"]),
        }),
      },
    ]);
    await engine.playRound({ stopRequested: false });
    expect(requests.map((r) => r.action)).toEqual([
      "deal",
      "hit",
      "hit",
      "stand",
    ]);
  });

  it("records a hand that ends on the deal (player blackjack) without acting", async () => {
    const { engine, requests } = engineWith([
      {
        action: "deal",
        response: state({
          turn: "ended",
          ended: "1",
          outcome1: "WIN-BLACKJACK",
          outcome2: "",
          payout: "5.000000",
          hand1: hand("BLACKJACK", ["1c", "13d"]),
          dealer: hand("START", ["9h", "7c"]),
        }),
      },
    ]);
    const result = await engine.playRound({ stopRequested: false });
    expect(requests).toHaveLength(1);
    expect(result).toMatchObject({
      outcome: "WIN-BLACKJACK",
      wagered: 2,
      returned: 5,
    });
  });

  it("finishes an unfinished game from page load instead of dealing, once", async () => {
    const open = state({
      hand1: hand("START", ["10c", "9d"]),
      dealer: hand("START", ["7h", "XX"]),
    }).data;
    const { engine, requests, page } = engineWith(
      [
        {
          action: "stand",
          response: state({
            turn: "ended",
            ended: "1",
            outcome1: "WIN",
            outcome2: "",
            payout: "4.000000",
            hand1: hand("STAND", ["10c", "9d"]),
            dealer: hand("HIT", ["7h", "10s"]),
          }),
        },
        {
          action: "deal",
          response: state({
            turn: "ended",
            ended: "1",
            outcome1: "LOSE",
            outcome2: "",
            payout: "0.000000",
            hand1: hand("STAND", ["10c", "7d"]),
            dealer: hand("START", ["10h", "1c"]),
          }),
        },
      ],
      { page: { openGameState: open as unknown as Record<string, unknown> } }
    );
    await engine.playRound({ stopRequested: false });
    expect(requests[0]).toEqual({
      action: "stand",
      form: { gameId: "g1", actionId: open.action_id },
    });
    expect(page.openGameState).toBeNull();
    await engine.playRound({ stopRequested: false });
    expect(requests[1].action).toBe("deal");
  });

  it("stops a hand that never ends", async () => {
    const endless = Array.from({ length: 20 }, () => ({
      action: "hit",
      response: state({
        hand1: hand("HIT", ["2c", "2d"]),
        dealer: hand("START", ["6h", "XX"]),
      }),
    }));
    const { engine } = engineWith([
      {
        action: "deal",
        response: state({
          hand1: hand("START", ["2c", "3d"]),
          dealer: hand("START", ["10h", "XX"]),
        }),
      },
      ...endless,
    ]);
    await expect(engine.playRound({ stopRequested: false })).rejects.toThrow(
      "too many actions"
    );
  });

  it("shows each decision in the panel", async () => {
    const { engine, status } = engineWith([
      {
        action: "deal",
        response: state({
          hand1: hand("START", ["12h", "6s"]),
          dealer: hand("START", ["1c", "XX"]),
        }),
      },
      {
        action: "surrender",
        response: state({
          turn: "ended",
          ended: "1",
          outcome1: "SURRENDER",
          outcome2: "",
          payout: "1.000000",
          hand1: hand("SURRENDER", ["12h", "6s"]),
          dealer: hand("START", ["1c", "8h"]),
        }),
      },
    ]);
    await engine.playRound({ stopRequested: false });
    expect(status).toHaveBeenCalledWith("Hand: Q♥ 6♠ vs A♣ → surrender");
  });
});

describe("martingale", () => {
  const on = settings({
    martingale: true,
    baseBet: 2,
    martingaleMultiplier: 2,
    maxBet: 10,
  });

  it("uses the base bet when off, first, or after a win", () => {
    expect(nextBet(settings({ baseBet: 5 }), 40, -40)).toBe(5);
    expect(nextBet(on, null, null)).toBe(2);
    expect(nextBet(on, 8, 8)).toBe(2);
  });

  it("multiplies after a loss, up to the cap, and holds on a push", () => {
    expect(nextBet(on, 2, -2)).toBe(4);
    expect(nextBet(on, 4, -4)).toBe(8);
    expect(nextBet(on, 8, -8)).toBe(10);
    expect(nextBet(on, 8, 0)).toBe(8);
  });

  it("rounds to whole βytes and never drops below the base bet", () => {
    expect(nextBet({ ...on, martingaleMultiplier: 1.5 }, 3, -3)).toBe(5);
    expect(nextBet({ ...on, baseBet: 6, maxBet: 4 }, 6, -6)).toBe(6);
  });

  it("raises the next deal after a lost hand", async () => {
    const loss = (cards: string[]) =>
      state({
        turn: "ended",
        ended: "1",
        outcome1: "LOSE",
        outcome2: "",
        payout: "0.000000",
        hand1: hand("STAND", cards),
        dealer: hand("START", ["10h", "1c"]),
      });
    const { engine, requests } = engineWith(
      [
        { action: "deal", response: loss(["10c", "7d"]) },
        {
          action: "deal",
          response: {
            ...loss(["10c", "8d"]),
            data: { ...loss(["10c", "8d"]).data, bet: "4.000000" },
          },
        },
        { action: "deal", response: loss(["10c", "9d"]) },
      ],
      {
        settings: {
          martingale: true,
          baseBet: 2,
          martingaleMultiplier: 2,
          maxBet: 100,
        },
      }
    );
    await engine.playRound({ stopRequested: false });
    await engine.playRound({ stopRequested: false });
    await engine.playRound({ stopRequested: false });
    expect(requests.map((r) => r.form.bet)).toEqual([2, 4, 8]);
  });
});

describe("martingale set tags", () => {
  const ended = (outcome: string, payout: string, bet: number) =>
    state({
      turn: "ended",
      ended: "1",
      outcome1: outcome,
      outcome2: "",
      payout,
      bet: `${bet}.000000`,
      hand1: hand("STAND", ["10c", "8d"]),
      dealer: hand("START", ["10h", "9c"]),
    });

  it("tags each hand with its set and step; a win ends the set, a push doesn't", async () => {
    const { engine } = engineWith(
      [
        { action: "deal", response: ended("LOSE", "0", 2) },
        { action: "deal", response: ended("TIE", "4", 4) },
        { action: "deal", response: ended("WIN", "8", 4) },
        { action: "deal", response: ended("LOSE", "0", 2) },
      ],
      { settings: { martingale: true, baseBet: 2, maxBet: 100 } }
    );
    const tags = [];
    const continues = [];
    for (let i = 0; i < 4; i++) {
      const played = await engine.playRound({ stopRequested: false });
      tags.push(played.details!.martingale);
      continues.push(played.continues);
    }
    // The loss and the push keep the set going; the win ends it
    expect(continues).toEqual([true, true, false, true]);
    expect(tags.map((t) => (t as { step: number }).step)).toEqual([1, 2, 3, 1]);
    expect(tags.map((t) => (t as { bet: number }).bet)).toEqual([2, 4, 4, 2]);
    const sets = tags.map((t) => (t as { set: string }).set);
    expect(sets[0]).toBe(sets[2]);
    expect(sets[3]).not.toBe(sets[0]);
    expect(tags[0]).toMatchObject({ cap: 100 });
    // One run for the whole session
    const runs = new Set(tags.map((t) => (t as { run: string }).run));
    expect(runs.size).toBe(1);
    expect([...runs][0]).toEqual(expect.any(String));
  });

  it("doesn't tag hands when martingale is off", async () => {
    const { engine } = engineWith([
      { action: "deal", response: ended("LOSE", "0", 2) },
    ]);
    const result = await engine.playRound({ stopRequested: false });
    expect(result.details!.martingale).toBeUndefined();
    expect(result.continues).toBe(false);
  });
});

describe("blackjack on HF's page", () => {
  it("draws each response on the page, with the bet on the deal, before the next action", async () => {
    const deal = fixture("013-deal.json").response;
    const split = fixture("014-split.json").response;
    const hit = fixture("015-hit.json").response;
    const stand = fixture("017-stand.json").response;
    const order: string[] = [];
    const display = jest.fn(async (action: string) => {
      order.push(`show ${action}`);
    });
    const { engine, requests } = engineWith(
      [
        { action: "deal", response: deal },
        { action: "split", response: split },
        { action: "hit", response: hit },
        { action: "stand", response: stand },
      ],
      { display }
    );
    const post = requests.push.bind(requests);
    requests.push = (...items) => {
      order.push(`post ${items[0].action}`);
      return post(...items);
    };
    await engine.playRound({ stopRequested: false });
    expect(display.mock.calls).toEqual([
      ["deal", deal, 2],
      ["split", split, null],
      ["hit", hit, null],
      ["stand", stand, null],
    ]);
    expect(order).toEqual([
      "post deal",
      "show deal",
      "post split",
      "show split",
      "post hit",
      "show hit",
      "post stand",
      "show stand",
    ]);
  });

  it("settles hands played by hand once they end, and ignores unfinished ones", () => {
    const fromPage = blackjackBot.fromPage!;
    expect(
      fromPage("ended", fixture("019-double.json").response, null)
    ).toMatchObject({ outcome: "WIN (double)", wagered: 4, returned: 8 });
    expect(
      fromPage("ended", fixture("013-deal.json").response, null)
    ).toBeNull();
    expect(fromPage("ended", { success: false }, null)).toBeNull();
    expect(fromPage("ended", null, null)).toBeNull();
  });
});

describe("blackjack bot", () => {
  it("summarizes the session before it starts", () => {
    const values = (s: Partial<BlackjackSettings>) =>
      settings(s) as unknown as Record<string, number | boolean>;
    expect(
      blackjackBot.summarize(values({ gamesPerSession: 10, baseBet: 2 }))
    ).toBe("Play 10 hands at 2 βytes?");
    expect(
      blackjackBot.summarize(
        values({
          runUntilStopped: true,
          martingale: true,
          martingaleMultiplier: 2.5,
          maxBet: 50,
        })
      )
    ).toBe(
      "Play until stopped at 2 βytes, martingale ×2.5 up to 50. Each set keeps going until a win?"
    );
    expect(
      blackjackBot.summarize(values({ gamesPerSession: 1, martingale: true }))
    ).toBe(
      "Play 1 set at 2 βytes, martingale ×2 up to 100. Each set keeps going until a win?"
    );
  });

  it("says how many sets and hands a martingale session played", () => {
    const values = (s: Partial<BlackjackSettings>) =>
      settings(s) as unknown as Record<string, number | boolean>;
    expect(blackjackBot.describeRounds!(10, 10, values({}))).toBe(
      "Finished 10 hands."
    );
    expect(
      blackjackBot.describeRounds!(10, 23, values({ martingale: true }))
    ).toBe("Finished 10 sets (23 hands).");
    expect(
      blackjackBot.describeRounds!(1, 1, values({ martingale: true }))
    ).toBe("Finished 1 set (1 hand).");
  });

  it("formats HF cards", () => {
    expect(formatCards(["1s", "10d", "11c", "12h", "13s", "XX"])).toBe(
      "A♠ 10♦ J♣ Q♥ K♠ ?"
    );
  });
});
