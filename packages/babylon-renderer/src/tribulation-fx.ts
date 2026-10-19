import type { Element } from '@rpg/game-protocol';
import { Color3, Vector3 } from './babylon';
import type { CombatFx } from './combat-fx';
import { ELEMENT_TONES, type ElementBurst, type FxKind, fxKind } from './element-burst';
import type { EntityView } from './entity-view';
import type { GroundDecals } from './ground-decals';
import type { LightningBatch } from './lightning';
import type { Feedback } from './thunder-fx';

/**
 * Cửu Thiên Lôi Kiếp (`vfx: heaven_tribulation`): the sword raised, one bolt
 * of the caster's ngũ hành shoots up into the sky (the cast's impact), clouds
 * churn overhead, then every host strike (SKILL_IMPACT `strike`) brings a
 * huge bolt down on its point and burns the ground black. The bolt colour
 * deepens with the "Hiệu ứng ngũ hành" setting: pale at 0%, the element's own
 * colour at 100%, a deeper, more saturated shade towards 200%.
 */

const SKY = 16;
const PALE = new Color3(0.86, 0.9, 1);
const WHITE = Color3.White();

interface Storm {
  sourceId: number;
  x: number;
  z: number;
  left: number;
  nextCloud: number;
  color: Color3;
}

/** Element colour by setting level: washed out → own colour → deeper. */
export function tribulationColor(kind: FxKind, level: number): Color3 {
  const base = kind === 'none' ? PALE : ELEMENT_TONES[kind].color;
  const l = Math.max(0, Math.min(2, level));
  if (l <= 1) return Color3.Lerp(PALE, base, 0.25 + 0.75 * l);
  // Past 100%: push away from grey (saturate) and a little darker.
  const grey = (base.r + base.g + base.b) / 3;
  const s = 1 + (l - 1) * 0.9;
  const d = 1 - (l - 1) * 0.18;
  return new Color3(
    Math.max(0, Math.min(1, (grey + (base.r - grey) * s) * d)),
    Math.max(0, Math.min(1, (grey + (base.g - grey) * s) * d)),
    Math.max(0, Math.min(1, (grey + (base.b - grey) * s) * d)),
  );
}

export class TribulationFx {
  private readonly storms: Storm[] = [];

  constructor(
    private readonly fx: CombatFx,
    private readonly bolts: LightningBatch,
    private readonly element: ElementBurst,
    private readonly decals: GroundDecals,
    private readonly level: () => number,
  ) {}

  private get low(): boolean {
    return this.fx.quality === 'low';
  }

  private kindOf(element: Element | null | undefined, expression: string | undefined): FxKind {
    // Keep the element's colour even at 0%: the setting only washes it out.
    return fxKind(element, expression, 1);
  }

  /** The sword raised: power gathering on the blade and round the caster. */
  cast(
    caster: EntityView,
    element: Element | null | undefined,
    expression: string | undefined,
    seconds: number,
  ): void {
    const color = tribulationColor(this.kindOf(element, expression), this.level());
    const hold = Math.max(0.2, seconds);
    const tip = caster.anchor('weapon_tip') ?? caster.anchor('hand_r');
    this.fx.chargeGlow(tip, color, hold);
    this.fx.chargeGlow(caster.anchor('hand_r'), WHITE, hold);
    const p = caster.root.position;
    this.fx.sprite({
      sprite: 'sigil',
      x: p.x,
      y: 0.07,
      z: p.z,
      mode: 'flat',
      roll: 0,
      rollEnd: -2.4,
      w: 4,
      grow: 1.25,
      life: hold + 0.3,
      color,
      intensity: 0.8,
      fadeIn: 0.4,
    });
    // Sparks streaming up the blade into the sky.
    if (tip && !this.low)
      for (let i = 0; i < 6; i++)
        this.fx.sprite({
          sprite: 'spark',
          x: p.x + (Math.random() - 0.5) * 0.6,
          y: 0.4,
          z: p.z + (Math.random() - 0.5) * 0.6,
          mode: 'billboard',
          w: 0.15,
          life: 0.5,
          color,
          intensity: 1.4,
          vy: 5 + Math.random() * 3,
          delay: (i / 6) * hold,
        });
  }

  /** Cast impact: the bolt shot up into the sky, clouds gathering. */
  launch(
    caster: EntityView | undefined,
    point: { x: number; z: number },
    element: Element | null | undefined,
    expression: string | undefined,
    seconds: number,
  ): Feedback {
    const color = tribulationColor(this.kindOf(element, expression), this.level());
    const tip = caster?.anchor('weapon_tip')?.getAbsolutePosition();
    const from = tip ? tip.clone() : new Vector3(point.x, 1.8, point.z);
    this.bolts.bolt({
      from,
      to: new Vector3(from.x + (Math.random() - 0.5), SKY, from.z + (Math.random() - 0.5)),
      color,
      width: 0.5,
      jitter: 1.2,
      life: 0.35,
      branches: this.low ? 0 : 2,
      intensity: 1.3,
    });
    this.fx.sprite({
      sprite: 'star',
      x: from.x,
      y: from.y,
      z: from.z,
      mode: 'billboard',
      w: 1.8,
      grow: 2,
      life: 0.2,
      color: WHITE,
      intensity: 1.4,
    });
    const sourceId = caster?.entityId ?? -1;
    const old = this.storms.findIndex((s) => s.sourceId === sourceId);
    if (old >= 0) this.storms.splice(old, 1);
    this.storms.push({
      sourceId,
      x: point.x,
      z: point.z,
      left: Math.max(1, seconds),
      nextCloud: 0,
      color,
    });
    return { shake: 0.08, kick: 0.4, seconds: 0.2 };
  }

