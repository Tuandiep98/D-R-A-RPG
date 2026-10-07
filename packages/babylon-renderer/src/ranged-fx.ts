import type { RangedDef } from '@rpg/game-data';
import type { EntityId } from '@rpg/game-protocol';
import { Color3 } from './babylon';
import type { CombatFx } from './combat-fx';
import type { EntityView } from './entity-view';

/**
 * Presentation of ranged weapons (D-033), driven only by host events (SHOT,
 * RELOAD, OVERHEAT, DAMAGE.shot) plus the local player's private state for
 * the heat bar. Nothing here decides a hit.
 *
 * Per shooter a small pose machine plays upper-body clips over the walk:
 * raise/shoot → hold aim → lower (or reload / auto-fire loop). Muzzle flashes,
 * tracers and impacts reuse CombatFx sprite batches (one draw call per sprite
 * kind). Tracers fly with the bullet's speed and are cut when the host
 * reports the body they hit; walls and max range end them on their own.
 */

type Mode = 'raise' | 'shoot' | 'loop' | 'aim' | 'reload' | 'lower';

interface Pose {
  view: EntityView;
  def: RangedDef;
  mode: Mode;
  /** Seconds the weapon stays up after the last shot. */
  hold: number;
  sinceShot: number;
  reload: { left: number; total: number } | null;
  /** Reload clip waiting for the recoil to finish (bolt-action reloads right after the shot). */
  reloadQueued: boolean;
  overheat: { left: number; total: number } | null;
  steamIn: number;
}

/** Bullet tracer ids: one per (shot, pellet). */
export const tracerTag = (shotId: number, pellet: number): number => shotId * 16 + pellet + 1;

/** Height of a held gun above the ground when the muzzle node is unknown. */
const GUN_HEIGHT = 1.0;
const WHITE = Color3.White();
const STEAM = new Color3(0.75, 0.78, 0.82);
const DUST = new Color3(0.5, 0.44, 0.36);

export interface ShotView {
  sourceId: EntityId;
  shotId: number;
  origin: { x: number; z: number };
  yaws: readonly number[];
  lens: readonly number[];
}

export class GunFx {
  private readonly poses = new Map<EntityId, Pose>();
  /** Local player's heat (0…1) from private state, eased per frame. */
  private ownHeat = { id: 0 as EntityId, target: 0, shown: 0 };

  constructor(private readonly fx: CombatFx) {}

  private pose(id: EntityId, view: EntityView, def: RangedDef): Pose {
    let p = this.poses.get(id);
    if (!p || p.view !== view) {
      p = {
        view,
        def,
        mode: 'lower',
        hold: 0,
        sinceShot: 99,
        reload: null,
        reloadQueued: false,
        overheat: null,
        steamIn: 0,
      };
      this.poses.set(id, p);
    }
    p.def = def;
    return p;
  }

  /** Local trigger pressed: raise at once so the wind-up shows (cosmetic, own player only). */
  raise(id: EntityId, view: EntityView, def: RangedDef): void {
    const p = this.pose(id, view, def);
    if (p.mode === 'reload' || p.overheat) return;
    if (p.mode === 'lower' || p.hold <= 0) this.toAim(p);
    p.hold = Math.max(p.hold, def.holdAim);
  }

  /** A SHOT event: body turn, recoil clip, muzzle flash, tracers. Returns the camera kick. */
  shot(view: EntityView, def: RangedDef, ev: ShotView, quality: number): number {
    const p = this.pose(ev.sourceId, view, def);
    const centre = ((ev.yaws[0] ?? 0) + (ev.yaws[ev.yaws.length - 1] ?? 0)) / 2;
    view.faceYaw(centre, def.holdAim);
    const anim = def.anim;
    if (anim.loop && def.fireMode === 'auto') {
      if (p.mode !== 'loop') {
        const cycle = view.clipSeconds(anim.loop.clip);
        const speed = cycle > 0 ? cycle / anim.loop.shots / def.fireInterval : 1;
        if (view.overlay(anim.loop.clip, speed, { loop: true })) p.mode = 'loop';
      }
    } else {
      p.mode = 'shoot';
      view.overlay(anim.shoot, anim.shootSpeed, {
        from: anim.shootFrom,
        to: anim.shootTo,
        onEnd: () => {
          if (p.mode !== 'shoot' || this.poses.get(ev.sourceId) !== p) return;
          if (p.reloadQueued && p.reload) this.playReload(p);
          else this.toAim(p);
        },
      });
    }
    p.hold = def.holdAim;
    p.sinceShot = 0;
    p.reload = null;
    p.reloadQueued = false;

    const muzzle = this.muzzle(view, centre);
    this.flash(muzzle, centre, def, quality);
    const speed = def.projectile.speed;
    ev.yaws.forEach((yaw, i) => {
      const len = ev.lens[i] ?? def.projectile.range;
      this.tracer(muzzle, yaw, len, def, tracerTag(ev.shotId, i), quality);
      // Stopped short of max range by a wall or the map edge: dust where it lands.
      if (len < def.projectile.range - 0.05 && i % (quality < 0.5 ? 3 : 1) === 0) {
        const delay = speed > 0 ? len / speed : 0;
        const x = ev.origin.x + Math.sin(yaw) * len;
        const z = ev.origin.z + Math.cos(yaw) * len;
        this.dust(x, muzzle.y, z, yaw, def, delay);
      }
    });
    return def.fx.kick;
  }

