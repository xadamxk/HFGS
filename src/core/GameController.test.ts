import { GameBot } from "../games/engine";
import { blackjack } from "../games/blackjack/definition";
import { slots } from "../games/slots/definition";
import { GameDefinition } from "../games/types";
import { defaultSettings, HfgsSettings, saveSettings } from "../settings";
import {
  GameController,
  GameControllerOptions,
  limitsFrom,
} from "./GameController";
import { HfClient } from "./HfClient";
import { loadHistory, recordRound, toEntry } from "./history";
import { BRIDGE_SOURCE } from "./pageBridge";

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
  bot: GameBot | null = fakeBot(),
  extra: Partial<GameControllerOptions> = {}
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
    ...extra,
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

  it("counts rounds played by hand in this visit and the history, but not while the bot runs", async () => {
    const bot = {
      ...fakeBot(),
      fromPage: jest.fn((_a: string, response: unknown) =>
        (response as { win: boolean }).win
          ? { outcome: "WIN", wagered: 1, returned: 4 }
          : null
      ),
    };
    const controller = setup(defaultSettings(), bot);
    await controller.init();
    const round = (response: unknown, game = "slots") =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          data: {
            source: BRIDGE_SOURCE,
            type: "round",
            game,
            action: "spin",
            response,
            bet: 1,
          },
        })
      );
    round({ win: true });
    round({ win: false });
    round({ win: true }, "blackjack");
    await flush();
    expect((await loadHistory("slots")).totals.rounds).toBe(1);
    expect(statRow("Rounds")).toEqual(["Rounds", "1", "1"]);
    expect(statRow("Net")).toEqual(["Net", "+3", "+3"]);
    expect(text(".hfgs-chart")).toContain("starts after 2 results");
    round({ win: true });
    await flush();
    expect(text(".hfgs-chart")).toContain("last 2 results: +6");
    controller.dispose();
  });

  it("in Headless Mode, syncs HF's counters after each bot round and draws nothing", async () => {
    const settings = defaultSettings();
    settings.global.confirmStart = false;
    settings.games.slots.gamesPerSession = 2;
    const show = jest.fn(async () => true);
    const sync = jest.fn();
    const bot = balanceBot();
    const controller = setup(settings, bot, {
      showOnPage: show,
      syncPage: sync,
    });
    await controller.init();
    await controller.start();
    expect(bot.displays).toEqual([null, null]);
    expect(show).not.toHaveBeenCalled();
    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync).toHaveBeenLastCalledWith(1001, { reels: [] });
    expect(statRow("Rounds")).toEqual(["Rounds", "2", "2"]);
    controller.dispose();
  });

  it("with Headless Mode off, has HF's page draw each bot action and marks the page as busy", async () => {
    const settings = defaultSettings();
    settings.global.confirmStart = false;
    settings.global.headless = false;
    settings.games.slots.gamesPerSession = 1;
    const busy: boolean[] = [];
    const show = jest.fn(async () => {
      busy.push(document.body.classList.contains("hfgs-running"));
      return true;
    });
    const sync = jest.fn();
    const bot = balanceBot();
    const controller = setup(settings, bot, {
      showOnPage: show,
      syncPage: sync,
    });
    await controller.init();
    await controller.start();
    expect(show).toHaveBeenCalledWith("spin", { credits: 1001 }, 1);
    expect(busy).toEqual([true]);
    expect(document.body.classList.contains("hfgs-running")).toBe(false);
    expect(sync).not.toHaveBeenCalled();
    controller.dispose();
  });
});

