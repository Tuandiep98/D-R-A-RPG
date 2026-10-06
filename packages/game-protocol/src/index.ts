import { z } from 'zod';

/**
 * Wire contract between client and simulation host (local or server).
 * Bump PROTOCOL_VERSION on any breaking change to these schemas.
 */
export const PROTOCOL_VERSION = 1;

/** Max world coordinate magnitude accepted from a client, in metres. */
export const MAX_COORD = 10_000;

const coord = z.number().finite().min(-MAX_COORD).max(MAX_COORD);

/** Position on the ground plane. Gameplay runs on XZ; Y is presentation only. */
export const Vec2Schema = z.object({ x: coord, z: coord });
export type Vec2 = z.infer<typeof Vec2Schema>;

export const EntityIdSchema = z.number().int().positive();
export type EntityId = z.infer<typeof EntityIdSchema>;

// ---------------------------------------------------------------------------
// Client → host
// ---------------------------------------------------------------------------

export const IntentSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('MOVE_TO'), target: Vec2Schema }),
  z.strictObject({ type: z.literal('ATTACK_TARGET'), targetId: EntityIdSchema }),
  z.strictObject({ type: z.literal('STOP') }),
]);
export type Intent = z.infer<typeof IntentSchema>;
export type IntentType = Intent['type'];

// ---------------------------------------------------------------------------
// Host → client
// ---------------------------------------------------------------------------

export const EntityKindSchema = z.enum(['player', 'monster']);
export type EntityKind = z.infer<typeof EntityKindSchema>;

/** Coarse action used by the client to pick a looping animation. */
export const EntityActionSchema = z.enum(['idle', 'move', 'combat', 'dead']);
export type EntityAction = z.infer<typeof EntityActionSchema>;

export const EntitySnapshotSchema = z.object({
  id: EntityIdSchema,
  kind: EntityKindSchema,
  /** Content definition id (character or monster). */
  defId: z.string(),
  pos: Vec2Schema,
  /** Facing angle in radians: atan2(dx, dz), 0 faces +Z. */
  yaw: z.number().finite(),
  hp: z.number().int().nonnegative(),
  maxHp: z.number().int().positive(),
  action: EntityActionSchema,
  targetId: EntityIdSchema.nullable(),
});
export type EntitySnapshot = z.infer<typeof EntitySnapshotSchema>;

export const SnapshotSchema = z.object({
  tick: z.number().int().nonnegative(),
  entities: z.array(EntitySnapshotSchema),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

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
  }),
  z.object({ type: z.literal('DEATH'), id: EntityIdSchema, killerId: EntityIdSchema.nullable() }),
  z.object({ type: z.literal('RESPAWN'), id: EntityIdSchema }),
]);
export type SimEvent = z.infer<typeof SimEventSchema>;

/** Sent by the host once a client has joined. */
export const JoinInfoSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  playerId: EntityIdSchema,
  mapId: z.string(),
  tickRate: z.number().int().positive(),
});
export type JoinInfo = z.infer<typeof JoinInfoSchema>;
