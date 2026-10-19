import type { Element } from '@rpg/game-protocol';
import { Color3, Vector3 } from './babylon';
import type { CombatFx } from './combat-fx';
import type { LightningBatch } from './lightning';

/**
 * The ngũ hành layer of technique VFX (mưa kiếm, kiếm khí…), added on top of a
 * neutral technique effect: the caster's element (or its Lôi / Băng expression)
 * picks a colour, how many pieces the technique spawns and how strongly they
 * shine, plus a motif where they strike (`burst`) or along their path (`mote`).
 *
 * The "Hiệu ứng ngũ hành" setting (0..2) scales it: 0 = plain white light
 * without motifs, 1 = as authored, 2 = denser and deeper colour.
 */
export type FxKind = 'thunder' | 'ice' | Element | 'none';

export interface ElementTone {
  color: Color3;
  /** Piece count multiplier (a technique's base count × this). */
  density: number;
  /** Brightness of the pieces and motifs. */
  intensity: number;
  /** Piece size multiplier. */
  scale: number;
  /** Speed multiplier (falls, flights). */
  speed: number;
  /** Camera shake of the technique. */
  shake: number;
}

const hex = Color3.FromHexString;
const WHITE = Color3.White();
/** Additive sprites: ground marks must be light colours (dark ones add nothing). */
const EMBER = hex('#c8501e');
const SAND = hex('#a88a58');

export const ELEMENT_TONES: Record<FxKind, ElementTone> = {
  // Kim is the sword element: the most pieces, hard and bright.
  kim: {
    color: hex('#f2f6ff'),
    density: 1.4,
    intensity: 1.35,
    scale: 1,
    speed: 1.15,
    shake: 0.12,
  },
  // Mộc: few, soft green pieces.
  moc: {
    color: hex('#72d69b'),
    density: 0.75,
    intensity: 0.8,
    scale: 0.95,
    speed: 0.8,
    shake: 0.06,
  },
  thunder: {
    color: hex('#92dfff'),
    density: 1.1,
    intensity: 1.2,
    scale: 1,
    speed: 1.4,
    shake: 0.14,
  },
  thuy: {
    color: hex('#75ceff'),
    density: 0.9,
    intensity: 0.9,
    scale: 0.95,
    speed: 0.9,
    shake: 0.07,
  },
  ice: {
    color: hex('#b4eaff'),
    density: 1,
    intensity: 1.05,
    scale: 1,
    speed: 1,
    shake: 0.1,
  },
  hoa: {
    color: hex('#ff8750'),
    density: 1,
    intensity: 1.3,
    scale: 1,
    speed: 1.08,
    shake: 0.12,
  },
  // Thổ: few heavy pieces that hit hard.
  tho: {
    color: hex('#d8bc84'),
    density: 0.65,
    intensity: 1,
    scale: 1.3,
    speed: 0.93,
    shake: 0.2,
  },
  none: {
    color: hex('#e7f2ff'),
    density: 0.75,
    intensity: 0.85,
    scale: 1,
    speed: 1,
    shake: 0.08,
  },
};

/** Which look an element expression wears (Mộc's Lôi → thunder); level 0 → none. */
export function fxKind(
  element: Element | null | undefined,
  expression: string | undefined,
  level = 1,
): FxKind {
  if (level <= 0) return 'none';
  if (expression === 'thunder' || expression === 'ice') return expression;
  return element ?? 'none';
}

/** Piece count multiplier from the setting and the quality preset. */
export function elementBusy(level: number, quality: 'low' | 'medium' | 'high'): number {
  return (
    (0.5 + 0.5 * Math.min(2, level)) * (quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1)
  );
}

/** Brightness from the tone and the setting (0 still shows plain light). */
export function elementStrength(tone: ElementTone, level: number): number {
  return tone.intensity * (level > 0 ? 0.7 + 0.3 * Math.min(2, level) : 0.8);
}

export class ElementBurst {
  constructor(
    private readonly fx: CombatFx,
    private readonly bolts: LightningBatch,
  ) {}

  private get extra(): boolean {
    return this.fx.quality !== 'low';
  }

