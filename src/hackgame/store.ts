/**
 * What the Hack Game bot keeps in chrome.storage.local: the job list it last
 * read, the jobs you ticked, the run state and lifetime totals. Shared by the
 * background script, the game pages and the settings page.
 */
import { recordRound, toEntry } from "../core/history";
import { getItem, setItem, STORAGE_KEYS } from "../core/storage";
import { HackJob, sameJobs } from "./parse";

export const HACKGAME_ID = "hackgame";

export interface JobCache {
  jobs: HackJob[];
  /** When HF's list last changed (not when it was last read). */
  changedAt: number;
  /** Ticked jobs the last change removed or renamed, for a notice. */
  dropped: string[];
}

/**
 * The job picked in HF's Small Hack Jobs list: its id, and its name when
 * picked (HF can reuse ids). Stored as a one-item list.
 */
export interface ChosenJob {
  id: string;
  name: string;
}

export type Phase =
  "idle" | "playing" | "waiting" | "recharging" | "locked" | "stopped";

export interface LastJob {
  at: number;
  job: string;
  success: boolean;
  rate: number;
  money: number;
  xp: number;
}

export interface HackState {
  running: boolean;
  startedAt: number | null;
  jobsThisRun: number;
  phase: Phase;
  /** What it's doing or why it stopped, without times (the panel adds nextAt). */
  message: string;
  /** When the next check or job is due. */
  nextAt: number | null;
  /** Errors in a row; three stop the bot. */
  errors: number;
  last: LastJob | null;
  /** Power (%) when last read, for the status card's battery bar. */
  power: number | null;
  /** When HF lets the next job be played (from its cooldown timer). */
  readyAt: number | null;
  /** A job is being played by hand from a status card. */
  busy: boolean;
  /** Why the last job played by hand didn't happen, or null. */
  note: string | null;
  /**
   * Which mode the run was started in. A run only goes on in that mode:
   * changing "Run in background" stops it. Runs from before this was stored
   * were started in background mode (the default then).
   */
  mode?: RunMode;
}

export type RunMode = "background" | "tab";

export const modeOf = (runInBackground: boolean): RunMode =>
  runInBackground ? "background" : "tab";

/** Whether a run is going in the current mode ("Run in background" on or off). */
export function runActive(state: HackState, runInBackground: boolean): boolean {
  return (
    state.running && (state.mode ?? "background") === modeOf(runInBackground)
  );
}

export interface HackTotals {
  jobs: number;
  successes: number;
  money: number;
  xp: number;
}

export function idleState(): HackState {
  return {
    running: false,
    startedAt: null,
    jobsThisRun: 0,
    phase: "idle",
    message: "",
    nextAt: null,
    errors: 0,
    last: null,
    power: null,
    readyAt: null,
    busy: false,
    note: null,
  };
}

/** A step this long overdue means nothing is playing the run. */
export const STALLED_AFTER_MS = 90_000;

/**
 * Why a running run is past its step, or null when it isn't stalled: no tab
 * is playing it (tab mode), or the background script hasn't woken yet.
 */
export function stalledReason(
  state: HackState,
  runInBackground: boolean,
  now = Date.now()
): string | null {
  if (!state.running || !state.nextAt || state.phase === "playing") return null;
  if (now - state.nextAt < STALLED_AFTER_MS) return null;
  return runInBackground
    ? "Overdue: waiting for the browser to wake the bot."
    : "Overdue: no Hack Game tab is playing. Open or reload a Hack Game page to continue.";
}

export function emptyTotals(): HackTotals {
  return { jobs: 0, successes: 0, money: 0, xp: 0 };
}

const TOTALS_KEY = "hackgame:totals";
const CARD_KEY = "hackgame:card";

/** The status card's own state, shared by every HF tab. */
export interface CardPrefs {
  /** Shrunk to a pill (the default, until you expand it). */
  collapsed: boolean;
  /** The run (its startedAt) whose stopped card was dismissed. */
  dismissedRun: number | null;
}

export async function loadCardPrefs(): Promise<CardPrefs> {
  return {
    collapsed: true,
    dismissedRun: null,
    ...(await getItem<Partial<CardPrefs>>(CARD_KEY)),
  };
}

