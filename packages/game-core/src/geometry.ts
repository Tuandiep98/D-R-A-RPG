import type { SimContext } from './context';
import type { Entity } from './entity';
import { clamp, clampToBounds, distance, type Vec2 } from './math';

export function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const k = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / Math.max(1e-9, dx * dx + dz * dz), 0, 1);
  return Math.hypot(p.x - a.x - k * dx, p.z - a.z - k * dz);
}
export function clearLine(ctx: SimContext, a: Vec2, b: Vec2, radius = 0): boolean {
  return !ctx.obstacles.some((o) => segmentDistance(o.pos, a, b) < o.radius + radius);
}
export function coneTouches(
  origin: Vec2,
  yaw: number,
  reach: number,
  arc: number,
  target: Entity,
  sourceRadius = 0,
): boolean {
  const dx = target.pos.x - origin.x,
    dz = target.pos.z - origin.z;
  const d = Math.hypot(dx, dz);
  if (d - sourceRadius - target.movement.radius > reach) return false;
  if (arc >= 360 || d < 1e-6) return true;
  const angle = Math.acos(clamp((dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d, -1, 1));
  return angle <= (arc * Math.PI) / 360 + Math.atan2(target.movement.radius, d);
}
/** Bounded route samples, shared by blink, roll and attack traversal. */
export function travel(ctx: SimContext, e: Entity, dir: Vec2, metres: number): void {
  const steps = Math.ceil(metres / 0.2);
  if (!steps) return;
  const step = metres / steps;
  for (let i = 0; i < steps; i++) {
    const next = clampToBounds(
      { x: e.pos.x + dir.x * step, z: e.pos.z + dir.z * step },
      ctx.bounds,
      e.movement.radius,
    );
    const p = ctx.nav ? ctx.nav.closest(next) : next;
    if (
      distance(p, next) > 0.18 ||
      distance(p, e.pos) > step * 1.5 ||
      !clearLine(ctx, e.pos, p, e.movement.radius)
    )
      break;
    e.pos = { ...p };
    e.movement.moved = true;
  }
}

/** First contact fraction on a swept segment; null means no intersection. */
export function segmentEntry(center: Vec2, a: Vec2, b: Vec2, radius: number): number | null {
  const x = a.x - center.x,
    z = a.z - center.z,
    dx = b.x - a.x,
    dz = b.z - a.z;
  const c = x * x + z * z - radius * radius;
  if (c <= 0) return 0;
  const aa = dx * dx + dz * dz;
  if (aa < 1e-12) return null;
  const bb = x * dx + z * dz,
    disc = bb * bb - aa * c;
  if (disc < 0) return null;
  const t = (-bb - Math.sqrt(disc)) / aa;
  return t >= 0 && t <= 1 ? t : null;
}
