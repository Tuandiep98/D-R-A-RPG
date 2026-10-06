import { z } from 'zod';

/** Stable content id: lowercase snake_case. */
export const IdSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id must be lowercase snake_case');

const Vec2 = z.strictObject({ x: z.number().finite(), z: z.number().finite() });
const Vec3Tuple = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const positive = z.number().finite().positive();
const nonNegative = z.number().finite().nonnegative();
const seconds = positive.describe('seconds');
const chance = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export const StatsSchema = z.strictObject({
  hp: z.number().int().positive(),
  mp: z.number().int().nonnegative().default(0),
  attack: nonNegative,
  defense: nonNegative,
  critChance: chance.default(0.05),
  critMultiplier: z.number().min(1).default(1.5),
  /** HP/MP regenerated per second out of combat (players) or while idle. */
  hpRegen: nonNegative.default(0),
  mpRegen: nonNegative.default(0),
});
export type StatsDef = z.infer<typeof StatsSchema>;

/** Flat additive bonuses (items, level growth, phases). */
export const StatBonusSchema = z.strictObject({
  hp: z.number().default(0),
  mp: z.number().default(0),
  attack: z.number().default(0),
  defense: z.number().default(0),
  critChance: z.number().default(0),
  speed: z.number().default(0),
});
export type StatBonus = z.infer<typeof StatBonusSchema>;

export const MovementDefSchema = z.strictObject({
  /** Metres per second. */
  speed: positive,
  /** Body radius for collision, metres. */
  radius: positive,
});

export const CombatDefSchema = z.strictObject({
  /** Edge-to-edge reach in metres. */
  range: positive,
  attackInterval: seconds,
});

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export const SkillTargetingSchema = z.enum([
  /** Needs a hostile target entity within range. */
  'target',
  /** Centred on the caster. */
  'self',
  /** A ground point within range (falls back to the current target's position). */
  'point',
]);

export const SkillEffectSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('damage'),
    /** Multiplier on the caster's attack. */
    multiplier: positive,
    flat: nonNegative.default(0),
    /** 0 → single target; > 0 → everything hostile within radius of the impact point. */
    radius: nonNegative.default(0),
  }),
  z.strictObject({
    type: z.literal('heal'),
    /** Fraction of max HP. */
    fraction: chance,
  }),
]);

export const SkillDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().default(''),
  icon: z.string().default('⚔'),
  targeting: SkillTargetingSchema,
  /** Max distance to target/point, metres (ignored for `self`). */
  range: nonNegative.default(0),
  castTime: nonNegative.default(0),
  cooldown: seconds,
  mpCost: z.number().int().nonnegative().default(0),
  /**
   * Show the impact area to everyone while casting (boss telegraphs, assets plan §7).
   * The impact point is locked when the cast starts, so it can be dodged.
   */
  telegraph: z.boolean().default(false),
  effects: z.array(SkillEffectSchema).min(1),
  vfx: z.string().default('slash'),
});
export type SkillDef = z.infer<typeof SkillDefSchema>;

// ---------------------------------------------------------------------------
// Items, loot, progression
// ---------------------------------------------------------------------------

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
export type EquipSlot = z.infer<typeof EquipSlotSchema>;

export const RaritySchema = z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']);
export type Rarity = z.infer<typeof RaritySchema>;

export const ItemDefSchema = z
  .strictObject({
    id: IdSchema,
    name: z.string().min(1),
    kind: z.enum(['equipment', 'consumable', 'material']),
    rarity: RaritySchema.default('common'),
    icon: z.string().default('◆'),
    description: z.string().default(''),
    slot: EquipSlotSchema.optional(),
    /** Minimum character level to equip/use. */
    level: z.number().int().positive().default(1),
    bonus: StatBonusSchema.optional(),
    /** Consumables: fraction of max HP restored. */
    heal: chance.optional(),
    cooldown: nonNegative.default(0),
    maxStack: z.number().int().positive().default(1),
    sellPrice: z.number().int().nonnegative().default(0),
    /** Presentation (assets plan §6): many items may share one appearance. */
    appearanceId: IdSchema.optional(),
  })
  .refine((i) => i.kind !== 'equipment' || i.slot, {
    message: 'equipment needs a slot',
    path: ['slot'],
  })
  .refine((i) => i.kind !== 'consumable' || i.heal !== undefined, {
    message: 'consumable needs an effect (heal)',
    path: ['heal'],
  });
