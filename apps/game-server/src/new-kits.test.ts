import { resolve } from 'node:path';
import { World } from '@rpg/game-core';
import { loadContentFromDir } from '@rpg/game-data/node';
import { EntitySnapshotSchema, SimEventSchema } from '@rpg/game-protocol';
import { describe, expect, it } from 'vitest';
import {
  resetTransientActions,
  timelineSystem,
} from '../../../packages/game-core/src/systems/action-timeline';
import { aiSystem } from '../../../packages/game-core/src/systems/ai';
import {
  applyDamage,
  captureDamageSource,
  rollHit,
} from '../../../packages/game-core/src/systems/combat';
import { farmSystem } from '../../../packages/game-core/src/systems/farm';
import { requestBasicAttack } from '../../../packages/game-core/src/systems/melee';
import { requestMobility } from '../../../packages/game-core/src/systems/mobility';
import { companion, petSystem } from '../../../packages/game-core/src/systems/pets';
import { requestCast } from '../../../packages/game-core/src/systems/skills';
import { makeContent } from '../../../packages/game-core/src/test-fixtures';

const authored = loadContentFromDir(resolve(import.meta.dirname, '../../../game-data'));
function setup(characterId = 'player_phap') {
  const fixture = makeContent({
    monster: { stats: { hp: 5000, attack: 10, defense: 0, critChance: 0 } },
  });
  const world = new World({
    content: {
      ...authored,
      maps: fixture.maps,
      monsters: new Map([...authored.monsters, ...fixture.monsters]),
    },
    mapId: 'test_map',
    combatContent: 'prototype',
  });
  const id = world.spawnPlayer(characterId);
  const actor = world.entities.get(id);
  const target = [...world.entities.values()].find((e) => e.kind === 'monster');
  if (!actor?.player || !target) throw new Error('missing fixture');
  actor.pos = { x: 0, z: 0 };
  target.pos = { x: 0, z: 5 };
  target.ai = null;
  target.combat.targetId = null;
  return { world, actor, target, id };
}
const run = (world: World, ticks: number) =>
  Array.from({ length: ticks }, () => world.step()).flat();

