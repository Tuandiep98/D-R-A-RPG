/**
 * Renders PWA icons from apps/game-web/public/favicon.svg.
 * Usage: pnpm pwa:icons   (outputs are committed; rerun when the logo changes)
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const pub = resolve(import.meta.dirname, '../../apps/game-web/public');
const svg = readFileSync(join(pub, 'favicon.svg'));
mkdirSync(join(pub, 'icons'), { recursive: true });

for (const size of [192, 512]) {
  await sharp(svg, { density: 512 })
    .resize(size, size)
    .png()
    .toFile(join(pub, 'icons', `icon-${size}.png`));
}
// Maskable: keep the logo inside the 80% safe zone on a solid background.
const inner = Math.round(512 * 0.7);
const logo = await sharp(svg, { density: 512 }).resize(inner, inner).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#1b2430' },
})
  .composite([{ input: logo, gravity: 'center' }])
  .png()
  .toFile(join(pub, 'icons', 'maskable-512.png'));
await sharp(svg, { density: 512 })
  .resize(180, 180)
  .png()
  .toFile(join(pub, 'icons', 'apple-touch-icon.png'));
console.log('icons → apps/game-web/public/icons');
