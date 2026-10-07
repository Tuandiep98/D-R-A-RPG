/**
 * Converts OBJ-only third-party packs (older Quaternius packs ship no glTF)
 * into GLB so the main pipeline can read them.
 *
 *   pnpm assets:convert
 *
 * Reads   art/third_party/<pack>/originals/**\/*.obj (+ .mtl colours)
 * Writes  art/third_party/<pack>/converted/<relative path>.glb
 * Output is regenerable and not committed; originals are never touched.
 * Blender-exported OBJs are in metres, Y-up — matching the asset rules.
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import obj2gltf from 'obj2gltf';

const thirdParty = resolve(import.meta.dirname, '../../art/third_party');

/** Packs without glTF in the download. */
const OBJ_PACKS = [
  'quaternius_medieval_weapons',
  'quaternius_ultimate_rpg_items',
  'quaternius_rpg_asset_pack',
  'quaternius_ultimate_guns',
];

function* objFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* objFiles(p);
    else if (name.toLowerCase().endsWith('.obj')) yield p;
  }
}

let converted = 0;
let failed = 0;
for (const pack of OBJ_PACKS) {
  const originals = join(thirdParty, pack, 'originals');
  if (!existsSync(originals)) {
    console.log(`skip ${pack}: no originals/`);
    continue;
  }
  const outRoot = join(thirdParty, pack, 'converted');
  let n = 0;
  for (const file of objFiles(originals)) {
    const rel = relative(originals, file).replace(/\.obj$/i, '.glb');
    const out = join(outRoot, rel);
    try {
      const glb: Buffer = await obj2gltf(file, { binary: true, unlit: false });
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, glb);
      n++;
    } catch (err) {
      failed++;
      console.error(`  ${pack}/${rel}: ${(err as Error).message}`);
    }
  }
  converted += n;
  console.log(`${pack}: ${n} GLB → ${relative(thirdParty, outRoot)}`);
}
console.log(`\n${converted} converted, ${failed} failed`);
process.exit(failed ? 1 : 0);
