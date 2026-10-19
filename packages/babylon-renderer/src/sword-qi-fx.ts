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
import type { LightningBatch } from './lightning';
import { BladeBatch } from './sword-blade';
import type { Feedback } from './thunder-fx';

/**
 * Lôi Kiếm Xuyên Tâm (`vfx: sword_qi`): one flat blade of sword qi flies the
 * whole projectile path (event origin → destination at the host's speed),
 * passing through every body it pierces, with afterimages behind it. The ngũ
 * hành layer sheds motes along the line and leaves a scar on the ground
 * (ElementBurst). Hits only flash where the host says the projectile struck;
 * the flight ends when the host's pierce count is spent or a wall stops it.
 */

const MAX_FLIGHTS = 8;
/** Afterimages per flight (High); Low draws the head only. */
const ECHOES = 3;
const HEIGHT = 0.9;
/** Seconds the blade takes to flare out once the flight ends. */
const FADE = 0.14;
/** Seconds the element keeps shedding along the line after the flight. */
const LINGER = 1;
/** Blade breadth multiplier: sword qi is a broad blade of light. */
const WIDTH = 2.4;
/** Sprite tags for the head glow (cut when the flight stops). */
let nextTag = 1 << 20;
const WHITE = Color3.White();

interface Flight {
  id: number | undefined;
  from: Vector3;
  dir: Vector3;
  length: number;
  speed: number;
  /** Distance travelled so far; when stopped, where it ended. */
  at: number;
  stopped: number | null;
  /** Seconds since it ended (fading). */
  fade: number;
  rot: Quaternion;
  kind: FxKind;
  intensity: number;
  scale: number;
  /** Distance of the next mote / scar segment. */
  nextMote: number;
  moteStep: number;
  scarFrom: number;
  /** Bodies left to pass through before it stops. */
  pierceLeft: number;
  /** Sprite tag of the head glow / wake. */
  tag: number;
  /** Line motes per second while lingering. */
  lingerRate: number;
  lingerDue: number;
}

const p = new Vector3();

export class SwordQiFx {
  private readonly flights: Flight[] = [];
  private readonly blades: BladeBatch;

  constructor(
    scene: Scene,
    private readonly fx: CombatFx,
    private readonly bolts: LightningBatch,
    private readonly element: ElementBurst,
    /** The "Hiệu ứng ngũ hành" setting (0..2). */
    private readonly level: () => number,
  ) {
    this.blades = new BladeBatch(scene, 'fx_sword_qi', MAX_FLIGHTS * (ECHOES + 1));
  }

  private get low(): boolean {
    return this.fx.quality === 'low';
  }

  /** Wind-up: qi gathering on the blade tip. */
  cast(
    caster: EntityView,
    element: Element | null | undefined,
    expression: string | undefined,
    seconds: number,
  ): void {
    const tone = ELEMENT_TONES[fxKind(element, expression, this.level())];
    const tip = caster.anchor('weapon_tip') ?? caster.anchor('hand_r');
    this.fx.chargeGlow(tip, tone.color, Math.max(0.15, seconds));
    if (tip && !this.low)
      this.fx.sprite({
        sprite: 'star',
        x: 0,
        y: 0,
        z: 0,
        mode: 'billboard',
        follow: tip,
        w: 0.5,
        grow: 1.6,
        roll: 0,
        rollEnd: 2,
        life: Math.max(0.15, seconds) + 0.1,
        color: Color3.Lerp(tone.color, WHITE, 0.4),
        intensity: 1.2,
        fadeIn: 0.6,
      });
  }

