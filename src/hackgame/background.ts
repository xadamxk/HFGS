/**
 * Hack Game auto-play from the background script, used while "Run in
 * background" is on. chrome.alarms wakes the (possibly stopped) service worker
 * when the next step is due, so no HF tab needs to be open.
 */
import { Logger } from "../core/Logger";
import { STORAGE_KEYS } from "../core/storage";
import { loadSettings } from "../settings";
import { runCycle } from "./cycle";
import { backgroundIO } from "./io";
import { HackState, loadState, patchState } from "./store";

export const HACKGAME_ALARM = "hfgs-hackgame";
const DEFAULT_TITLE = "HF Gaming Suite settings";

let busy = false;

async function inBackgroundMode(): Promise<boolean> {
  return (await loadSettings()).hackgame.runInBackground;
}

/** Run one step if auto-play is on in background mode, then book the next. */
export async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const state = await loadState();
    if (!state.running || !(await inBackgroundMode())) {
      await chrome.alarms.clear(HACKGAME_ALARM);
      return;
    }
    // Woken early (an update, or a switch from tab mode): keep the booked time
    if (state.nextAt && state.nextAt > Date.now() + 1000) {
      chrome.alarms.create(HACKGAME_ALARM, { when: state.nextAt });
      return;
    }
    const { nextInMs } = await runCycle(backgroundIO());
    if (nextInMs === null) await chrome.alarms.clear(HACKGAME_ALARM);
    else chrome.alarms.create(HACKGAME_ALARM, { when: Date.now() + nextInMs });
  } catch (error) {
    Logger.error(`Hack Game step failed: ${(error as Error)?.message}`, error);
  } finally {
    busy = false;
  }
}

/** The toolbar button's tooltip says what auto-play is doing. */
function showStatus(state: HackState): void {
  const title = state.running
    ? `${DEFAULT_TITLE}\nHack Game: ${state.message}${
        state.nextAt && state.nextAt > Date.now()
          ? ` Next at ${new Date(state.nextAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
          : ""
      }`
    : DEFAULT_TITLE;
  chrome.action?.setTitle?.({ title })?.catch?.(() => undefined);
}

export function registerHackGame(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HACKGAME_ALARM) tick();
  });

  // Start, Stop, or a switch between background and tab mode
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const stateChange = changes[STORAGE_KEYS.hackgameState];
    if (stateChange) {
      const was = stateChange.oldValue as HackState | undefined;
      const now = stateChange.newValue as HackState | undefined;
      if (now) showStatus(now);
      if (now?.running && !was?.running) tick();
      if (!now?.running) chrome.alarms.clear(HACKGAME_ALARM);
    }
    const settingsChange = changes[STORAGE_KEYS.settings];
    if (settingsChange) {
      const before = settingsChange.oldValue?.hackgame?.runInBackground;
      const after = settingsChange.newValue?.hackgame?.runInBackground;
      if (before !== after) tick();
    }
  });

  // An extension update or reload drops pending alarms: pick the run back up.
  chrome.runtime.onInstalled.addListener(() => {
    tick();
  });

  // After a browser restart, wait for Start rather than carrying on.
  chrome.runtime.onStartup.addListener(() => {
    loadState()
      .then((state) =>
        state.running
          ? patchState({
              running: false,
              phase: "stopped",
              message:
                "Stopped when the browser closed. Press Start to play again.",
              nextAt: null,
            })
          : undefined
      )
      .catch(() => undefined);
  });
}
