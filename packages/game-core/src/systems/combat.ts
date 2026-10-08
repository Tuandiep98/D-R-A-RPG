import type { DamageSpec } from '@rpg/game-data';
import { inAttackRange, isAlive, type SimContext } from '../context';
import type { DamageSource, Entity, Stats } from '../entity';
import { clearLine, coneTouches } from '../geometry';
import { sub, yawOf } from '../math';
import type { Rng } from '../rng';
import { TICK_RATE } from '../time';
import { beginAction, currentAction, resetTransientActions } from './action-timeline';
import { grantGold } from './inventory';
import { dropLoot } from './loot';
import { avoidsDamage } from './mobility';
import { questOnKill } from './npc';
import { backlashFactor, realmGapFactor } from './progression';

/** Damage roll before mitigation varies by ±10%. */
const VARIANCE = 0.1;
/** Each point of defense adds this much to the mitigation denominator. */
const DEFENSE_WEIGHT = 5;
/** Players regenerate only after this long without dealing or taking damage. */
export const OUT_OF_COMBAT_TICKS = 100;

export interface DamageRoll {
  amount: number;
  crit: boolean;
}

export interface DamageModifiers {
  distanceFactor?: number;
  positionFactor?: number;
  elementFactor?: number;
  realmFactor?: number;
  backlashFactor?: number;
}

/** All factors apply to the unrounded physical/elemental split, including flat damage. */
export function resolveDamage(
  rng: Rng,
  attacker: DamageSource['stats'],
  defender: Pick<Stats, 'defense'>,
  spec: Partial<DamageSpec> = {},
  factors: DamageModifiers = {},
): DamageRoll {
  const mitigation = 100 / (100 + defender.defense * DEFENSE_WEIGHT);
  const variance = 1 + rng.range(-VARIANCE, VARIANCE);
  // Consume the same seeded draws even when this damage cannot crit.
  const critRoll = rng.chance(attacker.critChance + (spec.critBonus ?? 0));
  const crit = (spec.canCrit ?? true) && critRoll;
  const share = spec.elementalShare ?? 0;
  const base =
    (attacker.attack * (spec.multiplier ?? 1) + (spec.flat ?? 0)) *
    (factors.distanceFactor ?? 1) *
    (factors.positionFactor ?? 1);
  const raw =
    base *
    ((1 - share) * mitigation + share * (factors.elementFactor ?? 1) * mitigation) *
    variance *
    (crit ? attacker.critMultiplier : 1) *
    (factors.realmFactor ?? 1) *
    (factors.backlashFactor ?? 1);
  return { amount: Math.max(1, Math.round(raw)), crit };
}

export function captureDamageSource(ctx: SimContext, e: Entity): DamageSource {
  return {
    actionId: e.actionState?.id ?? null,
    stats: {
      attack: e.stats.attack,
      critChance: e.stats.critChance,
      critMultiplier: e.stats.critMultiplier,
    },
    realm: e.realm,
    backlash: backlashFactor(ctx, e),
    element: e.element ?? null,
    expression: e.expression ?? 'base',
  };
}

/** Pure damage formula; exported for tests and future server-side tooling. */
export function rollDamage(
  rng: Rng,
  attacker: Pick<Stats, 'attack' | 'critChance' | 'critMultiplier'>,
  defender: Pick<Stats, 'defense'>,
  multiplier = 1,
  flat = 0,
  critBonus = 0,
): DamageRoll {
  return resolveDamage(rng, attacker, defender, { multiplier, flat, critBonus });
}

/**
 * A roll between two entities, scaled by the realm gap (master plan §57) and
 * by the attacker's breakthrough backlash.
 */
export function rollHit(
  ctx: SimContext,
  attacker: Entity,
  defender: Entity,
  spec: Partial<DamageSpec> = {},
  factors: Pick<DamageModifiers, 'distanceFactor' | 'positionFactor'> = {},
  source: DamageSource = captureDamageSource(ctx, attacker),
): DamageRoll {
  const rules = ctx.content.combat.get('combat_rules');
  let elemental = 1;
  if (ctx.combatRuleset !== 'classic' && rules && source.element && defender.element) {
    if (rules.counters[source.element] === defender.element) elemental = rules.advantage;
    else if (rules.counters[defender.element] === source.element) elemental = rules.disadvantage;
  }
  return resolveDamage(
    ctx.rng,
    source.stats,
    defender.stats,
    { ...spec, elementalShare: spec.elementalShare ?? rules?.basicShare ?? 0 },
    {
      ...factors,
      elementFactor: elemental,
      realmFactor: realmGapFactor(ctx, source, defender),
      backlashFactor: source.backlash,
    },
  );
}

