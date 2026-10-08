import type { RegionBiome } from '@rpg/game-data';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { sharedContent } from '../content';
import { game } from '../game';
import { HudGlyph } from '../hud/HudGlyph';
import { useUiStore } from '../store';
import './map.css';
import { buildMapLayer, drawLocalMap, fitView, type MapLayer } from './minimap-render';
import {
  isLit,
  motifPoints,
  type RegionView,
  regionViews,
  roughen,
  STATUS_LABEL,
  smoothPath,
  WORLD_H,
  WORLD_W,
} from './world-map';

const BIOME_LABEL: Record<RegionBiome, string> = {
  town: 'Thị trấn biên giới',
  mountain: 'Sơn mạch · môn phái',
  city: 'Đô thị Thiên Cơ',
  desert: 'Sa mạc · phế tích',
  dark_forest: 'Rừng U Minh',
  sky: 'Đảo nổi',
  rift: 'Chiến trường cổ',
  core: 'Lõi hành tinh',
};

/** Small top-down motif per biome, drawn around (0,0), ~20 units tall. */
function Motif({ biome, color }: { biome: RegionBiome; color: string }): ReactNode {
  switch (biome) {
    case 'town':
      return (
        <g>
          <path d="M-7 0h14v-7h-14Z" fill="#e9dcc0" />
          <path d="M-9.5-6.5 0-13l9.5 6.5Z" fill="#8b3f30" />
          <path d="M-2 0v-4h4v4Z" fill="#5b3a26" />
        </g>
      );
    case 'mountain':
      return (
        <g>
          <path d="M-12 0 0-17 12 0Z" fill={color} stroke="#2b4b33" strokeWidth="1" />
          <path d="M0-17 12 0H4Z" fill="#00000030" />
          <path d="M-4-11.3 0-17l4 5.7-2-1-2 1.6-2-1.6Z" fill="#f4f7f2" />
        </g>
      );
    case 'city':
      return (
        <g>
          <path d="M-9 0v-10h5v10ZM-3 0v-18h6V0ZM4 0v-13h5V0Z" fill="#cfe2ee" stroke="#38566b" />
          <path d="M-1.4-15h2.8M-1.4-11h2.8M-7.5-7h2M5.5-9h2" stroke="#7fe6ff" strokeWidth="1.4" />
          <path d="M-4-18 0-23l4 5Z" fill="#8b3f30" />
        </g>
      );
    case 'desert':
      return (
        <g>
          <path
            d="M-13 0Q-6-8 1 0ZM-3 0Q4-6 12 0Z"
            fill="#e8b071"
            stroke="#9c5a2f"
            strokeWidth="0.8"
          />
          <path d="M5-6.5v-6M3-10h4" stroke="#6a3f1d" strokeWidth="1.4" />
        </g>
      );
    case 'dark_forest':
      return (
        <g>
          <path d="M-1 0h2v-6h-2Z" fill="#2a1838" />
          <circle cy="-11" r="7.5" fill="#5b3a8f" />
          <circle cx="-2.5" cy="-13" r="4" fill="#9a6fe0" opacity="0.8" />
          <circle cx="3" cy="-8" r="1.4" fill="#e6c8ff" />
        </g>
      );
    case 'sky':
      return (
        <g>
          <path d="M-11-6h22L2 8Z" fill="#7b6a58" />
          <path d="M-11-6h22l-2-3H-9Z" fill="#7cc48a" />
          <ellipse cx="-7" cy="-1" rx="7" ry="2.6" fill="#ffffffb0" />
        </g>
      );
    case 'rift':
      return (
        <g>
          <path d="M-8 0-5-15-1 0ZM1 0 5-20 9 0Z" fill="#3b1b26" stroke="#ff6a6a" strokeWidth="1" />
          <path d="M-3-5 0-9 3-4" stroke="#ff9a7a" strokeWidth="1.2" fill="none" />
        </g>
      );
    case 'core':
      return (
        <g>
          <circle cy="-9" r="8" fill="none" stroke="#9fd8ff" strokeWidth="2" />
          <circle cy="-9" r="3.4" fill="#cfefff" />
          <path d="M-12-9h24" stroke="#5f8fe8" strokeWidth="1.2" />
        </g>
      );
  }
}

