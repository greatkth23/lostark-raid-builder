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
    const body = (await request.json()) as {
      apiKey?: string;
      characterName?: string;
    };
    const apiKey = body.apiKey?.trim();
    const characterName = body.characterName?.trim();

    if (!apiKey || !characterName) {
      return Response.json(
        { message: "API JWT와 대표 캐릭터명이 필요합니다." },
        { status: 400 },
      );
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
      return Response.json(
        {
          message: `원정대 캐릭터 조회 실패 (${siblingsResponse.status})`,
        },
        { status: siblingsResponse.status },
      );
    }

    const siblings = (await siblingsResponse.json()) as LostArkSibling[];

    if (!Array.isArray(siblings) || siblings.length === 0) {
      return Response.json({ characters: [] });
    }

    const characters = [];

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

    return Response.json({
      characters: characters.sort((a, b) => b.itemLevel - a.itemLevel),
    });
  } catch {
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
