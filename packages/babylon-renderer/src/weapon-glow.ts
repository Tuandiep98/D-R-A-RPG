import type { AppearanceDef } from '@rpg/game-data';
import {
  type AbstractMesh,
  Color3,
  Constants,
  GlowLayer,
  InstancedMesh,
  Material,
  Matrix,
  Mesh,
  type Node,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from './babylon';
import type { CombatFx } from './combat-fx';
import type { QualityLevel } from './quality';

export type WeaponGlowDef = NonNullable<AppearanceDef['glow']>;

/** Player brightness setting: 0 = off, 1 = as authored, 2 = twice as bright. */
export const WEAPON_GLOW_MAX = 2;

/** Light the additive shell adds at strength 1. */
const SHELL_GAIN = 0.6;
/** Shell offset along the normals, as a share of the glowing part's length. */
const SHELL_INFLATE = 0.012;

interface Shell {
  readonly mesh: Mesh;
  readonly mat: StandardMaterial;
  readonly def: WeaponGlowDef;
  readonly color: Color3;
  /** Model-local points on the glowing part (sparkles start there). */
  readonly points: Float32Array;
  /** Portrait shells: no glow layer, no sparkles, no breathing. */
  readonly still: boolean;
  phase: number;
  sparkleDue: number;
}

const registry = new WeakMap<Scene, WeaponGlow>();
const tmp = new Vector3();
const tmpWorld = new Vector3();

/**
 * Linh quang on equipment (appearance `glow`): an additive shell over the
 * glowing triangles, a glow layer limited to those shells (Medium/High) and
 * star twinkles along them. In-hand models and item portraits build the shell
 * the same way, so the icon matches what the character holds.
 */
export class WeaponGlow {
  private readonly shells = new Set<Shell>();
  private layer: GlowLayer | null = null;
  private levelValue = 1;
  private quality: QualityLevel = 'high';
  private time = 0;

  private constructor(
    private readonly scene: Scene,
    private readonly fx: CombatFx | null,
  ) {}

  /** One per scene; gear attachments find it with `WeaponGlow.of(scene)`. */
  static install(scene: Scene, fx: CombatFx | null): WeaponGlow {
    const glow = new WeaponGlow(scene, fx);
    registry.set(scene, glow);
    return glow;
  }

  static of(scene: Scene): WeaponGlow | null {
    return registry.get(scene) ?? null;
  }

  get level(): number {
    return this.levelValue;
  }

  setLevel(level: number): void {
    this.levelValue = Math.min(WEAPON_GLOW_MAX, Math.max(0, Number.isFinite(level) ? level : 1));
    for (const s of this.shells) this.paint(s, 1);
    this.syncLayer();
  }

  setQuality(level: QualityLevel): void {
    this.quality = level;
    this.syncLayer();
  }

  /**
   * Builds shells over every mesh under `model` (instances included).
   * Returns a disposer; disposing the model also removes them.
   */
  attach(
    model: TransformNode,
    def: WeaponGlowDef,
    opts: { still?: boolean; layerMask?: number } = {},
  ): () => void {
    const color = Color3.FromHexString(def.color);
    const made: Shell[] = [];
    refreshWorld(model);
    const toModel = Matrix.Invert(model.computeWorldMatrix(true));
    for (const m of model.getChildMeshes(false)) {
      const shell = this.buildShell(
        model,
        toModel,
        m,
        def,
        color,
        opts.still === true,
        opts.layerMask,
      );
      if (shell) made.push(shell);
    }
    for (const s of made) {
      this.shells.add(s);
      this.paint(s, 1);
      if (!s.still) this.layer?.addIncludedOnlyMesh(s.mesh);
    }
    this.syncLayer();
    const dispose = () => {
      for (const s of made) {
        if (!this.shells.delete(s)) continue;
        this.layer?.removeIncludedOnlyMesh(s.mesh);
        s.mat.dispose();
        s.mesh.dispose();
      }
      // An empty include list would make the layer glow every emissive mesh.
      this.syncLayer();
    };
    model.onDisposeObservable.addOnce(dispose);
    return dispose;
  }

  /** Breathing light and sparkles; cheap when nothing glows. */
  update(dt: number): void {
    if (this.shells.size === 0) return;
    this.time += dt;
    const sparkles = !!this.fx && this.quality !== 'low' && this.levelValue > 0;
    for (const s of this.shells) {
      if (s.still || !s.mesh.isEnabled(true)) continue;
      this.paint(s, 0.86 + 0.14 * Math.sin(this.time * 2.6 + s.phase));
      if (!sparkles || s.def.sparkle <= 0 || s.points.length === 0) continue;
      s.sparkleDue -= dt;
      if (s.sparkleDue > 0) continue;
      const rate = s.def.sparkle * (this.fx?.density ?? 1) * Math.min(1.5, this.levelValue);
      s.sparkleDue = rate > 0 ? (0.6 + Math.random() * 0.8) / rate : 1;
      this.twinkle(s);
    }
  }

  dispose(): void {
    for (const s of [...this.shells]) {
      s.mat.dispose();
      s.mesh.dispose();
    }
    this.shells.clear();
    this.layer?.dispose();
    this.layer = null;
    if (registry.get(this.scene) === this) registry.delete(this.scene);
  }

  /**
   * Shell geometry lives in model space (the node `glow.from` is measured in):
   * runtime GLBs are meshopt-quantized, so mesh-local coordinates are not the
   * authored ones until the node transforms are applied.
   */
  private buildShell(
    model: TransformNode,
    toModel: Matrix,
    m: AbstractMesh,
    def: WeaponGlowDef,
    color: Color3,
    still: boolean,
    layerMask: number | undefined,
  ): Shell | null {
    const source = m instanceof InstancedMesh ? m.sourceMesh : m instanceof Mesh ? m : null;
    const raw = source?.getVerticesData(VertexBuffer.PositionKind);
    const rawNormals = source?.getVerticesData(VertexBuffer.NormalKind);
    const indices = source?.getIndices();
    if (!source || !raw || !rawNormals || !indices) return null;

    const rel = m.computeWorldMatrix(true).multiply(toModel);
    const count = raw.length / 3;
    const positions = new Float32Array(raw.length);
    const normals = new Float32Array(raw.length);
    for (let v = 0; v < count; v++) {
      tmp.set(raw[v * 3] as number, raw[v * 3 + 1] as number, raw[v * 3 + 2] as number);
      Vector3.TransformCoordinatesToRef(tmp, rel, tmpWorld);
      positions[v * 3] = tmpWorld.x;
      positions[v * 3 + 1] = tmpWorld.y;
      positions[v * 3 + 2] = tmpWorld.z;
      tmp.set(
        rawNormals[v * 3] as number,
        rawNormals[v * 3 + 1] as number,
        rawNormals[v * 3 + 2] as number,
      );
      Vector3.TransformNormalToRef(tmp, rel, tmpWorld);
      tmpWorld.normalize();
      normals[v * 3] = tmpWorld.x;
      normals[v * 3 + 1] = tmpWorld.y;
      normals[v * 3 + 2] = tmpWorld.z;
    }

    const kept: number[] = [];
    let top = def.from;
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const a = indices[i] as number;
      const b = indices[i + 1] as number;
      const c = indices[i + 2] as number;
      const ya = positions[a * 3 + 1] as number;
      const yb = positions[b * 3 + 1] as number;
      const yc = positions[c * 3 + 1] as number;
      if (ya < def.from || yb < def.from || yc < def.from) continue;
      kept.push(a, b, c);
      top = Math.max(top, ya, yb, yc);
    }
    if (kept.length === 0) return null;

    const inflate = Math.max(0.004, (top - def.from) * SHELL_INFLATE);
    const grown = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i++)
      grown[i] = (positions[i] as number) + (normals[i] as number) * inflate;
    const used = new Set(kept);
    const points = new Float32Array(used.size * 3);
    let p = 0;
    for (const v of used) {
      points[p++] = positions[v * 3] as number;
      points[p++] = positions[v * 3 + 1] as number;
      points[p++] = positions[v * 3 + 2] as number;
    }

    const mesh = new Mesh(`${m.name}_glow`, this.scene);
    const data = new VertexData();
    data.positions = grown;
    data.normals = normals;
    data.indices = kept;
    data.applyToMesh(mesh, false);
    mesh.parent = model;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.layerMask = layerMask ?? m.layerMask;

    const mat = new StandardMaterial(`${m.name}_glow_mat`, this.scene);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mat.fogEnabled = false;
    // Baked through mirrored glTF roots the winding varies by source: draw both
    // sides (a few hundred triangles).
    mat.backFaceCulling = false;
    if (!still) {
      mat.disableDepthWrite = true;
      mat.alphaMode = Constants.ALPHA_ADD;
      mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    }
    // Still (icon captures): an opaque luminous blade. Render-target captures
    // drop the additive shell, and a solid light reads better at icon size.
    mesh.material = mat;

    return {
      mesh,
      mat,
      def,
      color,
      points,
      still,
      phase: Math.random() * Math.PI * 2,
      sparkleDue: Math.random(),
    };
  }

  private paint(s: Shell, breath: number): void {
    const strength = s.def.intensity * this.levelValue;
    s.mesh.setEnabled(strength > 0);
    if (s.still) {
      Color3.LerpToRef(s.color, Color3.White(), 0.25, s.mat.emissiveColor);
      s.mat.emissiveColor.scaleInPlace(Math.min(1.2, 0.6 + 0.3 * strength));
    } else s.color.scaleToRef(SHELL_GAIN * Math.min(2, strength) * breath, s.mat.emissiveColor);
  }

  private twinkle(s: Shell): void {
    const n = s.points.length / 3;
    const i = Math.floor(Math.random() * n) * 3;
    tmp.set(s.points[i] as number, s.points[i + 1] as number, s.points[i + 2] as number);
    Vector3.TransformCoordinatesToRef(tmp, s.mesh.getWorldMatrix(), tmpWorld);
    const roll = Math.random() * Math.PI;
    this.fx?.sprite({
      sprite: 'star',
      x: tmpWorld.x,
      y: tmpWorld.y,
      z: tmpWorld.z,
      mode: 'billboard',
      w: 0.07 + Math.random() * 0.07,
      life: 0.45 + Math.random() * 0.4,
      color: Color3.Lerp(s.color, Color3.White(), 0.45),
      intensity: Math.min(1.6, 0.7 + 0.5 * this.levelValue),
      roll,
      rollEnd: roll + 1.2,
      grow: 0.4,
      vy: 0.12,
      fadeIn: 0.35,
    });
  }

  /** Glow layer only on Medium/High, only over in-hand shells. */
  private syncLayer(): void {
    const want =
      this.quality !== 'low' && this.levelValue > 0 && [...this.shells].some((s) => !s.still);
    if (want && !this.layer) {
      this.layer = new GlowLayer('weapon_glow', this.scene, {
        mainTextureRatio: 0.35,
        blurKernelSize: 24,
      });
      for (const s of this.shells) if (!s.still) this.layer.addIncludedOnlyMesh(s.mesh);
    }
    if (this.layer) {
      this.layer.isEnabled = want;
      this.layer.intensity = 0.55 * Math.min(1.6, this.levelValue);
    }
  }
}

/**
 * Recomputes world matrices from the root down to every node under `model`:
 * nodes created this frame (a fresh capture) still hold stale cached matrices.
 */
function refreshWorld(model: TransformNode): void {
  const chain: Node[] = [];
  for (let n: Node | null = model; n; n = n.parent) chain.unshift(n);
  for (const n of chain) if (n instanceof TransformNode) n.computeWorldMatrix(true);
  for (const n of model.getDescendants(false))
    if (n instanceof TransformNode) n.computeWorldMatrix(true);
}
