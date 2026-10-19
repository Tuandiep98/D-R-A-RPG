import type { Element } from '@rpg/game-protocol';
import { Color3, Quaternion, type Scene, Vector3 } from './babylon';
import type { CombatFx } from './combat-fx';
import {
  ELEMENT_TONES,
  type ElementBurst,
  elementStrength,
  type FxKind,
  fxKind,
} from './element-burst';
import type { EntityView } from './entity-view';
import type { GroundDecals } from './ground-decals';
import type { PhantomStepFx } from './phantom-step-fx';
import { BladeBatch } from './sword-blade';
import type { Feedback } from './thunder-fx';

/**
 * Lôi Ảnh Trảm (`vfx: giant_sword`): while the caster dashes (afterimages),
 * a giant sword of light appears high over where the dash will end and drops
 * onto it, landing with the host's impact: flash, double shock ring, dust
 * wall, burnt crater and the ngũ hành burst all round the area. Stunned bodies
 * show stars (StunFx). Low: no dust wall, fewer ring bursts.
 */

const MAX_SWORDS = 4;
/** Sword size: ~5.5 m of light. */
const SCALE = 4.2;
const WIDTH = 1.5;
const HEIGHT = 11;
const STAY = 0.8;
const FADE = 0.35;
const WHITE = Color3.White();

interface Giant {
  sourceId: number;
  x: number;
  z: number;
  /** Seconds until the planned landing (falls with gravity-like ease). */
  fall: number;
  age: number;
  landedAt: number | null;
  rot: Quaternion;
  kind: FxKind;
  k: number;
}

const p = new Vector3();

export class GiantSwordFx {
  private readonly swords: Giant[] = [];
  private readonly blades: BladeBatch;

  constructor(
    scene: Scene,
    private readonly fx: CombatFx,
    private readonly element: ElementBurst,
    private readonly decals: GroundDecals,
    private readonly phantom: PhantomStepFx,
    private readonly level: () => number,
  ) {
    this.blades = new BladeBatch(scene, 'fx_giant_sword', MAX_SWORDS);
  }

  /**
   * Cast start: the dash heads for `to` (host's unblocked end, else ahead of
   * the caster); the sword appears over it and falls for `seconds`.
   */
  cast(
    caster: EntityView,
    element: Element | null | undefined,
    expression: string | undefined,
    to: { x: number; z: number } | null,
    radius: number,
    seconds: number,
  ): void {
    const level = this.level();
    const kind = fxKind(element, expression, level);
    const tone = ELEMENT_TONES[kind];
    const c = caster.root.position;
    const x = to?.x ?? c.x + Math.sin(caster.root.rotation.y) * 4;
    const z = to?.z ?? c.z + Math.cos(caster.root.rotation.y) * 4;
    const yaw = Math.atan2(x - c.x, z - c.z);
    const fall = Math.max(0.2, seconds);
    if (this.swords.length >= MAX_SWORDS) this.swords.shift();
    this.swords.push({
      sourceId: caster.entityId,
      x,
      z,
      fall,
      age: 0,
      landedAt: null,
      // Tip down, leaning a little along the dash: thrown from behind the caster.
      rot: Quaternion.RotationYawPitchRoll(yaw, 0.18, 0),
      kind,
      k: elementStrength(tone, level),
    });
    this.phantom.start(caster, element, expression, fall, 10);
    // Where it will fall: a sigil spinning up on the ground.
    this.fx.sprite({
      sprite: 'sigil',
      x,
      y: 0.07,
      z,
      mode: 'flat',
      roll: 0,
      rollEnd: 2.2,
      w: radius * 2.1,
      grow: 1.05,
      life: fall + 0.1,
      color: tone.color,
      intensity: 0.8,
      fadeIn: 0.4,
    });
    this.fx.sprite({
      sprite: 'glow',
      x,
      y: HEIGHT * 0.75,
      z,
      mode: 'billboard',
      w: 3,
      grow: 1.4,
      life: fall + 0.1,
      color: tone.color,
      intensity: 0.7,
      fadeIn: 0.5,
    });
  }

  /** Host impact: the sword lands at `point` (the real dash end). */
  impact(
    sourceId: number,
    point: { x: number; z: number },
    radius: number,
    element: Element | null | undefined,
    expression: string | undefined,
  ): Feedback {
    let g = this.swords.find((s) => s.sourceId === sourceId && s.landedAt === null);
    if (!g) {
      const level = this.level();
      const kind = fxKind(element, expression, level);
      g = {
        sourceId,
        x: point.x,
        z: point.z,
        fall: 0,
        age: 0,
        landedAt: null,
        rot: Quaternion.RotationYawPitchRoll(Math.random() * 6, 0.18, 0),
        kind,
        k: elementStrength(ELEMENT_TONES[kind], level),
      };
      this.swords.push(g);
    }
    g.x = point.x;
    g.z = point.z;
    g.landedAt = g.age;
    this.slam(g, radius);
    return { shake: 0.38, kick: 1, seconds: 0.5 };
  }

