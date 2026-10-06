import type { AssetLibrary } from '@rpg/asset-runtime';
import type { AppearanceDef, ContentBundle, MapDef } from '@rpg/game-data';
import {
  type AbstractMesh,
  type Material,
  Matrix,
  Mesh,
  MeshBuilder,
  MultiMaterial,
  Quaternion,
  type Scene,
  Vector3,
  VertexBufferDeduceStride,
} from './babylon';
import { colorMaterial, createPlaceholderMesh } from './placeholder';

/** Alpha of environment pieces that stand between the camera and the player. */
const OCCLUDED_ALPHA = 0.28;
/** Instances farther than this from the player use LOD1 (when the asset has one). */
const LOD_DISTANCE = 26;
/** Re-split near/far once the player moved this far. */
const LOD_REFRESH_DISTANCE = 4;

interface EnvInstance {
  chunkId: string;
  matrix: Float32Array;
  x: number;
  z: number;
  /** Horizontal radius used for occlusion tests, metres. */
  radius: number;
  height: number;
  occluded: boolean;
  far: boolean;
}

/** Every instance of one appearance in the map, drawn by two thin-instance meshes. */
interface Batch {
  appearanceId: string;
  solid: Mesh;
  faded: Mesh;
  /** LOD1 mesh for far instances (null → LOD0 everywhere). */
  far: Mesh | null;
  solidBuffer: Float32Array;
  fadedBuffer: Float32Array;
  farBuffer: Float32Array | null;
  instances: EnvInstance[];
  dirty: boolean;
}

/**
 * Static map rendering (tech plan §5–6, §14):
 *  - one thin-instance batch per appearance; only instances in the active
 *    chunks (streaming radius around the player) are written to its buffer,
 *  - instances hiding the player from the camera move to a faded twin batch
 *    (assets plan §8.3).
 * Buffers are allocated once at full capacity and only rewritten when the
 * active chunk set or the occluded set changes. Each mesh owns its geometry:
 * thin-instance buffers live on the geometry, so sharing it between meshes
 * would let one batch overwrite another's instances.
 */
export class EnvironmentView {
  readonly ground: Mesh;
  private readonly batches: Batch[] = [];
  private activeChunks: ReadonlySet<string> | null = null;
  private lodCenter: { x: number; z: number } | null = null;

  private constructor(
    ground: Mesh,
    readonly map: MapDef,
  ) {
    this.ground = ground;
  }

  static async build(
    scene: Scene,
    map: MapDef,
    content: ContentBundle,
    assets: AssetLibrary,
  ): Promise<EnvironmentView> {
    const width = map.bounds.max.x - map.bounds.min.x;
    const depth = map.bounds.max.z - map.bounds.min.z;
    const ground = MeshBuilder.CreateGround(
      'ground',
      { width, height: depth, subdivisions: 1 },
      scene,
    );
    ground.position.set(map.bounds.min.x + width / 2, 0, map.bounds.min.z + depth / 2);
    ground.material = colorMaterial(scene, map.ground.color);
    ground.receiveShadows = true;
    ground.metadata = { ground: true };
    ground.freezeWorldMatrix();
    const view = new EnvironmentView(ground, map);

    const byAppearance = new Map<
      string,
      { chunkId: string; inst: MapDef['chunks'][number]['instances'][number] }[]
    >();
    for (const chunk of map.chunks) {
      for (const inst of chunk.instances) {
        const list = byAppearance.get(inst.appearanceId) ?? [];
        list.push({ chunkId: chunk.id, inst });
        byAppearance.set(inst.appearanceId, list);
      }
    }

    await Promise.all(
      [...byAppearance].map(async ([appearanceId, entries]) => {
        const appearance = content.appearances.get(appearanceId) as AppearanceDef | undefined;
        if (!appearance) throw new Error(`Unknown appearance ${appearanceId}`);
        const solid =
          (appearance.modelAssetId && (await mergedModel(assets, appearance.modelAssetId))) ||
          createPlaceholderMesh(scene, appearance, `env_${appearanceId}`);
        solid.name = `env_${appearanceId}`;
        solid.isPickable = false;
        solid.receiveShadows = true;
        solid.refreshBoundingInfo();
        const { minimum: mn, maximum: mx } = solid.getBoundingInfo().boundingBox;
        const footprint = Math.max(Math.abs(mn.x), Math.abs(mx.x), Math.abs(mn.z), Math.abs(mx.z));

        const farModel = appearance.modelAssetId
          ? await mergedModel(assets, appearance.modelAssetId, true)
          : null;
        if (farModel) {
          farModel.name = `env_${appearanceId}_lod1`;
          farModel.isPickable = false;
          farModel.receiveShadows = true;
          farModel.freezeWorldMatrix();
        }
        const faded = solid.clone(`env_${appearanceId}_faded`, null, true) as Mesh;
        faded.makeGeometryUnique();
        faded.material = fadedMaterial(solid.material);
        faded.isPickable = false;
        for (const m of [solid, faded]) m.freezeWorldMatrix();

        const instances: EnvInstance[] = entries.map(({ chunkId, inst }) => {
          const s = inst.scale * appearance.scale;
          const matrix = new Float32Array(16);
          Matrix.Compose(
            new Vector3(s, s, s),
            Quaternion.RotationYawPitchRoll(inst.rotationY + appearance.yawOffset, 0, 0),
            new Vector3(inst.position[0], inst.position[1], inst.position[2]),
          ).copyToArray(matrix);
          return {
            chunkId,
            matrix,
            x: inst.position[0],
            z: inst.position[2],
            // Canopies overhang colliders; ~70% of the real footprint fades only
            // what actually covers the player.
            radius: footprint * s * 0.7 + 0.3,
            height: mx.y * s,
            occluded: false,
            far: false,
          };
        });
        const capacity = Math.max(1, instances.length) * 16;
        const solidBuffer = new Float32Array(capacity);
        const fadedBuffer = new Float32Array(capacity);
        solid.thinInstanceSetBuffer('matrix', solidBuffer, 16, false);
        faded.thinInstanceSetBuffer('matrix', fadedBuffer, 16, false);
        const farBuffer = farModel ? new Float32Array(capacity) : null;
        if (farModel && farBuffer) farModel.thinInstanceSetBuffer('matrix', farBuffer, 16, false);
        view.batches.push({
          appearanceId,
          solid,
          faded,
          far: farModel,
          solidBuffer,
          fadedBuffer,
          farBuffer,
          instances,
          dirty: true,
        });
      }),
    );
    view.flush();
    return view;
  }

