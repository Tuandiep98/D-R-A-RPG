/**
 * Runtime quality (tech plan §12–13). AUTO watches frame rate and steps the
 * preset down when FPS stays low, and back up after a long stable period.
 */
export type QualityLevel = "low" | "medium" | "high";
export type QualityMode = "auto" | QualityLevel;

export interface QualityPreset {
  level: QualityLevel;
  /** Multiplier on (capped) devicePixelRatio. */
  resolutionScale: number;
  maxPixelRatio: number;
  shadows: "off" | "player" | "all";
  shadowMapSize: number;
  /** Streaming radius in chunks around the player. */
  chunkRadius: number;
  /** Max concurrent pooled VFX of each kind (telegraphs are exempt). */
  vfxCap: number;
  targetFps: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    level: "low",
    resolutionScale: 0.65,
    maxPixelRatio: 1.5,
    shadows: "off",
    shadowMapSize: 512,
    chunkRadius: 1,
    vfxCap: 5,
    targetFps: 30,
  },
  medium: {
    level: "medium",
    resolutionScale: 0.8,
    maxPixelRatio: 2,
    shadows: "player",
    shadowMapSize: 512,
    chunkRadius: 1,
    vfxCap: 10,
    targetFps: 45,
  },
  high: {
    level: "high",
    resolutionScale: 1,
    maxPixelRatio: 2,
    shadows: "all",
    shadowMapSize: 1024,
    chunkRadius: 2,
    vfxCap: 16,
    targetFps: 60,
  },
};

const ORDER: QualityLevel[] = ["low", "medium", "high"];
/** Seconds of low FPS before stepping down / of headroom before stepping up. */
const DOWNGRADE_AFTER = 3;
const UPGRADE_AFTER = 20;

export class QualityManager {
  private modeValue: QualityMode;
  private level: QualityLevel;
  private lowFor = 0;
  private goodFor = 0;
  private warmup = 3;

  constructor(
    mode: QualityMode,
    private readonly apply: (preset: QualityPreset) => void,
    initialAuto: QualityLevel = "medium",
  ) {
    this.modeValue = mode;
    this.level = mode === "auto" ? initialAuto : mode;
    this.apply(QUALITY_PRESETS[this.level]);
  }

  get mode(): QualityMode {
    return this.modeValue;
  }

  get preset(): QualityPreset {
    return QUALITY_PRESETS[this.level];
  }

  setMode(mode: QualityMode): void {
    this.modeValue = mode;
    this.lowFor = this.goodFor = 0;
    this.warmup = 2;
    if (mode !== "auto") this.setLevel(mode);
  }

  /** Feed once per frame with the engine's smoothed FPS. */
  sample(fps: number, dt: number): void {
    if (this.modeValue !== "auto") return;
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    const target = this.preset.targetFps;
    if (fps < target * 0.85) {
      this.lowFor += dt;
      this.goodFor = 0;
    } else if (fps >= Math.min(58, target * 1.25)) {
      this.goodFor += dt;
      this.lowFor = 0;
    } else {
      this.lowFor = Math.max(0, this.lowFor - dt);
    }
    const idx = ORDER.indexOf(this.level);
    if (this.lowFor > DOWNGRADE_AFTER && idx > 0)
      this.setLevel(ORDER[idx - 1] as QualityLevel);
    else if (this.goodFor > UPGRADE_AFTER && idx < ORDER.length - 1)
      this.setLevel(ORDER[idx + 1] as QualityLevel);
  }

  private setLevel(level: QualityLevel): void {
    this.lowFor = this.goodFor = 0;
    this.warmup = 2;
    if (level === this.level && this.modeValue !== "auto") {
      this.apply(QUALITY_PRESETS[level]);
      return;
    }
    this.level = level;
    this.apply(QUALITY_PRESETS[level]);
  }
}
