import type { ForgeCost, ForgeQuality, ItemDef } from '@rpg/game-data';
import {
  durabilityOf,
  forgeRules,
  isBound,
  isNatal,
  maxDurability,
  QUALITY_ORDER,
  qualityOf,
  qualityRank,
  riteCounts,
  socketsOf,
} from '@rpg/game-data';
import type { EntityId, Intent, InventoryItem, ItemForge } from '@rpg/game-protocol';
import { areHostile, INTERACT_RANGE, type SimContext } from '../context';
import type { DamageSource, Entity } from '../entity';
import { clearLine } from '../geometry';
import { distance } from '../math';
import { applyDamage, rollHit } from './combat';
import { canAdd, countItem, grantGold, removeItems } from './inventory';
import { realmRank, recomputePlayerStats } from './progression';

/**
 * Tiệm Rèn — server-authoritative forge operations (docs/plan/06_forge_equipment_plan.md).
 * Every operation runs at an NPC with `forge: true`, pays through grantGold
 * (ledger + idempotency key) and rolls success on the World RNG. Items never
 * break: failures cost the payment and at most a level, a fodder item or
 * durability. Instance state is replaced, never mutated in place, so exported
 * saves never alias live state.
 */

type ForgeIntent = Extract<Intent, { type: 'FORGE' }>;
const NPC_RANGE = INTERACT_RANGE + 1.5;

/** Combat-module / ammo-chip / defense-module slot rules. */
function socketFits(def: ItemDef, type: string): boolean {
  if (type === 'combat') return def.slot === 'main_hand' && !def.ranged;
  if (type === 'ammo') return def.slot === 'main_hand' && !!def.ranged;
  if (type === 'defense') return def.slot !== 'main_hand' && def.slot !== 'artifact';
  return true;
}

function atForge(ctx: SimContext, player: Entity, npcEntityId: EntityId): boolean {
  const npc = ctx.entities.get(npcEntityId);
  const def = npc?.npc ? ctx.content.npcs.get(npc.npc.npcId) : undefined;
  if (!npc || !def?.forge) {
    ctx.notice(player.id, 'invalid');
    return false;
  }
  if (distance(player.pos, npc.pos) > NPC_RANGE) {
    ctx.notice(player.id, 'too_far');
    return false;
  }
  return true;
}

function canPay(ctx: SimContext, e: Entity, cost: ForgeCost, extra: ForgeCost[] = []): boolean {
  const need = new Map<string, number>();
  let gold = 0;
  for (const c of [cost, ...extra]) {
    gold += c.gold;
    for (const m of c.materials) need.set(m.itemId, (need.get(m.itemId) ?? 0) + m.count);
  }
  for (const [itemId, count] of need)
    if (countItem(e, itemId) < count) {
      ctx.notice(e.id, 'missing_materials');
      return false;
    }
  if ((e.player?.gold ?? 0) < gold) {
    ctx.notice(e.id, 'not_enough_gold');
    return false;
  }
  return true;
}

function pay(ctx: SimContext, e: Entity, cost: ForgeCost, key: string): boolean {
  if (cost.gold > 0 && !grantGold(ctx, e, -cost.gold, 'forge', key)) return false;
  for (const m of cost.materials) removeItems(ctx, e, m.itemId, m.count);
  return true;
}

function setForge(ctx: SimContext, e: Entity, inv: InventoryItem, next: ItemForge): void {
  inv.forge = next;
  if (Object.values(e.player?.equipment ?? {}).includes(inv.instanceId))
    recomputePlayerStats(ctx, e);
}

function result(
  ctx: SimContext,
  e: Entity,
  op: ForgeIntent['op'],
  inv: InventoryItem,
  success: boolean,
  detail?: string,
): true {
  ctx.emit({
    type: 'FORGE_RESULT',
    ownerId: e.id,
    op,
    instanceId: inv.instanceId,
    success,
    level: inv.enhance ?? 0,
    ...(detail ? { detail } : {}),
  });
  return true;
}

const equippedIds = (e: Entity) => new Set(Object.values(e.player?.equipment ?? {}));

