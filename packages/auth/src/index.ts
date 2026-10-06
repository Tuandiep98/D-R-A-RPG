import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

/**
 * Tokens and passwords (tech plan §55.1):
 *  - access tokens: short-lived HS256 JWT, verified by API and game servers,
 *  - refresh tokens: random, stored only as SHA-256 hashes, rotated on use,
 *  - transfer tickets: signed by the game server on portal use,
 *  - passwords: argon2id.
 */

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const TICKET_TTL_SECONDS = 30;
const ISSUER = 'd-r-a-rpg';

export type Role = 'player' | 'gm' | 'admin';

const AccessClaims = z.object({
  sub: z.string(),
  role: z.enum(['player', 'gm', 'admin']),
  /** Character selected for the game session; absent for API-only tokens. */
  chr: z.string().optional(),
  /** Second factor verified at login (required for GM/admin routes). */
  mfa: z.boolean().optional(),
  typ: z.literal('access'),
});
export type AccessClaims = z.infer<typeof AccessClaims>;

const TicketClaims = z.object({
  sub: z.string(),
  map: z.string(),
  arr: z.string().nullable(),
  typ: z.literal('ticket'),
});
export type TicketClaims = z.infer<typeof TicketClaims>;

export class TokenService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    if (secret.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters');
    this.key = new TextEncoder().encode(secret);
  }

  signAccess(claims: Omit<AccessClaims, 'typ'>): Promise<string> {
    return new SignJWT({ role: claims.role, chr: claims.chr, mfa: claims.mfa, typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, algorithms: ['HS256'] });
    return AccessClaims.parse(payload);
  }

  signTicket(claims: Omit<TicketClaims, 'typ'>): Promise<string> {
    return new SignJWT({ map: claims.map, arr: claims.arr, typ: 'ticket' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${TICKET_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verifyTicket(token: string): Promise<TicketClaims> {
    const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, algorithms: ['HS256'] });
    return TicketClaims.parse(payload);
  }
}

/** Opaque refresh token + the hash that is stored. */
export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('base64url');

/** argon2id with OWASP-recommended baseline parameters. */
export const hashPassword = (password: string): Promise<string> =>
  argonHash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

export const verifyPassword = (hash: string, password: string): Promise<boolean> =>
  argonVerify(hash, password).catch(() => false);

export const PasswordSchema = z.string().min(8).max(128);
export const UsernameSchema = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_]+$/, 'letters, digits and underscore only');

// ---- TOTP (RFC 6238) for GM/admin accounts -----------------------------------

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = (): string => base32Encode(randomBytes(20));

export function totpCode(secret: string, timeMs = Date.now(), step = 30): string {
  const counter = Math.floor(timeMs / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = (h[h.length - 1] as number) & 15;
  const bin = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return bin.toString().padStart(6, '0');
}

/** Accepts the current code and one step of clock drift either way. */
export function verifyTotp(secret: string, code: string, timeMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((d) => {
    const expected = Buffer.from(totpCode(secret, timeMs + d * 30_000));
    const got = Buffer.from(code);
    return expected.length === got.length && timingSafeEqual(expected, got);
  });
}

export const totpUri = (secret: string, account: string, issuer = 'D-R-A RPG'): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
