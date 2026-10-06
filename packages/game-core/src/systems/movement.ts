import type { SimContext } from '../context';
import type { Entity } from '../entity';
import { clampToBounds, distance, yawOf } from '../math';
import { TICK_DT } from '../time';

const ARRIVE_EPSILON = 1e-3;

/**
 * Straight-line movement toward the current goal with circle collision
 * against static obstacles and other living bodies. NavMesh replaces the
 * straight line in M2 (see decision D-008).
 */
export function movementSystem(ctx: SimContext): void {
  const bodies: Entity[] = [];
  for (const e of ctx.entities.values()) {
    e.movement.moved = false;
    if (!e.life.alive) continue;
    bodies.push(e);

    const goal = e.movement.goal;
    if (!goal) continue;
    const dx = goal.pos.x - e.pos.x;
    const dz = goal.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    const remaining = dist - goal.stopWithin;
    if (remaining <= ARRIVE_EPSILON) {
      e.movement.goal = null;
      continue;
    }
    const maxStep = e.movement.speed * TICK_DT;
    const step = Math.min(remaining, maxStep);
    e.pos.x += (dx / dist) * step;
    e.pos.z += (dz / dist) * step;
    e.yaw = yawOf({ x: dx, z: dz });
    e.movement.moved = true;
    if (remaining <= maxStep) e.movement.goal = null;
  }

  separateBodies(bodies);
  for (const e of bodies) resolveStatic(ctx, e);
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

/** Pushes overlapping bodies apart equally. O(n²) is fine for the M1 budget (<100). */
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
