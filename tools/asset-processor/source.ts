import { z } from 'zod';

/**
 * Provenance + asset list for one third-party pack (assets plan §4.2, §13.1).
 * Lives at art/third_party/<packId>/SOURCE.json next to LICENSE.txt.
 */
export const PackSourceSchema = z
  .strictObject({
    packId: z.string().regex(/^[a-z][a-z0-9_]*$/),
    author: z.string().min(1),
    pack: z.string().min(1),
    sourceUrl: z.url(),
    license: z.string().min(1),
    /** Set true only after a human checked the license on the author's page. */
    licenseVerified: z.boolean(),
    downloadedAt: z.string().nullable(),
    status: z.enum(['candidate', 'approved', 'prototype_only', 'rejected']),
    notes: z.string().optional(),
    /**
     * `models` packs feed the glTF pipeline (`assets`). Other kinds only ship
     * `media` (sounds, icons, UI frames, particle textures) via `pnpm media:build`;
     * `animations` packs are clip sources referenced by `animationSource`;
     * `library` packs are approved but not wired into the game yet.
     */
    kind: z
      .enum(['models', 'animations', 'audio', 'icons', 'ui', 'vfx', 'library'])
      .default('models'),
    /** Curated non-model files copied/optimised into the runtime media manifest. */
    media: z
      .array(
        z.strictObject({
          /** Stable runtime id: sfx_*, icon_*, ui_*, vfx_*. */
          id: z.string().regex(/^(sfx|icon|ui|vfx)_[a-z0-9_]+$/),
          file: z.string().regex(/\.(ogg|wav|mp3|png|webp|jpg|svg)$/i),
          /** Images: longest edge in px after resize (default 128 icons, 256 vfx, original ui). */
          size: z.number().int().positive().optional(),
          /** Images: tint colour (#rrggbb) for white line art such as UI frames. */
          tint: z
            .string()
            .regex(/^#[0-9a-f]{6}$/i)
            .optional(),
        }),
      )
      .default([]),
    assets: z
      .array(
        z.strictObject({
          assetId: z.string().regex(/^[a-z][a-z0-9_]*$/),
          /** Path relative to the pack folder, usually under originals/. */
          file: z.string().regex(/\.(glb|gltf)$/i, 'only .glb/.gltf are supported'),
          /** Extra image lookup folders, relative to the source glTF file. */
          textureDirs: z.array(z.string()).default([]),
          /**
           * Optional compatible rig(s) containing animation clips. The clips are
           * retargeted by joint name into this asset during the build; a list
           * merges clips from several files (e.g. KayKit General + Movement).
           */
          animationSource: z
            .union([
              z.string().regex(/\.(glb|gltf)$/i),
              z.array(z.string().regex(/\.(glb|gltf)$/i)).min(1),
            ])
            .optional(),
          animationClips: z.array(z.string()).min(1).optional(),
          /**
           * Clips baked from grafted ones (tools/asset-processor/derive-clips.ts):
           * reversed and/or left-right mirrored, e.g. a left-hand punch.
           */
          derivedClips: z
            .array(
              z.strictObject({
                name: z.string().min(1),
                from: z.string().min(1),
                reverse: z.boolean().optional(),
                mirror: z.boolean().optional(),
                trimStart: z.number().nonnegative().optional(),
              }),
            )
            .default([]),
          /**
           * Skinned parts grafted onto this file's skeleton by joint name, e.g. a
           * UBC head and hairstyle on a headless modular outfit. `keepJoints`
           * keeps only part triangles weighted to those joints.
           */
          parts: z
            .array(
              z.strictObject({
                file: z.string().regex(/\.(glb|gltf)$/i),
                textureDirs: z.array(z.string()).default([]),
                keepJoints: z.array(z.string()).optional(),
              }),
            )
            .default([]),
          /** Meshes (mesh or node name) removed from the main file. */
          dropMeshes: z.array(z.string()).default([]),
          type: z.enum(['character', 'monster', 'environment', 'prop', 'ground']),
          modified: z.boolean().default(false),
          /** Assets plan §14: exceeding a locked budget needs a reason and an owner. */
          budgetException: z
            .strictObject({
              tris: z.number().int().positive(),
              reason: z.string().min(1),
              owner: z.string().min(1),
            })
            .optional(),
        }),
      )
      .default([]),
  })
  .refine((p) => p.kind !== 'models' || p.assets.length > 0, {
    message: 'a models pack needs at least one asset',
    path: ['assets'],
  });
export type PackSource = z.infer<typeof PackSourceSchema>;

/** Max texture edge in px per asset type (assets plan §10.1 baseline). */
export const TEXTURE_BUDGET: Record<PackSource['assets'][number]['type'], number> = {
  character: 1024,
  monster: 1024,
  environment: 512,
  prop: 512,
  ground: 1024,
};

/** LOD0 triangle budgets from assets plan §10.1; exceeding one is a warning, not an error. */
export const TRIANGLE_BUDGET: Record<PackSource['assets'][number]['type'], number> = {
  character: 20_000,
  monster: 10_000,
  environment: 5_000,
  prop: 5_000,
  ground: 20_000,
};
