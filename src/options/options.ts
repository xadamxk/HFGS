import { el } from "../core/Dom";
import { loadHistory } from "../core/history";
import { GAMES } from "../games/registry";
import {
  download,
  HACKGAME_HISTORY,
  HistorySection,
  renderHistorySection,
} from "./history";
import { SettingValues } from "../settings/definitions";
import { settingsForm } from "../settings/form";
import { HACKGAME_SETTINGS, HackGameSettings } from "../hackgame/settings";
import { jobsView, JobsView } from "../hackgame/jobsView";
import {
  HfgsSettings,
  defaultSettings,
  loadSettings,
  saveSettings,
  watchSettings,
} from "../settings";

/**
 * The settings page: a section per game (each with its own bot settings) and
 * one for the Hack Game, all
 * generated from their definitions and saved as soon as anything changes. Open
 * game pages pick changes up right away (see watchSettings).
 */
export async function renderOptions(root: HTMLElement): Promise<void> {
  let settings = await loadSettings();
  const status = el("p", { class: "status", role: "status" });
  let statusTimer: ReturnType<typeof setTimeout> | undefined;

  const showStatus = (message: string, isError = false) => {
    status.textContent = message;
    status.classList.toggle("error", isError);
    clearTimeout(statusTimer);
    if (!isError) {
      statusTimer = setTimeout(() => (status.textContent = ""), 2500);
    }
  };

  const persist = async (next: HfgsSettings) => {
    settings = next;
    try {
      await saveSettings(settings);
      showStatus("Saved.");
    } catch (error) {
      showStatus(`Couldn't save: ${(error as Error)?.message}`, true);
    }
  };

  const gameForms = new Map<string, ReturnType<typeof settingsForm>>();
  const gameForm = (game: (typeof GAMES)[number]) => {
    const form = settingsForm(
      game.id,
      game.settings,
      settings.games[game.id],
      (change) =>
        persist({
          ...settings,
          games: {
            ...settings.games,
            [game.id]: { ...settings.games[game.id], ...change },
          },
        })
    );
    gameForms.set(game.id, form);
    return form.element;
  };
  const gameSections = GAMES.map((game) =>
    el("section", { "data-game": game.id }, [
      el("h2", null, game.name),
      el("p", { class: "description intro" }, game.description),
      gameForm(game),
    ])
  );

  const hackgameForm = settingsForm(
    "hackgame",
    HACKGAME_SETTINGS,
    settings.hackgame as unknown as SettingValues,
    (change) =>
      persist({
        ...settings,
        hackgame: { ...settings.hackgame, ...change } as HackGameSettings,
      })
  );
  activeJobs?.dispose();
  activeJobs = jobsView();
  const hackgameSection = el("section", { "data-game": "hackgame" }, [
    el("h2", null, "Hack Game"),
    el(
      "p",
      { class: "description intro" },
      "Plays the Small Hack Job you picked in HF's list whenever the cooldown is over, pauses when power runs low and starts again once the battery has recharged. Start and stop it from the panel on any Hack Game page, or, with Run in background off, play one job at a time from the status card's Hack button."
    ),
    activeJobs.element,
    hackgameForm.element,
  ]);

  const reset = el("button", { type: "button", class: "secondary" }, [
    "Reset all settings to defaults",
  ]);
  reset.addEventListener("click", async () => {
    await persist(defaultSettings());
    await renderOptions(root);
  });

  // Settings changed on a game page while this page is open: show them, and
  // build on them so the next save here doesn't undo them.
  stopWatchingSettings?.();
  stopWatchingSettings = watchSettings((next) => {
    settings = next;
    for (const [id, form] of gameForms) form.setValues(next.games[id]);
    hackgameForm.setValues(next.hackgame as unknown as SettingValues);
  });

  // History sections listen for storage changes; drop the old ones on re-render.
  activeHistory.forEach((section) => section.dispose());
  activeHistory = await Promise.all(
    [...GAMES, HACKGAME_HISTORY].map((game) =>
      renderHistorySection(game, showStatus)
    )
  );
  const historyFor = (id: string) =>
    activeHistory.find((h) => h.element.dataset.history === id)?.element ??
    null;

  const exportAll = el(
    "button",
    { type: "button", class: "secondary" },
    "Export everything (JSON)"
  );
  exportAll.addEventListener("click", async () => {
    try {
      download(
        `hfgs-backup-${new Date().toISOString().slice(0, 10)}.json`,
        "application/json",
        JSON.stringify(await exportEverything(), null, 2)
      );
    } catch (error) {
      showStatus(`Couldn't export: ${(error as Error)?.message}`, true);
    }
  });

  // One tab per game: its settings, then its history
  const tabs = [
    ...GAMES.map((game, i) => ({
      id: game.id,
      name: game.name,
      content: [gameSections[i], historyFor(game.id)],
    })),
    {
      id: "hackgame",
      name: "Hack Game",
      content: [hackgameSection, historyFor("hackgame")],
    },
  ];

  root.replaceChildren(
    el("header", null, [
      el("span", { class: "logo", "aria-hidden": "true" }),
      el("h1", null, "HF Gaming Suite"),
    ]),
    gameTabs(tabs),
    el("div", { class: "actions page-actions" }, [reset, exportAll]),
    el(
      "p",
      { class: "description" },
      "Settings and history are kept in this browser only."
    ),
    status
  );
}

