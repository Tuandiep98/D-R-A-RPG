import { z } from 'zod';

/**
 * Wire contract between client and simulation host (local or server).
 * Bump PROTOCOL_VERSION on any breaking change to these schemas.
 */
export const PROTOCOL_VERSION = 5;

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
  z.strictObject({
    type: z.literal('ATTACK_TARGET'),
    targetId: EntityIdSchema,
  }),
  z.strictObject({ type: z.literal('STOP') }),
  z.strictObject({
    type: z.literal('CAST_SKILL'),
    skillId: contentId,
    targetId: EntityIdSchema.optional(),
    point: Vec2Schema.optional(),
  }),
  z.strictObject({ type: z.literal('PICKUP'), lootId: EntityIdSchema }),
  z.strictObject({ type: z.literal('INTERACT'), entityId: EntityIdSchema }),
  z.strictObject({
    type: z.literal('EQUIP'),
    instanceId: ItemInstanceIdSchema,
  }),
  z.strictObject({ type: z.literal('UNEQUIP'), slot: EquipSlotSchema }),
  z.strictObject({
    type: z.literal('USE_ITEM'),
    instanceId: ItemInstanceIdSchema,
  }),
  z.strictObject({
    type: z.literal('QUEST_ACCEPT'),
    npcId: EntityIdSchema,
    questId: contentId,
  }),
  z.strictObject({
    type: z.literal('QUEST_TURN_IN'),
    npcId: EntityIdSchema,
    questId: contentId,
  }),
  z.strictObject({
    type: z.literal('SHOP_BUY'),
    npcId: EntityIdSchema,
    itemId: contentId,
    count: z.number().int().min(1).max(99),
  }),
  z.strictObject({
    type: z.literal('SHOP_SELL'),
    npcId: EntityIdSchema,
    instanceId: ItemInstanceIdSchema,
    count: z.number().int().min(1).max(999),
  }),
  z.strictObject({
    type: z.literal('CRAFT'),
    npcId: EntityIdSchema,
    recipeId: contentId,
  }),
  z.strictObject({
    type: z.literal('UPGRADE'),
    npcId: EntityIdSchema,
    instanceId: ItemInstanceIdSchema,
  }),
  z.strictObject({ type: z.literal('PARTY_INVITE'), targetId: EntityIdSchema }),
  z.strictObject({ type: z.literal('PARTY_ACCEPT'), fromId: EntityIdSchema }),
  z.strictObject({ type: z.literal('PARTY_LEAVE') }),
  /** Open a cultivation node (no character level — master plan §31). */
  z.strictObject({ type: z.literal('OPEN_NODE'), nodeId: contentId }),
  /** Attempt to break through to the next realm. */
  z.strictObject({ type: z.literal('BREAKTHROUGH') }),
]);
export type Intent = z.infer<typeof IntentSchema>;
export type IntentType = Intent['type'];

// ---------------------------------------------------------------------------
// Host → client: public world state (everyone in the AOI sees it)
// ---------------------------------------------------------------------------

export const EntityKindSchema = z.enum(['player', 'monster', 'loot', 'portal', 'npc']);
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
  /** Realm rank (index in the realm ladder); 0 for loot/portals/NPCs. */
  realm: z.number().int().nonnegative(),
  action: EntityActionSchema,
  targetId: EntityIdSchema.nullable(),
  /** Loot: who may pick it up (null = anyone). Players: unused. */
  ownerId: EntityIdSchema.nullable(),
  /** Monster phase index (0 = base). */
  phase: z.number().int().nonnegative(),
  cast: z
    .object({
      skillId: z.string(),
      startTick: z.number().int(),
      endTick: z.number().int(),
    })
    .nullable(),
  /** Players: display name (character name online). */
  name: z.string().nullable(),
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
  'realm_too_low',
  'not_owner',
  'invalid',
  'dead',
  'safe_zone',
  'too_far',
  'not_enough_gold',
  'missing_materials',
  'quest_unavailable',
  'quest_incomplete',
  'max_level',
  'not_sellable',
  'party_full',
  'already_in_party',
  'no_invite',
  'capacity_full',
  'requirements_unmet',
  'max_realm',
  'not_in_safe_zone',
  'backlash',
]);
export type NoticeCode = z.infer<typeof NoticeCodeSchema>;

