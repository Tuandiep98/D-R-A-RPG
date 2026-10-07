import type { NavQuery, Vec2 } from "@rpg/game-core";
import type { MapDef } from "@rpg/game-data";
import {
  exportNavMesh,
  importNavMesh,
  init,
  type NavMesh,
  NavMeshQuery,
} from "recast-navigation";
import { generateSoloNavMesh } from "recast-navigation/generators";

/**
 * Recast/Detour navigation shared by the local sim and the game server
 * (decision D-008). Pure WASM + TypeScript: no DOM, no renderer.
 */

let ready: Promise<void> | null = null;

/** Loads the WASM module once. Must resolve before any other call. */
export function initNavigation(): Promise<void> {
  ready ??= init();
  return ready;
}

/** Agent and voxel settings. Changing them invalidates baked navmeshes. */
export const NAV_CONFIG = {
  cs: 0.25,
  ch: 0.2,
  agentRadius: 0.45,
  agentHeight: 1.8,
  agentClimb: 0.4,
  obstacleHeight: 2.5,
  obstacleSides: 10,
} as const;

/** Bump when geometry generation changes so stale baked files are rebuilt. */
export const NAV_VERSION = 1;

/** Ground quad + one prism per collider, in world space (Y up). */
export function buildNavGeometry(map: MapDef): {
  positions: number[];
  indices: number[];
} {
  const positions: number[] = [];
  const indices: number[] = [];
  const { min, max } = map.bounds;
  positions.push(
    min.x,
    0,
    min.z,
    max.x,
    0,
    min.z,
    max.x,
    0,
    max.z,
    min.x,
    0,
    max.z,
  );
  indices.push(0, 2, 1, 0, 3, 2);

  const h = NAV_CONFIG.obstacleHeight;
  const n = NAV_CONFIG.obstacleSides;
  for (const chunk of map.chunks) {
    for (const inst of chunk.instances) {
      if (inst.colliderRadius === undefined) continue;
      const r = inst.colliderRadius * inst.scale;
      const [cx, , cz] = inst.position;
      const base = positions.length / 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        positions.push(x, 0, z, x, h, z);
      }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const b0 = base + i * 2;
        const t0 = b0 + 1;
        const b1 = base + j * 2;
        const t1 = b1 + 1;
        indices.push(b0, t0, b1, b1, t0, t1); // side walls
      }
      const top = positions.length / 3;
      positions.push(cx, h, cz);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        indices.push(top, base + j * 2 + 1, base + i * 2 + 1); // cap (keeps the prism closed)
      }
    }
  }
  return { positions, indices };
}

/** Stable hash of everything that affects the navmesh; stored next to baked files. */
export function navSourceHash(map: MapDef): string {
  const { positions } = buildNavGeometry(map);
  let h = 2166136261 ^ NAV_VERSION;
  const s = JSON.stringify([
    NAV_CONFIG,
    positions.map((v) => Math.round(v * 100)),
  ]);
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function generateNavMesh(map: MapDef): NavMesh {
  const { positions, indices } = buildNavGeometry(map);
  const { cs, ch } = NAV_CONFIG;
  const result = generateSoloNavMesh(positions, indices, {
    cs,
    ch,
    walkableSlopeAngle: 40,
    walkableHeight: Math.ceil(NAV_CONFIG.agentHeight / ch),
    walkableClimb: Math.floor(NAV_CONFIG.agentClimb / ch),
    walkableRadius: Math.ceil(NAV_CONFIG.agentRadius / cs),
    maxEdgeLen: 12 / cs,
    maxSimplificationError: 1.3,
    minRegionArea: 8,
    mergeRegionArea: 20,
    maxVertsPerPoly: 6,
    detailSampleDist: 6,
    detailSampleMaxError: 1,
  });
  if (!result.success)
    throw new Error(`navmesh generation failed for ${map.id}: ${result.error}`);
  return result.navMesh;
}

export const serializeNavMesh = (navMesh: NavMesh): Uint8Array =>
  exportNavMesh(navMesh);

export function deserializeNavMesh(data: Uint8Array): NavMesh {
  const { navMesh } = importNavMesh(data);
  if (!navMesh) throw new Error("invalid navmesh data");
  return navMesh;
}

/** Detour-backed implementation of game-core's NavQuery. */
export class RecastNavQuery implements NavQuery {
  private readonly query: NavMeshQuery;
  private readonly halfExtents = { x: 4, y: 4, z: 4 };

  constructor(readonly navMesh: NavMesh) {
    this.query = new NavMeshQuery(navMesh);
  }

  findPath(from: Vec2, to: Vec2): Vec2[] | null {
    const res = this.query.computePath(
      { x: from.x, y: 0, z: from.z },
      { x: to.x, y: 0, z: to.z },
      { halfExtents: this.halfExtents },
    );
    if (!res.success || res.path.length === 0) return null;
    // Detour includes the start point; game-core expects only what is ahead.
    return res.path.slice(1).map((p) => ({ x: p.x, z: p.z }));
  }

  closest(p: Vec2): Vec2 {
    const res = this.query.findClosestPoint(
      { x: p.x, y: 0, z: p.z },
      { halfExtents: this.halfExtents },
    );
    return res.success ? { x: res.point.x, z: res.point.z } : { ...p };
  }

  destroy(): void {
    this.query.destroy();
    this.navMesh.destroy();
  }
}

/**
 * Uses baked data when it matches the map, otherwise generates at runtime
 * (and says so — runtime generation is a fallback, tech plan §23).
 */
export function createNavQuery(
  map: MapDef,
  baked?: { hash: string; data: Uint8Array } | null,
): RecastNavQuery {
  if (baked && baked.hash === navSourceHash(map))
    return new RecastNavQuery(deserializeNavMesh(baked.data));
  if (baked)
    console.warn(
      `[nav] baked navmesh for ${map.id} is stale; generating at runtime`,
    );
  return new RecastNavQuery(generateNavMesh(map));
}
