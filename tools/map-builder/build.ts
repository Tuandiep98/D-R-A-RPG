/**
 * maps/source/<id>.layout.yaml → game-data/maps/<id>.yaml
 *
 * A layout is hand-authored gameplay structure (paths, zones, camps, portals,
 * landmarks). Decoration is scattered with a seeded RNG while keeping paths
 * and clearings walkable (assets plan §8.2–8.4: blockout first, then dress,
 * seeds stored so the result is reproducible). Instances are assigned to
 * streaming chunks by position.
 *
 * Usage: pnpm maps:build
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Rng } from "@rpg/game-core";
import { MapDefSchema } from "@rpg/game-data";
import { Document, isMap, isSeq, parse } from "yaml";
import { z } from "zod";

const repo = resolve(import.meta.dirname, "../..");
const sourceDir = join(repo, "maps/source");
const outDir = join(repo, "game-data/maps");

const P = z.strictObject({ x: z.number(), z: z.number() });
const P3 = z.strictObject({
  x: z.number(),
  y: z.number().default(0),
  z: z.number(),
});
const Circle = z.strictObject({ center: P, radius: z.number().positive() });
const PlacedAsset = z.strictObject({
  appearanceId: z.string(),
  position: P3,
  rotationY: z.number().default(0),
  scale: z.number().positive().default(1),
  colliderRadius: z.number().positive().optional(),
});
const PrefabMember = z.strictObject({
  appearanceId: z.string(),
  offset: P3,
  rotationY: z.number().default(0),
  scale: z.number().positive().default(1),
  colliderRadius: z.number().positive().optional(),
});

const LayoutSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  seed: z.number().int(),
  bounds: z.strictObject({ min: P, max: P }),
  chunkSize: z.number().positive().default(32),
  ground: z.strictObject({
    color: z.string(),
    /**
     * Ground painting: noise variation plus `pathColor` painted along every
     * path and `patches` (e.g. camp floors). See GroundPaintSchema.
     */
    paint: z
      .strictObject({
        variation: z.array(z.string()).default([]),
        noiseScale: z.number().positive().optional(),
        noiseAmount: z.number().min(0).max(1).optional(),
        pathColor: z.string().optional(),
        /** Painted road width as a fraction of the path's walkable width. */
        pathWidthScale: z.number().positive().default(0.7),
        patches: z
          .array(
            z.strictObject({
              center: P,
              radius: z.number().positive(),
              color: z.string(),
              edge: z.number().nonnegative().optional(),
            }),
          )
          .default([]),
      })
      .optional(),
  }),
  playerSpawn: P,
  arrivals: z
    .array(z.strictObject({ id: z.string(), position: P }))
    .default([]),
  /** Polylines kept clear of blocking decoration. */
  paths: z
    .array(
      z.strictObject({
        points: z.array(P).min(2),
        width: z.number().positive(),
      }),
    )
    .default([]),
  /** Circles kept clear of all decoration (camps, arenas, town). */
  clearings: z.array(Circle).default([]),
  zones: z.array(z.unknown()).default([]),
  spawns: z.array(z.unknown()).default([]),
  portals: z.array(z.unknown()).default([]),
  npcs: z.array(z.unknown()).default([]),
  instance: z.enum(["shared", "solo"]).default("shared"),
  /** Explicit hand-placed instances. */
  landmarks: z.array(PlacedAsset).default([]),
  /** Repeating visual floor tiles. They never affect navigation. */
  groundCovers: z
    .array(
      z.strictObject({
        appearanceIds: z.array(z.string()).min(1),
        min: P,
        max: P,
        tileSize: z.number().positive(),
        y: z.number().default(0.01),
        rotationY: z.number().default(0),
        scale: z.number().positive().default(1),
      }),
    )
    .default([]),
  /** Reusable groups of modular pieces, expanded before chunk assignment. */
  prefabs: z
    .array(
      z.strictObject({ id: z.string(), members: z.array(PrefabMember).min(1) }),
    )
    .default([]),
  prefabPlacements: z
    .array(
      z.strictObject({
        prefabId: z.string(),
        position: P,
        rotationY: z.number().default(0),
        scale: z.number().positive().default(1),
      }),
    )
    .default([]),
  /** Rings of instances, e.g. arena walls; `gapAngles` (radians) leave entrances. */
  rings: z
    .array(
      z.strictObject({
        appearanceId: z.string(),
        center: P,
        radius: z.number().positive(),
        count: z.number().int().positive(),
        scale: z.number().positive().default(1),
        colliderRadius: z.number().positive().optional(),
        gapAngles: z.array(z.number()).default([]),
        gapWidth: z.number().default(0.5),
      }),
    )
    .default([]),
  scatter: z
    .array(
      z.strictObject({
        appearanceId: z.string(),
        count: z.number().int().nonnegative(),
        minSpacing: z.number().positive(),
        scale: z
          .tuple([z.number().positive(), z.number().positive()])
          .default([0.9, 1.15]),
        colliderRadius: z.number().positive().optional(),
        /** Decoration without a collider may sit on paths (grass, bushes). */
        allowOnPath: z.boolean().default(false),
      }),
    )
    .default([]),
});
type Layout = z.infer<typeof LayoutSchema>;

