import { inAttackRange, type SimContext } from "../context";
import { newTriggerState } from "../entity";
import { TICK_RATE } from "../time";
import { OUT_OF_COMBAT_TICKS } from "./combat";

/** Respawns dead entities whose timer elapsed and applies once-per-second regeneration. */
export function lifeSystem(ctx: SimContext): void {
  const regenTick = ctx.tick % TICK_RATE === 0;
  for (const e of ctx.entities.values()) {
    if (e.inert) continue;
    if (
      !e.life.alive &&
      e.life.respawnAtTick !== null &&
      ctx.tick >= e.life.respawnAtTick
    ) {
      e.life.alive = true;
      e.life.respawnAtTick = null;
      e.life.lastAttackerId = null;
      e.life.damageBy.clear();
      e.stats.hp = e.stats.maxHp;
      e.stats.mp = e.stats.maxMp;
      e.stats.attack = e.baseAttack;
      e.movement.speed = e.movement.baseSpeed;
      e.pos = { ...e.life.spawnPos };
      e.movement.goal = null;
      e.movement.path = null;
      e.combat.targetId = null;
      e.combat.nextAttackTick = 0;
      e.cast = null;
      e.swing = null;
      if (e.player) {
        e.player.combo = {
          nextStep: 0,
          lastEndTick: -1_000_000,
          buffered: false,
          aim: null,
        };
        // Back with full magazines and cold weapons.
        e.player.weapons.clear();
        e.player.trigger = newTriggerState();
      }
      e.pending = null;
      if (e.ai) {
        e.ai.state = "idle";
        e.ai.phase = 0;
        e.ai.nextWanderTick = ctx.tick + 20;
        const def = ctx.content.monsters.get(e.defId);
        if (def) e.skills = new Map(def.skills.map((s) => [s, ctx.tick + 40]));
      }
      ctx.emit({ type: "RESPAWN", id: e.id });
      continue;
    }
    if (!regenTick || !e.life.alive) continue;
    // MP always trickles back; HP only out of combat (players) so fights matter.
    if (e.stats.mpRegen > 0)
      e.stats.mp = Math.min(
        e.stats.maxMp,
        Math.round(e.stats.mp + e.stats.mpRegen),
      );
    const outOfCombat =
      ctx.tick - e.combat.lastCombatTick >= OUT_OF_COMBAT_TICKS;
    if (e.stats.hpRegen > 0 && outOfCombat && e.stats.hp < e.stats.maxHp) {
      e.stats.hp = Math.min(
        e.stats.maxHp,
        Math.round(e.stats.hp + e.stats.hpRegen),
      );
    }
  }
}

export function actionSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    if (e.inert) continue;
    if (!e.life.alive) {
      e.action = "dead";
      continue;
    }
    const target =
      e.combat.targetId !== null
        ? ctx.entities.get(e.combat.targetId)
        : undefined;
    if (e.cast || e.swing) e.action = "cast";
    else if (e.movement.moved) e.action = "move";
    else if (target?.life.alive && inAttackRange(e, target))
      e.action = "combat";
    else e.action = "idle";
  }
}
