import type { Element, EntityId, SimEvent } from '@rpg/game-protocol';
import { Color3 } from './babylon';
import type { CombatFx } from './combat-fx';
import { ELEMENT_COLOR } from './elements';
import type { EntityView } from './entity-view';

type SummonEvent = Extract<SimEvent, { type: 'SUMMON' }>;

interface SummonState {
  profileId: string;
  entityId: EntityId | null;
  readyAtTick: number;
  recovering: boolean;
  pulseIn: number;
  tetherIn: number;
}

const BASE_COLOR = Color3.FromHexString('#c4d58c');
const DEATH_COLOR = Color3.FromHexString('#bb7f9c');
const MAX_ACTIVE_SUMMONS = 64;

/**
 * Multi-phase presentation for authoritative summon lifecycle events.
 *
 * The map only remembers presentation state. Whether a pet exists, is dead,
 * or may respawn always comes from SUMMON events and PlayerState.
 */
export class SummonFx {
  private readonly active = new Map<EntityId, SummonState>();

  constructor(private readonly fx: CombatFx) {}

  present(
    event: SummonEvent,
    owner: EntityView | undefined,
    pet: EntityView | undefined,
    element: Element | null | undefined,
  ): void {
    const at = pet?.root.position ?? this.gatePoint(owner);
    const natal = this.natalColor(element);

    if (event.phase === 'materialize') {
      this.remember(event, false);
      this.materialize(at.x, at.z, natal, event.profileId);
      return;
    }

    if (event.phase === 'death') {
      this.remember({ ...event, entityId: null }, true);
      this.death(at.x, at.z, natal);
      return;
    }

    this.active.delete(event.ownerId);
    const destination = owner?.root.position ?? at;
    this.dismiss(at.x, at.z, destination.x, destination.z, natal, event.profileId);
  }

  /** Reconstruct the local persistent mark after reconnect or a missed cosmetic event. */
  sync(
    ownerId: EntityId,
    companion: {
      profileId: string;
      entityId: EntityId | null;
      readyAtTick: number;
    } | null,
    tick: number,
  ): void {
    if (!companion) {
      this.active.delete(ownerId);
      return;
    }
    const state = this.active.get(ownerId);
    if (!state) {
      this.addBounded(ownerId, {
        ...companion,
        recovering: companion.entityId === null,
        pulseIn: 0,
        tetherIn: 0,
      });
      return;
    }
    state.profileId = companion.profileId;
    state.entityId = companion.entityId;
    state.readyAtTick = companion.readyAtTick;
    state.recovering = companion.entityId === null && companion.readyAtTick > tick;
  }

  update(
    dt: number,
    tick: number,
    viewOf: (id: EntityId) => EntityView | undefined,
    elementOf: (id: EntityId) => Element | null | undefined,
  ): void {
    for (const [ownerId, state] of this.active) {
      const owner = viewOf(ownerId);
      if (!owner || owner.root.isDisposed()) {
        this.active.delete(ownerId);
        continue;
      }

      const pet = state.entityId !== null ? viewOf(state.entityId) : undefined;
      state.pulseIn -= dt;
      state.tetherIn -= dt;
      const natal = this.natalColor(elementOf(ownerId));

      if (state.pulseIn <= 0) {
        state.pulseIn = this.fx.quality === 'low' ? 1.1 : 0.72;
        const ready = state.recovering && tick >= state.readyAtTick;
        this.ownerMark(owner, natal, state.profileId, state.recovering, ready);
        if (pet) this.petMark(pet, natal, state.profileId);
      }

      if (pet && this.fx.quality !== 'low' && state.tetherIn <= 0) {
        state.tetherIn = 0.32;
        this.tether(owner, pet, natal);
      }
    }
  }

  reset(): void {
    this.active.clear();
  }

  private remember(event: SummonEvent, recovering: boolean): void {
    this.addBounded(event.ownerId, {
      profileId: event.profileId,
      entityId: event.entityId,
      readyAtTick: event.readyAtTick,
      recovering,
      pulseIn: 0.18,
      tetherIn: 0.18,
    });
  }

  private addBounded(ownerId: EntityId, state: SummonState): void {
    if (!this.active.has(ownerId) && this.active.size >= MAX_ACTIVE_SUMMONS) {
      const oldest = this.active.keys().next().value;
      if (oldest !== undefined) this.active.delete(oldest);
    }
    this.active.set(ownerId, state);
  }

  private gatePoint(owner: EntityView | undefined): { x: number; z: number } {
    if (!owner) return { x: 0, z: 0 };
    const yaw = owner.root.rotation.y;
    return {
      x: owner.root.position.x + Math.sin(yaw) * 1.1,
      z: owner.root.position.z + Math.cos(yaw) * 1.1,
    };
  }

  private natalColor(element: Element | null | undefined): Color3 {
    return element ? Color3.FromHexString(ELEMENT_COLOR[element]) : BASE_COLOR;
  }

  private profileRoll(profileId: string): number {
    let hash = 0;
    for (let i = 0; i < profileId.length; i++) hash = (hash * 31 + profileId.charCodeAt(i)) | 0;
    return ((Math.abs(hash) % 8) * Math.PI) / 4;
  }

