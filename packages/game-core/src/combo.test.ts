import { ComboDefSchema } from "@rpg/game-data";
import { describe, expect, it } from "vitest";
import { makeContent } from "./test-fixtures";
import { World } from "./world";

describe("basic attack combo", () => {
  it("swings without a target and chains a buffered press into the next step", () => {
    const base = makeContent();
    const combo = ComboDefSchema.parse({
      id: "test_combo",
      name: "Two strikes",
      resetAfter: 1,
      steps: [
        {
          variants: [
            {
              id: "first",
              name: "First",
              clip: "attack",
              windup: 0.1,
              recovery: 0.1,
              damage: 1,
              reach: 1.5,
              arc: 120,
              moveMultiplier: 0.5,
              trail: { shape: "slash" },
            },
          ],
        },
        {
          variants: [
            {
              id: "second",
              name: "Second",
              clip: "attack",
              windup: 0.1,
              recovery: 0.1,
              damage: 2,
              reach: 1.5,
              arc: 120,
              moveMultiplier: 0.5,
              trail: { shape: "slash" },
            },
          ],
        },
      ],
    });
    const world = new World({
      content: { ...base, combos: new Map([[combo.id, combo]]) },
      mapId: "test_map",
    });
    const id = world.spawnPlayer("hero");
    world.enqueueIntent(id, { type: "BASIC_ATTACK" });
    const start = world.step();
    expect(start).toContainEqual(
      expect.objectContaining({
        type: "ATTACK",
        sourceId: id,
        targetId: null,
        combo: expect.objectContaining({ step: 0, variantId: "first" }),
      }),
    );
    world.enqueueIntent(id, { type: "BASIC_ATTACK" });
    const events = world.step();
    expect(events.some((e) => e.type === "ATTACK" && e.combo?.step === 1)).toBe(
      false,
    );
    const later = [...events];
    for (let i = 0; i < 5; i++) later.push(...world.step());
    expect(later.some((e) => e.type === "ATTACK" && e.combo?.step === 1)).toBe(
      true,
    );
  });

  it("lunges only inside lungeWindow and keeps the swing facing while walking", () => {
    const base = makeContent();
    const combo = ComboDefSchema.parse({
      id: "test_combo",
      name: "Leap",
      resetAfter: 1,
      steps: [
        {
          variants: [
            {
              id: "leap",
              name: "Leap",
              clip: "attack",
              windup: 0.5,
              recovery: 0.2,
              damage: 3,
              reach: 2,
              arc: 100,
              moveMultiplier: 0.5,
              lunge: 2,
              lungeWindow: [0.4, 0.8],
              heavy: true,
              trail: { shape: "smash", impact: "quake" },
            },
          ],
        },
      ],
    });
    const world = new World({
      content: { ...base, combos: new Map([[combo.id, combo]]) },
      mapId: "test_map",
    });
    const id = world.spawnPlayer("hero");
    const hero = world.entities.get(id);
    if (!hero) throw new Error("no hero");
    // Swing toward +X, then hold "walk toward +Z" during the swing.
    world.enqueueIntent(id, {
      type: "BASIC_ATTACK",
      aim: { x: hero.pos.x + 5, z: hero.pos.z },
    });
    world.step();
    const yaw = hero.yaw;
    expect(yaw).toBeCloseTo(Math.PI / 2, 3);
    world.enqueueIntent(id, { type: "MOVE_DIR", dir: { x: 0, z: 1 } });
    const startX = hero.pos.x;
    world.step();
    world.step();
    // 10-tick wind-up, window [4, 8): no lunge yet, the body only walks (slowed) along +Z.
    expect(hero.pos.x - startX).toBeCloseTo(0, 3);
    for (let i = 0; i < 8; i++) world.step();
    expect(hero.pos.x - startX).toBeCloseTo(2, 1);
    expect(hero.yaw).toBeCloseTo(yaw, 6);
  });
});
