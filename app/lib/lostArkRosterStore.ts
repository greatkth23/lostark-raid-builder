import { ensureDatabase, getD1 } from "../../db";

export type RosterCharacter = {
  name: string;
  serverName: string;
  className: string;
  itemLevel: number;
  combatPower: number;
};

const CACHE_TTL_MS = 30_000;
const QUOTA_WINDOW_MS = 60_000;
const GLOBAL_REQUEST_LIMIT = 90;
const ROOM_SYNC_LIMIT = 20;

type CacheRow = {
  data_json: string;
};

export async function getCachedRoster(characterName: string) {
  await ensureDatabase();
  const row = await getD1()
    .prepare(
      `SELECT data_json
       FROM lostark_roster_cache
       WHERE character_key = ?1 AND expires_at > ?2`,
    )
    .bind(normalizeCharacterKey(characterName), Date.now())
    .first<CacheRow>();

  if (!row) return null;

  try {
    const parsed = JSON.parse(row.data_json) as unknown;
    return Array.isArray(parsed) ? (parsed as RosterCharacter[]) : null;
  } catch {
    return null;
  }
}

export async function cacheRoster(
  characterNames: string[],
  characters: RosterCharacter[],
) {
  await ensureDatabase();
  const d1 = getD1();
  const now = Date.now();
  const expiresAt = now + CACHE_TTL_MS;
  const dataJson = JSON.stringify(characters);
  const keys = Array.from(
    new Set(characterNames.map(normalizeCharacterKey).filter(Boolean)),
  );

  if (keys.length === 0) return;

  await d1.batch([
    d1
      .prepare("DELETE FROM lostark_roster_cache WHERE expires_at <= ?1")
      .bind(now),
    ...keys.map((key) =>
      d1
        .prepare(
          `INSERT INTO lostark_roster_cache
             (character_key, data_json, expires_at, updated_at)
           VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
           ON CONFLICT(character_key) DO UPDATE SET
             data_json = excluded.data_json,
             expires_at = excluded.expires_at,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(key, dataJson, expiresAt),
    ),
  ]);
}

export function consumeRoomSyncQuota(roomId: string) {
  return consumeQuota(`room:${roomId}`, 1, ROOM_SYNC_LIMIT);
}

export function consumeGlobalRequestQuota(cost: number) {
  return consumeQuota("global", cost, GLOBAL_REQUEST_LIMIT);
}

async function consumeQuota(scope: string, cost: number, limit: number) {
  await ensureDatabase();
  const now = Date.now();
  const windowStart = Math.floor(now / QUOTA_WINDOW_MS) * QUOTA_WINDOW_MS;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStart + QUOTA_WINDOW_MS - now) / 1_000),
  );

  if (!Number.isInteger(cost) || cost < 1 || cost > limit) {
    return { allowed: false, retryAfterSeconds };
  }

  const d1 = getD1();
  const result = await d1
    .prepare(
      `INSERT INTO lostark_api_usage
         (scope, window_start, request_count)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(scope, window_start) DO UPDATE SET
         request_count = request_count + excluded.request_count
       WHERE request_count + excluded.request_count <= ?4`,
    )
    .bind(scope, windowStart, cost, limit)
    .run();

  await d1
    .prepare("DELETE FROM lostark_api_usage WHERE window_start < ?1")
    .bind(windowStart - QUOTA_WINDOW_MS * 5)
    .run();

  return {
    allowed: (result.meta.changes ?? 0) === 1,
    retryAfterSeconds,
  };
}

const normalizeCharacterKey = (value: string) =>
  value.trim().normalize("NFC").toLocaleLowerCase("ko-KR");
