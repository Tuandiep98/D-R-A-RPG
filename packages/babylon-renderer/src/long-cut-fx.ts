import type { Element } from '@rpg/game-protocol';
import { Color3, Vector3 } from './babylon';
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
import type { GroundDecals } from './ground-decals';
import type { LightningBatch } from './lightning';
import type { Feedback } from './thunder-fx';

/**
 * Tử Điện Trảm (`vfx: long_cut`): one huge vertical cut. A tall crescent
 * flashes down in front of the caster, then the cut races along the host's
 * line (event `line`), tearing the ground open behind it — a glowing rift,
 * a dark split, the ngũ hành rising out of it — and bursts at the far end.
 */

const SPEED = 20;
const WHITE = Color3.White();

interface Wave {
  from: Vector3;
  dir: Vector3;
  length: number;
  at: number;
  kind: FxKind;
  k: number;
  busy: number;
  nextMote: number;
  scarFrom: number;
  yaw: number;
}

export class LongCutFx {
  private readonly waves: Wave[] = [];

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

  /** Wind-up: the blade gathers light. */
  cast(
    caster: EntityView,
    element: Element | null | undefined,
    expression: string | undefined,
    seconds: number,
  ): void {
    const tone = ELEMENT_TONES[fxKind(element, expression, this.level())];
    this.fx.chargeGlow(
      caster.anchor('weapon_tip') ?? caster.anchor('hand_r'),
      tone.color,
      Math.max(0.15, seconds),
    );
    this.fx.chargeGlow(caster.anchor('hand_r'), WHITE, Math.max(0.15, seconds));
  }

