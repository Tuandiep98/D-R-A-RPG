import type { ComboVariant } from '@rpg/game-data';
import {
  type ArcRotateCamera,
  Color3,
  Constants,
  DynamicTexture,
  Material,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  type Scene,
  StandardMaterial,
  Texture,
  type TransformNode,
  Vector3,
  VertexBuffer,
} from './babylon';
import type { QualityLevel } from './quality';

/**
 * Basic-attack presentation (D-031): swing arcs, blade trails, hand glow,
 * impact flashes, sparks, ground rings and dust. Purely cosmetic — damage and
 * hits come from the host.
 *
 * Cost model: every sprite kind is ONE mesh drawn with thin instances (one
 * draw call per kind, whatever the count), blade trails are a few pooled
 * ribbons, sparks are CPU points in the same sprite batches. Counts scale
 * with the quality preset so Low stays cheap (CLAUDE.md rule 15).
 *
 * Sprites come from Kenney's Particle Pack (CC0, media ids `vfx_*`); when the
 * media manifest is missing a procedural canvas texture stands in.
 */

export type FxSprite =
  | 'slash'
  | 'arc'
  | 'ring'
  | 'glow'
  | 'star'
  | 'twirl'
  | 'trace'
  | 'smoke'
  | 'scorch'
  | 'spark'
  // Thunder skills (Lôi Kiếm Tu).
  | 'zap'
  | 'bolt'
  | 'streak'
  | 'rune'
  | 'sigil'
  | 'shock'
  // Ranged weapons (D-033).
  | 'muzzle'
  | 'blast'
  | 'tracer';

const SPRITE_MEDIA: Record<FxSprite, string> = {
  slash: 'vfx_slash_02',
  arc: 'vfx_slash_03',
  ring: 'vfx_circle_01',
  glow: 'vfx_circle_05',
  star: 'vfx_star_06',
  twirl: 'vfx_twirl_01',
  trace: 'vfx_trace_01',
  smoke: 'vfx_smoke_07',
  scorch: 'vfx_scorch_01',
  spark: 'vfx_flare_01',
  zap: 'vfx_spark_02',
  bolt: 'vfx_spark_06',
  streak: 'vfx_spark_07',
  rune: 'vfx_magic_01',
  sigil: 'vfx_magic_02',
  shock: 'vfx_circle_02',
  muzzle: 'vfx_muzzle_02',
  blast: 'vfx_muzzle_04',
  tracer: 'vfx_trace_06',
};

/** How a sprite is oriented: facing the camera, lying on the ground, or standing along a heading. */
export type FxMode = 'billboard' | 'flat' | 'upright';

export interface SpriteSpec {
  sprite: FxSprite;
  x: number;
  y: number;
  z: number;
  mode: FxMode;
  /** Heading (rad) the sprite's texture-up points to (flat) or that the plane runs along (upright). */
  yaw?: number;
  /** In-plane rotation at birth and at death (sweeps / spins). */
  roll?: number;
  rollEnd?: number;
  /** Size in metres (width, height) at birth; `grow` multiplies it by the end. */
  w: number;
  h?: number;
  grow?: number;
  /** Stretch of height only over life (thrust lines shooting out). */
  growH?: number;
  life: number;
  color: Color3;
  intensity?: number;
  /** Mirror the texture horizontally (a left-to-right slash). */
  mirror?: boolean;
  /** Follows this node's world position (hand glow). */
  follow?: TransformNode | null;
  /** World velocity (m/s) and gravity for sparks / debris. */
  vx?: number;
  vy?: number;
  vz?: number;
  gravity?: number;
  /** Seconds before it appears. */
  delay?: number;
  /** Fraction of life spent fading in (0 = pops in at full strength). */
  fadeIn?: number;
  /** Pulses (glows charging up). */
  pulse?: number;
  /** Lets cut() end it early (a bullet tracer stopped by a body). */
  tag?: number;
}

interface Sprite
  extends Required<Omit<SpriteSpec, 'follow' | 'h' | 'yaw' | 'roll' | 'rollEnd' | 'tag'>> {
  tag: number;
  h: number;
  yaw: number;
  roll: number;
  rollEnd: number;
  follow: TransformNode | null;
  age: number;
}

const MAX_PER_KIND = 64;

