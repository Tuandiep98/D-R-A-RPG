import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  type Scene,
  StandardMaterial,
  Texture,
  type TransformNode,
  type Vector3,
} from './babylon';

const DAMAGE_LIFETIME = 0.9;
/** Crits pop in from this size and settle over CRIT_POP seconds. */
const CRIT_OVERSHOOT = 1.45;
const CRIT_POP = 0.14;
/** Canvas per number: wide enough for "Yếu hại 12345!" at full size. */
const TEX_W = 768;
const TEX_H = 160;
const FONT_PX = 96;
const PAD = 18;
/** World height of the texture at size 1 (glyphs ≈ 60% of it). */
const PLANE_H = 0.62;
/** Same face as the HUD's over-head names (fantasy-glass.css). */
const FONT_FAMILY = '"League Spartan", "Aptos", "Segoe UI", system-ui, sans-serif';

interface DamageText {
  plane: Mesh;
  texture: DynamicTexture;
  material: StandardMaterial;
  age: number;
  active: boolean;
  /** World size of the number (scaling.y at rest). */
  size: number;
  /** Texture width actually used / texture height (keeps glyphs unstretched). */
  aspect: number;
  pop: boolean;
}

export interface DamageTextStyle {
  /** World size multiplier; callers grow it with the amount. */
  size?: number;
  /** Crit / heavy hit: heavier weight and a pop-in. */
  strong?: boolean;
  /** Random spread so simultaneous hits do not stack (off for stacked self feedback). */
  jitter?: boolean;
}

/**
 * Pooled floating combat numbers on billboard planes, styled like the HUD's
 * NPC names: League Spartan, dark outline and drop shadow. The plane is sized
 * to the measured text, so long labels are never clipped.
 */
export class DamageTextPool {
  private readonly items: DamageText[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly capacity = 24,
  ) {
    // Canvas text does not trigger webfont loading; ask for the glyphs used.
    void document.fonts
      ?.load(`800 ${FONT_PX}px ${FONT_FAMILY}`, '0123456789+!Sượt Yếu hại Trượt Quá tải Phản phệ')
      .catch(() => {});
  }

  /** Shows a number / label; returns its plane (its position is live while shown). */
  spawn(position: Vector3, text: string, color: string, style: DamageTextStyle = {}): Mesh {
    const item = this.items.find((i) => !i.active) ?? this.createOrRecycle();
    const strong = !!style.strong;
    const ctx = item.texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    let px = FONT_PX;
    const font = (size: number) => `${strong ? 900 : 700} ${size}px ${FONT_FAMILY}`;
    ctx.font = font(px);
    let width = ctx.measureText(text).width;
    // Very long labels shrink to fit instead of running off the canvas.
    if (width > TEX_W - PAD * 2) {
      px = Math.floor((px * (TEX_W - PAD * 2)) / width);
      ctx.font = font(px);
      width = ctx.measureText(text).width;
    }
    const baseline = TEX_H / 2 + px * 0.36;
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    // Outline + drop shadow, as the HUD's text-shadow on names.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.lineWidth = strong ? 14 : 11;
    ctx.strokeStyle = 'rgba(8, 12, 15, 0.9)';
    ctx.strokeText(text, PAD, baseline);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = color;
    ctx.fillText(text, PAD, baseline);
    item.texture.update();

    const used = Math.min(TEX_W, width + PAD * 2);
    item.texture.uScale = used / TEX_W;
    item.aspect = used / TEX_H;
    item.size = PLANE_H * (style.size ?? 1);
    item.pop = strong;
    item.plane.position.copyFrom(position);
    // Spread hits that land together so their numbers do not stack.
    if (style.jitter !== false) {
      item.plane.position.x += (Math.random() - 0.5) * 0.8;
      item.plane.position.y += Math.random() * 0.35;
    }
    item.material.alpha = 1;
    item.age = 0;
    item.active = true;
    this.place(item);
    item.plane.setEnabled(true);
    return item.plane;
  }

  update(dt: number): void {
    for (const i of this.items) {
      if (!i.active) continue;
      i.age += dt;
      i.plane.position.y += dt * 1.2;
      // Hold, then fade over the last 40%.
      i.material.alpha = Math.min(1, Math.max(0, (1 - i.age / DAMAGE_LIFETIME) / 0.4));
      this.place(i);
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

  /** Plane scale from the text size, its measured width and the crit pop. */
  private place(i: DamageText): void {
    const t = Math.min(1, i.age / CRIT_POP);
    const pop = i.pop ? 1 + (CRIT_OVERSHOOT - 1) * (1 - t) * (1 - t) : 1;
    const h = i.size * pop;
    i.plane.scaling.set(h * i.aspect, h, 1);
  }

  private createOrRecycle(): DamageText {
    if (this.items.length >= this.capacity) {
      // Reuse the oldest one rather than growing without bound.
      return this.items.reduce((a, b) => (a.age > b.age ? a : b));
    }
    const n = this.items.length;
    const plane = MeshBuilder.CreatePlane(`dmg_${n}`, { size: 1 }, this.scene);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;
    const texture = new DynamicTexture(
      `dmg_tex_${n}`,
      { width: TEX_W, height: TEX_H },
      this.scene,
      false,
    );
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    const material = new StandardMaterial(`dmg_mat_${n}`, this.scene);
    material.diffuseTexture = texture;
    material.emissiveColor = Color3.White();
    material.disableLighting = true;
    material.useAlphaFromDiffuseTexture = true;
    material.backFaceCulling = false;
    plane.material = material;
    // Above the HP bars / gauges (group 1) that sit at the same height.
    plane.renderingGroupId = 2;
    const item: DamageText = {
      plane,
      texture,
      material,
      age: 0,
      active: false,
      size: PLANE_H,
      aspect: TEX_W / TEX_H,
      pop: false,
    };
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

  hide(): void {
    this.age = Number.POSITIVE_INFINITY;
    this.ring.setEnabled(false);
  }

  update(dt: number): void {
    if (this.age > 0.6) return;
    this.age += dt;
    this.ring.scaling.setAll(Math.max(0.05, 1 - this.age / 0.6));
    if (this.age > 0.6) this.ring.setEnabled(false);
  }
}
