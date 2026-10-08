import {
  Color3,
  type Mesh,
  MeshBuilder,
  type Scene,
  StandardMaterial,
  type TransformNode,
  Vector3,
} from './babylon';

/** Rarity colours shared by loot beams and the HUD (assets plan §9). */
export const RARITY_COLORS: Record<string, string> = {
  common: '#d8d8d8',
  uncommon: '#5fd068',
  rare: '#4aa3ff',
  epic: '#b46bff',
  legendary: '#ffb02e',
  mythic: '#ff4f6d',
};

const VFX_COLORS: Record<string, Color3> = {
  slash: new Color3(1, 0.95, 0.8),
  whirl: new Color3(0.7, 0.9, 1),
  slam: new Color3(1, 0.6, 0.25),
  projectile: new Color3(0.5, 0.95, 1),
  heal: new Color3(0.4, 1, 0.5),
  level: new Color3(1, 0.85, 0.3),
  thunder_dash: new Color3(0.23, 0.78, 1),
  thunder_arc: new Color3(0.38, 0.68, 1),
  thunder_field: new Color3(0.35, 0.62, 1),
  thunder_projectile: new Color3(0.54, 0.9, 1),
  thunder_strike: new Color3(0.74, 0.86, 1),
  thunder_ultimate: new Color3(0.65, 0.38, 1),
};

function emissive(scene: Scene, name: string, color: Color3, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.emissiveColor = color;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.disableLighting = true;
  m.alpha = alpha;
  return m;
}

/** Fixed-size pool; when full the oldest effect is reused (bounded cost, assets plan §9). */
class Pool<T extends { active: boolean; age: number }> {
  readonly items: T[] = [];
  constructor(
    private readonly create: (index: number) => T,
    public capacity: number,
  ) {}
  acquire(): T {
    const free = this.items.find((i) => !i.active);
    if (free) return free;
    if (this.items.length < this.capacity) {
      const item = this.create(this.items.length);
      this.items.push(item);
      return item;
    }
    return this.items.reduce((a, b) => (a.age > b.age ? a : b));
  }
}

interface Telegraph {
  ring: Mesh;
  sector: ReturnType<typeof MeshBuilder.CreateLineSystem>;
  fill: Mesh;
  fillMat: StandardMaterial;
  active: boolean;
  age: number;
  duration: number;
}

/**
 * Ground warnings for telegraphed skills: outer ring shows the area, inner
 * disc fills up until impact. Always shown, even on low quality (assets plan §9).
 */
export class TelegraphPool {
  private readonly pool: Pool<Telegraph>;
  private readonly byKey = new Map<string, Telegraph>();

  constructor(scene: Scene) {
    this.pool = new Pool((i) => {
      const ring = MeshBuilder.CreateTorus(
        `tele_ring_${i}`,
        { diameter: 2, thickness: 0.08, tessellation: 48 },
        scene,
      );
      ring.material = emissive(scene, `tele_ring_mat_${i}`, new Color3(1, 0.2, 0.15), 0.9);
      const fill = MeshBuilder.CreateDisc(`tele_fill_${i}`, { radius: 1, tessellation: 48 }, scene);
      fill.rotation.x = Math.PI / 2;
      const fillMat = emissive(scene, `tele_fill_mat_${i}`, new Color3(1, 0.15, 0.1), 0.35);
      fillMat.backFaceCulling = false;
      fill.material = fillMat;
      for (const m of [ring, fill]) {
        m.isPickable = false;
        m.setEnabled(false);
      }
      const sector = MeshBuilder.CreateLineSystem(
        `tele_sector_${i}`,
        {
          lines: Array.from({ length: 26 }, () => [Vector3.Zero(), Vector3.Zero()]),
          updatable: true,
        },
        scene,
      );
      sector.color = new Color3(1, 0.2, 0.15);
      sector.isPickable = false;
      sector.setEnabled(false);
      return { ring, sector, fill, fillMat, active: false, age: 0, duration: 1 };
    }, 12);
  }

