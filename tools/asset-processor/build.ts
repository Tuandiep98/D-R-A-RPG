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
import { type Accessor, type Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  cloneDocument,
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
import { deriveClips } from './derive-clips';
import { dropMeshes, graftParts, keepTrianglesByJoints } from './parts';
import { readTolerant } from './read';
import { type PackSource, PackSourceSchema, TEXTURE_BUDGET, TRIANGLE_BUDGET } from './source';

const repo = resolve(import.meta.dirname, '../..');
const thirdParty = join(repo, 'art/third_party');
const outDir = join(repo, 'apps/game-web/public/assets');
const catalogPath = join(repo, 'docs/asset_catalog.md');
const compress = !process.argv.includes('--no-compress');
const processTextures = !process.argv.includes('--no-textures');

interface ManifestEntry {
  url: string;
  /** Simplified far-distance version (static meshes only). */
  lod1?: { url: string; bytes: number; tris: number };
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
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});

const errors: string[] = [];
const warnings: string[] = [];
const assets: Record<string, ManifestEntry> = {};
const catalog: CatalogRow[] = [];

// Not wiped up front: a dev server reloading mid-build would find no manifest
// and show placeholders for the whole session. Hashed files are written next
// to the old ones, the manifest is swapped in last, then stale files go.
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
      const doc = await readTolerant(io, file, asset.textureDirs, (message) =>
        warnings.push(`${asset.assetId}: ${message}`),
      );
      if (asset.dropMeshes.length) dropMeshes(doc, asset.dropMeshes);
      if (asset.parts.length) {
        const parts: Document[] = [];
        for (const part of asset.parts) {
          const partFile = join(packDir, part.file);
          if (!existsSync(partFile)) throw new Error(`${part.file} not found`);
          const partDoc = await readTolerant(io, partFile, part.textureDirs, (message) =>
            warnings.push(`${asset.assetId}: ${message}`),
          );
          if (part.keepJoints) keepTrianglesByJoints(partDoc, part.keepJoints);
          parts.push(partDoc);
        }
        await graftParts(doc, parts);
      }
      const animationSources =
        typeof asset.animationSource === 'string'
          ? [asset.animationSource]
          : (asset.animationSource ?? []);
      const missingAnimation = animationSources.find((f) => !existsSync(join(packDir, f)));
      if (missingAnimation) {
        errors.push(`${pack.packId}/${asset.assetId}: ${missingAnimation} not found`);
        continue;
      }
      for (const source of animationSources) {
        const animationDoc = await readTolerant(io, join(packDir, source), [], (message) =>
          warnings.push(`${asset.assetId}: ${message}`),
        );
        graftAnimations(doc, animationDoc, asset.animationClips);
      }
      for (const problem of deriveClips(doc, asset.derivedClips))
        errors.push(`${pack.packId}/${asset.assetId}: ${problem}`);
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
      // LOD1 (tech plan §10): ~35% of the triangles for instances far from the camera.
      let lod1: ManifestEntry['lod1'];
      if (asset.type === 'environment' || asset.type === 'prop') {
        const far = cloneDocument(doc);
        await far.transform(
          weld(),
          simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.08 }),
        );
        if (compress) await far.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
        const farBytes = await io.writeBinary(far);
        const farTris = countTriangles(far);
        if (farTris < finalTris * 0.8) {
          const farHash = createHash('sha256').update(farBytes).digest('hex').slice(0, 10);
          const farName = `${asset.assetId}_lod1.${farHash}.glb`;
          writeFileSync(join(outDir, farName), farBytes);
          lod1 = { url: farName, bytes: farBytes.byteLength, tris: farTris };
        }
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
        ...(lod1 ? { lod1 } : {}),
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

