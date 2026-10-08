import type { EntityId, Intent } from '@rpg/game-protocol';
import { areHostile, INTERACT_RANGE, isAlive, type SimContext } from '../context';
import type { Entity } from '../entity';
import { clampToBounds, distance } from '../math';
import { secondsToTicks } from '../time';
import { canCancelAction, cancelAction, currentAction } from './action-timeline';
import { breakthrough, openNode } from './cultivation';
import { equip, unequip, useItem } from './inventory';
import { tryPickup } from './loot';
import { requestBasicAttack } from './melee';
import { requestMobility } from './mobility';
import { acceptQuest, craft, openNpc, shopBuy, shopSell, turnInQuest, upgrade } from './npc';
import { releaseTrigger, requestReload, setTrigger, tapTrigger } from './ranged';
import { requestCast } from './skills';

export interface QueuedIntent {
  entityId: EntityId;
  intent: Intent;
}

const MANUAL_CONTROL = new Set<Intent['type']>([
  'MOVE_TO',
  'MOVE_DIR',
  'STOP',
  'CAST_SKILL',
  'MOBILITY',
  'BASIC_ATTACK',
  'TRIGGER',
  'ATTACK_TARGET',
  'RELOAD',
  'PICKUP',
  'INTERACT',
  'EQUIP',
  'UNEQUIP',
]);

/** Manual commands take ownership before busy-action buffering or semantic validation. */
function takeOverFarm(actor: Entity, intent: Intent): void {
  const player = actor.player;
  if (!player?.farm.enabled || !MANUAL_CONTROL.has(intent.type)) return;
  player.farm.enabled = false;
  player.farm.approach = null;
  player.farm.progress = null;
  player.farm.observedTarget = null;
  dropAutoAttack(actor);
  actor.actionBuffer = null;
  player.combo.buffered = false;
  player.trigger.held = false;
  player.trigger.queued = false;
  player.trigger.burstLeft = 0;
  // Already committed cast/swing/shot windup retains its normal cancellation policy.
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
    takeOverFarm(actor, intent);
    if (!bufferIfBusy(ctx, actor, intent) && !apply(ctx, actor, intent)) rejected++;
  }
  return rejected;
}

/** One fresh manual action, replacing the previous one; costs are checked again on execution. */
function bufferIfBusy(ctx: SimContext, actor: Entity, intent: Intent): boolean {
  if (!actor.player) return false;
  const action = currentAction(ctx, actor);
  let busy = false;
  switch (intent.type) {
    case 'BASIC_ATTACK':
      busy = !!(action || actor.cast || actor.swing || actor.mobility);
      break;
    case 'CAST_SKILL':
      busy = !!(actor.cast || actor.mobility || (action && !canCancelAction(ctx, actor)));
      break;
    case 'MOBILITY':
      busy = !!(actor.mobility || (action && !canCancelAction(ctx, actor)));
      break;
    case 'TRIGGER':
      busy = intent.held && !actor.player.trigger.held && !!action;
      if (!busy) return false;
      break;
    default:
      return false;
  }
  if (!busy) return false;
  actor.player.farm.enabled = false;
  dropAutoAttack(actor);
  actor.player.combo.buffered = false;
  actor.actionBuffer = {
    intent,
    expiresTick:
      ctx.tick + secondsToTicks(ctx.content.combat.get('combat_rules')?.bufferSeconds ?? 0.2),
  };
  return true;
}

export function bufferedActionSystem(ctx: SimContext): void {
  for (const actor of ctx.entities.values()) {
    const buffer = actor.actionBuffer;
    if (!buffer || !actor.life.alive) continue;
    if (ctx.tick > buffer.expiresTick) {
      actor.actionBuffer = null;
      continue;
    }
    if (actor.cast || actor.swing || actor.mobility || currentAction(ctx, actor)) continue;
    actor.actionBuffer = null;
    apply(ctx, actor, buffer.intent);
  }
}

/** Attacking at will drops auto-attack, queued actions and click-to-move. */
function dropAutoAttack(e: Entity): void {
  e.combat.targetId = null;
  e.pending = null;
  e.movement.goal = null;
  e.movement.path = null;
}

function clearActions(ctx: SimContext, e: Entity, stop = false): void {
  e.actionBuffer = null;
  e.combat.targetId = null;
  e.pending = null;
  // Basic attacks explicitly allow walking during their windup.
  if (stop || !e.swing) cancelAction(ctx, e);
  if (e.player) e.player.combo.buffered = false;
  e.movement.goal = null;
  e.movement.path = null;
}

