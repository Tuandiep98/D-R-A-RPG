import {
  type LedgerEntry,
  type NavQuery,
  type PlayerSave,
  TICK_MS,
  TICK_RATE,
  World,
  type WorldStats,
} from '@rpg/game-core';
import type { ContentBundle, MapDef } from '@rpg/game-data';
import {
  type ChatMessage,
  ChatSendSchema,
  IntentSchema,
  type JoinInfo,
  type PlayerState,
  PROTOCOL_VERSION,
  type SimEvent,
  type Snapshot,
} from '@rpg/game-protocol';

import { HostEmitter, type SimHost } from './host';

export type NavProvider = (map: MapDef) => Promise<NavQuery | null> | NavQuery | null;

export interface LocalSimHostOptions {
  content: ContentBundle;
  mapId: string;
  characterId: string;
  seed?: number;
  /** Max intents accepted per second, mirroring the server rate limit. */
  maxIntentsPerSecond?: number;
  /** Pathfinding per map; omitted → straight-line movement. */
  navFor?: NavProvider;
  /** Real-time fixed-step loop (default). Tests pass false and call stepOnce(). */
  autoRun?: boolean;
}

export interface LocalSimHostDebug extends WorldStats {
  droppedIntents: number;
  mapId: string;
}

/** Private player state is pushed at this rate (and on relevant events). */
const PLAYER_STATE_EVERY_TICKS = 2;

export class LocalSimHost implements SimHost {
  private world: World | null = null;
  private playerId = 0;
  private readonly emitter = new HostEmitter();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private intentBudget: number;
  private dropped = 0;
  private readonly maxIntents: number;
  private readonly ledger: LedgerEntry[] = [];
  private transferring = false;
  private lastChatAt = 0;
  private disposed = false;

  constructor(private readonly opts: LocalSimHostOptions) {
    this.maxIntents = opts.maxIntentsPerSecond ?? 15;
    this.intentBudget = this.maxIntents;
  }

  async connect(): Promise<JoinInfo> {
    if (this.world) throw new Error('already connected');
    const join = await this.enterMap(this.opts.mapId, undefined, null);
    if (this.opts.autoRun !== false) this.start();
    return join;
  }

  sendIntent(intent: unknown): void {
    if (!this.world || this.transferring) return;
    if (this.intentBudget < 1) {
      this.dropped++;
      return;
    }
    const parsed = IntentSchema.safeParse(intent);
    if (!parsed.success) {
      this.dropped++;
      return;
    }
    this.intentBudget--;
    this.world.enqueueIntent(this.playerId, parsed.data);
  }

  onSnapshot(cb: (snapshot: Snapshot) => void): () => void {
    return HostEmitter.add(this.emitter.snapshot, cb);
  }

  onEvents(cb: (events: SimEvent[]) => void): () => void {
    return HostEmitter.add(this.emitter.events, cb);
  }

  onPlayerState(cb: (state: PlayerState) => void): () => void {
    return HostEmitter.add(this.emitter.playerState, cb);
  }

  onJoin(cb: (join: JoinInfo) => void): () => void {
    return HostEmitter.add(this.emitter.join, cb);
  }

  sendChat(text: string): void {
    const parsed = ChatSendSchema.safeParse({ text });
    const now = Date.now();
    if (!parsed.success || now - this.lastChatAt < 1000) return;
    this.lastChatAt = now;
    const name = this.opts.content.characters.get(this.opts.characterId)?.name ?? 'Bạn';
    const msg: ChatMessage = {
      channel: 'map',
      fromId: this.playerId,
      fromName: name,
      text: parsed.data.text,
      at: now,
    };
    for (const cb of this.emitter.chat) cb(msg);
  }

  onChat(cb: (message: ChatMessage) => void): () => void {
    return HostEmitter.add(this.emitter.chat, cb);
  }

  /** Advances exactly one tick and publishes the result. */
  stepOnce(): void {
    const world = this.world;
    if (!world || this.transferring) return;
    this.intentBudget = Math.min(this.maxIntents, this.intentBudget + this.maxIntents / TICK_RATE);
    const events = world.step();
    this.ledger.push(...world.drainLedger());
    if (events.length > 0) for (const cb of this.emitter.events) cb(events);
    const snapshot = world.snapshot();
    for (const cb of this.emitter.snapshot) cb(snapshot);

    const ownEvent = events.some((e) => 'ownerId' in e && e.ownerId === this.playerId);
    if (ownEvent || world.tick % PLAYER_STATE_EVERY_TICKS === 0) this.publishPlayerState();

    const transfer = events.find((e) => e.type === 'TRANSFER' && e.id === this.playerId);
    if (transfer?.type === 'TRANSFER') void this.transfer(transfer.mapId, transfer.arrival);
  }

  get debug(): LocalSimHostDebug | null {
    return this.world
      ? { ...this.world.stats, droppedIntents: this.dropped, mapId: this.world.map.id }
      : null;
  }

  /** Audited currency changes (persisted to Postgres by the real server). */
  get currencyLedger(): readonly LedgerEntry[] {
    return this.ledger;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.world = null;
    this.emitter.clear();
  }

  private async enterMap(mapId: string, save: PlayerSave | undefined, arrival: string | null) {
    const map = this.opts.content.maps.get(mapId);
    if (!map) throw new Error(`unknown map ${mapId}`);
    const nav = (await this.opts.navFor?.(map)) ?? null;
    const world = new World({ content: this.opts.content, mapId, seed: this.opts.seed, nav });
    this.playerId = world.spawnPlayer(this.opts.characterId, { save, arrival });
    this.world = world;
    const join: JoinInfo = {
      protocolVersion: PROTOCOL_VERSION,
      playerId: this.playerId,
      mapId,
      tickRate: TICK_RATE,
    };
    for (const cb of this.emitter.join) cb(join);
    this.publishPlayerState();
    return join;
  }

  private async transfer(mapId: string, arrival: string | null): Promise<void> {
    const world = this.world;
    if (!world || this.transferring) return;
    this.transferring = true;
    const save = world.exportPlayer(this.playerId) ?? undefined;
    try {
      await this.enterMap(mapId, save, arrival);
    } finally {
      this.transferring = false;
    }
    if (this.disposed) this.world = null;
  }

  private publishPlayerState(): void {
    const state = this.world?.playerState(this.playerId);
    if (state) for (const cb of this.emitter.playerState) cb(state);
  }

  private start(): void {
    this.lastTime = performance.now();
    // Fixed-step accumulator: setInterval jitter does not change sim speed.
    this.timer = setInterval(() => {
      const now = performance.now();
      this.accumulator += Math.min(now - this.lastTime, 250);
      this.lastTime = now;
      while (this.accumulator >= TICK_MS) {
        this.accumulator -= TICK_MS;
        this.stepOnce();
      }
    }, TICK_MS / 2);
  }
}
