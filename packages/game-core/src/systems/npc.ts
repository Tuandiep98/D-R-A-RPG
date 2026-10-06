import type { QuestDef } from '@rpg/game-data';
import type { EntityId, ItemInstanceId } from '@rpg/game-protocol';
import { INTERACT_RANGE, type SimContext } from '../context';
import type { Entity, QuestState } from '../entity';
import { distance } from '../math';
import { addItem, canAdd, countItem, grantGold, removeItems } from './inventory';
import { grantXp, recomputePlayerStats } from './progression';

/** NPC actions are allowed a little beyond pickup reach (dialog stays open while you shuffle). */
const NPC_RANGE = INTERACT_RANGE + 1.5;

/** Resolves the NPC a player is talking to, enforcing range. */
function npcFor(ctx: SimContext, player: Entity, npcEntityId: EntityId) {
  const npc = ctx.entities.get(npcEntityId);
  const def = npc?.npc ? ctx.content.npcs.get(npc.npc.npcId) : undefined;
  if (!npc || !def) {
    ctx.notice(player.id, 'invalid');
    return null;
  }
  if (distance(player.pos, npc.pos) > NPC_RANGE) {
    ctx.notice(player.id, 'too_far');
    return null;
  }
  return { npc, def };
}

export function openNpc(ctx: SimContext, player: Entity, npc: Entity): void {
  if (!npc.npc || !player.player) return;
  ctx.emit({ type: 'NPC_OPEN', ownerId: player.id, npcEntityId: npc.id, npcId: npc.npc.npcId });
  // Talking to an NPC completes "talk" objectives for it.
  for (const q of player.player.quests) {
    if (q.status !== 'active') continue;
    const def = ctx.content.quests.get(q.questId);
    def?.objectives.forEach((o, i) => {
      if (o.type === 'talk' && o.npcId === npc.npc?.npcId) q.progress[i] = 1;
    });
    refreshStatus(ctx, player, q);
  }
}

// ---- Quests ---------------------------------------------------------------

/** Kill/talk progress is stored; collect progress is read from the inventory. */
export function questProgress(ctx: SimContext, player: Entity, q: QuestState): number[] {
  const def = ctx.content.quests.get(q.questId);
  if (!def) return q.progress;
  return def.objectives.map((o, i) =>
    o.type === 'collect' ? Math.min(o.count, countItem(player, o.itemId)) : (q.progress[i] ?? 0),
  );
}

function objectivesMet(ctx: SimContext, player: Entity, q: QuestState, def: QuestDef): boolean {
  const progress = questProgress(ctx, player, q);
  return def.objectives.every((o, i) => (progress[i] ?? 0) >= (o.type === 'talk' ? 1 : o.count));
}

function refreshStatus(ctx: SimContext, player: Entity, q: QuestState): void {
  if (q.status === 'done') return;
  const def = ctx.content.quests.get(q.questId);
  if (!def) return;
  const next = objectivesMet(ctx, player, q, def) ? 'ready' : 'active';
  if (next !== q.status) {
    q.status = next;
    ctx.emit({ type: 'QUEST', ownerId: player.id, questId: q.questId, status: next });
  }
}

export function acceptQuest(
  ctx: SimContext,
  player: Entity,
  npcEntityId: EntityId,
  questId: string,
): boolean {
  const p = player.player;
  const found = npcFor(ctx, player, npcEntityId);
  const def = ctx.content.quests.get(questId);
  if (!p || !found || !def) return false;
  const available =
    found.def.quests.includes(questId) &&
    def.giverNpcId === found.def.id &&
    player.level >= def.level &&
    !p.quests.some((q) => q.questId === questId) &&
    def.requires.every((r) => p.quests.some((q) => q.questId === r && q.status === 'done'));
  if (!available) {
    ctx.notice(player.id, 'quest_unavailable');
    return false;
  }
  const q: QuestState = { questId, status: 'active', progress: def.objectives.map(() => 0) };
  p.quests.push(q);
  ctx.emit({ type: 'QUEST', ownerId: player.id, questId, status: 'active' });
  refreshStatus(ctx, player, q);
  return true;
}

