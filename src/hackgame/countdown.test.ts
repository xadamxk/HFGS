import { defaultSettings, saveSettings } from "../settings";
import {
  formatCountdown,
  renderCountdown,
  startMenuCountdown,
} from "./countdown";
import { saveState, idleState } from "./store";

/** HF's game menu during a cooldown, as on the live page. */
function menu(withHfCountdown = true): Document {
  document.body.innerHTML = `
    <div class="game_nav_content_system_container">
      <a href="gamecp.php?action=opsec" class="usercp_nav_item"><span class="hficon-shield game-nav-icon"></span></a>
      <a href="gamecp.php?action=smallhacks" class="usercp_nav_item"><span class="hficon-briefcase-money game-nav-icon ${
        withHfCountdown ? "game-nav-icon-nongreen " : ""
      }game-nav-smallhacks"></span>${
        withHfCountdown
          ? '<span class="game-countdown-smallhacks game-nav-countdown"><span style="color: #ff4710">02:44</span></span>'
          : ""
      }</a>
    </div>`;
  return document;
}
const link = () =>
  document.querySelector('a[href*="smallhacks"]') as HTMLAnchorElement;
const icon = () => document.querySelector(".game-nav-smallhacks")!;
const shown = () =>
  [...link().querySelectorAll<HTMLElement>(".game-nav-countdown")]
    .filter((el) => el.style.display !== "none")
    .map((el) => el.textContent);

describe("menu countdown", () => {
  it("formats like HF's timer", () => {
    expect(formatCountdown(164)).toBe("02:44");
    expect(formatCountdown(59.2)).toBe("01:00");
    expect(formatCountdown(3725)).toBe("01:02:05");
    expect(formatCountdown(-5)).toBe("00:00");
  });

  it("shows the bot's next step instead of HF's cooldown, and puts HF's back after", () => {
    const doc = menu();
    renderCountdown(doc, 10_000 + 205_000, 10_000);
    expect(shown()).toEqual(["03:25"]);
    expect(icon().classList.contains("game-nav-icon-nongreen")).toBe(true);

    renderCountdown(doc, 10_000 + 205_000, 11_000);
    expect(shown()).toEqual(["03:24"]);

    renderCountdown(doc, null, 12_000);
    expect(shown()).toEqual(["02:44"]);
    expect(link().querySelector(".hfgs-countdown-smallhacks")).toBeNull();
  });

  it("adds a countdown when HF has none, and greens the icon again after", () => {
    const doc = menu(false);
    renderCountdown(doc, 65_000, 0);
    expect(shown()).toEqual(["01:05"]);
    expect(icon().classList.contains("game-nav-icon-nongreen")).toBe(true);
    renderCountdown(doc, 65_000, 70_000);
    expect(shown()).toEqual([]);
    expect(icon().classList.contains("game-nav-icon-nongreen")).toBe(false);
  });

  it("only takes over while a run is playing from a tab", async () => {
    await chrome.storage.local.clear();
    const doc = menu();
    const nextAt = Date.now() + 120_000;
    await saveState({ ...idleState(), running: true, nextAt });
    const background = defaultSettings();
    background.hackgame.runInBackground = true;
    await saveSettings(background);
    const stop = startMenuCountdown(doc);
    await new Promise((r) => setTimeout(r, 20));
    // In background mode HF's countdown stays
    expect(shown()).toEqual(["02:44"]);

    await saveSettings(defaultSettings()); // Run in background: off (the default)
    await new Promise((r) => setTimeout(r, 20));
    expect(shown()).toEqual(["02:00"]);

    stop();
    expect(shown()).toEqual(["02:44"]);
  });
});
