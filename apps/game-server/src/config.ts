import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/** Environment is validated once at boot (tech plan §54: config via Zod). */
export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().nonnegative().default(2567),
  HOST: z.string().default('0.0.0.0'),
  AUTH_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url().optional(),
  /** Enables Colyseus RedisPresence + RedisDriver so several game-server processes share matchmaking. */
  REDIS_URL: z.string().url().optional(),
  /** PGlite directory when DATABASE_URL is not set (local dev without Docker). */
  PGLITE_DIR: z.string().default(`${repoRoot}.data/pglite`),
  CONTENT_DIR: z.string().default(`${repoRoot}game-data`),
  /** Accept `dev:<name>` tokens that auto-create an account (never in production). */
  ALLOW_DEV_LOGIN: bool.default(false),
  MAX_CLIENTS_PER_CHANNEL: z.coerce.number().int().positive().default(50),
  AUTOSAVE_SECONDS: z.coerce.number().positive().default(60),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});
export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = ConfigSchema.parse(env);
  if (config.NODE_ENV === 'production' && config.ALLOW_DEV_LOGIN) {
    throw new Error('ALLOW_DEV_LOGIN must be false in production');
  }
  return config;
}
