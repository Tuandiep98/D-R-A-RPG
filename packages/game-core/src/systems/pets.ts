import type { PetDef } from '@rpg/game-data';
import { areHostile, isAlive, type SimContext } from '../context';
import type { Entity, PlayerSave } from '../entity';
import { clearLine } from '../geometry';
import { distance } from '../math';
import { secondsToTicks, TICK_RATE } from '../time';
import { currentAction, resetTransientActions } from './action-timeline';

export function petProfile(ctx: SimContext, owner: Entity): PetDef | undefined {
  if (!owner.player) return;
  const nodePet = [...owner.player.nodes]
    .reverse()
    .map((id) => ctx.content.cultivation.get(id)?.petId)
    .find(Boolean);
  const id = nodePet ?? ctx.content.characters.get(owner.defId)?.petId;
  return id ? ctx.content.pets.get(id) : undefined;
}

export function companion(ctx: SimContext, owner: Entity): Entity | undefined {
  const id = owner.player?.companion?.entityId;
  const pet = id ? ctx.entities.get(id) : undefined;
  return pet?.pet?.ownerId === owner.id ? pet : undefined;
}

export function exportCompanion(ctx: SimContext, owner: Entity): PlayerSave['companion'] {
  const profile = petProfile(ctx, owner);
  if (!profile) return;
  const pet = companion(ctx, owner);
  const state = owner.player?.companion;
  const hp = !owner.life.alive ? 0 : pet ? pet.stats.hp : state?.hp;
  if (hp === undefined) return;
  const ready = !owner.life.alive
    ? ctx.tick + secondsToTicks(profile.respawnSeconds)
    : pet && !pet.life.alive
      ? (pet.life.respawnAtTick ?? ctx.tick)
      : (state?.readyAtTick ?? ctx.tick);
  return {
    hp: Math.max(0, Math.round(hp)),
    respawnSeconds: Math.max(0, (ready - ctx.tick) / TICK_RATE),
  };
}

/** Controller replacement/transfer retains health and recovery while dropping the old entity. */
export function dismissCompanion(ctx: SimContext, owner: Entity, dead = false): void {
  const pet = companion(ctx, owner);
  const state = owner.player?.companion;
  if (!pet || !state) return;
  state.hp = dead ? 0 : pet.stats.hp;
  state.readyAtTick = dead
    ? ctx.tick + pet.life.respawnTicks
    : !pet.life.alive
      ? (pet.life.respawnAtTick ?? ctx.tick)
      : state.readyAtTick;
  state.entityId = null;
  ctx.removeEntity(pet.id);
}

function spawn(ctx: SimContext, owner: Entity, profile: PetDef): Entity | undefined {
  const def = ctx.content.monsters.get(profile.monsterId);
  const state = owner.player?.companion;
  if (!def || !state) return;
  const maxHp = Math.round(def.stats.hp * profile.hpMultiplier);
  const attack = Math.round(def.stats.attack * profile.attackMultiplier);
  const pos = { ...owner.pos };
  const pet = ctx.addEntity((id) => ({
    id,
    kind: 'pet',
    pet: { ownerId: owner.id, profileId: profile.id },
    defId: def.id,
    faction: owner.faction,
    element: owner.element,
    expression: owner.expression,
    realm: owner.realm,
    pos,
    yaw: owner.yaw,
    inert: false,
    stats: { ...def.stats, hp: Math.min(maxHp, state.hp), maxHp, maxMp: def.stats.mp, attack },
    baseAttack: attack,
    movement: {
      baseSpeed: def.movement.speed * profile.movementMultiplier,
      speed: def.movement.speed * profile.movementMultiplier,
      radius: def.movement.radius,
      goal: null,
      path: null,
      pathTick: 0,
      pathGoal: null,
      dir: null,
      moved: false,
    },
    combat: {
      range: def.combat.range,
      attackIntervalTicks: secondsToTicks(def.combat.attackInterval),
      nextAttackTick: ctx.tick,
      targetId: null,
      lastCombatTick: owner.combat.lastCombatTick,
    },
    life: {
      alive: true,
      respawnTicks: secondsToTicks(profile.respawnSeconds),
      respawnAtTick: null,
      spawnPos: pos,
      lastAttackerId: null,
      damageBy: new Map(),
    },
    ai: null,
    skills: new Map(profile.skills.map((skill) => [skill, 0])),
    cast: null,
    swing: null,
    pending: null,
    player: null,
    loot: null,
    portal: null,
    npc: null,
    action: 'idle',
  }));
  state.entityId = pet.id;
  return pet;
}

