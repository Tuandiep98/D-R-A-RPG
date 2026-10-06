import {
  type AssetContainer,
  LoadAssetContainerAsync,
  MeshoptCompression,
  type Scene,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { z } from 'zod';

/** Written by tools/asset-processor. URLs are content-hashed and relative to the manifest. */
export const AssetManifestSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  /** Decoder scripts shipped with the build (no third-party CDN at runtime). */
  decoders: z.object({ meshopt: z.string().optional() }).default({}),
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

const EMPTY_MANIFEST: AssetManifest = { version: 1, generatedAt: '', decoders: {}, assets: {} };
const MAX_ATTEMPTS = 3;

export interface LoadProgress {
  /** Bytes of requested assets that finished (successfully or not). */
  loadedBytes: number;
  /** Bytes of every asset requested so far, from the manifest. */
  totalBytes: number;
  pending: number;
}

/**
 * Loads GLB containers by asset id (assets plan §11): requests are
 * deduplicated, retried a bounded number of times, reported by real byte
 * sizes, and failures resolve to null so callers fall back to placeholders.
 */
export class AssetLibrary {
  private manifest: AssetManifest = EMPTY_MANIFEST;
  private baseUrl = '';
  private readonly containers = new Map<string, Promise<AssetContainer | null>>();
  private readonly progress: LoadProgress = { loadedBytes: 0, totalBytes: 0, pending: 0 };
  private readonly progressListeners = new Set<(p: LoadProgress) => void>();

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
    const meshopt = this.manifest.decoders.meshopt;
    if (meshopt) {
      MeshoptCompression.Configuration = { decoder: { url: new URL(meshopt, this.baseUrl).href } };
    }
    return this.manifest;
  }

  get entries(): Readonly<Record<string, AssetEntry>> {
    return this.manifest.assets;
  }

  has(assetId: string | undefined): assetId is string {
    return !!assetId && assetId in this.manifest.assets;
  }

  onProgress(cb: (p: LoadProgress) => void): () => void {
    this.progressListeners.add(cb);
    cb({ ...this.progress });
    return () => this.progressListeners.delete(cb);
  }

  /** Starts loading several assets; resolves when all settled. */
  async preload(assetIds: Iterable<string>): Promise<void> {
    await Promise.all(
      [...new Set(assetIds)].filter((id) => this.has(id)).map((id) => this.loadContainer(id)),
    );
  }

  /** Resolves to null when the asset is missing or fails to load. */
  loadContainer(assetId: string): Promise<AssetContainer | null> {
    const cached = this.containers.get(assetId);
    if (cached) return cached;
    const entry = this.manifest.assets[assetId];
    if (!entry) {
      const none = Promise.resolve(null);
      this.containers.set(assetId, none);
      return none;
    }
    this.progress.totalBytes += entry.bytes;
    this.progress.pending++;
    this.emitProgress();
    const promise = this.loadWithRetry(assetId, new URL(entry.url, this.baseUrl).href).finally(
      () => {
        this.progress.loadedBytes += entry.bytes;
        this.progress.pending--;
        this.emitProgress();
      },
    );
    this.containers.set(assetId, promise);
    return promise;
  }

  async dispose(): Promise<void> {
    for (const p of this.containers.values()) (await p)?.dispose();
    this.containers.clear();
    this.progressListeners.clear();
  }

  private async loadWithRetry(assetId: string, url: string): Promise<AssetContainer | null> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await LoadAssetContainerAsync(url, this.scene);
      } catch (err) {
        if (attempt === MAX_ATTEMPTS) {
          console.warn(`[assets] failed to load ${assetId} after ${attempt} attempts`, err);
          return null;
        }
        await new Promise((r) => setTimeout(r, 300 * 2 ** (attempt - 1)));
      }
    }
    return null;
  }

  private emitProgress(): void {
    const snapshot = { ...this.progress };
    for (const cb of this.progressListeners) cb(snapshot);
  }
}
