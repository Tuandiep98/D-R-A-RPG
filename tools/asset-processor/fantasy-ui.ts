/**
 * Bootstrap HUD frames for the Fantasy Glass style (docs/game-ui-style.md):
 * recolours Kenney Fantasy UI Borders sprites into apps/game-web/src/assets/fantasy-ui.
 *
 *   pnpm assets:fantasy-ui
 *
 * The sources are 48×48 indexed PNGs drawn on a 2 px grid with 16 px corners.
 * Only the PLTE/tRNS chunks change, so pixels stay identical and the 9-slice
 * stays crisp when CSS draws it at 8/16/32 px. No image library needed.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { crc32 } from 'node:zlib';

const repo = resolve(import.meta.dirname, '../..');
const src = join(repo, 'art/third_party/kenney_fantasy_ui_borders/originals');
const outDir = join(repo, 'apps/game-web/src/assets/fantasy-ui');

/** [opaque line art, semi-transparent fill]; one swatch recolours both. */
type Swatch = { rgb: string; alpha: number };

const outputs: { out: string; file: string; swatches?: Swatch[] }[] = [
  // Window/HUD panel: dark fretwork and fill; the 2 px gap between them shows the blurred scene.
  {
    out: 'panel.png',
    file: 'PNG/Default/Panel/panel-000.png',
    swatches: [{ rgb: '#080d11', alpha: 0.86 }],
  },
  // Item/skill slot: grey frame, translucent grey well.
  {
    out: 'slot.png',
    file: 'PNG/Default/Transparent center/panel-transparent-center-011.png',
    swatches: [
      { rgb: '#6c767b', alpha: 1 },
      { rgb: '#4a555b', alpha: 0.55 },
    ],
  },
  // Selected slot: the untouched white sprite.
  {
    out: 'slot-active.png',
    file: 'PNG/Default/Transparent center/panel-transparent-center-011.png',
  },
  // Secondary button: light grey outline over a dark well.
  {
    out: 'button.png',
    file: 'PNG/Default/Transparent center/panel-transparent-center-009.png',
    swatches: [
      { rgb: '#a9b1b4', alpha: 1 },
      { rgb: '#0a1015', alpha: 0.6 },
    ],
  },
  // Primary button / active segment: solid white plate, dark label.
  { out: 'button-primary.png', file: 'PNG/Default/Panel/panel-009.png' },
  // Zone banner rule (96×22, fades to the left; mirrored on the right side).
  {
    out: 'divider.png',
    file: 'PNG/Default/Divider Fade/divider-fade-000.png',
  },
];

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0);
  return Buffer.concat([head, data, crc]);
}

function recolour(png: Buffer, swatches: Swatch[]): Buffer {
  const parts: Buffer[] = [png.subarray(0, 8)];
  let plte: Buffer | undefined;
  let trns = Buffer.alloc(0);
  for (let i = 8; i < png.length; ) {
    const len = png.readUInt32BE(i);
    const type = png.toString('latin1', i + 4, i + 8);
    const data = png.subarray(i + 8, i + 8 + len);
    i += 12 + len;
    if (type === 'IHDR' && data[9] !== 3) throw new Error('not indexed PNG');
    if (type === 'PLTE') plte = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT' && plte) {
      const alpha = Buffer.alloc(plte.length / 3, 255);
      trns.copy(alpha);
      for (let p = 0; p < alpha.length; p++) {
        if (alpha[p] === 0) continue;
        const sw = alpha[p] === 255 ? swatches[0] : swatches.at(-1);
        if (!sw) continue;
        for (let c = 0; c < 3; c++) {
          plte[p * 3 + c] = Number.parseInt(sw.rgb.slice(1 + c * 2, 3 + c * 2), 16);
        }
        alpha[p] = Math.round(sw.alpha * 255);
      }
      parts.push(chunk('PLTE', plte), chunk('tRNS', alpha));
      plte = undefined;
      parts.push(chunk(type, data));
    } else parts.push(chunk(type, data));
  }
  return Buffer.concat(parts);
}

mkdirSync(outDir, { recursive: true });
for (const o of outputs) {
  const png = readFileSync(join(src, o.file));
  writeFileSync(join(outDir, o.out), o.swatches ? recolour(png, o.swatches) : png);
  console.log(`${o.out} ← ${o.file}`);
}
