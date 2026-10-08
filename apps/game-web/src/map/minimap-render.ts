import type { RadarBlip, RadarFrame } from '@rpg/babylon-renderer';
import type { AppearanceDef, ContentBundle, MapDef } from '@rpg/game-data';

/**
 * Minimap drawing (presentation only). The static map is painted once per map
 * into an off-screen layer from the same MapDef the renderer uses: ground
 * paint, roads, floors and every blocker coloured by its appearance's
 * placeholder colour — new content shows up on the minimap with no extra data.
 */

export interface MapLayer {
  mapId: string;
  canvas: HTMLCanvasElement;
  /** Layer pixels per metre. */
  ppm: number;
  map: MapDef;
}

const MAX_LAYER_PX = 2048;
const OUTSIDE = '#0b141a';

/** What an instance looks like from above. */
export type TopDown =
  | { kind: 'floor'; color: string; size: number }
  | { kind: 'canopy'; color: string; radius: number }
  | { kind: 'block'; color: string; radius: number }
  | null;

/** Classifies a placed instance for the top-down layer (exported for tests). */
export function topDown(
  appearance: AppearanceDef | undefined,
  inst: { scale: number; colliderRadius?: number; position: readonly number[] },
): TopDown {
  if (!appearance) return null;
  const ph = appearance.placeholder;
  const id = appearance.id;
  if (/(^env_ground_|_floor_|^env_village_floor)/.test(id))
    return { kind: 'floor', color: ph.color, size: 4 * inst.scale };
  // Raised pieces (roof tiles, vines, lanterns) would hide what is under them.
  if ((inst.position[1] ?? 0) > 1) return null;
  // Trees (and cone-shaped blockers); grass/ferns without colliders stay off the map.
  if (/^env_tree_/.test(id) || (ph.shape === 'cone' && inst.colliderRadius !== undefined))
    return {
      kind: 'canopy',
      color: ph.color,
      radius: Math.max(inst.colliderRadius ?? 0, ph.radius * inst.scale * 0.9),
    };
  if (inst.colliderRadius !== undefined)
    return { kind: 'block', color: ph.color, radius: inst.colliderRadius };
  return null;
}

