/**
 * Lôi Hoàn Kiếm mưa kiếm smoke (sword-rain-fx.ts):
 *   pnpm dev              (in another terminal)
 *   pnpm smoke:rain [url]
 * Starts offline with each `?element=`, casts skill_thunder_arc and takes two
 * shots of the rain (mid-fall, landed) at 100%, plus Kim at 0% and 200%.
 * Screenshots → reports/rain/.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const CASES: [name: string, query: string, level: number][] = [
  ['kim', 'element=kim', 1],
  ['moc', 'element=moc', 1],
  ['loi', 'element=loi', 1],
  ['thuy', 'element=thuy', 1],
  ['bang', 'element=bang', 1],
  ['hoa', 'element=hoa', 1],
  ['tho', 'element=tho', 1],
  ['kim_0', 'element=kim', 0],
  ['kim_200', 'element=kim', 2],
  ['loi_low', 'element=loi&quality=low', 1],
];

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
const outDir = resolve(import.meta.dirname, '../../reports/rain');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
for (const [name, query, level] of CASES) {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 720 },
  });
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  const quality = query.includes('quality=') ? '' : 'quality=high&';
  await page.goto(`${base}/?debug&${quality}map=map_sandbox_01&${query}`);
  await page.waitForFunction(() => '__rpg' in window, null, {
    timeout: 60_000,
  });
  await page.waitForTimeout(3500);
  await page.evaluate((lvl) => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook
    const v = (window as any).__rpg.view;
    v.setElementAura(lvl);
    const cam = v.rig.camera;
    cam.beta = 0.95;
    cam.radius = 11;
    const p = v.sampled.get(v.join.playerId);
    v.send({
      type: 'CAST_SKILL',
      skillId: 'skill_thunder_arc',
      point: { x: p.x, z: p.z },
    });
  }, level);
  await page.waitForTimeout(420);
  await page.screenshot({ path: resolve(outDir, `${name}_a.png`) });
  await page.waitForTimeout(330);
  await page.screenshot({ path: resolve(outDir, `${name}_b.png`) });
  await page.close();
  console.log(`shot ${name}`);
}
await browser.close();
if (errors.length) {
  console.log(`FAIL page errors: ${errors.slice(0, 3).join(' | ')}`);
  process.exit(1);
}
console.log(`screenshots → ${outDir}`);
