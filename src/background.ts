import { Logger } from "./core/Logger";
import { migrateStorage } from "./core/storage";
import { registerHackGame } from "./hackgame/background";

// Hack Game auto-play while "Run in background" is on
registerHackGame();

// Upgrade stored data on install and on every extension update.
chrome.runtime.onInstalled.addListener(() => {
  migrateStorage().catch((error) =>
    Logger.error(`Storage migration failed: ${error?.message}`, error)
  );
});

// The toolbar button opens the settings page.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Content scripts can't open the settings page themselves; the panel's
// Settings link asks here.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (
    message?.type === "hfgs:open-options" &&
    sender.id === chrome.runtime.id
  ) {
    chrome.runtime.openOptionsPage();
  }
});