  show(key: string, x: number, z: number, radius: number, seconds: number): void {
    this.clear(key);
    const t = this.pool.acquire();
    for (const [oldKey, old] of this.byKey) if (old === t) this.byKey.delete(oldKey);
    t.sector.setEnabled(false);
    t.active = true;
    t.age = 0;
    t.duration = Math.max(0.1, seconds);
    t.ring.position.set(x, 0.06, z);
    t.ring.scaling.setAll(radius);
    t.fill.position.set(x, 0.05, z);
    t.fill.scaling.setAll(0.01);
    t.ring.setEnabled(true);
    t.fill.setEnabled(true);
    this.byKey.set(key, t);
  }

  showCone(
    key: string,
    x: number,
    z: number,
    yaw: number,
    radius: number,
    arc: number,
    seconds: number,
  ): void {
    this.show(key, x, z, radius, seconds);
    const t = this.byKey.get(key);
    if (!t) return;
    t.ring.setEnabled(false);
    t.fill.setEnabled(false);
    const centre = new Vector3(x, 0.07, z);
    const points = Array.from({ length: 25 }, (_, i) => {
      const a = yaw + ((i / 24 - 0.5) * arc * Math.PI) / 180;
      return new Vector3(x + Math.sin(a) * radius, 0.07, z + Math.cos(a) * radius);
    });
    const lines = [
      [centre, points[0] ?? centre],
      ...points.slice(1).map((p, i) => [points[i] ?? centre, p]),
      [points[24] ?? centre, centre],
    ];
    MeshBuilder.CreateLineSystem('tele_sector', { lines, instance: t.sector });
    t.sector.setEnabled(true);
  }

  showLine(
    key: string,
    origin: { x: number; z: number },
    destination: { x: number; z: number },
    radius: number,
    seconds: number,
  ): void {
    this.show(key, origin.x, origin.z, radius, seconds);
    const t = this.byKey.get(key);
    if (!t) return;
    t.ring.setEnabled(false);
    t.fill.setEnabled(false);
    const yaw = Math.atan2(destination.x - origin.x, destination.z - origin.z);
    const points = [destination, origin].flatMap((centre, cap) =>
      Array.from({ length: 13 }, (_, i) => {
        const angle = yaw - Math.PI / 2 + cap * Math.PI + (i * Math.PI) / 12;
        return new Vector3(
          centre.x + Math.sin(angle) * radius,
          0.07,
          centre.z + Math.cos(angle) * radius,
        );
      }),
    );
    const lines = points.map((point, i) => [point, points[(i + 1) % points.length] ?? point]);
    MeshBuilder.CreateLineSystem('tele_line', { lines, instance: t.sector });
    t.sector.setEnabled(true);
  }

  clear(key: string): void {
    const t = this.byKey.get(key);
    if (!t) return;
    this.byKey.delete(key);
    t.active = false;
    t.ring.setEnabled(false);
    t.fill.setEnabled(false);
    t.sector.setEnabled(false);
  }
  clearSource(id: number): void {
    for (const key of this.byKey.keys()) if (key.startsWith(`${id}:`)) this.clear(key);
  }

  update(dt: number): void {
    for (const [key, t] of this.byKey) {
      t.age += dt;
      const f = Math.min(1, t.age / t.duration);
      t.fill.scaling.setAll(Math.max(0.01, f * t.ring.scaling.x));
      t.fillMat.alpha = 0.25 + f * 0.35;
      if (t.age > t.duration + 0.4) this.clear(key);
    }
  }
}

interface Impact {
  ring: Mesh;
  line: ReturnType<typeof MeshBuilder.CreateLineSystem>;
  bolt: ReturnType<typeof MeshBuilder.CreateLineSystem>;
  mat: StandardMaterial;
  active: boolean;
  age: number;
  radius: number;
}

