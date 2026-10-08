import { z } from 'zod';

/**
 * Runtime media (icons, UI frames, sounds) built by `pnpm media:build` into
 * public/media/. Missing manifest or ids are fine: callers fall back to emoji
 * icons, plain CSS frames and silence.
 */
const MediaManifestSchema = z.object({
  version: z.literal(1),
  media: z.record(
    z.string(),
    z
      .object({
        url: z.string(),
        kind: z.enum(['audio', 'image']),
        bytes: z.number(),
      })
      .loose(),
  ),
});

const base = `${import.meta.env.BASE_URL}media/`;
let urls = new Map<string, string>();
let loading: Promise<void> | null = null;

export function loadMedia(): Promise<void> {
  loading ??= fetch(`${base}media.manifest.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      const parsed = MediaManifestSchema.safeParse(json);
      if (!parsed.success) return;
      urls = new Map(Object.entries(parsed.data.media).map(([id, e]) => [id, base + e.url]));
      applyUiFrames();
    })
    .catch(() => {});
  return loading;
}

/** Absolute URL of a media id, or null when it is not built. */
export function mediaUrl(id: string | null | undefined): string | null {
  return id ? (urls.get(id) ?? null) : null;
}

/** Exposes UI frame images as CSS variables; styles.css uses them as 9-slice borders. */
function applyUiFrames(): void {
  const root = document.documentElement;
  for (const [id, cssVar] of [
    ['ui_border', '--ui-border'],
    ['ui_border_ornate', '--ui-border-ornate'],
    ['ui_border_double', '--ui-border-double'],
    ['ui_divider', '--ui-divider'],
  ] as const) {
    const url = urls.get(id);
    if (url) root.style.setProperty(cssVar, `url("${url}")`);
  }
  root.classList.toggle('ui-framed', urls.has('ui_border'));
}
