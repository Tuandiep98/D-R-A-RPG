import type { ChatMessage, JoinInfo, PlayerState, SimEvent, Snapshot } from '@rpg/game-protocol';
import { HostEmitter, type SimHost } from './host';

/**
 * Runs any SimHost behind a message channel (Web Worker in the browser).
 * Typed structurally so this package needs no DOM lib.
 */
export interface MessageEndpoint {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
  removeEventListener?(type: 'message', listener: (ev: { data: unknown }) => void): void;
}

type ToWorker =
  | { t: 'connect' }
  | { t: 'intent'; intent: unknown }
  | { t: 'chat'; text: string }
  | { t: 'dispose' };
type FromWorker =
  | { t: 'join'; join: JoinInfo; reply: boolean }
  | { t: 'snapshot'; snapshot: Snapshot }
  | { t: 'events'; events: SimEvent[] }
  | { t: 'player'; state: PlayerState }
  | { t: 'chat'; message: ChatMessage }
  | { t: 'error'; message: string };

/** Worker side: wire a host to the endpoint (call from the worker entry). */
export function serveSimHost(endpoint: MessageEndpoint, host: SimHost): void {
  let connected = false;
  host.onSnapshot((snapshot) =>
    endpoint.postMessage({ t: 'snapshot', snapshot } satisfies FromWorker),
  );
  host.onEvents((events) => endpoint.postMessage({ t: 'events', events } satisfies FromWorker));
  host.onPlayerState((state) => endpoint.postMessage({ t: 'player', state } satisfies FromWorker));
  host.onChat((message) => endpoint.postMessage({ t: 'chat', message } satisfies FromWorker));
  host.onJoin((join) => {
    if (connected) endpoint.postMessage({ t: 'join', join, reply: false } satisfies FromWorker);
  });
  endpoint.addEventListener('message', (ev) => {
    const msg = ev.data as ToWorker;
    if (msg.t === 'connect') {
      host
        .connect()
        .then((join) => {
          connected = true;
          endpoint.postMessage({ t: 'join', join, reply: true } satisfies FromWorker);
        })
        .catch((err: unknown) =>
          endpoint.postMessage({
            t: 'error',
            message: err instanceof Error ? err.message : String(err),
          } satisfies FromWorker),
        );
    } else if (msg.t === 'intent') host.sendIntent(msg.intent);
    else if (msg.t === 'chat') host.sendChat(msg.text);
    else if (msg.t === 'dispose') host.dispose();
  });
}

/** Main-thread side: a SimHost whose simulation runs in a worker. */
export class WorkerSimHost implements SimHost {
  private readonly emitter = new HostEmitter();
  private pendingConnect: { resolve: (j: JoinInfo) => void; reject: (e: Error) => void } | null =
    null;
  private readonly listener = (ev: { data: unknown }) => this.onMessage(ev.data as FromWorker);

  constructor(
    private readonly endpoint: MessageEndpoint,
    private readonly terminate?: () => void,
  ) {
    endpoint.addEventListener('message', this.listener);
  }

  connect(): Promise<JoinInfo> {
    return new Promise((resolve, reject) => {
      this.pendingConnect = { resolve, reject };
      this.endpoint.postMessage({ t: 'connect' } satisfies ToWorker);
    });
  }

  sendIntent(intent: unknown): void {
    this.endpoint.postMessage({ t: 'intent', intent } satisfies ToWorker);
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
    this.endpoint.postMessage({ t: 'chat', text } satisfies ToWorker);
  }

  onChat(cb: (message: ChatMessage) => void): () => void {
    return HostEmitter.add(this.emitter.chat, cb);
  }

  dispose(): void {
    this.endpoint.postMessage({ t: 'dispose' } satisfies ToWorker);
    this.endpoint.removeEventListener?.('message', this.listener);
    this.emitter.clear();
    this.terminate?.();
  }

  private onMessage(msg: FromWorker): void {
    switch (msg.t) {
      case 'snapshot':
        for (const cb of this.emitter.snapshot) cb(msg.snapshot);
        break;
      case 'events':
        for (const cb of this.emitter.events) cb(msg.events);
        break;
      case 'player':
        for (const cb of this.emitter.playerState) cb(msg.state);
        break;
      case 'chat':
        for (const cb of this.emitter.chat) cb(msg.message);
        break;
      case 'join':
        for (const cb of this.emitter.join) cb(msg.join);
        if (msg.reply) {
          this.pendingConnect?.resolve(msg.join);
          this.pendingConnect = null;
        }
        break;
      case 'error':
        this.pendingConnect?.reject(new Error(msg.message));
        this.pendingConnect = null;
        break;
    }
  }
}
