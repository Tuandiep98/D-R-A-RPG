import type { ComboDef, ContentBundle, MapDef, RealmDef } from '@rpg/game-data';
import type { EntityId, NoticeCode, SimEvent } from '@rpg/game-protocol';
import type {
  Cast,
  CircleObstacle,
  Entity,
  LedgerEntry,
  Projectile,
  SkillProjectile,
} from './entity';
import type { Bounds, Vec2 } from './math';
import type { Rng } from './rng';

/**
 * Pathfinding abstraction (decision D-008). Implemented with Recast in
 * @rpg/navigation; game-core never imports the WASM module itself.
 */
export interface NavQuery {
  /** Waypoints from `from` to `to` (excluding `from`), or null when unreachable. */
  findPath(from: Vec2, to: Vec2): Vec2[] | null;
  /** Nearest walkable point. */
  closest(p: Vec2): Vec2;
}

/** Party operations systems rely on (implemented by systems/party.ts). */
export interface PartyService {
  invite(ctx: SimContext, from: Entity, target: Entity): boolean;
  accept(ctx: SimContext, target: Entity, fromId: EntityId): boolean;
  leave(e: Entity): void;
  remove(ctx: SimContext, id: EntityId): void;
  nearbyMembers(ctx: SimContext, e: Entity, pos: Vec2): Entity[];
  sameParty(a: Entity, b: Entity): boolean;
}

/** What systems may read and mutate during a tick. Implemented by World. */
export interface SimContext {
  readonly combatContent?: import('@rpg/game-protocol').CombatContent;
  readonly combatRuleset?: import('@rpg/game-protocol').CombatRuleset;
  readonly tick: number;
  readonly rng: Rng;
  readonly bounds: Bounds;
  readonly map: MapDef;
  readonly content: ContentBundle;
  /** Realms by rank (content.realms sorted by order). */
  readonly realms: readonly RealmDef[];
  readonly nav: NavQuery | null;
  readonly obstacles: readonly CircleObstacle[];
  readonly entities: ReadonlyMap<EntityId, Entity>;
  emit(event: SimEvent): void;
  notice(ownerId: EntityId, code: NoticeCode): void;
  addEntity(build: (id: EntityId) => Entity): Entity;
  removeEntity(id: EntityId): void;
  newItemInstanceId(): string;
  recordLedger(entry: Omit<LedgerEntry, 'tick'>): boolean;
  inSafeZone(p: Vec2): boolean;
  readonly parties: PartyService;
  /** Bullets in flight (systems/ranged.ts). */
  readonly projectiles: Projectile[];
  /** Committed shots awaiting presentation lengths from the collision phase. */
  readonly rangedShots: Extract<SimEvent, { type: 'SHOT' }>[];
  readonly skillProjectiles: SkillProjectile[];
  readonly skillPulses: {
    ownerId: EntityId;
    cast: Cast;
    nextTick: number;
    remaining: number;
    maxEndTick?: number;
  }[];
  /** Unique per world: ties SHOT events to the DAMAGE of their bullets. */
  nextShotId(): number;
}

export const isAlive = (e: Entity | undefined): e is Entity => !!e && e.life.alive && !e.inert;
export const isStaggered = (ctx: SimContext, e: Entity): boolean =>
  (e.poise?.staggerUntilTick ?? 0) > ctx.tick;

export const areHostile = (a: Entity, b: Entity): boolean =>
  a.faction !== b.faction && a.faction !== 'neutral' && b.faction !== 'neutral';

/** Distance between body edges. */
export const edgeDistance = (a: Entity, b: Entity): number =>
  Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) - a.movement.radius - b.movement.radius;

/** True if `a` can hit `b` from where it stands. */
export const inAttackRange = (a: Entity, b: Entity): boolean =>
  edgeDistance(a, b) <= a.combat.range;

/** Weapon override, then the character's armed/unarmed combo. */
export function comboOf(ctx: SimContext, e: Entity): ComboDef | null {
  const p = e.player;
  if (!p) return null;
  const def = ctx.content.characters.get(p.characterId);
  if (!def) return null;
  const main = p.inventory.find((item) => item.instanceId === p.equipment.main_hand);
  const item = main ? ctx.content.items.get(main.itemId) : undefined;
  return (
    ctx.content.combos.get(item ? (item.combo ?? def.combos.armed) : def.combos.unarmed) ?? null
  );
}

/** Approach the next strike's real reach, rather than stopping at a longer character range. */
export function basicReach(ctx: SimContext, e: Entity): number {
  if (!e.player || e.player.ranged) return e.combat.range;
  const combo = comboOf(ctx, e);
  if (!combo) return e.combat.range;
  const chained =
    ctx.tick - e.player.combo.lastEndTick <= Math.max(1, Math.round(combo.resetAfter * 20));
  const step = chained ? e.player.combo.nextStep % combo.steps.length : 0;
  return Math.min(e.combat.range, combo.steps[step]?.variants[0]?.reach ?? e.combat.range);
}

/** Interaction reach for loot and portals, centre to centre. */
export const INTERACT_RANGE = 2.5;
