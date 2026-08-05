import { describe, expect, it } from "vitest";

import {
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