class SpriteBatch {
  readonly mesh: Mesh;
  readonly items: Sprite[] = [];
  private readonly matrices = new Float32Array(MAX_PER_KIND * 16);
  private readonly colors = new Float32Array(MAX_PER_KIND * 4);
  private readonly m = new Matrix();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly p = new Vector3();

  constructor(scene: Scene, kind: FxSprite, texture: Texture | DynamicTexture) {
    this.mesh = MeshBuilder.CreatePlane(`fx_${kind}`, { size: 1 }, scene);
    const mat = new StandardMaterial(`fx_${kind}_mat`, scene);
    mat.diffuseTexture = texture;
    mat.diffuseTexture.hasAlpha = true;
    mat.useAlphaFromDiffuseTexture = true;
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = Color3.White();
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    mat.fogEnabled = false;
    this.mesh.material = mat;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    this.mesh.thinInstanceSetBuffer('color', this.colors, 4, false);
    this.mesh.thinInstanceCount = 0;
    // Light flashes draw over bodies (a glow in the hand must not hide behind the arm).
    if (
      kind === 'glow' ||
      kind === 'star' ||
      kind === 'spark' ||
      kind === 'zap' ||
      kind === 'muzzle' ||
      kind === 'blast'
    )
      this.mesh.renderingGroupId = 1;
    this.mesh.setEnabled(false);
  }

  add(sprite: Sprite, cap: number): void {
    if (this.items.length >= Math.min(cap, MAX_PER_KIND)) {
      // Full: replace the oldest (bounded cost).
      let oldest = 0;
      for (let i = 1; i < this.items.length; i++)
        if ((this.items[i]?.age ?? 0) > (this.items[oldest]?.age ?? 0)) oldest = i;
      this.items[oldest] = sprite;
      return;
    }
    this.items.push(sprite);
  }

  /** Ends tagged sprites within `fade` seconds. */
  cut(tag: number, fade: number): void {
    for (const it of this.items)
      if (it.tag === tag && it.delay <= 0) it.life = Math.min(it.life, it.age + fade);
  }

  update(dt: number, cameraRotation: Quaternion): void {
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i] as Sprite;
      if (it.delay > 0) {
        it.delay -= dt;
        continue;
      }
      it.age += dt;
      if (it.age >= it.life) {
        this.items.splice(i, 1);
        continue;
      }
      it.vy -= it.gravity * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.z += it.vz * dt;
      if (it.y < 0.03 && it.gravity > 0) {
        it.y = 0.03;
        it.vy *= -0.3;
        it.vx *= 0.5;
        it.vz *= 0.5;
      }
    }
    for (const it of this.items) {
      if (it.delay > 0) continue;
      const f = it.age / it.life;
      const ease = 1 - (1 - f) * (1 - f);
      const size = 1 + (it.grow - 1) * ease;
      const alpha =
        (it.fadeIn > 0 && f < it.fadeIn ? f / it.fadeIn : 1) *
        (f < 0.35 ? 1 : 1 - (f - 0.35) / 0.65) *
        (it.pulse > 0 ? 0.75 + 0.25 * Math.sin(it.age * it.pulse) : 1);
      const roll = it.roll + (it.rollEnd - it.roll) * ease;
      if (it.follow && !it.follow.isDisposed()) {
        const a = it.follow.getAbsolutePosition();
        this.p.set(a.x, a.y, a.z);
      } else this.p.set(it.x, it.y, it.z);
      if (it.mode === 'billboard') {
        Quaternion.RotationAxisToRef(Vector3.Forward(), roll, this.q);
        cameraRotation.multiplyToRef(this.q, this.q);
      } else if (it.mode === 'flat') {
        Quaternion.RotationYawPitchRollToRef(it.yaw, Math.PI / 2, roll, this.q);
      } else {
        Quaternion.RotationYawPitchRollToRef(it.yaw - Math.PI / 2, 0, roll, this.q);
      }
      const stretch = 1 + (it.growH - 1) * ease;
      this.s.set(it.w * size * (it.mirror ? -1 : 1), it.h * size * stretch, 1);
      Matrix.ComposeToRef(this.s, this.q, this.p, this.m);
      this.m.copyToArray(this.matrices, n * 16);
      const k = Math.max(0, alpha) * it.intensity;
      this.colors[n * 4] = it.color.r * k;
      this.colors[n * 4 + 1] = it.color.g * k;
      this.colors[n * 4 + 2] = it.color.b * k;
      this.colors[n * 4 + 3] = 1;
      n++;
    }
    this.mesh.thinInstanceCount = n;
    this.mesh.setEnabled(n > 0);
    if (n > 0) {
      this.mesh.thinInstanceBufferUpdated('matrix');
      this.mesh.thinInstanceBufferUpdated('color');
    }
  }
}

