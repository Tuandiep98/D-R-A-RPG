/**
 * Measures character proportions in the bind pose: total height and "heads
 * tall" (height ÷ head height, head = neck joint → top of the model). Used to
 * check candidates against the art bible's semi-mini target (~4.5–5.5 heads).
 *   pnpm assets:proportions <file.glb|gltf...>
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const file of process.argv.slice(2)) {
  try {
    const doc = await io.read(file);
    const root = doc.getRoot();
    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    if (!scene) throw new Error('no scene');
    const b = getBounds(scene);
    const height = (b.max[1] ?? 0) - (b.min[1] ?? 0);
    const joints = root.listSkins().flatMap((s) => s.listJoints());
    const neck =
      joints.find((j) => /neck/i.test(j.getName())) ??
      joints.find((j) => /head/i.test(j.getName()));
    const name = file.split(/[\\/]/).pop();
    if (!neck) {
      console.log(`${name}: height ${height.toFixed(2)} · no neck/head joint`);
      continue;
    }
    const neckY = neck.getWorldTranslation()[1] ?? 0;
    const head = (b.max[1] ?? 0) - neckY;
    const heads = head > 0 ? height / head : Number.NaN;
    console.log(
      `${name}: height ${height.toFixed(2)} · head ${head.toFixed(2)} (from ${neck.getName()}) · ${heads.toFixed(1)} heads`,
    );
  } catch (err) {
    console.log(`${file}: ${(err as Error).message}`);
  }
}
