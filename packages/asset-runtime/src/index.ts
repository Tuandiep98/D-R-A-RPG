import { type AssetContainer, LoadAssetContainerAsync, type Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { z } from 'zod';

/** Written by tools/asset-processor. URLs are content-hashed and relative to the manifest. */
export const AssetManifestSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  assets: z.record(
    z.string(),
    z.object({
      url: z.string(),
      hash: z.string(),
      bytes: z.number().int().nonnegative(),
      type: z.enum(['character', 'monster', 'environment', 'prop', 'ground']),
      animations: z.array(z.string()).default([]),
      license: z.string(),
      licenseVerified: z.boolean(),
    }),
  ),
});
export type AssetManifest = z.infer<typeof AssetManifestSchema>;
export type AssetEntry = AssetManifest['assets'][string];

const EMPTY_MANIFEST: AssetManifest = { version: 1, generatedAt: '', assets: {} };

/**
 * Loads GLB containers by asset id. Requests are deduplicated and failures
 * resolve to null so callers can fall back to placeholders instead of crashing.
 */
export class AssetLibrary {
  private manifest: AssetManifest = EMPTY_MANIFEST;
  private baseUrl = '';
  private readonly containers = new Map<string, Promise<AssetContainer | null>>();

  constructor(private readonly scene: Scene) {}

  async loadManifest(url: string): Promise<AssetManifest> {
    this.baseUrl = new URL('.', new URL(url, window.location.href)).href;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Dev servers answer unknown paths with index.html; treat that as "not built yet".
      if (!res.headers.get('content-type')?.includes('json')) {
        console.info(`[assets] ${url} not found (run \`pnpm assets:build\`); using placeholders`);
        return this.manifest;
      }
      this.manifest = AssetManifestSchema.parse(await res.json());
    } catch (err) {
      console.warn(`[assets] no usable manifest at ${url}; using placeholders`, err);
      this.manifest = EMPTY_MANIFEST;
    }
    return this.manifest;
  }

  get entries(): Readonly<Record<string, AssetEntry>> {
    return this.manifest.assets;
  }

  has(assetId: string | undefined): assetId is string {
    return !!assetId && assetId in this.manifest.assets;
  }

  /** Resolves to null when the asset is missing or fails to load. */
  loadContainer(assetId: string): Promise<AssetContainer | null> {
    const cached = this.containers.get(assetId);
    if (cached) return cached;
    const entry = this.manifest.assets[assetId];
    const promise = entry
      ? LoadAssetContainerAsync(new URL(entry.url, this.baseUrl).href, this.scene).catch((err) => {
          console.warn(`[assets] failed to load ${assetId}`, err);
          return null;
        })
      : Promise.resolve(null);
    this.containers.set(assetId, promise);
    return promise;
  }

  async dispose(): Promise<void> {
    for (const p of this.containers.values()) (await p)?.dispose();
    this.containers.clear();
  }
}
