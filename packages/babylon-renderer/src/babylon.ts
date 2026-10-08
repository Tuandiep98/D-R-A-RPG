/**
 * The only place the renderer imports Babylon from. Deep module paths instead
 * of the `@babylonjs/core` barrel let the bundler drop everything we do not use
 * (tech plan §42: startup size matters on mobile). Side-effect imports register
 * scene/engine features that are not classes of their own.
 */

// Side effects (prototype augmentations)
import '@babylonjs/core/Animations/animatable';
import '@babylonjs/core/Culling/ray';
import '@babylonjs/core/Engines/WebGPU/Extensions/index';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Loading/loadingScreen';
import '@babylonjs/core/Meshes/thinInstanceMesh';

export type { Animation } from '@babylonjs/core/Animations/animation';
export { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
export { AnimationGroupMask } from '@babylonjs/core/Animations/animationGroupMask';
export { AssetContainer } from '@babylonjs/core/assetContainer';
export {
  VertexBuffer,
  VertexBufferDeduceStride,
} from '@babylonjs/core/Buffers/buffer.pure';
export { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
export { Camera } from '@babylonjs/core/Cameras/camera';
export { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
export type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
export { Constants } from '@babylonjs/core/Engines/constants';
export { Engine } from '@babylonjs/core/Engines/engine';
export { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
export { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
export { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
export { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
export { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
export { Material } from '@babylonjs/core/Materials/material';
export { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
export { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
export { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
export { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
export { Texture } from '@babylonjs/core/Materials/Textures/texture';
export { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
export { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
export { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
export { Mesh } from '@babylonjs/core/Meshes/mesh';
export { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
export { TransformNode } from '@babylonjs/core/Meshes/transformNode';
export type { Observer } from '@babylonjs/core/Misc/observable';
export type { Node } from '@babylonjs/core/node';
export { Scene } from '@babylonjs/core/scene';