  update(dt: number): void {
    for (let i = this.swords.length - 1; i >= 0; i--) {
      const g = this.swords[i] as Giant;
      g.age += dt;
      // Never landed (cast cancelled): fade in place.
      const done =
        g.landedAt !== null ? g.age - g.landedAt > STAY + FADE : g.age > g.fall + STAY + FADE;
      if (done) this.swords.splice(i, 1);
    }
    this.blades.begin();
    for (const g of this.swords) {
      const tone = ELEMENT_TONES[g.kind];
      let h: number;
      let alpha: number;
      if (g.landedAt === null) {
        // Accelerating drop; hangs just above the ground if the host is late.
        const f = Math.min(1, g.age / g.fall);
        h = Math.max(0.6, HEIGHT * (1 - f * f));
        alpha = Math.min(1, 0.3 + g.age * 3);
        if (g.age > g.fall + STAY) alpha *= Math.max(0, 1 - (g.age - g.fall - STAY) / FADE);
      } else {
        const t = g.age - g.landedAt;
        // Bites deep, then sinks as it fades.
        h = -0.9 - Math.max(0, t - STAY) * 1.5;
        alpha = (t < 0.1 ? 1.8 - t * 8 : 1) * (t > STAY ? Math.max(0, 1 - (t - STAY) / FADE) : 1);
      }
      p.set(g.x, h, g.z);
      this.blades.add(p, g.rot, SCALE * tone.scale, tone.color, alpha * g.k, WIDTH);
    }
    this.blades.end();
  }

  dispose(): void {
    this.swords.length = 0;
    this.blades.dispose();
  }

  private slam(g: Giant, radius: number): void {
    const tone = ELEMENT_TONES[g.kind];
    const { x, z, k } = g;
    const extra = this.fx.quality !== 'low';
    const r = Math.max(1.5, radius);
    this.fx.sprite({
      sprite: 'star',
      x,
      y: 1.2,
      z,
      mode: 'billboard',
      w: 3,
      grow: 2,
      life: 0.22,
      color: WHITE,
      intensity: 1.5,
    });
    this.fx.sprite({
      sprite: 'glow',
      x,
      y: 0.08,
      z,
      mode: 'flat',
      w: r * 2.4,
      grow: 1.2,
      life: 0.5,
      color: tone.color,
      intensity: 1.2 * k,
    });
    for (const [w, grow, life, delay] of [
      [r * 0.5, 4.4, 0.45, 0],
      [r * 0.4, 5.5, 0.6, 0.08],
    ] as const)
      this.fx.sprite({
        sprite: 'shock',
        x,
        y: 0.08,
        z,
        mode: 'flat',
        w,
        grow,
        life,
        color: delay ? WHITE : tone.color,
        intensity: 1.3 * k,
        delay,
      });
    // Dust thrown out in a wall round the impact.
    const puffs = extra ? 12 : 5;
    for (let i = 0; i < puffs; i++) {
      const a = (i / puffs) * Math.PI * 2 + Math.random() * 0.3;
      this.fx.sprite({
        sprite: 'smoke',
        x: x + Math.sin(a) * 0.6,
        y: 0.3,
        z: z + Math.cos(a) * 0.6,
        mode: 'billboard',
        roll: a,
        rollEnd: a + 0.7,
        w: 1.2,
        grow: 2.4,
        life: 0.9,
        color: Color3.Lerp(new Color3(0.55, 0.5, 0.45), tone.color, 0.35),
        intensity: 0.55,
        vx: Math.sin(a) * r * 1.6,
        vz: Math.cos(a) * r * 1.6,
        vy: 0.9,
        fadeIn: 0.05,
      });
    }
    this.fx.sparks(x, 0.4, z, tone.color, extra ? 30 : 12, 7, {
      spread: Math.PI,
      gravity: 12,
    });
    // The ngũ hành breaks out all round the area, then at the centre.
    const ring = extra ? 6 : 3;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + Math.random() * 0.4;
      const d = r * (0.55 + Math.random() * 0.3);
      this.element.burst(g.kind, x + Math.sin(a) * d, z + Math.cos(a) * d, 0.9, k);
    }
    this.element.burst(g.kind, x, z, 1.5, k);
    // Burnt crater and cracks running out of it.
    this.decals.add(x, z, r * 1.3, { life: 7, darkness: 0.95 });
    this.decals.add(x, z, r * 2, { life: 6, darkness: 0.45 });
    for (let i = 0; i < (extra ? 4 : 2); i++) {
      const a = Math.random() * Math.PI * 2;
      this.decals.add(x + Math.sin(a) * r * 0.6, z + Math.cos(a) * r * 0.6, 0.35, {
        h: r * 1.1,
        yaw: a,
        life: 6,
        darkness: 0.7,
      });
    }
  }
}
