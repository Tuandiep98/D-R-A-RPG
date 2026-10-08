import {
  type ComboDef,
  ComboDefSchema,
  hiddenStats,
  type ItemDef,
  ItemDefSchema,
  socketsOf,
} from '@rpg/game-data';
import type { Intent, SimEvent } from '@rpg/game-protocol';
import { describe, expect, it } from 'vitest';
import type { Entity } from './entity';
import { applyDamage } from './systems/combat';
import { makeContent } from './test-fixtures';
import { World } from './world';

const SOCKETS: Record<string, unknown>[] = [
  {
    id: 'chip_wind',
    name: 'Wind chip',
    kind: 'socket',
    maxStack: 20,
    socket: {
      type: 'combat',
      line: 'co',
      element: 'moc',
      expression: 'thunder',
      finisher: { skillId: 'slash', multiplier: 1, radius: 2 },
    },
  },
  {
    id: 'mod_shield',
    name: 'Shield module',
    kind: 'socket',
    maxStack: 20,
    socket: {
      type: 'defense',
      line: 'co',
      defense: { shieldOnHit: 0.5, shieldCap: 0.5 },
    },
  },
  {
    id: 'pearl_moc',
    name: 'Moc pearl',
    kind: 'socket',
    maxStack: 20,
    socket: {
      type: 'spirit',
      line: 'tien',
      element: 'moc',
      natalBonus: 1.5,
      bonus: { hp: 100 },
    },
  },
  {
    id: 'ammo_fast',
    name: 'Fast reload',
    kind: 'socket',
    maxStack: 20,
    socket: {
      type: 'ammo',
      line: 'co',
      ammo: { magazineBonus: 4, reloadMultiplier: 0.5 },
    },
  },
];

function setup() {
  const content = makeContent({
    map: { npcs: [{ npcId: 'elder', position: { x: 2, z: 0 } }] },
    monster: { stats: { hp: 5000, attack: 0, defense: 0, critChance: 0 } },
    character: { element: 'moc', expression: 'thunder' },
    ranged: [
      {
        id: 'pistol',
        name: 'Pistol',
        fireMode: 'semi',
        fireInterval: 0.3,
        magazine: 10,
        reload: { seconds: 2 },
        projectile: { speed: 0, range: 10 },
        damage: 1,
        moveMultiplier: 0.8,
      },
    ],
  });
  const items = content.items as Map<string, ItemDef>;
  for (const raw of SOCKETS) {
    const def = ItemDefSchema.parse(raw);
    items.set(def.id, def);
  }
  // Three identical strikes so the third one triggers the combat module.
  const combo = content.combos.get('test_combo') as ComboDef;
  (content.combos as Map<string, ComboDef>).set(
    combo.id,
    ComboDefSchema.parse({
      ...combo,
      steps: [combo.steps[0], combo.steps[0], combo.steps[0]],
    }),
  );
  const world = new World({ content, mapId: 'test_map' });
  const id = world.spawnPlayer('hero');
  const player = world.entities.get(id) as Entity;
  const npc = [...world.entities.values()].find((e) => e.kind === 'npc') as Entity;
  const p = player.player;
  if (!p) throw new Error('no player');
  p.gold = 10_000;
  const sword = p.inventory.find((i) => i.itemId === 'sword');
  if (!sword) throw new Error('no sword');
  const forge = (
    op: Intent & { type: 'FORGE' } extends infer T ? Omit<T, 'type' | 'npcId'> : never,
  ) => {
    world.enqueueIntent(id, { type: 'FORGE', npcId: npc.id, ...op } as Intent);
    return world.step();
  };
  const give = (itemId: string, instanceId = `${itemId}-${p.inventory.length}`) => {
    p.inventory.push({ instanceId, itemId, count: 1 });
    return instanceId;
  };
  return { world, id, player, p, sword, forge, give, content };
}

const result = (events: SimEvent[]) => events.find((e) => e.type === 'FORGE_RESULT');
const notice = (events: SimEvent[]) =>
  events.find((e): e is Extract<SimEvent, { type: 'NOTICE' }> => e.type === 'NOTICE')?.code;

