import { BRIDGE_SOURCE, CONTENT_SOURCE, readPageState } from "./pageBridge";

const STATE = {
  postKey: "f00d",
  windowId: "123",
  openGameState: null,
  blackjackPayout: 2.5,
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
    });
  });
});