  /** Chunks within `radius` chunks of a world position (tech plan §6: radius 1 → ≤ 9). */
  chunksAround(x: number, z: number, radius = 1): Set<string> {
    const size = this.map.chunkSize;
    const ci = Math.floor((x - this.map.bounds.min.x) / size);
    const cj = Math.floor((z - this.map.bounds.min.z) / size);
    const out = new Set<string>();
    for (let i = ci - radius; i <= ci + radius; i++) {
      for (let j = cj - radius; j <= cj + radius; j++) out.add(`chunk_${i}_${j}`);
    }
    return out;
  }

  /** Restricts rendering to these chunks; null shows everything. */
  setActiveChunks(chunks: ReadonlySet<string> | null): void {
    const prev = this.activeChunks;
    const same =
      chunks === prev ||
      (!!chunks && !!prev && chunks.size === prev.size && [...chunks].every((c) => prev.has(c)));
    if (same) return;
    this.activeChunks = chunks;
    for (const b of this.batches) b.dirty = true;
    this.flush();
  }

  get stats(): {
    batches: number;
    activeChunks: number;
    totalChunks: number;
    instances: number;
  } {
    let instances = 0;
    for (const b of this.batches) for (const i of b.instances) if (this.isActive(i)) instances++;
    return {
      batches: this.batches.length,
      activeChunks: this.activeChunks
        ? this.map.chunks.filter((c) => this.activeChunks?.has(c.id)).length
        : this.map.chunks.length,
      totalChunks: this.map.chunks.length,
      instances,
    };
  }

  /** Splits instances into LOD0/LOD1 around the player; cheap when the player barely moved. */
  updateLod(x: number, z: number): void {
    if (
      this.lodCenter &&
      Math.hypot(x - this.lodCenter.x, z - this.lodCenter.z) < LOD_REFRESH_DISTANCE
    )
      return;
    this.lodCenter = { x, z };
    const d2 = LOD_DISTANCE * LOD_DISTANCE;
    for (const b of this.batches) {
      if (!b.far) continue;
      for (const inst of b.instances) {
        const far = (inst.x - x) ** 2 + (inst.z - z) ** 2 > d2;
        if (far !== inst.far) {
          inst.far = far;
          b.dirty = true;
        }
      }
    }
    this.flush();
  }

