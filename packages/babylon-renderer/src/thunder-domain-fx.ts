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
import type { LightningBatch } from './lightning';

/**
 * Lôi Vực (`vfx: thunder_domain`), a toggle aura: while the host keeps it on
 * (SKILL_IMPACT `sustain` on / tick / off), lightning crawls over the body,
 * arcs leap from it to the ground and props around, a rune turns under the
 * feet and every damage tick lashes the bodies it hits. Colour and density
 * follow the ngũ hành and its setting. Kept alive a little past each tick so
 * a lost "off" (AOI) still ends it.
 */

/** Seconds an aura survives without hearing a tick. */
const GRACE = 1.6;
const WHITE = Color3.White();

interface Domain {
  view: EntityView;
  id: number;
  radius: number;
  kind: FxKind;
  k: number;
  busy: number;
  /** Seconds left before it lapses without a tick. */
  left: number;
  fading: number | null;
  nextBody: number;
  nextArc: number;
  nextMote: number;
  nextRune: number;
}

export class ThunderDomainFx {
  private readonly domains = new Map<number, Domain>();

  constructor(
    private readonly fx: CombatFx,
    private readonly bolts: LightningBatch,
    private readonly element: ElementBurst,
    private readonly level: () => number,
  ) {}

  private get low(): boolean {
    return this.fx.quality === 'low';
  }

  /** Is the aura of `sourceId` on (as far as the renderer heard)? */
  active(sourceId: number): boolean {
    const d = this.domains.get(sourceId);
    return !!d && d.fading === null;
  }

  event(
    phase: 'on' | 'tick' | 'off',
    sourceId: number,
    view: EntityView | undefined,
    radius: number,
    element: Element | null | undefined,
    expression: string | undefined,
  ): void {
    const existing = this.domains.get(sourceId);
    if (phase === 'off') {
      if (existing && existing.fading === null) {
        existing.fading = 0.35;
        this.collapse(existing);
      }
      return;
    }
    if (!view) return;
    const level = this.level();
    const kind = fxKind(element, expression, level);
    const tone = ELEMENT_TONES[kind];
    const d: Domain = existing ?? {
      view,
      id: view.entityId,
      radius,
      kind,
      k: elementStrength(tone, level),
      busy: elementBusy(level, this.fx.quality),
      left: GRACE,
      fading: null,
      nextBody: 0,
      nextArc: 0,
      nextMote: 0,
      nextRune: 0,
    };
    d.view = view;
    d.id = view.entityId;
    d.radius = radius || d.radius;
    d.kind = kind;
    d.k = elementStrength(tone, level);
    d.busy = elementBusy(level, this.fx.quality);
    d.left = GRACE;
    d.fading = null;
    this.domains.set(sourceId, d);
    if (phase === 'on') this.ignite(d);
    else this.pulse(d);
  }

  /** A damage tick landing on `target`: a lash from the caster. */
  lash(sourceId: number, target: EntityView): void {
    const d = this.domains.get(sourceId);
    if (!d || d.view.entityId !== d.id) return;
    const color = ELEMENT_TONES[d.kind].color;
    const from = d.view.root.position;
    const to = target.root.position;
    this.bolts.bolt({
      from: new Vector3(from.x, d.view.height * 0.7, from.z),
      to: new Vector3(to.x, target.height * 0.55, to.z),
      color,
      width: 0.18,
      jitter: 0.45,
      life: 0.22,
      branches: this.low ? 0 : 1,
      intensity: d.k,
    });
    this.fx.sprite({
      sprite: 'zap',
      x: to.x,
      y: target.height * 0.55,
      z: to.z,
      mode: 'billboard',
      roll: Math.random() * 6,
      w: 0.9,
      grow: 1.3,
      life: 0.2,
      color,
      intensity: 1.3,
    });
  }

  update(dt: number): void {
    for (const [sourceId, d] of this.domains) {
      if (d.view.entityId !== d.id || !d.view.root.isEnabled()) {
        this.domains.delete(sourceId);
        continue;
      }
      if (d.fading !== null) {
        d.fading -= dt;
        if (d.fading <= 0) this.domains.delete(sourceId);
        continue;
      }
      d.left -= dt;
      if (d.left <= 0) {
        this.domains.delete(sourceId);
        continue;
      }
      this.sustain(d, dt);
    }
  }

  dispose(): void {
    this.domains.clear();
  }

  // ---- Moments -----------------------------------------------------------

  private ignite(d: Domain): void {
    const p = d.view.root.position;
    const color = ELEMENT_TONES[d.kind].color;
    this.fx.sprite({
      sprite: 'shock',
      x: p.x,
      y: 0.07,
      z: p.z,
      mode: 'flat',
      w: d.radius * 0.4,
      grow: 5,
      life: 0.45,
      color,
      intensity: 1.3 * d.k,
    });
    this.fx.sprite({
      sprite: 'star',
      x: p.x,
      y: d.view.height * 0.6,
      z: p.z,
      mode: 'billboard',
      w: 1.6,
      grow: 1.8,
      life: 0.2,
      color: WHITE,
      intensity: 1.2,
    });
    const n = this.low ? 3 : 6;
    for (let i = 0; i < n; i++) this.groundArc(d, 0.06 * i);
    this.pulse(d);
  }