describe("GameController settings on the game page", () => {
  const input = (id: string) => document.getElementById(id) as HTMLInputElement;

  it("saves the game's and the global settings as soon as they change", async () => {
    const controller = setup();
    await controller.init();
    const bet = input("hfgs-slots-bet");
    bet.value = "7"; // not one of HF's bet steps: snaps to 5
    bet.dispatchEvent(new Event("change"));
    const headless = input("hfgs-global-headless");
    headless.checked = false;
    headless.dispatchEvent(new Event("change"));
    await flush();
    expect(bet.value).toBe("5");
    const saved = (await chrome.storage.local.get("settings")).settings;
    expect(saved.games.slots.bet).toBe(5);
    expect(saved.global.headless).toBe(false);
    expect(text(".hfgs-saved")).toBe("Saved");
    controller.dispose();
  });

  it("shows changes made on the settings page or in another tab", async () => {
    const controller = setup();
    await controller.init();
    const changed = defaultSettings();
    changed.games.slots.runUntilStopped = true;
    changed.global.stopLoss = 50;
    await saveSettings(changed);
    await flush();
    expect(input("hfgs-slots-runUntilStopped").checked).toBe(true);
    expect(input("hfgs-global-stopLoss").value).toBe("50");
    controller.dispose();
  });

  it("uses a setting changed on the page for the next round of a running bot", async () => {
    const settings = defaultSettings();
    settings.global.confirmStart = false;
    settings.games.slots.gamesPerSession = 3;
    const bot = fakeBot();
    const controller = setup(settings, bot);
    await controller.init();
    const run = controller.start();
    const bet = input("hfgs-slots-bet");
    bet.value = "10";
    bet.dispatchEvent(new Event("change"));
    await run;
    const wagers = (await loadHistory("slots")).entries.map((e) => e.wagered);
    expect(wagers[0]).toBe(10);
    controller.dispose();
  });
});

describe("GameController martingale section", () => {
  it("shows it only with martingale on, live, and redraws as rounds come in", async () => {
    const renders: (number | null)[] = [];
    const bot: GameBot = {
      ...fakeBot(),
      createHistoryView: () => ({
        title: "Martingale",
        element: Object.assign(document.createElement("div"), {
          className: "mg",
        }),
        visible: (values) => values.martingale === true,
        render: (_entries, { sessionStartedAt }) =>
          renders.push(sessionStartedAt),
      }),
    };
    document.body.replaceChildren();
    const settings = defaultSettings();
    settings.global.confirmStart = false;
    settings.games.blackjack.gamesPerSession = 1;
    const controller = new GameController({
      game: blackjack as unknown as GameDefinition,
      bot,
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
    await controller.init();
    const section = document.querySelector(".mg")!.closest("tr")!;
    expect(section.hidden).toBe(true);
    expect(renders).toEqual([]);

    const changed = defaultSettings();
    changed.global.confirmStart = false;
    changed.games.blackjack.martingale = true;
    changed.games.blackjack.gamesPerSession = 1;
    await saveSettings(changed);
    await flush();
    expect(section.hidden).toBe(false);
    renders.length = 0;
    await controller.start();
    // Running: a session time while the round is recorded; null once stopped
    expect(renders.some((at) => typeof at === "number")).toBe(true);
    expect(renders[renders.length - 1]).toBeNull();
    controller.dispose();
  });
});

describe("GameController sounds", () => {
  it("applies the saved mute setting, follows changes, and remembers HF's sound button", async () => {
    const settings = defaultSettings();
    settings.global.muteSounds = true;
    const setPageMuted = jest.fn();
    const controller = setup(settings, fakeBot(), { setPageMuted });
    await controller.init();
    expect(setPageMuted).toHaveBeenLastCalledWith(true);

    // The user clicks HF's sound button to turn sounds back on
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: { source: BRIDGE_SOURCE, type: "muted", muted: false },
      })
    );
    await flush();
    expect(
      (await chrome.storage.local.get("settings")).settings.global.muteSounds
    ).toBe(false);
    expect(setPageMuted).toHaveBeenLastCalledWith(false);

    // Changed on the settings page
    const changed = defaultSettings();
    changed.global.muteSounds = true;
    await saveSettings(changed);
    await flush();
    expect(setPageMuted).toHaveBeenLastCalledWith(true);
    expect(
      (document.getElementById("hfgs-global-muteSounds") as HTMLInputElement)
        .checked
    ).toBe(true);
    controller.dispose();
  });
});

