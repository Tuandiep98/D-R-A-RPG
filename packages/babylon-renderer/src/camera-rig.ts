import { ArcRotateCamera, type Scene, Vector3 } from '@babylonjs/core';

const DEG = Math.PI / 180;

export interface CameraRigOptions {
  /** Babylon beta is measured from straight up; 35°–55° ≈ 55°–35° pitch above ground. */
  minBeta?: number;
  maxBeta?: number;
  minRadius?: number;
  maxRadius?: number;
}

/**
 * Orbit camera around the player (decision D-002). Driven by GameActions,
 * not Babylon's built-in inputs, so touch/mouse/gamepad stay swappable.
 */
export class CameraRig {
  readonly camera: ArcRotateCamera;
  private readonly focus = new Vector3();
  private readonly opts: Required<CameraRigOptions>;

  constructor(scene: Scene, opts: CameraRigOptions = {}) {
    this.opts = {
      minBeta: opts.minBeta ?? 35 * DEG,
      maxBeta: opts.maxBeta ?? 55 * DEG,
      minRadius: opts.minRadius ?? 6,
      maxRadius: opts.maxRadius ?? 20,
    };
    this.camera = new ArcRotateCamera('camera', -Math.PI / 2, 48 * DEG, 13, Vector3.Zero(), scene);
    this.camera.lowerBetaLimit = this.opts.minBeta;
    this.camera.upperBetaLimit = this.opts.maxBeta;
    this.camera.lowerRadiusLimit = this.opts.minRadius;
    this.camera.upperRadiusLimit = this.opts.maxRadius;
    this.camera.minZ = 0.3;
    this.camera.maxZ = 200;
    this.camera.fov = 0.8;
  }

  rotate(dx: number, dy: number): void {
    this.camera.alpha -= dx * 0.006;
    this.camera.beta = clamp(this.camera.beta - dy * 0.004, this.opts.minBeta, this.opts.maxBeta);
  }

  zoom(delta: number): void {
    this.camera.radius = clamp(
      this.camera.radius + delta * 1.3,
      this.opts.minRadius,
      this.opts.maxRadius,
    );
  }

  /** Smoothly follows `x,z`; call once per frame. */
  follow(x: number, z: number, dt: number, snap = false): void {
    this.focus.set(x, 1, z);
    if (snap) {
      this.camera.target.copyFrom(this.focus);
      return;
    }
    const t = 1 - Math.exp(-dt * 10);
    Vector3.LerpToRef(this.camera.target, this.focus, t, this.camera.target);
  }
}

const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