interface Placed {
  appearanceId: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
  colliderRadius?: number;
}

const distToSegment = (
  p: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = dx * dx + dz * dz;
  const t =
    len === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
};

function onPath(
  layout: Layout,
  p: { x: number; z: number },
  margin: number,
): boolean {
  return layout.paths.some((path) =>
    path.points.some((a, i) => {
      const b = path.points[i + 1];
      return b ? distToSegment(p, a, b) < path.width / 2 + margin : false;
    }),
  );
}

const inClearing = (
  layout: Layout,
  p: { x: number; z: number },
  margin: number,
) =>
  layout.clearings.some(
    (c) => Math.hypot(p.x - c.center.x, p.z - c.center.z) < c.radius + margin,
  );

/** Expands layout painting into the map's GroundPaint (paths become strokes). */
function groundOf(layout: Layout) {
  const { color, paint } = layout.ground;
  if (!paint) return { color };
  return {
    color,
    paint: {
      variation: paint.variation,
      ...(paint.noiseScale !== undefined
        ? { noiseScale: paint.noiseScale }
        : {}),
      ...(paint.noiseAmount !== undefined
        ? { noiseAmount: paint.noiseAmount }
        : {}),
      strokes: paint.pathColor
        ? layout.paths.map((path) => ({
            points: path.points,
            width: path.width * paint.pathWidthScale,
            color: paint.pathColor as string,
          }))
        : [],
      patches: paint.patches,
    },
  };
}

