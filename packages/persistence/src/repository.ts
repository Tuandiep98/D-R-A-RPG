import type { LedgerEntry, PlayerSave } from '@rpg/game-core';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Db } from './db';
import {
  accounts,
  auditLog,
  characters,
  currencyTransactions,
  itemInstances,
  refreshTokens,
  wallets,
} from './schema';

export type Role = 'player' | 'gm' | 'admin';

export interface AccountRow {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  totpSecret: string | null;
  bannedUntil: Date | null;
  mutedUntil: Date | null;
}

export interface CharacterSummary {
  id: string;
  accountId: string;
  name: string;
  characterDefId: string;
  level: number;
  mapId: string;
}

export interface StoredCharacter extends CharacterSummary {
  save: PlayerSave;
  x: number | null;
  z: number | null;
  version: number;
}

export interface SaveResult {
  version: number;
  /** Wallet did not match previous balance + ledger: written to the audit log. */
  anomaly: boolean;
}

export const newId = (): string => uuidv7();

/**
 * All persistence used by the API and game servers. Every multi-row change
 * runs in one transaction so inventory, wallet and ledger never diverge.
 */
export class GameRepository {
  constructor(private readonly db: Db) {}

  // ---- Accounts -----------------------------------------------------------

  async createAccount(
    username: string,
    passwordHash: string,
    role: Role = 'player',
  ): Promise<string> {
    const id = newId();
    await this.db.insert(accounts).values({ id, username, passwordHash, role });
    return id;
  }

