import type { SkillDef } from '@rpg/game-data';
import { Color3 } from './babylon';
import type { CombatFx, FxSprite } from './combat-fx';
import type { EntityView } from './entity-view';

type Point = { x: number; z: number };
type Family =
  | 'base'
  | 'shadow'
  | 'arcane'
  | 'formation'
  | 'body'
  | 'beast'
  | 'sword'
  | 'forge'
  | 'boss'
  | 'robot';

const PREFIXES: readonly Family[] = [
  'base',
  'shadow',
  'arcane',
  'formation',
  'body',
  'beast',
  'sword',
  'forge',
  'boss',
  'robot',
];

const COLORS: Record<Family, Color3> = {
  base: Color3.FromHexString('#e8dfc7'),
  shadow: Color3.FromHexString('#8067b5'),
  arcane: Color3.FromHexString('#79dff2'),
  formation: Color3.FromHexString('#8fcfa9'),
  body: Color3.FromHexString('#d2aa72'),
  beast: Color3.FromHexString('#cf846b'),
  sword: Color3.FromHexString('#f2edda'),
  forge: Color3.FromHexString('#e2b86d'),
  boss: Color3.FromHexString('#df6757'),
  robot: Color3.FromHexString('#ef6b68'),
};

const WHITE = Color3.White();

function familyOf(style: string): Family | null {
  return PREFIXES.find((prefix) => style.startsWith(`${prefix}_`)) ?? null;
}

export function isTechniqueStyle(style: string | undefined): boolean {
  return !!style && familyOf(style) !== null;
}

/**
 * Technique silhouette layer. The natal element and expression are composed by
 * ElementalFx/ThunderFx; this class deliberately owns shape and timing only.
 */
export class TechniqueFx {
  constructor(private readonly fx: CombatFx) {}

  cast(skill: SkillDef, caster: EntityView, point: Point | null, seconds: number): void {
    const family = familyOf(skill.vfx);
    if (!family) return;
    const color = this.color(skill.vfx, family);
    const p = caster.root.position;
    const hold = Math.max(0.16, seconds);

    if (skill.mobility) {
      this.mobilityDeparture(skill.vfx, p.x, p.z, color);
      return;
    }

    if (this.isSupport(skill.vfx)) {
      this.supportCast(family, caster, color, hold);
      return;
    }

    switch (family) {
      case 'shadow':
        this.fx.chargeGlow(caster.anchor('weapon_tip') ?? caster.anchor('hand_r'), color, hold);
        this.ground('trace', p.x, p.z, 0.55, color, hold, -Math.PI * 0.35);
        break;
      case 'arcane':
        this.fx.chargeGlow(caster.anchor('hand_r'), color, hold);
        this.ground('rune', point?.x ?? p.x, point?.z ?? p.z, 0.9, color, hold, Math.PI);
        break;
      case 'formation':
        this.ground('sigil', point?.x ?? p.x, point?.z ?? p.z, 1.25, color, hold, Math.PI * 0.6);
        if (!this.low)
          this.ground('rune', point?.x ?? p.x, point?.z ?? p.z, 0.82, WHITE, hold, -Math.PI * 0.4);
        break;
      case 'body':
        this.ground('shock', p.x, p.z, 0.72, color, hold, 0);
        this.fx.sprite({
          sprite: 'glow',
          x: p.x,
          y: caster.height * 0.55,
          z: p.z,
          mode: 'billboard',
          w: 0.8,
          h: caster.height * 0.8,
          grow: 1.25,
          life: hold,
          color,
          intensity: 0.75,
          follow: caster.root,
          pulse: 12,
        });
        break;
      case 'beast':
        this.ground('sigil', p.x, p.z, 0.75, color, hold, Math.PI * 0.5);
        this.fx.chargeGlow(caster.anchor('hand_r'), color, hold);
        break;
      case 'sword':
        this.fx.chargeGlow(caster.anchor('weapon_tip') ?? caster.anchor('hand_r'), color, hold);
        break;
      case 'forge':
        this.ground('rune', point?.x ?? p.x, point?.z ?? p.z, 1, color, hold, Math.PI * 0.7);
        this.fx.chargeGlow(caster.anchor('weapon_tip') ?? caster.anchor('hand_r'), color, hold);
        break;
      case 'boss':
        this.ground('shock', point?.x ?? p.x, point?.z ?? p.z, 1.25, color, hold, 0);
        break;
      case 'robot':
        this.fx.chargeGlow(caster.anchor('weapon_tip') ?? caster.anchor('hand_r'), color, hold);
        break;
      case 'base':
        this.fx.chargeGlow(caster.anchor('hand_r'), color, hold);
        break;
    }
  }

