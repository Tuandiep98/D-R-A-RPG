import type { AssetLibrary } from '@rpg/asset-runtime';
import type { AppearanceDef } from '@rpg/game-data';
import type { EntityAction, EntityId } from '@rpg/game-protocol';
import {
  Color3,
  type Mesh,
  MeshBuilder,
  type Scene,
  type ShadowGenerator,
  StandardMaterial,
  TransformNode,
} from './babylon';
import {
  type GearAppearances,
  ModelVisual,
  type OneShotRole,
  PlaceholderVisual,
  type Visual,
} from './visuals';

export interface PickMetadata {
  entityId: EntityId;
}

let viewCounter = 0;
const barMaterials = new WeakMap<Scene, { bg: StandardMaterial; fg: StandardMaterial }>();

function hpBarMaterials(scene: Scene) {
  let m = barMaterials.get(scene);
  if (!m) {
    const bg = new StandardMaterial('hpbar_bg', scene);
    bg.emissiveColor = new Color3(0.08, 0.08, 0.08);
    bg.disableLighting = true;
    const fg = new StandardMaterial('hpbar_fg', scene);
    fg.emissiveColor = new Color3(0.85, 0.2, 0.18);
    fg.disableLighting = true;
    m = { bg, fg };
    barMaterials.set(scene, m);
  }
  return m;
}

/**
 * Presentation of one simulated entity. Owns a root node, an invisible pick
 * capsule and a Visual (placeholder first, real model once loaded).
 * Views are pooled per appearance and re-bound to new entity ids.
 */
export class EntityView {
  readonly root: TransformNode;
  readonly radius: number;
  readonly height: number;
  entityId: EntityId = 0;
  private readonly pick: Mesh;
  private visual: Visual;
  private action: EntityAction | null = null;
  private gear: GearAppearances = {};
  private hpBar: { root: TransformNode; fg: Mesh } | null = null;
  private castShadows = false;
  /** Swing facing that overrides the (100 ms late) snapshot yaw for a while. */
  private face: { yaw: number; left: number } | null = null;
  private shownYaw: number | null = null;
  /** Knock-back offset of the visual (world metres), springs back to 0. */
  private readonly knockOffset = { x: 0, z: 0 };
  private punch = 0;
  private visualScale = 1;

  constructor(
    private readonly scene: Scene,
    readonly appearance: AppearanceDef,
    assets: AssetLibrary,
    private readonly shadows: ShadowGenerator | null,
  ) {
    const name = `${appearance.id}_${++viewCounter}`;
    this.root = new TransformNode(name, scene);
    this.radius = appearance.placeholder.radius;
    this.height = appearance.placeholder.height;

    const { height, radius } = appearance.placeholder;
    const pickRadius = Math.max(radius * 1.25, appearance.kind === 'loot' ? 0.6 : 0.3);
    this.pick = MeshBuilder.CreateCapsule(
      `${name}_pick`,
      { height: Math.max(height * 1.1, pickRadius * 2.2), radius: pickRadius },
      scene,
    );
    this.pick.position.y = Math.max(height * 1.1, pickRadius * 2.2) / 2;
    this.pick.isVisible = false;
    this.pick.isPickable = true;
    this.pick.parent = this.root;

    if (appearance.kind === 'monster') this.hpBar = this.createHpBar(name);

    this.visual = new PlaceholderVisual(scene, appearance, name, assets);
    this.attachVisual(this.visual);

    if (assets.has(appearance.modelAssetId)) {
      void assets.loadContainer(appearance.modelAssetId).then((container) => {
        if (!container || this.root.isDisposed()) return;
        const model = new ModelVisual(this.scene, container, appearance, name, assets);
        this.detachVisual(this.visual);
        this.visual.dispose();
        this.visual = model;
        this.attachVisual(model);
        model.setGear(this.gear);
        const action = this.action;
        this.action = null;
        if (action) this.setAction(action);
      });
    }
  }

  bind(entityId: EntityId): void {
    this.entityId = entityId;
    this.face = null;
    this.shownYaw = null;
    this.knockOffset.x = this.knockOffset.z = 0;
    this.punch = 0;
    this.pick.metadata = { entityId } satisfies PickMetadata;
    this.action = null;
    this.visual.reset();
    this.root.setEnabled(true);
  }

  release(): void {
    this.entityId = 0;
    this.pick.metadata = null;
    this.root.setEnabled(false);
  }

