import { describe, expect, it } from "vitest";

import {
  filterGroupsBySelectedPlayerIds,
  selectGroupsForPartyView,
  findPlanGroup,
  movePartyMember,
} from "./partyLayout";
import {
  getRaidDefinition,
  type AssignedMember,
  type RaidGroup,
  type RaidPlanResult,
} from "./raidPlanner";

const createMember = ({
  id,
  playerId,
  itemLevel = 1780,
  role = "dealer",
}: {
  id: string;
  playerId: string;
  itemLevel?: number;
  role?: AssignedMember["role"];
}): AssignedMember => ({
  type: "character",
  id,
  playerId,
  playerName: playerId,
  characterName: id,
  itemLevel,
  combatPower: 1,
  className: `${id}-직업`,
  role,
});

const createGroup = (
  id: string,
  raidName: string,
  members: AssignedMember[],
): RaidGroup => {
  const raid = getRaidDefinition(raidName);
  if (!raid) throw new Error(`${raidName} 레이드 정보를 찾을 수 없습니다.`);
  return {
    id,
    raidName,
    size: raid.size,
    dealerSlots: raid.dealerSlots,
    supportSlots: raid.supportSlots,
    members,
    externalSlots: [],
  };
};

const createPlan = (...groups: RaidGroup[]): RaidPlanResult => ({
  groupsByRaid: groups.reduce<Record<string, RaidGroup[]>>((result, group) => {
    result[group.raidName] = [...(result[group.raidName] ?? []), group];
    return result;
  }, {}),
  warnings: [],
});

describe("파티 드래그 이동", () => {
  it("대상 파티에 같은 플레이어의 캐릭터가 있으면 두 캐릭터를 맞교환한다", () => {
    const moved = createMember({ id: "player-1-hard", playerId: "player-1" });
    const swapped = createMember({
      id: "player-1-normal",
      playerId: "player-1",
      role: "support",
    });
    const source = createGroup("source", "벨가르딘 노말", [moved]);
    const target = createGroup("target", "벨가르딘 하드", [swapped]);

    const result = movePartyMember(
      createPlan(source, target),
      moved.id,
      source.id,
      target.id,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.raidChanged).toBe(true);
    expect(result.swappedMemberId).toBe(swapped.id);
    expect(findPlanGroup(result.plan, source.id)?.members.map((member) => member.id)).toEqual([
      swapped.id,
    ]);
    expect(findPlanGroup(result.plan, target.id)?.members.map((member) => member.id)).toEqual([
      moved.id,
    ]);
  });

  it("맞교환 후 입장 조건을 만족하지 못하면 기존 경고로 이동을 막는다", () => {
    const moved = createMember({ id: "player-1-hard", playerId: "player-1" });
    const underleveled = createMember({
      id: "player-1-normal",
      playerId: "player-1",
      itemLevel: 1750,
    });
    const source = createGroup("source", "벨가르딘 하드", [moved]);
    const target = createGroup("target", "벨가르딘 노말", [underleveled]);

    const result = movePartyMember(
      createPlan(source, target),
      moved.id,
      source.id,
      target.id,
    );

    expect(result).toEqual({
      ok: false,
      reason: "입장 레벨이 부족한 캐릭터는 이동할 수 없습니다.",
    });
  });

  it("같은 플레이어의 캐릭터가 없으면 기존처럼 빈자리로 이동한다", () => {
    const moved = createMember({ id: "player-1", playerId: "player-1" });
    const existing = createMember({ id: "player-2", playerId: "player-2" });
    const source = createGroup("source", "벨가르딘 노말", [moved]);
    const target = createGroup("target", "벨가르딘 노말", [existing]);

    const result = movePartyMember(
      createPlan(source, target),
      moved.id,
      source.id,
      target.id,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.swappedMemberId).toBeUndefined();
    expect(findPlanGroup(result.plan, source.id)?.members).toHaveLength(0);
    expect(findPlanGroup(result.plan, target.id)?.members.map((member) => member.id)).toEqual([
      existing.id,
      moved.id,
    ]);
  });
});

describe("멤버 조합 파티 필터", () => {
  const single = createGroup("single", "성당 3단계", [
    createMember({ id: "alpha-cathedral", playerId: "alpha" }),
  ]);
  const pair = createGroup("pair", "세르카 하드", [
    createMember({ id: "alpha-serka", playerId: "alpha" }),
    createMember({ id: "beta-serka", playerId: "beta" }),
  ]);
  const trio = createGroup("trio", "4막 하드", [
    createMember({ id: "alpha-act4", playerId: "alpha" }),
    createMember({ id: "beta-act4", playerId: "beta" }),
    createMember({ id: "gamma-act4", playerId: "gamma" }),
  ]);
  const groups = [single, pair, trio];

  it("선택한 멤버가 없으면 기존 순서와 배열을 그대로 반환한다", () => {
    const result = filterGroupsBySelectedPlayerIds(groups, new Set());

    expect(result).toBe(groups);
    expect(result.map((group) => group.id)).toEqual(["single", "pair", "trio"]);
  });

  it("단일 멤버를 선택하면 그 멤버가 포함된 모든 파티를 찾는다", () => {
    const result = filterGroupsBySelectedPlayerIds(groups, new Set(["alpha"]));

    expect(result.map((group) => group.id)).toEqual(["single", "pair", "trio"]);
  });

  it("복수 멤버 선택 순서와 무관하게 정확한 조합만 찾는다", () => {
    const result = filterGroupsBySelectedPlayerIds(
      groups,
      new Set(["beta", "alpha"]),
    );

    expect(result.map((group) => group.id)).toEqual(["pair"]);
  });

  it("멤버가 부족하거나 선택하지 않은 멤버가 추가된 파티는 제외한다", () => {
    const result = filterGroupsBySelectedPlayerIds(
      groups,
      new Set(["alpha", "gamma"]),
    );

    expect(result).toEqual([]);
  });

  it("한 플레이어의 캐릭터가 중복되어도 결과 카드는 중복하지 않는다", () => {
    const duplicateCharacters = createGroup("duplicate", "성당 3단계", [
      createMember({ id: "alpha-one", playerId: "alpha" }),
      createMember({ id: "alpha-two", playerId: "alpha" }),
    ]);

    const result = filterGroupsBySelectedPlayerIds(
      [duplicateCharacters],
      new Set(["alpha"]),
    );

    expect(result.map((group) => group.id)).toEqual(["duplicate"]);
  });

  it("멤버별 보기에서는 복수 선택과 정확히 같은 파티만 렌더링한다", () => {
    const result = selectGroupsForPartyView(groups, {
      mode: "member",
      selectedPlayerIds: new Set(["alpha", "beta"]),
    });

    expect(result.map((group) => group.id)).toEqual(["pair"]);
  });

  it("레이드별 보기에서는 선택한 계열의 난이도 파티만 렌더링한다", () => {
    const normal = createGroup("guardian-normal", "벨가르딘 노말", [
      createMember({ id: "beta-normal", playerId: "beta" }),
    ]);
    const hard = createGroup("guardian-hard", "벨가르딘 하드", [
      createMember({ id: "alpha-hard", playerId: "alpha" }),
    ]);

    const result = selectGroupsForPartyView(
      [normal, single, hard, pair, trio],
      { mode: "raid", raidFamily: "벨가르딘" },
    );

    expect(result.map((group) => group.id)).toEqual([
      "guardian-normal",
      "guardian-hard",
    ]);
  });
});
