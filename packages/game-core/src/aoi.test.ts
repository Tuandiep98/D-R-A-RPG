import { describe, expect, it } from "vitest";
import { SpatialGrid } from "./aoi";
import type { Entity } from "./entity";

const at = (id: number, x: number, z: number) =>
  ({ id, pos: { x, z } }) as Entity;

describe("SpatialGrid", () => {
  it("returns entities within the view radius across cell borders", () => {
    const grid = new SpatialGrid({ cellSize: 30, radius: 60 });
    grid.rebuild([at(1, 0, 0), at(2, 59, 0), at(3, 61, 0), at(4, -40, -40)]);
    expect([...grid.query(0, 0)].sort()).toEqual([1, 2, 4]);
  });

  it("caps the result to the nearest entities but always keeps forced ids", () => {
    const grid = new SpatialGrid({ radius: 100, maxEntities: 3 });
    grid.rebuild([
      at(1, 1, 0),
      at(2, 2, 0),
      at(3, 3, 0),
      at(4, 4, 0),
      at(9, 90, 0),
    ]);
    const seen = grid.query(0, 0, [9]);
    expect(seen.size).toBe(3);
    expect(seen.has(9)).toBe(true);
    expect(seen.has(1)).toBe(true);
    expect(seen.has(4)).toBe(false);
  });
});
