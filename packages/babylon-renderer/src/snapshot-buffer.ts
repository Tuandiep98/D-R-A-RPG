import type { EntitySnapshot, Snapshot } from "@rpg/game-protocol";

export interface InterpolatedEntity {
  state: EntitySnapshot;
  x: number;
  z: number;
  yaw: number;
}

/** Distance above which we snap instead of sliding (respawn, teleport). */
const SNAP_DISTANCE = 3;

/**
 * Renders entities slightly in the past, between the two snapshots that
 * bracket `now - delay`. Same code path for local and networked hosts.
 */
export class SnapshotBuffer {
  private readonly frames: { snapshot: Snapshot; time: number }[] = [];

  constructor(private readonly delayMs = 100) {}

  push(snapshot: Snapshot, time: number): void {
    this.frames.push({ snapshot, time });
    if (this.frames.length > 8) this.frames.shift();
  }

  get latest(): Snapshot | null {
    return this.frames.at(-1)?.snapshot ?? null;
  }

  sample(now: number, out: Map<number, InterpolatedEntity>): void {
    out.clear();
    const frames = this.frames;
    if (frames.length === 0) return;
    const t = now - this.delayMs;

    let i = frames.length - 1;
    while (i > 0 && (frames[i - 1] as (typeof frames)[number]).time > t) i--;
    const b = frames[i] as (typeof frames)[number];
    const a = i > 0 ? (frames[i - 1] as (typeof frames)[number]) : b;
    const span = b.time - a.time;
    const alpha = span > 0 ? Math.min(1, Math.max(0, (t - a.time) / span)) : 1;

    const prev = new Map<number, EntitySnapshot>();
    for (const e of a.snapshot.entities) prev.set(e.id, e);
    for (const e of b.snapshot.entities) {
      const p = prev.get(e.id);
      if (
        !p ||
        Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > SNAP_DISTANCE
      ) {
        out.set(e.id, { state: e, x: e.pos.x, z: e.pos.z, yaw: e.yaw });
        continue;
      }
      out.set(e.id, {
        state: e,
        x: p.pos.x + (e.pos.x - p.pos.x) * alpha,
        z: p.pos.z + (e.pos.z - p.pos.z) * alpha,
        yaw: lerpAngle(p.yaw, e.yaw, alpha),
      });
    }
  }
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