  /** Damage tick: a ring rolling out to the edge and a burst of arcs. */
  private pulse(d: Domain): void {
    const p = d.view.root.position;
    const color = ELEMENT_TONES[d.kind].color;
    this.fx.sprite({
      sprite: 'ring',
      x: p.x,
      y: 0.08,
      z: p.z,
      mode: 'flat',
      w: 0.6,
      grow: (d.radius * 2) / 0.6,
      life: 0.45,
      color,
      intensity: 0.9 * d.k,
    });
    const n = Math.max(2, Math.round(4 * d.busy));
    for (let i = 0; i < n; i++) this.groundArc(d, 0.04 * i);
  }

  private collapse(d: Domain): void {
    const p = d.view.root.position;
    this.fx.sprite({
      sprite: 'glow',
      x: p.x,
      y: d.view.height * 0.5,
      z: p.z,
      mode: 'billboard',
      w: 1.8,
      grow: 0.3,
      life: 0.3,
      color: ELEMENT_TONES[d.kind].color,
      intensity: 1,
    });
  }

  /** Continuous look while on: crawling arcs, leaping arcs, motes and the rune. */
  private sustain(d: Domain, dt: number): void {
    const color = ELEMENT_TONES[d.kind].color;
    const v = d.view;
    const p = v.root.position;
    d.nextRune -= dt;
    if (d.nextRune <= 0) {
      d.nextRune = 0.9;
      // Overlapping runes riding the caster: one steady turning circle.
      this.fx.sprite({
        sprite: 'rune',
        x: 0,
        y: 0.06,
        z: 0,
        mode: 'flat',
        follow: v.root,
        roll: Math.random() * 6,
        rollEnd: Math.random() * 6 + 1.2,
        w: d.radius * 2,
        life: 1.2,
        color,
        intensity: 0.55 * d.k,
        fadeIn: 0.3,
      });
    }
    d.nextBody -= dt;
    if (d.nextBody <= 0 && !this.low) {
      d.nextBody = 0.05 + Math.random() * 0.05;
      const r = v.radius * 1.1;
      const a = Math.random() * Math.PI * 2;
      const y = 0.2 + Math.random() * v.height * 0.9;
      const b = a + (Math.random() < 0.5 ? 1 : -1) * (0.7 + Math.random());
      this.bolts.bolt({
        from: new Vector3(p.x + Math.sin(a) * r, y, p.z + Math.cos(a) * r),
        to: new Vector3(
          p.x + Math.sin(b) * r,
          Math.max(0.05, y + (Math.random() - 0.5) * 0.8),
          p.z + Math.cos(b) * r,
        ),
        color,
        width: 0.1,
        jitter: 0.16,
        life: 0.12,
        intensity: d.k,
      });
    }
    d.nextArc -= dt;
    if (d.nextArc <= 0) {
      d.nextArc = (0.1 + Math.random() * 0.08) / Math.max(0.3, d.busy);
      this.groundArc(d, 0);
    }
    d.nextMote -= dt;
    if (d.nextMote <= 0 && d.kind !== 'none') {
      d.nextMote = (0.12 + Math.random() * 0.1) / Math.max(0.3, d.busy);
      const a = Math.random() * Math.PI * 2;
      const r = d.radius * Math.sqrt(Math.random());
      this.element.mote(
        d.kind,
        p.x + Math.sin(a) * r,
        0.2 + Math.random() * 0.8,
        p.z + Math.cos(a) * r,
        d.k,
      );
    }
  }

  /** An arc leaping from the body to a random spot of the ground inside the domain. */
  private groundArc(d: Domain, delay: number): void {
    const v = d.view;
    const p = v.root.position;
    const color = ELEMENT_TONES[d.kind].color;
    const a = Math.random() * Math.PI * 2;
    const r = d.radius * (0.45 + Math.random() * 0.55);
    const end = new Vector3(p.x + Math.sin(a) * r, 0.05, p.z + Math.cos(a) * r);
    this.bolts.bolt({
      from: new Vector3(
        p.x + Math.sin(a) * 0.3,
        v.height * (0.4 + Math.random() * 0.5),
        p.z + Math.cos(a) * 0.3,
      ),
      to: end,
      color,
      width: 0.17,
      jitter: r * 0.16,
      life: 0.16,
      delay,
      intensity: d.k,
    });
    this.fx.sprite({
      sprite: 'zap',
      x: end.x,
      y: 0.2,
      z: end.z,
      mode: 'billboard',
      roll: Math.random() * 6,
      w: 0.6,
      grow: 1.3,
      life: 0.18,
      color,
      intensity: 1.2,
      delay,
    });
  }
}
