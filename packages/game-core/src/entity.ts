import type { EntityAction, EntityId, EntityKind } from '@rpg/game-protocol';
import type { Vec2 } from './math';

export type Faction = 'players' | 'monsters';

export type AiState = 'idle' | 'chase' | 'return';

export interface Goal {
  pos: Vec2;
  /** Stop once centre distance to `pos` is at most this. */
  stopWithin: number;
}

export interface Entity {
  id: EntityId;
  kind: EntityKind;
  defId: string;
  faction: Faction;

  pos: Vec2;
  yaw: number;

  movement: {
    speed: number;
    radius: number;
    goal: Goal | null;
    /** Set by the movement system each tick. */
    moved: boolean;
  };

  stats: {
    hp: number;
    maxHp: number;
    attack: number;
    defense: number;
    critChance: number;
    critMultiplier: number;
  };

  combat: {
    range: number;
    attackIntervalTicks: number;
    nextAttackTick: number;
    targetId: EntityId | null;
  };

  life: {
    alive: boolean;
    respawnTicks: number;
    respawnAtTick: number | null;
    spawnPos: Vec2;
    lastAttackerId: EntityId | null;
  };

  ai: {
    state: AiState;
    home: Vec2;
    aggroRadius: number;
    leashRadius: number;
    wanderRadius: number;
    nextWanderTick: number;
  } | null;

  action: EntityAction;
}

export interface CircleObstacle {
  pos: Vec2;
  radius: number;
}
