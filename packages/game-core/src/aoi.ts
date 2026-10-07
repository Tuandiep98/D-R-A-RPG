import type { EntityId } from "@rpg/game-protocol";
import type { Entity } from "./entity";

export interface AoiOptions {
  /** Grid cell edge, metres (tech plan §8: 30 m). */
  cellSize?: number;
  /** Network view radius, metres (tech plan §8: 60 m). */
  radius?: number;
  /** Hard client cap (tech plan §42: ~100); nearest entities win. */
  maxEntities?: number;
}

/**
 * Area of interest: which entities a viewer is told about. Server-side only;
 * entities outside a client's AOI are never sent (tech plan §7).
 */
export class SpatialGrid {
  readonly cellSize: number;
  readonly radius: number;
  readonly maxEntities: number;
  private readonly cells = new Map<string, Entity[]>();

  constructor(opts: AoiOptions = {}) {
    this.cellSize = opts.cellSize ?? 30;
    this.radius = opts.radius ?? 60;
    this.maxEntities = opts.maxEntities ?? 100;
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  /** O(n) rebuild once per tick; cheaper than incremental updates at this scale. */
  rebuild(entities: Iterable<Entity>): void {
    this.cells.clear();
    for (const e of entities) {
      const k = this.key(
        Math.floor(e.pos.x / this.cellSize),
        Math.floor(e.pos.z / this.cellSize),
      );
      const list = this.cells.get(k);
      if (list) list.push(e);
      else this.cells.set(k, [e]);
    }
  }

  /** Entities within `radius` of (x, z), nearest first, capped. `always` are included regardless. */
  query(x: number, z: number, always: readonly EntityId[] = []): Set<EntityId> {
    const span = Math.ceil(this.radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const r2 = this.radius * this.radius;
    const hits: { id: EntityId; d2: number }[] = [];
    for (let i = cx - span; i <= cx + span; i++) {
      for (let j = cz - span; j <= cz + span; j++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (const e of list) {
          const dx = e.pos.x - x;
          const dz = e.pos.z - z;
          const d2 = dx * dx + dz * dz;
          if (d2 <= r2) hits.push({ id: e.id, d2 });
        }
      }
    }
    if (hits.length > this.maxEntities) hits.sort((a, b) => a.d2 - b.d2);
    const out = new Set<EntityId>(always);
    for (const h of hits) {
      if (out.size >= this.maxEntities) break;
      out.add(h.id);
    }
    return out;
  }
}
