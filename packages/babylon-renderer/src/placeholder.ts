import type { AppearanceDef } from '@rpg/game-data';
import { Color3, Matrix, type Mesh, MeshBuilder, type Scene, StandardMaterial } from './babylon';

const materials = new WeakMap<Scene, Map<string, StandardMaterial>>();

/** Shared flat-colour material per (scene, colour). */
export function colorMaterial(scene: Scene, hex: string): StandardMaterial {
  let byColor = materials.get(scene);
  if (!byColor) {
    byColor = new Map();
    materials.set(scene, byColor);
  }
  let mat = byColor.get(hex);
  if (!mat) {
    mat = new StandardMaterial(`mat_${hex}`, scene);
    mat.diffuseColor = Color3.FromHexString(hex);
    mat.specularColor = new Color3(0.08, 0.08, 0.08);
    byColor.set(hex, mat);
  }
  return mat;
}

/**
 * Primitive stand-in used until (or instead of) a real model. Pivot sits on
 * the ground like an exported character (assets plan §5.1).
 */
export function createPlaceholderMesh(scene: Scene, appearance: AppearanceDef, name: string): Mesh {
  const { shape, height, radius, color } = appearance.placeholder;
  let mesh: Mesh;
  switch (shape) {
    case 'capsule':
      mesh = MeshBuilder.CreateCapsule(name, { height, radius, tessellation: 12 }, scene);
      break;
    case 'box':
      mesh = MeshBuilder.CreateBox(
        name,
        { width: radius * 1.4, depth: radius * 2.2, height },
        scene,
      );
      break;
    case 'cone':
      mesh = MeshBuilder.CreateCylinder(
        name,
        { height, diameterTop: 0, diameterBottom: radius * 2, tessellation: 8 },
        scene,
      );
      break;
    case 'cylinder':
      mesh = MeshBuilder.CreateCylinder(
        name,
        { height, diameter: radius * 2, tessellation: 10 },
        scene,
      );
      break;
    case 'sphere':
      mesh = MeshBuilder.CreateSphere(
        name,
        { diameterX: radius * 2, diameterY: height, diameterZ: radius * 2, segments: 8 },
        scene,
      );
      break;
  }
  mesh.bakeTransformIntoVertices(Matrix.Translation(0, height / 2, 0));
  mesh.material = colorMaterial(scene, color);
  mesh.isPickable = false;
  return mesh;
}
