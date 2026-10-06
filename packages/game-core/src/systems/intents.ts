import type { EntityId, Intent } from '@rpg/game-protocol';
import { areHostile, INTERACT_RANGE, isAlive, type SimContext } from '../context';
import type { Entity } from '../entity';
import { clampToBounds, distance } from '../math';
import { equip, unequip, useItem } from './inventory';
import { tryPickup } from './loot';
import { requestCast } from './skills';

export interface QueuedIntent {
  entityId: EntityId;
  intent: Intent;
}

/**
 * Applies already schema-validated intents. Semantic checks happen here:
 * the actor must exist and be alive, targets must be alive and hostile, items
 * must be owned. Returns how many intents were rejected.
 */
export function applyIntents(ctx: SimContext, queue: readonly QueuedIntent[]): number {
  let rejected = 0;
  for (const { entityId, intent } of queue) {
    const actor = ctx.entities.get(entityId);
    if (!actor || actor.inert) {
      rejected++;
      continue;
    }
    if (!actor.life.alive) {
      ctx.notice(actor.id, 'dead');
      rejected++;
      continue;
    }
    if (!apply(ctx, actor, intent)) rejected++;
  }
  return rejected;
}

function clearActions(e: Entity): void {
  e.combat.targetId = null;
  e.pending = null;
  e.cast = null;
  e.movement.goal = null;
  e.movement.path = null;
}

function apply(ctx: SimContext, actor: Entity, intent: Intent): boolean {
  switch (intent.type) {
    case 'MOVE_TO': {
      clearActions(actor);
      const target = clampToBounds(intent.target, ctx.bounds, actor.movement.radius);
      actor.movement.goal = { pos: ctx.nav ? ctx.nav.closest(target) : target, stopWithin: 0.05 };
      return true;
    }
    case 'STOP':
      clearActions(actor);
      return true;
    case 'ATTACK_TARGET': {
      const target = ctx.entities.get(intent.targetId);
      if (!isAlive(target) || target.id === actor.id || !areHostile(actor, target)) return false;
      if (actor.cast) return false;
      actor.pending = null;
      actor.combat.targetId = target.id;
      actor.movement.goal = null;
      return true;
    }
    case 'CAST_SKILL':
      return requestCast(ctx, actor, intent.skillId, intent.targetId ?? null, intent.point ?? null);
    case 'PICKUP': {
      const loot = ctx.entities.get(intent.lootId);
      if (!loot?.loot) return false;
      clearActions(actor);
      if (!tryPickup(ctx, actor, loot)) {
        actor.pending = { type: 'pickup', lootId: loot.id };
        actor.movement.goal = { pos: { ...loot.pos }, stopWithin: INTERACT_RANGE * 0.6 };
      }
      return true;
    }
    case 'INTERACT': {
      const target = ctx.entities.get(intent.entityId);
      if (!target?.portal) return false;
      clearActions(actor);
      if (distance(actor.pos, target.pos) <= INTERACT_RANGE) transfer(ctx, actor, target);
      else {
        actor.pending = { type: 'interact', entityId: target.id };
        actor.movement.goal = { pos: { ...target.pos }, stopWithin: INTERACT_RANGE * 0.6 };
      }
      return true;
    }
    case 'EQUIP':
      return equip(ctx, actor, intent.instanceId);
    case 'UNEQUIP':
      return unequip(ctx, actor, intent.slot);
    case 'USE_ITEM':
      return useItem(ctx, actor, intent.instanceId);
  }
}

function transfer(ctx: SimContext, actor: Entity, portal: Entity): void {
  if (!portal.portal || !actor.player) return;
  ctx.emit({
    type: 'TRANSFER',
    id: actor.id,
    mapId: portal.portal.targetMapId,
    arrival: portal.portal.arrival,
  });
}

/** Completes walk-then-act requests (pickup, portal) once the actor arrives. */
export function pendingSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    const p = e.pending;
    if (!p || !e.life.alive || p.type === 'cast') continue;
    if (p.type === 'pickup') {
      const loot = ctx.entities.get(p.lootId);
      if (!loot?.loot) e.pending = null;
      else if (tryPickup(ctx, e, loot)) e.pending = null;
      else if (!e.movement.goal) e.pending = null;
    } else if (p.type === 'interact') {
      const target = ctx.entities.get(p.entityId);
      if (!target?.portal) e.pending = null;
      else if (distance(e.pos, target.pos) <= INTERACT_RANGE) {
        e.pending = null;
        transfer(ctx, e, target);
      } else if (!e.movement.goal) e.pending = null;
    }
  }
}
