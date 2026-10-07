import { ArcRotateCamera, type Scene, Vector3 } from './babylon';

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
  /** Followed point before shake is added. */
  private readonly smooth = new Vector3();
  private readonly opts: Required<CameraRigOptions>;
  private shakeAmp = 0;
  private shakeTime = 0;
  private shakeDecay = 1;
  private readonly shakeDir = new Vector3(1, 0, 0);
  /** Extra radius that springs back to 0 (negative = punch in). */
  private kickRadius = 0;
  private kickApplied = 0;
  /** User multiplier for shake (0 turns it off; accessibility). */
  shakeScale = 1;

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

  /**
   * Impact shake: a decaying wobble of the look-at point, biased along `dir`
   * (world XZ, e.g. a slash's sweep) so the screen moves with the blow.
   */
  shake(strength: number, seconds: number, dirX = 0, dirZ = 0): void {
    const amp = strength * this.shakeScale;
    if (amp <= this.shakeAmp) return;
    this.shakeAmp = amp;
    this.shakeDecay = 1 / Math.max(0.05, seconds);
    this.shakeTime = 0;
    const len = Math.hypot(dirX, dirZ);
    if (len > 1e-4) this.shakeDir.set(dirX / len, 0, dirZ / len);
    else
      this.shakeDir.set(
        Math.cos(this.camera.alpha + Math.PI / 2),
        0,
        Math.sin(this.camera.alpha + Math.PI / 2),
      );
  }

  /** Brief zoom punch toward the player (heavy finishers). */
  kick(metres: number): void {
    this.kickRadius = Math.min(this.kickRadius, -Math.abs(metres) * this.shakeScale);
  }

  /** Smoothly follows `x,z`; call once per frame. */
  follow(x: number, z: number, dt: number, snap = false): void {
    this.focus.set(x, 1, z);
    if (snap) this.smooth.copyFrom(this.focus);
    else Vector3.LerpToRef(this.smooth, this.focus, 1 - Math.exp(-dt * 10), this.smooth);
    this.camera.target.copyFrom(this.smooth);
    if (this.shakeAmp > 0.001) {
      this.shakeTime += dt;
      const a = this.shakeAmp;
      // Two incommensurate sines read as noise without any per-frame randomness.
      const along = Math.sin(this.shakeTime * 61) * a;
      const up = Math.sin(this.shakeTime * 47 + 1.3) * a * 0.6;
      this.camera.target.x += this.shakeDir.x * along;
      this.camera.target.z += this.shakeDir.z * along;
      this.camera.target.y += up;
      this.shakeAmp *= Math.exp(-dt * this.shakeDecay * 4);
    } else this.shakeAmp = 0;
    if (this.kickRadius !== 0 || this.kickApplied !== 0) {
      this.kickRadius = this.kickRadius < -0.01 ? this.kickRadius * Math.exp(-dt * 7) : 0;
      this.camera.radius += this.kickRadius - this.kickApplied;
      this.kickApplied = this.kickRadius;
    }
  }
}

const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
