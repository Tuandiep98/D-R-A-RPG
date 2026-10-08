import type { ComboDef, ComboVariant } from '@rpg/game-data';
import { areHostile, inAttackRange, isAlive, type SimContext } from '../context';
import type { DamageSource, Entity } from '../entity';
import { clearLine } from '../geometry';
import { clamp, clampToBounds, distance, sub, type Vec2, yawOf } from '../math';
import { secondsToTicks, TICK_RATE } from '../time';
import { beginAction, currentAction } from './action-timeline';
import { applyDamage, captureDamageSource, rollHit } from './combat';

/**
 * Basic attacks (đánh thường, D-031): chained swings from game-data/combos.
 *
 * - No target needed: a swing hits whatever hostile is inside its cone and
 *   reach when the impact tick comes. Out of reach is a miss.
 * - Facing: aim point (desktop cursor) → the auto-attack target → aim assist
 *   toward a hostile near the held direction / facing → held direction → facing.
 * - Pressing during a swing buffers the next step; the chain resets after
 *   `resetAfter` idle seconds. Finishers use a predictable first variant.
 * - Moving while swinging is allowed at `moveMultiplier` speed.
 * - Damage: graze falloff near the tip of the reach, weak-point bonus on the
 *   target's back/flank, per-variant crit bonus.
 */

const DEG = Math.PI / 180;
/** Aim assist looks this far past a swing's reach. */
const ASSIST_EXTRA = 1.5;
/** Most "Trượt" notices one swing may produce. */
const MAX_MISS_EVENTS = 3;

/** The combo a player swings with: main-hand weapon's, character armed/unarmed default. */
export function comboOf(ctx: SimContext, e: Entity): ComboDef | null {
  const p = e.player;
  if (!p) return null;
  const def = ctx.content.characters.get(p.characterId);
  if (!def) return null;
  const mainId = p.equipment.main_hand;
  const main = mainId ? p.inventory.find((i) => i.instanceId === mainId) : undefined;
  const item = main ? ctx.content.items.get(main.itemId) : undefined;
  const id = item ? (item.combo ?? def.combos.armed) : def.combos.unarmed;
  return ctx.content.combos.get(id) ?? null;
}

/** BASIC_ATTACK intent: swing now, or buffer the next step if a swing is running. */
export function requestBasicAttack(ctx: SimContext, e: Entity, aim: Vec2 | null): boolean {
  if (!e.player || e.cast || e.mobility) return false;
  if (!e.swing && currentAction(ctx, e)) return false;
  if (e.swing) {
    e.actionBuffer = {
      expiresTick:
        ctx.tick + secondsToTicks(ctx.content.combat.get('combat_rules')?.bufferSeconds ?? 0.2),
      intent: { type: 'BASIC_ATTACK', ...(aim ? { aim } : {}) },
    };
    return true;
  }
  return startSwing(ctx, e, aim, null);
}

export function startSwing(
  ctx: SimContext,
  e: Entity,
  aim: Vec2 | null,
  target: Entity | null,
): boolean {
  const combo = comboOf(ctx, e);
  const state = e.player?.combo;
  if (!combo || !state) return false;
  const chained = ctx.tick - state.lastEndTick <= secondsToTicks(combo.resetAfter);
  const step = chained ? state.nextStep % combo.steps.length : 0;
  const variant = pickVariant(ctx, combo.steps[step]?.variants ?? []);
  if (!variant) return false;

  const faced = faceFor(ctx, e, combo, variant, aim, target);
  e.yaw = faced.yaw;
  e.actionBuffer = null;
  const impactTick = ctx.tick + secondsToTicks(variant.windup);
  beginAction(ctx, e, 'melee', {
    windup: (impactTick - ctx.tick) / TICK_RATE,
    active: 0,
    recovery: variant.recovery,
    cancelWindup: true,
  });
  e.swing = {
    source: captureDamageSource(ctx, e),
    comboId: combo.id,
    step,
    variant,
    startTick: ctx.tick,
    impactTick,
    endTick: impactTick + (variant.recovery > 0 ? secondsToTicks(variant.recovery) : 0),
    yaw: faced.yaw,
    impacted: false,
    lungeLeft: variant.lunge,
  };
  state.buffered = false;
  state.aim = null;
  e.combat.lastCombatTick = ctx.tick;
  ctx.emit({
    type: 'ATTACK',
    actionId: e.actionState?.id ?? null,
    element: e.element ?? null,
    expression: e.expression ?? 'base',
    sourceId: e.id,
    targetId: faced.target?.id ?? null,
    combo: { comboId: combo.id, step, variantId: variant.id, yaw: faced.yaw },
  });
  return true;
}

