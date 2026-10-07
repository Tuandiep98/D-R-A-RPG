/**
 * Control-scheme smoke test against a running dev server:
 *   pnpm dev                     (in another terminal)
 *   pnpm smoke:controls [url]    (default http://localhost:5173)
 * Desktop: WASD walks relative to the camera and stops on release.
 * Phone (portrait + landscape, real touch events via CDP): the touch HUD
 * appears, dragging the joystick walks, releasing stops, the attack button
 * works. Screenshots go to reports/smoke/controls_*.png.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Browser, chromium, type Page } from 'playwright-core';

interface DebugEntity {
  id: number;
  kind: string;
  action: string;
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

const player = async (page: Page) =>
  (
    await page.evaluate(() =>
      (
        window as unknown as { __rpg: { view: { debugEntities(): DebugEntity[] } } }
      ).__rpg.view.debugEntities(),
    )
  ).find((e) => e.kind === 'player');

async function boot(page: Page, errors: string[]): Promise<void> {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  // Fresh settings each run (auto scheme), and no fullscreen prompts in headless.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('rpg.controls', JSON.stringify({ autoFullscreen: false }));
    } catch {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => '__rpg' in window, null, { timeout: 60_000 });
  await page.waitForTimeout(2500);
}

async function desktop(browser: Browser): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  await boot(page, errors);
  const scheme = await page.evaluate(() => document.documentElement.dataset.controls);
  check(scheme === 'desktop', `desktop: scheme is desktop (${scheme})`);
  check((await page.locator('.joystick-zone').count()) === 0, 'desktop: no joystick');
  check(await page.locator('.help').isVisible(), 'desktop: key help visible');
  check(
    (await page.locator('.actionbar .skills .skill').count()) === 4,
    'desktop: four equal skill slots',
  );

  await page.locator('canvas').focus();
  const a = await player(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  const b = await player(page);
  check(b?.action === 'move', `desktop: holding W runs (${b?.action})`);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);
  const c = await player(page);
  await page.waitForTimeout(600);
  const d = await player(page);
  if (a && b && c && d) {
    const walked = Math.hypot(b.wx - a.wx, b.wz - a.wz);
    check(walked > 2, `desktop: W walked ${walked.toFixed(2)} m in 1 s`);
    // W = away from the camera = up the screen.
    check(b.y < a.y - 3, `desktop: W moves up the screen (${a.y.toFixed(0)} → ${b.y.toFixed(0)})`);
    check(Math.hypot(d.wx - c.wx, d.wz - c.wz) < 0.05, 'desktop: releasing W stops the player');
  }
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  const e = await player(page);
  await page.keyboard.up('KeyD');
  if (d && e)
    check(e.x > d.x + 10, `desktop: D moves right (${d.x.toFixed(0)} → ${e.x.toFixed(0)})`);
  await page.screenshot({ path: resolve(outDir, 'controls_desktop.png') });
  check(errors.length === 0, `desktop: no console errors ${errors.slice(0, 3).join(' | ')}`);
  await page.close();
}

async function phone(browser: Browser, w: number, h: number, label: string): Promise<void> {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  await boot(page, errors);
  const scheme = await page.evaluate(() => document.documentElement.dataset.controls);
  check(scheme === 'touch', `${label}: scheme is touch (${scheme})`);
  check(await page.locator('.joystick-zone').isVisible(), `${label}: joystick zone shown`);
  check(await page.locator('.attack-button').isVisible(), `${label}: attack button shown`);
  check(
    (await page.locator('.touch-actions > .touch-slot').count()) === 4,
    `${label}: four skill slots shown`,
  );
  const attackBox = await page.locator('.attack-button').boundingBox();
  const primaryBox = await page.locator('.touch-slot-1').boundingBox();
  const utilityBox = await page.locator('.touch-slot-4').boundingBox();
  check(
    !!attackBox && !!primaryBox && attackBox.width > primaryBox.width,
    `${label}: basic attack is largest`,
  );
  check(
    !!utilityBox && !!primaryBox && utilityBox.width < primaryBox.width,
    `${label}: utility skill is smaller`,
  );
  check(!(await page.locator('.help').isVisible()), `${label}: key help hidden`);

  // Real touch drag via CDP: Chrome turns it into pointer events (pointerType touch).
  const cdp = await ctx.newCDPSession(page);
  const zone = await page.locator('.joystick-zone').boundingBox();
  if (!zone) throw new Error('no joystick zone');
  const sx = zone.x + zone.width * 0.45;
  const sy = zone.y + zone.height * 0.6;
  const touch = (type: string, x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
  const a = await player(page);
  await touch('touchStart', sx, sy);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', sx, sy - i * 10);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(900);
  const active = await page.locator('.joystick-active').count();
  await page.screenshot({ path: resolve(outDir, `controls_${label}_drag.png`) });
  const b = await player(page);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(500);
  const c = await player(page);
  await page.waitForTimeout(600);
  const d = await player(page);
  check(active === 1, `${label}: stick visual follows the thumb`);
  if (a && b && c && d) {
    const walked = Math.hypot(b.wx - a.wx, b.wz - a.wz);
    check(walked > 2, `${label}: joystick walked ${walked.toFixed(2)} m`);
    check(
      b.y < a.y - 3,
      `${label}: stick up moves up the screen (${a.y.toFixed(0)} → ${b.y.toFixed(0)})`,
    );
    check(Math.hypot(d.wx - c.wx, d.wz - c.wz) < 0.05, `${label}: release stops the player`);
  }

  // Attack button starts a combo swing even with no hostile selected.
  const btn = await page.locator('.attack-button').boundingBox();
  if (btn) {
    await page.touchscreen.tap(btn.x + btn.width / 2, btn.y + btn.height / 2);
    await page.waitForTimeout(400);
    check((await player(page))?.action === 'cast', `${label}: attack button starts a swing`);
  }
  if (label === 'portrait') {
    await page.locator('.menu button[title="Kỹ năng"]').tap();
    await page.locator('.loadout-group').nth(1).locator('.loadout-slot').last().tap();
    check(
      (await page.locator('.skill-list-item').count()) === 2,
      `${label}: utility slot offers only mobility skills`,
    );
    await page
      .locator('.skill-list-item', { hasText: 'Lôi Ảnh Trảm' })
      .getByRole('button', { name: 'Gán' })
      .tap();
    await page.locator('.skill-panel .panel-head button').last().tap();
    check(
      (await page.locator('.touch-slot-4').getAttribute('title'))?.includes('Lôi Ảnh Trảm') ??
        false,
      `${label}: utility assignment updates the compact slot`,
    );
  }
  await page.screenshot({ path: resolve(outDir, `controls_${label}.png`) });
  check(errors.length === 0, `${label}: no console errors ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

const browser = await chromium.launch({
  channel: process.argv.includes('--chromium') ? undefined : 'chrome',
  headless: true,
});
try {
  await desktop(browser);
  await phone(browser, 390, 844, 'portrait');
  await phone(browser, 320, 640, 'small-portrait');
  await phone(browser, 844, 390, 'landscape');
} catch (err) {
  failures.push(String(err));
  console.error(err);
} finally {
  await browser.close();
}
console.log(failures.length ? `\n${failures.length} failure(s)` : '\ncontrols smoke OK');
process.exit(failures.length ? 1 : 0);
