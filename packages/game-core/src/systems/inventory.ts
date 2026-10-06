import type { ItemInstanceId } from '@rpg/game-protocol';
import type { SimContext } from '../context';
import type { Entity, EquipSlot, LedgerEntry } from '../entity';
import { secondsToTicks } from '../time';
import { recomputePlayerStats } from './progression';

export const INVENTORY_CAPACITY = 40;

/**
 * Adds items, stacking where possible. Returns how many did NOT fit.
 * Server authoritative: this is the only way items enter an inventory.
 */
export function addItem(ctx: SimContext, e: Entity, itemId: string, count: number): number {
  const p = e.player;
  const def = ctx.content.items.get(itemId);
  if (!p || !def || count <= 0) return count;
  let left = count;
  for (const slot of p.inventory) {
    if (left === 0) break;
    if (slot.itemId !== itemId || slot.count >= def.maxStack) continue;
    const add = Math.min(left, def.maxStack - slot.count);
    slot.count += add;
    left -= add;
  }
  while (left > 0 && p.inventory.length < INVENTORY_CAPACITY) {
    const add = Math.min(left, def.maxStack);
    p.inventory.push({ instanceId: ctx.newItemInstanceId(), itemId, count: add });
    left -= add;
  }
  const gained = count - left;
  if (gained > 0) ctx.emit({ type: 'ITEM_GAINED', ownerId: e.id, itemId, count: gained });
  if (left > 0) ctx.notice(e.id, 'inventory_full');
  return left;
}

export function grantGold(
  ctx: SimContext,
  e: Entity,
  amount: number,
  reason: LedgerEntry['reason'],
  key: string,
): boolean {
  const p = e.player;
  if (!p || amount === 0) return false;
  if (p.gold + amount < 0) return false;
  const ok = ctx.recordLedger({
    entityId: e.id,
    characterId: p.characterId,
    amount,
    balanceAfter: p.gold + amount,
    reason,
    key,
  });
  if (!ok) return false;
  p.gold += amount;
  ctx.emit({ type: 'GOLD', ownerId: e.id, amount, reason });
  return true;
}

export function equip(ctx: SimContext, e: Entity, instanceId: ItemInstanceId): boolean {
  const p = e.player;
  const inv = p?.inventory.find((i) => i.instanceId === instanceId);
  const def = inv && ctx.content.items.get(inv.itemId);
  if (!p || !def || def.kind !== 'equipment' || !def.slot) {
    ctx.notice(e.id, 'invalid');
    return false;
  }
  if (def.level > e.level) {
    ctx.notice(e.id, 'level_too_low');
    return false;
  }
  p.equipment[def.slot as EquipSlot] = instanceId;
  recomputePlayerStats(ctx, e);
  return true;
}

export function unequip(ctx: SimContext, e: Entity, slot: EquipSlot): boolean {
  const p = e.player;
  if (!p?.equipment[slot]) return false;
  delete p.equipment[slot];
  recomputePlayerStats(ctx, e);
  return true;
}

export function useItem(ctx: SimContext, e: Entity, instanceId: ItemInstanceId): boolean {
  const p = e.player;
  const idx = p ? p.inventory.findIndex((i) => i.instanceId === instanceId) : -1;
  const inv = p?.inventory[idx];
  const def = inv && ctx.content.items.get(inv.itemId);
  if (!p || !inv || !def || def.kind !== 'consumable') {
    if (p) ctx.notice(e.id, 'invalid');
    return false;
  }
  if (ctx.tick < p.itemReadyAtTick) {
    ctx.notice(e.id, 'cooldown');
    return false;
  }
  if (def.heal) {
    const amount = Math.min(e.stats.maxHp - e.stats.hp, Math.round(e.stats.maxHp * def.heal));
    e.stats.hp += amount;
    ctx.emit({ type: 'HEAL', targetId: e.id, amount });
  }
  p.itemReadyAtTick = ctx.tick + (def.cooldown > 0 ? secondsToTicks(def.cooldown) : 0);
  inv.count--;
  if (inv.count <= 0) {
    p.inventory.splice(idx, 1);
    for (const [slot, id] of Object.entries(p.equipment)) {
      if (id === instanceId) delete p.equipment[slot as EquipSlot];
    }
  }
  return true;
}
