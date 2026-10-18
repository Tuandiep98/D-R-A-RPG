import type { Element } from '@rpg/game-protocol';
import { Color3, type TransformNode, Vector3 } from './babylon';
import type { CombatFx, FxSprite } from './combat-fx';
import type { EntityView } from './entity-view';
import type { LightningBatch } from './lightning';
import type { QualityLevel } from './quality';

/** Player setting: 0 = off, 1 = as authored, 2 = twice as busy. */
export const ELEMENT_AURA_MAX = 2;

/**
 * Aura looks: the five elements plus the expressions that change them
 * (combat_rules.expressions: Mộc → Lôi, Thủy → Băng).
 */
type AuraKind = 'thunder' | 'ice' | Element;

interface ThunderStyle {
  color: Color3;
  /** Arcs per second at 100% on High. */
  rate: number;
  /** Most arcs crawling on one weapon at once at 100%. */
  alive: number;
  /** Arc life, seconds. */
  life: [number, number];
  /** Arc length as a share of the hand → tip span. */
  span: [number, number];
  /** How far arcs stand off the weapon, metres. */
  offset: [number, number];
  /** Chance of an arc leaping off the tip into the air. */
  leap: number;
}

const THUNDER: ThunderStyle = {
  color: Color3.FromHexString('#92dfff'),
  rate: 12,
  alive: 4,
  life: [0.1, 0.22],
  span: [0.22, 0.5],
  offset: [0.04, 0.14],
  leap: 0.22,
};

/** One kind of sprite an aura sheds (CombatFx pools and caps them). */
interface Mote {
  sprite: FxSprite;
  color: Color3;
  /** Relative share among the style's motes. */
  weight: number;
  size: [number, number];
  life: [number, number];
  /** Vertical speed, m/s (negative sinks). */
  rise: [number, number];
  /** Random sideways speed, m/s. */
  drift: number;
  gravity?: number;
  /** Spin over life, radians. */
  spin?: number;
  grow?: number;
  fadeIn?: number;
  intensity: number;
  /** Distance off the weapon, metres. */
  offset: [number, number];
}

interface MoteStyle {
  /** Motes per second at 100% on High. */
  rate: number;
  motes: Mote[];
}

const hex = Color3.FromHexString;

