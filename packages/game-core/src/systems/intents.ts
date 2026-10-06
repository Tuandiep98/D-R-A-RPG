import type { EntityId, Intent } from '@rpg/game-protocol';
import { areHostile, isAlive, type SimContext } from '../context';
import { clampToBounds } from '../math';

export interface QueuedIntent {
  entityId: EntityId;
  intent: Intent;
}

/**
 * Applies already schema-validated intents. Semantic checks happen here:
 * the actor must exist and be alive, targets must be alive and hostile.
 * Returns how many intents were rejected.
 */
export function applyIntents(ctx: SimContext, queue: readonly QueuedIntent[]): number {
  let rejected = 0;
  for (const { entityId, intent } of queue) {
    const actor = ctx.entities.get(entityId);
    if (!isAlive(actor)) {
      rejected++;
      continue;
    }
    switch (intent.type) {
      case 'MOVE_TO': {
        actor.combat.targetId = null;
        actor.movement.goal = {
          pos: clampToBounds(intent.target, ctx.bounds, actor.movement.radius),
          stopWithin: 0.05,
        };
        break;
      }
      case 'ATTACK_TARGET': {
        const target = ctx.entities.get(intent.targetId);
        if (!isAlive(target) || target.id === actor.id || !areHostile(actor, target)) {
          rejected++;
          break;
        }
        actor.combat.targetId = target.id;
        actor.movement.goal = null;
        break;
      }
      case 'STOP': {
        actor.combat.targetId = null;
        actor.movement.goal = null;
        break;
      }
    }
  }
  return rejected;
}
