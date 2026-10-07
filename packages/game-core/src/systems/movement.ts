import type { SimContext } from "../context";
import type { Entity } from "../entity";
import { clampToBounds, distance, type Vec2, yawOf } from "../math";
import { TICK_DT } from "../time";

const ARRIVE_EPSILON = 1e-3;
const WAYPOINT_REACHED = 0.15;
/** Re-plan when the goal (e.g. a chased target) moved this far. */
const REPATH_DISTANCE = 0.75;
/** And at most this often while chasing. */
const REPATH_TICKS = 6;

/**
 * Moves toward the current goal. With a NavQuery the entity follows a
 * navmesh path (decision D-008); without one it walks straight. Circle
 * collision against static obstacles and other bodies runs either way.
 */
export function movementSystem(ctx: SimContext): void {
  const bodies: Entity[] = [];
  for (const e of ctx.entities.values()) {
    e.movement.moved = false;
    if (e.inert || !e.life.alive) continue;
    bodies.push(e);

    if (e.movement.dir) {
      // Direct control wins over goals (chase, queued casts); casting roots.
      e.movement.path = null;
      if (!e.cast) steer(ctx, e, e.movement.dir);
      continue;
    }

    const goal = e.movement.goal;
    if (!goal) {
      e.movement.path = null;
      continue;
    }
    if (ctx.nav) updatePath(ctx, e);

    let budget = e.movement.speed * moveFactor(e) * TICK_DT;
    while (budget > 1e-6) {
      const path = e.movement.path;
      const isFinal = !path || path.length <= 1;
      const wp = path?.[0] ?? goal.pos;
      const stop = isFinal ? goal.stopWithin : 0;
      const dx = wp.x - e.pos.x;
      const dz = wp.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const remaining = dist - stop;
      if (remaining <= (isFinal ? ARRIVE_EPSILON : WAYPOINT_REACHED)) {
        if (isFinal) {
          e.movement.goal = null;
          e.movement.path = null;
          break;
        }
        path?.shift();
        continue;
      }
      const step = Math.min(remaining, budget);
      e.pos.x += (dx / dist) * step;
      e.pos.z += (dz / dist) * step;
      // A swing / raised weapon keeps its facing; walking only drifts the body (D-031).
      if (!faceLocked(ctx, e)) e.yaw = yawOf({ x: dx, z: dz });
      e.movement.moved = true;
      budget -= step;
      if (step >= remaining) {
        if (isFinal) {
          e.movement.goal = null;
          e.movement.path = null;
          break;
        }
        path?.shift();
      }
    }
  }

  separateBodies(bodies);
  for (const e of bodies) resolveStatic(ctx, e);
}

/** Walk speed factor while swinging, shooting or reloading. */
const moveFactor = (e: Entity): number =>
  e.swing ? e.swing.variant.moveMultiplier : (e.player?.trigger.move ?? 1);

/** Swings and a raised ranged weapon (systems/ranged.ts) own the facing. */
const faceLocked = (ctx: SimContext, e: Entity): boolean =>
  e.swing !== null ||
  (!!e.player?.ranged && ctx.tick < e.player.trigger.raisedUntil);

/** One tick along a held direction; on a navmesh the step slides along edges. */
function steer(ctx: SimContext, e: Entity, dir: Vec2): void {
  const step = e.movement.speed * moveFactor(e) * TICK_DT;
  if (!faceLocked(ctx, e)) e.yaw = yawOf(dir);
  const next = { x: e.pos.x + dir.x * step, z: e.pos.z + dir.z * step };
  const p = ctx.nav ? ctx.nav.closest(next) : next;
  const moved = distance(p, e.pos);
  // closest() can snap across a gap to another island; never teleport.
  if (moved < 1e-4 || moved > step * 1.5) return;
  e.pos.x = p.x;
  e.pos.z = p.z;
  e.movement.moved = true;
}

function updatePath(ctx: SimContext, e: Entity): void {
  const m = e.movement;
  const goal = m.goal;
  if (!goal || !ctx.nav) return;
  const stale =
    !m.path ||
    !m.pathGoal ||
    (distance(m.pathGoal, goal.pos) > REPATH_DISTANCE &&
      ctx.tick - m.pathTick >= REPATH_TICKS);
  if (!stale) return;
  m.pathGoal = { ...goal.pos };
  m.pathTick = ctx.tick;
  const path = ctx.nav.findPath(e.pos, goal.pos);
  // Unreachable: fall back to walking straight; collision keeps us out of blockers.
  m.path = path && path.length > 0 ? path : null;
}

function resolveStatic(ctx: SimContext, e: Entity): void {
  for (const o of ctx.obstacles) {
    const min = o.radius + e.movement.radius;
    const d = distance(e.pos, o.pos);
    if (d >= min) continue;
    if (d < 1e-6) {
      e.pos.x = o.pos.x + min;
      continue;
    }
    const k = min / d;
    e.pos.x = o.pos.x + (e.pos.x - o.pos.x) * k;
    e.pos.z = o.pos.z + (e.pos.z - o.pos.z) * k;
  }
  const clamped = clampToBounds(e.pos, ctx.bounds, e.movement.radius);
  e.pos.x = clamped.x;
  e.pos.z = clamped.z;
}

/** Pushes overlapping bodies apart equally. O(n²) is fine within the entity budget (<100). */
function separateBodies(bodies: Entity[]): void {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i] as Entity;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j] as Entity;
      const min = a.movement.radius + b.movement.radius;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= min || d < 1e-6) continue;
      const push = (min - d) / 2 / d;
      a.pos.x -= dx * push;
      a.pos.z -= dz * push;
      b.pos.x += dx * push;
      b.pos.z += dz * push;
    }
  }
}
