import type { ContentBundle } from './bundle';
import type {
  AmmoChip,
  DefenseModule,
  Element,
  Expression,
  Finisher,
  ForgeQuality,
  ForgeRules,
  ItemDef,
  Rarity,
  RiteDef,
  StatBonus,
  StatKey,
} from './schemas';

/** Forge state carried by an item instance (mirrors game-protocol ItemForgeSchema). */
export interface ItemForgeState {
  quality?: ForgeQuality;
  stage?: number;
  durability?: number;
  sockets?: (string | null)[];
  rites?: string[];
}

/** The parts of an inventory item the forge reads. */
export interface ForgeInstance {
  instanceId: string;
  enhance?: number;
  forge?: ItemForgeState;
}

/**
 * Thiên Cơ Luyện Khí — pure stat math for forged equipment
 * (docs/plan/06_forge_equipment_plan.md). No World access: progression.ts
 * folds these into player stats, forge.ts mutates the instance state.
 *
 * Layers: authored bonus × evolution stage (base) × quality × enhancement ×
 * rites (+hybrid, +natal per realm) × durability, then flat hidden stats and
 * socket bonuses. Penalties (negative values) are never amplified.
 */

type Content = Pick<ContentBundle, 'forge' | 'items' | 'rites'>;

export const QUALITY_ORDER: readonly ForgeQuality[] = ['common', 'rare', 'epic', 'legendary'];

export const forgeRules = (content: Pick<ContentBundle, 'forge'>): ForgeRules | undefined =>
  [...content.forge.values()][0];

export function qualityFromRarity(rarity: Rarity): ForgeQuality {
  if (rarity === 'mythic') return 'legendary';
  if (rarity === 'uncommon') return 'common';
  return rarity;
}

export const qualityRank = (q: ForgeQuality): number => QUALITY_ORDER.indexOf(q);

export function qualityOf(def: ItemDef, inv: Pick<ForgeInstance, 'forge'>): ForgeQuality {
  return inv.forge?.quality ?? qualityFromRarity(def.rarity);
}

export function maxDurability(rules: ForgeRules | undefined, quality: ForgeQuality): number {
  return rules?.qualities[quality].durability ?? 100;
}

export function durabilityOf(
  rules: ForgeRules | undefined,
  def: ItemDef,
  inv: Pick<ForgeInstance, 'forge'>,
): number {
  return inv.forge?.durability ?? maxDurability(rules, qualityOf(def, inv));
}

/** Applied rites with their repeat counts, in first-applied order. */
export function riteCounts(
  content: Pick<ContentBundle, 'rites'>,
  forge: ItemForgeState | undefined,
): { rite: RiteDef; times: number }[] {
  const out = new Map<string, { rite: RiteDef; times: number }>();
  for (const id of forge?.rites ?? []) {
    const rite = content.rites.get(id);
    if (!rite) continue;
    const entry = out.get(id) ?? { rite, times: 0 };
    entry.times++;
    out.set(id, entry);
  }
  return [...out.values()];
}

export function socketCount(content: Content, def: ItemDef, inv: ForgeInstance): number {
  const rules = forgeRules(content);
  if (!rules || def.kind !== 'equipment') return 0;
  const extra = riteCounts(content, inv.forge).reduce(
    (n, { rite, times }) => n + rite.effects.extraSockets * times,
    0,
  );
  return rules.qualities[qualityOf(def, inv)].sockets + extra;
}

/** Sockets padded to the item's socket count (null = empty). */
export function socketsOf(content: Content, def: ItemDef, inv: ForgeInstance): (string | null)[] {
  const n = socketCount(content, def, inv);
  const s = inv.forge?.sockets ?? [];
  return Array.from({ length: Math.max(n, s.length) }, (_, i) => s[i] ?? null);
}

export const isBound = (content: Pick<ContentBundle, 'rites'>, inv: ForgeInstance): boolean =>
  riteCounts(content, inv.forge).some(({ rite }) => rite.effects.bind);

export const isNatal = (content: Pick<ContentBundle, 'rites'>, inv: ForgeInstance): boolean =>
  riteCounts(content, inv.forge).some(({ rite }) => rite.effects.natal);