  /** Motif where a piece strikes the ground at (x, z). `k` = brightness. */
  burst(kind: FxKind, x: number, z: number, scale: number, k: number): void {
    const color = ELEMENT_TONES[kind].color;
    const extra = this.extra;
    switch (kind) {
      case 'kim':
        // Hard glints flaring off the steel.
        for (let i = 0; i < (extra ? 3 : 1); i++)
          this.fx.sprite({
            sprite: 'spark',
            x: x + rand(0.25),
            y: 0.4 + Math.random() * 0.6,
            z: z + rand(0.25),
            mode: 'billboard',
            roll: Math.random() * 3,
            w: 0.45,
            grow: 1.8,
            life: 0.2,
            color: WHITE,
            intensity: 1.3 * k,
            delay: i * 0.04,
          });
        this.fx.sparks(x, 0.15, z, color, extra ? 8 : 4, 4, {
          spread: Math.PI,
          gravity: 9,
        });
        break;
      case 'moc':
        this.fx.sprite({
          sprite: 'twirl',
          x,
          y: 0.08,
          z,
          mode: 'flat',
          roll: 0,
          rollEnd: Math.PI,
          w: 0.9 * scale,
          grow: 1.6,
          life: 0.55,
          color,
          intensity: 0.9 * k,
        });
        for (let i = 0; i < (extra ? 5 : 2); i++)
          this.fx.sprite({
            sprite: 'glow',
            x: x + rand(0.4),
            y: 0.2 + Math.random() * 0.3,
            z: z + rand(0.4),
            mode: 'billboard',
            w: 0.12 + Math.random() * 0.08,
            life: 0.9 + Math.random() * 0.5,
            color,
            intensity: 1.2 * k,
            vy: 0.5 + Math.random() * 0.4,
            vx: rand(0.2),
            vz: rand(0.2),
            fadeIn: 0.25,
          });
        break;
      case 'thunder':
        // A bolt from the sky into the strike, crackling over the ground.
        this.bolts.bolt({
          from: new Vector3(x + rand(0.8), 6, z + rand(0.8)),
          to: new Vector3(x, 1.1 * scale, z),
          color,
          width: 0.16,
          jitter: 0.6,
          life: 0.18,
          intensity: k,
        });
        if (extra)
          for (let i = 0; i < 2; i++) {
            const a = Math.random() * Math.PI * 2;
            this.bolts.bolt({
              from: new Vector3(x, 0.15, z),
              to: new Vector3(x + Math.sin(a) * 0.9, 0.05, z + Math.cos(a) * 0.9),
              color,
              width: 0.08,
              jitter: 0.2,
              life: 0.16,
              intensity: k,
            });
          }
        this.fx.sprite({
          sprite: 'zap',
          x,
          y: 0.5,
          z,
          mode: 'billboard',
          roll: Math.random() * 6,
          w: 0.9,
          grow: 1.4,
          life: 0.22,
          color,
          intensity: 1.3 * k,
        });
        break;
      case 'thuy':
        for (let i = 0; i < 2; i++)
          this.fx.sprite({
            sprite: 'ring',
            x,
            y: 0.06,
            z,
            mode: 'flat',
            w: 0.5 * scale,
            grow: 3,
            life: 0.55,
            color,
            intensity: 0.9 * k,
            delay: i * 0.12,
          });
        for (let i = 0; i < (extra ? 6 : 3); i++) {
          const a = Math.random() * Math.PI * 2;
          this.fx.sprite({
            sprite: 'glow',
            x,
            y: 0.15,
            z,
            mode: 'billboard',
            w: 0.1 + Math.random() * 0.06,
            life: 0.5,
            color,
            intensity: 1.4 * k,
            vx: Math.sin(a) * 1.2,
            vz: Math.cos(a) * 1.2,
            vy: 2 + Math.random(),
            gravity: 9,
          });
        }
        break;
      case 'ice':
        this.frost(x, z, 1.1 * scale, k);
        for (let i = 0; i < (extra ? 4 : 2); i++)
          this.fx.sprite({
            sprite: 'star',
            x: x + rand(0.35),
            y: 0.15 + Math.random() * 0.4,
            z: z + rand(0.35),
            mode: 'billboard',
            roll: Math.random() * 3,
            rollEnd: 1,
            w: 0.2,
            life: 0.6,
            color,
            intensity: 1.4 * k,
            delay: i * 0.05,
          });
        if (extra)
          this.fx.sprite({
            sprite: 'glow',
            x,
            y: 0.2,
            z,
            mode: 'billboard',
            w: 0.8,
            grow: 1.6,
            life: 0.9,
            color,
            intensity: 0.45 * k,
            vy: -0.05,
            fadeIn: 0.2,
          });
        break;
      case 'hoa':
        this.fx.sprite({
          sprite: 'blast',
          x,
          y: 0.4,
          z,
          mode: 'billboard',
          roll: Math.random() * 6,
          w: 0.9 * scale,
          grow: 1.5,
          life: 0.25,
          color,
          intensity: 1.3 * k,
        });
        this.scorch(x, z, 0.9 * scale, EMBER);
        for (let i = 0; i < (extra ? 4 : 2); i++) this.flame(x + rand(0.2), z + rand(0.2), k);
        this.fx.sparks(x, 0.2, z, hex('#ffc06b'), extra ? 8 : 4, 3, {
          spread: Math.PI,
          gravity: 4,
        });
        break;
      case 'tho':
        for (let i = 0; i < (extra ? 4 : 2); i++) {
          const a = (i / 4) * Math.PI * 2 + Math.random();
          this.dust(x, z, 0.6 * scale, Math.sin(a) * 1.4, Math.cos(a) * 1.4, a);
        }
        this.scorch(x, z, 1.3 * scale, SAND);
        this.fx.sparks(x, 0.15, z, color, extra ? 10 : 5, 3.5, {
          spread: Math.PI,
          gravity: 12,
        });
        break;
      case 'none':
        break;
    }
  }