  projectile(skill: SkillDef, origin: Point, destination: Point): void {
    const family = familyOf(skill.vfx);
    if (!family) return;
    const color = this.color(skill.vfx, family);
    const dx = destination.x - origin.x;
    const dz = destination.z - origin.z;
    const yaw = Math.atan2(dx, dz);
    const sprite: FxSprite =
      family === 'shadow' || family === 'beast'
        ? 'slash'
        : family === 'arcane'
          ? 'sigil'
          : family === 'robot'
            ? 'trace'
            : 'star';
    this.fx.sprite({
      sprite,
      x: origin.x + Math.sin(yaw) * 0.5,
      y: family === 'arcane' ? 0.72 : 0.82,
      z: origin.z + Math.cos(yaw) * 0.5,
      mode: family === 'arcane' ? 'billboard' : 'upright',
      yaw,
      rollEnd: family === 'arcane' ? Math.PI : 0,
      w: family === 'robot' ? 0.18 : 0.52,
      h: family === 'robot' ? 1.6 : 0.9,
      grow: 1.35,
      life: 0.24,
      color,
      intensity: 1.1,
    });
  }

  impact(
    skill: SkillDef,
    caster: EntityView | undefined,
    target: EntityView | undefined,
    from: Point | null,
    point: Point,
    radius: number,
  ): void {
    const family = familyOf(skill.vfx);
    if (!family) return;
    const color = this.color(skill.vfx, family);
    const scale = Math.max(0.75, Math.min(2.4, radius || 1));

    if (skill.mobility) {
      this.mobilityArrival(skill.vfx, from, point, color);
      return;
    }
    if (this.isSupport(skill.vfx)) {
      this.supportImpact(family, target ?? caster, point, color, scale);
      return;
    }

    switch (family) {
      case 'shadow':
        this.slash(point, caster?.root.rotation.y ?? 0, color, scale, false, 0);
        this.slash(
          point,
          caster?.root.rotation.y ?? 0,
          Color3.Lerp(color, WHITE, 0.35),
          scale * 0.9,
          true,
          0.08,
        );
        this.fx.sprite({
          sprite: 'smoke',
          x: point.x,
          y: 0.3,
          z: point.z,
          mode: 'billboard',
          w: scale,
          grow: 1.8,
          life: 0.4,
          color,
          intensity: 0.45,
        });
        break;
      case 'arcane':
        this.ground('rune', point.x, point.z, scale, color, 0.42, Math.PI * 0.6);
        this.fx.sprite({
          sprite: skill.vfx.includes('storm') ? 'twirl' : 'star',
          x: point.x,
          y: 0.65,
          z: point.z,
          mode: 'billboard',
          w: scale * 0.75,
          grow: 2.2,
          life: 0.3,
          color: WHITE,
          intensity: 1.2,
        });
        break;
      case 'formation':
        this.ground('sigil', point.x, point.z, scale * 1.35, color, 0.72, Math.PI * 0.5);
        this.ground('rune', point.x, point.z, scale * 0.92, WHITE, 0.5, -Math.PI * 0.45, 0.06);
        this.ring(point, scale, color, 0.08);
        break;
      case 'body':
        this.ground('shock', point.x, point.z, scale, color, 0.44, 0);
        this.ground('scorch', point.x, point.z, scale * 1.15, color, 0.75, 0);
        this.ring(point, scale * 1.2, color, 0);
        this.fx.sparks(point.x, 0.15, point.z, color, 12, 4.4, {
          gravity: 13,
          size: 0.2,
        });
        break;
      case 'beast':
        this.slash(point, caster?.root.rotation.y ?? 0, color, scale, false, 0);
        this.slash(point, caster?.root.rotation.y ?? 0, WHITE, scale * 0.82, true, 0.045);
        this.ring(point, scale * 0.72, color, 0.04);
        break;
      case 'sword':
        if (skill.vfx.includes('whirl')) {
          this.ground('twirl', point.x, point.z, scale * 1.5, color, 0.46, Math.PI * 1.8);
          this.ring(point, scale, WHITE, 0.03);
        } else this.slash(point, caster?.root.rotation.y ?? 0, color, scale * 1.2, false, 0);
        break;
      case 'forge':
        this.forgeImpact(skill.vfx, point, scale, color);
        break;
      case 'boss':
        this.ground('shock', point.x, point.z, scale * 1.5, color, 0.5, 0);
        this.ring(point, scale * 1.45, color, 0);
        this.fx.sparks(point.x, 0.18, point.z, color, 14, 5, {
          gravity: 14,
          size: 0.24,
        });
        break;
      case 'robot':
        this.fx.sprite({
          sprite: 'blast',
          x: point.x,
          y: 0.7,
          z: point.z,
          mode: 'billboard',
          w: scale,
          grow: 2,
          life: 0.24,
          color,
          intensity: 1.25,
        });
        this.ring(point, scale * 0.7, color, 0);
        break;
      case 'base':
        this.ring(point, scale, color, 0);
        break;
    }
  }