  /** DAMAGE from a bullet: stop its tracer at the body, flash + sparks on it. */
  hit(
    target: EntityView,
    from: { x: number; z: number },
    def: RangedDef | undefined,
    shot: { id: number; pellet: number },
    crit: boolean,
  ): void {
    this.fx.cut(tracerTag(shot.id, shot.pellet), 0.02);
    const color = Color3.FromHexString(def?.fx.color ?? '#ffd27a');
    const t = target.root.position;
    const yaw = Math.atan2(t.x - from.x, t.z - from.z);
    const k = Math.min(1.6, def?.fx.size ?? 1);
    this.fx.hit(
      t.x - Math.sin(yaw) * target.radius * 0.6,
      target.height * 0.55,
      t.z - Math.cos(yaw) * target.radius * 0.6,
      yaw,
      color,
      (crit ? 0.5 : 0.22) * k,
    );
    target.knock(t.x - from.x, t.z - from.z, def?.projectile.speed === 0 ? 0.14 : 0.05);
  }

  /** RELOAD event: stretch the reload clip over the time; endTick <= start → it stopped. */
  reload(id: EntityId, view: EntityView, def: RangedDef, seconds: number): void {
    const p = this.pose(id, view, def);
    if (seconds <= 0) {
      if (p.mode === 'reload') this.toAim(p);
      p.reload = null;
      p.reloadQueued = false;
      return;
    }
    p.reload = { left: seconds, total: seconds };
    // Let the recoil play out first (a bolt-action reloads on the shot tick).
    if (p.mode === 'shoot') p.reloadQueued = true;
    else this.playReload(p);
  }

  private playReload(p: Pose): void {
    const r = p.reload;
    if (!r) return;
    p.reloadQueued = false;
    p.mode = 'reload';
    const clip = p.def.anim.reload;
    const length = p.view.clipSeconds(clip);
    const round = p.def.reload?.mode === 'round';
    const each = round ? (p.def.reload?.seconds ?? r.left) : r.left;
    p.view.overlay(clip, length > 0 ? length / Math.max(0.1, each) : 1, { loop: round });
  }

  /** OVERHEAT event: steam from the muzzle and the white cool-down bar. */
  overheat(id: EntityId, view: EntityView, def: RangedDef, seconds: number): void {
    const p = this.pose(id, view, def);
    p.overheat = { left: seconds, total: seconds };
    p.steamIn = 0;
    const m = this.muzzle(view, view.root.rotation.y);
    this.fx.sprite({
      sprite: 'glow',
      ...m,
      mode: 'billboard',
      w: 0.9,
      grow: 1.8,
      life: 0.35,
      color: Color3.FromHexString(def.fx.color),
      intensity: 1.2,
    });
    this.fx.sparks(m.x, m.y, m.z, WHITE, 10, 3, { spread: Math.PI, gravity: 6, size: 0.16 });
  }

  /** Private heat of the local player's weapon (PlayerState, 10 Hz). */
  setOwnHeat(id: EntityId, heat: number): void {
    this.ownHeat.id = id;
    this.ownHeat.target = heat;
  }

  /** Drops a shooter (despawned, weapon swapped to melee). */
  forget(id: EntityId): void {
    const p = this.poses.get(id);
    if (!p) return;
    this.poses.delete(id);
    p.view.endOverlay();
    p.view.setGauge(null, 'heat');
  }