/** Ribbon between a weapon's hilt and tip, sampled each frame (classic sword trail). */
class BladeTrail {
  readonly mesh: Mesh;
  active = false;
  private base: TransformNode | null = null;
  private tip: TransformNode | null = null;
  private left = 0;
  private fade = 0;
  private readonly samples: Vector3[] = [];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private color = Color3.White();
  private width = 0;

  constructor(
    scene: Scene,
    index: number,
    private readonly length: number,
  ) {
    const n = length;
    this.positions = new Float32Array(n * 2 * 3);
    this.colors = new Float32Array(n * 2 * 4);
    const indices: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.mesh = new Mesh(`fx_trail_${index}`, scene);
    this.mesh.setVerticesData(VertexBuffer.PositionKind, this.positions, true);
    this.mesh.setVerticesData(VertexBuffer.ColorKind, this.colors, true);
    this.mesh.setIndices(indices);
    const mat = new StandardMaterial(`fx_trail_mat_${index}`, scene);
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

  /** `tip` null → a short ribbon above `base` (fists). */
  start(
    base: TransformNode,
    tip: TransformNode | null,
    color: Color3,
    seconds: number,
    width: number,
  ): void {
    this.base = base;
    this.tip = tip;
    this.color = color;
    this.left = seconds;
    this.fade = 0;
    this.width = width;
    this.samples.length = 0;
    this.active = true;
    this.mesh.setEnabled(true);
  }

  update(dt: number): void {
    if (!this.active) return;
    if (this.left > 0 && this.base && !this.base.isDisposed()) {
      this.left -= dt;
      const b = this.base.getAbsolutePosition();
      const t = this.tip && !this.tip.isDisposed() ? this.tip.getAbsolutePosition() : null;
      const inner = t ? Vector3.Lerp(b, t, 0.25) : b.clone();
      const outer = t ? t.clone() : b.add(new Vector3(0, this.width, 0));
      this.samples.unshift(inner, outer);
      if (this.samples.length > this.length * 2) this.samples.length = this.length * 2;
    } else {
      // Released: the tail catches up with the head, then the ribbon is gone.
      this.fade += dt;
      if (this.samples.length >= 4) this.samples.length -= 2;
      if (this.fade > 0.25 || this.samples.length < 4) {
        this.active = false;
        this.mesh.setEnabled(false);
        return;
      }
    }
    const count = this.samples.length / 2;
    for (let i = 0; i < this.length; i++) {
      const j = Math.min(i, count - 1);
      const a = this.samples[j * 2] as Vector3;
      const c = this.samples[j * 2 + 1] as Vector3;
      a.toArray(this.positions, i * 6);
      c.toArray(this.positions, i * 6 + 3);
      // Bright head → transparent tail; the outer edge is brighter than the inner.
      const k = i < count ? (1 - i / Math.max(1, count - 1)) ** 1.6 : 0;
      const hot = 0.35 + 0.65 * k;
      for (const [o, edge] of [
        [0, 0.35],
        [4, 1],
      ] as const) {
        this.colors[i * 8 + o] = Math.min(1, this.color.r * k * edge + hot * k * 0.25);
        this.colors[i * 8 + o + 1] = Math.min(1, this.color.g * k * edge + hot * k * 0.25);
        this.colors[i * 8 + o + 2] = Math.min(1, this.color.b * k * edge + hot * k * 0.25);
        this.colors[i * 8 + o + 3] = 1;
      }
    }
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions);
    this.mesh.updateVerticesData(VertexBuffer.ColorKind, this.colors);
  }
}

/** Where a swing comes from, as the renderer currently shows it. */
export interface SwingOrigin {
  x: number;
  z: number;
  yaw: number;
}

const WHITE = Color3.White();

export class CombatFx {
  private readonly batches = new Map<FxSprite, SpriteBatch>();
  private readonly trails: BladeTrail[] = [];
  private readonly camRotation = new Quaternion();
  private level: QualityLevel = 'high';

