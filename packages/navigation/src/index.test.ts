import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildContentBundle } from '@rpg/game-data';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createNavQuery,
  generateNavMesh,
  initNavigation,
  navSourceHash,
  RecastNavQuery,
  serializeNavMesh,
} from './index';

const DATA_ROOT = join(import.meta.dirname, '../../../game-data');
const content = buildContentBundle(
  (readdirSync(DATA_ROOT, { recursive: true }) as string[])
    .filter((p) => p.endsWith('.yaml'))
    .map((p) => ({
      path: relative(DATA_ROOT, join(DATA_ROOT, p)).replace(/\\/g, '/'),
      text: readFileSync(join(DATA_ROOT, p), 'utf8'),
    })),
);

beforeAll(async () => {
  await initNavigation();
});

describe('navigation', () => {
  it('routes around a collider instead of through it', () => {
    const map = content.maps.get('map_sandbox_01');
    if (!map) throw new Error('missing map');
    const nav = new RecastNavQuery(generateNavMesh(map));
    // The plaza shrine pillar at (0,0) r 1.2 sits between these two points.
    const path = nav.findPath({ x: -4, z: 0 }, { x: 4, z: 0 });
    expect(path).not.toBeNull();
    expect((path ?? []).length).toBeGreaterThan(1);
    for (const p of path ?? []) expect(Math.hypot(p.x, p.z)).toBeGreaterThan(1.6);
    nav.destroy();
  });

  it('snaps a point inside an obstacle to walkable ground', () => {
    const map = content.maps.get('map_sandbox_01');
    if (!map) throw new Error('missing map');
    const nav = new RecastNavQuery(generateNavMesh(map));
    const p = nav.closest({ x: 0, z: 0 });
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(1.5);
    nav.destroy();
  });

  it('round-trips baked data and detects stale hashes', () => {
    const map = content.maps.get('map_forest_mechanism_01');
    if (!map) throw new Error('missing map');
    const data = serializeNavMesh(generateNavMesh(map));
    const hash = navSourceHash(map);
    const nav = createNavQuery(map, { hash, data });
    expect(nav.findPath({ x: -70, z: 0 }, { x: 50, z: 0 })).not.toBeNull();
    nav.destroy();
    expect(hash).not.toBe(navSourceHash(content.maps.get('map_sandbox_01') ?? map));
  });
});
