import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  hashRefreshToken,
  newRefreshToken,
  newTotpSecret,
  TokenService,
  totpCode,
  verifyPassword,
  verifyTotp,
} from './index';

const svc = new TokenService('x'.repeat(40));

describe('auth', () => {
  it('signs and verifies access tokens; rejects tampering and wrong keys', async () => {
    const token = await svc.signAccess({ sub: 'acc-1', role: 'player', chr: 'chr-1' });
    expect(await svc.verifyAccess(token)).toMatchObject({
      sub: 'acc-1',
      chr: 'chr-1',
      typ: 'access',
    });
    await expect(new TokenService('y'.repeat(40)).verifyAccess(token)).rejects.toThrow();
    await expect(svc.verifyAccess(`${token}x`)).rejects.toThrow();
  });

  it('does not accept a ticket as an access token', async () => {
    const ticket = await svc.signTicket({ sub: 'chr-1', map: 'm', arr: null });
    await expect(svc.verifyAccess(ticket)).rejects.toThrow();
    expect(await svc.verifyTicket(ticket)).toMatchObject({ sub: 'chr-1', map: 'm' });
  });

  it('hashes passwords with argon2id and refresh tokens with sha256', async () => {
    const h = await hashPassword('correct horse');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'correct horse')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
    const { token, hash } = newRefreshToken();
    expect(hashRefreshToken(token)).toBe(hash);
    expect(token).not.toBe(hash);
  });

  it('TOTP matches the RFC 6238 test vector and tolerates one step of drift', () => {
    // RFC 6238 SHA-1 vector: secret "12345678901234567890", T = 59 s → 94287082 (8 digits) → 287082.
    const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(totpCode(rfcSecret, 59_000)).toBe('287082');
    const secret = newTotpSecret();
    const now = Date.now();
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 120_000), now)).toBe(false);
    expect(verifyTotp(secret, 'abcdef', now)).toBe(false);
  });

  it('refuses weak secrets', () => {
    expect(() => new TokenService('short')).toThrow();
  });
});
