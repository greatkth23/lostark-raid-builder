import { describe, expect, it } from "vitest";

import {
  RAID_DEFINITIONS,
  getAutoRaidsForLevel,
  getExclusiveRaidNames,
  sortRaidFamiliesForPartyTabs,
} from "./raidCatalog";

describe("벨가르딘 레이드 카탈로그", () => {
  it("세 난이도의 입장 조건과 골드 정보를 제공한다", () => {
    const raids = RAID_DEFINITIONS.filter(
      (raid) => raid.family === "벨가르딘",
    );

    expect(raids).toEqual([
      expect.objectContaining({
        name: "벨가르딘 노말",
        variant: "노말",
        minItemLevel: 1750,
        size: 8,
        gold: 50_000,
        tradableGold: 50_000,
        boundGold: 0,
      }),
      expect.objectContaining({
        name: "벨가르딘 하드",
        variant: "하드",
        minItemLevel: 1770,
        size: 8,
        gold: 62_000,
        tradableGold: 62_000,
        boundGold: 0,
      }),
      expect.objectContaining({
        name: "벨가르딘 나메",
        variant: "나이트메어",
        minItemLevel: 1780,
        size: 8,
        gold: 75_000,
        tradableGold: 75_000,
        boundGold: 0,
      }),
    ]);
  });

  it("한 캐릭터에는 벨가르딘 난이도를 하나만 선택한다", () => {
    expect(getExclusiveRaidNames("벨가르딘 노말")).toEqual([
      "벨가르딘 하드",
      "벨가르딘 나메",
    ]);
  });

  it.each([
    [1750, "벨가르딘 노말"],
    [1770, "벨가르딘 하드"],
    [1780, "벨가르딘 나메"],
  ])("아이템 레벨 %i에서 %s을 자동 등록한다", (itemLevel, raidName) => {
    expect(getAutoRaidsForLevel(itemLevel)[0]).toBe(raidName);
  });
});

describe("파티 목록 레이드 계열 탭 정렬", () => {
  it("현재 파티가 있는 계열만 문서의 최고 입장 레벨 내림차순으로 정렬한다", () => {
    expect(sortRaidFamiliesForPartyTabs([
      "4막", "세르카", "벨가르딘", "종막", "성당", "3막", "2막",
    ])).toEqual([
      "벨가르딘", "성당", "세르카", "종막", "4막", "3막", "2막",
    ]);
  });

  it("최고 입장 레벨이 같으면 문서에서 더 아래에 있는 계열을 먼저 둔다", () => {
    const definitions = [
      { ...RAID_DEFINITIONS[0], family: "앞쪽", minItemLevel: 1700 },
      { ...RAID_DEFINITIONS[0], family: "앞쪽", minItemLevel: 1750 },
      { ...RAID_DEFINITIONS[0], family: "뒤쪽", minItemLevel: 1750 },
    ];

    expect(sortRaidFamiliesForPartyTabs(["앞쪽", "뒤쪽"], definitions)).toEqual([
      "뒤쪽", "앞쪽",
    ]);
  });
});
