import fs from "fs";
import path from "path";
import { loadHistory } from "../core/history";
import { defaultSettings, saveSettings } from "../settings";
import { HackIO } from "./cycle";
import { rememberPickedJob } from "./jobsView";
import { playOnce } from "./manual";
import { parseJobs } from "./parse";
import {
  HACKGAME_ID,
  idleState,
  loadChoice,
  loadState,
  saveChoice,
  saveState,
} from "./store";

const fixture = (name: string) =>
  fs.readFileSync(
    path.join(__dirname, "../../fixtures/hackgame", `${name}.html`),
    "utf8"
  );
const smallhacks = fixture("smallhacks");
const logs = fixture("logs");
const LOGGED_AT = 1793934411 * 1000;
const STAT =
  '<span class="game-leaderboard-stat game-leaderboard-stat-selected">';
const successLogs = logs
  .replace(`${STAT}Fail</span>`, `${STAT}Success</span>`)
  .replace(
    `${STAT}50%</span>`,
    `${STAT}50%</span> ${STAT}<span>$</span>3.5</span> ${STAT}1.25 xp</span>`
  );
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

function fakeHF(pages: Record<string, string>) {
  const posts: Record<string, string>[] = [];
  const io: HackIO = {
    get: async (p) => pages[p],
    post: async (_p, form) => {
      posts.push(form);
      return pages.post;
    },
    now: () => LOGGED_AT,
    random: () => 0,
    sleep: async () => undefined,
  };
  return { io, posts };
}

const SMALL = "gamecp.php?action=smallhacks";
const LOGS = "gamecp.php?action=logs";
const pick = async (id = "32") => {
  const job = parseJobs(smallhacks).find((j) => j.id === id)!;
  await saveChoice([{ id: job.id, name: job.name }]);
};

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe("playing a job by hand", () => {
  it("plays the picked job once and stores the result and the next cooldown", async () => {
    await pick();
    const hf = fakeHF({
      [SMALL]: smallhacks,
      post: smallhacks,
      [LOGS]: withCooldown(successLogs, 175),
    });
    await playOnce(hf.io);
    expect(hf.posts).toEqual([
      {
        job_id: "32",
        my_post_key: "REDACTED_POST_KEY",
        action: "do_smallhacks",
        submit: "",
      },
    ]);
    const state = await loadState();
    expect(state).toMatchObject({
      busy: false,
      note: null,
      readyAt: LOGGED_AT + 175_000,
      power: 90,
      running: false,
      last: { job: "Hijacking a Rideshare Driver's Account", success: true },
    });
    expect((await loadHistory(HACKGAME_ID)).entries).toHaveLength(1);
  });

  it("doesn't play during a cooldown, without power, or with no job picked", async () => {
    await pick();
    await playOnce(fakeHF({ [SMALL]: withCooldown(smallhacks, 60) }).io);
    expect(await loadState()).toMatchObject({
      note: "Cooling down...",
      readyAt: LOGGED_AT + 60_000,
    });

    const low = fakeHF({ [SMALL]: withPower(smallhacks, 4) });
    await playOnce(low.io);
    expect(low.posts).toEqual([]);
    expect((await loadState()).note).toBe("Not enough power (4%).");

    await saveChoice([]);
    await playOnce(fakeHF({ [SMALL]: smallhacks }).io);
    expect((await loadState()).note).toBe(
      "Pick a job in HF's Small Hack Jobs list first."
    );
  });

  it("plays even with a run left over from background mode (no Hack Game tab needed)", async () => {
    await pick();
    await saveState({ ...idleState(), running: true, mode: "background" });
    const hf = fakeHF({
      [SMALL]: smallhacks,
      post: smallhacks,
      [LOGS]: successLogs,
    });
    await playOnce(hf.io);
    expect(hf.posts).toHaveLength(1);
  });

  it("leaves a running auto-play alone", async () => {
    await pick();
    const background = defaultSettings();
    background.hackgame.runInBackground = true;
    await saveSettings(background);
    await saveState({ ...idleState(), running: true, mode: "background" });
    const hf = fakeHF({ [SMALL]: smallhacks });
    await playOnce(hf.io);
    expect(hf.posts).toEqual([]);
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
