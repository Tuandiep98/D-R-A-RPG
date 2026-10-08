/**
 * Converts packs that ship no glTF into GLB so the main pipeline can read them:
 * - OBJ (+ .mtl colours) for older static Quaternius packs, via obj2gltf;
 * - FBX with skeletons/animations (KayKit Character Animations), via
 *   Meta's FBX2glTF binary — joint names are kept, so clips graft by name.
 *
 *   pnpm assets:convert
 *
 * Writes art/third_party/<pack>/converted/<relative path>.glb
 * Output is regenerable and not committed; originals are never touched.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

/** Packs whose FBX files carry the rig/animations we need (no glTF in the download). */
const FBX_PACKS = ['kaykit_character_animations'];

function* filesWith(dir: string, ext: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* filesWith(p, ext);
    else if (name.toLowerCase().endsWith(ext)) yield p;
  }
}

const fbxBinary = (() => {
  const pkg = dirname(createRequire(import.meta.url).resolve('fbx2gltf/package.json'));
  const bin =
    process.platform === 'win32'
      ? 'Windows_NT/FBX2glTF.exe'
      : process.platform === 'darwin'
        ? 'Darwin/FBX2glTF'
        : 'Linux/FBX2glTF';
  return join(pkg, 'bin', bin);
})();

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
  for (const file of filesWith(originals, '.obj')) {
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

for (const pack of FBX_PACKS) {
  const originals = join(thirdParty, pack, 'originals');
  if (!existsSync(originals)) {
    console.log(`skip ${pack}: no originals/`);
    continue;
  }
  const outRoot = join(thirdParty, pack, 'converted');
  let n = 0;
  for (const file of filesWith(originals, '.fbx')) {
    const rel = relative(originals, file).replace(/\.fbx$/i, '');
    const out = join(outRoot, rel);
    try {
      mkdirSync(dirname(out), { recursive: true });
      // FBX2glTF appends .glb itself.
      execFileSync(fbxBinary, ['--binary', '--input', file, '--output', out], {
        stdio: 'pipe',
      });
      n++;
    } catch (err) {
      failed++;
      console.error(`  ${pack}/${rel}.fbx: ${(err as Error).message.split('\n')[0]}`);
    }
  }
  converted += n;
  console.log(`${pack}: ${n} GLB (FBX) → ${relative(thirdParty, outRoot)}`);
}
console.log(`\n${converted} converted, ${failed} failed`);
process.exit(failed ? 1 : 0);
