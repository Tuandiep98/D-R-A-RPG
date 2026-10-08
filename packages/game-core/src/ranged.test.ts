import type { SimEvent } from '@rpg/game-protocol';
import { describe, expect, it } from 'vitest';
import { makeContent } from './test-fixtures';
import { TICK_RATE } from './time';
import { World } from './world';

type Raw = Record<string, unknown>;

const pistol: Raw = {
  id: 'pistol',
  name: 'Pistol',
  fireMode: 'semi',
  fireInterval: 0.3,
  magazine: 3,
  reload: { seconds: 1 },
  projectile: { speed: 40, range: 12 },
  damage: 1,
  moveMultiplier: 0.8,
};
const rifle: Raw = {
  id: 'rifle',
  name: 'Rifle',
  fireMode: 'auto',
  fireInterval: 0.1,
  magazine: 50,
  reload: { seconds: 1 },
  heat: { perShot: 0.25, coolPerSecond: 1, coolDelay: 0.2, overheatSeconds: 1 },
  projectile: { speed: 60, range: 15 },
  damage: 0.5,
  moveMultiplier: 0.5,
};
const smg: Raw = {
  ...rifle,
  id: 'smg',
  name: 'SMG',
  heat: undefined,
  magazine: 100,
};
const shotgun: Raw = {
  id: 'shotgun',
  name: 'Shotgun',
  fireMode: 'semi',
  fireInterval: 0.5,
  magazine: 4,
  reload: { mode: 'round', seconds: 0.5 },
  projectile: { speed: 30, range: 7, pellets: 5, spread: 30 },
  damage: 0.4,
  moveMultiplier: 0.8,
};
const sniper: Raw = {
  id: 'sniper',
  name: 'Sniper',
  fireMode: 'semi',
  fireInterval: 0.2,
  magazine: 1,
  reload: { seconds: 1 },
  projectile: { speed: 0, range: 25, pierce: 1 },
  damage: 2,
  moveMultiplier: 0.3,
};
const carbine: Raw = {
  id: 'carbine',
  name: 'Carbine',
  fireMode: 'burst',
  burst: { count: 3, interval: 0.1 },
  fireInterval: 0.5,
  magazine: 30,
  reload: { seconds: 1 },
  projectile: { speed: 50, range: 14 },
  damage: 0.6,
  moveMultiplier: 0.7,
};

/** A world with the hero holding `gun` (plus a sword), wolves at the given points. */
function setup(gun: string, wolves: { x: number; z: number }[] = [], extra: Raw = {}) {
  const content = makeContent({
    ranged: [pistol, rifle, smg, shotgun, sniper, carbine],
    character: {
      starterItems: [
        { itemId: `gun_${gun}`, equip: true },
        { itemId: 'sword' },
        { itemId: 'gun_pistol' },
      ],
    },
    map: {
      spawns: wolves.map((p, i) => ({
        id: `w${i}`,
        monsterId: 'wolf',
        position: p,
        count: 1,
        respawnSeconds: 30,
      })),
      ...extra,
    },
    monster: { stats: { hp: 10_000, attack: 1, defense: 0, critChance: 0 } },
  });
  const world = new World({ content, mapId: 'test_map' });
  const id = world.spawnPlayer('hero');
  const hero = world.entities.get(id);
  if (!hero) throw new Error('no hero');
  // Let the freshly drawn weapon come up.
  run(world, 8);
  return { world, id, hero };
}

function run(world: World, ticks: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...world.step());
  return out;
}

const of = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

