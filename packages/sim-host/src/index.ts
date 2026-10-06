import type { ContentBundle } from '@rpg/game-data';
import { TICK_MS, TICK_RATE, World, type WorldStats } from '@rpg/game-core';
import {
  IntentSchema,
  type JoinInfo,
  PROTOCOL_VERSION,
  type SimEvent,
  type Snapshot,
} from '@rpg/game-protocol';

/**
 * The only channel between the client and the authoritative simulation.
 * LocalSimHost runs the World in-process (M1); ColyseusSimHost will talk to
 * the game server (M3). The client must not tell them apart.
 */
export interface SimHost {
  connect(): Promise<JoinInfo>;
  /** Untrusted input: hosts validate it like a server would. */
  sendIntent(intent: unknown): void;
  onSnapshot(cb: (snapshot: Snapshot) => void): () => void;
  onEvents(cb: (events: SimEvent[]) => void): () => void;
  dispose(): void;
}

export interface LocalSimHostOptions {
  content: ContentBundle;
  mapId: string;
  characterId: string;
  seed?: number;
  /** Max intents accepted per second, mirroring the server rate limit. */
  maxIntentsPerSecond?: number;
  /**
   * Drives ticks. Defaults to a real-time fixed-step loop; tests pass a
   * manual scheduler and call `stepOnce()`.
   */
  autoRun?: boolean;
}

export interface LocalSimHostDebug extends WorldStats {
  droppedIntents: number;
}

export class LocalSimHost implements SimHost {
  private world: World | null = null;
  private playerId = 0;
  private readonly snapshotListeners = new Set<(s: Snapshot) => void>();
  private readonly eventListeners = new Set<(e: SimEvent[]) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private intentBudget: number;
  private dropped = 0;
  private readonly maxIntents: number;

  constructor(private readonly opts: LocalSimHostOptions) {
    this.maxIntents = opts.maxIntentsPerSecond ?? 15;
    this.intentBudget = this.maxIntents;
  }

  async connect(): Promise<JoinInfo> {
    if (this.world) throw new Error('already connected');
    const world = new World({ content: this.opts.content, mapId: this.opts.mapId, seed: this.opts.seed });
    this.world = world;
    this.playerId = world.spawnPlayer(this.opts.characterId);
    if (this.opts.autoRun !== false) this.start();
    return {
      protocolVersion: PROTOCOL_VERSION,
      playerId: this.playerId,
      mapId: this.opts.mapId,
      tickRate: TICK_RATE,
    };
  }

  sendIntent(intent: unknown): void {
    if (!this.world) return;
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
    this.snapshotListeners.add(cb);
    return () => this.snapshotListeners.delete(cb);
  }

  onEvents(cb: (events: SimEvent[]) => void): () => void {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  /** Advances exactly one tick and publishes the result. */
  stepOnce(): void {
    const world = this.world;
    if (!world) return;
    this.intentBudget = Math.min(this.maxIntents, this.intentBudget + this.maxIntents / TICK_RATE);
    const events = world.step();
    if (events.length > 0) for (const cb of this.eventListeners) cb(events);
    const snapshot = world.snapshot();
    for (const cb of this.snapshotListeners) cb(snapshot);
  }

  get debug(): LocalSimHostDebug | null {
    return this.world ? { ...this.world.stats, droppedIntents: this.dropped } : null;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.world = null;
    this.snapshotListeners.clear();
    this.eventListeners.clear();
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
