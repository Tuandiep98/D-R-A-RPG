/**
 * Prints bounds, triangle count, materials and clips of glTF/GLB files —
 * used when choosing assets and socket offsets.
 *   pnpm assets:inspect <file...>          human-readable
 *   pnpm assets:inspect --json <file...>   one JSON line per file
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const fmt = (v: number[]) => v.map((n) => n.toFixed(2)).join(', ');

const json = process.argv.includes('--json');
for (const file of process.argv.slice(2).filter((a) => a !== '--json')) {
  try {
    const doc = await io.read(file);
    const root = doc.getRoot();
    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    let tris = 0;
    for (const mesh of root.listMeshes())
      for (const prim of mesh.listPrimitives())
        tris +=
          (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
    const b = scene ? getBounds(scene) : null;
    const size = b ? b.max.map((m, i) => m - (b.min[i] ?? 0)) : [];
    if (json) {
      console.log(JSON.stringify({ file, tris: Math.round(tris), size, min: b?.min ?? null }));
      continue;
    }
    console.log(`${file.split(/[\\/]/).pop()}`);
    console.log(`  tris ${Math.round(tris)} · size [${fmt(size)}] · min [${b ? fmt(b.min) : '—'}]`);
    console.log(
      `  materials ${root.listMaterials().length} · textures ${root.listTextures().length} · skins ${root.listSkins().length}`,
    );
    const clips = root.listAnimations().map((a) => a.getName());
    if (clips.length) console.log(`  clips (${clips.length}): ${clips.join(', ')}`);
  } catch (err) {
    console.log(`${file}: ${(err as Error).message}`);
  }
}
