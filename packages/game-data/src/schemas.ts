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

/** Flat additive bonuses (items, realms, cultivation nodes). */
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

/** Icon in the runtime media manifest (art/third_party/<pack>/SOURCE.json `media`). */
export const MediaIconIdSchema = z.string().regex(/^icon_[a-z0-9_]+$/);
/** Sound in the runtime media manifest; a list picks one at random per play. */
export const SfxIdSchema = z.string().regex(/^sfx_[a-z0-9_]+$/);
export const SfxListSchema = z.array(SfxIdSchema).min(1);

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
    type: z.literal('dash'),
    /** Travel along the held direction, or facing when standing still. */
    distance: z.number().positive().max(12),
  }),
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
  /** Runtime media id (`pnpm media:build`); the emoji `icon` stays as fallback. */
  iconImage: MediaIconIdSchema.optional(),
  targeting: SkillTargetingSchema,
  /** Max distance to target/point, metres (ignored for `self`). */
  range: nonNegative.default(0),
  castTime: nonNegative.default(0),
  cooldown: seconds,
  mpCost: z.number().int().nonnegative().default(0),
  /** Which mobile action slot may show this skill. Desktop slots accept either. */
  barRole: z.enum(['primary', 'utility']).default('primary'),
  /**
   * Show the impact area to everyone while casting (boss telegraphs, assets plan §7).
   * The impact point is locked when the cast starts, so it can be dodged.
   */
  telegraph: z.boolean().default(false),
  effects: z.array(SkillEffectSchema).min(1),
  vfx: z.string().default('slash'),
  /**
   * Presentation only: clips (names inside the caster's model) played when the
   * cast starts and when it lands. Missing → the appearance's `cast` role.
   */
  anim: z
    .strictObject({
      cast: z.string().min(1).optional(),
      castSpeed: positive.default(1),
      impact: z.string().min(1).optional(),
      impactSpeed: positive.default(1),
    })
    .optional(),
  /** Presentation only: sounds when the cast starts and when it lands. */
  sfx: z
    .strictObject({ cast: SfxListSchema.optional(), impact: SfxListSchema.optional() })
    .default({}),
});
export type SkillDef = z.infer<typeof SkillDefSchema>;

// ---------------------------------------------------------------------------
// Basic attack combos (đánh thường): chained swings, no target needed
// ---------------------------------------------------------------------------

/** Presentation of one swing: a slash ribbon / thrust / smash flash, plus hand glow. */
export const SwingTrailSchema = z.strictObject({
  shape: z.enum(['slash', 'thrust', 'smash', 'spin']),
  /** Slash sweep direction as the attacker sees it (right → left, …). */
  from: z.enum(['right', 'left', 'top']).default('right'),
  color: z.string().default('#dff4ff'),
  /** Size multiplier on the swing's reach. */
  size: positive.default(1),
  /** Sockets that glow during the wind-up (heavy hits): "hand_r", "hand_l". */
  glow: z.array(z.enum(['hand_r', 'hand_l'])).default([]),
  /**
   * What the impact looks like: `spark` (light hits), `burst` (shock flash +
   * sparks), `quake` (ground ring, dust, debris), `pierce` (a line through the
   * target), `cyclone` (a ring of wind around the attacker). Anything but
   * `spark` also adds camera shake and hit-stop.
   */
  impact: z.enum(['spark', 'burst', 'quake', 'pierce', 'cyclone']).default('spark'),
});

