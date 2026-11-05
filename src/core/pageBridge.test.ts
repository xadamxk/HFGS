import { GAMES } from "../games/registry";
import {
  BRIDGE_SOURCE,
  CONTENT_SOURCE,
  gameIdForPath,
  onManualRound,
  PAGE_GAME_PATHS,
  readPageState,
  showOnPage,
  syncPage,
} from "./pageBridge";

const STATE = {
  postKey: "f00d",
  windowId: "123",
  openGameState: null,
  blackjackPayout: 2.5,
  machineName: null,
};

function reply(data: unknown, source: MessageEventSource | null = window) {
  window.dispatchEvent(new MessageEvent("message", { data, source }));
}

describe("readPageState", () => {
  afterEach(() => jest.useRealTimers());

  it("asks the bridge and resolves with its answer", async () => {
    const requests: unknown[] = [];
    const spy = jest
      .spyOn(window, "postMessage")
      .mockImplementation((message: unknown) => {
        requests.push(message);
      });
    const pending = readPageState();
    expect(requests).toEqual([
      { source: CONTENT_SOURCE, type: "request-state" },
    ]);
    reply({ source: BRIDGE_SOURCE, type: "state", state: STATE });
    await expect(pending).resolves.toEqual(STATE);
    spy.mockRestore();
  });

  it("ignores messages that aren't from the bridge or are malformed", async () => {
    jest.useFakeTimers();
    jest.spyOn(window, "postMessage").mockImplementation(() => undefined);
    document.head.innerHTML = `<script>var my_post_key = "beef";</script>`;
    const pending = readPageState(500);
    reply({ source: "someone-else", type: "state", state: STATE });
    reply({ source: BRIDGE_SOURCE, type: "state", state: { postKey: 42 } });
    reply({ source: BRIDGE_SOURCE, type: "state", state: STATE }, null);
    jest.advanceTimersByTime(500);
    // Timed out: falls back to the post key in the page's markup
    await expect(pending).resolves.toEqual({
      postKey: "beef",
      windowId: null,
      openGameState: null,
      blackjackPayout: null,
      machineName: null,
    });
  });
});

describe("page display messages", () => {
  afterEach(() => jest.restoreAllMocks());

  it("asks the bridge to draw a response and resolves when it's drawn", async () => {
    const sent: Record<string, unknown>[] = [];
    jest.spyOn(window, "postMessage").mockImplementation((message: unknown) => {
      sent.push(message as Record<string, unknown>);
    });
    const pending = showOnPage("deal", { data: 1 }, 2);
    expect(sent[0]).toMatchObject({
      source: CONTENT_SOURCE,
      type: "show",
      action: "deal",
      response: { data: 1 },
      bet: 2,
    });
    const id = sent[0].id;
    reply({
      source: BRIDGE_SOURCE,
      type: "shown",
      id: Number(id) + 1,
      ok: true,
    });
    reply({ source: BRIDGE_SOURCE, type: "shown", id, ok: true });
    await expect(pending).resolves.toBe(true);
  });

  it("gives up after the timeout so the bot never waits forever", async () => {
    jest.useFakeTimers();
    jest.spyOn(window, "postMessage").mockImplementation(() => undefined);
    const pending = showOnPage("spin", {}, 1, 1000);
    jest.advanceTimersByTime(1000);
    await expect(pending).resolves.toBe(false);
  });

  it("sends headless syncs and passes on rounds played by hand", () => {
    const sent: unknown[] = [];
    jest.spyOn(window, "postMessage").mockImplementation((message: unknown) => {
      sent.push(message);
    });
    syncPage(2880, { prizeId: "8" });
    expect(sent).toEqual([
      {
        source: CONTENT_SOURCE,
        type: "sync",
        balance: 2880,
        details: { prizeId: "8" },
      },
    ]);

    const listener = jest.fn();
    const stop = onManualRound(listener);
    const round = { game: "slots", action: "spin", response: { a: 1 }, bet: 1 };
    reply({ source: BRIDGE_SOURCE, type: "round", ...round });
    reply({ source: "someone-else", type: "round", ...round });
    reply({ source: BRIDGE_SOURCE, type: "round", ...round }, null);
    stop();
    reply({ source: BRIDGE_SOURCE, type: "round", ...round });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(round);
  });

  it("knows the same game pages as the registry", () => {
    for (const game of GAMES) {
      expect(gameIdForPath(game.path)).toBe(game.id);
    }
    expect(Object.keys(PAGE_GAME_PATHS)).toHaveLength(GAMES.length);
    expect(gameIdForPath("/index.php")).toBeNull();
  });
});
