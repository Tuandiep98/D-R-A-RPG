import type { SkillDef } from '@rpg/game-data';
import type { EntityId } from '@rpg/game-protocol';
import { areHostile, edgeDistance, isAlive, type SimContext } from '../context';
import type { Entity } from '../entity';
import { clampToBounds, distance, sub, type Vec2, yawOf } from '../math';
import { secondsToTicks } from '../time';
import { applyDamage, rollHit } from './combat';

export const effectRadius = (skill: SkillDef): number =>
  Math.max(0, ...skill.effects.map((e) => (e.type === 'damage' ? e.radius : 0)));

/**
 * Validates and starts (or queues) a cast. Server authoritative: cooldowns,
 * MP and range are checked here, never trusted from the client.
 */
export function requestCast(
  ctx: SimContext,
  e: Entity,
  skillId: string,
  targetId: EntityId | null,
  point: Vec2 | null,
): boolean {
  const skill = ctx.content.skills.get(skillId);
  const readyAt = e.skills.get(skillId);
  if (!skill || readyAt === undefined || !e.life.alive) {
    ctx.notice(e.id, 'invalid');
    return false;
  }
  if (e.cast) return false;
  if (ctx.tick < readyAt) {
    ctx.notice(e.id, 'cooldown');
    return false;
  }
  if (e.stats.mp < skill.mpCost) {
    ctx.notice(e.id, 'no_mp');
    return false;
  }

  let target: Entity | null = null;
  if (skill.targeting === 'target' || (skill.targeting === 'point' && !point)) {
    const id = targetId ?? e.combat.targetId;
    const t = id !== null ? ctx.entities.get(id) : undefined;
    if (!isAlive(t) || !areHostile(e, t)) {
      if (skill.targeting === 'target') {
        ctx.notice(e.id, 'no_target');
        return false;
      }
    } else target = t;
  }
  const aim = skill.targeting === 'self' ? null : (point ?? (target ? { ...target.pos } : null));
  if (skill.targeting === 'point' && !aim) {
    ctx.notice(e.id, 'no_target');
    return false;
  }

  if (!castInRange(e, skill, target, aim)) {
    // Walk into range first, like an auto-attack approach.
    e.pending = {
      type: 'cast',
      skillId,
      targetId: target?.id ?? null,
      point: aim,
    };
    if (target) e.combat.targetId = target.id;
    return true;
  }
  startCast(ctx, e, skill, target, aim);
  return true;
}

function castInRange(e: Entity, skill: SkillDef, target: Entity | null, aim: Vec2 | null): boolean {
  if (skill.targeting === 'self') return true;
  if (skill.targeting === 'target') return !!target && edgeDistance(e, target) <= skill.range;
  return !!aim && distance(e.pos, aim) <= skill.range + e.movement.radius;
}

function startCast(
  ctx: SimContext,
  e: Entity,
  skill: SkillDef,
  target: Entity | null,
  aim: Vec2 | null,
): void {
  e.pending = null;
  e.swing = null;
  if (e.player) e.player.combo.buffered = false;
  e.stats.mp -= skill.mpCost;
  e.skills.set(skill.id, ctx.tick + secondsToTicks(skill.cooldown));
  e.movement.goal = null;
  e.movement.path = null;
  if (skill.effects.some((effect) => effect.type === 'dash')) e.combat.targetId = null;
  if (aim) e.yaw = yawOf(sub(aim, e.pos));
  const castTicks = skill.castTime > 0 ? secondsToTicks(skill.castTime) : 0;
  const point = skill.targeting === 'self' ? { ...e.pos } : aim;
  e.cast = {
    skillId: skill.id,
    targetId: target?.id ?? null,
    point,
    startTick: ctx.tick,
    endTick: ctx.tick + castTicks,
  };
  e.combat.lastCombatTick = ctx.tick;
  ctx.emit({
    type: 'CAST_START',
    sourceId: e.id,
    skillId: skill.id,
    targetId: target?.id ?? null,
    point: point ? { ...point } : null,
    radius: effectRadius(skill),
    telegraph: skill.telegraph,
    endTick: ctx.tick + castTicks,
  });
  if (castTicks === 0) resolveCast(ctx, e);
}