function RegionShape({
  r,
  d,
  selected,
  onSelect,
}: {
  r: RegionView;
  d: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const motifs = useMemo(
    () =>
      motifPoints(r.def, 14, [
        { x: r.label.x, y: r.label.y, r: 46 },
        ...r.def.maps.map((m) => ({ x: m.at.x, y: m.at.y, r: 16 })),
      ]),
    [r],
  );
  const lit = isLit(r.status);
  return (
    // biome-ignore lint/a11y/useSemanticElements: an SVG territory cannot be a <button>; it gets role, tabIndex and key handling instead
    <g
      className={`wm-region is-${r.status} ${lit ? 'is-open' : 'is-locked'} ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(r.def.id)}
      role="button"
      tabIndex={0}
      aria-label={`${r.def.name} — ${STATUS_LABEL[r.status]}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(r.def.id);
      }}
    >
      <g className="wm-land">
        <path d={d} fill={r.def.color} className="wm-ground" />
        <path d={d} fill="url(#wm-light)" />
        {motifs.map((m) => (
          <g key={`${m.x}:${m.y}`} transform={`translate(${m.x} ${m.y}) scale(${m.s})`}>
            <Motif biome={r.def.biome} color={r.def.color} />
          </g>
        ))}
        {!lit && <path d={d} fill="url(#wm-fog)" className="wm-fog" />}
      </g>
      <path d={d} className="wm-coast" />
    </g>
  );
}

function Plate({ r }: { r: RegionView }) {
  const lit = isLit(r.status);
  const sub = lit
    ? r.def.tagline
    : r.status === 'unbuilt'
      ? `Chưa khai mở · ${r.realm?.name ?? r.def.realm}`
      : `Cần cảnh giới ${r.realm?.name ?? r.def.realm}`;
  const w = Math.max(r.def.name.length * 8.4, sub.length * 5.6) + 26;
  return (
    <g
      className={`wm-plate ${lit ? 'is-open' : 'is-locked'}`}
      transform={`translate(${r.label.x} ${r.label.y})`}
    >
      <rect x={-w / 2} y={-17} width={w} height={34} />
      <text className="wm-plate-name" y={-2}>
        {r.def.name}
      </text>
      <text className="wm-plate-sub" y={11}>
        {sub}
      </text>
    </g>
  );
}

