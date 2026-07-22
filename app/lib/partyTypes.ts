export type ManualPartyGroup = {
  id: string;
  raidName: string;
  memberIds: string[];
};

export type ManualPartyLayout = {
  version: 1;
  groups: ManualPartyGroup[];
};

export const EMPTY_MANUAL_PARTY_LAYOUT: ManualPartyLayout = {
  version: 1,
  groups: [],
};

export const normalizeManualPartyLayout = (
  value: unknown,
): ManualPartyLayout => {
  if (!value || typeof value !== "object") {
    return EMPTY_MANUAL_PARTY_LAYOUT;
  }

  const source = value as { groups?: unknown };
  if (!Array.isArray(source.groups)) {
    return EMPTY_MANUAL_PARTY_LAYOUT;
  }

  const seenIds = new Set<string>();
  const groups = source.groups
    .slice(0, 200)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const group = entry as Partial<ManualPartyGroup>;
      const id = typeof group.id === "string" ? group.id.slice(0, 160) : "";
      const raidName =
        typeof group.raidName === "string" ? group.raidName.slice(0, 120) : "";
      if (!id || !raidName || seenIds.has(id)) return null;
      seenIds.add(id);
      return {
        id,
        raidName,
        memberIds: Array.isArray(group.memberIds)
          ? Array.from(
              new Set(
                group.memberIds
                  .filter((memberId): memberId is string =>
                    typeof memberId === "string",
                  )
                  .map((memberId) => memberId.slice(0, 120))
                  .filter(Boolean),
              ),
            ).slice(0, 8)
          : [],
      };
    })
    .filter((group): group is ManualPartyGroup => Boolean(group));

  return { version: 1, groups };
};