/**
 * For every entity with a combat target: close the distance, then swing on
 * cooldown. Evaluates hitboxes after movement for this tick.
 * Casting suspends auto-attacks. Players swing their basic-attack combo
 * instead of a single timed hit (systems/melee.ts).
 */
export function combatSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    if (e.mobility) continue;
    if (e.monsterSwing) {
      const swing = e.monsterSwing;
      const def = ctx.content.monsters.get(e.defId);
      if (!e.life.alive || e.cast || !def) {
        e.monsterSwing = null;
        continue;
      }
      e.yaw = swing.yaw;
      e.movement.goal = null;
      if (ctx.tick >= swing.impactTick) {
        for (const t of ctx.entities.values()) {
          if (
            !isAlive(t) ||
            t.faction === e.faction ||
            t.faction === 'neutral' ||
            ctx.inSafeZone(t.pos)
          )
            continue;
          if (
            !coneTouches(
              e.pos,
              swing.yaw,
              def.combat.range,
              def.combat.arc,
              t,
              e.movement.radius,
            ) ||
            !clearLine(ctx, e.pos, t.pos)
          )
            continue;
          const { amount, crit } = rollHit(ctx, e, t, {}, {}, swing.source);
          applyDamage(ctx, e, t, amount, crit, null, {
            hit: 'solid',
            heavy: false,
            groundLow: def.combat.groundLow,
            source: swing.source,
          });
        }
        e.monsterSwing = null;
      }
    }
  }
}

/** Chooses approach/windup before movement; impacts remain in combatSystem. */
export function combatPreparationSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    if (e.mobility || e.monsterSwing) continue;
    if (e.inert || !e.life.alive || e.combat.targetId === null || e.cast || currentAction(ctx, e))
      continue;
    if (e.pending && e.pending.type !== 'cast') continue;
    const target = ctx.entities.get(e.combat.targetId);
    if (!isAlive(target)) {
      e.combat.targetId = null;
      e.movement.goal = null;
      continue;
    }

    // Farm owns its positioning goal; attacks still use the same range checks.
    if (e.player?.farm.enabled) continue;

    if (!inAttackRange(e, target)) {
      if (e.pending) continue; // a queued skill is driving the approach
      const reach = e.combat.range + e.movement.radius + target.movement.radius;
      e.movement.goal = {
        pos: { ...target.pos },
        stopWithin: Math.max(0.05, reach * 0.9),
      };
      continue;
    }

    e.movement.goal = null;
    e.movement.path = null;
    if (e.player) continue; // meleeSystem starts and advances player combo swings.
    e.yaw = yawOf(sub(target.pos, e.pos));
    if (ctx.tick < e.combat.nextAttackTick) continue;

    const def = ctx.content.monsters.get(e.defId);
    if (!def) continue;
    e.combat.nextAttackTick = ctx.tick + e.combat.attackIntervalTicks;
    beginAction(ctx, e, 'monster', {
      windup: def.combat.windup,
      active: 0,
      recovery: Math.max(0, e.combat.attackIntervalTicks / TICK_RATE - def.combat.windup),
      cancelWindup: false,
    });
    e.monsterSwing = {
      source: captureDamageSource(ctx, e),
      impactTick: ctx.tick + Math.round(def.combat.windup * TICK_RATE),
      endTick: e.combat.nextAttackTick,
      yaw: e.yaw,
    };
    ctx.emit({
      type: 'ATTACK',
      actionId: e.actionState?.id ?? null,
      windup: {
        point: { ...e.pos },
        yaw: e.yaw,
        range: def.combat.range + e.movement.radius,
        arc: def.combat.arc,
        endTick: e.monsterSwing.impactTick,
      },
      sourceId: e.id,
      targetId: target.id,
      element: e.element ?? null,
      expression: e.expression ?? 'base',
    });
  }
}

