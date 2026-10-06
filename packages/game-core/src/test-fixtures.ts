import {
  AppearanceDefSchema,
  CharacterDefSchema,
  type ContentBundle,
  ItemDefSchema,
  LootTableDefSchema,
  MapDefSchema,
  MonsterDefSchema,
  ProgressionDefSchema,
  SkillDefSchema,
} from '@rpg/game-data';

type Raw = Record<string, unknown>;

export interface FixtureOverrides {
  map?: Raw;
  monster?: Raw;
  character?: Raw;
  extraMonsters?: Raw[];
  extraMaps?: Raw[];
}

/** Small in-memory content set for unit tests. Overrides are raw (pre-schema) objects. */
export function makeContent(o: FixtureOverrides = {}): ContentBundle {
  const appearance = AppearanceDefSchema.parse({
    id: 'look',
    kind: 'monster',
    placeholder: { shape: 'box', color: '#fff', height: 1, radius: 0.5 },
  });
  const progression = ProgressionDefSchema.parse({
    id: 'prog',
    maxLevel: 10,
    xpCurve: { base: 100, exponent: 1 },
    perLevel: { hp: 50, attack: 5 },
  });
  const skills = [
    {
      id: 'slash',
      name: 'Slash',
      targeting: 'target',
      range: 2,
      cooldown: 5,
      mpCost: 10,
      effects: [{ type: 'damage', multiplier: 3 }],
    },
    {
      id: 'whirl',
      name: 'Whirl',
      targeting: 'self',
      cooldown: 8,
      mpCost: 20,
      effects: [{ type: 'damage', multiplier: 1, radius: 4 }],
    },
    {
      id: 'mend',
      name: 'Mend',
      targeting: 'self',
      cooldown: 10,
      effects: [{ type: 'heal', fraction: 0.5 }],
    },
    {
      id: 'slam',
      name: 'Slam',
      targeting: 'point',
      range: 8,
      castTime: 1.5,
      cooldown: 6,
      telegraph: true,
      effects: [{ type: 'damage', multiplier: 5, radius: 3 }],
    },
  ].map((s) => SkillDefSchema.parse(s));
  const items = [
    { id: 'sword', name: 'Sword', kind: 'equipment', slot: 'main_hand', bonus: { attack: 20 } },
    { id: 'helm', name: 'Helm', kind: 'equipment', slot: 'head', level: 5, bonus: { defense: 5 } },
    { id: 'potion', name: 'Potion', kind: 'consumable', heal: 0.5, cooldown: 3, maxStack: 20 },
    { id: 'fang', name: 'Fang', kind: 'material', maxStack: 99 },
  ].map((i) => ItemDefSchema.parse(i));
  const loot = LootTableDefSchema.parse({
    id: 'wolf_loot',
    gold: { min: 5, max: 5 },
    entries: [{ itemId: 'fang', chance: 1, min: 2, max: 2 }],
  });
  const character = CharacterDefSchema.parse({
    id: 'hero',
    name: 'Hero',
    appearanceId: 'look',
    progressionId: 'prog',
    stats: { hp: 500, mp: 100, attack: 30, defense: 5, critChance: 0, hpRegen: 10, mpRegen: 5 },
    movement: { speed: 5, radius: 0.4 },
    combat: { range: 1.5, attackInterval: 1 },
    respawnSeconds: 5,
    skills: ['slash', 'whirl', 'mend'],
    starterItems: [
      { itemId: 'sword', equip: true },
      { itemId: 'potion', count: 3 },
    ],
    ...o.character,
  });
  const monsterRaw = (extra: Raw = {}) =>
    MonsterDefSchema.parse({
      id: 'wolf',
      name: 'Wolf',
      level: 1,
      appearanceId: 'look',
      stats: { hp: 100, attack: 10, defense: 0, critChance: 0 },
      movement: { speed: 3, radius: 0.5 },
      combat: { range: 1.2, attackInterval: 1 },
      ai: { type: 'melee', aggroRadius: 6, leashRadius: 12, wanderRadius: 0 },
      xp: 60,
      lootTable: ['wolf_loot'],
      ...extra,
    });
  const monsters = [monsterRaw(o.monster), ...(o.extraMonsters ?? []).map((m) => monsterRaw(m))];
  const map = MapDefSchema.parse({
    id: 'test_map',
    name: 'Test',
    schemaVersion: 1,
    seed: 42,
    bounds: { min: { x: -50, z: -50 }, max: { x: 50, z: 50 } },
    ground: {},
    playerSpawn: { x: 0, z: 0 },
    chunks: [{ id: 'chunk_0_0', instances: [] }],
    spawns: [
      { id: 'camp', monsterId: 'wolf', position: { x: 0, z: 20 }, count: 1, respawnSeconds: 3 },
    ],
    ...o.map,
  });
  const maps = [map, ...(o.extraMaps ?? []).map((m) => MapDefSchema.parse(m))];
  return {
    appearances: new Map([[appearance.id, appearance]]),
    characters: new Map([[character.id, character]]),
    monsters: new Map(monsters.map((m) => [m.id, m])),
    maps: new Map(maps.map((m) => [m.id, m])),
    skills: new Map(skills.map((s) => [s.id, s])),
    items: new Map(items.map((i) => [i.id, i])),
    loot: new Map([[loot.id, loot]]),
    progression: new Map([[progression.id, progression]]),
  };
}
