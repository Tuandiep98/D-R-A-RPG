import type { RangedDef } from '@rpg/game-data';
import type { EntityId, PlayerState } from '@rpg/game-protocol';
import { areHostile, edgeDistance, isAlive, type SimContext } from '../context';
import type { Entity, PlayerData, TriggerState, WeaponState } from '../entity';
import { clamp, sub, type Vec2, yawOf } from '../math';
import { secondsToTicks, TICK_RATE } from '../time';
import { applyDamage, rollHit } from './combat';
import { facingDot } from './melee';

/**
 * Ranged basic attacks (đánh tầm xa, D-033). Data in game-data/ranged; the
 * equipped main-hand item picks the profile.
 *
 * - Trigger: TRIGGER held/released (+ keepalive), BASIC_ATTACK = one tap,
 *   ATTACK_TARGET keeps shooting a target in range. `auto` fires while held,
 *   `semi` once per press, `burst` N shots per press.
 * - Magazine per weapon instance; `magazine` reloads refill at once, `round`
 *   reloads add one round at a time and firing interrupts them. Runs dry →
 *   reload starts by itself (`reload.auto`), so a 1-round sniper is bolt-action.
 * - Heat (quá tải): shots heat the weapon, it cools after a short delay; at
 *   100% it locks for `overheatSeconds` while the bar drains.
 * - Bullets: speed 0 is hitscan (resolved on the shot tick), otherwise a
 *   pooled list of rays advanced every tick. Walls (circle obstacles) and map
 *   bounds stop them; `pierce` lets them pass through extra bodies.
 * - A raised weapon locks the facing to the aim (walking strafes) and skips
 *   the wind-up; it lowers `holdAim` seconds after the last shot.
 */

const DEG = Math.PI / 180;
/** Drawing a freshly swapped weapon before it may fire. */
const DRAW_SECONDS = 0.3;
/** A held trigger with no TRIGGER for this long is released (lost release message). */
export const TRIGGER_TIMEOUT_TICKS = 30;
/** Muzzle distance past the body edge. */
const MUZZLE_AHEAD = 0.35;
/** Bullets in flight per world; the oldest are dropped past this (bounded cost). */
const MAX_PROJECTILES = 300;
/** Aim assist may keep a target this far past the weapon's range. */
const STICKY_RANGE = 1.15;

type Equipped = NonNullable<PlayerData['ranged']>;

const round = (v: number, k: number) => Math.round(v * k) / k;

function weaponOf(p: PlayerData, w: Equipped): WeaponState {
  let ws = p.weapons.get(w.instanceId);
  if (!ws) {
    ws = { ammo: w.def.magazine, heat: 0, heatTick: 0, lastShotTick: -1_000_000, overheatUntil: 0 };
    p.weapons.set(w.instanceId, ws);
  }
  return ws;
}

/** Heat 0…1 at `tick`; while overheated it is the share of the lockout still left. */
export function heatAt(def: RangedDef, ws: WeaponState, tick: number): number {
  const h = def.heat;
  if (!h) return 0;
  if (tick < ws.overheatUntil)
    return clamp((ws.overheatUntil - tick) / secondsToTicks(h.overheatSeconds), 0, 1);
  const coolFrom = Math.max(ws.heatTick, ws.lastShotTick + secondsToTicks(h.coolDelay));
  const cooled = (Math.max(0, tick - coolFrom) / TICK_RATE) * h.coolPerSecond;
  return Math.max(0, ws.heat - cooled);
}

// ---- Intents ----------------------------------------------------------------

/** TRIGGER intent with a ranged weapon equipped. */
export function setTrigger(
  ctx: SimContext,
  e: Entity,
  held: boolean,
  aim: Vec2 | null,
  targetId: EntityId | null,
): boolean {
  const p = e.player;
  const w = p?.ranged;
  if (!p || !w) return false;
  const t = p.trigger;
  if (!held) {
    t.held = false;
    return true;
  }
  if (!t.held) press(ctx, e, w, t);
  t.held = true;
  t.heardTick = ctx.tick;
  t.aim = aim ? { x: aim.x, z: aim.z } : null;
  if (targetId !== null) t.assistId = targetId;
  return true;
}

/** BASIC_ATTACK with a ranged weapon: one press, as if the trigger was tapped. */
export function tapTrigger(ctx: SimContext, e: Entity, aim: Vec2 | null): boolean {
  const p = e.player;
  const w = p?.ranged;
  if (!p || !w) return false;
  p.trigger.aim = aim ? { x: aim.x, z: aim.z } : null;
  press(ctx, e, w, p.trigger);
  return true;
}