/** Sprite auras by kind (Lôi uses procedural bolts instead). */
const MOTE_STYLES: Record<Exclude<AuraKind, 'thunder'>, MoteStyle> = {
  // Kim: hard white glints flashing along the edge.
  kim: {
    rate: 12,
    motes: [
      {
        sprite: 'star',
        color: hex('#f4f8ff'),
        weight: 3,
        size: [0.12, 0.22],
        life: [0.25, 0.45],
        rise: [0, 0.04],
        drift: 0.02,
        spin: 2.5,
        grow: 0.3,
        fadeIn: 0.25,
        intensity: 1.6,
        offset: [0, 0.03],
      },
      {
        sprite: 'spark',
        color: hex('#dfe8f2'),
        weight: 1,
        size: [0.18, 0.3],
        life: [0.12, 0.22],
        rise: [0, 0],
        drift: 0,
        grow: 1.6,
        intensity: 1.2,
        offset: [0, 0.02],
      },
    ],
  },
  // Mộc: green motes and leaf-like twirls drifting up.
  moc: {
    rate: 9,
    motes: [
      {
        sprite: 'glow',
        color: hex('#8ee6a8'),
        weight: 3,
        size: [0.08, 0.14],
        life: [0.9, 1.5],
        rise: [0.15, 0.35],
        drift: 0.12,
        fadeIn: 0.3,
        intensity: 1.3,
        offset: [0.02, 0.1],
      },
      {
        sprite: 'twirl',
        color: hex('#5fcf86'),
        weight: 1,
        size: [0.18, 0.3],
        life: [0.6, 0.9],
        rise: [0.05, 0.15],
        drift: 0.05,
        spin: 3,
        fadeIn: 0.3,
        intensity: 0.9,
        offset: [0, 0.05],
      },
    ],
  },
  // Thủy: water ribbons swirling round the blade, drops beading and dripping off.
  thuy: {
    rate: 14,
    motes: [
      {
        sprite: 'glow',
        color: hex('#75ceff'),
        weight: 3,
        size: [0.08, 0.13],
        life: [0.7, 1],
        rise: [-0.02, 0.06],
        drift: 0.04,
        gravity: 1,
        intensity: 1.6,
        offset: [0, 0.04],
      },
      {
        sprite: 'twirl',
        color: hex('#4fb4f0'),
        weight: 2,
        size: [0.2, 0.32],
        life: [0.5, 0.8],
        rise: [0, 0.06],
        drift: 0.03,
        spin: 3.5,
        fadeIn: 0.25,
        intensity: 0.9,
        offset: [0, 0.03],
      },
      {
        sprite: 'glow',
        color: hex('#4fb4f0'),
        weight: 1,
        size: [0.22, 0.34],
        life: [0.7, 1.1],
        rise: [0.03, 0.08],
        drift: 0.05,
        grow: 1.4,
        fadeIn: 0.3,
        intensity: 0.5,
        offset: [0, 0.04],
      },
    ],
  },
  // Băng: icy-blue crystals, frost shards and cold vapour sinking off the weapon.
  ice: {
    rate: 12,
    motes: [
      {
        sprite: 'star',
        color: hex('#8fd8ff'),
        weight: 2,
        size: [0.1, 0.18],
        life: [0.4, 0.7],
        rise: [-0.02, 0.04],
        drift: 0.03,
        spin: 1.5,
        fadeIn: 0.2,
        intensity: 1.5,
        offset: [0, 0.05],
      },
      {
        sprite: 'spark',
        color: hex('#6cc8ff'),
        weight: 1,
        size: [0.08, 0.14],
        life: [0.3, 0.5],
        rise: [-0.1, 0],
        drift: 0.05,
        spin: 0.8,
        intensity: 1.3,
        offset: [0, 0.04],
      },
      {
        sprite: 'glow',
        color: hex('#9fdcff'),
        weight: 2,
        size: [0.24, 0.38],
        life: [0.8, 1.2],
        rise: [-0.1, -0.03],
        drift: 0.06,
        grow: 1.5,
        fadeIn: 0.3,
        intensity: 0.55,
        offset: [0, 0.04],
      },
    ],
  },
  // Hỏa: flame tongues licking up the blade, embers flying off.
  hoa: {
    rate: 30,
    motes: [
      {
        sprite: 'glow',
        color: hex('#ff8750'),
        weight: 3,
        size: [0.16, 0.3],
        life: [0.35, 0.6],
        rise: [0.4, 0.7],
        drift: 0.06,
        grow: 0.45,
        fadeIn: 0.15,
        intensity: 1.5,
        offset: [0, 0.04],
      },
      {
        sprite: 'spark',
        color: hex('#ff6a2a'),
        weight: 2,
        size: [0.14, 0.24],
        life: [0.25, 0.4],
        rise: [0.3, 0.6],
        drift: 0.04,
        grow: 0.6,
        spin: 0.6,
        fadeIn: 0.1,
        intensity: 1.3,
        offset: [0, 0.03],
      },
      {
        sprite: 'spark',
        color: hex('#ffc06b'),
        weight: 1,
        size: [0.06, 0.1],
        life: [0.5, 0.8],
        rise: [0.5, 0.9],
        drift: 0.15,
        intensity: 1.6,
        offset: [0, 0.06],
      },
    ],
  },
  // Thổ: dust haze and grit hopping off and falling back.
  tho: {
    rate: 9,
    motes: [
      {
        sprite: 'smoke',
        color: hex('#d8bc84'),
        weight: 2,
        size: [0.2, 0.34],
        life: [0.8, 1.2],
        rise: [0.02, 0.08],
        drift: 0.08,
        grow: 1.5,
        fadeIn: 0.3,
        intensity: 0.7,
        offset: [0, 0.06],
      },
      {
        sprite: 'spark',
        color: hex('#e2c48c'),
        weight: 2,
        size: [0.05, 0.08],
        life: [0.5, 0.8],
        rise: [0.4, 0.7],
        drift: 0.25,
        gravity: 2.4,
        intensity: 1.3,
        offset: [0, 0.05],
      },
    ],
  },
};

/** Arc count multiplier by quality (bolts share one capped batch with skills). */
const QUALITY_SCALE: Record<QualityLevel, number> = { low: 0.35, medium: 0.7, high: 1 };
/** Bare hands: arcs wrap a ball this big around the fist. */
const FIST_RADIUS = 0.14;

interface Holder {
  due: number;
  /** End times (aura clock) of this weapon's live arcs. */
  live: number[];
}

const a = new Vector3();
const b = new Vector3();
const axis = new Vector3();
const side = new Vector3();

