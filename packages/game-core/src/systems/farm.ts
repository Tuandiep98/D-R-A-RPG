import { areHostile, edgeDistance, isAlive, type SimContext } from '../context';
import { clearLine, coneTouches } from '../geometry';
import { distance } from '../math';
import { secondsToTicks, TICK_RATE } from '../time';
import { INVENTORY_CAPACITY } from './inventory';
import { tryPickup } from './loot';
import { requestMobility } from './mobility';
import { effectRadius, requestCast } from './skills';

/** Server-owned farm driver. It uses only observable threats and the normal cast/attack paths. */
export function farmSystem(ctx: SimContext): void {
  const rules = ctx.content.combat.get('combat_rules')?.farm;
  if (!rules) return;
  for (const e of ctx.entities.values()) {
    const farm = e.player?.farm;
    if (!farm?.enabled || !e.player || !e.life.alive) continue;
    if (
      e.stats.hp / e.stats.maxHp < rules.hpStop ||
      e.player.inventory.length >= INVENTORY_CAPACITY
    ) {
      farm.enabled = false;
      e.combat.targetId = null;
      e.movement.goal = null;
      continue;
    }
    if (ctx.tick % secondsToTicks(rules.thinkInterval) !== 0 || e.mobility) continue;
    if (distance(e.pos, farm.anchor) > rules.leash) {
      e.combat.targetId = null;
      e.pending = null;
      e.movement.goal = { pos: { ...farm.anchor }, stopWithin: 0.4 };
      continue;
    }
    // A telegraph must have existed for the configured reaction time before auto reacts.
    let threat = false;
    for (const m of ctx.entities.values()) {
      if (!isAlive(m) || !areHostile(e, m)) continue;
      const c = m.cast,
        swing = m.monsterSwing;
      if (c && ctx.tick >= c.startTick + secondsToTicks(rules.reaction)) {
        const skill = ctx.content.skills.get(c.skillId);
        const radius = skill ? effectRadius(skill) : 0;
        if (skill?.telegraph && c.point && distance(e.pos, c.point) < radius + e.movement.radius)
          threat = true;
      }
      if (swing) {
        const def = ctx.content.monsters.get(m.defId);
        const start = swing.impactTick - Math.round((def?.combat.windup ?? 0) * TICK_RATE);
        if (
          def &&
          ctx.tick >= start + secondsToTicks(rules.reaction) &&
          coneTouches(m.pos, swing.yaw, def.combat.range, def.combat.arc, e, m.movement.radius)
        )
          threat = true;
      }
    }
    if (
      threat &&
      requestMobility(ctx, e, 'roll', {
        x: e.pos.x - Math.sin(e.yaw) * 3,
        z: e.pos.z - Math.cos(e.yaw) * 3,
      })
    )
      continue;
    if (e.cast || e.swing || e.pending) continue;
    let target = ctx.entities.get(e.combat.targetId ?? 0);
    if (
      !isAlive(target) ||
      target.kind !== 'monster' ||
      distance(target.pos, farm.anchor) > rules.radius
    ) {
      target = [...ctx.entities.values()]
        .filter(
          (t) =>
            isAlive(t) &&
            t.kind === 'monster' &&
            areHostile(e, t) &&
            distance(t.pos, farm.anchor) <= rules.radius &&
            !ctx.inSafeZone(t.pos) &&
            clearLine(ctx, e.pos, t.pos),
        )
        .sort((a, b) => distance(e.pos, a.pos) - distance(e.pos, b.pos))[0];
      e.combat.targetId = target?.id ?? null;
    }
    if (!target) {
      for (const loot of ctx.entities.values())
        if (loot.loot && distance(loot.pos, e.pos) < 2) tryPickup(ctx, e, loot);
      if (distance(e.pos, farm.anchor) > 1)
        e.movement.goal = { pos: { ...farm.anchor }, stopWithin: 0.5 };
      continue;
    }
    const edge = edgeDistance(e, target);
    if (e.stats.mp / e.stats.maxMp > rules.mpReserve) {
      for (const [id, ready] of e.skills) {
        const skill = ctx.content.skills.get(id);
        if (
          !skill ||
          ready > ctx.tick ||
          skill.mobility ||
          !skill.effects.some((f) => f.type === 'damage') ||
          skill.effects.some((f) => f.type === 'dash') ||
          skill.mpCost > e.stats.mp - e.stats.maxMp * rules.mpReserve
        )
          continue;
        const reach = skill.targeting === 'self' ? effectRadius(skill) : skill.range;
        if (
          edge <= reach &&
          clearLine(ctx, e.pos, target.pos) &&
          requestCast(ctx, e, id, target.id, { ...target.pos })
        )
          break;
      }
    }
    if (e.cast) continue;
    const optimal = e.player.ranged
      ? e.player.ranged.def.projectile.range * e.player.ranged.def.falloffFrom * 0.8
      : e.combat.range * 0.65;
    if (edge > optimal + 0.3)
      e.movement.goal = {
        pos: { ...target.pos },
        stopWithin: optimal + e.movement.radius + target.movement.radius,
      };
    else e.movement.goal = null;
  }
}
