import { describe, expect, it } from 'vitest';
import type { EntitySnapshot } from './index';
import { DeltaDecoder, DeltaEncoder } from './net';

const ent = (id: number, x: number): EntitySnapshot => ({
  id,
  kind: 'monster',
  defId: 'wolf',
  pos: { x, z: 0 },
  yaw: 0,
  hp: 10,
  maxHp: 10,
  level: 1,
  action: 'idle',
  targetId: null,
  ownerId: null,
  phase: 0,
  cast: null,
  gear: null,
  name: null,
});
const visible = (...es: EntitySnapshot[]) =>
  new Map(es.map((e) => [e.id, { json: JSON.stringify(e), snap: e }]));

describe('snapshot deltas', () => {
  it('sends a full snapshot first, then only changes and removals', () => {
    const enc = new DeltaEncoder();
    const dec = new DeltaDecoder();
    const first = enc.encode(1, visible(ent(1, 0), ent(2, 0)));
    expect(first?.full).toBe(true);
    expect(first?.upserts).toHaveLength(2);
    expect(dec.apply(first).entities).toHaveLength(2);

    expect(enc.encode(2, visible(ent(1, 0), ent(2, 0)))).toEqual({
      tick: 2,
      full: false,
      upserts: [],
      removed: [],
    });

    const moved = enc.encode(3, visible(ent(1, 5)));
    expect(moved).toMatchObject({ full: false, removed: [2] });
    expect(moved?.upserts.map((e) => e.id)).toEqual([1]);
    const snap = dec.apply(moved);
    expect(snap.entities).toEqual([ent(1, 5)]);
  });

  it('reset forces a keyframe (e.g. after a map transfer)', () => {
    const enc = new DeltaEncoder();
    enc.encode(1, visible(ent(1, 0)));
    enc.reset();
    expect(enc.encode(2, visible(ent(1, 0)))?.full).toBe(true);
  });
});
