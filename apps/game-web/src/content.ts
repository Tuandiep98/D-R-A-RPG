import { buildContentBundle, type ContentBundle } from '@rpg/game-data';

/**
 * Bundles every YAML file under game-data/ at build time and validates it
 * with the shared schemas. Invalid data fails loudly on boot.
 */
const files = import.meta.glob('../../../game-data/**/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function loadContent(): ContentBundle {
  return buildContentBundle(
    Object.entries(files).map(([path, text]) => ({
      path: path.replace(/^.*game-data\//, ''),
      text,
    })),
  );
}
