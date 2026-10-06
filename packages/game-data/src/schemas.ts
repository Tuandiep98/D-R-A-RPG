import { z } from 'zod';

/** Stable content id: lowercase snake_case. */
export const IdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'id must be lowercase snake_case');

const Vec2 = z.strictObject({ x: z.number().finite(), z: z.number().finite() });
const Vec3Tuple = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const positive = z.number().finite().positive();
const nonNegative = z.number().finite().nonnegative();
const seconds = positive.describe('seconds');

// ---------------------------------------------------------------------------
// Gameplay definitions
// ---------------------------------------------------------------------------

export const StatsSchema = z.strictObject({
  hp: z.number().int().positive(),
  attack: nonNegative,
  defense: nonNegative,
  critChance: z.number().min(0).max(1).default(0.05),
  critMultiplier: z.number().min(1).default(1.5),
});

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

export const CharacterDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  appearanceId: IdSchema,
  stats: StatsSchema,
  movement: MovementDefSchema,
  combat: CombatDefSchema,
  respawnSeconds: seconds,
});
export type CharacterDef = z.infer<typeof CharacterDefSchema>;

export const MonsterTierSchema = z.enum(['normal', 'elite', 'mini_boss', 'boss', 'world_boss']);

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
  lootTable: z.array(IdSchema).default([]),
});
export type MonsterDef = z.infer<typeof MonsterDefSchema>;

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

export const MapDefSchema = z
  .strictObject({
    id: IdSchema,
    name: z.string().min(1),
    schemaVersion: z.literal(1),
    seed: z.number().int(),
    bounds: z.strictObject({ min: Vec2, max: Vec2 }),
    ground: z.strictObject({ appearanceId: IdSchema.optional(), color: z.string().default('#5f8a4a') }),
    playerSpawn: Vec2,
    chunks: z.array(MapChunkSchema).min(1),
    spawns: z.array(MapSpawnSchema).default([]),
  })
  .refine((m) => m.bounds.min.x < m.bounds.max.x && m.bounds.min.z < m.bounds.max.z, {
    message: 'bounds.min must be smaller than bounds.max',
    path: ['bounds'],
  });
export type MapDef = z.infer<typeof MapDefSchema>;

// ---------------------------------------------------------------------------
// Presentation: how a definition looks. Gameplay never reads this.
// ---------------------------------------------------------------------------

export const AnimationRoleSchema = z.enum(['idle', 'run', 'attack', 'hit', 'death']);
export type AnimationRole = z.infer<typeof AnimationRoleSchema>;

export const AppearanceDefSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(['character', 'monster', 'environment', 'ground']),
  /** Asset id in the runtime manifest. Missing asset → placeholder. */
  modelAssetId: IdSchema.optional(),
  scale: positive.default(1),
  /** Extra rotation applied to the model so it faces +Z. */
  yawOffset: z.number().finite().default(0),
  /** Clip names inside the model, by role. */
  animations: z.partialRecord(AnimationRoleSchema, z.string()).default({}),
  placeholder: z.strictObject({
    shape: z.enum(['capsule', 'box', 'cone', 'sphere', 'cylinder']),
    color: z.string(),
    height: positive,
    radius: positive,
  }),
});
export type AppearanceDef = z.infer<typeof AppearanceDefSchema>;
