/**
 * Map tour: boots each map offline, screenshots the scene, the minimap and the
 * full world map, and checks the minimap/world map wiring.
 *   pnpm dev                 (in another terminal)
 *   pnpm smoke:maps [url] [--map=<id>] [--phone]
 * Screenshots land in reports/maps/.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
const only = args.find((a) => a.startsWith('--map='))?.slice(6);
const phone = args.includes('--phone');
const outDir = resolve(import.meta.dirname, '../../reports/maps');
mkdirSync(outDir, { recursive: true });

const MAPS = only ? [only] : ['map_sandbox_01', 'map_forest_mechanism_01', 'map_golem_sanctum_01'];

const failures: string[] = [];
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch({
  channel: args.includes('--chromium') ? undefined : 'chrome',
  headless: true,
});
const viewport = phone ? { width: 844, height: 390 } : { width: 1280, height: 720 };

for (const mapId of MAPS) {
  const page = await browser.newPage({
    viewport,
    ...(phone ? { hasTouch: true, isMobile: true } : {}),
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}/?map=${mapId}&quality=low`);
  await page.waitForFunction(
    () => (window as unknown as { __rpg?: unknown }).__rpg !== undefined,
    undefined,
    { timeout: 60_000 },
  );
  await page.waitForSelector('.minimap canvas', { timeout: 20_000 });
  // Let assets stream in and the minimap draw a few frames.
  await page.waitForTimeout(6000);
  const tag = `${mapId}${phone ? '-phone' : ''}`;
  await page.screenshot({ path: resolve(outDir, `${tag}-scene.png`) });
  const mini = await page.$('.minimap');
  check(mini !== null, `${mapId}: minimap mounted`);
  if (mini) {
    await mini.screenshot({ path: resolve(outDir, `${tag}-minimap.png`) });
    const box = await mini.boundingBox();
    check(
      box !== null && box.x + box.width > viewport.width * 0.7 && box.y < 200,
      `${mapId}: minimap sits top-right`,
    );
    await mini.click();
    await page.waitForSelector('.world-map', { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(outDir, `${tag}-world.png`) });
    const lit = await page.$$eval('.wm-region.is-open', (n) => n.length);
    const dim = await page.$$eval('.wm-region.is-locked', (n) => n.length);
    check(lit >= 1, `${mapId}: ${lit} region(s) lit`);
    check(dim >= 1, `${mapId}: ${dim} region(s) dimmed`);
    const local = await page.$('.wm-tab-local');
    if (local) {
      await local.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: resolve(outDir, `${tag}-local.png`) });
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check((await page.$('.world-map')) === null, `${mapId}: Esc closes the world map`);
  }
  check(errors.length === 0, `${mapId}: no console errors ${errors.join(' | ')}`);
  await page.close();
}

await browser.close();
if (failures.length > 0) {
  console.log(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nmap tour OK');