  hit(target: EntityView, skill: SkillDef): void {
    const family = familyOf(skill.vfx);
    if (!family) return;
    const p = target.root.position;
    this.fx.hit(
      p.x,
      target.height * 0.55,
      p.z,
      Math.random() * Math.PI * 2,
      this.color(skill.vfx, family),
      0.38,
    );
  }

  private get low(): boolean {
    return this.fx.quality === 'low';
  }

  private color(style: string, family: Family): Color3 {
    if (style.includes('flame')) return Color3.FromHexString('#ff7650');
    if (style.includes('frost')) return Color3.FromHexString('#80d8ff');
    if (style.includes('metal')) return Color3.FromHexString('#e8eef5');
    if (style.includes('gale')) return Color3.FromHexString('#79d8b0');
    if (style.includes('quake')) return Color3.FromHexString('#c5a16b');
    return COLORS[family];
  }

  private isSupport(style: string): boolean {
    return /_(cloak|guard|bond|heal|link|avatar)$/.test(style);
  }

  private supportCast(family: Family, caster: EntityView, color: Color3, life: number): void {
    const p = caster.root.position;
    this.ground(
      family === 'formation' ? 'sigil' : 'rune',
      p.x,
      p.z,
      0.8,
      color,
      life,
      Math.PI * 0.5,
    );
    this.fx.sprite({
      sprite: family === 'shadow' ? 'smoke' : 'glow',
      x: p.x,
      y: caster.height * 0.5,
      z: p.z,
      mode: 'billboard',
      w: 0.75,
      h: caster.height * 0.9,
      grow: 1.35,
      life,
      color,
      intensity: 0.72,
      follow: caster.root,
      fadeIn: 0.22,
    });
  }

  private supportImpact(
    family: Family,
    recipient: EntityView | undefined,
    point: Point,
    color: Color3,
    scale: number,
  ): void {
    const p = recipient?.root.position ?? point;
    this.ground(
      family === 'formation' ? 'sigil' : 'ring',
      p.x,
      p.z,
      scale,
      color,
      0.55,
      Math.PI * 0.45,
    );
    const motes = this.low ? 3 : 7;
    for (let i = 0; i < motes; i++) {
      const a = (i / motes) * Math.PI * 2;
      this.fx.sprite({
        sprite: family === 'body' ? 'smoke' : 'spark',
        x: p.x + Math.sin(a) * scale * 0.55,
        y: 0.15,
        z: p.z + Math.cos(a) * scale * 0.55,
        mode: 'billboard',
        w: 0.13,
        grow: 0.5,
        life: 0.48,
        color,
        intensity: 0.9,
        vx: -Math.sin(a) * 0.5,
        vz: -Math.cos(a) * 0.5,
        vy: 1.6,
      });
    }
  }

