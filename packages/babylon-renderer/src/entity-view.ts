import {
  type Mesh,
  MeshBuilder,
  type Scene,
  type ShadowGenerator,
  TransformNode,
} from '@babylonjs/core';
import type { AssetLibrary } from '@rpg/asset-runtime';
import type { AppearanceDef } from '@rpg/game-data';
import type { EntityAction, EntityId } from '@rpg/game-protocol';
import { ModelVisual, type OneShotRole, PlaceholderVisual, type Visual } from './visuals';

export interface PickMetadata {
  entityId: EntityId;
}

let viewCounter = 0;

/**
 * Presentation of one simulated entity. Owns a root node, an invisible pick
 * capsule and a Visual (placeholder first, real model once loaded).
 * Views are pooled per appearance and re-bound to new entity ids.
 */
export class EntityView {
  readonly root: TransformNode;
  readonly radius: number;
  entityId: EntityId = 0;
  private readonly pick: Mesh;
  private visual: Visual;
  private action: EntityAction | null = null;

  constructor(
    private readonly scene: Scene,
    readonly appearance: AppearanceDef,
    assets: AssetLibrary,
    private readonly shadows: ShadowGenerator | null,
  ) {
    const name = `${appearance.id}_${++viewCounter}`;
    this.root = new TransformNode(name, scene);
    this.radius = appearance.placeholder.radius;

    const { height, radius } = appearance.placeholder;
    this.pick = MeshBuilder.CreateCapsule(
      `${name}_pick`,
      { height: height * 1.1, radius: radius * 1.25 },
      scene,
    );
    this.pick.position.y = (height * 1.1) / 2;
    this.pick.isVisible = false;
    this.pick.isPickable = true;
    this.pick.parent = this.root;

    this.visual = new PlaceholderVisual(scene, appearance, name);
    this.attachVisual(this.visual);

    if (assets.has(appearance.modelAssetId)) {
      void assets.loadContainer(appearance.modelAssetId).then((container) => {
        if (!container || this.root.isDisposed()) return;
        const model = new ModelVisual(this.scene, container, appearance, name);
        this.detachVisual(this.visual);
        this.visual.dispose();
        this.visual = model;
        this.attachVisual(model);
        const action = this.action;
        this.action = null;
        if (action) this.setAction(action);
      });
    }
  }

  bind(entityId: EntityId): void {
    this.entityId = entityId;
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
    this.root.rotation.y = yaw;
  }

  setAction(action: EntityAction): void {
    if (action === this.action) return;
    this.action = action;
    this.visual.setBase(action === 'dead' ? 'death' : action === 'move' ? 'run' : 'idle');
    this.pick.isPickable = action !== 'dead';
  }

  play(role: OneShotRole): void {
    this.visual.oneShot(role);
  }

  update(dt: number): void {
    this.visual.update(dt);
  }

  dispose(): void {
    this.detachVisual(this.visual);
    this.visual.dispose();
    this.root.dispose();
  }

  private attachVisual(v: Visual): void {
    v.root.parent = this.root;
    if (this.shadows) for (const m of v.shadowCasters) this.shadows.addShadowCaster(m);
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
