import { GameView } from '@rpg/babylon-renderer';
import { LocalSimHost, type MessageEndpoint, type SimHost, WorkerSimHost } from '@rpg/sim-host';
import { useEffect, useRef } from 'react';
import { loadContent } from './content';
import { setGame } from './game';
import { navFor } from './nav';
import { useUiStore } from './store';

const DEFAULT_MAP = 'map_sandbox_01';
const CHARACTER_ID = 'player_default';

/**
 * Picks the simulation host. Default: Web Worker. `?noworker` runs it on the
 * main thread (debugging); `?map=<id>` starts on another map.
 */
function createHost(params: URLSearchParams): { host: SimHost; kind: string } {
  const map = params.get('map') ?? DEFAULT_MAP;
  if (!params.has('noworker') && typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), {
        type: 'module',
        name: JSON.stringify({ map, character: CHARACTER_ID }),
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
      characterId: CHARACTER_ID,
      navFor,
    }),
    kind: 'main-thread',
  };
}

/**
 * Mounts the Babylon game once. React never re-renders the scene; it only
 * receives throttled UI state through the store.
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const store = useUiStore.getState();
    let view: GameView | null = null;
    let cancelled = false;

    (async () => {
      try {
        const content = loadContent();
        const params = new URLSearchParams(window.location.search);
        const { host, kind } = createHost(params);
        store.setHostKind(kind);
        const quality =
          (params.get('quality') as 'auto' | 'low' | 'medium' | 'high' | null) ?? 'auto';
        store.setQuality(quality);
        const created = await GameView.create({
          canvas,
          host,
          content,
          manifestUrl: `${import.meta.env.BASE_URL}assets/assets.manifest.json`,
          forceWebGL: params.has('webgl'),
          quality,
          onUi: store.setUi,
          onDebug: store.setDebug,
          onNotice: store.pushNotice,
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
  }, []);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
