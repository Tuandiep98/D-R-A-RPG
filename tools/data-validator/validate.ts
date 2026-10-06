/**
 * Validates every YAML file under game-data/ with the shared Zod schemas and
 * cross-reference checks. Exit code 1 on any problem (used by CI).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { buildContentBundle, ContentError } from '@rpg/game-data';

const root = resolve(import.meta.dirname, '../../game-data');

const files = (readdirSync(root, { recursive: true }) as string[])
  .filter((p) => /\.ya?ml$/i.test(p))
  .map((p) => ({
    path: relative(root, join(root, p)).replace(/\\/g, '/'),
    text: readFileSync(join(root, p), 'utf8'),
  }));

try {
  const bundle = buildContentBundle(files);
  console.log(
    `game-data OK: ${bundle.characters.size} characters, ${bundle.monsters.size} monsters, ` +
      `${bundle.maps.size} maps, ${bundle.appearances.size} appearances (${files.length} files)`,
  );
} catch (err) {
  if (err instanceof ContentError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
