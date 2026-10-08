/** Verify authored kit clip references against the actual shipped GLB, without renderer fallbacks. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadContentFromDir } from '../../packages/game-data/src/node';

const content = loadContentFromDir(resolve('game-data'));
const assetRoot = resolve('apps/game-web/public/assets');
const manifest = JSON.parse(readFileSync(resolve(assetRoot, 'assets.manifest.json'), 'utf8')) as {
  assets: Record<string, { url: string }>;
};
const results: {
  profile: string;
  asset: string;
  references: { source: string; clip: string }[];
}[] = [];
for (const profile of [
  'player_default',
  'player_phap',
  'player_the',
  'player_tran',
  'player_anh',
  'player_thu',
]) {
  const character = content.characters.get(profile);
  const appearance = character && content.appearances.get(character.appearanceId);
  const asset = appearance?.modelAssetId && manifest.assets[appearance.modelAssetId];
  if (!character || !appearance || !asset) throw new Error(`Missing model for ${profile}`);
  const glb = readFileSync(resolve(assetRoot, asset.url));
  if (glb.readUInt32LE(0) !== 0x46546c67 || glb.readUInt32LE(16) !== 0x4e4f534a)
    throw new Error(`Invalid GLB JSON chunk ${asset.url}`);
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')) as {
    animations?: { name?: string }[];
  };
  const clips = new Set(gltf.animations?.map((animation) => animation.name));
  const references: { source: string; clip: string }[] = [];
  const check = (source: string, clip: string | undefined) => {
    if (!clip) return;
    if (!clips.has(clip)) throw new Error(`${profile}: ${source} references absent clip ${clip}`);
    references.push({ source, clip });
  };
  for (const [role, clip] of Object.entries(appearance.animations))
    check(`appearance.${role}`, clip);
  for (const comboId of new Set(Object.values(character.combos))) {
    const combo = content.combos.get(comboId);
    if (!combo) throw new Error(`Missing combo ${comboId}`);
    for (const step of combo.steps)
      for (const variant of step.variants) check(`${comboId}.${variant.id}`, variant.clip);
  }
  for (const id of new Set([
    ...character.skills,
    ...character.prototypeSkills,
    'skill_roll',
    'skill_blink',
    'skill_jump',
  ])) {
    const skill = content.skills.get(id);
    if (!skill) throw new Error(`Missing skill ${id}`);
    check(`${id}.cast`, skill.anim?.cast);
    check(`${id}.impact`, skill.anim?.impact);
  }
  results.push({ profile, asset: asset.url, references });
  console.log(`PASS ${profile}: ${references.length} named clip references exist in ${asset.url}`);
}
const out = resolve('reports/kit-clips');
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
