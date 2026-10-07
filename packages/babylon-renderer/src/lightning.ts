import {
  type ArcRotateCamera,
  Color3,
  Constants,
  Material,
  Mesh,
  type Scene,
  StandardMaterial,
  Vector3,
  VertexBuffer,
} from './babylon';

/**
 * Procedural lightning bolts (Lôi Kiếm Tu skills): jagged lines made by
 * midpoint displacement, re-rolled ~14 times a second so they flicker like
 * hand-animated lightning. Each bolt is two camera-facing strips — a wide
 * coloured glow and a thin white core — and every bolt lives in ONE mesh
 * (one draw call, additive, no texture), which suits the flat low-poly look.
 */

/** Points per bolt = SEGMENTS + 1 (a power of two for midpoint displacement). */
const SEGMENTS = 16;
const POINTS = SEGMENTS + 1;
const MAX_BOLTS = 40;
/** Two strips (glow + core) × POINTS × 3 vertices (edge, centre, edge). */
const VERTS_PER_BOLT = 2 * POINTS * 3;
const FLICKER = 1 / 14;

export interface BoltSpec {
  from: Vector3;
  to: Vector3;
  color: Color3;
  /** Glow strip width in metres (the core is a third of it). */
  width?: number;
  /** Largest sideways displacement, metres (scaled down with each subdivision). */
  jitter?: number;
  life?: number;
  delay?: number;
  /** Side forks branching off the main bolt (thinner, shorter). */
  branches?: number;
  intensity?: number;
}

interface Bolt {
  from: Vector3;
  to: Vector3;
  color: Color3;
  width: number;
  jitter: number;
  life: number;
  delay: number;
  age: number;
  intensity: number;
  pts: Vector3[];
  /** Brightness of the current flicker frame. */
  flash: number;
  nextRoll: number;
}

export class LightningBatch {
  readonly mesh: Mesh;
  private readonly bolts: Bolt[] = [];
  private readonly positions = new Float32Array(MAX_BOLTS * VERTS_PER_BOLT * 3);
  private readonly colors = new Float32Array(MAX_BOLTS * VERTS_PER_BOLT * 4);
  private cap = MAX_BOLTS;
  private readonly tangent = new Vector3();
  private readonly view = new Vector3();
  private readonly side = new Vector3();

  constructor(
    scene: Scene,
    private readonly camera: ArcRotateCamera,
  ) {
    const indices: number[] = [];
    for (let b = 0; b < MAX_BOLTS; b++)
      for (let strip = 0; strip < 2; strip++) {
        const base = b * VERTS_PER_BOLT + strip * POINTS * 3;
        for (let i = 0; i < POINTS - 1; i++) {
          // Rows of (left, centre, right); two quads per segment.
          const a = base + i * 3;
          const n = a + 3;
          indices.push(a, a + 1, n, a + 1, n + 1, n);
          indices.push(a + 1, a + 2, n + 1, a + 2, n + 2, n + 1);
        }
      }
    this.mesh = new Mesh('fx_lightning', scene);
    this.mesh.setVerticesData(VertexBuffer.PositionKind, this.positions, true);
    this.mesh.setVerticesData(VertexBuffer.ColorKind, this.colors, true);
    this.mesh.setIndices(indices);
    const mat = new StandardMaterial('fx_lightning_mat', scene);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = Color3.White();
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    mat.alpha = 0.999;
    mat.fogEnabled = false;
    this.mesh.material = mat;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.setEnabled(false);
  }

  /** Max bolts alive at once (quality preset). */
  set capacity(n: number) {
    this.cap = Math.max(4, Math.min(MAX_BOLTS, n));
  }

  bolt(spec: BoltSpec): void {
    const width = spec.width ?? 0.2;
    const jitter = spec.jitter ?? Vector3.Distance(spec.from, spec.to) * 0.12;
    const life = spec.life ?? 0.25;
    const delay = spec.delay ?? 0;
    this.add({
      from: spec.from.clone(),
      to: spec.to.clone(),
      color: spec.color,
      width,
      jitter,
      life,
      delay,
      age: 0,
      intensity: spec.intensity ?? 1,
      pts: [],
      flash: 1,
      nextRoll: 0,
    });
    // Forks: leave the straight line part-way and wander off to one side.
    const len = Vector3.Distance(spec.from, spec.to);
    for (let i = 0; i < (spec.branches ?? 0); i++) {
      const t = 0.2 + Math.random() * 0.55;
      const start = Vector3.Lerp(spec.from, spec.to, t);
      const dir = spec.to.subtract(spec.from).normalize();
      const off = new Vector3(Math.random() - 0.5, -0.2, Math.random() - 0.5).normalize();
      const end = start
        .add(dir.scale(len * 0.22))
        .add(off.scale(len * (0.15 + Math.random() * 0.2)));
      if (end.y < 0.05) end.y = 0.05;
      this.add({
        from: start,
        to: end,
        color: spec.color,
        width: width * 0.5,
        jitter: jitter * 0.6,
        life: life * 0.7,
        delay: delay + 0.02,
        age: 0,
        intensity: (spec.intensity ?? 1) * 0.8,
        pts: [],
        flash: 1,
        nextRoll: 0,
      });
    }
  }

