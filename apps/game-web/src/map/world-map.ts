import type { ContentBundle, RealmDef, WorldRegionDef } from '@rpg/game-data';

/** World-map canvas (game-data/world): x 0…1000 west→east, y 0…640 north→south. */
export const WORLD_W = 1000;
export const WORLD_H = 640;

export type RegionStatus = 'current' | 'open' | 'locked' | 'unbuilt';

export interface RegionView {
  def: WorldRegionDef;
  status: RegionStatus;
  realm: RealmDef | undefined;
  label: { x: number; y: number };
}

/** Regions sorted by story order. */
export function regionsOf(content: Pick<ContentBundle, 'world'>): WorldRegionDef[] {
  return [...content.world.values()].sort((a, b) => a.order - b.order);
}

export function regionOfMap(
  content: Pick<ContentBundle, 'world'>,
  mapId: string,
): WorldRegionDef | undefined {
  for (const r of content.world.values()) if (r.maps.some((m) => m.mapId === mapId)) return r;
  return undefined;
}

/**
 * Lit or dimmed: a region is open once the player's realm reaches the
 * region's realm (D-024: realms gate the world, never levels) and it has at
 * least one built map. The realm itself comes from the server's PlayerState.
 */
export function regionStatus(
  region: WorldRegionDef,
  playerRealmOrder: number,
  realms: ReadonlyMap<string, RealmDef>,
  currentMapId: string | null,
): RegionStatus {
  if (currentMapId && region.maps.some((m) => m.mapId === currentMapId)) return 'current';
  if (region.maps.length === 0) return 'unbuilt';
  const need = realms.get(region.realm)?.order ?? Number.POSITIVE_INFINITY;
  return playerRealmOrder >= need ? 'open' : 'locked';
}

export function regionViews(
  content: Pick<ContentBundle, 'world' | 'realms'>,
  playerRealmId: string | null,
  currentMapId: string | null,
): RegionView[] {
  const order = playerRealmId ? (content.realms.get(playerRealmId)?.order ?? 0) : 0;
  return regionsOf(content).map((def) => ({
    def,
    status: regionStatus(def, order, content.realms, currentMapId),
    realm: content.realms.get(def.realm),
    label: def.label ?? centroid(def.shape),
  }));
}

export const isLit = (s: RegionStatus): boolean => s === 'current' || s === 'open';

/** Area centroid of a simple polygon (falls back to the vertex mean). */
export function centroid(points: readonly { x: number; y: number }[]): { x: number; y: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-6) {
    const n = points.length || 1;
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/**
 * Closed Catmull-Rom spline through the polygon as cubic Béziers: hand-placed
 * vertices read as a coastline instead of a polygon.
 */
export function smoothPath(points: readonly { x: number; y: number }[], tension = 0.5): string {
  const n = points.length;
  if (n < 3) return '';
  const at = (i: number) => points[((i % n) + n) % n]!;
  const r = (v: number) => Math.round(v * 10) / 10;
  let d = `M${r(at(0).x)},${r(at(0).y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const k = tension / 3;
    const c1 = { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k };
    const c2 = { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k };
    d += ` C${r(c1.x)},${r(c1.y)} ${r(c2.x)},${r(c2.y)} ${r(p2.x)},${r(p2.y)}`;
  }
  return `${d} Z`;
}

/** FNV-1a string hash → xorshift generator in [0, 1). */
function seeded(key: string): () => number {
  let seed = 2166136261;
  for (const ch of key) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

/**
 * Midpoint displacement: each edge is split `depth` times and the midpoint is
 * pushed sideways by up to `amplitude` (halving each level), seeded by the
 * region id. Coasts gain bays and capes; borders shared by neighbours stay
 * stable between opens.
 */
export function roughen(
  points: readonly { x: number; y: number }[],
  key: string,
  amplitude = 14,
  depth = 3,
): { x: number; y: number }[] {
  const rand = seeded(key);
  let pts = points.map((p) => ({ x: p.x, y: p.y }));
  let amp = amplitude;
  for (let level = 0; level < depth; level++) {
    const next: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const off = (rand() * 2 - 1) * Math.min(amp, len * 0.22);
      next.push(a, {
        x: (a.x + b.x) / 2 + (-dy / len) * off,
        y: (a.y + b.y) / 2 + (dx / len) * off,
      });
    }
    pts = next;
    amp /= 2;
  }
  return pts.map((p) => ({
    x: Math.min(WORLD_W, Math.max(0, p.x)),
    y: Math.min(WORLD_H, Math.max(0, p.y)),
  }));
}

export function pointInPolygon(
  p: { x: number; y: number },
  poly: readonly { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/**
 * Deterministic decoration points inside a region (biome motifs on the world
 * map). Seeded by the region id so the map looks the same on every open.
 */
export function motifPoints(
  region: Pick<WorldRegionDef, 'id' | 'shape'>,
  count: number,
  keepAway: readonly { x: number; y: number; r: number }[] = [],
): { x: number; y: number; s: number }[] {
  let seed = 2166136261;
  for (const ch of region.id) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909) >>> 0;
    seed ^= seed >>> 16;
    return (seed >>> 0) / 4294967296;
  };
  const xs = region.shape.map((p) => p.x);
  const ys = region.shape.map((p) => p.y);
  const min = { x: Math.min(...xs), y: Math.min(...ys) };
  const max = { x: Math.max(...xs), y: Math.max(...ys) };
  const out: { x: number; y: number; s: number }[] = [];
  for (let tries = 0; tries < count * 40 && out.length < count; tries++) {
    const p = { x: min.x + rand() * (max.x - min.x), y: min.y + rand() * (max.y - min.y) };
    if (!pointInPolygon(p, region.shape)) continue;
    // Stay off the coast so motifs never poke into the sea.
    if (!pointInPolygon({ x: p.x + 9, y: p.y }, region.shape)) continue;
    if (!pointInPolygon({ x: p.x - 9, y: p.y }, region.shape)) continue;
    if (!pointInPolygon({ x: p.x, y: p.y + 6 }, region.shape)) continue;
    if (!pointInPolygon({ x: p.x, y: p.y - 12 }, region.shape)) continue;
    if (keepAway.some((k) => Math.hypot(k.x - p.x, k.y - p.y) < k.r)) continue;
    if (out.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 17)) continue;
    out.push({ ...p, s: 0.75 + rand() * 0.5 });
  }
  // Back to front so lower motifs overlap the ones behind them.
  return out.sort((a, b) => a.y - b.y);
}

export const STATUS_LABEL: Record<RegionStatus, string> = {
  current: 'Bạn đang ở đây',
  open: 'Đã khai mở',
  locked: 'Chưa đủ cảnh giới',
  unbuilt: 'Chưa khai mở',
};
