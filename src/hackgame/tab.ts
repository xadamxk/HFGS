/**
 * Hack Game auto-play from an open HF game tab, used while "Run in background"
 * is off. With several game tabs open, one plays (a Web Lock picks it) and
 * another takes over if it's closed.
 */
import { Logger } from "../core/Logger";
import { STORAGE_KEYS } from "../core/storage";
import { loadSettings } from "../settings";
import { runCycle } from "./cycle";
import { tabIO } from "./io";
import { loadState } from "./store";

const LOCK = "hfgs-hackgame";

async function shouldPlay(): Promise<boolean> {
  const [state, settings] = await Promise.all([loadState(), loadSettings()]);
  return state.running && !settings.hackgame.runInBackground;
}

/** Wait `ms`, or less if auto-play is started, stopped or switched meanwhile. */
function waitOrWake(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      chrome.storage.onChanged.removeListener(onChange);
      resolve();
    };
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area !== "local") return;
      const state = changes[STORAGE_KEYS.hackgameState];
      const settings = changes[STORAGE_KEYS.settings];
      if (
        (state && state.newValue?.running !== state.oldValue?.running) ||
        (settings &&
          (settings.newValue?.hackgame?.runInBackground ?? true) !==
            (settings.oldValue?.hackgame?.runInBackground ?? true))
      )
        done();
    };
    const timer = setTimeout(done, ms);
    chrome.storage.onChanged.addListener(onChange);
  });
}

/** Play while this tab holds the lock and tab mode is on. */
async function playLoop(): Promise<void> {
  const io = tabIO();
  // A page opened mid-run waits for the step already booked (the random extra
  // wait included) instead of playing as soon as it loads.
  const { nextAt } = await loadState();
  if (nextAt && nextAt > Date.now()) await waitOrWake(nextAt - Date.now());
  while (await shouldPlay()) {
    const { nextInMs } = await runCycle(io);
    if (nextInMs === null) return;
    await waitOrWake(nextInMs);
  }
}

let looping = false;

async function maybePlay(): Promise<void> {
  if (looping || !(await shouldPlay())) return;
  looping = true;
  try {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks) await locks.request(LOCK, () => playLoop());
    else await playLoop();
  } catch (error) {
    Logger.error(
      `Hack Game tab play failed: ${(error as Error)?.message}`,
      error
    );
  } finally {
    looping = false;
  }
}

/** Start playing from this tab whenever tab mode is on and a run is going. */
export function startTabPlayer(): void {
  maybePlay();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEYS.hackgameState] || changes[STORAGE_KEYS.settings])
      maybePlay();
  });
}
