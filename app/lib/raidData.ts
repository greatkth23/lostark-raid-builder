import {
  getAutoRaidsForLevel,
  getExclusiveRaidNames,
  getRaidDefinition,
  type GoldPreference,
  type Role,
} from "./raidPlanner";
import type { ManualPartyLayout } from "./partyTypes";

export type Character = {
  id: string;
  name: string;
  serverName: string;
  itemLevel: number;
  combatPower: number;
  className: string;
  role: Role;
  goldPreference: GoldPreference;
  selectedRaids: string[];
  raidCompletions: Record<string, string>;
  raidsEdited: boolean;
  roleEdited: boolean;
};

export type Expedition = {
  id: string;
  name: string;
  representativeName: string;
  serverName: string;
  lastSyncedAt: string;
  charactersHidden: boolean;
  deletedCharacterNames: string[];
  deletedCharacters: Character[];
  characters: Character[];
};

export type Player = {
  id: string;
  name: string;
  expeditions: Expedition[];
};

export type RaidGroupRoom = {
  id: string;
  name: string;
  revision: number;
};

export type RaidGroupOperation =
  | { type: "player.add"; player: Player }
  | { type: "player.update"; playerId: string; name: string }
  | { type: "player.remove"; playerId: string }
  | { type: "expedition.add"; playerId: string; expedition: Expedition }
  | {
      type: "expedition.update";
      playerId: string;
      expeditionId: string;
      patch: Partial<
        Pick<
          Expedition,
          | "name"
          | "representativeName"
          | "serverName"
          | "lastSyncedAt"
          | "charactersHidden"
        >
      >;
    }
  | { type: "expedition.remove"; playerId: string; expeditionId: string }
  | {
      type: "expedition.replace";
      playerId: string;
      expedition: Expedition;
    }
  | {
      type: "expedition.replaceMany";
      replacements: Array<{ playerId: string; expedition: Expedition }>;
      partyLayout?: ManualPartyLayout;
    }
  | {
      type: "character.remove";
      playerId: string;
      expeditionId: string;
      characterId: string;
    }
  | {
      type: "character.restore";
      playerId: string;
      expeditionId: string;
      characterName: string;
    }
  | {
      type: "character.role";
      playerId: string;
      expeditionId: string;
      characterId: string;
      role: Role;
    }
  | {
      type: "character.goldPreference";
      playerId: string;
      expeditionId: string;
      characterId: string;
      preference: GoldPreference;
    }
  | {
      type: "character.raid";
      playerId: string;
      expeditionId: string;
      characterId: string;
      raidName: string;
      checked: boolean;
    }
  | { type: "raids.reset" }
  | {
      type: "completion.set";
      playerId: string;
      expeditionId: string;
      characterId: string;
      raidName: string;
      completed: boolean;
    }
  | {
      type: "completion.batch";
      targets: Array<{
        playerId: string;
        expeditionId: string;
        characterId: string;
        raidName: string;
      }>;
      completed: boolean;
    }
  | {
      type: "party.layout.set";
      partyLayout: ManualPartyLayout;
      raidChanges?: Array<{
        playerId: string;
        expeditionId: string;
        characterId: string;
        raidName: string;
        checked: boolean;
      }>;
    }
  | { type: "completion.reset" };

export const createId = () => crypto.randomUUID();

export const createCharacter = (): Character => ({
  id: createId(),
  name: "",
  serverName: "",
  itemLevel: 1710,
  combatPower: 0,
  className: "",
  role: "dealer",
  goldPreference: "tradable",
  selectedRaids: getAutoRaidsForLevel(1710),
  raidCompletions: {},
  raidsEdited: false,
  roleEdited: false,
});

export const createExpedition = (index: number): Expedition => ({
  id: createId(),
  name: `원정대 ${index}`,
  representativeName: "",
  serverName: "",
  lastSyncedAt: "",
  charactersHidden: false,
  deletedCharacterNames: [],
  deletedCharacters: [],
  characters: [],
});

export const createPlayer = (index: number): Player => ({
  id: createId(),
  name: `플레이어 ${index}`,
  expeditions: [createExpedition(1)],
});

export const normalizePlayers = (value: unknown): Player[] | null => {
  if (!Array.isArray(value)) return null;

  return value
    .slice(0, 100)
    .map((player, playerIndex) => normalizePlayer(player, playerIndex))
    .filter((player): player is Player => Boolean(player));
};

