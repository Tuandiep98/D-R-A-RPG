import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { buildContentBundle, type ContentBundle } from "./bundle";

/** Node-only: loads and validates every YAML file under `root` (server, tools, tests). */
export function loadContentFromDir(root: string): ContentBundle {
  const files = (readdirSync(root, { recursive: true }) as string[])
    .filter((p) => /\.ya?ml$/i.test(p))
    .map((p) => ({
      path: relative(root, join(root, p)).replace(/\\/g, "/"),
      text: readFileSync(join(root, p), "utf8"),
    }));
  return buildContentBundle(files);
}

/** Baked navmesh (pnpm nav:build) for a map, if present. */
export function readBakedNav(
  root: string,
  mapId: string,
): { hash: string; data: Uint8Array } | null {
  try {
    const meta = JSON.parse(
      readFileSync(join(root, "nav", `${mapId}.navmesh.json`), "utf8"),
    ) as {
      hash: string;
    };
    return {
      hash: meta.hash,
      data: new Uint8Array(
        readFileSync(join(root, "nav", `${mapId}.navmesh.bin`)),
      ),
    };
  } catch {
    return null;
  }
}
