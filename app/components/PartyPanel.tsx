"use client";

import { useEffect, useMemo, useState } from "react";
import lostarkGoldIcon from "../../lostark_gold.png";
import { RAID_DEFINITIONS, getRaidDefinition, roleLabel, type AssignedMember, type RaidGroup, type RaidPlanResult } from "../lib/raidPlanner";
import { allPlanGroups, canReplaceMember } from "../lib/partyLayout";
import type { Player } from "../lib/raidData";

type ViewMode = "raid" | "member";
type NameMode = "character" | "nickname";
type SwapState = { group: RaidGroup; member: AssignedMember } | null;

const PREFERENCE_KEY = "loiar-party-view-preferences-v1";
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
  star: "/icons/star.svg",
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
  const [viewMode, setViewMode] = useState<ViewMode>("raid");
  const [nameMode, setNameMode] = useState<NameMode>("character");
  const [dragging, setDragging] = useState<{ memberId: string; groupId: string } | null>(null);
  const [swapState, setSwapState] = useState<SwapState>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(PREFERENCE_KEY) ?? "{}") as {
          viewMode?: ViewMode;
          nameMode?: NameMode;
        };
        if (stored.viewMode === "raid" || stored.viewMode === "member") setViewMode(stored.viewMode);
        if (stored.nameMode === "character" || stored.nameMode === "nickname") setNameMode(stored.nameMode);
      } catch {
        window.localStorage.removeItem(PREFERENCE_KEY);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ viewMode, nameMode }));
  }, [viewMode, nameMode]);

  const groups = useMemo(() => plan ? allPlanGroups(plan) : [], [plan]);
  const groupsByFamily = useMemo(() => {
    const result = new Map<string, RaidGroup[]>();
    groups.forEach((group) => {
      const family = getRaidDefinition(group.raidName)?.family ?? group.raidName;
      result.set(family, [...(result.get(family) ?? []), group]);
    });
    return result;
  }, [groups]);

  const sortedPlayers = useMemo(() => [...players].sort((a, b) => {
    if (a.id === favoritePlayerId) return -1;
    if (b.id === favoritePlayerId) return 1;
    return a.name.localeCompare(b.name, "ko");
  }), [favoritePlayerId, players]);

  const displayName = (member: AssignedMember) =>
    nameMode === "character" ? member.characterName : member.playerName;

  return (
    <section className="party-panel">
      <div className="party-panel-heading">
        <div>
          <h2>파티 목록</h2>
          <p>이번 주 레이드 현황 · {formatRaidWeekRange(raidWeek)}</p>
        </div>
        <div className="party-heading-actions">
          <SegmentedControl
            value={nameMode}
            items={[
              { value: "character", label: "캐릭터명" },
              { value: "nickname", label: "닉네임" },
            ]}
            onChange={(value) => setNameMode(value as NameMode)}
          />
          <button className="party-update-button" type="button" onClick={onUpdate} disabled={updating}>
            <PartyIcon name="reload" className="party-refresh-icon" />
            {updating ? "업데이트 중" : "업데이트"}
          </button>
        </div>
      </div>

      <SegmentedControl
        className="party-view-control"
        value={viewMode}
        items={[
          { value: "raid", label: "레이드별" },
          { value: "member", label: "멤버별" },
        ]}
        onChange={(value) => setViewMode(value as ViewMode)}
      />

      <p className="party-help">캐릭터를 드래그해서 같은 레이드의 다른 파티 빈자리로 옮기거나, 교환 버튼으로 같은 플레이어의 다른 캐릭터와 바꿀 수 있어요.</p>
      {stale ? <div className="party-warning">멤버 정보가 변경되었습니다. 업데이트하면 현재 수동 배치를 유지하며 다시 충원합니다.</div> : null}
      {plan?.warnings.length ? (
        <div className="party-warning">{plan.warnings.join(" ")}</div>
      ) : null}

      {!plan || groups.length === 0 ? (
        <div className="party-empty">
          <strong>구성할 레이드가 없습니다.</strong>
          <span>멤버 목록에서 레이드를 선택한 뒤 업데이트해 주세요.</span>
        </div>
      ) : viewMode === "raid" ? (
        <div className="party-family-list">
          {Array.from(groupsByFamily.entries()).map(([family, familyGroups]) => (
            <RaidFamilySection
              key={family}
              family={family}
              groups={familyGroups}
              completedPartyIds={completedPartyIds}
              displayName={displayName}
              dragging={dragging}
              onDragStart={setDragging}
              onDragEnd={() => setDragging(null)}
              onDrop={(targetGroupId) => {
                if (dragging) onMove(dragging.memberId, dragging.groupId, targetGroupId);
                setDragging(null);
              }}
              onOpenSwap={(group, member) => setSwapState({ group, member })}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </div>
      ) : (
        <div className="party-member-list">
          {sortedPlayers.map((player) => {
            const playerGroups = groups.filter((group) =>
              group.members.some((member) => member.playerId === player.id),
            );
            if (!playerGroups.length) return null;
            return (
              <MemberPartySection
                key={player.id}
                playerName={player.name}
                favorite={player.id === favoritePlayerId}
                groups={playerGroups}
                allGroups={groups}
                completedPartyIds={completedPartyIds}
                displayName={displayName}
                dragging={dragging}
                onDragStart={setDragging}
                onDragEnd={() => setDragging(null)}
                onDrop={(targetGroupId) => {
                  if (dragging) onMove(dragging.memberId, dragging.groupId, targetGroupId);
                  setDragging(null);
                }}
                onOpenSwap={(group, member) => setSwapState({ group, member })}
                onToggleComplete={onToggleComplete}
              />
            );
          })}
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
    </section>
  );
}

function SegmentedControl({ value, items, onChange, className = "" }: {
  value: string;
  items: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`party-segmented ${className}`.trim()}>
      {items.map((item) => (
        <button key={item.value} className={value === item.value ? "active" : ""} type="button" onClick={() => onChange(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function RaidFamilySection({ family, groups, completedPartyIds, displayName, dragging, onDragStart, onDragEnd, onDrop, onOpenSwap, onToggleComplete }: {
  family: string;
  groups: RaidGroup[];
  completedPartyIds: Set<string>;
  displayName: (member: AssignedMember) => string;
  dragging: { memberId: string; groupId: string } | null;
  onDragStart: (value: { memberId: string; groupId: string }) => void;
  onDragEnd: () => void;
  onDrop: (groupId: string) => void;
  onOpenSwap: (group: RaidGroup, member: AssignedMember) => void;
  onToggleComplete: (group: RaidGroup, completed: boolean) => void;
}) {
  const familyRaids = RAID_DEFINITIONS.filter((raid) => raid.family === family);
  const maximumGold = Math.max(0, ...familyRaids.map((raid) => raid.gold));
  const orderedGroups = orderCompletedGroups(groups, completedPartyIds);
  return (
    <section className="party-family-section">
      <header>
        <div><h3>{family}</h3><span>{maximumGold.toLocaleString("ko-KR")}G~</span></div>
      </header>
      <div className="party-card-row">
        {orderedGroups.map((group) => (
          <PartyCard
            key={group.id}
            group={group}
            groupIndex={groups.filter((candidate) => candidate.raidName === group.raidName).findIndex((candidate) => candidate.id === group.id) + 1}
            completed={completedPartyIds.has(group.id)}
            displayName={displayName}
            dragging={dragging}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDrop={() => onDrop(group.id)}
            onOpenSwap={onOpenSwap}
            onToggleComplete={onToggleComplete}
          />
        ))}
      </div>
    </section>
  );
}

function MemberPartySection({ playerName, favorite, groups, allGroups, completedPartyIds, displayName, dragging, onDragStart, onDragEnd, onDrop, onOpenSwap, onToggleComplete }: {
  playerName: string;
  favorite: boolean;
  groups: RaidGroup[];
  allGroups: RaidGroup[];
  completedPartyIds: Set<string>;
  displayName: (member: AssignedMember) => string;
  dragging: { memberId: string; groupId: string } | null;
  onDragStart: (value: { memberId: string; groupId: string }) => void;
  onDragEnd: () => void;
  onDrop: (groupId: string) => void;
  onOpenSwap: (group: RaidGroup, member: AssignedMember) => void;
  onToggleComplete: (group: RaidGroup, completed: boolean) => void;
}) {
  const orderedGroups = orderCompletedGroups(groups, completedPartyIds);
  return (
    <section className="party-member-section">
      <header>
        <h3>{favorite ? <PartyIcon name="star" /> : null}{playerName}</h3>
      </header>
      <div className="party-card-row">
        {orderedGroups.map((group) => (
          <PartyCard
            key={group.id}
            group={group}
            groupIndex={allGroups.filter((candidate) => candidate.raidName === group.raidName).findIndex((candidate) => candidate.id === group.id) + 1}
            completed={completedPartyIds.has(group.id)}
            displayName={displayName}
            dragging={dragging}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDrop={() => onDrop(group.id)}
            onOpenSwap={onOpenSwap}
            onToggleComplete={onToggleComplete}
          />
        ))}
      </div>
    </section>
  );
}

function PartyCard({ group, groupIndex, completed, displayName, dragging, onDragStart, onDragEnd, onDrop, onOpenSwap, onToggleComplete }: {
  group: RaidGroup;
  groupIndex: number;
  completed: boolean;
  displayName: (member: AssignedMember) => string;
  dragging: { memberId: string; groupId: string } | null;
  onDragStart: (value: { memberId: string; groupId: string }) => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onOpenSwap: (group: RaidGroup, member: AssignedMember) => void;
  onToggleComplete: (group: RaidGroup, completed: boolean) => void;
}) {
  const raid = getRaidDefinition(group.raidName);
  return (
    <article
      className={`party-card ${completed ? "completed" : ""} ${dragging && dragging.groupId !== group.id ? "drop-ready" : ""}`.trim()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); onDrop(); }}
    >
      <div className="party-card-title">
        <h4>{group.raidName} {groupIndex}공대</h4>
        <button className={completed ? "complete" : ""} type="button" onClick={() => onToggleComplete(group, !completed)}>
          <PartyIcon name={completed ? "circleCheck" : "circle"} />
          {completed ? "완료" : "미완료"}
        </button>
      </div>
      <div className="party-capacity"><PartyIcon name="users" /> {group.members.length} / {group.size}명</div>
      <div className="party-roster">
        {group.members.map((member) => (
          <div
            className={`party-character-row ${member.role}`}
            key={member.id}
            draggable={!completed}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", `${group.id}:${member.id}`);
              onDragStart({ memberId: member.id, groupId: group.id });
            }}
            onDragEnd={onDragEnd}
          >
            <span className="party-role-badge">{roleLabel(member.role)}</span>
            <strong>{displayName(member)}</strong>
            <span className="party-class-name">{member.className}</span>
            <span className="party-level">{formatItemLevel(member.itemLevel)}</span>
            <span className={`party-power ${member.role}`}>
              <PartyIcon name={member.role === "dealer" ? "dealer" : "shield"} />
              {member.combatPower.toLocaleString("ko-KR")}
            </span>
            <button type="button" aria-label={`${displayName(member)} 캐릭터 교환`} onClick={() => onOpenSwap(group, member)} disabled={completed}>
              <ArrowSwapIcon />
            </button>
          </div>
        ))}
        {group.externalSlots.map((slot, index) => (
          <div className={`party-empty-slot ${slot.role}`} key={`${slot.role}-${index}`}>
            <span className="party-role-badge">{roleLabel(slot.role)}</span>
            <span>+ 캐릭터 추가</span>
          </div>
        ))}
      </div>
      {raid ? (
        <div className="party-card-gold"><GoldIcon /> <strong>{raid.gold.toLocaleString("ko-KR")}G</strong><span>({raid.tradableGold.toLocaleString("ko-KR")} + {raid.boundGold.toLocaleString("ko-KR")})</span></div>
      ) : null}
    </article>
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
                {character.selectedRaids.includes(state.group.raidName) ? <small>해당 난이도 선택</small> : null}
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

const formatItemLevel = (value: number) => value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const orderCompletedGroups = (groups: RaidGroup[], completedPartyIds: Set<string>) =>
  groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) =>
      Number(completedPartyIds.has(a.group.id)) - Number(completedPartyIds.has(b.group.id)) ||
      a.index - b.index,
    )
    .map(({ group }) => group);

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
