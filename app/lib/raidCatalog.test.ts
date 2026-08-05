import { describe, expect, it } from "vitest";

import {
  RAID_DEFINITIONS,
  getAutoRaidsForLevel,
  getExclusiveRaidNames,
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
