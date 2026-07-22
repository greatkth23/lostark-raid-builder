"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import lostarkGoldIcon from "../lostark_gold.png";
import {
  RAID_DEFINITIONS,
  SUPPORT_CLASS_NAMES,
  buildRaidPlan,
  getAutoRaidsForLevel,
  getGoldRecommendedRaidNames,
  getRaidDefinition,
  inferRoleFromClassName,
  type CharacterInput,
  type GoldPreference,
  type RaidGroup,
  type RaidPlanResult,
  type Role,
} from "./lib/raidPlanner";
import {
  applyRaidGroupOperation,
  createExpedition,
  createId,
  createPlayer,
  normalizePlayers,
  type Character,
  type Expedition,
  type Player,
  type RaidGroupOperation,
  type RaidGroupRoom,
} from "./lib/raidData";

type RosterCharacter = {
  name: string;
  serverName: string;
  className: string;
  itemLevel: number;
  combatPower: number;
};

type TabKey = "players" | "results";

const STORAGE_KEY = "lostark-raid-builder-v3";
const LEGACY_STORAGE_KEYS = [
  "lostark-raid-builder-v2",
  "lostark-raid-builder-v1",
];
const API_KEY_STORAGE_KEY = "lostark-openapi-jwt";

const TABS: Array<{ id: TabKey; label: string }> = [
  { id: "players", label: "멤버 목록" },
  { id: "results", label: "파티 구성" },
];

const RAID_FAMILIES = Array.from(
  new Map(RAID_DEFINITIONS.map((raid) => [raid.family, raid.family])),
).map(([id, label]) => ({ id, label }));

const ICON_PATHS = {
  add: "/icons/add.svg",
  chevron: "/icons/chevron.svg",
  close: "/icons/close.svg",
  dealer: "/icons/dealer.svg",
  edit: "/icons/edit.svg",
  logOut: "/icons/log-out.svg",
  refresh: "/icons/refresh.svg",
  settings: "/icons/settings.svg",
  sparkle: "/icons/sparkle.svg",
  sliders: "/icons/sliders.svg",
  support: "/icons/support.svg",
  trash: "/icons/trash.svg",
  undo: "/icons/undo.svg",
  user: "/icons/user.svg",
} as const;

type IconName = keyof typeof ICON_PATHS;

function CoolIcon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <span
      className={`cool-icon ${className}`.trim()}
      style={{ "--icon-url": `url(${ICON_PATHS[name]})` } as CSSProperties}
      aria-hidden="true"
    />
  );
}

const GOLD_ICON_URL =
  typeof lostarkGoldIcon === "string" ? lostarkGoldIcon : lostarkGoldIcon.src;