describe('forge (Tiệm Rèn)', () => {
  it('synthesis raises quality, adds a socket and a hidden stat that wakes with enhancement', () => {
    const { world, id, sword, forge, give, content, p } = setup();
    expect(world.playerState(id)?.stats.attack).toBe(50);
    const a = give('sword');
    const b = give('sword');
    expect(
      result(
        forge({
          op: 'synthesize',
          instanceId: sword.instanceId,
          fodder: [a, b],
        }),
      ),
    ).toMatchObject({ success: true, detail: 'quality:rare' });
    expect(p.inventory.filter((i) => i.itemId === 'sword')).toHaveLength(1);
    expect(sword.forge?.quality).toBe('rare');
    expect(socketsOf(content, content.items.get('sword') as ItemDef, sword)).toHaveLength(2);
    // Rare: base 20 × 1.2; the hidden stat sleeps until +1.
    expect(world.playerState(id)?.stats.attack).toBe(54);
    const [hidden] = hiddenStats(content, content.items.get('sword') as ItemDef, sword);
    expect(hidden).toMatchObject({ stat: 'attack', value: 5, active: false });
    forge({ op: 'enhance', instanceId: sword.instanceId });
    // 20 × 1.2 × 1.5 = 36, + hidden 4 × 1.2 → 5.
    expect(world.playerState(id)?.stats.attack).toBe(30 + 36 + 5);
  });

  it('refuses fodder of another quality or slot and keeps everything', () => {
    const { sword, forge, give, p } = setup();
    const helm = give('helm');
    const a = give('sword');
    const events = forge({
      op: 'synthesize',
      instanceId: sword.instanceId,
      fodder: [a, helm],
    });
    expect(notice(events)).toBe('requirements_unmet');
    expect(p.inventory).toHaveLength(4);
    expect(p.gold).toBe(10_000);
  });

  it('combat module bursts on the third strike in its element, wider on a natal match', () => {
    const { world, id, sword, forge, give, player } = setup();
    // Rare sword (2 sockets) so the module fits next to nothing else.
    const chip = give('chip_wind');
    expect(
      result(
        forge({
          op: 'socket',
          instanceId: sword.instanceId,
          socketInstanceId: chip,
        }),
      ),
    ).toMatchObject({ success: true });
    const mob = [...world.entities.values()].find((e) => e.kind === 'monster') as Entity;
    mob.pos = { x: player.pos.x, z: player.pos.z + 1.2 };
    if (mob.ai) mob.ai.home = { ...mob.pos };
    const events: SimEvent[] = [];
    for (let swing = 0; swing < 3; swing++) {
      world.enqueueIntent(id, {
        type: 'BASIC_ATTACK',
        aim: { x: mob.pos.x, z: mob.pos.z },
      });
      for (let t = 0; t < 20; t++) events.push(...world.step());
    }
    const burst = events.find((e) => e.type === 'SKILL_IMPACT');
    expect(burst).toMatchObject({
      skillId: 'slash',
      element: 'moc',
      expression: 'thunder',
    });
    // Natal (moc hero, moc chip): radius 2 × 1.3.
    expect(burst && 'radius' in burst ? burst.radius : 0).toBeCloseTo(2.6);
    expect(events.some((e) => e.type === 'DAMAGE' && e.skillId === 'slash')).toBe(true);
  });

  it('defense module turns damage dealt into a capped shield', () => {
    const { world, id, forge, give, player } = setup();
    const helm = give('helm');
    player.realm = 1;
    world.enqueueIntent(id, { type: 'EQUIP', instanceId: helm });
    world.step();
    const mod = give('mod_shield');
    forge({ op: 'socket', instanceId: helm, socketInstanceId: mod });
    const mob = [...world.entities.values()].find((e) => e.kind === 'monster') as Entity;
    mob.pos = { x: player.pos.x, z: player.pos.z + 1.2 };
    world.enqueueIntent(id, {
      type: 'BASIC_ATTACK',
      aim: { x: mob.pos.x, z: mob.pos.z },
    });
    const events: SimEvent[] = [];
    for (let t = 0; t < 10; t++) events.push(...world.step());
    expect(events.some((e) => e.type === 'SHIELD' && e.targetId === id && e.phase === 'gain')).toBe(
      true,
    );
    expect(player.shield?.amount ?? 0).toBeGreaterThan(0);
    expect(player.shield?.amount ?? 0).toBeLessThanOrEqual(Math.round(player.stats.maxHp * 0.5));
  });

  it('spirit pearls grow with the natal element; unsocket returns the pearl for gold', () => {
    const { world, id, sword, forge, give, p } = setup();
    const pearl = give('pearl_moc');
    forge({
      op: 'socket',
      instanceId: sword.instanceId,
      socketInstanceId: pearl,
    });
    expect(world.playerState(id)?.maxHp).toBe(650); // 500 + 100 × 1.5 natal
    expect(p.inventory.some((i) => i.itemId === 'pearl_moc')).toBe(false);
    expect(
      result(forge({ op: 'unsocket', instanceId: sword.instanceId, socketIndex: 0 })),
    ).toMatchObject({ success: true });
    expect(p.inventory.some((i) => i.itemId === 'pearl_moc')).toBe(true);
    expect(world.playerState(id)?.maxHp).toBe(500);
  });

  it('ammo chips only fit guns and extend the magazine / shorten the reload', () => {
    const { world, id, forge, give, p } = setup();
    const chip = give('ammo_fast');
    const sword = p.inventory.find((i) => i.itemId === 'sword');
    expect(
      notice(
        forge({
          op: 'socket',
          instanceId: sword?.instanceId ?? '',
          socketInstanceId: chip,
        }),
      ),
    ).toBe('invalid');
    const gun = give('gun_pistol');
    world.enqueueIntent(id, { type: 'EQUIP', instanceId: gun });
    world.step();
    forge({ op: 'socket', instanceId: gun, socketInstanceId: chip });
    expect(p.ranged?.def.magazine).toBe(14);
    expect(p.ranged?.def.reload?.seconds).toBe(1);
  });

  it('rites gate on quality, bind the item (no selling) and take the blood offering', () => {
    const { world, id, sword, forge, give, player } = setup();
    expect(
      notice(
        forge({
          op: 'rite',
          instanceId: sword.instanceId,
          riteId: 'rite_bind',
        }),
      ),
    ).toBe('quality_too_low');
    forge({
      op: 'synthesize',
      instanceId: sword.instanceId,
      fodder: [give('sword'), give('sword')],
    });
    const hp = player.stats.hp;
    expect(
      result(
        forge({
          op: 'rite',
          instanceId: sword.instanceId,
          riteId: 'rite_bind',
        }),
      ),
    ).toMatchObject({ success: true });
    expect(player.stats.hp).toBe(hp - Math.floor(hp * 0.3));
    // Rare 24 × 1.5 rite.
    expect(world.playerState(id)?.stats.attack).toBe(30 + 36);
    world.enqueueIntent(id, { type: 'UNEQUIP', slot: 'main_hand' });
    world.step();
    world.enqueueIntent(id, {
      type: 'SHOP_SELL',
      npcId: [...world.entities.values()].find((e) => e.kind === 'npc')?.id ?? 0,
      instanceId: sword.instanceId,
      count: 1,
    });
    expect(notice(world.step())).toBe('item_bound');
    // Same group cannot take the rite twice.
    expect(
      notice(
        forge({
          op: 'rite',
          instanceId: sword.instanceId,
          riteId: 'rite_bind',
        }),
      ),
    ).toBe('requirements_unmet');
  });

  it('a Cơ rite adds a socket; death wears durability; repair restores it for gold', () => {
    const { world, id, sword, forge, give, player, content, p } = setup();
    forge({
      op: 'synthesize',
      instanceId: sword.instanceId,
      fodder: [give('sword'), give('sword')],
    });
    forge({
      op: 'rite',
      instanceId: sword.instanceId,
      riteId: 'rite_attune_co',
    });
    expect(socketsOf(content, content.items.get('sword') as ItemDef, sword)).toHaveLength(3);
    const mob = [...world.entities.values()].find((e) => e.kind === 'monster') as Entity;
    for (let i = 0; i < 5; i++) {
      applyDamage(world, mob, player, 1_000_000, false, null);
      expect(player.life.alive).toBe(false);
      player.life.alive = true;
      player.stats.hp = player.stats.maxHp;
    }
    expect(sword.forge?.durability).toBe(0);
    // Broken: half of rare 24 × 1.1 attune.
    expect(world.playerState(id)?.stats.attack).toBe(30 + 13);
    const gold = p.gold;
    expect(result(forge({ op: 'repair', instanceId: sword.instanceId }))).toMatchObject({
      success: true,
    });
    expect(sword.forge?.durability).toBe(50);
    expect(p.gold).toBe(gold - 50);
  });
});