  private materialize(x: number, z: number, natal: Color3, profileId: string): void {
    const roll = this.profileRoll(profileId);
    this.fx.sprite({
      sprite: 'rune',
      x,
      y: 0.055,
      z,
      mode: 'flat',
      roll,
      rollEnd: roll + Math.PI * 0.7,
      w: 1.65,
      grow: 0.82,
      life: 0.7,
      color: BASE_COLOR,
      intensity: 1.05,
    });
    this.fx.sprite({
      sprite: 'sigil',
      x,
      y: 0.065,
      z,
      mode: 'flat',
      roll: -roll,
      rollEnd: -roll - Math.PI * 0.45,
      w: 1.15,
      grow: 1.65,
      life: 0.72,
      color: natal,
      intensity: 0.95,
    });
    this.fx.sprite({
      sprite: 'glow',
      x,
      y: 0.85,
      z,
      mode: 'billboard',
      w: 1.05,
      h: 1.75,
      grow: 1.25,
      life: 0.55,
      fadeIn: 0.12,
      color: BASE_COLOR,
      intensity: 0.9,
    });
    this.fx.sparks(x, 0.15, z, natal, 10, 2.5, { gravity: 2.5, size: 0.12 });
  }

  private dismiss(
    x: number,
    z: number,
    ownerX: number,
    ownerZ: number,
    natal: Color3,
    profileId: string,
  ): void {
    const roll = this.profileRoll(profileId);
    this.fx.sprite({
      sprite: 'twirl',
      x,
      y: 0.7,
      z,
      mode: 'billboard',
      roll,
      rollEnd: roll - Math.PI * 1.4,
      w: 1.1,
      grow: 0.15,
      life: 0.48,
      color: natal,
      intensity: 0.9,
    });
    this.link(x, z, ownerX, ownerZ, BASE_COLOR, 0.72, 0.42);

    const dx = ownerX - x;
    const dz = ownerZ - z;
    const distance = Math.max(0.1, Math.hypot(dx, dz));
    const count = this.fx.quality === 'low' ? 3 : 7;
    for (let i = 0; i < count; i++) {
      const life = 0.32 + i * 0.025;
      this.fx.sprite({
        sprite: 'spark',
        x,
        y: 0.28 + (i % 3) * 0.22,
        z,
        mode: 'billboard',
        w: 0.1,
        grow: 0.25,
        life,
        delay: i * 0.025,
        color: i % 2 === 0 ? natal : BASE_COLOR,
        intensity: 1.1,
        vx: (dx / distance) * (distance / life),
        vz: (dz / distance) * (distance / life),
      });
    }
  }

  private death(x: number, z: number, natal: Color3): void {
    this.fx.sprite({
      sprite: 'blast',
      x,
      y: 0.75,
      z,
      mode: 'billboard',
      w: 0.9,
      grow: 2.1,
      life: 0.38,
      color: DEATH_COLOR,
      intensity: 1.05,
    });
    this.fx.sprite({
      sprite: 'scorch',
      x,
      y: 0.055,
      z,
      mode: 'flat',
      w: 0.8,
      grow: 1.8,
      life: 0.62,
      color: natal,
      intensity: 0.55,
    });
    this.fx.sparks(x, 0.4, z, DEATH_COLOR, 8, 2.2, { gravity: 4, size: 0.1 });
  }

  private ownerMark(
    owner: EntityView,
    natal: Color3,
    profileId: string,
    recovering: boolean,
    ready: boolean,
  ): void {
    const p = owner.root.position;
    const roll = this.profileRoll(profileId);
    this.fx.sprite({
      sprite: recovering ? 'rune' : 'sigil',
      x: p.x,
      y: 0.05,
      z: p.z,
      mode: 'flat',
      roll,
      rollEnd: roll + (ready ? Math.PI * 0.5 : Math.PI * 0.18),
      w: recovering ? 0.56 : 0.48,
      grow: ready ? 1.42 : 1.08,
      life: this.fx.quality === 'low' ? 1.15 : 0.78,
      color: recovering ? (ready ? BASE_COLOR : DEATH_COLOR) : natal,
      intensity: ready ? 0.62 : 0.34,
    });
  }

  private petMark(pet: EntityView, natal: Color3, profileId: string): void {
    const p = pet.root.position;
    const roll = -this.profileRoll(profileId);
    this.fx.sprite({
      sprite: 'rune',
      x: p.x,
      y: 0.052,
      z: p.z,
      mode: 'flat',
      roll,
      rollEnd: roll - Math.PI * 0.2,
      w: Math.max(0.45, pet.radius * 1.7),
      grow: 1.12,
      life: this.fx.quality === 'low' ? 1.15 : 0.78,
      color: natal,
      intensity: 0.36,
    });
  }

  private tether(owner: EntityView, pet: EntityView, natal: Color3): void {
    const a = owner.root.position;
    const b = pet.root.position;
    if (Math.hypot(b.x - a.x, b.z - a.z) > 10) return;
    this.link(a.x, a.z, b.x, b.z, natal, 0.25, 0.24);
  }

  private link(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    color: Color3,
    intensity: number,
    life: number,
  ): void {
    const dx = bx - ax;
    const dz = bz - az;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.1) return;
    this.fx.sprite({
      sprite: 'trace',
      x: (ax + bx) * 0.5,
      y: 0.09,
      z: (az + bz) * 0.5,
      mode: 'flat',
      yaw: Math.atan2(dx, dz),
      w: 0.12,
      h: distance,
      grow: 0.9,
      life,
      color,
      intensity,
    });
  }
}