function GoldIcon({ className = "" }: { className?: string }) {
  return (
    <span
      className={`gold-image-icon ${className}`.trim()}
      style={{ backgroundImage: `url(${GOLD_ICON_URL})` }}
      aria-hidden="true"
    />
  );
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([createPlayer(1)]);
  const [room, setRoom] = useState<RaidGroupRoom | null>(null);
  const [raidWeek, setRaidWeek] = useState("");
  const [legacyPlayers, setLegacyPlayers] = useState<Player[] | null>(null);
  const [booting, setBooting] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("players");
  const [hydrated, setHydrated] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<RaidPlanResult | null>(null);
  const [generatedFingerprint, setGeneratedFingerprint] = useState("");
  const [notice, setNotice] = useState("");
  const [syncingId, setSyncingId] = useState("");
  const [pendingScrollPlayerId, setPendingScrollPlayerId] = useState("");
  const roomRef = useRef<RaidGroupRoom | null>(null);
  const raidWeekRef = useRef("");
  const nameEditingRef = useRef(false);
  const pendingMutationsRef = useRef(0);
  const snapshotRequestIdRef = useRef(0);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const applySnapshot = useCallback(
    (snapshot: { room: RaidGroupRoom; players: Player[]; raidWeek: string }) => {
      const normalized = normalizePlayers(snapshot.players) ?? [];
      snapshotRequestIdRef.current += 1;
      roomRef.current = snapshot.room;
      raidWeekRef.current = snapshot.raidWeek;
      setRoom(snapshot.room);
      setPlayers(normalized);
      setRaidWeek(snapshot.raidWeek);
    },
    [],
  );

  const loadSharedState = useCallback(
    async (conditional = true) => {
      const currentRoom = roomRef.current;
      if (
        !currentRoom ||
        nameEditingRef.current ||
        pendingMutationsRef.current > 0
      ) {
        return;
      }
      const requestId = ++snapshotRequestIdRef.current;
      const query = conditional
        ? `?since=${currentRoom.revision}&week=${encodeURIComponent(raidWeekRef.current)}`
        : "";
      const response = await fetch(`/api/raid-group${query}`, {
        cache: "no-store",
      });
      if (requestId !== snapshotRequestIdRef.current) return;
      if (response.status === 204) return;
      if (response.status === 401) {
        snapshotRequestIdRef.current += 1;
        roomRef.current = null;
        setRoom(null);
        return;
      }
      if (!response.ok) return;
      const snapshot = await response.json();
      if (
        requestId !== snapshotRequestIdRef.current ||
        nameEditingRef.current ||
        pendingMutationsRef.current > 0
      ) {
        return;
      }
      applySnapshot(snapshot);
    },
    [applySnapshot],
  );

  const queueMutation = useCallback(
    (operation: RaidGroupOperation) => {
      // A polling response that started before this optimistic change must
      // never be allowed to replace the newer local state.
      snapshotRequestIdRef.current += 1;
      pendingMutationsRef.current += 1;
      mutationQueueRef.current = mutationQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch("/api/raid-group", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ operation }),
          });
          const body = (await response.json().catch(() => ({}))) as {
            message?: string;
            revision?: number;
            raidWeek?: string;
          };
          if (!response.ok) {
            if (response.status === 401) {
              roomRef.current = null;
              setRoom(null);
            }
            throw new Error(body.message ?? "공유 데이터를 저장하지 못했습니다.");
          }
          if (roomRef.current && typeof body.revision === "number") {
            const nextRoom = { ...roomRef.current, revision: body.revision };
            roomRef.current = nextRoom;
            setRoom(nextRoom);
          }
          if (body.raidWeek) {
            raidWeekRef.current = body.raidWeek;
            setRaidWeek(body.raidWeek);
          }
        })
        .catch((error) => {
          setNotice(
            error instanceof Error
              ? error.message
              : "공유 데이터를 저장하지 못했습니다.",
          );
        })
        .finally(() => {
          pendingMutationsRef.current -= 1;
          if (pendingMutationsRef.current === 0) void loadSharedState(false);
        });
    },
    [loadSharedState],
  );

  const commitOperation = useCallback(
    (operation: RaidGroupOperation) => {
      setPlayers((current) =>
        applyRaidGroupOperation(current, operation, raidWeekRef.current),
      );
      queueMutation(operation);
    },
    [queueMutation],
  );

  const handleNameEditingChange = useCallback(
    (isEditing: boolean) => {
      nameEditingRef.current = isEditing;
      if (!isEditing && pendingMutationsRef.current === 0) {
        void loadSharedState(false);
      }
    },
    [loadSharedState],
  );

  const fingerprint = useMemo(() => JSON.stringify(players), [players]);
  const isPlanStale = Boolean(generatedPlan) && generatedFingerprint !== fingerprint;

  const characterInputs = useMemo<CharacterInput[]>(
    () =>
      players.flatMap((player) =>
        player.expeditions.flatMap((expedition) =>
          expedition.characters.map((character) => ({
            id: character.id,
            playerId: player.id,
            playerName: player.name.trim(),
            characterName: character.name.trim(),
            itemLevel: character.itemLevel,
            className: character.className.trim(),
            role: character.role,
            selectedRaids: character.selectedRaids.filter(
              (raidName) => character.raidCompletions[raidName] !== raidWeek,
            ),
          })),
        ),
      ),
    [players, raidWeek],
  );

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const stored =
        window.localStorage.getItem(STORAGE_KEY) ??
        LEGACY_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
      const storedApiKey = window.localStorage.getItem(API_KEY_STORAGE_KEY);

      if (storedApiKey) {
        setApiKey(storedApiKey);
      }

      if (stored) {
        try {
          const normalized = normalizePlayers(JSON.parse(stored));
          if (normalized?.length) setLegacyPlayers(normalized);
        } catch {
          setNotice("저장된 데이터를 읽지 못했습니다.");
        }
      }

      try {
        const response = await fetch("/api/raid-group", { cache: "no-store" });
        if (response.ok && !cancelled) applySnapshot(await response.json());
      } catch {
        if (!cancelled) setNotice("서버 저장소에 연결하지 못했습니다.");
      }

      if (cancelled) return;
      setHydrated(true);
      setBooting(false);
    };
    void initialize();

    return () => {
      cancelled = true;
    };
  }, [applySnapshot]);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    }
  }, [apiKey, hydrated]);

  useEffect(() => {
    if (!room) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void loadSharedState(true);
    };
    const intervalId = window.setInterval(refresh, 5_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadSharedState, room]);

  useEffect(() => {
    if (!pendingScrollPlayerId) {
      return;
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById(`player-${pendingScrollPlayerId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "end" });
      setPendingScrollPlayerId("");
    });
  }, [pendingScrollPlayerId]);

  const updatePlayer = (playerId: string, patch: Partial<Player>) => {
    commitOperation({
      type: "player.update",
      playerId,
      name: typeof patch.name === "string" ? patch.name : "",
    });
  };

  const updateExpedition = (
    playerId: string,
    expeditionId: string,
    patch: Partial<Expedition>,
  ) => {
    commitOperation({
      type: "expedition.update",
      playerId,
      expeditionId,
      patch: {
        ...(typeof patch.name === "string" ? { name: patch.name } : {}),
        ...(typeof patch.representativeName === "string"
          ? { representativeName: patch.representativeName }
          : {}),
        ...(typeof patch.serverName === "string"
          ? { serverName: patch.serverName }
          : {}),
        ...(typeof patch.lastSyncedAt === "string"
          ? { lastSyncedAt: patch.lastSyncedAt }
          : {}),
        ...(typeof patch.charactersHidden === "boolean"
          ? { charactersHidden: patch.charactersHidden }
          : {}),
      },
    });
  };

  const addPlayer = () => {
    const nextPlayer = createPlayer(players.length + 1);
    commitOperation({ type: "player.add", player: nextPlayer });
    setPendingScrollPlayerId(nextPlayer.id);
  };

  const removePlayer = (playerId: string) => {
    commitOperation({ type: "player.remove", playerId });
  };

  const addExpedition = (playerId: string) => {
    const player = players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    commitOperation({
      type: "expedition.add",
      playerId,
      expedition: createExpedition(player.expeditions.length + 1),
    });
  };

  const removeExpedition = (playerId: string, expeditionId: string) => {
    commitOperation({ type: "expedition.remove", playerId, expeditionId });
  };

  const restoreCharacter = (
    playerId: string,
    expeditionId: string,
    characterName: string,
  ) => {
    commitOperation({
      type: "character.restore",
      playerId,
      expeditionId,
      characterName,
    });
  };

  const removeCharacter = (
    playerId: string,
    expeditionId: string,
    characterId: string,
  ) => {
    commitOperation({
      type: "character.remove",
      playerId,
      expeditionId,
      characterId,
    });
  };

  const setCharacterRole = (
    playerId: string,
    expeditionId: string,
    characterId: string,
    role: Role,
  ) => {
    commitOperation({
      type: "character.role",
      playerId,
      expeditionId,
      characterId,
      role,
    });
  };

  const setGoldPreference = (
    playerId: string,
    expeditionId: string,
    characterId: string,
    preference: GoldPreference,
  ) => {
    commitOperation({
      type: "character.goldPreference",
      playerId,
      expeditionId,
      characterId,
      preference,
    });
  };

  const toggleRaid = (
    playerId: string,
    expeditionId: string,
    characterId: string,
    raidName: string,
    checked: boolean,
  ) => {
    commitOperation({
      type: "character.raid",
      playerId,
      expeditionId,
      characterId,
      raidName,
      checked,
    });
  };

  const resetAllRaids = () => {
    commitOperation({ type: "raids.reset" });
    setNotice("아이템 레벨 기준으로 레이드를 다시 자동 등록했습니다.");
  };

  const generatePlan = () => {
    const plan = buildRaidPlan(characterInputs);
    setGeneratedPlan(plan);
    setGeneratedFingerprint(fingerprint);
    setActiveTab("results");
    setNotice("");
  };

  const saveAppSettings = async ({
    apiKey: nextApiKey,
    roomName,
    password,
  }: {
    apiKey: string;
    roomName: string;
    password: string;
  }) => {
    const response = await fetch("/api/raid-group", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: roomName, password }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      room?: RaidGroupRoom;
    };

    if (!response.ok) {
      if (response.status === 401) {
        roomRef.current = null;
        setRoom(null);
      }
      throw new Error(payload.message ?? "설정을 저장하지 못했습니다.");
    }

    if (payload.room) {
      roomRef.current = payload.room;
      setRoom(payload.room);
    }
    setApiKey(nextApiKey);
    setNotice("설정을 저장했습니다.");
  };

  const fetchRoster = async (representativeName: string) => {
    const response = await fetch("/api/lostark/roster", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey, characterName: representativeName }),
    });
    const payload = (await response.json()) as {
      characters?: RosterCharacter[];
      message?: string;
    };

    if (!response.ok) {
      throw new Error(payload.message ?? "원정대 정보를 가져오지 못했습니다.");
    }

    return payload.characters ?? [];
  };

  const syncRoster = async (playerId: string, expeditionId: string) => {
    const player = players.find((candidate) => candidate.id === playerId);
    const expedition = player?.expeditions.find(
      (candidate) => candidate.id === expeditionId,
    );

    if (!player || !expedition) {
      return;
    }

    if (!apiKey.trim()) {
      setNotice("Lost Ark OpenAPI JWT를 입력하세요.");
      return;
    }

    if (!expedition.representativeName.trim()) {
      setNotice("대표 캐릭터명을 입력하세요.");
      return;
    }

    const syncId = `${playerId}:${expeditionId}`;
    setSyncingId(syncId);
    setNotice("");

    try {
      const roster = await fetchRoster(expedition.representativeName);
      commitOperation({
        type: "expedition.replace",
        playerId,
        expedition: mergeRosterIntoExpedition(expedition, roster),
      });
      setGeneratedPlan(null);
      setGeneratedFingerprint("");
      setNotice(`${expedition.name}: 캐릭터 ${roster.length}명을 동기화했습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "동기화에 실패했습니다.");
    } finally {
      setSyncingId("");
    }
  };

  const syncAllRosters = async () => {
    if (!apiKey.trim()) {
      setNotice("Lost Ark OpenAPI JWT를 입력하세요.");
      return;
    }

    let syncedCount = 0;
    setNotice("전체 정보를 동기화하는 중입니다.");

    for (const player of players) {
      for (const expedition of player.expeditions) {
        if (!expedition.representativeName.trim()) {
          continue;
        }

        try {
          setSyncingId(`${player.id}:${expedition.id}`);
          const roster = await fetchRoster(expedition.representativeName);
          commitOperation({
            type: "expedition.replace",
            playerId: player.id,
            expedition: mergeRosterIntoExpedition(expedition, roster),
          });
          syncedCount += 1;
        } catch {
          // Keep syncing the remaining rosters.
        }
      }
    }

    setSyncingId("");
    setGeneratedPlan(null);
    setGeneratedFingerprint("");
    setNotice(`원정대 ${syncedCount}개를 동기화했습니다.`);
  };

  const setRaidCompletion = (
    playerId: string,
    expeditionId: string,
    characterId: string,
    raidName: string,
    completed: boolean,
  ) => {
    commitOperation({
      type: "completion.set",
      playerId,
      expeditionId,
      characterId,
      raidName,
      completed,
    });
  };

  const resetRaidCompletions = () => {
    if (!window.confirm("이번 주 레이드 완료 체크를 모두 초기화할까요?")) return;
    commitOperation({ type: "completion.reset" });
    setNotice("이번 주 레이드 완료 체크를 모두 초기화했습니다.");
  };

  const leaveRaidGroup = async () => {
    await fetch("/api/raid-group", { method: "DELETE" }).catch(() => undefined);
    roomRef.current = null;
    raidWeekRef.current = "";
    setRoom(null);
    setRaidWeek("");
    setPlayers([createPlayer(1)]);
    setGeneratedPlan(null);
    setGeneratedFingerprint("");
    setNotice("");
  };

  if (booting) {
    return <div className="room-loading">공유 공격대 정보를 불러오는 중입니다.</div>;
  }

  if (!room) {
    return (
      <RaidGroupGate
        legacyPlayers={legacyPlayers}
        notice={notice}
        onEntered={(snapshot, imported) => {
          applySnapshot(snapshot);
          setNotice("");
          if (imported) {
            [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].forEach((key) =>
              window.localStorage.removeItem(key),
            );
            setLegacyPlayers(null);
          }
        }}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#151923]">
      <div className="workspace-shell mx-auto flex max-w-[1400px] flex-col gap-5 px-6 py-5">
        <header className="app-header">
          <div className="room-identity">
            <div className="room-title-row">
              <h1>{room.name}</h1>
              <div className="header-actions">
                <button
                  className="header-icon-button"
                  type="button"
                  aria-label="공격대 전환"
                  title="공격대 전환"
                  onClick={leaveRaidGroup}
                >
                  <CoolIcon name="logOut" />
                </button>
                <button
                  className="header-icon-button"
                  type="button"
                  aria-label="설정"
                  title="설정"
                  onClick={() => setApiSettingsOpen(true)}
                >
                  <CoolIcon name="settings" />
                </button>
              </div>
            </div>
            <p className="metric-row">
              플레이어 {players.length} · 원정대{" "}
              {players.reduce(
                (count, player) => count + player.expeditions.length,
                0,
              )} · 캐릭터 {characterInputs.length}
            </p>
          </div>
        </header>

        {apiSettingsOpen ? (
          <ApiSettingsModal
            apiKey={apiKey}
            roomName={room.name}
            onClose={() => setApiSettingsOpen(false)}
            onSave={saveAppSettings}
          />
        ) : null}

        <nav className="tab-strip" aria-label="작업 탭">
          {TABS.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : ""}
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === "results") {
                  generatePlan();
                  return;
                }
                setActiveTab(tab.id);
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {notice ? <div className="notice-bar">{notice}</div> : null}

        {activeTab === "players" ? (
          <PlayerEditor
            players={players}
            syncingId={syncingId}
            raidWeek={raidWeek}
            onAddPlayer={addPlayer}
            onRemovePlayer={removePlayer}
            onUpdatePlayer={updatePlayer}
            onAddExpedition={addExpedition}
            onRemoveExpedition={removeExpedition}
            onUpdateExpedition={updateExpedition}
            onNameEditingChange={handleNameEditingChange}
            onSyncRoster={syncRoster}
            onSyncAll={syncAllRosters}
            onResetAllRaids={resetAllRaids}
            onRestoreCharacter={restoreCharacter}
            onRemoveCharacter={removeCharacter}
            onSetRole={setCharacterRole}
            onSetGoldPreference={setGoldPreference}
            onSetCompletion={setRaidCompletion}
            onResetCompletions={resetRaidCompletions}
            onToggleRaid={toggleRaid}
          />
        ) : (
          <ResultPanel
            plan={generatedPlan}
            players={players}
            stale={isPlanStale}
            onGenerate={generatePlan}
          />
        )}
      </div>
    </main>
  );
}