export type ItemDef = z.infer<typeof ItemDefSchema>;

export const LootTableDefSchema = z.strictObject({
  id: IdSchema,
  gold: z
    .strictObject({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() })
    .optional(),
  /** Each entry rolls independently. */
  entries: z
    .array(
      z.strictObject({
        itemId: IdSchema,
        chance,
        min: z.number().int().positive().default(1),
        max: z.number().int().positive().default(1),
      }),
    )
    .default([]),
});
export type LootTableDef = z.infer<typeof LootTableDefSchema>;

export const ProgressionDefSchema = z.strictObject({
  id: IdSchema,
  maxLevel: z.number().int().positive(),
  /** XP needed to go from level n to n+1 = round(base * n^exponent). */
  xpCurve: z.strictObject({ base: positive, exponent: positive }),
  /** Stat gain per level above 1, added to the character's base stats. */
  perLevel: StatBonusSchema,
});
export type ProgressionDef = z.infer<typeof ProgressionDefSchema>;

// ---------------------------------------------------------------------------
// Characters and monsters
// ---------------------------------------------------------------------------

export const CharacterDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  appearanceId: IdSchema,
  progressionId: IdSchema,
  stats: StatsSchema,
  movement: MovementDefSchema,
  combat: CombatDefSchema,
  respawnSeconds: seconds,
  /** Skill bar, in order. */
  skills: z.array(IdSchema).max(8).default([]),
  /** Items granted to a brand-new character. */
  starterItems: z
    .array(
      z.strictObject({
        itemId: IdSchema,
        count: z.number().int().positive().default(1),
        equip: z.boolean().default(false),
      }),
    )
    .default([]),
});
export type CharacterDef = z.infer<typeof CharacterDefSchema>;

export const MonsterTierSchema = z.enum(['normal', 'elite', 'mini_boss', 'boss', 'world_boss']);
export type MonsterTier = z.infer<typeof MonsterTierSchema>;

export const MonsterPhaseSchema = z.strictObject({
  /** Phase starts when HP fraction drops to or below this. */
  hpBelow: chance,
  name: z.string().default(''),
  attackMultiplier: positive.default(1),
  speedMultiplier: positive.default(1),
  /** Replaces the skill list while the phase is active. */
  skills: z.array(IdSchema).optional(),
});

export const MonsterDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  level: z.number().int().positive(),
  tier: MonsterTierSchema.default('normal'),
  appearanceId: IdSchema,
  stats: StatsSchema,
  movement: MovementDefSchema,
  combat: CombatDefSchema,
  ai: z.strictObject({
    type: z.enum(['melee']),
    aggroRadius: positive,
    leashRadius: positive,
    /** Random idle wander radius around home; 0 disables wandering. */
    wanderRadius: nonNegative.default(0),
  }),
  skills: z.array(IdSchema).default([]),
  phases: z.array(MonsterPhaseSchema).default([]),
  xp: z.number().int().nonnegative().default(0),
  lootTable: z.array(IdSchema).default([]),
});
export type MonsterDef = z.infer<typeof MonsterDefSchema>;

// ---------------------------------------------------------------------------
// NPCs, quests, shops, crafting, upgrades
// ---------------------------------------------------------------------------

export const NpcDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  title: z.string().default(''),
  appearanceId: IdSchema,
  greeting: z.string().default(''),
  /** Quests this NPC hands out and accepts. */
  quests: z.array(IdSchema).default([]),
  shopId: IdSchema.optional(),
  /** Recipes this NPC can craft. */
  recipes: z.array(IdSchema).default([]),
  /** Offers equipment upgrades (enhancement). */
  upgrades: z.boolean().default(false),
});
export type NpcDef = z.infer<typeof NpcDefSchema>;

