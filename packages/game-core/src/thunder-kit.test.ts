import { SkillDefSchema } from '@rpg/game-data';
import { describe, expect, it } from 'vitest';
import { isStaggered } from './context';
import type { Entity } from './entity';
import { makeContent } from './test-fixtures';
import { World } from './world';

const leap = SkillDefSchema.parse({
  id: 'leap',
  name: 'Leap',
  targeting: 'self',
  cooldown: 9,
  delivery: 'circle',
  effects: [
    { type: 'dash', distance: 3 },
    { type: 'damage', multiplier: 1, radius: 3, stun: 1 },
  ],
});
const domain = SkillDefSchema.parse({
  id: 'domain',
  name: 'Domain',
  targeting: 'self',
  cooldown: 1,
  mpCost: 10,
  sustain: { mpPerSecond: 20, interval: 1 },
  delivery: 'circle',
  effects: [{ type: 'damage', multiplier: 0.5, radius: 3 }],
});
const storm = SkillDefSchema.parse({
  id: 'storm',
  name: 'Storm',
  targeting: 'self',
  cooldown: 30,
  strikes: {
    count: 6,
    interval: 0.2,
    searchRadius: 9,
    stunAfter: 2,
    stunSeconds: 1,
  },
  delivery: 'circle',
  effects: [{ type: 'damage', multiplier: 1, radius: 0.5 }],
});
const cut = SkillDefSchema.parse({
  id: 'cut',
  name: 'Cut',
  targeting: 'point',
  range: 8,
  cooldown: 10,
  delivery: 'line',
  effects: [{ type: 'damage', multiplier: 1, radius: 1 }],
});

function setup(mobs = 1) {
  const base = makeContent({
    character: { skills: [leap.id, domain.id, storm.id, cut.id] },
    monster: {
      stats: { hp: 100_000, attack: 0, defense: 0, hpRegen: 0, critChance: 0 },
    },
    map: {
      spawns: [
        {
          id: 'camp',
          monsterId: 'wolf',
          position: { x: 0, z: 20 },
          count: mobs,
          respawnSeconds: 3,
        },
      ],
    },
  });
  const skills = new Map(base.skills);
  for (const s of [leap, domain, storm, cut]) skills.set(s.id, s);
  const world = new World({
    content: { ...base, skills },
    mapId: 'test_map',
    seed: 7,
  });
  const id = world.spawnPlayer('hero');
  const player = world.entities.get(id) as Entity;
  const monsters = [...world.entities.values()].filter((e) => e.kind === 'monster');
  for (const m of monsters) m.ai = null;
  return { world, id, player, monsters };
}

const run = (world: World, ticks: number) => {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step());
  return events;
};

describe('thunder kit mechanics', () => {
  it('stuns every body the landing hits', () => {
    const { world, id, player, monsters } = setup();
    const mob = monsters[0] as Entity;
    mob.pos = { x: 0, z: 4 };
    player.movement.dir = { x: 0, z: 1 };
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: leap.id });
    run(world, 12);
    expect(isStaggered(world, mob)).toBe(true);
  });

  it('toggles an aura that drains MP and hits around the caster until MP runs out', () => {
    const { world, id, player, monsters } = setup();
    const mob = monsters[0] as Entity;
    mob.pos = { x: 0, z: 2 };
    player.stats.mp = 60;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: domain.id });
    const on = run(world, 1);
    expect(on.some((e) => e.type === 'SKILL_IMPACT' && e.sustain === 'on')).toBe(true);
    expect(player.sustain?.skillId).toBe(domain.id);
    expect(player.stats.mp).toBe(50);
    // Two ticks a second apart: 20 MP each.
    const ticks = run(world, 41);
    const hits = ticks.filter((e) => e.type === 'DAMAGE' && e.skillId === domain.id);
    expect(hits).toHaveLength(2);
    // MP regenerates meanwhile; the upkeep still outpaces it.
    expect(player.stats.mp).toBeLessThan(50);
    // Next upkeep cannot be paid: the aura ends by itself.
    const off = run(world, 200);
    expect(off.some((e) => e.type === 'SKILL_IMPACT' && e.sustain === 'off')).toBe(true);
    expect(player.sustain ?? null).toBeNull();
  });

  it('casting the aura again switches it off without cooldown or MP', () => {
    const { world, id, player } = setup();
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: domain.id });
    run(world, 2);
    expect(player.sustain).toBeTruthy();
    player.stats.mp = 0;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: domain.id });
    const events = run(world, 1);
    expect(events.some((e) => e.type === 'SKILL_IMPACT' && e.sustain === 'off')).toBe(true);
    expect(player.sustain ?? null).toBeNull();
  });

  it('sky strikes favour the selected target, stun after two hits and crit stunned bodies', () => {
    const { world, id, player, monsters } = setup(2);
    const [near, far] = monsters as [Entity, Entity];
    near.pos = { x: 0, z: 2 };
    far.pos = { x: 0, z: -7 };
    player.combat.targetId = far.id;
    player.stats.critChance = 0;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: storm.id });
    const events = run(world, 40);
    const strikes = events.filter((e) => e.type === 'SKILL_IMPACT' && e.strike !== undefined);
    expect(strikes).toHaveLength(6);
    const damage = events.filter((e) => e.type === 'DAMAGE' && e.skillId === storm.id);
    // Each struck body: first two hits normal, every later one critical.
    for (const mob of [near, far]) {
      const own = damage.filter((e) => e.type === 'DAMAGE' && e.targetId === mob.id);
      own.forEach((e, i) => {
        if (e.type === 'DAMAGE') expect(e.crit).toBe(i >= 2);
      });
    }
    expect(damage.length).toBe(6);
  });

  it('a far but selected target still draws strikes over a closer one', () => {
    let selected = 0;
    for (let seed = 0; seed < 4; seed++) {
      const { world, id, player, monsters } = setup(2);
      world.rng.setState(seed + 1);
      const [near, far] = monsters as [Entity, Entity];
      near.pos = { x: 0, z: 3 };
      far.pos = { x: 0, z: -3 };
      player.combat.targetId = far.id;
      world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: storm.id });
      const events = run(world, 40);
      selected += events.filter(
        (e) => e.type === 'SKILL_IMPACT' && e.strike !== undefined && e.targetId === far.id,
      ).length;
    }
    // Same distance, 4× the weight: most of the 24 strikes go to the selected one.
    expect(selected).toBeGreaterThan(14);
  });

  it('a long cut hits every body along the line', () => {
    const { world, id, monsters } = setup(3);
    monsters.forEach((m, i) => {
      m.pos = { x: 0.3 * (i - 1), z: 2 + i * 2.5 };
    });
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: cut.id,
      point: { x: 0, z: 8 },
    });
    const events = run(world, 4);
    const hit = new Set(
      events.flatMap((e) => (e.type === 'DAMAGE' && e.skillId === cut.id ? [e.targetId] : [])),
    );
    expect(hit.size).toBe(3);
  });
});