  /** SKILL_PROJECTILE: the qi leaves the caster toward `destination` (end of range). */
  launch(
    id: number | undefined,
    origin: { x: number; z: number },
    destination: { x: number; z: number },
    speed: number,
    pierce: number,
    element: Element | null | undefined,
    expression: string | undefined,
  ): Feedback {
    const level = this.level();
    const kind = fxKind(element, expression, level);
    const tone = ELEMENT_TONES[kind];
    const dx = destination.x - origin.x;
    const dz = destination.z - origin.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.1) return { shake: 0, kick: 0, seconds: 0 };
    if (this.flights.length >= MAX_FLIGHTS) this.flights.shift();
    const yaw = Math.atan2(dx, dz);
    const busy = elementBusy(level, this.fx.quality) * tone.density;
    // Blade lying flat, tip forward: +Y (towards the hilt) turned to point back.
    const rot = Quaternion.RotationYawPitchRoll(yaw, -Math.PI / 2, 0);
    this.flights.push({
      id,
      from: new Vector3(origin.x, HEIGHT, origin.z),
      dir: new Vector3(dx / length, 0, dz / length),
      length,
      speed,
      at: 0,
      stopped: null,
      fade: 0,
      rot,
      kind,
      intensity: elementStrength(tone, level),
      scale: 1.7 * tone.scale,
      nextMote: 0.4,
      moteStep: Math.max(0.25, 0.45 / Math.max(0.2, busy)),
      scarFrom: 0,
      pierceLeft: pierce,
      tag: nextTag++,
      lingerRate: kind === 'none' ? 0 : 30 * busy,
      lingerDue: 0,
    });
    const life = length / speed;
    const vx = (dx / length) * speed;
    const vz = (dz / length) * speed;
    const tag = nextTag - 1;
    // Head glow and a wake of light lying along the line, riding with the blade.
    this.fx.sprite({
      sprite: 'glow',
      x: origin.x + (dx / length) * 0.6,
      y: HEIGHT,
      z: origin.z + (dz / length) * 0.6,
      mode: 'billboard',
      w: 1.2 * tone.scale,
      life,
      color: tone.color,
      intensity: 0.9 * tone.intensity,
      vx,
      vz,
      tag,
    });
    if (!this.low)
      this.fx.sprite({
        sprite: 'trace',
        x: origin.x - (dx / length) * 0.6,
        y: HEIGHT - 0.05,
        z: origin.z - (dz / length) * 0.6,
        mode: 'flat',
        yaw,
        w: 0.8 * tone.scale,
        h: 2.6,
        life,
        color: tone.color,
        intensity: 0.9 * tone.intensity,
        vx,
        vz,
        tag,
      });
    // Release flash in front of the caster.
    const fx0 = origin.x + (dx / length) * 0.7;
    const fz0 = origin.z + (dz / length) * 0.7;
    this.fx.sprite({
      sprite: 'shock',
      x: fx0,
      y: HEIGHT,
      z: fz0,
      mode: 'upright',
      yaw: yaw + Math.PI / 2,
      w: 0.5,
      grow: 2.6,
      life: 0.22,
      color: tone.color,
      intensity: 1.1,
    });
    return { shake: 0.03, kick: 0.2, seconds: 0.1 };
  }

  /**
   * SKILL_IMPACT of a sword_qi projectile: a body pierced (`body`) or a wall
   * (stops the flight there).
   */
  impact(
    id: number | undefined,
    point: { x: number; z: number },
    body: boolean,
    target: EntityView | undefined,
  ): Feedback {
    const f = this.flights.find((x) => x.id === id && x.stopped === null);
    const kind = f?.kind ?? 'none';
    const k = f?.intensity ?? 1;
    const color = ELEMENT_TONES[kind].color;
    const y = target ? target.height * 0.55 : HEIGHT;
    const yaw = f ? Math.atan2(f.dir.x, f.dir.z) : 0;
    // The cut through the body: a bright crescent across the flight line.
    for (const [c, w] of [
      [color, 1.6],
      [WHITE, 1.1],
    ] as const)
      this.fx.sprite({
        sprite: 'arc',
        x: point.x,
        y,
        z: point.z,
        mode: 'upright',
        yaw: yaw + Math.PI / 2,
        roll: 0.6,
        rollEnd: -0.3,
        w,
        h: w * 1.3,
        grow: 1.2,
        life: 0.2,
        color: c,
        intensity: 1.3 * k,
      });
    this.fx.sprite({
      sprite: 'star',
      x: point.x,
      y,
      z: point.z,
      mode: 'billboard',
      w: 0.9,
      grow: 1.8,
      life: 0.16,
      color: Color3.Lerp(color, WHITE, 0.5),
      intensity: 1.3 * k,
    });
    this.element.burst(kind, point.x, point.z, 0.75, k);
    target?.freeze(0.06);
    if (f) {
      const along = (point.x - f.from.x) * f.dir.x + (point.z - f.from.z) * f.dir.z;
      if (!body || f.pierceLeft <= 0) this.stop(f, Math.max(0, along));
      else f.pierceLeft--;
    }
    return { shake: body ? 0.06 : 0.03, kick: 0.15, seconds: 0.12 };
  }

  update(dt: number): void {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i] as Flight;
      if (f.stopped !== null) {
        f.fade += dt;
        this.linger(f, dt);
        if (f.fade >= FADE + LINGER) this.flights.splice(i, 1);
        continue;
      }
      const prev = f.at;
      f.at = Math.min(f.length, f.at + f.speed * dt);
      this.shed(f, prev);
      if (f.at >= f.length) this.stop(f, f.length);
    }
    this.blades.begin();
    for (const f of this.flights) {
      if (f.stopped !== null && f.fade >= FADE) continue;
      const color = ELEMENT_TONES[f.kind].color;
      const head = f.stopped ?? f.at;
      const alpha = f.stopped !== null ? 1.6 * (1 - f.fade / FADE) : 1;
      // The blade is centred on the head: tip ahead, hilt behind.
      const echoes = this.low ? 0 : ECHOES;
      for (let e = 0; e <= echoes; e++) {
        const back = e * 0.55 * f.scale;
        if (back > head) break;
        const d = head + 0.65 * f.scale - back;
        p.copyFrom(f.from).addInPlace(f.dir.scale(d));
        const k = alpha * f.intensity * (e === 0 ? 1 : 0.45 / e);
        this.blades.add(p, f.rot, f.scale * (1 - e * 0.1), color, k, WIDTH);
      }
    }
    this.blades.end();
  }

  dispose(): void {
    this.flights.length = 0;
    this.blades.dispose();
  }

  private stop(f: Flight, at: number): void {
    if (f.stopped !== null) return;
    f.stopped = Math.min(f.length, at);
    f.fade = 0;
    this.fx.cut(f.tag, 0.08);
    if (f.stopped > f.scarFrom) this.scar(f, f.stopped);
  }

  /** Element motes, lightning and ground scar along the stretch just flown. */
  private shed(f: Flight, prev: number): void {
    if (f.kind === 'thunder' && f.at - prev > 0) {
      const a = f.from.add(f.dir.scale(prev));
      const b = f.from.add(f.dir.scale(f.at));
      this.bolts.bolt({
        from: a,
        to: b,
        color: ELEMENT_TONES.thunder.color,
        width: 0.12,
        jitter: 0.18,
        life: 0.18,
        intensity: f.intensity,
      });
    }
    // A light streak riding the blade (Medium/High).
    if (!this.low && Math.floor(prev / 1.2) !== Math.floor(f.at / 1.2)) {
      const mid = f.from.add(f.dir.scale(Math.max(0, f.at - 0.6)));
      this.fx.sprite({
        sprite: 'streak',
        x: mid.x,
        y: HEIGHT,
        z: mid.z,
        mode: 'upright',
        yaw: Math.atan2(f.dir.x, f.dir.z),
        w: 1.6,
        h: 0.5,
        life: 0.22,
        color: ELEMENT_TONES[f.kind].color,
        intensity: 0.9 * f.intensity,
      });
    }
    if (f.kind !== 'none') {
      const step = this.low ? f.moteStep * 2 : f.moteStep;
      for (; f.nextMote <= f.at; f.nextMote += step) {
        const q = f.from.add(f.dir.scale(f.nextMote));
        this.element.mote(f.kind, q.x, q.y + (Math.random() - 0.5) * 0.3, q.z, f.intensity);
      }
    }
    // Short overlapping segments read as one band (Low: half as many sprites).
    if (f.at - f.scarFrom >= (this.low ? 1.4 : 0.7)) this.scar(f, f.at);
  }

  /** After the flight: the element keeps rising off the line it cut, thinning out. */
  private linger(f: Flight, dt: number): void {
    if (f.lingerRate <= 0 || f.stopped === null || f.stopped < 0.5) return;
    const left = 1 - f.fade / (FADE + LINGER);
    f.lingerDue -= dt * f.lingerRate * left;
    for (let n = 0; n < 3 && f.lingerDue <= 0; n++) {
      f.lingerDue += 1;
      const q = f.from.add(f.dir.scale(Math.random() * f.stopped));
      this.element.mote(f.kind, q.x, 0.3 + Math.random() * 0.5, q.z, f.intensity * left);
    }
    if (f.lingerDue < 0) f.lingerDue = 0;
  }

  private scar(f: Flight, to: number): void {
    const a = f.from.add(f.dir.scale(f.scarFrom));
    const b = f.from.add(f.dir.scale(to));
    this.element.scar(f.kind, a.x, a.z, b.x, b.z, f.intensity);
    f.scarFrom = to;
  }
}
