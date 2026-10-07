import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import {
  ACCESS_TTL_SECONDS,
  type AccessClaims,
  hashPassword,
  hashRefreshToken,
  newRefreshToken,
  newTotpSecret,
  PasswordSchema,
  REFRESH_TTL_SECONDS,
  type TokenService,
  totpUri,
  UsernameSchema,
  verifyPassword,
  verifyTotp,
} from '@rpg/auth';
import type { ContentBundle } from '@rpg/game-data';
import type { GameRepository } from '@rpg/persistence';
import Fastify, { type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { addItemToSave } from './items';

export interface ApiDeps {
  repo: GameRepository;
  tokens: TokenService;
  content: ContentBundle;
  /** ws(s):// URL handed to clients when a game session starts. */
  gameServerUrl: string;
  /** Exact origins or patterns (dev runner allows any localhost port). */
  corsOrigins: (string | RegExp)[];
  logLevel?: string;
  /** Tests disable rate limiting to run many requests quickly. */
  rateLimit?: boolean;
}

const MAX_CHARACTERS = 4;
const CharacterNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[\p{L}\p{N} _]+$/u, 'letters, digits, spaces');

declare module 'fastify' {
  interface FastifyRequest {
    claims?: AccessClaims;
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new HttpError(
      400,
      r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '),
    );
  return r.data;
}

/**
 * Account, character and admin API (tech plan §34: one API server, not
 * micro-services). Security baseline: helmet, CORS allow-list, rate limits,
 * Zod on every body, argon2id, rotating hashed refresh tokens, RBAC + TOTP
 * for staff, audit log for every staff action (tech plan §55).
 */
export async function buildApi(deps: ApiDeps) {
  const app = Fastify({
    logger: {
      level: deps.logLevel ?? 'info',
      redact: ['req.headers.authorization', 'body.password', 'body.refreshToken'],
    },
    bodyLimit: 32 * 1024,
    trustProxy: true,
  });
  await app.register(helmet);
  await app.register(cors, { origin: deps.corsOrigins, credentials: false });
  if (deps.rateLimit !== false) {
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  }
  const strict =
    deps.rateLimit !== false ? { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } } : {};

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({
      error: status >= 500 ? 'internal error' : (err as Error).message,
    });
  });

  const authenticate = async (req: FastifyRequest) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
      req.claims = await deps.tokens.verifyAccess(token);
    } catch {
      throw new HttpError(401, 'invalid or expired token');
    }
  };
  const requireStaff = async (req: FastifyRequest) => {
    await authenticate(req);
    const c = req.claims;
    if (!c || (c.role !== 'gm' && c.role !== 'admin')) throw new HttpError(403, 'staff only');
    if (!c.mfa) throw new HttpError(403, 'two-factor authentication required');
  };
  const claimsOf = (req: FastifyRequest): AccessClaims => {
    if (!req.claims) throw new HttpError(401, 'unauthenticated');
    return req.claims;
  };

  async function issueTokens(
    accountId: string,
    role: AccessClaims['role'],
    mfa: boolean,
    familyId: string = crypto.randomUUID(),
  ) {
    const { token, hash } = newRefreshToken();
    await deps.repo.insertRefreshToken({
      accountId,
      tokenHash: hash,
      familyId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    });
    return {
      accessToken: await deps.tokens.signAccess({ sub: accountId, role, mfa }),
      refreshToken: token,
      expiresIn: ACCESS_TTL_SECONDS,
    };
  }

  app.get('/health', async () => ({ ok: true }));

  // ---- Auth -------------------------------------------------------------

  app.post('/auth/register', strict, async (req, reply) => {
    const body = parse(z.object({ username: UsernameSchema, password: PasswordSchema }), req.body);
    if (await deps.repo.findAccountByUsername(body.username))
      throw new HttpError(409, 'username taken');
    const id = await deps.repo.createAccount(body.username, await hashPassword(body.password));
    return reply.status(201).send({ accountId: id });
  });

  app.post('/auth/login', strict, async (req) => {
    const body = parse(
      z.object({
        username: z.string().max(64),
        password: z.string().max(128),
        totp: z.string().max(8).optional(),
      }),
      req.body,
    );
    const account = await deps.repo.findAccountByUsername(body.username);
    // Same error for unknown user and wrong password (no account enumeration).
    if (!account || !(await verifyPassword(account.passwordHash, body.password))) {
      throw new HttpError(401, 'invalid credentials');
    }
    if (account.bannedUntil && account.bannedUntil > new Date())
      throw new HttpError(403, 'account banned');
    let mfa = false;
    if (account.totpSecret) {
      if (!body.totp) return { mfaRequired: true };
      if (!verifyTotp(account.totpSecret, body.totp)) throw new HttpError(401, 'invalid code');
      mfa = true;
    }
    return issueTokens(account.id, account.role, mfa);
  });

  app.post('/auth/refresh', strict, async (req) => {
    const body = parse(z.object({ refreshToken: z.string().min(10).max(200) }), req.body);
    const row = await deps.repo.findRefreshToken(hashRefreshToken(body.refreshToken));
    if (!row || row.expiresAt < new Date()) throw new HttpError(401, 'invalid refresh token');
    if (row.revokedAt) {
      // A rotated token was reused: assume theft, revoke the whole chain.
      await deps.repo.revokeTokenFamily(row.familyId);
      await deps.repo.audit(row.accountId, 'refresh_token_reuse', row.accountId);
      throw new HttpError(401, 'refresh token reused; please log in again');
    }
    const account = await deps.repo.getAccount(row.accountId);
    if (!account || (account.bannedUntil && account.bannedUntil > new Date()))
      throw new HttpError(401, 'account unavailable');
    await deps.repo.revokeRefreshToken(row.id);
    // MFA is not carried over: staff re-enter a code after the access token expires.
    return issueTokens(account.id, account.role, false, row.familyId);
  });

  app.post('/auth/logout', async (req, reply) => {
    const body = parse(z.object({ refreshToken: z.string().max(200) }), req.body);
    const row = await deps.repo.findRefreshToken(hashRefreshToken(body.refreshToken));
    if (row) await deps.repo.revokeTokenFamily(row.familyId);
    return reply.status(204).send();
  });

  app.post('/auth/mfa/setup', { preHandler: authenticate }, async (req) => {
    const c = claimsOf(req);
    const account = await deps.repo.getAccount(c.sub);
    if (!account) throw new HttpError(404, 'account not found');
    if (account.totpSecret) throw new HttpError(409, 'already enabled');
    const secret = newTotpSecret();
    // Stored as pending: becomes active only after the first valid code (enable).
    await deps.repo.audit(c.sub, 'mfa_setup', c.sub);
    return { secret, uri: totpUri(secret, account.username) };
  });

  app.post('/auth/mfa/enable', { preHandler: authenticate }, async (req) => {
    const c = claimsOf(req);
    const body = parse(
      z.object({
        secret: z.string().min(16).max(64),
        code: z.string().length(6),
      }),
      req.body,
    );
    if (!verifyTotp(body.secret, body.code)) throw new HttpError(400, 'invalid code');
    await deps.repo.setTotpSecret(c.sub, body.secret);
    await deps.repo.audit(c.sub, 'mfa_enabled', c.sub);
    return { enabled: true };
  });

  // ---- Characters -------------------------------------------------------

  app.get('/characters', { preHandler: authenticate }, async (req) => {
    return { characters: await deps.repo.listCharacters(claimsOf(req).sub) };
  });

  app.post('/characters', { preHandler: authenticate }, async (req, reply) => {
    const c = claimsOf(req);
    const body = parse(
      z.object({
        name: CharacterNameSchema,
        characterDefId: z.string().optional(),
      }),
      req.body,
    );
    const existing = await deps.repo.listCharacters(c.sub);
    if (existing.length >= MAX_CHARACTERS)
      throw new HttpError(409, `at most ${MAX_CHARACTERS} characters`);
    // Default class: player_default when present (test kits like player_gunner sort after it anyway).
    const defId =
      body.characterDefId ??
      (deps.content.characters.has('player_default')
        ? 'player_default'
        : [...deps.content.characters.keys()][0]);
    if (!defId || !deps.content.characters.has(defId))
      throw new HttpError(400, 'unknown character type');
    const startMap = deps.content.maps.has('map_sandbox_01')
      ? 'map_sandbox_01'
      : [...deps.content.maps.keys()][0];
    try {
      const id = await deps.repo.createCharacter({
        accountId: c.sub,
        name: body.name,
        characterDefId: defId,
        mapId: startMap as string,
      });
      return reply.status(201).send({ id });
    } catch {
      throw new HttpError(409, 'name taken');
    }
  });

  /** Exchanges an account token for a game-session token bound to one character. */
  app.post('/characters/:id/session', { preHandler: authenticate }, async (req) => {
    const c = claimsOf(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const character = await deps.repo.loadCharacter(id);
    if (!character || character.accountId !== c.sub)
      throw new HttpError(404, 'character not found');
    const accessToken = await deps.tokens.signAccess({
      sub: c.sub,
      role: c.role,
      chr: id,
    });
    return {
      accessToken,
      mapId: character.mapId,
      gameServerUrl: deps.gameServerUrl,
      expiresIn: ACCESS_TTL_SECONDS,
    };
  });

  // ---- Social: friends and guilds (tech plan Phase 8) -----------------------

  /** Resolves `:id` to a character owned by the caller. */
  const ownCharacter = async (req: FastifyRequest): Promise<string> => {
    const c = claimsOf(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const character = await deps.repo.loadCharacter(id);
    if (!character || character.accountId !== c.sub)
      throw new HttpError(404, 'character not found');
    return id;
  };
  const GuildNameSchema = z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[\p{L}\p{N} ]+$/u, 'letters, digits, spaces');

  app.get('/characters/:id/social', { preHandler: authenticate }, async (req) =>
    deps.repo.socialOf(await ownCharacter(req)),
  );

  app.post('/characters/:id/friends', { preHandler: authenticate }, async (req) => {
    const me = await ownCharacter(req);
    const { name } = parse(z.object({ name: z.string().min(2).max(20) }), req.body);
    const other = await deps.repo.findCharacterByName(name);
    if (!other) throw new HttpError(404, 'character not found');
    if (other.id === me) throw new HttpError(400, 'cannot befriend yourself');
    return { status: await deps.repo.requestFriend(me, other.id) };
  });

  app.post('/characters/:id/friends/:otherId/accept', { preHandler: authenticate }, async (req) => {
    const me = await ownCharacter(req);
    const { otherId } = parse(z.object({ otherId: z.string().uuid() }), req.params);
    if (!(await deps.repo.acceptFriend(me, otherId))) throw new HttpError(404, 'no such request');
    return { ok: true };
  });

  app.delete('/characters/:id/friends/:otherId', { preHandler: authenticate }, async (req) => {
    const me = await ownCharacter(req);
    const { otherId } = parse(z.object({ otherId: z.string().uuid() }), req.params);
    await deps.repo.removeFriend(me, otherId);
    return { ok: true };
  });

  app.post('/characters/:id/guild', { preHandler: authenticate }, async (req, reply) => {
    const me = await ownCharacter(req);
    const { name } = parse(z.object({ name: GuildNameSchema }), req.body);
    try {
      return reply.status(201).send({ guildId: await deps.repo.createGuild(me, name) });
    } catch (err) {
      throw new HttpError(
        409,
        /already/.test((err as Error).message) ? 'already in a guild' : 'guild name taken',
      );
    }
  });

  app.post('/characters/:id/guild/join', { preHandler: authenticate }, async (req) => {
    const me = await ownCharacter(req);
    const { name } = parse(z.object({ name: GuildNameSchema }), req.body);
    try {
      return { guildId: await deps.repo.joinGuild(me, name) };
    } catch (err) {
      throw new HttpError(409, (err as Error).message);
    }
  });

  app.post('/characters/:id/guild/leave', { preHandler: authenticate }, async (req) => {
    await deps.repo.leaveGuild(await ownCharacter(req));
    return { ok: true };
  });

  // ---- Admin (tech plan §40) ---------------------------------------------

  const staff = { preHandler: requireStaff };

  app.get('/admin/characters', staff, async (req) => {
    const { q } = parse(z.object({ q: z.string().max(40).default('') }), req.query);
    return { characters: await deps.repo.searchCharacters(q) };
  });

  app.get('/admin/characters/:id', staff, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const character = await deps.repo.loadCharacter(id);
    if (!character) throw new HttpError(404, 'character not found');
    return { character, ledger: await deps.repo.ledgerFor(id) };
  });

  app.post('/admin/characters/:id/give-item', staff, async (req) => {
    const c = claimsOf(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(
      z.object({
        itemId: z.string().max(64),
        count: z.number().int().min(1).max(999),
        reason: z.string().min(3).max(200),
      }),
      req.body,
    );
    const item = deps.content.items.get(body.itemId);
    if (!item) throw new HttpError(400, 'unknown item');
    const character = await deps.repo.loadCharacter(id);
    if (!character) throw new HttpError(404, 'character not found');
    const save = addItemToSave(character.save, item, body.count);
    await deps.repo.saveCharacter(id, save, {
      mapId: character.mapId,
      x: character.x,
      z: character.z,
    });
    await deps.repo.audit(c.sub, 'give_item', id, body);
    return { ok: true, inventory: save.inventory };
  });

  app.post('/admin/accounts/:id/sanction', staff, async (req) => {
    const c = claimsOf(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(
      z.object({
        kind: z.enum(['ban', 'mute']),
        hours: z
          .number()
          .min(0)
          .max(24 * 365),
        reason: z.string().min(3).max(200),
      }),
      req.body,
    );
    const until = body.hours === 0 ? null : new Date(Date.now() + body.hours * 3_600_000);
    await deps.repo.setSanction(id, body.kind, until);
    await deps.repo.audit(c.sub, body.kind, id, body);
    return { ok: true, until };
  });

  app.get('/admin/audit', staff, async () => ({
    entries: await deps.repo.listAudit(200),
  }));

  app.get('/leaderboard', async () => ({
    leaderboard: await deps.repo.leaderboard(20),
  }));

  app.get('/content/items', async () => ({
    items: [...deps.content.items.values()].map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.kind,
      rarity: i.rarity,
    })),
  }));

  return app;
}
