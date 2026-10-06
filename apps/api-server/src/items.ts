import type { PlayerSave } from '@rpg/game-core';
import { INVENTORY_CAPACITY } from '@rpg/game-core';
import type { ItemDef } from '@rpg/game-data';

/**
 * Offline item grant for admin tools: same stacking rules as the game
 * (game-core inventory), applied to a saved character.
 */
export function addItemToSave(save: PlayerSave, item: ItemDef, count: number): PlayerSave {
  const inventory = save.inventory.map((i) => ({ ...i }));
  let left = count;
  for (const slot of inventory) {
    if (left === 0) break;
    if (slot.itemId !== item.id || slot.count >= item.maxStack) continue;
    const add = Math.min(left, item.maxStack - slot.count);
    slot.count += add;
    left -= add;
  }
  while (left > 0) {
    if (inventory.length >= INVENTORY_CAPACITY) throw new Error('inventory full');
    const add = Math.min(left, item.maxStack);
    inventory.push({ instanceId: crypto.randomUUID(), itemId: item.id, count: add });
    left -= add;
  }
  return { ...save, inventory };
}