  /** One host strike landing on `point`. */
  strike(
    sourceId: number,
    point: { x: number; z: number },
    radius: number,
    target: EntityView | undefined,
    element: Element | null | undefined,
    expression: string | undefined,
  ): Feedback {
    const level = this.level();
    const kind = this.kindOf(element, expression);
    const color = tribulationColor(kind, level);
    const k = 0.9 + 0.3 * Math.min(2, level);
    const { x, z } = point;
    const top = new Vector3(x + (Math.random() - 0.5) * 3, SKY, z + (Math.random() - 0.5) * 3);
    const ground = new Vector3(x, 0.05, z);
    // The great bolt: a wide one with forks, a thinner twin, a white core.
    this.bolts.bolt({
      from: top,
      to: ground,
      color,
      width: 0.95,
      jitter: 1.6,
      life: 0.4,
      branches: this.low ? 1 : 4,
      intensity: 1.35,
    });
    if (!this.low)
      this.bolts.bolt({
        from: top.add(new Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)),
        to: ground,
        color: Color3.Lerp(color, WHITE, 0.5),
        width: 0.4,
        jitter: 1.1,
        life: 0.28,
        delay: 0.05,
        intensity: 1.2,
      });
    this.fx.sprite({
      sprite: 'bolt',
      x,
      y: 2.2,
      z,
      mode: 'billboard',
      w: 1.8,
      h: 5,
      life: 0.2,
      color: WHITE,
      intensity: 1.3,
    });
    this.fx.sprite({
      sprite: 'star',
      x,
      y: 0.5,
      z,
      mode: 'billboard',
      w: 2.6,
      grow: 2,
      life: 0.2,
      color: WHITE,
      intensity: 1.5,
    });
    this.fx.sprite({
      sprite: 'shock',
      x,
      y: 0.08,
      z,
      mode: 'flat',
      w: Math.max(0.8, radius) * 0.7,
      grow: 4.5,
      life: 0.45,
      color,
      intensity: 1.3 * k,
    });
    this.fx.sprite({
      sprite: 'glow',
      x,
      y: 0.1,
      z,
      mode: 'flat',
      w: Math.max(1, radius) * 2.6,
      grow: 1.2,
      life: 0.55,
      color,
      intensity: 1.1 * k,
    });
    this.fx.sparks(x, 0.3, z, color, this.low ? 10 : 24, 7, {
      spread: Math.PI,
      gravity: 12,
    });
    this.element.burst(kind, x, z, 1.4, k);
    // Burnt black where it hit, a ragged ring of soot round it.
    this.decals.add(x, z, Math.max(1.2, radius) * 1.6, {
      life: 8,
      darkness: 0.9,
    });
    if (!this.low)
      this.decals.add(
        x + (Math.random() - 0.5),
        z + (Math.random() - 0.5),
        Math.max(1.2, radius) * 2.3,
        {
          life: 7,
          darkness: 0.45,
        },
      );
    if (target) {
      target.freeze(0.12);
      this.fx.hit(x, target.height * 0.55, z, Math.random() * Math.PI * 2, color, 0.8);
    }
    const storm = this.storms.find((s) => s.sourceId === sourceId);
    if (storm) storm.left = Math.max(storm.left, 0.6);
    return { shake: 0.3, kick: 0.7, seconds: 0.3 };
  }

  update(dt: number): void {
    for (let i = this.storms.length - 1; i >= 0; i--) {
      const s = this.storms[i] as Storm;
      s.left -= dt;
      if (s.left <= 0) {
        this.storms.splice(i, 1);
        continue;
      }
      s.nextCloud -= dt;
      if (s.nextCloud > 0) continue;
      s.nextCloud = this.low ? 0.35 : 0.15;
      // Churning storm clouds overhead, lit from inside now and then.
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 5;
      this.fx.sprite({
        sprite: 'smoke',
        x: s.x + Math.sin(a) * r,
        y: SKY - 4 + Math.random() * 2,
        z: s.z + Math.cos(a) * r,
        mode: 'billboard',
        roll: a,
        rollEnd: a + 1,
        w: 4 + Math.random() * 3,
        grow: 1.4,
        life: 1.6,
        color: Color3.Lerp(new Color3(0.2, 0.2, 0.28), s.color, 0.3),
        intensity: 0.6,
        vx: Math.cos(a) * 1.5,
        vz: -Math.sin(a) * 1.5,
        fadeIn: 0.3,
      });
      if (Math.random() < 0.35)
        this.fx.sprite({
          sprite: 'glow',
          x: s.x + Math.sin(a) * r,
          y: SKY - 3,
          z: s.z + Math.cos(a) * r,
          mode: 'billboard',
          w: 5,
          life: 0.18,
          color: s.color,
          intensity: 0.8,
        });
    }
  }

  dispose(): void {
    this.storms.length = 0;
  }
}
