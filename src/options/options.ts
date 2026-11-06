import { el } from "../core/Dom";
import { loadHistory } from "../core/history";
import { GAMES } from "../games/registry";
import { download, HistorySection, renderHistorySection } from "./history";
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
    GAMES.map((game) => renderHistorySection(game, showStatus))
  );

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

  root.replaceChildren(
    el("header", null, [
      el("img", { src: "assets/icons/icon48.png", alt: "", width: 32 }),
      el("h1", null, "HF Gaming Suite"),
    ]),
    el("h2", { class: "group" }, "Settings"),
    ...gameSections,
    hackgameSection,
    reset,
    el("h2", { class: "group" }, "History"),
    el(
      "p",
      { class: "description intro" },
      "Results the bots played, kept in this browser only."
    ),
    ...activeHistory.map((section) => section.element),
    el("div", { class: "actions" }, [exportAll]),
    status
  );
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
        GAMES.map(
          async (game) => [game.id, await loadHistory(game.id)] as const
        )
      )
    ),
  };
}
