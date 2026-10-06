import { GameView } from '@rpg/babylon-renderer';
import { LocalSimHost } from '@rpg/sim-host';
import { useEffect, useRef } from 'react';
import { loadContent } from './content';
import { useUiStore } from './store';

const MAP_ID = 'map_sandbox_01';
const CHARACTER_ID = 'player_default';

/**
 * Mounts the Babylon game once. React never re-renders the scene; it only
 * receives throttled UI state through the store.
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { setUi, setDebug, setStatus, toggleDebug } = useUiStore.getState();
    let view: GameView | null = null;
    let cancelled = false;

    (async () => {
      try {
        const content = loadContent();
        const host = new LocalSimHost({ content, mapId: MAP_ID, characterId: CHARACTER_ID });
        const params = new URLSearchParams(window.location.search);
        const created = await GameView.create({
          canvas,
          host,
          content,
          manifestUrl: `${import.meta.env.BASE_URL}assets/assets.manifest.json`,
          forceWebGL: params.has('webgl'),
          onUi: setUi,
          onDebug: setDebug,
          onToggleDebug: async (scene) => {
            toggleDebug();
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
        // Exposed in dev only, for tools/smoke and manual console poking.
        if (import.meta.env.DEV) (window as unknown as { __rpg: unknown }).__rpg = { view, host };
        setStatus('ready');
      } catch (err) {
        console.error(err);
        setStatus('error', err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      view?.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
