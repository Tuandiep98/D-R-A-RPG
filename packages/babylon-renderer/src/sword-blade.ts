import {
  type Color3,
  Constants,
  Material,
  Matrix,
  Mesh,
  type Quaternion,
  type Scene,
  StandardMaterial,
  Vector3,
  VertexData,
} from './babylon';

/**
 * Light swords for technique VFX (mưa kiếm, kiếm khí): one thin-instance batch
 * of procedural jian, drawn twice — a wide faint hull in the colour (fakes
 * bloom without a glow layer) and a thin bright core. Two draw calls however
 * many swords; callers own the sword list and refill the batch every frame.
 */
export class BladeBatch {
  private readonly hull: Mesh;
  private readonly core: Mesh;
  private readonly hullMatrices: Float32Array;
  private readonly hullColors: Float32Array;
  private readonly coreMatrices: Float32Array;
  private readonly coreColors: Float32Array;
  private n = 0;

  constructor(
    scene: Scene,
    name: string,
    readonly capacity: number,
  ) {
    this.hullMatrices = new Float32Array(capacity * 16);
    this.hullColors = new Float32Array(capacity * 4);
    this.coreMatrices = new Float32Array(capacity * 16);
    this.coreColors = new Float32Array(capacity * 4);
    this.hull = makeMesh(scene, `${name}_hull`, this.hullMatrices, this.hullColors);
    this.core = makeMesh(scene, `${name}_core`, this.coreMatrices, this.coreColors);
  }

  begin(): void {
    this.n = 0;
  }

  /**
   * One sword: tip at `pos`, blade along the rotated +Y (hilt side), `k` its
   * brightness (alpha × intensity; additive, so 0 is invisible); `width`
   * widens the blade only (broad sword qi).
   */
  add(pos: Vector3, rot: Quaternion, scale: number, color: Color3, k: number, width = 1): void {
    if (this.n >= this.capacity) return;
    const i = this.n++;
    s.set(scale * 1.9 * width, scale * 1.03, scale * 1.9);
    Matrix.ComposeToRef(s, rot, pos, m);
    m.copyToArray(this.hullMatrices, i * 16);
    this.hullColors[i * 4] = color.r * k * 0.35;
    this.hullColors[i * 4 + 1] = color.g * k * 0.35;
    this.hullColors[i * 4 + 2] = color.b * k * 0.35;
    this.hullColors[i * 4 + 3] = 1;
    s.set(scale * width, scale, scale);
    Matrix.ComposeToRef(s, rot, pos, m);
    m.copyToArray(this.coreMatrices, i * 16);
    this.coreColors[i * 4] = (color.r * 0.75 + 0.2) * k * 0.75;
    this.coreColors[i * 4 + 1] = (color.g * 0.75 + 0.2) * k * 0.75;
    this.coreColors[i * 4 + 2] = (color.b * 0.75 + 0.2) * k * 0.75;
    this.coreColors[i * 4 + 3] = 1;
  }

  end(): void {
    for (const mesh of [this.hull, this.core]) {
      mesh.thinInstanceCount = this.n;
      mesh.setEnabled(this.n > 0);
      if (this.n > 0) {
        mesh.thinInstanceBufferUpdated('matrix');
        mesh.thinInstanceBufferUpdated('color');
      }
    }
  }

  dispose(): void {
    this.hull.dispose();
    this.core.dispose();
  }
}

const m = new Matrix();
const s = new Vector3();

function makeMesh(scene: Scene, name: string, matrices: Float32Array, colors: Float32Array): Mesh {
  const mesh = new Mesh(name, scene);
  swordGeometry().applyToMesh(mesh, false);
  const mat = new StandardMaterial(`${name}_mat`, scene);
  mat.diffuseColor.set(0, 0, 0);
  mat.specularColor.set(0, 0, 0);
  mat.emissiveColor.set(1, 1, 1);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  mat.alphaMode = Constants.ALPHA_ADD;
  mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
  mat.fogEnabled = false;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
  mesh.thinInstanceSetBuffer('color', colors, 4, false);
  mesh.thinInstanceCount = 0;
  mesh.setEnabled(false);
  return mesh;
}

/**
 * A straight jian, tip at the origin, hilt up +Y (~1.3 m): diamond-section
 * blade, slim crossguard, grip and pommel. Unlit, so no normals.
 */
function swordGeometry(): VertexData {
  const pos: number[] = [];
  const idx: number[] = [];
  const ring = (y: number, w: number, t: number): number => {
    const i = pos.length / 3;
    pos.push(w, y, 0, 0, y, t, -w, y, 0, 0, y, -t);
    return i;
  };
  const point = (y: number): number => {
    pos.push(0, y, 0);
    return pos.length / 3 - 1;
  };
  const cone = (apex: number, r: number) => {
    for (let k = 0; k < 4; k++) idx.push(apex, r + k, r + ((k + 1) % 4));
  };
  const band = (a: number, b: number) => {
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      idx.push(a + k, b + k, b + k1, a + k, b + k1, a + k1);
    }
  };
  const box = (y0: number, y1: number, w: number, t: number) => {
    const i = pos.length / 3;
    for (const y of [y0, y1]) pos.push(-w, y, -t, w, y, -t, w, y, t, -w, y, t);
    const f = [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [1, 5, 6, 2],
      [2, 6, 7, 3],
      [3, 7, 4, 0],
    ];
    for (const [a, b, c, d] of f as [number, number, number, number][])
      idx.push(i + a, i + b, i + c, i + a, i + c, i + d);
  };
  // Blade.
  const tip = point(0);
  const shoulder = ring(0.18, 0.048, 0.014);
  const base = ring(0.95, 0.038, 0.012);
  cone(tip, shoulder);
  band(shoulder, base);
  // Crossguard, grip, pommel.
  box(0.95, 0.99, 0.1, 0.028);
  box(0.99, 1.2, 0.018, 0.018);
  const pommel = ring(1.24, 0.032, 0.032);
  cone(point(1.2), pommel);
  cone(point(1.29), pommel);
  const data = new VertexData();
  data.positions = pos;
  data.indices = idx;
  return data;
}
