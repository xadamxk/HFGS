import fs from "fs";
import path from "path";
import { loadHistory } from "../core/history";
import { defaultSettings, saveSettings } from "../settings";
import { HackIO, rechargeWait, runCycle } from "./cycle";
import { parseJobs } from "./parse";
import { HackGameSettings } from "./settings";
import {
  chosenJob,
  HACKGAME_ID,
  loadChoice,
  loadJobCache,
  loadState,
  loadTotals,
  saveChoice,
  startRun,
  updateJobs,
} from "./store";

const fixture = (name: string) =>
  fs.readFileSync(
    path.join(__dirname, "../../fixtures/hackgame", `${name}.html`),
    "utf8"
  );
const smallhacks = fixture("smallhacks");
const battery = fixture("battery");
const logs = fixture("logs");
const withCooldown = (html: string, seconds: number) =>
  html.replace(
    "</body>",
    `<script>countdownTimer('game-countdown-smallhacks', ${seconds});</script></body>`
  );
const withPower = (html: string, percent: number) =>
  html.replace(
    /(href="gamecp\.php\?action=battery"[^>]*title=")\d+%/,
    `$1${percent}%`
  );
const STAT =
  '<span class="game-leaderboard-stat game-leaderboard-stat-selected">';
/** The logs page with its newest entry turned into a success. */
const successLogs = logs
  .replace(`${STAT}Fail</span>`, `${STAT}Success</span>`)
  .replace(
    `${STAT}50%</span>`,
    `${STAT}50%</span> ${STAT}<span>$</span>3.5</span> ${STAT}1.25 xp</span>`
  );
const LOGGED_AT = 1793934411 * 1000;

const SMALL = "gamecp.php?action=smallhacks";
const BATTERY = "gamecp.php?action=battery";
const LOGS = "gamecp.php?action=logs";

interface FakeHF {
  io: HackIO;
  gets: string[];
  posts: { path: string; form: Record<string, string> }[];
}

/** HF answering from canned pages; "post" is the answer to the job post. */
function fakeHF(pages: Record<string, string>, now = LOGGED_AT): FakeHF {
  const gets: string[] = [];
  const posts: FakeHF["posts"] = [];
  const page = (key: string) => {
    if (!(key in pages)) throw new Error(`No fake page for ${key}`);
    return pages[key];
  };
  return {
    gets,
    posts,
    io: {
      get: async (p) => {
        gets.push(p);
        return page(p);
      },
      post: async (p, form) => {
        posts.push({ path: p, form });
        return page("post");
      },
      now: () => now,
      random: () => 0,
      sleep: async () => undefined,
    },
  };
}

async function setup(
  hackgame: Partial<HackGameSettings> = {},
  tick = ["32"]
): Promise<void> {
  const settings = defaultSettings();
  // Runs only happen in background mode
  settings.hackgame = {
    ...settings.hackgame,
    runInBackground: true,
    ...hackgame,
  };
  await saveSettings(settings);
  await saveChoice(
    parseJobs(smallhacks)
      .filter((j) => tick.includes(j.id))
      .map((j) => ({ id: j.id, name: j.name }))
  );
  await startRun(settings.hackgame.runInBackground, LOGGED_AT - 60_000);
}

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe("runCycle", () => {
  it("plays a ticked job when ready, records it and waits for the next cooldown", async () => {
    await setup();
    const hf = fakeHF({
      [SMALL]: smallhacks,
      post: withCooldown(smallhacks, 180),
      [LOGS]: withCooldown(successLogs, 175),
    });
    const outcome = await runCycle(hf.io);

    expect(hf.posts).toEqual([
      {
        path: "gamecp.php",
        form: {
          job_id: "32",
          my_post_key: "REDACTED_POST_KEY",
          action: "do_smallhacks",
          submit: "",
        },
      },
    ]);
    // The logs page's 175 s cooldown plus the shortest extra wait (30 s)
    expect(outcome.nextInMs).toBe(205_000);
    expect(await loadState()).toMatchObject({
      running: true,
      phase: "waiting",
      jobsThisRun: 1,
      nextAt: LOGGED_AT + 205_000,
      last: {
        // Timed by this computer's clock, not HF's, so it counts in the run
        at: LOGGED_AT,
        job: "Hijacking a Rideshare Driver's Account",
        success: true,
        rate: 50,
        money: 3.5,
        xp: 1.25,
      },
    });
    expect(await loadTotals()).toEqual({
      jobs: 1,
      successes: 1,
      money: 3.5,
      xp: 1.25,
    });
    expect((await loadHistory(HACKGAME_ID)).entries[0]).toMatchObject({
      outcome: "SUCCESS",
      returned: 3.5,
    });
    // The job list was stored on the way
    expect((await loadJobCache())?.jobs).toHaveLength(16);
  });

  it("waits out a cooldown plus a random extra wait without playing", async () => {
    await setup({ waitMin: 60, waitMax: 120 });
    const hf = fakeHF({ [SMALL]: withCooldown(smallhacks, 100) });
    hf.io.random = () => 0.5;
    expect((await runCycle(hf.io)).nextInMs).toBe(100_000 + 90_000);
    expect(hf.posts).toEqual([]);
    expect((await loadState()).message).toBe(
      "Waiting for HF's cooldown, then a random extra wait."
    );
  });

  it("pauses below the power level and waits for the battery to reach the resume level", async () => {
    await setup({ pauseBelow: 5, resumeAt: 100 });
    const hf = fakeHF({
      [SMALL]: withPower(smallhacks, 4),
      [BATTERY]: battery,
    });
    const outcome = await runCycle(hf.io);
    expect(hf.gets).toEqual([SMALL, BATTERY]);
    expect(outcome.nextInMs).toBe(1793937411 * 1000 - LOGGED_AT + 30_000);
    expect(await loadState()).toMatchObject({
      phase: "recharging",
      message: "Recharging (power 4%, resumes at 100%).",
    });

    // Above the pause level but short of the resume level: keeps waiting
    const later = fakeHF({
      [SMALL]: withPower(smallhacks, 60),
      [BATTERY]: battery,
    });
    await runCycle(later.io);
    expect(later.posts).toEqual([]);
    expect((await loadState()).phase).toBe("recharging");

    // Recharged: plays again
    const full = fakeHF({
      [SMALL]: withPower(smallhacks, 100),
      post: smallhacks,
      [LOGS]: successLogs,
    });
    await runCycle(full.io);
    expect(full.posts).toHaveLength(1);
  });

  it("stops with a reason when it can't carry on", async () => {
    await setup({}, []);
    await runCycle(fakeHF({ [SMALL]: smallhacks }).io);
    expect(await loadState()).toMatchObject({
      running: false,
      phase: "stopped",
      message: "No job picked: choose one in HF's Small Hack Jobs list.",
    });

    await setup();
    await runCycle(fakeHF({ [SMALL]: "<title>Just a moment...</title>" }).io);
    expect((await loadState()).message).toMatch(/Cloudflare check/);

    await setup();
    await runCycle(fakeHF({ [SMALL]: "<p>Please log in</p>" }).io);
    expect((await loadState()).message).toMatch(/signed out/);
  });

  it("waits when locked out, and slows down on a flood page", async () => {
    await setup({ lockedWaitMin: 7 });
    const locked = smallhacks.replace(
      "</body>",
      '<img src="images/game/fbi-interrogating.jpg"></body>'
    );
    expect((await runCycle(fakeHF({ [SMALL]: locked }).io)).nextInMs).toBe(
      7 * 60_000
    );
    expect((await loadState()).phase).toBe("locked");

    const flood = "<p>You are trying to submit this form too quickly.</p>";
    expect((await runCycle(fakeHF({ [SMALL]: flood }).io)).nextInMs).toBe(
      30_000
    );
  });

  it("retries errors with a growing wait and stops after three in a row", async () => {
    await setup();
    const broken: HackIO = {
      ...fakeHF({}).io,
      get: async () => {
        throw new Error("offline");
      },
    };
    expect((await runCycle(broken)).nextInMs).toBe(60_000);
    expect((await runCycle(broken)).nextInMs).toBe(120_000);
    expect((await runCycle(broken)).nextInMs).toBeNull();
    expect((await loadState()).message).toBe(
      "Stopped after 3 errors in a row: Couldn't reach HF (offline)."
    );
  });

  it("stops after the set number of jobs", async () => {
    await setup({ stopAfterJobs: 1 });
    const hf = fakeHF({
      [SMALL]: smallhacks,
      post: smallhacks,
      [LOGS]: successLogs,
    });
    expect((await runCycle(hf.io)).nextInMs).toBeNull();
    expect(await loadState()).toMatchObject({
      running: false,
      jobsThisRun: 1,
      message: "Finished 1 job.",
    });
  });

  it("stops a run once Run in background is turned off", async () => {
    await setup();
    await saveSettings(defaultSettings()); // Run in background: off
    const hf = fakeHF({ [SMALL]: smallhacks });
    expect((await runCycle(hf.io)).nextInMs).toBeNull();
    expect(hf.gets).toEqual([]);
    expect(await loadState()).toMatchObject({
      running: false,
      message:
        "Stopped because Run in background was turned off. Use the Hack button, or turn it back on and press Start.",
    });
  });

  it("does nothing while stopped", async () => {
    const hf = fakeHF({ [SMALL]: smallhacks });
    expect((await runCycle(hf.io)).nextInMs).toBeNull();
    expect(hf.gets).toEqual([]);
  });
});

describe("job list storage", () => {
  it("only rewrites the stored jobs when HF's list changes, and unticks changed jobs", async () => {
    const jobs = parseJobs(smallhacks);
    expect(await updateJobs(jobs, 1)).toBe(true);
    const set = chrome.storage.local.set as jest.Mock;
    set.mockClear();
    expect(await updateJobs(jobs, 2)).toBe(false);
    expect(set).not.toHaveBeenCalled();
    expect((await loadJobCache())?.changedAt).toBe(1);

    await saveChoice([
      { id: "28", name: jobs[0].name },
      { id: "29", name: jobs[1].name },
    ]);
    const renamed = [{ ...jobs[0], name: "Something new" }, ...jobs.slice(1)];
    expect(await updateJobs(renamed, 3)).toBe(true);
    expect(await loadChoice()).toEqual([{ id: "29", name: jobs[1].name }]);
    expect((await loadJobCache())?.dropped).toEqual([jobs[0].name]);
  });

  it("plays the job picked in HF's list, while HF still has it under that name", () => {
    const jobs = parseJobs(smallhacks);
    expect(chosenJob(jobs, [{ id: "41", name: jobs[15].name }])?.id).toBe("41");
    expect(chosenJob(jobs, [])).toBeNull();
    expect(chosenJob(jobs, [{ id: "41", name: "old name" }])).toBeNull();
  });
});

describe("rechargeWait", () => {
  it("scales the time to full by the power still missing", () => {
    expect(rechargeWait(4, 100, 96 * 60_000, 0)).toBe(96 * 60_000 + 30_000);
    expect(rechargeWait(4, 52, 96 * 60_000, 0)).toBe(48 * 60_000 + 30_000);
    expect(rechargeWait(50, 100, null, 0)).toBe(5 * 60_000);
  });
});
