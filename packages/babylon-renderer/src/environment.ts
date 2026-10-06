import {
  type AbstractMesh,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  type Scene,
  Vector3,
} from '@babylonjs/core';
import type { AssetLibrary } from '@rpg/asset-runtime';
import type { ContentBundle, MapDef, MapInstance } from '@rpg/game-data';
import { colorMaterial, createPlaceholderMesh } from './placeholder';

export interface BuiltEnvironment {
  ground: Mesh;
  /** One source mesh per appearance, drawn with thin instances. */
  batches: Mesh[];
  dispose(): void;
}

/**
 * Builds the static map: ground plane plus every chunk instance grouped by
 * appearance into thin-instance batches (tech plan §14).
 */
export async function buildEnvironment(
  scene: Scene,
  map: MapDef,
  content: ContentBundle,
  assets: AssetLibrary,
): Promise<BuiltEnvironment> {
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

  const groups = new Map<string, MapInstance[]>();
  for (const chunk of map.chunks) {
    for (const inst of chunk.instances) {
      const list = groups.get(inst.appearanceId) ?? [];
      list.push(inst);
      groups.set(inst.appearanceId, list);
    }
  }

  const batches = await Promise.all(
    [...groups].map(async ([appearanceId, instances]) => {
      const appearance = content.appearances.get(appearanceId);
      if (!appearance) throw new Error(`Unknown appearance ${appearanceId}`);
      const source =
        (appearance.modelAssetId && (await mergedModel(assets, appearance.modelAssetId))) ||
        createPlaceholderMesh(scene, appearance, `env_${appearanceId}`);
      source.name = `env_${appearanceId}`;
      source.isPickable = false;
      source.receiveShadows = true;

      const buffer = new Float32Array(instances.length * 16);
      const m = new Matrix();
      instances.forEach((inst, i) => {
        const s = inst.scale * appearance.scale;
        Matrix.ComposeToRef(
          new Vector3(s, s, s),
          Quaternion.RotationYawPitchRoll(inst.rotationY + appearance.yawOffset, 0, 0),
          new Vector3(inst.position[0], inst.position[1], inst.position[2]),
          m,
        );
        m.copyToArray(buffer, i * 16);
      });
      source.thinInstanceSetBuffer('matrix', buffer, 16, true);
      source.thinInstanceRefreshBoundingInfo();
      source.freezeWorldMatrix();
      return source;
    }),
  );

  return {
    ground,
    batches,
    dispose() {
      ground.dispose();
      for (const b of batches) b.dispose();
    },
  };
}

/** Bakes a static model into one mesh at the origin so thin instances can place it. */
async function mergedModel(assets: AssetLibrary, assetId: string): Promise<Mesh | null> {
  const container = await assets.loadContainer(assetId);
  if (!container) return null;
  const entries = container.instantiateModelsToScene((n) => `${assetId}_${n}`, false, {
    doNotInstantiate: true,
  });
  const meshes = entries.rootNodes
    .flatMap((root) => root.getChildMeshes(false))
    .filter((m: AbstractMesh): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
  for (const m of meshes) m.computeWorldMatrix(true);
  const merged = meshes.length
    ? Mesh.MergeMeshes(meshes, true, true, undefined, false, true)
    : null;
  for (const root of entries.rootNodes) root.dispose();
  for (const g of entries.animationGroups) g.dispose();
  if (!merged) console.warn(`[env] could not merge ${assetId}; using placeholder`);
  return merged;
}
