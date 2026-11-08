import { toEntry } from "../history";
import { BotPanel, RECENT_RESULTS } from "./BotPanel";

function panel(): BotPanel {
  const p = new BotPanel({
    gameName: "Slots",
    gameId: "slots",
    botAvailable: true,
    onStart: jest.fn(),
    onStop: jest.fn(),
    onOpenSettings: jest.fn(),
  });
  document.body.replaceChildren(p.element);
  return p;
}
const entries = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    toEntry({ outcome: "WIN", wagered: 2, returned: 4 }, 1000 + i)
  ).reverse();
const rows = () => document.querySelectorAll(".hfgs-history tbody tr");

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe("Recent results", () => {
  it("holds up to 100 results, newest first", () => {
    expect(RECENT_RESULTS).toBe(100);
    const p = panel();
    p.setHistory(entries(150));
    expect(rows()).toHaveLength(100);
    p.setHistory(entries(40));
    expect(rows()).toHaveLength(40);
  });

  it("says so when there are none", () => {
    panel();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toBe("No results yet.");
  });

  it("scrolls inside a fixed-height box with the headings kept in view", () => {
    BotPanel.injectStyles();
    const css = document.getElementById("hfgs-panel-styles")!.textContent!;
    expect(css).toMatch(
      /\.hfgs-panel \.hfgs-history \{ height: \d+px; overflow-y: auto; \}/
    );
    expect(css).toMatch(/\.hfgs-history thead th \{ position: sticky; top: 0;/);
  });
});
