import { DamageSpecSchema, SkillDefSchema } from '@rpg/game-data';
import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { resolveDamage } from './systems/combat';
import { makeContent } from './test-fixtures';
import { World } from './world';

describe('shared damage contract', () => {
  it('rounds once after flat damage, distance, position, affinity, crit, realm and backlash', () => {
    const attacker = { attack: 23.7, critChance: 1, critMultiplier: 1.6 };
    const defender = { defense: 13 };
    const spec = DamageSpecSchema.parse({ multiplier: 1.3, flat: 9.2, elementalShare: 0.7 });
    const variance = 1 + new Rng(42).range(-0.1, 0.1);
    const base = (23.7 * 1.3 + 9.2) * 0.6 * 1.2;
    const mitigation = 100 / 165;
    const raw = base * (0.3 * mitigation + 0.7 * 1.15 * mitigation) * variance * 1.6 * 0.5 * 0.5;
    expect(
      resolveDamage(new Rng(42), attacker, defender, spec, {
        distanceFactor: 0.6,
        positionFactor: 1.2,
        elementFactor: 1.15,
        realmFactor: 0.5,
        backlashFactor: 0.5,
      }),
    ).toEqual({ amount: Math.max(1, Math.round(raw)), crit: true });
  });

  it.each([0, 0.3, 0.7, 1])('applies affinity only to elemental share %s', (share) => {
    const attacker = { attack: 100, critChance: 0, critMultiplier: 2 };
    const variance = 1 + new Rng(9).range(-0.1, 0.1);
    const actual = resolveDamage(
      new Rng(9),
      attacker,
      { defense: 0 },
      {
        elementalShare: share,
      },
      { elementFactor: 0.9 },
    );
    expect(actual.amount).toBe(Math.round(100 * variance * (1 - share + share * 0.9)));
  });

  it('can disable critical damage without changing the seeded RNG sequence', () => {
    const attacker = { attack: 100, critChance: 1, critMultiplier: 2 };
    const a = new Rng(42);
    const b = new Rng(42);
    const periodic = resolveDamage(a, attacker, { defense: 0 }, { canCrit: false });
    const normal = resolveDamage(b, attacker, { defense: 0 });
    expect(periodic.crit).toBe(false);
    expect(normal.crit).toBe(true);
    expect(normal.amount).toBeCloseTo(periodic.amount * 2, -1);
    expect(a.getState()).toBe(b.getState());
  });

  it.each([
    { multiplier: 0 },
    { flat: -1 },
    { elementalShare: 1.1 },
    { critBonus: -0.1 },
    { flat: Number.POSITIVE_INFINITY },
    { canCrit: 'no' },
  ])('rejects invalid damage payload %j', (spec) => {
    expect(DamageSpecSchema.safeParse(spec).success).toBe(false);
  });
});

const projectileSkill = SkillDefSchema.parse({
  id: 'slow_shot',
  name: 'Slow shot',
  targeting: 'point',
  range: 15,
  cooldown: 10,
  castTime: 0.3,
  delivery: 'projectile',
  projectileSpeed: 4,
  effects: [{ type: 'damage', multiplier: 1, elementalShare: 0.7 }],
});

function setup(skill = projectileSkill, gun = false) {
  const base = makeContent({
    character: {
      skills: [skill.id],
      starterItems: [{ itemId: gun ? 'gun_slow' : 'sword', equip: true }, { itemId: 'sword' }],
    },
    ranged: [
      {
        id: 'slow',
        name: 'Slow gun',
        fireMode: 'semi',
        fireInterval: 1,
        magazine: 3,
        reload: { seconds: 1 },
        projectile: { speed: 4, range: 20 },
        damage: 1,
        moveMultiplier: 1,
      },
    ],
    monster: { stats: { hp: 10_000, attack: 0, defense: 0, hpRegen: 0, critChance: 0 } },
  });
  const world = new World({
    content: { ...base, skills: new Map([...base.skills, [skill.id, skill]]) },
    mapId: 'test_map',
    seed: 42,
  });
  const id = world.spawnPlayer('hero', { element: 'moc', expression: 'thunder' });
  const player = world.entities.get(id);
  const mob = [...world.entities.values()].find((e) => e.kind === 'monster');
  if (!player || !mob) throw new Error('missing fixture');
  mob.ai = null;
  mob.pos = { x: 0, z: gun ? 8 : 1.5 };
  mob.stats.hpRegen = 0;
  return { world, id, player, mob };
}