function build(layout: Layout) {
  const rng = new Rng(layout.seed);
  const placed: Placed[] = [];
  const r2 = (n: number) => Math.round(n * 100) / 100;

  for (const l of layout.landmarks) {
    placed.push({
      appearanceId: l.appearanceId,
      x: l.position.x,
      y: l.position.y,
      z: l.position.z,
      rotationY: l.rotationY,
      scale: l.scale,
      colliderRadius: l.colliderRadius,
    });
  }
  const prefabs = new Map(layout.prefabs.map((prefab) => [prefab.id, prefab]));
  for (const placement of layout.prefabPlacements) {
    const prefab = prefabs.get(placement.prefabId);
    if (!prefab)
      throw new Error(`${layout.id}: unknown prefab ${placement.prefabId}`);
    const cos = Math.cos(placement.rotationY);
    const sin = Math.sin(placement.rotationY);
    for (const member of prefab.members) {
      const ox = member.offset.x * placement.scale;
      const oz = member.offset.z * placement.scale;
      placed.push({
        appearanceId: member.appearanceId,
        x: placement.position.x + ox * cos + oz * sin,
        y: member.offset.y * placement.scale,
        z: placement.position.z - ox * sin + oz * cos,
        rotationY: placement.rotationY + member.rotationY,
        scale: placement.scale * member.scale,
        colliderRadius: member.colliderRadius,
      });
    }
  }
  for (const ring of layout.rings) {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2;
      const gap = ring.gapAngles.some(
        (g) =>
          Math.abs(Math.atan2(Math.sin(angle - g), Math.cos(angle - g))) <
          ring.gapWidth,
      );
      if (gap) continue;
      placed.push({
        appearanceId: ring.appearanceId,
        x: ring.center.x + Math.cos(angle) * ring.radius,
        y: 0,
        z: ring.center.z + Math.sin(angle) * ring.radius,
        rotationY: rng.range(0, Math.PI * 2),
        scale: ring.scale * rng.range(0.9, 1.1),
        colliderRadius: ring.colliderRadius,
      });
    }
  }

  const { min, max } = layout.bounds;
  for (const s of layout.scatter) {
    let made = 0;
    for (let attempt = 0; attempt < s.count * 60 && made < s.count; attempt++) {
      const p = {
        x: rng.range(min.x + 1.5, max.x - 1.5),
        z: rng.range(min.z + 1.5, max.z - 1.5),
      };
      const margin = (s.colliderRadius ?? 0.3) + 0.6;
      if (inClearing(layout, p, margin)) continue;
      if (!s.allowOnPath && onPath(layout, p, margin)) continue;
      if (placed.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < s.minSpacing))
        continue;
      const scale = rng.range(s.scale[0], s.scale[1]);
      placed.push({
        appearanceId: s.appearanceId,
        x: p.x,
        y: 0.01,
        z: p.z,
        rotationY: rng.range(0, Math.PI * 2),
        scale,
        colliderRadius: s.colliderRadius,
      });
      made++;
    }
    if (made < s.count)
      console.warn(
        `  ${layout.id}: only placed ${made}/${s.count} ${s.appearanceId}`,
      );
  }

  // Add visual floor last so it does not consume scatter spacing.
  for (const cover of layout.groundCovers) {
    let tile = 0;
    for (
      let z = cover.min.z + cover.tileSize / 2;
      z < cover.max.z;
      z += cover.tileSize
    ) {
      for (
        let x = cover.min.x + cover.tileSize / 2;
        x < cover.max.x;
        x += cover.tileSize
      ) {
        placed.push({
          appearanceId:
            cover.appearanceIds[tile % cover.appearanceIds.length] ??
            cover.appearanceIds[0]!,
          x,
          y: cover.y,
          z,
          rotationY: cover.rotationY,
          scale: cover.scale,
        });
        tile++;
      }
    }
  }

  const chunks = new Map<string, unknown[]>();
  const cx = Math.ceil((max.x - min.x) / layout.chunkSize);
  const cz = Math.ceil((max.z - min.z) / layout.chunkSize);
  for (let i = 0; i < cx; i++)
    for (let j = 0; j < cz; j++) chunks.set(`chunk_${i}_${j}`, []);
  for (const p of placed) {
    const i = Math.min(cx - 1, Math.floor((p.x - min.x) / layout.chunkSize));
    const j = Math.min(cz - 1, Math.floor((p.z - min.z) / layout.chunkSize));
    chunks.get(`chunk_${i}_${j}`)?.push({
      appearanceId: p.appearanceId,
      position: [r2(p.x), r2(p.y), r2(p.z)],
      rotationY: r2(p.rotationY),
      scale: r2(p.scale),
      ...(p.colliderRadius !== undefined
        ? { colliderRadius: p.colliderRadius }
        : {}),
    });
  }

  const map = {
    id: layout.id,
    name: layout.name,
    schemaVersion: 1,
    seed: layout.seed,
    bounds: layout.bounds,
    chunkSize: layout.chunkSize,
    ground: groundOf(layout),
    playerSpawn: layout.playerSpawn,
    arrivals: layout.arrivals,
    zones: layout.zones,
    spawns: layout.spawns,
    portals: layout.portals,
    npcs: layout.npcs,
    instance: layout.instance,
    chunks: [...chunks].map(([id, instances]) => ({ id, instances })),
  };
  MapDefSchema.parse(map); // fail fast; full cross-ref validation runs in pnpm validate:data
  return { map, count: placed.length };
}

for (const file of readdirSync(sourceDir).filter((f) =>
  f.endsWith(".layout.yaml"),
)) {
  const layout = LayoutSchema.parse(
    parse(readFileSync(join(sourceDir, file), "utf8")),
  );
  const { map, count } = build(layout);
  const header = `# GENERATED by \`pnpm maps:build\` from maps/source/${file} — edit the layout, not this file.\n`;
  writeFileSync(join(outDir, `${layout.id}.yaml`), header + toCompactYaml(map));
  console.log(
    `  ${layout.id}: ${count} instances in ${map.chunks.length} chunks`,
  );
}

/** One line per instance/spawn/zone keeps generated diffs readable. */
function toCompactYaml(value: unknown): string {
  const doc = new Document(value);
  const flowItems = (path: string[]) => {
    const node = doc.getIn(path, true);
    if (isSeq(node))
      for (const item of node.items) if (isMap(item)) item.flow = true;
  };
  for (const key of ["spawns", "portals", "zones", "arrivals", "npcs"])
    flowItems([key]);
  const chunks = doc.get("chunks", true);
  if (isSeq(chunks)) {
    chunks.items.forEach((_, i) => {
      flowItems(["chunks", String(i), "instances"]);
    });
  }
  return doc.toString({ lineWidth: 0 });
}
