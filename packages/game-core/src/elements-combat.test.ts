import { CombatRulesSchema, compatibleExpression, SkillDefSchema } from '@rpg/game-data';
import type { Intent } from '@rpg/game-protocol';
import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { applyDamage, rollHit } from './systems/combat';
import { farmSystem } from './systems/farm';
import { applyIntents } from './systems/intents';
import { requestMobility } from './systems/mobility';
import { makeContent } from './test-fixtures';
import { World } from './world';

const combat = CombatRulesSchema.parse({
  id: 'combat_rules',
  counters: { kim: 'moc', moc: 'tho', tho: 'thuy', thuy: 'hoa', hoa: 'kim' },
  advantage: 1.15,
  disadvantage: 0.9,
  basicShare: 0.3,
  skillShare: 0.7,
  bufferSeconds: 0.2,
  lateRealm: 'hoa_than',
  farm: { radius: 10, leash: 14, reaction: 0.3, thinkInterval: 0.2, hpStop: 0.25, mpReserve: 0.25 },
});
const mobility = (['roll', 'blink', 'jump'] as const).map((action) =>
  SkillDefSchema.parse({
    id: `skill_${action}`,
    name: action,
    targeting: 'self',
    mobility: action,
    cooldown: 5,
    duration: action === 'jump' ? 0.45 : 0.3,
    dodgeWindow: action === 'jump' ? [0.1, 0.35] : [0.1, 0.2],
    effects: [{ type: 'dash', distance: 3 }],
  }),
);
const shot = SkillDefSchema.parse({
  id: 'aimed_shot',
  name: 'Shot',
  targeting: 'point',
  range: 10,
  delivery: 'projectile',
  projectileSpeed: 10,
  cooldown: 1,
  effects: [{ type: 'damage', multiplier: 1 }],
});
function setup() {
  const base = makeContent({
    character: { skills: [shot.id] },
    monster: { combat: { range: 1.5, attackInterval: 1, windup: 0.55, arc: 90 } },
  });
  const content = {
    ...base,
    combat: new Map([[combat.id, combat]]),
    skills: new Map([...base.skills, [shot.id, shot], ...mobility.map((s) => [s.id, s] as const)]),
  };
  const world = new World({ content, mapId: 'test_map' });
  const id = world.spawnPlayer('hero', { element: 'moc', expression: 'thunder' });
  const player = world.entities.get(id);
  if (!player) throw new Error('missing player');
  const mob = [...world.entities.values()].find((e) => e.kind === 'monster');
  if (!mob) throw new Error('missing monster');
  mob.ai = null;
  mob.pos = { x: 0, z: 4 };
  player.pos = { x: 0, z: 0 };
  return { world, id, player, mob };
}
describe('authoritative element combat', () => {
  it('farm keeps approach through range noise until it reaches the inner threshold', () => {
    const { world, player, mob } = setup();
    if (!player.player) throw new Error('missing player');
    player.stats.mp = 0;
    player.player.farm.enabled = true;
    const optimal = player.combat.range * 0.65;
    const body = player.movement.radius + mob.movement.radius;
    for (const [offset, moving] of [
      [0.4, true],
      [0.2, true],
      [0.1, true],
      [0, false],
      [0.1, false],
      [0.29, false],
      [0.31, true],
    ] as const) {
      mob.pos.z = optimal + body + offset;
      farmSystem(world);
      expect(!!player.movement.goal, `edge offset ${offset}`).toBe(moving);
    }
    mob.faction = 'neutral';
    farmSystem(world);
    expect(player.player.farm.approach).toBeNull();
  });

  it.each([
    'MOVE_TO',
    'MOVE_DIR',
    'STOP',
    'CAST_SKILL',
    'MOBILITY',
    'BASIC_ATTACK',
    'TRIGGER',
    'ATTACK_TARGET',
    'RELOAD',
    'PICKUP',
    'INTERACT',
    'EQUIP',
    'UNEQUIP',
  ] as const)('%s takes over farm immediately and clears future auto fire/approach', (type) => {
    const { world, id, player, mob } = setup();
    if (!player.player) throw new Error('missing player');
    player.player.farm.enabled = true;
    player.combat.targetId = mob.id;
    player.pending = {
      type: 'cast',
      skillId: shot.id,
      expiresTick: 4,
      targetId: mob.id,
      point: null,
    };
    player.actionBuffer = { expiresTick: 4, intent: { type: 'BASIC_ATTACK' } };
    player.player.trigger.held = true;
    player.player.trigger.queued = true;
    player.player.trigger.burstLeft = 2;
    const commands: Record<typeof type, Intent> = {
      MOVE_TO: { type: 'MOVE_TO', target: { x: 4, z: 0 } },
      MOVE_DIR: { type: 'MOVE_DIR', dir: { x: 1, z: 0 } },
      STOP: { type: 'STOP' },
      CAST_SKILL: { type: 'CAST_SKILL', skillId: shot.id, point: { x: 4, z: 0 } },
      MOBILITY: { type: 'MOBILITY', action: 'roll', point: { x: 4, z: 0 } },
      BASIC_ATTACK: { type: 'BASIC_ATTACK', aim: { x: 4, z: 0 } },
      TRIGGER: { type: 'TRIGGER', held: false },
      ATTACK_TARGET: { type: 'ATTACK_TARGET', targetId: mob.id },
      RELOAD: { type: 'RELOAD' },
      PICKUP: { type: 'PICKUP', lootId: mob.id },
      INTERACT: { type: 'INTERACT', entityId: mob.id },
      EQUIP: { type: 'EQUIP', instanceId: 'missing' },
      UNEQUIP: { type: 'UNEQUIP', slot: 'main_hand' },
    };
    applyIntents(world, [{ entityId: id, intent: commands[type] }]);
    expect(player.player.farm.enabled).toBe(false);
    expect(player.player.trigger).toMatchObject({ held: false, queued: false, burstLeft: 0 });
    expect(player.pending).toBeNull();
    expect(player.actionBuffer).toBeNull();
    // Farm cannot replace the manual command on the next think pass.
    const goal = player.movement.goal;
    farmSystem(world);
    expect(player.movement.goal).toEqual(goal);
  });
  it('resolves expression compatibility from mapping data without adding a sixth element', () => {
    expect(compatibleExpression('moc', 'thunder', combat.expressions)).toBe(true);
    expect(compatibleExpression('thuy', 'ice', combat.expressions)).toBe(true);
    expect(compatibleExpression('kim', 'thunder', combat.expressions)).toBe(false);
    const revised = { thunder: 'kim', ice: 'thuy' } as const;
    expect(compatibleExpression('kim', 'thunder', revised)).toBe(true);
    expect(compatibleExpression('moc', 'thunder', revised)).toBe(false);
  });
  it('rejects counter tables containing self edges or separate cycles', () => {
    expect(
      CombatRulesSchema.safeParse({
        ...combat,
        counters: { kim: 'kim', moc: 'tho', tho: 'thuy', thuy: 'hoa', hoa: 'moc' },
      }).success,
    ).toBe(false);
    expect(
      CombatRulesSchema.safeParse({
        ...combat,
        counters: { kim: 'moc', moc: 'kim', tho: 'thuy', thuy: 'hoa', hoa: 'tho' },
      }).success,
    ).toBe(false);
  });
  it('rolls back matchup bonuses per world while preserving saved affinity', () => {
    const { world, player, mob } = setup();
    const classic = new World({
      content: world.content,
      mapId: 'test_map',
      combatRuleset: 'classic',
    });
    const id = classic.spawnPlayer('hero', { save: world.exportPlayer(player.id) ?? undefined });
    const actor = classic.entities.get(id);
    if (!actor) throw new Error('missing classic actor');
    player.element = actor.element = 'moc';
    mob.element = 'tho';
    const old = rollHit(classic, actor, mob, { multiplier: 10, elementalShare: 1 });
    const next = rollHit(world, player, mob, { multiplier: 10, elementalShare: 1 });
    expect(next.amount).toBeGreaterThan(old.amount);
    expect(classic.exportPlayer(id)).toMatchObject({ element: 'moc', expression: 'thunder' });
    expect(classic.combatRuleset).toBe('classic');
    expect(world.combatRuleset).toBe('elements_v1');
  });
  it('evaluates all 25 matchups on only the elemental share', () => {
    const { world, player, mob } = setup();
    for (const a of ['kim', 'moc', 'thuy', 'hoa', 'tho'] as const)
      for (const b of ['kim', 'moc', 'thuy', 'hoa', 'tho'] as const) {
        player.element = a;
        mob.element = b;
        const rng = new Rng(42);
        const variance = 1 + rng.range(-0.1, 0.1);
        const crit = rng.chance(player.stats.critChance);
        const base =
          player.stats.attack *
          10 *
          (100 / (100 + mob.stats.defense * 5)) *
          variance *
          (crit ? player.stats.critMultiplier : 1);
        const actual = rollHit(
          {
            ...world,
            rng: new Rng(42),
            content: world.content,
            realms: world.realms,
            tick: world.tick,
          } as typeof world,
          player,
          mob,
          { multiplier: 10 },
        );
        const factor =
          combat.counters[a] === b
            ? combat.advantage
            : combat.counters[b] === a
              ? combat.disadvantage
              : 1;
        expect(actual.amount).toBe(
          Math.max(1, Math.round(base * (1 + combat.basicShare * (factor - 1)))),
        );
      }
  });
  it('emits a projectile launch without applying damage until collision', () => {
    const { world, id, mob } = setup();
    const hp = mob.stats.hp;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: shot.id, point: { x: 0, z: 8 } });
    expect(world.step().some((e) => e.type === 'SKILL_PROJECTILE')).toBe(true);
    expect(mob.stats.hp).toBe(hp);
    for (let i = 0; i < 12; i++) world.step();
    expect(mob.stats.hp).toBeLessThan(hp);
    expect(world.skillProjectiles).toHaveLength(0);
  });
  it('lets moving targets leave projectile paths', () => {
    const { world, id, mob } = setup();
    const hp = mob.stats.hp;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: shot.id, point: { x: 0, z: 8 } });
    world.step();
    mob.pos.x = 3;
    for (let i = 0; i < 25; i++) world.step();
    expect(mob.stats.hp).toBe(hp);
  });
  it('rolls on ticks, shares cooldown and cannot cross a wall', () => {
    const { world, player } = setup();
    world.obstacles.push({ pos: { x: 1.2, z: 0 }, radius: 0.4 });
    expect(requestMobility(world, player, 'roll', { x: 4, z: 0 })).toBe(true);
    for (let i = 0; i < 8; i++) world.step();
    expect(player.pos.x).toBeLessThan(1);
    expect(player.mobility).toBeNull();
    expect(requestMobility(world, player, 'roll')).toBe(false);
  });
  it('a monster windup can miss when the player exits its locked cone', () => {
    const { world, player, mob } = setup();
    mob.pos = { x: 0, z: 1 };
    mob.combat.targetId = player.id;
    const hp = player.stats.hp;
    world.step();
    expect(mob.monsterSwing).not.toBeNull();
    expect(player.stats.hp).toBe(hp);
    player.pos = { x: 4, z: 1 };
    for (let i = 0; i < 12; i++) world.step();
    expect(player.stats.hp).toBe(hp);
  });
  it('preserves affinity across map/save round trips', () => {
    const { world, id } = setup();
    const save = world.exportPlayer(id);
    if (!save) throw new Error('missing save');
    const other = new World({ content: world.content, mapId: 'test_map' });
    const next = other.spawnPlayer('hero', { save });
    expect(other.playerState(next)).toMatchObject({ element: 'moc', expression: 'thunder' });
  });
  it('manual steering disables farm on the next tick', () => {
    const { world, id, player } = setup();
    world.enqueueIntent(id, { type: 'SET_FARM', enabled: true });
    world.step();
    expect(player.player?.farm.enabled).toBe(true);
    world.enqueueIntent(id, { type: 'MOVE_DIR', dir: { x: 1, z: 0 } });
    world.step();
    expect(player.player?.farm.enabled).toBe(false);
  });
  it('uses the roll window, and jump only avoids low ground attacks', () => {
    const { world, player, mob } = setup();
    const hp = player.stats.hp;
    expect(requestMobility(world, player, 'roll')).toBe(true);
    for (let i = 0; i < 2; i++) world.step();
    applyDamage(world, mob, player, 10, false, null);
    expect(player.stats.hp).toBe(hp);
    for (let i = 0; i < 3; i++) world.step();
    applyDamage(world, mob, player, 10, false, null);
    expect(player.stats.hp).toBe(hp - 10);
    world.step();
    expect(player.mobility).toBeNull();
    expect(requestMobility(world, player, 'jump')).toBe(true);
    for (let i = 0; i < 3; i++) world.step();
    applyDamage(world, mob, player, 10, false, null, {
      hit: 'solid',
      heavy: false,
      groundLow: true,
    });
    expect(player.stats.hp).toBe(hp - 10);
    applyDamage(world, mob, player, 10, false, null);
    expect(player.stats.hp).toBe(hp - 20);
  });
  it('blocks a projectile at a wall before a body, but hits a body before the wall', () => {
    for (const wall of [2, 6]) {
      const { world, id, mob } = setup();
      const hp = mob.stats.hp;
      world.obstacles.push({ pos: { x: 0, z: wall }, radius: 0.3 });
      world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: shot.id, point: { x: 0, z: 8 } });
      for (let i = 0; i < 20; i++) world.step();
      expect(mob.stats.hp < hp).toBe(wall === 6);
    }
  });
  it('auto damages monsters through normal casts and stops at low health', () => {
    const { world, id, player, mob } = setup();
    const hp = mob.stats.hp;
    world.enqueueIntent(id, { type: 'SET_FARM', enabled: true });
    for (let i = 0; i < 25; i++) world.step();
    expect(mob.stats.hp).toBeLessThan(hp);
    player.stats.hp = 1;
    world.step();
    expect(player.player?.farm.enabled).toBe(false);
  });
  it('keeps mobility cooldowns across a new world', () => {
    const { world, id, player } = setup();
    expect(requestMobility(world, player, 'roll')).toBe(true);
    world.step();
    const save = world.exportPlayer(id);
    if (!save) throw new Error('missing save');
    const other = new World({ content: world.content, mapId: 'test_map' });
    const next = other.spawnPlayer('hero', { save });
    const restored = other.entities.get(next);
    if (!restored) throw new Error('missing player');
    expect(requestMobility(other, restored, 'roll')).toBe(false);
    for (let i = 0; i < 100; i++) other.step();
    expect(requestMobility(other, restored, 'roll')).toBe(true);
  });
  it('farm safety stop clears approach, followups and held fire without refunding cooldowns', () => {
    const { world, player, mob } = setup();
    if (!player.player) throw new Error('missing player');
    player.player.farm.enabled = true;
    player.stats.hp = 1;
    player.combat.targetId = mob.id;
    player.movement.goal = { pos: { ...mob.pos }, stopWithin: 0.2 };
    player.movement.path = [{ ...mob.pos }];
    player.pending = {
      type: 'cast',
      expiresTick: 4,
      skillId: shot.id,
      targetId: mob.id,
      point: null,
    };
    player.actionBuffer = { expiresTick: 4, intent: { type: 'BASIC_ATTACK' } };
    player.player.trigger.held = true;
    player.player.trigger.queued = true;
    player.player.trigger.burstLeft = 2;
    player.skills.set(shot.id, 80);
    farmSystem(world);
    expect(player).toMatchObject({
      pending: null,
      actionBuffer: null,
      movement: { goal: null, path: null },
      combat: { targetId: null },
      player: { farm: { enabled: false }, trigger: { held: false, queued: false, burstLeft: 0 } },
    });
    expect(player.skills.get(shot.id)).toBe(80);
  });
  it('farm drops a selected target that has crossed behind a wall', () => {
    const { world, player, mob } = setup();
    if (!player.player) throw new Error('missing player');
    player.player.farm.enabled = true;
    player.combat.targetId = mob.id;
    world.obstacles.push({ pos: { x: 0, z: 2 }, radius: 0.6 });
    farmSystem(world);
    expect(player.combat.targetId).toBeNull();
    expect(player.cast).toBeNull();
  });
  it('stops once with a clear reason when its return path stays blocked', () => {
    const { world, player, mob, id } = setup();
    if (!player.player) throw new Error('missing player');
    mob.faction = 'neutral';
    player.pos = { x: 0, z: 3 };
    player.player.farm = { enabled: true, anchor: { x: 0, z: 0 }, pausedUntil: 0 };
    world.obstacles.push({ pos: { x: 0, z: 1.5 }, radius: 0.8 });
    const events = Array.from({ length: 240 }, () => world.step()).flat();
    expect(player.player.farm.enabled).toBe(false);
    expect(events.filter((e) => e.type === 'NOTICE' && e.code === 'farm_stuck')).toHaveLength(1);
    expect(player.movement.goal).toBeNull();
    expect(player.movement.path).toBeNull();
    expect(player.pos.z).toBeGreaterThan(2);
    world.enqueueIntent(id, { type: 'SET_FARM', enabled: true });
    world.step();
    expect(player.player.farm.enabled).toBe(true);
    expect(player.player.farm.progress).toBeFalsy();
  });
  it('keeps farming after a successful return to anchor instead of treating idle as stuck', () => {
    const { world, player, mob } = setup();
    if (!player.player) throw new Error('missing player');
    mob.faction = 'neutral';
    player.pos = { x: 0, z: 3 };
    player.player.farm = { enabled: true, anchor: { x: 0, z: 0 }, pausedUntil: 0 };
    const events = Array.from({ length: 240 }, () => world.step()).flat();
    expect(player.player.farm.enabled).toBe(true);
    expect(player.pos.z).toBeLessThanOrEqual(1);
    expect(events.some((e) => e.type === 'NOTICE' && e.code === 'farm_stuck')).toBe(false);
  });
});
