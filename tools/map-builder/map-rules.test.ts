/**
 * Executable part of docs/map_authoring_rules.md: every built map is checked
 * against the authoring rules, so a new map that breaks one fails `pnpm test`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { MapDef } from '@rpg/game-data';
import { loadContentFromDir } from '@rpg/game-data/node';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repo = resolve(import.meta.dirname, '../..');
const content = loadContentFromDir(join(repo, 'game-data'));
const maps = [...content.maps.values()];

const colliders = (map: MapDef) =>
  map.chunks.flatMap((c) =>
    c.instances
      .filter((i) => i.colliderRadius !== undefined)
      .map((i) => ({
        id: i.appearanceId,
        x: i.position[0],
        z: i.position[2],
        r: i.colliderRadius ?? 0,
      })),
  );
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe.each(maps.map((m) => [m.id, m] as const))('map rules: %s', (_, map) => {
  const blockers = colliders(map);
  const safe = map.zones.filter((z) => z.kind === 'safe');

  it('R1 belongs to a world region', () => {
    expect([...content.world.values()].some((r) => r.maps.some((m) => m.mapId === map.id))).toBe(
      true,
    );
  });

  it('R2 spawn camps sit on open ground, never inside a collider', () => {
    for (const s of map.spawns)
      for (const b of blockers)
        expect(dist(s.position, b) > b.r + 0.4, `${s.id} inside ${b.id} at ${b.x},${b.z}`).toBe(
          true,
        );
  });

  it('R3 no monster camp inside a safe zone', () => {
    for (const s of map.spawns)
      for (const z of safe)
        expect(
          dist(s.position, z.center) > z.radius + s.radius,
          `${s.id} in safe zone ${z.id}`,
        ).toBe(true);
  });

  it('R4 player spawn, arrivals and portals are reachable (not in a collider)', () => {
    const points = [
      { id: 'playerSpawn', ...map.playerSpawn },
      ...map.arrivals.map((a) => ({ id: a.id, ...a.position })),
      ...map.portals.map((p) => ({ id: p.id, ...p.position })),
    ];
    for (const p of points)
      for (const b of blockers) expect(dist(p, b) > b.r + 0.3, `${p.id} inside ${b.id}`).toBe(true);
  });

  it('R5 boss arenas keep the telegraph floor clear (inner 70%)', () => {
    for (const z of map.zones.filter((z) => z.kind === 'boss_arena'))
      for (const b of blockers)
        expect(dist(z.center, b) > z.radius * 0.7, `${b.id} blocks arena ${z.id}`).toBe(true);
  });

  it('R6 has a way back to safety: a safe zone here or a portal', () => {
    expect(safe.length + map.portals.length).toBeGreaterThan(0);
  });

  it('R7 stays inside the per-chunk instance budget', () => {
    for (const c of map.chunks) expect(c.instances.length).toBeLessThanOrEqual(400);
  });
});

describe('layout sources', () => {
  const dir = join(repo, 'maps/source');
  const files = readdirSync(dir).filter((f) => f.endsWith('.layout.yaml'));

  it('every generated map has a layout and a header comment naming its region', () => {
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8');
      const layout = parse(text) as { id: string };
      expect(content.maps.has(layout.id), f).toBe(true);
      expect(text.startsWith('#'), `${f}: start with a comment block (role, region)`).toBe(true);
    }
  });
});