export function applyDamage(
  ctx: SimContext,
  source: Entity,
  target: Entity,
  amount: number,
  crit: boolean,
  skillId: string | null,
  detail?: {
    hit: 'solid' | 'graze' | 'weak';
    heavy: boolean;
    /** Ranged hits: the SHOT and bullet that landed. */
    shot?: { id: number; pellet: number };
    groundLow?: boolean;
    source?: DamageSource;
  },
): void {
  if (!target.life.alive || avoidsDamage(ctx, target, detail?.groundLow)) return;
  const dealt = Math.min(amount, target.stats.hp);
  target.stats.hp -= dealt;
  target.life.lastAttackerId = source.id;
  target.life.damageBy.set(source.id, (target.life.damageBy.get(source.id) ?? 0) + dealt);
  source.combat.lastCombatTick = ctx.tick;
  target.combat.lastCombatTick = ctx.tick;
  ctx.emit({
    type: 'DAMAGE',
    actionId: detail?.source ? (detail.source.actionId ?? null) : (source.actionState?.id ?? null),
    element: detail?.source ? detail.source.element : (source.element ?? null),
    expression: detail?.source?.expression ?? source.expression ?? 'base',
    sourceId: source.id,
    targetId: target.id,
    amount: dealt,
    crit,
    skillId,
    ...(detail ? { hit: detail.hit, heavy: detail.heavy } : {}),
    ...(detail?.shot ? { shot: detail.shot } : {}),
  });
  if (target.stats.hp <= 0) kill(ctx, target, source);
  else updatePhase(ctx, target);
}

/** Boss/elite phases (tech plan §26): thresholds on HP fraction, never reverting. */
function updatePhase(ctx: SimContext, e: Entity): void {
  if (!e.ai || e.kind !== 'monster') return;
  const def = ctx.content.monsters.get(e.defId);
  if (!def || def.phases.length === 0) return;
  const frac = e.stats.hp / e.stats.maxHp;
  let phase = 0;
  def.phases.forEach((p, i) => {
    if (frac <= p.hpBelow) phase = i + 1;
  });
  if (phase <= e.ai.phase) return;
  e.ai.phase = phase;
  const p = def.phases[phase - 1];
  if (!p) return;
  e.stats.attack = e.baseAttack * p.attackMultiplier;
  e.movement.speed = e.movement.baseSpeed * p.speedMultiplier;
  if (p.skills) {
    const next = new Map<string, number>();
    for (const s of p.skills) next.set(s, e.skills.get(s) ?? ctx.tick + 20);
    e.skills = next;
  }
  ctx.emit({ type: 'PHASE', id: e.id, phase, name: p.name });
}

function kill(ctx: SimContext, target: Entity, killer: Entity | null): void {
  resetTransientActions(target);
  target.life.alive = false;
  target.life.respawnAtTick = ctx.tick + target.life.respawnTicks;
  ctx.emit({ type: 'DEATH', id: target.id, killerId: killer?.id ?? null });
  if (target.kind === 'monster') rewardKill(ctx, target);
}

/**
 * Quest kill credit to every contributor and their nearby party members; gold
 * and loot ownership to the top damager. Kills grant no XP: there is no
 * character level (master plan §31) — monsters drop materials for cultivation.
 */
function rewardKill(ctx: SimContext, monster: Entity): void {
  const def = ctx.content.monsters.get(monster.defId);
  if (!def) return;
  let top: Entity | null = null;
  let topDamage = 0;
  // Every contributor plus their nearby party members are credited exactly once.
  const credited = new Map<number, Entity>();
  for (const [id, dmg] of monster.life.damageBy) {
    const p = ctx.entities.get(id);
    if (!p?.player) continue;
    const group = ctx.parties.nearbyMembers(ctx, p, monster.pos);
    for (const m of group) if (!credited.has(m.id)) credited.set(m.id, m);
    if (dmg > topDamage) {
      top = p;
      topDamage = dmg;
    }
  }
  for (const e of credited.values()) questOnKill(ctx, e, def.id);
  if (!top) return;
  for (const tableId of def.lootTable) {
    const table = ctx.content.loot.get(tableId);
    if (!table) continue;
    if (table.gold) {
      const gold = ctx.rng.int(table.gold.min, table.gold.max);
      if (gold > 0) {
        grantGold(ctx, top, gold, 'monster_drop', `kill:${monster.id}:${ctx.tick}:${tableId}`);
      }
    }
    dropLoot(ctx, monster, top, table);
  }
}
