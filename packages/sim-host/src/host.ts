import type { JoinInfo, PlayerState, SimEvent, Snapshot } from '@rpg/game-protocol';

/**
 * The only channel between the client and the authoritative simulation.
 * LocalSimHost runs the World in-process, WorkerSimHost in a Web Worker,
 * ColyseusSimHost on the game server. The client must not tell them apart.
 */
export interface SimHost {
  connect(): Promise<JoinInfo>;
  /** Untrusted input: hosts validate it like a server would. */
  sendIntent(intent: unknown): void;
  onSnapshot(cb: (snapshot: Snapshot) => void): () => void;
  onEvents(cb: (events: SimEvent[]) => void): () => void;
  /** Private state of the controlled character (inventory, XP, cooldowns…). */
  onPlayerState(cb: (state: PlayerState) => void): () => void;
  /** Fires after connect and after every map transfer. */
  onJoin(cb: (join: JoinInfo) => void): () => void;
  dispose(): void;
}

/** Shared listener plumbing for host implementations. */
export class HostEmitter {
  readonly snapshot = new Set<(s: Snapshot) => void>();
  readonly events = new Set<(e: SimEvent[]) => void>();
  readonly playerState = new Set<(s: PlayerState) => void>();
  readonly join = new Set<(j: JoinInfo) => void>();

  static add<T>(set: Set<T>, cb: T): () => void {
    set.add(cb);
    return () => set.delete(cb);
  }

  clear(): void {
    this.snapshot.clear();
    this.events.clear();
    this.playerState.clear();
    this.join.clear();
  }
}
