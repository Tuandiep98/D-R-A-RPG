import { z } from 'zod';

/**
 * Provenance + asset list for one third-party pack (assets plan §4.2, §13.1).
 * Lives at art/third_party/<packId>/SOURCE.json next to LICENSE.txt.
 */
export const PackSourceSchema = z.strictObject({
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
  assets: z
    .array(
      z.strictObject({
        assetId: z.string().regex(/^[a-z][a-z0-9_]*$/),
        /** Path relative to the pack folder, usually under originals/. */
        file: z.string().regex(/\.(glb|gltf)$/i, 'only .glb/.gltf are supported'),
        type: z.enum(['character', 'monster', 'environment', 'prop', 'ground']),
        modified: z.boolean().default(false),
      }),
    )
    .min(1),
});
export type PackSource = z.infer<typeof PackSourceSchema>;

/** LOD0 triangle budgets from assets plan §10.1; exceeding one is a warning, not an error. */
export const TRIANGLE_BUDGET: Record<PackSource['assets'][number]['type'], number> = {
  character: 20_000,
  monster: 10_000,
  environment: 5_000,
  prop: 5_000,
  ground: 20_000,
};
