import { ensureDatabase, getD1 } from "../../db";
import {
  applyRaidGroupOperation,
  createPlayer,
  normalizePlayers,
  type Player,
  type RaidGroupOperation,
  type RaidGroupRoom,
} from "./raidData";
import { getRaidWeekKey } from "./raidWeek";

const COOKIE_NAME = "lostark-raid-group-session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 100_000;

type RaidGroupRow = {
  id: string;
  name: string;
  password_salt: string;
  password_hash: string;
  data_json: string;
  revision: number;
};

export class RaidGroupError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function createRaidGroup(
  nameValue: unknown,
  passwordValue: unknown,
  seedValue: unknown,
) {
  await ensureDatabase();
  const name = validateName(nameValue);
  const password = validatePassword(passwordValue);
  const existing = await getD1()
    .prepare("SELECT id FROM raid_groups WHERE name = ?1")
    .bind(name)
    .first<{ id: string }>();
  if (existing) {
    throw new RaidGroupError("이미 사용 중인 공격대 이름입니다.", 409);
  }

  const seedPlayers = normalizePlayers(seedValue);
  const players = seedPlayers?.length ? seedPlayers : [createPlayer(1)];
  const id = crypto.randomUUID();
  const { salt, hash } = await hashPassword(password);

  try {
    await getD1()
      .prepare(
        `INSERT INTO raid_groups
          (id, name, password_salt, password_hash, data_json, revision)
         VALUES (?1, ?2, ?3, ?4, ?5, 1)`,
      )
      .bind(id, name, salt, hash, JSON.stringify({ players }))
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new RaidGroupError("이미 사용 중인 공격대 이름입니다.", 409);
    }
    throw error;
  }

  const token = await createSession(id);
  return {
    token,
    snapshot: toSnapshot({ id, name, revision: 1 }, players),
  };
}

export async function joinRaidGroup(nameValue: unknown, passwordValue: unknown) {
  await ensureDatabase();
  const name = validateName(nameValue);
  const password = validatePassword(passwordValue);
  const row = await getD1()
    .prepare(
      `SELECT id, name, password_salt, password_hash, data_json, revision
       FROM raid_groups WHERE name = ?1`,
    )
    .bind(name)
    .first<RaidGroupRow>();

  if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
    throw new RaidGroupError("공격대 이름 또는 비밀번호가 올바르지 않습니다.", 401);
  }

  const token = await createSession(row.id);
  return { token, snapshot: snapshotFromRow(row) };
}

export async function getRaidGroupSession(request: Request) {
  await ensureDatabase();
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  if (!token) return null;

  const tokenHash = await sha256(token);
  const row = await getD1()
    .prepare(
      `SELECT g.id, g.name, g.password_salt, g.password_hash,
              g.data_json, g.revision, s.expires_at
       FROM raid_group_sessions s
       JOIN raid_groups g ON g.id = s.raid_group_id
       WHERE s.token_hash = ?1`,
    )
    .bind(tokenHash)
    .first<RaidGroupRow & { expires_at: number }>();

  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await getD1()
      .prepare("DELETE FROM raid_group_sessions WHERE token_hash = ?1")
      .bind(tokenHash)
      .run();
    return null;
  }

  return { tokenHash, roomId: row.id, snapshot: snapshotFromRow(row) };
}

export async function mutateRaidGroup(
  roomId: string,
  operationValue: unknown,
) {
  const operation = validateOperation(operationValue);
  const d1 = getD1();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const row = await d1
      .prepare(
        "SELECT id, name, data_json, revision FROM raid_groups WHERE id = ?1",
      )
      .bind(roomId)
      .first<Pick<RaidGroupRow, "id" | "name" | "data_json" | "revision">>();
    if (!row) throw new RaidGroupError("공격대를 찾을 수 없습니다.", 404);

    const players = parsePlayers(row.data_json);
    const nextPlayers = applyRaidGroupOperation(
      players,
      operation,
      getRaidWeekKey(),
    );
    const result = await d1
      .prepare(
        `UPDATE raid_groups
         SET data_json = ?1, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND revision = ?3`,
      )
      .bind(JSON.stringify({ players: nextPlayers }), roomId, row.revision)
      .run();

    if ((result.meta.changes ?? 0) === 1) {
      return { revision: row.revision + 1, raidWeek: getRaidWeekKey() };
    }
  }

  throw new RaidGroupError("동시에 수정된 내용이 많습니다. 잠시 후 다시 시도하세요.", 409);
}