export const normalizePlayer = (
  value: unknown,
  playerIndex: number,
): Player | null => {
  if (!value || typeof value !== "object") return null;

  const source = value as Partial<
    Player & {
      representativeName: string;
      serverName: string;
      lastSyncedAt: string;
      characters: Character[];
    }
  >;
  const expeditions = Array.isArray(source.expeditions)
    ? source.expeditions
        .slice(0, 20)
        .map((expedition, expeditionIndex) =>
          normalizeExpedition(expedition, expeditionIndex),
        )
        .filter((expedition): expedition is Expedition => Boolean(expedition))
    : [
        normalizeExpedition(
          {
            id: source.id,
            name: "원정대 1",
            representativeName: source.representativeName,
            serverName: source.serverName,
            lastSyncedAt: source.lastSyncedAt,
            characters: source.characters,
          },
          0,
        ),
      ].filter((expedition): expedition is Expedition => Boolean(expedition));

  return {
    id: typeof source.id === "string" ? source.id : createId(),
    name:
      typeof source.name === "string" && source.name.trim()
        ? source.name.slice(0, 80)
        : `플레이어 ${playerIndex + 1}`,
    expeditions: expeditions.length ? expeditions : [createExpedition(1)],
  };
};

export const normalizeExpedition = (
  value: unknown,
  expeditionIndex: number,
): Expedition | null => {
  if (!value || typeof value !== "object") return null;

  const source = value as Partial<Expedition>;
  const characters = Array.isArray(source.characters)
    ? source.characters
        .slice(0, 100)
        .map(normalizeCharacter)
        .filter((character): character is Character => Boolean(character))
    : [];
  const deletedCharacterNames = Array.isArray(source.deletedCharacterNames)
    ? source.deletedCharacterNames
        .filter(
          (name): name is string => typeof name === "string" && Boolean(name.trim()),
        )
        .slice(0, 100)
    : [];
  const deletedCharacters = Array.isArray(source.deletedCharacters)
    ? source.deletedCharacters
        .slice(0, 100)
        .map(normalizeCharacter)
        .filter((character): character is Character => Boolean(character))
    : [];

  return {
    id: typeof source.id === "string" ? source.id : createId(),
    name:
      typeof source.name === "string" && source.name.trim()
        ? source.name.slice(0, 80)
        : `원정대 ${expeditionIndex + 1}`,
    representativeName:
      typeof source.representativeName === "string"
        ? source.representativeName.slice(0, 80)
        : "",
    serverName:
      typeof source.serverName === "string" ? source.serverName.slice(0, 80) : "",
    lastSyncedAt:
      typeof source.lastSyncedAt === "string" ? source.lastSyncedAt : "",
    charactersHidden: Boolean(source.charactersHidden),
    deletedCharacterNames,
    deletedCharacters,
    characters,
  };
};

export const normalizeCharacter = (value: unknown): Character | null => {
  if (!value || typeof value !== "object") return null;

  const source = value as Partial<Character>;
  const itemLevel = Number(source.itemLevel) || 0;
  const selectedRaids = Array.isArray(source.selectedRaids)
    ? makeExclusiveRaids(
        source.selectedRaids.filter(
          (raid): raid is string => typeof raid === "string",
        ),
        itemLevel,
      )
    : getAutoRaidsForLevel(itemLevel);
  const raidCompletions =
    source.raidCompletions && typeof source.raidCompletions === "object"
      ? Object.fromEntries(
          Object.entries(source.raidCompletions).filter(
            ([raidName, week]) =>
              typeof raidName === "string" &&
              typeof week === "string" &&
              selectedRaids.includes(raidName),
          ),
        )
      : {};

  return {
    id: typeof source.id === "string" ? source.id : createId(),
    name: typeof source.name === "string" ? source.name.slice(0, 80) : "",
    serverName:
      typeof source.serverName === "string" ? source.serverName.slice(0, 80) : "",
    itemLevel,
    combatPower: Number(source.combatPower) || 0,
    className:
      typeof source.className === "string" ? source.className.slice(0, 80) : "",
    role: source.role === "support" ? "support" : "dealer",
    goldPreference: source.goldPreference === "bound" ? "bound" : "tradable",
    selectedRaids,
    raidCompletions,
    raidsEdited: Boolean(source.raidsEdited),
    roleEdited: Boolean(source.roleEdited),
  };
};

