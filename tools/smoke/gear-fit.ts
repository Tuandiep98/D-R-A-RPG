/**
 * Close-up screenshots of the player for fitting weapon sockets/offsets.
 *   pnpm smoke:gear [url] [--real | --player=<appearanceId>]
 *   (default draws the KayKit mannequin; --real uses the player model)
 * Writes reports/smoke/gear_<angle>.png (front, side, back, top-down game view).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
const outDir = resolve(import.meta.dirname, '../../reports/smoke');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: args.includes('--chromium') ? undefined : 'chrome',
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`${m.type()}: ${m.text()}`);
});
const player = args.find((a) => a.startsWith('--player='))?.slice('--player='.length);
const look = player ? `&player=${player}` : args.includes('--real') ? '' : '&mannequin';
await page.goto(`${base}/?debug&quality=high${look}`);
await page.waitForFunction(() => '__rpg' in window, null, { timeout: 60_000 });
await page.waitForTimeout(6000); // models + clips finish loading

const shots: [string, number, number, number][] = [
  // name, alpha offset from player facing, beta, radius
  ['front', Math.PI / 2, 1.3, 3.6],
  ['side', 0, 1.3, 3.6],
  ['back', -Math.PI / 2, 1.3, 3.6],
  ['game', Math.PI / 2 + 0.6, 0.85, 9],
];
for (const [name, alpha, beta, radius] of shots) {
  await page.evaluate(
    ([a, b, r]) => {
      // biome-ignore lint/suspicious/noExplicitAny: debug hook
      const rpg = (window as any).__rpg;
      const cam = rpg.view.rig.camera;
      cam.lowerRadiusLimit = 0.5;
      cam.lowerBetaLimit = 0.1;
      cam.upperBetaLimit = 1.55;
      rpg.view.rig.opts.minRadius = 0.5;
      rpg.view.rig.opts.minBeta = 0.1;
      rpg.view.rig.opts.maxBeta = 1.55;
      cam.alpha = a;
      cam.beta = b;
      cam.radius = r;
      cam.targetScreenOffset.y = r < 5 ? 0.45 : 0;
    },
    [alpha, beta, radius] as const,
  );
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(outDir, `gear_${name}.png`) });
}
console.log(`screenshots → ${outDir}/gear_*.png`);
await browser.close();
