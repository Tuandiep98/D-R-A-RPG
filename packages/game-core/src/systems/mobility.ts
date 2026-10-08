import type { SimContext } from '../context';
import type { Entity } from '../entity';
import { travel } from '../geometry';
import type { Vec2 } from '../math';
import { secondsToTicks, TICK_RATE } from '../time';
import { beginAction, cancelAction } from './action-timeline';

export function requestMobility(
  ctx: SimContext,
  e: Entity,
  action: 'roll' | 'blink' | 'jump',
  point: Vec2 | null = null,
): boolean {
  const skill = [...ctx.content.skills.values()].find((s) => s.mobility === action);
  const p = e.player;
  if (!p || !e.life.alive || !skill || e.mobility) return false;
  if (ctx.tick < (p.mobilityReady.get(action) ?? 0)) {
    ctx.notice(e.id, 'cooldown');
    return false;
  }
  const raw = point
    ? { x: point.x - e.pos.x, z: point.z - e.pos.z }
    : (e.movement.dir ?? { x: Math.sin(e.yaw), z: Math.cos(e.yaw) });
  const len = Math.hypot(raw.x, raw.z);
  if (len < 1e-6) return false;
  const dir = { x: raw.x / len, z: raw.z / len };
  if (!cancelAction(ctx, e)) return false;
  const metres = Math.max(0, ...skill.effects.map((f) => (f.type === 'dash' ? f.distance : 0)));
  const duration = secondsToTicks(skill.duration);
  p.mobilityReady.set(action, ctx.tick + secondsToTicks(skill.cooldown));
  e.actionBuffer = null;
  e.cast = null;
  e.swing = null;
  e.pending = null;
  p.combo.buffered = false;
  e.combat.targetId = null;
  e.movement.goal = null;
  e.movement.path = null;
  p.trigger.held = false;
  p.trigger.queued = false;
  p.trigger.burstLeft = 0;
  e.yaw = Math.atan2(dir.x, dir.z);
  const timeline = beginAction(ctx, e, 'mobility', {
    windup: 0,
    active: skill.duration,
    recovery: 0,
    cancelWindup: false,
  });
  e.mobility = {
    actionId: timeline.id,
    action,
    startTick: ctx.tick,
    endTick: ctx.tick + duration,
    distanceLeft: action === 'blink' && point ? Math.min(metres, len) : metres,
    dir,
    dodgeFrom: ctx.tick + Math.round(skill.dodgeWindow[0] * TICK_RATE),
    dodgeTo: ctx.tick + Math.round(skill.dodgeWindow[1] * TICK_RATE),
  };
  ctx.emit({
    type: 'CAST_START',
    actionId: timeline.id,
    sourceId: e.id,
    skillId: skill.id,
    targetId: null,
    point: { ...e.pos },
    radius: 0,
    telegraph: false,
    endTick: ctx.tick + duration,
    element: e.element ?? null,
    expression: e.expression ?? 'base',
  });
  return true;
}
export function mobilitySystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    const m = e.mobility;
    if (!m) continue;
    if (!e.life.alive) {
      e.mobility = null;
      continue;
    }
    if (m.distanceLeft > 0) {
      const metres =
        m.action === 'blink' ? m.distanceLeft : m.distanceLeft / Math.max(1, m.endTick - ctx.tick);
      travel(ctx, e, m.dir, metres);
      m.distanceLeft = Math.max(0, m.distanceLeft - metres);
    }
  }
  mobilityFinishSystem(ctx);
}

/** Releases the exclusive payload before processing this tick's buffered input. */
export function mobilityFinishSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    const m = e.mobility;
    if (m && m.distanceLeft <= 0 && ctx.tick >= m.endTick) {
      const skill = [...ctx.content.skills.values()].find((s) => s.mobility === m.action);
      if (skill)
        ctx.emit({
          type: 'SKILL_IMPACT',
          actionId: m.actionId,
          sourceId: e.id,
          skillId: skill.id,
          point: { ...e.pos },
          radius: 0,
          targetId: null,
          element: e.element ?? null,
          expression: e.expression ?? 'base',
        });
      e.mobility = null;
    }
  }
}
export function avoidsDamage(ctx: SimContext, e: Entity, groundLow = false): boolean {
  const m = e.mobility;
  if (!m) return false;
  return (
    ctx.tick >= m.dodgeFrom &&
    ctx.tick < m.dodgeTo &&
    (m.action === 'roll' || (m.action === 'jump' && groundLow))
  );
}