  constructor(
    scene: Scene,
    private readonly camera: ArcRotateCamera,
    mediaUrl: (id: string) => string | null,
  ) {
    for (const kind of Object.keys(SPRITE_MEDIA) as FxSprite[]) {
      const url = mediaUrl(SPRITE_MEDIA[kind]);
      const texture = url
        ? new Texture(url, scene, { noMipmap: false, invertY: true })
        : proceduralTexture(scene, kind);
      if (texture instanceof Texture) {
        texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      }
      this.batches.set(kind, new SpriteBatch(scene, kind, texture));
    }
    for (let i = 0; i < 6; i++) this.trails.push(new BladeTrail(scene, i, 18));
  }

  setQuality(level: QualityLevel): void {
    this.level = level;
  }

  get quality(): QualityLevel {
    return this.level;
  }

  private get cap(): number {
    return this.level === 'low' ? 12 : this.level === 'medium' ? 32 : MAX_PER_KIND;
  }

  /** Multiplier for particle counts. */
  get density(): number {
    return this.level === 'low' ? 0.35 : this.level === 'medium' ? 0.65 : 1;
  }

  sprite(spec: SpriteSpec): void {
    const batch = this.batches.get(spec.sprite);
    if (!batch) return;
    batch.add(
      {
        sprite: spec.sprite,
        x: spec.x,
        y: spec.y,
        z: spec.z,
        mode: spec.mode,
        yaw: spec.yaw ?? 0,
        roll: spec.roll ?? 0,
        rollEnd: spec.rollEnd ?? spec.roll ?? 0,
        w: spec.w,
        h: spec.h ?? spec.w,
        grow: spec.grow ?? 1,
        growH: spec.growH ?? 1,
        life: spec.life,
        color: spec.color,
        intensity: spec.intensity ?? 1,
        mirror: spec.mirror ?? false,
        follow: spec.follow ?? null,
        vx: spec.vx ?? 0,
        vy: spec.vy ?? 0,
        vz: spec.vz ?? 0,
        gravity: spec.gravity ?? 0,
        delay: spec.delay ?? 0,
        fadeIn: spec.fadeIn ?? 0,
        pulse: spec.pulse ?? 0,
        tag: spec.tag ?? 0,
        age: 0,
      },
      this.cap,
    );
  }

  /** Ends every sprite carrying `tag` (it fades over `fade` seconds). */
  cut(tag: number, fade = 0.03): void {
    if (tag === 0) return;
    for (const b of this.batches.values()) b.cut(tag, fade);
  }

  /** Burst of glowing sparks flying out of a point (hits, clashes). */
  sparks(
    x: number,
    y: number,
    z: number,
    color: Color3,
    count: number,
    speed: number,
    opts: {
      dirYaw?: number;
      spread?: number;
      gravity?: number;
      size?: number;
    } = {},
  ): void {
    const n = Math.max(1, Math.round(count * this.density));
    const spread = opts.spread ?? Math.PI;
    for (let i = 0; i < n; i++) {
      const yaw = (opts.dirYaw ?? 0) + (Math.random() * 2 - 1) * spread;
      const up = 0.2 + Math.random() * 0.9;
      const v = speed * (0.45 + Math.random() * 0.75);
      this.sprite({
        sprite: 'spark',
        x,
        y,
        z,
        mode: 'billboard',
        w: (opts.size ?? 0.22) * (0.6 + Math.random() * 0.8),
        life: 0.25 + Math.random() * 0.3,
        grow: 0.3,
        color,
        intensity: 1.4,
        vx: Math.sin(yaw) * v,
        vz: Math.cos(yaw) * v,
        vy: up * v,
        gravity: opts.gravity ?? 9,
      });
    }
  }

  /** Swing trail on the weapon (or fist) from now for `seconds`. */
  trail(
    base: TransformNode | null,
    tip: TransformNode | null,
    color: Color3,
    seconds: number,
    width = 0.12,
  ): void {
    if (!base || this.level === 'low') return;
    const t = this.trails.find((x) => !x.active) ?? this.trails[0];
    t?.start(base, tip, color, seconds, width);
  }

