import type { SimEvent } from "@rpg/game-protocol";
import { describe, expect, it } from "vitest";
import type { Entity } from "./entity";
import { makeContent } from "./test-fixtures";
import { World } from "./world";

const run = (world: World, ticks: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step());
  return events;
};
const get = (world: World, id: number): Entity => {
  const e = world.entities.get(id);
  if (!e) throw new Error(`no entity ${id}`);
  return e;
};

function partyWorld() {
  const world = new World({
    content: makeContent({
      monster: { stats: { hp: 1, attack: 0, defense: 0, critChance: 0 } },
    }),
    mapId: "test_map",
  });
  const a = world.spawnPlayer("hero", { name: "An" });
  const b = world.spawnPlayer("hero", { name: "Bình" });
  get(world, b).pos = { x: 3, z: 0 };
  return { world, a, b };
}

describe("party", () => {
  it("invites, accepts and exposes members in player state", () => {
    const { world, a, b } = partyWorld();
    world.enqueueIntent(a, { type: "PARTY_INVITE", targetId: b });
    const ev = world.step();
    expect(ev.find((e) => e.type === "PARTY_INVITE")).toMatchObject({
      ownerId: b,
      fromId: a,
      fromName: "An",
    });
    world.enqueueIntent(b, { type: "PARTY_ACCEPT", fromId: a });
    world.step();
    const party = world.playerState(b)?.party;
    expect(party?.leaderId).toBe(a);
    expect(party?.members.map((m) => m.name)).toEqual(["An", "Bình"]);
  });

  it("accepting without an invite is refused", () => {
    const { world, a, b } = partyWorld();
    world.enqueueIntent(b, { type: "PARTY_ACCEPT", fromId: a });
    expect(
      world.step().some((e) => e.type === "NOTICE" && e.code === "no_invite"),
    ).toBe(true);
  });

  it("shares kill quest credit with nearby members and lets them loot", () => {
    const { world, a, b } = partyWorld();
    world.enqueueIntent(a, { type: "PARTY_INVITE", targetId: b });
    world.step();
    world.enqueueIntent(b, { type: "PARTY_ACCEPT", fromId: a });
    world.step();
    let mob: Entity | undefined;
    for (const e of world.entities.values()) if (e.kind === "monster") mob = e;
    if (!mob) throw new Error("no mob");
    for (const id of [a, b])
      world.entities.get(id)?.player?.quests.push({
        questId: "q_wolves",
        status: "active",
        progress: [0],
      });
    mob.pos = { x: 0, z: 1.2 };
    world.enqueueIntent(a, { type: "ATTACK_TARGET", targetId: mob.id });
    run(world, 3);
    expect(world.playerState(a)?.quests[0]?.status).toBe("ready");
    expect(world.playerState(b)?.quests[0]?.status).toBe("ready");
    const loot = [...world.entities.values()].find((e) => e.kind === "loot");
    if (!loot) throw new Error("no loot");
    get(world, b).pos = { ...loot.pos };
    world.enqueueIntent(b, { type: "PICKUP", lootId: loot.id });
    world.step();
    expect(world.entities.has(loot.id)).toBe(false);
  });

  it("disbands when one of two members leaves the map", () => {
    const { world, a, b } = partyWorld();
    world.enqueueIntent(a, { type: "PARTY_INVITE", targetId: b });
    world.step();
    world.enqueueIntent(b, { type: "PARTY_ACCEPT", fromId: a });
    world.step();
    world.removeEntity(b);
    expect(world.playerState(a)?.party).toBeNull();
  });
});
