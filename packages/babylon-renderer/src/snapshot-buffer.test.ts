import type { EntitySnapshot, Snapshot } from '@rpg/game-protocol';
import { describe, expect, it } from 'vitest';
import { type InterpolatedEntity, lerpAngle, SnapshotBuffer } from './snapshot-buffer';

const ent = (x: number, yaw = 0): EntitySnapshot => ({
  id: 1,
  kind: 'player',
  defId: 'p',
  pos: { x, z: 0 },
  yaw,
  hp: 1,
  maxHp: 1,
  realm: 0,
  action: 'move',
  targetId: null,
  ownerId: null,
  phase: 0,
  cast: null,
  gear: null,
  name: null,
});
const snap = (tick: number, e: EntitySnapshot): Snapshot => ({
  tick,
  entities: [e],
});

describe('SnapshotBuffer', () => {
  it('interpolates between bracketing snapshots with a delay', () => {
    const buf = new SnapshotBuffer(100);
    buf.push(snap(1, ent(0)), 1000);
    buf.push(snap(2, ent(1)), 1050);
    const out = new Map<number, InterpolatedEntity>();
    buf.sample(1125, out); // render time 1025 → halfway
    expect(out.get(1)?.x).toBeCloseTo(0.5);
  });

  it('snaps on large jumps such as respawn', () => {
    const buf = new SnapshotBuffer(100);
    buf.push(snap(1, ent(0)), 1000);
    buf.push(snap(2, ent(20)), 1050);
    const out = new Map<number, InterpolatedEntity>();
    buf.sample(1125, out);
    expect(out.get(1)?.x).toBe(20);
  });

  it('lerps angles the short way round', () => {
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI);
  });
});
