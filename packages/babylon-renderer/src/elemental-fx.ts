import type { SkillDef } from '@rpg/game-data';
import type { Element } from '@rpg/game-protocol';
import { Color3 } from './babylon';
import type { CombatFx, FxSprite } from './combat-fx';
import { ELEMENT_COLOR } from './elements';
import type { EntityView } from './entity-view';

/**
 * The natal-element layer shared by every skill presentation.
 *
 * Technique and expression effects (for example ThunderFx) are deliberately
 * separate: this restrained layer stays visible underneath them so a Hoa
 * thunder skill still reads as Hoa first and thunder second.
 */
export class ElementalFx {
  constructor(private readonly fx: CombatFx) {}

  cast(
    caster: EntityView,
    skill: SkillDef,
    element: Element | null | undefined,
    seconds: number,
  ): void {
    if (!element) return;
    const color = Color3.FromHexString(ELEMENT_COLOR[element]);
    const p = caster.root.position;

    if (skill.mobility) {
      this.mobilityDeparture(skill.mobility, p.x, p.z, color);
      return;
    }

    this.motif(element, p.x, p.z, color, 0.7, Math.min(0.45, seconds));
    if (this.fx.quality !== 'low')
      this.fx.sprite({
        sprite: 'glow',
        x: p.x,
        y: caster.height * 0.58,
        z: p.z,
        mode: 'billboard',
        w: 0.38,
        grow: 1.45,
        life: Math.max(0.16, Math.min(0.5, seconds)),
        color,
        intensity: 0.65,
        follow: caster.anchor('hand_r') ?? caster.root,
        pulse: 18,
      });
  }

  impact(
    skill: SkillDef,
    element: Element | null | undefined,
    point: { x: number; z: number },
    radius: number,
    from: { x: number; z: number } | null,
  ): void {
    if (!element) return;
    const color = Color3.FromHexString(ELEMENT_COLOR[element]);

    if (skill.mobility) this.mobilityArrival(skill.mobility, from, point, color);

    const scale = Math.max(0.65, Math.min(1.8, radius || 0.8));
    this.motif(element, point.x, point.z, color, scale, 0.38);
    this.fx.sparks(point.x, 0.28, point.z, color, 5, 2.4, {
      gravity: element === 'thuy' ? 2 : 7,
      size: 0.12,
    });
  }

  private motif(
    element: Element,
    x: number,
    z: number,
    color: Color3,
    scale: number,
    life: number,
  ): void {
    const sprite: FxSprite =
      element === 'kim'
        ? 'star'
        : element === 'moc'
          ? 'twirl'
          : element === 'thuy'
            ? 'ring'
            : element === 'hoa'
              ? 'blast'
              : 'scorch';
    const flat = element !== 'kim' && element !== 'hoa';
    this.fx.sprite({
      sprite,
      x,
      y: flat ? 0.055 : 0.38,
      z,
      mode: flat ? 'flat' : 'billboard',
      w: scale,
      grow: element === 'tho' ? 1.25 : 2,
      life: Math.max(0.18, life),
      rollEnd: element === 'moc' ? Math.PI * 0.75 : 0,
      color,
      intensity: 0.8,
    });
  }

  private mobilityDeparture(
    kind: NonNullable<SkillDef['mobility']>,
    x: number,
    z: number,
    color: Color3,
  ): void {
    if (kind === 'roll') {
      this.fx.sprite({
        sprite: 'smoke',
        x,
        y: 0.18,
        z,
        mode: 'billboard',
        w: 0.55,
        grow: 2,
        life: 0.3,
        color,
        intensity: 0.55,
      });
      return;
    }
    this.fx.sprite({
      sprite: kind === 'blink' ? 'rune' : 'ring',
      x,
      y: 0.06,
      z,
      mode: 'flat',
      w: kind === 'blink' ? 1.05 : 0.72,
      grow: kind === 'blink' ? 0.12 : 2.4,
      life: kind === 'blink' ? 0.28 : 0.34,
      color,
      intensity: 0.9,
    });
  }

  private mobilityArrival(
    kind: NonNullable<SkillDef['mobility']>,
    from: { x: number; z: number } | null,
    point: { x: number; z: number },
    color: Color3,
  ): void {
    if (kind === 'blink' && from) {
      const dx = point.x - from.x;
      const dz = point.z - from.z;
      const distance = Math.hypot(dx, dz);
      this.fx.sprite({
        sprite: 'trace',
        x: (from.x + point.x) * 0.5,
        y: 0.14,
        z: (from.z + point.z) * 0.5,
        mode: 'flat',
        yaw: Math.atan2(dx, dz),
        w: 0.42,
        h: Math.max(0.5, distance),
        growH: 0.2,
        life: 0.25,
        color,
        intensity: 0.75,
      });
    }
    this.fx.sprite({
      sprite: kind === 'roll' ? 'smoke' : kind === 'blink' ? 'rune' : 'ring',
      x: point.x,
      y: kind === 'roll' ? 0.18 : 0.06,
      z: point.z,
      mode: kind === 'roll' ? 'billboard' : 'flat',
      w: kind === 'jump' ? 0.9 : 0.7,
      grow: kind === 'blink' ? 1.9 : 2.2,
      life: 0.32,
      color,
      intensity: 0.8,
    });
  }
}
