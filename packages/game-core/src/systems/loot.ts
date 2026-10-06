import type { LootTableDef } from '@rpg/game-data';
import { INTERACT_RANGE, type SimContext } from '../context';
import type { Entity } from '../entity';
import { distance } from '../math';
import { secondsToTicks } from '../time';
import { addItem } from './inventory';

/** Loot belongs to the top damager for this long, then anyone may take it. */
const OWNER_SECONDS = 30;
const LIFETIME_SECONDS = 90;

export function dropLoot(
  ctx: SimContext,
  monster: Entity,
  owner: Entity,
  table: LootTableDef,
): void {
  for (const entry of table.entries) {
    if (!ctx.rng.chance(entry.chance)) continue;
    const count = ctx.rng.int(entry.min, entry.max);
    const angle = ctx.rng.range(0, Math.PI * 2);
    const r = ctx.rng.range(0.4, 1.4);
    ctx.addEntity((id) =>
      makeInert(
        id,
        'loot',
        entry.itemId,
        {
          x: monster.pos.x + Math.sin(angle) * r,
          z: monster.pos.z + Math.cos(angle) * r,
        },
        {
          loot: {
            itemId: entry.itemId,
            count,
            ownerId: owner.id,
            freeAtTick: ctx.tick + secondsToTicks(OWNER_SECONDS),
            expiresAtTick: ctx.tick + secondsToTicks(LIFETIME_SECONDS),
          },
        },
      ),
    );
  }
}

/** Shared factory for loot and portal entities. */
export function makeInert(
  id: number,
  kind: 'loot' | 'portal',
  defId: string,
  pos: { x: number; z: number },
  extra: Partial<Pick<Entity, 'loot' | 'portal'>>,
): Entity {
  return {
    id,
    kind,
    defId,
    faction: 'neutral',
    inert: true,
    level: 0,
    pos: { ...pos },
    yaw: 0,
    movement: {
      baseSpeed: 0,
      speed: 0,
      radius: 0.3,
      goal: null,
      path: null,
      pathTick: 0,
      pathGoal: null,
      moved: false,
    },
    stats: {
      hp: 0,
      maxHp: 0,
      mp: 0,
      maxMp: 0,
      attack: 0,
      defense: 0,
      critChance: 0,
      critMultiplier: 1,
      hpRegen: 0,
      mpRegen: 0,
    },
    baseAttack: 0,
    combat: {
      range: 0,
      attackIntervalTicks: 1,
      nextAttackTick: 0,
      targetId: null,
      lastCombatTick: 0,
    },
    life: {
      alive: true,
      respawnTicks: 0,
      respawnAtTick: null,
      spawnPos: { ...pos },
      lastAttackerId: null,
      damageBy: new Map(),
    },
    ai: null,
    skills: new Map(),
    cast: null,
    pending: null,
    player: null,
    loot: extra.loot ?? null,
    portal: extra.portal ?? null,
    action: 'idle',
  };
}

/** Despawns expired loot. */
export function lootSystem(ctx: SimContext): void {
  for (const e of [...ctx.entities.values()]) {
    if (e.loot && ctx.tick >= e.loot.expiresAtTick) ctx.removeEntity(e.id);
  }
}

/** Tries to pick up `loot`; returns false if the player must walk closer first. */
export function tryPickup(ctx: SimContext, player: Entity, loot: Entity): boolean {
  if (!loot.loot) return true;
  if (distance(player.pos, loot.pos) > INTERACT_RANGE) return false;
  if (
    loot.loot.ownerId !== null &&
    loot.loot.ownerId !== player.id &&
    ctx.tick < loot.loot.freeAtTick
  ) {
    ctx.notice(player.id, 'not_owner');
    return true;
  }
  const left = addItem(ctx, player, loot.loot.itemId, loot.loot.count);
  if (left === 0) ctx.removeEntity(loot.id);
  else loot.loot.count = left;
  return true;
}
