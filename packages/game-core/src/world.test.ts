import type { SimEvent } from "@rpg/game-protocol";
import { describe, expect, it } from "vitest";
import type { Entity } from "./entity";
import { Rng } from "./rng";
import { rollDamage } from "./systems/combat";
import { makeContent } from "./test-fixtures";
import { secondsToTicks, TICK_RATE } from "./time";
import { World } from "./world";

const run = (world: World, ticks: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step());
  return events;
};

const monsterOf = (world: World): Entity => {
  for (const e of world.entities.values()) if (e.kind === "monster") return e;
  throw new Error("no monster");
};

const get = (world: World, id: number): Entity => {
  const e = world.entities.get(id);
  if (!e) throw new Error(`no entity ${id}`);
  return e;
};

describe("Rng", () => {
  it("is reproducible from a seed", () => {
    const a = new Rng(7);
    const b = new Rng(7);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe("rollDamage", () => {
  const attacker = { attack: 50, defense: 0, critChance: 0, critMultiplier: 2 };
  it("is mitigated by defense and never below 1", () => {
    const rng = new Rng(1);
    const noArmor = rollDamage(rng, attacker, {
      ...attacker,
      defense: 0,
    }).amount;
    const armored = rollDamage(new Rng(1), attacker, {
      ...attacker,
      defense: 40,
    }).amount;
    expect(armored).toBeLessThan(noArmor);
    const weak = { ...attacker, attack: 0 };
    expect(rollDamage(rng, weak, attacker).amount).toBe(1);
  });

  it("applies crit multiplier", () => {
    const crit = rollDamage(
      new Rng(3),
      { ...attacker, critChance: 1 },
      attacker,
    );
    expect(crit.crit).toBe(true);
    expect(crit.amount).toBeGreaterThanOrEqual(90);
  });
});

describe("World", () => {
  it("spawns monsters from map data and the player on request", () => {
    const world = new World({ content: makeContent(), mapId: "test_map" });
    const playerId = world.spawnPlayer("hero");
    const events = world.step();
    expect([...world.entities.values()].filter((e) => !e.inert)).toHaveLength(
      2,
    );
    expect(events.filter((e) => e.type === "SPAWN")).toHaveLength(2);
    expect(get(world, playerId).pos).toEqual({ x: 0, z: 0 });
  });

  it("moves toward MOVE_TO at the configured speed", () => {
    const world = new World({ content: makeContent(), mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    world.enqueueIntent(id, { type: "MOVE_TO", target: { x: 10, z: 0 } });
    run(world, TICK_RATE); // one second at 5 m/s
    expect(get(world, id).pos.x).toBeCloseTo(5, 1);
    run(world, TICK_RATE * 2);
    expect(get(world, id).pos.x).toBeGreaterThan(9.9);
    expect(get(world, id).action).toBe("idle");
  });

  it("walks along a held MOVE_DIR until released", () => {
    const world = new World({ content: makeContent(), mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    // Not unit length: the host normalises it.
    world.enqueueIntent(id, { type: "MOVE_DIR", dir: { x: 0, z: -0.5 } });
    run(world, TICK_RATE);
    expect(get(world, id).pos.z).toBeCloseTo(-5, 1);
    expect(get(world, id).action).toBe("move");
    world.enqueueIntent(id, { type: "MOVE_DIR", dir: null });
    run(world, 2);
    const z = get(world, id).pos.z;
    run(world, TICK_RATE);
    expect(get(world, id).pos.z).toBe(z);
    expect(get(world, id).action).toBe("idle");
  });

  it("a fresh MOVE_DIR cancels auto-attack; steering keeps the new state", () => {
    const world = new World({ content: makeContent(), mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    const mob = monsterOf(world);
    world.enqueueIntent(id, { type: "ATTACK_TARGET", targetId: mob.id });
    world.step();
    world.enqueueIntent(id, { type: "MOVE_DIR", dir: { x: 1, z: 0 } });
    world.step();
    expect(get(world, id).combat.targetId).toBeNull();
    world.enqueueIntent(id, { type: "ATTACK_TARGET", targetId: mob.id });
    world.enqueueIntent(id, { type: "MOVE_DIR", dir: { x: 0, z: 1 } });
    world.step();
    expect(get(world, id).combat.targetId).toBe(mob.id);
    expect(get(world, id).movement.dir).toEqual({ x: 0, z: 1 });
  });

  it("clamps MOVE_TO inside map bounds", () => {
    const world = new World({ content: makeContent(), mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    world.enqueueIntent(id, { type: "MOVE_TO", target: { x: 500, z: 0 } });
    run(world, TICK_RATE * 20);
    expect(get(world, id).pos.x).toBeLessThanOrEqual(50);
  });

  it("rejects attacks on missing, dead or friendly targets", () => {
    const world = new World({ content: makeContent(), mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    world.enqueueIntent(id, { type: "ATTACK_TARGET", targetId: 999 });
    world.enqueueIntent(id, { type: "ATTACK_TARGET", targetId: id });
    world.step();
    expect(world.stats.rejectedIntents).toBe(2);
    expect(get(world, id).combat.targetId).toBeNull();
  });

  it("approaches and attacks on cooldown counted in ticks", () => {
    const world = new World({ content: makeContent(), mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    const mob = monsterOf(world);
    world.enqueueIntent(id, { type: "ATTACK_TARGET", targetId: mob.id });
    const events = run(world, TICK_RATE * 6);
    const swings = events.filter(
      (e) => e.type === "ATTACK" && e.sourceId === id,
    );
    expect(swings.length).toBeGreaterThanOrEqual(2);
    const damage = events.filter(
      (e) => e.type === "DAMAGE" && e.sourceId === id,
    );
    expect(damage.length).toBe(swings.length);
  });

  it("kills, then respawns the monster at its home with full HP", () => {
    const content = makeContent({
      monster: { stats: { hp: 1, attack: 0, defense: 0, critChance: 0 } },
    });
    const world = new World({ content, mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    const mob = monsterOf(world);
    const home = { ...mob.life.spawnPos };
    world.enqueueIntent(id, { type: "ATTACK_TARGET", targetId: mob.id });
    const events = run(world, TICK_RATE * 6);
    expect(
      events.some(
        (e) => e.type === "DEATH" && e.id === mob.id && e.killerId === id,
      ),
    ).toBe(true);
    expect(mob.life.alive).toBe(false);
    expect(mob.action).toBe("dead");
    expect(get(world, id).combat.targetId).toBeNull();

    let respawned = false;
    for (let i = 0; i <= secondsToTicks(3) && !respawned; i++) {
      respawned = world
        .step()
        .some((e) => e.type === "RESPAWN" && e.id === mob.id);
    }
    expect(respawned).toBe(true);
    expect(mob.life.alive).toBe(true);
    expect(mob.stats.hp).toBe(mob.stats.maxHp);
    expect(mob.pos).toEqual(home);
  });

  it("aggroes a player inside aggroRadius and chases", () => {
    const world = new World({ content: makeContent(), mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    const mob = monsterOf(world);
    world.enqueueIntent(id, { type: "MOVE_TO", target: { x: 0, z: 16 } });
    run(world, TICK_RATE * 4);
    expect(mob.ai?.state).toBe("chase");
    expect(mob.combat.targetId).toBe(id);
  });

  it("leashes back home and heals when pulled too far", () => {
    const world = new World({ content: makeContent(), mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    const mob = monsterOf(world);
    // Pull aggro, then run far away (player is faster than the wolf).
    world.enqueueIntent(id, { type: "MOVE_TO", target: { x: 0, z: 16 } });
    run(world, TICK_RATE * 4);
    mob.stats.hp = 10;
    world.enqueueIntent(id, { type: "MOVE_TO", target: { x: 0, z: -45 } });
    run(world, TICK_RATE * 8);
    expect(["return", "idle"]).toContain(mob.ai?.state);
    run(world, TICK_RATE * 10);
    expect(mob.ai?.state).toBe("idle");
    expect(mob.stats.hp).toBe(mob.stats.maxHp);
  });

  it("player dies and respawns at the map spawn point", () => {
    const content = makeContent({
      character: {
        stats: { hp: 1, attack: 0, defense: 0, critChance: 0 },
        starterItems: [],
      },
    });
    const world = new World({ content, mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    world.enqueueIntent(id, { type: "MOVE_TO", target: { x: 0, z: 18 } });
    const events = run(world, TICK_RATE * 6);
    expect(events.some((e) => e.type === "DEATH" && e.id === id)).toBe(true);
    run(world, secondsToTicks(5) + 1);
    const player = get(world, id);
    expect(player.life.alive).toBe(true);
    expect(player.pos).toEqual({ x: 0, z: 0 });
  });

  it("collides with static obstacles", () => {
    const content = makeContent({
      map: {
        chunks: [
          {
            id: "chunk_0_0",
            instances: [
              {
                appearanceId: "look",
                position: [5, 0, 0.3],
                rotationY: 0,
                scale: 1,
                colliderRadius: 1,
              },
            ],
          },
        ],
        spawns: [],
      },
    });
    const world = new World({ content, mapId: "test_map" });
    const id = world.spawnPlayer("hero");
    world.enqueueIntent(id, { type: "MOVE_TO", target: { x: 10, z: 0 } });
    for (let i = 0; i < TICK_RATE * 4; i++) {
      world.step();
      const p = get(world, id).pos;
      expect(Math.hypot(p.x - 5, p.z - 0.3)).toBeGreaterThanOrEqual(1.4 - 1e-6);
    }
  });

  it("is deterministic for the same seed and intents", () => {
    const play = () => {
      const world = new World({
        content: makeContent(),
        mapId: "test_map",
        seed: 99,
      });
      const id = world.spawnPlayer("hero");
      world.enqueueIntent(id, {
        type: "ATTACK_TARGET",
        targetId: monsterOf(world).id,
      });
      return run(world, TICK_RATE * 10);
    };
    expect(play()).toEqual(play());
  });
});
