import type { GroundPaint, MapDef } from '@rpg/game-data';
import {
  Color3,
  DynamicTexture,
  type Mesh,
  MeshBuilder,
  type Scene,
  StandardMaterial,
} from './babylon';

/** Target spacing between painted ground vertices, metres. */
const CELL = 1.25;
/** Upper bound on subdivisions per axis (keeps huge maps cheap). */
const MAX_SUBDIVISIONS = 160;
/** Detail texture repeats every this many metres. */
const DETAIL_TILE = 5;

type Rgb = [number, number, number];

const hex = (h: string): Rgb => {
  const c = Color3.FromHexString(h);
  return [c.r, c.g, c.b];
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Deterministic value noise in [0, 1] (seeded per map so it never shimmers). */
function valueNoise(seed: number) {
  const hash = (x: number, z: number) => {
    let h = (x * 374761393 + z * 668265263 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  return (x: number, z: number) => {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const fx = smooth(x - xi);
    const fz = smooth(z - zi);
    const a = hash(xi, zi);
    const b = hash(xi + 1, zi);
    const c = hash(xi, zi + 1);
    const d = hash(xi + 1, zi + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = dx * dx + dz * dz;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Colour of the ground at a world point (base + noise + patches + strokes). */
export function groundColorAt(
  base: Rgb,
  paint: GroundPaint,
  noise: (x: number, z: number) => number,
  x: number,
  z: number,
): Rgb {
  let c = base;
  if (paint.variation.length > 0) {
    const s = paint.noiseScale;
    const amount = (noise(x / s, z / s) * 0.7 + noise((x / s) * 3.1, (z / s) * 3.1) * 0.3) ** 1.2;
    const pick = noise(x / (s * 2.3) + 41.7, z / (s * 2.3) - 13.1) * paint.variation.length;
    const i = Math.min(paint.variation.length - 1, Math.floor(pick));
    const tint = hex(paint.variation[i] as string);
    c = mix(c, tint, smooth(amount) * paint.noiseAmount);
  }
  for (const p of paint.patches) {
    const d = Math.hypot(x - p.center.x, z - p.center.z);
    // Ragged edge so camps do not look like perfect circles.
    const rag = (noise(x / 3 + 7, z / 3 - 3) - 0.5) * p.edge;
    const t = 1 - smooth((d - p.radius + p.edge + rag) / Math.max(0.01, p.edge));
    if (t > 0) c = mix(c, hex(p.color), t);
  }
  for (const s of paint.strokes) {
    let d = Number.POSITIVE_INFINITY;
    for (let i = 0; i + 1 < s.points.length; i++) {
      const a = s.points[i];
      const b = s.points[i + 1];
      if (a && b) d = Math.min(d, distToSegment(x, z, a.x, a.z, b.x, b.z));
    }
    const rag = (noise(x / 2.5 - 11, z / 2.5 + 5) - 0.5) * s.edge;
    const t = 1 - smooth((d - s.width / 2 + s.edge + rag) / Math.max(0.01, s.edge));
    if (t > 0) {
      // Slight colour noise inside the road reads as packed dirt, not paint.
      const grit = 0.9 + noise(x * 0.9 + 3, z * 0.9) * 0.2;
      const road = hex(s.color).map((v) => v * grit) as Rgb;
      c = mix(c, road, t);
    }
  }
  return c;
}

/** Tileable grey speckle multiplied over the vertex colours (ground grain). */
function detailTexture(scene: Scene, seed: number): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture('ground_detail', { width: size, height: size }, scene, true);
  const ctx = tex.getContext();
  const img = ctx.getImageData(0, 0, size, size);
  const noise = valueNoise(seed + 17);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Two octaves sampled on a torus-like lattice so the tile repeats seamlessly.
      const n =
        noise((x / size) * 16, (y / size) * 16) * 0.6 +
        noise((x / size) * 48, (y / size) * 48) * 0.4;
      const v = Math.round(255 * (0.8 + n * 0.2));
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.update(false);
  tex.wrapU = 1; // WRAP
  tex.wrapV = 1;
  return tex;
}

/**
 * Flat ground for a map. Without `ground.paint` it is a single quad in the
 * base colour (as before); with it, a subdivided plane coloured per vertex.
 * Either way it is one mesh and one draw call.
 */
export function createGround(scene: Scene, map: MapDef): Mesh {
  const width = map.bounds.max.x - map.bounds.min.x;
  const depth = map.bounds.max.z - map.bounds.min.z;
  const paint = map.ground.paint;
  const subdivisions = paint
    ? Math.min(MAX_SUBDIVISIONS, Math.ceil(Math.max(width, depth) / CELL))
    : 1;
  const ground = MeshBuilder.CreateGround(
    'ground',
    { width, height: depth, subdivisions, updatable: false },
    scene,
  );
  const cx = map.bounds.min.x + width / 2;
  const cz = map.bounds.min.z + depth / 2;
  ground.position.set(cx, 0, cz);

  const mat = new StandardMaterial(`ground_${map.id}`, scene);
  mat.specularColor = new Color3(0.03, 0.03, 0.03);
  if (!paint) {
    mat.diffuseColor = Color3.FromHexString(map.ground.color);
  } else {
    const base = hex(map.ground.color);
    const noise = valueNoise(map.seed);
    const positions = ground.getVerticesData('position');
    if (positions) {
      const colors = new Float32Array((positions.length / 3) * 4);
      for (let v = 0, i = 0; v < positions.length; v += 3, i += 4) {
        const c = groundColorAt(
          base,
          paint,
          noise,
          (positions[v] ?? 0) + cx,
          (positions[v + 2] ?? 0) + cz,
        );
        colors[i] = c[0];
        colors[i + 1] = c[1];
        colors[i + 2] = c[2];
        colors[i + 3] = 1;
      }
      ground.setVerticesData('color', colors, false, 4);
    }
    const detail = detailTexture(scene, map.seed);
    detail.uScale = width / DETAIL_TILE;
    detail.vScale = depth / DETAIL_TILE;
    mat.diffuseTexture = detail;
  }
  ground.material = mat;
  return ground;
}