  /**
   * Motif shed along a path (a flying piece passing over (x, y, z)), lighter
   * than a burst: called every few tens of centimetres of travel.
   */
  mote(kind: FxKind, x: number, y: number, z: number, k: number): void {
    const color = ELEMENT_TONES[kind].color;
    switch (kind) {
      case 'kim':
        this.fx.sprite({
          sprite: 'star',
          x: x + rand(0.15),
          y: y + rand(0.2),
          z: z + rand(0.15),
          mode: 'billboard',
          roll: Math.random() * 3,
          rollEnd: 1.5,
          w: 0.14 + Math.random() * 0.1,
          life: 0.35,
          color: WHITE,
          intensity: 1.4 * k,
          fadeIn: 0.2,
        });
        break;
      case 'moc':
        this.fx.sprite({
          sprite: Math.random() < 0.35 ? 'twirl' : 'glow',
          x: x + rand(0.2),
          y: y + rand(0.2),
          z: z + rand(0.2),
          mode: 'billboard',
          roll: Math.random() * 6,
          rollEnd: 3,
          w: 0.12 + Math.random() * 0.1,
          life: 0.9 + Math.random() * 0.4,
          color,
          intensity: 1.1 * k,
          vy: 0.35 + Math.random() * 0.3,
          vx: rand(0.25),
          vz: rand(0.25),
          fadeIn: 0.25,
        });
        break;
      case 'thunder':
        if (Math.random() < 0.5) {
          const a = Math.random() * Math.PI * 2;
          this.bolts.bolt({
            from: new Vector3(x, y, z),
            to: new Vector3(
              x + Math.sin(a) * 0.6,
              Math.max(0.05, y - 0.4 - Math.random() * 0.5),
              z + Math.cos(a) * 0.6,
            ),
            color,
            width: 0.07,
            jitter: 0.15,
            life: 0.14,
            intensity: k,
          });
        } else
          this.fx.sprite({
            sprite: 'zap',
            x,
            y,
            z,
            mode: 'billboard',
            roll: Math.random() * 6,
            w: 0.45,
            grow: 1.3,
            life: 0.18,
            color,
            intensity: 1.2 * k,
          });
        break;
      case 'thuy':
        this.fx.sprite({
          sprite: 'glow',
          x: x + rand(0.15),
          y,
          z: z + rand(0.15),
          mode: 'billboard',
          w: 0.08 + Math.random() * 0.06,
          life: 0.55,
          color,
          intensity: 1.4 * k,
          vx: rand(0.6),
          vz: rand(0.6),
          vy: 0.6 + Math.random() * 0.8,
          gravity: 7,
        });
        break;
      case 'ice':
        this.fx.sprite({
          sprite: Math.random() < 0.5 ? 'star' : 'spark',
          x: x + rand(0.15),
          y: y + rand(0.15),
          z: z + rand(0.15),
          mode: 'billboard',
          roll: Math.random() * 3,
          w: 0.12 + Math.random() * 0.08,
          life: 0.55,
          color,
          intensity: 1.3 * k,
          vy: -0.25,
        });
        break;
      case 'hoa':
        this.flame(x + rand(0.1), z + rand(0.1), k, y);
        break;
      case 'tho':
        this.fx.sprite({
          sprite: 'spark',
          x: x + rand(0.15),
          y: Math.min(y, 0.3),
          z: z + rand(0.15),
          mode: 'billboard',
          w: 0.06 + Math.random() * 0.04,
          life: 0.6,
          color,
          intensity: 1.2 * k,
          vx: rand(0.5),
          vz: rand(0.5),
          vy: 1 + Math.random() * 0.8,
          gravity: 6,
        });
        break;
      case 'none':
        break;
    }
  }

