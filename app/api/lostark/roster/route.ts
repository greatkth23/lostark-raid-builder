import { env } from "cloudflare:workers";
import {
  cacheRoster,
  consumeGlobalRequestQuota,
  consumeRoomSyncQuota,
  getCachedRoster,
  type RosterCharacter,
} from "../../../lib/lostArkRosterStore";
import { getRaidGroupSession } from "../../../lib/raidGroupStore";

type LostArkSibling = {
  ServerName?: string;
  CharacterName?: string;
  CharacterClassName?: string;
  ItemAvgLevel?: string;
};

type LostArkProfile = {
  ServerName?: string;
  CharacterName?: string;
  CharacterClassName?: string;
  ItemAvgLevel?: string;
  CombatPower?: string | number;
};

const LOSTARK_API_BASE = "https://developer-lostark.game.onstove.com";

export async function POST(request: Request) {
  try {
    const session = await getRaidGroupSession(request);
    if (!session) {
      return Response.json(
        { message: "공격대에 가입해야 원정대를 동기화할 수 있습니다." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      characterName?: string;
    };
    const characterName = body.characterName?.trim();

    if (!characterName) {
      return Response.json(
        { message: "대표 캐릭터명이 필요합니다." },
        { status: 400 },
      );
    }

    const apiKey = env.LOSTARK_API_JWT?.trim();
    if (!apiKey) {
      return Response.json(
        { message: "서버의 Lost Ark API 키가 설정되지 않았습니다." },
        { status: 503 },
      );
    }

    const cached = await getCachedRoster(characterName);
    if (cached) {
      return Response.json({ characters: cached });
    }

    const roomQuota = await consumeRoomSyncQuota(session.roomId);
    if (!roomQuota.allowed) {
      return quotaExceeded(roomQuota.retryAfterSeconds);
    }

    const initialQuota = await consumeGlobalRequestQuota(1);
    if (!initialQuota.allowed) {
      return quotaExceeded(initialQuota.retryAfterSeconds);
    }

    const authorization = apiKey.toLowerCase().startsWith("bearer ")
      ? apiKey
      : `bearer ${apiKey}`;
    const headers = {
      accept: "application/json",
      authorization,
    };

    const siblingsResponse = await fetch(
      `${LOSTARK_API_BASE}/characters/${encodeURIComponent(characterName)}/siblings`,
      { cache: "no-store", headers },
    );

    if (!siblingsResponse.ok) {
      return upstreamError(siblingsResponse);
    }

    const siblings = (await siblingsResponse.json()) as LostArkSibling[];

    if (!Array.isArray(siblings) || siblings.length === 0) {
      await cacheRoster([characterName], []);
      return Response.json({ characters: [] });
    }

    const profileNames = siblings
      .map((sibling) => sibling.CharacterName?.trim() ?? "")
      .filter(Boolean);
    if (profileNames.length > 0) {
      const profileQuota = await consumeGlobalRequestQuota(profileNames.length);
      if (!profileQuota.allowed) {
        return quotaExceeded(profileQuota.retryAfterSeconds);
      }
    }

    const characters: RosterCharacter[] = [];

    for (const sibling of siblings) {
      const siblingName = sibling.CharacterName;
      let profile: LostArkProfile | null = null;

      if (siblingName) {
        const profileResponse = await fetch(
          `${LOSTARK_API_BASE}/armories/characters/${encodeURIComponent(siblingName)}/profiles`,
          { cache: "no-store", headers },
        );

        if (profileResponse.ok) {
          profile = (await profileResponse.json()) as LostArkProfile;
        } else if (
          profileResponse.status === 401 ||
          profileResponse.status === 403 ||
          profileResponse.status === 429 ||
          profileResponse.status >= 500
        ) {
          return upstreamError(profileResponse);
        }
      }

      const name = profile?.CharacterName ?? sibling.CharacterName ?? "";
      const className =
        profile?.CharacterClassName ?? sibling.CharacterClassName ?? "";
      const serverName = profile?.ServerName ?? sibling.ServerName ?? "";
      const itemLevel = parseGameNumber(
        profile?.ItemAvgLevel ?? sibling.ItemAvgLevel ?? "0",
      );
      const combatPower = parseGameNumber(profile?.CombatPower ?? null);

      if (name) {
        characters.push({
          name,
          serverName,
          className,
          itemLevel,
          combatPower,
        });
      }
    }

    const sortedCharacters = characters.sort(
      (a, b) => b.itemLevel - a.itemLevel,
    );
    await cacheRoster(
      [characterName, ...profileNames],
      sortedCharacters,
    );

    return Response.json({ characters: sortedCharacters });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { message: "요청 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    return Response.json(
      { message: "Lost Ark API 응답을 처리하지 못했습니다." },
      { status: 500 },
    );
  }
}

const parseGameNumber = (value: string | number | null) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const quotaExceeded = (retryAfterSeconds: number) =>
  Response.json(
    {
      message: `API 요청이 많습니다. ${retryAfterSeconds}초 후 다시 시도하세요.`,
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );

const upstreamError = (response: Response) => {
  if (response.status === 401 || response.status === 403) {
    return Response.json(
      { message: "서버의 Lost Ark API 키 인증에 실패했습니다." },
      { status: 503 },
    );
  }

  if (response.status === 429) {
    const retryAfterSeconds = getUpstreamRetryAfter(response);
    return quotaExceeded(retryAfterSeconds);
  }

  if (response.status === 503) {
    return Response.json(
      { message: "Lost Ark API가 점검 중입니다. 잠시 후 다시 시도하세요." },
      { status: 503 },
    );
  }

  return Response.json(
    { message: `원정대 캐릭터 조회에 실패했습니다. (${response.status})` },
    { status: response.status >= 500 ? 502 : response.status },
  );
};

const getUpstreamRetryAfter = (response: Response) => {
  const retryAfter = Number(response.headers.get("Retry-After"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.ceil(retryAfter);
  }

  const resetAt = Number(response.headers.get("X-RateLimit-Reset"));
  if (Number.isFinite(resetAt) && resetAt > 0) {
    return Math.max(1, Math.ceil(resetAt - Date.now() / 1_000));
  }

  return 60;
};
