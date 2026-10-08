import { matchMaker } from '@colyseus/core';
import { World } from '@rpg/game-core';
import type { Intent, PlayerState, SimEvent, Snapshot } from '@rpg/game-protocol';
import { ColyseusSimHost } from '@rpg/net-client';
import { expect, it } from 'vitest';
import { clearLine } from '../../../packages/game-core/src/geometry';
import { loadConfig } from './config';
import { startGameServer } from './server';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 200 && !check(); attempt++) await wait(5);
  expect(check()).toBe(true);
}

it.each(['player_default', 'player_phap', 'player_the', 'player_tran', 'player_anh', 'player_thu'])(
  'replays %s through real Colyseus messages, AOI deltas and private state',
  async (characterId) => {
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
          world.spawnPlayer(characterId, {
            save:
              characterId === actor.player.characterId
                ? save
                : {
                    ...save,
                    characterId,
                    learnedSkills: [],
                    inventory: [],
                    equipment: {},
                    cooldowns: {},
                  },
            position: actor.pos,
            name: actor.player.name,
          }),
        ).toBe(join.playerId);
        if (characterId === 'player_thu') {
          // Pet attacks are disabled in town. Start this replay on the authored mob field.
          const target = [...world.entities.values()].find(
            (e) => e.kind === 'monster' && !world.inSafeZone(e.pos),
          );
          if (!target) throw new Error('missing outside-town combat fixture');
          const owner = world.entities.get(join.playerId);
          if (!owner) throw new Error('missing owner');
          owner.pos = { ...target.pos };
          for (const entity of world.entities.values()) {
            if (entity.kind === 'monster') {
              entity.ai = null;
              entity.combat.targetId = null;
            }
            if (entity.pet?.ownerId === owner.id) entity.pos = { ...owner.pos };
          }
        }
      }
      room.world = authoritative;
      // The test reseeds the room in place; reset the client's matching replay scope too.
      (host as unknown as { eventDeduper: { reset(): void } }).eventDeduper.reset();
      const received: SimEvent[] = [];
      const expectedEvents: SimEvent[] = [];
      const ownedIds = new Set([
        join.playerId,
        ...reference
          .snapshot()
          .entities.filter((e) => e.kind === 'pet' && e.ownerId === join.playerId)
          .map((e) => e.id),
      ]);
      const concernsPlayer = (event: SimEvent) =>
        ('id' in event && ownedIds.has(event.id)) ||
        ('sourceId' in event && ownedIds.has(event.sourceId)) ||
        ('targetId' in event && event.targetId !== null && ownedIds.has(event.targetId)) ||
        ('ownerId' in event && event.ownerId === join.playerId);
      let snapshot: Snapshot | null = null;
      let state: PlayerState | null = null;
      let stateCount = 0;
      let sawCloak = false;
      host.onSnapshot((value) => {
        snapshot = value;
        if (
          value.entities.some(
            (entity) => entity.id === join.playerId && (entity.cloakEndTick ?? 0) > value.tick,
          )
        )
          sawCloak = true;
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
        let intents = script.get(tick) ?? [];
        if (characterId !== 'player_default') {
          const pos = reference.entities.get(join.playerId)?.pos;
          if (!pos) throw new Error('missing player');
          const kit =
            characterId === 'player_phap'
              ? {
                  first: 'skill_phap_seal',
                  guard: 'skill_phap_guard',
                  ultimate: 'skill_phap_storm',
                }
              : characterId === 'player_tran'
                ? {
                    first: 'skill_tran_place',
                    guard: 'skill_tran_link',
                    ultimate: 'skill_tran_great',
                  }
                : characterId === 'player_anh'
                  ? {
                      first: 'skill_anh_blade',
                      guard: 'skill_anh_cloak',
                      ultimate: 'skill_anh_flurry',
                    }
                  : characterId === 'player_thu'
                    ? {
                        first: 'skill_thu_strike',
                        guard: 'skill_thu_bond',
                        ultimate: 'skill_thu_wave',
                      }
                    : {
                        first: 'skill_the_mountain',
                        guard: 'skill_the_guard',
                        ultimate: 'skill_the_avatar',
                      };
          const guardTick = characterId === 'player_tran' ? 110 : 70;
          const point = [0, 1, 2, 3, 4, 5, 6, 7]
            .map((i) => ({
              x: pos.x + Math.sin((i * Math.PI) / 4) * 3,
              z: pos.z + Math.cos((i * Math.PI) / 4) * 3,
            }))
            .find((p) => clearLine(reference, pos, p)) ?? { x: pos.x, z: pos.z + 3 };
          if (characterId === 'player_tran' && tick === 100) intents = [];
          if (tick === 22 || tick === guardTick || tick === 80)
            intents = [
              {
                type: 'CAST_SKILL',
                skillId: tick === 22 ? kit.first : tick === guardTick ? kit.guard : kit.ultimate,
                point,
              },
            ];
          if (tick === 50) intents = [{ type: 'BASIC_ATTACK', aim: { x: pos.x, z: pos.z + 4 } }];
        }
        for (const intent of intents) {
          host.sendIntent(intent);
          reference.enqueueIntent(join.playerId, intent);
        }
        if (intents.length)
          await until(
            () =>
              (authoritative as unknown as { intents: unknown[] }).intents.length ===
              intents.length,
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
      if (characterId !== 'player_the')
        expect(received.some((event) => event.type === 'SKILL_PROJECTILE' && event.actionId)).toBe(
          true,
        );
      if (characterId !== 'player_default' && characterId !== 'player_anh')
        expect(received.some((event) => event.type === 'SHIELD' && event.phase === 'gain')).toBe(
          true,
        );
      if (characterId === 'player_phap')
        expect(
          received.filter(
            (event) => event.type === 'SKILL_IMPACT' && event.skillId === 'skill_phap_storm',
          ),
        ).toHaveLength(3);
      if (characterId === 'player_anh') {
        expect(sawCloak).toBe(true);
        expect(
          received.filter(
            (event) => event.type === 'SKILL_IMPACT' && event.skillId === 'skill_anh_flurry',
          ),
        ).toHaveLength(3);
      }
      if (characterId === 'player_thu') {
        expect((state as unknown as PlayerState).companion).toMatchObject({
          profileId: 'pet_wolf',
        });
        expect(
          (snapshot as unknown as Snapshot).entities.filter(
            (e) => e.kind === 'pet' && e.ownerId === join.playerId,
          ),
        ).toHaveLength(1);
        expect(
          received.some((e) => e.type === 'CAST_START' && e.skillId === 'skill_pet_lunge'),
        ).toBe(true);
        expect(
          received.some((e) => e.type === 'SKILL_PROJECTILE' && e.skillId === 'skill_pet_wave'),
          JSON.stringify(received.filter(concernsPlayer)),
        ).toBe(true);
      }
      expect(join).toMatchObject({ combatContent: 'prototype', combatRuleset: 'elements_v1' });
    } finally {
      host.dispose();
      await server.close();
    }
  },
  30000,
);
