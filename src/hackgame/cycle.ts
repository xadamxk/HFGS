/**
 * One step of Hack Game auto-play, run by the background script (background.ts)
 * while "Run in background" is on: read the Small Hack Jobs page, then play a
 * job, or work out how long to wait (cooldown, recharge, lock-out) before the
 * next step. The caller schedules the next step after `nextInMs`.
 */
import { loadSettings } from "../settings";
import {
  cooldownSeconds,
  fullChargeAt,
  HackJob,
  isLocked,
  latestJobResult,
  pageKind,
  parseJobs,
  postKey,
  powerPercent,
} from "./parse";
import { HackGameSettings, waitRange } from "./settings";
import {
  chosenJob,
  runActive,
  HackState,
  LastJob,
  loadChoice,
  loadState,
  powerReading,
  recordJob,
  saveState,
  updateJobs,
} from "./store";

/** How the bot reaches HF: page paths relative to https://hackforums.net/. */
export interface HackIO {
  get(path: string): Promise<string>;
  post(path: string, form: Record<string, string>): Promise<string>;
  now(): number;
  /** 0 to 1, like Math.random. */
  random(): number;
  sleep(ms: number): Promise<void>;
}

export interface CycleOutcome {
  /** When to run the next step; null once the bot has stopped. */
  nextInMs: number | null;
}

export const SMALLHACKS = "gamecp.php?action=smallhacks";
const BATTERY = "gamecp.php?action=battery";
const LOGS = "gamecp.php?action=logs";

/** Power one Small Hack Job uses (seen live: 97% → 92%). */
export const JOB_POWER = 5;

/** Pause between the requests within one step (HF rejects quick repeats). */
export const REQUEST_GAP_MS = 2500;
/** Never check again sooner than this. */
const MIN_WAIT_MS = 30_000;
/** A recharge or lock-out wait is re-checked at least this often. */
const MAX_WAIT_MS = 6 * 3600_000;
const MAX_ERRORS = 3;

export interface Attempt {
  /** HF said "too quickly": the job wasn't played. */
  flood: boolean;
  /** The job's result from HF's logs, or null if it couldn't be read. */
  last: LastJob | null;
  /** Seconds until HF lets the next job be played. */
  cooldown: number;
  /** Power (%) after the job, from HF's reply, or null if it doesn't show. */
  power: number | null;
  /** When that reply came. */
  powerAt: number | null;
}

/**
 * Play `job` once and read its result from HF's logs (the newest entry, if
 * it's from just now). Records the result. Used by auto-play; the Hack button
 * (manual.ts) reads the result from HF's reply instead.
 */
export async function attemptJob(
  io: HackIO,
  job: HackJob,
  key: string
): Promise<Attempt> {
  await io.sleep(REQUEST_GAP_MS);
  const postedAt = io.now();
  const answer = await io.post("gamecp.php", {
    job_id: job.id,
    my_post_key: key,
    action: "do_smallhacks",
    submit: "",
  });
  if (pageKind(answer) === "flood")
    return { flood: true, last: null, cooldown: 0, power: null, powerAt: null };
  const answeredAt = io.now();

  await io.sleep(REQUEST_GAP_MS);
  const logs = await io.get(LOGS);
  const result = latestJobResult(logs);
  const fresh =
    result && (result.at === null || result.at >= postedAt - 120_000);
  let last: LastJob | null = null;
  if (result && fresh) {
    last = {
      // This computer's clock, like the run's start: HF's can be a few seconds off
      at: postedAt,
      job: job.name,
      success: result.success,
      rate: result.rate,
      money: result.money,
      xp: result.xp,
      doneAt: io.now(),
    };
    await recordJob(last);
  }
  return {
    flood: false,
    last,
    cooldown: cooldownSeconds(logs) || cooldownSeconds(answer),
    // HF's reply is the Small Hack Jobs page, showing the power the job left
    power: powerPercent(answer),
    powerAt: answeredAt,
  };
}

function extraWait(settings: HackGameSettings, io: HackIO): number {
  const [low, high] = waitRange(settings);
  return Math.round(low + io.random() * (high - low));
}

const clampWait = (ms: number) =>
  Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, ms));

/**
 * How long until power is back to `resumeAt`, from when the battery is full.
 * Charging is taken as steady, so the time scales with the power still missing.
 */
export function rechargeWait(
  power: number,
  resumeAt: number,
  fullAt: number | null,
  now: number
): number {
  if (fullAt === null || fullAt <= now) return 5 * 60_000;
  const toFull = fullAt - now;
  if (resumeAt >= 100 || power >= 100) return toFull + 30_000;
  const share = Math.max(0, resumeAt - power) / (100 - power);
  return Math.ceil(toFull * share) + 30_000;
}