  impact(
    line: {
      origin: { x: number; z: number };
      destination: { x: number; z: number };
      radius: number;
    },
    element: Element | null | undefined,
    expression: string | undefined,
  ): Feedback {
    const level = this.level();
    const kind = fxKind(element, expression, level);
    const tone = ELEMENT_TONES[kind];
    const k = elementStrength(tone, level);
    const dx = line.destination.x - line.origin.x;
    const dz = line.destination.z - line.origin.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.2) return { shake: 0, kick: 0, seconds: 0 };
    const dir = new Vector3(dx / length, 0, dz / length);
    const yaw = Math.atan2(dx, dz);
    const o = line.origin;
    // The downward cut in front of the caster: a tall crescent sweeping down
    // (camera-facing, so it reads from any angle), white core inside.
    for (const [c, w, h, intensity] of [
      [tone.color, 2.6, 4.6, 1.5],
      [WHITE, 1.6, 3.6, 1.3],
    ] as const)
      this.fx.sprite({
        sprite: 'arc',
        x: o.x + dir.x * 1.2,
        y: 1.9,
        z: o.z + dir.z * 1.2,
        mode: 'billboard',
        roll: 0.5,
        rollEnd: -0.35,
        w,
        h,
        grow: 1.15,
        life: 0.24,
        color: c,
        intensity,
      });
    // The cut racing out along the line: a tall crescent of light riding it.
    const life = length / SPEED;
    for (const [c, w, h, intensity] of [
      [tone.color, 2, 3.6, 1.4],
      [WHITE, 1.1, 2.8, 1.2],
    ] as const)
      this.fx.sprite({
        sprite: 'arc',
        x: o.x + dir.x * 1.2,
        y: 1.4,
        z: o.z + dir.z * 1.2,
        mode: 'billboard',
        roll: -0.15,
        rollEnd: 0.15,
        w,
        h,
        life: life + 0.04,
        color: c,
        intensity,
        vx: dir.x * SPEED,
        vz: dir.z * SPEED,
      });
    if (!this.low)
      this.fx.sprite({
        sprite: 'streak',
        x: o.x + dir.x * 0.4,
        y: 1.1,
        z: o.z + dir.z * 0.4,
        mode: 'upright',
        yaw,
        w: 2.4,
        h: 1.6,
        life: life + 0.04,
        color: tone.color,
        intensity: 1.2,
        vx: dir.x * SPEED,
        vz: dir.z * SPEED,
      });
    this.waves.push({
      from: new Vector3(o.x, 0, o.z),
      dir,
      length,
      at: 0,
      kind,
      k,
      busy: elementBusy(level, this.fx.quality),
      nextMote: 0.5,
      scarFrom: 0,
      yaw,
    });
    // The split the cut leaves: dark along its whole length, laid as it passes.
    this.fx.sprite({
      sprite: 'star',
      x: o.x + dir.x,
      y: 0.6,
      z: o.z + dir.z,
      mode: 'billboard',
      w: 1.6,
      grow: 1.8,
      life: 0.18,
      color: WHITE,
      intensity: 1.4,
    });
    return { shake: 0.26, kick: 0.8, seconds: 0.35 };
  }

  update(dt: number): void {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i] as Wave;
      const prev = w.at;
      w.at = Math.min(w.length, w.at + SPEED * dt);
      this.shed(w, prev);
      if (w.at >= w.length) {
        this.finish(w);
        this.waves.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.waves.length = 0;
  }

  private shed(w: Wave, prev: number): void {
    const color = ELEMENT_TONES[w.kind].color;
    if (w.kind === 'thunder' && w.at > prev) {
      this.bolts.bolt({
        from: w.from.add(w.dir.scale(prev)).addInPlace(new Vector3(0, 0.4, 0)),
        to: w.from.add(w.dir.scale(w.at)).addInPlace(new Vector3(0, 0.15, 0)),
        color,
        width: 0.14,
        jitter: 0.3,
        life: 0.22,
        intensity: w.k,
      });
    }
    const step = this.low ? 1 : 0.45 / Math.max(0.4, w.busy);
    for (; w.nextMote <= w.at; w.nextMote += step) {
      const q = w.from.add(w.dir.scale(w.nextMote));
      // Debris and light thrown up on both sides of the rift.
      this.fx.sparks(q.x, 0.15, q.z, color, this.low ? 2 : 4, 3, {
        spread: Math.PI / 2,
        gravity: 10,
      });
      if (w.kind !== 'none') this.element.mote(w.kind, q.x, 0.25 + Math.random() * 0.6, q.z, w.k);
    }
    const seg = this.low ? 1.6 : 0.8;
    if (w.at - w.scarFrom >= seg || w.at >= w.length) this.scar(w, w.at);
  }

  private scar(w: Wave, to: number): void {
    if (to <= w.scarFrom) return;
    const a = w.from.add(w.dir.scale(w.scarFrom));
    const b = w.from.add(w.dir.scale(to));
    this.element.scar(w.kind, a.x, a.z, b.x, b.z, w.k * 1.2);
    // The rift itself: a hot seam of light, segments overlapping into one line.
    this.fx.sprite({
      sprite: 'trace',
      x: (a.x + b.x) / 2,
      y: 0.06,
      z: (a.z + b.z) / 2,
      mode: 'flat',
      yaw: w.yaw,
      w: 1.8,
      h: (to - w.scarFrom) * 1.8,
      life: 1.6,
      color: Color3.Lerp(ELEMENT_TONES[w.kind].color, WHITE, 0.3),
      intensity: 1.5 * w.k,
    });
    // The ground split open: a long dark gash.
    const len = to - w.scarFrom;
    this.decals.add((a.x + b.x) / 2, (a.z + b.z) / 2, 1, {
      h: len * 1.25,
      yaw: w.yaw,
      life: 5,
      darkness: 0.8,
    });
    w.scarFrom = to;
  }

  private finish(w: Wave): void {
    const end = w.from.add(w.dir.scale(w.length));
    const color = ELEMENT_TONES[w.kind].color;
    this.fx.sprite({
      sprite: 'shock',
      x: end.x,
      y: 0.08,
      z: end.z,
      mode: 'flat',
      w: 0.6,
      grow: 3.6,
      life: 0.35,
      color,
      intensity: 1.2,
    });
    this.fx.sprite({
      sprite: 'slash',
      x: end.x,
      y: 1,
      z: end.z,
      mode: 'upright',
      yaw: w.yaw,
      roll: Math.PI / 2,
      w: 2.4,
      h: 2,
      grow: 1.4,
      life: 0.2,
      color,
      intensity: 1.2,
    });
    this.element.burst(w.kind, end.x, end.z, 1, w.k);
  }
}
