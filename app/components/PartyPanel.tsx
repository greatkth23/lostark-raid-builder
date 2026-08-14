"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import lostarkGoldIcon from "../../lostark_gold.png";
import { getRaidDefinition, roleLabel, type AssignedMember, type RaidGroup, type RaidPlanResult } from "../lib/raidPlanner";
import {
  allPlanGroups,
  canPlaceMember,
  canReplaceMember,
  filterGroupsBySelectedPlayerIds,
  selectGroupsForPartyView,
} from "../lib/partyLayout";
import type { Player } from "../lib/raidData";

type ViewMode = "raid" | "member";
type NameMode = "character" | "nickname";
type SwapState = { group: RaidGroup; member: AssignedMember } | null;
type AddState = { group: RaidGroup; role: AssignedMember["role"] } | null;

const PREFERENCE_KEY = "loiar-party-view-preferences-v1";
const PARTY_EXIT_DURATION_MS = 520;
const GOLD_ICON_URL = typeof lostarkGoldIcon === "string" ? lostarkGoldIcon : lostarkGoldIcon.src;

type PartyPanelProps = {
  plan: RaidPlanResult | null;
  players: Player[];
  raidWeek: string;
  favoritePlayerId: string;
  completedPartyIds: Set<string>;
  stale: boolean;
  updating: boolean;
  onUpdate: () => void;
  onMove: (memberId: string, sourceGroupId: string, targetGroupId: string) => void;
  onSwap: (memberId: string, groupId: string, candidateId: string) => void;
  onToggleComplete: (group: RaidGroup, completed: boolean) => void;
};

const GoldIcon = () => (
  <span className="party-gold-icon" style={{ backgroundImage: `url(${GOLD_ICON_URL})` }} aria-hidden="true" />
);

const ArrowSwapIcon = () => (
  <span className="party-swap-icon" style={{ "--icon-url": "url(/icons/arrow-left-right.svg)" } as React.CSSProperties} aria-hidden="true" />
);

const PARTY_ICON_PATHS = {
  users: "/icons/users.svg",
  circle: "/icons/circle.svg",
  circleCheck: "/icons/circle-check.svg",
  reload: "/icons/reload.svg",
  dealer: "/icons/dealer.svg",
  shield: "/icons/shield.svg",
  tag: "/icons/tag.svg",
  user03: "/icons/user-03.svg",
} as const;

function PartyIcon({ name, className = "" }: {
  name: keyof typeof PARTY_ICON_PATHS;
  className?: string;
}) {
  return (
    <span
      className={`party-mask-icon ${className}`.trim()}
      style={{ "--icon-url": `url(${PARTY_ICON_PATHS[name]})` } as React.CSSProperties}
      aria-hidden="true"
    />
  );
}

