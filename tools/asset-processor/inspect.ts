/**
 * Prints bounds, triangle count, materials and clips of glTF/GLB files —
 * used when choosing assets and socket offsets.
 *   pnpm assets:inspect <file...>          human-readable
 *   pnpm assets:inspect --json <file...>   one JSON line per file
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const fmt = (v: number[]) => v.map((n) => n.toFixed(2)).join(', ');

const json = process.argv.includes('--json');
for (const file of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
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
    // Keep unrounded keyframe times in JSON for animation timing audits.
    const clips = root.listAnimations().map((animation) => {
      let duration = 0;
      for (const sampler of animation.listSamplers())
        duration = Math.max(duration, sampler.getInput()?.getMax([0])[0] ?? 0);
      return { name: animation.getName(), duration };
    });
    if (json) {
      console.log(
        JSON.stringify({
          file,
          tris: Math.round(tris),
          size,
          min: b?.min ?? null,
          clips,
        }),
      );
      continue;
    }
    console.log(`${file.split(/[\\/]/).pop()}`);
    console.log(`  tris ${Math.round(tris)} · size [${fmt(size)}] · min [${b ? fmt(b.min) : '—'}]`);
    console.log(
      `  materials ${root.listMaterials().length} · textures ${root.listTextures().length} · skins ${root.listSkins().length}`,
    );
    if (process.argv.includes('--joints'))
      for (const skin of root.listSkins())
        console.log(
          `  joints (${skin.listJoints().length}): ${skin
            .listJoints()
            .map((j) => j.getName())
            .join(', ')}`,
        );
    if (clips.length)
      console.log(
        `  clips (${clips.length}): ${clips.map((clip) => `${clip.name} ${clip.duration.toFixed(2)}s`).join(', ')}`,
      );
  } catch (err) {
    process.exitCode = 1;
    console.log(`${file}: ${(err as Error).message}`);
  }
}
