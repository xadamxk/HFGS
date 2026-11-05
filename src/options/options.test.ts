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
  it("has a section for the global settings and each game", async () => {
    const root = await render();
    const sections = [...root.querySelectorAll("section[data-game]")].map(
      (section) => section.getAttribute("data-game")
    );
    expect(sections).toEqual(["global", ...GAMES.map((game) => game.id)]);
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
    fromGamePage.global.headless = false;
    await saveSettings(fromGamePage);
    await flush();
    expect(input(root, "blackjack-baseBet").value).toBe("40");
    expect(input(root, "global-headless").checked).toBe(false);

    const games = input(root, "blackjack-gamesPerSession");
    games.value = "3";
    games.dispatchEvent(new Event("change"));
    await flush();
    const saved = await loadSettings();
    expect(saved.games.blackjack).toMatchObject({
      baseBet: 40,
      gamesPerSession: 3,
    });
    expect(saved.global.headless).toBe(false);
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

  it("lists settings first, then each game's history", async () => {
    const root = await render();
    const groups = [...root.querySelectorAll("h2.group")].map(
      (h) => h.textContent
    );
    expect(groups).toEqual(["Settings", "History"]);
    const history = [...root.querySelectorAll("section[data-history]")].map(
      (section) => section.getAttribute("data-history")
    );
    expect(history).toEqual(GAMES.map((game) => game.id));
  });
});