export default function PartyPanel({
  plan,
  players,
  raidWeek,
  favoritePlayerId,
  completedPartyIds,
  stale,
  updating,
  onUpdate,
  onMove,
  onSwap,
  onToggleComplete,
}: PartyPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("member");
  const [nameMode, setNameMode] = useState<NameMode>("character");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [selectedRaidFamily, setSelectedRaidFamily] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    new Set(),
  );
  const [dragging, setDragging] = useState<{ memberId: string; groupId: string } | null>(null);
  const [swapState, setSwapState] = useState<SwapState>(null);
  const [addState, setAddState] = useState<AddState>(null);
  const [departingPartyIds, setDepartingPartyIds] = useState<Set<string>>(new Set());
  const exitTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(PREFERENCE_KEY) ?? "{}") as {
          nameMode?: NameMode;
        };
        if (stored.nameMode === "character" || stored.nameMode === "nickname") setNameMode(stored.nameMode);
      } catch {
        window.localStorage.removeItem(PREFERENCE_KEY);
      } finally {
        setPreferencesLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ nameMode }));
  }, [nameMode, preferencesLoaded]);

  useEffect(() => () => {
    exitTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    exitTimersRef.current.clear();
  }, []);

  const groups = useMemo(() => plan ? allPlanGroups(plan) : [], [plan]);
  const completedIdsForRefreshRef = useRef(completedPartyIds);
  const [orderedGroupIds, setOrderedGroupIds] = useState(() =>
    orderCompletedGroups(groups, completedPartyIds).map((group) => group.id),
  );

  useEffect(() => {
    completedIdsForRefreshRef.current = completedPartyIds;
  }, [completedPartyIds]);

  useEffect(() => {
    setOrderedGroupIds(
      orderCompletedGroups(groups, completedIdsForRefreshRef.current).map((group) => group.id),
    );
  }, [groups]);

  const displayGroups = useMemo(
    () => orderGroupsByIds(groups, orderedGroupIds),
    [groups, orderedGroupIds],
  );
  const visibleGroups = useMemo(
    () => displayGroups.filter((group) =>
      !completedPartyIds.has(group.id) || departingPartyIds.has(group.id),
    ),
    [completedPartyIds, departingPartyIds, displayGroups],
  );
  const groupsByFamily = useMemo(() => {
    const result = new Map<string, RaidGroup[]>();
    visibleGroups.forEach((group) => {
      const family = getRaidDefinition(group.raidName)?.family ?? group.raidName;
      result.set(family, [...(result.get(family) ?? []), group]);
    });
    return result;
  }, [visibleGroups]);
  const raidFamilyTabs = useMemo(
    () => Array.from(groupsByFamily.entries()).map(([family, familyGroups], index) => ({
      family,
      groups: familyGroups,
      tabId: `party-raid-family-tab-${index}`,
    })),
    [groupsByFamily],
  );
  const activeRaidFamily = groupsByFamily.has(selectedRaidFamily)
    ? selectedRaidFamily
    : raidFamilyTabs[0]?.family ?? "";

  const sortedPlayers = useMemo(() => [...players].sort((a, b) => {
    if (a.id === favoritePlayerId) return -1;
    if (b.id === favoritePlayerId) return 1;
    return a.name.localeCompare(b.name, "ko");
  }), [favoritePlayerId, players]);
  const activeSelectedPlayerIds = useMemo(() => {
    const validPlayerIds = new Set(players.map((player) => player.id));
    return new Set(
      Array.from(selectedPlayerIds).filter((playerId) => validPlayerIds.has(playerId)),
    );
  }, [players, selectedPlayerIds]);
  const selectedMemberGroups = useMemo(
    () => filterGroupsBySelectedPlayerIds(visibleGroups, activeSelectedPlayerIds),
    [activeSelectedPlayerIds, visibleGroups],
  );
  const displayedGroups = useMemo(
    () => selectGroupsForPartyView(
      visibleGroups,
      viewMode === "raid"
        ? { mode: "raid", raidFamily: activeRaidFamily }
        : { mode: "member", selectedPlayerIds: activeSelectedPlayerIds },
    ),
    [activeRaidFamily, activeSelectedPlayerIds, viewMode, visibleGroups],
  );
  const resultPanelKey = viewMode === "raid"
    ? `raid:${activeRaidFamily}`
    : `member:${Array.from(activeSelectedPlayerIds).sort().join(",")}`;
  const selectedPlayerNames = useMemo(
    () => sortedPlayers
      .filter((player) => activeSelectedPlayerIds.has(player.id))
      .map((player) => player.name),
    [activeSelectedPlayerIds, sortedPlayers],
  );

  const displayName = (member: AssignedMember) =>
    nameMode === "character" ? member.characterName : member.playerName;

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const handleToggleComplete = (group: RaidGroup, completed: boolean) => {
    if (!completed) {
      onToggleComplete(group, false);
      return;
    }

    flushSync(() => {
      setDepartingPartyIds((current) => new Set(current).add(group.id));
    });
    onToggleComplete(group, true);
    const previousTimer = exitTimersRef.current.get(group.id);
    if (previousTimer) window.clearTimeout(previousTimer);
    const timerId = window.setTimeout(() => {
      setDepartingPartyIds((current) => {
        const next = new Set(current);
        next.delete(group.id);
        return next;
      });
      exitTimersRef.current.delete(group.id);
    }, PARTY_EXIT_DURATION_MS);
    exitTimersRef.current.set(group.id, timerId);
  };

  return (
    <section className="party-panel">
      <div className="party-panel-heading">
        <div className="party-title-block">
          <h2>파티 목록</h2>
          <p>이번 주 레이드 현황 · {formatRaidWeekRange(raidWeek)}</p>
        </div>
        <button className="party-update-button" type="button" onClick={onUpdate} disabled={updating}>
          <PartyIcon name="reload" className="party-refresh-icon" />
          {updating ? "구성 중" : "자동구성"}
        </button>
      </div>

      <div className="party-filter-row">
        <SegmentedControl
          className="party-view-control"
          value={viewMode}
          items={[
            { value: "member", label: "멤버별" },
            { value: "raid", label: "레이드별" },
          ]}
          onChange={(value) => setViewMode(value as ViewMode)}
        />
        <SegmentedControl
          className="party-name-control"
          value={nameMode}
          items={[
            { value: "character", label: "캐릭터명", icon: "tag" },
            { value: "nickname", label: "닉네임", icon: "user03" },
          ]}
          onChange={(value) => setNameMode(value as NameMode)}
        />
      </div>

      {viewMode === "member" && plan ? (
        <MemberFilterBar
          players={sortedPlayers}
          selectedPlayerIds={activeSelectedPlayerIds}
          selectedPlayerNames={selectedPlayerNames}
          resultCount={selectedMemberGroups.length}
          onToggle={togglePlayerSelection}
        />
      ) : null}

      {viewMode === "raid" && raidFamilyTabs.length ? (
        <RaidFamilyTabs
          items={raidFamilyTabs}
          value={activeRaidFamily}
          onChange={setSelectedRaidFamily}
        />
      ) : null}

      <p className="party-help">캐릭터를 드래그해 같은 레이드 계열의 다른 파티로 옮길 수 있어요. 대상 파티에 같은 플레이어의 캐릭터가 있으면 두 캐릭터를 맞교환합니다.</p>
      {stale ? <div className="party-warning">멤버 정보가 변경되었습니다. 자동구성하면 현재 수동 배치를 유지하며 다시 충원합니다.</div> : null}
      {plan?.warnings.length ? (
        <div className="party-warning">{plan.warnings.join(" ")}</div>
      ) : null}

      {!plan || visibleGroups.length === 0 ? (
        <div className="party-empty">
          <strong>구성할 레이드가 없습니다.</strong>
          <span>멤버 목록에서 레이드를 선택한 뒤 자동구성을 눌러 주세요.</span>
        </div>
      ) : displayedGroups.length ? (
        <section
          key={resultPanelKey}
          className="party-results-section"
          role={viewMode === "raid" ? "tabpanel" : undefined}
          id={viewMode === "raid" ? "party-raid-family-panel" : undefined}
          aria-labelledby={viewMode === "raid"
            ? raidFamilyTabs.find((item) => item.family === activeRaidFamily)?.tabId
            : undefined}
          aria-live={viewMode === "member" ? "polite" : undefined}
        >
          <PartyGroupGrid
            groups={displayedGroups}
            allGroups={groups}
            masonry={viewMode === "member"}
            completedPartyIds={completedPartyIds}
            departingPartyIds={departingPartyIds}
            displayName={displayName}
            dragging={dragging}
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
            onDrop={(targetGroupId) => {
              if (dragging) onMove(dragging.memberId, dragging.groupId, targetGroupId);
              setDragging(null);
            }}
            onOpenSwap={(group, member) => setSwapState({ group, member })}
            onOpenAdd={(group, role) => setAddState({ group, role })}
            onToggleComplete={handleToggleComplete}
          />
        </section>
      ) : (
        <div className="party-empty party-filter-empty" aria-live="polite">
          <strong>{viewMode === "raid" ? "선택한 레이드의 파티가 없습니다." : "선택한 멤버 조건의 파티가 없습니다."}</strong>
          <span>{viewMode === "raid" ? "다른 레이드 탭을 선택해 주세요." : "멤버 선택을 바꾸거나 모두 해제해 전체 파티를 확인해 주세요."}</span>
        </div>
      )}

      {swapState ? (
        <SwapModal
          state={swapState}
          groups={groups}
          players={players}
          raidWeek={raidWeek}
          onClose={() => setSwapState(null)}
          onSelect={(candidateId) => {
            onSwap(swapState.member.id, swapState.group.id, candidateId);
            setSwapState(null);
          }}
        />
      ) : null}
      {addState ? (
        <AddCharacterModal
          state={addState}
          groups={groups}
          completedPartyIds={completedPartyIds}
          displayName={displayName}
          onClose={() => setAddState(null)}
          onSelect={(memberId, sourceGroupId) => {
            onMove(memberId, sourceGroupId, addState.group.id);
            setAddState(null);
          }}
        />
      ) : null}
    </section>
  );
}

