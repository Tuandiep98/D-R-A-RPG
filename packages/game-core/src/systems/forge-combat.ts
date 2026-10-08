import { durabilityOf, forgeRules } from '@rpg/game-data';
import type { SimContext } from '../context';
import type { Entity } from '../entity';
import { secondsToTicks } from '../time';
import { recomputePlayerStats } from './progression';

/**
 * Socket effects that hook into damage and death (docs/plan/06_forge_equipment_plan.md).
 * Kept apart from forge.ts so combat.ts can call them without an import cycle.
 */

/** Mất độ bền: every equipped item loses `deathLoss` when its wearer dies. */
export function forgeOnDeath(ctx: SimContext, e: Entity): void {
  const p = e.player;
  const rules = forgeRules(ctx.content);
  if (!p || !rules || rules.durability.deathLoss <= 0) return;
  let changed = false;
  for (const id of Object.values(p.equipment)) {
    const inv = p.inventory.find((i) => i.instanceId === id);
    const def = inv && ctx.content.items.get(inv.itemId);
    if (!inv || !def) continue;
    const now = durabilityOf(rules, def, inv);
    if (now <= 0) continue;
    inv.forge = {
      ...inv.forge,
      durability: Math.max(0, now - rules.durability.deathLoss),
    };
    changed = true;
  }
  if (changed) recomputePlayerStats(ctx, e);
}

/** Bullet hit by a player: ammo-chip stun cadence and heavy-weapon knockback. */
export function forgeBulletHit(
  ctx: SimContext,
  e: Entity,
  t: Entity,
  heavy: boolean,
  push: (t: Entity, yaw: number, metres: number) => void,
): void {
  const p = e.player;
  const ammo = p?.gear?.ammo;
  if (!p || !ammo || !t.life.alive) return;
  const tier = t.kind === 'monster' ? ctx.content.monsters.get(t.defId)?.tier : undefined;
  const sturdy = tier === 'boss' || tier === 'world_boss' || tier === 'mini_boss';
  if (ammo.stunEvery > 0) {
    p.ammoHits = (p.ammoHits ?? 0) + 1;
    if (p.ammoHits % ammo.stunEvery === 0 && !sturdy) {
      t.poise = {
        pressure: t.poise?.pressure ?? 0,
        threshold: t.poise?.threshold ?? 0,
        lastHitTick: ctx.tick,
        immuneUntilTick: t.poise?.immuneUntilTick ?? 0,
        staggerUntilTick: Math.max(
          t.poise?.staggerUntilTick ?? 0,
          ctx.tick + secondsToTicks(ammo.stunSeconds),
        ),
      };
      t.pending = null;
      t.monsterSwing = null;
      t.movement.goal = null;
      t.movement.path = null;
    }
  }
  if (heavy && ammo.knockback > 0 && t.kind === 'monster' && !sturdy) {
    push(t, Math.atan2(t.pos.x - e.pos.x, t.pos.z - e.pos.z), ammo.knockback);
  }
}

/** Defense modules on the target: dodge, flat reduction and element resist. Returns the damage left (0 = dodged). */
export function forgeMitigate(
  ctx: SimContext,
  target: Entity,
  amount: number,
  element: string | null | undefined,
): number {
  const d = target.player?.gear?.defense;
  if (!d) return amount;
  if (d.dodge > 0 && ctx.rng.chance(d.dodge)) return 0;
  let cut = d.reduction;
  for (const r of d.resist) if (r.element === element) cut += r.amount;
  return Math.max(1, Math.round(amount * (1 - Math.min(0.6, cut))));
}

/** Defense module on the attacker: part of the damage dealt becomes a shield. */
export function forgeShieldOnHit(ctx: SimContext, source: Entity, dealt: number): void {
  const d = source.player?.gear?.defense;
  if (!d || d.shieldOnHit <= 0 || dealt <= 0 || !source.life.alive) return;
  const cap = Math.round(source.stats.maxHp * d.shieldCap);
  const current = source.shield && source.shield.endTick > ctx.tick ? source.shield.amount : 0;
  const amount = Math.min(cap, current + Math.round(dealt * d.shieldOnHit));
  if (amount <= current) return;
  source.shield = {
    amount,
    endTick: ctx.tick + secondsToTicks(d.shieldSeconds),
  };
  ctx.emit({
    type: 'SHIELD',
    targetId: source.id,
    amount: amount - current,
    remaining: amount,
    endTick: source.shield.endTick,
    phase: 'gain',
  });
}