/**
 * Ngũ hành aura on characters (presentation only), along whatever they hold —
 * the span from the right hand to the weapon tip, or around the fist when
 * bare-handed: Kim glints, Mộc motes, Lôi arcs, Thủy drops, Băng frost, Hỏa
 * flames, Thổ dust. The "Hiệu ứng ngũ hành" setting scales how many and how often.
 */
export class ElementAura {
  private readonly holders = new Map<number, Holder>();
  private levelValue = 1;
  private quality: QualityLevel = 'high';
  private time = 0;

  constructor(
    private readonly bolts: LightningBatch,
    private readonly fx: CombatFx,
  ) {}

  get level(): number {
    return this.levelValue;
  }

  setLevel(level: number): void {
    this.levelValue = Math.min(ELEMENT_AURA_MAX, Math.max(0, Number.isFinite(level) ? level : 1));
  }

  setQuality(level: QualityLevel): void {
    this.quality = level;
  }

  /** `units`: characters that may carry an aura this frame. */
  update(
    dt: number,
    units: Iterable<{
      id: number;
      view: EntityView;
      element: Element | null | undefined;
      expression: string | undefined;
    }>,
  ): void {
    this.time += dt;
    const seen = new Set<number>();
    if (this.levelValue > 0)
      for (const u of units) {
        const kind = auraKind(u.element, u.expression);
        if (!kind || !u.view.root.isEnabled()) continue;
        seen.add(u.id);
        if (kind === 'thunder') this.thunder(u.id, u.view);
        else this.motes(u.id, u.view, MOTE_STYLES[kind]);
      }
    for (const id of this.holders.keys()) if (!seen.has(id)) this.holders.delete(id);
  }

  private thunder(id: number, view: EntityView): void {
    const s = THUNDER;
    const h = this.holder(id);
    h.live = h.live.filter((end) => end > this.time);
    const busy = this.levelValue * QUALITY_SCALE[this.quality];
    if (this.time < h.due) return;
    // Exponential gaps: crackle at random, denser with the setting.
    h.due = this.time - Math.log(1 - Math.random()) / (s.rate * busy);
    // Past 150% arcs come more often but no more pile up at once (stays readable).
    if (h.live.length >= Math.max(1, Math.round(s.alive * Math.min(1.5, busy)))) return;

    const hand = view.anchor('hand_r');
    const tip = view.anchor('weapon_tip');
    if (!hand) return;
    const life = lerp(s.life, Math.random());
    if (!tip || tip === hand || worldDistance(hand, tip) < 0.08) this.fistArc(hand, life, busy);
    else this.bladeArc(hand, tip, life, busy, s);
    h.live.push(this.time + life);
  }

  private holder(id: number): Holder {
    let h = this.holders.get(id);
    if (!h) {
      h = { due: this.time + Math.random() * 0.2, live: [] };
      this.holders.set(id, h);
    }
    return h;
  }

  /** Sprite auras: motes shed at random points along the weapon (or the fist). */
  private motes(id: number, view: EntityView, s: MoteStyle): void {
    const h = this.holder(id);
    const busy = this.levelValue * QUALITY_SCALE[this.quality];
    const hand = view.anchor('hand_r');
    if (!hand) return;
    const tip = view.anchor('weapon_tip');
    const armed = !!tip && tip !== hand && worldDistance(hand, tip) >= 0.08;
    // A few per frame at most, so a long hitch does not dump a burst.
    for (let n = 0; n < 3 && this.time >= h.due; n++) {
      h.due += -Math.log(1 - Math.random()) / (s.rate * busy * (armed ? 1 : 1.4));
      const m = pick(s.motes);
      if (armed && tip) {
        const base = hand.getAbsolutePosition();
        tip.getAbsolutePosition().subtractToRef(base, axis);
        a.copyFrom(base).addInPlace(axis.scale(0.15 + Math.random() * 0.85));
        randomSide(axis.normalize(), side);
      } else {
        randomUnit(side).scaleInPlace(FIST_RADIUS);
        a.copyFrom(hand.getAbsolutePosition()).addInPlace(side);
        randomUnit(side);
      }
      a.addInPlace(side.scale(lerp(m.offset, Math.random())));
      const roll = Math.random() * Math.PI * 2;
      const dir = Math.random() * Math.PI * 2;
      const drift = m.drift * Math.random();
      this.fx.sprite({
        sprite: m.sprite,
        x: a.x,
        y: a.y,
        z: a.z,
        mode: 'billboard',
        // Bare hands: a fuller cloud, the fist is a much smaller target than a blade.
        w: lerp(m.size, Math.random()) * (armed ? 1 : 1.35),
        life: lerp(m.life, Math.random()),
        color: m.color,
        intensity: m.intensity * (0.75 + 0.25 * Math.min(1, busy)),
        roll,
        rollEnd: roll + (m.spin ?? 0),
        grow: m.grow ?? 1,
        vx: Math.cos(dir) * drift,
        vy: lerp(m.rise, Math.random()),
        vz: Math.sin(dir) * drift,
        gravity: m.gravity ?? 0,
        fadeIn: m.fadeIn ?? 0,
      });
    }
    // Skip what a long pause (hidden tab) left owing.
    if (this.time > h.due + 1) h.due = this.time;
  }

