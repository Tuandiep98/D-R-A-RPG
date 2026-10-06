import type { MapDef } from '@rpg/game-data';
import { createNavQuery, initNavigation, type RecastNavQuery } from '@rpg/navigation';

/** Baked navmeshes from `pnpm nav:build`, bundled as URLs + hash sidecars. */
const binUrls = import.meta.glob('../../../game-data/nav/*.navmesh.bin', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const metas = import.meta.glob('../../../game-data/nav/*.navmesh.json', {
  import: 'default',
  eager: true,
}) as Record<string, { mapId: string; hash: string }>;

const cache = new Map<string, RecastNavQuery>();

/** NavProvider for LocalSimHost: baked data when fresh, runtime generation otherwise. */
export async function navFor(map: MapDef): Promise<RecastNavQuery> {
  const hit = cache.get(map.id);
  if (hit) return hit;
  await initNavigation();
  const meta = Object.values(metas).find((m) => m.mapId === map.id);
  const urlKey = Object.keys(binUrls).find((k) => k.endsWith(`/${map.id}.navmesh.bin`));
  let baked: { hash: string; data: Uint8Array } | null = null;
  if (meta && urlKey) {
    const res = await fetch(binUrls[urlKey] as string);
    if (res.ok) baked = { hash: meta.hash, data: new Uint8Array(await res.arrayBuffer()) };
  }
  const query = createNavQuery(map, baked);
  cache.set(map.id, query);
  return query;
}
