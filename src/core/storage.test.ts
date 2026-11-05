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

  it("names history keys per game", () => {
    expect(STORAGE_KEYS.history("blackjack")).toBe("history:blackjack");
  });
});