export async function updateRaidGroupSettings(
  roomId: string,
  nameValue: unknown,
  passwordValue: unknown,
) {
  await ensureDatabase();
  const name = validateName(nameValue);
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const d1 = getD1();

  try {
    if (password) {
      const validatedPassword = validatePassword(password);
      const { salt, hash } = await hashPassword(validatedPassword);
      await d1
        .prepare(
          `UPDATE raid_groups
           SET name = ?1, password_salt = ?2, password_hash = ?3,
               revision = revision + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?4`,
        )
        .bind(name, salt, hash, roomId)
        .run();
    } else {
      await d1
        .prepare(
          `UPDATE raid_groups
           SET name = ?1, revision = revision + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?2`,
        )
        .bind(name, roomId)
        .run();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new RaidGroupError("이미 사용 중인 공격대 이름입니다.", 409);
    }
    throw error;
  }

  const room = await d1
    .prepare("SELECT id, name, revision FROM raid_groups WHERE id = ?1")
    .bind(roomId)
    .first<Pick<RaidGroupRow, "id" | "name" | "revision">>();

  if (!room) {
    throw new RaidGroupError("공격대를 찾을 수 없습니다.", 404);
  }

  return { room };
}

export async function deleteRaidGroupSession(tokenHash: string | null) {
  if (!tokenHash) return;
  await ensureDatabase();
  await getD1()
    .prepare("DELETE FROM raid_group_sessions WHERE token_hash = ?1")
    .bind(tokenHash)
    .run();
}

export function makeSessionCookie(request: Request, token: string) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export function makeExpiredSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

const createSession = async (roomId: string) => {
  const token = randomBase64(32);
  const tokenHash = await sha256(token);
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  await getD1()
    .prepare(
      `INSERT INTO raid_group_sessions (token_hash, raid_group_id, expires_at)
       VALUES (?1, ?2, ?3)`,
    )
    .bind(tokenHash, roomId, expiresAt)
    .run();
  return token;
};

const snapshotFromRow = (row: Pick<RaidGroupRow, "id" | "name" | "revision" | "data_json">) =>
  toSnapshot(row, parsePlayers(row.data_json));

const toSnapshot = (
  room: RaidGroupRoom,
  players: Player[],
) => ({
  room: { id: room.id, name: room.name, revision: room.revision },
  players,
  raidWeek: getRaidWeekKey(),
});

const parsePlayers = (json: string) => {
  try {
    const parsed = JSON.parse(json) as { players?: unknown };
    return normalizePlayers(parsed.players) ?? [];
  } catch {
    return [];
  }
};

const validateName = (value: unknown) => {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length < 2 || name.length > 40) {
    throw new RaidGroupError("공격대 이름은 2~40자로 입력하세요.", 400);
  }
  return name;
};

const validatePassword = (value: unknown) => {
  const password = typeof value === "string" ? value : "";
  if (password.length < 6 || password.length > 72) {
    throw new RaidGroupError("비밀번호는 6~72자로 입력하세요.", 400);
  }
  return password;
};

const validateOperation = (value: unknown) => {
  if (!value || typeof value !== "object" || typeof (value as { type?: unknown }).type !== "string") {
    throw new RaidGroupError("수정 요청 형식이 올바르지 않습니다.", 400);
  }
  return value as RaidGroupOperation;
};

const hashPassword = async (password: string) => {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToBase64(saltBytes);
  const hash = bytesToBase64(await derivePassword(password, saltBytes));
  return { salt, hash };
};

const verifyPassword = async (password: string, salt: string, expected: string) => {
  const actual = await derivePassword(password, base64ToBytes(salt));
  const expectedBytes = base64ToBytes(expected);
  if (actual.length !== expectedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expectedBytes[index];
  }
  return difference === 0;
};

const derivePassword = async (password: string, salt: Uint8Array) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: Uint8Array.from(salt).buffer,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64(new Uint8Array(digest));
};

const randomBase64 = (length: number) =>
  bytesToBase64(crypto.getRandomValues(new Uint8Array(length)));

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const readCookie = (cookieHeader: string | null, name: string) => {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return "";
};