function SegmentedControl({ value, items, onChange, className = "" }: {
  value: string;
  items: Array<{ value: string; label: string; icon?: keyof typeof PARTY_ICON_PATHS }>;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`party-segmented ${className}`.trim()}>
      {items.map((item) => (
        <button key={item.value} className={value === item.value ? "active" : ""} type="button" aria-label={item.label} onClick={() => onChange(item.value)}>
          {item.icon ? <PartyIcon name={item.icon} /> : null}
          <span className="party-segmented-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function MemberFilterBar({ players, selectedPlayerIds, selectedPlayerNames, resultCount, onToggle }: {
  players: Player[];
  selectedPlayerIds: ReadonlySet<string>;
  selectedPlayerNames: string[];
  resultCount: number;
  onToggle: (playerId: string) => void;
}) {
  const resultSummary = selectedPlayerNames.length === 1
    ? `${selectedPlayerNames[0]} 포함 · ${resultCount}개 파티`
    : selectedPlayerNames.length > 1
      ? `${selectedPlayerNames.join(" + ")}만 포함 · ${resultCount}개 파티`
      : `모든 멤버 조합 · ${resultCount}개 파티`;

  return (
    <section className="party-member-filter" aria-labelledby="party-member-filter-title">
      <div className="party-filter-meta">
        <strong id="party-member-filter-title">멤버 조합</strong>
        <span>{resultSummary}</span>
      </div>
      <div className="party-member-chip-row" role="group" aria-label="파티 멤버 조합 선택">
        {players.map((player) => {
          const selected = selectedPlayerIds.has(player.id);
          return (
            <button
              className={`party-member-chip${selected ? " active" : ""}`}
              key={player.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(player.id)}
            >
              <span>{player.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RaidFamilyTabs({ items, value, onChange }: {
  items: Array<{ family: string; tabId: string }>;
  value: string;
  onChange: (family: string) => void;
}) {
  const moveSelection = (currentIndex: number, nextIndex: number) => {
    const next = items[nextIndex];
    if (!next) return;
    onChange(next.family);
    window.requestAnimationFrame(() => document.getElementById(next.tabId)?.focus());
  };

  return (
    <div className="party-raid-tabs" role="tablist" aria-label="레이드 계열">
      {items.map((item, index) => {
        const selected = item.family === value;
        return (
          <button
            className={selected ? "active" : ""}
            id={item.tabId}
            key={item.family}
            type="button"
            role="tab"
            tabIndex={selected ? 0 : -1}
            aria-selected={selected}
            aria-controls="party-raid-family-panel"
            onClick={() => onChange(item.family)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                moveSelection(index, (index + 1) % items.length);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveSelection(index, (index - 1 + items.length) % items.length);
              } else if (event.key === "Home") {
                event.preventDefault();
                moveSelection(index, 0);
              } else if (event.key === "End") {
                event.preventDefault();
                moveSelection(index, items.length - 1);
              }
            }}
          >
            {item.family}
          </button>
        );
      })}
    </div>
  );
}

function PartyGroupGrid({ groups, allGroups, masonry, completedPartyIds, departingPartyIds, displayName, dragging, onDragStart, onDragEnd, onDrop, onOpenSwap, onOpenAdd, onToggleComplete }: {
  groups: RaidGroup[];
  allGroups: RaidGroup[];
  masonry: boolean;
  completedPartyIds: Set<string>;
  departingPartyIds: Set<string>;
  displayName: (member: AssignedMember) => string;
  dragging: { memberId: string; groupId: string } | null;
  onDragStart: (value: { memberId: string; groupId: string }) => void;
  onDragEnd: () => void;
  onDrop: (groupId: string) => void;
  onOpenSwap: (group: RaidGroup, member: AssignedMember) => void;
  onOpenAdd: (group: RaidGroup, role: AssignedMember["role"]) => void;
  onToggleComplete: (group: RaidGroup, completed: boolean) => void;
}) {
  return (
    <div className={`party-card-row${masonry ? " masonry" : ""}`}>
      {groups.map((group) => (
        <PartyCard
          key={group.id}
          group={group}
          groupIndex={allGroups.filter((candidate) => candidate.raidName === group.raidName).findIndex((candidate) => candidate.id === group.id) + 1}
          completed={completedPartyIds.has(group.id)}
          departing={departingPartyIds.has(group.id)}
          displayName={displayName}
          dragging={dragging}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={() => onDrop(group.id)}
          onOpenSwap={onOpenSwap}
          onOpenAdd={onOpenAdd}
          onToggleComplete={onToggleComplete}
        />
      ))}
    </div>
  );
}

function PartyCard({ group, groupIndex, completed, departing, displayName, dragging, onDragStart, onDragEnd, onDrop, onOpenSwap, onOpenAdd, onToggleComplete }: {
  group: RaidGroup;
  groupIndex: number;
  completed: boolean;
  departing: boolean;
  displayName: (member: AssignedMember) => string;
  dragging: { memberId: string; groupId: string } | null;
  onDragStart: (value: { memberId: string; groupId: string }) => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onOpenSwap: (group: RaidGroup, member: AssignedMember) => void;
  onOpenAdd: (group: RaidGroup, role: AssignedMember["role"]) => void;
  onToggleComplete: (group: RaidGroup, completed: boolean) => void;
}) {
  const raid = getRaidDefinition(group.raidName);
  const arrangedSlots = arrangePartySlots(group);
  return (
    <article
      className={`party-card ${completed ? "completed" : ""} ${departing ? "departing" : ""} ${dragging && dragging.groupId !== group.id ? "drop-ready" : ""}`.trim()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); onDrop(); }}
    >
      <div className="party-card-title">
        <h4>{group.raidName} {groupIndex}공대</h4>
        <button className={completed ? "complete" : ""} type="button" onClick={() => onToggleComplete(group, !completed)} disabled={departing}>
          <PartyIcon name={completed ? "circleCheck" : "circle"} />
          {completed ? "완료" : "미완료"}
        </button>
      </div>
      <div className="party-capacity"><PartyIcon name="users" /> {group.members.length} / {group.size}명</div>
      <div className={`party-roster${group.size === 8 ? " eight-person" : ""}`}>
        {arrangedSlots.map(({ role, member }, index) => member ? (
            <div
              className={`party-character-row ${member.role}`}
              key={member.id}
              draggable={!completed && !departing}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", `${group.id}:${member.id}`);
                onDragStart({ memberId: member.id, groupId: group.id });
              }}
              onDragEnd={onDragEnd}
            >
              <span className="party-role-badge">{roleLabel(member.role)}</span>
              <span className="party-character-name">{displayName(member)}</span>
              <span className="party-class-name">{member.className}</span>
              <span className="party-level">{formatItemLevel(member.itemLevel)}</span>
              <span className={`party-power ${member.role}`}>
                <PartyIcon name={member.role === "dealer" ? "dealer" : "shield"} />
                {Math.trunc(member.combatPower).toLocaleString("ko-KR")}
              </span>
              <button type="button" aria-label={`${displayName(member)} 캐릭터 교환`} onClick={() => onOpenSwap(group, member)} disabled={completed || departing}>
                <ArrowSwapIcon />
              </button>
            </div>
          ) : (
            <button className={`party-empty-slot ${role}`} key={`${role}-empty-${index}`} type="button" onClick={() => onOpenAdd(group, role)} disabled={completed || departing}>
              <span className="party-role-badge">{roleLabel(role)}</span>
              <span>+ 캐릭터 추가</span>
            </button>
          ))}
      </div>
      {raid ? (
        <div className="party-card-gold"><GoldIcon /> <span className="party-gold-total">{raid.gold.toLocaleString("ko-KR")}G</span><span>({raid.tradableGold.toLocaleString("ko-KR")} + {raid.boundGold.toLocaleString("ko-KR")})</span></div>
      ) : null}
    </article>
  );
}

function AddCharacterModal({ state, groups, completedPartyIds, displayName, onClose, onSelect }: {
  state: NonNullable<AddState>;
  groups: RaidGroup[];
  completedPartyIds: Set<string>;
  displayName: (member: AssignedMember) => string;
  onClose: () => void;
  onSelect: (memberId: string, sourceGroupId: string) => void;
}) {
  const candidates = groups
    .filter((group) =>
      group.id !== state.group.id &&
      group.raidName === state.group.raidName &&
      !completedPartyIds.has(group.id),
    )
    .flatMap((group) => group.members.map((member) => ({ group, member })))
    .filter(({ member }) => member.role === state.role)
    .filter(({ member }) => !canPlaceMember(state.group, member))
    .sort((a, b) => b.member.itemLevel - a.member.itemLevel);

  return (
    <div className="party-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="party-swap-modal" role="dialog" aria-modal="true" aria-labelledby="add-character-title">
        <button className="party-modal-close" type="button" aria-label="닫기" onClick={onClose}>×</button>
        <h2 id="add-character-title">캐릭터 추가</h2>
        <p>{state.group.raidName} · 다른 공대의 {roleLabel(state.role)} 캐릭터를 이 공대로 옮깁니다.</p>
        <label>이동 가능한 캐릭터</label>
        {candidates.length ? (
          <div className="party-swap-candidates party-move-candidates">
            {candidates.map(({ group, member }) => (
              <button key={`${group.id}:${member.id}`} type="button" onClick={() => onSelect(member.id, group.id)}>
                <span className={`party-role-badge ${member.role}`}>{roleLabel(member.role)}</span>
                <span className="party-candidate-name">{displayName(member)}</span>
                <span>{member.className}</span>
                <span>{formatItemLevel(member.itemLevel)}</span>
                <small>{getGroupNumberLabel(groups, group)}에서 이동</small>
              </button>
            ))}
          </div>
        ) : <div className="party-no-candidate">같은 레이드·난이도의 다른 공대에 이동 가능한 캐릭터가 없습니다.</div>}
        <div className="party-modal-footer"><button type="button" onClick={onClose}>닫기</button></div>
      </section>
    </div>
  );
}

function SwapModal({ state, groups, players, raidWeek, onClose, onSelect }: {
  state: NonNullable<SwapState>;
  groups: RaidGroup[];
  players: Player[];
  raidWeek: string;
  onClose: () => void;
  onSelect: (candidateId: string) => void;
}) {
  const raid = getRaidDefinition(state.group.raidName);
  const player = players.find((candidate) => candidate.id === state.member.playerId);
  const candidates = (player?.expeditions.flatMap((expedition) => expedition.characters) ?? [])
    .filter((character) => character.id !== state.member.id)
    .filter((character) => raid && character.itemLevel >= raid.minItemLevel)
    .filter((character) => character.raidCompletions[state.group.raidName] !== raidWeek)
    .map((character) => {
      const member: AssignedMember = {
        type: "character",
        id: character.id,
        playerId: state.member.playerId,
        playerName: player?.name ?? "",
        characterName: character.name,
        itemLevel: character.itemLevel,
        combatPower: character.combatPower,
        className: character.className,
        role: character.role,
      };
      const assignedGroup = groups.find((group) =>
        getRaidDefinition(group.raidName)?.family === raid?.family &&
        group.members.some((candidate) => candidate.id === character.id),
      );
      const currentFits = !canReplaceMember(state.group, state.member.id, member);
      const reverseFits = !assignedGroup || !canReplaceMember(assignedGroup, member.id, state.member);
      return { character, member, assignedGroup, currentFits, reverseFits };
    })
    .filter((candidate) => candidate.currentFits && candidate.reverseFits && candidate.assignedGroup?.id !== state.group.id)
    .sort((a, b) => Number(b.character.selectedRaids.includes(state.group.raidName)) - Number(a.character.selectedRaids.includes(state.group.raidName)) || b.character.itemLevel - a.character.itemLevel);

  return (
    <div className="party-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="party-swap-modal" role="dialog" aria-modal="true" aria-labelledby="swap-title">
        <button className="party-modal-close" type="button" aria-label="닫기" onClick={onClose}>×</button>
        <h2 id="swap-title">캐릭터 교체</h2>
        <p>{state.group.raidName} · 현재 캐릭터를 같은 플레이어의 입장 가능한 다른 캐릭터와 교환합니다.</p>
        <label>현재 캐릭터</label>
        <div className="party-current-character">
          <span className={`party-role-badge ${state.member.role}`}>{roleLabel(state.member.role)}</span>
          <strong>{state.member.characterName}</strong>
          <span>{state.member.className}</span>
          <span>{formatItemLevel(state.member.itemLevel)}</span>
          <b>✓</b>
        </div>
        <div className="party-modal-divider" />
        <label>교체 가능한 캐릭터</label>
        {candidates.length ? (
          <div className="party-swap-candidates">
            {candidates.map(({ character, assignedGroup }) => (
              <button key={character.id} type="button" onClick={() => onSelect(character.id)}>
                <span className={`party-role-badge ${character.role}`}>{roleLabel(character.role)}</span>
                <strong>{character.name}</strong>
                <span>{character.className}</span>
                <span>{formatItemLevel(character.itemLevel)}</span>
                {assignedGroup ? <small>{assignedGroup.raidName}과 교환</small> : null}
              </button>
            ))}
          </div>
        ) : <div className="party-no-candidate">교체 가능한 미완료 캐릭터가 없습니다.</div>}
        <div className="party-modal-footer"><button type="button" onClick={onClose}>닫기</button></div>
      </section>
    </div>
  );
}

const formatItemLevel = (value: number) => Math.trunc(value).toLocaleString("ko-KR");

const orderCompletedGroups = (groups: RaidGroup[], completedPartyIds: Set<string>) =>
  groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) =>
      Number(completedPartyIds.has(a.group.id)) - Number(completedPartyIds.has(b.group.id)) ||
      a.index - b.index,
    )
    .map(({ group }) => group);

const orderGroupsByIds = (groups: RaidGroup[], orderedIds: string[]) => {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return [...groups].sort((a, b) =>
    (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
    (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
};

const getGroupNumberLabel = (groups: RaidGroup[], group: RaidGroup) => {
  const index = groups
    .filter((candidate) => candidate.raidName === group.raidName)
    .findIndex((candidate) => candidate.id === group.id);
  return `${group.raidName} ${index + 1}공대`;
};

const arrangePartySlots = (group: RaidGroup) => {
  const dealers = group.members.filter((member) => member.role === "dealer");
  const supports = group.members.filter((member) => member.role === "support");
  let dealerIndex = 0;
  let supportIndex = 0;
  const roleOrder = Array.from(
    { length: group.size / 4 },
    () => ["dealer", "dealer", "dealer", "support"] as const,
  ).flat();

  return roleOrder.map((role) => {
    const member = role === "dealer"
      ? dealers[dealerIndex++]
      : supports[supportIndex++];
    return { role, member };
  });
};

const formatRaidWeekRange = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "이번 주";
  const end = new Date(Date.UTC(year, month - 1, day + 6));
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth() + 1;
  const endDay = end.getUTCDate();
  if (year !== endYear) {
    return `${year}년 ${month}월 ${day}일 ~ ${endYear}년 ${endMonth}월 ${endDay}일`;
  }
  if (month !== endMonth) {
    return `${year}년 ${month}월 ${day}일 ~ ${endMonth}월 ${endDay}일`;
  }
  return `${year}년 ${month}월 ${day}일 ~ ${endDay}일`;
};