function RaidGroupGate({
  legacyPlayers,
  notice,
  onEntered,
}: {
  legacyPlayers: Player[] | null;
  notice: string;
  onEntered: (
    snapshot: { room: RaidGroupRoom; players: Player[]; raidWeek: string },
    imported: boolean,
  ) => void;
}) {
  const [mode, setMode] = useState<"join" | "create">("join");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [importLegacy, setImportLegacy] = useState(Boolean(legacyPlayers?.length));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const shouldImport =
        mode === "create" && importLegacy && Boolean(legacyPlayers?.length);
      const response = await fetch("/api/raid-group", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: mode,
          name,
          password,
          players: shouldImport ? legacyPlayers : undefined,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        room?: RaidGroupRoom;
        players?: Player[];
        raidWeek?: string;
        message?: string;
      };
      if (!response.ok || !body.room || !body.players || !body.raidWeek) {
        throw new Error(body.message ?? "공격대에 입장하지 못했습니다.");
      }
      onEntered(
        { room: body.room, players: body.players, raidWeek: body.raidWeek },
        shouldImport,
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "공격대에 입장하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="room-gate-page">
      <section className="room-gate-card">
        <p className="room-gate-kicker">Lost Ark Raid Builder</p>
        <h1>공유 공격대에 입장하세요</h1>
        <p className="room-gate-description">
          같은 공격대 이름과 비밀번호를 사용하는 모두가 멤버 목록과 레이드
          현황을 함께 편집할 수 있습니다.
        </p>

        <div className="room-mode-tabs" role="tablist" aria-label="공격대 입장 방식">
          <button
            className={mode === "join" ? "active" : ""}
            type="button"
            onClick={() => setMode("join")}
          >
            공격대 가입
          </button>
          <button
            className={mode === "create" ? "active" : ""}
            type="button"
            onClick={() => setMode("create")}
          >
            새 공격대 생성
          </button>
        </div>

        <form className="room-gate-form" onSubmit={submit}>
          <label>
            <span>공격대 이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={40}
              autoComplete="organization"
              required
            />
          </label>
          <label>
            <span>비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              maxLength={72}
              autoComplete={mode === "join" ? "current-password" : "new-password"}
              required
            />
            <small>6자 이상 입력하세요.</small>
          </label>

          {mode === "create" && legacyPlayers?.length ? (
            <label className="legacy-import-option">
              <input
                type="checkbox"
                checked={importLegacy}
                onChange={(event) => setImportLegacy(event.target.checked)}
              />
              <span>
                이 브라우저에 저장된 멤버 {legacyPlayers.length}명을 새 공격대로
                가져오기
              </span>
            </label>
          ) : null}

          {error || notice ? (
            <div className="room-gate-error">{error || notice}</div>
          ) : null}

          <button className="room-submit-button" type="submit" disabled={submitting}>
            {submitting
              ? "처리 중..."
              : mode === "create"
                ? "공격대 생성"
                : "공격대 가입"}
          </button>
        </form>
      </section>
    </main>
  );
}

