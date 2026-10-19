import { SkillDefSchema } from '@rpg/game-data';
import { describe, expect, it } from 'vitest';
import { makeContent } from './test-fixtures';
import { World } from './world';

function play(pierce: number) {
  const skill = SkillDefSchema.parse({
    id: 'sword_qi',
    name: 'Sword qi',
    targeting: 'point',
    range: 12,
    cooldown: 5,
    castTime: 0,
    delivery: 'projectile',
    projectileSpeed: 16,
    projectilePierce: pierce,
    effects: [{ type: 'damage', multiplier: 1 }],
  });
  const base = makeContent({
    character: { skills: [skill.id] },
    monster: {
      stats: { hp: 10_000, attack: 0, defense: 0, hpRegen: 0, critChance: 0 },
    },
    map: {
      spawns: [
        {
          id: 'camp',
          monsterId: 'wolf',
          position: { x: 0, z: 20 },
          count: 3,
          respawnSeconds: 3,
        },
      ],
    },
  });
  const world = new World({
    content: { ...base, skills: new Map([...base.skills, [skill.id, skill]]) },
    mapId: 'test_map',
    seed: 42,
  });
  const id = world.spawnPlayer('hero');
  const mobs = [...world.entities.values()].filter((e) => e.kind === 'monster');
  expect(mobs).toHaveLength(3);
  // Three wolves in a row along the shot.
  mobs.forEach((m, i) => {
    m.ai = null;
    m.pos = { x: 0, z: 4 + i * 2 };
  });
  world.enqueueIntent(id, {
    type: 'CAST_SKILL',
    skillId: skill.id,
    point: { x: 0, z: 12 },
  });
  const events = [];
  for (let i = 0; i < 40; i++) events.push(...world.step());
  const damaged = events.flatMap((e) =>
    e.type === 'DAMAGE' && e.skillId === skill.id ? [e.targetId] : [],
  );
  const impacts = events.filter((e) => e.type === 'SKILL_IMPACT' && e.skillId === skill.id);
  return { damaged, impacts, order: mobs.map((m) => m.id), world };
}

describe('piercing skill projectiles', () => {
  it('stops at the first body without pierce', () => {
    const { damaged, impacts, order } = play(0);
    expect(damaged).toEqual([order[0]]);
    expect(impacts).toHaveLength(1);
  });

  it('passes through bodies in order, each hit once, until spent', () => {
    const one = play(1);
    expect(one.damaged).toEqual([one.order[0], one.order[1]]);
    const all = play(3);
    expect(all.damaged).toEqual(all.order);
    expect(all.impacts).toHaveLength(3);
    expect(all.world.skillProjectiles).toHaveLength(0);
  });
});