  private mobilityDeparture(style: string, x: number, z: number, color: Color3): void {
    if (style === 'base_roll') {
      this.fx.sprite({
        sprite: 'smoke',
        x,
        y: 0.18,
        z,
        mode: 'billboard',
        w: 0.62,
        grow: 1.8,
        life: 0.3,
        color,
        intensity: 0.55,
      });
      return;
    }
    this.ground(
      style === 'base_blink' ? 'rune' : 'ring',
      x,
      z,
      style === 'base_blink' ? 0.95 : 0.72,
      color,
      0.3,
      style === 'base_blink' ? -Math.PI : 0,
    );
  }

  private mobilityArrival(style: string, from: Point | null, point: Point, color: Color3): void {
    if (from) {
      const dx = point.x - from.x;
      const dz = point.z - from.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.2)
        this.fx.sprite({
          sprite: style === 'base_roll' ? 'smoke' : 'trace',
          x: (from.x + point.x) * 0.5,
          y: style === 'base_roll' ? 0.18 : 0.1,
          z: (from.z + point.z) * 0.5,
          mode: style === 'base_roll' ? 'billboard' : 'flat',
          yaw: Math.atan2(dx, dz),
          w: style === 'base_roll' ? 0.45 : 0.22,
          h: distance,
          growH: 0.25,
          life: 0.28,
          color,
          intensity: 0.65,
        });
    }
    if (style === 'base_jump') {
      this.ground('shock', point.x, point.z, 0.9, color, 0.34, 0);
      this.fx.sparks(point.x, 0.12, point.z, color, 7, 2.4, {
        gravity: 11,
        size: 0.15,
      });
    } else if (style === 'base_blink') {
      this.ground('rune', point.x, point.z, 0.72, color, 0.34, Math.PI * 0.8);
    } else {
      this.fx.sprite({
        sprite: 'smoke',
        x: point.x,
        y: 0.18,
        z: point.z,
        mode: 'billboard',
        w: 0.55,
        grow: 1.6,
        life: 0.28,
        color,
        intensity: 0.52,
      });
    }
  }

  private slash(
    point: Point,
    yaw: number,
    color: Color3,
    scale: number,
    mirror: boolean,
    delay: number,
  ): void {
    this.fx.sprite({
      sprite: 'slash',
      x: point.x,
      y: 0.78,
      z: point.z,
      mode: 'flat',
      yaw: yaw + Math.PI,
      roll: mirror ? -0.55 : 0.55,
      rollEnd: mirror ? 0.35 : -0.35,
      mirror,
      w: scale * 1.75,
      grow: 1.12,
      life: 0.25,
      color,
      intensity: 1.2,
      delay,
    });
  }

  private ring(point: Point, scale: number, color: Color3, delay: number): void {
    this.fx.sprite({
      sprite: 'ring',
      x: point.x,
      y: 0.065,
      z: point.z,
      mode: 'flat',
      w: scale * 0.45,
      grow: 3,
      life: 0.38,
      color,
      intensity: 1,
      delay,
    });
  }

  private ground(
    sprite: FxSprite,
    x: number,
    z: number,
    scale: number,
    color: Color3,
    life: number,
    spin: number,
    delay = 0,
  ): void {
    this.fx.sprite({
      sprite,
      x,
      y: 0.055,
      z,
      mode: 'flat',
      rollEnd: spin,
      w: scale,
      grow: sprite === 'shock' || sprite === 'ring' ? 2.5 : 1.25,
      life,
      color,
      intensity: 0.9,
      delay,
    });
  }

  private forgeImpact(style: string, point: Point, scale: number, color: Color3): void {
    const sprite: FxSprite = style.includes('flame')
      ? 'blast'
      : style.includes('frost')
        ? 'ring'
        : style.includes('gale')
          ? 'twirl'
          : style.includes('metal')
            ? 'slash'
            : 'shock';
    this.fx.sprite({
      sprite,
      x: point.x,
      y: sprite === 'blast' || sprite === 'slash' ? 0.65 : 0.06,
      z: point.z,
      mode: sprite === 'blast' ? 'billboard' : 'flat',
      w: scale * 1.25,
      grow: 2,
      rollEnd: sprite === 'twirl' ? Math.PI * 1.8 : 0,
      life: 0.48,
      color,
      intensity: 1.2,
    });
    this.ring(point, scale, color, 0.04);
  }
}
