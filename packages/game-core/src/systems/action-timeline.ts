import type { ActionTiming } from '@rpg/game-data';
import type { SimContext } from '../context';
import type { ActionState, Entity } from '../entity';
import { newTriggerState } from '../entity';
import { TICK_RATE } from '../time';

export function actionPhase(
  a: ActionState,
  tick: number,
): 'windup' | 'active' | 'recovery' | 'done' {
  if (tick < a.activeStartTick) return 'windup';
  if (tick < a.activeEndTick) return 'active';
  if (tick < a.endTick) return 'recovery';
  return 'done';
}

export function currentAction(ctx: SimContext, e: Entity): ActionState | null {
  const a = e.actionState;
  if (!a) return null;
  if (!e.life.alive || actionPhase(a, ctx.tick) === 'done') {
    e.actionState = null;
    return null;
  }
  return a;
}

export function beginAction(
  ctx: SimContext,
  e: Entity,
  kind: ActionState['kind'],
  timing: ActionTiming,
): ActionState {
  const ticks = (seconds: number) => Math.round(seconds * TICK_RATE);
  const activeStartTick = ctx.tick + ticks(timing.windup);
  const activeEndTick = activeStartTick + ticks(timing.active);
  const a: ActionState = {
    id: ctx.nextShotId(),
    kind,
    startTick: ctx.tick,
    activeStartTick,
    activeEndTick,
    endTick: activeEndTick + ticks(timing.recovery),
    yaw: e.yaw,
    cancelWindup: timing.cancelWindup,
    recoveryCancelTick:
      timing.cancelRecoveryAfter === undefined
        ? null
        : activeEndTick + ticks(timing.cancelRecoveryAfter),
  };
  e.actionState = a;
  return a;
}

/** Cancellation never refunds committed resource costs or cooldowns. */
export function canCancelAction(ctx: SimContext, e: Entity): boolean {
  const a = currentAction(ctx, e);
  if (a) {
    const phase = actionPhase(a, ctx.tick);
    if (
      !(phase === 'windup' && a.cancelWindup) &&
      !(phase === 'recovery' && a.recoveryCancelTick !== null && ctx.tick >= a.recoveryCancelTick)
    )
      return false;
  }
  return true;
}

export function cancelAction(ctx: SimContext, e: Entity): boolean {
  if (!canCancelAction(ctx, e)) return false;
  e.actionState = null;
  e.cast = null;
  e.swing = null;
  e.monsterSwing = null;
  e.mobility = null;
  if (e.player) {
    e.player.combo.buffered = false;
    e.player.trigger.windup = null;
    e.player.trigger.held = false;
    e.player.trigger.queued = false;
    e.player.trigger.burstLeft = 0;
  }
  return true;
}

export function timelineSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    currentAction(ctx, e);
    if (!e.life.alive || (e.actionBuffer && ctx.tick > e.actionBuffer.expiresTick))
      e.actionBuffer = null;
  }
}

/** Forced lifecycle reset: never refunds committed resources or cooldowns. */
export function resetTransientActions(e: Entity): void {
  e.actionState = null;
  e.actionBuffer = null;
  e.cast = null;
  e.swing = null;
  e.monsterSwing = null;
  e.mobility = null;
  e.pending = null;
  e.combat.targetId = null;
  e.movement.dir = null;
  e.movement.goal = null;
  e.movement.path = null;
  if (e.player) {
    e.player.farm.enabled = false;
    e.player.combo.buffered = false;
    e.player.combo.aim = null;
    e.player.trigger = newTriggerState();
  }
}
