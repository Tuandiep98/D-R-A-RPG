import { SkillDefSchema } from '@rpg/game-data';
import { describe, expect, it } from 'vitest';
import { makeContent } from './test-fixtures';
import { World } from './world';

const dash = SkillDefSchema.parse({
  id: 'thunder_dash',
  name: 'Dash',
  targeting: 'self',
  cooldown: 4,
  mpCost: 8,
  effects: [{ type: 'dash', distance: 4 }],
  vfx: 'thunder_dash',
});
const leap = SkillDefSchema.parse({
  id: 'thunder_leap',
  name: 'Leap',
  targeting: 'self',
  cooldown: 9,
  mpCost: 18,
  effects: [
    { type: 'dash', distance: 3 },
    { type: 'damage', multiplier: 2, radius: 2 },
  ],
});

function setup() {
  const base = makeContent({ character: { skills: ['thunder_dash', 'thunder_leap'] } });
  const content = { ...base, skills: new Map([...base.skills, [dash.id, dash], [leap.id, leap]]) };
  const world = new World({ content, mapId: 'test_map' });
  const id = world.spawnPlayer('hero');
  const player = world.entities.get(id);
  if (!player) throw new Error('player did not spawn');
  return { world, id, player };
}

describe('thunder mobility', () => {
  it('moves along held direction, spends MP, starts cooldown and cannot cross an obstacle', () => {
    const { world, id, player } = setup();
    player.movement.dir = { x: 1, z: 0 };
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: dash.id });
    const first = world.step();
    expect(player.pos.x).toBeGreaterThan(3.8);
    expect(player.stats.mp).toBe(92);
    expect(first.some((e) => e.type === 'SKILL_IMPACT' && e.skillId === dash.id)).toBe(true);
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: dash.id });
    expect(world.step().some((e) => e.type === 'NOTICE' && e.code === 'cooldown')).toBe(true);

    const { world: blocked, id: blockedId, player: blockedPlayer } = setup();
    blockedPlayer.movement.dir = { x: 1, z: 0 };
    // World obstacles are defined by map data; a large collider blocks the sampled route.
    const obstacle = { pos: { x: 2, z: 0 }, radius: 0.5 };
    blocked.obstacles.push(obstacle);
    blocked.enqueueIntent(blockedId, { type: 'CAST_SKILL', skillId: dash.id });
    blocked.step();
    expect(blockedPlayer.pos.x).toBeLessThan(1.2);
  });

  it('uses the landing point for area damage', () => {
    const { world, id, player } = setup();
    const mob = [...world.entities.values()].find((e) => e.kind === 'monster');
    if (!mob) throw new Error('monster did not spawn');
    mob.pos = { x: 0, z: 4 };
    player.movement.dir = { x: 0, z: 1 };
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: leap.id });
    const events = world.step();
    expect(
      events.some((e) => e.type === 'DAMAGE' && e.skillId === leap.id && e.targetId === mob.id),
    ).toBe(true);
    expect(events.find((e) => e.type === 'SKILL_IMPACT' && e.skillId === leap.id)).toMatchObject({
      point: { z: 3 },
    });
  });
});
