import { inAttackRange, isAlive, type SimContext } from '../context';
import type { Entity } from '../entity';
import { sub, yawOf } from '../math';
import type { Rng } from '../rng';

/** Damage roll before mitigation varies by ±10%. */
const VARIANCE = 0.1;
/** Each point of defense adds this much to the mitigation denominator. */
const DEFENSE_WEIGHT = 5;

export interface DamageRoll {
  amount: number;
  crit: boolean;
}

/** Pure damage formula; exported for tests and future server-side tooling. */
export function rollDamage(
  rng: Rng,
  attacker: Entity['stats'],
  defender: Entity['stats'],
): DamageRoll {
  const mitigation = 100 / (100 + defender.defense * DEFENSE_WEIGHT);
  const variance = 1 + rng.range(-VARIANCE, VARIANCE);
  const crit = rng.chance(attacker.critChance);
  const raw = attacker.attack * mitigation * variance * (crit ? attacker.critMultiplier : 1);
  return { amount: Math.max(1, Math.round(raw)), crit };
}

/**
 * For every entity with a combat target: close the distance, then swing on
 * cooldown. Runs before movement so a chase goal is followed in the same tick.
 */
export function combatSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    if (!e.life.alive || e.combat.targetId === null) continue;
    const target = ctx.entities.get(e.combat.targetId);
    if (!isAlive(target)) {
      e.combat.targetId = null;
      e.movement.goal = null;
      continue;
    }

    if (!inAttackRange(e, target)) {
      // Approach: stop a little inside range so we do not oscillate at the edge.
      const reach = e.combat.range + e.movement.radius + target.movement.radius;
      e.movement.goal = { pos: { ...target.pos }, stopWithin: Math.max(0.05, reach * 0.9) };
      continue;
    }

    e.movement.goal = null;
    e.yaw = yawOf(sub(target.pos, e.pos));
    if (ctx.tick < e.combat.nextAttackTick) continue;

    e.combat.nextAttackTick = ctx.tick + e.combat.attackIntervalTicks;
    ctx.emit({ type: 'ATTACK', sourceId: e.id, targetId: target.id });
    const { amount, crit } = rollDamage(ctx.rng, e.stats, target.stats);
    applyDamage(ctx, e, target, amount, crit);
  }
}

export function applyDamage(
  ctx: SimContext,
  source: Entity,
  target: Entity,
  amount: number,
  crit: boolean,
): void {
  const dealt = Math.min(amount, target.stats.hp);
  target.stats.hp -= dealt;
  target.life.lastAttackerId = source.id;
  ctx.emit({ type: 'DAMAGE', sourceId: source.id, targetId: target.id, amount: dealt, crit });
  if (target.stats.hp <= 0) kill(ctx, target, source);
}

function kill(ctx: SimContext, target: Entity, killer: Entity | null): void {
  target.life.alive = false;
  target.life.respawnAtTick = ctx.tick + target.life.respawnTicks;
  target.movement.goal = null;
  target.combat.targetId = null;
  ctx.emit({ type: 'DEATH', id: target.id, killerId: killer?.id ?? null });
}
