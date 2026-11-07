/**
 * The settings page's history view for one game: totals, the latest results,
 * CSV/JSON export and clearing. Re-renders itself when the stored history
 * changes (a bot playing in an open HF tab).
 */

import { el } from "../core/Dom";
import {
  clearHistory,
  GameHistory,
  HistoryEntry,
  loadHistory,
  Totals,
} from "../core/history";
import { STORAGE_KEYS } from "../core/storage";
import { formatAmount, formatWinRate } from "../core/ui/format";
import { GameDefinition } from "../games/types";

/**
 * The Hack Game's history in the same section: its entries are jobs (cash and
 * xp earned), not βytes bets. Used as the "game" for its history section.
 */
export const HACKGAME_HISTORY: GameDefinition = {
  id: "hackgame",
  name: "Hack Game",
  description: "",
  path: "/gamecp.php",
  settings: [],
  describeResult: (details) => String(details.job ?? ""),
};

const isJobs = (game: GameDefinition) => game.id === HACKGAME_HISTORY.id;
const cash = (n: number) => `$${n.toFixed(2)}`;
const xpOf = (entry: HistoryEntry) => Number(entry.details?.xp) || 0;

/** How many results the table shows; exports include every stored result. */
export const SHOWN_ENTRIES = 50;

/** CSV text cell, quoted when needed and guarded against spreadsheet formulas. */
function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A game's history as CSV, oldest first (the order spreadsheets expect). */
export function historyToCsv(
  game: GameDefinition,
  entries: HistoryEntry[]
): string {
  if (isJobs(game)) {
    const rows = [...entries]
      .reverse()
      .map((entry) =>
        [
          new Date(entry.at).toISOString(),
          csvText(String(entry.details?.job ?? "")),
          entry.outcome === "SUCCESS" ? "success" : "fail",
          entry.details?.rate ?? "",
          entry.returned,
          xpOf(entry),
        ].join(",")
      );
    return ["time,job,result,rate,cash,xp", ...rows].join("\r\n") + "\r\n";
  }
  const header = "time,outcome,wagered,returned,net,balance,details";
  const rows = [...entries]
    .reverse()
    .map((entry) =>
      [
        new Date(entry.at).toISOString(),
        csvText(entry.outcome),
        entry.wagered,
        entry.returned,
        entry.net,
        entry.balance ?? "",
        csvText(game.describeResult?.(entry.details ?? {}) ?? ""),
      ].join(",")
    );
  return [header, ...rows].join("\r\n") + "\r\n";
}

