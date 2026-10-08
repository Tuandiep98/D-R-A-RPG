import { z } from 'zod';

/**
 * Wire contract between client and simulation host (local or server).
 * Bump PROTOCOL_VERSION on any breaking change to these schemas.
 */
export const PROTOCOL_VERSION = 12;
export const SAVE_VERSION = 2;
export const SaveVersionSchema = z.number().int().min(1).max(SAVE_VERSION);
export const LearnedSkillsSchema = z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(256);
export const CombatContentSchema = z.enum(['starter', 'prototype']);
export type CombatContent = z.infer<typeof CombatContentSchema>;
export const CombatRulesetSchema = z.enum(['classic', 'elements_v1']);
export type CombatRuleset = z.infer<typeof CombatRulesetSchema>;
export const ElementSchema = z.enum(['kim', 'moc', 'thuy', 'hoa', 'tho']);
export type Element = z.infer<typeof ElementSchema>;
export const ExpressionSchema = z.enum(['base', 'thunder', 'ice']);

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
  /**
   * Direct movement (WASD / joystick / left stick): a world-space XZ direction,
   * length ≤ 1 (the host normalises it), or null to release. Clients send it on
   * change only.
   */
  z.strictObject({
    type: z.literal('MOVE_DIR'),
    dir: z
      .object({
        x: z.number().finite().min(-1).max(1),
        z: z.number().finite().min(-1).max(1),
      })
      .nullable(),
  }),
  /**
   * Basic attack (đánh thường): the next swing of the combo, no target needed.
   * `aim` is a world point to face (desktop cursor); without it the host uses
   * the held direction, then aim assist, then the current facing.
   */
  z.strictObject({
    type: z.literal('BASIC_ATTACK'),
    aim: Vec2Schema.nullable().optional(),
  }),
  /**
   * Ranged weapons (D-033): trigger pressed / still held (with a fresh aim
   * point) or released. While held the client repeats it at least every
   * 0.5 s; the host releases a trigger it has not heard about for 1.5 s, so a
   * lost release never fires forever. Melee weapons treat a press as
   * BASIC_ATTACK.
   */
  z.strictObject({
    type: z.literal('TRIGGER'),
    held: z.boolean(),
    aim: Vec2Schema.nullable().optional(),
    /** Selected hostile to keep aiming at when there is no aim point (touch / gamepad). */
    targetId: EntityIdSchema.optional(),
  }),
  /** Reload the main-hand ranged weapon now (also starts by itself when it runs dry). */
  z.strictObject({ type: z.literal('RELOAD') }),
  z.strictObject({
    type: z.literal('ATTACK_TARGET'),
    targetId: EntityIdSchema,
  }),
  z.strictObject({ type: z.literal('STOP') }),
  z.strictObject({
    type: z.literal('MOBILITY'),
    action: z.enum(['roll', 'blink', 'jump']),
    point: Vec2Schema.optional(),
  }),
  z.strictObject({ type: z.literal('SET_FARM'), enabled: z.boolean() }),
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

export const EntityKindSchema = z.enum(['player', 'monster', 'pet', 'loot', 'portal', 'npc']);
export type EntityKind = z.infer<typeof EntityKindSchema>;

/** Coarse action used by the client to pick a looping animation. */
export const EntityActionSchema = z.enum(['idle', 'move', 'combat', 'cast', 'dead']);
export type EntityAction = z.infer<typeof EntityActionSchema>;

