import { Client, type Room } from '@colyseus/sdk';
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
import {
  DeltaDecoder,
  EventDeduper,
  ServerMessages,
  type SnapshotDelta,
} from '@rpg/game-protocol/net';
import { HostEmitter, type SimHost } from '@rpg/sim-host';

export interface ColyseusSimHostOptions {
  /** ws(s)://host:port of the game server. */
  endpoint: string;
  /** Access token from the API (or `dev:<name>` against a dev server). */
  getToken: () => Promise<string> | string;
  /** Map the character is in; corrected automatically if the server says otherwise. */
  mapId: string;
  onDisconnect?: (code: number) => void;
}

const WRONG_MAP = /character is in ([a-z0-9_]+)(?:#([A-Za-z0-9-]+))?/;

/**
 * SimHost backed by the authoritative game server (M3). Same contract as
 * LocalSimHost, so GameView and the HUD do not change.
 */
export class ColyseusSimHost implements SimHost {
  private readonly client: Client;
  private readonly emitter = new HostEmitter();
  private readonly decoder = new DeltaDecoder();
  private readonly eventDeduper = new EventDeduper();
  private room: Room | null = null;
  private mapId: string;
  private disposed = false;

  constructor(private readonly opts: ColyseusSimHostOptions) {
    this.client = new Client(opts.endpoint);
    this.mapId = opts.mapId;
  }

  async connect(): Promise<JoinInfo> {
    return this.joinMap(this.mapId, undefined, true, undefined);
  }

  sendIntent(intent: unknown): void {
    // Validate locally too: saves bandwidth and avoids tripping the server's abuse counter.
    const parsed = IntentSchema.safeParse(intent);
    if (parsed.success) this.room?.send('intent', parsed.data);
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
    if (parsed.success) this.room?.send('chat', parsed.data);
  }

  onChat(cb: (message: ChatMessage) => void): () => void {
    return HostEmitter.add(this.emitter.chat, cb);
  }

  dispose(): void {
    this.disposed = true;
    void this.room?.leave(true);
    this.room = null;
    this.emitter.clear();
  }

  private async joinMap(
    mapId: string,
    ticket: string | undefined,
    allowRedirect: boolean,
    instanceKey: string | undefined,
  ): Promise<JoinInfo> {
    this.client.auth.token = await this.opts.getToken();
    let room: Room;
    try {
      room = await this.client.joinOrCreate('zone', {
        mapId,
        protocolVersion: PROTOCOL_VERSION,
        ticket,
        instanceKey,
      });
    } catch (err) {
      const redirect = WRONG_MAP.exec(err instanceof Error ? err.message : String(err));
      if (allowRedirect && redirect?.[1])
        return this.joinMap(redirect[1], undefined, false, redirect[2]);
      throw err;
    }
    this.room = room;
    this.mapId = mapId;
    this.decoder.reset();
    this.eventDeduper.reset();

    const joined = new Promise<JoinInfo>((resolve) => {
      room.onMessage('join', (join: JoinInfo) => {
        for (const cb of this.emitter.join) cb(join);
        resolve(join);
      });
    });
    room.onMessage('snap', (delta: SnapshotDelta) => {
      const snapshot = this.decoder.apply(delta);
      for (const cb of this.emitter.snapshot) cb(snapshot);
    });
    room.onMessage('events', (events: SimEvent[]) => {
      if (this.room !== room) return;
      const parsed = ServerMessages.events.safeParse(events);
      if (!parsed.success) return;
      const fresh = this.eventDeduper.filter(parsed.data);
      if (fresh.length) for (const cb of this.emitter.events) cb(fresh);
    });
    room.onMessage('player', (state: PlayerState) => {
      for (const cb of this.emitter.playerState) cb(state);
    });
    room.onMessage('transfer', (msg: { mapId: string; ticket: string; instanceKey?: string }) => {
      void this.switchMap(room, msg.mapId, msg.ticket, msg.instanceKey);
    });
    room.onMessage('chat', (msg: ChatMessage) => {
      for (const cb of this.emitter.chat) cb(msg);
    });
    room.onLeave((code: number) => {
      if (this.room === room && !this.disposed) this.opts.onDisconnect?.(code);
    });
    return joined;
  }

  private async switchMap(
    from: Room,
    mapId: string,
    ticket: string,
    instanceKey?: string,
  ): Promise<void> {
    this.room = null;
    await from.leave(true);
    if (!this.disposed) await this.joinMap(mapId, ticket, false, instanceKey);
  }
}
