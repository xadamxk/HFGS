import { slots } from "../../games/slots/definition";
import { HackGamePanel } from "../../hackgame/panel";
import { defaultSettings } from "../../settings";
import { GameController } from "../GameController";
import { HfClient } from "../HfClient";
import { BotPanel } from "./BotPanel";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function panel(): BotPanel {
  const p = new BotPanel({
    gameName: "Blackjack",
    gameId: "blackjack",
    botAvailable: true,
    onStart: jest.fn(),
    onStop: jest.fn(),
    onOpenSettings: jest.fn(),
  });
  document.body.replaceChildren(p.element);
  return p;
}
const toggleIn = (text: string) =>
  [...document.querySelectorAll<HTMLElement>("td.tcat")]
    .find((td) => td.textContent?.includes(text))!
    .querySelector("button.hfgs-collapse") as HTMLButtonElement;

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe("Hide/Show on the panel's sections", () => {
  it("collapses Totals (with recent results and the chart), and remembers it", async () => {
    panel();
    await flush();
    const stats = document.querySelector(".hfgs-history")!.closest("td")!
      .parentElement as HTMLTableRowElement;
    const chart = document.querySelector("td.trow2")!
      .parentElement as HTMLTableRowElement;
    const toggle = toggleIn("Recent results");
    expect(toggle.textContent).toBe("▲ Hide");
    expect([stats.hidden, chart.hidden]).toEqual([false, false]);

    toggle.click();
    expect(toggle.textContent).toBe("▼ Show");
    expect([stats.hidden, chart.hidden]).toEqual([true, true]);
    await flush();
    expect(
      (await chrome.storage.local.get("ui:collapsed:blackjack:totals"))[
        "ui:collapsed:blackjack:totals"
      ]
    ).toBe(true);

    // Next page load: still collapsed
    panel();
    await flush();
    expect(toggleIn("Recent results").textContent).toBe("▼ Show");
  });

  it("collapses a section like Martingale, without fighting its own show/hide", async () => {
    const p = panel();
    const content = document.createElement("div");
    content.textContent = "Martingale sets";
    const setVisible = p.addSection("Martingale", content, "martingale");
    await flush();
    const body = content.closest("tr")!;
    const head = toggleIn("Martingale").closest("tr")!;

    toggleIn("Martingale").click();
    expect(body.hidden).toBe(true);
    expect(head.hidden).toBe(false);

    // Martingale off hides the whole section; back on, it stays collapsed
    setVisible(false);
    expect([head.hidden, body.hidden]).toEqual([true, true]);
    setVisible(true);
    expect([head.hidden, body.hidden]).toEqual([false, true]);

    toggleIn("Martingale").click();
    expect(body.hidden).toBe(false);
  });

  it("leaves sections without a toggle alone", () => {
    const p = panel();
    p.addSection("Strategy assistant", document.createElement("div"));
    const head = [...document.querySelectorAll<HTMLElement>("td.tcat")].find(
      (td) => td.textContent === "Strategy assistant"
    )!;
    expect(head.querySelector("button")).toBeNull();
  });
});

describe("Hide/Show on slots and the Hack Game", () => {
  it("gives slots' Settings section a toggle", async () => {
    document.body.replaceChildren();
    const controller = new GameController({
      game: slots as never,
      bot: undefined,
      settings: defaultSettings(),
      page: {
        postKey: "key",
        windowId: "1",
        openGameState: null,
        blackjackPayout: null,
        machineName: null,
      },
      client: new HfClient({
        postKey: "key",
        minIntervalMs: 0,
        fetch: jest.fn(),
      }),
      openSettings: jest.fn(),
    });
    document.body.append(controller.panel.element);
    await flush();
    const toggle = toggleIn("Settings");
    const body = document
      .querySelector("#hfgs-slots-bet")!
      .closest("td")!
      .closest("tr") as HTMLTableRowElement;
    let row: HTMLElement | null = body;
    // The section's row is the outer one, under the Settings heading
    while (
      row &&
      row.parentElement?.closest("table") !== controller.panel.element
    )
      row = row.parentElement?.closest("tr") ?? null;
    toggle.click();
    expect(row!.hidden).toBe(true);
    await flush();
    expect(
      (await chrome.storage.local.get("ui:collapsed:slots:settings"))[
        "ui:collapsed:slots:settings"
      ]
    ).toBe(true);
  });

  it("gives the Hack Game's Settings and Totals toggles", async () => {
    const hg = new HackGamePanel();
    document.body.replaceChildren(hg.element);
    await flush();
    const settings = toggleIn("Settings");
    const totals = toggleIn("Recent jobs");
    const settingsRow = settings.closest("tr")!
      .nextElementSibling as HTMLElement;
    const totalsRow = totals.closest("tr")!.nextElementSibling as HTMLElement;
    settings.click();
    totals.click();
    expect([settingsRow.hidden, totalsRow.hidden]).toEqual([true, true]);
    await flush();
    const stored = await chrome.storage.local.get([
      "ui:collapsed:hackgame:settings",
      "ui:collapsed:hackgame:totals",
    ]);
    expect(stored).toEqual({
      "ui:collapsed:hackgame:settings": true,
      "ui:collapsed:hackgame:totals": true,
    });
  });
});