export function buildMapLayer(map: MapDef, content: Pick<ContentBundle, 'appearances'>): MapLayer {
  const w = map.bounds.max.x - map.bounds.min.x;
  const h = map.bounds.max.z - map.bounds.min.z;
  const ppm = Math.max(2, Math.min(8, MAX_LAYER_PX / Math.max(w, h)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * ppm);
  canvas.height = Math.ceil(h * ppm);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { mapId: map.id, canvas, ppm, map };
  // World (x, z) → layer pixels: north (+z) up.
  const px = (x: number) => (x - map.bounds.min.x) * ppm;
  const py = (z: number) => (map.bounds.max.z - z) * ppm;

  ctx.fillStyle = map.ground.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const paint = map.ground.paint;
  if (paint) {
    // Soft blotches stand in for the renderer's noise variation.
    const cell = paint.noiseScale;
    let k = 0;
    for (let z = map.bounds.min.z; z < map.bounds.max.z; z += cell)
      for (let x = map.bounds.min.x; x < map.bounds.max.x; x += cell) {
        const color = paint.variation[k++ % Math.max(1, paint.variation.length)];
        if (!color) continue;
        ctx.globalAlpha = 0.18 * paint.noiseAmount;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px(x + cell / 2), py(z + cell / 2), cell * ppm * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.globalAlpha = 1;
    for (const p of paint.patches) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px(p.center.x), py(p.center.z), p.radius * ppm, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of paint.strokes) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(2, s.width * ppm);
      ctx.beginPath();
      for (const [i, p] of s.points.entries()) {
        if (i === 0) ctx.moveTo(px(p.x), py(p.z));
        else ctx.lineTo(px(p.x), py(p.z));
      }
      ctx.stroke();
    }
  }

  const floors: { x: number; z: number; t: Exclude<TopDown, null> }[] = [];
  const canopies: typeof floors = [];
  const blocks: typeof floors = [];
  for (const chunk of map.chunks)
    for (const inst of chunk.instances) {
      const t = topDown(content.appearances.get(inst.appearanceId), inst);
      if (!t) continue;
      const item = { x: inst.position[0], z: inst.position[2], t };
      (t.kind === 'floor' ? floors : t.kind === 'canopy' ? canopies : blocks).push(item);
    }
  for (const f of floors) {
    if (f.t.kind !== 'floor') continue;
    const s = f.t.size * ppm;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = f.t.color;
    ctx.fillRect(px(f.x) - s / 2, py(f.z) - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  for (const b of blocks) {
    if (b.t.kind !== 'block') continue;
    const r = Math.max(1.2, b.t.radius * ppm);
    ctx.fillStyle = shade(b.t.color, -0.25);
    ctx.fillRect(px(b.x) - r, py(b.z) - r, r * 2, r * 2);
    ctx.fillStyle = b.t.color;
    ctx.fillRect(px(b.x) - r + 1, py(b.z) - r + 1, r * 2 - 2, r * 2 - 2);
  }
  for (const c of canopies) {
    if (c.t.kind !== 'canopy') continue;
    const r = Math.max(1.5, c.t.radius * ppm);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.arc(px(c.x) + r * 0.25, py(c.z) + r * 0.3, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.t.color;
    ctx.beginPath();
    ctx.arc(px(c.x), py(c.z), r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Zone rims: safe = jade, boss = ember, hazard = violet.
  for (const zone of map.zones) {
    if (zone.kind === 'combat') continue;
    ctx.strokeStyle =
      zone.kind === 'safe'
        ? 'rgba(150, 230, 190, 0.7)'
        : zone.kind === 'boss_arena'
          ? 'rgba(240, 110, 80, 0.75)'
          : 'rgba(190, 120, 240, 0.7)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(zone.center.x), py(zone.center.z), zone.radius * ppm, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  return { mapId: map.id, canvas, ppm, map };
}

/** #rrggbb lightened (amount > 0) or darkened (< 0). */
export function shade(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = Number.parseInt(m[1]!, 16);
  const ch = (v: number) =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))
      .toString(16)
      .padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

export interface View {
  /** Canvas pixels per metre. */
  scale: number;
  /** World point at the canvas centre. */
  cx: number;
  cz: number;
  width: number;
  height: number;
}

export const toScreen = (v: View, x: number, z: number) => ({
  x: (x - v.cx) * v.scale + v.width / 2,
  y: v.height / 2 - (z - v.cz) * v.scale,
});

/** Paints the static layer into a view, with the outside of the map dark. */
export function drawLayer(ctx: CanvasRenderingContext2D, layer: MapLayer, v: View): void {
  ctx.fillStyle = OUTSIDE;
  ctx.fillRect(0, 0, v.width, v.height);
  const tl = toScreen(v, layer.map.bounds.min.x, layer.map.bounds.max.z);
  const k = v.scale / layer.ppm;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(layer.canvas, tl.x, tl.y, layer.canvas.width * k, layer.canvas.height * k);
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, yaw: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(yaw);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.72, size * 0.78);
  ctx.lineTo(0, size * 0.38);
  ctx.lineTo(-size * 0.72, size * 0.78);
  ctx.closePath();
  ctx.fillStyle = '#f4fbf6';
  ctx.strokeStyle = '#0a1a16';
  ctx.lineWidth = Math.max(1.5, size * 0.22);
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

function viewCone(ctx: CanvasRenderingContext2D, x: number, y: number, yaw: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(yaw);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, 'rgba(214, 245, 226, 0.34)');
  g.addColorStop(1, 'rgba(214, 245, 226, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const BLIP_COLOR: Record<string, string> = {
  monster: '#e2604c',
  npc: '#f2cf6b',
  player: '#78b8f0',
  loot: '#f7e08a',
};

function blip(
  ctx: CanvasRenderingContext2D,
  b: RadarBlip,
  x: number,
  y: number,
  s: number,
  t: number,
) {
  if (b.kind === 'portal') return; // drawn from map data with its name
  const boss = b.tier === 'boss' || b.tier === 'world_boss';
  const elite = b.tier === 'elite';
  ctx.lineWidth = Math.max(1, s * 0.35);
  ctx.strokeStyle = 'rgba(8, 14, 18, 0.9)';
  ctx.fillStyle = boss ? '#ff4a3a' : elite ? '#f39a45' : (BLIP_COLOR[b.kind] ?? '#ffffff');
  ctx.beginPath();
  if (b.kind === 'npc') {
    // Diamond: talkable.
    ctx.moveTo(x, y - s * 1.3);
    ctx.lineTo(x + s * 1.1, y);
    ctx.lineTo(x, y + s * 1.3);
    ctx.lineTo(x - s * 1.1, y);
    ctx.closePath();
  } else if (b.kind === 'loot') {
    ctx.rect(x - s * 0.7, y - s * 0.7, s * 1.4, s * 1.4);
  } else {
    ctx.arc(x, y, boss ? s * 1.7 : elite ? s * 1.3 : s, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.fill();
  if (boss) {
    ctx.strokeStyle = `rgba(255, 90, 60, ${0.45 + 0.35 * Math.sin(t * 5)})`;
    ctx.lineWidth = Math.max(1, s * 0.4);
    ctx.beginPath();
    ctx.arc(x, y, s * 2.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (b.engaged || b.selected) {
    ctx.strokeStyle = b.selected ? '#ffffff' : 'rgba(255, 210, 120, 0.9)';
    ctx.lineWidth = Math.max(1, s * 0.3);
    ctx.beginPath();
    ctx.arc(x, y, s * (boss ? 2.1 : 1.9), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function portalMark(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 1.6);
  ctx.strokeStyle = '#7fe6ff';
  ctx.lineWidth = Math.max(1.2, s * 0.4);
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.4, 0.3, Math.PI * 1.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.8, Math.PI, Math.PI * 2.1);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#c9f6ff';
  ctx.beginPath();
  ctx.arc(x, y, s * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

/** Off-view portals become chevrons on the rim so exits are always findable. */
function edgeHint(ctx: CanvasRenderingContext2D, v: View, x: number, y: number, s: number) {
  const cx = v.width / 2;
  const cy = v.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const pad = s * 2.2;
  const k = Math.min((cx - pad) / Math.abs(dx || 1e-6), (cy - pad) / Math.abs(dy || 1e-6));
  const ex = cx + dx * k;
  const ey = cy + dy * k;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
  ctx.fillStyle = '#7fe6ff';
  ctx.strokeStyle = 'rgba(6, 16, 20, 0.9)';
  ctx.lineWidth = Math.max(1, s * 0.3);
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.2);
  ctx.lineTo(s, s * 0.6);
  ctx.lineTo(-s, s * 0.6);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

/** One minimap frame: player-centred, north up, camera cone, blips, portals. */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  layer: MapLayer,
  frame: RadarFrame,
  v: View,
  dpr: number,
  t: number,
): void {
  drawLayer(ctx, layer, v);
  const s = 2.6 * dpr;
  for (const p of layer.map.portals) {
    const q = toScreen(v, p.position.x, p.position.z);
    const inside = q.x > s && q.y > s && q.x < v.width - s && q.y < v.height - s;
    if (inside) portalMark(ctx, q.x, q.y, s * 1.4, t);
    else edgeHint(ctx, v, q.x, q.y, s * 1.6);
  }
  for (const b of frame.blips) {
    const q = toScreen(v, b.x, b.z);
    if (q.x < -s || q.y < -s || q.x > v.width + s || q.y > v.height + s) continue;
    blip(ctx, b, q.x, q.y, s, t);
  }
  if (frame.player) {
    const me = toScreen(v, frame.player.x, frame.player.z);
    viewCone(ctx, me.x, me.y, frame.cameraYaw, Math.min(v.width, v.height) * 0.42);
    arrow(ctx, me.x, me.y, frame.player.yaw, s * 2.3);
  }
}

/** Full local map (world-map "Khu vực" tab): whole map fitted, with names. */
export function drawLocalMap(
  ctx: CanvasRenderingContext2D,
  layer: MapLayer,
  frame: RadarFrame | null,
  content: Pick<ContentBundle, 'monsters' | 'npcs'>,
  v: View,
  dpr: number,
  t: number,
): void {
  const map = layer.map;
  drawLayer(ctx, layer, v);
  const s = 3 * dpr;
  const font = (px: number, weight = 650) =>
    `${weight} ${px * dpr}px "League Spartan", "Segoe UI", system-ui, sans-serif`;
  const label = (text: string, x: number, y: number, color: string, px = 12) => {
    ctx.font = font(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.2 * dpr;
    ctx.strokeStyle = 'rgba(5, 11, 15, 0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };

  // Zone names first, so markers sit on top.
  for (const z of map.zones) {
    // The map's own name is already in the side card.
    if (z.name === map.name) continue;
    const q = toScreen(v, z.center.x, z.center.z);
    const color =
      z.kind === 'safe'
        ? '#bff3d6'
        : z.kind === 'boss_arena'
          ? '#ffb39a'
          : z.kind === 'hazard'
            ? '#dcb6ff'
            : '#f2ecd8';
    label(
      z.name.toUpperCase(),
      q.x,
      Math.max(14 * dpr, q.y - z.radius * v.scale - 9 * dpr),
      color,
      13,
    );
  }
  // Monster camps: one marker per spawn group with the monster's name.
  for (const sp of map.spawns) {
    const m = content.monsters.get(sp.monsterId);
    const q = toScreen(v, sp.position.x, sp.position.z);
    const boss = m?.tier === 'boss' || m?.tier === 'world_boss';
    ctx.fillStyle = boss ? 'rgba(255, 74, 58, 0.22)' : 'rgba(226, 96, 76, 0.16)';
    ctx.beginPath();
    ctx.arc(q.x, q.y, Math.max(s * 2, (sp.radius + 2) * v.scale), 0, Math.PI * 2);
    ctx.fill();
    label(
      `${boss ? '☠ ' : ''}${m?.name ?? sp.monsterId}${sp.count > 1 ? ` ×${sp.count}` : ''}`,
      q.x,
      q.y,
      boss ? '#ff9b86' : '#f0a596',
      11,
    );
  }
  for (const n of map.npcs) {
    const q = toScreen(v, n.position.x, n.position.z);
    blip(ctx, { id: -1, kind: 'npc', x: 0, z: 0, engaged: false, selected: false }, q.x, q.y, s, t);
    label(content.npcs.get(n.npcId)?.name ?? n.npcId, q.x, q.y - s * 3.4, '#f7dc8c', 11);
  }
  for (const p of map.portals) {
    const q = toScreen(v, p.position.x, p.position.z);
    portalMark(ctx, q.x, q.y, s * 1.5, t);
    // Keep portal names inside the canvas when the portal hugs the map edge.
    const half = (ctx.measureText(p.name).width || 60) / 2 + 6 * dpr;
    label(p.name, Math.min(v.width - half, Math.max(half, q.x)), q.y + s * 4, '#a8efff', 11);
  }
  if (frame?.mapId === map.id) {
    for (const b of frame.blips)
      if (b.kind !== 'npc' && b.kind !== 'portal') {
        const q = toScreen(v, b.x, b.z);
        blip(ctx, b, q.x, q.y, s * 0.8, t);
      }
    if (frame.player) {
      const me = toScreen(v, frame.player.x, frame.player.z);
      ctx.strokeStyle = `rgba(214, 245, 226, ${0.4 + 0.3 * Math.sin(t * 4)})`;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(me.x, me.y, s * 4, 0, Math.PI * 2);
      ctx.stroke();
      arrow(ctx, me.x, me.y, frame.player.yaw, s * 2.4);
    }
  }
}

/** Scale that fits the whole map into a box (with a margin in pixels). */
export function fitView(map: MapDef, width: number, height: number, margin: number): View {
  const w = map.bounds.max.x - map.bounds.min.x;
  const h = map.bounds.max.z - map.bounds.min.z;
  return {
    scale: Math.min((width - margin * 2) / w, (height - margin * 2) / h),
    cx: (map.bounds.min.x + map.bounds.max.x) / 2,
    cz: (map.bounds.min.z + map.bounds.max.z) / 2,
    width,
    height,
  };
}
