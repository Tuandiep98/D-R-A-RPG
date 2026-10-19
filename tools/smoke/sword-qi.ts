/**
 * Lôi Kiếm Xuyên Tâm kiếm khí smoke (sword-qi-fx.ts):
 *   pnpm dev              (in another terminal)
 *   pnpm smoke:qi [url]
 * Starts offline with each `?element=`, casts skill_thunder_pierce across the
 * screen and takes two shots (mid-flight, after) at 100%, plus Kim at 0% / 200%,
 * Low, and one aimed at the nearest monster. Screenshots → reports/qi/.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const CASES: [name: string, query: string, level: number, aimMonster?: boolean][] = [
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
  ['loi_hit', 'element=loi', 1, true],
];

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
const outDir = resolve(import.meta.dirname, '../../reports/qi');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
for (const [name, query, level, aimMonster] of CASES) {
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
  await page.evaluate(
    ([lvl, monster]) => {
      // biome-ignore lint/suspicious/noExplicitAny: debug hook
      const v = (window as any).__rpg.view;
      v.setElementAura(lvl);
      const cam = v.rig.camera;
      cam.beta = 0.95;
      cam.radius = 13;
      const p = v.sampled.get(v.join.playerId);
      // Across the screen: perpendicular to the camera's view on the ground.
      const fx = cam.target.x - cam.position.x;
      const fz = cam.target.z - cam.position.z;
      const len = Math.hypot(fx, fz) || 1;
      let point = { x: p.x + (fz / len) * 8, z: p.z - (fx / len) * 8 };
      if (monster) {
        type Sampled = { x: number; z: number; state: { kind: string } };
        const mobs = ([...v.sampled.values()] as Sampled[]).filter(
          (e) => e.state.kind === 'monster',
        );
        mobs.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        const m = mobs[0];
        // Inside the skill's range, through the monster and beyond.
        if (m) {
          const d = Math.hypot(m.x - p.x, m.z - p.z) || 1;
          point = { x: p.x + ((m.x - p.x) / d) * 9, z: p.z + ((m.z - p.z) / d) * 9 };
        }
      }
      v.send({ type: 'CAST_SKILL', skillId: 'skill_thunder_pierce', point });
    },
    [level, !!aimMonster] as const,
  );
  await page.waitForTimeout(560);
  await page.screenshot({ path: resolve(outDir, `${name}_a.png`) });
  await page.waitForTimeout(450);
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
