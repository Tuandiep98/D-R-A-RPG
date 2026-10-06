import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildContentBundle } from '@rpg/game-data';
import type { JoinInfo, PlayerState, Snapshot } from '@rpg/game-protocol';
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
    expect(ps.skills).toHaveLength(5);
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
    for (let i = 0; i < 20 * 8 && joins.length === 0; i++) {
      host.stepOnce();
      await Promise.resolve();
    }
    expect(joins[0]?.mapId).toBe('map_forest_mechanism_01');
    expect(host.debug?.mapId).toBe('map_forest_mechanism_01');
    expect(first.mapId).toBe('map_sandbox_01');
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
