import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Persistent game data (tech plan §32). IDs are UUIDv7 (decision D-009).
 * Gold lives in `wallets` and every change is recorded in
 * `currency_transactions` within the same DB transaction (tech plan §33, §55).
 */

export const roleEnum = pgEnum('role', ['player', 'gm', 'admin']);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull().default('player'),
    /** Base32 TOTP secret; required before GM/admin routes can be used. */
    totpSecret: text('totp_secret'),
    bannedUntil: timestamp('banned_until', { withTimezone: true }),
    mutedUntil: timestamp('muted_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('accounts_username_uq').on(sql`lower(${t.username})`)],
);

/** Refresh tokens are stored hashed and rotated on every use (tech plan §55.1). */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    /** Rotation chain: reuse of a rotated token revokes the whole family. */
    familyId: uuid('family_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_uq').on(t.tokenHash),
    index('refresh_tokens_family_idx').on(t.familyId),
  ],
);

export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Content definition (game-data/characters). */
    characterDefId: text('character_def_id').notNull(),
    level: integer('level').notNull().default(1),
    xp: integer('xp').notNull().default(0),
    hp: integer('hp').notNull().default(0),
    mp: integer('mp').notNull().default(0),
    mapId: text('map_id').notNull(),
    /** Quest log (QuestState[]); small and always loaded with the character. */
    questLog: jsonb('quest_log').notNull().default([]),
    x: real('x'),
    z: real('z'),
    /** Optimistic concurrency: bumped on every save. */
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('characters_name_uq').on(sql`lower(${t.name})`),
    index('characters_account_idx').on(t.accountId),
  ],
);

/** One row per item instance (tech plan §32 ItemInstance); equipped items carry a slot. */
export const itemInstances = pgTable(
  'item_instances',
  {
    id: text('id').primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    count: integer('count').notNull(),
    equippedSlot: text('equipped_slot'),
    /** Enhancement level (+N). */
    enhance: integer('enhance').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('item_instances_character_idx').on(t.characterId),
    check('item_instances_count_positive', sql`${t.count} > 0`),
  ],
);

export const wallets = pgTable(
  'wallets',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    gold: bigint('gold', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('wallets_gold_non_negative', sql`${t.gold} >= 0`)],
);

/** Audited currency ledger; the idempotency key makes retries safe. */
export const currencyTransactions = pgTable(
  'currency_transactions',
  {
    id: uuid('id').primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    mapId: text('map_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('currency_transactions_key_uq').on(t.idempotencyKey),
    index('currency_transactions_character_idx').on(t.characterId, t.createdAt),
  ],
);

/** Every admin/GM action (tech plan §55.1 item 8). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    actorAccountId: uuid('actor_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    target: text('target'),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
);

/** Friend requests and friendships between characters (tech plan §32 Friend). */
export const friendStatusEnum = pgEnum('friend_status', ['pending', 'accepted']);
export const friendships = pgTable(
  'friendships',
  {
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    status: friendStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.requesterId, t.targetId] }),
    index('friendships_target_idx').on(t.targetId),
    check('friendships_not_self', sql`${t.requesterId} <> ${t.targetId}`),
  ],
);

/** Guilds (tech plan §32 Guild). One guild per character. */
export const guilds = pgTable(
  'guilds',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    leaderId: uuid('leader_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('guilds_name_uq').on(sql`lower(${t.name})`)],
);

export const guildRankEnum = pgEnum('guild_rank', ['leader', 'officer', 'member']);
export const guildMembers = pgTable(
  'guild_members',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    rank: guildRankEnum('rank').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guild_members_guild_idx').on(t.guildId)],
);
