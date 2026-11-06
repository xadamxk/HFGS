import fs from "fs";
import path from "path";
import {
  cooldownSeconds,
  decodeEntities,
  fullChargeAt,
  isLocked,
  latestJobResult,
  pageKind,
  parseJobs,
  postKey,
  powerPercent,
  sameJobs,
} from "./parse";

const fixture = (name: string) =>
  fs.readFileSync(
    path.join(__dirname, "../../fixtures/hackgame", `${name}.html`),
    "utf8"
  );
const smallhacks = fixture("smallhacks");
const battery = fixture("battery");
const logs = fixture("logs");

/** A page as it looks during a cooldown of `seconds`. */
const withCooldown = (html: string, seconds: number) =>
  html.replace(
    "</body>",
    `<script>countdownTimer('game-countdown-smallhacks', ${seconds});</script></body>`
  );

describe("Hack Game page readers", () => {
  it("reads every Small Hack Job with its id, name and success rate", () => {
    const jobs = parseJobs(smallhacks);
    expect(jobs).toHaveLength(16);
    expect(jobs[0]).toEqual({
      id: "28",
      name: "Cracking a Public Wi-Fi Password",
      rate: 99,
    });
    expect(jobs.map((j) => j.rate)).toEqual([
      99, 95, 92, 90, 85, 85, 75, 70, 65, 60, 50, 40, 30, 20, 10, 2,
    ]);
    expect(jobs.find((j) => j.id === "32")?.name).toBe(
      "Hijacking a Rideshare Driver's Account"
    );
    expect(new Set(jobs.map((j) => j.id)).size).toBe(16);
    expect(parseJobs(logs)).toEqual([]);
  });

  it("reads the cooldown, power, post key and page kind", () => {
    expect(cooldownSeconds(smallhacks)).toBe(0);
    expect(cooldownSeconds(withCooldown(smallhacks, 164))).toBe(164);
    expect(powerPercent(smallhacks)).toBe(95);
    expect(powerPercent(battery)).toBe(95);
    expect(postKey(smallhacks)).toBe("REDACTED_POST_KEY");
    expect(pageKind(smallhacks)).toBe("game");
    expect(isLocked(smallhacks)).toBe(false);
    expect(isLocked('<img src="images/game/fbi-interrogating.jpg">')).toBe(
      true
    );
  });

  it("tells HF's page from a signed-out, Cloudflare or flood page", () => {
    const signedOut = smallhacks
      .replace(/name="my_post_key"\s+value="[^"]*"/g, "")
      .replace(/my_post_key\s*=\s*["'][^"']*["']/g, "");
    expect(pageKind(signedOut)).toBe("signedOut");
    expect(
      pageKind("<html><head><title>Just a moment...</title></head></html>")
    ).toBe("challenge");
    expect(
      pageKind("<p>You are trying to submit this form too quickly.</p>")
    ).toBe("flood");
    expect(pageKind('<input name="my_post_key" value="x"><p>Hi</p>')).toBe(
      "unknown"
    );
  });

  it("reads when the battery will be full", () => {
    expect(fullChargeAt(battery)).toBe(1793937411 * 1000);
    expect(
      fullChargeAt(
        '<span>Full Charge: <span title="?">In 2 hours</span></span>',
        1000
      )
    ).toBe(1000 + 2 * 3600_000);
    expect(fullChargeAt("<p>Power Center</p>")).toBeNull();
  });

  it("reads the newest Small Hack Job from the logs", () => {
    expect(latestJobResult(logs)).toEqual({
      success: false,
      rate: 50,
      money: 0,
      xp: 0,
      at: 1793934411 * 1000,
    });
    // Without the newest entry, the one below it (a success) is the newest
    const first = logs.indexOf(">Small Hack Job<");
    const second = logs.indexOf(">Small Hack Job<", first + 1);
    const older = logs.slice(0, first) + logs.slice(second);
    expect(latestJobResult(older)).toEqual({
      success: true,
      rate: 92,
      money: 4.0696,
      xp: 2.0482,
      at: null,
    });
    expect(latestJobResult(smallhacks)).toBeNull();
  });

  it("decodes HTML entities and compares job lists", () => {
    expect(decodeEntities("Tom&#039;s &amp; Jerry&#x27;s &quot;x&quot;")).toBe(
      `Tom's & Jerry's "x"`
    );
    const jobs = parseJobs(smallhacks);
    expect(sameJobs(jobs, parseJobs(smallhacks))).toBe(true);
    expect(sameJobs(jobs, [{ ...jobs[0], rate: 98 }, ...jobs.slice(1)])).toBe(
      false
    );
    expect(sameJobs(jobs, jobs.slice(1))).toBe(false);
  });
});