export function forge(ctx: SimContext, e: Entity, intent: ForgeIntent): boolean {
  const p = e.player;
  const rules = forgeRules(ctx.content);
  if (!p || !rules || !atForge(ctx, e, intent.npcId)) return false;
  const inv = p.inventory.find((i) => i.instanceId === intent.instanceId);
  const def = inv ? ctx.content.items.get(inv.itemId) : undefined;
  if (!inv || !def || def.kind !== 'equipment') {
    ctx.notice(e.id, 'invalid');
    return false;
  }
  const quality = qualityOf(def, inv);
  const state: ItemForge = { ...inv.forge };
  const key = (op: string) => `forge:${p.characterId}:${inv.instanceId}:${op}:${ctx.tick}`;

  switch (intent.op) {
    // ---- Cường hoá: regular stats, wakes hidden stats -------------------------
    case 'enhance': {
      const level = inv.enhance ?? 0;
      const step = rules.enhance.steps[level];
      if (!step || level >= rules.qualities[quality].maxEnhance) {
        ctx.notice(e.id, 'max_level');
        return false;
      }
      if (!canPay(ctx, e, step) || !pay(ctx, e, step, key(`enhance${level}`))) return false;
      if (ctx.rng.chance(step.successRate)) {
        inv.enhance = level + 1;
        setForge(ctx, e, inv, state);
        return result(ctx, e, 'enhance', inv, true);
      }
      const ward = rules.enhance.wardItemId;
      if (level <= rules.enhance.safeLevel) return result(ctx, e, 'enhance', inv, false);
      if (intent.useWard && ward && countItem(e, ward) > 0) {
        removeItems(ctx, e, ward, 1);
        return result(ctx, e, 'enhance', inv, false, 'ward');
      }
      inv.enhance = level - 1;
      setForge(ctx, e, inv, state);
      return result(ctx, e, 'enhance', inv, false, 'dropped');
    }

    // ---- Tiến hoá: base stats, new name/tier (master plan §68) ----------------
    case 'evolve': {
      const stage = state.stage ?? 0;
      const next = def.evolution[stage];
      if (!next) {
        ctx.notice(e.id, 'max_level');
        return false;
      }
      if ((inv.enhance ?? 0) < next.minEnhance) {
        ctx.notice(e.id, 'requirements_unmet');
        return false;
      }
      if (qualityRank(quality) < qualityRank(next.minQuality)) {
        ctx.notice(e.id, 'quality_too_low');
        return false;
      }
      if (next.realm && realmRank(ctx, next.realm) > e.realm) {
        ctx.notice(e.id, 'realm_too_low');
        return false;
      }
      if (!canPay(ctx, e, next) || !pay(ctx, e, next, key(`evolve${stage}`))) return false;
      setForge(ctx, e, inv, { ...state, stage: stage + 1 });
      return result(ctx, e, 'evolve', inv, true, `stage:${stage + 1}`);
    }

    // ---- Khảm ------------------------------------------------------------------
    case 'socket': {
      const gemInv = p.inventory.find((i) => i.instanceId === intent.socketInstanceId);
      const gem = gemInv ? ctx.content.items.get(gemInv.itemId) : undefined;
      if (!gemInv || !gem?.socket || !socketFits(def, gem.socket.type)) {
        ctx.notice(e.id, 'invalid');
        return false;
      }
      if (qualityRank(quality) < qualityRank(gem.socket.minQuality)) {
        ctx.notice(e.id, 'quality_too_low');
        return false;
      }
      const sockets = socketsOf(ctx.content, def, inv);
      const free = sockets.indexOf(null);
      if (free < 0) {
        ctx.notice(e.id, 'no_socket');
        return false;
      }
      // One finisher per weapon: a second combat module would never fire.
      if (
        gem.socket.type === 'combat' &&
        sockets.some((id) => id && ctx.content.items.get(id)?.socket?.type === 'combat')
      ) {
        ctx.notice(e.id, 'invalid');
        return false;
      }
      removeItems(ctx, e, gem.id, 1);
      sockets[free] = gem.id;
      setForge(ctx, e, inv, { ...state, sockets });
      return result(ctx, e, 'socket', inv, true, gem.id);
    }
    case 'unsocket': {
      const sockets = socketsOf(ctx.content, def, inv);
      const index = intent.socketIndex ?? -1;
      const gemId = sockets[index];
      if (!gemId) {
        ctx.notice(e.id, 'invalid');
        return false;
      }
      if (!canAdd(ctx, e, [{ itemId: gemId, count: 1 }])) {
        ctx.notice(e.id, 'inventory_full');
        return false;
      }
      if (!canPay(ctx, e, rules.socketRemove) || !pay(ctx, e, rules.socketRemove, key('unsocket')))
        return false;
      sockets[index] = null;
      setForge(ctx, e, inv, { ...state, sockets });
      addSocketItem(ctx, e, gemId);
      return result(ctx, e, 'unsocket', inv, true, gemId);
    }

    // ---- Luyện khí (Tiên) / kỹ thuật (Cơ) ---------------------------------------
    case 'rite': {
      const rite = intent.riteId ? ctx.content.rites.get(intent.riteId) : undefined;
      if (!rite) {
        ctx.notice(e.id, 'invalid');
        return false;
      }
      if (qualityRank(quality) < qualityRank(rite.minQuality)) {
        ctx.notice(e.id, 'quality_too_low');
        return false;
      }
      if (rite.realm && realmRank(ctx, rite.realm) > e.realm) {
        ctx.notice(e.id, 'realm_too_low');
        return false;
      }
      const applied = riteCounts(ctx.content, state);
      const sameGroup = applied.find(({ rite: r }) => r.group === rite.group);
      const blocked =
        (rite.slots.length > 0 && (!def.slot || !rite.slots.includes(def.slot))) ||
        (sameGroup && (sameGroup.rite.id !== rite.id || sameGroup.times >= rite.maxTimes));
      if (blocked) {
        ctx.notice(e.id, 'requirements_unmet');
        return false;
      }
      if (
        rite.effects.natal &&
        p.inventory.some((i) => i.instanceId !== inv.instanceId && isNatal(ctx.content, i))
      ) {
        ctx.notice(e.id, 'natal_taken');
        return false;
      }
      const blood = Math.floor(e.stats.hp * rite.hpCost);
      if (rite.hpCost > 0 && e.stats.hp - blood < 1) {
        ctx.notice(e.id, 'requirements_unmet');
        return false;
      }
      if (!canPay(ctx, e, rite) || !pay(ctx, e, rite, key(rite.id))) return false;
      if (blood > 0) {
        // Huyết tế: the offering is HP, never lethal and never a combat hit.
        e.stats.hp -= blood;
        ctx.emit({ type: 'HEAL', targetId: e.id, amount: -blood });
      }
      if (!ctx.rng.chance(rite.successRate)) {
        const max = maxDurability(rules, quality);
        const now = durabilityOf(rules, def, inv);
        setForge(ctx, e, inv, {
          ...state,
          durability: Math.max(0, Math.round(now - max * rite.failDurability)),
        });
        return result(ctx, e, 'rite', inv, false, rite.id);
      }
      setForge(ctx, e, inv, {
        ...state,
        rites: [...(state.rites ?? []), rite.id],
      });
      return result(ctx, e, 'rite', inv, true, rite.id);
    }

    // ---- Hợp thành: raise quality ----------------------------------------------------
    case 'synthesize': {
      const target = QUALITY_ORDER[qualityRank(quality) + 1] as Exclude<ForgeQuality, 'common'>;
      if (!target) {
        ctx.notice(e.id, 'max_level');
        return false;
      }
      const step = rules.synthesis.steps[target];
      const ids = [...new Set(intent.fodder ?? [])];
      const worn = equippedIds(e);
      const fodder = ids.map((id) => p.inventory.find((i) => i.instanceId === id));
      const valid =
        ids.length === rules.synthesis.fodder &&
        fodder.every((f) => {
          const fd = f && ctx.content.items.get(f.itemId);
          return (
            f &&
            fd &&
            f.instanceId !== inv.instanceId &&
            fd.kind === 'equipment' &&
            fd.slot === def.slot &&
            qualityOf(fd, f) === quality &&
            !worn.has(f.instanceId)
          );
        });
      if (!valid) {
        ctx.notice(e.id, 'requirements_unmet');
        return false;
      }
      if (fodder.some((f) => f && isBound(ctx.content, f))) {
        ctx.notice(e.id, 'item_bound');
        return false;
      }
      if (!canPay(ctx, e, step) || !pay(ctx, e, step, key(`synth:${target}`))) return false;
      const success = ctx.rng.chance(step.successRate);
      // Failure eats one fodder item; success all of them.
      const eaten = new Set(success ? ids : ids.slice(0, 1));
      p.inventory = p.inventory.filter((i) => !eaten.has(i.instanceId));
      if (success) {
        const sockets = socketsOf(ctx.content, def, inv);
        setForge(ctx, e, inv, {
          ...state,
          quality: target,
          sockets,
          // Full durability at the new quality's maximum.
          durability: maxDurability(rules, target),
        });
        return result(ctx, e, 'synthesize', inv, true, `quality:${target}`);
      }
      return result(ctx, e, 'synthesize', inv, false);
    }

    // ---- Sửa chữa --------------------------------------------------------------------
    case 'repair': {
      const max = maxDurability(rules, quality);
      const missing = max - durabilityOf(rules, def, inv);
      if (missing <= 0) {
        ctx.notice(e.id, 'invalid');
        return false;
      }
      const cost = {
        gold: Math.ceil(missing * rules.qualities[quality].repairGold),
        materials: [],
      };
      if (!canPay(ctx, e, cost) || !pay(ctx, e, cost, key('repair'))) return false;
      setForge(ctx, e, inv, { ...state, durability: max });
      return result(ctx, e, 'repair', inv, true);
    }
  }
}