describe('authored combat kits', () => {
  it.each(['plain', 'guard', 'decay', 'shield', 'unconfigured'])(
    'Thể poise uses explicit pressure, guard-chain resistance and bounded break: %s',
    (mode) => {
      const { world, actor, target } = setup('player_the');
      if (mode === 'guard')
        actor.guardChain = { comboId: 'combo_unarmed', stacks: 3, defense: 12, endTick: 100 };
      if (mode === 'shield') actor.shield = { amount: 100, endTick: 100 };
      const hit = () =>
        applyDamage(world, target, actor, 1, false, null, {
          hit: 'solid',
          heavy: true,
          ...(mode === 'unconfigured' ? {} : { poiseDamage: 12 }),
        });
      hit();
      if (mode === 'decay') run(world, 61);
      hit();
      if (mode === 'plain') {
        expect(actor.poise?.staggerUntilTick).toBe(world.tick + 6);
        expect(requestBasicAttack(world, actor, null)).toBe(false);
        expect(requestCast(world, actor, 'skill_the_guard', null, null)).toBe(false);
        expect(requestMobility(world, actor, 'roll')).toBe(false);
        actor.movement.dir = { x: 1, z: 0 };
        const before = { ...actor.pos };
        run(world, 5);
        expect(actor.pos).toEqual(before);
        hit();
        expect(actor.poise?.pressure).toBe(0);
        run(world, 1);
        expect(requestCast(world, actor, 'skill_the_guard', null, null)).toBe(true);
      } else if (mode === 'guard') {
        expect(actor.poise).toMatchObject({ pressure: 24, threshold: 42, staggerUntilTick: 0 });
        hit();
        expect(actor.poise?.pressure).toBe(36);
        hit();
        expect(actor.poise?.staggerUntilTick).toBe(6);
      } else if (mode === 'decay') expect(actor.poise?.pressure).toBe(12);
      else expect(actor.poise).toBeUndefined();
    },
  );
  it('poise break interrupts an accepted windup without refund and clears on lifecycle reset', () => {
    const { world, actor, target, id } = setup('player_the');
    expect(requestCast(world, actor, 'skill_the_mountain', null, null)).toBe(true);
    const mp = actor.stats.mp;
    const ready = actor.skills.get('skill_the_mountain');
    applyDamage(world, target, actor, 1, false, null, {
      hit: 'solid',
      heavy: false,
      poiseDamage: 24,
    });
    expect(actor.cast).toBeNull();
    expect(actor.stats.mp).toBe(mp);
    expect(actor.skills.get('skill_the_mountain')).toBe(ready);
    const events = run(world, 10);
    expect(events.some((event) => event.type === 'ACTION_CANCEL' && event.sourceId === id)).toBe(
      true,
    );
    expect(
      events.some(
        (event) => event.type === 'SKILL_IMPACT' && event.skillId === 'skill_the_mountain',
      ),
    ).toBe(false);
    const save = world.exportPlayer(id);
    const other = setup('player_the').world;
    const restored = other.entities.get(
      other.spawnPlayer('player_the', { save: save ?? undefined }),
    );
    expect(restored?.poise).toBeUndefined();
    world.resetController(id);
    expect(actor.poise).toBeNull();
  });
  it('authored wolf bites accumulate Thể poise only on actual connected hits', () => {
    const { world, actor, target } = setup('player_the');
    target.defId = 'wolf_001';
    target.pos = { x: 0, z: 1.2 };
    target.combat.targetId = actor.id;
    target.combat.attackIntervalTicks = 24;
    const events = run(world, 36);
    expect(
      events.filter((event) => event.type === 'DAMAGE' && event.targetId === actor.id),
    ).toHaveLength(2);
    expect(actor.poise?.staggerUntilTick).toBeGreaterThan(world.tick);
    const snapshot = EntitySnapshotSchema.parse(
      world.snapshot().entities.find((entity) => entity.id === actor.id),
    );
    expect(snapshot.poise).toEqual(actor.poise);
  });
  it('roll avoids poise pressure together with damage during its invulnerability window', () => {
    const { world, actor, target } = setup('player_the');
    expect(requestMobility(world, actor, 'roll')).toBe(true);
    run(world, 2);
    const hp = actor.stats.hp;
    applyDamage(world, target, actor, 20, false, null, {
      hit: 'solid',
      heavy: false,
      poiseDamage: 24,
    });
    expect(actor.stats.hp).toBe(hp);
    expect(actor.poise).toBeUndefined();
  });
  it('poise break keeps a projectile already released by the actor in flight', () => {
    const { world, actor, target } = setup('player_the');
    actor.skills.set('skill_phap_arrow', 0);
    expect(requestCast(world, actor, 'skill_phap_arrow', target.id, { ...target.pos })).toBe(true);
    run(world, 5);
    expect(world.skillProjectiles).toHaveLength(1);
    applyDamage(world, target, actor, 1, false, null, {
      hit: 'solid',
      heavy: false,
      poiseDamage: 24,
    });
    expect(world.skillProjectiles).toHaveLength(1);
    expect(
      run(world, 8).some(
        (event) =>
          event.type === 'DAMAGE' &&
          event.skillId === 'skill_phap_arrow' &&
          event.targetId === target.id,
      ),
    ).toBe(true);
  });
  it.each(['steady', 'turn', 'wall', 'stale', 'changed-target'])(
    'Pháp auto leads observed motion with bounded aim and counterplay: %s',
    (mode) => {
      const { world, actor, target } = setup('player_phap');
      if (!actor.player) throw new Error('missing player');
      run(world, 12);
      actor.combat.nextAttackTick = 1000;
      actor.skills = new Map([['skill_phap_arrow', 20]]);
      actor.player.farm.enabled = true;
      actor.player.farm.anchor = { ...actor.pos };
      farmSystem(world);
      target.movement.dir = { x: 1, z: 0 };
      // Observe real movement at two think ticks; isolate skill aim from basic combo scheduling.
      actor.player.farm.enabled = false;
      actor.combat.targetId = null;
      run(world, 4);
      actor.player.farm.enabled = true;
      farmSystem(world);
      actor.player.farm.enabled = false;
      actor.combat.targetId = null;
      run(world, 4);
      actor.player.farm.enabled = true;
      const observedX = target.pos.x;
      if (mode === 'turn') target.movement.dir = { x: -1, z: 0 };
      if (mode === 'wall')
        world.obstacles.push({ pos: { x: (observedX + 0.975) / 2, z: 2.5 }, radius: 0.1 });
      if (mode === 'stale' && actor.player.farm.observedTarget)
        actor.player.farm.observedTarget.tick = 0;
      if (mode === 'changed-target' && actor.player.farm.observedTarget)
        actor.player.farm.observedTarget.targetId = target.id + 100;
      farmSystem(world);
      const point = actor.cast?.point;
      expect(point).not.toBeNull();
      if (!point) throw new Error('missing auto aim');
      if (['wall', 'stale', 'changed-target'].includes(mode))
        expect(point.x).toBeCloseTo(observedX);
      else {
        expect(point.x).toBeGreaterThan(observedX);
        expect(point.x - observedX).toBeLessThanOrEqual(1.5);
      }
      actor.player.farm.enabled = false;
      const locked = { ...point };
      const events = run(world, 25);
      const hits = events.filter(
        (event) =>
          event.type === 'DAMAGE' &&
          event.skillId === 'skill_phap_arrow' &&
          event.targetId === target.id,
      );
      if (mode === 'steady') expect(hits).toHaveLength(1);
      if (mode === 'turn') expect(hits).toHaveLength(0);
      const projectile = events.find(
        (event) => event.type === 'SKILL_PROJECTILE' && event.skillId === 'skill_phap_arrow',
      );
      expect(projectile).toBeDefined();
      // Aim is committed before the future direction change, and the projectile keeps that heading.
      if (projectile?.type === 'SKILL_PROJECTILE') {
        expect(projectile.destination.x).toBeGreaterThan(projectile.origin.x);
        const dx = projectile.destination.x - projectile.origin.x;
        const dz = projectile.destination.z - projectile.origin.z;
        expect(
          dx * (locked.z - projectile.origin.z) - dz * (locked.x - projectile.origin.x),
        ).toBeCloseTo(0);
      }
    },
  );
  it('Pháp first observation and manual point cast do not infer a future steering command', () => {
    const { world, actor, target } = setup('player_phap');
    if (!actor.player) throw new Error('missing player');
    run(world, 12);
    actor.skills = new Map([['skill_phap_arrow', 0]]);
    actor.player.farm.enabled = true;
    actor.player.farm.anchor = { ...actor.pos };
    target.movement.dir = { x: 1, z: 0 };
    farmSystem(world);
    expect(actor.cast?.point).toEqual(target.pos);
    const manual = setup('player_phap');
    expect(
      requestCast(manual.world, manual.actor, 'skill_phap_arrow', manual.target.id, {
        x: -1,
        z: 5,
      }),
    ).toBe(true);
    expect(manual.actor.cast?.point).toEqual({ x: -1, z: 5 });
  });
  it.each(['manual', 'reset'])(
    'observed farm aim is transient and cleared on %s takeover',
    (mode) => {
      const { world, actor, target, id } = setup('player_phap');
      if (!actor.player) throw new Error('missing player');
      actor.player.farm.enabled = true;
      actor.player.farm.observedTarget = {
        targetId: target.id,
        pos: { ...target.pos },
        tick: world.tick,
      };
      const save = world.exportPlayer(id);
      const other = setup('player_phap').world;
      const restored = other.entities.get(
        other.spawnPlayer('player_phap', { save: save ?? undefined }),
      );
      expect(restored?.player?.farm.observedTarget).toBeUndefined();
      if (mode === 'reset') world.resetController(id);
      else {
        world.enqueueIntent(id, { type: 'MOVE_DIR', dir: { x: 1, z: 0 } });
        world.step();
      }
      expect(actor.player.farm.enabled).toBe(false);
      expect(actor.player.farm.observedTarget).toBeNull();
    },
  );
  it.each(['hit', 'move', 'far', 'wall', 'range', 'reserve'])(
    'farm places Trận near its anchor through normal cost/counterplay rules: %s',
    (mode) => {
      const { world, actor, target } = setup('player_tran');
      if (!actor.player) throw new Error('missing player');
      run(world, 12);
      actor.skills = new Map([['skill_tran_place', 0]]);
      actor.player.farm.enabled = true;
      actor.player.farm.anchor = { x: 0, z: 0 };
      target.pos = { x: 0, z: mode === 'far' ? 7 : 4 };
      if (mode === 'wall') {
        actor.pos = { x: 4, z: 0 };
        // Blocks caster → candidate centre, while the target remains visible.
        world.obstacles.push({ pos: { x: 2, z: 1.5 }, radius: 0.1 });
      }
      if (mode === 'range') actor.pos = { x: 12, z: 0 };
      if (mode === 'reserve') actor.stats.mp = actor.stats.maxMp * 0.25 + 15;
      const before = actor.stats.mp;
      farmSystem(world);
      if (!['hit', 'move'].includes(mode)) {
        expect(actor.cast).toBeNull();
        expect(actor.pending).toBeNull();
        expect(actor.stats.mp).toBe(before);
        expect(actor.skills.get('skill_tran_place')).toBe(0);
        return;
      }
      expect(actor.cast?.point).toEqual({ x: 0, z: 3 });
      expect(actor.stats.mp).toBe(before - 16);
      // Lock the setup at commit; moving targets may escape its warning.
      actor.player.farm.enabled = false;
      if (mode === 'move') target.movement.dir = { x: 0, z: 1 };
      const hits = run(world, 14).filter(
        (event) =>
          event.type === 'DAMAGE' &&
          event.skillId === 'skill_tran_place' &&
          event.targetId === target.id,
      );
      expect(hits).toHaveLength(mode === 'hit' ? 1 : 0);
      expect(world.skillPulses[0]?.cast.point).toEqual({ x: 0, z: 3 });
    },
  );
  it('manual Trận placement can still choose a point outside the auto anchor radius', () => {
    const { world, actor } = setup('player_tran');
    expect(requestCast(world, actor, 'skill_tran_place', null, { x: 0, z: 7 })).toBe(true);
    expect(actor.cast?.point).toEqual({ x: 0, z: 7 });
  });
  it('auto Đại Trận shares the anchor bound and skips a full ownership cap without cost', () => {
    const { world, actor, target } = setup('player_tran');
    if (!actor.player) throw new Error('missing player');
    run(world, 12);
    target.pos = { x: 0, z: 4 };
    actor.player.farm.enabled = true;
    actor.player.farm.anchor = { x: 0, z: 0 };
    actor.skills = new Map([['skill_tran_great', 0]]);
    farmSystem(world);
    expect(actor.cast?.point).toEqual({ x: 0, z: 3 });
    actor.player.farm.enabled = false;
    run(world, 24);
    actor.skills.set('skill_tran_place', 0);
    expect(requestCast(world, actor, 'skill_tran_place', null, { x: 0, z: 3 })).toBe(true);
    run(world, 16);
    expect(world.skillPulses).toHaveLength(2);
    actor.skills = new Map([
      ['skill_tran_place', 0],
      ['skill_tran_great', 0],
    ]);
    actor.player.farm.enabled = true;
    const mp = actor.stats.mp;
    farmSystem(world);
    expect(actor.cast).toBeNull();
    expect(actor.pending).toBeNull();
    expect(actor.stats.mp).toBe(mp);
    expect([...actor.skills.values()]).toEqual([0, 0]);
  });
  it.each(['hit', 'move', 'reserve'])(
    'farm uses Phá Sơn actual reach and observed aim without guaranteed damage: %s',
    (mode) => {
      const { world, actor, target } = setup('player_the');
      if (!actor.player) throw new Error('missing player');
      run(world, 12);
      actor.skills = new Map([['skill_the_mountain', 0]]);
      actor.player.farm.enabled = true;
      actor.player.farm.anchor = { ...actor.pos };
      actor.yaw = Math.PI;
      target.pos = { x: 2, z: 0 };
      if (mode === 'reserve') actor.stats.mp = actor.stats.maxMp * 0.25 + 9;
      const before = actor.stats.mp;
      farmSystem(world);
      if (mode === 'reserve') {
        expect(actor.cast).toBeNull();
        expect(actor.stats.mp).toBe(before);
        expect(actor.yaw).toBe(Math.PI);
        return;
      }
      expect(actor.cast?.skillId).toBe('skill_the_mountain');
      expect(actor.cast?.yaw).toBeCloseTo(Math.PI / 2);
      expect(actor.stats.mp).toBe(before - 10);
      if (mode === 'move') target.movement.dir = { x: 0, z: 1 };
      const hits = run(world, 8).filter(
        (event) =>
          event.type === 'DAMAGE' &&
          event.skillId === 'skill_the_mountain' &&
          event.targetId === target.id,
      );
      expect(hits).toHaveLength(mode === 'hit' ? 1 : 0);
    },
  );
  it.each(['hit', 'move', 'wall', 'side', 'end', 'outside', 'origin'])(
    'Phá Sơn locks a short capsule with radius-aware counterplay: %s',
    (mode) => {
      const { world, actor, target, id } = setup('player_the');
      target.pos = { x: 0, z: 2 };
      if (mode === 'side') target.pos = { x: 0.84, z: 1.2 };
      if (mode === 'end') target.pos = { x: 0, z: 3.24 };
      if (mode === 'outside') target.pos = { x: 0.86, z: 1.2 };
      world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'skill_the_mountain' });
      const events = world.step();
      const start = events.find(
        (event) => event.type === 'CAST_START' && event.skillId === 'skill_the_mountain',
      );
      expect(start).toMatchObject({
        line: { origin: { x: 0, z: 0 }, destination: { x: 0, z: 2.4 }, radius: 0.35 },
      });
      if (mode === 'move') target.movement.dir = { x: 1, z: 0 };
      if (mode === 'wall') world.obstacles.push({ pos: { x: 0, z: 1 }, radius: 0.3 });
      if (mode === 'origin') {
        actor.pos = { x: 5, z: 0 };
        actor.yaw = Math.PI;
      }
      events.push(...run(world, 8));
      const hits = events.filter(
        (event) =>
          event.type === 'DAMAGE' &&
          event.skillId === 'skill_the_mountain' &&
          event.targetId === target.id,
      );
      expect(hits).toHaveLength(['move', 'wall', 'outside'].includes(mode) ? 0 : 1);
      const impact = events.find(
        (event) => event.type === 'SKILL_IMPACT' && event.skillId === 'skill_the_mountain',
      );
      expect(impact).toMatchObject({
        line: { origin: { x: 0, z: 0 }, destination: { x: 0, z: 2.4 }, radius: 0.35 },
      });
      for (const event of events) expect(SimEventSchema.safeParse(event).success).toBe(true);
    },
  );
  it.each(['skill_thu_strike', 'skill_thu_combo', 'skill_thu_wave'])(
    'owner command %s replaces autonomous bite recovery without deleting or repeating its hit',
    (skillId) => {
      const { world, actor, target, id } = setup('player_thu');
      const pet = companion(world, actor);
      if (!pet) throw new Error('missing companion');
      pet.pos = { ...actor.pos };
      target.pos = { x: 0, z: 1.6 };
      actor.life.lastAttackerId = target.id;
      const events = world.step();
      const bite = pet.monsterSwing;
      if (!bite) throw new Error('pet did not start autonomous bite');
      const mp = actor.stats.mp;
      expect(requestCast(world, actor, skillId, null, target.pos)).toBe(false);
      expect(actor.stats.mp).toBe(mp);
      expect(actor.skills.get(skillId)).toBe(0);
      expect(pet.monsterSwing).toBe(bite);
      while (pet.monsterSwing) events.push(...world.step());
      expect(pet.actionState?.kind).toBe('monster');
      expect(requestCast(world, actor, skillId, null, target.pos)).toBe(true);
      expect(actor.stats.mp).toBe(mp - (authored.skills.get(skillId)?.mpCost ?? 0));
      events.push(...run(world, 25));
      const commanded = authored.skills
        .get(skillId)
        ?.effects.find((effect) => effect.type === 'pet_attack');
      if (commanded?.type !== 'pet_attack') throw new Error('missing pet command');
      expect(
        events.some(
          (event) =>
            event.type === 'CAST_START' &&
            event.sourceId === pet.id &&
            event.skillId === commanded.skillId,
        ),
      ).toBe(true);
      expect(
        events.filter(
          (event) =>
            event.type === 'DAMAGE' &&
            event.sourceId === pet.id &&
            event.targetId === target.id &&
            event.actionId === bite.source.actionId,
        ),
      ).toHaveLength(1);
      expect(
        events.some(
          (event) =>
            event.type === 'ACTION_CANCEL' &&
            event.sourceId === pet.id &&
            event.actionId === bite.source.actionId,
        ),
      ).toBe(true);
      expect(
        events.some(
          (event) =>
            event.type === 'CAST_START' && event.sourceId === id && event.skillId === skillId,
        ),
      ).toBe(true);
    },
  );
  it('Thể auto approaches the next punch reach instead of whiffing at character range', () => {
    const { world, actor, target, id } = setup('player_the');
    target.pos = { x: 0, z: actor.movement.radius + target.movement.radius + 1.25 };
    world.enqueueIntent(id, { type: 'ATTACK_TARGET', targetId: target.id });
    const events = run(world, 70);
    expect(
      events.some(
        (event) => event.type === 'DAMAGE' && event.sourceId === id && event.targetId === target.id,
      ),
    ).toBe(true);
    expect(actor.guardChain?.stacks).toBe(3);
  });
  it('Thể guard grows once per connected swing, caps at three and mitigates live damage', () => {
    const { world, actor, target, id } = setup('player_the');
    target.pos = { x: 0, z: 1 };
    for (let index = 0; index < 4; index++) {
      world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 0, z: 1 } });
      world.step();
      while (actor.swing) world.step();
      expect(actor.guardChain?.stacks).toBe(Math.min(index + 1, 3));
    }
    expect(actor.guardChain?.defense).toBe(12);
    const rng = world.rng.getState();
    const guarded = rollHit(world, target, actor, { multiplier: 10 }).amount;
    const buff = actor.guardChain;
    actor.guardChain = null;
    world.rng.setState(rng);
    expect(rollHit(world, target, actor, { multiplier: 10 }).amount).toBeGreaterThan(guarded);
    actor.guardChain = buff;
    expect(world.snapshot().entities.find((entity) => entity.id === id)?.guardChain).toMatchObject({
      stacks: 3,
      defense: 12,
    });
    const save = world.exportPlayer(id);
    if (!save) throw new Error('missing save');
    const restored = new World({
      content: world.content,
      mapId: 'test_map',
      combatContent: 'prototype',
    });
    expect(
      restored.entities.get(restored.spawnPlayer('player_the', { save }))?.guardChain,
    ).toBeFalsy();
    resetTransientActions(actor);
    expect(actor.guardChain).toBeNull();
  });

  it.each(['miss', 'wall', 'dodge'] as const)(
    'Thể guard requires a real connected swing: %s',
    (mode) => {
      const { world, actor, target, id } = setup('player_the');
      actor.guardChain = {
        comboId: 'combo_unarmed',
        stacks: 1,
        defense: 4,
        endTick: world.tick + 100,
      };
      target.pos = { x: 0, z: mode === 'miss' ? 5 : 1 };
      if (mode === 'wall') world.obstacles.push({ pos: { x: 0, z: 0.5 }, radius: 0.2 });
      if (mode === 'dodge')
        target.mobility = {
          actionId: 100,
          action: 'roll',
          startTick: world.tick,
          endTick: world.tick + 100,
          distanceLeft: 0,
          dir: { x: 0, z: 1 },
          dodgeFrom: world.tick,
          dodgeTo: world.tick + 100,
        };
      world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 0, z: 1 } });
      run(world, 12);
      expect(actor.guardChain).toBeNull();
    },
  );

  it('Thể guard expires exactly at its tick without mutating base stats', () => {
    const { world, actor } = setup('player_the');
    const defense = actor.stats.defense;
    actor.guardChain = {
      comboId: 'combo_unarmed',
      stacks: 3,
      defense: 12,
      endTick: world.tick + 1,
    };
    timelineSystem(world);
    expect(actor.guardChain?.stacks).toBe(3);
    world.step();
    expect(actor.guardChain).toBeNull();
    expect(actor.stats.defense).toBe(defense);
  });
  it('pet projectile commands reserve the shared pool before charging their owners', () => {
    const { world, id } = setup('player_thu');
    const players = [id];
    for (let i = 1; i < 129; i++) players.push(world.spawnPlayer('player_thu'));
    for (const playerId of players) {
      const owner = world.entities.get(playerId);
      const pet = owner ? companion(world, owner) : undefined;
      if (!owner || !pet) throw new Error('missing pet');
      owner.pos = { x: 0, z: 0 };
      pet.pos = { ...owner.pos };
      world.enqueueIntent(playerId, {
        type: 'CAST_SKILL',
        skillId: 'skill_thu_wave',
        point: { x: 0, z: 3 },
      });
    }
    const events = world.step();
    expect(
      events.filter((e) => e.type === 'CAST_START' && e.skillId === 'skill_thu_wave'),
    ).toHaveLength(128);
    const rejected = world.entities.get(players[128] ?? 0);
    expect(rejected?.stats.mp).toBe(rejected?.stats.maxMp);
    expect(rejected?.skills.get('skill_thu_wave')).toBe(0);
    expect(
      events.some(
        (e) =>
          e.type === 'NOTICE' && e.ownerId === rejected?.id && e.code === 'combat_capacity_full',
      ),
    ).toBe(true);
  });
  it.each(['hit', 'move', 'wall'])(
    'Bầy Thú fires a finite pet wave with a real lane warning: %s',
    (mode) => {
      const { world, actor, target, id } = setup('player_thu');
      const pet = companion(world, actor);
      if (!pet) throw new Error('missing pet');
      pet.pos = { ...actor.pos };
      actor.cloakEndTick = world.tick + 60;
      const hp = target.stats.hp;
      world.enqueueIntent(id, {
        type: 'CAST_SKILL',
        skillId: 'skill_thu_wave',
        point: { ...target.pos },
      });
      const startup = run(world, 7);
      expect(actor.cloakEndTick).toBeNull();
      expect(startup.find((e) => e.type === 'CAST_START' && e.sourceId === pet.id)).toMatchObject({
        telegraph: true,
        line: { origin: { x: 0, z: 0 }, destination: { x: 0, z: 9 }, radius: 0.7 },
      });
      expect(target.stats.hp).toBe(hp);
      if (mode === 'move') target.pos.x = 4;
      if (mode === 'wall') world.obstacles.push({ pos: { x: 0, z: 2 }, radius: 0.5 });
      const events = run(world, 35);
      expect(events.some((e) => e.type === 'SKILL_PROJECTILE' && e.sourceId === pet.id)).toBe(true);
      expect(target.stats.hp < hp).toBe(mode === 'hit');
      expect(world.skillProjectiles).toHaveLength(0);
    },
  );

  it('Hợp Kích checks the player and pet cones at their separate impacts', () => {
    const { world, actor, target, id } = setup('player_thu');
    const pet = companion(world, actor);
    if (!pet) throw new Error('missing pet');
    pet.pos = { ...actor.pos };
    target.pos.z = 2;
    const hp = target.stats.hp;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'skill_thu_combo' });
    const first = run(world, 7);
    expect(first.some((e) => e.type === 'DAMAGE' && e.sourceId === id)).toBe(true);
    expect(target.stats.hp).toBeLessThan(hp);
    const afterPlayer = target.stats.hp;
    target.pos.x = 4;
    run(world, 10);
    expect(target.stats.hp).toBe(afterPlayer);
  });
  it('pet kills credit the owner once; pet death yields no loot and owner death prevents further damage', () => {
    const { world, actor, target, id } = setup('player_thu');
    const pet = companion(world, actor);
    if (!pet || !actor.player) throw new Error('missing companion');
    target.defId = 'wolf_001';
    actor.combat.lastCombatTick = -100;
    actor.cloakEndTick = world.tick + 60;
    actor.player.quests.push({ questId: 'q_wolf_cull', status: 'active', progress: [0] });
    applyDamage(world, pet, target, target.stats.hp, false, 'skill_pet_lunge');
    expect(actor.combat.lastCombatTick).toBe(world.tick);
    expect(actor.cloakEndTick).toBeNull();
    expect(target.life.damageBy.has(pet.id)).toBe(false);
    expect(target.life.damageBy.get(id)).toBeGreaterThan(0);
    expect(actor.player.quests.find((q) => q.questId === 'q_wolf_cull')?.progress).toEqual([1]);
    expect(world.drainLedger()).toHaveLength(1);
    applyDamage(world, pet, target, 1, false, null);
    expect(world.drainLedger()).toHaveLength(0);
    const lootCount = [...world.entities.values()].filter((e) => e.kind === 'loot').length;
    applyDamage(world, actor, pet, pet.stats.maxHp, false, null);
    expect([...world.entities.values()].filter((e) => e.kind === 'loot')).toHaveLength(lootCount);
    actor.life.alive = false;
    target.life.alive = true;
    target.stats.hp = 100;
    applyDamage(world, pet, target, 100, false, null);
    expect(target.stats.hp).toBe(100);
    petSystem(world);
    expect(companion(world, actor)).toBeUndefined();
  });

  it('pet follows by movement, respects walls/leash and rejects a distant or hidden companion before costs', () => {
    const { world, actor, target, id } = setup('player_thu');
    const pet = companion(world, actor);
    if (!pet) throw new Error('missing companion');
    pet.pos = { x: 0, z: -15 };
    actor.combat.targetId = target.id;
    petSystem(world);
    expect(pet.combat.targetId).toBeNull();
    actor.combat.targetId = null;
    world.obstacles.push({ pos: { x: 0, z: -12 }, radius: 1 });
    const start = pet.pos.z;
    run(world, 10);
    expect(pet.pos.z).toBeGreaterThan(start);
    expect(pet.pos.z).toBeLessThan(-13);
    expect(pet.combat.targetId).toBeNull();
    const mp = actor.stats.mp;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'skill_thu_bond' });
    expect(world.step().some((e) => e.type === 'NOTICE' && e.code === 'no_target')).toBe(true);
    expect(actor.stats.mp).toBe(mp);
    expect(actor.skills.get('skill_thu_bond')).toBe(0);
    pet.pos = { x: 0, z: -3 };
    world.obstacles.push({ pos: { x: 0, z: -1.5 }, radius: 0.5 });
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'skill_thu_bond' });
    expect(world.step().some((e) => e.type === 'NOTICE' && e.code === 'no_target')).toBe(true);
    expect(actor.stats.mp).toBe(mp);
  });
  it('Ngự Thú owns one hurtbox pet; support heals/shields the pet and transfer preserves health', () => {
    const { world, actor, target, id } = setup('player_thu');
    const pet = companion(world, actor);
    if (!pet) throw new Error('missing companion');
    pet.pos = { ...actor.pos };
    expect(world.snapshot().entities.find((e) => e.id === pet.id)).toMatchObject({
      kind: 'pet',
      ownerId: id,
    });
    for (let i = 0; i < 3; i++) petSystem(world);
    expect([...world.entities.values()].filter((e) => e.pet?.ownerId === id)).toHaveLength(1);
    const ownerHp = actor.stats.hp;
    applyDamage(world, target, pet, 300, false, null);
    const hp = pet.stats.hp;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'skill_thu_bond' });
    const events = run(world, 4);
    expect(pet.stats.hp).toBe(hp + Math.round(pet.stats.maxHp * 0.3));
    expect(pet.shield?.amount).toBe(Math.round(pet.stats.maxHp * 0.2));
    expect(actor.stats.hp).toBe(ownerHp);
    expect(events.some((e) => e.type === 'SHIELD' && e.targetId === pet.id)).toBe(true);
    const save = world.exportPlayer(id);
    world.resetController(id);
    expect(world.entities.has(pet.id)).toBe(false);
    world.step();
    expect(companion(world, actor)?.stats.hp).toBe(save?.companion?.hp);
    const next = setup('player_thu').world;
    const restored = next.spawnPlayer('player_thu', { save: save ?? undefined });
    const owner = next.entities.get(restored);
    if (!owner) throw new Error('missing owner');
    expect(companion(next, owner)?.stats.hp).toBe(save?.companion?.hp);
    expect(companion(next, owner)?.shield).toBeFalsy();
  });

  it('a dead pet rejects commands before costs, stays dead across reload, then returns after its recovery', () => {
    const { world, actor, target, id } = setup('player_thu');
    const pet = companion(world, actor);
    if (!pet) throw new Error('missing companion');
    applyDamage(world, target, pet, pet.stats.maxHp, false, null);
    const mp = actor.stats.mp;
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'skill_thu_strike',
      point: { ...target.pos },
    });
    expect(world.step().some((e) => e.type === 'NOTICE' && e.code === 'no_target')).toBe(true);
    expect(actor.stats.mp).toBe(mp);
    expect(actor.skills.get('skill_thu_strike')).toBe(0);
    const save = world.exportPlayer(id);
    expect(save?.companion).toMatchObject({ hp: 0 });
    const next = setup('player_thu').world;
    const restored = next.spawnPlayer('player_thu', { save: save ?? undefined });
    const owner = next.entities.get(restored);
    if (!owner) throw new Error('missing owner');
    run(next, 398);
    expect(companion(next, owner)).toBeUndefined();
    next.step();
    expect(companion(next, owner)?.stats.hp).toBe(pet.stats.maxHp);
    expect([...next.entities.values()].filter((e) => e.pet?.ownerId === restored)).toHaveLength(1);
    next.removeEntity(restored);
    expect([...next.entities.values()].filter((e) => e.pet?.ownerId === restored)).toHaveLength(0);
  });

  it.each(['hit', 'move', 'wall'])('Thú Kích commits a pet windup and can miss: %s', (mode) => {
    const { world, actor, target, id } = setup('player_thu');
    const pet = companion(world, actor);
    if (!pet) throw new Error('missing companion');
    pet.pos = { ...actor.pos };
    const hp = target.stats.hp;
    if (mode === 'wall') world.obstacles.push({ pos: { x: 0, z: 2 }, radius: 0.5 });
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'skill_thu_strike',
      point: { ...target.pos },
    });
    const windup = run(world, 4);
    expect(windup.some((e) => e.type === 'CAST_START' && e.sourceId === pet.id)).toBe(true);
    const warning = windup.find((e) => e.type === 'CAST_START' && e.sourceId === pet.id);
    expect(warning).toMatchObject({ telegraph: true, cone: { radius: 2, arc: 75 } });
    expect(SimEventSchema.safeParse(warning).success).toBe(true);
    expect(target.stats.hp).toBe(hp);
    if (mode === 'move') target.pos.x = 4;
    run(world, 11);
    expect(target.stats.hp < hp).toBe(mode === 'hit');
    if (mode === 'wall') expect(pet.pos.z).toBeLessThan(1);
  });
  it('Ảnh cloak drops aggro, preserves committed hitboxes, breaks on damage/attack, and expires', () => {
    const { world, actor, target, id } = setup('player_anh');
    target.pos = { x: 0, z: 1 };
    target.ai = {
      state: 'chase',
      home: { ...target.pos },
      aggroRadius: 10,
      leashRadius: 14,
      wanderRadius: 0,
      nextWanderTick: 1000,
      tier: 'normal',
      phase: 0,
    };
    target.combat.targetId = id;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'skill_anh_cloak' });
    run(world, 3);
    expect(actor.cloakEndTick).toBe(world.tick + 60);
    target.monsterSwing = {
      yaw: Math.PI,
      impactTick: world.tick + 3,
      endTick: world.tick + 15,
      source: captureDamageSource(world, target),
    };
    const swing = target.monsterSwing;
    aiSystem(world);
    expect(target.combat.targetId).toBeNull();
    expect(target.monsterSwing).toBe(swing);
    aiSystem(world);
    expect(target.combat.targetId).toBeNull();
    const hp = actor.stats.hp;
    run(world, 3);
    expect(actor.stats.hp).toBeLessThan(hp);
    expect(actor.cloakEndTick).toBeNull();
    target.ai = null;
    target.combat.targetId = null;
    target.monsterSwing = null;
    actor.cloakEndTick = world.tick + 60;
    world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 3, z: 0 } });
    world.step();
    expect(actor.cloakEndTick).toBeNull();
    actor.cloakEndTick = world.tick + 2;
    run(world, 2);
    expect(actor.cloakEndTick).toBeNull();
    actor.cloakEndTick = world.tick + 60;
    const save = world.exportPlayer(id);
    world.resetController(id);
    expect(actor.cloakEndTick).toBeNull();
    const next = setup('player_anh').world;
    const restored = next.spawnPlayer('player_anh', { save: save ?? undefined });
    expect(next.entities.get(restored)?.cloakEndTick).toBeFalsy();
    expect(next.exportPlayer(restored)?.cooldowns?.skill_anh_cloak).toBe(
      save?.cooldowns?.skill_anh_cloak,
    );
  });

  it.each(['hit', 'wall', 'move'])(
    'Truy Ảnh locks a bounded approach and its final cone can miss: %s',
    (mode) => {
      const { world, actor, target, id } = setup('player_anh');
      const hp = target.stats.hp;
      if (mode === 'wall') world.obstacles.push({ pos: { x: 0, z: 2 }, radius: 0.5 });
      world.enqueueIntent(id, {
        type: 'CAST_SKILL',
        skillId: 'skill_anh_pursuit',
        targetId: target.id,
        point: { x: 5, z: 0 },
      });
      world.step();
      expect(actor.cast?.yaw).toBe(0); // Client point cannot override a target skill's locked aim.
      if (mode === 'move') target.pos.x = 4;
      run(world, 8);
      expect(target.stats.hp < hp).toBe(mode === 'hit');
      expect(actor.pos.x).toBe(0);
      expect(actor.pos.z).toBeLessThan(5);
      if (mode === 'wall') expect(actor.pos.z).toBeLessThan(1.1);
    },
  );

  it('Vô Ảnh warns a fixed line, hits three scheduled times, and respects walls and movement', () => {
    for (const mode of ['hit', 'move', 'wall']) {
      const { world, actor, target, id } = setup('player_anh');
      if (mode === 'wall') world.obstacles.push({ pos: { x: 0, z: 2 }, radius: 0.5 });
      world.enqueueIntent(id, {
        type: 'CAST_SKILL',
        skillId: 'skill_anh_flurry',
        point: { x: 0, z: 7 },
      });
      const initial = run(world, 14);
      expect(initial.find((event) => event.type === 'CAST_START')).toMatchObject({
        line: { origin: { x: 0, z: 0 }, destination: { x: 0, z: 7 }, radius: 0.45 },
      });
      actor.pos.x = 5; // Remaining pulses retain the committed line and source position.
      const hp = target.stats.hp;
      if (mode === 'move') target.pos.x = 3;
      const later = run(world, 10);
      expect(
        later.filter(
          (event) => event.type === 'SKILL_IMPACT' && event.skillId === 'skill_anh_flurry',
        ),
      ).toHaveLength(2);
      expect(target.stats.hp < hp).toBe(mode === 'hit');
      expect(world.skillPulses).toHaveLength(0);
      for (const event of [...initial, ...later])
        expect(SimEventSchema.safeParse(event).success).toBe(true);
    }
  });
  it.each(['early', 'visible', 'wall', 'reserve'])(
    'farm defense respects observable windup, reaction delay and MP reserve: %s',
    (mode) => {
      const { world, actor, target } = setup('player_the');
      if (!actor.player) throw new Error('missing player');
      run(world, mode === 'early' ? 8 : 12);
      actor.player.farm.enabled = true;
      actor.player.farm.anchor = { ...actor.pos };
      target.pos = { x: 0, z: 1 };
      target.yaw = Math.PI;
      // Model a visible windup begun at tick 4, using the monster's authored timing.
      const def = world.content.monsters.get(target.defId);
      if (!def) throw new Error('missing monster definition');
      const start = 4;
      target.monsterSwing = {
        impactTick: start + Math.round(def.combat.windup * 20),
        endTick: 40,
        yaw: Math.PI,
        source: {
          actionId: 42,
          stats: { attack: 10, critChance: 0, critMultiplier: 1 },
          realm: target.realm,
          backlash: 1,
          element: null,
          expression: 'base',
        },
      };
      if (mode === 'wall') world.obstacles.push({ pos: { x: 0, z: 0.5 }, radius: 0.2 });
      if (mode === 'reserve') actor.stats.mp = actor.stats.maxMp * 0.25 + 11;
      const mp = actor.stats.mp;
      farmSystem(world);
      if (mode === 'visible') {
        expect(actor.cast?.skillId).toBe('skill_the_guard');
        expect(actor.stats.mp).toBe(mp - 12);
      } else {
        expect(actor.cast?.skillId).not.toBe('skill_the_guard');
        expect(actor.skills.get('skill_the_guard')).toBe(0);
        expect(actor.stats.mp).toBeGreaterThanOrEqual(actor.stats.maxMp * 0.25);
      }
    },
  );
  it('Trận requires live fields, uses a shared ownership cap and clears them on transfer', () => {
    const { world, actor, target, id } = setup('player_tran');
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'skill_tran_pulse' });
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'skill_tran_link' });
    expect(world.step().filter((e) => e.type === 'NOTICE' && e.code === 'no_target')).toHaveLength(
      2,
    );
    expect(actor.stats.mp).toBe(actor.stats.maxMp);
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'skill_tran_place',
      point: { ...target.pos },
    });
    run(world, 17);
    expect(world.skillPulses).toHaveLength(1);
    const hp = target.stats.hp;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'skill_tran_pulse' });
    run(world, 5);
    expect(target.stats.hp).toBeLessThan(hp);
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'skill_tran_great',
      point: { ...target.pos },
    });
    run(world, 24);
    expect(world.skillPulses).toHaveLength(2);
    actor.skills.set('skill_tran_place', 0);
    const mp = actor.stats.mp;
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'skill_tran_place',
      point: { ...target.pos },
    });
    expect(world.step().some((e) => e.type === 'NOTICE' && e.code === 'combat_capacity_full')).toBe(
      true,
    );
    expect(actor.stats.mp).toBe(mp);
    expect(actor.skills.get('skill_tran_place')).toBe(0);
    world.resetController(id);
    expect(world.skillPulses).toHaveLength(0);
    const save = world.exportPlayer(id);
    const next = setup('player_tran').world;
    next.spawnPlayer('player_tran', { save: save ?? undefined });
    expect(next.skillPulses).toHaveLength(0);
  });

  it('Trận fields stay at their locked point, can be reinforced only within their lifetime, and expire', () => {
    const { world, actor, target, id } = setup('player_tran');
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'skill_tran_place',
      point: { ...target.pos },
    });
    run(world, 17);
    const field = world.skillPulses[0];
    if (!field || !actor.player) throw new Error('missing field');
    const remaining = field.remaining;
    actor.player.combo.nextStep = 2;
    actor.player.combo.lastEndTick = world.tick;
    world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 5, z: 0 } });
    run(world, 8);
    expect(field.remaining).toBe(remaining + 1);
    target.pos.x = 5;
    const hp = target.stats.hp;
    run(world, 200);
    expect(target.stats.hp).toBe(hp);
    expect(world.skillPulses).toHaveLength(0);
    expect(field.cast.point).toEqual({ x: 0, z: 5 });
  });
  it('reserves projectile capacity during windups and rejects overflow without spending MP or cooldown', () => {
    const { world, id } = setup();
    const players = [id];
    for (let i = 1; i < 129; i++) players.push(world.spawnPlayer('player_phap'));
    for (const player of players) {
      const actor = world.entities.get(player);
      if (!actor) throw new Error('missing player');
      world.enqueueIntent(player, {
        type: 'CAST_SKILL',
        skillId: 'skill_phap_arrow',
        point: { x: actor.pos.x, z: actor.pos.z + 2 },
      });
    }
    expect(world.step().filter((e) => e.type === 'CAST_START')).toHaveLength(128);
    const last = world.entities.get(players[128] ?? 0);
    expect(last?.stats.mp).toBe(last?.stats.maxMp);
    expect(last?.skills.get('skill_phap_arrow')).toBe(0);
  });
  it('basic Pháp attacks release finite projectiles, miss sideways and stop at walls', () => {
    for (const mode of ['hit', 'move', 'wall']) {
      const { world, actor, target, id } = setup();
      const hp = target.stats.hp;
      world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 0, z: 8 } });
      const startup = run(world, 5);
      expect(startup.some((e) => e.type === 'SKILL_PROJECTILE')).toBe(true);
      expect(target.stats.hp).toBe(hp);
      if (mode === 'move') target.pos = { x: 3, z: 5 };
      if (mode === 'wall') world.obstacles.push({ pos: { x: 0, z: 2 }, radius: 0.5 });
      run(world, 20);
      expect(target.stats.hp < hp).toBe(mode === 'hit');
      expect(actor.stats.mp).toBe(actor.stats.maxMp);
      expect(world.skillProjectiles).toHaveLength(0);
    }
  });

  it('Thể guard absorbs once, expires at its exact tick and is cleared on transfer', () => {
    const { world, actor, target, id } = setup('player_the');
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'skill_the_guard' });
    const events = run(world, 3);
    expect(events.some((e) => e.type === 'SHIELD' && e.phase === 'gain')).toBe(true);
    const hp = actor.stats.hp;
    expect(actor.shield?.amount).toBe(250);
    applyDamage(world, target, actor, 100, false, null);
    expect(actor.stats.hp).toBe(hp);
    expect(actor.shield?.amount).toBe(150);
    applyDamage(world, target, actor, 200, false, null);
    expect(actor.stats.hp).toBe(hp - 50);
    expect(actor.shield).toBeNull();
    actor.shield = { amount: 100, endTick: world.tick + 2 };
    run(world, 2);
    expect(actor.shield).toBeNull();
    actor.shield = { amount: 100, endTick: world.tick + 20 };
    const save = world.exportPlayer(id);
    world.resetController(id);
    expect(actor.shield).toBeNull();
    const other = setup('player_the').world;
    const next = other.spawnPlayer('player_the', { save: save ?? undefined });
    expect(other.entities.get(next)?.shield).toBeFalsy();
    expect(other.exportPlayer(next)?.cooldowns?.skill_the_guard).toBe(
      save?.cooldowns?.skill_the_guard,
    );
  });

  it('Thiên Tượng has three warned impacts at fixed intervals, and walking out avoids later hits', () => {
    const { world, actor, target, id } = setup();
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'skill_phap_storm',
      point: { ...target.pos },
    });
    const first = run(world, 19);
    const hits = first.filter((e) => e.type === 'DAMAGE' && e.skillId === 'skill_phap_storm');
    expect(hits).toHaveLength(1);
    expect(world.skillPulses).toHaveLength(1);
    expect(first.some((e) => e.type === 'CAST_START' && e.continuation)).toBe(true);
    const hp = target.stats.hp;
    target.pos.x = 5;
    actor.stats.attack = 5000;
    const later = run(world, 20);
    expect(
      later.filter((e) => e.type === 'SKILL_IMPACT' && e.skillId === 'skill_phap_storm'),
    ).toHaveLength(2);
    expect(target.stats.hp).toBe(hp);
    expect(world.skillPulses).toHaveLength(0);
    for (const event of [...first, ...later])
      expect(SimEventSchema.safeParse(event).success).toBe(true);
  });

  it('scheduled damage uses committed offense and is cancelled by controller reset without refund', () => {
    const { world, actor, target, id } = setup();
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'skill_phap_storm',
      point: { ...target.pos },
    });
    const first = run(world, 19).find(
      (e) => e.type === 'DAMAGE' && e.skillId === 'skill_phap_storm',
    );
    if (first?.type !== 'DAMAGE') throw new Error('missing hit');
    actor.stats.attack = 10000;
    const second = run(world, 10).find(
      (e) => e.type === 'DAMAGE' && e.skillId === 'skill_phap_storm',
    );
    if (second?.type !== 'DAMAGE') throw new Error('missing second hit');
    expect(second.amount).toBeLessThan(first.amount * 2);
    const ready = actor.skills.get('skill_phap_storm');
    const mp = actor.stats.mp;
    world.resetController(id);
    expect(world.skillPulses).toHaveLength(0);
    expect(actor.skills.get('skill_phap_storm')).toBe(ready);
    expect(actor.stats.mp).toBe(mp);
    expect(
      run(world, 15).some((e) => e.type === 'DAMAGE' && e.skillId === 'skill_phap_storm'),
    ).toBe(false);
  });
});