/** Starts automatic swings before movement so the committed pose owns speed and yaw. */
export function meleePreparationSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    if (
      e.player &&
      !e.player.ranged &&
      e.life.alive &&
      !e.swing &&
      !e.cast &&
      !e.mobility &&
      !currentAction(ctx, e) &&
      !e.pending &&
      e.combat.targetId !== null
    ) {
      const target = ctx.entities.get(e.combat.targetId);
      if (isAlive(target) && areHostile(e, target) && inAttackRange(e, target))
        startSwing(ctx, e, null, target);
    }
  }
}

/** Lunges finish before any attack or projectile tests this tick's positions. */
export function meleeMovementSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    const swing = e.swing;
    if (!swing) continue;
    if (!e.life.alive || e.cast) {
      e.swing = null;
      continue;
    }
    if (swing.lungeLeft > 0 && ctx.tick < swing.impactTick) {
      const windup = swing.impactTick - swing.startTick;
      const [from, to] = swing.variant.lungeWindow;
      const start = swing.startTick + Math.floor(windup * from);
      const end = Math.max(start + 1, swing.startTick + Math.round(windup * to));
      if (ctx.tick >= start && ctx.tick < end) {
        const perTick = swing.variant.lunge / (end - start);
        lunge(ctx, e, swing.yaw, Math.min(swing.lungeLeft, perTick));
        swing.lungeLeft -= perTick;
      }
    }
  }
}

/** Releases finished payloads before intent/buffer revalidation. */
export function meleeFinishSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    const swing = e.swing;
    if (!swing?.impacted || ctx.tick < swing.endTick) continue;
    e.swing = null;
    const state = e.player?.combo;
    if (state) {
      state.lastEndTick = ctx.tick;
      state.nextStep = swing.step + 1;
    }
  }
}

/** The sole melee damage pass, after every entity has moved. */
export function meleeSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    const swing = e.swing;
    if (!swing || !e.life.alive || e.cast) continue;
    if (!swing.impacted && ctx.tick >= swing.impactTick) {
      swing.impacted = true;
      resolveImpact(ctx, e, swing.comboId, swing.variant, swing.yaw, swing.source);
    }
  }
  meleeFinishSystem(ctx);
}

function pickVariant(_ctx: SimContext, variants: readonly ComboVariant[]): ComboVariant | null {
  // Stable gameplay profile: alternate clip/reach variants require explicit mutation selection.
  return variants[0] ?? null;
}

const surfaceDistance = (a: Entity, b: Entity) =>
  distance(a.pos, b.pos) - a.movement.radius - b.movement.radius;

/** Unsigned angle (rad) between facing `yaw` and the direction from `e` to `p`. */
function angleTo(e: Entity, yaw: number, p: Vec2): number {
  const d = sub(p, e.pos);
  const len = Math.hypot(d.x, d.z);
  if (len < 1e-4) return 0;
  const dot = (Math.sin(yaw) * d.x + Math.cos(yaw) * d.z) / len;
  return Math.acos(clamp(dot, -1, 1));
}

function faceFor(
  ctx: SimContext,
  e: Entity,
  combo: ComboDef,
  variant: ComboVariant,
  aim: Vec2 | null,
  target: Entity | null,
): { yaw: number; target: Entity | null } {
  if (aim && distance(aim, e.pos) > 0.05) return { yaw: yawOf(sub(aim, e.pos)), target: null };
  const reachable = (t: Entity | null | undefined): t is Entity =>
    !!t && t.life.alive && surfaceDistance(e, t) <= variant.reach + ASSIST_EXTRA;
  const chosen = target ?? ctx.entities.get(e.combat.targetId ?? 0) ?? null;
  if (reachable(chosen)) return { yaw: yawOf(sub(chosen.pos, e.pos)), target: chosen };
  const held = e.movement.dir;
  const around = held ? yawOf(held) : e.yaw;
  let best: Entity | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const t of ctx.entities.values()) {
    if (t === e || t.inert || !t.life.alive || !areHostile(e, t) || !reachable(t)) continue;
    const ang = angleTo(e, around, t.pos);
    if (ang > combo.assistAngle * DEG) continue;
    // Prefer close and centred.
    const score = surfaceDistance(e, t) + ang * 1.5;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best) return { yaw: yawOf(sub(best.pos, e.pos)), target: best };
  return { yaw: around, target: null };
}

