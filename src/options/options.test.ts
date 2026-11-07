import { GAMES } from "../games/registry";
import { loadSettings, saveSettings } from "../settings";
import { renderOptions } from "./options";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function render(): Promise<HTMLElement> {
  const root = document.createElement("main");
  document.body.replaceChildren(root);
  await renderOptions(root);
  return root;
}

function input(root: HTMLElement, id: string): HTMLInputElement {
  const found = root.querySelector<HTMLInputElement>(`#${id}`);
  if (!found) throw new Error(`No input #${id}`);
  return found;
}

describe("options page", () => {
  it("has a section for each game and the Hack Game, with no shared section", async () => {
    const root = await render();
    const sections = [...root.querySelectorAll("section[data-game]")].map(
      (section) => section.getAttribute("data-game")
    );
    expect(sections).toEqual([...GAMES.map((game) => game.id), "hackgame"]);
  });

  it("saves a game setting as soon as it changes", async () => {
    const root = await render();
    const bet = input(root, "blackjack-baseBet");
    bet.value = "25";
    bet.dispatchEvent(new Event("change"));
    await flush();
    expect((await loadSettings()).games.blackjack.baseBet).toBe(25);
  });

  it("shows settings changed on a game page, and doesn't undo them on its next save", async () => {
    const root = await render();
    const fromGamePage = await loadSettings();
    fromGamePage.games.blackjack.baseBet = 40;
    fromGamePage.games.blackjack.headless = false;
    await saveSettings(fromGamePage);
    await flush();
    expect(input(root, "blackjack-baseBet").value).toBe("40");
    expect(input(root, "blackjack-headless").checked).toBe(false);

    const games = input(root, "blackjack-gamesPerSession");
    games.value = "3";
    games.dispatchEvent(new Event("change"));
    await flush();
    const saved = await loadSettings();
    expect(saved.games.blackjack).toMatchObject({
      baseBet: 40,
      gamesPerSession: 3,
    });
    expect(saved.games.blackjack.headless).toBe(false);
  });

  it("clamps and rounds number input to the setting's limits", async () => {
    const root = await render();
    const multiplier = input(root, "blackjack-martingaleMultiplier");
    multiplier.value = "2.33";
    multiplier.dispatchEvent(new Event("change"));
    await flush();
    expect(multiplier.value).toBe("2.35");
    expect((await loadSettings()).games.blackjack.martingaleMultiplier).toBe(
      2.35
    );
  });

  it("keeps the same setting id in different games apart", async () => {
    const root = await render();
    const blackjackRun = input(root, "blackjack-runUntilStopped");
    blackjackRun.checked = true;
    blackjackRun.dispatchEvent(new Event("change"));
    await flush();
    const settings = await loadSettings();
    expect(settings.games.blackjack.runUntilStopped).toBe(true);
    expect(settings.games.slots.runUntilStopped).toBe(false);
  });

  it("disables settings whose checkbox is off, and enables them when it's on", async () => {
    const root = await render();
    const multiplier = input(root, "blackjack-martingaleMultiplier");
    expect(multiplier.disabled).toBe(true);

    const martingale = input(root, "blackjack-martingale");
    martingale.checked = true;
    martingale.dispatchEvent(new Event("change"));
    expect(multiplier.disabled).toBe(false);
  });

  it("has a tab per game with its settings, then its history; reset comes after the tabs", async () => {
    history.replaceState(null, "", "#");
    const root = await render();
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Blackjack",
      "Slots",
      "Hack Game",
    ]);
    const panels = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(
      panels.map((panel) =>
        [...panel.querySelectorAll("section")].map(
          (s) => s.dataset.game ?? `history:${s.dataset.history}`
        )
      )
    ).toEqual([
      ["blackjack", "history:blackjack"],
      ["slots", "history:slots"],
      ["hackgame", "history:hackgame"],
    ]);
    // The first tab is open; the others are hidden
    expect(panels.map((p) => p.hidden)).toEqual([false, true, true]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    // Reset all settings comes after the tabs' contents
    const reset = [...root.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Reset all settings")
    )!;
    const tabsBox = root.querySelector(".tabs")!;
    expect(
      tabsBox.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(tabsBox.contains(reset)).toBe(false);
  });

  it("switches tabs by click and arrow keys, and keeps the open tab in the address", async () => {
    history.replaceState(null, "", "#");
    const root = await render();
    const tab = (name: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
        (t) => t.textContent === name
      )!;
    const open = () =>
      [...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')].find(
        (p) => !p.hidden
      )!.id;
    tab("Slots").click();
    expect(open()).toBe("panel-slots");
    expect(location.hash).toBe("#slots");
    tab("Slots").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight" })
    );
    expect(open()).toBe("panel-hackgame");
    tab("Hack Game").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight" })
    );
    expect(open()).toBe("panel-blackjack");

    // A reload (or a link) with #hackgame opens that tab
    history.replaceState(null, "", "#hackgame");
    const again = await render();
    expect(
      [...again.querySelectorAll<HTMLElement>('[role="tabpanel"]')].find(
        (p) => !p.hidden
      )!.id
    ).toBe("panel-hackgame");
  });
});
