import type { ContentBundle, MapDef, RealmDef } from '@rpg/game-data';
import type { EntityId, NoticeCode, SimEvent } from '@rpg/game-protocol';
import type { CircleObstacle, Entity, LedgerEntry, Projectile, SkillProjectile } from './entity';
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
  readonly skillProjectiles: SkillProjectile[];
  /** Unique per world: ties SHOT events to the DAMAGE of their bullets. */
  nextShotId(): number;
}

export const isAlive = (e: Entity | undefined): e is Entity => !!e && e.life.alive && !e.inert;

export const areHostile = (a: Entity, b: Entity): boolean =>
  a.faction !== b.faction && a.faction !== 'neutral' && b.faction !== 'neutral';

/** Distance between body edges. */
export const edgeDistance = (a: Entity, b: Entity): number =>
  Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) - a.movement.radius - b.movement.radius;

/** True if `a` can hit `b` from where it stands. */
export const inAttackRange = (a: Entity, b: Entity): boolean =>
  edgeDistance(a, b) <= a.combat.range;

/** Interaction reach for loot and portals, centre to centre. */
export const INTERACT_RANGE = 2.5;
