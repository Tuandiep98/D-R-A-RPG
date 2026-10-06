/**
 * art/third_party/<pack>/SOURCE.json + originals → apps/game-web/public/assets/
 *   - validates provenance (SOURCE.json + LICENSE.txt must exist)
 *   - dedup / prune / resample / meshopt compression (decision D-006)
 *   - content-hashed filenames + assets.manifest.json
 * Output is reproducible from source and is not committed.
 *
 * Usage: pnpm assets:build [--no-compress]
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PackSourceSchema, TRIANGLE_BUDGET } from './source';

const repo = resolve(import.meta.dirname, '../..');
const thirdParty = join(repo, 'art/third_party');
const outDir = join(repo, 'apps/game-web/public/assets');
const compress = !process.argv.includes('--no-compress');

interface ManifestEntry {
  url: string;
  hash: string;
  bytes: number;
  type: string;
  animations: string[];
  license: string;
  licenseVerified: boolean;
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const errors: string[] = [];
const warnings: string[] = [];
const assets: Record<string, ManifestEntry> = {};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const packs = existsSync(thirdParty)
  ? readdirSync(thirdParty, { withFileTypes: true }).filter((d) => d.isDirectory())
  : [];

for (const dir of packs) {
  const packDir = join(thirdParty, dir.name);
  const sourcePath = join(packDir, 'SOURCE.json');
  if (!existsSync(sourcePath)) continue;

  const parsed = PackSourceSchema.safeParse(JSON.parse(readFileSync(sourcePath, 'utf8')));
  if (!parsed.success) {
    errors.push(
      `${dir.name}/SOURCE.json: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
    continue;
  }
  const pack = parsed.data;
  if (pack.status === 'rejected') continue;
  if (!existsSync(join(packDir, 'LICENSE.txt'))) {
    errors.push(`${pack.packId}: LICENSE.txt is missing — asset is quarantined`);
    continue;
  }
  if (!pack.licenseVerified)
    warnings.push(`${pack.packId}: license not verified yet (${pack.license})`);

  for (const asset of pack.assets) {
    const file = join(packDir, asset.file);
    if (!existsSync(file)) {
      errors.push(`${pack.packId}/${asset.assetId}: ${asset.file} not found`);
      continue;
    }
    if (assets[asset.assetId]) {
      errors.push(`${asset.assetId}: duplicate assetId (also in another pack)`);
      continue;
    }
    try {
      const doc = await io.read(file);
      const tris = countTriangles(doc);
      const animations = doc
        .getRoot()
        .listAnimations()
        .map((a) => a.getName());
      await doc.transform(dedup(), prune(), resample());
      if (compress) await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
      const bytes = await io.writeBinary(doc);
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
      const name = `${asset.assetId}.${hash}.glb`;
      writeFileSync(join(outDir, name), bytes);
      assets[asset.assetId] = {
        url: name,
        hash,
        bytes: bytes.byteLength,
        type: asset.type,
        animations,
        license: pack.license,
        licenseVerified: pack.licenseVerified,
      };
      const budget = TRIANGLE_BUDGET[asset.type];
      if (tris > budget)
        warnings.push(`${asset.assetId}: ${tris} tris exceeds ${asset.type} budget ${budget}`);
      console.log(
        `  ${asset.assetId.padEnd(28)} ${String(tris).padStart(7)} tris ${kb(bytes.byteLength).padStart(9)}` +
          (animations.length ? `  anims: ${animations.join(', ')}` : ''),
      );
    } catch (err) {
      errors.push(`${asset.assetId}: ${(err as Error).message}`);
    }
  }
}

writeFileSync(
  join(outDir, 'assets.manifest.json'),
  `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), assets }, null, 2)}\n`,
);

for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`\n${Object.keys(assets).length} assets → ${outDir}`);
if (errors.length) process.exit(1);

function countTriangles(doc: Document): number {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue; // TRIANGLES
      const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
      tris += count / 3;
    }
  }
  return Math.round(tris);
}

function kb(n: number): string {
  return `${(n / 1024).toFixed(1)} KB`;
}
