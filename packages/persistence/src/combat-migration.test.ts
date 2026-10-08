import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { expect, it } from 'vitest';
import type { Db } from './db';
import { GameRepository } from './repository';
import * as schema from './schema';

it('migrates a pre-affinity database without losing progression, gear, wallet or legacy grants', async () => {
  const client = new PGlite();
  try {
    const folder = new URL('../drizzle/', import.meta.url);
    const files = (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort();
    const apply = async (file: string) => {
      for (const statement of (await readFile(new URL(file, folder), 'utf8')).split(
        '--> statement-breakpoint',
      )) {
        if (statement.trim()) await client.exec(statement);
      }
    };
    for (const file of files.filter((f) => Number(f.slice(0, 4)) < 6)) await apply(file);
    const account = '00000000-0000-4000-8000-000000000001';
    const oldSword = '00000000-0000-4000-8000-000000000002';
    const oldGun = '00000000-0000-4000-8000-000000000003';
    const freshSword = '00000000-0000-4000-8000-000000000004';
    await client.query('INSERT INTO accounts(id,username,password_hash) VALUES($1,$2,$3)', [
      account,
      'migration',
      'hash',
    ]);
    for (const [id, name, def, version] of [
      [oldSword, 'Sword', 'player_default', 3],
      [oldGun, 'Gun', 'player_gunner', 2],
      [freshSword, 'Fresh', 'player_default', 0],
    ]) {
      await client.query(
        'INSERT INTO characters(id,account_id,name,character_def_id,map_id,version,realm,nodes,hp,mp,quest_log) VALUES($1,$2,$3,$4,\'map_sandbox_01\',$5,\'truc_co\',\'["tien_kiem_khi"]\',501,72,\'[{"questId":"q_wolf_cull","status":"active","progress":[2]}]\')',
        [id, account, name, def, version],
      );
      await client.query('INSERT INTO wallets(character_id,gold) VALUES($1,123)', [id]);
    }
    await client.query(
      "INSERT INTO item_instances(id,character_id,item_id,count,equipped_slot,enhance) VALUES('old-sword',$1,'item_sword_iron',1,'main_hand',2)",
      [oldSword],
    );
    for (const file of files.filter(
      (f) => Number(f.slice(0, 4)) >= 6 && Number(f.slice(0, 4)) <= 8,
    ))
      await apply(file);
    await client.query(
      'UPDATE characters SET cooldowns = \'{"skill_thunder_step":3,"skill_thunder_judgement":17}\' WHERE id=$1',
      [oldSword],
    );
    for (const file of files.filter((f) => Number(f.slice(0, 4)) >= 9)) await apply(file);
    const repo = new GameRepository(drizzle({ client, schema }) as unknown as Db);
    const sword = await repo.loadCharacter(oldSword);
    expect(sword?.save).toMatchObject({
      saveVersion: 2,
      element: 'moc',
      expression: 'thunder',
      elementRevision: 1,
      realm: 'truc_co',
      nodes: ['tien_kiem_khi'],
      hp: 501,
      mp: 72,
      gold: 123,
      cooldowns: { skill_thunder_step: 3, skill_thunder_judgement: 17 },
      inventory: [{ instanceId: 'old-sword', itemId: 'item_sword_iron', count: 1, enhance: 2 }],
      equipment: { main_hand: 'old-sword' },
      quests: [{ questId: 'q_wolf_cull', status: 'active', progress: [2] }],
    });
    expect(sword?.save.learnedSkills).toHaveLength(7);
    const gun = await repo.loadCharacter(oldGun);
    expect(gun).toMatchObject({ element: null, expression: 'base' });
    expect(gun?.save).toMatchObject({
      elementRevision: 0,
      learnedSkills: [
        'skill_thunder_step',
        'skill_thunder_pierce',
        'skill_thunder_arc',
        'skill_thunder_field',
      ],
    });
    expect((await repo.loadCharacter(freshSword))?.save.learnedSkills).toEqual([]);
    expect(await repo.chooseLegacyElement(oldGun, account, 'thuy', 'ice')).toBe(true);
    expect(await repo.chooseLegacyElement(oldGun, account, 'kim', 'base')).toBe(false);
    expect((await repo.loadCharacter(oldGun))?.save).toMatchObject({
      element: 'thuy',
      expression: 'ice',
      elementRevision: 1,
    });
    const history = await client.query<{ action: string; payload: { elementRevision: number } }>(
      'SELECT action,payload FROM audit_log WHERE target=$1 ORDER BY created_at',
      [oldGun],
    );
    expect(history.rows.map((r) => r.action)).toEqual([
      'character.combat.migrate',
      'character.element.choose',
    ]);
    expect(history.rows.map((r) => r.payload.elementRevision)).toEqual([0, 1]);
    if (!sword) throw new Error('missing migrated sword');
    await repo.saveCharacter(
      oldSword,
      { ...sword.save, learnedSkills: undefined, element: 'hoa', elementRevision: 99 },
      { mapId: sword.mapId, x: 0, z: 0 },
    );
    const after = await repo.loadCharacter(oldSword);
    expect(after?.save.learnedSkills).toEqual(sword.save.learnedSkills);
    expect(after?.save).toMatchObject({
      element: 'moc',
      expression: 'thunder',
      elementRevision: 1,
    });
  } finally {
    await client.close();
  }
}, 30000);
