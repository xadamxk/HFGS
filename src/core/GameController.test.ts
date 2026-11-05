import { GameBot } from "../games/engine";
import { slots } from "../games/slots/definition";
import { GameDefinition } from "../games/types";
import { defaultSettings, HfgsSettings, saveSettings } from "../settings";
import { GameController, limitsFrom } from "./GameController";
import { HfClient } from "./HfClient";
import { loadHistory, recordRound, toEntry } from "./history";

const game = slots as unknown as GameDefinition;
const page = {
  postKey: "key",
  windowId: "1",
  openGameState: null,
  blackjackPayout: null,
  machineName: null,
};
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

/** A bot whose rounds alternate win/loss at the current bet setting. */
function fakeBot(): GameBot & { rounds: number } {
  const bot = {
    rounds: 0,
    summarize: (s: Record<string, unknown>) =>
      `Spin ${s.gamesPerSession} times?`,
    createEngine: ({
      gameSettings,
    }: Parameters<GameBot["createEngine"]>[0]) => ({
      playRound: async () => {
        const bet = Number(gameSettings().bet);
        const won = bot.rounds++ % 2 === 0;
        return {
          outcome: won ? "WIN" : "LOSS",
          wagered: bet,
          returned: won ? bet * 3 : 0,
        };
      },
    }),
  };
  return bot;
}

function setup(
  settings: HfgsSettings = defaultSettings(),
  bot: GameBot | null = fakeBot()
) {
  const controller = new GameController({
    game,
    bot: bot ?? undefined,
    settings,
    page,
    client: new HfClient({
      postKey: "key",
      minIntervalMs: 0,
      fetch: jest.fn(),
    }),
    openSettings: jest.fn(),
  });
  document.body.replaceChildren(controller.panel.element);
  return controller;
}

const text = (selector: string) =>
  document.querySelector(selector)?.textContent ?? "";
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent === label && !b.hidden
  ) as HTMLButtonElement | undefined;

describe("limitsFrom", () => {
  it("uses the round count unless running until stopped", () => {
    const { global } = defaultSettings();
    expect(
      limitsFrom(
        { ...global, stopLoss: 50 },
        { gamesPerSession: 7, runUntilStopped: false }
      )
    ).toEqual({
      maxRounds: 7,
      stopLoss: 50,
      takeProfit: 0,
    });
    expect(
      limitsFrom(global, { gamesPerSession: 7, runUntilStopped: true })
        .maxRounds
    ).toBeNull();
  });
});

describe("GameController", () => {
  it("shows stored totals and history when it loads", async () => {
    await recordRound(
      "slots",
      toEntry({ outcome: "WIN", wagered: 1, returned: 4 }, Date.now())
    );
    const controller = setup();
    await controller.init();
    expect(text(".hfgs-history tbody")).toContain("WIN");
    expect(text(".hfgs-history tbody")).toContain("+3");
    controller.dispose();
  });

  it("asks before starting, then plays a session and records every round", async () => {
    const settings = defaultSettings();
    settings.games.slots.gamesPerSession = 4;
    const controller = setup(settings);
    await controller.init();

    const run = controller.start();
    expect(text(".hfgs-controls")).toContain("Spin 4 times?");
    button("Start")!.click();
    await run;

    const history = await loadHistory("slots");
    expect(history.totals).toMatchObject({
      rounds: 4,
      wins: 2,
      losses: 2,
      net: 2,
    });
    expect(text(".hfgs-status")).toBe("Finished 4 rounds.");
    expect(button("Start bot")).toBeDefined();
    controller.dispose();
  });

  it("does nothing when the start is cancelled", async () => {
    const bot = fakeBot();
    const controller = setup(defaultSettings(), bot);
    const run = controller.start();
    button("Cancel")!.click();
    await run;
    expect(bot.rounds).toBe(0);
  });

  it("skips the question when confirmation is off, and applies settings changed mid-session", async () => {
    const settings = defaultSettings();
    settings.global.confirmStart = false;
    settings.games.slots.gamesPerSession = 2;
    const controller = setup(settings);
    await controller.init();

    const changed = defaultSettings();
    changed.global.confirmStart = false;
    changed.games.slots.bet = 10;
    changed.games.slots.gamesPerSession = 2;
    await saveSettings(changed);
    await controller.start();

    const history = await loadHistory("slots");
    expect(history.entries.map((e) => e.wagered)).toEqual([10, 10]);
    controller.dispose();
  });

  it("refuses to start without a post key", async () => {
    const settings = defaultSettings();
    settings.global.confirmStart = false;
    const bot = fakeBot();
    const controller = new GameController({
      game,
      bot,
      settings,
      page: { ...page, postKey: null },
      openSettings: jest.fn(),
    });
    document.body.replaceChildren(controller.panel.element);
    await controller.start();
    expect(bot.rounds).toBe(0);
    expect(text(".hfgs-status")).toContain("signed in");
  });

  it("has no Start button for a game without a bot", () => {
    setup(defaultSettings(), null);
    expect(
      (document.querySelector(".hfgs-controls button") as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(text(".hfgs-status")).toContain("isn't available yet");
  });

  it("refreshes when the history is cleared elsewhere", async () => {
    await recordRound(
      "slots",
      toEntry({ outcome: "WIN", wagered: 1, returned: 4 }, 1)
    );
    const controller = setup();
    await controller.init();
    await chrome.storage.local.remove("history:slots");
    await flush();
    expect(text(".hfgs-history tbody")).toContain("No results yet.");
    controller.dispose();
  });
});
