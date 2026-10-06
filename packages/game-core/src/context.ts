import type { EntityId, SimEvent } from '@rpg/game-protocol';
import type { CircleObstacle, Entity } from './entity';
import type { Bounds } from './math';
import type { Rng } from './rng';

/** What systems may read and mutate during a tick. Implemented by World. */
export interface SimContext {
  readonly tick: number;
  readonly rng: Rng;
  readonly bounds: Bounds;
  readonly obstacles: readonly CircleObstacle[];
  readonly entities: ReadonlyMap<EntityId, Entity>;
  emit(event: SimEvent): void;
}

export const isAlive = (e: Entity | undefined): e is Entity => !!e && e.life.alive;

export const areHostile = (a: Entity, b: Entity): boolean => a.faction !== b.faction;

/** Distance between body edges. */
export const edgeDistance = (a: Entity, b: Entity): number =>
  Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) - a.movement.radius - b.movement.radius;

/** True if `a` can hit `b` from where it stands. */
export const inAttackRange = (a: Entity, b: Entity): boolean =>
  edgeDistance(a, b) <= a.combat.range;
