import { z } from 'zod';

/**
 * Wire contract between client and simulation host (local or server).
 * Bump PROTOCOL_VERSION on any breaking change to these schemas.
 */
export const PROTOCOL_VERSION = 2;

/** Max world coordinate magnitude accepted from a client, in metres. */
export const MAX_COORD = 10_000;

const coord = z.number().finite().min(-MAX_COORD).max(MAX_COORD);
const contentId = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/)
  .max(64);

/** Position on the ground plane. Gameplay runs on XZ; Y is presentation only. */
export const Vec2Schema = z.object({ x: coord, z: coord });
export type Vec2 = z.infer<typeof Vec2Schema>;

export const EntityIdSchema = z.number().int().positive();
export type EntityId = z.infer<typeof EntityIdSchema>;

/** Item instances are unique across the game (UUIDv7 on the server). */
export const ItemInstanceIdSchema = z.string().min(1).max(64);
export type ItemInstanceId = z.infer<typeof ItemInstanceIdSchema>;

export const EquipSlotSchema = z.enum([
  'main_hand',
  'off_hand',
  'head',
  'chest',
  'gloves',
  'pants',
  'boots',
  'back',
  'artifact',
]);

// ---------------------------------------------------------------------------
// Client → host. Clients send intents only (tech plan §21).
// ---------------------------------------------------------------------------

export const IntentSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('MOVE_TO'), target: Vec2Schema }),
  z.strictObject({ type: z.literal('ATTACK_TARGET'), targetId: EntityIdSchema }),
  z.strictObject({ type: z.literal('STOP') }),
  z.strictObject({
    type: z.literal('CAST_SKILL'),
    skillId: contentId,
    targetId: EntityIdSchema.optional(),
    point: Vec2Schema.optional(),
  }),
  z.strictObject({ type: z.literal('PICKUP'), lootId: EntityIdSchema }),
  z.strictObject({ type: z.literal('INTERACT'), entityId: EntityIdSchema }),
  z.strictObject({ type: z.literal('EQUIP'), instanceId: ItemInstanceIdSchema }),
  z.strictObject({ type: z.literal('UNEQUIP'), slot: EquipSlotSchema }),
  z.strictObject({ type: z.literal('USE_ITEM'), instanceId: ItemInstanceIdSchema }),
]);
export type Intent = z.infer<typeof IntentSchema>;
export type IntentType = Intent['type'];

// ---------------------------------------------------------------------------
// Host → client: public world state (everyone in the AOI sees it)
// ---------------------------------------------------------------------------

export const EntityKindSchema = z.enum(['player', 'monster', 'loot', 'portal']);
export type EntityKind = z.infer<typeof EntityKindSchema>;

/** Coarse action used by the client to pick a looping animation. */
export const EntityActionSchema = z.enum(['idle', 'move', 'combat', 'cast', 'dead']);
export type EntityAction = z.infer<typeof EntityActionSchema>;

export const EntitySnapshotSchema = z.object({
  id: EntityIdSchema,
  kind: EntityKindSchema,
  /** Content id: character, monster, item (loot) or portal id. */
  defId: z.string(),
  pos: Vec2Schema,
  /** Facing angle in radians: atan2(dx, dz), 0 faces +Z. */
  yaw: z.number().finite(),
  hp: z.number().int().nonnegative(),
  maxHp: z.number().int().nonnegative(),
  level: z.number().int().nonnegative(),
  action: EntityActionSchema,
  targetId: EntityIdSchema.nullable(),
  /** Loot: who may pick it up (null = anyone). Players: unused. */
  ownerId: EntityIdSchema.nullable(),
  /** Monster phase index (0 = base). */
  phase: z.number().int().nonnegative(),
  cast: z
    .object({ skillId: z.string(), startTick: z.number().int(), endTick: z.number().int() })
    .nullable(),
  /** Players: visible equipment (slot → item id) so others can render it. */
  gear: z.partialRecord(EquipSlotSchema, z.string()).nullable(),
});
export type EntitySnapshot = z.infer<typeof EntitySnapshotSchema>;