// Written in place (rename-over fails on Windows while the dev server reads it);
// clients retry a manifest that is briefly unreadable.
writeFileSync(
  join(outDir, 'assets.manifest.json'),
  `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), decoders, assets }, null, 2)}\n`,
);
const keep = new Set([
  'assets.manifest.json',
  ...Object.values(decoders),
  ...Object.values(assets).flatMap((a) => (a.lod1 ? [a.url, a.lod1.url] : [a.url])),
]);
for (const f of readdirSync(outDir))
  if (!keep.has(f)) rmSync(join(outDir, f), { recursive: true, force: true });
writeFileSync(catalogPath, renderCatalog(catalog, warnings));

// `--allow-missing`: packs whose originals are not on this machine (or not in
// git yet) fall back to placeholders instead of failing the build (CI).
if (process.argv.includes('--allow-missing')) {
  const missing = errors.filter((e) => e.endsWith('not found'));
  warnings.push(...missing.map((e) => `${e} (placeholder)`));
  errors.splice(0, errors.length, ...errors.filter((e) => !e.endsWith('not found')));
}
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

/**
 * Copies animation channels onto a compatible rig by node name. Quaternius
 * UBC, Modular Outfits and UAL share the same 65-joint skeleton, but ship as
 * separate files. Keeping only the destination skeleton avoids duplicate
 * armatures in the runtime GLB.
 */
function graftAnimations(
  target: Document,
  source: Document,
  selectedClips: readonly string[] | undefined,
): void {
  const targetNodes = new Map(
    target
      .getRoot()
      .listNodes()
      .map((node) => [node.getName(), node]),
  );
  const buffer = target.getRoot().listBuffers()[0] ?? target.createBuffer('animation_buffer');
  const wanted = selectedClips ? new Set(selectedClips) : null;

  for (const sourceAnimation of source.getRoot().listAnimations()) {
    if (wanted && !wanted.has(sourceAnimation.getName())) continue;
    const animation = target.createAnimation(sourceAnimation.getName());
    const accessorMap = new Map<Accessor, Accessor>();
    const samplerMap = new Map(
      sourceAnimation.listSamplers().map((sourceSampler) => {
        const input = sourceSampler.getInput();
        const output = sourceSampler.getOutput();
        if (!input || !output)
          throw new Error(`animation ${sourceAnimation.getName()} has an empty sampler`);
        const sampler = target
          .createAnimationSampler(sourceSampler.getName())
          .setInput(copyAccessor(input, target, buffer, accessorMap))
          .setOutput(copyAccessor(output, target, buffer, accessorMap))
          .setInterpolation(sourceSampler.getInterpolation());
        animation.addSampler(sampler);
        return [sourceSampler, sampler] as const;
      }),
    );

    for (const sourceChannel of sourceAnimation.listChannels()) {
      const sourceNode = sourceChannel.getTargetNode();
      const sourceSampler = sourceChannel.getSampler();
      const targetPath = sourceChannel.getTargetPath();
      const targetNode = sourceNode ? targetNodes.get(sourceNode.getName()) : undefined;
      if (!targetNode || !sourceSampler || !targetPath) continue;
      const sampler = samplerMap.get(sourceSampler);
      if (!sampler) continue;
      animation.addChannel(
        target
          .createAnimationChannel(sourceChannel.getName())
          .setTargetNode(targetNode)
          .setTargetPath(targetPath)
          .setSampler(sampler),
      );
    }
    if (animation.listChannels().length === 0) animation.dispose();
  }
}

function copyAccessor(
  source: Accessor,
  target: Document,
  buffer: ReturnType<Document['createBuffer']>,
  cache: Map<Accessor, Accessor>,
): Accessor {
  const cached = cache.get(source);
  if (cached) return cached;
  const array = source.getArray();
  if (!array) throw new Error(`animation accessor ${source.getName()} has no data`);
  const copy = target
    .createAccessor(source.getName())
    .setType(source.getType())
    .setArray(array.slice() as typeof array)
    .setNormalized(source.getNormalized())
    .setBuffer(buffer);
  cache.set(source, copy);
  return copy;
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
