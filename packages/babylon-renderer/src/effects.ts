import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  type Scene,
  StandardMaterial,
  type TransformNode,
  type Vector3,
} from './babylon';

const DAMAGE_LIFETIME = 0.9;

interface DamageText {
  plane: Mesh;
  texture: DynamicTexture;
  material: StandardMaterial;
  age: number;
  active: boolean;
}

/** Pooled floating damage numbers drawn on billboard planes. */
export class DamageTextPool {
  private readonly items: DamageText[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly capacity = 24,
  ) {}

  spawn(position: Vector3, text: string, color: string): void {
    const item = this.items.find((i) => !i.active) ?? this.createOrRecycle();
    const ctx = item.texture.getContext();
    ctx.clearRect(0, 0, 256, 128);
    item.texture.drawText(text, null, 88, 'bold 72px sans-serif', color, null, true, true);
    item.plane.position.copyFrom(position);
    item.plane.position.x += (Math.random() - 0.5) * 0.4;
    item.material.alpha = 1;
    item.age = 0;
    item.active = true;
    item.plane.setEnabled(true);
  }

  update(dt: number): void {
    for (const i of this.items) {
      if (!i.active) continue;
      i.age += dt;
      i.plane.position.y += dt * 1.2;
      i.material.alpha = Math.max(0, 1 - i.age / DAMAGE_LIFETIME);
      if (i.age >= DAMAGE_LIFETIME) {
        i.active = false;
        i.plane.setEnabled(false);
      }
    }
  }

  dispose(): void {
    for (const i of this.items) {
      i.texture.dispose();
      i.material.dispose();
      i.plane.dispose();
    }
    this.items.length = 0;
  }

  private createOrRecycle(): DamageText {
    if (this.items.length >= this.capacity) {
      // Reuse the oldest one rather than growing without bound.
      return this.items.reduce((a, b) => (a.age > b.age ? a : b));
    }
    const n = this.items.length;
    const plane = MeshBuilder.CreatePlane(`dmg_${n}`, { width: 1.2, height: 0.6 }, this.scene);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;
    const texture = new DynamicTexture(
      `dmg_tex_${n}`,
      { width: 256, height: 128 },
      this.scene,
      false,
    );
    texture.hasAlpha = true;
    const material = new StandardMaterial(`dmg_mat_${n}`, this.scene);
    material.diffuseTexture = texture;
    material.emissiveColor = Color3.White();
    material.disableLighting = true;
    material.useAlphaFromDiffuseTexture = true;
    material.backFaceCulling = false;
    plane.material = material;
    plane.renderingGroupId = 1;
    const item: DamageText = { plane, texture, material, age: 0, active: false };
    this.items.push(item);
    return item;
  }
}

/** Ring under the selected target. */
export class SelectionRing {
  private readonly ring: Mesh;

  constructor(scene: Scene) {
    this.ring = MeshBuilder.CreateTorus(
      'selection',
      { diameter: 1, thickness: 0.06, tessellation: 32 },
      scene,
    );
    const mat = new StandardMaterial('selection_mat', scene);
    mat.emissiveColor = new Color3(1, 0.25, 0.2);
    mat.disableLighting = true;
    this.ring.material = mat;
    this.ring.isPickable = false;
    this.ring.position.y = 0.04;
    this.ring.setEnabled(false);
  }

  attach(node: TransformNode | null, radius = 0.5): void {
    if (!node) {
      this.ring.parent = null;
      this.ring.setEnabled(false);
      return;
    }
    this.ring.parent = node;
    this.ring.scaling.setAll(radius * 2.6);
    this.ring.setEnabled(true);
  }

  update(time: number): void {
    this.ring.rotation.y = time * 1.5;
  }
}

/** Short-lived marker at a click-to-move destination. */
export class MoveMarker {
  private readonly ring: Mesh;
  private age = Number.POSITIVE_INFINITY;

  constructor(scene: Scene) {
    this.ring = MeshBuilder.CreateTorus(
      'move_marker',
      { diameter: 1, thickness: 0.05, tessellation: 24 },
      scene,
    );
    const mat = new StandardMaterial('move_marker_mat', scene);
    mat.emissiveColor = new Color3(0.4, 1, 0.5);
    mat.disableLighting = true;
    this.ring.material = mat;
    this.ring.isPickable = false;
    this.ring.setEnabled(false);
  }

  show(x: number, z: number): void {
    this.ring.position.set(x, 0.05, z);
    this.age = 0;
    this.ring.setEnabled(true);
  }

  update(dt: number): void {
    if (this.age > 0.6) return;
    this.age += dt;
    this.ring.scaling.setAll(Math.max(0.05, 1 - this.age / 0.6));
    if (this.age > 0.6) this.ring.setEnabled(false);
  }
}