export async function runCycle(io: HackIO): Promise<CycleOutcome> {
  let state = await loadState();
  if (!state.running) return { nextInMs: null };
  const settings = (await loadSettings()).hackgame;

  let power: number | null | undefined;
  let powerAt: number | null = null;
  let readyAt: number | undefined;
  const save = async (
    patch: Partial<HackState>,
    nextInMs: number | null
  ): Promise<CycleOutcome> => {
    state = {
      ...(await loadState()),
      ...(power === undefined ? {} : { power, powerAt }),
      ...(readyAt === undefined ? {} : { readyAt }),
      ...patch,
      nextAt: nextInMs === null ? null : io.now() + nextInMs,
    };
    // Stopped from the panel while this step ran: stay stopped
    if (!state.running) return { nextInMs: null };
    if (nextInMs === null) state.running = false;
    await saveState(state);
    return { nextInMs };
  };
  const stop = (message: string) => save({ phase: "stopped", message }, null);

  // "Run in background" changed since this run started: it doesn't carry on
  if (!runActive(state, settings.runInBackground)) {
    return stop(
      settings.runInBackground
        ? "Stopped: runs from an open tab are gone. Press Start to run in the background."
        : "Stopped because Run in background was turned off. Use the Hack button, or turn it back on and press Start."
    );
  }
  const failed = (message: string) => {
    const errors = state.errors + 1;
    if (errors >= MAX_ERRORS)
      return stop(`Stopped after ${errors} errors in a row: ${message}`);
    return save(
      { phase: "waiting", message: `${message} Trying again…`, errors },
      errors * 60_000
    );
  };

  try {
    const page = await io.get(SMALLHACKS);
    switch (pageKind(page)) {
      case "challenge":
        return stop(
          "HF showed a Cloudflare check. Open HF in a tab, then press Start again."
        );
      case "signedOut":
        return stop(
          "You're signed out of HF. Sign in, then press Start again."
        );
      case "flood":
        return save(
          { phase: "waiting", message: "HF asked to slow down." },
          MIN_WAIT_MS
        );
      case "unknown":
        return failed("HF sent a page the bot doesn't recognize.");
    }

    if (isLocked(page)) {
      return save(
        { phase: "locked", message: "Locked out by the FBI.", errors: 0 },
        settings.lockedWaitMin * 60_000
      );
    }

    const jobs = parseJobs(page);
    await updateJobs(jobs, io.now());

    // Power: pause below the threshold, and once paused, wait for resumeAt
    power = powerPercent(page);
    powerAt = power === null ? null : io.now();
    const recharging = state.phase === "recharging";
    if (
      power !== null &&
      (power < settings.pauseBelow || (recharging && power < settings.resumeAt))
    ) {
      await io.sleep(REQUEST_GAP_MS);
      const battery = await io.get(BATTERY);
      const rate = powerReading(
        battery,
        io.now(),
        state.msPerPercent
      ).msPerPercent;
      const wait = rechargeWait(
        power,
        settings.resumeAt,
        fullChargeAt(battery, io.now()),
        io.now()
      );
      return save(
        {
          phase: "recharging",
          message: `Recharging (power ${power}%, resumes at ${settings.resumeAt}%).`,
          errors: 0,
          // How fast the battery charges, so the card can count power up
          ...(rate ? { msPerPercent: rate } : {}),
        },
        clampWait(wait)
      );
    }

    const cooldown = cooldownSeconds(page);
    readyAt = io.now() + cooldown * 1000;
    if (cooldown > 0) {
      return save(
        {
          phase: "waiting",
          message: "Waiting for HF's cooldown, then a random extra wait.",
          errors: 0,
        },
        clampWait(cooldown * 1000 + extraWait(settings, io))
      );
    }

    if (
      settings.stopAfterJobs > 0 &&
      state.jobsThisRun >= settings.stopAfterJobs
    ) {
      return stop(`Finished ${state.jobsThisRun} jobs.`);
    }

    const job = chosenJob(jobs, await loadChoice());
    if (!job) {
      return stop(
        jobs.length
          ? "No job picked: choose one in HF's Small Hack Jobs list."
          : "HF's page didn't list any jobs."
      );
    }
    const key = postKey(page);
    if (!key) return stop("No post key on HF's page. Are you signed in?");

    await save(
      { phase: "playing", message: `Playing "${job.name}" (${job.rate}%).` },
      0
    );
    const attempt = await attemptJob(io, job, key);
    if (attempt.flood) {
      return save(
        { phase: "waiting", message: "HF asked to slow down." },
        MIN_WAIT_MS
      );
    }
    const { last } = attempt;
    if (attempt.power !== null) {
      power = attempt.power;
      powerAt = attempt.powerAt;
    }
    const next = attempt.cooldown;
    readyAt = io.now() + next * 1000;
    const jobsThisRun = state.jobsThisRun + 1;
    const patch: Partial<HackState> = {
      phase: "waiting",
      jobsThisRun,
      errors: 0,
      last: last ?? state.last,
      message: last
        ? next > 0
          ? "Waiting for HF's cooldown, then a random extra wait."
          : "Random extra wait before the next job."
        : "Played a job, but couldn't read its result from the logs.",
    };
    if (settings.stopAfterJobs > 0 && jobsThisRun >= settings.stopAfterJobs) {
      return save(
        {
          ...patch,
          phase: "stopped",
          message: `Finished ${jobsThisRun} job${jobsThisRun === 1 ? "" : "s"}.`,
        },
        null
      );
    }
    return save(
      patch,
      clampWait((next ? next * 1000 : MIN_WAIT_MS) + extraWait(settings, io))
    );
  } catch (error) {
    return failed(
      `Couldn't reach HF (${(error as Error)?.message || String(error)}).`
    );
  }
}
