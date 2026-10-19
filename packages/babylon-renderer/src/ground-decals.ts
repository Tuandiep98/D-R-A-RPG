import {
  Color3,
  Constants,
  DynamicTexture,
  Material,
  Matrix,
  type Mesh,
  MeshBuilder,
  Quaternion,
  type Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from './babylon';

/**
 * Dark burn marks on the ground (sky strikes, giant sword craters, long cuts).
 * CombatFx sprites are additive and cannot darken anything, so these are
 * alpha-blended: one thin-instance batch, per-mark alpha in the instance
 * colour, oldest replaced when full. Low keeps a quarter of the marks.
 */

const MAX_MARKS = 32;
const FADE_IN = 0.08;

interface Mark {
  x: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
  age: number;
  life: number;
  darkness: number;
}

const m = new Matrix();
const q = new Quaternion();
const s = new Vector3();
const p = new Vector3();

export class GroundDecals {
  private readonly mesh: Mesh;
  private readonly marks: Mark[] = [];
  private readonly matrices = new Float32Array(MAX_MARKS * 16);
  private readonly colors = new Float32Array(MAX_MARKS * 4);
  private cap = MAX_MARKS;

  constructor(scene: Scene, url: string | null) {
    this.mesh = MeshBuilder.CreatePlane('fx_ground_decals', { size: 1 }, scene);
    const mat = new StandardMaterial('fx_ground_decals_mat', scene);
    const texture = url
      ? new Texture(url, scene, { noMipmap: false, invertY: true })
      : burnTexture(scene);
    texture.hasAlpha = true;
    mat.diffuseTexture = texture;
    mat.useAlphaFromDiffuseTexture = true;
    // Charcoal, not pure black: reads as burnt earth on grass and dirt alike.
    mat.diffuseColor = new Color3(0.06, 0.045, 0.035);
    mat.specularColor = Color3.Black();
    mat.emissiveColor = Color3.Black();
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.alphaMode = Constants.ALPHA_COMBINE;
    mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    mat.zOffset = -2;
    mat.fogEnabled = false;
    this.mesh.material = mat;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.hasVertexAlpha = true;
    this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    this.mesh.thinInstanceSetBuffer('color', this.colors, 4, false);
    this.mesh.thinInstanceCount = 0;
    this.mesh.setEnabled(false);
  }

  setQuality(level: 'low' | 'medium' | 'high'): void {
    this.cap = level === 'low' ? 8 : level === 'medium' ? 20 : MAX_MARKS;
    while (this.marks.length > this.cap) this.marks.shift();
  }

  /** A burn `w` × `h` metres (h along `yaw`), fading out over the last third of `life`. */
  add(
    x: number,
    z: number,
    w: number,
    opts: { h?: number; yaw?: number; life?: number; darkness?: number } = {},
  ): void {
    if (this.marks.length >= this.cap) this.marks.shift();
    this.marks.push({
      x,
      z,
      yaw: opts.yaw ?? Math.random() * Math.PI * 2,
      w,
      h: opts.h ?? w,
      age: 0,
      life: opts.life ?? 6,
      darkness: opts.darkness ?? 0.85,
    });
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const mark = this.marks[i] as Mark;
      mark.age += dt;
      if (mark.age >= mark.life) this.marks.splice(i, 1);
    }
    for (const mark of this.marks) {
      const f = mark.age / mark.life;
      const alpha =
        mark.darkness *
        Math.min(1, mark.age / FADE_IN) *
        (f < 0.66 ? 1 : Math.max(0, 1 - (f - 0.66) / 0.34));
      Quaternion.RotationYawPitchRollToRef(mark.yaw, Math.PI / 2, 0, q);
      s.set(mark.w, mark.h, 1);
      p.set(mark.x, 0.035, mark.z);
      Matrix.ComposeToRef(s, q, p, m);
      m.copyToArray(this.matrices, n * 16);
      this.colors[n * 4] = 1;
      this.colors[n * 4 + 1] = 1;
      this.colors[n * 4 + 2] = 1;
      this.colors[n * 4 + 3] = alpha;
      n++;
    }
    this.mesh.thinInstanceCount = n;
    this.mesh.setEnabled(n > 0);
    if (n > 0) {
      this.mesh.thinInstanceBufferUpdated('matrix');
      this.mesh.thinInstanceBufferUpdated('color');
    }
  }

  dispose(): void {
    this.marks.length = 0;
    this.mesh.dispose();
  }
}

/** Fallback when the scorch sprite is not built: a soft ragged blot. */
function burnTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const t = new DynamicTexture('fx_burn_tex', { width: size, height: size }, scene, false);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  t.update();
  return t;
}
