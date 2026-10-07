/**
 * Bakes a Recast navmesh for every map (tech plan §23: bake ahead of time,
 * never per login). Output: game-data/nav/<mapId>.navmesh.bin + .json with the
 * source hash, so runtime can detect a stale bake and fall back.
 *
 * Usage: pnpm nav:build [--check]   (--check fails if any bake is stale; for CI)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { buildContentBundle } from "@rpg/game-data";
import {
  generateNavMesh,
  initNavigation,
  navSourceHash,
  serializeNavMesh,
} from "@rpg/navigation";

const repo = resolve(import.meta.dirname, "../..");
const dataRoot = join(repo, "game-data");
const outDir = join(dataRoot, "nav");
const checkOnly = process.argv.includes("--check");

const content = buildContentBundle(
  (readdirSync(dataRoot, { recursive: true }) as string[])
    .filter((p) => p.endsWith(".yaml"))
    .map((p) => ({
      path: relative(dataRoot, join(dataRoot, p)).replace(/\\/g, "/"),
      text: readFileSync(join(dataRoot, p), "utf8"),
    })),
);

await initNavigation();
let stale = 0;
for (const map of content.maps.values()) {
  const hash = navSourceHash(map);
  const metaPath = join(outDir, `${map.id}.navmesh.json`);
  const current = existsSync(metaPath)
    ? (JSON.parse(readFileSync(metaPath, "utf8")) as { hash: string }).hash
    : null;
  if (current === hash) {
    console.log(`  ${map.id}: up to date (${hash})`);
    continue;
  }
  if (checkOnly) {
    console.error(
      `  ${map.id}: STALE (have ${current ?? "none"}, need ${hash})`,
    );
    stale++;
    continue;
  }
  const started = performance.now();
  const data = serializeNavMesh(generateNavMesh(map));
  writeFileSync(join(outDir, `${map.id}.navmesh.bin`), data);
  writeFileSync(
    metaPath,
    `${JSON.stringify({ mapId: map.id, hash, bytes: data.byteLength }, null, 2)}\n`,
  );
  console.log(
    `  ${map.id}: baked ${(data.byteLength / 1024).toFixed(1)} KB in ${(performance.now() - started).toFixed(0)} ms`,
  );
}
if (stale) {
  console.error(`${stale} navmesh(es) stale — run pnpm nav:build`);
  process.exit(1);
}
