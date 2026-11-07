import fs from "fs";
import path from "path";
import { loadHistory } from "../core/history";
import { defaultSettings, saveSettings } from "../settings";
import { HackIO } from "./cycle";
import { rememberPickedJob } from "./jobsView";
import { pagePostKey, playOnce } from "./manual";
import { parseJobs } from "./parse";
import {
  HACKGAME_ID,
  idleState,
  loadChoice,
  loadState,
  saveChoice,
  saveState,
  updateJobs,
} from "./store";

const fixture = (name: string) =>
  fs.readFileSync(
    path.join(__dirname, "../../fixtures/hackgame", `${name}.html`),
    "utf8"
  );
const smallhacks = fixture("smallhacks");
/** HF's real reply to Attempt Hack (a failed 10% job), keys removed. */
const failedReply = fixture("do_smallhacks");
const NOW = 1793934411 * 1000;
/** The same page with a success box instead (format not seen live yet). */
const successReply = failedReply.replace(
  /<div class="failure">[\s\S]*?<\/div>/,
  '<div class="success"><p><em>Success</em></p><ul><li>You got away with $3.50 and 1.25 xp.</li></ul></div>'
);

function fakeHF(reply?: string) {
  const posts: Record<string, string>[] = [];
  const gets: string[] = [];
  const io: HackIO = {
    get: async (p) => {
      gets.push(p);
      return "";
    },
    post: async (_p, form) => {
      posts.push(form);
      if (reply === undefined) throw new Error("offline");
      return reply;
    },
    now: () => NOW,
    random: () => 0,
    sleep: async () => undefined,
  };
  return { io, posts, gets };
}

/** Pick a job, with HF's job list stored (as a game page visit leaves it). */
const pick = async (id = "40") => {
  const jobs = parseJobs(smallhacks);
  await updateJobs(jobs, NOW);
  const job = jobs.find((j) => j.id === id)!;
  await saveChoice([{ id: job.id, name: job.name }]);
};

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe("playing a job by hand", () => {
  it("makes one request and reads the result, cooldown and power from HF's reply", async () => {
    await pick();
    const hf = fakeHF(failedReply);
    await playOnce(hf.io, "KEY");
    expect(hf.posts).toEqual([
      { job_id: "40", my_post_key: "KEY", action: "do_smallhacks", submit: "" },
    ]);
    expect(hf.gets).toEqual([]); // no other requests
    expect(await loadState()).toMatchObject({
      busy: false,
      note: null,
      readyAt: NOW + 296_000,
      power: 95,
      last: {
        job: "Compromising a Crypto Wallet Seed Phrase",
        success: false,
        rate: 10,
        money: 0,
        xp: 0,
        reason:
          "The owner had multi-signature security. Your attempt was useless.",
      },
    });
    expect((await loadHistory(HACKGAME_ID)).entries[0]).toMatchObject({
      outcome: "FAIL",
    });
  });

  it("records a success with the amounts HF states", async () => {
    await pick();
    await playOnce(fakeHF(successReply).io, "KEY");
    expect((await loadState()).last).toMatchObject({
      success: true,
      money: 3.5,
      xp: 1.25,
    });
  });

  it("doesn't post during a cooldown, with no job picked, or without a post key", async () => {
    await pick();
    await saveState({ ...idleState(), readyAt: NOW + 60_000 });
    const cooling = fakeHF(failedReply);
    await playOnce(cooling.io, "KEY");
    expect(cooling.posts).toEqual([]);
    expect((await loadState()).note).toBe("Cooling down...");

    await saveState(idleState());
    await saveChoice([]);
    const none = fakeHF(failedReply);
    await playOnce(none.io, "KEY");
    expect(none.posts).toEqual([]);
    expect((await loadState()).note).toBe(
      "Pick a job in HF's Small Hack Jobs list first."
    );

    await pick();
    const noKey = fakeHF(failedReply);
    await playOnce(noKey.io, null);
    expect(noKey.posts).toEqual([]);
    expect((await loadState()).note).toMatch(/No post key/);
  });

  it("says why when HF didn't play the job, or can't be reached", async () => {
    await pick();
    const refused = failedReply.replace(
      /<div class="failure">[\s\S]*?<\/div>/,
      '<div class="error">You don\'t have enough power.</div>'
    );
    await playOnce(fakeHF(refused).io, "KEY");
    expect((await loadState()).note).toBe("You don't have enough power.");

    await saveState(idleState());
    await playOnce(fakeHF(undefined).io, "KEY");
    expect((await loadState()).note).toBe("Couldn't reach HF (offline).");
  });

  it("spaces a press from the last one in any tab", async () => {
    await pick();
    // Another tab sent a job a second ago (successes set no cooldown)
    await saveState({ ...idleState(), postedAt: NOW - 1000 });
    const sleeps: number[] = [];
    const hf = fakeHF(successReply);
    hf.io.sleep = async (ms) => {
      sleeps.push(ms);
    };
    await playOnce(hf.io, "KEY");
    expect(sleeps).toEqual([1500]);
    expect(hf.posts).toHaveLength(1);
    expect((await loadState()).postedAt).toBe(NOW);
  });

  it("plays even with a run left over from background mode", async () => {
    await pick();
    await saveState({ ...idleState(), running: true, mode: "background" });
    const hf = fakeHF(failedReply);
    await playOnce(hf.io, "KEY");
    expect(hf.posts).toHaveLength(1);
  });

  it("leaves a running auto-play alone", async () => {
    await pick();
    const background = defaultSettings();
    background.hackgame.runInBackground = true;
    await saveSettings(background);
    await saveState({ ...idleState(), running: true, mode: "background" });
    const hf = fakeHF(failedReply);
    await playOnce(hf.io, "KEY");
    expect(hf.posts).toEqual([]);
  });
});

describe("pagePostKey", () => {
  it("reads the post key from the page's form or script", () => {
    document.body.innerHTML =
      '<input type="hidden" name="my_post_key" value="abc">';
    expect(pagePostKey(document)).toBe("abc");
    document.body.innerHTML = '<script>var my_post_key = "def";</script>';
    expect(pagePostKey(document)).toBe("def");
    document.body.innerHTML = "<p>signed out</p>";
    expect(pagePostKey(document)).toBeNull();
  });
});

describe("remembering the job picked in HF's list", () => {
  function page(): Document {
    document.body.innerHTML = parseJobs(smallhacks)
      .slice(0, 3)
      .map(
        (j) =>
          `<label><input type="radio" class="contract_checkbox" name="job_id" value="${j.id}"><span class="game_smallhack_desc">${j.name}</span></label>`
      )
      .join("");
    return document;
  }
  const radio = (id: string) =>
    document.querySelector(`input[value="${id}"]`) as HTMLInputElement;

  it("selects the remembered job and remembers a new pick", async () => {
    await pick("29");
    const doc = page();
    await rememberPickedJob(doc, parseJobs(smallhacks));
    expect(radio("29").checked).toBe(true);

    radio("26").checked = true;
    radio("26").dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 10));
    expect(await loadChoice()).toEqual([
      { id: "26", name: "Phishing a Tech Support Scam" },
    ]);
  });
});