export function turnInQuest(
  ctx: SimContext,
  player: Entity,
  npcEntityId: EntityId,
  questId: string,
): boolean {
  const p = player.player;
  const found = npcFor(ctx, player, npcEntityId);
  const def = ctx.content.quests.get(questId);
  const q = p?.quests.find((x) => x.questId === questId);
  if (!p || !found || !def || !q || q.status === 'done') return false;
  if ((def.turnInNpcId ?? def.giverNpcId) !== found.def.id) {
    ctx.notice(player.id, 'quest_unavailable');
    return false;
  }
  if (!objectivesMet(ctx, player, q, def)) {
    ctx.notice(player.id, 'quest_incomplete');
    return false;
  }
  const rewardItems = def.rewards.items.map((i) => ({ itemId: i.itemId, count: i.count }));
  if (!canAdd(ctx, player, rewardItems)) {
    ctx.notice(player.id, 'inventory_full');
    return false;
  }
  if (def.consumeItems) {
    for (const o of def.objectives)
      if (o.type === 'collect') removeItems(ctx, player, o.itemId, o.count);
  }
  q.status = 'done';
  ctx.emit({ type: 'QUEST', ownerId: player.id, questId, status: 'done' });
  grantXp(ctx, player, def.rewards.xp);
  if (def.rewards.gold > 0)
    grantGold(ctx, player, def.rewards.gold, 'quest', `quest:${p.characterId}:${questId}`);
  for (const it of rewardItems) addItem(ctx, player, it.itemId, it.count);
  return true;
}

/** Called for every player credited with a kill. */
export function questOnKill(ctx: SimContext, player: Entity, monsterId: string): void {
  for (const q of player.player?.quests ?? []) {
    if (q.status === 'done') continue;
    const def = ctx.content.quests.get(q.questId);
    if (!def) continue;
    def.objectives.forEach((o, i) => {
      if (o.type === 'kill' && o.monsterId === monsterId)
        q.progress[i] = Math.min(o.count, (q.progress[i] ?? 0) + 1);
    });
    refreshStatus(ctx, player, q);
  }
}

/** Collect objectives change whenever items do. */
export function refreshQuests(ctx: SimContext, player: Entity): void {
  for (const q of player.player?.quests ?? []) refreshStatus(ctx, player, q);
}

// ---- Shop -------------------------------------------------------------------

export function shopBuy(
  ctx: SimContext,
  player: Entity,
  npcEntityId: EntityId,
  itemId: string,
  count: number,
): boolean {
  const found = npcFor(ctx, player, npcEntityId);
  const shop = found?.def.shopId ? ctx.content.shops.get(found.def.shopId) : undefined;
  const entry = shop?.items.find((i) => i.itemId === itemId);
  const p = player.player;
  if (!p || !shop || !entry) {
    if (found) ctx.notice(player.id, 'invalid');
    return false;
  }
  const cost = entry.price * count;
  if (p.gold < cost) {
    ctx.notice(player.id, 'not_enough_gold');
    return false;
  }
  if (!canAdd(ctx, player, [{ itemId, count }])) {
    ctx.notice(player.id, 'inventory_full');
    return false;
  }
  if (!grantGold(ctx, player, -cost, 'buy', `buy:${p.characterId}:${ctx.tick}:${itemId}:${count}`))
    return false;
  addItem(ctx, player, itemId, count);
  refreshQuests(ctx, player);
  return true;
}

