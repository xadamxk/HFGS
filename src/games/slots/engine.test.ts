import fs from "fs";
import path from "path";
import { HfClient } from "../../core/HfClient";
import { PageState } from "../../core/pageBridge";
import { defaultSettings } from "../../settings";
import { PageDisplay } from "../engine";
import { SlotsSettings } from "./definition";
import {
  createSlotsEngine,
  settleSpin,
  slotsBet,
  slotsBot,
  SpinResponse,
} from "./engine";

const FIXTURES = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "fixtures",
  "responses"
);
const captured = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));

function engineWith(
  responses: SpinResponse[],
  options: {
    settings?: Partial<SlotsSettings>;
    page?: Partial<PageState>;
    display?: PageDisplay | null;
  } = {}
) {
  const requests: { url: string; form: Record<string, string | number> }[] = [];
  const client = {
    post: async (url: string, form: Record<string, string | number>) => {
      requests.push({ url, form });
      const next = responses.shift();
      if (!next) throw new Error("No more responses");
      return next;
    },
  } as unknown as HfClient;
  const settings = {
    ...(defaultSettings().games.slots as unknown as SlotsSettings),
    ...options.settings,
  };
  const page: PageState = {
    postKey: "k",
    windowId: "836819641",
    openGameState: null,
    blackjackPayout: null,
    machineName: "default",
    ...options.page,
  };
  const status = jest.fn();
  const engine = createSlotsEngine({
    client,
    page,
    gameSettings: () => settings as unknown as Record<string, number | boolean>,
    status,
    display: () => options.display ?? null,
  });
  return { engine, requests, status };
}

const spin = (
  credits: number,
  prize: SpinResponse["prize"] = null
): SpinResponse => ({
  success: true,
  reels: ["1.0", "2.0", "3.0"],
  prize,
  credits,
});

describe("slots engine", () => {
  it("replays the three captured spins: loss, win, loss", async () => {
    const fixtures = ["001-spin.json", "002-spin.json", "003-spin.json"].map(
      captured
    );
    const { engine, requests } = engineWith(fixtures.map((f) => f.response));

    const results = [];
    for (let i = 0; i < 3; i++)
      results.push(await engine.playRound({ stopRequested: false }));

    // Sends what HF's own client sent (the post key is added by HfClient)
    expect(requests[0]).toEqual({
      url: "/slots/spin.php",
      form: { bet: 1, windowID: "836819641", machine_name: "default" },
    });
    expect(
      new URLSearchParams(fixtures[0].requestBody).get("machine_name")
    ).toBe("default");
    expect(
      results.map((r) => [r.outcome, r.wagered, r.returned, r.balance])
    ).toEqual([
      ["LOSS", 1, 0, 2871],
      ["WIN", 1, 4, 2874],
      ["LOSS", 1, 0, 2873],
    ]);
    expect(results[1].details).toEqual({
      reels: ["1.0", "3.0", "5.0"],
      prizeId: "8",
    });
  });

  it("uses HF's payoutCredits (the total paid back) as the return", () => {
    const result = settleSpin(
      1,
      spin(2874, { id: "8", payoutCredits: 4, payoutWinnings: 4 })
    );
    expect(result.returned - result.wagered).toBe(3);
  });

  it("spins at the configured bet, snapped to HF's bet steps", async () => {
    const { engine, requests, status } = engineWith([spin(100)], {
      settings: { bet: 25 },
    });
    await engine.playRound({ stopRequested: false });
    expect(requests[0].form.bet).toBe(25);
    expect(status).toHaveBeenCalledWith("Spinning at 25 βytes…");
  });

  it("lowers the bet to what the credits allow, and stops when nothing is affordable", async () => {
    const { engine, requests } = engineWith([spin(7), spin(7), spin(0)], {
      settings: { bet: 10 },
    });
    await engine.playRound({ stopRequested: false }); // credits unknown: bets 10, now 7 left
    await engine.playRound({ stopRequested: false }); // 7 left: bets 5
    expect(requests.map((r) => r.form.bet)).toEqual([10, 5]);
    await engine.playRound({ stopRequested: false }); // 0 left after this one
    await expect(engine.playRound({ stopRequested: false })).rejects.toThrow(
      "Not enough βytes"
    );
  });

  it("needs the page's windowID", async () => {
    const { engine, requests } = engineWith([spin(10)], {
      page: { windowId: null },
    });
    await expect(engine.playRound({ stopRequested: false })).rejects.toThrow(
      "windowID"
    );
    expect(requests).toHaveLength(0);
  });

  it("falls back to the default machine and rejects answers that aren't spins", async () => {
    const { engine, requests } = engineWith(
      [{ success: true } as unknown as SpinResponse],
      { page: { machineName: null } }
    );
    await expect(engine.playRound({ stopRequested: false })).rejects.toThrow(
      "didn't look like a spin"
    );
    expect(requests[0].form.machine_name).toBe("default");
  });
});

describe("slotsBet", () => {
  it("snaps to HF's steps", () => {
    expect(slotsBet(4, null)).toBe(3);
    expect(slotsBet(7, null)).toBe(5);
    expect(slotsBet(150, null)).toBe(100);
    expect(slotsBet(5000, null)).toBe(1000);
  });
});

describe("slots bot", () => {
  it("summarizes the session", () => {
    const values = (s: Partial<SlotsSettings>) =>
      ({ ...defaultSettings().games.slots, ...s }) as unknown as Record<
        string,
        number | boolean
      >;
    expect(slotsBot.summarize(values({ gamesPerSession: 25, bet: 1 }))).toBe(
      "Spin 25 times at 1 βyte?"
    );
    expect(slotsBot.summarize(values({ runUntilStopped: true, bet: 10 }))).toBe(
      "Spin until stopped at 10 βytes?"
    );
  });

  it("draws each spin on the page before returning it", async () => {
    const response = spin(2874, {
      id: "8",
      payoutCredits: 4,
      payoutWinnings: 4,
    });
    const display = jest.fn(async () => undefined);
    const { engine } = engineWith([response], {
      settings: { bet: 2 },
      display,
    });
    await engine.playRound({ stopRequested: false });
    expect(display).toHaveBeenCalledWith("spin", response, 2);
  });

  it("settles spins played by hand, and ignores anything else", () => {
    const fromPage = slotsBot.fromPage!;
    expect(
      fromPage(
        "spin",
        spin(2874, { id: "8", payoutCredits: 4, payoutWinnings: 4 }),
        1
      )
    ).toMatchObject({ outcome: "WIN", wagered: 1, returned: 4, balance: 2874 });
    expect(fromPage("spin", spin(2873), null)).toBeNull();
    expect(fromPage("spin", { success: false }, 1)).toBeNull();
    expect(fromPage("spin", "<html>", 1)).toBeNull();
  });
});
