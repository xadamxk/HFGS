import {
  getItem,
  migrateStorage,
  setItem,
  STORAGE_KEYS,
  STORAGE_SCHEMA_VERSION,
} from "./storage";

describe("migrateStorage", () => {
  it("brings a new install up to the current version", async () => {
    expect(await migrateStorage()).toBe(STORAGE_SCHEMA_VERSION);
    expect(await getItem(STORAGE_KEYS.schemaVersion)).toBe(
      STORAGE_SCHEMA_VERSION
    );
  });

  it("is safe to run again", async () => {
    await migrateStorage();
    expect(await migrateStorage()).toBe(STORAGE_SCHEMA_VERSION);
  });

  it("leaves data from a newer version alone", async () => {
    await setItem(STORAGE_KEYS.schemaVersion, STORAGE_SCHEMA_VERSION + 5);
    expect(await migrateStorage()).toBe(STORAGE_SCHEMA_VERSION + 5);
    expect(await getItem(STORAGE_KEYS.schemaVersion)).toBe(
      STORAGE_SCHEMA_VERSION + 5
    );
  });

  it("gives each game its own copy of the bot settings that used to be shared", async () => {
    await setItem(STORAGE_KEYS.schemaVersion, 1);
    await setItem(STORAGE_KEYS.settings, {
      global: { headless: false, actionDelayMs: 3000, stopLoss: 40 },
      games: { blackjack: { baseBet: 5, stopLoss: 10 } },
      hackgame: { statusCard: true },
    });
    expect(await migrateStorage()).toBe(2);
    expect(await getItem(STORAGE_KEYS.settings)).toEqual({
      games: {
        // A game's own value wins over the old shared one
        blackjack: {
          headless: false,
          actionDelayMs: 3000,
          stopLoss: 10,
          baseBet: 5,
        },
        slots: { headless: false, actionDelayMs: 3000, stopLoss: 40 },
      },
      hackgame: { statusCard: true },
    });
  });

  it("names history keys per game", () => {
    expect(STORAGE_KEYS.history("blackjack")).toBe("history:blackjack");
  });
});
