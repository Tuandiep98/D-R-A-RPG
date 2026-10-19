import type { Element } from '@rpg/game-protocol';
import {
  type AbstractMesh,
  Color3,
  Constants,
  FresnelParameters,
  InstancedMesh,
  Material,
  Mesh,
  type Scene,
  StandardMaterial,
  Vector3,
  VertexBuffer,
  VertexData,
} from './babylon';
import type { CombatFx } from './combat-fx';
import {
  ELEMENT_TONES,
  type ElementBurst,
  elementBusy,
  elementStrength,
  type FxKind,
  fxKind,
} from './element-burst';
import type { EntityView } from './entity-view';
import type { LightningBatch } from './lightning';
import type { Feedback } from './thunder-fx';

/**
 * Tàn ảnh (afterimages) of a dashing body: while the dash runs, the caster's
 * current pose is copied every few hundredths of a second into a ghost mesh
 * (CPU-skinned once, world space, no skeleton) drawn as additive rim light in
 * the ngũ hành colour, fading where it was left. Used by Lôi Bộ
 * (`vfx: phantom_step`) and by Lôi Ảnh Trảm's dash.
 *
 * Ghost meshes are pooled; each copy costs one skinning pass of the body
 * (a few thousand vertices). Low: a third of the ghosts, no path motes.
 */

const MAX_GHOSTS = 28;
/** Vertex budget of one copy (body + gear); bigger models are skipped. */
const MAX_VERTS = 40_000;
const GHOST_LIFE = 0.5;

interface Ghost {
  mesh: Mesh;
  mat: StandardMaterial;
  age: number;
  life: number;
  color: Color3;
  k: number;
  busy: boolean;
}

interface Run {
  view: EntityView;
  id: number;
  left: number;
  every: number;
  due: number;
  kind: FxKind;
  k: number;
  last: Vector3;
  moteStep: number;
  moteDue: number;
}

const tmp = new Vector3();
const out = new Vector3();

export class PhantomStepFx {
  private readonly ghosts: Ghost[] = [];
  private readonly runs: Run[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly fx: CombatFx,
    private readonly bolts: LightningBatch,
    private readonly element: ElementBurst,
    private readonly level: () => number,
  ) {}

  private get low(): boolean {
    return this.fx.quality === 'low';
  }

  /** Starts leaving ghosts behind `view` for `seconds` (`count` at 100% on High). */
  start(
    view: EntityView,
    element: Element | null | undefined,
    expression: string | undefined,
    seconds: number,
    count = 12,
  ): void {
    const level = this.level();
    const kind = fxKind(element, expression, level);
    const tone = ELEMENT_TONES[kind];
    const n = Math.max(
      3,
      Math.round(count * elementBusy(level, this.fx.quality) * Math.sqrt(tone.density)),
    );
    const span = Math.max(0.12, seconds);
    const old = this.runs.findIndex((r) => r.view === view);
    if (old >= 0) this.runs.splice(old, 1);
    const p = view.root.position;
    this.runs.push({
      view,
      id: view.entityId,
      left: span,
      every: span / n,
      due: 0,
      kind,
      k: elementStrength(tone, level),
      last: new Vector3(p.x, 0, p.z),
      moteStep: this.low ? 0.9 : 0.35,
      moteDue: 0,
    });
    // Departure: a flash and a ring where the body leaves.
    this.fx.sprite({
      sprite: 'shock',
      x: p.x,
      y: 0.06,
      z: p.z,
      mode: 'flat',
      w: 0.5,
      grow: 3,
      life: 0.3,
      color: tone.color,
      intensity: 1.1,
    });
    this.fx.sprite({
      sprite: 'glow',
      x: p.x,
      y: view.height * 0.55,
      z: p.z,
      mode: 'billboard',
      w: 1.2,
      grow: 1.6,
      life: 0.22,
      color: tone.color,
      intensity: 1,
    });
  }

  /** Arrival (`from` → `to`): flash, element burst and the path scar. */
  arrive(
    view: EntityView | undefined,
    from: { x: number; z: number } | null,
    to: { x: number; z: number },
    element: Element | null | undefined,
    expression: string | undefined,
  ): Feedback {
    const level = this.level();
    const kind = fxKind(element, expression, level);
    const tone = ELEMENT_TONES[kind];
    const k = elementStrength(tone, level);
    this.fx.sprite({
      sprite: 'star',
      x: to.x,
      y: view ? view.height * 0.5 : 0.8,
      z: to.z,
      mode: 'billboard',
      w: 1.1,
      grow: 1.8,
      life: 0.18,
      color: Color3.Lerp(tone.color, Color3.White(), 0.5),
      intensity: 1.2,
    });
    this.fx.sprite({
      sprite: 'shock',
      x: to.x,
      y: 0.06,
      z: to.z,
      mode: 'flat',
      w: 0.6,
      grow: 3.2,
      life: 0.35,
      color: tone.color,
      intensity: 1.1,
    });
    this.element.burst(kind, to.x, to.z, 0.7, k);
    if (from) this.element.scar(kind, from.x, from.z, to.x, to.z, k);
    if (kind === 'thunder' && from) {
      this.bolts.bolt({
        from: new Vector3(from.x, 0.9, from.z),
        to: new Vector3(to.x, 0.9, to.z),
        color: tone.color,
        width: 0.2,
        jitter: 0.35,
        life: 0.25,
        branches: this.low ? 0 : 1,
      });
    }
    return { shake: 0.04, kick: 0, seconds: 0.12 };
  }

