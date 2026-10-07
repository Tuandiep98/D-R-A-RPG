import { type ContentBundle, type MapDef, type RealmDef, realmLadder } from '@rpg/game-data';
import type {
  EntityId,
  EntitySnapshot,
  Intent,
  NoticeCode,
  PlayerState,
  SimEvent,
  Snapshot,
} from '@rpg/game-protocol';
import type { NavQuery, SimContext } from './context';
import type { CircleObstacle, Entity, EquipSlot, LedgerEntry, PlayerSave } from './entity';
import { type Bounds, clampToBounds, type Vec2 } from './math';
import { Rng } from './rng';
import { aiSystem } from './systems/ai';
import { combatSystem } from './systems/combat';
import { breakthroughChance } from './systems/cultivation';
import { applyIntents, pendingSystem, type QueuedIntent } from './systems/intents';
import { addItem, equip, INVENTORY_CAPACITY } from './systems/inventory';
import { actionSystem, lifeSystem } from './systems/life';
import { lootSystem, makeInert } from './systems/loot';
import { movementSystem } from './systems/movement';
import { questProgress } from './systems/npc';
import { Parties } from './systems/party';
import { cultivationLoad, realmRank, recomputePlayerStats } from './systems/progression';
import { skillSystem } from './systems/skills';
import { secondsToTicks } from './time';

export interface WorldOptions {
  content: ContentBundle;
  mapId: string;
  /** Overrides the map seed (tests, replays). */
  seed?: number;
  /** Pathfinding; without it entities walk straight (tests, tools). */
  nav?: NavQuery | null;
  /** Unique item instance ids. The server injects UUIDv7; default is a per-world counter. */
  newItemInstanceId?: () => string;
}

export interface WorldStats {
  tick: number;
  entities: number;
  rejectedIntents: number;
}

export interface SpawnPlayerOptions {
  save?: PlayerSave;
  /** Named arrival point in this map (portal destination). */
  arrival?: string | null;
  /** Character name shown to others (online: from the DB); defaults to the class name. */
  name?: string;
  /** Last saved position (reconnect/login); clamped to bounds and snapped to the navmesh. */
  position?: Vec2 | null;
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
  readonly content: ContentBundle;
  readonly realms: readonly RealmDef[];
  readonly nav: NavQuery | null;
  readonly parties = new Parties();
  private readonly entityMap = new Map<EntityId, Entity>();
  private intents: QueuedIntent[] = [];
  private pendingEvents: SimEvent[] = [];
  private ledger: LedgerEntry[] = [];
  private readonly ledgerKeys = new Set<string>();
  private nextId = 1;
  private nextItem = 1;
  private currentTick = 0;
  private rejected = 0;
  private readonly itemIdFactory: () => string;