/** Expanding flash ring at a skill's impact point. */
export class ImpactPool {
  private readonly pool: Pool<Impact>;
  constructor(scene: Scene) {
    this.pool = new Pool((i) => {
      const ring = MeshBuilder.CreateTorus(
        `impact_${i}`,
        { diameter: 2, thickness: 0.18, tessellation: 32 },
        scene,
      );
      const mat = emissive(scene, `impact_mat_${i}`, Color3.White(), 1);
      ring.material = mat;
      ring.isPickable = false;
      ring.setEnabled(false);
      const bolt = MeshBuilder.CreateLineSystem(
        `impact_bolt_${i}`,
        {
          lines: [
            [
              new Vector3(-0.2, 2.1, 0),
              new Vector3(0.15, 1.55, 0.1),
              new Vector3(-0.15, 1, 0.05),
              new Vector3(0.22, 0.4, 0),
            ],
            [
              new Vector3(0.15, 1.55, 0.1),
              new Vector3(0.55, 1.2, 0.2),
              new Vector3(0.35, 0.8, 0.3),
            ],
          ],
        },
        scene,
      );
      bolt.isPickable = false;
      bolt.setEnabled(false);
      const line = MeshBuilder.CreateLineSystem(
        `impact_line_${i}`,
        {
          lines: Array.from({ length: 26 }, () => [Vector3.Zero(), Vector3.Zero()]),
          updatable: true,
        },
        scene,
      );
      line.isPickable = false;
      line.setEnabled(false);
      return { ring, line, bolt, mat, active: false, age: 0, radius: 1 };
    }, 16);
  }

  set capacity(n: number) {
    this.pool.capacity = n;
  }

  spawn(x: number, z: number, radius: number, vfx: string, color?: string): void {
    const it = this.pool.acquire();
    it.active = true;
    it.age = 0;
    it.radius = Math.max(0.8, radius);
    it.line.setEnabled(false);
    it.mat.emissiveColor = color
      ? Color3.FromHexString(color)
      : (VFX_COLORS[vfx] ?? Color3.White());
    it.ring.position.set(x, 0.3, z);
    it.ring.setEnabled(true);
    const lightning = vfx.startsWith('thunder_');
    it.bolt.position.set(x, 0, z);
    it.bolt.scaling.setAll(Math.min(2, Math.max(0.8, radius / 2)));
    it.bolt.color = color ? Color3.FromHexString(color) : (VFX_COLORS[vfx] ?? Color3.White());
    it.bolt.visibility = 1;
    it.bolt.setEnabled(lightning);
  }

  /** A bounded flash of the actual capsule, including its rounded end caps. */
  spawnLine(
    origin: { x: number; z: number },
    destination: { x: number; z: number },
    radius: number,
    color: string,
  ): void {
    const it = this.pool.acquire();
    it.active = true;
    it.age = 0;
    it.ring.setEnabled(false);
    it.bolt.setEnabled(false);
    const yaw = Math.atan2(destination.x - origin.x, destination.z - origin.z);
    const points = [destination, origin].flatMap((centre, cap) =>
      Array.from({ length: 13 }, (_, i) => {
        const angle = yaw - Math.PI / 2 + cap * Math.PI + (i * Math.PI) / 12;
        return new Vector3(
          centre.x + Math.sin(angle) * radius,
          0.08,
          centre.z + Math.cos(angle) * radius,
        );
      }),
    );
    const lines = points.map((point, i) => [point, points[(i + 1) % points.length] ?? point]);
    MeshBuilder.CreateLineSystem('impact_line', { lines, instance: it.line });
    it.line.color = Color3.FromHexString(color);
    it.line.visibility = 1;
    it.line.setEnabled(true);
  }

  update(dt: number): void {
    for (const it of this.pool.items) {
      if (!it.active) continue;
      it.age += dt;
      const f = it.age / 0.4;
      it.ring.scaling.setAll(it.radius * (0.3 + f * 0.9));
      it.mat.alpha = Math.max(0, 1 - f);
      it.bolt.visibility = Math.max(0, 1 - f);
      it.line.visibility = Math.max(0, 1 - f);
      if (f >= 1) {
        it.active = false;
        it.ring.setEnabled(false);
        it.bolt.setEnabled(false);
        it.line.setEnabled(false);
      }
    }
  }
}