function WorldSvg({
  regions,
  selected,
  onSelect,
  currentMapId,
}: {
  regions: RegionView[];
  selected: string | null;
  onSelect: (id: string) => void;
  currentMapId: string | null;
}) {
  const content = sharedContent();
  const byId = new Map(regions.map((r) => [r.def.id, r]));
  const coasts = useMemo(
    () => new Map(regions.map((r) => [r.def.id, smoothPath(roughen(r.def.shape, r.def.id), 0.4)])),
    [regions],
  );
  const coast = (id: string) => coasts.get(id) ?? '';
  const roads: { a: RegionView; b: RegionView }[] = [];
  for (const r of regions)
    for (const l of r.def.links) {
      const o = byId.get(l);
      if (o) roads.push({ a: r, b: o });
    }
  return (
    <svg
      className="wm-svg"
      viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Bản đồ thế giới Thiên Cơ"
    >
      <defs>
        <radialGradient id="wm-sea" cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor="#1f5a72" />
          <stop offset="0.6" stopColor="#123a4f" />
          <stop offset="1" stopColor="#081c27" />
        </radialGradient>
        <radialGradient id="wm-light" cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.3" />
        </radialGradient>
        <pattern
          id="wm-fog"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(35)"
        >
          <rect width="10" height="10" fill="#0a131a" fillOpacity="0.5" />
          <path d="M0 0v10" stroke="#cfe0e8" strokeOpacity="0.09" strokeWidth="3" />
        </pattern>
        <pattern id="wm-waves" width="46" height="22" patternUnits="userSpaceOnUse">
          <path
            d="M2 12q5-5 10 0t10 0"
            fill="none"
            stroke="#bfe6f2"
            strokeOpacity="0.1"
            strokeWidth="1.2"
          />
          <path
            d="M25 3q5-5 10 0t10 0"
            fill="none"
            stroke="#bfe6f2"
            strokeOpacity="0.07"
            strokeWidth="1"
          />
        </pattern>
        <filter id="wm-rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="3" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="11" />
        </filter>
      </defs>
      <rect width={WORLD_W} height={WORLD_H} fill="url(#wm-sea)" />
      <rect width={WORLD_W} height={WORLD_H} fill="url(#wm-waves)" />
      {/* One continent: every territory dilated by a thick stroke merges the gaps. */}
      <g filter="url(#wm-rough)" className="wm-continent">
        {regions.map((r) => (
          <path key={r.def.id} d={coast(r.def.id)} className="wm-continent-shallows" />
        ))}
        {regions.map((r) => (
          <path key={r.def.id} d={coast(r.def.id)} className="wm-continent-beach" />
        ))}
        {regions.map((r) => (
          <path key={r.def.id} d={coast(r.def.id)} className="wm-continent-land" />
        ))}
      </g>
      <g filter="url(#wm-rough)">
        {regions.map((r) => (
          <RegionShape
            key={r.def.id}
            r={r}
            d={coast(r.def.id)}
            selected={selected === r.def.id}
            onSelect={onSelect}
          />
        ))}
      </g>
      {roads.map(({ a, b }) => (
        <path
          key={`${a.def.id}-${b.def.id}`}
          className={`wm-road ${isLit(a.status) && isLit(b.status) ? 'is-open' : ''}`}
          d={`M${a.label.x},${a.label.y} Q${(a.label.x + b.label.x) / 2 + (b.label.y - a.label.y) * 0.18},${(a.label.y + b.label.y) / 2 - (b.label.x - a.label.x) * 0.18} ${b.label.x},${b.label.y}`}
        />
      ))}
      {regions.flatMap((r) =>
        r.def.maps.map((m) => {
          const here = m.mapId === currentMapId;
          return (
            <g
              key={m.mapId}
              className={`wm-pin ${here ? 'is-here' : ''}`}
              transform={`translate(${m.at.x} ${m.at.y})`}
            >
              <title>{content.maps.get(m.mapId)?.name ?? m.mapId}</title>
              {here && <circle r="15" className="wm-pin-pulse" />}
              <path d="M0-9 7 0 0 9-7 0Z" />
              <circle r="2.4" className="wm-pin-core" />
            </g>
          );
        }),
      )}
      {regions.map((r) => (
        <Plate key={r.def.id} r={r} />
      ))}
      <g className="wm-compass" transform="translate(64 566)">
        <circle r="34" />
        <path d="M0-30 6 0 0 30-6 0Z" className="wm-compass-needle" />
        <path d="M0-30 6 0H-6Z" className="wm-compass-north" />
        <text y="-39">B</text>
        <text y="49">N</text>
        <text x="-44" y="4">
          T
        </text>
        <text x="44" y="4">
          Đ
        </text>
      </g>
    </svg>
  );
}