  update(dt: number): void {
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const r = this.runs[i] as Run;
      // The view may have been recycled for another entity.
      if (r.view.entityId !== r.id) {
        this.runs.splice(i, 1);
        continue;
      }
      r.left -= dt;
      r.due -= dt;
      if (r.due <= 0) {
        r.due += r.every;
        this.capture(r);
      }
      this.motes(r);
      if (r.left <= 0) this.runs.splice(i, 1);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i] as Ghost;
      if (!g.busy) continue;
      g.age += dt;
      const f = g.age / g.life;
      if (f >= 1) {
        g.busy = false;
        g.mesh.setEnabled(false);
        continue;
      }
      // Bright when left, then thinning out.
      g.mat.alpha = Math.max(0, (1 - f) ** 1.4) * g.k;
    }
  }

  dispose(): void {
    for (const g of this.ghosts) {
      g.mat.dispose();
      g.mesh.dispose();
    }
    this.ghosts.length = 0;
    this.runs.length = 0;
  }

  /** Element motes at the feet along the dash path. */
  private motes(r: Run): void {
    if (r.kind === 'none') return;
    const p = r.view.root.position;
    tmp.set(p.x, 0, p.z);
    const d = Vector3.Distance(tmp, r.last);
    r.moteDue -= d;
    r.last.copyFrom(tmp);
    if (r.moteDue > 0) return;
    r.moteDue = r.moteStep;
    this.element.mote(r.kind, p.x, 0.3 + Math.random() * r.view.height * 0.6, p.z, r.k);
  }

  /** Copies the body's pose right now into a ghost. */
  private capture(r: Run): void {
    const meshes = r.view.bodyMeshes();
    const positions: number[] = [];
    const indices: number[] = [];
    let base = 0;
    for (const mesh of meshes) {
      const geometry = mesh instanceof InstancedMesh ? mesh.sourceMesh : mesh;
      const idx = geometry.getIndices();
      const local =
        mesh instanceof InstancedMesh
          ? mesh.sourceMesh.getVerticesData(VertexBuffer.PositionKind)
          : (mesh as AbstractMesh).getPositionData(true, true);
      if (!idx || !local) continue;
      const count = local.length / 3;
      if (base + count > MAX_VERTS) break;
      const world = mesh.computeWorldMatrix(true);
      for (let v = 0; v < count; v++) {
        tmp.set(local[v * 3] as number, local[v * 3 + 1] as number, local[v * 3 + 2] as number);
        Vector3.TransformCoordinatesToRef(tmp, world, out);
        positions.push(out.x, out.y, out.z);
      }
      for (let i = 0; i < idx.length; i++) indices.push((idx[i] as number) + base);
      base += count;
    }
    if (base === 0) return;
    const g = this.ghost();
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    data.normals = normals;
    data.applyToMesh(g.mesh, false);
    const color = ELEMENT_TONES[r.kind].color;
    g.color = color;
    g.mat.emissiveColor.copyFrom(color).scaleInPlace(1.25);
    g.mat.emissiveFresnelParameters?.leftColor.copyFrom(Color3.Lerp(color, Color3.White(), 0.35));
    g.age = 0;
    g.life = GHOST_LIFE * (this.low ? 0.8 : 1);
    // Many overlap additively: cap each so bright elements (Kim) do not burn white.
    g.k = Math.min(0.75, 0.62 * r.k);
    g.mat.alpha = g.k;
    g.busy = true;
    g.mesh.setEnabled(true);
  }

  /** A free pooled ghost, or the oldest one when all are in use. */
  private ghost(): Ghost {
    const cap = this.low ? 10 : MAX_GHOSTS;
    let g = this.ghosts.find((x) => !x.busy);
    if (!g && this.ghosts.length < cap) {
      const mesh = new Mesh(`fx_ghost_${this.ghosts.length}`, this.scene);
      const mat = new StandardMaterial(`fx_ghost_mat_${this.ghosts.length}`, this.scene);
      mat.diffuseColor = Color3.Black();
      mat.specularColor = Color3.Black();
      mat.disableLighting = true;
      mat.backFaceCulling = true;
      mat.disableDepthWrite = true;
      mat.alphaMode = Constants.ALPHA_ADD;
      mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
      mat.fogEnabled = false;
      // Rim light: bright silhouette edges, faint body — reads as an afterimage.
      mat.emissiveFresnelParameters = new FresnelParameters({
        bias: 0.3,
        power: 1.3,
        leftColor: Color3.White(),
        rightColor: new Color3(0.35, 0.35, 0.35),
      });
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.setEnabled(false);
      g = {
        mesh,
        mat,
        age: 0,
        life: GHOST_LIFE,
        color: Color3.White(),
        k: 1,
        busy: false,
      };
      this.ghosts.push(g);
    }
    if (!g) {
      g = this.ghosts.reduce((a, b) => (b.age > a.age ? b : a));
    }
    return g;
  }
}