export const applyRaidGroupOperation = (
  currentPlayers: Player[],
  operation: RaidGroupOperation,
  raidWeek: string,
): Player[] => {
  let players = structuredClone(currentPlayers);

  switch (operation.type) {
    case "player.add": {
      const player = normalizePlayer(operation.player, players.length);
      if (player && !players.some((candidate) => candidate.id === player.id)) {
        players.push(player);
      }
      break;
    }
    case "player.update":
      players = players.map((player) =>
        player.id === operation.playerId
          ? { ...player, name: operation.name.slice(0, 80) }
          : player,
      );
      break;
    case "player.remove":
      players = players.filter((player) => player.id !== operation.playerId);
      break;
    case "expedition.add":
      players = players.map((player) => {
        if (player.id !== operation.playerId) return player;
        const expedition = normalizeExpedition(
          operation.expedition,
          player.expeditions.length,
        );
        return expedition &&
          !player.expeditions.some((candidate) => candidate.id === expedition.id)
          ? { ...player, expeditions: [...player.expeditions, expedition] }
          : player;
      });
      break;
    case "expedition.update":
      players = mapExpedition(players, operation.playerId, operation.expeditionId, (expedition) => ({
        ...expedition,
        ...sanitizeExpeditionPatch(operation.patch),
      }));
      break;
    case "expedition.remove":
      players = players.map((player) =>
        player.id === operation.playerId
          ? {
              ...player,
              expeditions: player.expeditions.filter(
                (expedition) => expedition.id !== operation.expeditionId,
              ),
            }
          : player,
      );
      break;
    case "expedition.replace":
      players = players.map((player) =>
        player.id === operation.playerId
          ? {
              ...player,
              expeditions: player.expeditions.map((expedition, index) =>
                expedition.id === operation.expedition.id
                  ? normalizeExpedition(operation.expedition, index) ?? expedition
                  : expedition,
              ),
            }
          : player,
      );
      break;
    case "expedition.replaceMany":
      operation.replacements.forEach((replacement) => {
        players = applyRaidGroupOperation(
          players,
          {
            type: "expedition.replace",
            playerId: replacement.playerId,
            expedition: replacement.expedition,
          },
          raidWeek,
        );
      });
      break;
    case "character.remove":
      players = mapExpedition(players, operation.playerId, operation.expeditionId, (expedition) => {
        const removed = expedition.characters.find(
          (character) => character.id === operation.characterId,
        );
        if (!removed) return expedition;
        const name = removed.name.trim();
        return {
          ...expedition,
          characters: expedition.characters.filter(
            (character) => character.id !== operation.characterId,
          ),
          deletedCharacterNames: name
            ? Array.from(new Set([...expedition.deletedCharacterNames, name]))
            : expedition.deletedCharacterNames,
          deletedCharacters: name
            ? [
                ...expedition.deletedCharacters.filter(
                  (character) => character.name.trim() !== name,
                ),
                removed,
              ]
            : expedition.deletedCharacters,
        };
      });
      break;
    case "character.restore":
      players = mapExpedition(players, operation.playerId, operation.expeditionId, (expedition) => {
        const name = operation.characterName.trim();
        if (!name) return expedition;
        const restored =
          expedition.deletedCharacters.find(
            (character) => character.name.trim() === name,
          ) ?? { ...createCharacter(), name };
        return {
          ...expedition,
          deletedCharacterNames: expedition.deletedCharacterNames.filter(
            (candidate) => candidate.trim() !== name,
          ),
          deletedCharacters: expedition.deletedCharacters.filter(
            (character) => character.name.trim() !== name,
          ),
          characters: expedition.characters.some(
            (character) => character.name.trim() === name,
          )
            ? expedition.characters
            : [...expedition.characters, restored],
        };
      });
      break;
    case "character.role":
      players = mapCharacter(players, operation, (character) => ({
        ...character,
        role: operation.role === "support" ? "support" : "dealer",
        roleEdited: true,
      }));
      break;
    case "character.goldPreference":
      players = mapCharacter(players, operation, (character) => ({
        ...character,
        goldPreference:
          operation.preference === "bound" ? "bound" : "tradable",
      }));
      break;
    case "character.raid":
      players = mapCharacter(players, operation, (character) => {
        const raid = getRaidDefinition(operation.raidName);
        if (
          operation.checked &&
          (!raid || character.itemLevel < raid.minItemLevel)
        ) {
          return character;
        }
        const blockedRaids = getExclusiveRaidNames(operation.raidName);
        const selectedRaids = operation.checked
          ? [
              ...character.selectedRaids.filter(
                (raid) =>
                  !blockedRaids.includes(raid) && raid !== operation.raidName,
              ),
              operation.raidName,
            ]
          : character.selectedRaids.filter((raid) => raid !== operation.raidName);
        const raidCompletions = { ...character.raidCompletions };
        if (!operation.checked) delete raidCompletions[operation.raidName];
        blockedRaids.forEach((raid) => delete raidCompletions[raid]);
        return { ...character, selectedRaids, raidCompletions, raidsEdited: true };
      });
      break;
    case "raids.reset":
      players = players.map((player) => ({
        ...player,
        expeditions: player.expeditions.map((expedition) => ({
          ...expedition,
          characters: expedition.characters.map((character) => ({
            ...character,
            selectedRaids: getAutoRaidsForLevel(character.itemLevel),
            raidCompletions: {},
            raidsEdited: false,
          })),
        })),
      }));
      break;
    case "completion.set":
      players = mapCharacter(players, operation, (character) => {
        if (!character.selectedRaids.includes(operation.raidName)) return character;
        const raidCompletions = { ...character.raidCompletions };
        if (operation.completed) raidCompletions[operation.raidName] = raidWeek;
        else delete raidCompletions[operation.raidName];
        return { ...character, raidCompletions };
      });
      break;
    case "completion.batch":
      operation.targets.forEach((target) => {
        players = applyRaidGroupOperation(
          players,
          { type: "completion.set", ...target, completed: operation.completed },
          raidWeek,
        );
      });
      break;
    case "party.layout.set":
      operation.raidChanges?.forEach((change) => {
        players = applyRaidGroupOperation(
          players,
          { type: "character.raid", ...change },
          raidWeek,
        );
      });
      break;
    case "completion.reset":
      players = players.map((player) => ({
        ...player,
        expeditions: player.expeditions.map((expedition) => ({
          ...expedition,
          characters: expedition.characters.map((character) => ({
            ...character,
            raidCompletions: {},
          })),
        })),
      }));
      break;
  }

  return normalizePlayers(players) ?? [];
};

