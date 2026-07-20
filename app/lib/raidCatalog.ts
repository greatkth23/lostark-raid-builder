import raidInfoMarkdown from "../../raid_info.md?raw";

export type GoldPreference = "bound" | "tradable";

export type RaidDefinition = {
  name: string;
  family: string;
  variant: string;
  size: 4 | 8;
  dealerSlots: number;
  supportSlots: number;
  minItemLevel: number;
  gold: number;
  tradableGold: number;
  boundGold: number;
};

const HEADER_ALIASES = {
  name: ["레이드"],
  minItemLevel: ["입장레벨", "입장 레벨"],
  size: ["인원", "공격대 인원"],
  gold: ["골드(합계)", "골드 합계", "합계골드"],
  tradableGold: ["유통골드", "거래가능골드", "거래 가능 골드"],
  boundGold: ["귀속골드", "귀속 골드"],
} as const;

const cleanCell = (value: string) =>
  value.trim().replace(/^`|`$/g, "").replace(/\*\*/g, "");

const parseNumber = (value: string) => {
  const parsed = Number(cleanCell(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const getColumnIndex = (
  headers: string[],
  aliases: readonly string[],
  label: string,
) => {
  const index = headers.findIndex((header) => aliases.includes(header));
  if (index < 0) {
    throw new Error(`raid_info.md에 '${label}' 열이 필요합니다.`);
  }
  return index;
};

const getRaidIdentity = (name: string) => {
  const match = name.match(/^(.*?)\s+(\d+단계|노말|하드|나메|나이트메어)$/);
  if (!match) {
    return { family: name, variant: name };
  }

  return {
    family: match[1].trim(),
    variant: match[2] === "나메" ? "나이트메어" : match[2],
  };
};

export const parseRaidInfoMarkdown = (markdown: string): RaidDefinition[] => {
  const tableRows = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) => line.slice(1, -1).split("|").map(cleanCell));

  if (tableRows.length < 3) {
    throw new Error("raid_info.md에서 레이드 표를 찾지 못했습니다.");
  }

  const headers = tableRows[0];
  const columns = {
    name: getColumnIndex(headers, HEADER_ALIASES.name, "레이드"),
    minItemLevel: getColumnIndex(
      headers,
      HEADER_ALIASES.minItemLevel,
      "입장레벨",
    ),
    size: getColumnIndex(headers, HEADER_ALIASES.size, "인원"),
    gold: getColumnIndex(headers, HEADER_ALIASES.gold, "골드(합계)"),
    tradableGold: getColumnIndex(
      headers,
      HEADER_ALIASES.tradableGold,
      "유통골드",
    ),
    boundGold: getColumnIndex(headers, HEADER_ALIASES.boundGold, "귀속골드"),
  };

  const definitions = tableRows.slice(2).map((cells, index) => {
    const name = cells[columns.name]?.trim();
    const minItemLevel = parseNumber(cells[columns.minItemLevel] ?? "");
    const size = parseNumber(cells[columns.size] ?? "");
    const gold = parseNumber(cells[columns.gold] ?? "");
    const tradableGold = parseNumber(cells[columns.tradableGold] ?? "");
    const boundGold = parseNumber(cells[columns.boundGold] ?? "");

    if (!name) {
      throw new Error(`raid_info.md ${index + 3}행의 레이드명이 비어 있습니다.`);
    }
    if (size !== 4 && size !== 8) {
      throw new Error(
        `raid_info.md ${index + 3}행 '${name}'의 인원은 4 또는 8이어야 합니다.`,
      );
    }
    if (
      [minItemLevel, gold, tradableGold, boundGold].some(
        (value) => !Number.isFinite(value) || value < 0,
      )
    ) {
      throw new Error(`raid_info.md ${index + 3}행 '${name}'의 숫자 값을 확인하세요.`);
    }
    if (gold !== tradableGold + boundGold) {
      throw new Error(
        `raid_info.md ${index + 3}행 '${name}'의 합계 골드가 유통+귀속 골드와 다릅니다.`,
      );
    }

    const identity = getRaidIdentity(name);
    const supportSlots = size / 4;
    return {
      name,
      ...identity,
      size,
      dealerSlots: size - supportSlots,
      supportSlots,
      minItemLevel,
      gold,
      tradableGold,
      boundGold,
    } satisfies RaidDefinition;
  });

  const names = new Set<string>();
  definitions.forEach((raid) => {
    if (names.has(raid.name)) {
      throw new Error(`raid_info.md에 '${raid.name}' 레이드가 중복되어 있습니다.`);
    }
    names.add(raid.name);
  });

  return definitions;
};

export const RAID_DEFINITIONS = parseRaidInfoMarkdown(raidInfoMarkdown);

export const getRaidDefinition = (raidName: string) =>
  RAID_DEFINITIONS.find((raid) => raid.name === raidName);

export const getExclusiveRaidNames = (raidName: string) => {
  const raid = getRaidDefinition(raidName);
  if (!raid) return [];

  return RAID_DEFINITIONS.filter(
    (candidate) =>
      candidate.family === raid.family && candidate.name !== raid.name,
  ).map((candidate) => candidate.name);
};

const compareRaidPriority = (a: RaidDefinition, b: RaidDefinition) =>
  b.minItemLevel - a.minItemLevel ||
  b.gold - a.gold ||
  RAID_DEFINITIONS.indexOf(a) - RAID_DEFINITIONS.indexOf(b);

export const getAutoRaidsForLevel = (itemLevel: number) => {
  const raidLimit = itemLevel >= 1700 ? 4 : 3;
  const selectedFamilies = new Set<string>();

  return RAID_DEFINITIONS.filter((raid) => itemLevel >= raid.minItemLevel)
    .sort(compareRaidPriority)
    .filter((raid) => {
      if (selectedFamilies.has(raid.family)) return false;
      selectedFamilies.add(raid.family);
      return true;
    })
    .slice(0, raidLimit)
    .map((raid) => raid.name);
};

export const getGoldRecommendedRaidNames = (
  raidNames: string[],
  preference: GoldPreference,
) =>
  raidNames
    .map(getRaidDefinition)
    .filter((raid): raid is RaidDefinition => Boolean(raid))
    .sort((a, b) => {
      const preferredDiff =
        preference === "tradable"
          ? b.tradableGold - a.tradableGold
          : b.boundGold - a.boundGold;
      return preferredDiff || b.gold - a.gold || compareRaidPriority(a, b);
    })
    .slice(0, 3)
    .map((raid) => raid.name);

