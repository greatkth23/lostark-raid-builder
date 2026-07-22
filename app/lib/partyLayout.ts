import { getRaidDefinition, type CharacterInput, type RaidGroup, type RaidPlanResult } from "./raidPlanner";
import type { ManualPartyLayout } from "./partyTypes";

export type PartyPlacementResult =
  | { ok: true; plan: RaidPlanResult; raidChanged: boolean }
  | { ok: false; reason: string };

const classKey = (value: string) => value.trim().replace(/\s+/g, "").toLowerCase();

const rebuildGroup = (group: RaidGroup, members: RaidGroup["members"]): RaidGroup => {
  const dealerCount = members.filter((member) => member.role === "dealer").length;
  const supportCount = members.length - dealerCount;
  return {
    ...group,
    members,
    externalSlots: [
      ...Array.from({ length: Math.max(0, group.dealerSlots - dealerCount) }, (_, index) => ({
        type: "external" as const,
        role: "dealer" as const,
        label: `외부 딜러 ${index + 1}`,
      })),
      ...Array.from({ length: Math.max(0, group.supportSlots - supportCount) }, (_, index) => ({
        type: "external" as const,
        role: "support" as const,
        label: `외부 서폿 ${index + 1}`,
      })),
    ],
  };
};

const validateMembers = (group: RaidGroup, members: RaidGroup["members"]) => {
  const raid = getRaidDefinition(group.raidName);
  if (!raid) return "레이드 정보를 찾을 수 없습니다.";
  if (members.length > raid.size) return "공격대 정원을 초과합니다.";
  if (members.some((member) => member.itemLevel < raid.minItemLevel)) {
    return "입장 레벨이 부족한 캐릭터는 이동할 수 없습니다.";
  }
  if (new Set(members.map((member) => member.playerId)).size !== members.length) {
    return "같은 플레이어의 캐릭터를 한 파티에 중복 배치할 수 없습니다.";
  }
  if (members.filter((member) => member.role === "dealer").length > raid.dealerSlots) {
    return "딜러 역할 슬롯이 부족합니다.";
  }
  if (members.filter((member) => member.role === "support").length > raid.supportSlots) {
    return "서폿 역할 슬롯이 부족합니다.";
  }
  const classLimit = raid.size === 4 ? 1 : 2;
  const counts = members.reduce<Record<string, number>>((result, member) => {
    const key = classKey(member.className);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
  if (Object.values(counts).some((count) => count > classLimit)) {
    return "동일 직업 중복 제한을 초과합니다.";
  }
  return "";
};

export const allPlanGroups = (plan: RaidPlanResult) =>
  Object.values(plan.groupsByRaid).flat();

export const findPlanGroup = (plan: RaidPlanResult, groupId: string) =>
  allPlanGroups(plan).find((group) => group.id === groupId);

const replaceGroups = (plan: RaidPlanResult, replacements: Map<string, RaidGroup>) => ({
  ...plan,
  groupsByRaid: Object.fromEntries(
    Object.entries(plan.groupsByRaid).map(([raidName, groups]) => [
      raidName,
      groups.map((group) => replacements.get(group.id) ?? group),
    ]),
  ),
});

export const movePartyMember = (
  plan: RaidPlanResult,
  memberId: string,
  sourceGroupId: string,
  targetGroupId: string,
): PartyPlacementResult => {
  if (sourceGroupId === targetGroupId) return { ok: true, plan, raidChanged: false };
  const source = findPlanGroup(plan, sourceGroupId);
  const target = findPlanGroup(plan, targetGroupId);
  const member = source?.members.find((candidate) => candidate.id === memberId);
  if (!source || !target || !member) return { ok: false, reason: "이동할 캐릭터를 찾을 수 없습니다." };
  const sourceRaid = getRaidDefinition(source.raidName);
  const targetRaid = getRaidDefinition(target.raidName);
  if (!sourceRaid || !targetRaid || sourceRaid.family !== targetRaid.family) {
    return { ok: false, reason: "같은 레이드 계열의 파티 사이에서만 이동할 수 있습니다." };
  }
  const targetMembers = [...target.members, member];
  const reason = validateMembers(target, targetMembers);
  if (reason) return { ok: false, reason };
  const replacements = new Map<string, RaidGroup>([
    [source.id, rebuildGroup(source, source.members.filter((candidate) => candidate.id !== memberId))],
    [target.id, rebuildGroup(target, targetMembers)],
  ]);
  return { ok: true, plan: replaceGroups(plan, replacements), raidChanged: source.raidName !== target.raidName };
};

export const swapPartyMember = (
  plan: RaidPlanResult,
  currentMemberId: string,
  currentGroupId: string,
  candidate: RaidGroup["members"][number],
  candidateGroupId?: string,
): PartyPlacementResult => {
  const currentGroup = findPlanGroup(plan, currentGroupId);
  const candidateGroup = candidateGroupId ? findPlanGroup(plan, candidateGroupId) : undefined;
  const current = currentGroup?.members.find((member) => member.id === currentMemberId);
  if (!currentGroup || !current) return { ok: false, reason: "교환할 캐릭터를 찾을 수 없습니다." };
  if (candidateGroupId === currentGroupId) return { ok: false, reason: "이미 같은 파티에 배치된 캐릭터입니다." };
  if (candidateGroup) {
    const currentRaid = getRaidDefinition(currentGroup.raidName);
    const otherRaid = getRaidDefinition(candidateGroup.raidName);
    if (!currentRaid || !otherRaid || currentRaid.family !== otherRaid.family) {
      return { ok: false, reason: "같은 레이드 계열에 배치된 캐릭터만 맞교환할 수 있습니다." };
    }
  }
  const nextCurrentMembers = currentGroup.members.map((member) =>
    member.id === current.id ? candidate : member,
  );
  const currentReason = validateMembers(currentGroup, nextCurrentMembers);
  if (currentReason) return { ok: false, reason: currentReason };
  const replacements = new Map<string, RaidGroup>([
    [currentGroup.id, rebuildGroup(currentGroup, nextCurrentMembers)],
  ]);
  let raidChanged = false;
  if (candidateGroup) {
    const nextCandidateMembers = candidateGroup.members.map((member) =>
      member.id === candidate.id ? current : member,
    );
    const candidateReason = validateMembers(candidateGroup, nextCandidateMembers);
    if (candidateReason) return { ok: false, reason: candidateReason };
    replacements.set(candidateGroup.id, rebuildGroup(candidateGroup, nextCandidateMembers));
    raidChanged = currentGroup.raidName !== candidateGroup.raidName;
  }
  return { ok: true, plan: replaceGroups(plan, replacements), raidChanged };
};

export const planToManualLayout = (plan: RaidPlanResult): ManualPartyLayout => ({
  version: 1,
  groups: allPlanGroups(plan)
    .filter((group) => group.members.length > 0)
    .map((group) => ({
      id: group.id,
      raidName: group.raidName,
      memberIds: group.members.map((member) => member.id),
    })),
});

export const reconcileManualLayout = (
  layout: ManualPartyLayout,
  characters: CharacterInput[],
): ManualPartyLayout => {
  const byId = new Map(characters.map((character) => [character.id, character]));
  const claimed = new Set<string>();
  return {
    version: 1,
    groups: layout.groups.flatMap((group) => {
      const raid = getRaidDefinition(group.raidName);
      if (!raid) return [];
      const eligibleIds = group.memberIds.filter((id) => {
        const character = byId.get(id);
        if (
          !character ||
          claimed.has(id) ||
          character.itemLevel < raid.minItemLevel ||
          (
            !character.selectedRaids.includes(group.raidName) &&
            !character.completedRaids.includes(group.raidName)
          )
        ) return false;
        return true;
      });
      const completedGroup = eligibleIds.length > 0 && eligibleIds.every((id) =>
        byId.get(id)?.completedRaids.includes(group.raidName),
      );
      const memberIds = eligibleIds.filter((id) => {
        const character = byId.get(id);
        if (!completedGroup && !character?.selectedRaids.includes(group.raidName)) return false;
        claimed.add(id);
        return true;
      });
      return memberIds.length ? [{ ...group, memberIds }] : [];
    }),
  };
};

export const canPlaceMember = (group: RaidGroup, member: RaidGroup["members"][number]) =>
  validateMembers(group, [...group.members, member]);

export const canReplaceMember = (
  group: RaidGroup,
  currentMemberId: string,
  member: RaidGroup["members"][number],
) => validateMembers(
  group,
  group.members.map((candidate) => candidate.id === currentMemberId ? member : candidate),
);