  /** The swing's arc, drawn on the contact frame (D-031 trail shapes). */
  swingArc(o: SwingOrigin, v: ComboVariant): void {
    const color = Color3.FromHexString(v.trail.color);
    const size = v.trail.size;
    const fx = Math.sin(o.yaw);
    const fz = Math.cos(o.yaw);
    const heavy = v.heavy;
    const life = heavy ? 0.3 : 0.2;
    const at = (d: number, y: number) => ({
      x: o.x + fx * d,
      y,
      z: o.z + fz * d,
    });
    const layers: [Color3, number, number][] = heavy
      ? [
          [color, 1, 1.25],
          [WHITE, 0.82, 0.9],
        ]
      : [[color, 1, 1]];
    switch (v.trail.shape) {
      case 'slash': {
        // Kenney slash_02 is a "U": its thick bottom must face away from the body.
        const sweep = v.trail.from === 'left' ? -1 : 1;
        const r = (v.reach + 0.5) * size;
        for (const [c, k, intensity] of layers)
          this.sprite({
            sprite: 'slash',
            ...at(r * 0.28, heavy ? 0.95 : 0.85),
            mode: 'flat',
            yaw: o.yaw + Math.PI,
            roll: 0.55 * sweep,
            rollEnd: -0.35 * sweep,
            mirror: sweep < 0,
            w: r * 1.9 * k,
            grow: 1.12,
            life,
            color: c,
            intensity: intensity * 1.35,
          });
        break;
      }
      case 'smash': {
        // A vertical plane would be edge-on to the chase camera: the falling
        // crescent faces the camera instead and drops toward the ground.
        const r = (v.reach + 0.3) * size;
        for (const [c, k, intensity] of layers)
          this.sprite({
            sprite: 'arc',
            ...at(r * 0.45, 1.0),
            mode: 'billboard',
            roll: 0.55,
            rollEnd: -0.35,
            w: r * 0.95 * k,
            h: r * 1.5 * k,
            grow: 1.12,
            life,
            color: c,
            intensity: intensity * 1.2,
          });
        break;
      }
      case 'thrust': {
        const r = v.reach * size;
        for (const [c, k, intensity] of layers)
          this.sprite({
            sprite: 'trace',
            ...at(r * 0.55 + 0.3, 0.95),
            mode: 'flat',
            yaw: o.yaw,
            w: 0.8 * size * k,
            h: r * 1.3,
            growH: 1.6,
            grow: 1,
            life: life * 0.8,
            color: c,
            intensity,
          });
        this.sprite({
          sprite: 'star',
          ...at(r + 0.35, 0.95),
          mode: 'billboard',
          w: 0.6 * size,
          grow: 1.8,
          life: 0.16,
          color: WHITE,
          intensity: heavy ? 1.3 : 0.8,
        });
        break;
      }
      case 'spin': {
        const r = (v.reach + 0.6) * size;
        for (const [c, k, intensity] of layers)
          this.sprite({
            sprite: 'twirl',
            x: o.x,
            y: 0.75,
            z: o.z,
            mode: 'flat',
            yaw: o.yaw,
            roll: 0,
            rollEnd: -Math.PI * 1.6,
            w: r * 2 * k,
            grow: 1.15,
            life: life * 1.4,
            color: c,
            intensity,
          });
        break;
      }
    }
  }

