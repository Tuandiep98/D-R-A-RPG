import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildContentBundle } from '@rpg/game-data';
import type { Intent, JoinInfo, PlayerState, SimEvent, Snapshot } from '@rpg/game-protocol';
import { describe, expect, it } from 'vitest';
import { LocalSimHost, type MessageEndpoint, serveSimHost, WorkerSimHost } from './index';

const DATA_ROOT = join(import.meta.dirname, '../../../game-data');

function loadRealContent() {
  const files = (readdirSync(DATA_ROOT, { recursive: true }) as string[])
    .filter((p) => p.endsWith('.yaml'))
    .map((p) => ({
      path: relative(DATA_ROOT, join(DATA_ROOT, p)).replace(/\\/g, '/'),
      text: readFileSync(join(DATA_ROOT, p), 'utf8'),
    }));
  return buildContentBundle(files);
}
const content = loadRealContent();

const makeHost = (maxIntentsPerSecond?: number) =>
  new LocalSimHost({
    content,
    mapId: 'map_sandbox_01',
    characterId: 'player_default',
    autoRun: false,
    maxIntentsPerSecond,
  });

describe('LocalSimHost', () => {
  it('joins and publishes snapshots and private player state', async () => {
    const host = makeHost();
    const join = await host.connect();
    let last: Snapshot | null = null;
    let state: PlayerState | null = null;
    host.onSnapshot((s) => {
      last = s;
    });
    host.onPlayerState((s) => {
      state = s;
    });
    host.stepOnce();
    host.stepOnce();
    expect(join.playerId).toBeGreaterThan(0);
    const snap = last as unknown as Snapshot;
    expect(snap.entities.find((e) => e.id === join.playerId)?.kind).toBe('player');
    expect(snap.entities.filter((e) => e.kind === 'monster')).toHaveLength(5);
    expect(snap.entities.filter((e) => e.kind === 'portal')).toHaveLength(1);
    const ps = state as unknown as PlayerState;
    expect(ps.skills).toHaveLength(10); // seven prototype skills plus three universal movement actions
    expect(ps.realm).toBe('luyen_khi');
    expect(ps.inventory.length).toBeGreaterThan(0);
    host.dispose();
  });

  it('drops malformed intents instead of passing them to the world', async () => {
    const host = makeHost();
    await host.connect();
    host.sendIntent({ type: 'MOVE_TO', target: { x: 'a', z: 0 } });
    host.sendIntent({ type: 'ADD_GOLD', amount: 99999 });
    host.sendIntent(null);
    host.stepOnce();
    expect(host.debug?.droppedIntents).toBe(3);
    expect(host.debug?.rejectedIntents).toBe(0);
    host.dispose();
  });

  it('rate limits intent spam', async () => {
    const host = makeHost(5);
    await host.connect();
    for (let i = 0; i < 20; i++) host.sendIntent({ type: 'STOP' });
    expect(host.debug?.droppedIntents).toBe(15);
    host.dispose();
  });

  it('moves the player to another map through a portal, keeping inventory', async () => {
    const host = makeHost();
    const first = await host.connect();
    const joins: JoinInfo[] = [];
    host.onJoin((j) => joins.push(j));
    let snap: Snapshot | null = null;
    host.onSnapshot((s) => {
      snap = s;
    });
    host.stepOnce();
    const portal = (snap as unknown as Snapshot).entities.find((e) => e.kind === 'portal');
    host.sendIntent({ type: 'INTERACT', entityId: portal?.id });
    // The town gate is ~46 m from the plaza spawn (5 m/s): allow 15 s of sim.
    for (let i = 0; i < 20 * 15 && joins.length === 0; i++) {
      host.stepOnce();
      await Promise.resolve();
    }
    expect(joins[0]?.mapId).toBe('map_forest_mechanism_01');
    expect(host.debug?.mapId).toBe('map_forest_mechanism_01');
    expect(first.mapId).toBe('map_sandbox_01');
    expect(joins[0]).toMatchObject({
      combatContent: first.combatContent,
      combatRuleset: first.combatRuleset,
    });
    host.dispose();
  });
});

/** In-memory pair of endpoints standing in for a Worker and its global scope. */
function channel(): [MessageEndpoint, MessageEndpoint] {
  const make = () => {
    const listeners = new Set<(ev: { data: unknown }) => void>();
    return {
      listeners,
      endpoint: {
        postMessage: (_: unknown) => {},
        addEventListener: (_t: 'message', l: (ev: { data: unknown }) => void) => listeners.add(l),
        removeEventListener: (_t: 'message', l: (ev: { data: unknown }) => void) =>
          listeners.delete(l),
      } as MessageEndpoint,
    };
  };
  const a = make();
  const b = make();
  a.endpoint.postMessage = (m) =>
    queueMicrotask(() => {
      for (const l of b.listeners) l({ data: structuredClone(m) });
    });
  b.endpoint.postMessage = (m) =>
    queueMicrotask(() => {
      for (const l of a.listeners) l({ data: structuredClone(m) });
    });
  return [a.endpoint, b.endpoint];
}