const mapExpedition = (
  players: Player[],
  playerId: string,
  expeditionId: string,
  updater: (expedition: Expedition) => Expedition,
) =>
  players.map((player) =>
    player.id === playerId
      ? {
          ...player,
          expeditions: player.expeditions.map((expedition) =>
            expedition.id === expeditionId ? updater(expedition) : expedition,
          ),
        }
      : player,
  );

const mapCharacter = (
  players: Player[],
  target: { playerId: string; expeditionId: string; characterId: string },
  updater: (character: Character) => Character,
) =>
  mapExpedition(players, target.playerId, target.expeditionId, (expedition) => ({
    ...expedition,
    characters: expedition.characters.map((character) =>
      character.id === target.characterId ? updater(character) : character,
    ),
  }));

const sanitizeExpeditionPatch = (
  patch: Extract<RaidGroupOperation, { type: "expedition.update" }>["patch"],
) => ({
  ...(typeof patch.name === "string" ? { name: patch.name.slice(0, 80) } : {}),
  ...(typeof patch.representativeName === "string"
    ? { representativeName: patch.representativeName.slice(0, 80) }
    : {}),
  ...(typeof patch.serverName === "string"
    ? { serverName: patch.serverName.slice(0, 80) }
    : {}),
  ...(typeof patch.lastSyncedAt === "string"
    ? { lastSyncedAt: patch.lastSyncedAt }
    : {}),
  ...(typeof patch.charactersHidden === "boolean"
    ? { charactersHidden: patch.charactersHidden }
    : {}),
});

const makeExclusiveRaids = (raids: string[], itemLevel: number) =>
  raids.reduce<string[]>((selectedRaids, raidName) => {
    const raid = getRaidDefinition(raidName);
    if (!raid || itemLevel < raid.minItemLevel) return selectedRaids;
    const blockedRaids = getExclusiveRaidNames(raidName);
    return [
      ...selectedRaids.filter(
        (selectedRaid) =>
          selectedRaid !== raidName && !blockedRaids.includes(selectedRaid),
      ),
      raidName,
    ];
  }, []);