export const ComboVariantSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  /** Clip name in the character model (KayKit Rig_Medium; derived clips allowed). */
  clip: z.string().min(1),
  animSpeed: positive.default(1),
  /** Seconds from the press to the impact (matches the clip's contact frame / animSpeed). */
  windup: positive,
  /** Seconds after the impact before the next swing starts. */
  recovery: nonNegative,
  /** Multiplier on attack. Heavy finishers are 2.4–3.2×. */
  damage: positive,
  /** Edge-to-edge reach in metres; beyond it the swing misses. */
  reach: positive,
  /** Cone width in degrees (360 = all around). */
  arc: z.number().min(10).max(360),
  maxTargets: z.number().int().min(1).max(12).default(1),
  /** Movement speed multiplier while swinging (0 = rooted). */
  moveMultiplier: z.number().min(0).max(1),
  /** Added crit chance for this swing. */
  critBonus: chance.default(0),
  /** Metres dashed forward during the wind-up (jumping chop). */
  lunge: nonNegative.default(0),
  /**
   * Part of the wind-up the lunge happens in, as fractions [start, end]. Ending
   * it before the impact lets the (interpolated) body land with the clip.
   */
  lungeWindow: z
    .tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
    .refine(([a, b]) => b > a, 'lungeWindow end must be after start')
    .default([0, 1]),
  /** Random pick weight among a step's variants. */
  weight: positive.default(1),
  heavy: z.boolean().default(false),
  trail: SwingTrailSchema,
  /** Swing sound (default: the appearance's attack sound). */
  sfx: SfxListSchema.optional(),
  /** Extra sound when the swing connects (heavy finishers). */
  impactSfx: SfxListSchema.optional(),
});
export type ComboVariant = z.infer<typeof ComboVariantSchema>;

export const ComboDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  /** Idle seconds after a swing before the chain restarts at step 1. */
  resetAfter: seconds,
  /** Surface distance past `grazeFrom × reach` is a glancing blow ("sượt"). */
  grazeFrom: z.number().min(0.1).max(1).default(0.7),
  /** Damage factor at the very tip of the reach (linear from 1 at grazeFrom). */
  grazeMultiplier: z.number().min(0.1).max(1).default(0.5),
  /** Targets this far past the reach still show "Trượt" (miss) feedback. */
  missMargin: nonNegative.default(0.8),
  /** Yếu hại: hits landing on the target's back / flank. */
  weakPoint: z
    .strictObject({ back: z.number().min(1).default(1.6), flank: z.number().min(1).default(1.25) })
    .default({ back: 1.6, flank: 1.25 }),
  /** Aim assist: turn toward a hostile within this many degrees of the facing. */
  assistAngle: z.number().min(0).max(180).default(70),
  /** Each step is one swing; a step with several variants picks one at random. */
  steps: z
    .array(z.strictObject({ variants: z.array(ComboVariantSchema).min(1) }))
    .min(1)
    .max(6),
});
export type ComboDef = z.infer<typeof ComboDefSchema>;

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
    /** Runtime media id (`pnpm media:build`); the emoji `icon` stays as fallback. */
    iconImage: MediaIconIdSchema.optional(),
    description: z.string().default(''),
    slot: EquipSlotSchema.optional(),
    /** Minimum realm to equip/use (no character level — master plan §31). */
    realm: IdSchema.optional(),
    bonus: StatBonusSchema.optional(),
    /** Consumables: fraction of max HP restored. */
    heal: chance.optional(),
    cooldown: nonNegative.default(0),
    maxStack: z.number().int().positive().default(1),
    sellPrice: z.number().int().nonnegative().default(0),
    /** Presentation (assets plan §6): many items may share one appearance. */
    appearanceId: IdSchema.optional(),
    /** Main-hand weapons: basic-attack combo used while equipped (default: character's armed). */
    combo: IdSchema.optional(),
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
    .strictObject({
      min: z.number().int().nonnegative(),
      max: z.number().int().nonnegative(),
    })
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

const ItemCostSchema = z.strictObject({
  itemId: IdSchema,
  count: z.number().int().positive(),
});

/**
 * Global progression rules (master plan §56–57). One file; the first one wins.
 * Realm gap: damage multiplier by how many realms the attacker is below
 * (`lower[0]` = one realm below) or above (`higher[0]` = one realm above).
 * Gaps past the end of a list use its last entry.
 */
export const ProgressionRulesSchema = z.strictObject({
  id: IdSchema,
  realmGap: z.strictObject({
    lower: z.array(positive).min(1),
    higher: z.array(positive).min(1),
  }),
  /** Breakthrough only inside a safe zone (never mid-fight). */
  breakthroughInSafeZone: z.boolean().default(true),
});
export type ProgressionRules = z.infer<typeof ProgressionRulesSchema>;