  /**
   * Fades instances whose footprint crosses the camera→target segment and are
   * tall enough to block it. Call once per frame; cheap when nothing changes.
   */
  updateOcclusion(camera: Vector3, target: Vector3): void {
    const dx = target.x - camera.x;
    const dz = target.z - camera.z;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 1e-6) return;
    for (const batch of this.batches) {
      for (const inst of batch.instances) {
        if (!this.isActive(inst)) continue;
        const t = ((inst.x - camera.x) * dx + (inst.z - camera.z) * dz) / lenSq;
        let blocks = false;
        if (t > 0.02 && t < 0.98) {
          const px = camera.x + dx * t - inst.x;
          const pz = camera.z + dz * t - inst.z;
          const rayY = camera.y + (target.y - camera.y) * t;
          blocks = px * px + pz * pz < inst.radius * inst.radius && inst.height > rayY - 0.3;
        }
        if (blocks !== inst.occluded) {
          inst.occluded = blocks;
          batch.dirty = true;
        }
      }
    }
    this.flush();
  }

  dispose(): void {
    this.ground.dispose();
    for (const b of this.batches) {
      b.faded.dispose();
      b.solid.dispose();
      b.far?.dispose();
    }
    this.batches.length = 0;
  }

  private isActive(i: EnvInstance): boolean {
    return !this.activeChunks || this.activeChunks.has(i.chunkId);
  }

  private flush(): void {
    for (const b of this.batches) {
      if (!b.dirty) continue;
      b.dirty = false;
      let solid = 0;
      let faded = 0;
      let far = 0;
      for (const inst of b.instances) {
        if (!this.isActive(inst)) continue;
        if (inst.occluded) b.fadedBuffer.set(inst.matrix, faded++ * 16);
        else if (inst.far && b.farBuffer) b.farBuffer.set(inst.matrix, far++ * 16);
        else b.solidBuffer.set(inst.matrix, solid++ * 16);
      }
      commit(b.solid, solid);
      commit(b.faded, faded);
      if (b.far) commit(b.far, far);
    }
  }
}

function commit(mesh: Mesh, count: number): void {
  if (count === 0) {
    mesh.setEnabled(false);
    return;
  }
  mesh.thinInstanceBufferUpdated('matrix');
  mesh.thinInstanceCount = count;
  mesh.thinInstanceRefreshBoundingInfo();
  mesh.setEnabled(true);
}

function fadedMaterial(material: Material | null): Material | null {
  if (!material) return null;
  if (material instanceof MultiMaterial) {
    const multi = material.clone(`${material.name}_faded`, true);
    multi.subMaterials = multi.subMaterials.map((m) => (m ? toTransparent(m) : m));
    return multi;
  }
  return toTransparent(material.clone(`${material.name}_faded`) ?? material);
}

function toTransparent(m: Material): Material {
  m.alpha = OCCLUDED_ALPHA;
  m.transparencyMode = 2; // ALPHABLEND
  return m;
}

/** Bakes a static model into one mesh at the origin so thin instances can place it. */
async function mergedModel(
  assets: AssetLibrary,
  assetId: string,
  lod1 = false,
): Promise<Mesh | null> {
  const container = lod1 ? await assets.loadLod1(assetId) : await assets.loadContainer(assetId);
  if (!container) return null;
  const entries = container.instantiateModelsToScene((n) => `${assetId}_${n}`, false, {
    doNotInstantiate: true,
  });
  const meshes = entries.rootNodes
    .flatMap((root) => root.getChildMeshes(false))
    .filter((m: AbstractMesh): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
  for (const m of meshes) m.computeWorldMatrix(true);
  let merged: Mesh | null = null;
  try {
    completeVertexAttributes(meshes);
    merged = meshes.length ? Mesh.MergeMeshes(meshes, true, true, undefined, false, true) : null;
  } catch (error) {
    console.warn(`[env] could not merge ${assetId}; using placeholder`, error);
  }
  for (const root of entries.rootNodes) root.dispose();
  for (const g of entries.animationGroups) g.dispose();
  if (!merged) console.warn(`[env] could not merge ${assetId}; using placeholder`);
  return merged;
}

/**
 * Babylon only merges meshes with identical vertex-buffer kinds. Some source
 * packs mix optional UV/color/tangent channels between submeshes, so complete
 * those channels with neutral values before baking the static thin-instance
 * source mesh.
 */
function completeVertexAttributes(meshes: readonly Mesh[]): void {
  const kinds = new Set(meshes.flatMap((mesh) => mesh.getVerticesDataKinds()));
  for (const mesh of meshes) {
    const own = new Set(mesh.getVerticesDataKinds());
    const vertices = mesh.getTotalVertices();
    for (const kind of kinds) {
      if (own.has(kind)) continue;
      const stride = VertexBufferDeduceStride(kind);
      const data = new Float32Array(vertices * stride);
      if (kind === 'color') data.fill(1);
      if (kind === 'tangent') for (let i = 3; i < data.length; i += stride) data[i] = 1;
      mesh.setVerticesData(kind, data, false, stride);
    }
  }
}
