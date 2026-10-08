import { resolve } from 'node:path';
import { type Entity, World } from '@rpg/game-core';
import { loadContentFromDir } from '@rpg/game-data/node';
import type { Intent, SimEvent } from '@rpg/game-protocol';
import { describe, expect, it } from 'vitest';

/**
 * Authored forge content (docs/plan/06_forge_equipment_plan.md): the Lão Mộc
 * trial kit fits a fresh inventory and carries enough to run every forge
 * operation on the real starter map.
 */
const content = loadContentFromDir(resolve(import.meta.dirname, '../../../game-data'));

function atSmith(characterId: string) {
  const world = new World({ content, mapId: 'map_sandbox_01' });
  const id = world.spawnPlayer(characterId);
  const player = world.entities.get(id) as Entity;
  const smith = [...world.entities.values()].find((e) => e.npc?.npcId === 'npc_smith') as Entity;
  player.pos = { x: smith.pos.x + 1, z: smith.pos.z };
  const send = (intent: Intent): SimEvent[] => {
    world.enqueueIntent(id, intent);
    return world.step();
  };
  send({ type: 'INTERACT', entityId: smith.id });
  send({ type: 'QUEST_ACCEPT', npcId: smith.id, questId: 'q_forge_trial' });
  send({ type: 'INTERACT', entityId: smith.id });
  const events = send({
    type: 'QUEST_TURN_IN',
    npcId: smith.id,
    questId: 'q_forge_trial',
  });
  return { world, id, player, smith, send, events };
}

const forgeResult = (events: SimEvent[]) =>
  events.find((e): e is Extract<SimEvent, { type: 'FORGE_RESULT' }> => e.type === 'FORGE_RESULT');

describe('authored forge content', () => {
  it.each([...content.characters.keys()])('%s receives the whole trial kit', (characterId) => {
    const { player, events } = atSmith(characterId);
    expect(events.some((e) => e.type === 'NOTICE' && e.code === 'inventory_full')).toBe(false);
    expect(events.some((e) => e.type === 'QUEST' && e.status === 'done')).toBe(true);
    expect(player.player?.gold).toBe(50_000);
    expect(player.player?.inventory.some((i) => i.itemId === 'item_thien_co_blade')).toBe(true);
  });

  it('runs enhance → socket → rite → synthesis → evolve → natal on the trial gear', () => {
    const { player, smith, send } = atSmith('player_default');
    const p = player.player;
    if (!p) throw new Error('no player');
    const npcId = smith.id;
    const blade = p.inventory.find((i) => i.itemId === 'item_thien_co_blade');
    const swords = p.inventory.filter((i) => i.itemId === 'item_sword_iron');
    const chip = p.inventory.find((i) => i.itemId === 'item_chip_cuong_phong');
    if (!blade || swords.length < 3 || !chip) throw new Error('trial kit incomplete');
    send({ type: 'EQUIP', instanceId: blade.instanceId });
    const attack0 = player.stats.attack;

    // Cường hoá to +6 (wards keep failures from dropping levels).
    for (let i = 0; i < 40 && (blade.enhance ?? 0) < 6; i++)
      send({
        type: 'FORGE',
        npcId,
        op: 'enhance',
        instanceId: blade.instanceId,
        useWard: true,
      });
    expect(blade.enhance).toBe(6);
    expect(player.stats.attack).toBeGreaterThan(attack0);

    // Legendary: 4 sockets; the Cuồng Phong module goes in.
    expect(
      forgeResult(
        send({
          type: 'FORGE',
          npcId,
          op: 'socket',
          instanceId: blade.instanceId,
          socketInstanceId: chip.instanceId,
        }),
      ),
    ).toMatchObject({ success: true });
    expect(p.gear?.finisher?.element).toBe('moc');

    // Rites of both lines in two groups make a Thiên Cơ hybrid.
    for (const riteId of ['rite_phu_linh', 'rite_vi_mach'])
      expect(
        forgeResult(
          send({
            type: 'FORGE',
            npcId,
            op: 'rite',
            instanceId: blade.instanceId,
            riteId,
          }),
        ),
      ).toMatchObject({ success: true });
    expect(blade.forge?.rites).toEqual(['rite_phu_linh', 'rite_vi_mach']);

    // Natal ascension succeeds within a few tries (failures only cost durability).
    for (let i = 0; i < 10 && !blade.forge?.rites?.includes('rite_do_kiep'); i++) {
      send({
        type: 'FORGE',
        npcId,
        op: 'repair',
        instanceId: blade.instanceId,
      });
      send({
        type: 'FORGE',
        npcId,
        op: 'rite',
        instanceId: blade.instanceId,
        riteId: 'rite_do_kiep',
      });
    }
    expect(blade.forge?.rites).toContain('rite_do_kiep');

    // Synthesis: common iron sword + 2 fodder → rare.
    const [main, a, b] = swords;
    expect(
      forgeResult(
        send({
          type: 'FORGE',
          npcId,
          op: 'synthesize',
          instanceId: main?.instanceId ?? '',
          fodder: [a?.instanceId ?? '', b?.instanceId ?? ''],
        }),
      ),
    ).toMatchObject({ success: true, detail: 'quality:rare' });
    expect(p.inventory.filter((i) => i.itemId === 'item_sword_iron')).toHaveLength(
      swords.length - 2,
    );

    // Evolution keeps +N: Thiết Kiếm → Thanh Phong Linh Kiếm.
    for (let i = 0; i < 20 && (main?.enhance ?? 0) < 3; i++)
      send({
        type: 'FORGE',
        npcId,
        op: 'enhance',
        instanceId: main?.instanceId ?? '',
      });
    expect(
      forgeResult(
        send({
          type: 'FORGE',
          npcId,
          op: 'evolve',
          instanceId: main?.instanceId ?? '',
        }),
      ),
    ).toMatchObject({ success: true, detail: 'stage:1' });
    expect(main?.enhance).toBe(3);
  });
});
