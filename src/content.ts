import { Logger } from "./core/Logger";
import { migrateStorage } from "./core/storage";
import { gameForUrl } from "./games/registry";
import { gameSettings, loadSettings, watchSettings } from "./settings";

/**
 * Runs on every page in manifest.json's matches and starts the game for the
 * current page. Phase 1: only finds the game and its settings; the game panels
 * and bots arrive in Phases 2-4.
 */
async function main(): Promise<void> {
  const game = gameForUrl(location.href);
  if (!game) return;

  await migrateStorage();
  const settings = await loadSettings();
  Logger.log(`${game.name} page detected`, {
    global: settings.global,
    game: gameSettings(settings, game),
  });
  watchSettings((updated) =>
    Logger.debug(`${game.name} settings changed`, gameSettings(updated, game))
  );
}

main().catch((error) =>
  Logger.error(`Couldn't start HFGS: ${error?.message}`, error)
);