/** Socket items stack; returning one never needs a new instance id when a stack has room. */
function addSocketItem(ctx: SimContext, e: Entity, itemId: string): void {
  const p = e.player;
  const def = ctx.content.items.get(itemId);
  if (!p || !def) return;
  const stack = p.inventory.find((i) => i.itemId === itemId && i.count < def.maxStack);
  if (stack) stack.count++;
  else p.inventory.push({ instanceId: ctx.newItemInstanceId(), itemId, count: 1 });
  ctx.emit({ type: 'ITEM_GAINED', ownerId: e.id, itemId, count: 1 });
}

// ---- Combat hooks ------------------------------------------------------------------------

/**
 * Module chiến đấu: the 3rd hit of a melee combo bursts in the module's
 * element. A natal-element match widens and strengthens it.
 */
export function forgeFinisher(ctx: SimContext, e: Entity, yaw: number, source: DamageSource): void {
  const f = e.player?.gear?.finisher;
  if (!f) return;
  const natal = e.element === f.element;
  const radius = f.def.radius * (natal ? f.def.natal.radius : 1);
  const point = {
    x: e.pos.x + Math.sin(yaw) * f.def.forward,
    z: e.pos.z + Math.cos(yaw) * f.def.forward,
  };
  const burst: DamageSource = {
    ...source,
    element: f.element,
    expression: f.expression,
  };
  ctx.emit({
    type: 'SKILL_IMPACT',
    actionId: source.actionId ?? null,
    element: f.element,
    expression: f.expression,
    sourceId: e.id,
    skillId: f.def.skillId,
    point,
    radius,
    targetId: null,
  });
  const targets = [...ctx.entities.values()]
    .filter(
      (t) =>
        t !== e &&
        !t.inert &&
        t.life.alive &&
        areHostile(e, t) &&
        distance(point, t.pos) <= radius + t.movement.radius &&
        clearLine(ctx, e.pos, t.pos),
    )
    .sort((a, b) => distance(point, a.pos) - distance(point, b.pos))
    .slice(0, f.def.maxTargets);
  const multiplier = f.def.multiplier * (natal ? f.def.natal.damage : 1);
  for (const t of targets) {
    const { amount, crit } = rollHit(ctx, e, t, { multiplier, elementalShare: 1 }, {}, burst);
    applyDamage(ctx, e, t, amount, crit, f.def.skillId, {
      hit: 'solid',
      heavy: true,
      source: burst,
    });
  }
}