function apply(ctx: SimContext, actor: Entity, intent: Intent): boolean {
  takeOverFarm(actor, intent);
  switch (intent.type) {
    case 'SET_FARM':
      if (!actor.player) return false;
      actor.player.farm = {
        enabled: intent.enabled,
        anchor: { ...actor.pos },
        pausedUntil: ctx.tick,
      };
      if (!intent.enabled) {
        clearActions(ctx, actor);
        releaseTrigger(actor);
      }
      return true;
    case 'MOBILITY':
      return requestMobility(ctx, actor, intent.action, intent.point ?? null);
    case 'MOVE_TO': {
      clearActions(ctx, actor);
      actor.movement.dir = null;
      const target = clampToBounds(intent.target, ctx.bounds, actor.movement.radius);
      actor.movement.goal = {
        pos: ctx.nav ? ctx.nav.closest(target) : target,
        stopWithin: 0.05,
      };
      return true;
    }
    case 'MOVE_DIR': {
      const d = intent.dir;
      const len = d ? Math.hypot(d.x, d.z) : 0;
      if (!d || len < 1e-3) {
        actor.movement.dir = null;
        return true;
      }
      // A fresh press cancels click-to-move, auto-attack and queued actions;
      // steering while held (direction changes, keep-alives) does not.
      if (!actor.movement.dir) clearActions(ctx, actor);
      else {
        dropAutoAttack(actor);
        actor.actionBuffer = null;
        if (actor.player) actor.player.combo.buffered = false;
      }
      actor.movement.dir = { x: d.x / len, z: d.z / len };
      return true;
    }
    case 'STOP':
      clearActions(ctx, actor, true);
      actor.movement.dir = null;
      releaseTrigger(actor);
      return true;
    case 'BASIC_ATTACK':
      // Swinging at nothing in particular drops auto-attack/queued actions.
      dropAutoAttack(actor);
      return actor.player?.ranged
        ? tapTrigger(ctx, actor, intent.aim ?? null)
        : requestBasicAttack(ctx, actor, intent.aim ?? null);
    case 'TRIGGER': {
      if (!intent.held && actor.actionBuffer?.intent.type === 'TRIGGER') actor.actionBuffer = null;
      const trigger = actor.player?.trigger;
      if (!trigger) return false;
      const pressed = intent.held && !trigger.held;
      if (pressed) dropAutoAttack(actor);
      if (actor.player?.ranged)
        return setTrigger(ctx, actor, intent.held, intent.aim ?? null, intent.targetId ?? null);
      // Melee weapon: a press is one swing; keepalives and releases do nothing.
      trigger.held = intent.held;
      return pressed ? requestBasicAttack(ctx, actor, intent.aim ?? null) : true;
    }
    case 'RELOAD':
      return requestReload(ctx, actor);
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
      clearActions(ctx, actor);
      if (!tryPickup(ctx, actor, loot)) {
        actor.pending = { type: 'pickup', lootId: loot.id };
        actor.movement.goal = {
          pos: { ...loot.pos },
          stopWithin: INTERACT_RANGE * 0.6,
        };
      }
      return true;
    }
    case 'INTERACT': {
      const target = ctx.entities.get(intent.entityId);
      if (!target?.portal && !target?.npc) return false;
      clearActions(ctx, actor);
      if (distance(actor.pos, target.pos) <= INTERACT_RANGE) interactWith(ctx, actor, target);
      else {
        actor.pending = { type: 'interact', entityId: target.id };
        actor.movement.goal = {
          pos: { ...target.pos },
          stopWithin: INTERACT_RANGE * 0.6,
        };
      }
      return true;
    }
    case 'EQUIP':
      return equip(ctx, actor, intent.instanceId);
    case 'UNEQUIP':
      return unequip(ctx, actor, intent.slot);
    case 'USE_ITEM':
      return useItem(ctx, actor, intent.instanceId);
    case 'QUEST_ACCEPT':
      return acceptQuest(ctx, actor, intent.npcId, intent.questId);
    case 'QUEST_TURN_IN':
      return turnInQuest(ctx, actor, intent.npcId, intent.questId);
    case 'SHOP_BUY':
      return shopBuy(ctx, actor, intent.npcId, intent.itemId, intent.count);
    case 'SHOP_SELL':
      return shopSell(ctx, actor, intent.npcId, intent.instanceId, intent.count);
    case 'CRAFT':
      return craft(ctx, actor, intent.npcId, intent.recipeId);
    case 'UPGRADE':
      return upgrade(ctx, actor, intent.npcId, intent.instanceId);
    case 'PARTY_INVITE': {
      const target = ctx.entities.get(intent.targetId);
      return !!target && ctx.parties.invite(ctx, actor, target);
    }
    case 'PARTY_ACCEPT':
      return ctx.parties.accept(ctx, actor, intent.fromId);
    case 'PARTY_LEAVE':
      ctx.parties.leave(actor);
      return true;
    case 'OPEN_NODE':
      return openNode(ctx, actor, intent.nodeId);
    case 'BREAKTHROUGH':
      return breakthrough(ctx, actor);
  }
}

function interactWith(ctx: SimContext, actor: Entity, target: Entity): void {
  if (target.portal) transfer(ctx, actor, target);
  else if (target.npc) openNpc(ctx, actor, target);
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
      if (!target?.portal && !target?.npc) e.pending = null;
      else if (distance(e.pos, target.pos) <= INTERACT_RANGE) {
        e.pending = null;
        interactWith(ctx, e, target);
      } else if (!e.movement.goal) e.pending = null;
    }
  }
}
