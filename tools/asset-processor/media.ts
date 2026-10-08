/**
 * Builds runtime media (sounds, icons, UI frames, particle textures) from the
 * `media` lists in art/third_party/<pack>/SOURCE.json.
 *
 *   pnpm media:build
 *
 * Output: apps/game-web/public/media/<id>.<hash>.<ext> + media.manifest.json
 * - Audio → AAC .m4a (plays on Safari/iOS and every desktop browser) when
 *   ffmpeg is on PATH; otherwise the original file is copied as-is.
 * - Icons / VFX → WebP resized to `size` (default 128 / 256).
 * - UI frames → lossless PNG at the original size (9-slice stays crisp).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { PackSourceSchema } from './source';

const repo = resolve(import.meta.dirname, '../..');
const thirdParty = join(repo, 'art/third_party');
const outDir = join(repo, 'apps/game-web/public/media');

interface MediaEntry {
  url: string;
  kind: 'audio' | 'image';
  bytes: number;
  width?: number;
  height?: number;
  packId: string;
  license: string;
  licenseVerified: boolean;
}

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const manifest: Record<string, MediaEntry> = {};
const errors: string[] = [];
const hashName = (id: string, bytes: Buffer, ext: string) =>
  `${id}.${createHash('sha256').update(bytes).digest('hex').slice(0, 10)}${ext}`;

for (const dir of readdirSync(thirdParty, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const packDir = join(thirdParty, dir.name);
  const sourcePath = join(packDir, 'SOURCE.json');
  if (!existsSync(sourcePath)) continue;
  const parsed = PackSourceSchema.safeParse(JSON.parse(readFileSync(sourcePath, 'utf8')));
  if (!parsed.success) {
    errors.push(`${dir.name}/SOURCE.json: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    continue;
  }
  const pack = parsed.data;
  if (pack.media.length === 0) continue;
  if (!existsSync(join(packDir, 'LICENSE.txt'))) {
    errors.push(`${pack.packId}: LICENSE.txt missing — pack skipped`);
    continue;
  }
  let built = 0;
  for (const m of pack.media) {
    const file = join(packDir, m.file);
    if (!existsSync(file)) {
      errors.push(`${pack.packId}/${m.id}: ${m.file} not found`);
      continue;
    }
    if (manifest[m.id]) {
      errors.push(`${m.id}: duplicate media id`);
      continue;
    }
    const ext = extname(file).toLowerCase();
    const base = {
      packId: pack.packId,
      license: pack.license,
      licenseVerified: pack.licenseVerified,
    };
    try {
      if (['.ogg', '.wav', '.mp3'].includes(ext)) {
        let bytes: Buffer;
        let outExt = ext;
        if (hasFfmpeg) {
          // The ipod (m4a) muxer needs a seekable output, so go through a temp file.
          const tmp = join(tmpdir(), `rpg-media-${process.pid}-${m.id}.m4a`);
          execFileSync('ffmpeg', [
            '-v',
            'error',
            '-y',
            '-i',
            file,
            '-c:a',
            'aac',
            '-b:a',
            '96k',
            tmp,
          ]);
          bytes = readFileSync(tmp);
          rmSync(tmp, { force: true });
          outExt = '.m4a';
        } else bytes = readFileSync(file);
        const name = hashName(m.id, bytes, outExt);
        writeFileSync(join(outDir, name), bytes);
        manifest[m.id] = {
          url: name,
          kind: 'audio',
          bytes: bytes.byteLength,
          ...base,
        };
      } else {
        const ui = pack.kind === 'ui';
        const size = m.size ?? (ui ? undefined : pack.kind === 'vfx' ? 256 : 128);
        let img = sharp(readFileSync(file));
        if (size)
          img = img.resize(size, size, {
            fit: 'inside',
            withoutEnlargement: true,
          });
        if (m.tint) {
          // Multiply each channel: white line art becomes exactly the tint colour
          // (sharp's tint() keeps luminance, so white would stay white).
          const [r, g, b] = [1, 3, 5].map(
            (i) => Number.parseInt(m.tint?.slice(i, i + 2) ?? 'ff', 16) / 255,
          );
          img = img.recomb([
            [r ?? 1, 0, 0],
            [0, g ?? 1, 0],
            [0, 0, b ?? 1],
          ]);
        }
        const { data, info } = await (ui
          ? img.png({ compressionLevel: 9 })
          : img.webp({ quality: 90 })
        ).toBuffer({
          resolveWithObject: true,
        });
        const name = hashName(m.id, data, ui ? '.png' : '.webp');
        writeFileSync(join(outDir, name), data);
        manifest[m.id] = {
          url: name,
          kind: 'image',
          bytes: data.byteLength,
          width: info.width,
          height: info.height,
          ...base,
        };
      }
      built++;
    } catch (err) {
      errors.push(`${pack.packId}/${m.id}: ${(err as Error).message}`);
    }
  }
  console.log(`${pack.packId}: ${built} media`);
}

writeFileSync(
  join(outDir, 'media.manifest.json'),
  `${JSON.stringify({ version: 1, media: manifest }, null, 2)}\n`,
);
// Human-readable catalog (committed) so designers can pick ids without building.
const rows = Object.entries(manifest)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([id, e]) => {
    const dims = e.width ? `${e.width}×${e.height}` : '—';
    return `| \`${id}\` | ${e.kind} | ${dims} | ${(e.bytes / 1024).toFixed(1)} KB | ${e.packId} |`;
  });
writeFileSync(
  join(repo, 'docs/media_catalog.md'),
  [
    '# Media catalog',
    '',
    'Sinh tự động bởi `pnpm media:build` từ `media` trong `art/third_party/*/SOURCE.json`. Không sửa tay.',
    'Dùng id trong game-data: `iconImage` (skill/item), `sfx` (skill, appearance). Validator kiểm tra id tồn tại.',
    '',
    '| id | loại | kích thước | dung lượng | pack |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n'),
);
const total = Object.values(manifest).reduce((s, e) => s + e.bytes, 0);
console.log(
  `\n${Object.keys(manifest).length} media → ${outDir} (${(total / 1024).toFixed(0)} KB${hasFfmpeg ? '' : ', audio copied without ffmpeg'})`,
);
for (const e of errors) console.error(`ERROR ${e}`);
process.exit(errors.length ? 1 : 0);