/** Starts queued casts once in range and resolves casts whose time is up. */
export function skillSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    if (e.inert || !e.life.alive) continue;

    if (e.pending?.type === 'cast' && !e.cast) {
      const pending = e.pending;
      const skill = ctx.content.skills.get(pending.skillId);
      const target = pending.targetId !== null ? ctx.entities.get(pending.targetId) : undefined;
      if (!skill || (pending.targetId !== null && !isAlive(target))) {
        e.pending = null;
      } else {
        const aim = target && skill.targeting === 'point' ? { ...target.pos } : pending.point;
        if (castInRange(e, skill, target ?? null, aim)) {
          startCast(ctx, e, skill, target ?? null, aim);
        } else {
          const goalPos = target ? target.pos : aim;
          if (goalPos)
            e.movement.goal = {
              pos: { ...goalPos },
              stopWithin: Math.max(0.3, skill.range * 0.85),
            };
        }
      }
    }

    if (e.cast && ctx.tick >= e.cast.endTick) resolveCast(ctx, e);
  }
}

function resolveCast(ctx: SimContext, e: Entity): void {
  const cast = e.cast;
  e.cast = null;
  if (!cast) return;
  const skill = ctx.content.skills.get(cast.skillId);
  if (!skill) return;
  const point = cast.point ?? { ...e.pos };
  const target = cast.targetId !== null ? ctx.entities.get(cast.targetId) : undefined;

  for (const effect of skill.effects) {
    if (effect.type === 'dash') dash(ctx, e, effect.distance);
  }
  const impactPoint = skill.targeting === 'self' ? { ...e.pos } : point;
  ctx.emit({
    type: 'SKILL_IMPACT',
    sourceId: e.id,
    skillId: skill.id,
    point: impactPoint,
    radius: effectRadius(skill),
    targetId: target?.id ?? null,
  });

  for (const effect of skill.effects) {
    if (effect.type === 'dash') continue;
    if (effect.type === 'heal') {
      const amount = Math.min(
        e.stats.maxHp - e.stats.hp,
        Math.round(e.stats.maxHp * effect.fraction),
      );
      e.stats.hp += amount;
      ctx.emit({ type: 'HEAL', targetId: e.id, amount });
      continue;
    }
    const victims: Entity[] = [];
    if (effect.radius > 0) {
      for (const other of ctx.entities.values()) {
        if (!isAlive(other) || !areHostile(e, other)) continue;
        if (distance(other.pos, impactPoint) <= effect.radius + other.movement.radius)
          victims.push(other);
      }
    } else if (isAlive(target) && edgeDistance(e, target) <= skill.range * 1.5 + 1) {
      victims.push(target);
    }
    for (const v of victims) {
      const roll = rollHit(ctx, e, v, effect.multiplier, effect.flat);
      applyDamage(ctx, e, v, roll.amount, roll.crit, skill.id);
    }
  }
  // Keep fighting what we just hit.
  if (isAlive(target) && areHostile(e, target)) e.combat.targetId = target.id;
}

/** Short, bounded traversal; sample the whole route so a dash cannot cross walls or nav gaps. */
function dash(ctx: SimContext, e: Entity, metres: number): void {
  const dir = e.movement.dir ?? { x: Math.sin(e.yaw), z: Math.cos(e.yaw) };
  const length = Math.hypot(dir.x, dir.z);
  if (length < 1e-6) return;
  const dx = dir.x / length;
  const dz = dir.z / length;
  const steps = Math.ceil(metres / 0.25);
  const step = metres / steps;
  for (let i = 0; i < steps; i++) {
    const next = clampToBounds(
      { x: e.pos.x + dx * step, z: e.pos.z + dz * step },
      ctx.bounds,
      e.movement.radius,
    );
    const p = ctx.nav ? ctx.nav.closest(next) : next;
    if (distance(p, next) > 0.18 || distance(p, e.pos) > step * 1.5) break;
    if (ctx.obstacles.some((o) => distance(p, o.pos) < o.radius + e.movement.radius)) break;
    e.pos.x = p.x;
    e.pos.z = p.z;
  }
  e.yaw = yawOf(dir);
  e.movement.moved = true;
}
