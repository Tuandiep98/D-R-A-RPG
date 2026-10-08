import { resolve } from 'node:path';
import type { AppearanceDef, WorldRegionDef } from '@rpg/game-data';
import { loadContentFromDir } from '@rpg/game-data/node';
import { describe, expect, it } from 'vitest';
import { shade, topDown } from './minimap-render';
import {
  centroid,
  motifPoints,
  pointInPolygon,
  regionOfMap,
  regionStatus,
  regionViews,
  roughen,
  smoothPath,
  WORLD_H,
  WORLD_W,
} from './world-map';

const content = loadContentFromDir(resolve(import.meta.dirname, '../../../../game-data'));

const square = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: 200 },
  { x: 100, y: 200 },
];
const region = (over: Partial<WorldRegionDef>): WorldRegionDef => ({
  id: 'region_test',
  order: 99,
  name: 'Test',
  tagline: 'Test',
  biome: 'town',
  realm: 'truc_co',
  color: '#ffffff',
  shape: square,
  maps: [],
  links: [],
  highlights: [],
  ...over,
});

describe('world map regions', () => {
  it('lights only what the realm has opened (D-024: realms, never levels)', () => {
    const built = region({ maps: [{ mapId: 'map_x', at: { x: 150, y: 150 } }] });
    expect(regionStatus(built, 0, content.realms, null)).toBe('locked');
    expect(regionStatus(built, 1, content.realms, null)).toBe('open');
    expect(regionStatus(built, 0, content.realms, 'map_x')).toBe('current');
    expect(regionStatus(region({}), 4, content.realms, null)).toBe('unbuilt');
  });

  it('places every built map in exactly one region', () => {
    for (const id of content.maps.keys()) expect(regionOfMap(content, id)?.id).toBeDefined();
    const owners = [...content.world.values()].flatMap((r) => r.maps.map((m) => m.mapId));
    expect(new Set(owners).size).toBe(owners.length);
  });

  it('starting player in town: the start region is current, the rest dimmed', () => {
    const views = regionViews(content, 'luyen_khi', 'map_sandbox_01');
    expect(views[0]?.def.id).toBe('region_tan_nguyen');
    expect(views[0]?.status).toBe('current');
    expect(views.slice(1).every((v) => v.status === 'locked' || v.status === 'unbuilt')).toBe(true);
  });

  it('keeps every region, label and map pin on the world canvas', () => {
    for (const r of content.world.values()) {
      const label = r.label ?? centroid(r.shape);
      expect(pointInPolygon(label, r.shape)).toBe(true);
      for (const m of r.maps) expect(pointInPolygon(m.at, r.shape)).toBe(true);
      for (const p of roughen(r.shape, r.id)) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(WORLD_W);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(WORLD_H);
      }
    }
  });

  it('coastlines and motifs are deterministic per region', () => {
    expect(roughen(square, 'a')).toEqual(roughen(square, 'a'));
    expect(roughen(square, 'a')).not.toEqual(roughen(square, 'b'));
    expect(roughen(square, 'a', 14, 3)).toHaveLength(square.length * 8);
    const d = smoothPath(square);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const pts = motifPoints({ id: 'r', shape: square }, 6);
    expect(pts).toEqual(motifPoints({ id: 'r', shape: square }, 6));
    for (const p of pts) expect(pointInPolygon(p, square)).toBe(true);
  });
});

describe('minimap top-down layer', () => {
  const look = (id: string, shape: AppearanceDef['placeholder']['shape']) =>
    ({ id, placeholder: { shape, color: '#123456', height: 1, radius: 2 } }) as AppearanceDef;

  it('classifies floors, canopies and blockers; drops raised pieces', () => {
    expect(
      topDown(look('env_ground_dirt_01', 'box'), { scale: 1, position: [0, 0, 0] })?.kind,
    ).toBe('floor');
    expect(topDown(look('env_tree_01', 'cone'), { scale: 1, position: [0, 0, 0] })).toEqual({
      kind: 'canopy',
      color: '#123456',
      radius: 1.8,
    });
    expect(
      topDown(look('prop_barrel_01', 'cylinder'), {
        scale: 1,
        colliderRadius: 0.4,
        position: [0, 0, 0],
      }),
    ).toEqual({ kind: 'block', color: '#123456', radius: 0.4 });
    expect(
      topDown(look('env_village_roof_01', 'box'), { scale: 1, position: [0, 4, 0] }),
    ).toBeNull();
    expect(topDown(look('env_grass_01', 'cone'), { scale: 1, position: [0, 0, 0] })).toBeNull();
    expect(topDown(look('env_flowers_01', 'sphere'), { scale: 1, position: [0, 0, 0] })).toBeNull();
  });

  it('shades colours both ways', () => {
    expect(shade('#808080', 0.5)).toBe('#c0c0c0');
    expect(shade('#808080', -0.5)).toBe('#404040');
    expect(shade('red', 0.5)).toBe('red');
  });
});
