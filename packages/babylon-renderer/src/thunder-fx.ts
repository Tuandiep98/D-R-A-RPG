import { Color3, Vector3 } from './babylon';
import type { CombatFx } from './combat-fx';
import type { EntityView } from './entity-view';
import type { LightningBatch } from './lightning';

/**
 * Lôi Kiếm Tu skill presentation: one look per `vfx` id (game-data/skills),
 * built from procedural bolts plus Kenney sprites. Purely cosmetic — the host
 * already decided hits and damage; this only reads event points/targets.
 *
 * Low preset: fewer bolts and sparks, no body crackle (CLAUDE.md rule 15).
 */

export type ThunderStyle =
  | 'thunder_dash'
  | 'thunder_leap'
  | 'thunder_arc'
  | 'thunder_field'
  | 'thunder_projectile'
  | 'thunder_strike'
  | 'thunder_ultimate';

const STYLES = new Set<string>([
  'thunder_dash',
  'thunder_leap',
  'thunder_arc',
  'thunder_field',
  'thunder_projectile',
  'thunder_strike',
  'thunder_ultimate',
]);

export const isThunderStyle = (vfx: string | undefined): vfx is ThunderStyle =>
  !!vfx && STYLES.has(vfx);

const BLUE = Color3.FromHexString('#4fc8ff');
const PALE = Color3.FromHexString('#b8ecff');
const VIOLET = Color3.FromHexString('#9a6bff');
const WHITE = Color3.White();
const SKY = 8;

/** Camera feedback a moment asks for (applied by GameView, only near the player). */
export interface Feedback {
  shake: number;
  kick: number;
  seconds: number;
}

const NONE: Feedback = { shake: 0, kick: 0, seconds: 0 };

interface Crackle {
  view: EntityView;
  id: number;
  left: number;
  next: number;
  color: Color3;
}

interface Flight {
  from: Vector3;
  to: Vector3;
  age: number;
  duration: number;
  last: Vector3;
  color: Color3;
  onArrive: () => void;
}

export class ThunderFx {
  private readonly crackles: Crackle[] = [];
  private readonly flights: Flight[] = [];
  /** Work started on the effect clock (sparks of delayed strikes). */
  private readonly pending: { at: number; run: () => void }[] = [];

  constructor(
    private readonly fx: CombatFx,
    private readonly bolts: LightningBatch,
  ) {}

