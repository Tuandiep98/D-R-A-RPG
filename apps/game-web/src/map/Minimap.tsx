import { useEffect, useRef, useState } from 'react';
import { sharedContent } from '../content';
import { game } from '../game';
import { HudGlyph } from '../hud/HudGlyph';
import { useUiStore } from '../store';
import './map.css';
import { buildMapLayer, drawMinimap, type MapLayer } from './minimap-render';

/** Metres shown across the minimap, by zoom step (index 1 = default). */
const ZOOM_SPAN = [30, 46, 70] as const;
const ZOOM_KEY = 'rpg.minimap.zoom';

const readZoom = (): number => {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    return Number.isInteger(v) && v >= 0 && v < ZOOM_SPAN.length ? v : 1;
  } catch {
    return 1;
  }
};

/**
 * Top-right minimap in an avatar-style slot frame. The canvas is drawn from
 * GameView.radar() on its own animation loop (20 Hz, 10 Hz on Low) — nothing
 * per-frame goes through React (CLAUDE.md rule 7). Click opens the world map.
 */
export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(readZoom);
  const zoomRef = useRef(zoom);
  const mapName = useUiStore((s) => s.ui?.mapName);
  const zoneName = useUiStore((s) => s.ui?.zoneName);
  const safe = useUiStore((s) => s.ui?.player?.inSafeZone ?? false);
  const togglePanel = useUiStore((s) => s.togglePanel);

  useEffect(() => {
    zoomRef.current = zoom;
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch {
      /* private mode: zoom just isn't remembered */
    }
  }, [zoom]);

  useEffect(() => {
    const content = sharedContent();
    let layer: MapLayer | null = null;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const low = useUiStore.getState().quality === 'low';
      if (now - last < (low ? 100 : 50)) return;
      last = now;
      const view = game();
      const canvas = canvasRef.current;
      if (!view || !canvas) return;
      const frame = view.radar();
      if (layer?.mapId !== frame.mapId) {
        const map = content.maps.get(frame.mapId);
        if (!map) return;
        layer = buildMapLayer(map, content);
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (w === 0 || h === 0) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const b = layer.map.bounds;
      const centre = frame.player ?? {
        x: (b.min.x + b.max.x) / 2,
        z: (b.min.z + b.max.z) / 2,
      };
      drawMinimap(
        ctx,
        layer,
        frame,
        {
          scale: w / (ZOOM_SPAN[zoomRef.current] ?? 46),
          cx: centre.x,
          cz: centre.z,
          width: w,
          height: h,
        },
        dpr,
        now / 1000,
      );
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const place = zoneName && zoneName !== mapName ? zoneName : mapName;
  return (
    <section className="minimap-dock" aria-label="Bản đồ nhỏ">
      <button
        type="button"
        className="minimap"
        title="Mở bản đồ (M)"
        aria-label="Mở bản đồ thế giới (M)"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => togglePanel('map')}
      >
        <canvas ref={canvasRef} />
        <span className="minimap-north" aria-hidden="true">
          B
        </span>
      </button>
      <div className="minimap-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Phóng to bản đồ nhỏ"
          disabled={zoom === 0}
          onClick={() => setZoom((z) => Math.max(0, z - 1))}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Thu nhỏ bản đồ nhỏ"
          disabled={zoom === ZOOM_SPAN.length - 1}
          onClick={() => setZoom((z) => Math.min(ZOOM_SPAN.length - 1, z + 1))}
        >
          −
        </button>
      </div>
      {place && (
        <div className={`minimap-place ${safe ? 'is-safe' : ''}`}>
          {safe && <HudGlyph name="shield" className="minimap-safe" />}
          <span>{place}</span>
        </div>
      )}
    </section>
  );
}