export const QuestObjectiveSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('kill'),
    monsterId: IdSchema,
    count: z.number().int().positive(),
  }),
  z.strictObject({
    type: z.literal('collect'),
    itemId: IdSchema,
    count: z.number().int().positive(),
  }),
  z.strictObject({ type: z.literal('talk'), npcId: IdSchema }),
]);
export type QuestObjective = z.infer<typeof QuestObjectiveSchema>;

export const QuestDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().default(''),
  giverNpcId: IdSchema,
  /** Defaults to the giver. */
  turnInNpcId: IdSchema.optional(),
  level: z.number().int().positive().default(1),
  /** Quests that must be turned in first. */
  requires: z.array(IdSchema).default([]),
  objectives: z.array(QuestObjectiveSchema).min(1),
  /** Collected items are removed on turn-in. */
  consumeItems: z.boolean().default(true),
  rewards: z.strictObject({
    xp: z.number().int().nonnegative().default(0),
    gold: z.number().int().nonnegative().default(0),
    items: z
      .array(z.strictObject({ itemId: IdSchema, count: z.number().int().positive().default(1) }))
      .default([]),
  }),
});
export type QuestDef = z.infer<typeof QuestDefSchema>;

export const ShopDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  items: z.array(z.strictObject({ itemId: IdSchema, price: z.number().int().positive() })).min(1),
  /** Fraction of an item's sellPrice paid when selling to this shop. */
  buybackRate: z.number().min(0).max(1).default(1),
});
export type ShopDef = z.infer<typeof ShopDefSchema>;

export const RecipeDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  result: z.strictObject({ itemId: IdSchema, count: z.number().int().positive().default(1) }),
  materials: z
    .array(z.strictObject({ itemId: IdSchema, count: z.number().int().positive() }))
    .min(1),
  gold: z.number().int().nonnegative().default(0),
  level: z.number().int().positive().default(1),
});
export type RecipeDef = z.infer<typeof RecipeDefSchema>;

/** Equipment enhancement +1…+maxLevel (tech plan §47 "1 upgrade flow"). */
export const UpgradeRulesSchema = z.strictObject({
  id: IdSchema,
  maxLevel: z.number().int().positive(),
  /** Bonus multiplier per level: final = base × (1 + bonusPerLevel × level). */
  bonusPerLevel: z.number().positive(),
  /** One entry per target level (index 0 = +1). */
  steps: z
    .array(
      z.strictObject({
        gold: z.number().int().nonnegative(),
        materials: z
          .array(z.strictObject({ itemId: IdSchema, count: z.number().int().positive() }))
          .default([]),
        successRate: chance,
      }),
    )
    .min(1),
});
export type UpgradeRules = z.infer<typeof UpgradeRulesSchema>;

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

export const MapInstanceSchema = z.strictObject({
  appearanceId: IdSchema,
  position: Vec3Tuple,
  rotationY: z.number().finite().default(0),
  scale: positive.default(1),
  /** Circle blocker on the ground plane; omit for decoration only. */
  colliderRadius: positive.optional(),
});
export type MapInstance = z.infer<typeof MapInstanceSchema>;

export const MapChunkSchema = z.strictObject({
  id: z.string().regex(/^chunk_-?\d+_-?\d+$/),
  instances: z.array(MapInstanceSchema).default([]),
});

export const MapSpawnSchema = z.strictObject({
  id: IdSchema,
  monsterId: IdSchema,
  position: Vec2,
  count: z.number().int().positive(),
  /** Members are scattered within this radius of `position`. */
  radius: nonNegative.default(0),
  respawnSeconds: seconds,
});
export type MapSpawn = z.infer<typeof MapSpawnSchema>;

export const MapPortalSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  position: Vec2,
  targetMapId: IdSchema,
  /** Named arrival point in the target map; defaults to its playerSpawn. */
  targetArrival: IdSchema.optional(),
});
export type MapPortal = z.infer<typeof MapPortalSchema>;

export const MapZoneSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  kind: z.enum(['safe', 'combat', 'boss_arena', 'hazard']),
  center: Vec2,
  radius: positive,
});
export type MapZone = z.infer<typeof MapZoneSchema>;

