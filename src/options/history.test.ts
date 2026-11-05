import { recordRound, toEntry, loadHistory } from "../core/history";
import { blackjack } from "../games/blackjack/definition";
import { slots } from "../games/slots/definition";
import { GameDefinition } from "../games/types";
import { historyToCsv, renderHistorySection, SHOWN_ENTRIES } from "./history";
import { exportEverything } from "./options";

const bj = blackjack as unknown as GameDefinition;
const sl = slots as unknown as GameDefinition;
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

const handResult = (at: number, net: number) =>
  toEntry(
    {
      outcome: net > 0 ? "WIN" : net < 0 ? "LOSE" : "TIE",
      wagered: 2,
      returned: 2 + net,
      balance: 1000 + net,
      details: { player: ["12h", "6s"], dealer: ["1c", "8h"] },
    },
    at
  );

/** Capture what download() would save. */
function captureDownloads() {
  const saved: { name: string; blob: Blob }[] = [];
  let lastBlob: Blob | null = null;
  Object.assign(URL, {
    createObjectURL: jest.fn((blob: Blob) => {
      lastBlob = blob;
      return "blob:test";
    }),
    revokeObjectURL: jest.fn(),
  });
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    saved.push({ name: this.download, blob: lastBlob! });
  });
  return saved;
}

afterEach(() => jest.restoreAllMocks());

/** jsdom's Blob has no text(); read it the old way. */
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

describe("historyToCsv", () => {
  it("writes one row per result, oldest first, with the cards described", () => {
    const csv = historyToCsv(bj, [handResult(2000, -2), handResult(1000, 2)]);
    expect(csv.split("\r\n")).toEqual([
      "time,outcome,wagered,returned,net,balance,details",
      "1970-01-01T00:00:01.000Z,WIN,2,4,2,1002,Q♥ 6♠ vs A♣ 8♥",
      "1970-01-01T00:00:02.000Z,LOSE,2,0,-2,998,Q♥ 6♠ vs A♣ 8♥",
      "",
    ]);
  });

  it("quotes commas and quotes, and guards text against spreadsheet formulas", () => {
    const entry = toEntry(
      { outcome: '=HYPERLINK("x"), y', wagered: 1, returned: 0 },
      0
    );
    const row = historyToCsv(sl, [entry]).split("\r\n")[1];
    expect(row).toBe(
      `1970-01-01T00:00:00.000Z,"'=HYPERLINK(""x""), y",1,0,-1,,`
    );
  });

  it("describes split hands and slot reels", () => {
    const split = toEntry(
      {
        outcome: "WIN / TIE",
        wagered: 4,
        returned: 7,
        details: {
          player: ["1s", "11c"],
          player2: ["1d", "4c", "3h"],
          dealer: ["4c", "4h", "13h"],
        },
      },
      0
    );
    expect(historyToCsv(bj, [split])).toContain("A♠ J♣ | A♦ 4♣ 3♥ vs 4♣ 4♥ K♥");
    const spin = toEntry(
      {
        outcome: "WIN",
        wagered: 1,
        returned: 4,
        details: { reels: ["1.0", "3.0", "5.0"] },
      },
      0
    );
    expect(historyToCsv(sl, [spin])).toContain("Reels 1.0 3.0 5.0");
  });
});

describe("history section", () => {
  async function mount(game = bj) {
    const status = jest.fn();
    const section = await renderHistorySection(game, status);
    document.body.replaceChildren(section.element);
    return { section, status };
  }

  it("shows totals and the latest results, newest first", async () => {
    await recordRound("blackjack", handResult(1000, 2));
    await recordRound("blackjack", handResult(2000, -2));
    const { section } = await mount();
    const text = section.element.textContent!;
    expect(text).toContain("Rounds 2");
    expect(text).toContain("Net 0");
    const rows = [...section.element.querySelectorAll("tbody tr")].map(
      (r) => r.children[1].textContent
    );
    expect(rows).toEqual(["LOSE", "WIN"]);
    section.dispose();
  });

  it("caps the table but says exports include everything", async () => {
    for (let i = 0; i < SHOWN_ENTRIES + 5; i++)
      await recordRound(
        "slots",
        toEntry({ outcome: "LOSS", wagered: 1, returned: 0 }, i)
      );
    const { section } = await mount(sl);
    expect(section.element.querySelectorAll("tbody tr")).toHaveLength(
      SHOWN_ENTRIES
    );
    expect(section.element.textContent).toContain(
      `Showing the latest ${SHOWN_ENTRIES} of ${SHOWN_ENTRIES + 5}`
    );
    section.dispose();
  });

  it("disables export and clear when there's nothing stored", async () => {
    const { section } = await mount();
    const buttons = [...section.element.querySelectorAll("button")];
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(section.element.textContent).toContain("No results yet.");
    section.dispose();
  });

  it("exports CSV and JSON files", async () => {
    await recordRound("blackjack", handResult(1000, 2));
    const saved = captureDownloads();
    const { section } = await mount();
    const [csv, json] = section.element.querySelectorAll("button");
    csv.click();
    json.click();
    expect(saved.map((s) => s.name)).toEqual([
      expect.stringMatching(/^hfgs-blackjack-history-\d{4}-\d{2}-\d{2}\.csv$/),
      expect.stringMatching(/^hfgs-blackjack-history-\d{4}-\d{2}-\d{2}\.json$/),
    ]);
    const parsed = JSON.parse(await readBlob(saved[1].blob));
    expect(parsed).toMatchObject({
      game: "blackjack",
      totals: { rounds: 1, net: 2 },
    });
    section.dispose();
  });

  it("clears only after a second click", async () => {
    await recordRound("blackjack", handResult(1000, 2));
    const { section, status } = await mount();
    const clear = [...section.element.querySelectorAll("button")].find(
      (b) => b.textContent === "Clear history"
    )!;
    clear.click();
    await flush();
    expect((await loadHistory("blackjack")).totals.rounds).toBe(1);
    expect(clear.textContent).toBe("Click again to clear");
    clear.click();
    await flush();
    expect((await loadHistory("blackjack")).totals.rounds).toBe(0);
    expect(status).toHaveBeenCalledWith("Blackjack history cleared.");
    expect(section.element.textContent).toContain("No results yet.");
    section.dispose();
  });

  it("updates while a bot plays in another tab", async () => {
    const { section } = await mount(sl);
    await recordRound(
      "slots",
      toEntry({ outcome: "WIN", wagered: 1, returned: 4 }, 1)
    );
    await flush();
    expect(section.element.textContent).toContain("Rounds 1");
    section.dispose();
  });
});

describe("exportEverything", () => {
  it("bundles settings and every game's history", async () => {
    await recordRound(
      "slots",
      toEntry({ outcome: "WIN", wagered: 1, returned: 4 }, 1)
    );
    const backup = await exportEverything();
    expect(Object.keys(backup.history)).toEqual(["blackjack", "slots"]);
    expect(backup.history.slots.totals.net).toBe(3);
    expect(backup.settings.games.slots.bet).toBe(1);
  });
});
