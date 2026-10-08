import type { DamageSpec, SkillDef } from '@rpg/game-data';
import type { EntityId } from '@rpg/game-protocol';
import { areHostile, edgeDistance, isAlive, type SimContext } from '../context';
import type { Entity } from '../entity';
import { clearLine, coneTouches, segmentEntry, travel } from '../geometry';
import { distance, sub, type Vec2, yawOf } from '../math';
import { secondsToTicks, TICK_RATE } from '../time';
import { beginAction, cancelAction, currentAction } from './action-timeline';
import { applyDamage, captureDamageSource, rollHit } from './combat';
import { requestMobility } from './mobility';

export const effectRadius = (skill: SkillDef): number =>
  Math.max(0, ...skill.effects.map((e) => (e.type === 'damage' ? e.radius : 0)));

function damageSpecs(ctx: SimContext, skill: SkillDef): DamageSpec[] {
  return skill.effects.flatMap((effect) =>
    effect.type === 'damage'
      ? [
          {
            multiplier: effect.multiplier,
            flat: effect.flat,
            critBonus: effect.critBonus,
            canCrit: effect.canCrit,
            elementalShare:
              effect.elementalShare ??
              skill.elementalShare ??
              ctx.content.combat.get('combat_rules')?.skillShare ??
              0,
          },
        ]
      : [],
  );
}

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
  if (skill.id === 'skill_thunder_step') return requestMobility(ctx, e, 'roll', point);
  if (skill.mobility) return requestMobility(ctx, e, skill.mobility, point);
  if (e.cast || e.mobility) return false;
  if (skill.delivery === 'projectile' && ctx.skillProjectiles.length >= 128) return false;
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
  if (currentAction(ctx, e) && !cancelAction(ctx, e)) return false;

  if (!castInRange(e, skill, target, aim)) {
    // Walk into range first, like an auto-attack approach.
    e.pending = {
      type: 'cast',
      expiresTick:
        ctx.tick + secondsToTicks(ctx.content.combat.get('combat_rules')?.bufferSeconds ?? 0.2),
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
  e.actionBuffer = null;
  e.swing = null;
  if (e.player) e.player.combo.buffered = false;
  e.stats.mp -= skill.mpCost;
  e.skills.set(skill.id, ctx.tick + secondsToTicks(skill.cooldown));
  e.movement.goal = null;
  e.movement.path = null;
  if (skill.effects.some((effect) => effect.type === 'dash')) e.combat.targetId = null;
  if (aim) e.yaw = yawOf(sub(aim, e.pos));
  else if (skill.effects.some((f) => f.type === 'dash') && e.movement.dir)
    e.yaw = yawOf(e.movement.dir);
  const castTicks = skill.castTime > 0 ? secondsToTicks(skill.castTime) : 0;
  const timing = skill.timeline ?? {
    windup: castTicks / TICK_RATE,
    active: 0,
    recovery: 0,
    cancelWindup: true,
  };
  const action = beginAction(ctx, e, 'skill', timing);
  const travelLeft = Math.max(0, ...skill.effects.map((f) => (f.type === 'dash' ? f.distance : 0)));
  const point = skill.targeting === 'self' ? { ...e.pos } : aim;
  e.cast = {
    yaw: action.yaw,
    travelLeft,
    source: captureDamageSource(ctx, e),
    skillId: skill.id,
    targetId: target?.id ?? null,
    point,
    startTick: ctx.tick,
    endTick: travelLeft > 0 ? action.activeEndTick : action.activeStartTick,
  };
  e.combat.lastCombatTick = ctx.tick;
  ctx.emit({
    type: 'CAST_START',
    actionId: action.id,
    element: e.element ?? null,
    expression: e.expression ?? 'base',
    sourceId: e.id,
    skillId: skill.id,
    targetId: target?.id ?? null,
    point: point ? { ...point } : null,
    radius: effectRadius(skill),
    telegraph: skill.telegraph,
    endTick: e.cast.endTick,
  });
}

/** Travel is applied before the single collision pass, with direction locked at commitment. */
export function skillMovementSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    const cast = e.cast;
    const action = e.actionState;
    if (
      !e.life.alive ||
      !cast ||
      !action ||
      cast.travelLeft <= 0 ||
      ctx.tick < action.activeStartTick
    )
      continue;
    const metres = cast.travelLeft / Math.max(1, action.activeEndTick - ctx.tick);
    travel(ctx, e, { x: Math.sin(cast.yaw), z: Math.cos(cast.yaw) }, metres);
    cast.travelLeft = Math.max(0, cast.travelLeft - metres);
  }
}