/** Releases the trigger and drops presses not fired yet (STOP, death). */
export function releaseTrigger(e: Entity): void {
  const t = e.player?.trigger;
  if (!t) return;
  t.held = false;
  t.queued = false;
  t.burstLeft = 0;
}

/** RELOAD intent. */
export function requestReload(ctx: SimContext, e: Entity): boolean {
  const p = e.player;
  const w = p?.ranged;
  if (!p || !w?.def.reload || w.def.magazine === 0) {
    ctx.notice(e.id, 'invalid');
    return false;
  }
  startReload(ctx, e, w, weaponOf(p, w), p.trigger);
  return true;
}

function press(ctx: SimContext, e: Entity, w: Equipped, t: TriggerState): void {
  t.queued = true;
  const ws = weaponOf(e.player as PlayerData, w);
  // A press that cannot fire says why (never repeated while held).
  if (ctx.tick < ws.overheatUntil) ctx.notice(e.id, 'overheated');
  else if (t.reload && (w.def.reload?.mode === 'magazine' || ws.ammo === 0))
    ctx.notice(e.id, 'reloading');
}

// ---- System -----------------------------------------------------------------

/** Trigger, reload and heat per player, then bullets in flight. Runs before movement. */
export function rangedSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    const p = e.player;
    if (!p) continue;
    const t = p.trigger;
    const w = p.ranged;
    if (t.instanceId !== (w?.instanceId ?? null)) swapped(ctx, e, t, w);
    if (!w) {
      t.move = 1;
      continue;
    }
    if (!e.life.alive) {
      releaseTrigger(e);
      t.reload = null;
      t.raisedUntil = 0;
      t.move = 1;
      continue;
    }
    if (t.held && ctx.tick - t.heardTick > TRIGGER_TIMEOUT_TICKS) t.held = false;
    const ws = weaponOf(p, w);
    advanceReload(ctx, w, ws, t);

    const def = w.def;
    const target = autoTarget(ctx, e);
    if (!e.cast) {
      const auto = target !== null && !t.held && !t.queued && t.burstLeft === 0;
      const point = auto ? target.pos : t.aim;
      if (auto) t.assistId = target.id;
      const wants = t.queued || t.burstLeft > 0 || (t.held && def.fireMode === 'auto') || auto;
      if (wants) tryFire(ctx, e, w, ws, t, point);
      if (ctx.tick < t.raisedUntil) e.yaw = aimYaw(ctx, e, def, t, point, false);
    }
    const firing = ctx.tick - t.lastShotTick <= secondsToTicks(def.fireInterval) + 2;
    t.move = firing ? def.moveMultiplier : t.reload ? (def.reload?.moveMultiplier ?? 1) : 1;
  }
  stepProjectiles(ctx);
}

/** The auto-attack target (ATTACK_TARGET / tapping a monster) while it is in range. */
function autoTarget(ctx: SimContext, e: Entity): Entity | null {
  if (e.combat.targetId === null || e.pending) return null;
  const t = ctx.entities.get(e.combat.targetId);
  if (!isAlive(t) || !areHostile(e, t) || edgeDistance(e, t) > e.combat.range) return null;
  return t;
}

function swapped(ctx: SimContext, e: Entity, t: TriggerState, w: Equipped | null): void {
  cancelReload(ctx, e, t);
  releaseTrigger(e);
  t.instanceId = w?.instanceId ?? null;
  t.raisedUntil = 0;
  t.assistId = null;
  t.readyTick = ctx.tick + secondsToTicks(DRAW_SECONDS);
}

