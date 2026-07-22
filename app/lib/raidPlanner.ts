import {
  RAID_DEFINITIONS,
  getAutoRaidsForLevel,
  getExclusiveRaidNames,
  getGoldRecommendedRaidNames,
  getRaidDefinition,
  type GoldPreference,
  type RaidDefinition,
} from "./raidCatalog";
import type { ManualPartyLayout } from "./partyTypes";

export {
  RAID_DEFINITIONS,
  getAutoRaidsForLevel,
  getExclusiveRaidNames,
  getGoldRecommendedRaidNames,
  getRaidDefinition,
};
export type { GoldPreference, RaidDefinition };

export type Role = "dealer" | "support";

export type CharacterInput = {
  id: string;
  playerId: string;
  playerName: string;
  characterName: string;
  itemLevel: number;
  combatPower: number;
  className: string;
  role: Role;
  selectedRaids: string[];
  completedRaids: string[];
};

export type AssignedMember = {
  type: "character";
  id: string;
  playerId: string;
  playerName: string;
  characterName: string;
  itemLevel: number;
  combatPower: number;
  className: string;
  role: Role;
};

export type EmptySlot = {
  type: "external";
  role: Role;
  label: string;
};

export type RaidGroup = {
  id: string;
  raidName: string;
  size: 4 | 8;
  dealerSlots: number;
  supportSlots: number;
  members: AssignedMember[];
  externalSlots: EmptySlot[];
};

export type RaidPlanResult = {
  groupsByRaid: Record<string, RaidGroup[]>;
  warnings: string[];
};

type RaidRequest = AssignedMember & {
  raidName: string;
};

type PlayerBucket = {
  playerId: string;
  playerName: string;
  dealers: RaidRequest[];
  supports: RaidRequest[];
};

type WorkingGroup = {
  id?: string;
  locked?: boolean;
  members: AssignedMember[];
  playerIds: Set<string>;
  classCounts: Record<string, number>;
  dealerCount: number;
  supportCount: number;
};

type PlayerAssignmentOption = {
  dealerGroups: number[];
  supportGroups: number[];
};

export const SUPPORT_CLASS_NAMES = [
  "바드",
  "홀리나이트",
  "도화가",
  "발키리",
  "bard",
  "paladin",
  "artist",
  "support",
  "서폿",
  "폿",
];

export const inferRoleFromClassName = (className: string): Role | null => {
  const normalized = className.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return SUPPORT_CLASS_NAMES.some((name) =>
    normalized.includes(name.toLowerCase()),
  )
    ? "support"
    : "dealer";
};

export const roleLabel = (role: Role) => (role === "dealer" ? "딜러" : "서폿");

