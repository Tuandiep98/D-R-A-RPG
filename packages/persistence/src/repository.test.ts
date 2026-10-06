import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Database, openDatabase } from './db';
import { GameRepository } from './repository';

let database: Database;
let repo: GameRepository;

beforeAll(async () => {
  database = await openDatabase(); // in-memory PGlite with migrations applied
  repo = new GameRepository(database.db);
});
afterAll(async () => {
  await database.close();
});

describe('GameRepository', () => {
  it('creates accounts with case-insensitive unique usernames', async () => {
    await repo.createAccount('Alice', 'hash');
    await expect(repo.createAccount('alice', 'hash')).rejects.toThrow();
    expect((await repo.findAccountByUsername('ALICE'))?.username).toBe('Alice');
  });

  it('saves and loads a character with inventory, equipment and wallet', async () => {
    const accountId = await repo.createAccount('bob', 'hash');
    const id = await repo.createCharacter({
      accountId,
      name: 'Bob',
      characterDefId: 'player_default',
      mapId: 'map_sandbox_01',
    });
    expect(await repo.hasBeenPlayed(id)).toBe(false);
    const save = {
      characterId: 'player_default',
      level: 3,
      xp: 40,
      gold: 15,
      hp: 500,
      mp: 80,
      inventory: [
        { instanceId: 'i-sword', itemId: 'item_sword_iron', count: 1 },
        { instanceId: 'i-pot', itemId: 'item_potion_hp_small', count: 4 },
      ],
      equipment: { main_hand: 'i-sword' },
    };
    const ledger = [
      {
        tick: 1,
        entityId: 1,
        characterId: 'player_default',
        amount: 15,
        balanceAfter: 15,
        reason: 'monster_drop' as const,
        key: 'k1',
      },
    ];
    const res = await repo.saveCharacter(
      id,
      save,
      { mapId: 'map_forest_mechanism_01', x: 1, z: 2 },
      ledger,
    );
    expect(res).toEqual({ version: 1, anomaly: false });

    const loaded = await repo.loadCharacter(id);
    expect(loaded?.mapId).toBe('map_forest_mechanism_01');
    expect(loaded?.save).toEqual(save);
    expect(await repo.ledgerFor(id)).toHaveLength(1);
  });

  it('ledger entries are idempotent and mismatches are audited', async () => {
    const accountId = await repo.createAccount('carol', 'hash');
    const id = await repo.createCharacter({
      accountId,
      name: 'Carol',
      characterDefId: 'player_default',
      mapId: 'map_sandbox_01',
    });
    const base = {
      characterId: 'player_default',
      level: 1,
      xp: 0,
      hp: 1,
      mp: 0,
      inventory: [],
      equipment: {},
    };
    const entry = {
      tick: 1,
      entityId: 1,
      characterId: 'player_default',
      amount: 10,
      balanceAfter: 10,
      reason: 'monster_drop' as const,
      key: 'same',
    };
    await repo.saveCharacter(id, { ...base, gold: 10 }, { mapId: 'map_sandbox_01', x: 0, z: 0 }, [
      entry,
    ]);
    // Retry of the same save: ledger key already applied, wallet unchanged → no anomaly.
    const retry = await repo.saveCharacter(
      id,
      { ...base, gold: 10 },
      { mapId: 'map_sandbox_01', x: 0, z: 0 },
      [entry],
    );
    expect(retry.anomaly).toBe(false);
    expect(await repo.ledgerFor(id)).toHaveLength(1);

    // Gold appearing without a ledger entry is flagged.
    const bad = await repo.saveCharacter(
      id,
      { ...base, gold: 9999 },
      { mapId: 'map_sandbox_01', x: 0, z: 0 },
      [],
    );
    expect(bad.anomaly).toBe(true);
    expect(
      (await repo.listAudit()).some((a) => a.action === 'ledger_mismatch' && a.target === id),
    ).toBe(true);
  });

  it('wallet gold cannot go negative (DB constraint)', async () => {
    const accountId = await repo.createAccount('dave', 'hash');
    const id = await repo.createCharacter({
      accountId,
      name: 'Dave',
      characterDefId: 'player_default',
      mapId: 'map_sandbox_01',
    });
    const base = {
      characterId: 'player_default',
      level: 1,
      xp: 0,
      hp: 1,
      mp: 0,
      inventory: [],
      equipment: {},
    };
    await expect(
      repo.saveCharacter(id, { ...base, gold: -5 }, { mapId: 'm', x: 0, z: 0 }),
    ).rejects.toThrow();
  });
});