function tryFire(
  ctx: SimContext,
  e: Entity,
  w: Equipped,
  ws: WeaponState,
  t: TriggerState,
  point: Vec2 | null,
): void {
  const def = w.def;
  if (ctx.tick < ws.overheatUntil) {
    t.queued = false;
    t.burstLeft = 0;
    return;
  }
  if (def.magazine > 0 && ws.ammo <= 0) {
    t.queued = false;
    t.burstLeft = 0;
    startReload(ctx, e, w, ws, t);
    return;
  }
  if (t.reload) {
    // Shells go in one by one: shooting what is loaded stops the reload.
    if (def.reload?.mode === 'round' && ws.ammo > 0) cancelReload(ctx, e, t);
    else {
      t.queued = false;
      return;
    }
  }
  if (ctx.tick < t.nextShotTick) return; // a press stays queued until the weapon is ready
  if (ctx.tick >= t.raisedUntil) {
    // Lowered: raise toward the aim first.
    const windup = def.windup > 0 ? secondsToTicks(def.windup) : 0;
    t.readyTick = Math.max(t.readyTick, ctx.tick + windup);
    t.raisedUntil = t.readyTick + secondsToTicks(def.holdAim);
    e.yaw = aimYaw(ctx, e, def, t, point, true);
  }
  if (ctx.tick < t.readyTick) return;

  fire(ctx, e, w, ws, t, point);

  if (t.burstLeft > 0) {
    t.burstLeft--;
    t.nextShotTick =
      ctx.tick +
      (t.burstLeft > 0
        ? secondsToTicks(def.burst?.interval ?? 0.1)
        : secondsToTicks(def.fireInterval));
  } else if (def.fireMode === 'burst' && def.burst) {
    // First shot of a burst (a press, or the auto-attack's next burst).
    t.burstLeft = def.burst.count - 1;
    t.nextShotTick = ctx.tick + secondsToTicks(def.burst.interval);
  } else t.nextShotTick = ctx.tick + secondsToTicks(def.fireInterval);
  t.queued = false;
  if (def.magazine > 0 && ws.ammo === 0) {
    t.burstLeft = 0;
    if (def.reload?.auto) startReload(ctx, e, w, ws, t);
  }
}

function fire(
  ctx: SimContext,
  e: Entity,
  w: Equipped,
  ws: WeaponState,
  t: TriggerState,
  point: Vec2 | null,
): void {
  const def = w.def;
  const pr = def.projectile;
  const yaw = aimYaw(ctx, e, def, t, point, true);
  e.yaw = yaw;
  const ahead = e.movement.radius + MUZZLE_AHEAD;
  const origin = { x: e.pos.x + Math.sin(yaw) * ahead, z: e.pos.z + Math.cos(yaw) * ahead };
  const shotId = ctx.nextShotId();
  const yaws: number[] = [];
  const lens: number[] = [];
  const instant: { t: Entity; d: number; pellet: number }[] = [];
  for (let i = 0; i < pr.pellets; i++) {
    const fan = pr.pellets > 1 ? (i / (pr.pellets - 1) - 0.5) * pr.spread * DEG : 0;
    const jitter = pr.jitter > 0 ? ctx.rng.range(-1, 1) * pr.jitter * DEG : 0;
    const py = yaw + fan + jitter;
    const dir = { x: Math.sin(py), z: Math.cos(py) };
    const stopAt = wallDistance(ctx, origin, dir, pr.range);
    let len = stopAt;
    if (pr.speed <= 0) {
      // Hitscan: everything on the line up to the wall, nearest first.
      const bodies = bodiesOnRay(ctx, e, origin, dir, 0, stopAt, pr.radius, []);
      for (const [n, b] of bodies.entries()) {
        instant.push({ t: b.t, d: b.d, pellet: i });
        if (n >= pr.pierce) {
          len = b.d;
          break;
        }
      }
    } else {
      if (ctx.projectiles.length >= MAX_PROJECTILES) ctx.projectiles.shift();
      ctx.projectiles.push({
        shotId,
        pellet: i,
        ownerId: e.id,
        rangedId: def.id,
        origin,
        dir,
        travelled: 0,
        stopAt,
        speedPerTick: pr.speed / TICK_RATE,
        pierceLeft: pr.pierce,
        hitIds: [],
      });
    }
    yaws.push(round(py, 1000));
    lens.push(round(len, 100));
  }
  ctx.emit({
    type: 'SHOT',
    sourceId: e.id,
    rangedId: def.id,
    shotId,
    origin: { x: round(origin.x, 100), z: round(origin.z, 100) },
    yaws,
    lens,
  });
  for (const h of instant) if (h.t.life.alive) hit(ctx, e, h.t, def, h.d, origin, shotId, h.pellet);

  if (def.magazine > 0) ws.ammo = Math.max(0, ws.ammo - 1);
  t.lastShotTick = ctx.tick;
  t.raisedUntil = ctx.tick + secondsToTicks(def.holdAim);
  e.combat.lastCombatTick = ctx.tick;
  if (def.heat) {
    const heat = heatAt(def, ws, ctx.tick) + def.heat.perShot;
    ws.lastShotTick = ctx.tick;
    if (heat >= 1 - 1e-6) {
      ws.overheatUntil = ctx.tick + secondsToTicks(def.heat.overheatSeconds);
      ws.heat = 0;
      ws.heatTick = ws.overheatUntil;
      t.burstLeft = 0;
      t.queued = false;
      ctx.emit({ type: 'OVERHEAT', sourceId: e.id, endTick: ws.overheatUntil });
    } else {
      ws.heat = heat;
      ws.heatTick = ctx.tick;
    }
  }
}