/**
 * Cảnh giới (master plan §38–55). A realm is a leap in what the character is,
 * not a level: it sets the stat floor and how much cultivation the body can
 * carry. Tu Tiên and Cơ Giới names describe the same step.
 */
export const RealmDefSchema = z.strictObject({
  id: IdSchema,
  /** 0 = starting realm; must be contiguous. */
  order: z.number().int().nonnegative(),
  name: z.string().min(1),
  /** Cơ Giới name of the same realm (Core Awakening, Foundation Frame…). */
  mechName: z.string().min(1),
  description: z.string().default(''),
  /** Total bonus while in this realm (not cumulative with lower realms). */
  bonus: StatBonusSchema.default({
    hp: 0,
    mp: 0,
    attack: 0,
    defense: 0,
    critChance: 0,
    speed: 0,
  }),
  /** Kinh Mạch Tải: meridian capacity for Tiên-path nodes (§72). */
  meridianCapacity: z.number().int().nonnegative(),
  /** Body Load: capacity for Cơ-path nodes (§71). */
  bodyLoad: z.number().int().nonnegative(),
  /**
   * How to break through INTO this realm (§59–62). Missing → not reachable in
   * this build. Failure never loses progression: materials are spent and a
   * temporary backlash weakens attacks.
   */
  breakthrough: z
    .strictObject({
      /** Cultivation nodes that must be open (stable foundation). */
      minNodes: z.number().int().nonnegative(),
      /** Trials/knowledge: quests that must be turned in. */
      quests: z.array(IdSchema).default([]),
      materials: z.array(ItemCostSchema).default([]),
      gold: z.number().int().nonnegative().default(0),
      baseChance: chance,
      /** Stability: each node beyond `minNodes` adds this to the chance. */
      chancePerExtraNode: chance.default(0),
      backlashSeconds: seconds,
      /** Attack multiplier while backlash lasts. */
      backlashAttack: z.number().min(0).max(1),
    })
    .optional(),
});
export type RealmDef = z.infer<typeof RealmDefSchema>;

export const CultivationAxisSchema = z.enum(['than', 'nang_luong', 'than_thuc', 'dao']);
export type CultivationAxis = z.infer<typeof CultivationAxisSchema>;

/** tien = Tiên Đạo, co = Cơ Đạo, hon_nguyen = hybrid (uses both capacities). */
export const CultivationPathSchema = z.enum(['tien', 'co', 'hon_nguyen']);
export type CultivationPath = z.infer<typeof CultivationPathSchema>;

/**
 * One step of building a character (master plan §32–36, §71–73): opening a
 * meridian, an augmentation, a technique. Nodes change what you can do
 * (`skillId`), not only numbers. Capacity forces choices.
 */
export const CultivationNodeDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().default(''),
  icon: z.string().default('✦'),
  axis: CultivationAxisSchema,
  path: CultivationPathSchema,
  /** Minimum realm. */
  realm: IdSchema,
  /** Nodes that must be open first. */
  requires: z.array(IdSchema).default([]),
  /** Knowledge: quests that must be turned in first. */
  quests: z.array(IdSchema).default([]),
  cost: z
    .strictObject({
      gold: z.number().int().nonnegative().default(0),
      materials: z.array(ItemCostSchema).default([]),
    })
    .default({ gold: 0, materials: [] }),
  /** Meridian capacity used. */
  meridian: z.number().int().nonnegative().default(0),
  /** Body load used. */
  body: z.number().int().nonnegative().default(0),
  bonus: StatBonusSchema.optional(),
  /** Skill unlocked by this node (appended to the skill bar). */
  skillId: IdSchema.optional(),
});
export type CultivationNodeDef = z.infer<typeof CultivationNodeDefSchema>;

// ---------------------------------------------------------------------------
// Characters and monsters
// ---------------------------------------------------------------------------

