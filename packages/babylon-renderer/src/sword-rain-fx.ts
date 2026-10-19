import type { Element } from '@rpg/game-protocol';
import { Color3, Quaternion, type Scene, Vector3 } from './babylon';
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
import { BladeBatch } from './sword-blade';
import type { Feedback } from './thunder-fx';

/**
 * Lôi Hoàn Kiếm (`vfx: sword_rain`): light swords drop one after another at
 * random spots of the skill area and burst in the caster's ngũ hành on landing
 * (ElementBurst). The element sets how many fall and how strongly they shine;
 * the "Hiệu ứng ngũ hành" setting scales both. Cosmetic only — damage was
 * decided by the host at the impact event. Low: half the swords, no fall trails.
 */

/** Swords at 100% on High before the element's density. */
const BASE_SWORDS = 8;
/** Seconds a sword takes to drop, before the element's speed. */
const BASE_FALL = 0.14;
/** Seconds between the first and the last landing. */
const SPREAD = 0.6;
const MAX_SWORDS = 40;
/** Height a sword drops from, metres. */
const DROP = 4.5;
/** How deep the tip bites into the ground. */
const SINK = 0.2;
/** Seconds a landed sword stays, then fades. */
const STAY = 0.35;
const FADE = 0.3;
const WHITE = Color3.White();

interface Sword {
  x: number;
  z: number;
  /** Seconds until it starts falling. */
  delay: number;
  age: number;
  fall: number;
  scale: number;
  rot: Quaternion;
  /** World direction up the blade (tip → hilt). */
  up: Vector3;
  kind: FxKind;
  intensity: number;
  landed: boolean;
}

const p = new Vector3();

export class SwordRainFx {
  private readonly swords: Sword[] = [];
  private readonly blades: BladeBatch;

  constructor(
    scene: Scene,
    private readonly fx: CombatFx,
    private readonly element: ElementBurst,
    /** The "Hiệu ứng ngũ hành" setting (0..2). */
    private readonly level: () => number,
  ) {
    this.blades = new BladeBatch(scene, 'fx_sword_rain', MAX_SWORDS);
  }

  /** Wind-up: element light on the blade and a sword sigil over the area. */
  cast(
    caster: EntityView,
    element: Element | null | undefined,
    expression: string | undefined,
    radius: number,
    seconds: number,
  ): void {
    const tone = ELEMENT_TONES[fxKind(element, expression, this.level())];
    const hold = Math.max(0.15, seconds);
    this.fx.chargeGlow(caster.anchor('weapon_tip') ?? caster.anchor('hand_r'), tone.color, hold);
    const c = caster.root.position;
    this.fx.sprite({
      sprite: 'sigil',
      x: c.x,
      y: 0.06,
      z: c.z,
      mode: 'flat',
      roll: 0,
      rollEnd: 1.2,
      w: Math.max(1, radius) * 2,
      grow: 1.05,
      life: hold + 0.75,
      color: tone.color,
      intensity: 0.4 * tone.intensity,
      fadeIn: 0.2,
    });
  }