export const MapDefSchema = z
  .strictObject({
    id: IdSchema,
    name: z.string().min(1),
    schemaVersion: z.literal(1),
    seed: z.number().int(),
    bounds: z.strictObject({ min: Vec2, max: Vec2 }),
    /** Edge length of one streaming chunk, metres (tech plan §5–6). */
    chunkSize: positive.default(32),
    ground: z.strictObject({
      appearanceId: IdSchema.optional(),
      color: z.string().default('#5f8a4a'),
    }),
    playerSpawn: Vec2,
    arrivals: z.array(z.strictObject({ id: IdSchema, position: Vec2 })).default([]),
    chunks: z.array(MapChunkSchema).min(1),
    spawns: z.array(MapSpawnSchema).default([]),
    portals: z.array(MapPortalSchema).default([]),
    zones: z.array(MapZoneSchema).default([]),
    npcs: z
      .array(z.strictObject({ npcId: IdSchema, position: Vec2, rotationY: z.number().default(0) }))
      .default([]),
    /**
     * shared: one world per channel (default). solo: a private copy per
     * character (dungeon, tech plan §29 "Instance #1234").
     */
    instance: z.enum(['shared', 'solo']).default('shared'),
  })
  .refine((m) => m.bounds.min.x < m.bounds.max.x && m.bounds.min.z < m.bounds.max.z, {
    message: 'bounds.min must be smaller than bounds.max',
    path: ['bounds'],
  });
export type MapDef = z.infer<typeof MapDefSchema>;

// ---------------------------------------------------------------------------
// Presentation: how a definition looks. Gameplay never reads this.
// ---------------------------------------------------------------------------

export const AnimationRoleSchema = z.enum(['idle', 'run', 'attack', 'cast', 'hit', 'death']);
export type AnimationRole = z.infer<typeof AnimationRoleSchema>;

/** Equipment attachment points (assets plan §5.3). */
export const SocketSchema = z.enum([
  'hand_r',
  'hand_l',
  'back',
  'head',
  'shoulder_l',
  'shoulder_r',
  'artifact',
  'vfx_origin',
]);
export type Socket = z.infer<typeof SocketSchema>;

export const AppearanceDefSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum([
    'character',
    'monster',
    'environment',
    'ground',
    'equipment',
    'loot',
    'portal',
    'npc',
  ]),
  /** Asset id in the runtime manifest. Missing asset → placeholder. */
  modelAssetId: IdSchema.optional(),
  scale: positive.default(1),
  /** Extra rotation applied to the model so it faces +Z. */
  yawOffset: z.number().finite().default(0),
  /** Clip names inside the model, by role. */
  animations: z.partialRecord(AnimationRoleSchema, z.string()).default({}),
  /** Characters: socket → bone name in this rig (see docs/rig_contract.md). */
  sockets: z.partialRecord(SocketSchema, z.string()).default({}),
  /** Equipment: which socket it attaches to and its local offset. */
  attach: z
    .strictObject({
      socket: SocketSchema,
      position: Vec3Tuple.default([0, 0, 0]),
      rotation: Vec3Tuple.default([0, 0, 0]),
    })
    .optional(),
  /**
   * Characters: equipment already modelled into the mesh (e.g. Warrior_Sword).
   * Shown while the slot holds an item with this appearance; hidden otherwise
   * so the equipped item's own appearance can be attached instead.
   */
  builtIn: z
    .partialRecord(EquipSlotSchema, z.strictObject({ node: z.string(), appearanceId: IdSchema }))
    .default({}),
  /**
   * Seconds from the start of the attack clip to the visual hit (animation
   * event, assets plan §7). The client delays damage numbers by this much;
   * the outcome itself is already decided by the server.
   */
  hitDelay: nonNegative.default(0),
  /** Emissive tint used by elite/boss variants and rarity glows. */
  tint: z.string().optional(),
  placeholder: z.strictObject({
    shape: z.enum(['capsule', 'box', 'cone', 'sphere', 'cylinder']),
    color: z.string(),
    height: positive,
    radius: positive,
  }),
});
export type AppearanceDef = z.infer<typeof AppearanceDefSchema>;
