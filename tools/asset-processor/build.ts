/**
 * art/third_party/<pack>/SOURCE.json + originals → apps/game-web/public/assets/
 *   - validates provenance (SOURCE.json + LICENSE.txt must exist)
 *   - dedup / prune / resample, textures resized per asset type and re-encoded as WebP
 *   - meshopt compression (decision D-006); the decoder ships next to the assets so
 *     the client does not depend on a third-party CDN (needed for PWA offline)
 *   - content-hashed filenames + assets.manifest.json
 *   - docs/asset_catalog.md (provenance + stats), regenerated on every build
 * Output is reproducible from source and is not committed.
 *
 * Usage: pnpm assets:build [--no-compress] [--no-textures]
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { type Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  meshopt,
  prune,
  resample,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { type PackSource, PackSourceSchema, TEXTURE_BUDGET, TRIANGLE_BUDGET } from './source';

const repo = resolve(import.meta.dirname, '../..');
const thirdParty = join(repo, 'art/third_party');
const outDir = join(repo, 'apps/game-web/public/assets');
const catalogPath = join(repo, 'docs/asset_catalog.md');
const compress = !process.argv.includes('--no-compress');
const processTextures = !process.argv.includes('--no-textures');

interface ManifestEntry {
  url: string;
  hash: string;
  bytes: number;
  type: string;
  animations: string[];
  license: string;
  licenseVerified: boolean;
}

interface CatalogRow {
  assetId: string;
  pack: PackSource;
  file: string;
  type: string;
  tris: number;
  sourceBytes: number;
  bytes: number;
  textures: string;
  animations: string[];
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const errors: string[] = [];
const warnings: string[] = [];
const assets: Record<string, ManifestEntry> = {};
const catalog: CatalogRow[] = [];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const decoders: Record<string, string> = {};
if (compress) {
  const require = createRequire(import.meta.url);
  // The file is not in the package's exports map; resolve it next to the entry point.
  const src = join(dirname(require.resolve('meshoptimizer')), 'meshopt_decoder.cjs');
  const hash = createHash('sha256').update(readFileSync(src)).digest('hex').slice(0, 10);
  const name = `meshopt_decoder.${hash}.js`;
  copyFileSync(src, join(outDir, name));
  decoders.meshopt = name;
}

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
      const sourceBytes = (await io.writeBinary(doc)).byteLength;
      const animations = doc
        .getRoot()
        .listAnimations()
        .map((a) => a.getName());
      checkTransforms(doc, asset.assetId);

      await doc.transform(dedup(), prune(), resample());
      // Static meshes over budget are simplified automatically; skinned ones need an artist.
      const budget = asset.budgetException?.tris ?? TRIANGLE_BUDGET[asset.type];
      let finalTris = tris;
      if (tris > budget && (asset.type === 'environment' || asset.type === 'prop')) {
        const ratio = (budget * 0.95) / tris;
        await doc.transform(
          weld(),
          simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.05 }),
        );
        finalTris = countTriangles(doc);
        console.log(`  ${asset.assetId}: simplified ${tris} → ${finalTris} tris`);
      }
      const maxTexture = TEXTURE_BUDGET[asset.type];
      if (processTextures && doc.getRoot().listTextures().length > 0) {
        await doc.transform(
          textureCompress({
            encoder: sharp,
            targetFormat: 'webp',
            resize: [maxTexture, maxTexture],
            quality: 88,
          }),
        );
      }
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
      const textures = doc
        .getRoot()
        .listTextures()
        .map((t) => t.getSize())
        .filter((s): s is [number, number] => !!s);
      const texSummary = textures.length
        ? `${textures.length} × ≤${Math.max(...textures.map((s) => Math.max(...s)))}px`
        : '—';
      catalog.push({
        assetId: asset.assetId,
        pack,
        file: asset.file,
        type: asset.type,
        tris: finalTris,
        sourceBytes,
        bytes: bytes.byteLength,
        textures: texSummary,
        animations,
      });

      if (finalTris > budget)
        warnings.push(`${asset.assetId}: ${finalTris} tris exceeds ${asset.type} budget ${budget}`);
      console.log(
        `  ${asset.assetId.padEnd(24)} ${String(finalTris).padStart(6)} tris ${kb(sourceBytes).padStart(10)} → ${kb(bytes.byteLength).padStart(9)}` +
          (animations.length ? `  anims: ${animations.join(', ')}` : ''),
      );
    } catch (err) {
      errors.push(`${asset.assetId}: ${(err as Error).message}`);
    }
  }
}

writeFileSync(
  join(outDir, 'assets.manifest.json'),
  `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), decoders, assets }, null, 2)}\n`,
);
writeFileSync(catalogPath, renderCatalog(catalog, warnings));

for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`\n${Object.keys(assets).length} assets → ${outDir}`);
console.log(`catalog → ${catalogPath}`);
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

/** Assets plan §5.1: no negative or wildly non-uniform scale on scene roots. */
function checkTransforms(doc: Document, assetId: string): void {
  for (const scene of doc.getRoot().listScenes()) {
    for (const node of scene.listChildren()) {
      const [x, y, z] = node.getScale();
      if (x < 0 || y < 0 || z < 0)
        warnings.push(`${assetId}: root "${node.getName()}" has negative scale`);
      const max = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
      const min = Math.min(Math.abs(x), Math.abs(y), Math.abs(z));
      if (min > 0 && max / min > 1.01)
        warnings.push(
          `${assetId}: root "${node.getName()}" has non-uniform scale ${[x, y, z].join(',')}`,
        );
    }
  }
}

function renderCatalog(rows: CatalogRow[], warns: string[]): string {
  const lines = [
    '# Asset Catalog',
    '',
    '> Sinh tự động bởi `pnpm assets:build` từ `art/third_party/*/SOURCE.json`. Không sửa tay.',
    '',
    '| assetId | Loại | Pack | License | Đã xác minh | Trạng thái | Tris | Gốc → Build | Texture | Animations |',
    '|---|---|---|---|---|---|---:|---|---|---|',
  ];
  for (const r of rows.sort((a, b) => a.assetId.localeCompare(b.assetId))) {
    lines.push(
      `| \`${r.assetId}\` | ${r.type} | [${r.pack.pack}](${r.pack.sourceUrl}) | ${r.pack.license} | ${r.pack.licenseVerified ? 'có' : '**chưa**'} | ${r.pack.status} | ${r.tris} | ${kb(r.sourceBytes)} → ${kb(r.bytes)} | ${r.textures} | ${r.animations.length ? r.animations.join(', ') : '—'} |`,
    );
  }
  lines.push('', '## Nguồn file', '');
  for (const r of rows)
    lines.push(`- \`${r.assetId}\`: \`art/third_party/${r.pack.packId}/${r.file}\``);
  if (warns.length) {
    lines.push('', '## Cảnh báo lần build gần nhất', '');
    for (const w of warns) lines.push(`- ${w}`);
  }
  return `${lines.join('\n')}\n`;
}

function kb(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;
}