describe('ranged weapons', () => {
  it('manual trigger release stops farm followups while the committed shot finishes once, then accepts a new aim', () => {
    const { world, id, hero } = setup('pistol', [{ x: 0, z: 4 }]);
    const target = [...world.entities.values()].find((e) => e.kind === 'monster');
    if (!hero.player?.ranged || !target) throw new Error('missing fixture');
    target.ai = null;
    target.combat.targetId = null;
    hero.player.ranged.def = { ...hero.player.ranged.def, windup: 0.3 };
    hero.player.trigger.raisedUntil = 0;
    hero.player.farm.enabled = true;
    hero.combat.targetId = target.id;
    expect(of(run(world, 1), 'SHOT')).toHaveLength(0);
    expect(hero.player.trigger.windup).toBeTruthy();
    world.enqueueIntent(id, { type: 'TRIGGER', held: false });
    const committed = of(run(world, 12), 'SHOT');
    expect(hero.player.farm.enabled).toBe(false);
    expect(committed).toHaveLength(1);
    expect(committed[0]?.yaws[0]).toBeCloseTo(0);
    expect(hero.player.trigger.windup).toBeNull();
    world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 10, z: 0 } });
    const manual = of(run(world, 10), 'SHOT');
    expect(manual).toHaveLength(1);
    expect(manual[0]?.yaws[0]).toBeCloseTo(Math.PI / 2);
  });
  it('hits a moving body that crosses a bullet between ticks, exactly once', () => {
    const { world, id, hero } = setup('pistol', [{ x: -1, z: 1.75 }]);
    const mob = [...world.entities.values()].find((e) => e.kind === 'monster');
    if (!mob || !hero.player?.ranged) throw new Error('missing fixture');
    hero.pos = { x: 0, z: 0 };
    hero.player.ranged.def = { ...hero.player.ranged.def, windup: 0 };
    mob.ai = null;
    mob.pos = { x: -1, z: 1.75 };
    mob.monsterSwing = null;
    mob.actionState = null;
    mob.combat.targetId = null;
    mob.movement.dir = { x: 1, z: 0 };
    mob.movement.speed = 40;
    world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 0, z: 10 } });
    const events = world.step();
    expect(mob.pos.x).toBeCloseTo(1);
    expect(of(events, 'DAMAGE').filter((event) => event.targetId === mob.id)).toHaveLength(1);
    expect(of(run(world, 5), 'DAMAGE').filter((event) => event.targetId === mob.id)).toHaveLength(
      0,
    );
  });

  it('tests hitscan against the final position after movement, not its old position', () => {
    const { world, id, hero } = setup('sniper', [{ x: 0, z: 4 }]);
    const mob = [...world.entities.values()].find((e) => e.kind === 'monster');
    if (!mob || !hero.player?.ranged) throw new Error('missing fixture');
    hero.pos = { x: 0, z: 0 };
    hero.player.ranged.def = { ...hero.player.ranged.def, windup: 0 };
    mob.ai = null;
    mob.pos = { x: 0, z: 4 };
    mob.movement.dir = { x: 1, z: 0 };
    mob.movement.speed = 40;
    const hp = mob.stats.hp;
    world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 0, z: 10 } });
    const events = world.step();
    expect(of(events, 'SHOT')).toHaveLength(1);
    expect(of(events, 'SHOT')[0]?.lens[0]).toBeGreaterThan(20);
    expect(mob.stats.hp).toBe(hp);
    expect(world.projectiles).toHaveLength(0);
  });

  it('locks facing and offensive stats through windup, sharing action identity with impact', () => {
    const { world, id, hero } = setup('pistol', [{ x: 0, z: 4 }]);
    if (!hero.player?.ranged) throw new Error('missing equipped weapon');
    hero.player.ranged.def = { ...hero.player.ranged.def, windup: 0.2 };
    world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 0, z: 10 } });
    world.step();
    const commitment = hero.player?.trigger.windup;
    if (!commitment) throw new Error('expected weapon windup');
    const frozenAttack = commitment.source.stats.attack;
    hero.stats.attack = 1000;
    hero.element = 'hoa';
    world.enqueueIntent(id, { type: 'TRIGGER', held: true, aim: { x: 10, z: 0 } });
    const events = run(world, 10);
    const shot = events.find((e) => e.type === 'SHOT');
    const damage = events.find((e) => e.type === 'DAMAGE');
    expect(shot?.type === 'SHOT' ? shot.yaws[0] : undefined).toBeCloseTo(0, 3);
    expect(shot).toMatchObject({
      actionId: commitment.source.actionId,
      element: commitment.source.element,
    });
    expect(damage).toMatchObject({ actionId: commitment.source.actionId });
    expect(damage?.type === 'DAMAGE' ? damage.amount : Infinity).toBeLessThan(frozenAttack * 2);
  });
  it('semi: one shot per press, bullets fly and hit later, magazine counts down', () => {
    const { world, id } = setup('pistol', [{ x: 0, z: 8 }]);
    world.enqueueIntent(id, {
      type: 'TRIGGER',
      held: true,
      aim: { x: 0, z: 8 },
    });
    const first = run(world, 1);
    const shots = of(first, 'SHOT');
    expect(shots).toHaveLength(1);
    expect(shots[0]?.yaws[0]).toBeCloseTo(0, 2);
    // Held: a semi weapon does not fire again by itself.
    world.enqueueIntent(id, {
      type: 'TRIGGER',
      held: true,
      aim: { x: 0, z: 8 },
    });
    const later = run(world, 10);
    expect(of(later, 'SHOT')).toHaveLength(0);
    const damage = of([...first, ...later], 'DAMAGE');
    expect(damage).toHaveLength(1);
    expect(damage[0]?.shot).toEqual({ id: shots[0]?.shotId, pellet: 0 });
    expect(world.playerState(id)?.ranged?.ammo).toBe(2);
  });

  it('auto: fires while held, overheats, locks, then fires again', () => {
    const { world, id } = setup('rifle');
    world.enqueueIntent(id, {
      type: 'TRIGGER',
      held: true,
      aim: { x: 0, z: 10 },
    });
    const events: SimEvent[] = [];
    for (let i = 0; i < 20; i++) {
      // Keepalive like the client (every 10 ticks).
      if (i % 10 === 0)
        world.enqueueIntent(id, {
          type: 'TRIGGER',
          held: true,
          aim: { x: 0, z: 10 },
        });
      events.push(...world.step());
    }
    // 0.25 heat per shot → the 4th shot overheats; nothing fires during the 1 s lock.
    expect(of(events, 'SHOT')).toHaveLength(4);
    const heat = of(events, 'OVERHEAT');
    expect(heat).toHaveLength(1);
    const state = world.playerState(id)?.ranged;
    expect(state?.overheatEndTick).toBe(heat[0]?.endTick);
    expect(state?.heat ?? 0).toBeGreaterThan(0);
    // Lock over: still held → fires again.
    world.enqueueIntent(id, {
      type: 'TRIGGER',
      held: true,
      aim: { x: 0, z: 10 },
    });
    const after = run(world, TICK_RATE);
    expect(of(after, 'SHOT').length).toBeGreaterThan(0);
  });

  it('releases a trigger whose keepalives stopped', () => {
    const { world, id } = setup('rifle', [], {});
    world.enqueueIntent(id, {
      type: 'TRIGGER',
      held: true,
      aim: { x: 0, z: 10 },
    });
    run(world, 40);
    const shotsLate = of(run(world, 20), 'SHOT');
    expect(shotsLate).toHaveLength(0);
  });

  it('runs dry → reloads by itself; a magazine reload blocks shots until done', () => {
    const { world, id } = setup('pistol');
    const shoot = () => {
      world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 5, z: 0 } });
      return run(world, 7);
    };
    const events = [...shoot(), ...shoot(), ...shoot()];
    expect(of(events, 'SHOT')).toHaveLength(3);
    const reload = of(events, 'RELOAD');
    expect(reload).toHaveLength(1);
    expect(world.playerState(id)?.ranged?.ammo).toBe(0);
    // Pressing mid-reload does nothing (and says so).
    const blocked = shoot();
    expect(of(blocked, 'SHOT')).toHaveLength(0);
    expect(of(blocked, 'NOTICE')[0]?.code).toBe('reloading');
    run(world, TICK_RATE);
    expect(world.playerState(id)?.ranged?.ammo).toBe(3);
  });

  it('round reload adds shells one by one and firing interrupts it', () => {
    const { world, id } = setup('shotgun');
    world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 0, z: 5 } });
    const shot = of(run(world, 1), 'SHOT');
    expect(shot[0]?.yaws).toHaveLength(5);
    run(world, 10);
    world.enqueueIntent(id, { type: 'RELOAD' });
    run(world, 1);
    expect(world.playerState(id)?.ranged?.reloadEndTick).toBeGreaterThan(world.tick);
    run(world, 0.5 * TICK_RATE);
    expect(world.playerState(id)?.ranged?.ammo).toBe(4);
    world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 0, z: 5 } });
    run(world, 1);
    world.enqueueIntent(id, { type: 'RELOAD' });
    run(world, 0.5 * TICK_RATE + 1);
    world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 0, z: 5 } });
    const interrupt = run(world, 1);
    const stop = of(interrupt, 'RELOAD');
    expect(stop[0]?.endTick).toBe(stop[0]?.startTick);
    expect(of(interrupt, 'SHOT')).toHaveLength(1);
  });

  it('hitscan pierces one body and walls stop bullets', () => {
    const { world, id } = setup('sniper', [
      { x: 0, z: 6 },
      { x: 0, z: 9 },
      { x: 0, z: 12 },
    ]);
    world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 0, z: 20 } });
    const events = run(world, 1);
    const hits = of(events, 'DAMAGE');
    // pierce 1 → the first two wolves on the line, the third is spared.
    expect(hits).toHaveLength(2);
    const shot = of(events, 'SHOT')[0];
    expect(shot?.lens[0]).toBeLessThan(10);
    // Bolt-action: magazine of one reloads at once.
    expect(of(events, 'RELOAD')).toHaveLength(1);

    const walled = setup('pistol', [], {
      chunks: [
        {
          id: 'chunk_0_0',
          instances: [{ appearanceId: 'look', position: [0, 0, 5], colliderRadius: 1 }],
        },
      ],
    });
    walled.world.enqueueIntent(walled.id, {
      type: 'BASIC_ATTACK',
      aim: { x: 0, z: 10 },
    });
    const wall = of(run(walled.world, 1), 'SHOT')[0];
    expect(wall?.lens[0]).toBeCloseTo(4 - 0.75, 1);
  });

  it('burst: one press fires the whole burst', () => {
    const { world, id } = setup('carbine');
    world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 0, z: 5 } });
    const events = run(world, 10);
    expect(of(events, 'SHOT')).toHaveLength(3);
    expect(world.playerState(id)?.ranged?.ammo).toBe(27);
  });

  it('auto-attack holds position inside gun range and keeps shooting', () => {
    const { world, id, hero } = setup('pistol', [{ x: 0, z: 8 }]);
    const wolf = [...world.entities.values()].find((e) => e.kind === 'monster');
    if (!wolf) throw new Error('no wolf');
    world.enqueueIntent(id, { type: 'ATTACK_TARGET', targetId: wolf.id });
    const events = run(world, 20);
    expect(of(events, 'SHOT').length).toBeGreaterThanOrEqual(2);
    // The wolf charges; the hero never walked toward it to melee range.
    expect(hero.pos.z).toBeLessThan(1);
  });

  it('swapping weapons keeps each magazine and cancels a reload', () => {
    const { world, id } = setup('pistol');
    world.enqueueIntent(id, { type: 'BASIC_ATTACK', aim: { x: 0, z: 5 } });
    run(world, 7);
    world.enqueueIntent(id, { type: 'RELOAD' });
    run(world, 2);
    const hero = world.entities.get(id);
    const sword = hero?.player?.inventory.find((i) => i.itemId === 'sword');
    if (!sword) throw new Error('no sword');
    world.enqueueIntent(id, { type: 'EQUIP', instanceId: sword.instanceId });
    const swap = run(world, 1);
    const stop = of(swap, 'RELOAD');
    expect(stop[0]?.endTick).toBe(stop[0]?.startTick);
    expect(world.playerState(id)?.ranged).toBeNull();
    // Melee again: a trigger press swings.
    world.enqueueIntent(id, { type: 'TRIGGER', held: true });
    expect(of(run(world, 1), 'ATTACK')).toHaveLength(1);
    const gun = hero?.player?.inventory.find((i) => i.itemId === 'gun_pistol');
    if (!gun) throw new Error('no gun');
    world.enqueueIntent(id, { type: 'EQUIP', instanceId: gun.instanceId });
    run(world, 1);
    expect(world.playerState(id)?.ranged?.ammo).toBe(2);
  });

  it('slows the walk while firing and keeps facing the aim', () => {
    const { world, id, hero } = setup('smg');
    world.enqueueIntent(id, { type: 'MOVE_DIR', dir: { x: 0, z: 1 } });
    run(world, 2);
    const z0 = hero.pos.z;
    run(world, 10);
    const free = hero.pos.z - z0;
    const aim = { x: 30, z: hero.pos.z };
    world.enqueueIntent(id, { type: 'TRIGGER', held: true, aim });
    run(world, 2);
    const z1 = hero.pos.z;
    run(world, 10);
    expect(hero.pos.z - z1).toBeCloseTo(free * 0.5, 1);
    const previous = hero.previousPos ?? hero.pos;
    expect(hero.yaw).toBeCloseTo(Math.atan2(aim.x - previous.x, aim.z - previous.z), 4);
  });
});
