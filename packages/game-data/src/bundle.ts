import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import {
  type AppearanceDef,
  AppearanceDefSchema,
  type CharacterDef,
  CharacterDefSchema,
  type MapDef,
  MapDefSchema,
  type MonsterDef,
  MonsterDefSchema,
} from './schemas';

export interface ContentBundle {
  characters: ReadonlyMap<string, CharacterDef>;
  monsters: ReadonlyMap<string, MonsterDef>;
  maps: ReadonlyMap<string, MapDef>;
  appearances: ReadonlyMap<string, AppearanceDef>;
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
} as const;
type Folder = keyof typeof FOLDERS;

function folderOf(path: string): Folder | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const head = normalized.split('/')[0];
  return head && head in FOLDERS ? (head as Folder) : null;
}

/**
 * Parses and validates every content file, then checks cross references.
 * Throws ContentError listing all problems at once.
 */
export function buildContentBundle(files: readonly ContentFile[]): ContentBundle {
  const issues: ContentIssue[] = [];
  const out = {
    characters: new Map<string, CharacterDef>(),
    monsters: new Map<string, MonsterDef>(),
    maps: new Map<string, MapDef>(),
    appearances: new Map<string, AppearanceDef>(),
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
  const needAppearance = (owner: string, id: string | undefined) => {
    if (id && !bundle.appearances.has(id)) {
      issues.push({ path: owner, message: `unknown appearanceId "${id}"` });
    }
  };

  for (const c of bundle.characters.values()) needAppearance(`characters/${c.id}`, c.appearanceId);
  for (const m of bundle.monsters.values()) {
    needAppearance(`monsters/${m.id}`, m.appearanceId);
    if (m.ai.leashRadius < m.ai.aggroRadius) {
      issues.push({ path: `monsters/${m.id}`, message: 'ai.leashRadius must be >= ai.aggroRadius' });
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
    if (!inBounds(map.playerSpawn)) {
      issues.push({ path: owner, message: 'playerSpawn is outside bounds' });
    }
    const spawnIds = new Set<string>();
    for (const s of map.spawns) {
      if (spawnIds.has(s.id)) issues.push({ path: owner, message: `duplicate spawn id "${s.id}"` });
      spawnIds.add(s.id);
      if (!bundle.monsters.has(s.monsterId)) {
        issues.push({ path: `${owner}#spawns.${s.id}`, message: `unknown monsterId "${s.monsterId}"` });
      }
      if (!inBounds(s.position)) {
        issues.push({ path: `${owner}#spawns.${s.id}`, message: 'spawn position is outside bounds' });
      }
    }
    for (const chunk of map.chunks) {
      for (const inst of chunk.instances) needAppearance(`${owner}#${chunk.id}`, inst.appearanceId);
    }
  }
}
