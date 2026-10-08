import { type JoinInfo, PROTOCOL_VERSION, type Snapshot } from '@rpg/game-protocol';
import { ColyseusSimHost } from '@rpg/net-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { type RunningGameServer, startGameServer } from './server';

let server: RunningGameServer;

beforeAll(async () => {
  server = await startGameServer(
    loadConfig({
      NODE_ENV: 'test',
      PORT: '0',
      HOST: '127.0.0.1',
      AUTH_SECRET: 'test-secret-test-secret-test-secret!',
      PGLITE_DIR: 'memory',
      ALLOW_DEV_LOGIN: 'true',
      LOG_LEVEL: 'warn',
      AUTOSAVE_SECONDS: '3600',
    }),
  );
});
afterAll(async () => {
  await server.close();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A connected player that records what it receives. */
async function player(name: string) {
  let disconnectCode: number | null = null;
  const host = new ColyseusSimHost({
    endpoint: `ws://127.0.0.1:${server.port}`,
    getToken: () => `dev:${name}`,
    mapId: 'map_sandbox_01',
    onDisconnect: (code) => {
      disconnectCode = code;
    },
  });
  const joins: JoinInfo[] = [];
  let snapshot: Snapshot | null = null;
  host.onJoin((j) => joins.push(j));
  host.onSnapshot((s) => {
    snapshot = s;
  });
  const join = await host.connect();
  return {
    host,
    join,
    joins,
    snap: () => snapshot as Snapshot | null,
    disconnectCode: () => disconnectCode,
  };
}

describe('game server', () => {
  it('two players see each other and movement is server-authoritative', async () => {
    const alice = await player('alice');
    const bob = await player('bob');
    await wait(400);
    const t0 = alice.snap()?.tick ?? 0;
    await wait(1000);
    const ticks = (alice.snap()?.tick ?? 0) - t0;
    expect(ticks).toBeGreaterThanOrEqual(17); // 20 Hz
    expect(ticks).toBeLessThanOrEqual(23);
    const aliceSeesBob = alice.snap()?.entities.some((e) => e.id === bob.join.playerId);
    expect(aliceSeesBob).toBe(true);
    const before = bob.snap()?.entities.find((e) => e.id === alice.join.playerId)?.pos;

    alice.host.sendIntent({ type: 'MOVE_TO', target: { x: 5, z: -12 } });
    await wait(1200);
    const after = bob.snap()?.entities.find((e) => e.id === alice.join.playerId)?.pos;
    expect(
      after && before ? Math.hypot(after.x - before.x, after.z - before.z) : 0,
    ).toBeGreaterThan(2);

    alice.host.dispose();
    bob.host.dispose();
    await wait(300);
  });

  it('kicks a client that floods invalid messages', async () => {
    const mallory = await player('mallory');
    const room = (mallory.host as unknown as { room: { send(t: string, m: unknown): void } }).room;
    for (let i = 0; i < 40; i++) room.send('intent', { type: 'GIVE_GOLD', amount: 1e9 });
    await wait(800);
    expect(mallory.disconnectCode()).toBe(4002);
    mallory.host.dispose();
  });

  it('a second login takes over the first session (never two copies online)', async () => {
    const carol = await player('carol');
    carol.host.sendIntent({ type: 'MOVE_DIR', dir: { x: 1, z: 0 } });
    await wait(200);
    const carol2 = await player('carol');
    await wait(500);
    expect(carol.disconnectCode()).toBe(4003);
    const copies =
      carol2.snap()?.entities.filter((e) => e.kind === 'player' && e.id !== carol2.join.playerId) ??
      [];
    expect(copies.some((e) => e.id === carol.join.playerId)).toBe(false);
    const takenOver = carol2.snap()?.entities.find((e) => e.id === carol2.join.playerId);
    expect(takenOver).toMatchObject({
      actionState: null,
      cast: null,
      mobility: null,
      targetId: null,
    });
    const restingPosition = takenOver?.pos;
    await wait(250);
    expect(carol2.snap()?.entities.find((e) => e.id === carol2.join.playerId)?.pos).toEqual(
      restingPosition,
    );
    carol2.host.dispose();
    await wait(300);
  });

  it('transfers through a portal and keeps the character on the new map after reconnect', async () => {
    const dan = await player('dan');
    await wait(300);
    const portal = dan.snap()?.entities.find((e) => e.kind === 'portal');
    expect(portal).toBeDefined();
    dan.host.sendIntent({ type: 'INTERACT', entityId: portal?.id });
    for (let i = 0; i < 60 && dan.joins.length < 2; i++) await wait(250);
    expect(dan.joins.at(-1)?.mapId).toBe('map_forest_mechanism_01');
    dan.host.dispose();
    await wait(500);

    // Logging in again asks for the sandbox, the server redirects to the saved map.
    const again = await player('dan');
    expect(again.join.mapId).toBe('map_forest_mechanism_01');
    await wait(200);
    expect(again.snap()?.entities.find((e) => e.id === again.join.playerId)).toMatchObject({
      actionState: null,
      cast: null,
      mobility: null,
      targetId: null,
    });
    again.host.dispose();
    await wait(300);
  });
});

describe('chat and instances', () => {
  it('relays map chat to players in the room with rate limiting', async () => {
    const eve = await player('eve');
    const fay = await player('fay');
    const got: string[] = [];
    fay.host.onChat((m) => got.push(`${m.fromName}: ${m.text}`));
    await wait(200);
    eve.host.sendChat('xin chào');
    eve.host.sendChat('spam ngay lập tức'); // inside the 1 s window → dropped
    await wait(500);
    expect(got).toEqual(['Dev eve: xin chào']);
    eve.host.dispose();
    fay.host.dispose();
    await wait(300);
  });

  it('solo dungeon rooms only accept their owner', async () => {
    const { Client } = await import('@colyseus/sdk');
    const client = new Client(`ws://127.0.0.1:${server.port}`);
    client.auth.token = 'dev:gina';
    await expect(
      client.joinOrCreate('zone', {
        mapId: 'map_golem_sanctum_01',
        protocolVersion: PROTOCOL_VERSION,
        instanceKey: 'someone-else',
      }),
    ).rejects.toThrow();
  });
});
