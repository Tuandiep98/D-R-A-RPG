import type { CultivationNodeDef } from '@rpg/game-data';
import type { SimContext } from '../context';
import type { Entity } from '../entity';
import { secondsToTicks } from '../time';
import { countItem, grantGold, removeItems } from './inventory';
import { cultivationLoad, realmOf, realmRank, recomputePlayerStats, rules } from './progression';

/** Opening nodes and breaking through (master plan §59–62, §71–73). */

const questDone = (e: Entity, questId: string): boolean =>
  !!e.player?.quests.some((q) => q.questId === questId && q.status === 'done');

const hasMaterials = (e: Entity, mats: readonly { itemId: string; count: number }[]): boolean =>
  mats.every((m) => countItem(e, m.itemId) >= m.count);

/** Why a node cannot be opened right now, or null if it can. */
export function nodeBlocker(
  ctx: SimContext,
  e: Entity,
  node: CultivationNodeDef,
):
  | 'already_open'
  | 'realm_too_low'
  | 'requirements_unmet'
  | 'capacity_full'
  | 'missing_materials'
  | 'not_enough_gold'
  | null {
  const p = e.player;
  if (!p) return 'requirements_unmet';
  if (p.nodes.includes(node.id)) return 'already_open';
  if (realmRank(ctx, node.realm) > e.realm) return 'realm_too_low';
  if (!node.requires.every((r) => p.nodes.includes(r))) return 'requirements_unmet';
  if (!node.quests.every((q) => questDone(e, q))) return 'requirements_unmet';
  const realm = realmOf(ctx, e.realm);
  const load = cultivationLoad(ctx, p.nodes);
  if (
    !realm ||
    load.meridian + node.meridian > realm.meridianCapacity ||
    load.body + node.body > realm.bodyLoad
  )
    return 'capacity_full';
  if (!hasMaterials(e, node.cost.materials)) return 'missing_materials';
  if (p.gold < node.cost.gold) return 'not_enough_gold';
  return null;
}

export function openNode(ctx: SimContext, e: Entity, nodeId: string): boolean {
  const p = e.player;
  const node = ctx.content.cultivation.get(nodeId);
  if (!p || !node) {
    ctx.notice(e.id, 'invalid');
    return false;
  }
  const blocker = nodeBlocker(ctx, e, node);
  if (blocker) {
    ctx.notice(e.id, blocker === 'already_open' ? 'invalid' : blocker);
    return false;
  }
  if (
    node.cost.gold > 0 &&
    !grantGold(ctx, e, -node.cost.gold, 'cultivation', `node:${p.characterId}:${node.id}`)
  )
    return false;
  for (const m of node.cost.materials) removeItems(ctx, e, m.itemId, m.count);
  p.nodes.push(node.id);
  recomputePlayerStats(ctx, e);
  ctx.emit({ type: 'NODE_OPENED', ownerId: e.id, nodeId: node.id });
  return true;
}

/** Success chance of breaking through from the current realm (0 when impossible). */
export function breakthroughChance(ctx: SimContext, e: Entity): number {
  const bt = realmOf(ctx, e.realm + 1)?.breakthrough;
  if (!bt || !e.player) return 0;
  const extra = Math.max(0, e.player.nodes.length - bt.minNodes);
  return Math.min(1, bt.baseChance + bt.chancePerExtraNode * extra);
}

/**
 * Breakthrough event (master plan §59–62). Requirements are checked first;
 * the attempt always spends its cost. Failure keeps every node and the realm
 * and applies a temporary backlash.
 */
export function breakthrough(ctx: SimContext, e: Entity): boolean {
  const p = e.player;
  const next = realmOf(ctx, e.realm + 1);
  const bt = next?.breakthrough;
  if (!p || !next || !bt) {
    ctx.notice(e.id, 'max_realm');
    return false;
  }
  if (rules(ctx)?.breakthroughInSafeZone && !ctx.inSafeZone(e.pos)) {
    ctx.notice(e.id, 'not_in_safe_zone');
    return false;
  }
  if (ctx.tick < p.backlashUntilTick) {
    ctx.notice(e.id, 'backlash');
    return false;
  }
  if (p.nodes.length < bt.minNodes || !bt.quests.every((q) => questDone(e, q))) {
    ctx.notice(e.id, 'requirements_unmet');
    return false;
  }
  if (!hasMaterials(e, bt.materials)) {
    ctx.notice(e.id, 'missing_materials');
    return false;
  }
  if (p.gold < bt.gold) {
    ctx.notice(e.id, 'not_enough_gold');
    return false;
  }
  const chance = breakthroughChance(ctx, e);
  const key = `breakthrough:${p.characterId}:${next.id}:${ctx.tick}`;
  if (bt.gold > 0 && !grantGold(ctx, e, -bt.gold, 'breakthrough', key)) return false;
  for (const m of bt.materials) removeItems(ctx, e, m.itemId, m.count);

  const success = ctx.rng.chance(chance);
  if (success) {
    e.realm++;
    recomputePlayerStats(ctx, e);
    e.stats.hp = e.stats.maxHp;
    e.stats.mp = e.stats.maxMp;
  } else {
    p.backlashUntilTick = ctx.tick + secondsToTicks(bt.backlashSeconds);
  }
  ctx.emit({ type: 'BREAKTHROUGH', id: e.id, realm: e.realm, success });
  return success;
}
