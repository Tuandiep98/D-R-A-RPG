import { ActionTimingSchema, type SkillDef, SkillDefSchema } from '@rpg/game-data';
import { describe, expect, it } from 'vitest';
import { actionPhase } from './systems/action-timeline';
import { applyDamage } from './systems/combat';
import { requestMobility } from './systems/mobility';
import { makeContent } from './test-fixtures';
import { World } from './world';

function setup(extraSkill?: SkillDef) {
  const leap = SkillDefSchema.parse({
    id: 'leap',
    name: 'Leap',
    targeting: 'self',
    cooldown: 5,
    mpCost: 18,
    timeline: { windup: 0.1, active: 0.3, recovery: 0.2, cancelRecoveryAfter: 0.1 },
    effects: [
      { type: 'dash', distance: 3 },
      { type: 'damage', multiplier: 1, radius: 1 },
    ],
  });
  const roll = SkillDefSchema.parse({
    id: 'roll',
    name: 'Roll',
    targeting: 'self',
    mobility: 'roll',
    cooldown: 5,
    effects: [{ type: 'dash', distance: 2 }],
  });
  const base = makeContent({ character: { skills: ['leap', 'mend'] } });
  const skills = new Map([...base.skills, ['leap', leap], ['roll', roll]]);
  if (extraSkill) skills.set(extraSkill.id, extraSkill);
  const world = new World({
    content: { ...base, skills },
    mapId: 'test_map',
  });
  const id = world.spawnPlayer('hero');
  const player = world.entities.get(id);
  const mob = [...world.entities.values()].find((e) => e.kind === 'monster');
  if (!player || !mob) throw new Error('missing fixture entities');
  player.pos = { x: 0, z: 0 };
  player.yaw = 0;
  mob.pos = { x: 0, z: 4 };
  mob.ai = null;
  return { world, id, player, mob };
}

