import manifest from "../manifest.json";
import { GAMES, gameForUrl, getGame } from "./registry";

describe("game registry", () => {
  it("has unique ids and paths", () => {
    expect(new Set(GAMES.map((game) => game.id)).size).toBe(GAMES.length);
    expect(new Set(GAMES.map((game) => game.path)).size).toBe(GAMES.length);
  });

  it("matches each manifest.json content script's pages exactly", () => {
    const expected = GAMES.map(
      (game) => `https://hackforums.net${game.path}*`
    ).sort();
    const gameScripts = manifest.content_scripts.filter(
      (s) => !["hackgame.js", "statuscard.js"].includes(s.js[0])
    );
    expect(gameScripts.map((s) => s.js[0]).sort()).toEqual([
      "content.js",
      "page-bridge.js",
    ]);
    for (const script of gameScripts) {
      expect([...script.matches].sort()).toEqual(expected);
    }
  });

  it("gives every setting a unique id within its game", () => {
    for (const game of GAMES) {
      const ids = game.settings.map((setting) => setting.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("only lets enabledBy point at a checkbox in the same game", () => {
    for (const game of GAMES) {
      for (const setting of game.settings) {
        if (!setting.enabledBy) continue;
        const target = game.settings.find((s) => s.id === setting.enabledBy);
        expect(target?.type).toBe("checkbox");
      }
    }
  });
});

describe("gameForUrl", () => {
  it("finds the game for its page", () => {
    expect(gameForUrl("https://hackforums.net/blackjack.php")?.id).toBe(
      "blackjack"
    );
    expect(gameForUrl("https://hackforums.net/slots.php#top")?.id).toBe(
      "slots"
    );
  });

  it("ignores stats views, other pages, other hosts and bad URLs", () => {
    expect(
      gameForUrl("https://hackforums.net/blackjack.php?action=stats")
    ).toBeUndefined();
    expect(gameForUrl("https://hackforums.net/index.php")).toBeUndefined();
    expect(gameForUrl("https://example.com/blackjack.php")).toBeUndefined();
    expect(gameForUrl("not a url")).toBeUndefined();
  });

  it("getGame looks games up by id", () => {
    expect(getGame("slots")?.name).toBe("Slots");
    expect(getGame("poker")).toBeUndefined();
  });
});
