import { matchMaker } from '@colyseus/core';
import type { World } from '@rpg/game-core';
import type { JoinInfo, PlayerState, Snapshot } from '@rpg/game-protocol';
import { ColyseusSimHost } from '@rpg/net-client';
import { expect, it } from 'vitest';
import { loadConfig } from './config';
import { startGameServer } from './server';
import { ZoneRoom } from './zone-room';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  for (let i = 0; i < 150 && !check(); i++) await wait(50);
  expect(check()).toBe(true);
}

it.each(['player_default', 'player_phap', 'player_the', 'player_tran', 'player_anh', 'player_thu'])(
  '%s retains kit, affinity, inventory and cooldowns through a real portal and new login',
  async (profile) => {
    const server = await startGameServer(
      loadConfig({
        NODE_ENV: 'test',
        PORT: '0',
        HOST: '127.0.0.1',
        PGLITE_DIR: 'memory',
        AUTH_SECRET: 'kit-transfer-local-test-secret-32-characters',
        LOG_LEVEL: 'fatal',
        COMBAT_CONTENT: 'prototype',
      }),
    );
    const { repo, content, tokens } = ZoneRoom.deps;
    const def = content.characters.get(profile);
    const map = content.maps.get('map_sandbox_01');
    const portal = map?.portals[0];
    if (!def || !map || !portal) throw new Error('missing authored fixture');
    const account = await repo.createAccount(`transfer-${profile}`, 'fixture');
    const characterId = await repo.createCharacter({
      accountId: account,
      name: profile,
      characterDefId: profile,
      mapId: map.id,
      element: 'kim',
      expression: 'base',
    });
    const stored = await repo.loadCharacter(characterId);
    if (!stored) throw new Error('missing save');
    const ultimate = def.prototypeSkills.at(-1);
    if (!ultimate) throw new Error('missing ultimate');
    const cooldown = content.skills.get(ultimate)?.cooldown ?? 0;
    await repo.saveCharacter(
      characterId,
      {
        ...stored.save,
        hp: 600,
        mp: 80,
        learnedSkills: def.prototypeSkills,
        inventory: [{ instanceId: 'transfer-pot', itemId: 'item_potion_hp_small', count: 3 }],
        cooldowns: { [ultimate]: cooldown },
        ...(profile === 'player_thu' ? { companion: { hp: 321, respawnSeconds: 0 } } : {}),
      },
      { mapId: map.id, x: portal.position.x, z: portal.position.z - 3 },
      [],
    );
    const token = await tokens.signAccess({ sub: account, role: 'player', chr: characterId });
    const hosts: ColyseusSimHost[] = [];
    const connect = async () => {
      const host = new ColyseusSimHost({
        endpoint: `ws://127.0.0.1:${server.port}`,
        mapId: map.id,
        getToken: () => token,
      });
      hosts.push(host);
      const joins: JoinInfo[] = [];
      let state: PlayerState | null = null,
        snapshot: Snapshot | null = null;
      host.onJoin((value) => joins.push(value));
      host.onPlayerState((value) => {
        state = value;
      });
      host.onSnapshot((value) => {
        snapshot = value;
      });
      const joined = await host.connect();
      await until(() => !!state && !!snapshot);
      return {
        host,
        joined,
        joins,
        state: () => state as PlayerState,
        snapshot: () => snapshot as Snapshot,
      };
    };
    try {
      const first = await connect();
      const sourceRoom = matchMaker.getLocalRoomById(
        (first.host as unknown as { room: { roomId: string } }).room.roomId,
      ) as unknown as { world: World };
      const before = first.state();
      const gate = first.snapshot().entities.find((e) => e.kind === 'portal');
      if (!gate) throw new Error('missing portal');
      first.host.sendIntent({ type: 'INTERACT', entityId: gate.id });
      await until(
        () =>
          first.joins.length === 2 &&
          first.state().id === first.joins.at(-1)?.playerId &&
          first.state().characterId === profile,
      );
      expect(first.joins.at(-1)?.mapId).toBe(portal.targetMapId);
      const transferred = first.state();
      expect(transferred.inventory).toEqual(before.inventory);
      expect(transferred.element).toBe('kim');
      expect(transferred.skills.map((s) => s.skillId)).toEqual(before.skills.map((s) => s.skillId));
      expect(sourceRoom.world.entities.has(first.joined.playerId)).toBe(false);
      expect(
        [...sourceRoom.world.entities.values()].filter(
          (e) => e.pet?.ownerId === first.joined.playerId,
        ),
      ).toHaveLength(0);
      first.host.dispose();
      await until(() => !ZoneRoom.deps.online.has(characterId));
      const second = await connect(); // requests town; server redirects to persisted destination
      expect(second.joined.mapId).toBe(portal.targetMapId);
      expect(second.state().inventory).toEqual(before.inventory);
      expect(second.state().element).toBe('kim');
      const remaining = second.state().skills.find((s) => s.skillId === ultimate)?.readyAtTick ?? 0;
      expect(remaining - second.snapshot().tick).toBeGreaterThan(0);
      expect(remaining - second.snapshot().tick).toBeLessThanOrEqual(cooldown * 20);
      if (profile === 'player_thu') {
        expect(second.state().companion?.hp).toBe(321);
        expect(
          second
            .snapshot()
            .entities.filter((e) => e.kind === 'pet' && e.ownerId === second.joined.playerId),
        ).toHaveLength(1);
      }
    } finally {
      for (const host of hosts) host.dispose();
      await server.close();
    }
  },
  30000,
);
