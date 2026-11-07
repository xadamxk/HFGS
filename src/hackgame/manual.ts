/**
 * Playing the picked Small Hack Job once, by hand, with the Hack button (on
 * the status card or the Hack Game panel, with "Run in background" off).
 *
 * One request: the post key comes from the HF page the button is on, the job
 * from storage, and HF's reply (the Small Hack Jobs page it redirects to)
 * carries everything else: the result box, the next cooldown, power and the
 * job list. The result, and when HF allows the next job, are stored so every
 * open card shows them.
 */
import { REQUEST_GAP_MS, HackIO } from "./cycle";
import {
  cooldownSeconds,
  errorMessage,
  isLocked,
  pageKind,
  parseJobs,
  postKey,
  powerPercent,
  replyResult,
} from "./parse";
import { loadSettings } from "../settings";
import {
  chosenJob,
  runActive,
  isBusy,
  HackState,
  LastJob,
  loadChoice,
  loadJobCache,
  loadState,
  patchState,
  recordJob,
  updateJobs,
} from "./store";

const LOCK = "hfgs-hackgame-play";
/** Two presses closer than this would trip HF's "too quickly" check. */
const MIN_GAP_MS = REQUEST_GAP_MS;

/**
 * Play the picked job once. `key` is the post key from the HF page the button
 * is on. Does nothing while auto-play runs or another press is playing.
 */
export async function playOnce(io: HackIO, key: string | null): Promise<void> {
  const [state, settings] = await Promise.all([loadState(), loadSettings()]);
  if (
    runActive(state, settings.hackgame.runInBackground) ||
    isBusy(state, io.now())
  )
    return;

  const result: Partial<HackState> = { busy: false, busyAt: null };
  const done = () => patchState(result);

  if (state.readyAt !== null && state.readyAt > io.now()) {
    result.note = "Cooling down...";
    await done();
    return;
  }
  const [cache, choice] = await Promise.all([loadJobCache(), loadChoice()]);
  const job = cache ? chosenJob(cache.jobs, choice) : null;
  if (!job) {
    result.note = "Pick a job in HF's Small Hack Jobs list first.";
    await done();
    return;
  }
  if (!key) {
    result.note = "No post key on this page. Are you signed in to HF?";
    await done();
    return;
  }

  await patchState({ busy: true, busyAt: io.now(), note: null });
  try {
    // Spaced from the last press in any tab (the stored time; the Web Lock in
    // playOnceLocked keeps two tabs from reading it at once)
    const wait = (state.postedAt ?? -Infinity) + MIN_GAP_MS - io.now();
    if (wait > 0) await io.sleep(wait);
    const playedAt = io.now();
    await patchState({ postedAt: playedAt });
    const reply = await io.post("gamecp.php", {
      job_id: job.id,
      my_post_key: key,
      action: "do_smallhacks",
      submit: "",
    });

    switch (pageKind(reply)) {
      case "challenge":
        result.note = "HF showed a Cloudflare check: open HF in a tab first.";
        return;
      case "signedOut":
        result.note = "You're signed out of HF.";
        return;
      case "flood":
        result.note = "HF asked to slow down. Try again in a moment.";
        return;
    }
    if (isLocked(reply)) {
      result.note = "Locked out by the FBI.";
      return;
    }

    // The reply is the Small Hack Jobs page: keep what it shows
    await updateJobs(parseJobs(reply), io.now());
    result.readyAt = io.now() + cooldownSeconds(reply) * 1000;
    const power = powerPercent(reply);
    if (power !== null) result.power = power;

    const outcome = replyResult(reply);
    if (!outcome) {
      result.note = errorMessage(reply) ?? "HF didn't play the job.";
      return;
    }
    const last: LastJob = {
      at: playedAt,
      job: job.name,
      success: outcome.success,
      rate: job.rate,
      money: outcome.money,
      xp: outcome.xp,
      reason: outcome.message,
    };
    await recordJob(last);
    result.last = last;
  } catch (error) {
    result.note = `Couldn't reach HF (${(error as Error)?.message || String(error)}).`;
  } finally {
    await done();
  }
}

/** playOnce, one tab at a time (a Web Lock), for the Hack buttons. */
export async function playOnceLocked(
  io: HackIO,
  key: string | null
): Promise<void> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks) await locks.request(LOCK, () => playOnce(io, key));
  else await playOnce(io, key);
}

/** The post key on the HF page this script runs on. */
export function pagePostKey(doc: Document = document): string | null {
  const input = doc.querySelector<HTMLInputElement>(
    'input[name="my_post_key"]'
  );
  if (input?.value) return input.value;
  // Otherwise HF's `var my_post_key = "…"`, read the same way as fetched pages
  for (const script of doc.scripts) {
    const key = postKey(script.textContent ?? "");
    if (key) return key;
  }
  return null;
}
