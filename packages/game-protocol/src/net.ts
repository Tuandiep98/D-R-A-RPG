import { z } from "zod";
import {
  ChatMessageSchema,
  type EntityId,
  type EntitySnapshot,
  EntitySnapshotSchema,
  JoinInfoSchema,
  PlayerStateSchema,
  SimEventSchema,
  type Snapshot,
} from "./index";

/**
 * Network layer (M3). Snapshots travel as deltas: only entities whose state
 * changed since the last message to that client, plus removed ids
 * (tech plan §50 rules 9–10). A `full` delta resets the client's cache.
 */
export const SnapshotDeltaSchema = z.object({
  tick: z.number().int().nonnegative(),
  full: z.boolean(),
  upserts: z.array(EntitySnapshotSchema),
  removed: z.array(z.number().int().positive()),
});
export type SnapshotDelta = z.infer<typeof SnapshotDeltaSchema>;

/** Server → client message names and payloads. */
export const ServerMessages = {
  join: JoinInfoSchema,
  snap: SnapshotDeltaSchema,
  events: z.array(SimEventSchema),
  player: PlayerStateSchema,
  transfer: z.object({
    mapId: z.string(),
    arrival: z.string().nullable(),
    ticket: z.string(),
    /** Set for solo maps: the private instance to join. */
    instanceKey: z.string().optional(),
  }),
  chat: ChatMessageSchema,
} as const;

/** Client → server: the only message type is an intent (validated with IntentSchema). */
export const CLIENT_INTENT_MESSAGE = "intent";

/** Options a client passes when joining a zone room. */
export const JoinOptionsSchema = z.object({
  mapId: z.string().regex(/^[a-z][a-z0-9_]*$/),
  protocolVersion: z.number().int(),
  /** Signed by the server on portal use; grants the arrival point. */
  ticket: z.string().max(2048).optional(),
  /** Solo maps only: must equal the character id (checked in onAuth). */
  instanceKey: z.string().max(64).optional(),
});
export type JoinOptions = z.infer<typeof JoinOptionsSchema>;

/**
 * Per-client encoder. `encode` receives this tick's visible entities with
 * their serialized form (computed once per tick and shared by all clients).
 */
export class DeltaEncoder {
  private sent = new Map<EntityId, string>();
  private needFull = true;

  reset(): void {
    this.sent.clear();
    this.needFull = true;
  }

  encode(
    tick: number,
    visible: ReadonlyMap<EntityId, { json: string; snap: EntitySnapshot }>,
  ): SnapshotDelta {
    const upserts: EntitySnapshot[] = [];
    const removed: EntityId[] = [];
    const full = this.needFull;
    for (const [id, v] of visible) {
      if (full || this.sent.get(id) !== v.json) {
        upserts.push(v.snap);
        this.sent.set(id, v.json);
      }
    }
    for (const id of this.sent.keys()) {
      if (!visible.has(id)) {
        removed.push(id);
        this.sent.delete(id);
      }
    }
    this.needFull = false;
    // Sent even when empty: the client's clock (interpolation, cooldowns) follows the tick.
    return { tick, full, upserts, removed };
  }
}

/** Client-side: rebuilds full snapshots from deltas. */
export class DeltaDecoder {
  private readonly state = new Map<EntityId, EntitySnapshot>();
  private lastTick = -1;

  apply(delta: SnapshotDelta): Snapshot {
    if (delta.full) this.state.clear();
    for (const id of delta.removed) this.state.delete(id);
    for (const e of delta.upserts) this.state.set(e.id, e);
    this.lastTick = delta.tick;
    return { tick: delta.tick, entities: [...this.state.values()] };
  }

  /** Re-emits the current state at a newer tick (server skipped an unchanged frame). */
  get tick(): number {
    return this.lastTick;
  }

  reset(): void {
    this.state.clear();
    this.lastTick = -1;
  }
}
