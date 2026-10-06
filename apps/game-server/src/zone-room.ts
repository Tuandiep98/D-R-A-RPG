import { type AuthContext, type Client, Room } from '@colyseus/core';
import { type AccessClaims, hashPassword, type TokenService } from '@rpg/auth';
import {
  type LedgerEntry,
  type NavQuery,
  SpatialGrid,
  TICK_MS,
  TICK_RATE,
  World,
} from '@rpg/game-core';
import type { ContentBundle } from '@rpg/game-data';
import {
  type ChatMessage,
  ChatSendSchema,
  type EntityId,
  type EntitySnapshot,
  IntentSchema,
  type JoinInfo,
  PROTOCOL_VERSION,
  type SimEvent,
} from '@rpg/game-protocol';
import { DeltaEncoder, JoinOptionsSchema } from '@rpg/game-protocol/net';
import type { GameRepository } from '@rpg/persistence';
import type { Logger } from 'pino';

/** Everything rooms share inside one server process. */
export interface ZoneDeps {
  content: ContentBundle;
  repo: GameRepository;
  tokens: TokenService;
  navFor(mapId: string): NavQuery | null;
  log: Logger;
  allowDevLogin: boolean;
  autosaveSeconds: number;
  /** characterId → roomId, so one character is never online twice (Redis presence when scaled). */
  online: Map<string, string>;
  /** characterId → takeover hook: kicks the live session and resolves once it has been saved. */
  takeover: Map<string, () => Promise<void>>;
  maxClientsPerChannel: number;
}

interface Auth {
  accountId: string;
  characterId: string;
  characterName: string;
  mutedUntil: number | null;
  arrival: string | null;
  /** Saved position when (re)joining the map the character was saved in. */
  position: { x: number; z: number } | null;
}

interface Session {
  auth: Auth;
  playerId: EntityId;
  encoder: DeltaEncoder;
  tokens: number;
  violations: number;
  ledger: LedgerEntry[];
  leaving: boolean;
  /** Kicked by the server (takeover, abuse): never offered a reconnection window. */
  kicked: boolean;
  /** Pending allowReconnection() while the socket is dropped. */
  reconnection: { reject(reason?: unknown): void } | null;
  lastChatAt: number;
  /** Resolves when onLeave has saved and removed the character. */
  left: Promise<void>;
  markLeft: () => void;
}

/** Token bucket: sustained intents per second and burst size (tech plan §55.1 item 4). */
const INTENTS_PER_SECOND = 15;
const KICK_AFTER_VIOLATIONS = 60;
const PLAYER_STATE_EVERY = 2;
const PRIVATE_EVENTS = new Set<SimEvent['type']>([
  'NOTICE',
  'ITEM_GAINED',
  'GOLD',
  'XP',
  'TRANSFER',
]);

/**
 * One channel of one map (tech plan §29–30). Authoritative World + AOI +
 * delta snapshots. Clients may only send intents.
 */
export class ZoneRoom extends Room {
  static deps: ZoneDeps;
  private world!: World;
  private mapId!: string;
  private readonly sessions = new Map<string, Session>();
  private readonly grid = new SpatialGrid({ cellSize: 30, radius: 60, maxEntities: 100 });
  private accumulator = 0;
  private lastStepAt = performance.now();

  private get deps(): ZoneDeps {
    return ZoneRoom.deps;
  }

  override onCreate(options: { mapId: string }): void {
    const parsed = JoinOptionsSchema.pick({ mapId: true }).parse(options);
    if (!this.deps.content.maps.has(parsed.mapId)) throw new Error(`unknown map ${parsed.mapId}`);
    this.mapId = parsed.mapId;
    // Set through the accessors: class fields would shadow Colyseus' getters/setters.
    this.maxClients = this.deps.maxClientsPerChannel;
    this.patchRate = null; // no Schema state; snapshots are sent as messages
    this.autoDispose = true;
    this.world = new World({
      content: this.deps.content,
      mapId: this.mapId,
      nav: this.deps.navFor(this.mapId),
      newItemInstanceId: () => crypto.randomUUID(),
    });
    this.setMetadata({ mapId: this.mapId });
    this.onMessage('intent', (client, message) => this.handleIntent(client, message));
    this.onMessage('chat', (client, message) => this.handleChat(client, message));
    this.lastStepAt = performance.now();
    this.setSimulationInterval(() => this.tick(), TICK_MS / 2);
    this.clock.setInterval(() => void this.saveAll('autosave'), this.deps.autosaveSeconds * 1000);
    this.deps.log.info({ roomId: this.roomId, mapId: this.mapId }, 'zone created');
  }

