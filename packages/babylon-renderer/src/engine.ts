import { type AbstractEngine, Engine, WebGPUEngine } from './babylon';

export type EngineKind = 'WebGPU' | 'WebGL2' | 'WebGL1';

export interface CreatedEngine {
  engine: AbstractEngine;
  kind: EngineKind;
}

export interface EngineOptions {
  /** Force WebGL even when WebGPU is available (debugging, `?webgl` in the URL). */
  forceWebGL?: boolean;
  /** Upper bound for devicePixelRatio; higher ratios cost fill rate on mobile. */
  maxPixelRatio?: number;
}

/** WebGPU when supported, otherwise WebGL2 (tech plan §2 Rendering). */
export async function createEngine(
  canvas: HTMLCanvasElement,
  opts: EngineOptions = {},
): Promise<CreatedEngine> {
  const maxDpr = opts.maxPixelRatio ?? 2;
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

  let created: CreatedEngine | null = null;
  if (!opts.forceWebGL && (await WebGPUEngine.IsSupportedAsync)) {
    try {
      const engine = new WebGPUEngine(canvas, {
        antialias: true,
        adaptToDeviceRatio: false,
      });
      await engine.initAsync();
      created = { engine, kind: 'WebGPU' };
    } catch (err) {
      console.warn('[render] WebGPU init failed, falling back to WebGL', err);
    }
  }
  if (!created) {
    const engine = new Engine(canvas, true, { stencil: true, adaptToDeviceRatio: false }, false);
    created = { engine, kind: engine.webGLVersion >= 2 ? 'WebGL2' : 'WebGL1' };
  }
  created.engine.setHardwareScalingLevel(1 / dpr);
  return created;
}
