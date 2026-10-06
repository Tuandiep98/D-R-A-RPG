import { fileURLToPath } from 'node:url';
import { TokenService, totpCode } from '@rpg/auth';
import { loadContentFromDir } from '@rpg/game-data/node';
import { type Database, GameRepository, openDatabase } from '@rpg/persistence';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApi } from './app';

const tokens = new TokenService('api-test-secret-api-test-secret-123');
let database: Database;
let repo: GameRepository;
let app: Awaited<ReturnType<typeof buildApi>>;

beforeAll(async () => {
  database = await openDatabase();
  repo = new GameRepository(database.db);
  app = await buildApi({
    repo,
    tokens,
    content: loadContentFromDir(fileURLToPath(new URL('../../../game-data', import.meta.url))),
    gameServerUrl: 'ws://game.test',
    corsOrigins: ['http://localhost:5173'],
    logLevel: 'silent',
    rateLimit: false,
  });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const post = (url: string, payload: unknown, token?: string) =>
  app.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
const get = (url: string, token?: string) =>
  app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('auth', () => {
  it('registers, logs in, rejects bad credentials without leaking which part was wrong', async () => {
    expect(
      (await post('/auth/register', { username: 'hero', password: 'password123' })).statusCode,
    ).toBe(201);
    expect(
      (await post('/auth/register', { username: 'HERO', password: 'password123' })).statusCode,
    ).toBe(409);
    expect((await post('/auth/register', { username: 'x', password: 'short' })).statusCode).toBe(
      400,
    );
    const wrongPw = await post('/auth/login', { username: 'hero', password: 'nope' });
    const noUser = await post('/auth/login', { username: 'ghost', password: 'nope' });
    expect(wrongPw.statusCode).toBe(401);
    expect(wrongPw.json()).toEqual(noUser.json());
    const ok = await post('/auth/login', { username: 'hero', password: 'password123' });
    expect(ok.json()).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    await post('/auth/register', { username: 'rotator', password: 'password123' });
    const first = (
      await post('/auth/login', { username: 'rotator', password: 'password123' })
    ).json();
    const second = (await post('/auth/refresh', { refreshToken: first.refreshToken })).json();
    expect(second.refreshToken).toBeDefined();
    // Reusing the old token (stolen?) kills the chain, including the new token.
    expect((await post('/auth/refresh', { refreshToken: first.refreshToken })).statusCode).toBe(
      401,
    );
    expect((await post('/auth/refresh', { refreshToken: second.refreshToken })).statusCode).toBe(
      401,
    );
  });
});

describe('characters', () => {
  it('creates characters and issues a session token bound to one of them', async () => {
    await post('/auth/register', { username: 'player1', password: 'password123' });
    const { accessToken } = (
      await post('/auth/login', { username: 'player1', password: 'password123' })
    ).json();
    expect((await get('/characters')).statusCode).toBe(401);
    const created = await post('/characters', { name: 'Lý Tiêu Dao' }, accessToken);
    expect(created.statusCode).toBe(201);
    const { characters } = (await get('/characters', accessToken)).json();
    expect(characters).toHaveLength(1);
    const session = (await post(`/characters/${characters[0].id}/session`, {}, accessToken)).json();
    expect(session).toMatchObject({ mapId: 'map_sandbox_01', gameServerUrl: 'ws://game.test' });
    expect((await tokens.verifyAccess(session.accessToken)).chr).toBe(characters[0].id);

    // Someone else's character cannot be played.
    await post('/auth/register', { username: 'player2', password: 'password123' });
    const other = (
      await post('/auth/login', { username: 'player2', password: 'password123' })
    ).json();
    expect(
      (await post(`/characters/${characters[0].id}/session`, {}, other.accessToken)).statusCode,
    ).toBe(404);
  });
});

describe('admin', () => {
  it('requires a staff role and TOTP; staff actions are audited', async () => {
    await post('/auth/register', { username: 'gm_one', password: 'password123' });
    const gm = await repo.findAccountByUsername('gm_one');
    if (!gm) throw new Error('no gm');
    await repo.setRole(gm.id, 'gm');

    const noMfa = (
      await post('/auth/login', { username: 'gm_one', password: 'password123' })
    ).json();
    expect((await get('/admin/characters?q=', noMfa.accessToken)).statusCode).toBe(403);

    const setup = (await post('/auth/mfa/setup', {}, noMfa.accessToken)).json();
    const enable = await post(
      '/auth/mfa/enable',
      { secret: setup.secret, code: totpCode(setup.secret) },
      noMfa.accessToken,
    );
    expect(enable.statusCode).toBe(200);
    expect(
      (await post('/auth/login', { username: 'gm_one', password: 'password123' })).json(),
    ).toEqual({ mfaRequired: true });
    const staff = (
      await post('/auth/login', {
        username: 'gm_one',
        password: 'password123',
        totp: totpCode(setup.secret),
      })
    ).json();

    const { characters } = (await get('/admin/characters?q=Tiêu', staff.accessToken)).json();
    expect(characters.length).toBeGreaterThan(0);
    const give = await post(
      `/admin/characters/${characters[0].id}/give-item`,
      { itemId: 'item_potion_hp_small', count: 3, reason: 'event reward' },
      staff.accessToken,
    );
    expect(give.statusCode).toBe(200);
    const detail = (await get(`/admin/characters/${characters[0].id}`, staff.accessToken)).json();
    expect(
      detail.character.save.inventory.find(
        (i: { itemId: string }) => i.itemId === 'item_potion_hp_small',
      )?.count,
    ).toBe(3);
    const { entries } = (await get('/admin/audit', staff.accessToken)).json();
    expect(entries.some((e: { action: string }) => e.action === 'give_item')).toBe(true);

    // Players never reach admin routes, even with a valid token.
    const player = (
      await post('/auth/login', { username: 'player1', password: 'password123' })
    ).json();
    expect((await get('/admin/audit', player.accessToken)).statusCode).toBe(403);
  });
});

describe('social', () => {
  it('manages friends and guilds for owned characters only', async () => {
    await post('/auth/register', { username: 'soc_a', password: 'password123' });
    await post('/auth/register', { username: 'soc_b', password: 'password123' });
    const ta = (await post('/auth/login', { username: 'soc_a', password: 'password123' })).json()
      .accessToken;
    const tb = (await post('/auth/login', { username: 'soc_b', password: 'password123' })).json()
      .accessToken;
    const a = (await post('/characters', { name: 'Kiếm Khách' }, ta)).json().id;
    const b = (await post('/characters', { name: 'Đao Khách' }, tb)).json().id;

    expect((await post(`/characters/${a}/friends`, { name: 'Đao Khách' }, ta)).json()).toEqual({
      status: 'pending',
    });
    expect((await post(`/characters/${b}/friends/${a}/accept`, {}, tb)).statusCode).toBe(200);
    expect((await get(`/characters/${a}/social`, ta)).json().friends[0]).toMatchObject({
      name: 'Đao Khách',
      status: 'friend',
    });
    // Using someone else's character id is a 404, not a leak.
    expect((await get(`/characters/${b}/social`, ta)).statusCode).toBe(404);

    expect((await post(`/characters/${a}/guild`, { name: 'Thiên Kiếm Các' }, ta)).statusCode).toBe(
      201,
    );
    expect((await post(`/characters/${b}/guild`, { name: 'thiên kiếm các' }, tb)).statusCode).toBe(
      409,
    );
    expect(
      (await post(`/characters/${b}/guild/join`, { name: 'Thiên Kiếm Các' }, tb)).statusCode,
    ).toBe(200);
    expect((await get(`/characters/${b}/social`, tb)).json().guild.members).toHaveLength(2);
  });
});