export const CharacterDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  appearanceId: IdSchema,
  stats: StatsSchema,
  movement: MovementDefSchema,
  combat: CombatDefSchema,
  /** Basic-attack combos: bare hands, and any main-hand weapon without its own `combo`. */
  combos: z.strictObject({ unarmed: IdSchema, armed: IdSchema }),
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
  /** Cảnh giới; the realm gap scales damage both ways (master plan §57). */
  realm: IdSchema,
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
  /** Minimum realm to accept. */
  realm: IdSchema.optional(),
  /** Quests that must be turned in first. */
  requires: z.array(IdSchema).default([]),
  objectives: z.array(QuestObjectiveSchema).min(1),
  /** Collected items are removed on turn-in. */
  consumeItems: z.boolean().default(true),
  rewards: z.strictObject({
    gold: z.number().int().nonnegative().default(0),
    items: z
      .array(
        z.strictObject({
          itemId: IdSchema,
          count: z.number().int().positive().default(1),
        }),
      )
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
  result: z.strictObject({
    itemId: IdSchema,
    count: z.number().int().positive().default(1),
  }),
  materials: z.array(ItemCostSchema).min(1),
  gold: z.number().int().nonnegative().default(0),
  /** Minimum realm. */
  realm: IdSchema.optional(),
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
          .array(
            z.strictObject({
              itemId: IdSchema,
              count: z.number().int().positive(),
            }),
          )
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

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colour must be #rrggbb');

/**
 * Ground painting (presentation only): the flat ground is one subdivided mesh
 * coloured per vertex, so paths and camps read clearly at the cost of zero
 * extra draw calls. Gameplay never reads this.
 */
export const GroundPaintSchema = z.strictObject({
  /** Colours blended into the base colour by low-frequency noise. */
  variation: z.array(HexColor).default([]),
  /** Size of one noise cell, metres. */
  noiseScale: positive.default(14),
  /** 0 = flat base colour, 1 = full variation. */
  noiseAmount: z.number().min(0).max(1).default(0.6),
  /** Polylines such as dirt roads. */
  strokes: z
    .array(
      z.strictObject({
        points: z.array(Vec2).min(2),
        width: positive,
        color: HexColor,
        /** Soft edge width, metres. */
        edge: nonNegative.default(1.5),
      }),
    )
    .default([]),
  /** Filled circles such as camp floors or arenas. */
  patches: z
    .array(
      z.strictObject({
        center: Vec2,
        radius: positive,
        color: HexColor,
        edge: nonNegative.default(2),
      }),
    )
    .default([]),
});
export type GroundPaint = z.infer<typeof GroundPaintSchema>;

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
      paint: GroundPaintSchema.optional(),
    }),
    playerSpawn: Vec2,
    arrivals: z.array(z.strictObject({ id: IdSchema, position: Vec2 })).default([]),
    chunks: z.array(MapChunkSchema).min(1),
    spawns: z.array(MapSpawnSchema).default([]),
    portals: z.array(MapPortalSchema).default([]),
    zones: z.array(MapZoneSchema).default([]),
    npcs: z
      .array(
        z.strictObject({
          npcId: IdSchema,
          position: Vec2,
          rotationY: z.number().default(0),
        }),
      )
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
   * Equipment appearances shown when the entity has nothing in that slot —
   * e.g. a skeleton's blade (monsters carry no inventory). Real gear wins.
   */
  defaultGear: z.partialRecord(EquipSlotSchema, IdSchema).default({}),
  /**
   * Seconds from the start of the attack clip to the visual hit (animation
   * event, assets plan §7). The client delays damage numbers by this much;
   * the outcome itself is already decided by the server.
   */
  hitDelay: nonNegative.default(0),
  /** Emissive tint used by elite/boss variants and rarity glows. */
  tint: z.string().optional(),
  /** Sounds by moment (presentation only); missing → renderer defaults. */
  sfx: z.partialRecord(z.enum(['attack', 'hit', 'death']), SfxListSchema).default({}),
  placeholder: z.strictObject({
    shape: z.enum(['capsule', 'box', 'cone', 'sphere', 'cylinder']),
    color: z.string(),
    height: positive,
    radius: positive,
  }),
});
export type AppearanceDef = z.infer<typeof AppearanceDefSchema>;
