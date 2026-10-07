import type { ProgressionRules, RealmDef, StatBonus } from '@rpg/game-data';
import type { SimContext } from '../context';
import type { Entity } from '../entity';

/**
 * Character growth without levels (master plan §31–62): realms set the stat
 * floor and capacity, cultivation nodes build the character inside a realm,
 * and a breakthrough moves to the next realm (actions in ./cultivation.ts).
 */

const ZERO: StatBonus = {
  hp: 0,
  mp: 0,
  attack: 0,
  defense: 0,
  critChance: 0,
  speed: 0,
};

function addBonus(into: StatBonus, b: Partial<StatBonus> | undefined, times = 1): void {
  if (!b) return;
  into.hp += (b.hp ?? 0) * times;
  into.mp += (b.mp ?? 0) * times;
  into.attack += (b.attack ?? 0) * times;
  into.defense += (b.defense ?? 0) * times;
  into.critChance += (b.critChance ?? 0) * times;
  into.speed += (b.speed ?? 0) * times;
}

export const rules = (ctx: Pick<SimContext, 'content'>): ProgressionRules | undefined =>
  [...ctx.content.progression.values()][0];

export const realmOf = (ctx: Pick<SimContext, 'realms'>, rank: number): RealmDef | undefined =>
  ctx.realms[rank];

/** Rank of a realm id; unknown ids fall back to the starting realm. */
export const realmRank = (ctx: Pick<SimContext, 'realms'>, id: string | undefined): number =>
  Math.max(
    0,
    ctx.realms.findIndex((r) => r.id === id),
  );

/** Damage multiplier for `attacker` hitting `defender` (master plan §57). */
export function realmGapFactor(ctx: SimContext, attacker: Entity, defender: Entity): number {
  const gap = attacker.realm - defender.realm;
  if (gap === 0) return 1;
  const r = rules(ctx);
  if (!r) return 1;
  const table = gap < 0 ? r.realmGap.lower : r.realmGap.higher;
  return table[Math.min(Math.abs(gap), table.length) - 1] ?? 1;
}

/** Attack multiplier from a failed breakthrough, 1 when none is active. */
export function backlashFactor(ctx: SimContext, e: Entity): number {
  const p = e.player;
  if (!p || ctx.tick >= p.backlashUntilTick) return 1;
  return realmOf(ctx, e.realm + 1)?.breakthrough?.backlashAttack ?? 1;
}

/** Capacity used by open nodes. */
export function cultivationLoad(
  ctx: Pick<SimContext, 'content'>,
  nodes: readonly string[],
): { meridian: number; body: number } {
  let meridian = 0;
  let body = 0;
  for (const id of nodes) {
    const n = ctx.content.cultivation.get(id);
    meridian += n?.meridian ?? 0;
    body += n?.body ?? 0;
  }
  return { meridian, body };
}

/** Sum of realm, cultivation and equipped item bonuses. */
export function playerBonus(ctx: SimContext, e: Entity): StatBonus {
  const total = { ...ZERO };
  const p = e.player;
  if (!p) return total;
  addBonus(total, realmOf(ctx, e.realm)?.bonus);
  for (const id of p.nodes) addBonus(total, ctx.content.cultivation.get(id)?.bonus);
  const upgradeRules = [...ctx.content.upgrades.values()][0];
  for (const instanceId of Object.values(p.equipment)) {
    const inv = p.inventory.find((i) => i.instanceId === instanceId);
    const item = inv && ctx.content.items.get(inv.itemId);
    // +N enhancement scales the item's own bonus (equipment_contract.md).
    const mult = 1 + (upgradeRules?.bonusPerLevel ?? 0) * (inv?.enhance ?? 0);
    addBonus(total, item?.bonus, mult);
  }
  return total;
}

/**
 * Recomputes derived stats from base + realm + nodes + equipment, and the
 * skill bar (character skills, then skills unlocked by nodes). Current HP/MP
 * keep their ratio so equipping an item never acts as a free heal or a hit.
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
  // A main-hand ranged weapon replaces swings with shots (systems/ranged.ts);
  // auto-attacks then hold position inside its range instead of closing in.
  const mainId = p.equipment.main_hand;
  const main = mainId ? p.inventory.find((i) => i.instanceId === mainId) : undefined;
  const rangedId = main ? ctx.content.items.get(main.itemId)?.ranged : undefined;
  const ranged = rangedId ? ctx.content.ranged.get(rangedId) : undefined;
  p.ranged = mainId && ranged ? { instanceId: mainId, def: ranged } : null;
  e.combat.range = ranged ? ranged.projectile.range * 0.8 : def.combat.range;
  if (e.life.alive) {
    e.stats.hp = Math.min(e.stats.maxHp, Math.max(1, Math.round(hpRatio * e.stats.maxHp)));
    e.stats.mp = Math.min(e.stats.maxMp, Math.round(mpRatio * e.stats.maxMp));
  }
  const skills = new Map<string, number>();
  const learned = [
    ...def.skills,
    ...[...ctx.content.skills.values()].filter((s) => s.mobility).map((s) => s.id),
    ...p.nodes.flatMap((id) => ctx.content.cultivation.get(id)?.skillId ?? []),
  ];
  for (const s of learned) if (!skills.has(s)) skills.set(s, e.skills.get(s) ?? 0);
  e.skills = skills;
}
