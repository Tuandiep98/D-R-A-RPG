import { inAttackRange, type SimContext } from '../context';

/** Respawns dead entities whose timer elapsed, then derives each entity's action. */
export function lifeSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    if (!e.life.alive && e.life.respawnAtTick !== null && ctx.tick >= e.life.respawnAtTick) {
      e.life.alive = true;
      e.life.respawnAtTick = null;
      e.life.lastAttackerId = null;
      e.stats.hp = e.stats.maxHp;
      e.pos = { ...e.life.spawnPos };
      e.movement.goal = null;
      e.combat.targetId = null;
      e.combat.nextAttackTick = 0;
      if (e.ai) {
        e.ai.state = 'idle';
        e.ai.nextWanderTick = ctx.tick + 20;
      }
      ctx.emit({ type: 'RESPAWN', id: e.id });
    }
  }
}

export function actionSystem(ctx: SimContext): void {
  for (const e of ctx.entities.values()) {
    if (!e.life.alive) {
      e.action = 'dead';
      continue;
    }
    const target = e.combat.targetId !== null ? ctx.entities.get(e.combat.targetId) : undefined;
    if (e.movement.moved) e.action = 'move';
    else if (target?.life.alive && inAttackRange(e, target)) e.action = 'combat';
    else e.action = 'idle';
  }
}
