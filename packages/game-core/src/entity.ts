import type {
  ComboVariant,
  DamageSpec,
  Element,
  Expression,
  MonsterTier,
  RangedDef,
} from '@rpg/game-data';
import type {
  EntityAction,
  EntityId,
  EntityKind,
  Intent,
  InventoryItem,
  ItemInstanceId,
} from '@rpg/game-protocol';
import type { Vec2 } from './math';

export interface ActionState {
  id: number;
  kind: 'skill' | 'melee' | 'mobility' | 'monster' | 'ranged';
  startTick: number;
  activeStartTick: number;
  activeEndTick: number;
  endTick: number;
  yaw: number;
  cancelWindup: boolean;
  recoveryCancelTick: number | null;
}

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

/** Offensive properties frozen when an action starts; defense is read on contact. */
export interface DamageSource {
  actionId?: number | null;
  stats: Pick<Stats, 'attack' | 'critChance' | 'critMultiplier'>;
  realm: number;
  backlash: number;
  element: Element | null;
  expression: Expression;
}

export interface Cast {
  origin?: Vec2;
  yaw: number;
  travelLeft: number;
  source: DamageSource;
  skillId: string;
  targetId: EntityId | null;
  /** Impact point locked at cast start (telegraphs stay where they were shown). */
  point: Vec2 | null;
  startTick: number;
  endTick: number;
}

/** One basic-attack swing in flight (systems/melee.ts). Times are ticks. */
export interface Swing {
  source: DamageSource;
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
  bufferedUntil?: number;
  /** Aim point of the buffered press (desktop cursor). */
  aim: Vec2 | null;
}

/**
 * Ammo and heat of one ranged weapon instance (systems/ranged.ts). Kept per
 * instance so swapping weapons never refills or cools one.
 */
export interface WeaponState {
  ammo: number;
  /** Heat at `heatTick`; it cools lazily from max(heatTick, lastShotTick + coolDelay). */
  heat: number;
  heatTick: number;
  lastShotTick: number;
  /** Quá tải: no shots until this tick. */
  overheatUntil: number;
}

/** Trigger and firing bookkeeping for the equipped ranged weapon. Times are ticks. */
export interface TriggerState {
  /** Offensive state and facing committed while raising the weapon. */
  windup?: { source: DamageSource; yaw: number; startTick: number } | null;
  /** Weapon instance this state follows; a change means the weapon was swapped. */
  instanceId: ItemInstanceId | null;
  held: boolean;
  /** Last TRIGGER held=true; a silent trigger is released after a timeout. */
  heardTick: number;
  /** Desktop cursor point to shoot at (null → aim assist / facing). */
  aim: Vec2 | null;
  /** A press not fired yet (semi / burst, or a tap on an auto weapon). */
  queued: boolean;
  /** Burst shots still to come and when the next one leaves. */
  burstLeft: number;
  nextShotTick: number;
  /** No shot before this tick (raising the weapon, drawing a swapped one). */
  readyTick: number;
  /** Weapon raised: the body faces the aim and fires without wind-up until then. */
  raisedUntil: number;
  lastShotTick: number;
  /** Sticky aim-assist target. */
  assistId: EntityId | null;
  reload: {
    instanceId: ItemInstanceId;
    startTick: number;
    endTick: number;
    nextTick: number;
  } | null;
  /** Movement speed factor this tick (firing / reloading slow the walk). */
  move: number;
}

export function newTriggerState(): TriggerState {
  return {
    instanceId: null,
    held: false,
    heardTick: 0,
    aim: null,
    queued: false,
    burstLeft: 0,
    nextShotTick: 0,
    readyTick: 0,
    raisedUntil: 0,
    lastShotTick: -1_000_000,
    assistId: null,
    reload: null,
    windup: null,
    move: 1,
  };
}

/** A bullet in flight (not an entity: never in snapshots, presented from SHOT events). */
export interface Projectile {
  source: DamageSource;
  shotId: number;
  pellet: number;
  ownerId: EntityId;
  rangedId: string;
  /** Muzzle point and unit heading. */
  origin: Vec2;
  dir: Vec2;
  /** Metres flown so far and where it must stop (wall / max range). */
  travelled: number;
  stopAt: number;
  speedPerTick: number;
  pierceLeft: number;
  hitIds: EntityId[];
}

export interface SkillProjectile {
  source: DamageSource;
  damages: DamageSpec[];
  id: number;
  ownerId: EntityId;
  skillId: string;
  pos: Vec2;
  origin: Vec2;
  dir: Vec2;
  left: number;
}

/** Something the entity walks to and then does (pickup, portal, queued skill). */
export type PendingAction =
  | { type: 'pickup'; lootId: EntityId }
  | { type: 'interact'; entityId: EntityId }
  | {
      type: 'cast';
      expiresTick: number;
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
  learnedSkills: string[];
  elementRevision: number;
  characterId: string;
  companion?: { entityId: EntityId | null; hp: number; readyAtTick: number };
  mobilityReady: Map<string, number>;
  farm: {
    enabled: boolean;
    anchor: Vec2;
    pausedUntil: number;
    progress?: { pos: Vec2; tick: number } | null;
    approach?: { targetId: EntityId; moving: boolean } | null;
    observedTarget?: { targetId: EntityId; pos: Vec2; tick: number } | null;
  };
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
  /** Main-hand ranged weapon (derived on equip by recomputePlayerStats), null when melee. */
  ranged: { instanceId: ItemInstanceId; def: RangedDef } | null;
  weapons: Map<ItemInstanceId, WeaponState>;
  trigger: TriggerState;
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
  pet?: { ownerId: EntityId; profileId: string };
  cloakEndTick?: number | null;
  shield?: { amount: number; endTick: number } | null;
  guardChain?: { comboId: string; stacks: number; defense: number; endTick: number } | null;
  poise?: {
    pressure: number;
    threshold: number;
    lastHitTick: number;
    staggerUntilTick: number;
    immuneUntilTick: number;
  } | null;
  actionBuffer?: {
    expiresTick: number;
    intent: Extract<Intent, { type: 'BASIC_ATTACK' | 'CAST_SKILL' | 'MOBILITY' | 'TRIGGER' }>;
  } | null;
  actionState?: ActionState | null;
  id: EntityId;
  kind: EntityKind;
  defId: string;
  faction: Faction;
  element?: Element | null;
  expression?: Expression;
  mobility?: {
    actionId: number;
    action: 'roll' | 'blink' | 'jump';
    startTick: number;
    endTick: number;
    distanceLeft: number;
    dir: Vec2;
    dodgeFrom: number;
    dodgeTo: number;
  } | null;
  monsterSwing?: {
    source: DamageSource;
    impactTick: number;
    endTick: number;
    yaw: number;
  } | null;
  /** Loot and portals: no movement, combat or AI. */
  inert: boolean;
  /** Cảnh giới rank (index in the realm ladder). There is no character level. */
  realm: number;

  pos: Vec2;
  previousPos?: Vec2;
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
  companion?: { hp: number; respawnSeconds: number };
  saveVersion?: number;
  elementRevision?: number;
  learnedSkills?: string[];
  /** Remaining cooldown seconds, frozen offline; absolute sim ticks are never persisted. */
  cooldowns?: Record<string, number>;
  characterId: string;
  element?: Element;
  expression?: Expression;
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