/** Save text as a file through the browser's download flow. */
export function download(filename: string, type: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = el("a", { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const dateStamp = () => new Date().toISOString().slice(0, 10);

function signClass(n: number): string | null {
  return n > 0 ? "pos" : n < 0 ? "neg" : null;
}

/** The Hack Game's totals: from the kept entries (the totals count bets). */
function jobsTotalsLine(entries: HistoryEntry[]): HTMLElement {
  const succeeded = entries.filter((e) => e.outcome === "SUCCESS").length;
  const item = (label: string, value: string) =>
    el("span", { class: "total" }, [label, " ", el("strong", null, value)]);
  return el("p", { class: "totals" }, [
    item("Jobs", String(entries.length)),
    item(
      "Succeeded",
      `${succeeded}${entries.length ? ` (${Math.round((succeeded / entries.length) * 100)}%)` : ""}`
    ),
    item("Cash", cash(entries.reduce((sum, e) => sum + e.returned, 0))),
    item("XP", entries.reduce((sum, e) => sum + xpOf(e), 0).toFixed(2)),
  ]);
}

function jobsTable(entries: HistoryEntry[]): HTMLElement {
  if (!entries.length)
    return el("p", { class: "description" }, "No jobs played by HFGS yet.");
  return el("div", { class: "results" }, [
    el("table", null, [
      el(
        "thead",
        null,
        el(
          "tr",
          null,
          ["Time", "Job", "Result", "Cash", "XP"].map((h) => el("th", null, h))
        )
      ),
      el(
        "tbody",
        null,
        entries.slice(0, SHOWN_ENTRIES).map((entry) => {
          const won = entry.outcome === "SUCCESS";
          return el("tr", null, [
            el("td", null, new Date(entry.at).toLocaleString()),
            el("td", { class: "details" }, String(entry.details?.job ?? "")),
            el(
              "td",
              { class: won ? "pos" : "neg" },
              `${won ? "Success" : "Fail"} (${entry.details?.rate ?? "?"}%)`
            ),
            el("td", { class: "num" }, cash(entry.returned)),
            el("td", { class: "num" }, xpOf(entry).toFixed(2)),
          ]);
        })
      ),
    ]),
    entries.length > SHOWN_ENTRIES
      ? el(
          "p",
          { class: "description" },
          `Showing the latest ${SHOWN_ENTRIES} of ${entries.length}. Exports include them all.`
        )
      : null,
  ]);
}

function totalsLine(totals: Totals): HTMLElement {
  const item = (label: string, value: string, cls?: string | null) =>
    el("span", { class: "total" }, [
      label,
      " ",
      el("strong", { class: cls ?? null }, value),
    ]);
  return el("p", { class: "totals" }, [
    item("Rounds", String(totals.rounds)),
    item("Won", String(totals.wins)),
    item("Lost", String(totals.losses)),
    item("Push", String(totals.pushes)),
    item("Wagered", formatAmount(totals.wagered)),
    item("Returned", formatAmount(totals.returned)),
    item("Net", formatAmount(totals.net, true), signClass(totals.net)),
    item(
      "Biggest win",
      formatAmount(totals.biggestWin, true),
      signClass(totals.biggestWin)
    ),
    item(
      "Biggest loss",
      formatAmount(totals.biggestLoss, true),
      signClass(totals.biggestLoss)
    ),
    item("Win rate", formatWinRate(totals)),
  ]);
}

function resultsTable(
  game: GameDefinition,
  entries: HistoryEntry[]
): HTMLElement {
  if (!entries.length)
    return el("p", { class: "description" }, "No results yet.");
  const headers = ["Time", "Result", "Wagered", "Returned", "Net", "Details"];
  return el("div", { class: "results" }, [
    el("table", null, [
      el(
        "thead",
        null,
        el(
          "tr",
          null,
          headers.map((h) => el("th", null, h))
        )
      ),
      el(
        "tbody",
        null,
        entries
          .slice(0, SHOWN_ENTRIES)
          .map((entry) =>
            el("tr", null, [
              el("td", null, new Date(entry.at).toLocaleString()),
              el("td", { class: signClass(entry.net) }, entry.outcome),
              el("td", { class: "num" }, formatAmount(entry.wagered)),
              el("td", { class: "num" }, formatAmount(entry.returned)),
              el(
                "td",
                { class: `num ${signClass(entry.net) ?? ""}`.trim() },
                formatAmount(entry.net, true)
              ),
              el(
                "td",
                { class: "details" },
                game.describeResult?.(entry.details ?? {}) ?? ""
              ),
            ])
          )
      ),
    ]),
    entries.length > SHOWN_ENTRIES
      ? el(
          "p",
          { class: "description" },
          `Showing the latest ${SHOWN_ENTRIES} of ${entries.length}. Exports include them all.`
        )
      : null,
  ]);
}

export interface HistorySection {
  element: HTMLElement;
  refresh: () => Promise<void>;
  dispose: () => void;
}

export async function renderHistorySection(
  game: GameDefinition,
  showStatus: (message: string, isError?: boolean) => void
): Promise<HistorySection> {
  const body = el("div");
  let history: GameHistory = await loadHistory(game.id);

  const exportCsv = el(
    "button",
    { type: "button", class: "secondary" },
    "Export CSV"
  );
  const exportJson = el(
    "button",
    { type: "button", class: "secondary" },
    "Export JSON"
  );
  const clear = el(
    "button",
    { type: "button", class: "secondary danger" },
    "Clear history"
  );

  exportCsv.addEventListener("click", () =>
    download(
      `hfgs-${game.id}-history-${dateStamp()}.csv`,
      "text/csv",
      historyToCsv(game, history.entries)
    )
  );
  exportJson.addEventListener("click", () =>
    download(
      `hfgs-${game.id}-history-${dateStamp()}.json`,
      "application/json",
      JSON.stringify(
        { game: game.id, exportedAt: new Date().toISOString(), ...history },
        null,
        2
      )
    )
  );

  // Clearing can't be undone, so it takes a second click within a few seconds.
  let armed: ReturnType<typeof setTimeout> | undefined;
  const disarm = () => {
    clearTimeout(armed);
    armed = undefined;
    clear.textContent = "Clear history";
  };
  clear.addEventListener("click", async () => {
    if (!armed) {
      clear.textContent = "Click again to clear";
      armed = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    try {
      await clearHistory(game.id);
      showStatus(`${game.name} history cleared.`);
    } catch (error) {
      showStatus(`Couldn't clear: ${(error as Error)?.message}`, true);
    }
  });

  const render = () => {
    const empty = history.totals.rounds === 0 && !history.entries.length;
    exportCsv.disabled = exportJson.disabled = clear.disabled = empty;
    body.replaceChildren(
      ...(isJobs(game)
        ? [jobsTotalsLine(history.entries), jobsTable(history.entries)]
        : [totalsLine(history.totals), resultsTable(game, history.entries)])
    );
  };
  const refresh = async () => {
    history = await loadHistory(game.id);
    render();
  };
  render();

  const key = STORAGE_KEYS.history(game.id);
  const onChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ) => {
    if (area === "local" && key in changes) refresh().catch(() => undefined);
  };
  chrome.storage.onChanged.addListener(onChanged);

  const element = el("section", { class: "history", "data-history": game.id }, [
    el("h3", { class: "history-title" }, "History"),
    body,
    el("div", { class: "actions" }, [exportCsv, exportJson, clear]),
  ]);
  return {
    element,
    refresh,
    dispose: () => chrome.storage.onChanged.removeListener(onChanged),
  };
}