  async findAccountByUsername(username: string): Promise<AccountRow | null> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(sql`lower(${accounts.username}) = lower(${username})`)
      .limit(1);
    return (rows[0] as AccountRow | undefined) ?? null;
  }

  async getAccount(id: string): Promise<AccountRow | null> {
    const rows = await this.db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
    return (rows[0] as AccountRow | undefined) ?? null;
  }

  async setRole(accountId: string, role: Role): Promise<void> {
    await this.db.update(accounts).set({ role }).where(eq(accounts.id, accountId));
  }

  async setTotpSecret(accountId: string, secret: string | null): Promise<void> {
    await this.db.update(accounts).set({ totpSecret: secret }).where(eq(accounts.id, accountId));
  }

  async setSanction(accountId: string, kind: 'ban' | 'mute', until: Date | null): Promise<void> {
    await this.db
      .update(accounts)
      .set(kind === 'ban' ? { bannedUntil: until } : { mutedUntil: until })
      .where(eq(accounts.id, accountId));
  }

  // ---- Refresh tokens (stored hashed, rotated) ---------------------------

  async insertRefreshToken(row: {
    accountId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
  }): Promise<string> {
    const id = newId();
    await this.db.insert(refreshTokens).values({ id, ...row });
    return id;
  }

  async findRefreshToken(tokenHash: string) {
    const rows = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return rows[0] ?? null;
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)));
  }

  async revokeTokenFamily(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  // ---- Characters --------------------------------------------------------

  async createCharacter(input: {
    accountId: string;
    name: string;
    characterDefId: string;
    mapId: string;
  }): Promise<string> {
    const id = newId();
    await this.db.transaction(async (tx) => {
      await tx.insert(characters).values({ id, ...input });
      await tx.insert(wallets).values({ characterId: id, gold: 0 });
    });
    return id;
  }

  async listCharacters(accountId: string): Promise<CharacterSummary[]> {
    return this.db
      .select({
        id: characters.id,
        accountId: characters.accountId,
        name: characters.name,
        characterDefId: characters.characterDefId,
        level: characters.level,
        mapId: characters.mapId,
      })
      .from(characters)
      .where(eq(characters.accountId, accountId))
      .orderBy(characters.createdAt);
  }

  async searchCharacters(query: string, limit = 20): Promise<CharacterSummary[]> {
    return this.db
      .select({
        id: characters.id,
        accountId: characters.accountId,
        name: characters.name,
        characterDefId: characters.characterDefId,
        level: characters.level,
        mapId: characters.mapId,
      })
      .from(characters)
      .where(ilike(characters.name, `%${query.replace(/[%_]/g, '')}%`))
      .limit(limit);
  }

  /** Returns null for unknown ids. A character with no items yet has an empty inventory (starter kit applies). */
  async loadCharacter(id: string): Promise<StoredCharacter | null> {
    const rows = await this.db.select().from(characters).where(eq(characters.id, id)).limit(1);
    const c = rows[0];
    if (!c) return null;
    const items = await this.db
      .select()
      .from(itemInstances)
      .where(eq(itemInstances.characterId, id));
    const wallet = await this.db.select().from(wallets).where(eq(wallets.characterId, id)).limit(1);
    const equipment: PlayerSave['equipment'] = {};
    for (const i of items)
      if (i.equippedSlot) equipment[i.equippedSlot as keyof PlayerSave['equipment']] = i.id;
    return {
      id: c.id,
      accountId: c.accountId,
      name: c.name,
      characterDefId: c.characterDefId,
      level: c.level,
      mapId: c.mapId,
      x: c.x,
      z: c.z,
      version: c.version,
      save: {
        characterId: c.characterDefId,
        level: c.level,
        xp: c.xp,
        gold: wallet[0]?.gold ?? 0,
        hp: c.hp,
        mp: c.mp,
        inventory: items.map((i) => ({ instanceId: i.id, itemId: i.itemId, count: i.count })),
        equipment,
      },
    };
  }

  /** True if the character has ever been saved by a game server (vs. freshly created). */
  async hasBeenPlayed(id: string): Promise<boolean> {
    const rows = await this.db
      .select({ v: characters.version })
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1);
    return (rows[0]?.v ?? 0) > 0;
  }

  /**
   * Persists a character snapshot together with the currency changes that led
   * to it. Ledger keys are idempotent, so a retried save never double-counts.
   */
  async saveCharacter(
    id: string,
    save: PlayerSave,
    place: { mapId: string; x: number | null; z: number | null },
    ledger: readonly LedgerEntry[] = [],
  ): Promise<SaveResult> {
    return this.db.transaction(async (tx) => {
      const prevWallet = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.characterId, id))
        .limit(1);
      const prevGold = prevWallet[0]?.gold ?? 0;

      let applied = 0;
      for (const entry of ledger) {
        const inserted = await tx
          .insert(currencyTransactions)
          .values({
            id: newId(),
            characterId: id,
            amount: entry.amount,
            balanceAfter: entry.balanceAfter,
            reason: entry.reason,
            idempotencyKey: `${id}:${entry.key}`,
            mapId: place.mapId,
          })
          .onConflictDoNothing({ target: currencyTransactions.idempotencyKey })
          .returning({ id: currencyTransactions.id });
        if (inserted.length > 0) applied += entry.amount;
      }
      const anomaly = prevGold + applied !== save.gold;

      const updated = await tx
        .update(characters)
        .set({
          level: save.level,
          xp: save.xp,
          hp: save.hp,
          mp: save.mp,
          mapId: place.mapId,
          x: place.x,
          z: place.z,
          version: sql`${characters.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(characters.id, id))
        .returning({ version: characters.version });
      if (updated.length === 0) throw new Error(`character ${id} not found`);

      const equippedBy = new Map(
        Object.entries(save.equipment).map(([slot, inst]) => [inst, slot]),
      );
      await tx.delete(itemInstances).where(eq(itemInstances.characterId, id));
      if (save.inventory.length > 0) {
        await tx.insert(itemInstances).values(
          save.inventory.map((i) => ({
            id: i.instanceId,
            characterId: id,
            itemId: i.itemId,
            count: i.count,
            equippedSlot: equippedBy.get(i.instanceId) ?? null,
          })),
        );
      }
      await tx
        .insert(wallets)
        .values({ characterId: id, gold: save.gold })
        .onConflictDoUpdate({
          target: wallets.characterId,
          set: { gold: save.gold, updatedAt: new Date() },
        });

      if (anomaly) {
        await tx.insert(auditLog).values({
          id: newId(),
          action: 'ledger_mismatch',
          target: id,
          payload: { prevGold, applied, saved: save.gold },
        });
      }
      return { version: updated[0]?.version ?? 0, anomaly };
    });
  }

  async ledgerFor(characterId: string, limit = 50) {
    return this.db
      .select()
      .from(currencyTransactions)
      .where(eq(currencyTransactions.characterId, characterId))
      .orderBy(desc(currencyTransactions.createdAt))
      .limit(limit);
  }

  // ---- Audit -------------------------------------------------------------

  async audit(
    actorAccountId: string | null,
    action: string,
    target: string | null,
    payload?: unknown,
  ): Promise<void> {
    await this.db
      .insert(auditLog)
      .values({ id: newId(), actorAccountId, action, target, payload: payload ?? null });
  }

  async listAudit(limit = 100) {
    return this.db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
  }
}