export const SnapshotSchema = z.object({
  tick: z.number().int().nonnegative(),
  entities: z.array(EntitySnapshotSchema),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export const NoticeCodeSchema = z.enum([
  'out_of_range',
  'cooldown',
  'no_mp',
  'no_target',
  'inventory_full',
  'level_too_low',
  'not_owner',
  'invalid',
  'dead',
  'safe_zone',
]);
export type NoticeCode = z.infer<typeof NoticeCodeSchema>;

export const SimEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SPAWN'), id: EntityIdSchema }),
  z.object({ type: z.literal('DESPAWN'), id: EntityIdSchema }),
  z.object({ type: z.literal('ATTACK'), sourceId: EntityIdSchema, targetId: EntityIdSchema }),
  z.object({
    type: z.literal('DAMAGE'),
    sourceId: EntityIdSchema,
    targetId: EntityIdSchema,
    amount: z.number().int().nonnegative(),
    crit: z.boolean(),
    skillId: z.string().nullable(),
  }),
  z.object({
    type: z.literal('HEAL'),
    targetId: EntityIdSchema,
    amount: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('DEATH'), id: EntityIdSchema, killerId: EntityIdSchema.nullable() }),
  z.object({ type: z.literal('RESPAWN'), id: EntityIdSchema }),
  z.object({
    type: z.literal('CAST_START'),
    sourceId: EntityIdSchema,
    skillId: z.string(),
    targetId: EntityIdSchema.nullable(),
    point: Vec2Schema.nullable(),
    /** > 0 when the impact area should be telegraphed. */
    radius: z.number().nonnegative(),
    telegraph: z.boolean(),
    endTick: z.number().int(),
  }),
  z.object({
    type: z.literal('SKILL_IMPACT'),
    sourceId: EntityIdSchema,
    skillId: z.string(),
    point: Vec2Schema,
    radius: z.number().nonnegative(),
    targetId: EntityIdSchema.nullable(),
  }),
  z.object({
    type: z.literal('PHASE'),
    id: EntityIdSchema,
    phase: z.number().int(),
    name: z.string(),
  }),
  z.object({ type: z.literal('XP'), id: EntityIdSchema, amount: z.number().int() }),
  z.object({ type: z.literal('LEVEL_UP'), id: EntityIdSchema, level: z.number().int() }),
  z.object({
    type: z.literal('ITEM_GAINED'),
    ownerId: EntityIdSchema,
    itemId: z.string(),
    count: z.number().int(),
  }),
  z.object({
    type: z.literal('GOLD'),
    ownerId: EntityIdSchema,
    amount: z.number().int(),
    reason: z.string(),
  }),
  z.object({ type: z.literal('NOTICE'), ownerId: EntityIdSchema, code: NoticeCodeSchema }),
  z.object({
    type: z.literal('TRANSFER'),
    id: EntityIdSchema,
    mapId: z.string(),
    arrival: z.string().nullable(),
  }),
]);
export type SimEvent = z.infer<typeof SimEventSchema>;

// ---------------------------------------------------------------------------
// Host → one client: private state of the controlled character
// ---------------------------------------------------------------------------

export const InventoryItemSchema = z.object({
  instanceId: ItemInstanceIdSchema,
  itemId: z.string(),
  count: z.number().int().positive(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const PlayerStateSchema = z.object({
  id: EntityIdSchema,
  characterId: z.string(),
  level: z.number().int().positive(),
  xp: z.number().int().nonnegative(),
  xpToNext: z.number().int().nonnegative(),
  hp: z.number().int().nonnegative(),
  maxHp: z.number().int().positive(),
  mp: z.number().int().nonnegative(),
  maxMp: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
  stats: z.object({
    attack: z.number(),
    defense: z.number(),
    critChance: z.number(),
    speed: z.number(),
  }),
  skills: z.array(z.object({ skillId: z.string(), readyAtTick: z.number().int() })),
  inventory: z.array(InventoryItemSchema),
  inventoryCapacity: z.number().int().positive(),
  equipment: z.partialRecord(EquipSlotSchema, ItemInstanceIdSchema),
  itemReadyAtTick: z.number().int(),
  inSafeZone: z.boolean(),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;

/** Sent by the host once a client has joined (and again after a map transfer). */
export const JoinInfoSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  playerId: EntityIdSchema,
  mapId: z.string(),
  tickRate: z.number().int().positive(),
});
export type JoinInfo = z.infer<typeof JoinInfoSchema>;
