import { GameView } from '@rpg/babylon-renderer';
import { ColyseusSimHost } from '@rpg/net-client';
import { LocalSimHost, type MessageEndpoint, type SimHost, WorkerSimHost } from '@rpg/sim-host';
import { useEffect, useRef } from 'react';
import { playSfx } from './audio';
import { loadContent, sharedContent } from './content';
import { setGame } from './game';
import type { OnlineChoice } from './Login';
import { loadMedia, mediaUrl } from './media';
import { navFor } from './nav';
import { startSession } from './online';
import { useUiStore } from './store';

const DEFAULT_MAP = 'map_sandbox_01';
const DEFAULT_CHARACTER = 'player_default';

/**
 * Picks the simulation host. Default: Web Worker. `?noworker` runs it on the
 * main thread (debugging); `?map=<id>` starts on another map.
 */
function createHost(
  params: URLSearchParams,
  online: OnlineChoice | null,
): { host: SimHost; kind: string } {
  const map = params.get('map') ?? DEFAULT_MAP;
  // Offline only: `?char=player_gunner` starts as another character (test kits, D-033).
  const wanted = params.get('char');
  const character = wanted && sharedContent().characters.has(wanted) ? wanted : DEFAULT_CHARACTER;
  const picked = params.get('element');
  const element = ['kim', 'moc', 'thuy', 'hoa', 'tho'].includes(picked ?? '')
    ? (picked as import('@rpg/game-protocol').Element)
    : undefined;
  const expression =
    element === undefined
      ? undefined
      : element === 'moc'
        ? ('thunder' as const)
        : element === 'thuy'
          ? ('ice' as const)
          : ('base' as const);
  const onDisconnect = (code: number) =>
    useUiStore
      .getState()
      .setStatus('error', `Mất kết nối máy chủ (${code}). Tải lại trang để vào lại.`);
  if (online) {
    // Each (re)join asks the API for a fresh short-lived session token.
    let first: string | null = online.session.accessToken;
    return {
      host: new ColyseusSimHost({
        endpoint: online.session.gameServerUrl,
        mapId: online.session.mapId,
        getToken: async () => {
          const t = first ?? (await startSession(online.characterId)).accessToken;
          first = null;
          return t;
        },
        onDisconnect,
      }),
      kind: 'online',
    };
  }
  const dev = params.get('dev');
  if (params.has('online') && dev) {
    return {
      host: new ColyseusSimHost({
        endpoint: params.get('server') ?? `ws://${window.location.hostname}:2567`,
        mapId: map,
        getToken: () => `dev:${dev}`,
        onDisconnect,
      }),
      kind: 'online-dev',
    };
  }
  if (!params.has('noworker') && typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), {
        type: 'module',
        name: JSON.stringify({ map, character, element, expression }),
      });
      return {
        host: new WorkerSimHost(worker as unknown as MessageEndpoint, () => worker.terminate()),
        kind: 'worker',
      };
    } catch (err) {
      console.warn('[sim] worker unavailable, running on main thread', err);
    }
  }
  return {
    host: new LocalSimHost({
      content: loadContent(),
      mapId: map,
      characterId: character,
      element,
      expression,
      navFor,
    }),
    kind: 'main-thread',
  };
}

/**
 * Mounts the Babylon game once. React never re-renders the scene; it only
 * receives throttled UI state through the store.
 */
export function GameCanvas({ online = null }: { online?: OnlineChoice | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const store = useUiStore.getState();
    let view: GameView | null = null;
    let cancelled = false;

    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        let content = loadContent();
        // Dev aid (client-only presentation): draw the player with another
        // appearance — `?player=char_kk_knight`, or `?mannequin` for the KayKit
        // mannequin (same Rig_Medium as the default) when fitting gear.
        const preview = params.has('mannequin') ? 'char_kk_mannequin' : params.get('player');
        const previewDef = preview ? content.appearances.get(preview) : undefined;
        if (previewDef) {
          const appearances = new Map(content.appearances);
          appearances.set('char_player_default', {
            ...previewDef,
            id: 'char_player_default',
          });
          content = { ...content, appearances };
        }
        const { host, kind } = createHost(params, online);
        store.setCharacterId(online?.characterId ?? null);
        store.setHostKind(kind);
        const quality =
          (params.get('quality') as 'auto' | 'low' | 'medium' | 'high' | null) ?? 'auto';
        store.setQuality(quality);
        await loadMedia();
        const created = await GameView.create({
          canvas,
          mediaUrl,
          host,
          content,
          manifestUrl: `${import.meta.env.BASE_URL}assets/assets.manifest.json`,
          forceWebGL: params.has('webgl'),
          quality,
          onUi: store.setUi,
          onDebug: store.setDebug,
          onNotice: store.pushNotice,
          onSfx: playSfx,
          onNpcOpen: store.openNpc,
          onChat: store.pushChat,
          onPartyInvite: store.setInvite,
          onAction: (a) => {
            if (a.type === 'TOGGLE_PANEL') useUiStore.getState().togglePanel(a.panel);
          },
          onToggleDebug: async (scene) => {
            useUiStore.getState().toggleDebug();
            if (!import.meta.env.DEV) return;
            await import('@babylonjs/inspector');
            if (scene.debugLayer.isVisible()) scene.debugLayer.hide();
            else void scene.debugLayer.show({ embedMode: true });
          },
        });
        if (cancelled) {
          created.dispose();
          return;
        }
        view = created;
        setGame(created);
        // Exposed in dev (or with ?debug) for tools/smoke and console poking.
        if (import.meta.env.DEV || params.has('debug'))
          (window as unknown as { __rpg: unknown }).__rpg = { view, host };
        store.setStatus('ready');
      } catch (err) {
        console.error(err);
        store.setStatus('error', err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      setGame(null);
      view?.dispose();
    };
  }, [online]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
