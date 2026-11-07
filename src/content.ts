import { GameController } from "./core/GameController";
import { Logger } from "./core/Logger";
import { readPageState } from "./core/pageBridge";
import { migrateStorage } from "./core/storage";
import { BotPanel } from "./core/ui/BotPanel";
import { BOTS } from "./games/bots";
import { gameForUrl } from "./games/registry";
import { loadSettings } from "./settings";

/**
 * Runs on the game pages in manifest.json and mounts the HFGS panel under the
 * game. The panel goes after the game's table (the `table.tborder` holding
 * #PageContainer), found by structure, not by HF's wording, which changes.
 */
async function main(): Promise<void> {
  const game = gameForUrl(location.href);
  if (!game) return;

  const anchor = document
    .querySelector("#PageContainer")
    ?.closest("table.tborder");
  if (!anchor) {
    Logger.warn(
      `Couldn't find the ${game.name} table; HF's page may have changed.`
    );
    return;
  }

  await migrateStorage();
  const [settings, page] = await Promise.all([loadSettings(), readPageState()]);
  Logger.debug(`${game.name} page`, {
    hasPostKey: Boolean(page.postKey),
    windowId: page.windowId,
    openGame: Boolean(page.openGameState),
  });

  const controller = new GameController({
    game,
    bot: BOTS[game.id],
    settings,
    page,
  });
  BotPanel.injectStyles();
  anchor.after(controller.panel.element);
  await controller.init();
}

main().catch((error) =>
  Logger.error(`Couldn't start HFGS: ${error?.message}`, error)
);
