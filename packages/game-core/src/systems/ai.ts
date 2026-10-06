import { areHostile, isAlive, type SimContext } from '../context';
import type { Entity } from '../entity';
import { clampToBounds, distance } from '../math';
import { secondsToTicks } from '../time';

const HOME_ARRIVE = 0.3;

/**
 * Melee monster FSM: idle (wander) → chase (combat system closes in and
 * attacks) → return when leashed or target lost → idle with full HP.
 */
export function aiSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    if (!e.ai || !e.life.alive) continue;
    const ai = e.ai;

    switch (ai.state) {
      case 'idle': {
        const attacker = ctx.entities.get(e.life.lastAttackerId ?? 0);
        const target = isAlive(attacker) ? attacker : findNearestHostile(ctx, e, ai.aggroRadius);
        if (target) {
          ai.state = 'chase';
          e.combat.targetId = target.id;
          e.movement.goal = null;
          break;
        }
        if (ai.wanderRadius > 0 && ctx.tick >= ai.nextWanderTick) {
          const angle = ctx.rng.range(0, Math.PI * 2);
          const r = ctx.rng.range(0, ai.wanderRadius);
          e.movement.goal = {
            pos: clampToBounds(
              { x: ai.home.x + Math.sin(angle) * r, z: ai.home.z + Math.cos(angle) * r },
              ctx.bounds,
              e.movement.radius,
            ),
            stopWithin: 0.1,
          };
          ai.nextWanderTick = ctx.tick + secondsToTicks(ctx.rng.range(3, 7));
        }
        break;
      }
      case 'chase': {
        const target = ctx.entities.get(e.combat.targetId ?? 0);
        const leashed = distance(e.pos, ai.home) > ai.leashRadius;
        if (!isAlive(target) || leashed) startReturn(e);
        break;
      }
      case 'return': {
        if (distance(e.pos, ai.home) <= HOME_ARRIVE) {
          ai.state = 'idle';
          e.stats.hp = e.stats.maxHp;
          e.movement.goal = null;
          e.life.lastAttackerId = null;
        } else if (!e.movement.goal) {
          e.movement.goal = { pos: { ...ai.home }, stopWithin: HOME_ARRIVE * 0.5 };
        }
        break;
      }
    }
  }
}

function startReturn(e: Entity): void {
  if (!e.ai) return;
  e.ai.state = 'return';
  e.combat.targetId = null;
  e.life.lastAttackerId = null;
  e.movement.goal = { pos: { ...e.ai.home }, stopWithin: HOME_ARRIVE * 0.5 };
}

function findNearestHostile(ctx: SimContext, self: Entity, radius: number): Entity | null {
  let best: Entity | null = null;
  let bestDist = radius;
  for (const other of ctx.entities.values()) {
    if (other === self || !other.life.alive || !areHostile(self, other)) continue;
    const d = distance(self.pos, other.pos);
    if (d <= bestDist) {
      best = other;
      bestDist = d;
    }
  }
  return best;
}
