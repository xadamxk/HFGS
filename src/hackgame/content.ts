/**
 * Content script for HF's Hack Game pages (gamecp.php). Adds the Hack Game
 * panel under the game, keeps the stored job list current from the Small Hack
 * Jobs page, and gives the status card HF's cooldown and power.
 */
import { Logger } from "../core/Logger";
import { migrateStorage } from "../core/storage";
import { BotPanel } from "../core/ui/BotPanel";
import { HackGamePanel, HACKGAME_CSS } from "./panel";
import { rememberPickedJob } from "./jobsView";
import { cooldownSeconds, parseJobs, powerPercent } from "./parse";
import { patchState, updateJobs } from "./store";

async function main(): Promise<void> {
  const current = document.getElementById("game_content_currentpage");
  if (!current) return;
  await migrateStorage();

  const html = document.documentElement.outerHTML;
  // On the Small Hack Jobs page: store the jobs (only rewritten if HF changed
  // them), select the remembered job and remember the one picked
  if (new URLSearchParams(location.search).get("action") === "smallhacks") {
    const jobs = parseJobs(html);
    await updateJobs(jobs);
    await rememberPickedJob(document, jobs);
  }
  // Every game page shows HF's cooldown: the status card counts down to it
  await patchState({
    readyAt: Date.now() + cooldownSeconds(html) * 1000,
    power: powerPercent(html),
  });

  BotPanel.injectStyles();
  if (!document.getElementById("hfgs-hackgame-styles")) {
    const style = document.createElement("style");
    style.id = "hfgs-hackgame-styles";
    style.textContent = HACKGAME_CSS;
    document.head.appendChild(style);
  }
  const anchor = current.closest("form") ?? current.closest("table");
  const panel = new HackGamePanel();
  (anchor ?? current).after(panel.element);
  await panel.init();
}

main().catch((error) =>
  Logger.error(`Couldn't start the Hack Game panel: ${error?.message}`, error)
);