  override async onAuth(client: Client, options: unknown, context: AuthContext): Promise<Auth> {
    const opts = JoinOptionsSchema.parse(options);
    if (opts.protocolVersion !== PROTOCOL_VERSION)
      throw new Error('client out of date, please reload');
    if (opts.mapId !== this.mapId) throw new Error('wrong map');
    const soloMap = this.deps.content.maps.get(this.mapId)?.instance === 'solo';
    const token = context.token ?? '';
    const claims = await this.verifyToken(token);
    if (!claims.chr) throw new Error('no character selected');
    const account = await this.deps.repo.getAccount(claims.sub);
    if (!account) throw new Error('unknown account');
    if (account.bannedUntil && account.bannedUntil > new Date()) throw new Error('account banned');
    const stored = await this.deps.repo.loadCharacter(claims.chr);
    if (!stored || stored.accountId !== claims.sub) throw new Error('character not found');
    // Solo instances (dungeons) are keyed by character: nobody joins someone else's copy.
    if (soloMap ? opts.instanceKey !== claims.chr : opts.instanceKey !== undefined) {
      throw new Error('invalid instance');
    }

    let arrival: string | null = null;
    if (opts.ticket) {
      const ticket = await this.deps.tokens.verifyTicket(opts.ticket);
      if (ticket.sub !== claims.chr || ticket.map !== this.mapId) throw new Error('invalid ticket');
      arrival = ticket.arr;
    } else if (stored.mapId !== this.mapId) {
      // Joining another map without a portal ticket would be a free teleport.
      const solo = this.deps.content.maps.get(stored.mapId)?.instance === 'solo';
      throw new Error(`character is in ${stored.mapId}${solo ? `#${claims.chr}` : ''}`);
    }
    // A new login takes over: the old session is kicked and saved before we load (no dupes).
    // Reconnects of a dropped socket use allowReconnection(), not onAuth.
    if (this.deps.online.has(claims.chr)) {
      const takeover = this.deps.takeover.get(claims.chr);
      if (!takeover) throw new Error('character already online');
      await takeover();
    }
    const position =
      !arrival && stored.x !== null && stored.z !== null ? { x: stored.x, z: stored.z } : null;
    void client;
    return {
      accountId: claims.sub,
      characterId: claims.chr,
      characterName: stored.name,
      mutedUntil: account.mutedUntil ? account.mutedUntil.getTime() : null,
      arrival,
      position,
    };
  }

  override async onJoin(client: Client, _options: unknown, auth: Auth): Promise<void> {
    const stored = await this.deps.repo.loadCharacter(auth.characterId);
    if (!stored) throw new Error('character vanished');
    const played = await this.deps.repo.hasBeenPlayed(auth.characterId);
    const playerId = this.world.spawnPlayer(stored.characterDefId, {
      save: played ? stored.save : undefined,
      arrival: auth.arrival,
      position: auth.position,
      name: stored.name,
    });
    this.deps.online.set(auth.characterId, this.roomId);
    let markLeft = () => {};
    const left = new Promise<void>((resolve) => {
      markLeft = resolve;
    });
    const session: Session = {
      auth,
      playerId,
      encoder: new DeltaEncoder(),
      tokens: INTENTS_PER_SECOND,
      violations: 0,
      ledger: [],
      leaving: false,
      kicked: false,
      reconnection: null,
      lastChatAt: 0,
      left,
      markLeft,
    };
    this.sessions.set(client.sessionId, session);
    this.deps.takeover.set(auth.characterId, async () => {
      session.kicked = true;
      if (session.reconnection) session.reconnection.reject(new Error('logged in elsewhere'));
      else client.leave(4003, 'logged in elsewhere');
      await Promise.race([session.left, new Promise((r) => setTimeout(r, 5000))]);
    });
    const join: JoinInfo = {
      protocolVersion: PROTOCOL_VERSION,
      playerId,
      mapId: this.mapId,
      tickRate: TICK_RATE,
    };
    client.send('join', join);
    if (!played) await this.saveSession(client.sessionId, 'first_join');
    this.deps.log.info(
      { roomId: this.roomId, characterId: auth.characterId, playerId },
      'player joined',
    );
  }

  override async onDrop(client: Client): Promise<void> {
    // Brief disconnects keep the character in the world (tech plan §43: background reconnect).
    const s = this.sessions.get(client.sessionId);
    if (s?.kicked) return;
    try {
      const pending = this.allowReconnection(client, 15);
      if (s) s.reconnection = pending as unknown as Session['reconnection'];
      await pending;
    } catch {
      /* expired or taken over: falls through to onLeave */
    } finally {
      if (s) s.reconnection = null;
    }
  }

  override async onLeave(client: Client): Promise<void> {
    const s = this.sessions.get(client.sessionId);
    if (!s) return;
    if (!s.leaving) await this.saveSession(client.sessionId, 'leave');
    this.world.removeEntity(s.playerId);
    this.sessions.delete(client.sessionId);
    if (this.deps.online.get(s.auth.characterId) === this.roomId) {
      this.deps.online.delete(s.auth.characterId);
      this.deps.takeover.delete(s.auth.characterId);
    }
    s.markLeft();
    this.deps.log.info({ roomId: this.roomId, characterId: s.auth.characterId }, 'player left');
  }

  override async onDispose(): Promise<void> {
    await this.saveAll('dispose');
    this.deps.log.info({ roomId: this.roomId }, 'zone disposed');
  }

  // ---- Simulation -------------------------------------------------------

  /**
   * Fixed-step accumulator on our own clock: Colyseus' room clock is also ticked
   * by other timers, so its deltaTime under-reports the real elapsed time.
   */
  private tick(): void {
    const now = performance.now();
    this.accumulator += Math.min(now - this.lastStepAt, 250);
    this.lastStepAt = now;
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      this.stepOnce();
    }
  }