/** Revalidates bounded approach requests before any movement or collision. */
export function skillPreparationSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    if (e.inert || !e.life.alive) continue;

    if (e.pending?.type === 'cast' && !e.cast && !e.mobility && !currentAction(ctx, e)) {
      const pending = e.pending;
      if (ctx.tick > pending.expiresTick) {
        e.pending = null;
        e.movement.goal = null;
        e.movement.path = null;
        if (e.combat.targetId === pending.targetId) e.combat.targetId = null;
        continue;
      }
      const skill = ctx.content.skills.get(pending.skillId);
      const target = pending.targetId !== null ? ctx.entities.get(pending.targetId) : undefined;
      if (!skill || (pending.targetId !== null && !isAlive(target))) {
        e.pending = null;
      } else {
        const aim = target && skill.targeting === 'point' ? { ...target.pos } : pending.point;
        if (castInRange(e, skill, target ?? null, aim)) {
          e.pending = null;
          requestCast(ctx, e, skill.id, target?.id ?? null, aim);
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
  }
}

/** Resolves damage only after all movement for this tick. */
export function skillSystem(ctx: SimContext): void {
  advanceSkillProjectiles(ctx);
  for (const e of ctx.entities.values()) {
    if (!e.inert && e.life.alive && e.cast && ctx.tick >= e.cast.endTick) resolveCast(ctx, e);
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

  const impactPoint = skill.targeting === 'self' ? { ...e.pos } : point;
  if (skill.delivery !== 'projectile')
    ctx.emit({
      type: 'SKILL_IMPACT',
      actionId: cast.source.actionId ?? null,
      element: cast.source.element,
      expression: cast.source.expression,
      sourceId: e.id,
      skillId: skill.id,
      point: impactPoint,
      radius: effectRadius(skill),
      targetId: target?.id ?? null,
    });

  const damages = damageSpecs(ctx, skill);
  if (skill.delivery === 'projectile' && damages.length > 0) {
    const dx = point.x - e.pos.x,
      dz = point.z - e.pos.z;
    const len = Math.hypot(dx, dz);
    const dir =
      len > 1e-6 ? { x: dx / len, z: dz / len } : { x: Math.sin(e.yaw), z: Math.cos(e.yaw) };
    const id = ctx.nextShotId();
    ctx.skillProjectiles.push({
      source: cast.source,
      damages,
      id,
      ownerId: e.id,
      skillId: skill.id,
      pos: { ...e.pos },
      origin: { ...e.pos },
      dir,
      left: skill.range,
    });
    ctx.emit({
      type: 'SKILL_PROJECTILE',
      actionId: cast.source.actionId ?? null,
      sourceId: e.id,
      skillId: skill.id,
      projectileId: id,
      origin: { ...e.pos },
      destination: { x: e.pos.x + dir.x * skill.range, z: e.pos.z + dir.z * skill.range },
      speed: skill.projectileSpeed,
      element: cast.source.element,
      expression: cast.source.expression,
    });
  }

  let damageIndex = 0;
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
    const spec = damages[damageIndex++];
    if (skill.delivery === 'projectile') continue;
    const victims: Entity[] = [];
    if (skill.delivery === 'cone') {
      for (const other of ctx.entities.values()) {
        if (
          isAlive(other) &&
          areHostile(e, other) &&
          coneTouches(e.pos, cast.yaw, skill.range, skill.arc, other, e.movement.radius)
        )
          victims.push(other);
      }
    } else if (effect.radius > 0) {
      for (const other of ctx.entities.values()) {
        if (!isAlive(other) || !areHostile(e, other)) continue;
        if (distance(other.pos, impactPoint) <= effect.radius + other.movement.radius)
          victims.push(other);
      }
    } else if (isAlive(target) && edgeDistance(e, target) <= skill.range) {
      victims.push(target);
    }
    for (const v of victims) {
      if (skill.blockedByWalls) {
        const centre = skill.delivery === 'cone' || effect.radius === 0 ? e.pos : impactPoint;
        if (
          !clearLine(ctx, centre, v.pos) ||
          (skill.delivery !== 'cone' && effect.radius > 0 && !clearLine(ctx, e.pos, impactPoint))
        )
          continue;
      }
      const roll = rollHit(ctx, e, v, spec, {}, cast.source);
      applyDamage(ctx, e, v, roll.amount, roll.crit, skill.id, {
        hit: 'solid',
        heavy: false,
        groundLow: skill.groundLow,
        source: cast.source,
      });
    }
  }
  // Keep fighting what we just hit.
  if (isAlive(target) && areHostile(e, target)) e.combat.targetId = target.id;
}

function advanceSkillProjectiles(ctx: SimContext): void {
  for (let i = ctx.skillProjectiles.length - 1; i >= 0; i--) {
    const b = ctx.skillProjectiles[i];
    if (!b) continue;
    const owner = ctx.entities.get(b.ownerId),
      skill = ctx.content.skills.get(b.skillId);
    let done = !owner || !skill;
    if (owner && skill) {
      const step = Math.min(b.left, skill.projectileSpeed / TICK_RATE);
      const next = { x: b.pos.x + b.dir.x * step, z: b.pos.z + b.dir.z * step };
      let wall = 1;
      if (skill.blockedByWalls)
        for (const o of ctx.obstacles) {
          const k = segmentEntry(o.pos, b.pos, next, o.radius + skill.projectileRadius);
          if (k !== null) wall = Math.min(wall, k);
        }
      const hits = [...ctx.entities.values()]
        .flatMap((t) => {
          if (!isAlive(t) || !areHostile(owner, t)) return [];
          const prev = t.previousPos ?? t.pos;
          const k = segmentEntry(
            { x: 0, z: 0 },
            { x: b.pos.x - prev.x, z: b.pos.z - prev.z },
            { x: next.x - t.pos.x, z: next.z - t.pos.z },
            t.movement.radius + skill.projectileRadius,
          );
          return k !== null && k < wall ? [{ target: t, k }] : [];
        })
        .sort((a, c) => a.k - c.k);
      const first = hits[0];
      if (first) {
        const target = first.target;
        const contact = {
          x: b.pos.x + (next.x - b.pos.x) * first.k,
          z: b.pos.z + (next.z - b.pos.z) * first.k,
        };
        for (const spec of b.damages) {
          const roll = rollHit(ctx, owner, target, spec, {}, b.source);
          applyDamage(ctx, owner, target, roll.amount, roll.crit, skill.id, {
            hit: 'solid',
            heavy: false,
            groundLow: skill.groundLow,
            source: b.source,
          });
        }
        ctx.emit({
          type: 'SKILL_IMPACT',
          actionId: b.source.actionId ?? null,
          projectileId: b.id,
          sourceId: owner.id,
          skillId: skill.id,
          point: contact,
          radius: 0,
          targetId: target.id,
          element: b.source.element,
          expression: b.source.expression,
        });
        done = true;
      } else if (wall < 1) {
        const contact = {
          x: b.pos.x + (next.x - b.pos.x) * wall,
          z: b.pos.z + (next.z - b.pos.z) * wall,
        };
        ctx.emit({
          type: 'SKILL_IMPACT',
          actionId: b.source.actionId ?? null,
          projectileId: b.id,
          sourceId: owner.id,
          skillId: skill.id,
          point: contact,
          radius: 0,
          targetId: null,
          element: b.source.element,
          expression: b.source.expression,
        });
        done = true;
      }
      b.pos = next;
      b.left -= step;
      if (
        b.left <= 0 ||
        next.x < ctx.bounds.min.x ||
        next.x > ctx.bounds.max.x ||
        next.z < ctx.bounds.min.z ||
        next.z > ctx.bounds.max.z
      )
        done = true;
    }
    if (done) ctx.skillProjectiles.splice(i, 1);
  }
}
