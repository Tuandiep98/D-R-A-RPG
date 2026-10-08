import { createServer } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { TokenService } from '@rpg/auth';
import type { NavQuery } from '@rpg/game-core';
import { loadContentFromDir, readBakedNav } from '@rpg/game-data/node';
import { createNavQuery, initNavigation } from '@rpg/navigation';
import { type Database, GameRepository, openDatabase } from '@rpg/persistence';
import pino from 'pino';
import type { Config } from './config';
import { ZoneRoom } from './zone-room';

export interface RunningGameServer {
  port: number;
  close(): Promise<void>;
}

/** Builds and starts the game server. Used by main.ts and the integration tests. */
/**
 * `database` lets a dev runner share one PGlite instance with the API server
 * (PGlite cannot be opened by two processes).
 */
export async function startGameServer(
  config: Config,
  shared?: { database: Database },
): Promise<RunningGameServer> {
  const log = pino({ level: config.LOG_LEVEL, base: { svc: 'game-server' } });
  const content = loadContentFromDir(config.CONTENT_DIR);
  await initNavigation();
  const navs = new Map<string, NavQuery>();
  for (const map of content.maps.values()) {
    navs.set(map.id, createNavQuery(map, readBakedNav(config.CONTENT_DIR, map.id)));
  }

  const database =
    shared?.database ??
    (await openDatabase(
      config.DATABASE_URL
        ? { url: config.DATABASE_URL }
        : {
            dataDir: config.PGLITE_DIR === 'memory' ? undefined : config.PGLITE_DIR,
          },
    ));
  ZoneRoom.deps = {
    combatContent: config.COMBAT_CONTENT,
    combatRuleset: config.COMBAT_RULESET,
    content,
    repo: new GameRepository(database.db),
    tokens: new TokenService(config.AUTH_SECRET),
    navFor: (mapId) => navs.get(mapId) ?? null,
    log,
    allowDevLogin: config.ALLOW_DEV_LOGIN,
    autosaveSeconds: config.AUTOSAVE_SECONDS,
    online: new Map(),
    takeover: new Map(),
    maxClientsPerChannel: config.MAX_CLIENTS_PER_CHANNEL,
  };

  const http = createServer();
  // Only /health is ours; every other route belongs to Colyseus' matchmaker.
  http.prependListener('request', (req, res) => {
    if (req.url !== '/health') return;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        db: database.kind,
        maps: [...content.maps.keys()],
      }),
    );
  });
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: http }),
    gracefullyShutdown: false,
  });
  // One room per map; a full room opens another channel (tech plan §29).
  gameServer.define('zone', ZoneRoom).filterBy(['mapId', 'instanceKey']);

  await gameServer.listen(config.PORT, config.HOST);
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : config.PORT;
  log.info({ port, db: database.kind, maps: content.maps.size }, 'game server listening');

  return {
    port,
    async close() {
      // Rooms save on dispose; cap the wait so pending reconnection windows can't block shutdown.
      await Promise.race([
        gameServer.gracefullyShutdown(false),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
      http.closeAllConnections();
      await new Promise((resolve) => http.close(() => resolve(undefined)));
      if (!shared) await database.close();
    },
  };
}
