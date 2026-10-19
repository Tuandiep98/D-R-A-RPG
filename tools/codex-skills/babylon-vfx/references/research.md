# Research basis

Use these sources as design constraints, not as assets to copy.

## Babylon.js

- [Particle system introduction](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/particle_system_intro): capacity bounds the live particle population; emitters may be points or nodes; textures and sprite sheets drive particles; local space follows an emitter; one-shot systems need explicit stop/reset/disposal.
- [Animating particle spritesheets](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/animation/): uniform sprite sheets can animate per-particle cells. Prefer approved atlases when frame animation materially improves an effect.
- [Customizing particles](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/customizingParticles/): custom update functions replace built-in updating and must stay simple and fast. Prefer existing thin-instance recipes unless custom particle behavior earns its complexity.
- [Particle Helper and JSON sets](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/particleHelper): multi-system effects can be serialized as sets, but this repo should keep lifecycle, asset URLs, quality tiers, and pooling under its renderer contracts.

Babylon 9 also offers node particle systems, but adopting an editor/runtime format is a deliberate architecture change, not a prerequisite for high-quality effects. The current thin-instance compositor is already a strong fit for deterministic caps, procedural fallback, and tree-shaken web builds.

## Visual references

- [Magic Effects FREE](https://assetstore.unity.com/packages/vfx/particles/spells/magic-effects-free-247933): target breadth includes explosion, sparks, magic circles, portals, slash, and hit effects. The useful lesson is a reusable library of effect roles, not Unity prefabs or shaders.
- [Sword Slashes PRO](https://assetstore.unity.com/packages/vfx/particles/sword-slashes-pro-173450): reference for oversized readable crescents, hot cores, trailing accents, and contact punctuation on attacks.

Do not import or redistribute Unity package contents without a verified license path and repository asset records. Rebuild the visual grammar with approved textures, procedural shapes, ribbons, thin instances, and Babylon materials.

## Mobile rendering

- [Unity mobile graphics methods](https://docs.unity3d.com/2018.3/Documentation/Manual/MobileOptimizationGraphicsMethods.html): particle cost is strongly affected by overdraw, large dense transparent layers, and particle count. The guide recommends baked detail, sparse planes, and avoiding fullscreen glow/post-processing on mobile.

For this project that means: fake glow with small additive planes, use high-contrast texture detail, cap and pool everything, keep persistent fields sparse, and verify Low on a representative phone viewport.
