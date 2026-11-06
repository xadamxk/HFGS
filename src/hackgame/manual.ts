/**
 * Playing the picked Small Hack Job once, by hand, from the status card's
 * Hack button (with "Run in background" off). It reads the job list, cooldown
 * and power first, then plays the job and stores the result and when HF lets
 * the next job be played, so every open card shows it.
 */
import { attemptJob, HackIO, JOB_POWER, SMALLHACKS } from "./cycle";
import {
  cooldownSeconds,
  isLocked,
  pageKind,
  parseJobs,
  postKey,
  powerPercent,
} from "./parse";
import { loadSettings } from "../settings";
import {
  chosenJob,
  runActive,
  HackState,
  loadChoice,
  loadState,
  patchState,
  updateJobs,
} from "./store";

const LOCK = "hfgs-hackgame-play";

/** Play the picked job once. Does nothing while auto-play runs or a play is going. */
export async function playOnce(io: HackIO): Promise<void> {
  const [state, settings] = await Promise.all([loadState(), loadSettings()]);
  if (runActive(state, settings.hackgame.runInBackground) || state.busy) return;
  await patchState({ busy: true, note: null });

  const result: Partial<HackState> = { busy: false };
  try {
    const page = await io.get(SMALLHACKS);
    switch (pageKind(page)) {
      case "challenge":
        result.note = "HF showed a Cloudflare check: open HF in a tab first.";
        return;
      case "signedOut":
        result.note = "You're signed out of HF.";
        return;
      case "flood":
        result.note = "HF asked to slow down. Try again in a moment.";
        return;
      case "unknown":
        result.note = "HF sent a page HFGS doesn't recognize.";
        return;
    }
    if (isLocked(page)) {
      result.note = "Locked out by the FBI.";
      return;
    }

    const jobs = parseJobs(page);
    await updateJobs(jobs, io.now());
    const cooldown = cooldownSeconds(page);
    result.readyAt = io.now() + cooldown * 1000;
    const power = powerPercent(page);
    result.power = power;
    if (cooldown > 0) {
      result.note = "Cooling down...";
      return;
    }
    if (power !== null && power < JOB_POWER) {
      result.note = `Not enough power (${power}%).`;
      return;
    }
    const job = chosenJob(jobs, await loadChoice());
    if (!job) {
      result.note = "Pick a job in HF's Small Hack Jobs list first.";
      return;
    }
    const key = postKey(page);
    if (!key) {
      result.note = "No post key on HF's page. Are you signed in?";
      return;
    }

    const attempt = await attemptJob(io, job, key);
    if (attempt.flood) {
      result.note = "HF asked to slow down. Try again in a moment.";
      return;
    }
    result.readyAt = io.now() + attempt.cooldown * 1000;
    if (power !== null) result.power = Math.max(0, power - JOB_POWER);
    if (attempt.last) result.last = attempt.last;
    else result.note = "Played, but couldn't read the result from HF's logs.";
  } catch (error) {
    result.note = `Couldn't reach HF (${(error as Error)?.message || String(error)}).`;
  } finally {
    await patchState(result);
  }
}

/** playOnce, one tab at a time (a Web Lock), for the status card's button. */
export async function playOnceLocked(io: HackIO): Promise<void> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks) await locks.request(LOCK, () => playOnce(io));
  else await playOnce(io);
}
