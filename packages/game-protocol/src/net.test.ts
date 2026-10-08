import { describe, expect, it } from 'vitest';
import { type EntitySnapshot, type SimEvent, SimEventSchema } from './index';
import { DeltaDecoder, DeltaEncoder, EventDeduper } from './net';

const ent = (id: number, x: number): EntitySnapshot => ({
  id,
  kind: 'monster',
  defId: 'wolf',
  pos: { x, z: 0 },
  yaw: 0,
  hp: 10,
  maxHp: 10,
  realm: 0,
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

describe('event replay dedupe', () => {
  it('retains separate damage payloads for one action while dropping repeated events', () => {
    const deduper = new EventDeduper();
    const damage: SimEvent = {
      type: 'DAMAGE',
      eventId: 1,
      actionId: 7,
      sourceId: 1,
      targetId: 2,
      amount: 10,
      crit: false,
      skillId: 'slash',
    };
    const second = { ...damage, eventId: 2, amount: 5 };
    expect(deduper.filter([damage, damage, second])).toEqual([damage, second]);
    expect(deduper.filter([second, damage])).toEqual([]);
  });

  it('rejects expired replays but accepts unseen events inside the window and a new world sequence', () => {
    const deduper = new EventDeduper();
    const old: SimEvent = { type: 'SPAWN', id: 1, eventId: 1 };
    const latest: SimEvent = { type: 'SPAWN', id: 2, eventId: 4097 };
    const delayed: SimEvent = { type: 'SPAWN', id: 3, eventId: 4096 };
    expect(deduper.filter([old, latest])).toEqual([old, latest]);
    expect(deduper.filter([old, delayed])).toEqual([delayed]);
    deduper.reset();
    expect(deduper.filter([old])).toEqual([old]);
  });

  it('validates event sequence ids and keeps legacy recordings without ids intact', () => {
    for (const eventId of [0, -1, 1.5, NaN, Infinity])
      expect(SimEventSchema.safeParse({ type: 'SPAWN', id: 1, eventId }).success).toBe(false);
    const legacy: SimEvent = { type: 'SPAWN', id: 1 };
    expect(new EventDeduper().filter([legacy, legacy])).toEqual([legacy, legacy]);
  });
});

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
