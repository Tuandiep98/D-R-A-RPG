/**
 * Ngũ hành aura smoke (element-aura.ts):
 *   pnpm dev              (in another terminal)
 *   pnpm smoke:aura [url]
 * Starts offline with each `?element=` (5 elements + Lôi/Băng) and a couple of
 * bare-handed kits, and takes a close-up of the weapon hand at 100%. Screenshots → reports/aura/.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const CASES: [name: string, query: string][] = [
  // Default character (iron sword) with each bản mệnh / expression.
  ['kim', 'element=kim'],
  ['moc', 'element=moc'],
  ['loi', 'element=loi'],
  ['thuy', 'element=thuy'],
  ['bang', 'element=bang'],
  ['hoa', 'element=hoa'],
  ['tho', 'element=tho'],
  // Bare hands (test kits without a weapon).
  ['kim_fist', 'char=player_anh'],
  ['hoa_fist', 'char=player_tran'],
];

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
const outDir = resolve(import.meta.dirname, '../../reports/aura');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
for (const [name, query] of CASES) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  await page.goto(`${base}/?debug&quality=high&map=map_sandbox_01${query ? `&${query}` : ''}`);
  await page.waitForFunction(() => '__rpg' in window, null, { timeout: 60_000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: debug hook
    const v = (window as any).__rpg.view;
    v.setElementAura(1);
    const rig = v.rig;
    const cam = rig.camera;
    cam.lowerRadiusLimit = 0.5;
    cam.lowerBetaLimit = 0.1;
    rig.opts.minRadius = 0.5;
    rig.opts.minBeta = 0.1;
    rig.opts.maxBeta = 1.55;
    // Front-right of the player (weapon hand).
    const yaw = v.views.get(v.join.playerId)?.root.rotation.y ?? 0;
    const dx = Math.sin(yaw) * 0.75 + Math.cos(yaw) * 0.66;
    const dz = Math.cos(yaw) * 0.75 - Math.sin(yaw) * 0.66;
    cam.alpha = Math.atan2(dz, dx);
    cam.beta = 1.2;
    cam.radius = 2.6;
    cam.targetScreenOffset.y = 0.45;
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(outDir, `${name}.png`) });
  await page.close();
  console.log(`shot ${name}`);
}
await browser.close();
if (errors.length) {
  console.log(`FAIL page errors: ${errors.slice(0, 3).join(' | ')}`);
  process.exit(1);
}
console.log(`screenshots → ${outDir}`);
