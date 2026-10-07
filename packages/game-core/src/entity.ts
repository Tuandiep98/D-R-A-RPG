import type { ComboVariant, MonsterTier } from '@rpg/game-data';
import type {
  EntityAction,
  EntityId,
  EntityKind,
  InventoryItem,
  ItemInstanceId,
} from '@rpg/game-protocol';
import type { Vec2 } from './math';

export type Faction = 'players' | 'monsters' | 'neutral';

export type AiState = 'idle' | 'chase' | 'return';

export type EquipSlot =
  | 'main_hand'
  | 'off_hand'
  | 'head'
  | 'chest'
  | 'gloves'
  | 'pants'
  | 'boots'
  | 'back'
  | 'artifact';

export interface Goal {
  pos: Vec2;
  /** Stop once centre distance to `pos` is at most this. */
  stopWithin: number;
}

export interface Stats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  critChance: number;
  critMultiplier: number;
  hpRegen: number;
  mpRegen: number;
}

export interface Cast {
  skillId: string;
  targetId: EntityId | null;
  /** Impact point locked at cast start (telegraphs stay where they were shown). */
  point: Vec2 | null;
  startTick: number;
  endTick: number;
}

/** One basic-attack swing in flight (systems/melee.ts). Times are ticks. */
export interface Swing {
  comboId: string;
  step: number;
  variant: ComboVariant;
  startTick: number;
  impactTick: number;
  endTick: number;
  /** Facing locked when the swing started (aim / held direction / assist). */
  yaw: number;
  impacted: boolean;
  /** Lunge metres still to travel during the wind-up. */
  lungeLeft: number;
}

/** Combo chain bookkeeping per player. */
export interface ComboState {
  /** Step the next swing uses if it starts before `lastEndTick + reset`. */
  nextStep: number;
  lastEndTick: number;
  /** A press during a swing: chain straight into the next step when it ends. */
  buffered: boolean;
  /** Aim point of the buffered press (desktop cursor). */
  aim: Vec2 | null;
}

/** Something the entity walks to and then does (pickup, portal, queued skill). */
export type PendingAction =
  | { type: 'pickup'; lootId: EntityId }
  | { type: 'interact'; entityId: EntityId }
  | {
      type: 'cast';
      skillId: string;
      targetId: EntityId | null;
      point: Vec2 | null;
    };

export interface QuestState {
  questId: string;
  status: 'active' | 'ready' | 'done';
  /** Per objective (kill/talk); collect objectives are read from the inventory. */
  progress: number[];
}

export interface PlayerData {
  characterId: string;
  name: string;
  partyId: number | null;
  gold: number;
  /** Open cultivation nodes, in the order they were opened. */
  nodes: string[];
  /** Failed breakthrough: attacks are weakened until this tick. */
  backlashUntilTick: number;
  inventory: InventoryItem[];
  equipment: Partial<Record<EquipSlot, ItemInstanceId>>;
  itemReadyAtTick: number;
  quests: QuestState[];
  combo: ComboState;
}

export interface LootData {
  itemId: string;
  count: number;
  /** Only this player may pick it up until `freeAtTick`. */
  ownerId: EntityId | null;
  freeAtTick: number;
  expiresAtTick: number;
}

export interface NpcData {
  npcId: string;
}

export interface PortalData {
  portalId: string;
  targetMapId: string;
  arrival: string | null;
}

export interface Entity {
  id: EntityId;
  kind: EntityKind;
  defId: string;
  faction: Faction;
  /** Loot and portals: no movement, combat or AI. */
  inert: boolean;
  /** Cảnh giới rank (index in the realm ladder). There is no character level. */
  realm: number;

  pos: Vec2;
  yaw: number;

  movement: {
    baseSpeed: number;
    speed: number;
    radius: number;
    goal: Goal | null;
    /** Remaining waypoints toward `goal` when a NavQuery is available. */
    path: Vec2[] | null;
    pathTick: number;
    pathGoal: Vec2 | null;
    /** Unit direction held by direct control (MOVE_DIR); overrides `goal` while set. */
    dir: Vec2 | null;
    /** Set by the movement system each tick. */
    moved: boolean;
  };

  stats: Stats;
  /** Attack before phase multipliers (monsters) or equipment (players). */
  baseAttack: number;

  combat: {
    range: number;
    attackIntervalTicks: number;
    nextAttackTick: number;
    targetId: EntityId | null;
    lastCombatTick: number;
  };

  life: {
    alive: boolean;
    respawnTicks: number;
    respawnAtTick: number | null;
    spawnPos: Vec2;
    lastAttackerId: EntityId | null;
    /** Damage taken per attacker since last (re)spawn: kill credit and loot ownership. */
    damageBy: Map<EntityId, number>;
  };

  ai: {
    state: AiState;
    home: Vec2;
    aggroRadius: number;
    leashRadius: number;
    wanderRadius: number;
    nextWanderTick: number;
    tier: MonsterTier;
    phase: number;
  } | null;

  /** Skill id → tick at which it is ready again. Order = skill bar order. */
  skills: Map<string, number>;
  cast: Cast | null;
  swing: Swing | null;
  pending: PendingAction | null;

  player: PlayerData | null;
  loot: LootData | null;
  portal: PortalData | null;
  npc: NpcData | null;

  action: EntityAction;
}

export interface CircleObstacle {
  pos: Vec2;
  radius: number;
}

/** Persisted character state (DB row in M4, carried across map transfers). */
export interface PlayerSave {
  characterId: string;
  /** Realm id (stable across ladder changes). */
  realm: string;
  /** Realm order at save time (leaderboard sorting); derived, never read back. */
  realmRank?: number;
  nodes: string[];
  gold: number;
  hp: number;
  mp: number;
  inventory: InventoryItem[];
  equipment: Partial<Record<EquipSlot, ItemInstanceId>>;
  quests?: QuestState[];
}

/** One audited currency change (tech plan §33). */
export interface LedgerEntry {
  tick: number;
  entityId: EntityId;
  characterId: string;
  amount: number;
  balanceAfter: number;
  reason:
    | 'monster_drop'
    | 'sell'
    | 'buy'
    | 'craft'
    | 'upgrade'
    | 'admin'
    | 'quest'
    | 'cultivation'
    | 'breakthrough';
  /** Idempotency key: the same key is never applied twice. */
  key: string;
}