/**
 * Where to shoot: the aim point (desktop cursor), else the sticky / chosen
 * target, else a new hostile inside the assist cone around the held direction
 * (or facing), else straight along it. `retarget` lets a shot pick a new target.
 */
function aimYaw(
  ctx: SimContext,
  e: Entity,
  def: RangedDef,
  t: TriggerState,
  point: Vec2 | null,
  retarget: boolean,
): number {
  if (point && Math.hypot(point.x - e.pos.x, point.z - e.pos.z) > 0.3)
    return yawOf(sub(point, e.pos));
  const range = def.projectile.range;
  const sticky = t.assistId !== null ? ctx.entities.get(t.assistId) : undefined;
  if (isAlive(sticky) && areHostile(e, sticky) && edgeDistance(e, sticky) <= range * STICKY_RANGE)
    return yawOf(sub(sticky.pos, e.pos));
  t.assistId = null;
  const around = e.movement.dir ? yawOf(e.movement.dir) : e.yaw;
  if (!retarget) return around;
  let best: Entity | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const o of ctx.entities.values()) {
    if (o === e || o.inert || !o.life.alive || !areHostile(e, o)) continue;
    const d = edgeDistance(e, o);
    if (d > range) continue;
    let diff = Math.abs(yawOf(sub(o.pos, e.pos)) - around) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > def.assistAngle * DEG) continue;
    // Prefer close and centred.
    const score = d + diff * 4;
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  if (!best) return around;
  t.assistId = best.id;
  return yawOf(sub(best.pos, e.pos));
}

// ---- Reload -----------------------------------------------------------------

function startReload(
  ctx: SimContext,
  e: Entity,
  w: Equipped,
  ws: WeaponState,
  t: TriggerState,
): void {
  const r = w.def.reload;
  if (!r || w.def.magazine === 0 || ws.ammo >= w.def.magazine || t.reload) return;
  const per = secondsToTicks(r.seconds);
  const rounds = r.mode === 'round' ? w.def.magazine - ws.ammo : 1;
  t.reload = {
    instanceId: w.instanceId,
    startTick: ctx.tick,
    endTick: ctx.tick + per * rounds,
    nextTick: ctx.tick + per,
  };
  t.burstLeft = 0;
  ctx.emit({ type: 'RELOAD', sourceId: e.id, startTick: ctx.tick, endTick: t.reload.endTick });
}

/** Stops a reload early; clients see it as endTick === startTick. */
function cancelReload(ctx: SimContext, e: Entity, t: TriggerState): void {
  const r = t.reload;
  if (!r) return;
  t.reload = null;
  ctx.emit({ type: 'RELOAD', sourceId: e.id, startTick: r.startTick, endTick: r.startTick });
}

function advanceReload(ctx: SimContext, w: Equipped, ws: WeaponState, t: TriggerState): void {
  const r = t.reload;
  if (!r || ctx.tick < r.nextTick) return;
  const def = w.def;
  if (def.reload?.mode === 'round') {
    ws.ammo = Math.min(def.magazine, ws.ammo + 1);
    if (ws.ammo < def.magazine) {
      r.nextTick += secondsToTicks(def.reload.seconds);
      return;
    }
  } else ws.ammo = def.magazine;
  t.reload = null;
}

// ---- Bullets ----------------------------------------------------------------

/** Distance along a ray to the first circle obstacle or the map edge (≤ `range`). */
function wallDistance(ctx: SimContext, o: Vec2, dir: Vec2, range: number): number {
  let best = range;
  for (const ob of ctx.obstacles) {
    const vx = ob.pos.x - o.x;
    const vz = ob.pos.z - o.z;
    const along = vx * dir.x + vz * dir.z;
    if (along <= 0 || along - ob.radius > best) continue;
    const perp = Math.abs(vx * dir.z - vz * dir.x);
    if (perp >= ob.radius) continue;
    const d = along - Math.sqrt(ob.radius * ob.radius - perp * perp);
    // A muzzle already inside a blocker (hugging a wall) shoots out of it.
    if (d >= 0 && d < best) best = d;
  }
  const b = ctx.bounds;
  if (dir.x > 1e-6) best = Math.min(best, (b.max.x - o.x) / dir.x);
  else if (dir.x < -1e-6) best = Math.min(best, (b.min.x - o.x) / dir.x);
  if (dir.z > 1e-6) best = Math.min(best, (b.max.z - o.z) / dir.z);
  else if (dir.z < -1e-6) best = Math.min(best, (b.min.z - o.z) / dir.z);
  return Math.max(0, best);
}

