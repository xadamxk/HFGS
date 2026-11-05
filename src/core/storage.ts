/**
 * chrome.storage.local access and the stored-data schema version.
 *
 * Every key the extension writes is listed in STORAGE_KEYS. When the shape of
 * stored data changes, bump STORAGE_SCHEMA_VERSION and add a migration that
 * upgrades data from the previous version.
 */

export const STORAGE_KEYS = {
  schemaVersion: "schemaVersion",
  settings: "settings",
  /** Per-game history and totals: `history:<gameId>` (written from Phase 2). */
  history: (gameId: string) => `history:${gameId}`,
} as const;

export const STORAGE_SCHEMA_VERSION = 1;

type Migration = () => Promise<void>;

/**
 * MIGRATIONS[n] upgrades stored data from version n to n + 1. Version 0 means
 * nothing stored yet (a new install). The MV2 extension's data, kept in
 * hackforums.net's localStorage, is deliberately not imported.
 */
const MIGRATIONS: Record<number, Migration> = {
  0: async () => {
    // Nothing to convert: v1 is the first chrome.storage layout.
  },
};

export async function getItem<T>(key: string): Promise<T | undefined> {
  const stored = await chrome.storage.local.get(key);
  return stored[key] as T | undefined;
}

export async function setItem(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function removeItem(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}

/**
 * Bring stored data up to STORAGE_SCHEMA_VERSION. Safe to call repeatedly and
 * from several places. Data from a newer version (a downgrade) is left alone.
 * Returns the version the data is at afterwards.
 */
export async function migrateStorage(): Promise<number> {
  let version = (await getItem<number>(STORAGE_KEYS.schemaVersion)) ?? 0;
  if (version > STORAGE_SCHEMA_VERSION) return version;
  while (version < STORAGE_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new Error(`No storage migration from v${version}`);
    await migrate();
    version += 1;
    await setItem(STORAGE_KEYS.schemaVersion, version);
  }
  return version;
}
