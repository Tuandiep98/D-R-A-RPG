import { resolve } from 'node:path';
import { World } from '@rpg/game-core';
import { loadContentFromDir } from '@rpg/game-data/node';
import type { SimEvent } from '@rpg/game-protocol';
import { expect, it } from 'vitest';
import { makeContent } from '../../../packages/game-core/src/test-fixtures';

const content = loadContentFromDir(resolve(import.meta.dirname, '../../../game-data'));
const run = (world: World, ticks: number) =>
  Array.from({ length: ticks }, () => world.step()).flat();

function arena(monsterId: string, playerDistance: number) {
  const fixture = makeContent({
    map: {
      spawns: [
        { id: 'authored_mob', monsterId, position: { x: 0, z: 0 }, count: 1, respawnSeconds: 30 },
      ],
    },
  });
  const world = new World({
    content: { ...content, maps: fixture.maps },
    mapId: 'test_map',
    combatContent: 'starter',
  });
  const id = world.spawnPlayer('player_phap');
  const player = world.entities.get(id);
  const mob = [...world.entities.values()].find((e) => e.kind === 'monster');
  if (!player || !mob) throw new Error('missing authored combat fixture');
  player.pos = { x: 0, z: playerDistance };
  return { world, id, player, mob };
}

it.each(['hit', 'move', 'wall'] as const)(
  'authored wolf windup locks its cone and permits counterplay: %s',
  (mode) => {
    const { world, id, player, mob } = arena('wolf_001', 1);
    let warning: Extract<SimEvent, { type: 'ATTACK' }> | undefined;
    for (let i = 0; i < 10 && !warning; i++)
      warning = world
        .step()
        .find(
          (event): event is Extract<SimEvent, { type: 'ATTACK' }> =>
            event.type === 'ATTACK' && event.sourceId === mob.id,
        );
    expect(warning?.windup).toMatchObject({ arc: 100, endTick: world.tick + 11 });
    const hp = player.stats.hp;
    expect(warning?.windup?.yaw).toBe(0);
    if (mode === 'move') world.enqueueIntent(id, { type: 'MOVE_DIR', dir: { x: 1, z: 0 } });
    if (mode === 'wall') world.obstacles.push({ pos: { x: 0, z: 0.5 }, radius: 0.2 });
    run(world, 11);
    expect(player.stats.hp < hp).toBe(mode === 'hit');
  },
);

it.each(['hit', 'move', 'wall'] as const)(
  'authored robot laser leaves its aim point and uses a finite projectile: %s',
  (mode) => {
    const { world, id, player, mob } = arena('robot_scout_001', 5);
    let warning: Extract<SimEvent, { type: 'CAST_START' }> | undefined;
    // Authored monster skills begin with the normal 40-tick spawn warmup.
    for (let i = 0; i < 100 && !warning; i++)
      warning = world
        .step()
        .find(
          (event): event is Extract<SimEvent, { type: 'CAST_START' }> =>
            event.type === 'CAST_START' &&
            event.sourceId === mob.id &&
            event.skillId === 'skill_robot_laser',
        );
    if (!warning) throw new Error('robot did not use its authored laser');
    expect(warning.endTick - world.tick).toBe(16);
    expect(warning.point).toEqual({ x: 0, z: 5 });
    const hp = player.stats.hp;
    if (mode === 'move') world.enqueueIntent(id, { type: 'MOVE_DIR', dir: { x: 1, z: 0 } });
    if (mode === 'wall')
      world.obstacles.push({
        pos: { x: (mob.pos.x + player.pos.x) / 2, z: (mob.pos.z + player.pos.z) / 2 },
        radius: 0.2,
      });
    const events = run(world, 27);
    const projectile = events.find(
      (event): event is Extract<SimEvent, { type: 'SKILL_PROJECTILE' }> =>
        event.type === 'SKILL_PROJECTILE' && event.sourceId === mob.id,
    );
    if (!projectile) throw new Error('robot did not launch its projectile');
    expect(projectile.speed).toBe(16);
    expect(projectile.destination.x).toBeCloseTo(0);
    expect(projectile.destination.z - projectile.origin.z).toBeCloseTo(7);
    const laserHits = events.filter(
      (event) =>
        event.type === 'DAMAGE' &&
        event.sourceId === mob.id &&
        event.targetId === id &&
        event.skillId === 'skill_robot_laser',
    );
    expect(laserHits).toHaveLength(mode === 'hit' ? 1 : 0);
    expect(player.stats.hp < hp).toBe(mode === 'hit');
  },
);
