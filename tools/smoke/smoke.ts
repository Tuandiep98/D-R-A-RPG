/**
 * Headless smoke test of the running dev server:
 *   pnpm dev            (in another terminal)
 *   pnpm smoke [url]    (default http://localhost:5173)
 * Uses the locally installed Chrome (no browser download). Checks boot, click-to-move,
 * click-to-attack and console errors; writes screenshots to reports/smoke/.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

interface DebugEntity {
  id: number;
  kind: string;
  action: string;
  hp: number;
  wx: number;
  wz: number;
  x: number;
  y: number;
}

const url = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
const outDir = resolve(import.meta.dirname, '../../reports/smoke');
mkdirSync(outDir, { recursive: true });

const failures: string[] = [];
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch({
  channel: process.argv.includes('--edge') ? 'msedge' : 'chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning' || m.type() === 'error')
    console.log(`  [console.${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(e.message));

const entities = () =>
  page.evaluate(() =>
    (
      window as unknown as { __rpg: { view: { debugEntities(): DebugEntity[] } } }
    ).__rpg.view.debugEntities(),
  );
const debugText = () =>
  page
    .locator('.debug')
    .innerText()
    .catch(() => '(no debug overlay)');

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => '__rpg' in window, null, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(outDir, '01_boot.png') });
  console.log(`  debug: ${(await debugText()).replace(/\n/g, ' | ')}`);

  let list = await entities();
  const player = list.find((e) => e.kind === 'player');
  check(!!player, 'player entity rendered');
  check(list.filter((e) => e.kind === 'monster').length === 5, '5 monsters rendered');
  if (!player) throw new Error('no player');

  // Click-to-move: click the ground below the player on screen (toward the camera).
  const start = { x: player.wx, z: player.wz };
  await page.mouse.click(player.x + 120, player.y + 60);
  await page.waitForTimeout(1500);
  list = await entities();
  const moved = list.find((e) => e.id === player.id);
  const dist = moved ? Math.hypot(moved.wx - start.x, moved.wz - start.z) : 0;
  check(dist > 1, `click-to-move moved the player (${dist.toFixed(2)} m)`);

  // Walk forward until a monster is on screen, then click-to-attack the nearest one.
  const onScreen = (e: DebugEntity) => e.x > 40 && e.x < 1240 && e.y > 90 && e.y < 660;
  const findTarget = (all: DebugEntity[]) => {
    const me = all.find((e) => e.id === player.id) ?? player;
    return all
      .filter((e) => e.kind === 'monster' && e.action !== 'dead' && onScreen(e))
      .sort(
        (a, b) => Math.hypot(a.wx - me.wx, a.wz - me.wz) - Math.hypot(b.wx - me.wx, b.wz - me.wz),
      )[0];
  };
  let target = findTarget(list);
  for (let i = 0; i < 6 && !target; i++) {
    await page.mouse.click(640, 230);
    await page.waitForTimeout(1500);
    list = await entities();
    target = findTarget(list);
  }
  check(!!target, 'found a monster to attack');
  if (target) {
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(500);
    const frame = await page
      .locator('.frame-enemy')
      .innerText()
      .catch(() => '');
    check(frame.length > 0, `target frame shown (${frame.replace(/\n/g, ' ')})`);
    await page.waitForTimeout(7000);
    await page.screenshot({ path: resolve(outDir, '02_combat.png') });
    list = await entities();
    const after = list.find((e) => e.id === target.id);
    check(
      !!after && (after.hp < target.hp || after.action === 'dead'),
      `monster took damage (hp ${target.hp} → ${after?.hp})`,
    );
  }

  // Camera rotate + zoom must not throw.
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(800, 330, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, '03_camera.png') });
  console.log(`  debug: ${(await debugText()).replace(/\n/g, ' | ')}`);

  check(errors.length === 0, `no console errors (${errors.length})`);
  for (const e of errors) console.log(`  error: ${e}`);
} catch (err) {
  failures.push(String(err));
  console.error(err);
  await page.screenshot({ path: resolve(outDir, 'failure.png') }).catch(() => {});
} finally {
  await browser.close();
}

console.log(failures.length === 0 ? '\nSMOKE OK' : `\nSMOKE FAILED (${failures.length})`);
console.log(`screenshots: ${outDir}`);
process.exit(failures.length === 0 ? 0 : 1);