/** True when rites of both lines cover at least `hybrid.groups` groups (Thiên Cơ Relic). */
export function isHybrid(content: Content, inv: ForgeInstance): boolean {
  const rules = forgeRules(content);
  if (!rules) return false;
  const rites = riteCounts(content, inv.forge).map(({ rite }) => rite);
  const lines = new Set(rites.map((r) => r.line));
  return lines.size === 2 && new Set(rites.map((r) => r.group)).size >= rules.hybrid.groups;
}

export type GearFamily = 'weapon' | 'armor';
export const gearFamily = (def: ItemDef): GearFamily =>
  def.slot === 'main_hand' || def.slot === 'artifact' ? 'weapon' : 'armor';

// ---- Hidden stats -----------------------------------------------------------

/** FNV-1a → mulberry32: deterministic per instance, never touches the World RNG. */
function seeded(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HiddenStat {
  stat: StatKey;
  value: number;
  /** Enhancement that wakes it. */
  unlockAt: number;
  active: boolean;
}

const roundStat = (stat: StatKey, v: number) =>
  stat === 'critChance' || stat === 'speed' ? Math.round(v * 1000) / 1000 : Math.round(v);

export function hiddenStats(content: Content, def: ItemDef, inv: ForgeInstance): HiddenStat[] {
  const rules = forgeRules(content);
  if (!rules || def.kind !== 'equipment') return [];
  const quality = qualityOf(def, inv);
  const q = rules.qualities[quality];
  const pool = rules.hiddenPool[gearFamily(def)];
  const rand = seeded(`${inv.instanceId}:${def.id}`);
  const out: HiddenStat[] = [];
  for (let i = 0; i < q.hidden; i++) {
    const entry = pool[Math.floor(rand() * pool.length)] ?? pool[0];
    if (!entry) break;
    const roll = rand();
    const unlockAt =
      rules.enhance.hiddenUnlockAt[Math.min(i, rules.enhance.hiddenUnlockAt.length - 1)] ?? 0;
    out.push({
      stat: entry.stat,
      value: roundStat(entry.stat, (entry.min + (entry.max - entry.min) * roll) * q.statMultiplier),
      unlockAt,
      active: (inv.enhance ?? 0) >= unlockAt,
    });
  }
  return out;
}

// ---- Item bonus ---------------------------------------------------------------

const ZERO = (): StatBonus => ({
  hp: 0,
  mp: 0,
  attack: 0,
  defense: 0,
  critChance: 0,
  speed: 0,
});
const KEYS: readonly StatKey[] = ['hp', 'mp', 'attack', 'defense', 'critChance', 'speed'];

export interface ItemMultipliers {
  stage: number;
  quality: number;
  enhance: number;
  rites: number;
  durability: number;
}

/** Wearer context: natal element and realm rank (Bản Mệnh grows per realm). */
export interface Wearer {
  element?: Element | null;
  realm: number;
}

export function itemMultipliers(
  content: Content,
  def: ItemDef,
  inv: ForgeInstance,
  wearer: Wearer,
): ItemMultipliers {
  const rules = forgeRules(content);
  const stage = inv.forge?.stage ?? 0;
  const rites = riteCounts(content, inv.forge);
  let riteMult = 1;
  for (const { rite, times } of rites) {
    riteMult += rite.effects.statMultiplier * times;
    if (rite.effects.natal) riteMult += rite.effects.natalPerRealm * wearer.realm;
  }
  if (rules && isHybrid(content, inv)) riteMult += rules.hybrid.statMultiplier;
  return {
    stage: stage > 0 ? (def.evolution[stage - 1]?.baseMultiplier ?? 1) : 1,
    quality: rules?.qualities[qualityOf(def, inv)].statMultiplier ?? 1,
    // Content without forge rules (tests, old bundles) keeps +N inert.
    enhance: 1 + (rules?.enhance.bonusPerLevel ?? 0) * (inv.enhance ?? 0),
    rites: riteMult,
    durability: rules && durabilityOf(rules, def, inv) <= 0 ? rules.durability.brokenMultiplier : 1,
  };
}

/** Everything one equipped instance adds to its wearer. */
export function itemBonus(
  content: Content,
  def: ItemDef,
  inv: ForgeInstance,
  wearer: Wearer,
): StatBonus {
  const out = ZERO();
  if (def.kind !== 'equipment') return out;
  const m = itemMultipliers(content, def, inv, wearer);
  const scale = m.stage * m.quality * m.enhance * m.rites * m.durability;
  for (const k of KEYS) {
    const v = def.bonus?.[k] ?? 0;
    out[k] += v > 0 ? v * scale : v;
  }
  for (const h of hiddenStats(content, def, inv))
    if (h.active) out[h.stat] += h.value * m.durability;
  for (const id of inv.forge?.sockets ?? []) {
    const socket = id ? content.items.get(id)?.socket : undefined;
    if (!socket?.bonus) continue;
    const natal = socket.element && socket.element === wearer.element ? socket.natalBonus : 1;
    for (const k of KEYS) out[k] += (socket.bonus[k] ?? 0) * natal;
  }
  return out;
}

/** Display name: the evolution stage renames the item. */
export function forgedName(def: ItemDef, inv: Pick<ForgeInstance, 'forge'>): string {
  const stage = inv.forge?.stage ?? 0;
  return stage > 0 ? (def.evolution[stage - 1]?.name ?? def.name) : def.name;
}

export function forgedTier(def: ItemDef, inv: Pick<ForgeInstance, 'forge'>): string | undefined {
  const stage = inv.forge?.stage ?? 0;
  return stage > 0 ? def.evolution[stage - 1]?.tier : def.tier;
}

// ---- Combat modifiers -------------------------------------------------------------

/** Socket effects that change how the wearer fights (derived on equip). */
export interface GearMods {
  finisher: {
    def: Finisher;
    element: Element;
    expression: Expression;
  } | null;
  defense: Required<Omit<DefenseModule, 'resist'>> & {
    resist: { element: Element; amount: number }[];
  };
  ammo: Required<Omit<AmmoChip, 'stunEvery'>> & { stunEvery: number };
}

export function emptyGearMods(): GearMods {
  return {
    finisher: null,
    defense: {
      shieldOnHit: 0,
      shieldCap: 0,
      shieldSeconds: 0,
      dodge: 0,
      reduction: 0,
      resist: [],
    },
    ammo: {
      stunEvery: 0,
      stunSeconds: 0,
      knockback: 0,
      reloadMultiplier: 1,
      magazineBonus: 0,
      heatMultiplier: 1,
      critBonus: 0,
    },
  };
}

/**
 * Folds every socket of the equipped items into one modifier set. Additive
 * values stack; multipliers multiply; the first combat module wins and the
 * strongest stun cadence (smallest N) is kept.
 */
export function gearMods(
  content: Content,
  equipped: readonly { def: ItemDef; inv: ForgeInstance }[],
): GearMods | null {
  const mods = emptyGearMods();
  let any = false;
  for (const { inv } of equipped)
    for (const id of inv.forge?.sockets ?? []) {
      const socket = id ? content.items.get(id)?.socket : undefined;
      if (!socket) continue;
      if (socket.type === 'combat' && socket.finisher && socket.element && !mods.finisher) {
        mods.finisher = {
          def: socket.finisher,
          element: socket.element,
          expression: socket.expression,
        };
        any = true;
      }
      const d = socket.defense;
      if (d) {
        mods.defense.shieldOnHit += d.shieldOnHit;
        mods.defense.shieldCap = Math.max(mods.defense.shieldCap, d.shieldCap);
        mods.defense.shieldSeconds = Math.max(mods.defense.shieldSeconds, d.shieldSeconds);
        mods.defense.dodge = Math.min(0.3, mods.defense.dodge + d.dodge);
        mods.defense.reduction = Math.min(0.3, mods.defense.reduction + d.reduction);
        if (d.resist) mods.defense.resist.push(d.resist);
        any = true;
      }
      const a = socket.ammo;
      if (a) {
        if (a.stunEvery && (!mods.ammo.stunEvery || a.stunEvery < mods.ammo.stunEvery)) {
          mods.ammo.stunEvery = a.stunEvery;
          mods.ammo.stunSeconds = a.stunSeconds;
        }
        mods.ammo.knockback = Math.max(mods.ammo.knockback, a.knockback);
        mods.ammo.reloadMultiplier *= a.reloadMultiplier;
        mods.ammo.magazineBonus += a.magazineBonus;
        mods.ammo.heatMultiplier *= a.heatMultiplier;
        mods.ammo.critBonus += a.critBonus;
        any = true;
      }
    }
  return any ? mods : null;
}

export { KEYS as STAT_KEYS };