describe('shared authoritative action timeline', () => {
  it('stamps strictly increasing event ids across ticks for authoritative replay dedupe', () => {
    const { world, id } = setup();
    world.enqueueIntent(id, { type: 'BASIC_ATTACK' });
    const events = Array.from({ length: 15 }, () => world.step()).flat();
    const ids = events.map((event) => event.eventId);
    expect(ids.every((eventId) => typeof eventId === 'number' && eventId > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it('mobility takes over a cancellable basic windup and discards its buffered follow-up', () => {
    const { world, id, player } = setup();
    world.enqueueIntent(id, { type: 'BASIC_ATTACK' });
    world.enqueueIntent(id, { type: 'BASIC_ATTACK' });
    world.enqueueIntent(id, { type: 'MOBILITY', action: 'roll' });
    world.step();
    expect(player.actionState?.kind).toBe('mobility');
    expect(player.swing).toBeNull();
    expect(player.actionBuffer).toBeNull();
    const events = Array.from({ length: 15 }, () => world.step()).flat();
    expect(events.some((event) => event.type === 'ATTACK' && event.sourceId === id)).toBe(false);
  });

  it('death clears action, buffer, held trigger and approach immediately without refunding costs', () => {
    const { world, id, player, mob } = setup();
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'leap' });
    world.step();
    world.enqueueIntent(id, { type: 'BASIC_ATTACK' });
    world.step();
    if (!player.player) throw new Error('missing player');
    player.player.trigger.held = true;
    player.player.trigger.queued = true;
    player.player.trigger.burstLeft = 3;
    const mp = player.stats.mp;
    const ready = player.skills.get('leap');
    applyDamage(world, mob, player, player.stats.hp, false, null);
    expect(player).toMatchObject({
      cast: null,
      swing: null,
      mobility: null,
      pending: null,
      actionState: null,
      actionBuffer: null,
      movement: { goal: null, path: null, dir: null },
      player: { trigger: { held: false, queued: false, burstLeft: 0, windup: null, reload: null } },
    });
    expect(player.stats.mp).toBe(mp);
    expect(player.skills.get('leap')).toBe(ready);
  });

  it('controller takeover purges queued input and buffered actions, preserving MP and cooldown', () => {
    const { world, id, player } = setup();
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'leap' });
    world.step();
    world.enqueueIntent(id, { type: 'BASIC_ATTACK' });
    const mp = player.stats.mp;
    const ready = player.skills.get('leap');
    world.resetController(id);
    const events = Array.from({ length: 15 }, () => world.step()).flat();
    expect(player.actionState).toBeNull();
    expect(player.actionBuffer).toBeNull();
    expect(player.cast).toBeNull();
    expect(player.stats.mp).toBe(mp);
    expect(player.skills.get('leap')).toBe(ready);
    expect(events.some((event) => event.type === 'ATTACK' && event.sourceId === id)).toBe(false);
    expect(events.some((event) => event.type === 'SKILL_IMPACT' && event.sourceId === id)).toBe(
      false,
    );
  });

  it('expires an out-of-range skill approach without spending MP or leaving an attack target', () => {
    const skill = SkillDefSchema.parse({
      id: 'approach',
      name: 'Approach',
      targeting: 'target',
      range: 1,
      cooldown: 5,
      mpCost: 10,
      effects: [{ type: 'damage', multiplier: 1 }],
    });
    const { world, id, player, mob } = setup(skill);
    player.skills.set(skill.id, 0);
    mob.pos = { x: 0, z: 15 };
    const mp = player.stats.mp;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: skill.id, targetId: mob.id });
    world.step();
    expect(player.pending?.type).toBe('cast');
    const events = Array.from({ length: 25 }, () => world.step()).flat();
    expect(player.pending).toBeNull();
    expect(player.combat.targetId).toBeNull();
    expect(player.movement.goal).toBeNull();
    expect(player.skills.get(skill.id)).toBe(0);
    expect(player.stats.mp).toBe(mp);
    expect(events.some((event) => event.type === 'CAST_START' && event.skillId === skill.id)).toBe(
      false,
    );
  });

  it('resolves zero-windup target damage after the target moves out of range', () => {
    const skill = SkillDefSchema.parse({
      id: 'instant',
      name: 'Instant',
      cooldown: 1,
      targeting: 'target',
      range: 1,
      effects: [{ type: 'damage', multiplier: 1 }],
    });
    const { world, id, player, mob } = setup(skill);
    player.skills.set(skill.id, 0);
    mob.pos = { x: 0, z: 1.85 };
    mob.movement.speed = 10;
    mob.movement.dir = { x: 0, z: 1 };
    const hp = mob.stats.hp;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: skill.id, targetId: mob.id });
    const events = world.step();
    expect(events.some((event) => event.type === 'CAST_START' && event.skillId === skill.id)).toBe(
      true,
    );
    expect(mob.stats.hp).toBe(hp);
  });

  it('buffers only the latest manual action and executes it at recovery end', () => {
    const { world, id, player } = setup();
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'leap' });
    for (let i = 0; i < 9; i++) world.step();
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'mend' });
    world.enqueueIntent(id, { type: 'BASIC_ATTACK' });
    world.step();
    expect(player.actionBuffer?.intent.type).toBe('BASIC_ATTACK');
    const events = Array.from({ length: 4 }, () => world.step()).flat();
    expect(events.some((e) => e.type === 'ATTACK' && e.sourceId === id)).toBe(true);
    expect(events.some((e) => e.type === 'CAST_START' && e.skillId === 'mend')).toBe(false);
    expect(player.actionBuffer).toBeNull();
  });

  it('expires an early buffered press after 200 ms instead of casting seconds later', () => {
    const { world, id, player } = setup();
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'leap' });
    world.step();
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'mend' });
    world.step();
    expect(player.actionBuffer).not.toBeNull();
    const events = Array.from({ length: 15 }, () => world.step()).flat();
    expect(player.actionBuffer).toBeNull();
    expect(events.some((e) => e.type === 'CAST_START' && e.skillId === 'mend')).toBe(false);
  });

  it('manual steering clears buffered actions and queued approaches without interrupting active travel', () => {
    const { world, id, player } = setup();
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'leap' });
    for (let i = 0; i < 4; i++) world.step();
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'mend' });
    world.step();
    expect(player.actionBuffer).not.toBeNull();
    world.enqueueIntent(id, { type: 'MOVE_DIR', dir: { x: 1, z: 0 } });
    world.step();
    expect(player.actionBuffer).toBeNull();
    expect(player.pending).toBeNull();
    expect(player.cast).not.toBeNull();
  });
  it('rejects nonfinite timing and a cancellation outside recovery', () => {
    for (const timing of [
      { windup: Infinity, active: 0, recovery: 0 },
      { windup: 0, active: -1, recovery: 0 },
      { windup: 0, active: 0, recovery: 0.1, cancelRecoveryAfter: 0.2 },
    ])
      expect(ActionTimingSchema.safeParse(timing).success).toBe(false);
  });

  it('travels over active ticks, locks direction and damages exactly once on landing', () => {
    const { world, id, player, mob } = setup();
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'leap' });
    const events = world.step();
    const a = player.actionState;
    if (!a) throw new Error('action absent');
    expect(actionPhase(a, world.tick)).toBe('windup');
    expect(player.pos.z).toBe(0);
    const hp = mob.stats.hp;
    for (let i = 0; i < 7; i++) {
      // Input steering cannot rotate the committed strike or replace active traversal.
      player.movement.dir = { x: 1, z: 0 };
      player.yaw = Math.PI / 2;
      events.push(...world.step());
      expect(player.pos.z).toBeLessThanOrEqual(3);
      expect(mob.stats.hp).toBe(hp);
    }
    events.push(...world.step());
    expect(player.pos.z).toBeCloseTo(3, 6);
    expect(player.pos.x).toBeCloseTo(0, 6);
    expect(mob.stats.hp).toBeLessThan(hp);
    expect(events.filter((e) => e.type === 'DAMAGE' && e.skillId === 'leap')).toHaveLength(1);
    expect(actionPhase(a, world.tick)).toBe('recovery');
    expect(world.snapshot().entities.find((e) => e.id === id)?.actionState?.id).toBe(a.id);
  });

  it('cancels windup without refunding MP or cooldown, leaving no delayed impact', () => {
    const { world, id, player } = setup();
    const mp = player.stats.mp;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'leap' });
    world.step();
    const ready = player.skills.get('leap');
    world.enqueueIntent(id, { type: 'STOP' });
    const events = world.step();
    expect(player.cast).toBeNull();
    expect(player.actionState).toBeNull();
    expect(player.stats.mp).toBe(mp - 18);
    expect(player.skills.get('leap')).toBe(ready);
    for (let i = 0; i < 15; i++) events.push(...world.step());
    expect(events.some((e) => e.type === 'SKILL_IMPACT' && e.skillId === 'leap')).toBe(false);
  });

  it('prevents mobility during active and allows it only after the recovery cancellation tick', () => {
    const { world, id, player } = setup();
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'leap' });
    for (let i = 0; i < 4; i++) world.step();
    expect(requestMobility(world, player, 'roll')).toBe(false);
    for (let i = 0; i < 5; i++) world.step();
    expect(requestMobility(world, player, 'roll')).toBe(false);
    for (let i = 0; i < 2; i++) world.step();
    expect(requestMobility(world, player, 'roll')).toBe(true);
    expect(requestMobility(world, player, 'jump')).toBe(false);
  });

  it('stops traversal at walls and resolves at the actual landing point', () => {
    const { world, id, player } = setup();
    world.obstacles.push({ pos: { x: 0, z: 1.5 }, radius: 0.4 });
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'leap' });
    const events = Array.from({ length: 9 }, () => world.step()).flat();
    expect(player.pos.z).toBeLessThan(1);
    const impact = events.find((e) => e.type === 'SKILL_IMPACT' && e.skillId === 'leap');
    expect(impact?.type === 'SKILL_IMPACT' ? impact.point.z : undefined).toBe(player.pos.z);
  });
});