  update(dt: number, quality: number): void {
    const own = this.ownHeat;
    own.shown += (own.target - own.shown) * Math.min(1, dt * 12);
    for (const [id, p] of this.poses) {
      if (p.view.entityId !== id) {
        this.poses.delete(id);
        continue;
      }
      p.sinceShot += dt;
      p.hold -= dt;
      if (p.mode === 'loop' && p.sinceShot > p.def.fireInterval * 2 + 0.08) this.toAim(p);
      if (p.reload) {
        p.reload.left -= dt;
        if (p.reload.left <= 0) {
          p.reload = null;
          p.reloadQueued = false;
          if (p.mode === 'reload') this.toAim(p);
        }
      }
      if (p.overheat) {
        p.overheat.left -= dt;
        p.steamIn -= dt;
        if (p.steamIn <= 0) {
          p.steamIn = quality < 0.5 ? 0.4 : 0.18;
          this.steam(p.view);
        }
        if (p.overheat.left <= 0) p.overheat = null;
      }
      if ((p.mode === 'aim' || p.mode === 'raise') && p.hold <= 0 && !p.reload) this.lower(p);

      // Overhead bar: cool-down (white, drains) > reload (fills) > own heat.
      if (p.overheat) p.view.setGauge(p.overheat.left / p.overheat.total, 'overheat');
      else if (p.reload) p.view.setGauge(1 - p.reload.left / p.reload.total, 'reload');
      else if (id === own.id && own.shown > 0.02) p.view.setGauge(own.shown, 'heat');
      else p.view.setGauge(null, 'heat');
    }
  }

  private toAim(p: Pose): void {
    p.mode = 'aim';
    p.view.overlay(p.def.anim.aim, 1, { loop: true, from: p.def.anim.aimFrom });
  }

  private lower(p: Pose): void {
    const from = p.def.anim.lowerFrom;
    if (from === undefined) {
      p.mode = 'lower';
      p.view.endOverlay();
      return;
    }
    p.mode = 'lower';
    p.view.overlay(p.def.anim.shoot, 1.4, {
      from,
      onEnd: () => {
        if (p.mode === 'lower') p.view.endOverlay();
      },
    });
  }

  /** World position of the muzzle: the weapon tip node, or ahead of the chest. */
  private muzzle(view: EntityView, yaw: number): { x: number; y: number; z: number } {
    const tip = view.anchor('weapon_tip');
    const r = view.root.position;
    if (tip) {
      const a = tip.getAbsolutePosition();
      // A clip still blending in can leave the gun at the hip: keep it sane.
      if (a.y > 0.45 && Math.hypot(a.x - r.x, a.z - r.z) < 1.6) return { x: a.x, y: a.y, z: a.z };
    }
    const ahead = view.radius + 0.35;
    return { x: r.x + Math.sin(yaw) * ahead, y: GUN_HEIGHT, z: r.z + Math.cos(yaw) * ahead };
  }

  private flash(
    m: { x: number; y: number; z: number },
    yaw: number,
    def: RangedDef,
    quality: number,
  ): void {
    const color = Color3.FromHexString(def.fx.color);
    const size = def.fx.size;
    const big = def.projectile.pellets > 1 || def.projectile.speed === 0;
    // Flame lying along the barrel (texture-up = shot direction), then a soft glow.
    this.fx.sprite({
      sprite: big ? 'blast' : 'muzzle',
      x: m.x + Math.sin(yaw) * 0.25 * size,
      y: m.y,
      z: m.z + Math.cos(yaw) * 0.25 * size,
      mode: 'flat',
      yaw,
      w: 0.38 * size,
      h: 0.62 * size,
      grow: 1.25,
      life: big ? 0.09 : 0.06,
      color: Color3.Lerp(color, WHITE, 0.45),
      intensity: 1.5,
    });
    this.fx.sprite({
      sprite: 'glow',
      ...m,
      mode: 'billboard',
      w: 0.45 * size,
      grow: 1.4,
      life: 0.08,
      color,
      intensity: 1.1,
    });
    if (big && quality > 0.5)
      this.fx.sparks(m.x, m.y, m.z, color, 6, 6, {
        dirYaw: yaw,
        spread: 0.45,
        gravity: 4,
        size: 0.14,
      });
  }

