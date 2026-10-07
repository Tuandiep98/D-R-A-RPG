import type { EntityId } from "@rpg/game-protocol";
import type { PartyService, SimContext } from "../context";
import type { Entity } from "../entity";
import { distance } from "../math";
import { secondsToTicks } from "../time";

export const PARTY_MAX = 5;
const INVITE_SECONDS = 30;
/** Members this close to a kill share its quest credit (tech plan Phase 8). */
export const PARTY_SHARE_RANGE = 40;

export interface Party {
  id: number;
  leaderId: EntityId;
  members: EntityId[];
}

/** World-owned party bookkeeping (parties do not cross maps in the MVP). */
export class Parties implements PartyService {
  private nextId = 1;
  readonly byId = new Map<number, Party>();
  /** target → (inviter, expiry tick) */
  private readonly invites = new Map<
    EntityId,
    { fromId: EntityId; expires: number }
  >();

  invite(ctx: SimContext, from: Entity, target: Entity): boolean {
    if (!from.player || !target.player || from.id === target.id) {
      ctx.notice(from.id, "invalid");
      return false;
    }
    if (target.player.partyId !== null) {
      ctx.notice(from.id, "already_in_party");
      return false;
    }
    const party =
      from.player.partyId !== null
        ? this.byId.get(from.player.partyId)
        : undefined;
    if (party && party.members.length >= PARTY_MAX) {
      ctx.notice(from.id, "party_full");
      return false;
    }
    this.invites.set(target.id, {
      fromId: from.id,
      expires: ctx.tick + secondsToTicks(INVITE_SECONDS),
    });
    ctx.emit({
      type: "PARTY_INVITE",
      ownerId: target.id,
      fromId: from.id,
      fromName: from.player.name,
    });
    return true;
  }

  accept(ctx: SimContext, target: Entity, fromId: EntityId): boolean {
    const inv = this.invites.get(target.id);
    const from = ctx.entities.get(fromId);
    if (
      !inv ||
      inv.fromId !== fromId ||
      inv.expires < ctx.tick ||
      !from?.player ||
      !target.player
    ) {
      ctx.notice(target.id, "no_invite");
      return false;
    }
    this.invites.delete(target.id);
    if (target.player.partyId !== null) {
      ctx.notice(target.id, "already_in_party");
      return false;
    }
    let party =
      from.player.partyId !== null
        ? this.byId.get(from.player.partyId)
        : undefined;
    if (!party) {
      party = { id: this.nextId++, leaderId: from.id, members: [from.id] };
      this.byId.set(party.id, party);
      from.player.partyId = party.id;
    }
    if (party.members.length >= PARTY_MAX) {
      ctx.notice(target.id, "party_full");
      return false;
    }
    party.members.push(target.id);
    target.player.partyId = party.id;
    return true;
  }

  leave(e: Entity): void {
    const id = e.player?.partyId;
    if (id === null || id === undefined || !e.player) return;
    e.player.partyId = null;
    const party = this.byId.get(id);
    if (!party) return;
    party.members = party.members.filter((m) => m !== e.id);
    if (party.leaderId === e.id) party.leaderId = party.members[0] ?? 0;
    if (party.members.length <= 1) this.disband(party, e.id);
  }

  /** Called when a player entity is removed (logout, transfer). */
  remove(ctx: SimContext, id: EntityId): void {
    this.invites.delete(id);
    for (const party of this.byId.values()) {
      if (!party.members.includes(id)) continue;
      party.members = party.members.filter((m) => m !== id);
      if (party.leaderId === id) party.leaderId = party.members[0] ?? 0;
      if (party.members.length <= 1) {
        for (const m of party.members) {
          const p = ctx.entities.get(m)?.player;
          if (p) p.partyId = null;
        }
        this.byId.delete(party.id);
      }
    }
  }

  private disband(party: Party, _by: EntityId): void {
    this.byId.delete(party.id);
    void party;
  }

  /** Party members (including `e`) close to `pos`, for kill credit. */
  nearbyMembers(
    ctx: SimContext,
    e: Entity,
    pos: { x: number; z: number },
  ): Entity[] {
    const party =
      e.player?.partyId !== null && e.player?.partyId !== undefined
        ? this.byId.get(e.player.partyId)
        : undefined;
    if (!party) return [e];
    const out: Entity[] = [];
    for (const id of party.members) {
      const m = ctx.entities.get(id);
      if (
        m?.player &&
        m.life.alive &&
        distance(m.pos, pos) <= PARTY_SHARE_RANGE
      )
        out.push(m);
    }
    return out.length ? out : [e];
  }

  sameParty(a: Entity, b: Entity): boolean {
    return (
      a.player?.partyId !== null &&
      a.player?.partyId !== undefined &&
      a.player.partyId === b.player?.partyId
    );
  }
}