  /**
   * Mark a straight path leaves on the ground once crossed (x0,z0 → x1,z1):
   * frost, a burnt line, a furrow… `none` and Mộc/Thủy/Kim/Lôi leave only light.
   */
  scar(kind: FxKind, x0: number, z0: number, x1: number, z1: number, k: number): void {
    const color = ELEMENT_TONES[kind].color;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.3) return;
    const yaw = Math.atan2(dx, dz);
    const mid = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
    this.fx.sprite({
      sprite: 'trace',
      x: mid.x,
      y: 0.05,
      z: mid.z,
      mode: 'flat',
      yaw,
      w: kind === 'tho' ? 1.8 : 1.4,
      h: len,
      life: kind === 'ice' || kind === 'hoa' || kind === 'tho' ? 1.8 : 1.1,
      color: kind === 'hoa' ? hex('#ff6a2a') : kind === 'tho' ? SAND : color,
      intensity: (kind === 'none' ? 0.6 : 1) * k,
      fadeIn: 0.05,
    });
    // A soft band of the element's light along the cut, lasting a beat longer.
    this.fx.sprite({
      sprite: 'glow',
      x: mid.x,
      y: 0.06,
      z: mid.z,
      mode: 'flat',
      yaw,
      w: kind === 'tho' ? 1.3 : 1,
      // Overlapping neighbours: one continuous band, not beads.
      h: len * 2.6,
      life: 1.8,
      color: kind === 'hoa' ? EMBER : kind === 'tho' ? SAND : color,
      intensity: (kind === 'none' ? 0.18 : 0.3) * k,
      fadeIn: 0.08,
    });
    if (!this.extra) return;
    // A few ground marks spaced along it.
    const marks =
      kind === 'ice' || kind === 'hoa' || kind === 'tho'
        ? Math.floor(len / 1.6) + (Math.random() < (len % 1.6) / 1.6 ? 1 : 0)
        : 0;
    for (let i = 0; i < marks; i++) {
      const t = (i + 0.5) / marks;
      const x = x0 + dx * t + rand(0.2);
      const z = z0 + dz * t + rand(0.2);
      if (kind === 'ice') this.frost(x, z, 0.8, k);
      else if (kind === 'hoa') this.scorch(x, z, 0.7, EMBER);
      else this.scorch(x, z, 0.9, SAND);
    }
  }

  private frost(x: number, z: number, w: number, k: number): void {
    this.fx.sprite({
      sprite: 'scorch',
      x,
      y: 0.04,
      z,
      mode: 'flat',
      yaw: Math.random() * Math.PI * 2,
      w,
      life: 1,
      color: ELEMENT_TONES.ice.color,
      intensity: 0.8 * k,
    });
  }

  private scorch(x: number, z: number, w: number, color: Color3): void {
    this.fx.sprite({
      sprite: 'scorch',
      x,
      y: 0.04,
      z,
      mode: 'flat',
      yaw: Math.random() * Math.PI * 2,
      w,
      life: 1.1,
      color,
      intensity: 0.85,
    });
  }

  private flame(x: number, z: number, k: number, y = 0.3): void {
    this.fx.sprite({
      sprite: 'glow',
      x,
      y,
      z,
      mode: 'billboard',
      w: 0.25 + Math.random() * 0.15,
      grow: 0.4,
      life: 0.5,
      color: ELEMENT_TONES.hoa.color,
      intensity: 1.3 * k,
      vy: 1 + Math.random() * 0.6,
    });
  }

  private dust(x: number, z: number, w: number, vx: number, vz: number, roll: number): void {
    this.fx.sprite({
      sprite: 'smoke',
      x,
      y: 0.2,
      z,
      mode: 'billboard',
      roll,
      rollEnd: roll + 0.6,
      w,
      grow: 2,
      life: 0.8,
      color: ELEMENT_TONES.tho.color,
      intensity: 0.7,
      vx,
      vz,
      vy: 0.3,
      fadeIn: 0.1,
    });
  }
}

const rand = (k: number) => (Math.random() * 2 - 1) * k;
