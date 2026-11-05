import { SettingDefinition, SettingValues } from "../settings/definitions";

/**
 * A game HFGS supports. Pure data, so the options page can list every game's
 * settings without bundling the game code. Adding a game means adding a folder
 * under src/games/ with one of these, registering it in registry.ts and adding
 * its page to manifest.json's content script matches (a test checks they agree).
 */
export interface GameDefinition<T = SettingValues> {
  /** Stable id used in storage keys; never change it once released. */
  id: string;
  name: string;
  description: string;
  /** The game's page on hackforums.net, e.g. "/blackjack.php". */
  path: string;
  settings: SettingDefinition<T>[];
}
