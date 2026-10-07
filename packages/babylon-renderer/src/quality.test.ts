import { describe, expect, it } from "vitest";
import { QualityManager, type QualityPreset } from "./quality";

describe("QualityManager", () => {
  it("steps down after sustained low FPS and back up after a long stable period", () => {
    const applied: QualityPreset[] = [];
    const q = new QualityManager("auto", (p) => applied.push(p), "high");
    for (let i = 0; i < 60 * 8; i++) q.sample(30, 1 / 60);
    expect(q.preset.level).toBe("medium");
    for (let i = 0; i < 60 * 40; i++) q.sample(60, 1 / 60);
    expect(q.preset.level).toBe("high");
    expect(applied.map((p) => p.level)).toEqual(["high", "medium", "high"]);
  });

  it("fixed modes ignore FPS", () => {
    const q = new QualityManager("low", () => {});
    for (let i = 0; i < 60 * 30; i++) q.sample(120, 1 / 60);
    expect(q.preset.level).toBe("low");
  });
});