export function shopSell(
  ctx: SimContext,
  player: Entity,
  npcEntityId: EntityId,
  instanceId: ItemInstanceId,
  count: number,
): boolean {
  const found = npcFor(ctx, player, npcEntityId);
  const shop = found?.def.shopId ? ctx.content.shops.get(found.def.shopId) : undefined;
  const p = player.player;
  const inv = p?.inventory.find((i) => i.instanceId === instanceId);
  const def = inv ? ctx.content.items.get(inv.itemId) : undefined;
  if (!p || !shop || !inv || !def) {
    if (found) ctx.notice(player.id, 'invalid');
    return false;
  }
  const equipped = Object.values(p.equipment).includes(instanceId);
  if (equipped || def.sellPrice <= 0 || count > inv.count) {
    ctx.notice(player.id, 'not_sellable');
    return false;
  }
  const price = Math.floor(def.sellPrice * shop.buybackRate) * count;
  inv.count -= count;
  if (inv.count === 0) p.inventory.splice(p.inventory.indexOf(inv), 1);
  if (price > 0)
    grantGold(
      ctx,
      player,
      price,
      'sell',
      `sell:${p.characterId}:${ctx.tick}:${instanceId}:${count}`,
    );
  refreshQuests(ctx, player);
  return true;
}

// ---- Crafting -------------------------------------------------------------

export function craft(
  ctx: SimContext,
  player: Entity,
  npcEntityId: EntityId,
  recipeId: string,
): boolean {
  const found = npcFor(ctx, player, npcEntityId);
  const recipe = ctx.content.recipes.get(recipeId);
  const p = player.player;
  if (!p || !found || !recipe || !found.def.recipes.includes(recipeId)) {
    if (found) ctx.notice(player.id, 'invalid');
    return false;
  }
  if (player.level < recipe.level) {
    ctx.notice(player.id, 'level_too_low');
    return false;
  }
  if (recipe.materials.some((m) => countItem(player, m.itemId) < m.count)) {
    ctx.notice(player.id, 'missing_materials');
    return false;
  }
  if (p.gold < recipe.gold) {
    ctx.notice(player.id, 'not_enough_gold');
    return false;
  }
  if (!canAdd(ctx, player, [recipe.result])) {
    ctx.notice(player.id, 'inventory_full');
    return false;
  }
  if (
    recipe.gold > 0 &&
    !grantGold(ctx, player, -recipe.gold, 'craft', `craft:${p.characterId}:${ctx.tick}:${recipeId}`)
  ) {
    return false;
  }
  for (const m of recipe.materials) removeItems(ctx, player, m.itemId, m.count);
  addItem(ctx, player, recipe.result.itemId, recipe.result.count);
  refreshQuests(ctx, player);
  return true;
}

// ---- Upgrade (enhancement) --------------------------------------------------

export function upgrade(
  ctx: SimContext,
  player: Entity,
  npcEntityId: EntityId,
  instanceId: ItemInstanceId,
): boolean {
  const found = npcFor(ctx, player, npcEntityId);
  const rules = [...ctx.content.upgrades.values()][0];
  const p = player.player;
  const inv = p?.inventory.find((i) => i.instanceId === instanceId);
  const def = inv ? ctx.content.items.get(inv.itemId) : undefined;
  if (!p || !found || !found.def.upgrades || !rules || !inv || def?.kind !== 'equipment') {
    if (found) ctx.notice(player.id, 'invalid');
    return false;
  }
  const level = inv.enhance ?? 0;
  const step = rules.steps[level];
  if (!step || level >= rules.maxLevel) {
    ctx.notice(player.id, 'max_level');
    return false;
  }
  if (step.materials.some((m) => countItem(player, m.itemId) < m.count)) {
    ctx.notice(player.id, 'missing_materials');
    return false;
  }
  if (p.gold < step.gold) {
    ctx.notice(player.id, 'not_enough_gold');
    return false;
  }
  if (
    step.gold > 0 &&
    !grantGold(ctx, player, -step.gold, 'upgrade', `upgrade:${instanceId}:${level}:${ctx.tick}`)
  ) {
    return false;
  }
  for (const m of step.materials) removeItems(ctx, player, m.itemId, m.count);
  // Failure keeps the item at its level (no downgrade or destruction in the MVP).
  const success = ctx.rng.chance(step.successRate);
  if (success) {
    inv.enhance = level + 1;
    if (Object.values(p.equipment).includes(instanceId)) recomputePlayerStats(ctx, player);
  }
  ctx.emit({
    type: 'UPGRADE_RESULT',
    ownerId: player.id,
    instanceId,
    success,
    level: inv.enhance ?? 0,
  });
  refreshQuests(ctx, player);
  return true;
}
