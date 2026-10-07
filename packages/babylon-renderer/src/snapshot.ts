import type { AssetLibrary } from '@rpg/asset-runtime';
import type { AppearanceDef } from '@rpg/game-data';
import {
  AbstractMesh,
  Camera,
  Color4,
  RenderTargetTexture,
  type Scene,
  TargetCamera,
  TransformNode,
  Vector3,
} from './babylon';
import { type GearAppearances, ModelVisual } from './visuals';

/** Layer the main camera does not draw (its mask is 0x0FFFFFFF). */
const SNAPSHOT_LAYER = 0x10000000;
/** Far below every map, outside the shadow map and the fog's reach. */
const STAGE = new Vector3(0, -400, 0);

/**
 * One-off renders of 3D models into transparent PNGs for the HUD: the
 * player's head for the unit frame and the main-hand weapon for the attack
 * button. Runs only when the appearance or gear changes, never per frame.
 * Results are blob: URLs (short strings for the 10 Hz UI diff); the caller
 * revokes the previous one.
 */
export class Snapshots {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly scene: Scene,
    private readonly assets: AssetLibrary,
  ) {}

  /** Head and shoulders, three-quarter view, idle pose. */
  portrait(appearance: AppearanceDef, gear: GearAppearances, size = 192): Promise<string | null> {
    return this.enqueue(async () => {
      const id = appearance.modelAssetId;
      if (!this.assets.has(id)) return null;
      const container = await this.assets.loadContainer(id);
      if (!container) return null;
      // Only gear that shows around the head; hands stay empty.
      const worn: GearAppearances = { head: gear.head, back: gear.back };
      await this.assets.preload(
        Object.values(worn).flatMap((g) => (g?.modelAssetId ? [g.modelAssetId] : [])),
      );
      const visual = new ModelVisual(
        this.scene,
        container,
        appearance,
        'snapshot_portrait',
        this.assets,
      );
      try {
        visual.root.position.copyFrom(STAGE);
        visual.setGear(worn);
        // Gear instantiates a microtask after its container resolves; the
        // idle clip blends in from the rest pose over ~8 frames (blendingSpeed 0.12).
        await nextFrames(this.scene, 16);
        const meshes = prepare(visual.root);
        const { min, max } = visibleBounds(meshes);
        // Socket, else a bone named "head" (rigs whose appearance maps no head socket).
        const head =
          visual.anchor('head') ??
          visual.root
            .getDescendants(false)
            .find(
              (n): n is TransformNode =>
                n instanceof TransformNode && !(n instanceof AbstractMesh) && /_head$/.test(n.name),
            ) ??
          null;
        head?.computeWorldMatrix(true);
        const extent = max.subtract(min);
        let centre: Vector3;
        let half: number;
        if (head) {
          // Head only. The crown comes from the bounds but is capped so tall
          // hats / horns do not pull the frame up; the zoom is clamped by the
          // body below the neck (chibi heads ≈ body, brutes' much smaller).
          const neck = head.getAbsolutePosition();
          // Feet are at the root (pivot at the feet).
          const body = Math.max(0.2, neck.y - STAGE.y);
          const crown = Math.min(max.y, neck.y + body * 1.05);
          half = Math.min(Math.max((crown - neck.y) * 0.82, body * 0.25), body * 0.7);
          // Crown ~8% below the image's top edge.
          centre = new Vector3(neck.x, crown - half * 0.84, neck.z);
        } else {
          // No head bone: the whole model.
          centre = min.add(max).scale(0.5);
          half = (Math.max(extent.x, extent.y, extent.z) / 2) * 1.05;
        }
        // Orthographic with explicit bounds: a perspective camera would take
        // the main canvas's aspect ratio and stretch the square render.
        const dist = 3;
        const dir = new Vector3(Math.sin(0.5), 0.18, Math.cos(0.5)).normalize();
        const camera = new TargetCamera(
          'snapshot_cam',
          centre.add(dir.scale(dist)),
          this.scene,
          false,
        );
        orthographic(camera, half);
        camera.minZ = 0.02;
        camera.maxZ = dist * 2;
        camera.setTarget(centre);
        return await this.capture(camera, meshes, size);
      } finally {
        visual.dispose();
      }
    });
  }

  /**
   * An equipment model as an inventory-style icon: side view, guns level with
   * the muzzle to the right, blades on the diagonal pointing up-right.
   */
  item(appearance: AppearanceDef, size = 224): Promise<string | null> {
    return this.enqueue(async () => {
      const id = appearance.modelAssetId;
      if (!this.assets.has(id)) return null;
      const container = await this.assets.loadContainer(id);
      if (!container) return null;
      // Same nesting as an equipped item: holder (metres) → model (scale, yaw).
      const holder = new TransformNode('snapshot_item', this.scene);
      try {
        holder.position.copyFrom(STAGE);
        const model = new TransformNode('snapshot_item_model', this.scene);
        model.parent = holder;
        const entries = container.instantiateModelsToScene((n) => `snapshot_item_${n}`, false);
        for (const node of entries.rootNodes) node.parent = model;
        for (const g of entries.animationGroups) g.dispose();
        model.scaling.setAll(appearance.scale);
        model.rotation.y = appearance.yawOffset;
        const meshes = prepare(holder);
        const { min, max } = visibleBounds(meshes);
        const centre = min.add(max).scale(0.5);
        const local = centre.subtract(STAGE);

        // Pointing direction: towards the tip/muzzle, else +Y (KayKit blades).
        const tip = appearance.tip;
        const p = tip ? new Vector3(tip[0], tip[1], tip[2]).subtract(local) : Vector3.Up();
        const along = dominantAxis(p.lengthSquared() > 1e-6 ? p : Vector3.Up());
        const extent = max.subtract(min);
        // View down the thinner of the two remaining axes; the wider one is "up".
        const a = (along + 1) % 3;
        const b = (along + 2) % 3;
        const thin = component(extent, a) <= component(extent, b) ? a : b;
        const wide = thin === a ? b : a;
        const forward = unitAxis(along, Math.sign(component(p, along)) || 1);
        const up = unitAxis(wide, 1);
        const ranged = !!tip && along !== 1;
        const flatRight = ranged ? forward : forward.subtract(up).normalize();
        const flatUp = ranged ? up : forward.add(up).normalize();
        // Babylon is left-handed: right = up × look, so look = right × up.
        const flatLook = Vector3.Cross(flatRight, flatUp).normalize();
        // Turn and tilt a little off the pure side view so the icon reads as 3D.
        const yaw = 0.38;
        const pitch = 0.3;
        const turned = flatLook.scale(Math.cos(yaw)).add(flatRight.scale(Math.sin(yaw)));
        const right = flatRight.scale(Math.cos(yaw)).subtract(flatLook.scale(Math.sin(yaw)));
        const look = turned.scale(Math.cos(pitch)).subtract(flatUp.scale(Math.sin(pitch)));
        const screenUp = flatUp.scale(Math.cos(pitch)).add(turned.scale(Math.sin(pitch)));

        let halfW = 0;
        let halfH = 0;
        for (const corner of corners(min, max)) {
          const d = corner.subtract(centre);
          halfW = Math.max(halfW, Math.abs(Vector3.Dot(d, right)));
          halfH = Math.max(halfH, Math.abs(Vector3.Dot(d, screenUp)));
        }
        const half = Math.max(halfW, halfH) * 1.06;
        const depth = extent.length() + 1;
        const camera = new TargetCamera(
          'snapshot_cam',
          centre.subtract(look.scale(depth)),
          this.scene,
          false,
        );
        orthographic(camera, half);
        camera.minZ = 0.01;
        camera.maxZ = depth * 2;
        camera.upVector = screenUp;
        camera.setTarget(centre);
        return await this.capture(camera, meshes, size);
      } finally {
        holder.dispose();
      }
    });
  }

  /** Captures run one at a time: they share the stage. */
  private enqueue<T>(job: () => Promise<T>): Promise<T | null> {
    const run = this.queue.then(job, job).catch((err) => {
      console.warn('[snapshot] failed', err);
      return null;
    });
    this.queue = run;
    return run;
  }

  private async capture(
    camera: TargetCamera,
    meshes: AbstractMesh[],
    size: number,
  ): Promise<string | null> {
    camera.layerMask = SNAPSHOT_LAYER;
    const rtt = new RenderTargetTexture(
      'snapshot_rtt',
      { width: size, height: size },
      this.scene,
      false,
    );
    try {
      rtt.renderList = meshes;
      rtt.activeCamera = camera;
      rtt.clearColor = new Color4(0, 0, 0, 0);
      rtt.samples = 4;
      for (let i = 0; i < 60 && !rtt.isReadyForRendering(); i++) await nextFrames(this.scene, 1);
      for (const m of meshes) m.skeleton?.prepare(true);
      rtt.render();
      const pixels = await rtt.readPixels();
      if (!pixels) return null;
      const blob = await encodePng(new Uint8Array(pixels.buffer), size);
      return blob ? URL.createObjectURL(blob) : null;
    } finally {
      rtt.dispose();
      camera.dispose();
    }
  }
}