export const SimEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SPAWN'), id: EntityIdSchema }),
  z.object({ type: z.literal('DESPAWN'), id: EntityIdSchema }),
  z.object({
    type: z.literal('ATTACK'),
    sourceId: EntityIdSchema,
    targetId: EntityIdSchema,
  }),
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
  z.object({
    type: z.literal('DEATH'),
    id: EntityIdSchema,
    killerId: EntityIdSchema.nullable(),
  }),
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
  /** Public: everyone nearby sees a breakthrough (success or backlash). */
  z.object({
    type: z.literal('BREAKTHROUGH'),
    id: EntityIdSchema,
    realm: z.number().int().nonnegative(),
    success: z.boolean(),
  }),
  z.object({
    type: z.literal('NODE_OPENED'),
    ownerId: EntityIdSchema,
    nodeId: z.string(),
  }),
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
  z.object({
    type: z.literal('NOTICE'),
    ownerId: EntityIdSchema,
    code: NoticeCodeSchema,
  }),
  z.object({
    type: z.literal('TRANSFER'),
    id: EntityIdSchema,
    mapId: z.string(),
    arrival: z.string().nullable(),
  }),
  /** Private: the client opens the NPC dialog (quests, shop, crafting, upgrades). */
  z.object({
    type: z.literal('NPC_OPEN'),
    ownerId: EntityIdSchema,
    npcEntityId: EntityIdSchema,
    npcId: z.string(),
  }),
  z.object({
    type: z.literal('QUEST'),
    ownerId: EntityIdSchema,
    questId: z.string(),
    status: z.enum(['active', 'ready', 'done']),
  }),
  z.object({
    type: z.literal('PARTY_INVITE'),
    ownerId: EntityIdSchema,
    fromId: EntityIdSchema,
    fromName: z.string(),
  }),
  z.object({
    type: z.literal('UPGRADE_RESULT'),
    ownerId: EntityIdSchema,
    instanceId: z.string(),
    success: z.boolean(),
    level: z.number().int(),
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
  /** Equipment enhancement level (+1…). */
  enhance: z.number().int().nonnegative().optional(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const PlayerStateSchema = z.object({
  id: EntityIdSchema,
  characterId: z.string(),
  /** Realm id (game-data/realms). */
  realm: z.string(),
  /** Open cultivation nodes. */
  nodes: z.array(z.string()),
  meridianLoad: z.number().int().nonnegative(),
  bodyLoad: z.number().int().nonnegative(),
  /** Server-computed success chance of the next breakthrough (0 = unavailable). */
  breakthroughChance: z.number().min(0).max(1),
  backlashUntilTick: z.number().int(),
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
  party: z
    .object({
      leaderId: EntityIdSchema,
      members: z.array(
        z.object({
          id: EntityIdSchema,
          name: z.string(),
          realm: z.number().int(),
          hp: z.number().int(),
          maxHp: z.number().int(),
        }),
      ),
    })
    .nullable(),
  quests: z.array(
    z.object({
      questId: z.string(),
      /** active: in progress · ready: objectives met · done: turned in */
      status: z.enum(['active', 'ready', 'done']),
      progress: z.array(z.number().int().nonnegative()),
    }),
  ),
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

// ---------------------------------------------------------------------------
// Chat (not part of the simulation; relayed by the host)
// ---------------------------------------------------------------------------

export const CHAT_MAX_LENGTH = 140;

export const ChatSendSchema = z.strictObject({
  text: z.string().trim().min(1).max(CHAT_MAX_LENGTH),
});

export const ChatMessageSchema = z.object({
  channel: z.enum(['map', 'system']),
  fromId: EntityIdSchema.nullable(),
  fromName: z.string(),
  text: z.string(),
  at: z.number(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
