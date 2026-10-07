import type { Document, Node, Scene } from "@gltf-transform/core";
import { mergeDocuments, unpartition } from "@gltf-transform/functions";

/**
 * Build-time grafting of skinned parts (head, hair) onto an outfit that shares
 * the same skeleton (Quaternius UBC + Modular Outfits: 65 joints, identical
 * names and head/neck bind pose). Modular outfits ship without a head.
 */

/**
 * Keeps only triangles whose three vertices are mostly weighted to one of
 * `joints`, e.g. the head of a full-body base worn under an outfit (the rest
 * of the body would clip through the clothes).
 */
export function keepTrianglesByJoints(
  doc: Document,
  joints: readonly string[],
): void {
  const keep = new Set(joints);
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    const skin = node.getSkin();
    if (!mesh || !skin) continue;
    const names = skin.listJoints().map((j) => j.getName());
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const jointAttr = prim.getAttribute("JOINTS_0");
      const weightAttr = prim.getAttribute("WEIGHTS_0");
      const src = indices?.getArray();
      if (!indices || !src || !jointAttr || !weightAttr) continue;
      const kept = new Uint8Array(jointAttr.getCount());
      const j: number[] = [];
      const w: number[] = [];
      for (let v = 0; v < kept.length; v++) {
        jointAttr.getElement(v, j);
        weightAttr.getElement(v, w);
        let best = 0;
        for (let k = 1; k < 4; k++) if ((w[k] ?? 0) > (w[best] ?? 0)) best = k;
        kept[v] = keep.has(names[j[best] ?? 0] ?? "") ? 1 : 0;
      }
      const out: number[] = [];
      for (let t = 0; t + 2 < src.length; t += 3) {
        const a = src[t] ?? 0;
        const b = src[t + 1] ?? 0;
        const c = src[t + 2] ?? 0;
        if (kept[a] && kept[b] && kept[c]) out.push(a, b, c);
      }
      if (out.length === 0) prim.dispose();
      else
        indices.setArray(
          src instanceof Uint16Array
            ? new Uint16Array(out)
            : new Uint32Array(out),
        );
    }
    if (mesh.listPrimitives().length === 0) {
      node.setMesh(null);
      mesh.dispose();
    }
  }
}

/** Removes meshes by mesh or node name (e.g. a hood when hair is grafted). */
export function dropMeshes(doc: Document, names: readonly string[]): void {
  const drop = new Set(names);
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh && (drop.has(mesh.getName()) || drop.has(node.getName()))) {
      node.setMesh(null);
      mesh.dispose();
    }
  }
}

/**
 * Merges each part into `target` and rebinds its skins to the target's joints
 * by name; the part's own armature is discarded. Throws if a joint is missing.
 */
export async function graftParts(
  target: Document,
  parts: readonly Document[],
): Promise<void> {
  const scene = target.getRoot().listScenes()[0];
  if (!scene) throw new Error("target has no scene");
  const armature =
    scene.listChildren().find((n) => n.listChildren().length > 0) ?? null;
  // Snapshot the target's joints before merging so part nodes never shadow them.
  const joints = new Map<string, Node>();
  for (const n of target.getRoot().listNodes())
    if (!joints.has(n.getName())) joints.set(n.getName(), n);

  for (const part of parts) {
    const partScenes = part.getRoot().listScenes();
    const map = mergeDocuments(target, part);
    for (const partScene of partScenes) {
      const merged = map.get(partScene) as Scene | undefined;
      if (!merged) continue;
      const meshNodes: Node[] = [];
      merged.traverse((n) => {
        if (n.getMesh()) meshNodes.push(n);
      });
      for (const n of meshNodes) {
        const skin = n.getSkin();
        if (skin) {
          const rebound = skin.listJoints().map((j) => {
            const t = joints.get(j.getName());
            if (!t)
              throw new Error(
                `joint "${j.getName()}" missing in target skeleton`,
              );
            return t;
          });
          for (const j of skin.listJoints()) skin.removeJoint(j);
          for (const t of rebound) skin.addJoint(t);
          const skeleton = skin.getSkeleton();
          if (skeleton)
            skin.setSkeleton(joints.get(skeleton.getName()) ?? null);
        }
        n.getParentNode()?.removeChild(n);
        (armature ?? scene).addChild(n);
      }
      const leftovers: Node[] = [];
      merged.traverse((n) => {
        leftovers.push(n);
      });
      for (const n of leftovers.reverse()) n.dispose();
      merged.dispose();
    }
  }
  await target.transform(unpartition());
}