export const buildRaidPlan = (
  characters: CharacterInput[],
  manualLayout?: ManualPartyLayout,
): RaidPlanResult => {
  const warnings: string[] = [];
  const requestsByRaid = new Map<string, RaidRequest[]>();
  const charactersById = new Map(characters.map((character) => [character.id, character]));

  for (const character of characters) {
    if (!character.playerName.trim() || !character.characterName.trim()) {
      warnings.push("플레이어명 또는 캐릭터명이 비어 있는 항목은 제외했습니다.");
      continue;
    }

    const className = character.className.trim();

    if (!className) {
      warnings.push(`${character.characterName}: 직업명이 비어 있어 배정에서 제외했습니다.`);
      continue;
    }

    const uniqueRaids = Array.from(new Set(character.selectedRaids));

    for (const raidName of uniqueRaids) {
      const raid = getRaidDefinition(raidName);
      if (!raid) {
        warnings.push(`${character.characterName}: 알 수 없는 레이드 '${raidName}'을 제외했습니다.`);
        continue;
      }
      if (character.itemLevel < raid.minItemLevel) {
        warnings.push(
          `${character.characterName}: ${raidName} 입장 레벨이 부족해 제외했습니다.`,
        );
        continue;
      }

      const request: RaidRequest = {
        type: "character",
        id: character.id,
        playerId: character.playerId,
        playerName: character.playerName,
        characterName: character.characterName,
        itemLevel: character.itemLevel,
        combatPower: character.combatPower,
        className,
        role: character.role,
        raidName,
      };

      const existing = requestsByRaid.get(raidName) ?? [];
      existing.push(request);
      requestsByRaid.set(raidName, existing);
    }
  }

  const groupsByRaid: Record<string, RaidGroup[]> = {};

  for (const raidName of RAID_DEFINITIONS.map((raid) => raid.name)) {
    const raid = getRaidDefinition(raidName);
    const requests = requestsByRaid.get(raidName) ?? [];
    const manualGroups = manualLayout?.groups.filter(
      (group) => group.raidName === raidName,
    ) ?? [];

    if (!raid || (requests.length === 0 && manualGroups.length === 0)) {
      continue;
    }

    const usedMemberIds = new Set<string>();
    const seededGroups = manualGroups.map((manualGroup) => {
      const group: WorkingGroup = {
        id: manualGroup.id,
        members: [],
        playerIds: new Set<string>(),
        classCounts: {},
        dealerCount: 0,
        supportCount: 0,
      };

      manualGroup.memberIds.forEach((memberId) => {
        const activeRequest = requests.find(
          (candidate) => candidate.id === memberId && !usedMemberIds.has(memberId),
        );
        const character = charactersById.get(memberId);
        const request = activeRequest ?? (
          character?.completedRaids.includes(raidName)
            ? characterToRaidRequest(character, raidName)
            : undefined
        );
        if (!request || !canAddRequest(raid, group, request)) return;
        group.members.push(request);
        group.playerIds.add(request.playerId);
        incrementClass(group, request.className, 1);
        if (request.role === "dealer") group.dealerCount += 1;
        else group.supportCount += 1;
        usedMemberIds.add(memberId);
      });

      group.locked = group.members.length > 0 && group.members.every((member) =>
        charactersById.get(member.id)?.completedRaids.includes(raidName),
      );

      return group;
    });
    const remainingRequests = requests.filter(
      (request) => !usedMemberIds.has(request.id),
    );
    const solvedGroups = solveRaidGroups(raid, remainingRequests, seededGroups);
    groupsByRaid[raidName] = solvedGroups.map((group, index) =>
      finalizeGroup(raid, raidName, group, index),
    );
  }

  return { groupsByRaid, warnings: Array.from(new Set(warnings)) };
};