  constructor(opts: WorldOptions) {
    const map = opts.content.maps.get(opts.mapId);
    if (!map) throw new Error(`Unknown map "${opts.mapId}"`);
    this.content = opts.content;
    this.realms = realmLadder(opts.content);
    this.map = map;
    this.nav = opts.nav ?? null;
    this.rng = new Rng(opts.seed ?? map.seed);
    this.itemIdFactory =
      opts.newItemInstanceId ?? (() => `${map.id}-${opts.seed ?? map.seed}-${this.nextItem++}`);
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
    for (const placed of map.npcs) {
      this.addEntity((id) => {
        const e = makeInert(id, 'npc', placed.npcId, placed.position, {
          npc: { npcId: placed.npcId },
        });
        e.yaw = placed.rotationY;
        return e;
      });
    }
    for (const portal of map.portals) {
      this.addEntity((id) =>
        makeInert(id, 'portal', portal.id, portal.position, {
          portal: {
            portalId: portal.id,
            targetMapId: portal.targetMapId,
            arrival: portal.targetArrival ?? null,
          },
        }),
      );
    }
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

  // ---- SimContext -------------------------------------------------------

  emit(event: SimEvent): void {
    this.pendingEvents.push(event);
  }

  notice(ownerId: EntityId, code: NoticeCode): void {
    if (this.entityMap.get(ownerId)?.player) this.emit({ type: 'NOTICE', ownerId, code });
  }

  addEntity(build: (id: EntityId) => Entity): Entity {
    const e = build(this.nextId++);
    this.entityMap.set(e.id, e);
    this.emit({ type: 'SPAWN', id: e.id });
    return e;
  }

  removeEntity(id: EntityId): void {
    if (this.entityMap.get(id)?.player) this.parties.remove(this, id);
    if (this.entityMap.delete(id)) this.emit({ type: 'DESPAWN', id });
  }

  newItemInstanceId(): string {
    return this.itemIdFactory();
  }

  recordLedger(entry: Omit<LedgerEntry, 'tick'>): boolean {
    if (this.ledgerKeys.has(entry.key)) return false;
    this.ledgerKeys.add(entry.key);
    this.ledger.push({ ...entry, tick: this.currentTick });
    return true;
  }

  inSafeZone(p: Vec2): boolean {
    return this.map.zones.some(
      (z) => z.kind === 'safe' && Math.hypot(p.x - z.center.x, p.z - z.center.z) <= z.radius,
    );
  }

  // ---- Players ----------------------------------------------------------

  spawnPlayer(characterId: string, opts: SpawnPlayerOptions = {}): EntityId {
    const def = this.content.characters.get(characterId);
    if (!def) throw new Error(`Unknown character "${characterId}"`);
    const arrival = opts.arrival ? this.map.arrivals.find((a) => a.id === opts.arrival) : undefined;
    let pos: Vec2 = { ...(arrival?.position ?? this.map.playerSpawn) };
    if (!arrival && opts.position) {
      const clamped = clampToBounds(opts.position, this.bounds, def.movement.radius);
      pos = this.nav ? this.nav.closest(clamped) : clamped;
    }
    const save = opts.save;
    const e = this.addEntity((id) => ({
      id,
      kind: 'player',
      defId: def.id,
      faction: 'players',
      inert: false,
      realm: realmRank(this, save?.realm),
      pos,
      yaw: 0,
      movement: {
        baseSpeed: def.movement.speed,
        speed: def.movement.speed,
        radius: def.movement.radius,
        goal: null,
        path: null,
        pathTick: 0,
        pathGoal: null,
        dir: null,
        moved: false,
      },
      stats: {
        ...def.stats,
        maxHp: def.stats.hp,
        maxMp: def.stats.mp,
      },
      baseAttack: def.stats.attack,
      combat: {
        range: def.combat.range,
        attackIntervalTicks: secondsToTicks(def.combat.attackInterval),
        nextAttackTick: 0,
        targetId: null,
        lastCombatTick: -1000,
      },
      life: {
        alive: true,
        respawnTicks: secondsToTicks(def.respawnSeconds),
        respawnAtTick: null,
        spawnPos: { ...this.map.playerSpawn },
        lastAttackerId: null,
        damageBy: new Map(),
      },
      ai: null,
      skills: new Map(def.skills.map((s) => [s, 0])),
      cast: null,
      pending: null,
      player: {
        characterId: def.id,
        name: opts.name ?? def.name,
        partyId: null,
        gold: save?.gold ?? 0,
        // Nodes removed from content are dropped instead of failing the load.
        nodes: (save?.nodes ?? []).filter((n) => this.content.cultivation.has(n)),
        backlashUntilTick: 0,
        inventory: save ? save.inventory.map((i) => ({ ...i })) : [],
        equipment: save ? { ...save.equipment } : {},
        itemReadyAtTick: 0,
        quests: (save?.quests ?? []).map((q) => ({
          ...q,
          progress: [...q.progress],
        })),
      },
      loot: null,
      portal: null,
      npc: null,
      action: 'idle',
    }));

    if (!save) {
      for (const starter of def.starterItems) {
        addItem(this, e, starter.itemId, starter.count);
        if (starter.equip) {
          const inv = e.player?.inventory.find((i) => i.itemId === starter.itemId);
          if (inv) equip(this, e, inv.instanceId);
        }
      }
    }
    recomputePlayerStats(this, e);
    if (save) {
      e.stats.hp = Math.min(e.stats.maxHp, Math.max(1, save.hp));
      e.stats.mp = Math.min(e.stats.maxMp, save.mp);
    } else {
      e.stats.hp = e.stats.maxHp;
      e.stats.mp = e.stats.maxMp;
    }
    return e.id;
  }

  /** Persistable state of a player (map transfer, logout, autosave). */
  exportPlayer(id: EntityId): PlayerSave | null {
    const e = this.entityMap.get(id);
    if (!e?.player) return null;
    return {
      characterId: e.player.characterId,
      realm: this.realms[e.realm]?.id ?? this.realms[0]?.id ?? '',
      realmRank: e.realm,
      nodes: [...e.player.nodes],
      gold: e.player.gold,
      hp: e.life.alive ? e.stats.hp : e.stats.maxHp,
      mp: e.stats.mp,
      inventory: e.player.inventory.map((i) => ({ ...i })),
      equipment: { ...e.player.equipment },
      quests: e.player.quests.map((q) => ({ ...q, progress: [...q.progress] })),
    };
  }

  playerState(id: EntityId): PlayerState | null {
    const e = this.entityMap.get(id);
    const p = e?.player;
    if (!e || !p) return null;
    const load = cultivationLoad(this, p.nodes);
    return {
      id: e.id,
      characterId: p.characterId,
      realm: this.realms[e.realm]?.id ?? '',
      nodes: [...p.nodes],
      meridianLoad: load.meridian,
      bodyLoad: load.body,
      breakthroughChance: breakthroughChance(this, e),
      backlashUntilTick: p.backlashUntilTick,
      hp: e.stats.hp,
      maxHp: e.stats.maxHp,
      mp: e.stats.mp,
      maxMp: e.stats.maxMp,
      gold: p.gold,
      stats: {
        attack: Math.round(e.stats.attack),
        defense: Math.round(e.stats.defense),
        critChance: e.stats.critChance,
        speed: e.movement.speed,
      },
      skills: [...e.skills].map(([skillId, readyAtTick]) => ({
        skillId,
        readyAtTick,
      })),
      inventory: p.inventory.map((i) => ({ ...i })),
      inventoryCapacity: INVENTORY_CAPACITY,
      equipment: { ...p.equipment },
      itemReadyAtTick: p.itemReadyAtTick,
      inSafeZone: this.inSafeZone(e.pos),
      party: this.partyView(p.partyId),
      quests: p.quests.map((q) => ({
        questId: q.questId,
        status: q.status,
        progress: questProgress(this, e, q),
      })),
    };
  }

  private partyView(partyId: number | null): PlayerState['party'] {
    const party = partyId !== null ? this.parties.byId.get(partyId) : undefined;
    if (!party) return null;
    return {
      leaderId: party.leaderId,
      members: party.members.flatMap((id) => {
        const m = this.entityMap.get(id);
        return m?.player
          ? [
              {
                id,
                name: m.player.name,
                realm: m.realm,
                hp: Math.round(m.stats.hp),
                maxHp: Math.round(m.stats.maxHp),
              },
            ]
          : [];
      }),
    };
  }

  /** Audited currency changes since the last drain (persisted by the server). */
  drainLedger(): LedgerEntry[] {
    const out = this.ledger;
    this.ledger = [];
    return out;
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
    skillSystem(this);
    combatSystem(this);
    movementSystem(this);
    pendingSystem(this);
    lootSystem(this);
    lifeSystem(this);
    actionSystem(this);
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  snapshot(filter?: (e: Entity) => boolean): Snapshot {
    const entities: EntitySnapshot[] = [];
    for (const e of this.entityMap.values()) {
      if (filter && !filter(e)) continue;
      entities.push(toSnapshot(e));
    }
    return { tick: this.currentTick, entities };
  }

  private spawnMonsters(): void {
    for (const spawn of this.map.spawns) {
      const def = this.content.monsters.get(spawn.monsterId);
      if (!def) throw new Error(`Unknown monster "${spawn.monsterId}"`);
      for (let n = 0; n < spawn.count; n++) {
        const home = this.scatter(spawn.position, spawn.radius);
        this.addEntity((id) => ({
          id,
          kind: 'monster',
          defId: def.id,
          faction: 'monsters',
          inert: false,
          realm: realmRank(this, def.realm),
          pos: { ...home },
          yaw: this.rng.range(-Math.PI, Math.PI),
          movement: {
            baseSpeed: def.movement.speed,
            speed: def.movement.speed,
            radius: def.movement.radius,
            goal: null,
            path: null,
            pathTick: 0,
            pathGoal: null,
            dir: null,
            moved: false,
          },
          stats: { ...def.stats, maxHp: def.stats.hp, maxMp: def.stats.mp },
          baseAttack: def.stats.attack,
          combat: {
            range: def.combat.range,
            attackIntervalTicks: secondsToTicks(def.combat.attackInterval),
            nextAttackTick: 0,
            targetId: null,
            lastCombatTick: -1000,
          },
          life: {
            alive: true,
            respawnTicks: secondsToTicks(spawn.respawnSeconds),
            respawnAtTick: null,
            spawnPos: { ...home },
            lastAttackerId: null,
            damageBy: new Map(),
          },
          ai: {
            state: 'idle',
            home: { ...home },
            aggroRadius: def.ai.aggroRadius,
            leashRadius: def.ai.leashRadius,
            wanderRadius: def.ai.wanderRadius,
            nextWanderTick: this.rng.int(10, 60),
            tier: def.tier,
            phase: 0,
          },
          skills: new Map(def.skills.map((s) => [s, 40])),
          cast: null,
          pending: null,
          player: null,
          loot: null,
          portal: null,
          npc: null,
          action: 'idle',
        }));
      }
    }
  }

  private scatter(center: Vec2, radius: number): Vec2 {
    if (radius <= 0) return { ...center };
    const angle = this.rng.range(0, Math.PI * 2);
    const r = Math.sqrt(this.rng.next()) * radius;
    return {
      x: center.x + Math.sin(angle) * r,
      z: center.z + Math.cos(angle) * r,
    };
  }
}

/** Snapshots carry centimetre precision; keeps payloads small and diffs stable. */
const round = (v: number): number => Math.round(v * 100) / 100;

function toSnapshot(e: Entity): EntitySnapshot {
  return {
    id: e.id,
    kind: e.kind,
    defId: e.kind === 'loot' && e.loot ? e.loot.itemId : e.defId,
    pos: { x: round(e.pos.x), z: round(e.pos.z) },
    yaw: round(e.yaw),
    hp: Math.max(0, Math.round(e.stats.hp)),
    maxHp: Math.round(e.stats.maxHp),
    realm: e.realm,
    action: e.action,
    targetId: e.combat.targetId,
    ownerId: e.loot?.ownerId ?? null,
    phase: e.ai?.phase ?? 0,
    cast: e.cast
      ? {
          skillId: e.cast.skillId,
          startTick: e.cast.startTick,
          endTick: e.cast.endTick,
        }
      : null,
    gear: e.player ? gearOf(e) : null,
    name: e.player?.name ?? null,
  };
}

function gearOf(e: Entity): Partial<Record<EquipSlot, string>> {
  const out: Partial<Record<EquipSlot, string>> = {};
  const p = e.player;
  if (!p) return out;
  for (const [slot, instanceId] of Object.entries(p.equipment)) {
    const item = p.inventory.find((i) => i.instanceId === instanceId);
    if (item) out[slot as EquipSlot] = item.itemId;
  }
  return out;
}