export function ensureCompanion(ctx: SimContext, owner: Entity): Entity | undefined {
  const profile = petProfile(ctx, owner);
  const def = profile ? ctx.content.monsters.get(profile.monsterId) : undefined;
  if (!profile || !def || !owner.player || !isAlive(owner)) return;
  owner.player.companion ??= {
    entityId: null,
    hp: Math.round(def.stats.hp * profile.hpMultiplier),
    readyAtTick: ctx.tick,
  };
  const existing = companion(ctx, owner);
  if (existing) return existing;
  if (owner.player.companion.readyAtTick > ctx.tick) return;
  if (owner.player.companion.hp <= 0)
    owner.player.companion.hp = Math.round(def.stats.hp * profile.hpMultiplier);
  return spawn(ctx, owner, profile);
}

/** One owned pet, no autonomous roaming/teleports or extra loot; normal movement and combat resolve it. */
export function petSystem(ctx: SimContext): void {
  for (const owner of ctx.entities.values()) {
    if (!owner.player) continue;
    const profile = petProfile(ctx, owner);
    if (!profile) {
      dismissCompanion(ctx, owner);
      continue;
    }
    const def = ctx.content.monsters.get(profile.monsterId);
    if (!def) continue;
    const maxHp = Math.round(def.stats.hp * profile.hpMultiplier);
    owner.player.companion ??= { entityId: null, hp: maxHp, readyAtTick: ctx.tick };
    const state = owner.player.companion;
    let pet = companion(ctx, owner);
    if (!isAlive(owner)) {
      dismissCompanion(ctx, owner, true);
      continue;
    }
    if (pet && !pet.life.alive) {
      dismissCompanion(ctx, owner);
      pet = undefined;
    }
    if (!pet) {
      if (state.readyAtTick > ctx.tick) continue;
      if (state.hp <= 0) state.hp = maxHp;
      pet = spawn(ctx, owner, profile);
    }
    if (!pet) continue;
    pet.realm = owner.realm;
    pet.element = owner.element;
    pet.expression = owner.expression;
    if (
      distance(pet.pos, owner.pos) > profile.leash ||
      ctx.inSafeZone(owner.pos) ||
      ctx.inSafeZone(pet.pos)
    ) {
      const shield = pet.shield;
      resetTransientActions(pet);
      pet.shield = shield;
      pet.movement.goal =
        distance(pet.pos, owner.pos) > profile.followDistance
          ? { pos: { ...owner.pos }, stopWithin: profile.followDistance }
          : null;
      continue;
    }
    if (pet.cast || pet.monsterSwing || currentAction(ctx, pet)) continue;
    if (
      owner.cast &&
      ctx.content.skills
        .get(owner.cast.skillId)
        ?.effects.some((effect) => effect.type === 'pet_attack')
    ) {
      pet.combat.targetId = null;
      pet.movement.goal = null;
      pet.movement.path = null;
      continue;
    }
    const target = ctx.entities.get(owner.combat.targetId ?? owner.life.lastAttackerId ?? 0);
    if (
      isAlive(target) &&
      !(owner.cloakEndTick && owner.cloakEndTick > ctx.tick) &&
      areHostile(owner, target) &&
      !ctx.inSafeZone(target.pos) &&
      distance(owner.pos, target.pos) <= profile.leash &&
      clearLine(ctx, owner.pos, target.pos) &&
      clearLine(ctx, pet.pos, target.pos)
    ) {
      pet.combat.targetId = target.id;
    } else {
      pet.combat.targetId = null;
      pet.pending = null;
      pet.movement.path = null;
      pet.movement.goal =
        distance(pet.pos, owner.pos) > profile.followDistance
          ? { pos: { ...owner.pos }, stopWithin: profile.followDistance }
          : null;
    }
  }
}