  private add(b: Bolt): void {
    if (this.bolts.length >= this.cap) {
      let oldest = 0;
      for (let i = 1; i < this.bolts.length; i++)
        if ((this.bolts[i]?.age ?? 0) > (this.bolts[oldest]?.age ?? 0)) oldest = i;
      this.bolts[oldest] = b;
      return;
    }
    this.bolts.push(b);
  }

  update(dt: number): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i] as Bolt;
      if (b.delay > 0) {
        b.delay -= dt;
        continue;
      }
      b.age += dt;
      if (b.age >= b.life) this.bolts.splice(i, 1);
    }
    if (this.bolts.length === 0) {
      if (this.mesh.isEnabled()) this.mesh.setEnabled(false);
      return;
    }
    this.mesh.setEnabled(true);
    const eye = this.camera.globalPosition;
    let n = 0;
    for (const b of this.bolts) {
      if (b.delay > 0) continue;
      if (b.age >= b.nextRoll) {
        jag(b.pts, b.from, b.to, b.jitter);
        b.flash = 0.55 + Math.random() * 0.45;
        b.nextRoll = b.age + FLICKER;
      }
      const f = b.age / b.life;
      // Full strength for the first third, then fading; first frame is a white-hot flash.
      const fade = (f < 0.3 ? 1 : 1 - (f - 0.3) / 0.7) * b.flash * b.intensity;
      const hot = b.age < 0.05 ? 1.6 : 1;
      // Soft glow (fades to nothing at its edges) under a hard white core.
      this.writeStrip(n, 0, b, eye, b.width * 1.6, b.color, fade, 0);
      this.writeStrip(n, 1, b, eye, b.width * 0.3, Color3.White(), Math.min(1, fade * hot), 0.6);
      n++;
    }
    // Collapse the unused tail so it draws nothing.
    this.positions.fill(0, n * VERTS_PER_BOLT * 3);
    this.colors.fill(0, n * VERTS_PER_BOLT * 4);
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions);
    this.mesh.updateVerticesData(VertexBuffer.ColorKind, this.colors);
  }

  private writeStrip(
    slot: number,
    strip: number,
    b: Bolt,
    eye: Vector3,
    width: number,
    color: Color3,
    k: number,
    /** Edge brightness relative to the centre. */
    edge: number,
  ): void {
    const base = slot * VERTS_PER_BOLT + strip * POINTS * 3;
    const pts = b.pts;
    for (let i = 0; i < POINTS; i++) {
      const p = pts[i] as Vector3;
      const prev = pts[Math.max(0, i - 1)] as Vector3;
      const next = pts[Math.min(POINTS - 1, i + 1)] as Vector3;
      next.subtractToRef(prev, this.tangent);
      eye.subtractToRef(p, this.view);
      Vector3.CrossToRef(this.tangent, this.view, this.side);
      const len = this.side.length();
      // Thins toward the far end, like a real stroke.
      const half = (width * (1 - 0.55 * (i / SEGMENTS))) / 2;
      if (len > 1e-6) this.side.scaleInPlace(half / len);
      const v = (base + i * 3) * 3;
      this.positions[v] = p.x - this.side.x;
      this.positions[v + 1] = p.y - this.side.y;
      this.positions[v + 2] = p.z - this.side.z;
      this.positions[v + 3] = p.x;
      this.positions[v + 4] = p.y;
      this.positions[v + 5] = p.z;
      this.positions[v + 6] = p.x + this.side.x;
      this.positions[v + 7] = p.y + this.side.y;
      this.positions[v + 8] = p.z + this.side.z;
      const c = (base + i * 3) * 4;
      for (const [o, m] of [
        [0, edge],
        [4, 1],
        [8, edge],
      ] as const) {
        this.colors[c + o] = color.r * k * m;
        this.colors[c + o + 1] = color.g * k * m;
        this.colors[c + o + 2] = color.b * k * m;
        this.colors[c + o + 3] = 1;
      }
    }
  }

  dispose(): void {
    this.mesh.material?.dispose();
    this.mesh.dispose();
    this.bolts.length = 0;
  }
}

/** Midpoint displacement between `from` and `to` into `out` (POINTS long). */
function jag(out: Vector3[], from: Vector3, to: Vector3, jitter: number): void {
  while (out.length < POINTS) out.push(new Vector3());
  (out[0] as Vector3).copyFrom(from);
  (out[SEGMENTS] as Vector3).copyFrom(to);
  const dir = to.subtract(from);
  const len = dir.length();
  if (len < 1e-6) {
    for (const p of out) p.copyFrom(from);
    return;
  }
  dir.scaleInPlace(1 / len);
  // Two axes perpendicular to the bolt.
  const helper = Math.abs(dir.y) > 0.9 ? Vector3.Right() : Vector3.Up();
  const u = Vector3.Cross(dir, helper).normalize();
  const w = Vector3.Cross(dir, u).normalize();
  let step = SEGMENTS;
  let amp = jitter;
  while (step > 1) {
    const half = step / 2;
    for (let i = half; i < SEGMENTS; i += step) {
      const a = out[i - half] as Vector3;
      const c = out[i + half] as Vector3;
      const p = out[i] as Vector3;
      p.set((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
      const du = (Math.random() * 2 - 1) * amp;
      const dw = (Math.random() * 2 - 1) * amp;
      p.x += u.x * du + w.x * dw;
      p.y += u.y * du + w.y * dw;
      p.z += u.z * du + w.z * dw;
    }
    step = half;
    amp *= 0.55;
  }
}