function resolveImpact(
  ctx: SimContext,
  e: Entity,
  comboId: string,
  v: ComboVariant,
  yaw: number,
  source: DamageSource,
): void {
  const combo = ctx.content.combos.get(comboId);
  if (!combo) return;
  const half = (v.arc / 2) * DEG;
  const hits: { t: Entity; surface: number }[] = [];
  const near: Entity[] = [];
  for (const t of ctx.entities.values()) {
    if (t === e || t.inert || !t.life.alive || !areHostile(e, t)) continue;
    const surface = surfaceDistance(e, t);
    if (surface > v.reach + combo.missMargin || !clearLine(ctx, e.pos, t.pos)) continue;
    if (v.arc < 360) {
      const cd = distance(e.pos, t.pos);
      // A body counts as inside the cone if any of it is.
      const allowance = cd > 1e-4 ? Math.atan2(t.movement.radius, cd) : Math.PI;
      if (angleTo(e, yaw, t.pos) - allowance > half) continue;
    }
    if (surface > v.reach) near.push(t);
    else hits.push({ t, surface });
  }
  hits.sort((a, b) => a.surface - b.surface);
  for (const { t, surface } of hits.slice(0, v.maxTargets)) {
    let distanceFactor = 1;
    let positionFactor = 1;
    let hit: 'solid' | 'graze' | 'weak' = 'solid';
    const grazeStart = v.reach * combo.grazeFrom;
    if (surface > grazeStart) {
      const k = clamp((surface - grazeStart) / Math.max(1e-3, v.reach - grazeStart), 0, 1);
      distanceFactor = 1 + (combo.grazeMultiplier - 1) * k;
      hit = 'graze';
    }
    // Yếu hại: where the blow lands relative to the target's facing.
    const back = facingDot(t, e.pos);
    if (back < -0.5) {
      positionFactor = combo.weakPoint.back;
      hit = 'weak';
    } else if (back < 0.26) {
      positionFactor = combo.weakPoint.flank;
      if (hit === 'solid') hit = 'weak';
    }
    const { amount, crit } = rollHit(
      ctx,
      e,
      t,
      { multiplier: v.damage, critBonus: v.critBonus },
      { distanceFactor, positionFactor },
      source,
    );
    applyDamage(ctx, e, t, amount, crit, null, { hit, heavy: v.heavy, source });
  }
  if (hits.length === 0)
    for (const t of near.slice(0, MAX_MISS_EVENTS))
      ctx.emit({ type: 'MISS', sourceId: e.id, targetId: t.id });
}

/** Cosine between the target's facing and the direction to `from` (1 = in front). */
export function facingDot(t: Entity, from: Vec2): number {
  const d = sub(from, t.pos);
  const len = Math.hypot(d.x, d.z);
  if (len < 1e-4) return 1;
  return (Math.sin(t.yaw) * d.x + Math.cos(t.yaw) * d.z) / len;
}

/** Forward dash during a wind-up (jumping chop); slides on the navmesh like steering. */
function lunge(ctx: SimContext, e: Entity, yaw: number, metres: number): void {
  if (metres <= 0) return;
  const steps = Math.ceil(metres / 0.25);
  const step = metres / steps;
  for (let i = 0; i < steps; i++) {
    const next = clampToBounds(
      { x: e.pos.x + Math.sin(yaw) * step, z: e.pos.z + Math.cos(yaw) * step },
      ctx.bounds,
      e.movement.radius,
    );
    const p = ctx.nav ? ctx.nav.closest(next) : next;
    if (distance(p, next) > 0.18 || distance(p, e.pos) > step * 1.5) break;
    if (ctx.obstacles.some((o) => distance(p, o.pos) < o.radius + e.movement.radius)) break;
    e.pos.x = p.x;
    e.pos.z = p.z;
    e.movement.moved = true;
  }
}