  /** Arc hugging the weapon between two points of the hand → tip span. */
  private bladeArc(
    hand: TransformNode,
    tip: TransformNode,
    life: number,
    busy: number,
    s: ThunderStyle,
  ): void {
    const base = hand.getAbsolutePosition();
    const end = tip.getAbsolutePosition();
    end.subtractToRef(base, axis);
    const length = axis.length();
    axis.normalize();
    const leap = Math.random() < s.leap * Math.min(1.5, busy);
    if (leap) {
      // Off the tip into the air, a little longer.
      a.copyFrom(end);
      randomSide(axis, side);
      b.copyFrom(end)
        .addInPlace(axis.scale(length * (0.12 + Math.random() * 0.2)))
        .addInPlace(side.scaleInPlace(0.08 + Math.random() * 0.1));
    } else {
      const span = lerp(s.span, Math.random()) * Math.min(1.4, 0.8 + 0.3 * busy);
      const t0 = 0.12 + Math.random() * Math.max(0, 0.88 - span);
      a.copyFrom(base).addInPlace(axis.scale(length * t0));
      b.copyFrom(base).addInPlace(axis.scale(length * Math.min(1, t0 + span)));
      randomSide(axis, side);
      a.addInPlace(side.scale(lerp(s.offset, Math.random())));
      randomSide(axis, side);
      b.addInPlace(side.scale(lerp(s.offset, Math.random())));
    }
    this.bolts.bolt({
      from: a,
      to: b,
      color: s.color,
      width: 0.06 + Math.random() * 0.04,
      jitter: Vector3.Distance(a, b) * 0.22,
      life,
      branches: busy > 1.2 && Math.random() < 0.3 ? 1 : 0,
      // More arcs at high settings, not brighter ones (overlaps burn out to white).
      intensity: 0.7 + 0.2 * Math.min(1, busy),
    });
  }

  /** Bare hands: a short arc around the fist. */
  private fistArc(hand: TransformNode, life: number, busy: number): void {
    const c = hand.getAbsolutePosition();
    randomUnit(a).scaleInPlace(FIST_RADIUS).addInPlace(c);
    randomUnit(b).scaleInPlace(FIST_RADIUS).addInPlace(c);
    this.bolts.bolt({
      from: a,
      to: b,
      color: THUNDER.color,
      width: 0.05,
      jitter: 0.06,
      life,
      // More arcs at high settings, not brighter ones (overlaps burn out to white).
      intensity: 0.7 + 0.2 * Math.min(1, busy),
    });
  }
}

/** Which aura an element expression wears (Mộc's Lôi expression → thunder). */
function auraKind(
  element: Element | null | undefined,
  expression: string | undefined,
): AuraKind | null {
  if (expression === 'thunder' || expression === 'ice') return expression;
  return element ?? null;
}

function pick(motes: Mote[]): Mote {
  let r = Math.random() * motes.reduce((sum, m) => sum + m.weight, 0);
  for (const m of motes) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return motes[motes.length - 1] as Mote;
}

function lerp([lo, hi]: [number, number], t: number): number {
  return lo + (hi - lo) * t;
}

function worldDistance(p: TransformNode, q: TransformNode): number {
  return Vector3.Distance(p.getAbsolutePosition(), q.getAbsolutePosition());
}

/** Unit vector perpendicular to `dir`, in a random direction. */
function randomSide(dir: Vector3, out: Vector3): Vector3 {
  randomUnit(out);
  out.subtractInPlace(dir.scale(Vector3.Dot(out, dir)));
  if (out.lengthSquared() < 1e-6) out.set(dir.y, -dir.x, 0);
  return out.normalize();
}

function randomUnit(out: Vector3): Vector3 {
  const u = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return out.set(r * Math.cos(t), u, r * Math.sin(t));
}