describe('WorkerSimHost', () => {
  it('drops repeated event deliveries, preserves multi-effect damage and resets on join', async () => {
    const [main, worker] = channel();
    const inner = makeHost();
    serveSimHost(worker, inner);
    const host = new WorkerSimHost(main);
    const join = await host.connect();
    const received: SimEvent[] = [];
    host.onEvents((events) => received.push(...events));
    const first: SimEvent = {
      type: 'DAMAGE',
      eventId: 1,
      actionId: 7,
      sourceId: join.playerId,
      targetId: 1,
      amount: 10,
      crit: false,
      skillId: 'skill_thunder_arc',
    };
    const second = { ...first, eventId: 2, amount: 5 };
    worker.postMessage({ t: 'events', events: [first, second] });
    worker.postMessage({ t: 'events', events: [first, second] });
    await Promise.resolve();
    expect(received).toEqual([first, second]);
    worker.postMessage({ t: 'join', join, reply: false });
    worker.postMessage({ t: 'events', events: [first] });
    await Promise.resolve();
    expect(received).toEqual([first, second, first]);
    host.dispose();
  });

  it.each(['classic', 'elements_v1'] as const)(
    'replays identical seeded combat across local and worker transports with %s rules',
    async (combatRuleset) => {
      const opts = {
        content,
        mapId: 'map_sandbox_01',
        characterId: 'player_default',
        seed: 77123,
        autoRun: false,
        combatRuleset,
        combatContent: 'prototype' as const,
      };
      const direct = new LocalSimHost(opts);
      const inner = new LocalSimHost(opts);
      const [main, worker] = channel();
      serveSimHost(worker, inner);
      const proxied = new WorkerSimHost(main);
      const trace = () => ({
        snapshots: [] as Snapshot[],
        states: [] as PlayerState[],
        events: [] as SimEvent[],
      });
      const a = trace(),
        b = trace();
      for (const [host, record] of [
        [direct, a],
        [proxied, b],
      ] as const) {
        host.onSnapshot((snap) => record.snapshots.push(snap));
        host.onPlayerState((state) => record.states.push(state));
        host.onEvents((events) => record.events.push(...events));
      }
      expect(await direct.connect()).toEqual(await proxied.connect());
      const script = new Map<number, Intent[]>([
        [1, [{ type: 'MOVE_DIR', dir: { x: 0, z: 1 } }]],
        [8, [{ type: 'MOBILITY', action: 'roll' }]],
        [20, [{ type: 'STOP' }, { type: 'BASIC_ATTACK', aim: { x: 0, z: 0 } }]],
        [22, [{ type: 'CAST_SKILL', skillId: 'skill_thunder_leap' }]],
        [24, [{ type: 'BASIC_ATTACK' }]],
        [40, [{ type: 'MOBILITY', action: 'blink', point: { x: 0, z: 0 } }]],
        [60, [{ type: 'MOBILITY', action: 'jump' }]],
        [80, [{ type: 'CAST_SKILL', skillId: 'skill_thunder_pierce', point: { x: 3, z: 3 } }]],
        [100, [{ type: 'SET_FARM', enabled: true }]],
        [130, [{ type: 'MOVE_DIR', dir: { x: 1, z: 0 } }]],
        [150, [{ type: 'STOP' }]],
      ]);
      for (let tick = 1; tick <= 200; tick++) {
        for (const intent of script.get(tick) ?? []) {
          direct.sendIntent(intent);
          proxied.sendIntent(intent);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        direct.stepOnce();
        inner.stepOnce();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(b).toEqual(a);
      expect(a.events.some((event) => event.type === 'CAST_START')).toBe(true);
      expect(a.events.some((event) => event.type === 'ATTACK')).toBe(true);
      expect(a.events.some((event) => event.type === 'SKILL_PROJECTILE')).toBe(true);
      expect(a.snapshots).toHaveLength(200);
      direct.dispose();
      proxied.dispose();
    },
  );

  it('proxies connect, intents and state across a message channel', async () => {
    const [main, worker] = channel();
    const inner = makeHost();
    serveSimHost(worker, inner);
    const host = new WorkerSimHost(main);
    const join = await host.connect();
    expect(join.mapId).toBe('map_sandbox_01');

    const snaps: Snapshot[] = [];
    host.onSnapshot((s) => snaps.push(s));
    host.sendIntent({ type: 'MOVE_TO', target: { x: 0, z: 0 } });
    await new Promise((r) => setTimeout(r, 0));
    inner.stepOnce();
    await new Promise((r) => setTimeout(r, 0));
    expect(snaps.length).toBe(1);
    expect(snaps[0]?.entities.find((e) => e.id === join.playerId)?.action).toBe('move');
    host.dispose();
  });
});