describe("GameController assistant", () => {
  function assistantBot() {
    const updates: [string, unknown, string][] = [];
    const bot: GameBot = {
      ...fakeBot(),
      createEngine: ({ observe }) => ({
        playRound: async () => {
          observe?.("spin", { n: 1 });
          return { outcome: "LOSS", wagered: 1, returned: 0 };
        },
      }),
      createAssistant: () => ({
        title: "Helper",
        element: Object.assign(document.createElement("div"), {
          className: "helper",
        }),
        css: ".helper{}",
        update: (action, response, by) => updates.push([action, response, by]),
      }),
    };
    return { bot, updates };
  }

  it("shows the assistant under the controls and gives it the bot's and your answers", async () => {
    const settings = defaultSettings();
    settings.global.confirmStart = false;
    settings.games.slots.gamesPerSession = 1;
    const { bot, updates } = assistantBot();
    const controller = setup(settings, bot);
    await controller.init();
    expect(text(".tcat")).toBe("Helper");
    expect(document.getElementById("hfgs-assistant-styles")).not.toBeNull();

    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          source: BRIDGE_SOURCE,
          type: "round",
          game: "slots",
          action: "spin",
          response: { n: 0 },
          bet: 1,
        },
      })
    );
    await controller.start();
    expect(updates).toEqual([
      ["spin", { n: 0 }, "you"],
      ["spin", { n: 1 }, "bot"],
    ]);
    controller.dispose();
  });

  it("puts the assistant to the right of HF's game box when the page has one", async () => {
    const { bot } = assistantBot();
    document.body.innerHTML = `<table><tr><td><div id="PageContainer"><div id="PageContainerInner"></div></div></td></tr></table>`;
    const td = document.querySelector("td")!;
    const controller = new GameController({
      game,
      bot,
      settings: defaultSettings(),
      page,
      openSettings: jest.fn(),
    });
    const wrapper = td.firstElementChild!;
    expect(wrapper.className).toBe("hfgs-beside");
    expect(wrapper.children[0].id).toBe("PageContainer");
    expect(wrapper.children[1].querySelector(".helper")).not.toBeNull();
    expect(wrapper.children[1].textContent).toContain("Helper");
    expect(controller.panel.element.querySelector(".helper")).toBeNull();
  });

  it("hides the assistant when its setting is off, live", async () => {
    const { bot } = assistantBot();
    document.body.replaceChildren();
    const controller = new GameController({
      game: blackjack as unknown as GameDefinition,
      bot,
      settings: defaultSettings(),
      page,
      openSettings: jest.fn(),
    });
    document.body.replaceChildren(controller.panel.element);
    await controller.init();
    const section = document.querySelector(".helper")!.closest("tr")!;
    expect(section.hidden).toBe(false);
    const changed = defaultSettings();
    changed.games.blackjack.showAssistant = false;
    await saveSettings(changed);
    await flush();
    expect(section.hidden).toBe(true);
    controller.dispose();
  });
});

/** A bot whose engine draws each round through the page display, if any. */
function balanceBot(): GameBot & { displays: unknown[] } {
  const displays: unknown[] = [];
  return {
    displays,
    summarize: () => "Go?",
    createEngine: ({ display }) => ({
      playRound: async () => {
        const show = display?.() ?? null;
        displays.push(show);
        await show?.("spin", { credits: 1001 }, 1);
        return {
          outcome: "WIN",
          wagered: 1,
          returned: 2,
          balance: 1001,
          details: { reels: [] },
        };
      },
    }),
  };
}

function statRow(label: string): string[] {
  const row = [...document.querySelectorAll(".hfgs-stats tbody tr")].find(
    (tr) => tr.firstElementChild?.textContent === label
  );
  return row ? [...row.children].map((td) => td.textContent ?? "") : [];
}
