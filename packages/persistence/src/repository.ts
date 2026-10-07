import type { LedgerEntry, PlayerSave } from "@rpg/game-core";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Db } from "./db";
import {
  accounts,
  auditLog,
  characters,
  currencyTransactions,
  friendships,
  guildMembers,
  guilds,
  itemInstances,
  refreshTokens,
  wallets,
} from "./schema";

export type Role = "player" | "gm" | "admin";

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
  /** Realm id (game-data/realms). */
  realm: string;
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
    role: Role = "player",
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
    const rows = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);
    return (rows[0] as AccountRow | undefined) ?? null;
  }

  async setRole(accountId: string, role: Role): Promise<void> {
    await this.db
      .update(accounts)
      .set({ role })
      .where(eq(accounts.id, accountId));
  }

  async setTotpSecret(accountId: string, secret: string | null): Promise<void> {
    await this.db
      .update(accounts)
      .set({ totpSecret: secret })
      .where(eq(accounts.id, accountId));
  }

  async setSanction(
    accountId: string,
    kind: "ban" | "mute",
    until: Date | null,
  ): Promise<void> {
    await this.db
      .update(accounts)
      .set(kind === "ban" ? { bannedUntil: until } : { mutedUntil: until })
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
      .where(
        and(
          eq(refreshTokens.familyId, familyId),
          isNull(refreshTokens.revokedAt),
        ),
      );
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
        realm: characters.realm,
        mapId: characters.mapId,
      })
      .from(characters)
      .where(eq(characters.accountId, accountId))
      .orderBy(characters.createdAt);
  }

  async searchCharacters(
    query: string,
    limit = 20,
  ): Promise<CharacterSummary[]> {
    return this.db
      .select({
        id: characters.id,
        accountId: characters.accountId,
        name: characters.name,
        characterDefId: characters.characterDefId,
        realm: characters.realm,
        mapId: characters.mapId,
      })
      .from(characters)
      .where(ilike(characters.name, `%${query.replace(/[%_]/g, "")}%`))
      .limit(limit);
  }

  /** Returns null for unknown ids. A character with no items yet has an empty inventory (starter kit applies). */
  async loadCharacter(id: string): Promise<StoredCharacter | null> {
    const rows = await this.db
      .select()
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1);
    const c = rows[0];
    if (!c) return null;
    const items = await this.db
      .select()
      .from(itemInstances)
      .where(eq(itemInstances.characterId, id));
    const wallet = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.characterId, id))
      .limit(1);
    const equipment: PlayerSave["equipment"] = {};
    for (const i of items)
      if (i.equippedSlot)
        equipment[i.equippedSlot as keyof PlayerSave["equipment"]] = i.id;
    return {
      id: c.id,
      accountId: c.accountId,
      name: c.name,
      characterDefId: c.characterDefId,
      realm: c.realm,
      mapId: c.mapId,
      x: c.x,
      z: c.z,
      version: c.version,
      save: {
        characterId: c.characterDefId,
        realm: c.realm,
        nodes: (c.nodes as string[]) ?? [],
        gold: wallet[0]?.gold ?? 0,
        hp: c.hp,
        mp: c.mp,
        inventory: items.map((i) => ({
          instanceId: i.id,
          itemId: i.itemId,
          count: i.count,
          ...(i.enhance > 0 ? { enhance: i.enhance } : {}),
        })),
        equipment,
        quests: (c.questLog as PlayerSave["quests"]) ?? [],
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
          realm: save.realm,
          realmRank: save.realmRank ?? 0,
          nodes: save.nodes,
          hp: save.hp,
          mp: save.mp,
          mapId: place.mapId,
          questLog: save.quests ?? [],
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
            enhance: i.enhance ?? 0,
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
          action: "ledger_mismatch",
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

  /**
   * Top characters by realm, then by how much they have cultivated inside it
   * (no character level — master plan §31). Cache in Redis when traffic needs it.
   */
  async leaderboard(limit = 20) {
    const nodeCount = sql<number>`jsonb_array_length(${characters.nodes})`;
    return this.db
      .select({
        name: characters.name,
        realm: characters.realm,
        nodes: nodeCount,
      })
      .from(characters)
      .orderBy(
        desc(characters.realmRank),
        desc(nodeCount),
        characters.createdAt,
      )
      .limit(limit);
  }

  // ---- Social: friends and guilds -----------------------------------------

  async findCharacterByName(name: string): Promise<CharacterSummary | null> {
    const rows = await this.db
      .select({
        id: characters.id,
        accountId: characters.accountId,
        name: characters.name,
        characterDefId: characters.characterDefId,
        realm: characters.realm,
        mapId: characters.mapId,
      })
      .from(characters)
      .where(sql`lower(${characters.name}) = lower(${name})`)
      .limit(1);
    return rows[0] ?? null;
  }

  /** Sends a request, or accepts it if the other side already asked. */
  async requestFriend(
    fromId: string,
    toId: string,
  ): Promise<"pending" | "accepted"> {
    if (fromId === toId) throw new Error("cannot befriend yourself");
    return this.db.transaction(async (tx) => {
      const reverse = await tx
        .select()
        .from(friendships)
        .where(
          and(
            eq(friendships.requesterId, toId),
            eq(friendships.targetId, fromId),
          ),
        )
        .limit(1);
      if (reverse[0]) {
        await tx
          .update(friendships)
          .set({ status: "accepted" })
          .where(
            and(
              eq(friendships.requesterId, toId),
              eq(friendships.targetId, fromId),
            ),
          );
        return "accepted" as const;
      }
      await tx
        .insert(friendships)
        .values({ requesterId: fromId, targetId: toId })
        .onConflictDoNothing();
      return "pending" as const;
    });
  }

  async acceptFriend(
    characterId: string,
    requesterId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .update(friendships)
      .set({ status: "accepted" })
      .where(
        and(
          eq(friendships.requesterId, requesterId),
          eq(friendships.targetId, characterId),
        ),
      )
      .returning({ r: friendships.requesterId });
    return rows.length > 0;
  }

  async removeFriend(characterId: string, otherId: string): Promise<void> {
    await this.db
      .delete(friendships)
      .where(
        or(
          and(
            eq(friendships.requesterId, characterId),
            eq(friendships.targetId, otherId),
          ),
          and(
            eq(friendships.requesterId, otherId),
            eq(friendships.targetId, characterId),
          ),
        ),
      );
  }

  async socialOf(characterId: string) {
    const rows = await this.db
      .select()
      .from(friendships)
      .where(
        or(
          eq(friendships.requesterId, characterId),
          eq(friendships.targetId, characterId),
        ),
      );
    const otherIds = rows.map((r) =>
      r.requesterId === characterId ? r.targetId : r.requesterId,
    );
    const others = otherIds.length
      ? await this.db
          .select({
            id: characters.id,
            name: characters.name,
            realm: characters.realm,
          })
          .from(characters)
          .where(inArray(characters.id, otherIds))
      : [];
    const byId = new Map(others.map((o) => [o.id, o]));
    const friends = rows.flatMap((r) => {
      const other = byId.get(
        r.requesterId === characterId ? r.targetId : r.requesterId,
      );
      if (!other) return [];
      const direction =
        r.status === "accepted"
          ? "friend"
          : r.requesterId === characterId
            ? "outgoing"
            : "incoming";
      return [
        { ...other, status: direction as "friend" | "outgoing" | "incoming" },
      ];
    });

    const membership = await this.db
      .select()
      .from(guildMembers)
      .where(eq(guildMembers.characterId, characterId))
      .limit(1);
    let guild: {
      id: string;
      name: string;
      leaderId: string;
      members: { id: string; name: string; realm: string; rank: string }[];
    } | null = null;
    if (membership[0]) {
      const g = await this.db
        .select()
        .from(guilds)
        .where(eq(guilds.id, membership[0].guildId))
        .limit(1);
      const members = await this.db
        .select({
          id: characters.id,
          name: characters.name,
          realm: characters.realm,
          rank: guildMembers.rank,
        })
        .from(guildMembers)
        .innerJoin(characters, eq(characters.id, guildMembers.characterId))
        .where(eq(guildMembers.guildId, membership[0].guildId));
      if (g[0])
        guild = {
          id: g[0].id,
          name: g[0].name,
          leaderId: g[0].leaderId,
          members,
        };
    }
    return { friends, guild };
  }

  async createGuild(characterId: string, name: string): Promise<string> {
    const id = newId();
    await this.db.transaction(async (tx) => {
      const already = await tx
        .select()
        .from(guildMembers)
        .where(eq(guildMembers.characterId, characterId))
        .limit(1);
      if (already[0]) throw new Error("already in a guild");
      await tx.insert(guilds).values({ id, name, leaderId: characterId });
      await tx
        .insert(guildMembers)
        .values({ characterId, guildId: id, rank: "leader" });
    });
    return id;
  }

  async joinGuild(characterId: string, guildName: string): Promise<string> {
    return this.db.transaction(async (tx) => {
      const g = await tx
        .select()
        .from(guilds)
        .where(sql`lower(${guilds.name}) = lower(${guildName})`)
        .limit(1);
      if (!g[0]) throw new Error("guild not found");
      const already = await tx
        .select()
        .from(guildMembers)
        .where(eq(guildMembers.characterId, characterId))
        .limit(1);
      if (already[0]) throw new Error("already in a guild");
      const count = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(guildMembers)
        .where(eq(guildMembers.guildId, g[0].id));
      if ((count[0]?.n ?? 0) >= 50) throw new Error("guild is full");
      await tx.insert(guildMembers).values({ characterId, guildId: g[0].id });
      return g[0].id;
    });
  }

  /** Leaving as leader hands leadership to the longest-standing member, or disbands. */
  async leaveGuild(characterId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const m = await tx
        .select()
        .from(guildMembers)
        .where(eq(guildMembers.characterId, characterId))
        .limit(1);
      if (!m[0]) return;
      await tx
        .delete(guildMembers)
        .where(eq(guildMembers.characterId, characterId));
      if (m[0].rank !== "leader") return;
      const next = await tx
        .select()
        .from(guildMembers)
        .where(eq(guildMembers.guildId, m[0].guildId))
        .orderBy(guildMembers.joinedAt)
        .limit(1);
      if (next[0]) {
        await tx
          .update(guildMembers)
          .set({ rank: "leader" })
          .where(eq(guildMembers.characterId, next[0].characterId));
        await tx
          .update(guilds)
          .set({ leaderId: next[0].characterId })
          .where(eq(guilds.id, m[0].guildId));
      } else {
        await tx.delete(guilds).where(eq(guilds.id, m[0].guildId));
      }
    });
  }

  // ---- Audit -------------------------------------------------------------

  async audit(
    actorAccountId: string | null,
    action: string,
    target: string | null,
    payload?: unknown,
  ): Promise<void> {
    await this.db.insert(auditLog).values({
      id: newId(),
      actorAccountId,
      action,
      target,
      payload: payload ?? null,
    });
  }

  async listAudit(limit = 100) {
    return this.db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
  }
}
