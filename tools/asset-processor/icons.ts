/**
 * Renders favicon and PWA icons from art/app-icon/sword.png (transparent source).
 * Usage: pnpm pwa:icons   (outputs are committed; rerun when the logo changes)
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const pub = resolve(import.meta.dirname, '../../apps/game-web/public');
const source = readFileSync(resolve(import.meta.dirname, '../../art/app-icon/sword.png'));
mkdirSync(join(pub, 'icons'), { recursive: true });

await sharp(source).resize(48, 48).png().toFile(join(pub, 'favicon-sword.png'));

for (const size of [192, 512]) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(join(pub, 'icons', `sword-${size}.png`));
}
// Maskable: keep the logo inside the 80% safe zone on a solid background.
const inner = Math.round(512 * 0.7);
const logo = await sharp(source).resize(inner, inner).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#1b2430' },
})
  .composite([{ input: logo, gravity: 'center' }])
  .png()
  .toFile(join(pub, 'icons', 'sword-maskable-512.png'));
await sharp(source)
  .resize(180, 180)
  .flatten({ background: '#1b2430' })
  .png()
  .toFile(join(pub, 'icons', 'sword-apple-touch.png'));
console.log('icons → apps/game-web/public/icons');
