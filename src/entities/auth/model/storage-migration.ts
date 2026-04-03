import { SessionManager } from "./session-manager";

/**
 * Migrate global pinned/muted room keys to per-account format.
 * Idempotent: skips if per-account key already exists.
 */
export function migratePerAccountKeys(address: string): void {
  const keys = ["chat_pinned_rooms", "chat_muted_rooms"] as const;

  for (const key of keys) {
    const perAccountKey = `${key}:${address}`;

    // Skip if per-account key already exists
    if (localStorage.getItem(perAccountKey) !== null) continue;

    const oldValue = localStorage.getItem(key);
    if (oldValue === null) continue;

    localStorage.setItem(perAccountKey, oldValue);
    localStorage.removeItem(key);
  }
}

/**
 * Migrate global Pcrypto caches ("messages", "events") to per-account format.
 * Non-blocking, fire-and-forget. These are just TTL'd caches — safe to lose.
 */
export async function migrateCryptoStorage(address: string): Promise<void> {
  if (!window.indexedDB?.databases) return;

  try {
    const dbs = await window.indexedDB.databases();
    for (const name of ["messages", "events"]) {
      const perAccountName = `${name}:${address}`;
      const globalExists = dbs.some(db => db.name === name);
      const perAccountExists = dbs.some(db => db.name === perAccountName);

      if (globalExists && !perAccountExists) {
        // Cache is TTL'd (30 days) — just delete global, it regenerates
        indexedDB.deleteDatabase(name);
      }
    }
  } catch (e) {
    console.warn("[migration] Pcrypto cache migration failed:", e);
  }
}

/**
 * Run all storage migrations in order.
 * Called at app startup before auth store init.
 */
export function migrateAll(): void {
  const sm = new SessionManager();

  // Migrate singleton auth → multi-account sessions
  sm.migrate();

  // Migrate global pinned/muted keys to per-account format
  const active = sm.getActiveAddress();
  if (active) {
    migratePerAccountKeys(active);
    // Fire-and-forget: migrate Pcrypto caches (async, non-blocking)
    migrateCryptoStorage(active).catch(() => {});
  }
}