interface Projectile {
  orb: Mesh;
  mat: StandardMaterial;
  active: boolean;
  age: number;
  from: Vector3;
  to: Vector3;
  duration: number;
  tag?: number;
  flat?: boolean;
}

/** Cosmetic projectile; damage is already decided by the host. */
export class ProjectilePool {
  private readonly pool: Pool<Projectile>;
  constructor(scene: Scene) {
    this.pool = new Pool((i) => {
      const orb = MeshBuilder.CreateSphere(`proj_${i}`, { diameter: 0.35, segments: 8 }, scene);
      const mat = emissive(scene, `proj_mat_${i}`, VFX_COLORS.projectile as Color3);
      orb.material = mat;
      orb.isPickable = false;
      orb.setEnabled(false);
      return {
        orb,
        mat,
        active: false,
        age: 0,
        from: new Vector3(),
        to: new Vector3(),
        duration: 0.25,
      };
    }, 16);
  }

  set capacity(n: number) {
    this.pool.capacity = n;
  }

  fire(
    from: Vector3,
    to: Vector3,
    vfx: string,
    speed?: number,
    color?: string,
    tag?: number,
  ): void {
    const p = this.pool.acquire();
    p.active = true;
    p.age = 0;
    p.from.copyFrom(from);
    p.to.copyFrom(to);
    p.tag = tag;
    p.flat = !!speed;
    p.duration = speed
      ? Vector3.Distance(from, to) / speed
      : Math.min(0.5, Math.max(0.12, Vector3.Distance(from, to) / 30));
    p.mat.emissiveColor = color ? Color3.FromHexString(color) : (VFX_COLORS[vfx] ?? Color3.White());
    p.orb.position.copyFrom(from);
    p.orb.setEnabled(true);
  }

  stopAt(tag: number | undefined, point: { x: number; z: number }): void {
    if (tag === undefined) return;
    for (const p of this.pool.items)
      if (p.active && p.tag === tag) {
        p.orb.position.x = point.x;
        p.orb.position.z = point.z;
        p.active = false;
        p.orb.setEnabled(false);
      }
  }

  update(dt: number): void {
    for (const p of this.pool.items) {
      if (!p.active) continue;
      p.age += dt;
      const f = Math.min(1, p.age / p.duration);
      Vector3.LerpToRef(p.from, p.to, f, p.orb.position);
      if (!p.flat) p.orb.position.y += Math.sin(f * Math.PI) * 0.5;
      if (f >= 1) {
        p.active = false;
        p.orb.setEnabled(false);
      }
    }
  }
}

/** Vertical light beam above loot, coloured by rarity. */
export class LootBeams {
  private readonly beams = new Map<number, Mesh>();
  private readonly mats = new Map<string, StandardMaterial>();
  constructor(private readonly scene: Scene) {}

  attach(entityId: number, parent: TransformNode, rarity: string): void {
    if (this.beams.has(entityId)) return;
    let mat = this.mats.get(rarity);
    if (!mat) {
      mat = emissive(
        this.scene,
        `beam_${rarity}`,
        Color3.FromHexString(RARITY_COLORS[rarity] ?? '#ffffff'),
        0.45,
      );
      this.mats.set(rarity, mat);
    }
    const height = rarity === 'common' ? 1.2 : 2.6;
    const beam = MeshBuilder.CreateCylinder(
      `beam_${entityId}`,
      { height, diameterTop: 0.05, diameterBottom: 0.22, tessellation: 8 },
      this.scene,
    );
    beam.material = mat;
    beam.isPickable = false;
    beam.parent = parent;
    beam.position.y = height / 2;
    this.beams.set(entityId, beam);
  }

  detach(entityId: number): void {
    this.beams.get(entityId)?.dispose();
    this.beams.delete(entityId);
  }

  dispose(): void {
    for (const b of this.beams.values()) b.dispose();
    this.beams.clear();
  }
}