/** Hostile bodies a ray segment [from, to] touches, nearest first (d = entry distance). */
function bodiesOnRay(
  ctx: SimContext,
  e: Entity,
  o: Vec2,
  dir: Vec2,
  from: number,
  to: number,
  radius: number,
  skip: readonly EntityId[],
): { t: Entity; d: number }[] {
  const out: { t: Entity; d: number }[] = [];
  for (const t of ctx.entities.values()) {
    if (t === e || t.inert || !t.life.alive || !areHostile(e, t) || skip.includes(t.id)) continue;
    const vx = t.pos.x - o.x;
    const vz = t.pos.z - o.z;
    const r = t.movement.radius + radius;
    const along = vx * dir.x + vz * dir.z;
    if (along + r < from || along - r > to) continue;
    const perp = Math.abs(vx * dir.z - vz * dir.x);
    if (perp > r) continue;
    const half = Math.sqrt(r * r - perp * perp);
    if (along + half < from) continue;
    const d = Math.max(from, along - half);
    if (d > to) continue;
    out.push({ t, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

function stepProjectiles(ctx: SimContext): void {
  const list = ctx.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    if (!b) continue;
    const owner = ctx.entities.get(b.ownerId);
    const def = ctx.content.ranged.get(b.rangedId);
    let done = !owner || !def;
    if (owner && def) {
      const from = b.travelled;
      const to = Math.min(b.stopAt, from + b.speedPerTick);
      for (const h of bodiesOnRay(
        ctx,
        owner,
        b.origin,
        b.dir,
        from,
        to,
        def.projectile.radius,
        b.hitIds,
      )) {
        hit(ctx, owner, h.t, def, h.d, b.origin, b.shotId, b.pellet);
        b.hitIds.push(h.t.id);
        if (b.pierceLeft-- <= 0) {
          done = true;
          break;
        }
      }
      b.travelled = to;
      if (to >= b.stopAt) done = true;
    }
    if (done) {
      list[i] = list[list.length - 1] as (typeof list)[number];
      list.pop();
    }
  }
}

function hit(
  ctx: SimContext,
  e: Entity,
  t: Entity,
  def: RangedDef,
  d: number,
  origin: Vec2,
  shotId: number,
  pellet: number,
): void {
  const range = def.projectile.range;
  let multiplier = def.damage;
  let kind: 'solid' | 'graze' | 'weak' = 'solid';
  const fall = def.falloffFrom * range;
  if (d > fall && range > fall) {
    const k = clamp((d - fall) / (range - fall), 0, 1);
    multiplier *= 1 + (def.falloffMultiplier - 1) * k;
    if (k > 0.5) kind = 'graze';
  }
  // Yếu hại: shots landing on the target's back / flank.
  const back = facingDot(t, origin);
  if (back < -0.5) {
    multiplier *= def.weakPoint.back;
    kind = 'weak';
  } else if (back < 0.26) {
    multiplier *= def.weakPoint.flank;
    if (kind === 'solid') kind = 'weak';
  }
  const { amount, crit } = rollHit(ctx, e, t, multiplier, 0, def.critBonus);
  applyDamage(ctx, e, t, amount, crit, null, {
    hit: kind,
    heavy: false,
    shot: { id: shotId, pellet },
  });
}

// ---- View -------------------------------------------------------------------

/** Private HUD state of the equipped ranged weapon (PlayerState.ranged). */
export function rangedState(ctx: SimContext, e: Entity): PlayerState['ranged'] {
  const p = e.player;
  const w = p?.ranged;
  if (!p || !w) return null;
  const ws = p.weapons.get(w.instanceId);
  const r = p.trigger.reload;
  return {
    rangedId: w.def.id,
    ammo: ws?.ammo ?? w.def.magazine,
    magazine: w.def.magazine,
    heat: ws ? round(heatAt(w.def, ws, ctx.tick), 100) : 0,
    overheatEndTick: ws?.overheatUntil ?? 0,
    reloadStartTick: r?.startTick ?? 0,
    reloadEndTick: r?.endTick ?? 0,
  };
}