  /**
   * The finisher's signature (trail.impact), drawn at the contact frame even
   * when nothing was hit. Returns the camera shake it calls for.
   */
  impact(o: SwingOrigin, v: ComboVariant): { shake: number; kick: number } {
    const color = Color3.FromHexString(v.trail.color);
    const fx = Math.sin(o.yaw);
    const fz = Math.cos(o.yaw);
    const ahead = v.trail.shape === 'spin' ? 0 : Math.min(v.reach, 1.6) * 0.75;
    const cx = o.x + fx * ahead;
    const cz = o.z + fz * ahead;
    switch (v.trail.impact) {
      case 'spark':
        return { shake: 0, kick: 0 };
      case 'burst': {
        this.sprite({
          sprite: 'star',
          x: cx,
          y: 0.95,
          z: cz,
          mode: 'billboard',
          w: 1.2,
          grow: 2.4,
          life: 0.22,
          color: WHITE,
          intensity: 1.4,
        });
        this.sprite({
          sprite: 'glow',
          x: cx,
          y: 0.95,
          z: cz,
          mode: 'billboard',
          w: 1.4,
          grow: 1.8,
          life: 0.3,
          color,
          intensity: 1.2,
        });
        this.sprite({
          sprite: 'ring',
          x: cx,
          y: 0.95,
          z: cz,
          mode: 'upright',
          yaw: o.yaw + Math.PI / 2,
          w: 0.6,
          grow: 3.4,
          life: 0.3,
          color,
          intensity: 1.1,
        });
        this.sparks(cx, 0.95, cz, color, 18, 6.5, {
          dirYaw: o.yaw,
          spread: 1.1,
        });
        return { shake: 0.12, kick: 0.45 };
      }
      case 'quake': {
        const r = Math.max(1.6, v.reach * 1.4) * v.trail.size;
        this.sprite({
          sprite: 'ring',
          x: cx,
          y: 0.06,
          z: cz,
          mode: 'flat',
          w: r * 0.5,
          grow: 4,
          life: 0.5,
          color,
          intensity: 1.3,
        });
        this.sprite({
          sprite: 'ring',
          x: cx,
          y: 0.08,
          z: cz,
          mode: 'flat',
          w: r * 0.3,
          grow: 3,
          life: 0.35,
          color: WHITE,
          intensity: 0.8,
          delay: 0.05,
        });
        this.sprite({
          sprite: 'scorch',
          x: cx,
          y: 0.04,
          z: cz,
          mode: 'flat',
          yaw: o.yaw,
          w: r * 1.1,
          grow: 1.15,
          life: 0.9,
          color,
          intensity: 0.9,
        });
        this.sprite({
          sprite: 'star',
          x: cx,
          y: 0.5,
          z: cz,
          mode: 'billboard',
          w: 1.3,
          grow: 2.2,
          life: 0.18,
          color: WHITE,
          intensity: 1.3,
        });
        const dust = new Color3(0.42, 0.36, 0.3);
        const puffs = this.level === 'low' ? 3 : 6;
        for (let i = 0; i < puffs; i++) {
          const a = o.yaw + (i / puffs) * Math.PI * 2;
          this.sprite({
            sprite: 'smoke',
            x: cx + Math.sin(a) * 0.4,
            y: 0.35,
            z: cz + Math.cos(a) * 0.4,
            mode: 'billboard',
            roll: a,
            rollEnd: a + 0.6,
            w: 0.9,
            grow: 2.2,
            life: 0.75,
            color: dust,
            vx: Math.sin(a) * 2.2,
            vz: Math.cos(a) * 2.2,
            vy: 0.6,
            fadeIn: 0.1,
          });
        }
        this.sparks(cx, 0.15, cz, color, 22, 5.5, {
          spread: Math.PI,
          gravity: 14,
        });
        this.sparks(cx, 0.1, cz, new Color3(0.55, 0.42, 0.3), 12, 4, {
          spread: Math.PI,
          gravity: 16,
          size: 0.3,
        });
        return { shake: 0.24, kick: 0.8 };
      }
      case 'pierce': {
        const len = v.reach * 1.5;
        const tx = o.x + fx * (len + 0.4);
        const tz = o.z + fz * (len + 0.4);
        this.sprite({
          sprite: 'trace',
          x: o.x + fx * (len * 0.6),
          y: 0.95,
          z: o.z + fz * (len * 0.6),
          mode: 'flat',
          yaw: o.yaw,
          w: 1.6,
          h: len * 1.3,
          growH: 1.4,
          life: 0.3,
          color,
          intensity: 1.6,
        });
        this.sprite({
          sprite: 'trace',
          x: o.x + fx * (len * 0.6),
          y: 0.95,
          z: o.z + fz * (len * 0.6),
          mode: 'flat',
          yaw: o.yaw,
          w: 0.6,
          h: len * 1.2,
          growH: 1.5,
          life: 0.22,
          color: WHITE,
          intensity: 1.1,
        });
        // Shock rings strung along the line, the far one last (a sonic boom).
        for (let i = 0; i < 3; i++) {
          const d = len * (0.35 + i * 0.35);
          this.sprite({
            sprite: 'ring',
            x: o.x + fx * d,
            y: 0.95,
            z: o.z + fz * d,
            mode: 'upright',
            yaw: o.yaw + Math.PI / 2,
            w: 0.35 + i * 0.1,
            grow: 3 + i * 0.4,
            life: 0.3,
            color: i === 2 ? WHITE : color,
            intensity: 1.3,
            delay: i * 0.035,
          });
        }
        this.sprite({
          sprite: 'star',
          x: tx,
          y: 0.95,
          z: tz,
          mode: 'billboard',
          w: 1.2,
          grow: 2.2,
          life: 0.2,
          color: WHITE,
          intensity: 1.4,
          delay: 0.07,
        });
        this.sprite({
          sprite: 'glow',
          x: tx,
          y: 0.95,
          z: tz,
          mode: 'billboard',
          w: 1.2,
          grow: 1.6,
          life: 0.3,
          color,
          intensity: 1.1,
          delay: 0.07,
        });
        this.sparks(tx, 0.95, tz, color, 14, 7, {
          dirYaw: o.yaw,
          spread: 0.5,
          gravity: 6,
        });
        return { shake: 0.1, kick: 0.35 };
      }
      case 'cyclone': {
        const r = (v.reach + 0.6) * v.trail.size;
        this.sprite({
          sprite: 'twirl',
          x: o.x,
          y: 0.4,
          z: o.z,
          mode: 'flat',
          roll: 0,
          rollEnd: -Math.PI * 2.4,
          w: r * 2.2,
          grow: 1.3,
          life: 0.5,
          color,
          intensity: 1.1,
        });
        this.sprite({
          sprite: 'ring',
          x: o.x,
          y: 0.08,
          z: o.z,
          mode: 'flat',
          w: r,
          grow: 2.4,
          life: 0.4,
          color,
          intensity: 1,
        });
        const puffs = this.level === 'low' ? 3 : 8;
        for (let i = 0; i < puffs; i++) {
          const a = (i / puffs) * Math.PI * 2;
          this.sprite({
            sprite: 'smoke',
            x: o.x + Math.sin(a) * r * 0.7,
            y: 0.3,
            z: o.z + Math.cos(a) * r * 0.7,
            mode: 'billboard',
            w: 0.7,
            grow: 2,
            life: 0.6,
            color: new Color3(0.35, 0.34, 0.4),
            vx: Math.cos(a) * 3,
            vz: -Math.sin(a) * 3,
            vy: 0.5,
            fadeIn: 0.1,
          });
        }
        this.sparks(o.x, 0.9, o.z, color, 16, 6, {
          spread: Math.PI,
          gravity: 5,
        });
        return { shake: 0.14, kick: 0.4 };
      }
    }
  }