  setTransform(x: number, z: number, yaw: number): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = this.face ? (this.shownYaw ?? yaw) : yaw;
    if (!this.face) this.shownYaw = yaw;
  }

  /**
   * Turn to a swing's facing now instead of when the interpolated snapshot
   * gets there, so the clip plays toward the aim from its first frame.
   */
  faceYaw(yaw: number, seconds: number): void {
    this.face = { yaw, left: seconds };
  }

  /** Cosmetic recoil of a struck body: pushed along (dx, dz) and a size pop. */
  knock(dx: number, dz: number, metres: number): void {
    const len = Math.hypot(dx, dz) || 1;
    this.knockOffset.x += (dx / len) * metres;
    this.knockOffset.z += (dz / len) * metres;
    this.punch = Math.max(this.punch, Math.min(0.12, metres * 0.5));
  }

  freeze(seconds: number): void {
    this.visual.freeze(seconds);
  }

  anchor(name: Parameters<Visual['anchor']>[0]): TransformNode | null {
    return this.visual.anchor(name);
  }

  setAction(action: EntityAction): void {
    if (action === this.action) return;
    this.action = action;
    this.visual.setBase(action === 'dead' ? 'death' : action === 'move' ? 'run' : 'idle');
    this.pick.isPickable = action !== 'dead';
  }

  setHp(hp: number, maxHp: number): void {
    if (!this.hpBar) return;
    const show = hp > 0 && hp < maxHp && this.action !== 'dead';
    this.hpBar.root.setEnabled(show);
    if (show) {
      const f = Math.max(0.001, hp / maxHp);
      this.hpBar.fg.scaling.x = f;
      this.hpBar.fg.position.x = -(1 - f) * 0.5;
    }
  }

  setGear(gear: GearAppearances): void {
    this.gear = gear;
    this.visual.setGear(gear);
  }

  /** Quality-dependent (tech plan §13: shadows off / player / player + mobs). */
  setCastShadows(on: boolean): void {
    if (on === this.castShadows) return;
    this.detachVisual(this.visual);
    this.castShadows = on;
    this.attachVisual(this.visual);
  }

  play(role: OneShotRole): void {
    this.visual.oneShot(role);
  }

  playClip(clip: string, speed: number, fallback: OneShotRole = 'attack'): void {
    this.visual.oneShotClip(clip, speed, fallback);
  }

  update(dt: number): void {
    if (this.face) {
      const from = this.shownYaw ?? this.face.yaw;
      let d = (this.face.yaw - from) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.shownYaw = from + d * (1 - Math.exp(-dt * 28));
      this.root.rotation.y = this.shownYaw;
      this.face.left -= dt;
      if (this.face.left <= 0) this.face = null;
    }
    const k = Math.exp(-dt * 14);
    this.knockOffset.x *= k;
    this.knockOffset.z *= k;
    this.punch *= Math.exp(-dt * 18);
    // The visual is under the yawed root: rotate the world-space offset into it.
    const c = Math.cos(this.root.rotation.y);
    const sn = Math.sin(this.root.rotation.y);
    const v = this.visual.root;
    v.position.x = this.knockOffset.x * c - this.knockOffset.z * sn;
    v.position.z = this.knockOffset.x * sn + this.knockOffset.z * c;
    v.scaling.setAll(this.visualScale * (1 + this.punch));
    this.visual.update(dt);
  }

  dispose(): void {
    this.detachVisual(this.visual);
    this.visual.dispose();
    this.root.dispose();
  }

  private createHpBar(name: string): { root: TransformNode; fg: Mesh } {
    const mats = hpBarMaterials(this.scene);
    const root = new TransformNode(`${name}_hp`, this.scene);
    root.parent = this.root;
    root.position.y = this.height + 0.45;
    root.billboardMode = TransformNode.BILLBOARDMODE_ALL;
    const width = Math.max(0.9, this.radius * 2);
    root.scaling.set(width, 0.12, 1);
    const bg = MeshBuilder.CreatePlane(`${name}_hp_bg`, { size: 1 }, this.scene);
    bg.material = mats.bg;
    bg.parent = root;
    bg.isPickable = false;
    const fg = MeshBuilder.CreatePlane(`${name}_hp_fg`, { size: 1 }, this.scene);
    fg.material = mats.fg;
    fg.parent = root;
    fg.position.z = -0.01;
    fg.isPickable = false;
    for (const m of [bg, fg]) m.renderingGroupId = 1;
    root.setEnabled(false);
    return { root, fg };
  }

  private attachVisual(v: Visual): void {
    v.root.parent = this.root;
    this.visualScale = v.root.scaling.x;
    if (this.appearance.kind === 'loot' || this.appearance.kind === 'portal') return;
    if (this.shadows && this.castShadows) {
      for (const m of v.shadowCasters) this.shadows.addShadowCaster(m);
    }
  }

  private detachVisual(v: Visual): void {
    if (this.shadows) for (const m of v.shadowCasters) this.shadows.removeShadowCaster(m);
  }
}

/** Keeps released views per appearance for reuse (tech plan §9). */
export class EntityViewPool {
  private readonly free = new Map<string, EntityView[]>();

  constructor(private readonly create: (appearance: AppearanceDef) => EntityView) {}

  acquire(appearance: AppearanceDef, entityId: EntityId): EntityView {
    const view = this.free.get(appearance.id)?.pop() ?? this.create(appearance);
    view.bind(entityId);
    return view;
  }

  release(view: EntityView): void {
    view.release();
    const list = this.free.get(view.appearance.id) ?? [];
    list.push(view);
    this.free.set(view.appearance.id, list);
  }

  dispose(): void {
    for (const list of this.free.values()) for (const v of list) v.dispose();
    this.free.clear();
  }
}
