import {
  type AppearanceDef,
  AppearanceDefSchema,
  type CharacterDef,
  CharacterDefSchema,
  type ContentBundle,
  type MapDef,
  MapDefSchema,
  type MonsterDef,
  MonsterDefSchema,
} from '@rpg/game-data';

/** Small in-memory content set for unit tests. Only imported by *.test.ts. */
export function makeContent(
  overrides: {
    map?: Partial<MapDef>;
    monster?: Partial<MonsterDef>;
    character?: Partial<CharacterDef>;
  } = {},
): ContentBundle {
  const appearance: AppearanceDef = AppearanceDefSchema.parse({
    id: 'look',
    kind: 'monster',
    placeholder: { shape: 'box', color: '#fff', height: 1, radius: 0.5 },
  });
  const character = CharacterDefSchema.parse({
    id: 'hero',
    name: 'Hero',
    appearanceId: 'look',
    stats: { hp: 500, attack: 30, defense: 5, critChance: 0 },
    movement: { speed: 5, radius: 0.4 },
    combat: { range: 1.5, attackInterval: 1 },
    respawnSeconds: 5,
    ...overrides.character,
  });
  const monster = MonsterDefSchema.parse({
    id: 'wolf',
    name: 'Wolf',
    level: 1,
    appearanceId: 'look',
    stats: { hp: 100, attack: 10, defense: 0, critChance: 0 },
    movement: { speed: 3, radius: 0.5 },
    combat: { range: 1.2, attackInterval: 1 },
    ai: { type: 'melee', aggroRadius: 6, leashRadius: 12, wanderRadius: 0 },
    ...overrides.monster,
  });
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
      {
        id: 'camp',
        monsterId: 'wolf',
        position: { x: 0, z: 20 },
        count: 1,
        respawnSeconds: 3,
      },
    ],
    ...overrides.map,
  });
  return {
    appearances: new Map([[appearance.id, appearance]]),
    characters: new Map([[character.id, character]]),
    monsters: new Map([[monster.id, monster]]),
    maps: new Map([[map.id, map]]),
  };
}
