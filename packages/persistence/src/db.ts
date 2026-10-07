import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface OpenDatabaseOptions {
  /** postgres://… — production and staging. */
  url?: string;
  /** PGlite data directory for local dev without Docker; omit for in-memory (tests). */
  dataDir?: string;
}

export interface Database {
  db: Db;
  kind: "postgres" | "pglite";
  close(): Promise<void>;
}

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Opens the database and applies pending drizzle-kit migrations. */
export async function openDatabase(
  opts: OpenDatabaseOptions = {},
): Promise<Database> {
  if (opts.url) {
    const client = postgres(opts.url, { max: 10, onnotice: () => {} });
    const db = drizzlePostgres(client, { schema });
    await migratePostgres(db, { migrationsFolder });
    return {
      db: db as unknown as Db,
      kind: "postgres",
      close: () => client.end(),
    };
  }
  const client = new PGlite(opts.dataDir);
  const db = drizzlePglite({ client, schema });
  await migratePglite(db, { migrationsFolder });
  return {
    db: db as unknown as Db,
    kind: "pglite",
    close: () => client.close(),
  };
}
