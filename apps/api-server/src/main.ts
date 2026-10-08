import { fileURLToPath } from 'node:url';
import { TokenService } from '@rpg/auth';
import { loadContentFromDir } from '@rpg/game-data/node';
import { GameRepository, openDatabase } from '@rpg/persistence';
import { z } from 'zod';
import { buildApi } from './app';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

const env = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().nonnegative().default(3000),
    HOST: z.string().default('0.0.0.0'),
    AUTH_SECRET: z.string().min(32),
    DATABASE_URL: z.string().url().optional(),
    PGLITE_DIR: z.string().default(`${repoRoot}.data/pglite`),
    CONTENT_DIR: z.string().default(`${repoRoot}game-data`),
    GAME_SERVER_URL: z.string().default('ws://localhost:2567'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173,https://localhost:5173,http://localhost:5190'),
    LOG_LEVEL: z.string().default('info'),
  })
  .parse(process.env);

const database = await openDatabase(
  env.DATABASE_URL ? { url: env.DATABASE_URL } : { dataDir: env.PGLITE_DIR },
);
const app = await buildApi({
  repo: new GameRepository(database.db),
  tokens: new TokenService(env.AUTH_SECRET),
  content: loadContentFromDir(env.CONTENT_DIR),
  gameServerUrl: env.GAME_SERVER_URL,
  corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
  logLevel: env.LOG_LEVEL,
});
await app.listen({ port: env.PORT, host: env.HOST });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app
      .close()
      .then(() => database.close())
      .finally(() => process.exit(0));
  });
}