let onHashChange: (() => void) | null = null;

interface Tab {
  id: string;
  name: string;
  content: (HTMLElement | null)[];
}

/**
 * Tabs, one per game. The open tab is kept in the address (#slots), so a
 * reload or a link opens the same one; arrow keys move between tabs.
 */
export function gameTabs(tabs: Tab[]): HTMLElement {
  const fromHash = () =>
    tabs.find((tab) => `#${tab.id}` === location.hash)?.id ?? tabs[0].id;
  const buttons = tabs.map((tab) =>
    el(
      "button",
      {
        type: "button",
        role: "tab",
        id: `tab-${tab.id}`,
        class: "tab",
        "aria-controls": `panel-${tab.id}`,
      },
      tab.name
    )
  );
  const panels = tabs.map((tab) =>
    el(
      "div",
      {
        role: "tabpanel",
        id: `panel-${tab.id}`,
        class: "tab-panel",
        "aria-labelledby": `tab-${tab.id}`,
      },
      tab.content
    )
  );
  const select = (id: string, focus = false) => {
    tabs.forEach((tab, i) => {
      const on = tab.id === id;
      buttons[i].setAttribute("aria-selected", String(on));
      buttons[i].tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
      if (on && focus) buttons[i].focus();
    });
    if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  };
  buttons.forEach((button, i) => {
    button.addEventListener("click", () => select(tabs[i].id));
    button.addEventListener("keydown", (event) => {
      const step =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      select(tabs[(i + step + tabs.length) % tabs.length].id, true);
    });
  });
  select(fromHash());
  // A link or the back button changing the address switches tabs too
  if (onHashChange) window.removeEventListener("hashchange", onHashChange);
  onHashChange = () => select(fromHash());
  window.addEventListener("hashchange", onHashChange);
  return el("div", { class: "tabs" }, [
    el(
      "div",
      { class: "tab-list", role: "tablist", "aria-label": "Games" },
      buttons
    ),
    ...panels,
  ]);
}

let activeHistory: HistorySection[] = [];
let activeJobs: JobsView | null = null;
let stopWatchingSettings: (() => void) | null = null;

/** Settings plus every game's history, for a backup file. */
export async function exportEverything() {
  return {
    exportedAt: new Date().toISOString(),
    version: chrome.runtime.getManifest?.().version ?? null,
    settings: await loadSettings(),
    history: Object.fromEntries(
      await Promise.all(
        [...GAMES, HACKGAME_HISTORY].map(
          async (game) => [game.id, await loadHistory(game.id)] as const
        )
      )
    ),
  };
}