/** Hides the copy from the main camera, picking and fog; returns its meshes. */
function prepare(root: TransformNode): AbstractMesh[] {
  const meshes = root.getChildMeshes(false);
  for (const m of meshes) {
    m.layerMask = SNAPSHOT_LAYER;
    m.isPickable = false;
    m.applyFog = false;
    m.alwaysSelectAsActiveMesh = true;
  }
  root.computeWorldMatrix(true);
  for (const m of meshes) m.computeWorldMatrix(true);
  return meshes;
}

/** RGBA rows from the GPU (bottom-up, as Babylon's screenshot tool assumes) → PNG. */
function encodePng(rgba: Uint8Array, size: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  const image = ctx.createImageData(size, size);
  const row = size * 4;
  for (let y = 0; y < size; y++)
    image.data.set(rgba.subarray((size - 1 - y) * row, (size - y) * row), y * row);
  ctx.putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function orthographic(camera: TargetCamera, half: number): void {
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.orthoLeft = -half;
  camera.orthoRight = half;
  camera.orthoBottom = -half;
  camera.orthoTop = half;
}

/**
 * World bounds of the meshes that actually show, in their current skinned
 * pose: hidden built-in parts and the bind pose would skew the framing.
 */
function visibleBounds(meshes: AbstractMesh[]): { min: Vector3; max: Vector3 } {
  const min = new Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  const max = min.scale(-1);
  for (const m of meshes) {
    if (!m.isEnabled() || !m.isVisible || m.getTotalVertices() === 0) continue;
    m.skeleton?.prepare(true);
    m.refreshBoundingInfo({ applySkeleton: true });
    m.computeWorldMatrix(true);
    const box = m.getBoundingInfo().boundingBox;
    min.minimizeInPlace(box.minimumWorld);
    max.maximizeInPlace(box.maximumWorld);
  }
  return { min, max };
}

function nextFrames(scene: Scene, n: number): Promise<void> {
  return new Promise((resolve) => {
    let left = n;
    const obs = scene.onAfterRenderObservable.add(() => {
      if (--left > 0) return;
      obs.remove();
      resolve();
    });
  });
}

function component(v: Vector3, axis: number): number {
  return axis === 0 ? v.x : axis === 1 ? v.y : v.z;
}

function dominantAxis(v: Vector3): number {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  return ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
}

function unitAxis(axis: number, sign: number): Vector3 {
  return new Vector3(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
}

function corners(min: Vector3, max: Vector3): Vector3[] {
  const out: Vector3[] = [];
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) out.push(new Vector3(x, y, z));
  return out;
}
