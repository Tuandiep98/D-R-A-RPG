import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import {
  type AppearanceDef,
  AppearanceDefSchema,
  type CharacterDef,
  CharacterDefSchema,
  type ItemDef,
  ItemDefSchema,
  type LootTableDef,
  LootTableDefSchema,
  type MapDef,
  MapDefSchema,
  type MonsterDef,
  MonsterDefSchema,
  type ProgressionDef,
  ProgressionDefSchema,
  type SkillDef,
  SkillDefSchema,
} from './schemas';

export interface ContentBundle {
  characters: ReadonlyMap<string, CharacterDef>;
  monsters: ReadonlyMap<string, MonsterDef>;
  maps: ReadonlyMap<string, MapDef>;
  appearances: ReadonlyMap<string, AppearanceDef>;
  skills: ReadonlyMap<string, SkillDef>;
  items: ReadonlyMap<string, ItemDef>;
  loot: ReadonlyMap<string, LootTableDef>;
  progression: ReadonlyMap<string, ProgressionDef>;
}

/** A raw content file. `path` is relative to the game-data root, e.g. `monsters/wolf_001.yaml`. */
export interface ContentFile {
  path: string;
  text: string;
}

export interface ContentIssue {
  path: string;
  message: string;
}

export class ContentError extends Error {
  constructor(readonly issues: ContentIssue[]) {
    super(
      `Invalid game data (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n` +
        issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n'),
    );
    this.name = 'ContentError';
  }
}

const FOLDERS = {
  characters: CharacterDefSchema,
  monsters: MonsterDefSchema,
  maps: MapDefSchema,
  appearances: AppearanceDefSchema,
  skills: SkillDefSchema,
  items: ItemDefSchema,
  loot: LootTableDefSchema,
  progression: ProgressionDefSchema,
} as const;
type Folder = keyof typeof FOLDERS;

function folderOf(path: string): Folder | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const head = normalized.split('/')[0];
  return head && head in FOLDERS ? (head as Folder) : null;
}

type MutableBundle = {
  [K in keyof ContentBundle]: Map<
    string,
    ContentBundle[K] extends ReadonlyMap<string, infer V> ? V : never
  >;
};

/**
 * Parses and validates every content file, then checks cross references.
 * Throws ContentError listing all problems at once.
 */
export function buildContentBundle(files: readonly ContentFile[]): ContentBundle {
  const issues: ContentIssue[] = [];
  const out: MutableBundle = {
    characters: new Map(),
    monsters: new Map(),
    maps: new Map(),
    appearances: new Map(),
    skills: new Map(),
    items: new Map(),
    loot: new Map(),
    progression: new Map(),
  };

  for (const file of files) {
    if (!/\.ya?ml$/i.test(file.path)) continue;
    const folder = folderOf(file.path);
    if (!folder) {
      issues.push({ path: file.path, message: 'file is not inside a known content folder' });
      continue;
    }
    let raw: unknown;
    try {
      raw = parseYaml(file.text);
    } catch (err) {
      issues.push({ path: file.path, message: `YAML parse error: ${(err as Error).message}` });
      continue;
    }
    const schema: z.ZodType = FOLDERS[folder];
    const result = schema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          path: `${file.path}${issue.path.length ? `#${issue.path.join('.')}` : ''}`,
          message: issue.message,
        });
      }
      continue;
    }
    const def = result.data as { id: string };
    const target = out[folder] as Map<string, unknown>;
    if (target.has(def.id)) {
      issues.push({ path: file.path, message: `duplicate ${folder} id "${def.id}"` });
      continue;
    }
    target.set(def.id, def);
  }

  checkReferences(out, issues);
  if (issues.length > 0) throw new ContentError(issues);
  return out;
}