export const EntitySnapshotSchema = z.object({
  poise: z
    .object({
      pressure: z.number().nonnegative(),
      threshold: z.number().positive(),
      lastHitTick: z.number().int().nonnegative(),
      staggerUntilTick: z.number().int().nonnegative(),
      immuneUntilTick: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
  cloakEndTick: z.number().int().nonnegative().nullable().optional(),
  guardChain: z
    .object({
      stacks: z.number().int().min(1).max(5),
      defense: z.number().int().min(1).max(100),
      endTick: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
  shield: z
    .object({ amount: z.number().int().nonnegative(), endTick: z.number().int() })
    .nullable()
    .optional(),
  actionState: z
    .object({
      id: z.number().int().positive(),
      kind: z.enum(['skill', 'melee', 'mobility', 'monster', 'ranged']),
      startTick: z.number().int(),
      activeStartTick: z.number().int(),
      activeEndTick: z.number().int(),
      endTick: z.number().int(),
      yaw: z.number().finite(),
    })
    .nullable()
    .optional(),
  id: EntityIdSchema,
  element: ElementSchema.nullable().optional(),
  expression: ExpressionSchema.optional(),
  mobility: z
    .object({
      action: z.enum(['roll', 'blink', 'jump']),
      startTick: z.number().int(),
      endTick: z.number().int(),
    })
    .nullable()
    .optional(),
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
  /** Loot: pickup owner; pet: controller owner; other entities: null. */
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
  'combat_capacity_full',
  'farm_stuck',
  'farm_low_hp',
  'requirements_unmet',
  'max_realm',
  'not_in_safe_zone',
  'backlash',
  'reloading',
  'overheated',
]);
export type NoticeCode = z.infer<typeof NoticeCodeSchema>;

export const SimEventSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('ACTION_CANCEL'),
      sourceId: EntityIdSchema,
      actionId: z.number().int().positive(),
    }),
    z.object({
      type: z.literal('SHIELD'),
      targetId: EntityIdSchema,
      amount: z.number().int().nonnegative(),
      remaining: z.number().int().nonnegative(),
      endTick: z.number().int(),
      phase: z.enum(['gain', 'absorb', 'expire']),
    }),
    z.object({ type: z.literal('SPAWN'), id: EntityIdSchema }),
    z.object({ type: z.literal('DESPAWN'), id: EntityIdSchema }),
    z.object({
      type: z.literal('ATTACK'),
      actionId: z.number().int().positive().nullable().optional(),
      element: ElementSchema.nullable().optional(),
      expression: ExpressionSchema.optional(),
      sourceId: EntityIdSchema,
      windup: z
        .object({
          point: Vec2Schema,
          yaw: z.number().finite(),
          range: z.number().nonnegative(),
          arc: z.number().min(0).max(360),
          endTick: z.number().int().nonnegative(),
        })
        .optional(),
      /** Null for a combo swing at nothing in particular. */
      targetId: EntityIdSchema.nullable(),
      /** Combo swings: which combo/step/variant (presentation looks up clip + trail). */
      combo: z
        .object({
          comboId: z.string(),
          step: z.number().int().nonnegative(),
          variantId: z.string(),
          yaw: z.number().finite(),
        })
        .optional(),
    }),
    z.object({
      type: z.literal('DAMAGE'),
      actionId: z.number().int().positive().nullable().optional(),
      element: ElementSchema.nullable().optional(),
      expression: ExpressionSchema.optional(),
      sourceId: EntityIdSchema,
      targetId: EntityIdSchema,
      amount: z.number().int().nonnegative(),
      crit: z.boolean(),
      skillId: z.string().nullable(),
      /** Combo hits, timed on the impact tick: solid, glancing (sượt) or weak point (yếu hại). */
      hit: z.enum(['solid', 'graze', 'weak']).optional(),
      heavy: z.boolean().optional(),
      /** Ranged hits: which SHOT and bullet (the client stops that tracer at the body). */
      shot: z.object({ id: z.number().int(), pellet: z.number().int().nonnegative() }).optional(),
    }),
    /**
     * A ranged shot (D-033). One entry per bullet: heading and how far it can
     * fly before a wall or max range stops it (hitscan: where it stopped).
     * Bullets that hit a body end early through DAMAGE.shot.
     */
    z.object({
      type: z.literal('SHOT'),
      actionId: z.number().int().positive().nullable().optional(),
      element: ElementSchema.nullable().optional(),
      expression: ExpressionSchema.optional(),
      sourceId: EntityIdSchema,
      rangedId: z.string(),
      shotId: z.number().int(),
      origin: Vec2Schema,
      yaws: z.array(z.number().finite()),
      lens: z.array(z.number().nonnegative()),
    }),
    z.object({
      type: z.literal('SKILL_PROJECTILE'),
      actionId: z.number().int().positive().nullable().optional(),
      sourceId: EntityIdSchema,
      skillId: z.string(),
      projectileId: z.number().int(),
      origin: Vec2Schema,
      destination: Vec2Schema,
      speed: z.number().positive(),
      element: ElementSchema.nullable(),
      expression: ExpressionSchema,
    }),
    /** Reload started (ends at endTick) or stopped early (endTick <= startTick). */
    z.object({
      type: z.literal('RELOAD'),
      sourceId: EntityIdSchema,
      startTick: z.number().int(),
      endTick: z.number().int(),
    }),
    /** The weapon overheated (quá tải): locked until endTick. */
    z.object({
      type: z.literal('OVERHEAT'),
      sourceId: EntityIdSchema,
      endTick: z.number().int(),
    }),
    /** A combo swing whose target stood just out of reach (shown as "Trượt"). */
    z.object({
      type: z.literal('MISS'),
      sourceId: EntityIdSchema,
      targetId: EntityIdSchema,
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
      /** A later scheduled impact warning, without restarting the caster's animation. */
      continuation: z.boolean().optional(),
      cone: z
        .object({
          origin: Vec2Schema,
          yaw: z.number().finite(),
          radius: z.number().positive().max(20),
          arc: z.number().positive().max(360),
        })
        .optional(),
      line: z
        .object({
          origin: Vec2Schema,
          destination: Vec2Schema,
          radius: z.number().nonnegative().max(5),
        })
        .optional(),
      actionId: z.number().int().positive().nullable().optional(),
      element: ElementSchema.nullable().optional(),
      expression: ExpressionSchema.optional(),
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
      line: z
        .object({
          origin: Vec2Schema,
          destination: Vec2Schema,
          radius: z.number().nonnegative().max(5),
        })
        .optional(),
      actionId: z.number().int().positive().nullable().optional(),
      projectileId: z.number().int().optional(),
      element: ElementSchema.nullable().optional(),
      expression: ExpressionSchema.optional(),
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
  ])
  .and(z.object({ eventId: z.number().int().positive().optional() }));
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
  element: ElementSchema.optional(),
  expression: ExpressionSchema.optional(),
  farmEnabled: z.boolean().optional(),
  companion: z
    .object({
      profileId: z.string(),
      entityId: EntityIdSchema.nullable(),
      hp: z.number().int().nonnegative(),
      maxHp: z.number().int().positive(),
      readyAtTick: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
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
  /** Main-hand ranged weapon (null with a melee weapon or bare hands). */
  ranged: z
    .object({
      rangedId: z.string(),
      ammo: z.number().int().nonnegative(),
      magazine: z.number().int().nonnegative(),
      /** 0…1; while overheated it drains from 1 to 0 until overheatEndTick. */
      heat: z.number().min(0).max(1),
      overheatEndTick: z.number().int(),
      /** Reload in progress when reloadEndTick > the current tick. */
      reloadStartTick: z.number().int(),
      reloadEndTick: z.number().int(),
    })
    .nullable(),
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
  combatContent: CombatContentSchema.optional(),
  combatRuleset: CombatRulesetSchema.optional(),
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

/** Saved cooldown seconds, frozen offline; never absolute ticks. */
export const SkillCooldownsSchema = z.record(z.string(), z.number().finite().min(0).max(86400));

export const CompanionSaveSchema = z.strictObject({
  hp: z.number().int().min(0).max(1000000),
  respawnSeconds: z.number().finite().min(0).max(120),
});