// Kept temporarily for legacy persisted views during the integrated UI migration.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function RaidStatusPanel({
  players,
  raidWeek,
  onSetGoldPreference,
  onSetCompletion,
  onReset,
}: {
  players: Player[];
  raidWeek: string;
  onSetGoldPreference: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    preference: GoldPreference,
  ) => void;
  onSetCompletion: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    raidName: string,
    completed: boolean,
  ) => void;
  onReset: () => void;
}) {
  const characterCount = players.reduce(
    (count, player) =>
      count +
      player.expeditions.reduce(
        (expeditionCount, expedition) =>
          expeditionCount + expedition.characters.length,
        0,
      ),
    0,
  );

  return (
    <section className="raid-status-shell">
      <div className="raid-status-heading">
        <div>
          <h2>레이드 현황</h2>
          <p>
            {formatRaidWeek(raidWeek)} 주차 · 매주 수요일 오전 6시에 완료 표시가
            자동 초기화됩니다.
          </p>
        </div>
        <button className="ghost-button" type="button" onClick={onReset}>
          완료 전체 초기화
        </button>
      </div>

      {characterCount === 0 ? (
        <div className="empty-state">등록된 캐릭터가 없습니다.</div>
      ) : (
        <div className="raid-status-player-list">
          {players.map((player) => {
            const totals = getPlayerCompletedGold(player, raidWeek);
            return (
              <article className="raid-status-player" key={player.id}>
                <div className="raid-status-player-heading">
                  <h3>{player.name}</h3>
                  <span
                    className="raid-status-gold-total"
                    aria-label={`완료 레이드 골드 합계 ${totals.total.toLocaleString("ko-KR")}`}
                  >
                    <GoldIcon />
                    {totals.total.toLocaleString("ko-KR")} (
                    {totals.tradable.toLocaleString("ko-KR")} + {totals.bound.toLocaleString("ko-KR")})
                  </span>
                </div>
                <div className="raid-status-character-list">
                  {player.expeditions.flatMap((expedition) =>
                    expedition.characters.map((character) => {
                      const recommendedRaids = new Set(
                        getGoldRecommendedRaidNames(
                          character.selectedRaids,
                          character.goldPreference,
                        ),
                      );
                      return (
                        <div className="raid-status-character" key={character.id}>
                          <div className="raid-status-character-title">
                            <div className="raid-status-character-name-row">
                              <strong>{character.name || "이름 없는 캐릭터"}</strong>
                              <span
                                className="gold-preference-control"
                                aria-label="골드 추천 기준"
                              >
                                <button
                                  type="button"
                                  className={`gold-preference-label${character.goldPreference === "bound" ? " active" : ""}`}
                                  aria-pressed={character.goldPreference === "bound"}
                                  onClick={() =>
                                    onSetGoldPreference(
                                      player.id,
                                      expedition.id,
                                      character.id,
                                      "bound",
                                    )
                                  }
                                >
                                  귀속
                                </button>
                                <button
                                  type="button"
                                  className={`gold-preference-switch${character.goldPreference === "tradable" ? " on" : ""}`}
                                  aria-label={`골드 추천 기준을 ${character.goldPreference === "tradable" ? "귀속" : "유통"} 골드로 변경`}
                                  aria-pressed={character.goldPreference === "tradable"}
                                  onClick={() =>
                                    onSetGoldPreference(
                                      player.id,
                                      expedition.id,
                                      character.id,
                                      character.goldPreference === "tradable"
                                        ? "bound"
                                        : "tradable",
                                    )
                                  }
                                >
                                  <span />
                                </button>
                                <button
                                  type="button"
                                  className={`gold-preference-label${character.goldPreference === "tradable" ? " active" : ""}`}
                                  aria-pressed={character.goldPreference === "tradable"}
                                  onClick={() =>
                                    onSetGoldPreference(
                                      player.id,
                                      expedition.id,
                                      character.id,
                                      "tradable",
                                    )
                                  }
                                >
                                  유통
                                </button>
                              </span>
                            </div>
                            <span>
                              {character.className || "직업 미입력"} · {expedition.name}
                            </span>
                          </div>
                          <div className="raid-status-check-list">
                            {character.selectedRaids.length ? (
                              character.selectedRaids.map((raidName) => {
                                const raid = getRaidDefinition(raidName);
                                if (!raid) return null;
                                const completed =
                                  character.raidCompletions[raidName] === raidWeek;
                                const recommended = recommendedRaids.has(raidName);
                                return (
                                  <label
                                    className={`raid-status-check${completed ? " completed" : ""}${recommended ? " recommended" : ""}`}
                                    key={raidName}
                                  >
                                    <span className="raid-status-check-copy">
                                      <span>{raidName}</span>
                                      <small>
                                        <GoldIcon />
                                        {raid.gold.toLocaleString("ko-KR")} (
                                        {raid.tradableGold.toLocaleString("ko-KR")} + {raid.boundGold.toLocaleString("ko-KR")})
                                      </small>
                                    </span>
                                    <input
                                      type="checkbox"
                                      checked={completed}
                                      onChange={(event) =>
                                        onSetCompletion(
                                          player.id,
                                          expedition.id,
                                          character.id,
                                          raidName,
                                          event.target.checked,
                                        )
                                      }
                                      aria-label={`${character.name} ${raidName} 완료`}
                                    />
                                  </label>
                                );
                              })
                            ) : (
                              <span className="raid-status-empty">선택된 레이드 없음</span>
                            )}
                          </div>
                        </div>
                      );
                    }),
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getPlayerCompletedGold(player: Player, raidWeek: string) {
  return player.expeditions.reduce(
    (playerTotals, expedition) =>
      expedition.characters.reduce((characterTotals, character) => {
        character.selectedRaids.forEach((raidName) => {
          if (character.raidCompletions[raidName] !== raidWeek) return;
          const raid = getRaidDefinition(raidName);
          if (!raid) return;
          characterTotals.total += raid.gold;
          characterTotals.tradable += raid.tradableGold;
          characterTotals.bound += raid.boundGold;
        });
        return characterTotals;
      }, playerTotals),
    { total: 0, tradable: 0, bound: 0 },
  );
}

function ApiSettingsModal({
  apiKey,
  roomName,
  onClose,
  onSave,
}: {
  apiKey: string;
  roomName: string;
  onClose: () => void;
  onSave: (settings: {
    apiKey: string;
    roomName: string;
    password: string;
  }) => Promise<void>;
}) {
  const [nextApiKey, setNextApiKey] = useState(apiKey);
  const [nextRoomName, setNextRoomName] = useState(roomName);
  const [nextPassword, setNextPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submitSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({
        apiKey: nextApiKey,
        roomName: nextRoomName.trim(),
        password: nextPassword,
      });
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "설정을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-modal-backdrop">
      <form
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-settings-title"
        onSubmit={submitSettings}
      >
        <div className="settings-modal-head">
          <div>
            <h2 id="api-settings-title">설정</h2>
            <p>공격대 정보와 Lost Ark OpenAPI를 관리합니다.</p>
          </div>
          <button
            className="settings-close-button"
            type="button"
            aria-label="설정 닫기"
            onClick={onClose}
          >
            <CoolIcon name="close" />
          </button>
        </div>

        <label className="settings-field">
          <span>공격대 이름</span>
          <input
            className="settings-input"
            type="text"
            value={nextRoomName}
            minLength={2}
            maxLength={40}
            autoComplete="organization"
            onChange={(event) => setNextRoomName(event.target.value)}
            required
          />
        </label>

        <label className="settings-field">
          <span>새 비밀번호</span>
          <input
            className="settings-input"
            type="password"
            value={nextPassword}
            minLength={6}
            maxLength={72}
            autoComplete="new-password"
            placeholder="변경할 때만 입력"
            onChange={(event) => setNextPassword(event.target.value)}
          />
          <small>기존 비밀번호를 유지하려면 비워 두세요.</small>
        </label>

        <label className="settings-field">
          <span>API 키</span>
          <input
            className="settings-input"
            type="password"
            value={nextApiKey}
            placeholder="Lost Ark OpenAPI JWT"
            autoComplete="off"
            onChange={(event) => setNextApiKey(event.target.value)}
          />
        </label>

        {error ? <div className="settings-error">{error}</div> : null}

        <div className="settings-modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>
            취소
          </button>
          <button className="dark-button" type="submit" disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}

function mergeRosterIntoExpedition(
  expedition: Expedition,
  roster: RosterCharacter[],
): Expedition {
  const deletedNames = new Set(
    [
      ...expedition.deletedCharacterNames,
      ...expedition.deletedCharacters.map((character) => character.name),
    ]
      .map((name) => name.trim())
      .filter(Boolean),
  );
  const visibleRoster = roster.filter(
    (rosterCharacter) => !deletedNames.has(rosterCharacter.name.trim()),
  );
  const previousByName = new Map(
    expedition.characters.map((character) => [character.name, character]),
  );
  const characters = visibleRoster.map((rosterCharacter) => {
    const previous = previousByName.get(rosterCharacter.name);
    const inferredRole = inferRoleFromClassName(rosterCharacter.className) ?? "dealer";

    return {
      id: previous?.id ?? createId(),
      name: rosterCharacter.name,
      serverName: rosterCharacter.serverName,
      itemLevel: rosterCharacter.itemLevel,
      combatPower: rosterCharacter.combatPower,
      className: rosterCharacter.className,
      role: previous?.roleEdited ? previous.role : inferredRole,
      goldPreference: previous?.goldPreference ?? "tradable",
      selectedRaids: previous?.raidsEdited
        ? previous.selectedRaids
        : getAutoRaidsForLevel(rosterCharacter.itemLevel),
      raidCompletions: previous?.raidCompletions ?? {},
      raidsEdited: previous?.raidsEdited ?? false,
      roleEdited: previous?.roleEdited ?? false,
    } satisfies Character;
  });

  return {
    ...expedition,
    serverName: roster[0]?.serverName ?? expedition.serverName,
    lastSyncedAt: new Date().toISOString(),
    characters,
  };
}

function PlayerEditor({
  players,
  syncingId,
  raidWeek,
  onAddPlayer,
  onRemovePlayer,
  onUpdatePlayer,
  onNameEditingChange,
  onAddExpedition,
  onRemoveExpedition,
  onUpdateExpedition,
  onSyncRoster,
  onSyncAll,
  onResetAllRaids,
  onRestoreCharacter,
  onRemoveCharacter,
  onSetRole,
  onSetGoldPreference,
  onSetCompletion,
  onResetCompletions,
  onToggleRaid,
}: {
  players: Player[];
  syncingId: string;
  raidWeek: string;
  onAddPlayer: () => void;
  onRemovePlayer: (playerId: string) => void;
  onUpdatePlayer: (playerId: string, patch: Partial<Player>) => void;
  onNameEditingChange: (isEditing: boolean) => void;
  onAddExpedition: (playerId: string) => void;
  onRemoveExpedition: (playerId: string, expeditionId: string) => void;
  onUpdateExpedition: (
    playerId: string,
    expeditionId: string,
    patch: Partial<Expedition>,
  ) => void;
  onSyncRoster: (playerId: string, expeditionId: string) => void;
  onSyncAll: () => void;
  onResetAllRaids: () => void;
  onRestoreCharacter: (
    playerId: string,
    expeditionId: string,
    characterName: string,
  ) => void;
  onRemoveCharacter: (
    playerId: string,
    expeditionId: string,
    characterId: string,
  ) => void;
  onSetRole: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    role: Role,
  ) => void;
  onSetGoldPreference: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    preference: GoldPreference,
  ) => void;
  onSetCompletion: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    raidName: string,
    completed: boolean,
  ) => void;
  onResetCompletions: () => void;
  onToggleRaid: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    raidName: string,
    checked: boolean,
  ) => void;
}) {
  const [editingPlayers, setEditingPlayers] = useState<
    Map<string, { initialValue: string; value: string }>
  >(new Map());
  const [editingExpeditions, setEditingExpeditions] = useState<
    Map<string, { initialValue: string; value: string }>
  >(
    new Map(),
  );
  const [collapsedPlayers, setCollapsedPlayers] = useState<Set<string>>(new Set());
  const [settingsTarget, setSettingsTarget] = useState<{
    playerId: string;
    expeditionId: string;
  } | null>(null);

  const hasActiveNameEdit =
    editingPlayers.size > 0 || editingExpeditions.size > 0;

  useEffect(() => {
    onNameEditingChange(hasActiveNameEdit);
  }, [hasActiveNameEdit, onNameEditingChange]);

  useEffect(
    () => () => {
      onNameEditingChange(false);
    },
    [onNameEditingChange],
  );

  const startEditingPlayer = (playerId: string, name: string) => {
    setEditingPlayers((current) =>
      new Map(current).set(playerId, {
        initialValue: name,
        value: name,
      }),
    );
  };

  const updateEditingPlayer = (playerId: string, value: string) => {
    setEditingPlayers((current) => {
      const draft = current.get(playerId);
      if (!draft) return current;
      return new Map(current).set(playerId, { ...draft, value });
    });
  };

  const stopEditingPlayer = (playerId: string, value: string) => {
    const draft = editingPlayers.get(playerId);
    if (draft && value !== draft.initialValue) {
      onUpdatePlayer(playerId, { name: value });
    }
    setEditingPlayers((current) => {
      const next = new Map(current);
      next.delete(playerId);
      return next;
    });
  };

  const startEditingExpedition = (expeditionId: string, name: string) => {
    setEditingExpeditions((current) =>
      new Map(current).set(expeditionId, {
        initialValue: name,
        value: name,
      }),
    );
  };

  const updateEditingExpedition = (expeditionId: string, value: string) => {
    setEditingExpeditions((current) => {
      const draft = current.get(expeditionId);
      if (!draft) return current;
      return new Map(current).set(expeditionId, { ...draft, value });
    });
  };

  const stopEditingExpedition = (
    playerId: string,
    expeditionId: string,
    value: string,
  ) => {
    const draft = editingExpeditions.get(expeditionId);
    if (draft && value !== draft.initialValue) {
      onUpdateExpedition(playerId, expeditionId, { name: value });
    }
    setEditingExpeditions((current) => {
      const next = new Map(current);
      next.delete(expeditionId);
      return next;
    });
  };

  const toggleCollapsedPlayer = (playerId: string) => {
    setCollapsedPlayers((current) => {
      const next = new Set(current);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const settingsPlayer = settingsTarget
    ? players.find((player) => player.id === settingsTarget.playerId)
    : undefined;
  const settingsExpedition = settingsPlayer
    ? settingsPlayer.expeditions.find(
        (expedition) => expedition.id === settingsTarget?.expeditionId,
      )
    : undefined;

  return (
    <section className="member-shell">
      <div className="member-heading">
        <div className="member-title">멤버 목록</div>
        <div className="member-heading-actions">
          <button className="ghost-button" type="button" onClick={onSyncAll}>
            <CoolIcon name="refresh" /> 동기화
          </button>
          <button className="ghost-button" type="button" onClick={onResetCompletions}>
            <CoolIcon name="undo" /> 완료 상태 초기화
          </button>
          <button className="dark-button" type="button" onClick={onAddPlayer}>
            <CoolIcon name="add" /> 플레이어 추가
          </button>
        </div>
      </div>

      <div className="player-stack">
        {players.map((player) => {
          const playerCollapsed = collapsedPlayers.has(player.id);
          const playerNameDraft = editingPlayers.get(player.id);

          return (
            <article className="player-card" id={`player-${player.id}`} key={player.id}>
              <div className="player-card-head">
                <div className="player-name-line">
                  <CoolIcon name="user" className="user-circle-icon" />
                  {playerNameDraft ? (
                    <input
                      aria-label="플레이어명"
                      autoFocus
                      className="plain-title-input"
                      value={playerNameDraft.value}
                      onBlur={(event) =>
                        stopEditingPlayer(player.id, event.currentTarget.value)
                      }
                      onChange={(event) =>
                        updateEditingPlayer(player.id, event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === "Escape") {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  ) : (
                    <span className="plain-title-text">{player.name}</span>
                  )}
                  <button
                    className="icon-button edit-icon-button"
                    type="button"
                    aria-label="플레이어명 수정"
                    onClick={() => startEditingPlayer(player.id, player.name)}
                  >
                    <CoolIcon name="edit" />
                  </button>
                </div>
                <div className="player-head-right">
                  <button
                    className="collapse-button"
                    type="button"
                    aria-expanded={!playerCollapsed}
                    onClick={() => toggleCollapsedPlayer(player.id)}
                  >
                    <span>캐릭터</span>
                    <CoolIcon
                      name="chevron"
                      className={`fold-icon inline ${playerCollapsed ? "" : "expanded"}`}
                    />
                  </button>
                </div>
              </div>

              <div
                className={`player-collapsible ${playerCollapsed ? "collapsed" : "expanded"}`}
                aria-hidden={playerCollapsed}
              >
                  <div className="expedition-stack">
                    {player.expeditions.map((expedition) => (
                      <ExpeditionBlock
                        expedition={expedition}
                        isSyncing={syncingId === `${player.id}:${expedition.id}`}
                        key={expedition.id}
                        player={player}
                        raidWeek={raidWeek}
                        onRestoreCharacter={onRestoreCharacter}
                        onRemoveCharacter={onRemoveCharacter}
                        onRemoveExpedition={onRemoveExpedition}
                        onSetRole={onSetRole}
                        onSetGoldPreference={onSetGoldPreference}
                        onSetCompletion={onSetCompletion}
                        onSyncRoster={onSyncRoster}
                        onToggleRaid={onToggleRaid}
                        onOpenSettings={() =>
                          setSettingsTarget({
                            playerId: player.id,
                            expeditionId: expedition.id,
                          })
                        }
                        isEditingName={editingExpeditions.has(expedition.id)}
                        nameDraft={
                          editingExpeditions.get(expedition.id)?.value ??
                          expedition.name
                        }
                        onChangeNameDraft={(value) =>
                          updateEditingExpedition(expedition.id, value)
                        }
                        onStartEditName={() =>
                          startEditingExpedition(expedition.id, expedition.name)
                        }
                        onStopEditName={(value) =>
                          stopEditingExpedition(player.id, expedition.id, value)
                        }
                      />
                    ))}
                  </div>
                  <div className="player-footer-actions">
                    <button
                      className="danger-text-button player-delete-button"
                      type="button"
                      onClick={() => onRemovePlayer(player.id)}
                      disabled={players.length === 1}
                    >
                      <CoolIcon name="trash" /> 플레이어 삭제
                    </button>
                    <div>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={onResetAllRaids}
                      >
                        <CoolIcon name="sliders" /> 레이드 자동 등록
                      </button>
                      <button
                        className="dark-button"
                        type="button"
                        onClick={() => onAddExpedition(player.id)}
                      >
                        <CoolIcon name="add" /> 원정대 추가
                      </button>
                    </div>
                  </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="member-bottom-actions">
        <button className="dark-button" type="button" onClick={onAddPlayer}>
          <CoolIcon name="add" /> 플레이어 추가
        </button>
      </div>

      {settingsPlayer && settingsExpedition ? (
        <ExpeditionSettingsModal
          expedition={settingsExpedition}
          player={settingsPlayer}
          onClose={() => setSettingsTarget(null)}
          onSyncRoster={onSyncRoster}
          onUpdateExpedition={onUpdateExpedition}
        />
      ) : null}
    </section>
  );
}

function ExpeditionBlock({
  player,
  expedition,
  raidWeek,
  isEditingName,
  isSyncing,
  nameDraft,
  onRestoreCharacter,
  onRemoveCharacter,
  onRemoveExpedition,
  onSetRole,
  onSetGoldPreference,
  onSetCompletion,
  onOpenSettings,
  onChangeNameDraft,
  onStartEditName,
  onStopEditName,
  onSyncRoster,
  onToggleRaid,
}: {
  player: Player;
  expedition: Expedition;
  raidWeek: string;
  isEditingName: boolean;
  isSyncing: boolean;
  nameDraft: string;
  onRestoreCharacter: (
    playerId: string,
    expeditionId: string,
    characterName: string,
  ) => void;
  onRemoveCharacter: (
    playerId: string,
    expeditionId: string,
    characterId: string,
  ) => void;
  onRemoveExpedition: (playerId: string, expeditionId: string) => void;
  onSetRole: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    role: Role,
  ) => void;
  onSetGoldPreference: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    preference: GoldPreference,
  ) => void;
  onSetCompletion: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    raidName: string,
    completed: boolean,
  ) => void;
  onOpenSettings: () => void;
  onChangeNameDraft: (value: string) => void;
  onStartEditName: () => void;
  onStopEditName: (value: string) => void;
  onSyncRoster: (playerId: string, expeditionId: string) => void;
  onToggleRaid: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    raidName: string,
    checked: boolean,
  ) => void;
}) {
  const [restoreOpen, setRestoreOpen] = useState(false);
  const restorableCharacters = getRestorableCharacters(expedition);
  const goldProgress = getExpeditionTradableGoldProgress(expedition, raidWeek);

  return (
    <section className="expedition-block">
      <div className="expedition-head">
        <div>
          <div className="expedition-title-line">
            {isEditingName ? (
              <input
                aria-label="원정대 별칭"
                autoFocus
                className="expedition-name-input"
                value={nameDraft}
                onBlur={(event) => onStopEditName(event.currentTarget.value)}
                onChange={(event) => onChangeNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") {
                    event.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <span className="expedition-name-text">{expedition.name}</span>
            )}
            <button
              className="icon-button edit-icon-button"
              type="button"
              aria-label="원정대 별칭 수정"
              onClick={onStartEditName}
            >
              <CoolIcon name="edit" />
            </button>
          </div>
          <div className="expedition-meta">
            <span>{expedition.serverName || "서버 미지정"}</span>
            <span aria-hidden="true">·</span>
            <span>대표 {expedition.representativeName || "대표 캐릭터 없음"}</span>
            <span>· 캐릭터 {expedition.characters.length}명</span>
            {expedition.lastSyncedAt ? (
              <span>· 마지막 동기화 {formatDateTime(expedition.lastSyncedAt)}</span>
            ) : null}
          </div>
          <div className="expedition-gold-progress">
            <GoldIcon />
            <strong>{goldProgress.earned.toLocaleString("ko-KR")}G</strong>
            <span>/ {goldProgress.available.toLocaleString("ko-KR")}G</span>
          </div>
        </div>
        <div className="expedition-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => onSyncRoster(player.id, expedition.id)}
            disabled={isSyncing}
          >
            <CoolIcon name="refresh" /> {isSyncing ? "동기화 중" : "동기화"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={onOpenSettings}
          >
            <CoolIcon name="settings" /> 원정대 설정
          </button>
          <button
            className="danger-text-button"
            type="button"
            onClick={() => onRemoveExpedition(player.id, expedition.id)}
          >
            <CoolIcon name="trash" /> 삭제
          </button>
        </div>
      </div>

      <div
        className={`expedition-collapsible ${expedition.charactersHidden ? "collapsed" : "expanded"}`}
        aria-hidden={expedition.charactersHidden}
      >
        <div className="integrated-character-grid">
          {expedition.characters.map((character) => (
            <IntegratedCharacterCard
              character={character}
              expedition={expedition}
              key={character.id}
              player={player}
              raidWeek={raidWeek}
              onRemoveCharacter={onRemoveCharacter}
              onSetRole={onSetRole}
              onSetGoldPreference={onSetGoldPreference}
              onSetCompletion={onSetCompletion}
              onToggleRaid={onToggleRaid}
            />
          ))}
          <div className="restore-character-control">
            <button
              className="add-raid-button"
              type="button"
              onClick={() => setRestoreOpen((current) => !current)}
              disabled={!restorableCharacters.length}
            >
              <CoolIcon name="add" /> 캐릭터 추가
            </button>
            {restoreOpen ? (
              <div className="restore-character-menu">
                {restorableCharacters.map((character) => (
                  <button
                    key={character.name}
                    type="button"
                    onClick={() => {
                      onRestoreCharacter(player.id, expedition.id, character.name);
                      setRestoreOpen(false);
                    }}
                  >
                    <strong>{character.name}</strong>
                    {character.className ? <span>{character.className}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ExpeditionSettingsModal({
  player,
  expedition,
  onClose,
  onSyncRoster,
  onUpdateExpedition,
}: {
  player: Player;
  expedition: Expedition;
  onClose: () => void;
  onSyncRoster: (playerId: string, expeditionId: string) => void;
  onUpdateExpedition: (
    playerId: string,
    expeditionId: string,
    patch: Partial<Expedition>,
  ) => void;
}) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onClose();
    onSyncRoster(player.id, expedition.id);
  };

  return (
    <div className="settings-modal-backdrop">
      <form
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expedition-settings-title"
        onSubmit={handleSubmit}
      >
        <div className="settings-modal-head">
          <div>
            <h2 id="expedition-settings-title">원정대 설정</h2>
            <p>{expedition.name}</p>
          </div>
          <button
            className="settings-close-button"
            type="button"
            aria-label="설정 닫기"
            onClick={onClose}
          >
            <CoolIcon name="close" />
          </button>
        </div>

        <label className="settings-field">
          <span>대표 캐릭터</span>
          <input
            className="settings-input"
            value={expedition.representativeName}
            placeholder="대표 캐릭터명 입력"
            onChange={(event) =>
              onUpdateExpedition(player.id, expedition.id, {
                representativeName: event.target.value,
              })
            }
          />
        </label>

        <div className="settings-toggle-row">
          <div>
            <strong>원정대 숨김</strong>
            <span>
              {expedition.charactersHidden
                ? "캐릭터 목록을 숨기는 중"
                : "캐릭터 목록을 표시하는 중"}
            </span>
          </div>
          <button
            className={`settings-switch ${expedition.charactersHidden ? "on" : ""}`}
            type="button"
            aria-pressed={expedition.charactersHidden}
            onClick={() =>
              onUpdateExpedition(player.id, expedition.id, {
                charactersHidden: !expedition.charactersHidden,
              })
            }
          >
            <span />
          </button>
        </div>

        <div className="settings-modal-actions">
          <button
            className="dark-button"
            type="submit"
          >
            완료
          </button>
        </div>
      </form>
    </div>
  );
}

type GoldTotals = {
  total: number;
  tradable: number;
  bound: number;
};

const EMPTY_GOLD_TOTALS: GoldTotals = { total: 0, tradable: 0, bound: 0 };

function getCharacterRecommendedGold(
  character: Character,
  raidWeek: string,
  completedOnly: boolean,
) {
  return getGoldRecommendedRaidNames(
    character.selectedRaids,
    character.goldPreference,
  ).reduce<GoldTotals>((totals, raidName) => {
    if (completedOnly && character.raidCompletions[raidName] !== raidWeek) {
      return totals;
    }
    const raid = getRaidDefinition(raidName);
    if (!raid) return totals;
    return {
      total: totals.total + raid.gold,
      tradable: totals.tradable + raid.tradableGold,
      bound: totals.bound + raid.boundGold,
    };
  }, { ...EMPTY_GOLD_TOTALS });
}

function getExpeditionTradableGoldProgress(
  expedition: Expedition,
  raidWeek: string,
) {
  return expedition.characters.reduce(
    (progress, character) => {
      const available = getCharacterRecommendedGold(character, raidWeek, false);
      const earned = getCharacterRecommendedGold(character, raidWeek, true);
      progress.available += available.tradable;
      progress.earned += earned.tradable;
      return progress;
    },
    { earned: 0, available: 0 },
  );
}

function GoldBreakdown({ totals }: { totals: GoldTotals }) {
  return (
    <span className="gold-breakdown">
      <GoldIcon />
      <strong>{totals.total.toLocaleString("ko-KR")}G</strong>
      <span>
        ({totals.tradable.toLocaleString("ko-KR")} + {totals.bound.toLocaleString("ko-KR")})
      </span>
    </span>
  );
}

function CompactRaidSelector({
  player,
  expedition,
  character,
  onToggleRaid,
}: {
  player: Player;
  expedition: Expedition;
  character: Character;
  onToggleRaid: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    raidName: string,
    checked: boolean,
  ) => void;
}) {
  return (
    <div className="compact-raid-selector">
      {RAID_FAMILIES.map((family) => {
        const raids = RAID_DEFINITIONS.filter((raid) => raid.family === family.id);
        if (!raids.some((raid) => character.itemLevel >= raid.minItemLevel)) return null;
        return (
          <div className="compact-raid-family" key={family.id}>
            <span>{family.label}</span>
            <div className="difficulty-buttons">
              {raids.map((raid) => {
                const selected = character.selectedRaids.includes(raid.name);
                const locked = character.itemLevel < raid.minItemLevel;
                return (
                  <button
                    className={selected ? "selected" : ""}
                    key={raid.name}
                    type="button"
                    disabled={locked}
                    title={locked ? `입장 레벨 ${raid.minItemLevel} 필요` : undefined}
                    onClick={() =>
                      onToggleRaid(
                        player.id,
                        expedition.id,
                        character.id,
                        raid.name,
                        !selected,
                      )
                    }
                  >
                    {raid.variant}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IntegratedCharacterCard({
  player,
  expedition,
  character,
  raidWeek,
  onRemoveCharacter,
  onSetRole,
  onSetGoldPreference,
  onSetCompletion,
  onToggleRaid,
}: {
  player: Player;
  expedition: Expedition;
  character: Character;
  raidWeek: string;
  onRemoveCharacter: (
    playerId: string,
    expeditionId: string,
    characterId: string,
  ) => void;
  onSetRole: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    role: Role,
  ) => void;
  onSetGoldPreference: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    preference: GoldPreference,
  ) => void;
  onSetCompletion: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    raidName: string,
    completed: boolean,
  ) => void;
  onToggleRaid: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    raidName: string,
    checked: boolean,
  ) => void;
}) {
  const [editingRaids, setEditingRaids] = useState(false);
  const supportCapable = isSupportClass(character.className);
  const recommendedRaids = new Set(
    getGoldRecommendedRaidNames(character.selectedRaids, character.goldPreference),
  );
  const completedGold = getCharacterRecommendedGold(character, raidWeek, true);

  return (
    <article className="integrated-character-card">
      <header className="integrated-character-head">
        <div className="integrated-character-identity">
          <div className="integrated-character-name-row">
            <CoolIcon name={character.role === "support" ? "support" : "dealer"} />
            <strong>{character.name || "캐릭터명"}</strong>
          </div>
          <div className="integrated-character-badge-row">
            <span className="class-pill-text">{character.className || "직업 없음"}</span>
            {supportCapable ? (
              <button
                className={`single-role-button ${character.role === "support" ? "support-option" : "dealer-option"}`}
                type="button"
                onClick={() =>
                  onSetRole(
                    player.id,
                    expedition.id,
                    character.id,
                    character.role === "support" ? "dealer" : "support",
                  )
                }
              >
                {character.role === "support" ? "서폿" : "딜러"}
              </button>
            ) : null}
          </div>
        </div>
        <button
          className="integrated-character-delete"
          type="button"
          aria-label={`${character.name || "캐릭터"} 삭제`}
          onClick={() => onRemoveCharacter(player.id, expedition.id, character.id)}
        >
          <CoolIcon name="trash" />
        </button>
      </header>

      <div className="integrated-character-meta">
        <span>레벨 {formatItemLevel(character.itemLevel)}</span>
        <span>·</span>
        <span className={character.role === "support" ? "power-text support" : "power-text dealer"}>
          전투력 {character.combatPower.toLocaleString("ko-KR")}
        </span>
      </div>
      <GoldBreakdown totals={completedGold} />

      <div className="integrated-character-divider" />
      <div className="integrated-raid-list">
        {character.selectedRaids.length ? (
          character.selectedRaids.map((raidName) => {
            const raid = getRaidDefinition(raidName);
            if (!raid) return null;
            const completed = character.raidCompletions[raidName] === raidWeek;
            const recommended = recommendedRaids.has(raidName);
            return (
              <label
                className={`integrated-raid-card${completed ? " completed" : ""}${recommended ? " recommended" : ""}`}
                key={raidName}
              >
                <span className="integrated-raid-copy">
                  <strong>{raidName}</strong>
                  <GoldBreakdown
                    totals={{
                      total: raid.gold,
                      tradable: raid.tradableGold,
                      bound: raid.boundGold,
                    }}
                  />
                </span>
                <input
                  type="checkbox"
                  checked={completed}
                  onChange={(event) =>
                    onSetCompletion(
                      player.id,
                      expedition.id,
                      character.id,
                      raidName,
                      event.target.checked,
                    )
                  }
                  aria-label={`${character.name} ${raidName} 완료`}
                />
              </label>
            );
          })
        ) : (
          <p className="integrated-raid-empty">선택된 레이드가 없습니다.</p>
        )}
      </div>

      {editingRaids ? (
        <CompactRaidSelector
          player={player}
          expedition={expedition}
          character={character}
          onToggleRaid={onToggleRaid}
        />
      ) : null}

      <footer className="integrated-character-footer">
        <button
          className="square-add-button"
          type="button"
          aria-expanded={editingRaids}
          aria-label={editingRaids ? "레이드 편집 닫기" : "레이드 추가"}
          onClick={() => setEditingRaids((current) => !current)}
        >
          <CoolIcon name={editingRaids ? "close" : "add"} />
        </button>
        <span className="gold-preference-control" aria-label="골드 추천 기준">
          <button
            type="button"
            className={`gold-preference-label${character.goldPreference === "bound" ? " active" : ""}`}
            aria-pressed={character.goldPreference === "bound"}
            onClick={() => onSetGoldPreference(player.id, expedition.id, character.id, "bound")}
          >
            귀속
          </button>
          <button
            type="button"
            className={`gold-preference-switch${character.goldPreference === "tradable" ? " on" : ""}`}
            aria-label={`골드 추천 기준을 ${character.goldPreference === "tradable" ? "귀속" : "유통"} 골드로 변경`}
            aria-pressed={character.goldPreference === "tradable"}
            onClick={() =>
              onSetGoldPreference(
                player.id,
                expedition.id,
                character.id,
                character.goldPreference === "tradable" ? "bound" : "tradable",
              )
            }
          >
            <span />
          </button>
          <button
            type="button"
            className={`gold-preference-label${character.goldPreference === "tradable" ? " active" : ""}`}
            aria-pressed={character.goldPreference === "tradable"}
            onClick={() => onSetGoldPreference(player.id, expedition.id, character.id, "tradable")}
          >
            유통
          </button>
        </span>
      </footer>
    </article>
  );
}

// Kept temporarily for legacy persisted views during the integrated UI migration.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CharacterRow({
  player,
  expedition,
  character,
  expanded,
  onRemoveCharacter,
  onSetRole,
  onToggleCharacter,
  onToggleRaid,
}: {
  player: Player;
  expedition: Expedition;
  character: Character;
  expanded: boolean;
  onRemoveCharacter: (
    playerId: string,
    expeditionId: string,
    characterId: string,
  ) => void;
  onSetRole: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    role: Role,
  ) => void;
  onToggleCharacter: (characterId: string) => void;
  onToggleRaid: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    raidName: string,
    checked: boolean,
  ) => void;
}) {
  const supportCapable = isSupportClass(character.className);

  return (
    <div className="character-row-card">
      <div
        className="character-row-summary"
        role="button"
        tabIndex={0}
        onClick={() => onToggleCharacter(character.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggleCharacter(character.id);
          }
        }}
      >
        <CoolIcon
          name={character.role === "support" ? "support" : "dealer"}
          className="role-icon"
        />
        <div className="character-title-cell">
          <span className="character-name-text">{character.name || "캐릭터명"}</span>
        </div>
        <span className="class-pill-text">{character.className || "직업 없음"}</span>
        {supportCapable ? (
          <span className="role-toggle-group">
            <button
              className={character.role === "support" ? "active support-option" : "support-option"}
              type="button"
              onKeyDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onSetRole(player.id, expedition.id, character.id, "support");
              }}
            >
              서폿
            </button>
            <button
              className={character.role === "dealer" ? "active dealer-option" : "dealer-option"}
              type="button"
              onKeyDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onSetRole(player.id, expedition.id, character.id, "dealer");
              }}
            >
              딜러
            </button>
          </span>
        ) : (
          <span className="role-toggle-placeholder" aria-hidden="true" />
        )}
        <div className="character-metrics">
          <span className="level-inline">레벨 {formatItemLevel(character.itemLevel)}</span>
          <span
            className={
              character.role === "support" ? "power-text support" : "power-text dealer"
            }
          >
            전투력 {character.combatPower.toLocaleString("ko-KR")}
          </span>
        </div>
        <button
          className="inline-remove-button"
          type="button"
          aria-label={`${character.name || "캐릭터"} 삭제`}
          onClick={(event) => {
            event.stopPropagation();
            onRemoveCharacter(player.id, expedition.id, character.id);
          }}
        >
          <CoolIcon name="close" />
        </button>
        <button
          className="fold-button"
          type="button"
          aria-label={expanded ? "캐릭터 접기" : "캐릭터 펼치기"}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCharacter(character.id);
          }}
        >
          <CoolIcon
            name="chevron"
            className={`fold-icon ${expanded ? "expanded" : ""}`}
          />
        </button>
      </div>

      <div
        className={`character-detail-panel ${expanded ? "expanded" : "collapsed"}`}
        aria-hidden={!expanded}
      >
        <RaidFamilySelector
          character={character}
          expedition={expedition}
          player={player}
          onToggleRaid={onToggleRaid}
        />
      </div>
    </div>
  );
}

function RaidFamilySelector({
  player,
  expedition,
  character,
  onToggleRaid,
}: {
  player: Player;
  expedition: Expedition;
  character: Character;
  onToggleRaid: (
    playerId: string,
    expeditionId: string,
    characterId: string,
    raidName: string,
    checked: boolean,
  ) => void;
}) {
  const [addingRaid, setAddingRaid] = useState(false);
  const selectedFamilies = RAID_FAMILIES.map((family) => {
    const raids = RAID_DEFINITIONS.filter((raid) => raid.family === family.id);
    const selected = raids.find((raid) =>
      character.selectedRaids.includes(raid.name),
    );
    return { family, raids, selected };
  }).filter((entry) => entry.selected);
  const hiddenFamilies = RAID_FAMILIES.map((family) => {
    const raids = RAID_DEFINITIONS.filter((raid) => raid.family === family.id);
    const selected = raids.find((raid) =>
      character.selectedRaids.includes(raid.name),
    );
    return { family, raids, selected };
  }).filter((entry) => !entry.selected);
  const hasEligibleHiddenRaid = hiddenFamilies.some(({ raids }) =>
    raids.some((raid) => character.itemLevel >= raid.minItemLevel),
  );

  const toggleSelectedRaid = (raidName: string, checked: boolean) => {
    onToggleRaid(player.id, expedition.id, character.id, raidName, checked);
  };

  return (
    <div className="raid-family-list">
      {selectedFamilies.map(({ family, raids, selected }) => {
        return (
          <div className="raid-family-row" key={family.id}>
            <div className="raid-family-label">
              <span>{family.label}</span>
              {selected ? <small>{selected.gold.toLocaleString("ko-KR")}G</small> : null}
            </div>
            <div className="difficulty-buttons">
              {raids.map((raid) => {
                const locked = character.itemLevel < raid.minItemLevel;
                return (
                  <button
                    className={
                      character.selectedRaids.includes(raid.name) ? "selected" : ""
                    }
                    key={raid.name}
                    type="button"
                    disabled={locked}
                    title={locked ? `입장 레벨 ${raid.minItemLevel} 필요` : undefined}
                    onClick={() =>
                      toggleSelectedRaid(
                        raid.name,
                        !character.selectedRaids.includes(raid.name),
                      )
                    }
                  >
                    {raid.variant}
                  </button>
                );
              })}
            </div>
            {selected ? (
              <button
                className="remove-raid-button"
                type="button"
                onClick={() =>
                  toggleSelectedRaid(selected.name, false)
                }
                aria-label={`${family.label} 레이드 삭제`}
              >
                <CoolIcon name="close" />
              </button>
            ) : null}
          </div>
        );
      })}
      {addingRaid ? (
        <div className="raid-add-panel">
          {hiddenFamilies.length ? (
            hiddenFamilies.map(({ family, raids }) => (
              <div className="raid-add-row" key={family.id}>
                <span className="raid-add-label">{family.label}</span>
                <div className="difficulty-buttons add-mode">
                  {raids.map((raid) => {
                    const locked = character.itemLevel < raid.minItemLevel;
                    return (
                      <button
                        key={raid.name}
                        type="button"
                        disabled={locked}
                        title={locked ? `입장 레벨 ${raid.minItemLevel} 필요` : undefined}
                        onClick={() => {
                          toggleSelectedRaid(raid.name, true);
                          setAddingRaid(false);
                        }}
                      >
                        {raid.variant}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <span className="raid-add-empty">추가할 수 있는 레이드가 없습니다.</span>
          )}
        </div>
      ) : null}
      <button
        className="add-raid-button raid-add-button"
        type="button"
        onClick={() => setAddingRaid((current) => !current)}
        disabled={!hasEligibleHiddenRaid}
      >
        <CoolIcon name="add" /> 레이드 추가
      </button>
    </div>
  );
}

function ResultPanel({
  plan,
  players,
  stale,
  onGenerate,
}: {
  plan: RaidPlanResult | null;
  players: Player[];
  stale: boolean;
  onGenerate: () => void;
}) {
  const rows = useMemo(() => buildResultRows(plan), [plan]);

  return (
    <section className="result-shell">
      <div className="result-heading">
        <div>
          <h2>파티 구성</h2>
          <p>공석은 숨기고 내부 멤버만 표시합니다.</p>
        </div>
        <button className="dark-button" type="button" onClick={onGenerate}>
          레이드 자동구성
        </button>
      </div>

      {stale ? (
        <div className="warning-bar">입력이 변경되었습니다. 다시 자동구성하세요.</div>
      ) : null}

      {plan?.warnings.length ? (
        <div className="error-list">
          {plan.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {!plan ? (
        <div className="empty-state">아직 생성된 공격대가 없습니다.</div>
      ) : rows.length ? (
        <div className="result-table-wrap">
          <table className="result-table">
            <thead>
              <tr>
                <th className="raid-name-col">레이드</th>
                {players.map((player) => (
                  <th key={player.id}>{player.name}</th>
                ))}
                <th className="summary-col">요약</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ResultRow key={row.id} players={players} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">선택된 레이드가 없습니다.</div>
      )}
    </section>
  );
}

type ResultRowModel = {
  id: string;
  raidName: string;
  groupIndex: number;
  group: RaidGroup;
  membersByPlayer: Map<string, RaidGroup["members"][number]>;
};

function buildResultRows(plan: RaidPlanResult | null): ResultRowModel[] {
  if (!plan) {
    return [];
  }

  return Object.entries(plan.groupsByRaid).flatMap(([raidName, groups]) =>
    groups.map((group, index) => ({
      id: group.id,
      raidName,
      groupIndex: index + 1,
      group,
      membersByPlayer: new Map(
        group.members.map((member) => [member.playerId, member]),
      ),
    })),
  );
}

function ResultRow({
  row,
  players,
}: {
  row: ResultRowModel;
  players: Player[];
}) {
  const dealerCount = row.group.members.filter(
    (member) => member.role === "dealer",
  ).length;
  const supportCount = row.group.members.filter(
    (member) => member.role === "support",
  ).length;

  return (
    <tr>
      <th className="raid-name-col">
        <span>{row.raidName}</span>
        <small>{row.groupIndex}공대</small>
      </th>
      {players.map((player) => {
        const member = row.membersByPlayer.get(player.id);
        return (
          <td key={player.id}>
            {member ? (
              <div
                className={
                  member.role === "support"
                    ? "assigned-cell support"
                    : "assigned-cell dealer"
                }
              >
                <strong>{member.className}</strong>
                <span>{member.characterName}</span>
              </div>
            ) : null}
          </td>
        );
      })}
      <td className="summary-col">
        <strong>딜러 {dealerCount}/{row.group.dealerSlots}</strong>
        <span>서폿 {supportCount}/{row.group.supportSlots}</span>
      </td>
    </tr>
  );
}

const getRestorableCharacters = (expedition: Expedition) => {
  const seenNames = new Set<string>();
  const characters: Array<Pick<Character, "name" | "className">> = [];

  expedition.deletedCharacters.forEach((character) => {
    const name = character.name.trim();
    if (!name || seenNames.has(name)) {
      return;
    }
    seenNames.add(name);
    characters.push({ name, className: character.className });
  });

  expedition.deletedCharacterNames.forEach((rawName) => {
    const name = rawName.trim();
    if (!name || seenNames.has(name)) {
      return;
    }
    seenNames.add(name);
    characters.push({ name, className: "" });
  });

  return characters;
};

const isSupportClass = (className: string) => {
  const normalized = className.trim().toLowerCase();
  return SUPPORT_CLASS_NAMES.some((supportClass) =>
    normalized.includes(supportClass.toLowerCase()),
  );
};

const formatItemLevel = (itemLevel: number) =>
  itemLevel.toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatRaidWeek = (week: string) => {
  const [year, month, day] = week.split("-").map(Number);
  if (!year || !month || !day) return "이번";
  return `${month}월 ${day}일 시작`;
};

const formatDateTime = (isoValue: string) => {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};