function RegionCard({ r, currentMapId }: { r: RegionView; currentMapId: string | null }) {
  const content = sharedContent();
  const lit = isLit(r.status);
  return (
    <article className={`wm-card is-${r.status}`}>
      <header>
        <span className="wm-card-order">{r.def.order}</span>
        <div>
          <h3>{r.def.name}</h3>
          <p>{r.def.tagline}</p>
        </div>
      </header>
      <div className="wm-chips">
        <span className={`wm-chip is-${r.status}`}>
          {!lit && <HudGlyph name="lock" />}
          {STATUS_LABEL[r.status]}
        </span>
        <span className="wm-chip">{BIOME_LABEL[r.def.biome]}</span>
        <span className="wm-chip">Cảnh giới: {r.realm?.name ?? r.def.realm}</span>
      </div>
      {r.def.maps.length > 0 && (
        <section>
          <h4>Bản đồ</h4>
          <ul className="wm-maps">
            {r.def.maps.map((m) => (
              <li key={m.mapId} className={m.mapId === currentMapId ? 'is-here' : ''}>
                <span>{content.maps.get(m.mapId)?.name ?? m.mapId}</span>
                {m.mapId === currentMapId && <b>Bạn ở đây</b>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {r.def.highlights.length > 0 && (
        <ul className="wm-highlights">
          {r.def.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {r.def.boss && (
        <p className="wm-boss">
          <small>Boss / Phó bản</small>
          {r.def.boss}
        </p>
      )}
    </article>
  );
}

function Legend() {
  return (
    <ul className="wm-legend" aria-label="Chú thích">
      <li>
        <i className="wm-key is-open" />
        Đã khai mở
      </li>
      <li>
        <i className="wm-key is-locked" />
        Chưa mở (cảnh giới)
      </li>
      <li>
        <i className="wm-key is-pin" />
        Bản đồ đã dựng
      </li>
      <li>
        <i className="wm-key is-here" />
        Vị trí của bạn
      </li>
      <li>
        <i className="wm-key is-road" />
        Đường liên vùng
      </li>
    </ul>
  );
}

/** "Khu vực" tab: the current map at full size with zones, camps, NPCs and exits. */
function LocalMap({ mapId }: { mapId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const content = sharedContent();
    const map = content.maps.get(mapId);
    if (!map) return;
    const layer: MapLayer = buildMapLayer(map, content);
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 100) return;
      last = now;
      const canvas = ref.current;
      if (!canvas) return;
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
      const frame = game()?.radar() ?? null;
      drawLocalMap(ctx, layer, frame, content, fitView(map, w, h, 18 * dpr), dpr, now / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mapId]);
  return <canvas ref={ref} className="wm-local-canvas" aria-label="Bản đồ khu vực hiện tại" />;
}

/**
 * Full-screen map (M or tap the minimap). "Thế giới": the eight regions of the
 * continent, lit when the player's realm has opened them and dimmed under fog
 * otherwise. "Khu vực": the current map in detail.
 */
export function WorldMap() {
  const close = useUiStore((s) => s.closePanel);
  const mapName = useUiStore((s) => s.ui?.mapName);
  const realmId = useUiStore((s) => s.ui?.player?.cultivation.realmId ?? null);
  const realmName = useUiStore((s) => s.ui?.player?.cultivation.realmName ?? null);
  const [tab, setTab] = useState<'world' | 'local'>('world');
  const [mapId] = useState(() => game()?.radar().mapId ?? null);
  const content = sharedContent();
  const regions = useMemo(() => regionViews(content, realmId, mapId), [content, realmId, mapId]);
  const here = regions.find((r) => r.status === 'current') ?? regions[0] ?? null;
  const [selected, setSelected] = useState<string | null>(here?.def.id ?? null);
  const card = regions.find((r) => r.def.id === selected) ?? here;
  const open = regions.filter((r) => isLit(r.status)).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      className="world-map"
      role="dialog"
      aria-modal="true"
      aria-label="Bản đồ"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="wm-frame">
        <header className="wm-head">
          <div className="wm-title">
            <HudGlyph name="map" />
            <div>
              <h2>Bản Đồ Thiên Cơ</h2>
              <p>
                {open}/{regions.length} vùng đã khai mở
                {realmName ? ` · Cảnh giới ${realmName}` : ''}
              </p>
            </div>
          </div>
          <div className="wm-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'world'}
              className={`wm-tab-world ${tab === 'world' ? 'active' : ''}`}
              onClick={() => setTab('world')}
            >
              Thế giới
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'local'}
              className={`wm-tab-local ${tab === 'local' ? 'active' : ''}`}
              onClick={() => setTab('local')}
              disabled={!mapId}
            >
              Khu vực
            </button>
          </div>
          <button type="button" className="wm-close" aria-label="Đóng bản đồ (Esc)" onClick={close}>
            <HudGlyph name="close" />
          </button>
        </header>
        {tab === 'world' ? (
          <div className="wm-body">
            <div className="wm-stage">
              <WorldSvg
                regions={regions}
                selected={card?.def.id ?? null}
                onSelect={setSelected}
                currentMapId={mapId}
              />
            </div>
            <aside className="wm-side">
              {card && <RegionCard r={card} currentMapId={mapId} />}
              <Legend />
            </aside>
          </div>
        ) : (
          <div className="wm-body wm-body-local">
            <div className="wm-stage">{mapId && <LocalMap mapId={mapId} />}</div>
            <aside className="wm-side">
              <article className="wm-card is-current">
                <header>
                  <span className="wm-card-order">
                    <HudGlyph name="map" />
                  </span>
                  <div>
                    <h3>{mapName}</h3>
                    <p>{here?.def.name}</p>
                  </div>
                </header>
              </article>
              <ul className="wm-legend" aria-label="Chú thích khu vực">
                <li>
                  <i className="wm-key is-me" />
                  Bạn (mũi tên = hướng nhìn)
                </li>
                <li>
                  <i className="wm-key is-npc" />
                  NPC
                </li>
                <li>
                  <i className="wm-key is-mob" />
                  Bãi quái
                </li>
                <li>
                  <i className="wm-key is-boss" />
                  Boss / tinh anh
                </li>
                <li>
                  <i className="wm-key is-portal" />
                  Cổng dịch chuyển
                </li>
                <li>
                  <i className="wm-key is-safe" />
                  Vùng an toàn
                </li>
              </ul>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
