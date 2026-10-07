import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Document, JSONDocument, NodeIO } from "@gltf-transform/core";

/**
 * Reads a .glb/.gltf, tolerating the broken texture paths some packs ship
 * with (e.g. Quaternius UBC refers to `T_Hair_1_Normal_png.png` while the file
 * is `T_Hair_1_Normal.png`, or keeps textures in a sibling `Textures/` folder).
 * Originals are never modified: URIs are fixed in memory only.
 *
 * Lookup order for an image URI: as written; without a `_png` suffix; then the
 * same two names in every `textureDirs` folder (relative to the file).
 * Images that still cannot be found are dropped with a warning.
 */
export async function readTolerant(
  io: NodeIO,
  file: string,
  textureDirs: readonly string[],
  warn: (msg: string) => void,
): Promise<Document> {
  if (/\.glb$/i.test(file)) return io.read(file);
  const dir = dirname(file);
  const json = JSON.parse(readFileSync(file, "utf8")) as JSONDocument["json"];
  const resources: JSONDocument["resources"] = {};

  for (const buffer of json.buffers ?? []) {
    if (!buffer.uri || buffer.uri.startsWith("data:")) continue;
    resources[buffer.uri] = new Uint8Array(
      readFileSync(join(dir, decodeURI(buffer.uri))),
    );
  }

  const dropped = new Set<number>();
  (json.images ?? []).forEach((image, index) => {
    if (!image.uri || image.uri.startsWith("data:")) return;
    const wanted = decodeURI(image.uri);
    const names = [
      basename(wanted),
      basename(wanted).replace(/_png(\.png)$/i, "$1"),
    ];
    const candidates = [
      join(dir, wanted),
      ...names.map((n) => join(dir, dirname(wanted), n)),
      ...textureDirs.flatMap((d) => names.map((n) => join(dir, d, n))),
    ];
    const found = candidates.find((c) => existsSync(c));
    if (!found) {
      warn(`${basename(file)}: texture "${wanted}" not found — dropped`);
      dropped.add(index);
      return;
    }
    resources[image.uri] = new Uint8Array(readFileSync(found));
  });

  if (dropped.size > 0) dropImages(json, dropped);
  return io.readJSON({ json, resources });
}

/** Removes images (and textures/material slots using them), reindexing references. */
function dropImages(json: JSONDocument["json"], dropped: Set<number>): void {
  const imageMap = new Map<number, number>();
  json.images = (json.images ?? []).filter((_, i) => {
    if (dropped.has(i)) return false;
    imageMap.set(i, imageMap.size);
    return true;
  });
  const deadTextures = new Set<number>();
  const textureMap = new Map<number, number>();
  json.textures = (json.textures ?? []).filter((t, i) => {
    if (t.source !== undefined && !imageMap.has(t.source)) {
      deadTextures.add(i);
      return false;
    }
    if (t.source !== undefined) t.source = imageMap.get(t.source);
    textureMap.set(i, textureMap.size);
    return true;
  });
  type TexRef = { index: number } | undefined;
  const fix = (holder: Record<string, unknown> | undefined, key: string) => {
    const ref = holder?.[key] as TexRef;
    if (!holder || !ref) return;
    if (deadTextures.has(ref.index)) delete holder[key];
    else ref.index = textureMap.get(ref.index) ?? ref.index;
  };
  for (const m of json.materials ?? []) {
    const mat = m as unknown as Record<
      string,
      Record<string, unknown> | undefined
    >;
    fix(mat.pbrMetallicRoughness, "baseColorTexture");
    fix(mat.pbrMetallicRoughness, "metallicRoughnessTexture");
    fix(mat as unknown as Record<string, unknown>, "normalTexture");
    fix(mat as unknown as Record<string, unknown>, "occlusionTexture");
    fix(mat as unknown as Record<string, unknown>, "emissiveTexture");
  }
}
