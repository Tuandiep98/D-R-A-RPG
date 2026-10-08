import { resolve } from 'node:path';
import { World } from '@rpg/game-core';
import { loadContentFromDir } from '@rpg/game-data/node';
import { describe, expect, it } from 'vitest';

const content = loadContentFromDir(resolve(import.meta.dirname, '../../../game-data'));
const makeWorld = () =>
  new World({ content, mapId: 'map_forest_mechanism_01', combatContent: 'starter' });
const skills = (world: World, id: number) => world.playerState(id)?.skills.map((s) => s.skillId);

describe('authored sword starter progression', () => {
  it.each([
    ['player_phap', 'skill_phap_guard', 'skill_phap_storm'],
    ['player_the', 'skill_the_quake', 'skill_the_avatar'],
    ['player_tran', 'skill_tran_link', 'skill_tran_great'],
    ['player_anh', 'skill_anh_pursuit', 'skill_anh_flurry'],
    ['player_thu', 'skill_thu_combo', 'skill_thu_wave'],
  ])('starter %s only grants Q/W before progression, including on reload', (profile, e, r) => {
    const world = makeWorld();
    const id = world.spawnPlayer(profile);
    const actor = world.entities.get(id);
    if (!actor) throw new Error('missing player');
    const mp = actor.stats.mp;
    for (const skillId of [e, r]) {
      expect(skills(world, id)).not.toContain(skillId);
      world.enqueueIntent(id, { type: 'CAST_SKILL', skillId, point: { ...actor.pos } });
    }
    expect(
      world.step().filter((event) => event.type === 'NOTICE' && event.code === 'invalid'),
    ).toHaveLength(2);
    expect(actor.stats.mp).toBe(mp);
    const restored = makeWorld();
    const next = restored.spawnPlayer(profile, { save: world.exportPlayer(id) ?? undefined });
    expect(skills(restored, next)).not.toContain(e);
    expect(skills(restored, next)).not.toContain(r);
  });

  it.each([
    { name: 'Trận', suffixes: ['tran_place', 'tran_pulse', 'tran_link', 'tran_great'], gold: 1420 },
    { name: 'Ảnh', suffixes: ['anh_blade', 'anh_cloak', 'anh_pursuit', 'anh_flurry'], gold: 1400 },
    { name: 'Ngự Thú', suffixes: ['thu_strike', 'thu_bond', 'thu_combo', 'thu_wave'], gold: 1400 },
  ])(
    'an existing sword character learns the full $name kit through authored nodes and retains it on reload',
    ({ suffixes, gold }) => {
      const world = makeWorld();
      const id = world.spawnPlayer('player_default');
      const actor = world.entities.get(id);
      if (!actor?.player) throw new Error('missing player');
      actor.realm = 1;
      actor.player.nodes = ['tien_khai_mach'];
      actor.player.gold = 2000;
      actor.player.inventory.push(
        { instanceId: 'tran-fangs', itemId: 'item_wolf_fang', count: 11 },
        { instanceId: 'tran-antler', itemId: 'item_elite_antler', count: 1 },
      );
      actor.player.quests.push(
        { questId: 'q_meet_scout', status: 'done', progress: [1] },
        { questId: 'q_wolf_cull', status: 'done', progress: [5] },
        { questId: 'q_elite_stag', status: 'done', progress: [1] },
      );
      actor.skills.set('skill_thunder_arc', world.tick + 100);
      for (const nodeId of suffixes.map((suffix) => `tien_${suffix}`)) {
        world.enqueueIntent(id, { type: 'OPEN_NODE', nodeId });
        expect(
          world.step().some((event) => event.type === 'NODE_OPENED' && event.nodeId === nodeId),
        ).toBe(true);
      }
      expect(actor.player.gold).toBe(gold);
      expect(actor.skills.get('skill_thunder_arc')).toBe(100);
      const save = world.exportPlayer(id);
      const restored = makeWorld();
      const next = restored.spawnPlayer('player_default', { save: save ?? undefined });
      for (const skillId of suffixes.map((suffix) => `skill_${suffix}`)) {
        expect(skills(restored, next)).toContain(skillId);
      }
      if (suffixes[0] === 'thu_strike') {
        expect(
          restored.snapshot().entities.filter((e) => e.kind === 'pet' && e.ownerId === next),
        ).toHaveLength(1);
        expect(save?.companion?.hp).toBeGreaterThan(0);
      }
      expect(restored.exportPlayer(next)?.cooldowns?.skill_thunder_arc).toBe(
        save?.cooldowns?.skill_thunder_arc,
      );
    },
  );
  it('rejects locked skills and validates quest, realm and material requirements before spending', () => {
    const world = makeWorld();
    const id = world.spawnPlayer('player_default');
    const actor = world.entities.get(id);
    if (!actor?.player) throw new Error('missing player');
    actor.player.gold = 1000;
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'skill_thunder_judgement',
      point: actor.pos,
    });
    world.enqueueIntent(id, { type: 'OPEN_NODE', nodeId: 'tien_loi_anh' });
    world.enqueueIntent(id, { type: 'OPEN_NODE', nodeId: 'tien_tu_dien' });
    expect(
      world
        .step()
        .filter((e) => e.type === 'NOTICE')
        .map((e) => e.code),
    ).toEqual(['invalid', 'requirements_unmet', 'realm_too_low']);
    expect(actor.player.gold).toBe(1000);
    expect(skills(world, id)).toContain('skill_thunder_arc');
    expect(skills(world, id)).not.toContain('skill_thunder_judgement');
    actor.player.nodes = ['tien_khai_mach'];
    actor.player.quests.push({ questId: 'q_meet_scout', status: 'done', progress: [1] });
    world.enqueueIntent(id, { type: 'OPEN_NODE', nodeId: 'tien_loi_anh' });
    expect(world.step().some((e) => e.type === 'NOTICE' && e.code === 'missing_materials')).toBe(
      true,
    );
    expect(actor.player.gold).toBe(1000);
    expect(skills(world, id)).not.toContain('skill_thunder_leap');
  });

  it('opens every nonstarter sword skill through nodes and preserves cooldowns across reload', () => {
    const world = makeWorld();
    const id = world.spawnPlayer('player_default');
    const actor = world.entities.get(id);
    if (!actor?.player) throw new Error('missing player');
    actor.player.gold = 2000;
    actor.player.inventory.push(
      { instanceId: 'fangs', itemId: 'item_wolf_fang', count: 10 },
      { instanceId: 'core', itemId: 'item_golem_core', count: 1 },
      { instanceId: 'scrap', itemId: 'item_robot_scrap', count: 6 },
      { instanceId: 'antler', itemId: 'item_elite_antler', count: 1 },
    );
    actor.player.quests.push(
      { questId: 'q_meet_scout', status: 'done', progress: [1] },
      { questId: 'q_wolf_cull', status: 'done', progress: [5] },
      { questId: 'q_elite_stag', status: 'done', progress: [1] },
    );
    actor.skills.set('skill_thunder_arc', world.tick + 100);
    for (const nodeId of ['tien_khai_mach', 'tien_loi_anh', 'tien_loi_vuc']) {
      world.enqueueIntent(id, { type: 'OPEN_NODE', nodeId });
      expect(world.step().some((e) => e.type === 'NODE_OPENED' && e.nodeId === nodeId)).toBe(true);
    }
    expect(skills(world, id)).not.toContain('skill_thunder_execution');
    expect(actor.skills.get('skill_thunder_arc')).toBe(100);
    // Realm advancement itself has separate breakthrough tests; verify this kit's gates at Trúc Cơ.
    actor.realm = 1;
    for (const nodeId of ['tien_kiem_co', 'tien_tu_dien', 'tien_cuu_thien']) {
      world.enqueueIntent(id, { type: 'OPEN_NODE', nodeId });
      expect(world.step().some((e) => e.type === 'NODE_OPENED' && e.nodeId === nodeId)).toBe(true);
    }
    const expected = [
      'skill_thunder_arc',
      'skill_thunder_pierce',
      'skill_thunder_leap',
      'skill_thunder_field',
      'skill_thunder_execution',
      'skill_thunder_judgement',
    ];
    expect(skills(world, id)).toEqual(expect.arrayContaining(expected));
    expect(world.playerState(id)?.meridianLoad).toBe(60);
    expect(actor.player.gold).toBe(1020);
    const save = world.exportPlayer(id);
    const destination = makeWorld();
    const next = destination.spawnPlayer('player_default', { save: save ?? undefined });
    expect(skills(destination, next)).toEqual(expect.arrayContaining(expected));
    expect(destination.exportPlayer(next)?.cooldowns?.skill_thunder_arc).toBe(
      save?.cooldowns?.skill_thunder_arc,
    );
    destination.enqueueIntent(next, { type: 'OPEN_NODE', nodeId: 'tien_cuu_thien' });
    destination.step();
    expect(destination.exportPlayer(next)?.gold).toBe(save?.gold);
  });
});