  private tracer(
    m: { x: number; y: number; z: number },
    yaw: number,
    len: number,
    def: RangedDef,
    tag: number,
    quality: number,
  ): void {
    const color = Color3.FromHexString(def.fx.color);
    const size = def.fx.size;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const speed = def.projectile.speed;
    if (speed <= 0 || def.fx.tracer === 'beam') {
      // Instant line from the muzzle to where the bullet stopped.
      const mid = len / 2;
      for (const [c, w, life, k] of [
        [color, 0.32 * size, 0.22, 1.4],
        [WHITE, 0.1 * size, 0.14, 1.1],
      ] as const)
        this.fx.sprite({
          sprite: 'trace',
          x: m.x + fx * mid,
          y: m.y,
          z: m.z + fz * mid,
          mode: 'flat',
          yaw,
          w,
          h: len,
          grow: 1,
          life,
          color: c,
          intensity: k,
        });
      if (quality > 0.5)
        this.fx.sprite({
          sprite: 'ring',
          ...m,
          mode: 'upright',
          yaw: yaw + Math.PI / 2,
          w: 0.3,
          grow: 3,
          life: 0.22,
          color,
          intensity: 1,
        });
      return;
    }
    const life = Math.max(0.02, len / speed);
    const vel = { vx: fx * speed, vz: fz * speed };
    // About one frame of travel long, so fast bullets read as streaks, not dots.
    const streak = Math.max(1, speed * 0.03);
    const start = { x: m.x + fx * 0.3, y: m.y, z: m.z + fz * 0.3 };
    switch (def.fx.tracer) {
      case 'bolt':
        this.fx.sprite({
          sprite: 'tracer',
          ...start,
          mode: 'flat',
          yaw,
          w: 0.38 * size,
          h: streak * size,
          life,
          color,
          intensity: 1.6,
          tag,
          ...vel,
        });
        if (quality > 0.5)
          this.fx.sprite({
            sprite: 'glow',
            ...start,
            mode: 'billboard',
            w: 0.5 * size,
            life,
            color,
            intensity: 0.9,
            tag,
            ...vel,
          });
        break;
      case 'pellet':
        this.fx.sprite({
          sprite: 'trace',
          ...start,
          mode: 'flat',
          yaw,
          w: 0.18 * size,
          h: streak * 0.6 * size,
          life,
          color,
          intensity: 1.3,
          tag,
          ...vel,
        });
        break;
      default:
        this.fx.sprite({
          sprite: 'trace',
          ...start,
          mode: 'flat',
          yaw,
          w: 0.22 * size,
          h: streak * 1.1 * size,
          life,
          color: Color3.Lerp(color, WHITE, 0.3),
          intensity: 1.4,
          tag,
          ...vel,
        });
    }
  }

  private dust(x: number, y: number, z: number, yaw: number, def: RangedDef, delay: number): void {
    const color = Color3.FromHexString(def.fx.color);
    this.fx.sprite({
      sprite: 'star',
      x,
      y,
      z,
      mode: 'billboard',
      w: 0.35,
      grow: 1.6,
      life: 0.12,
      color: WHITE,
      intensity: 0.9,
      delay,
    });
    this.fx.sprite({
      sprite: 'smoke',
      x,
      y,
      z,
      mode: 'billboard',
      w: 0.35,
      grow: 2.2,
      life: 0.45,
      color: DUST,
      vy: 0.5,
      fadeIn: 0.1,
      delay,
    });
    // Sparks bounce back toward the shooter.
    for (let i = 0; i < 3; i++)
      this.fx.sprite({
        sprite: 'spark',
        x,
        y,
        z,
        mode: 'billboard',
        w: 0.12,
        grow: 0.4,
        life: 0.25,
        color,
        intensity: 1.3,
        vx: -Math.sin(yaw + (i - 1) * 0.6) * 3,
        vz: -Math.cos(yaw + (i - 1) * 0.6) * 3,
        vy: 2,
        gravity: 9,
        delay,
      });
  }

  private steam(view: EntityView): void {
    const m = this.muzzle(view, view.root.rotation.y);
    this.fx.sprite({
      sprite: 'smoke',
      ...m,
      mode: 'billboard',
      roll: Math.random() * 3,
      rollEnd: Math.random() * 3,
      w: 0.22,
      grow: 2.6,
      life: 0.8,
      color: STEAM,
      intensity: 0.7,
      vy: 0.9,
      vx: (Math.random() - 0.5) * 0.3,
      vz: (Math.random() - 0.5) * 0.3,
      fadeIn: 0.15,
    });
  }
}
