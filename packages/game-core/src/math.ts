/** Point/vector on the gameplay ground plane (XZ). */
export interface Vec2 {
  x: number;
  z: number;
}

export const vec2 = (x = 0, z = 0): Vec2 => ({ x, z });
export const copy = (v: Vec2): Vec2 => ({ x: v.x, z: v.z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, z: v.z * s });
export const length = (v: Vec2): number => Math.hypot(v.x, v.z);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Facing angle so that yaw 0 looks down +Z and yaw π/2 looks down +X. */
export const yawOf = (dir: Vec2): number => Math.atan2(dir.x, dir.z);

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export interface Bounds {
  min: Vec2;
  max: Vec2;
}

export const clampToBounds = (p: Vec2, b: Bounds, margin = 0): Vec2 => ({
  x: clamp(p.x, b.min.x + margin, b.max.x - margin),
  z: clamp(p.z, b.min.z + margin, b.max.z - margin),
});
