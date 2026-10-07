/**
 * Validates every YAML file under game-data/ with the shared Zod schemas and
 * cross-reference checks. Exit code 1 on any problem (used by CI).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { buildContentBundle, ContentError } from '@rpg/game-data';

const root = resolve(import.meta.dirname, '../../game-data');
const artRoot = resolve(import.meta.dirname, '../../art/third_party');

const files = (readdirSync(root, { recursive: true }) as string[])
  .filter((p) => /\.ya?ml$/i.test(p))
  .map((p) => ({
    path: relative(root, join(root, p)).replace(/\\/g, '/'),
    text: readFileSync(join(root, p), 'utf8'),
  }));

try {
  const bundle = buildContentBundle(files);
  validateAppearanceAssets(bundle.appearances);
  validateMediaRefs(bundle);
  console.log(
    `game-data OK (${files.length} files): ` +
      Object.entries(bundle)
        .map(([k, v]) => `${(v as Map<string, unknown>).size} ${k}`)
        .join(', '),
  );
} catch (err) {
  if (err instanceof ContentError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

/**
 * Keep presentation data honest: every declared model must come from an
 * approved, licensed source pack, and every approved runtime asset must be
 * reachable through an appearance. Placeholder-only appearances deliberately
 * omit modelAssetId.
 */
function validateAppearanceAssets(
  appearances: ReadonlyMap<string, { modelAssetId?: string }>,
): void {
  const approved = new Set<string>();
  for (const pack of readdirSync(artRoot, { withFileTypes: true })) {
    if (!pack.isDirectory()) continue;
    const sourcePath = join(artRoot, pack.name, 'SOURCE.json');
    let source: {
      status?: string;
      licenseVerified?: boolean;
      assets?: { assetId?: string }[];
    };
    try {
      source = JSON.parse(readFileSync(sourcePath, 'utf8'));
    } catch {
      continue;
    }
    if (source.status !== 'approved' || source.licenseVerified !== true) continue;
    for (const asset of source.assets ?? []) {
      if (asset.assetId) approved.add(asset.assetId);
    }
  }

  const referenced = new Set<string>();
  const problems: string[] = [];
  for (const [appearanceId, appearance] of appearances) {
    if (!appearance.modelAssetId) continue;
    referenced.add(appearance.modelAssetId);
    if (!approved.has(appearance.modelAssetId)) {
      problems.push(
        `appearance "${appearanceId}" references unapproved or unavailable modelAssetId "${appearance.modelAssetId}"`,
      );
    }
  }
  for (const assetId of approved) {
    if (!referenced.has(assetId)) problems.push(`approved asset "${assetId}" has no appearance`);
  }
  if (problems.length > 0) {
    throw new Error(`Invalid appearance assets:\n  - ${problems.join('\n  - ')}`);
  }
}

/**
 * Icons and sounds named in game-data must exist in an approved pack's
 * `media` list (built by `pnpm media:build`); typos would otherwise fall back
 * to emoji/silence without anyone noticing.
 */
function validateMediaRefs(bundle: ReturnType<typeof buildContentBundle>): void {
  const known = new Set<string>();
  for (const pack of readdirSync(artRoot, { withFileTypes: true })) {
    if (!pack.isDirectory()) continue;
    let source: { status?: string; licenseVerified?: boolean; media?: { id?: string }[] };
    try {
      source = JSON.parse(readFileSync(join(artRoot, pack.name, 'SOURCE.json'), 'utf8'));
    } catch {
      continue;
    }
    if (source.status !== 'approved' || source.licenseVerified !== true) continue;
    for (const m of source.media ?? []) if (m.id) known.add(m.id);
  }
  const problems: string[] = [];
  const check = (owner: string, id: string | undefined) => {
    if (id && !known.has(id)) problems.push(`${owner} references unknown media "${id}"`);
  };
  for (const [id, s] of bundle.skills) {
    check(`skill "${id}"`, s.iconImage);
    for (const sfx of [...(s.sfx.cast ?? []), ...(s.sfx.impact ?? [])]) check(`skill "${id}"`, sfx);
  }
  for (const [id, item] of bundle.items) check(`item "${id}"`, item.iconImage);
  for (const [id, a] of bundle.appearances)
    for (const list of Object.values(a.sfx))
      for (const sfx of list ?? []) check(`appearance "${id}"`, sfx);
  if (problems.length > 0)
    throw new Error(`Invalid media references:\n  - ${problems.join('\n  - ')}`);
}