  /** Charge-up glow on the hands during a finisher's wind-up. */
  chargeGlow(node: TransformNode | null, color: Color3, seconds: number): void {
    if (!node) return;
    this.sprite({
      sprite: 'glow',
      x: 0,
      y: 0,
      z: 0,
      mode: 'billboard',
      follow: node,
      w: 0.7,
      grow: 1.7,
      life: seconds + 0.15,
      color,
      intensity: 1.5,
      fadeIn: 0.35,
      pulse: 28,
    });
    this.sprite({
      sprite: 'star',
      x: 0,
      y: 0,
      z: 0,
      mode: 'billboard',
      follow: node,
      roll: 0,
      rollEnd: 2.5,
      w: 0.45,
      grow: 2.6,
      life: seconds + 0.1,
      color: WHITE,
      intensity: 1.1,
      fadeIn: 0.6,
    });
    // Motes drawn in toward the hand.
    const p = node.getAbsolutePosition();
    const motes = this.level === 'low' ? 0 : 6;
    for (let i = 0; i < motes; i++) {
      const a = (i / motes) * Math.PI * 2;
      const r = 0.9;
      const t = Math.max(0.2, seconds * 0.8);
      this.sprite({
        sprite: 'spark',
        x: p.x + Math.sin(a) * r,
        y: p.y + 0.5 - (i % 3) * 0.3,
        z: p.z + Math.cos(a) * r,
        mode: 'billboard',
        w: 0.18,
        grow: 0.5,
        life: t,
        color,
        intensity: 1.4,
        vx: (-Math.sin(a) * r) / t,
        vz: (-Math.cos(a) * r) / t,
        vy: (-0.5 + (i % 3) * 0.3) / t,
        delay: i * 0.03,
        fadeIn: 0.3,
      });
    }
  }

  /** Flash + sparks on a struck body. */
  hit(x: number, y: number, z: number, yaw: number, color: Color3, strength: number): void {
    this.sprite({
      sprite: 'star',
      x,
      y,
      z,
      mode: 'billboard',
      roll: Math.random() * 3,
      w: 0.5 + strength * 0.5,
      grow: 1.9,
      life: 0.14 + strength * 0.06,
      color: WHITE,
      intensity: 1.2,
    });
    this.sprite({
      sprite: 'glow',
      x,
      y,
      z,
      mode: 'billboard',
      w: 0.5 + strength * 0.6,
      grow: 1.5,
      life: 0.2,
      color,
      intensity: 0.9,
    });
    this.sparks(x, y, z, color, 5 + strength * 10, 3.5 + strength * 3, {
      dirYaw: yaw,
      spread: 1.2,
      gravity: 10,
    });
  }