  private stepOnce(): void {
    for (const s of this.sessions.values()) {
      s.tokens = Math.min(INTENTS_PER_SECOND, s.tokens + INTENTS_PER_SECOND / TICK_RATE);
    }
    const events = this.world.step();
    const ledger = this.world.drainLedger();
    const byPlayer = new Map<EntityId, Session>();
    for (const s of this.sessions.values()) byPlayer.set(s.playerId, s);
    for (const entry of ledger) byPlayer.get(entry.entityId)?.ledger.push(entry);

    for (const ev of events) {
      if (ev.type !== 'TRANSFER') continue;
      const s = byPlayer.get(ev.id);
      const client = s && this.clientFor(s);
      if (s && client && !s.leaving) void this.transfer(client, s, ev.mapId, ev.arrival);
    }

    this.grid.rebuild([...this.world.entities.values()]);
    const snapshot = this.world.snapshot();
    const cache = new Map<EntityId, { snap: EntitySnapshot; json: string }>();
    for (const e of snapshot.entities) cache.set(e.id, { snap: e, json: JSON.stringify(e) });

    for (const client of this.clients) {
      const s = this.sessions.get(client.sessionId);
      if (!s || s.leaving) continue;
      const me = this.world.entities.get(s.playerId);
      if (!me) continue;
      const visibleIds = this.grid.query(me.pos.x, me.pos.z, [s.playerId]);
      const visible = new Map<EntityId, { snap: EntitySnapshot; json: string }>();
      for (const id of visibleIds) {
        const v = cache.get(id);
        if (v) visible.set(id, v);
      }
      const delta = s.encoder.encode(snapshot.tick, visible);
      client.send('snap', delta);
      const mine = events.filter((ev) => this.eventVisible(ev, s.playerId, visibleIds));
      if (mine.length > 0) client.send('events', mine);
      if (snapshot.tick % PLAYER_STATE_EVERY === 0) {
        const state = this.world.playerState(s.playerId);
        if (state) client.send('player', state);
      }
    }
  }

  private eventVisible(ev: SimEvent, playerId: EntityId, visible: ReadonlySet<EntityId>): boolean {
    if ('ownerId' in ev) return ev.ownerId === playerId;
    if (PRIVATE_EVENTS.has(ev.type)) return 'id' in ev && ev.id === playerId;
    const ids = [
      'id' in ev ? ev.id : undefined,
      'sourceId' in ev ? ev.sourceId : undefined,
      'targetId' in ev ? ev.targetId : undefined,
    ];
    return ids.some((id) => typeof id === 'number' && visible.has(id));
  }

  // ---- Input ------------------------------------------------------------

  private handleIntent(client: Client, message: unknown): void {
    const s = this.sessions.get(client.sessionId);
    if (!s || s.leaving) return;
    if (s.tokens < 1) {
      this.violation(client, s, 1);
      return;
    }
    s.tokens--;
    const parsed = IntentSchema.safeParse(message);
    if (!parsed.success) {
      this.violation(client, s, 5);
      return;
    }
    this.world.enqueueIntent(s.playerId, parsed.data);
  }

  /** Map chat (tech plan §55.2): length/rate limits, mutes from the DB, simple word filter. */
  private handleChat(client: Client, message: unknown): void {
    const s = this.sessions.get(client.sessionId);
    if (!s || s.leaving) return;
    const parsed = ChatSendSchema.safeParse(message);
    if (!parsed.success) {
      this.violation(client, s, 5);
      return;
    }
    const now = Date.now();
    if (now - s.lastChatAt < 1000) {
      this.violation(client, s, 2);
      return;
    }
    s.lastChatAt = now;
    if (s.auth.mutedUntil && s.auth.mutedUntil > now) {
      client.send('chat', {
        channel: 'system',
        fromId: null,
        fromName: 'Hệ thống',
        text: 'Bạn đang bị cấm chat.',
        at: now,
      } satisfies ChatMessage);
      return;
    }
    const msg: ChatMessage = {
      channel: 'map',
      fromId: s.playerId,
      fromName: s.auth.characterName,
      text: filterText(parsed.data.text),
      at: now,
    };
    this.broadcast('chat', msg);
  }