const solveRaidGroups = (
  raid: RaidDefinition,
  requests: RaidRequest[],
  seededGroups: WorkingGroup[] = [],
): WorkingGroup[] => {
  if (requests.length === 0) {
    return seededGroups;
  }
  const dealerCount = requests.filter((request) => request.role === "dealer").length;
  const supportCount = requests.length - dealerCount;
  const requestCountByPlayer = requests.reduce<Record<string, number>>(
    (counts, request) => ({
      ...counts,
      [request.playerId]: (counts[request.playerId] ?? 0) + 1,
    }),
    {},
  );
  const maxPlayerRequests = Math.max(...Object.values(requestCountByPlayer));
  const requestCountByClass = requests.reduce<Record<string, number>>((counts, request) => {
    const key = normalizeClassName(request.className);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const classLimit = getClassLimit(raid);
  const maxClassRequests = Math.max(...Object.values(requestCountByClass));
  const lowerBound = Math.max(
    1,
    seededGroups.length,
    Math.ceil(dealerCount / raid.dealerSlots),
    Math.ceil(supportCount / raid.supportSlots),
    maxPlayerRequests,
    Math.ceil(maxClassRequests / classLimit),
  );

  for (
    let groupCount = lowerBound;
    groupCount <= seededGroups.length + requests.length;
    groupCount += 1
  ) {
    const solved = trySolveWithGroupCount(
      raid,
      requests,
      groupCount,
      seededGroups,
    );
    if (solved) {
      return solved;
    }
  }

  return [
    ...seededGroups,
    ...requests.map((request) => ({
      members: [request],
      playerIds: new Set([request.playerId]),
      classCounts: { [normalizeClassName(request.className)]: 1 },
      dealerCount: request.role === "dealer" ? 1 : 0,
      supportCount: request.role === "support" ? 1 : 0,
    })),
  ];
};

const trySolveWithGroupCount = (
  raid: RaidDefinition,
  requests: RaidRequest[],
  groupCount: number,
  seededGroups: WorkingGroup[] = [],
) => {
  const buckets = bucketRequestsByPlayer(requests);
  const groups: WorkingGroup[] = [
    ...seededGroups.map((group) => ({
      id: group.id,
      locked: group.locked,
      members: [...group.members],
      playerIds: new Set(group.playerIds),
      classCounts: { ...group.classCounts },
      dealerCount: group.dealerCount,
      supportCount: group.supportCount,
    })),
    ...Array.from(
      { length: Math.max(0, groupCount - seededGroups.length) },
      () => ({
        members: [],
        playerIds: new Set<string>(),
        classCounts: {},
        dealerCount: 0,
        supportCount: 0,
      }),
    ),
  ];

  const assignPlayer = (bucketIndex: number): WorkingGroup[] | null => {
    if (bucketIndex >= buckets.length) {
      return groups.map((group) => ({
        id: group.id,
        locked: group.locked,
        members: [...group.members],
        playerIds: new Set(group.playerIds),
        classCounts: { ...group.classCounts },
        dealerCount: group.dealerCount,
        supportCount: group.supportCount,
      }));
    }

    const bucket = buckets[bucketIndex];
    const options = getPlayerAssignmentOptions(raid, groups, bucket);

    for (const option of options) {
      applyOption(groups, bucket, option);
      const solved = assignPlayer(bucketIndex + 1);
      if (solved) {
        return solved;
      }
      revertOption(groups, bucket, option);
    }

    return null;
  };

  return assignPlayer(0);
};

const bucketRequestsByPlayer = (requests: RaidRequest[]) => {
  const buckets = new Map<string, PlayerBucket>();

  for (const request of requests) {
    const bucket =
      buckets.get(request.playerId) ??
      ({
        playerId: request.playerId,
        playerName: request.playerName,
        dealers: [],
        supports: [],
      } satisfies PlayerBucket);

    if (request.role === "dealer") {
      bucket.dealers.push(request);
    } else {
      bucket.supports.push(request);
    }

    buckets.set(request.playerId, bucket);
  }

  return Array.from(buckets.values()).sort((a, b) => {
    const totalDiff =
      b.dealers.length + b.supports.length - (a.dealers.length + a.supports.length);
    if (totalDiff !== 0) {
      return totalDiff;
    }

    const supportDiff = b.supports.length - a.supports.length;
    if (supportDiff !== 0) {
      return supportDiff;
    }

    return a.playerName.localeCompare(b.playerName, "ko");
  });
};

const getPlayerAssignmentOptions = (
  raid: RaidDefinition,
  groups: WorkingGroup[],
  bucket: PlayerBucket,
): PlayerAssignmentOption[] => {
  const dealerCombos = requestGroupMappings(raid, groups, bucket.dealers, new Set());
  const options: PlayerAssignmentOption[] = [];

  for (const dealerGroups of dealerCombos) {
    const supportCombos = requestGroupMappings(
      raid,
      groups,
      bucket.supports,
      new Set(dealerGroups),
    );

    for (const supportGroups of supportCombos) {
      options.push({ dealerGroups, supportGroups });
    }
  }

  return options.sort(
    (a, b) => optionScore(raid, groups, b) - optionScore(raid, groups, a),
  );
};

const optionScore = (
  raid: RaidDefinition,
  groups: WorkingGroup[],
  option: PlayerAssignmentOption,
) => {
  const usedGroups = [...option.dealerGroups, ...option.supportGroups];
  const fillScore = usedGroups.reduce((score, groupIndex) => {
    const group = groups[groupIndex];
    return score + group.members.length * 10 - groupIndex;
  }, 0);

  const supportSpreadScore = option.supportGroups.reduce((score, groupIndex) => {
    const group = groups[groupIndex];
    const openSupportSlots = raid.supportSlots - group.supportCount;
    const emptySupportBonus = group.supportCount === 0 ? 1000 : 0;
    return score + emptySupportBonus + openSupportSlots * 100 - group.supportCount * 50;
  }, 0);

  return supportSpreadScore + fillScore;
};

const applyOption = (
  groups: WorkingGroup[],
  bucket: PlayerBucket,
  option: PlayerAssignmentOption,
) => {
  option.dealerGroups.forEach((groupIndex, index) => {
    const group = groups[groupIndex];
    group.members.push(bucket.dealers[index]);
    group.playerIds.add(bucket.playerId);
    incrementClass(group, bucket.dealers[index].className, 1);
    group.dealerCount += 1;
  });

  option.supportGroups.forEach((groupIndex, index) => {
    const group = groups[groupIndex];
    group.members.push(bucket.supports[index]);
    group.playerIds.add(bucket.playerId);
    incrementClass(group, bucket.supports[index].className, 1);
    group.supportCount += 1;
  });
};

const revertOption = (
  groups: WorkingGroup[],
  bucket: PlayerBucket,
  option: PlayerAssignmentOption,
) => {
  option.dealerGroups.forEach((groupIndex, index) => {
    const group = groups[groupIndex];
    group.members = group.members.filter((member) => member.playerId !== bucket.playerId);
    group.playerIds.delete(bucket.playerId);
    incrementClass(group, bucket.dealers[index].className, -1);
    group.dealerCount -= 1;
  });

  option.supportGroups.forEach((groupIndex, index) => {
    const group = groups[groupIndex];
    group.members = group.members.filter((member) => member.playerId !== bucket.playerId);
    group.playerIds.delete(bucket.playerId);
    incrementClass(group, bucket.supports[index].className, -1);
    group.supportCount -= 1;
  });
};

const requestGroupMappings = (
  raid: RaidDefinition,
  groups: WorkingGroup[],
  requests: RaidRequest[],
  forbiddenGroups: Set<number>,
): number[][] => {
  if (requests.length === 0) {
    return [[]];
  }

  const results: number[][] = [];

  const visit = (requestIndex: number, picked: number[]) => {
    if (requestIndex === requests.length) {
      results.push([...picked]);
      return;
    }

    const request = requests[requestIndex];
    const candidates = groups
      .map((group, groupIndex) => ({ group, groupIndex }))
      .filter(
        ({ group, groupIndex }) =>
          !forbiddenGroups.has(groupIndex) &&
          !picked.includes(groupIndex) &&
          canAddRequest(raid, group, request),
      )
      .sort((a, b) => b.group.members.length - a.group.members.length);

    for (const { groupIndex } of candidates) {
      picked.push(groupIndex);
      visit(requestIndex + 1, picked);
      picked.pop();
    }
  };

  visit(0, []);
  return results;
};

const canAddRequest = (
  raid: RaidDefinition,
  group: WorkingGroup,
  request: RaidRequest,
) => {
  if (group.locked) {
    return false;
  }

  if (group.playerIds.has(request.playerId)) {
    return false;
  }

  if (request.role === "dealer" && group.dealerCount >= raid.dealerSlots) {
    return false;
  }

  if (request.role === "support" && group.supportCount >= raid.supportSlots) {
    return false;
  }

  const className = normalizeClassName(request.className);
  return (group.classCounts[className] ?? 0) < getClassLimit(raid);
};

const getClassLimit = (raid: RaidDefinition) => (raid.size === 4 ? 1 : 2);

const normalizeClassName = (className: string) =>
  className.trim().replace(/\s+/g, "").toLowerCase();

const incrementClass = (
  group: WorkingGroup,
  className: string,
  amount: 1 | -1,
) => {
  const key = normalizeClassName(className);
  const nextValue = (group.classCounts[key] ?? 0) + amount;

  if (nextValue <= 0) {
    delete group.classCounts[key];
    return;
  }

  group.classCounts[key] = nextValue;
};

const characterToRaidRequest = (
  character: CharacterInput,
  raidName: string,
): RaidRequest => ({
  type: "character",
  id: character.id,
  playerId: character.playerId,
  playerName: character.playerName,
  characterName: character.characterName,
  itemLevel: character.itemLevel,
  combatPower: character.combatPower,
  className: character.className,
  role: character.role,
  raidName,
});

const finalizeGroup = (
  raid: RaidDefinition,
  raidName: string,
  group: WorkingGroup,
  index: number,
): RaidGroup => {
  const missingDealers = raid.dealerSlots - group.dealerCount;
  const missingSupports = raid.supportSlots - group.supportCount;
  const externalSlots: EmptySlot[] = [
    ...Array.from({ length: missingDealers }, (_, slotIndex) => ({
      type: "external" as const,
      role: "dealer" as const,
      label: `외부 딜러 ${slotIndex + 1}`,
    })),
    ...Array.from({ length: missingSupports }, (_, slotIndex) => ({
      type: "external" as const,
      role: "support" as const,
      label: `외부 서폿 ${slotIndex + 1}`,
    })),
  ];

  return {
    id: group.id ?? `${raidName}-auto-${index + 1}`,
    raidName,
    size: raid.size,
    dealerSlots: raid.dealerSlots,
    supportSlots: raid.supportSlots,
    members: group.members.sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === "dealer" ? -1 : 1;
      }

      return a.playerName.localeCompare(b.playerName, "ko");
    }),
    externalSlots,
  };
};