describe('offensive properties locked at action start', () => {
  it.each(['skill', 'gun', 'melee'] as const)(
    '%s keeps its damage and affinity after equipment/stat changes',
    (kind) => {
      const play = (change: boolean) => {
        const { world, id, player, mob } = setup(projectileSkill, kind === 'gun');
        if (kind === 'skill') mob.pos.z = 8;
        // Let the gun finish drawing before the tap.
        for (let i = 0; i < 8; i++) world.step();
        world.enqueueIntent(
          id,
          kind === 'skill'
            ? { type: 'CAST_SKILL', skillId: projectileSkill.id, point: { x: 0, z: 12 } }
            : { type: 'BASIC_ATTACK', aim: { x: 0, z: 12 } },
        );
        world.step();
        if (change) {
          const sword = player.player?.inventory.find((item) => item.itemId === 'sword');
          if (!sword) throw new Error('missing sword');
          world.enqueueIntent(id, { type: 'EQUIP', instanceId: sword.instanceId });
        }
        const events = [];
        // Process equip, then emulate a later buff/affinity change during the action.
        events.push(...world.step());
        if (change) {
          player.stats.attack = 999;
          player.stats.critChance = 1;
          player.stats.critMultiplier = 9;
          player.realm = 1;
          player.element = 'hoa';
          player.expression = 'base';
        }
        for (let i = 0; i < 70; i++) events.push(...world.step());
        const hits = events.filter((event) => event.type === 'DAMAGE' && event.sourceId === id);
        expect(hits).toHaveLength(1);
        const hit = hits[0];
        if (hit?.type !== 'DAMAGE') throw new Error('missing hit');
        return {
          amount: hit.amount,
          crit: hit.crit,
          element: hit.element,
          expression: hit.expression,
        };
      };
      expect(play(true)).toEqual(play(false));
    },
  );

  it('reads the target defense on contact rather than on launch', () => {
    const play = (defense: number) => {
      const { world, id, mob } = setup();
      mob.pos.z = 8;
      world.enqueueIntent(id, {
        type: 'CAST_SKILL',
        skillId: projectileSkill.id,
        point: { x: 0, z: 12 },
      });
      world.step();
      mob.stats.defense = defense;
      const hp = mob.stats.hp;
      for (let i = 0; i < 70; i++) world.step();
      return hp - mob.stats.hp;
    };
    expect(play(50)).toBeLessThan(play(0));
    expect(play(50)).toBeGreaterThan(0);
  });

  it('launches one projectile and applies each damage payload once', () => {
    const skill = SkillDefSchema.parse({
      ...projectileSkill,
      castTime: 0,
      effects: [
        { type: 'damage', multiplier: 1, elementalShare: 0 },
        { type: 'damage', multiplier: 2, elementalShare: 1, canCrit: false },
      ],
    });
    const { world, id, mob } = setup(skill);
    mob.pos.z = 8;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: skill.id, point: { x: 0, z: 12 } });
    const events = [...world.step()];
    expect(world.skillProjectiles).toHaveLength(1);
    for (let i = 0; i < 70; i++) events.push(...world.step());
    const hits = events.filter((event) => event.type === 'DAMAGE' && event.skillId === skill.id);
    expect(hits).toHaveLength(2);
    expect(events.filter((event) => event.type === 'SKILL_PROJECTILE')).toHaveLength(1);
    expect(hits[1]).toMatchObject({ crit: false });
  });
});
