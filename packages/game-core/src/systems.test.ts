import type { SimEvent } from '@rpg/game-protocol';
import { describe, expect, it } from 'vitest';
import type { Entity } from './entity';
import { makeContent } from './test-fixtures';
import { secondsToTicks, TICK_RATE } from './time';
import { World } from './world';

const run = (world: World, ticks: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step());
  return events;
};
const get = (world: World, id: number): Entity => {
  const e = world.entities.get(id);
  if (!e) throw new Error(`no entity ${id}`);
  return e;
};
const firstOf = (world: World, kind: Entity['kind']): Entity => {
  for (const e of world.entities.values()) if (e.kind === kind) return e;
  throw new Error(`no ${kind}`);
};
/** Places the monster right next to the player so tests skip the approach. */
const adjacentMonster = (world: World, playerId: number): Entity => {
  const mob = firstOf(world, 'monster');
  const p = get(world, playerId);
  mob.pos = { x: p.pos.x, z: p.pos.z + 1.2 };
  if (mob.ai) mob.ai.home = { ...mob.pos };
  return mob;
};

describe('starter kit and stats', () => {
  it('grants starter items and applies equipped bonuses', () => {
    const world = new World({ content: makeContent(), mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    const state = world.playerState(id);
    expect(state?.inventory.map((i) => i.itemId).sort()).toEqual(['potion', 'sword']);
    expect(state?.equipment.main_hand).toBeDefined();
    expect(state?.stats.attack).toBe(50); // 30 base + 20 sword
    expect(state?.hp).toBe(500);
  });

  it('unequip removes the bonus and realm-gated items are refused', () => {
    const world = new World({ content: makeContent(), mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    world.enqueueIntent(id, { type: 'UNEQUIP', slot: 'main_hand' });
    world.step();
    expect(world.playerState(id)?.stats.attack).toBe(30);

    const player = get(world, id);
    player.player?.inventory.push({
      instanceId: 'helm-1',
      itemId: 'helm',
      count: 1,
    });
    world.enqueueIntent(id, { type: 'EQUIP', instanceId: 'helm-1' });
    const events = world.step();
    expect(events.some((e) => e.type === 'NOTICE' && e.code === 'realm_too_low')).toBe(true);
    expect(world.playerState(id)?.equipment.head).toBeUndefined();
  });

  it('cannot equip an item it does not own', () => {
    const world = new World({ content: makeContent(), mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    world.enqueueIntent(id, {
      type: 'EQUIP',
      instanceId: 'someone-elses-sword',
    });
    world.step();
    expect(world.stats.rejectedIntents).toBe(1);
  });
});

describe('skills', () => {
  it('spends MP, starts cooldown and hits harder than an auto-attack', () => {
    const world = new World({ content: makeContent(), mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    const mob = adjacentMonster(world, id);
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'slash',
      targetId: mob.id,
    });
    const events = world.step();
    const hit = events.find((e) => e.type === 'DAMAGE' && e.skillId === 'slash');
    expect(hit).toBeDefined();
    expect(get(world, id).stats.mp).toBe(90);

    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'slash',
      targetId: mob.id,
    });
    const again = world.step();
    expect(again.some((e) => e.type === 'NOTICE' && e.code === 'cooldown')).toBe(true);
  });

  it('refuses a skill without enough MP or not on the skill bar', () => {
    const world = new World({ content: makeContent(), mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    const mob = adjacentMonster(world, id);
    get(world, id).stats.mp = 5;
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'slash',
      targetId: mob.id,
    });
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'slam' });
    const events = world.step();
    expect(
      events.filter((e) => e.type === 'NOTICE').map((e) => (e as { code: string }).code),
    ).toEqual(['no_mp', 'invalid']);
  });

  it('walks into range before casting a targeted skill', () => {
    const world = new World({ content: makeContent(), mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    const mob = firstOf(world, 'monster'); // 20 m away
    world.enqueueIntent(id, {
      type: 'CAST_SKILL',
      skillId: 'slash',
      targetId: mob.id,
    });
    const events = run(world, TICK_RATE * 5);
    expect(events.some((e) => e.type === 'DAMAGE' && e.skillId === 'slash')).toBe(true);
  });

  it('self AoE hits every hostile in radius and heals restore HP', () => {
    const content = makeContent({
      map: {
        spawns: [
          {
            id: 'pack',
            monsterId: 'wolf',
            position: { x: 0, z: 1.5 },
            count: 3,
            radius: 1,
            respawnSeconds: 3,
          },
        ],
      },
    });
    const world = new World({ content, mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'whirl' });
    const events = world.step();
    const victims = new Set(
      events
        .filter((e) => e.type === 'DAMAGE' && e.skillId === 'whirl')
        .map((e) => (e as { targetId: number }).targetId),
    );
    expect(victims.size).toBe(3);

    get(world, id).stats.hp = 100;
    world.enqueueIntent(id, { type: 'CAST_SKILL', skillId: 'mend' });
    const heal = world.step().find((e) => e.type === 'HEAL');
    expect(heal && 'amount' in heal ? heal.amount : 0).toBe(250);
  });
});

describe('boss telegraph and phases', () => {
  const bossContent = () =>
    makeContent({
      monster: {
        id: 'golem',
        tier: 'boss',
        stats: { hp: 1000, attack: 20, defense: 0, critChance: 0 },
        movement: { speed: 0.01, radius: 1 },
        combat: { range: 1, attackInterval: 50 },
        ai: { type: 'melee', aggroRadius: 15, leashRadius: 40 },
        skills: ['slam'],
        phases: [{ hpBelow: 0.5, name: 'Cuồng nộ', attackMultiplier: 2 }],
        lootTable: [],
      },
      map: {
        spawns: [
          {
            id: 'boss',
            monsterId: 'golem',
            position: { x: 0, z: 6 },
            count: 1,
            respawnSeconds: 30,
          },
        ],
      },
    });

  it('telegraphs a ground slam that a moving player can dodge', () => {
    const world = new World({ content: bossContent(), mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    const events: SimEvent[] = [];
    let cast: SimEvent | undefined;
    for (let i = 0; i < TICK_RATE * 5 && !cast; i++) {
      const ev = world.step();
      events.push(...ev);
      cast = ev.find((e) => e.type === 'CAST_START' && e.telegraph);
    }
    expect(cast).toBeDefined();
    // Dodge: run away from the locked impact point before the cast ends.
    world.enqueueIntent(id, { type: 'MOVE_TO', target: { x: 0, z: -10 } });
    const after = run(world, secondsToTicks(1.6));
    expect(after.some((e) => e.type === 'SKILL_IMPACT')).toBe(true);
    expect(
      after.some((e) => e.type === 'DAMAGE' && e.skillId === 'slam' && e.targetId === id),
    ).toBe(false);
  });

  it('enters the next phase below the HP threshold', () => {
    const world = new World({ content: bossContent(), mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    const boss = firstOf(world, 'monster');
    boss.stats.hp = 520;
    boss.pos = { x: 0, z: 1.5 };
    world.enqueueIntent(id, { type: 'ATTACK_TARGET', targetId: boss.id });
    const events = run(world, TICK_RATE * 3);
    expect(events.some((e) => e.type === 'PHASE' && e.id === boss.id && e.phase === 1)).toBe(true);
    expect(boss.stats.attack).toBe(40);
  });
});

describe('rewards', () => {
  const quickKill = () => {
    const world = new World({
      content: makeContent({
        monster: { stats: { hp: 1, attack: 0, defense: 0, critChance: 0 } },
      }),
      mapId: 'test_map',
    });
    const id = world.spawnPlayer('hero');
    const mob = adjacentMonster(world, id);
    world.enqueueIntent(id, { type: 'ATTACK_TARGET', targetId: mob.id });
    const events = run(world, 3);
    return { world, id, mob, events };
  };

  it('grants gold through the ledger and drops owned loot (no XP)', () => {
    const { world, id } = quickKill();
    expect(world.playerState(id)?.gold).toBe(5);
    const ledger = world.drainLedger();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      amount: 5,
      balanceAfter: 5,
      reason: 'monster_drop',
    });
    const loot = firstOf(world, 'loot');
    expect(loot.loot).toMatchObject({ itemId: 'fang', count: 2, ownerId: id });
  });

  it('picks up loot (walking to it first) into a stack', () => {
    const { world, id } = quickKill();
    const loot = firstOf(world, 'loot');
    loot.pos = { x: 6, z: 0 };
    world.enqueueIntent(id, { type: 'PICKUP', lootId: loot.id });
    run(world, TICK_RATE * 3);
    expect(world.entities.has(loot.id)).toBe(false);
    expect(world.playerState(id)?.inventory.find((i) => i.itemId === 'fang')?.count).toBe(2);
  });

  it('ledger keys are idempotent', () => {
    const world = new World({ content: makeContent(), mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    const entry = {
      entityId: id,
      characterId: 'hero',
      amount: 10,
      balanceAfter: 10,
      reason: 'admin' as const,
      key: 'k1',
    };
    expect(world.recordLedger(entry)).toBe(true);
    expect(world.recordLedger(entry)).toBe(false);
  });
});

describe('items', () => {
  it('potion heals, has a cooldown and is consumed', () => {
    const world = new World({ content: makeContent(), mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    const potion = world.playerState(id)?.inventory.find((i) => i.itemId === 'potion');
    if (!potion) throw new Error('no potion');
    get(world, id).stats.hp = 100;
    world.enqueueIntent(id, {
      type: 'USE_ITEM',
      instanceId: potion.instanceId,
    });
    world.step();
    expect(get(world, id).stats.hp).toBe(350);
    world.enqueueIntent(id, {
      type: 'USE_ITEM',
      instanceId: potion.instanceId,
    });
    const ev = world.step();
    expect(ev.some((e) => e.type === 'NOTICE' && e.code === 'cooldown')).toBe(true);
    expect(world.playerState(id)?.inventory.find((i) => i.itemId === 'potion')?.count).toBe(2);
  });
});

describe('world structure', () => {
  const portalContent = () =>
    makeContent({
      map: {
        portals: [
          {
            id: 'to_b',
            name: 'Gate',
            position: { x: 4, z: 0 },
            targetMapId: 'map_b',
            targetArrival: 'gate',
          },
        ],
        zones: [
          {
            id: 'town',
            name: 'Town',
            kind: 'safe',
            center: { x: 0, z: -20 },
            radius: 6,
          },
        ],
      },
      extraMaps: [
        {
          id: 'map_b',
          name: 'B',
          schemaVersion: 1,
          seed: 1,
          bounds: { min: { x: -10, z: -10 }, max: { x: 10, z: 10 } },
          ground: {},
          playerSpawn: { x: 0, z: 0 },
          arrivals: [{ id: 'gate', position: { x: 5, z: 5 } }],
          chunks: [{ id: 'chunk_0_0' }],
        },
      ],
    });

  it('portal interaction emits a transfer and the save round-trips', () => {
    const content = portalContent();
    const world = new World({ content, mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    const portal = firstOf(world, 'portal');
    world.enqueueIntent(id, { type: 'INTERACT', entityId: portal.id });
    const events = run(world, TICK_RATE * 2);
    expect(events.find((e) => e.type === 'TRANSFER')).toMatchObject({
      id,
      mapId: 'map_b',
      arrival: 'gate',
    });

    const save = world.exportPlayer(id);
    if (!save) throw new Error('no save');
    const other = new World({ content, mapId: 'map_b' });
    const newId = other.spawnPlayer('hero', { save, arrival: 'gate' });
    expect(get(other, newId).pos).toEqual({ x: 5, z: 5 });
    expect(other.playerState(newId)?.inventory).toEqual(world.playerState(id)?.inventory);
    expect(other.playerState(newId)?.stats.attack).toBe(50);
  });

  it('monsters ignore players standing in a safe zone', () => {
    const content = portalContent();
    const world = new World({ content, mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    const mob = firstOf(world, 'monster');
    if (mob.ai) mob.ai.home = { x: 0, z: -14 };
    mob.pos = { x: 0, z: -15 };
    world.enqueueIntent(id, { type: 'MOVE_TO', target: { x: 0, z: -20 } });
    run(world, TICK_RATE * 5);
    expect(world.playerState(id)?.inSafeZone).toBe(true);
    expect(mob.combat.targetId).toBeNull();
  });

  it('follows NavQuery waypoints when provided', () => {
    const calls: number[] = [];
    const nav = {
      findPath: (_from: { x: number; z: number }, to: { x: number; z: number }) => {
        calls.push(1);
        return [
          { x: 0, z: 5 },
          { x: to.x, z: to.z },
        ];
      },
      closest: (p: { x: number; z: number }) => p,
    };
    const world = new World({
      content: makeContent({ map: { spawns: [] } }),
      mapId: 'test_map',
      nav,
    });
    const id = world.spawnPlayer('hero');
    world.enqueueIntent(id, { type: 'MOVE_TO', target: { x: 5, z: 5 } });
    run(world, TICK_RATE * 0.8);
    const p = get(world, id).pos;
    expect(p.x).toBeCloseTo(0, 1); // still on the first leg (straight up +Z)
    run(world, TICK_RATE * 3);
    expect(get(world, id).pos.x).toBeCloseTo(5, 1);
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('npcs: quests, shop, crafting, upgrades', () => {
  const setup = () => {
    const content = makeContent({
      map: { npcs: [{ npcId: 'elder', position: { x: 2, z: 0 } }] },
      monster: { stats: { hp: 1, attack: 0, defense: 0, critChance: 0 } },
    });
    const world = new World({ content, mapId: 'test_map' });
    const id = world.spawnPlayer('hero');
    const npc = firstOf(world, 'npc');
    return { world, id, npc };
  };

  it('opens the NPC, accepts a kill quest, completes it and pays out through the ledger', () => {
    const { world, id, npc } = setup();
    world.enqueueIntent(id, { type: 'INTERACT', entityId: npc.id });
    expect(world.step().some((e) => e.type === 'NPC_OPEN' && e.npcId === 'elder')).toBe(true);
    world.enqueueIntent(id, {
      type: 'QUEST_ACCEPT',
      npcId: npc.id,
      questId: 'q_fangs',
    });
    expect(world.step().some((e) => e.type === 'NOTICE' && e.code === 'quest_unavailable')).toBe(
      true,
    );

    world.enqueueIntent(id, {
      type: 'QUEST_ACCEPT',
      npcId: npc.id,
      questId: 'q_wolves',
    });
    world.step();
    const mob = adjacentMonster(world, id);
    world.enqueueIntent(id, { type: 'ATTACK_TARGET', targetId: mob.id });
    run(world, 3);
    expect(world.playerState(id)?.quests[0]).toMatchObject({
      questId: 'q_wolves',
      status: 'ready',
      progress: [1],
    });
    get(world, id).pos = { x: 1, z: 0 };
    world.drainLedger();
    world.enqueueIntent(id, {
      type: 'QUEST_TURN_IN',
      npcId: npc.id,
      questId: 'q_wolves',
    });
    world.step();
    expect(world.playerState(id)?.quests[0]?.status).toBe('done');
    expect(world.drainLedger().map((l) => l.reason)).toEqual(['quest']);
  });

  it('collect quests read the inventory and consume items on turn-in', () => {
    const { world, id, npc } = setup();
    const p = get(world, id).player;
    if (!p) throw new Error('no player');
    p.quests.push({ questId: 'q_wolves', status: 'done', progress: [1] });
    world.enqueueIntent(id, {
      type: 'QUEST_ACCEPT',
      npcId: npc.id,
      questId: 'q_fangs',
    });
    world.step();
    p.inventory.push({ instanceId: 'f1', itemId: 'fang', count: 3 });
    expect(world.playerState(id)?.quests.find((q) => q.questId === 'q_fangs')?.progress).toEqual([
      2,
    ]);
    world.enqueueIntent(id, {
      type: 'QUEST_TURN_IN',
      npcId: npc.id,
      questId: 'q_fangs',
    });
    world.step();
    expect(world.playerState(id)?.inventory.find((i) => i.itemId === 'fang')?.count).toBe(1);
  });

  it('buys and sells with gold checks and refuses when out of range', () => {
    const { world, id, npc } = setup();
    const p = get(world, id).player;
    if (!p) throw new Error('no player');
    world.enqueueIntent(id, {
      type: 'SHOP_BUY',
      npcId: npc.id,
      itemId: 'potion',
      count: 1,
    });
    expect(world.step().some((e) => e.type === 'NOTICE' && e.code === 'not_enough_gold')).toBe(
      true,
    );
    p.gold = 10;
    world.enqueueIntent(id, {
      type: 'SHOP_BUY',
      npcId: npc.id,
      itemId: 'potion',
      count: 2,
    });
    world.step();
    expect(p.gold).toBe(2);
    p.inventory.push({ instanceId: 'f9', itemId: 'fang', count: 4 });
    world.enqueueIntent(id, {
      type: 'SHOP_SELL',
      npcId: npc.id,
      instanceId: 'f9',
      count: 4,
    });
    world.step();
    expect(p.gold).toBe(6); // 2 + floor(2 x 0.5) x 4
    const sword = p.inventory.find((i) => i.itemId === 'sword');
    world.enqueueIntent(id, {
      type: 'SHOP_SELL',
      npcId: npc.id,
      instanceId: sword?.instanceId ?? 'x',
      count: 1,
    });
    expect(world.step().some((e) => e.type === 'NOTICE' && e.code === 'not_sellable')).toBe(true);
    get(world, id).pos = { x: 30, z: 0 };
    world.enqueueIntent(id, {
      type: 'SHOP_BUY',
      npcId: npc.id,
      itemId: 'potion',
      count: 1,
    });
    expect(world.step().some((e) => e.type === 'NOTICE' && e.code === 'too_far')).toBe(true);
  });

  it('crafts from materials and upgrades equipment with a success roll', () => {
    const { world, id, npc } = setup();
    const p = get(world, id).player;
    if (!p) throw new Error('no player');
    p.gold = 5;
    p.inventory.push({ instanceId: 'f1', itemId: 'fang', count: 2 });
    world.enqueueIntent(id, {
      type: 'CRAFT',
      npcId: npc.id,
      recipeId: 'r_charm',
    });
    world.step();
    const charm = p.inventory.find((i) => i.itemId === 'charm');
    expect(charm).toBeDefined();
    expect(p.inventory.filter((i) => i.itemId === 'fang')).toHaveLength(0);

    world.enqueueIntent(id, {
      type: 'EQUIP',
      instanceId: charm?.instanceId ?? 'x',
    });
    world.step();
    expect(world.playerState(id)?.stats.attack).toBe(60); // 30 + sword 20 + charm 10
    world.enqueueIntent(id, {
      type: 'UPGRADE',
      npcId: npc.id,
      instanceId: charm?.instanceId ?? 'x',
    });
    expect(world.step().find((e) => e.type === 'UPGRADE_RESULT')).toMatchObject({
      success: true,
      level: 1,
    });
    expect(world.playerState(id)?.stats.attack).toBe(65); // charm x1.5
    world.enqueueIntent(id, {
      type: 'UPGRADE',
      npcId: npc.id,
      instanceId: charm?.instanceId ?? 'x',
    });
    expect(world.step().find((e) => e.type === 'UPGRADE_RESULT')).toMatchObject({
      success: false,
      level: 1,
    });
  });

  it('quest state survives save/load', () => {
    const { world, id, npc } = setup();
    world.enqueueIntent(id, {
      type: 'QUEST_ACCEPT',
      npcId: npc.id,
      questId: 'q_wolves',
    });
    world.step();
    const save = world.exportPlayer(id);
    const other = new World({ content: world.content, mapId: 'test_map' });
    const id2 = other.spawnPlayer('hero', { save: save ?? undefined });
    expect(other.playerState(id2)?.quests.map((q) => q.questId)).toEqual(['q_wolves']);
  });
});
