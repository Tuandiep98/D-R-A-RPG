import type { SimEvent } from "@rpg/game-protocol";
import { describe, expect, it } from "vitest";
import type { Entity } from "./entity";
import { makeContent } from "./test-fixtures";
import { secondsToTicks } from "./time";
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
const notices = (events: SimEvent[]) =>
  events.flatMap((e) => (e.type === "NOTICE" ? [e.code] : []));
const giveFangs = (world: World, id: number, count: number) =>
  get(world, id).player?.inventory.push({
    instanceId: `fang-${count}`,
    itemId: "fang",
    count,
  });

const SAFE_SPAWN = {
  zones: [
    {
      id: "town",
      name: "Town",
      kind: "safe",
      center: { x: 0, z: 0 },
      radius: 5,
    },
  ],
};

describe("cultivation nodes", () => {
  it("opening a node spends its cost, adds its bonus and unlocks its skill", () => {
    const world = new World({ content: makeContent(), mapId: "test_map" });
    const id = world.spawnPlayer("hero", {
      save: {
        characterId: "hero",
        realm: "r0",
        nodes: [],
        gold: 0,
        hp: 500,
        mp: 100,
        inventory: [{ instanceId: "f", itemId: "fang", count: 2 }],
        equipment: {},
      },
    });
    world.enqueueIntent(id, { type: "OPEN_NODE", nodeId: "n_bone" });
    world.enqueueIntent(id, { type: "OPEN_NODE", nodeId: "n_arm" });
    const events = world.step();
    expect(events.filter((e) => e.type === "NODE_OPENED")).toHaveLength(2);
    const state = world.playerState(id);
    expect(state?.nodes).toEqual(["n_bone", "n_arm"]);
    expect(state?.maxHp).toBe(600);
    expect(state?.meridianLoad).toBe(10);
    expect(state?.bodyLoad).toBe(10);
    expect(state?.inventory.find((i) => i.itemId === "fang")?.count).toBe(1);
    expect(state?.skills.map((s) => s.skillId)).toContain("slam");
  });

  it("refuses nodes over capacity, without prerequisites, or above the realm", () => {
    const world = new World({ content: makeContent(), mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    giveFangs(world, id, 5);
    world.enqueueIntent(id, { type: "OPEN_NODE", nodeId: "n_big" });
    world.enqueueIntent(id, { type: "OPEN_NODE", nodeId: "n_high" });
    expect(notices(world.step())).toEqual([
      "requirements_unmet",
      "realm_too_low",
    ]);

    world.enqueueIntent(id, { type: "OPEN_NODE", nodeId: "n_bone" });
    world.enqueueIntent(id, { type: "OPEN_NODE", nodeId: "n_big" }); // 10 + 15 > 20
    expect(notices(world.step())).toEqual(["capacity_full"]);
    expect(world.playerState(id)?.nodes).toEqual(["n_bone"]);
  });
});

describe("breakthrough", () => {
  it("must happen in a safe zone and needs enough nodes", () => {
    const world = new World({ content: makeContent(), mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    world.enqueueIntent(id, { type: "BREAKTHROUGH" });
    expect(notices(world.step())).toEqual(["not_in_safe_zone"]);

    const safe = new World({
      content: makeContent({ map: SAFE_SPAWN }),
      mapId: "test_map",
    });
    const p = safe.spawnPlayer("hero");
    safe.enqueueIntent(p, { type: "BREAKTHROUGH" });
    expect(notices(safe.step())).toEqual(["requirements_unmet"]);
  });

  it("success raises the realm, its stats and capacity, and heals fully", () => {
    const world = new World({
      content: makeContent({ map: SAFE_SPAWN }),
      mapId: "test_map",
    });
    const id = world.spawnPlayer("hero");
    giveFangs(world, id, 2);
    get(world, id).stats.hp = 10;
    world.enqueueIntent(id, { type: "OPEN_NODE", nodeId: "n_bone" });
    world.step();
    world.enqueueIntent(id, { type: "BREAKTHROUGH" });
    const events = world.step();
    expect(events).toContainEqual({
      type: "BREAKTHROUGH",
      id,
      realm: 1,
      success: true,
    });
    const state = world.playerState(id);
    expect(state?.realm).toBe("r1");
    expect(state?.maxHp).toBe(650); // 500 + 100 node + 50 realm
    expect(state?.hp).toBe(650);
    expect(state?.stats.attack).toBe(55); // 30 + 20 sword + 5 realm
    expect(state?.inventory.some((i) => i.itemId === "fang")).toBe(false);
    expect(world.exportPlayer(id)).toMatchObject({
      realm: "r1",
      nodes: ["n_bone"],
    });

    // The higher realm opens nodes that were locked before.
    world.enqueueIntent(id, { type: "OPEN_NODE", nodeId: "n_high" });
    world.step();
    expect(world.playerState(id)?.nodes).toContain("n_high");
  });

  it("failure keeps progression, spends materials and applies a backlash", () => {
    const content = makeContent({
      map: SAFE_SPAWN,
      realm1: {
        breakthrough: {
          minNodes: 0,
          materials: [{ itemId: "fang", count: 1 }],
          baseChance: 0,
          backlashSeconds: 10,
          backlashAttack: 0.5,
        },
      },
    });
    const world = new World({ content, mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    giveFangs(world, id, 2);
    world.enqueueIntent(id, { type: "BREAKTHROUGH" });
    const events = world.step();
    expect(events).toContainEqual({
      type: "BREAKTHROUGH",
      id,
      realm: 0,
      success: false,
    });
    expect(world.playerState(id)?.realm).toBe("r0");
    expect(world.playerState(id)?.backlashUntilTick).toBe(
      world.tick + secondsToTicks(10),
    );
    expect(
      world.playerState(id)?.inventory.find((i) => i.itemId === "fang")?.count,
    ).toBe(1);

    world.enqueueIntent(id, { type: "BREAKTHROUGH" });
    expect(notices(world.step())).toEqual(["backlash"]);
  });
});

describe("realm gap", () => {
  it("a lower realm deals much less damage to a higher one", () => {
    const hit = (monsterRealm: string) => {
      const world = new World({
        content: makeContent({
          monster: {
            realm: monsterRealm,
            stats: { hp: 10000, attack: 0, defense: 0 },
          },
        }),
        mapId: "test_map",
        seed: 7,
      });
      const id = world.spawnPlayer("hero");
      const p = get(world, id);
      let mob: Entity | undefined;
      for (const e of world.entities.values())
        if (e.kind === "monster") mob = e;
      if (!mob) throw new Error("no mob");
      mob.pos = { x: p.pos.x, z: p.pos.z + 1.2 };
      world.enqueueIntent(id, { type: "ATTACK_TARGET", targetId: mob.id });
      const dmg = run(world, 2).find(
        (e) => e.type === "DAMAGE" && e.sourceId === id,
      );
      return dmg?.type === "DAMAGE" ? dmg.amount : 0;
    };
    const same = hit("r0");
    const above = hit("r1");
    expect(same).toBeGreaterThan(0);
    expect(above).toBe(Math.max(1, Math.round(same * 0.5)));
  });
});
