import { env } from "cloudflare:workers";

export function getD1() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB`.",
    );
  }

  return env.DB;
}

let initialization: Promise<unknown> | null = null;

export function ensureDatabase() {
  if (!initialization) {
    const d1 = getD1();
    initialization = d1
      .batch([
        d1.prepare(`
          CREATE TABLE IF NOT EXISTS raid_groups (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL UNIQUE,
            password_salt TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            data_json TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
        d1.prepare(`
          CREATE TABLE IF NOT EXISTS raid_group_sessions (
            token_hash TEXT PRIMARY KEY NOT NULL,
            raid_group_id TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (raid_group_id) REFERENCES raid_groups(id) ON DELETE CASCADE
          )
        `),
        d1.prepare(
          "CREATE INDEX IF NOT EXISTS raid_group_sessions_group_idx ON raid_group_sessions (raid_group_id)",
        ),
        d1.prepare(
          "CREATE INDEX IF NOT EXISTS raid_group_sessions_expiry_idx ON raid_group_sessions (expires_at)",
        ),
      ])
      .catch((error: unknown) => {
        initialization = null;
        throw error;
      });
  }

  return initialization;
}
