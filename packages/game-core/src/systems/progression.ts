import type { ProgressionDef, StatBonus } from '@rpg/game-data';
import type { SimContext } from '../context';
import type { Entity } from '../entity';

export const xpToNext = (prog: ProgressionDef, level: number): number =>
  level >= prog.maxLevel ? 0 : Math.round(prog.xpCurve.base * level ** prog.xpCurve.exponent);

const ZERO: StatBonus = { hp: 0, mp: 0, attack: 0, defense: 0, critChance: 0, speed: 0 };

function addBonus(into: StatBonus, b: Partial<StatBonus> | undefined, times = 1): void {
  if (!b) return;
  into.hp += (b.hp ?? 0) * times;
  into.mp += (b.mp ?? 0) * times;
  into.attack += (b.attack ?? 0) * times;
  into.defense += (b.defense ?? 0) * times;
  into.critChance += (b.critChance ?? 0) * times;
  into.speed += (b.speed ?? 0) * times;
}

/** Sum of level growth and equipped item bonuses. */
export function playerBonus(ctx: SimContext, e: Entity): StatBonus {
  const total = { ...ZERO };
  const p = e.player;
  if (!p) return total;
  const def = ctx.content.characters.get(p.characterId);
  const prog = def && ctx.content.progression.get(def.progressionId);
  if (prog) addBonus(total, prog.perLevel, e.level - 1);
  const rules = [...ctx.content.upgrades.values()][0];
  for (const instanceId of Object.values(p.equipment)) {
    const inv = p.inventory.find((i) => i.instanceId === instanceId);
    const item = inv && ctx.content.items.get(inv.itemId);
    // +N enhancement scales the item's own bonus (equipment_contract.md).
    const mult = 1 + (rules?.bonusPerLevel ?? 0) * (inv?.enhance ?? 0);
    addBonus(total, item?.bonus, mult);
  }
  return total;
}

/**
 * Recomputes derived stats from base + level + equipment. Current HP/MP keep
 * their ratio so equipping an item never acts as a free heal or a hit.
 */
export function recomputePlayerStats(ctx: SimContext, e: Entity): void {
  const p = e.player;
  if (!p) return;
  const def = ctx.content.characters.get(p.characterId);
  if (!def) return;
  const bonus = playerBonus(ctx, e);
  const hpRatio = e.stats.maxHp > 0 ? e.stats.hp / e.stats.maxHp : 1;
  const mpRatio = e.stats.maxMp > 0 ? e.stats.mp / e.stats.maxMp : 1;
  e.stats.maxHp = Math.max(1, Math.round(def.stats.hp + bonus.hp));
  e.stats.maxMp = Math.max(0, Math.round(def.stats.mp + bonus.mp));
  e.baseAttack = def.stats.attack + bonus.attack;
  e.stats.attack = e.baseAttack;
  e.stats.defense = def.stats.defense + bonus.defense;
  e.stats.critChance = Math.min(1, def.stats.critChance + bonus.critChance);
  e.movement.baseSpeed = def.movement.speed + bonus.speed;
  e.movement.speed = e.movement.baseSpeed;
  if (e.life.alive) {
    e.stats.hp = Math.min(e.stats.maxHp, Math.max(1, Math.round(hpRatio * e.stats.maxHp)));
    e.stats.mp = Math.min(e.stats.maxMp, Math.round(mpRatio * e.stats.maxMp));
  }
}

export function grantXp(ctx: SimContext, e: Entity, amount: number): void {
  const p = e.player;
  if (!p || amount <= 0) return;
  const def = ctx.content.characters.get(p.characterId);
  const prog = def && ctx.content.progression.get(def.progressionId);
  if (!prog) return;
  if (e.level >= prog.maxLevel) return;
  p.xp += amount;
  ctx.emit({ type: 'XP', id: e.id, amount });
  let leveled = false;
  for (
    let need = xpToNext(prog, e.level);
    need > 0 && p.xp >= need;
    need = xpToNext(prog, e.level)
  ) {
    p.xp -= need;
    e.level++;
    leveled = true;
    ctx.emit({ type: 'LEVEL_UP', id: e.id, level: e.level });
  }
  if (e.level >= prog.maxLevel) p.xp = 0;
  if (leveled) {
    recomputePlayerStats(ctx, e);
    e.stats.hp = e.stats.maxHp;
    e.stats.mp = e.stats.maxMp;
  }
}