  /** The skill landing: the rain over a `radius` circle around `point`. */
  impact(
    point: { x: number; z: number },
    radius: number,
    element: Element | null | undefined,
    expression: string | undefined,
  ): Feedback {
    const level = this.level();
    const kind = fxKind(element, expression, level);
    const tone = ELEMENT_TONES[kind];
    const count = Math.min(
      MAX_SWORDS - this.swords.length,
      Math.max(3, Math.round(BASE_SWORDS * tone.density * elementBusy(level, this.fx.quality))),
    );
    const strength = elementStrength(tone, level);
    const r = Math.max(1, radius);
    // Shuffled sectors: random spots, still spread over the whole circle.
    const order = shuffle([...Array(count).keys()]);
    for (let i = 0; i < count; i++) {
      const sector = order[i] as number;
      const a = ((sector + Math.random() * 0.8) / count) * Math.PI * 2;
      const d = r * Math.sqrt(0.08 + Math.random() * 0.86);
      // Slight random lean so they look thrown down, not placed.
      const rot = Quaternion.RotationYawPitchRoll(
        Math.random() * Math.PI * 2,
        (Math.random() * 2 - 1) * 0.22,
        (Math.random() * 2 - 1) * 0.12,
      );
      this.swords.push({
        x: point.x + Math.sin(a) * d,
        z: point.z + Math.cos(a) * d,
        delay: (i / Math.max(1, count - 1)) * SPREAD * (0.75 + Math.random() * 0.5),
        age: 0,
        fall: (BASE_FALL / tone.speed) * (0.85 + Math.random() * 0.3),
        scale: tone.scale * (0.85 + Math.random() * 0.3),
        rot,
        up: Vector3.Up().applyRotationQuaternion(rot),
        kind,
        intensity: strength,
        landed: false,
      });
    }
    // The area itself: one ring in the element's colour, so the reach reads at once.
    this.fx.sprite({
      sprite: 'shock',
      x: point.x,
      y: 0.07,
      z: point.z,
      mode: 'flat',
      w: r * 0.6,
      grow: 3.4,
      life: 0.45,
      color: tone.color,
      intensity: 0.9 * strength,
    });
    return { shake: tone.shake, kick: 0.3, seconds: SPREAD };
  }

  update(dt: number): void {
    for (let i = this.swords.length - 1; i >= 0; i--) {
      const w = this.swords[i] as Sword;
      if (w.delay > 0) {
        w.delay -= dt;
        if (w.delay > 0) continue;
        this.trail(w);
      }
      w.age += dt;
      if (w.age >= w.fall + STAY + FADE) {
        this.swords.splice(i, 1);
        continue;
      }
      if (!w.landed && w.age >= w.fall) {
        w.landed = true;
        this.land(w);
      }
    }
    this.blades.begin();
    for (const w of this.swords) {
      if (w.delay > 0) continue;
      const t = w.age;
      // Falling along its own axis, then stuck with the tip in the ground.
      const h = t < w.fall ? DROP * (1 - t / w.fall) : 0;
      const after = Math.max(0, t - w.fall - STAY);
      const sink = t < w.fall ? 0 : SINK + after * 0.25;
      const alpha =
        t < w.fall
          ? 0.55 + 0.45 * (t / w.fall)
          : after > 0
            ? Math.max(0, 1 - after / FADE)
            : // Landing flash dying down.
              1 + 0.8 * Math.max(0, 1 - (t - w.fall) / 0.12);
      const off = h - sink;
      p.set(w.x + w.up.x * off, w.up.y * off, w.z + w.up.z * off);
      this.blades.add(p, w.rot, w.scale, ELEMENT_TONES[w.kind].color, alpha * w.intensity);
    }
    this.blades.end();
  }

  dispose(): void {
    this.swords.length = 0;
    this.blades.dispose();
  }

  /** Streak of light following a sword down. */
  private trail(w: Sword): void {
    if (this.fx.quality === 'low') return;
    this.fx.sprite({
      sprite: 'trace',
      x: w.x,
      y: DROP + 1.6 * w.scale,
      z: w.z,
      mode: 'billboard',
      w: 0.35 * w.scale,
      h: 2.2 * w.scale,
      life: w.fall,
      color: ELEMENT_TONES[w.kind].color,
      intensity: 0.8 * w.intensity,
      vy: -DROP / w.fall,
    });
  }

  /** Neutral strike flash, then the element's motif. */
  private land(w: Sword): void {
    const color = ELEMENT_TONES[w.kind].color;
    this.fx.sprite({
      sprite: 'star',
      x: w.x,
      y: 0.25,
      z: w.z,
      mode: 'billboard',
      w: 0.9 * w.scale,
      grow: 1.8,
      life: 0.16,
      color: Color3.Lerp(color, WHITE, 0.5),
      intensity: 1.2 * w.intensity,
    });
    this.fx.sprite({
      sprite: 'shock',
      x: w.x,
      y: 0.06,
      z: w.z,
      mode: 'flat',
      w: 0.4 * w.scale,
      grow: 3,
      life: 0.3,
      color,
      intensity: w.intensity,
    });
    this.element.burst(w.kind, w.x, w.z, w.scale, w.intensity);
  }
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}
