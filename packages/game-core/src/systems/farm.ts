import { areHostile, edgeDistance, isAlive, isStaggered, type SimContext } from '../context';
import type { Entity } from '../entity';
import { clearLine, coneTouches } from '../geometry';
import { distance, sub, yawOf } from '../math';
import { secondsToTicks, TICK_RATE } from '../time';
import { INVENTORY_CAPACITY } from './inventory';
import { tryPickup } from './loot';
import { requestMobility } from './mobility';
import { effectRadius, ownedFields, requestCast } from './skills';

/** Stop future auto input; a strike already committed keeps its normal cost and impact. */
function stopFollowing(e: Entity): void {
  e.combat.targetId = null;
  e.movement.goal = null;
  e.movement.path = null;
  e.pending = null;
  e.actionBuffer = null;
  if (e.player) {
    e.player.farm.approach = null;
    e.player.farm.observedTarget = null;
    e.player.combo.buffered = false;
    e.player.trigger.held = false;
    e.player.trigger.queued = false;
    e.player.trigger.burstLeft = 0;
  }
}

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
      ctx.notice(
        e.id,
        e.player.inventory.length >= INVENTORY_CAPACITY ? 'inventory_full' : 'farm_low_hp',
      );
      stopFollowing(e);
      continue;
    }
    if (ctx.tick % secondsToTicks(rules.thinkInterval) !== 0 || e.mobility || isStaggered(ctx, e))
      continue;
    const goal = e.movement.goal;
    if (!goal || e.cast || e.swing || distance(e.pos, goal.pos) <= goal.stopWithin) {
      farm.progress = null;
    } else if (!farm.progress || distance(e.pos, farm.progress.pos) >= rules.stuckDistance) {
      farm.progress = { pos: { ...e.pos }, tick: ctx.tick };
    } else if (ctx.tick >= farm.progress.tick + secondsToTicks(rules.stuckSeconds)) {
      farm.enabled = false;
      farm.progress = null;
      stopFollowing(e);
      ctx.notice(e.id, 'farm_stuck');
      continue;
    }
    if (distance(e.pos, farm.anchor) > rules.leash) {
      stopFollowing(e);
      e.movement.goal = { pos: { ...farm.anchor }, stopWithin: 0.4 };
      continue;
    }
    // A telegraph must have existed for the configured reaction time before auto reacts.
    let threat = false;
    for (const m of ctx.entities.values()) {
      if (!isAlive(m) || !areHostile(e, m) || !clearLine(ctx, e.pos, m.pos)) continue;
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
    if (threat && !e.shield) {
      let guarded = false;
      for (const [id, ready] of e.skills) {
        const skill = ctx.content.skills.get(id);
        if (
          skill?.autoPolicy === 'defense' &&
          ready <= ctx.tick &&
          skill.mpCost <= e.stats.mp - e.stats.maxMp * rules.mpReserve &&
          requestCast(ctx, e, id, null, null)
        ) {
          guarded = true;
          break;
        }
      }
      if (guarded) continue;
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
      !areHostile(e, target) ||
      distance(target.pos, farm.anchor) > rules.radius ||
      ctx.inSafeZone(target.pos) ||
      !clearLine(ctx, e.pos, target.pos)
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
      farm.approach = null;
      farm.observedTarget = null;
      e.movement.goal = null;
      e.movement.path = null;
      for (const loot of ctx.entities.values())
        if (loot.loot && distance(loot.pos, e.pos) < 2) tryPickup(ctx, e, loot);
      if (distance(e.pos, farm.anchor) > 1)
        e.movement.goal = { pos: { ...farm.anchor }, stopWithin: 0.5 };
      continue;
    }
    const edge = edgeDistance(e, target);
    const observed = farm.observedTarget;
    farm.observedTarget = { targetId: target.id, pos: { ...target.pos }, tick: ctx.tick };
    if (e.stats.mp / e.stats.maxMp > rules.mpReserve) {
      for (const [id, ready] of e.skills) {
        const skill = ctx.content.skills.get(id);
        if (
          skill?.autoPolicy !== 'offense' ||
          ready > ctx.tick ||
          skill.mobility ||
          !skill.effects.some(
            (f) => f.type === 'damage' || f.type === 'pulse_fields' || f.type === 'pet_attack',
          ) ||
          skill.effects.some((f) => f.type === 'dash') ||
          skill.mpCost > e.stats.mp - e.stats.maxMp * rules.mpReserve
        )
          continue;
        const triggersField = skill.effects.some((f) => f.type === 'pulse_fields');
        if (
          triggersField &&
          !ownedFields(ctx, e).some((field) => {
            const fieldSkill = ctx.content.skills.get(field.cast.skillId);
            return (
              field.cast.point &&
              fieldSkill &&
              distance(field.cast.point, target.pos) <=
                effectRadius(fieldSkill) + target.movement.radius
            );
          })
        )
          continue;
        const directional = skill.delivery === 'cone' || skill.delivery === 'line';
        let aim = { ...target.pos };
        if (skill.autoAim && observed?.targetId === target.id) {
          const elapsedTicks = ctx.tick - observed.tick;
          if (elapsedTicks > 0 && elapsedTicks <= secondsToTicks(rules.thinkInterval) * 2) {
            const delta = sub(target.pos, observed.pos);
            const elapsed = elapsedTicks / TICK_RATE;
            const moved = distance(target.pos, observed.pos);
            // Position samples only: no reading future intent, path or steering direction.
            // Bound observed speed so teleports/corrections cannot turn into extreme prediction.
            const speedScale = Math.min(
              1,
              (target.movement.speed * elapsed) / Math.max(moved, 1e-9),
            );
            const horizon = Math.min(
              skill.autoAim.maxSeconds,
              Math.round((skill.timeline?.windup ?? skill.castTime) * TICK_RATE) / TICK_RATE +
                distance(e.pos, target.pos) / skill.projectileSpeed,
            );
            const leadScale = (horizon * skill.autoAim.weight * speedScale) / elapsed;
            const bound = Math.min(
              1,
              skill.autoAim.maxDistance / Math.max(moved * leadScale, 1e-9),
            );
            const candidate = {
              x: target.pos.x + delta.x * leadScale * bound,
              z: target.pos.z + delta.z * leadScale * bound,
            };
            if (
              distance(e.pos, candidate) <= skill.range + e.movement.radius &&
              clearLine(ctx, e.pos, candidate)
            )
              aim = candidate;
          }
        }
        if (skill.field && skill.autoAnchorRadius !== undefined) {
          if (ownedFields(ctx, e).length >= skill.field.maxOwned) continue;
          const offset = sub(target.pos, farm.anchor);
          const length = distance(target.pos, farm.anchor);
          const scale = Math.min(1, skill.autoAnchorRadius / Math.max(length, 1e-9));
          aim = {
            x: farm.anchor.x + offset.x * scale,
            z: farm.anchor.z + offset.z * scale,
          };
          // A bounded setup must still cover an observed enemy and be reachable from the caster.
          // Do not chase the enemy with a field or reserve an out-of-range pending cast.
          if (
            distance(aim, target.pos) > effectRadius(skill) + target.movement.radius ||
            distance(e.pos, aim) > skill.range + e.movement.radius ||
            ctx.inSafeZone(aim) ||
            !clearLine(ctx, e.pos, aim) ||
            !clearLine(ctx, aim, target.pos)
          )
            continue;
        }
        const reach =
          skill.targeting === 'self' && !triggersField
            ? directional
              ? (skill.impactRange ?? skill.range)
              : effectRadius(skill)
            : skill.range;
        // Aim a directional self cast at the observed target before committing its geometry.
        // Neither this aim nor an accepted cast guarantees a hit at the later impact.
        const previousYaw = e.yaw;
        if (directional && skill.targeting === 'self') e.yaw = yawOf(sub(target.pos, e.pos));
        if (
          edge <= reach &&
          clearLine(ctx, e.pos, target.pos) &&
          requestCast(ctx, e, id, target.id, aim)
        )
          break;
        e.yaw = previousYaw;
      }
    }
    if (e.cast) continue;
    const optimal = e.player.ranged
      ? e.player.ranged.def.projectile.range * e.player.ranged.def.falloffFrom * 0.8
      : e.combat.range * 0.65;
    if (farm.approach?.targetId !== target.id)
      farm.approach = { targetId: target.id, moving: false };
    // Enter at the outer edge, remain in approach until the inner edge.
    // Small target motion inside the band does not restart/stop movement each think tick.
    if (edge > optimal + rules.rangeHysteresis) farm.approach.moving = true;
    else if (edge <= optimal) farm.approach.moving = false;
    if (farm.approach.moving)
      e.movement.goal = {
        pos: { ...target.pos },
        stopWithin: optimal + e.movement.radius + target.movement.radius,
      };
    else e.movement.goal = null;
  }
}
