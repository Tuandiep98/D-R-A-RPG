/**
 * Tiệm Rèn smoke (docs/plan/06_forge_equipment_plan.md):
 *   pnpm dev              (in another terminal)
 *   pnpm smoke:forge [url] [--mobile]
 * Walks to Lão Mộc, takes the trial kit, then drives the forge UI: enhance,
 * socket a combat module, a rite and synthesis. Screenshots → reports/forge/.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

interface DebugEntity {
  id: number;
  kind: string;
  wx: number;
  wz: number;
}

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
const mobile = args.includes('--mobile');
const outDir = resolve(import.meta.dirname, '../../reports/forge');
mkdirSync(outDir, { recursive: true });

const failures: string[] = [];
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 760 },
  ...(mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}),
});
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const shot = (name: string) =>
  page.screenshot({
    path: resolve(outDir, `${mobile ? 'mobile_' : ''}${name}.png`),
  });

type Rpg = {
  __rpg: {
    view: { debugEntities(): DebugEntity[] };
    host: { sendIntent(i: unknown): void };
  };
};

try {
  const url = new URL(base);
  url.searchParams.set('map', 'map_sandbox_01');
  url.searchParams.set('quality', 'low');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => '__rpg' in window, null, {
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);

  // The smith is the NPC nearest the authored spot (-10, 5).
  const smith = await page.evaluate(() => {
    const list = (window as unknown as Rpg).__rpg.view.debugEntities();
    return list
      .filter((e) => e.kind === 'npc')
      .sort((a, b) => Math.hypot(a.wx + 10, a.wz - 5) - Math.hypot(b.wx + 10, b.wz - 5))[0];
  });
  check(!!smith, 'smith NPC is on the map');
  if (!smith) throw new Error('no smith');
  await page.evaluate(
    (s) =>
      (window as unknown as Rpg).__rpg.host.sendIntent({
        type: 'MOVE_TO',
        point: { x: s.wx + 1.2, z: s.wz },
      }),
    smith,
  );
  await page.waitForTimeout(6000);
  await page.evaluate(
    (s) =>
      (window as unknown as Rpg).__rpg.host.sendIntent({
        type: 'INTERACT',
        entityId: s.id,
      }),
    smith,
  );
  const panel = page.locator('.npc-panel');
  check(
    await panel
      .waitFor({ timeout: 4000 })
      .then(() => true)
      .catch(() => false),
    'smith dialog opens',
  );

  // Trial kit: accept, talk again (talk objective), turn in.
  await panel.getByRole('button', { name: 'Nhận' }).first().click();
  await page.waitForTimeout(300);
  await page.evaluate(
    (s) =>
      (window as unknown as Rpg).__rpg.host.sendIntent({
        type: 'INTERACT',
        entityId: s.id,
      }),
    smith,
  );
  await page.waitForTimeout(300);
  await panel.getByRole('button', { name: 'Trả' }).first().click();
  await page.waitForTimeout(600);
  await shot('01_trial_kit');

  await panel.getByRole('button', { name: 'Tiệm Rèn' }).click();
  await page.waitForTimeout(300);
  const slots = page.locator('.forge-slot');
  check((await slots.count()) >= 8, `forge lists the trial gear (${await slots.count()})`);
  await page.locator('.forge-slot[title="Thiên Cơ Kiếm"]').click();
  await shot('02_forge_enhance');

  const enhance = panel.locator('.npc-list').getByRole('button', { name: 'Cường hoá' });
  for (let i = 0; i < 4; i++) {
    await enhance.click();
    await page.waitForTimeout(250);
  }
  const plus = await page
    .locator('.forge-slot.selected .forge-plus')
    .innerText()
    .catch(() => '');
  check(plus.startsWith('+'), `enhancement shows on the slot (${plus})`);
  await shot('03_after_enhance');

  await panel.locator('.forge-ops').getByRole('button', { name: 'Khảm' }).click();
  await page.waitForTimeout(200);
  await panel
    .locator('.npc-row', { hasText: 'Chip Cuồng Phong' })
    .getByRole('button', { name: 'Khảm' })
    .click();
  await page.waitForTimeout(300);
  check(
    (await panel.locator('.npc-row', { hasText: 'Ô 1' }).innerText()).includes('Cuồng Phong'),
    'combat module sits in socket 1',
  );
  await shot('04_socket');

  await panel.locator('.forge-ops').getByRole('button', { name: 'Luyện khí' }).click();
  await page.waitForTimeout(200);
  await panel
    .locator('.npc-row', { hasText: 'Phụ Linh' })
    .getByRole('button', { name: 'Luyện' })
    .click();
  await page.waitForTimeout(300);
  await shot('05_rites');
  check(
    (await panel.locator('.forge-summary').innerText()).includes('Phụ Linh'),
    'rite listed on the item',
  );

  await page.locator('.forge-slot[title="Thiết Kiếm"]').first().click();
  await panel.locator('.forge-ops').getByRole('button', { name: 'Hợp thành' }).click();
  await page.waitForTimeout(200);
  const boxes = panel.locator('.forge-check input[type="checkbox"]');
  for (let i = 0; i < 2; i++) await boxes.nth(i).check();
  await panel.locator('.npc-list').getByRole('button', { name: 'Hợp thành' }).click();
  await page.waitForTimeout(400);
  check(
    (await panel.locator('.forge-summary').innerText()).includes('Quý hiếm'),
    'synthesis raises the iron sword to Quý hiếm',
  );
  await shot('06_synthesis');

  check(errors.length === 0, `no console errors (${errors.slice(0, 3).join(' | ')})`);
} catch (err) {
  failures.push(String(err));
  console.error(err);
  await shot('99_error').catch(() => {});
} finally {
  await browser.close();
}
console.log(failures.length ? `forge smoke FAILED (${failures.length})` : 'forge smoke OK');
process.exit(failures.length ? 1 : 0);