  update(dt: number): void {
    const view = this.camera.getViewMatrix();
    Quaternion.FromRotationMatrixToRef(view.getRotationMatrix().transpose(), this.camRotation);
    for (const b of this.batches.values()) b.update(dt, this.camRotation);
    for (const t of this.trails) t.update(dt);
  }

  dispose(): void {
    for (const b of this.batches.values()) {
      b.mesh.material?.dispose(true, true);
      b.mesh.dispose();
    }
    for (const t of this.trails) {
      t.mesh.material?.dispose();
      t.mesh.dispose();
    }
    this.batches.clear();
    this.trails.length = 0;
  }
}

/** Stand-in sprites drawn on a canvas when the Kenney media is not built. */
function proceduralTexture(scene: Scene, kind: FxSprite): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture(`fx_${kind}_tex`, { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  const radial = (inner: number, outer: number, stops: [number, number][]) => {
    const g = ctx.createRadialGradient(c, c, inner, c, c, outer);
    for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  };
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineCap = 'round';
  switch (kind) {
    case 'glow':
    case 'spark':
    case 'muzzle':
    case 'blast':
      radial(0, c, [
        [0, 1],
        [0.3, 0.6],
        [1, 0],
      ]);
      break;
    case 'smoke':
      radial(0, c, [
        [0, 0.55],
        [0.6, 0.25],
        [1, 0],
      ]);
      break;
    case 'ring':
      radial(c * 0.55, c, [
        [0, 0],
        [0.55, 1],
        [1, 0],
      ]);
      break;
    case 'scorch':
      radial(0, c, [
        [0, 0.9],
        [0.4, 0.35],
        [1, 0],
      ]);
      break;
    case 'star':
      radial(0, c * 0.4, [
        [0, 1],
        [1, 0],
      ]);
      for (const [w, a] of [
        [6, 0],
        [6, Math.PI / 2],
      ] as const) {
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(a);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(-c * 0.95, 0);
        ctx.lineTo(c * 0.95, 0);
        ctx.stroke();
        ctx.restore();
      }
      break;
    case 'zap':
    case 'bolt':
    case 'streak': {
      // A jagged stroke (vertical for bolts, horizontal for streaks, a few for zaps).
      const strokes = kind === 'zap' ? 3 : 1;
      ctx.lineWidth = kind === 'zap' ? 3 : 5;
      for (let k = 0; k < strokes; k++) {
        const a = kind === 'streak' ? Math.PI / 2 : kind === 'zap' ? k * 2.1 : 0;
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -c * 0.9);
        for (let i = 1; i <= 8; i++)
          ctx.lineTo((Math.random() * 2 - 1) * c * 0.18, -c * 0.9 + i * c * 0.225);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'rune':
    case 'sigil':
    case 'shock': {
      ctx.lineWidth = kind === 'shock' ? 8 : 4;
      ctx.beginPath();
      ctx.arc(c, c, c * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      if (kind !== 'shock') {
        const n = kind === 'rune' ? 5 : 6;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const a = ((i * (kind === 'rune' ? 2 : 1)) / n) * Math.PI * 2;
          const x = c + Math.sin(a) * c * 0.8;
          const y = c - Math.cos(a) * c * 0.8;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case 'trace':
    case 'tracer':
      ctx.lineWidth = kind === 'tracer' ? 18 : 10;
      ctx.beginPath();
      ctx.moveTo(c, 6);
      ctx.lineTo(c, size - 6);
      ctx.stroke();
      break;
    case 'slash':
    case 'arc':
    case 'twirl': {
      const [from, to] =
        kind === 'slash' ? [0.15, 0.85] : kind === 'arc' ? [-0.35, 0.35] : [0, 1.5];
      for (let i = 0; i < 14; i++) {
        const f = i / 13;
        ctx.lineWidth = 2 + 12 * Math.sin(f * Math.PI);
        ctx.globalAlpha = 0.25 + 0.75 * Math.sin(f * Math.PI);
        ctx.beginPath();
        ctx.arc(
          c,
          c,
          c * 0.78,
          (from + (to - from) * f) * Math.PI,
          (from + (to - from) * (f + 1 / 13)) * Math.PI,
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
  }
  tex.hasAlpha = true;
  tex.update();
  return tex;
}