function checkReferences(bundle: ContentBundle, issues: ContentIssue[]): void {
  const need =
    (map: ReadonlyMap<string, unknown>, kind: string) =>
    (owner: string, id: string | undefined) => {
      if (id && !map.has(id)) issues.push({ path: owner, message: `unknown ${kind} "${id}"` });
    };
  const needAppearance = need(bundle.appearances, 'appearanceId');
  const needSkill = need(bundle.skills, 'skillId');
  const needItem = need(bundle.items, 'itemId');
  const needLoot = need(bundle.loot, 'lootTable');
  const needProgression = need(bundle.progression, 'progressionId');
  const needMap = need(bundle.maps, 'mapId');

  for (const c of bundle.characters.values()) {
    const owner = `characters/${c.id}`;
    needAppearance(owner, c.appearanceId);
    needProgression(owner, c.progressionId);
    for (const s of c.skills) needSkill(owner, s);
    for (const it of c.starterItems) {
      needItem(owner, it.itemId);
      const def = bundle.items.get(it.itemId);
      if (it.equip && def && def.kind !== 'equipment') {
        issues.push({ path: owner, message: `starter item "${it.itemId}" is not equipment` });
      }
    }
  }
  for (const m of bundle.monsters.values()) {
    const owner = `monsters/${m.id}`;
    needAppearance(owner, m.appearanceId);
    for (const s of m.skills) needSkill(owner, s);
    for (const p of m.phases) for (const s of p.skills ?? []) needSkill(owner, s);
    for (const l of m.lootTable) needLoot(owner, l);
    if (m.ai.leashRadius < m.ai.aggroRadius) {
      issues.push({ path: owner, message: 'ai.leashRadius must be >= ai.aggroRadius' });
    }
  }
  for (const l of bundle.loot.values()) {
    for (const e of l.entries) needItem(`loot/${l.id}`, e.itemId);
    if (l.gold && l.gold.min > l.gold.max)
      issues.push({ path: `loot/${l.id}`, message: 'gold.min > gold.max' });
  }
  for (const it of bundle.items.values()) {
    needAppearance(`items/${it.id}`, it.appearanceId);
    if (it.kind === 'equipment' && it.maxStack !== 1) {
      issues.push({ path: `items/${it.id}`, message: 'equipment cannot stack' });
    }
  }
  for (const map of bundle.maps.values()) {
    const owner = `maps/${map.id}`;
    needAppearance(owner, map.ground.appearanceId);
    const inBounds = (p: { x: number; z: number }) =>
      p.x >= map.bounds.min.x &&
      p.x <= map.bounds.max.x &&
      p.z >= map.bounds.min.z &&
      p.z <= map.bounds.max.z;
    if (!inBounds(map.playerSpawn))
      issues.push({ path: owner, message: 'playerSpawn is outside bounds' });
    const ids = new Set<string>();
    const unique = (kind: string, id: string) => {
      const key = `${kind}:${id}`;
      if (ids.has(key)) issues.push({ path: owner, message: `duplicate ${kind} id "${id}"` });
      ids.add(key);
    };
    for (const s of map.spawns) {
      unique('spawn', s.id);
      need(bundle.monsters, 'monsterId')(`${owner}#spawns.${s.id}`, s.monsterId);
      if (!inBounds(s.position))
        issues.push({ path: `${owner}#spawns.${s.id}`, message: 'outside bounds' });
    }
    for (const p of map.portals) {
      unique('portal', p.id);
      needMap(`${owner}#portals.${p.id}`, p.targetMapId);
      if (!inBounds(p.position))
        issues.push({ path: `${owner}#portals.${p.id}`, message: 'outside bounds' });
      const target = bundle.maps.get(p.targetMapId);
      if (target && p.targetArrival && !target.arrivals.some((a) => a.id === p.targetArrival)) {
        issues.push({
          path: `${owner}#portals.${p.id}`,
          message: `unknown arrival "${p.targetArrival}" in ${p.targetMapId}`,
        });
      }
    }
    for (const a of map.arrivals) {
      unique('arrival', a.id);
      if (!inBounds(a.position))
        issues.push({ path: `${owner}#arrivals.${a.id}`, message: 'outside bounds' });
    }
    for (const chunk of map.chunks) {
      unique('chunk', chunk.id);
      for (const inst of chunk.instances) needAppearance(`${owner}#${chunk.id}`, inst.appearanceId);
    }
  }
}
