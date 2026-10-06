import type { ContentBundle, MapDef } from '@rpg/game-data';
import type { EntityId, Intent, SimEvent, Snapshot } from '@rpg/game-protocol';
import type { SimContext } from './context';
import type { CircleObstacle, Entity } from './entity';
import type { Bounds, Vec2 } from './math';
import { Rng } from './rng';
import { aiSystem } from './systems/ai';
import { combatSystem } from './systems/combat';
import { applyIntents, type QueuedIntent } from './systems/intents';
import { actionSystem, lifeSystem } from './systems/life';
import { movementSystem } from './systems/movement';
import { secondsToTicks } from './time';

export interface WorldOptions {
  content: ContentBundle;
  mapId: string;
  /** Overrides the map seed (tests, replays). */
  seed?: number;
}

export interface WorldStats {
  tick: number;
  entities: number;
  rejectedIntents: number;
}

/**
 * Authoritative simulation of one map instance. Pure TypeScript: no DOM,
 * no renderer, no wall-clock. Advance with step() at TICK_RATE.
 */
export class World implements SimContext {
  readonly rng: Rng;
  readonly bounds: Bounds;
  readonly obstacles: CircleObstacle[];
  readonly map: MapDef;
  private readonly entityMap = new Map<EntityId, Entity>();
  private readonly content: ContentBundle;
  private intents: QueuedIntent[] = [];
  private pendingEvents: SimEvent[] = [];
  private nextId = 1;
  private currentTick = 0;
  private rejected = 0;

  constructor(opts: WorldOptions) {
    const map = opts.content.maps.get(opts.mapId);
    if (!map) throw new Error(`Unknown map "${opts.mapId}"`);
    this.content = opts.content;
    this.map = map;
    this.rng = new Rng(opts.seed ?? map.seed);
    this.bounds = { min: { ...map.bounds.min }, max: { ...map.bounds.max } };
    this.obstacles = map.chunks.flatMap((c) =>
      c.instances
        .filter((i) => i.colliderRadius !== undefined)
        .map((i) => ({
          pos: { x: i.position[0], z: i.position[2] },
          radius: (i.colliderRadius as number) * i.scale,
        })),
    );
    this.spawnMonsters();
  }

  get tick(): number {
    return this.currentTick;
  }

  get entities(): ReadonlyMap<EntityId, Entity> {
    return this.entityMap;
  }

  get stats(): WorldStats {
    return {
      tick: this.currentTick,
      entities: this.entityMap.size,
      rejectedIntents: this.rejected,
    };
  }

  emit(event: SimEvent): void {
    this.pendingEvents.push(event);
  }

  spawnPlayer(characterId: string): EntityId {
    const def = this.content.characters.get(characterId);
    if (!def) throw new Error(`Unknown character "${characterId}"`);
    const pos = { ...this.map.playerSpawn };
    const id = this.allocateId();
    this.entityMap.set(id, {
      id,
      kind: 'player',
      defId: def.id,
      faction: 'players',
      pos,
      yaw: 0,
      movement: {
        speed: def.movement.speed,
        radius: def.movement.radius,
        goal: null,
        moved: false,
      },
      stats: { ...def.stats, maxHp: def.stats.hp },
      combat: {
        range: def.combat.range,
        attackIntervalTicks: secondsToTicks(def.combat.attackInterval),
        nextAttackTick: 0,
        targetId: null,
      },
      life: {
        alive: true,
        respawnTicks: secondsToTicks(def.respawnSeconds),
        respawnAtTick: null,
        spawnPos: { ...pos },
        lastAttackerId: null,
      },
      ai: null,
      action: 'idle',
    });
    this.emit({ type: 'SPAWN', id });
    return id;
  }

  removeEntity(id: EntityId): void {
    if (this.entityMap.delete(id)) this.emit({ type: 'DESPAWN', id });
  }

  /** Queues an intent for the next step. Schema validation is the host's job. */
  enqueueIntent(entityId: EntityId, intent: Intent): void {
    this.intents.push({ entityId, intent });
  }

  /** Advances one tick and returns the events produced since the last step. */
  step(): SimEvent[] {
    this.currentTick++;
    const queue = this.intents;
    this.intents = [];
    this.rejected += applyIntents(this, queue);
    aiSystem(this);
    combatSystem(this);
    movementSystem(this);
    lifeSystem(this);
    actionSystem(this);
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  snapshot(): Snapshot {
    const entities = [];
    for (const e of this.entityMap.values()) {
      entities.push({
        id: e.id,
        kind: e.kind,
        defId: e.defId,
        pos: { x: round(e.pos.x), z: round(e.pos.z) },
        yaw: round(e.yaw),
        hp: e.stats.hp,
        maxHp: e.stats.maxHp,
        action: e.action,
        targetId: e.combat.targetId,
      });
    }
    return { tick: this.currentTick, entities };
  }

  private allocateId(): EntityId {
    return this.nextId++;
  }

  private spawnMonsters(): void {
    for (const spawn of this.map.spawns) {
      const def = this.content.monsters.get(spawn.monsterId);
      if (!def) throw new Error(`Unknown monster "${spawn.monsterId}"`);
      for (let n = 0; n < spawn.count; n++) {
        const home = this.scatter(spawn.position, spawn.radius);
        const id = this.allocateId();
        this.entityMap.set(id, {
          id,
          kind: 'monster',
          defId: def.id,
          faction: 'monsters',
          pos: { ...home },
          yaw: this.rng.range(-Math.PI, Math.PI),
          movement: {
            speed: def.movement.speed,
            radius: def.movement.radius,
            goal: null,
            moved: false,
          },
          stats: { ...def.stats, maxHp: def.stats.hp },
          combat: {
            range: def.combat.range,
            attackIntervalTicks: secondsToTicks(def.combat.attackInterval),
            nextAttackTick: 0,
            targetId: null,
          },
          life: {
            alive: true,
            respawnTicks: secondsToTicks(spawn.respawnSeconds),
            respawnAtTick: null,
            spawnPos: { ...home },
            lastAttackerId: null,
          },
          ai: {
            state: 'idle',
            home: { ...home },
            aggroRadius: def.ai.aggroRadius,
            leashRadius: def.ai.leashRadius,
            wanderRadius: def.ai.wanderRadius,
            nextWanderTick: this.rng.int(10, 60),
          },
          action: 'idle',
        });
        this.emit({ type: 'SPAWN', id });
      }
    }
  }

  private scatter(center: Vec2, radius: number): Vec2 {
    if (radius <= 0) return { ...center };
    const angle = this.rng.range(0, Math.PI * 2);
    const r = Math.sqrt(this.rng.next()) * radius;
    return { x: center.x + Math.sin(angle) * r, z: center.z + Math.cos(angle) * r };
  }
}

/** Snapshots carry centimetre precision; keeps payloads small and diffs stable. */
const round = (v: number): number => Math.round(v * 100) / 100;