export async function saveCardPrefs(patch: Partial<CardPrefs>): Promise<void> {
  await setItem(CARD_KEY, { ...(await loadCardPrefs()), ...patch });
}
export const HACKGAME_KEYS = [
  STORAGE_KEYS.hackgameJobs,
  STORAGE_KEYS.hackgameChoice,
  STORAGE_KEYS.hackgameState,
  TOTALS_KEY,
  CARD_KEY,
  STORAGE_KEYS.history(HACKGAME_ID),
];

export async function loadJobCache(): Promise<JobCache | null> {
  const cache = await getItem<JobCache>(STORAGE_KEYS.hackgameJobs);
  return cache && Array.isArray(cache.jobs) ? cache : null;
}

/** The picked job in HF's current list, or null if none is picked or it's gone. */
export function chosenJob(
  jobs: HackJob[],
  choice: ChosenJob[]
): HackJob | null {
  const picked = choice[0];
  return (
    (picked &&
      jobs.find((job) => job.id === picked.id && job.name === picked.name)) ||
    null
  );
}

export async function loadChoice(): Promise<ChosenJob[]> {
  const choice = await getItem<ChosenJob[]>(STORAGE_KEYS.hackgameChoice);
  return Array.isArray(choice) ? choice : [];
}

export async function saveChoice(choice: ChosenJob[]): Promise<void> {
  await setItem(STORAGE_KEYS.hackgameChoice, choice);
}

/**
 * Store HF's current job list, but only when it differs from the stored one.
 * Ticked jobs that are gone, or whose id now has another name, are unticked.
 * Returns true when the list changed.
 */
export async function updateJobs(
  jobs: HackJob[],
  now = Date.now()
): Promise<boolean> {
  if (!jobs.length) return false;
  const cache = await loadJobCache();
  if (cache && sameJobs(cache.jobs, jobs)) return false;
  const choice = await loadChoice();
  const kept = choice.filter((chosen) =>
    jobs.some((job) => job.id === chosen.id && job.name === chosen.name)
  );
  const dropped = choice
    .filter((chosen) => !kept.includes(chosen))
    .map((c) => c.name);
  await setItem(STORAGE_KEYS.hackgameJobs, {
    jobs,
    changedAt: now,
    dropped,
  } satisfies JobCache);
  if (dropped.length) await saveChoice(kept);
  return true;
}

export async function loadState(): Promise<HackState> {
  return {
    ...idleState(),
    ...(await getItem<Partial<HackState>>(STORAGE_KEYS.hackgameState)),
  };
}

export async function saveState(state: HackState): Promise<void> {
  await setItem(STORAGE_KEYS.hackgameState, state);
}

export async function patchState(
  patch: Partial<HackState>
): Promise<HackState> {
  const state = { ...(await loadState()), ...patch };
  await saveState(state);
  return state;
}

/** Start auto-play (from the panel). */
export async function startRun(
  runInBackground: boolean,
  now = Date.now()
): Promise<void> {
  const state = await loadState();
  await saveState({
    ...state,
    mode: modeOf(runInBackground),
    running: true,
    startedAt: now,
    jobsThisRun: 0,
    phase: "waiting",
    message: "Starting…",
    nextAt: now,
    errors: 0,
  });
}

/** Stop auto-play, with the reason to show. */
export async function stopRun(message = "Stopped."): Promise<void> {
  await patchState({
    running: false,
    phase: "stopped",
    message,
    nextAt: null,
  });
}

export async function loadTotals(): Promise<HackTotals> {
  return { ...emptyTotals(), ...(await getItem<HackTotals>(TOTALS_KEY)) };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Keep a played job in the history and the lifetime totals. */
export async function recordJob(job: LastJob): Promise<void> {
  const totals = await loadTotals();
  await setItem(TOTALS_KEY, {
    jobs: totals.jobs + 1,
    successes: totals.successes + (job.success ? 1 : 0),
    money: round4(totals.money + job.money),
    xp: round4(totals.xp + job.xp),
  } satisfies HackTotals);
  await recordRound(
    HACKGAME_ID,
    toEntry(
      {
        outcome: job.success ? "SUCCESS" : "FAIL",
        wagered: 0,
        returned: job.money,
        details: { job: job.job, rate: job.rate, xp: job.xp },
      },
      job.at
    )
  );
}
