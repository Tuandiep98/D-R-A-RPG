import { matchMaker } from '@colyseus/core';
import { World } from '@rpg/game-core';
import type { Intent, PlayerState, SimEvent, Snapshot } from '@rpg/game-protocol';
import { ColyseusSimHost } from '@rpg/net-client';
import { expect, it } from 'vitest';
import { loadConfig } from './config';
import { startGameServer } from './server';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 200 && !check(); attempt++) await wait(5);
  expect(check()).toBe(true);
}

it('replays seeded intents through real Colyseus messages, AOI deltas and private state', async () => {
  const server = await startGameServer(
    loadConfig({
      NODE_ENV: 'test',
      PORT: '0',
      HOST: '127.0.0.1',
      PGLITE_DIR: 'memory',
      AUTH_SECRET: 'replay-test-secret-replay-test-secret!',
      ALLOW_DEV_LOGIN: 'true',
      LOG_LEVEL: 'fatal',
      AUTOSAVE_SECONDS: '3600',
      COMBAT_CONTENT: 'prototype',
    }),
  );
  const host = new ColyseusSimHost({
    endpoint: `ws://127.0.0.1:${server.port}`,
    mapId: 'map_sandbox_01',
    getToken: () => 'dev:combat-replay',
  });
  try {
    const join = await host.connect();
    const clientRoom = (host as unknown as { room: { roomId: string } }).room;
    // Test-only fixed clock. The actual room handlers, sockets and codec remain active.
    const room = matchMaker.getLocalRoomById(clientRoom.roomId) as unknown as {
      world: World;
      setSimulationInterval(): void;
      stepOnce(): void;
      clients: { send(type: string, payload: unknown): void }[];
    };
    room.setSimulationInterval();
    await wait(30); // drain messages already emitted by the real-time clock
    const old = room.world;
    const save = old.exportPlayer(join.playerId);
    const actor = old.entities.get(join.playerId);
    if (!save || !actor?.player) throw new Error('missing joined player');
    const options = {
      content: old.content,
      mapId: old.map.id,
      seed: 7731,
      nav: old.nav,
      combatContent: old.combatContent,
      combatRuleset: old.combatRuleset,
    };
    const authoritative = new World(options),
      reference = new World(options);
    for (const world of [authoritative, reference]) {
      expect(
        world.spawnPlayer(actor.player.characterId, {
          save,
          position: actor.pos,
          name: actor.player.name,
        }),
      ).toBe(join.playerId);
    }
    room.world = authoritative;
    // The test reseeds the room in place; reset the client's matching replay scope too.
    (host as unknown as { eventDeduper: { reset(): void } }).eventDeduper.reset();
    const received: SimEvent[] = [];
    const expectedEvents: SimEvent[] = [];
    const concernsPlayer = (event: SimEvent) =>
      ('id' in event && event.id === join.playerId) ||
      ('sourceId' in event && event.sourceId === join.playerId) ||
      ('targetId' in event && event.targetId === join.playerId) ||
      ('ownerId' in event && event.ownerId === join.playerId);
    let snapshot: Snapshot | null = null;
    let state: PlayerState | null = null;
    let stateCount = 0;
    host.onSnapshot((value) => {
      snapshot = value;
    });
    host.onPlayerState((value) => {
      state = value;
      stateCount++;
    });
    host.onEvents((events) => received.push(...events));
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
    for (let tick = 1; tick <= 160; tick++) {
      const intents = script.get(tick) ?? [];
      for (const intent of intents) {
        host.sendIntent(intent);
        reference.enqueueIntent(join.playerId, intent);
      }
      if (intents.length)
        await until(
          () =>
            (authoritative as unknown as { intents: unknown[] }).intents.length === intents.length,
        );
      const previousStateCount = stateCount;
      room.stepOnce();
      expectedEvents.push(...reference.step().filter(concernsPlayer));
      expect(authoritative.snapshot()).toEqual(reference.snapshot());
      expect(authoritative.playerState(join.playerId)).toEqual(
        reference.playerState(join.playerId),
      );
      await until(() => snapshot?.tick === tick);
      const decoded = snapshot as unknown as Snapshot;
      const visible = new Set(decoded.entities.map((entity) => entity.id));
      const expected = reference.snapshot((entity) => visible.has(entity.id));
      expect([...decoded.entities].sort((a, b) => a.id - b.id)).toEqual(
        expected.entities.sort((a, b) => a.id - b.id),
      );
      if (tick % 2 === 0) {
        await until(() => stateCount > previousStateCount);
        expect(state).toEqual(reference.playerState(join.playerId));
      }
    }
    expect(received.filter(concernsPlayer)).toEqual(expectedEvents);
    room.clients[0]?.send('events', received.filter(concernsPlayer));
    room.stepOnce();
    expectedEvents.push(...reference.step().filter(concernsPlayer));
    await until(() => snapshot?.tick === 161);
    await wait(20);
    expect(received.filter(concernsPlayer)).toEqual(expectedEvents);
    expect(received.some((event) => event.type === 'CAST_START' && event.actionId)).toBe(true);
    expect(received.some((event) => event.type === 'SKILL_PROJECTILE' && event.actionId)).toBe(
      true,
    );
    expect(join).toMatchObject({ combatContent: 'prototype', combatRuleset: 'elements_v1' });
  } finally {
    host.dispose();
    await server.close();
  }
}, 30000);
