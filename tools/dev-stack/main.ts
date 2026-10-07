/**
 * Local "whole backend" without Docker: API server + game server in one
 * process sharing one PGlite database (PGlite is single-process).
 *
 *   pnpm dev:stack           # API :3000, game server :2567, data in .data/pglite
 *   pnpm dev  →  http://localhost:5173/?online
 *
 * With DATABASE_URL set it uses Postgres instead (same as production).
 */
import { fileURLToPath } from "node:url";
import { buildApi } from "@rpg/api-server";
import { TokenService } from "@rpg/auth";
import { loadContentFromDir } from "@rpg/game-data/node";
import { startGameServer } from "@rpg/game-server";
import { loadConfig } from "@rpg/game-server/config";
import { GameRepository, openDatabase } from "@rpg/persistence";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const env = {
  AUTH_SECRET: "dev-only-secret-change-me-dev-only-secret",
  ALLOW_DEV_LOGIN: "true",
  ...process.env,
};
const config = loadConfig(env);
if (config.NODE_ENV === "production")
  throw new Error("dev-stack is for local development only");

const database = await openDatabase(
  config.DATABASE_URL
    ? { url: config.DATABASE_URL }
    : { dataDir: config.PGLITE_DIR },
);
const game = await startGameServer(config, { database });
const api = await buildApi({
  repo: new GameRepository(database.db),
  tokens: new TokenService(config.AUTH_SECRET),
  content: loadContentFromDir(`${repoRoot}game-data`),
  gameServerUrl: `ws://localhost:${game.port}`,
  // Dev only: any localhost port (Vite picks the next free one).
  corsOrigins: [
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    ...(process.env.CORS_EXTRA?.split(",") ?? []),
  ],
  logLevel: config.LOG_LEVEL,
});
const apiPort = Number(process.env.API_PORT ?? 3000);
await api.listen({ port: apiPort, host: config.HOST });
console.log(
  `dev-stack: API http://localhost:${apiPort} · game ws://localhost:${game.port} · db ${database.kind}`,
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void Promise.all([api.close(), game.close()])
      .then(() => database.close())
      .finally(() => process.exit(0));
  });
}