  private get low(): boolean {
    return this.fx.quality === 'low';
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.fx.density));
  }

  // ---- Cast start -----------------------------------------------------

  /** Wind-up: charge in the hands, crackle on the body, rune on the target ground. */
  cast(
    style: ThunderStyle,
    caster: EntityView,
    point: { x: number; z: number } | null,
    radius: number,
    seconds: number,
  ): Feedback {
    const hold = Math.max(0.15, seconds);
    switch (style) {
      case 'thunder_dash':
      case 'thunder_leap':
        this.crackle(caster, 0.45, BLUE);
        return NONE;
      case 'thunder_arc':
        this.crackle(caster, hold + 0.4, BLUE);
        this.fx.chargeGlow(caster.anchor('hand_r'), BLUE, hold);
        return NONE;
      case 'thunder_projectile':
        this.fx.chargeGlow(caster.anchor('weapon_tip'), BLUE, hold);
        this.crackle(caster, hold + 0.1, BLUE);
        return NONE;
      case 'thunder_strike':
        this.fx.chargeGlow(caster.anchor('weapon_tip'), PALE, hold);
        this.fx.chargeGlow(caster.anchor('hand_r'), BLUE, hold);
        this.crackle(caster, hold + 0.3, BLUE);
        return { shake: 0, kick: 0.25, seconds: 0 };
      case 'thunder_field':
        this.crackle(caster, hold + 0.2, BLUE);
        this.fx.chargeGlow(caster.anchor('hand_r'), BLUE, hold);
        this.fx.chargeGlow(caster.anchor('hand_l'), BLUE, hold);
        if (point) this.rune(point.x, point.z, radius, hold, BLUE, false);
        return NONE;
      case 'thunder_ultimate': {
        this.crackle(caster, hold + 0.5, VIOLET);
        this.fx.chargeGlow(caster.anchor('hand_r'), VIOLET, hold);
        this.fx.chargeGlow(caster.anchor('hand_l'), VIOLET, hold);
        if (point) {
          this.rune(point.x, point.z, radius, hold, VIOLET, true);
          // Thin warning bolts licking the rune during the last half of the cast.
          const pre = this.low ? 1 : 3;
          for (let i = 0; i < pre; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = radius * (0.3 + Math.random() * 0.6);
            const x = point.x + Math.sin(a) * r;
            const z = point.z + Math.cos(a) * r;
            this.bolts.bolt({
              from: new Vector3(x + rand(1.5), SKY, z + rand(1.5)),
              to: new Vector3(x, 0.05, z),
              color: VIOLET,
              width: 0.12,
              jitter: 0.9,
              life: 0.16,
              delay: hold * (0.45 + (i / pre) * 0.45),
              intensity: 0.7,
            });
          }
        }
        return { shake: 0.03, kick: 0.3, seconds: hold };
      }
    }
  }

  // ---- Impact ---------------------------------------------------------

  /**
   * The skill landing. `from` is where the caster stood when the cast began
   * (dashes travel from there to `point`).
   */
  impact(
    style: ThunderStyle,
    caster: EntityView | undefined,
    target: EntityView | undefined,
    from: { x: number; z: number } | null,
    point: { x: number; z: number },
    radius: number,
  ): Feedback {
    switch (style) {
      case 'thunder_dash':
        this.dashPath(from ?? point, point);
        if (caster) this.crackle(caster, 0.35, BLUE);
        return { shake: 0.04, kick: 0, seconds: 0.15 };
      case 'thunder_leap': {
        const yaw = this.dashPath(from ?? point, point);
        this.arcBurst(point.x, point.z, Math.max(1.4, radius), yaw, 6, 0.08);
        this.skyStrike(point.x, point.z, 0.65, BLUE, 0.04);
        if (caster) this.crackle(caster, 0.4, BLUE);
        return { shake: 0.12, kick: 0.35, seconds: 0.3 };
      }
      case 'thunder_arc': {
        const yaw = caster ? caster.root.rotation.y : 0;
        this.arcBurst(point.x, point.z, radius, yaw, 9, 0);
        return { shake: 0.14, kick: 0.4, seconds: 0.35 };
      }
      case 'thunder_field': {
        const strikes = this.low ? 3 : 5;
        for (let i = 0; i < strikes; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = i === 0 ? 0 : radius * (0.35 + Math.random() * 0.5);
          this.skyStrike(
            point.x + Math.sin(a) * r,
            point.z + Math.cos(a) * r,
            i === 0 ? 1 : 0.75,
            BLUE,
            i === 0 ? 0 : 0.06 + i * 0.07,
          );
        }
        this.ground(point.x, point.z, radius, BLUE, 0);
        return { shake: 0.2, kick: 0.5, seconds: 0.55 };
      }
      case 'thunder_projectile': {
        if (!caster || !target) return NONE;
        // Launched from in front of the chest toward the target: the blade tip
        // swings around during the stab clip and would make the start jump.
        const c = caster.root.position;
        const t = target.root.position;
        const d = Math.max(1e-3, Math.hypot(t.x - c.x, t.z - c.z));
        const start = new Vector3(
          c.x + ((t.x - c.x) / d) * 0.7,
          caster.height * 0.6,
          c.z + ((t.z - c.z) / d) * 0.7,
        );
        const end = target.root.position.add(new Vector3(0, target.height * 0.55, 0));
        const casterId = caster.entityId;
        this.fly(start, end, BLUE, () => {
          this.zapAt(end, 1, BLUE);
          // A last lash from the caster (where it stands now — it may have stepped
          // in to keep fighting) to the target as the sword qi lands.
          if (caster.entityId === casterId) {
            const now = caster.root.position;
            this.bolts.bolt({
              from: new Vector3(now.x, caster.height * 0.6, now.z),
              to: end,
              color: BLUE,
              width: 0.14,
              jitter: 0.35,
              life: 0.16,
            });
          }
          this.bolts.bolt({
            from: end.add(new Vector3(rand(0.4), 1.6, rand(0.4))),
            to: new Vector3(end.x, 0.05, end.z),
            color: PALE,
            width: 0.16,
            jitter: 0.3,
            life: 0.18,
          });
          this.crackle(target, 0.4, BLUE);
        });
        return { shake: 0.05, kick: 0, seconds: 0.15 };
      }
      case 'thunder_strike': {
        const at = target ? target.root.position : new Vector3(point.x, 0, point.z);
        this.skyStrike(at.x, at.z, 1.25, PALE, 0);
        const yaw = caster ? caster.root.rotation.y : 0;
        // Falling crescent: the blade's downward cut, facing the camera.
        for (const [c, k] of [
          [BLUE, 1],
          [WHITE, 0.8],
        ] as const)
          this.fx.sprite({
            sprite: 'arc',
            x: at.x - Math.sin(yaw) * 0.3,
            y: 1.1,
            z: at.z - Math.cos(yaw) * 0.3,
            mode: 'billboard',
            roll: 0.5,
            rollEnd: -0.4,
            w: 1.5 * k,
            h: 2.4 * k,
            grow: 1.15,
            life: 0.26,
            color: c,
            intensity: 1.4,
          });
        if (target) {
          target.freeze(0.14);
          this.crackle(target, 0.6, BLUE);
        }
        caster?.freeze(0.1);
        return { shake: 0.24, kick: 0.6, seconds: 0.4 };
      }
      case 'thunder_ultimate':
        this.judgement(point.x, point.z, radius);
        return { shake: 0.4, kick: 1, seconds: 0.7 };
    }
  }

  /** A thunder skill's damage landing on a body: sparks and a short crackle. */
  hit(target: EntityView, style: ThunderStyle): void {
    const color = style === 'thunder_ultimate' ? VIOLET : BLUE;
    const p = target.root.position;
    this.fx.hit(p.x, target.height * 0.55, p.z, Math.random() * Math.PI * 2, color, 0.45);
    this.crackle(target, 0.3, color);
  }

  // ---- Building blocks --------------------------------------------------

  /** Lightning bolt from the sky onto the ground, with flash, ring, scorch and sparks. */
  private skyStrike(x: number, z: number, scale: number, color: Color3, delay: number): void {
    const top = new Vector3(
      x + rand(1.2 * scale),
      SKY * Math.min(1.2, 0.7 + scale * 0.3),
      z + rand(1.2 * scale),
    );
    const ground = new Vector3(x, 0.05, z);
    this.bolts.bolt({
      from: top,
      to: ground,
      color,
      width: 0.36 * scale,
      jitter: 1.1 * scale,
      life: 0.3,
      delay,
      branches: this.low ? 0 : 2,
      intensity: 1.2,
    });
    if (!this.low)
      this.bolts.bolt({
        from: top.add(new Vector3(rand(0.6), 0, rand(0.6))),
        to: ground,
        color,
        width: 0.18 * scale,
        jitter: 0.8 * scale,
        life: 0.22,
        delay: delay + 0.06,
      });
    this.fx.sprite({
      sprite: 'bolt',
      x,
      y: 1.3 * scale,
      z,
      mode: 'billboard',
      w: 1 * scale,
      h: 2.8 * scale,
      life: 0.18,
      color: WHITE,
      intensity: 1.1,
      delay,
    });
    this.ground(x, z, 0.9 * scale, color, delay);
    this.fx.sprite({
      sprite: 'star',
      x,
      y: 0.35,
      z,
      mode: 'billboard',
      w: 1.4 * scale,
      grow: 2.2,
      life: 0.18,
      color: WHITE,
      intensity: 1.4,
      delay,
    });
    this.fx.sprite({
      sprite: 'zap',
      x,
      y: 0.5 * scale,
      z,
      mode: 'billboard',
      roll: Math.random() * 6,
      w: 1.6 * scale,
      grow: 1.4,
      life: 0.3,
      color,
      intensity: 1.4,
      delay,
    });
    this.sparksLater(x, 0.15, z, color, 12 * scale, 5 * scale, delay);
  }

  /** Ground marks of a lightning hit: glow, shock ring, scorch. */
  private ground(x: number, z: number, radius: number, color: Color3, delay: number): void {
    this.fx.sprite({
      sprite: 'glow',
      x,
      y: 0.08,
      z,
      mode: 'flat',
      w: radius * 2.2,
      grow: 1.3,
      life: 0.35,
      color,
      intensity: 1.1,
      delay,
    });
    this.fx.sprite({
      sprite: 'shock',
      x,
      y: 0.07,
      z,
      mode: 'flat',
      w: radius * 0.6,
      grow: 3.6,
      life: 0.4,
      color,
      intensity: 1.3,
      delay,
    });
    this.fx.sprite({
      sprite: 'scorch',
      x,
      y: 0.04,
      z,
      mode: 'flat',
      yaw: Math.random() * Math.PI * 2,
      w: radius * 1.6,
      grow: 1.1,
      life: 1.1,
      color: Color3.Lerp(color, WHITE, 0.2),
      intensity: 0.7,
      delay,
    });
  }

  /** The blink: a bolt and streak along the path, flashes at both ends. Returns its heading. */
  private dashPath(a: { x: number; z: number }, b: { x: number; z: number }): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const yaw = len > 1e-3 ? Math.atan2(dx, dz) : 0;
    if (len > 0.3) {
      const from = new Vector3(a.x, 0.9, a.z);
      const to = new Vector3(b.x, 0.9, b.z);
      this.bolts.bolt({
        from,
        to,
        color: BLUE,
        width: 0.26,
        jitter: 0.4,
        life: 0.3,
        branches: this.low ? 0 : 1,
      });
      if (!this.low)
        this.bolts.bolt({
          from: new Vector3(a.x, 0.45, a.z),
          to: new Vector3(b.x, 0.6, b.z),
          color: PALE,
          width: 0.14,
          jitter: 0.3,
          life: 0.24,
          delay: 0.03,
        });
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      this.fx.sprite({
        sprite: 'streak',
        x: mx,
        y: 0.85,
        z: mz,
        mode: 'upright',
        yaw,
        w: len * 1.15,
        h: 1.1,
        life: 0.3,
        color: BLUE,
        intensity: 1.3,
      });
      this.fx.sprite({
        sprite: 'trace',
        x: mx,
        y: 0.05,
        z: mz,
        mode: 'flat',
        yaw,
        w: 0.9,
        h: len * 1.2,
        life: 0.45,
        color: BLUE,
        intensity: 0.9,
      });
    }
    for (const [p, k] of [
      [a, 0.7],
      [b, 1],
    ] as const) {
      this.zapAt(new Vector3(p.x, 0.8, p.z), k, BLUE);
      this.fx.sprite({
        sprite: 'shock',
        x: p.x,
        y: 0.06,
        z: p.z,
        mode: 'flat',
        w: 0.5,
        grow: 3,
        life: 0.3,
        color: BLUE,
        intensity: 1,
      });
    }
    return yaw;
  }

  /** Spinning ring of lightning around a point (Lôi Hoàn Kiếm, Lôi Ảnh Trảm landing). */
  private arcBurst(
    x: number,
    z: number,
    radius: number,
    yaw: number,
    rays: number,
    delay: number,
  ): void {
    for (const [c, k, life] of [
      [BLUE, 1, 0.5],
      [WHITE, 0.7, 0.35],
    ] as const)
      this.fx.sprite({
        sprite: 'twirl',
        x,
        y: 0.7,
        z,
        mode: 'flat',
        yaw,
        roll: 0,
        rollEnd: -Math.PI * 2.2,
        w: radius * 2 * k,
        grow: 1.15,
        life,
        color: c,
        intensity: 1.2,
        delay,
      });
    this.fx.sprite({
      sprite: 'shock',
      x,
      y: 0.07,
      z,
      mode: 'flat',
      w: radius * 0.5,
      grow: 4,
      life: 0.45,
      color: BLUE,
      intensity: 1.2,
      delay,
    });
    this.fx.sprite({
      sprite: 'star',
      x,
      y: 0.9,
      z,
      mode: 'billboard',
      w: 1.3,
      grow: 2,
      life: 0.2,
      color: WHITE,
      intensity: 1.3,
      delay,
    });
    const n = this.n(rays);
    for (let i = 0; i < n; i++) {
      const a = yaw + (i / n) * Math.PI * 2 + rand(0.25);
      const end = new Vector3(
        x + Math.sin(a) * radius,
        0.25 + Math.random() * 0.5,
        z + Math.cos(a) * radius,
      );
      this.bolts.bolt({
        from: new Vector3(x + Math.sin(a) * 0.35, 0.85, z + Math.cos(a) * 0.35),
        to: end,
        color: BLUE,
        width: 0.16,
        jitter: radius * 0.18,
        life: 0.26,
        delay: delay + (i % 3) * 0.03,
      });
      this.fx.sprite({
        sprite: 'zap',
        x: end.x,
        y: end.y,
        z: end.z,
        mode: 'billboard',
        roll: Math.random() * 6,
        w: 0.8,
        grow: 1.3,
        life: 0.22,
        color: BLUE,
        intensity: 1.1,
        delay: delay + 0.04,
      });
    }
    this.sparksLater(x, 0.9, z, BLUE, 16, 6, delay);
  }

  /** Cửu Thiên Lôi Kiếm: a giant blade of light drops, then the sky splits over the rune. */
  private judgement(x: number, z: number, radius: number): void {
    // The falling sword: a long white-violet blade dropping out of the sky.
    for (const [c, w, intensity] of [
      [VIOLET, 1.6, 1.4],
      [WHITE, 0.6, 1.2],
    ] as const)
      this.fx.sprite({
        sprite: 'trace',
        x,
        y: 9,
        z,
        mode: 'billboard',
        w,
        h: 7,
        life: 0.16,
        color: c,
        intensity,
        vy: -50,
      });
    const land = 0.12;
    this.bolts.bolt({
      from: new Vector3(x, SKY * 1.3, z),
      to: new Vector3(x, 0.05, z),
      color: VIOLET,
      width: 0.85,
      jitter: 1.2,
      life: 0.45,
      delay: land,
      branches: this.low ? 1 : 4,
      intensity: 1.3,
    });
    const ring = this.low ? 3 : 6;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rand(0.3);
      const r = radius * (0.55 + Math.random() * 0.35);
      this.skyStrike(
        x + Math.sin(a) * r,
        z + Math.cos(a) * r,
        0.7,
        i % 2 ? BLUE : VIOLET,
        land + 0.08 + i * 0.06,
      );
    }
    this.ground(x, z, radius, VIOLET, land);
    this.fx.sprite({
      sprite: 'shock',
      x,
      y: 0.1,
      z,
      mode: 'flat',
      w: radius * 0.4,
      grow: 6,
      life: 0.6,
      color: WHITE,
      intensity: 1.1,
      delay: land + 0.05,
    });
    this.fx.sprite({
      sprite: 'glow',
      x,
      y: 1.4,
      z,
      mode: 'billboard',
      w: radius * 1.1,
      grow: 1.4,
      life: 0.4,
      color: VIOLET,
      intensity: 0.8,
      delay: land,
    });
    this.fx.sprite({
      sprite: 'star',
      x,
      y: 1,
      z,
      mode: 'billboard',
      w: 1.8,
      grow: 2.2,
      life: 0.2,
      color: WHITE,
      intensity: 1.2,
      delay: land,
    });
    const puffs = this.low ? 4 : 10;
    for (let i = 0; i < puffs; i++) {
      const a = (i / puffs) * Math.PI * 2;
      this.fx.sprite({
        sprite: 'smoke',
        x: x + Math.sin(a) * 0.6,
        y: 0.35,
        z: z + Math.cos(a) * 0.6,
        mode: 'billboard',
        roll: a,
        rollEnd: a + 0.8,
        w: 1.1,
        grow: 2.6,
        life: 0.9,
        color: new Color3(0.32, 0.28, 0.42),
        vx: Math.sin(a) * radius * 1.1,
        vz: Math.cos(a) * radius * 1.1,
        vy: 0.7,
        fadeIn: 0.1,
        delay: land,
      });
    }
    this.sparksLater(x, 0.3, z, VIOLET, 36, 8, land);
    this.sparksLater(x, 0.3, z, PALE, 20, 6, land + 0.05);
  }

  /** Rune circle on the ground for the cast time (point skills). */
  private rune(
    x: number,
    z: number,
    radius: number,
    seconds: number,
    color: Color3,
    big: boolean,
  ): void {
    this.fx.sprite({
      sprite: 'rune',
      x,
      y: 0.06,
      z,
      mode: 'flat',
      roll: 0,
      rollEnd: big ? 1.6 : 1,
      w: radius * 2.1,
      grow: big ? 1.08 : 1,
      life: seconds + 0.15,
      color,
      intensity: 1.1,
      fadeIn: 0.25,
      pulse: 18,
    });
    if (big)
      this.fx.sprite({
        sprite: 'sigil',
        x,
        y: 0.07,
        z,
        mode: 'flat',
        roll: 0,
        rollEnd: -2.4,
        w: radius * 1.2,
        grow: 1.25,
        life: seconds + 0.15,
        color: WHITE,
        intensity: 0.9,
        fadeIn: 0.4,
      });
    this.fx.sprite({
      sprite: 'shock',
      x,
      y: 0.05,
      z,
      mode: 'flat',
      w: radius * 2,
      life: seconds + 0.1,
      color,
      intensity: 0.6,
      fadeIn: 0.15,
    });
  }

  private zapAt(p: Vector3, k: number, color: Color3): void {
    this.fx.sprite({
      sprite: 'zap',
      x: p.x,
      y: p.y,
      z: p.z,
      mode: 'billboard',
      roll: Math.random() * 6,
      w: 1.3 * k,
      grow: 1.4,
      life: 0.26,
      color,
      intensity: 1.4,
    });
    this.fx.sprite({
      sprite: 'glow',
      x: p.x,
      y: p.y,
      z: p.z,
      mode: 'billboard',
      w: 1.2 * k,
      grow: 1.5,
      life: 0.26,
      color,
      intensity: 1,
    });
    this.fx.sparks(p.x, p.y, p.z, color, 8 * k, 4.5, { spread: Math.PI, gravity: 8 });
  }

  /** `CombatFx.sparks` has no delay of its own: start them at the sprite clock via a stand-in. */
  private sparksLater(
    x: number,
    y: number,
    z: number,
    color: Color3,
    count: number,
    speed: number,
    delay: number,
  ): void {
    if (delay <= 0) {
      this.fx.sparks(x, y, z, color, count, speed, { spread: Math.PI, gravity: 10 });
      return;
    }
    this.pending.push({
      at: delay,
      run: () => this.fx.sparks(x, y, z, color, count, speed, { spread: Math.PI, gravity: 10 }),
    });
  }

  /** Electricity running over a body for `seconds`. */
  private crackle(view: EntityView, seconds: number, color: Color3): void {
    if (this.low) return;
    const found = this.crackles.find((c) => c.view === view);
    if (found) {
      found.left = Math.max(found.left, seconds);
      found.color = color;
      return;
    }
    this.crackles.push({ view, id: view.entityId, left: seconds, next: 0, color });
  }

  /** Sword qi flying to the target, trailing lightning. */
  private fly(from: Vector3, to: Vector3, color: Color3, onArrive: () => void): void {
    const duration = Math.min(0.22, 0.06 + Vector3.Distance(from, to) * 0.016);
    const v = to.subtract(from).scale(1 / duration);
    for (const [c, w, intensity] of [
      [color, 0.9, 1.4],
      [WHITE, 0.4, 1.2],
    ] as const)
      this.fx.sprite({
        sprite: 'glow',
        x: from.x,
        y: from.y,
        z: from.z,
        mode: 'billboard',
        w,
        life: duration,
        color: c,
        intensity,
        vx: v.x,
        vy: v.y,
        vz: v.z,
      });
    // The sword qi itself: a crackling blade of light pointing along the flight.
    // Centred half a length ahead so it trails behind the head, not behind the caster.
    const ahead = v.clone().normalize().scale(0.6);
    this.fx.sprite({
      sprite: 'streak',
      x: from.x + ahead.x,
      y: from.y + ahead.y,
      z: from.z + ahead.z,
      mode: 'upright',
      yaw: Math.atan2(v.x, v.z),
      w: 1.2,
      h: 0.7,
      life: duration + 0.04,
      color,
      intensity: 1.5,
      vx: v.x,
      vy: v.y,
      vz: v.z,
    });
    this.flights.push({
      from: from.clone(),
      to: to.clone(),
      age: 0,
      duration,
      last: from.clone(),
      color,
      onArrive,
    });
  }

  update(dt: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i] as { at: number; run: () => void };
      p.at -= dt;
      if (p.at <= 0) {
        this.pending.splice(i, 1);
        p.run();
      }
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i] as Flight;
      f.age += dt;
      const t = Math.min(1, f.age / f.duration);
      const head = Vector3.Lerp(f.from, f.to, t);
      // Lightning left behind the head, segment by segment.
      if (Vector3.Distance(head, f.last) > 0.6 || t >= 1) {
        this.bolts.bolt({
          from: f.last,
          to: head,
          color: f.color,
          width: 0.18,
          jitter: 0.25,
          life: 0.2,
        });
        f.last = head;
      }
      if (t >= 1) {
        this.flights.splice(i, 1);
        f.onArrive();
      }
    }
    for (let i = this.crackles.length - 1; i >= 0; i--) {
      const c = this.crackles[i] as Crackle;
      c.left -= dt;
      // The view may have been recycled for another entity.
      if (c.left <= 0 || c.view.entityId !== c.id) {
        this.crackles.splice(i, 1);
        continue;
      }
      c.next -= dt;
      if (c.next > 0) continue;
      c.next = 0.06 + Math.random() * 0.05;
      const p = c.view.root.position;
      const h = c.view.height;
      const r = c.view.radius * 0.9;
      const a = Math.random() * Math.PI * 2;
      const y = 0.15 + Math.random() * h * 0.85;
      const b = a + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.9);
      this.bolts.bolt({
        from: new Vector3(p.x + Math.sin(a) * r, y, p.z + Math.cos(a) * r),
        to: new Vector3(
          p.x + Math.sin(b) * r,
          Math.max(0.05, y + rand(0.5)),
          p.z + Math.cos(b) * r,
        ),
        color: c.color,
        width: 0.07,
        jitter: 0.12,
        life: 0.09,
      });
    }
  }

  dispose(): void {
    this.crackles.length = 0;
    this.flights.length = 0;
    this.pending.length = 0;
  }
}

const rand = (k: number) => (Math.random() * 2 - 1) * k;