  private violation(client: Client, s: Session, weight: number): void {
    s.violations += weight;
    if (s.violations >= KICK_AFTER_VIOLATIONS) {
      this.deps.log.warn({ characterId: s.auth.characterId }, 'kicked for message abuse');
      s.kicked = true;
      client.leave(4002, 'too many invalid messages');
    }
  }

  // ---- Persistence and transfers ------------------------------------------

  private async transfer(
    client: Client,
    s: Session,
    mapId: string,
    arrival: string | null,
  ): Promise<void> {
    s.leaving = true;
    await this.saveSession(client.sessionId, 'transfer', mapId);
    const ticket = await this.deps.tokens.signTicket({
      sub: s.auth.characterId,
      map: mapId,
      arr: arrival,
    });
    const solo = this.deps.content.maps.get(mapId)?.instance === 'solo';
    client.send('transfer', {
      mapId,
      arrival,
      ticket,
      ...(solo ? { instanceKey: s.auth.characterId } : {}),
    });
    this.world.removeEntity(s.playerId);
    if (this.deps.online.get(s.auth.characterId) === this.roomId) {
      this.deps.online.delete(s.auth.characterId);
      this.deps.takeover.delete(s.auth.characterId);
    }
  }

  private async saveSession(sessionId: string, reason: string, nextMapId?: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    const save = this.world.exportPlayer(s.playerId);
    const e = this.world.entities.get(s.playerId);
    if (!save) return;
    const ledger = s.ledger;
    s.ledger = [];
    try {
      const res = await this.deps.repo.saveCharacter(
        s.auth.characterId,
        save,
        nextMapId
          ? { mapId: nextMapId, x: null, z: null }
          : { mapId: this.mapId, x: e?.pos.x ?? null, z: e?.pos.z ?? null },
        ledger,
      );
      if (res.anomaly)
        this.deps.log.warn({ characterId: s.auth.characterId }, 'ledger mismatch on save');
    } catch (err) {
      s.ledger = [...ledger, ...s.ledger]; // keep for the next attempt; keys make retries safe
      this.deps.log.error({ err, characterId: s.auth.characterId, reason }, 'save failed');
    }
  }

  private async saveAll(reason: string): Promise<void> {
    await Promise.all(
      [...this.sessions.entries()]
        .filter(([, s]) => !s.leaving)
        .map(([id]) => this.saveSession(id, reason)),
    );
  }

  private clientFor(s: Session): Client | undefined {
    for (const c of this.clients) if (this.sessions.get(c.sessionId) === s) return c;
    return undefined;
  }

  private async verifyToken(token: string): Promise<AccessClaims> {
    if (this.deps.allowDevLogin && token.startsWith('dev:'))
      return devLogin(this.deps, token.slice(4));
    return this.deps.tokens.verifyAccess(token);
  }
}

/** Dev only: `dev:<name>` creates (once) an account + character so the client can play without the API. */
async function devLogin(deps: ZoneDeps, rawName: string): Promise<AccessClaims> {
  const name = rawName.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'dev';
  const username = `dev_${name}`;
  let account = await deps.repo.findAccountByUsername(username);
  if (!account) {
    await deps.repo.createAccount(username, await hashPassword(crypto.randomUUID()));
    account = await deps.repo.findAccountByUsername(username);
  }
  if (!account) throw new Error('dev login failed');
  let [character] = await deps.repo.listCharacters(account.id);
  if (!character) {
    const startMap = [...deps.content.maps.keys()].includes('map_sandbox_01')
      ? 'map_sandbox_01'
      : [...deps.content.maps.keys()][0];
    const id = await deps.repo.createCharacter({
      accountId: account.id,
      name: `Dev ${name}`,
      characterDefId: [...deps.content.characters.keys()][0] ?? 'player_default',
      mapId: startMap ?? 'map_sandbox_01',
    });
    character = (await deps.repo.listCharacters(account.id)).find((c) => c.id === id);
  }
  if (!character) throw new Error('dev character missing');
  return { sub: account.id, role: account.role, chr: character.id, typ: 'access' };
}

/** Minimal profanity mask; replace with a maintained list/service before launch. */
const BLOCKED = [/\bđ[iị]t\b/giu, /\bđ[ụu] ?m[áa]\b/giu, /\bfuck\w*/giu, /\bshit\b/giu];
function filterText(text: string): string {
  return BLOCKED.reduce((t, re) => t.replace(re, (m) => '*'.repeat(m.length)), text);
}
