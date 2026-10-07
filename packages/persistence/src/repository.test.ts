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
  it('keeps affinity immutable across save and rejects an incompatible expression', async () => {
    const accountId = await repo.createAccount('affinity-lock', 'hash');
    const id = await repo.createCharacter({
      accountId,
      name: 'Locked',
      characterDefId: 'player_default',
      mapId: 'map_sandbox_01',
      element: 'kim',
      expression: 'base',
    });
    expect(await repo.chooseLegacyElement(id, accountId, 'hoa', 'base')).toBe(false);
    const loaded = await repo.loadCharacter(id);
    if (!loaded) throw new Error('missing save');
    await repo.saveCharacter(
      id,
      { ...loaded.save, element: 'hoa', expression: 'base', cooldowns: { skill_blink: 10 } },
      { mapId: loaded.mapId, x: 0, z: 0 },
      [],
    );
    expect((await repo.loadCharacter(id))?.save.element).toBe('kim');
    expect((await repo.loadCharacter(id))?.save.cooldowns).toEqual({ skill_blink: 10 });
    await expect(
      repo.createCharacter({
        accountId,
        name: 'Invalid',
        characterDefId: 'player_default',
        mapId: 'map_sandbox_01',
        element: 'kim',
        expression: 'thunder',
      }),
    ).rejects.toThrow();
  });
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
      realm: 'truc_co',
      nodes: ['tien_khai_mach', 'co_micro_reactor'],
      gold: 15,
      hp: 500,
      mp: 80,
      inventory: [
        {
          instanceId: 'i-sword',
          itemId: 'item_sword_iron',
          count: 1,
          enhance: 2,
        },
        { instanceId: 'i-pot', itemId: 'item_potion_hp_small', count: 4 },
      ],
      equipment: { main_hand: 'i-sword' },
      quests: [{ questId: 'q_wolf_cull', status: 'active' as const, progress: [2] }],
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
    expect(loaded?.save).toEqual({ ...save, element: 'moc', expression: 'base' });
    expect(loaded?.realm).toBe('truc_co');
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
      realm: 'luyen_khi',
      nodes: [],
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
      realm: 'luyen_khi',
      nodes: [],
      hp: 1,
      mp: 0,
      inventory: [],
      equipment: {},
    };
    await expect(
      repo.saveCharacter(id, { ...base, gold: -5 }, { mapId: 'm', x: 0, z: 0 }),
    ).rejects.toThrow();
  });

  it('friend requests become friendships; guild leadership passes on', async () => {
    const acc = await repo.createAccount('social', 'hash');
    const a = await repo.createCharacter({
      accountId: acc,
      name: 'Áo Xanh',
      characterDefId: 'player_default',
      mapId: 'm',
    });
    const b = await repo.createCharacter({
      accountId: acc,
      name: 'Áo Đỏ',
      characterDefId: 'player_default',
      mapId: 'm',
    });
    expect(await repo.requestFriend(a, b)).toBe('pending');
    expect((await repo.socialOf(b)).friends).toEqual([
      expect.objectContaining({ id: a, status: 'incoming' }),
    ]);
    expect(await repo.requestFriend(b, a)).toBe('accepted'); // asking back accepts
    expect((await repo.socialOf(a)).friends[0]?.status).toBe('friend');
    await expect(repo.requestFriend(a, a)).rejects.toThrow();

    await repo.createGuild(a, 'Thanh Vân Môn');
    await expect(repo.createGuild(a, 'Khác')).rejects.toThrow(/already/);
    await repo.joinGuild(b, 'thanh vân môn');
    expect((await repo.socialOf(b)).guild?.members).toHaveLength(2);
    await repo.leaveGuild(a);
    const g = (await repo.socialOf(b)).guild;
    expect(g?.leaderId).toBe(b);
    await repo.leaveGuild(b);
    expect((await repo.socialOf(b)).guild).toBeNull();
  });
});
