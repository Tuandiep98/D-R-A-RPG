/**
 * Weapon linh quang smoke (appearance `glow` + `icon3d`):
 *   pnpm dev              (in another terminal)
 *   pnpm smoke:glow [url]
 * Takes Lão Mộc's trial kit, equips Thanh Quang Linh Kiếm and captures the bag
 * icon, the attack button and a close-up in hand at glow 0 / 1 / 2, plus Low.
 * Screenshots → reports/glow/.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';

interface DebugEntity {
  id: number;
  kind: string;
  wx: number;
  wz: number;
}
type Rpg = {
  __rpg: {
    view: {
      debugEntities(): DebugEntity[];
      setWeaponGlow(level: number): void;
      setElementAura(level: number): void;
      unequip(slot: string): void;
      setQuality(q: string): void;
      rig: {
        camera: { alpha: number; beta: number; radius: number; targetScreenOffset: { y: number } };
        opts: { minRadius: number; minBeta: number; maxBeta: number };
      };
    };
    host: { sendIntent(i: unknown): void };
  };
};

const SWORD = 'Thanh Quang Linh Kiếm';
const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
const outDir = resolve(import.meta.dirname, '../../reports/glow');
mkdirSync(outDir, { recursive: true });

const failures: string[] = [];
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const shot = (name: string) => page.screenshot({ path: resolve(outDir, `${name}.png`) });

async function interact(p: Page, id: number): Promise<void> {
  await p.evaluate(
    (entityId) => (window as unknown as Rpg).__rpg.host.sendIntent({ type: 'INTERACT', entityId }),
    id,
  );
}

async function closeUp(p: Page, name: string): Promise<void> {
  await p.evaluate(() => {
    const rig = (window as unknown as Rpg).__rpg.view.rig;
    const cam = rig.camera as unknown as Record<string, number> & typeof rig.camera;
    cam.lowerRadiusLimit = 0.5;
    cam.lowerBetaLimit = 0.1;
    rig.opts.minRadius = 0.5;
    rig.opts.minBeta = 0.1;
    rig.opts.maxBeta = 1.55;
    // Front-right of the player (sword hand), from its facing.
    // biome-ignore lint/suspicious/noExplicitAny: debug access to the player's view
    const v = (window as any).__rpg.view;
    const yaw = v.views.get(v.join.playerId)?.root.rotation.y ?? 0;
    const dx = Math.sin(yaw) * 0.75 + Math.cos(yaw) * 0.66;
    const dz = Math.cos(yaw) * 0.75 - Math.sin(yaw) * 0.66;
    cam.alpha = Math.atan2(dz, dx);
    cam.beta = 1.25;
    cam.radius = 2.6;
    cam.targetScreenOffset.y = 0.5;
  });
  await p.waitForTimeout(700);
  await shot(name);
}

try {
  const url = new URL(base);
  url.searchParams.set('map', 'map_sandbox_01');
  url.searchParams.set('quality', 'high');
  url.searchParams.set('debug', '');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => '__rpg' in window, null, { timeout: 60_000 });
  await page.waitForTimeout(2000);

  const smith = await page.evaluate(
    () =>
      (window as unknown as Rpg).__rpg.view
        .debugEntities()
        .filter((e) => e.kind === 'npc')
        .sort((a, b) => Math.hypot(a.wx + 10, a.wz - 5) - Math.hypot(b.wx + 10, b.wz - 5))[0],
  );
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
  await interact(page, smith.id);
  const panel = page.locator('.npc-panel');
  await panel.waitFor({ timeout: 4000 });
  await panel.getByRole('button', { name: 'Nhận' }).first().click();
  await page.waitForTimeout(300);
  await interact(page, smith.id);
  await page.waitForTimeout(300);
  await panel.getByRole('button', { name: 'Trả' }).first().click();
  await page.waitForTimeout(600);
  await panel.locator('.panel-head button').first().click();
  await panel.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});

  // Bag: equip the sword (desktop click on a bag tile equips it).
  await page.keyboard.press('i');
  await page.locator('.panel').first().waitFor({ timeout: 3000 });
  const tile = page.locator(`.inventory-bag .item[title^="${SWORD}"]`).first();
  check((await tile.count()) === 1, 'sword is in the bag');
  await tile.click();
  await page.waitForTimeout(2500); // model + icon captures
  const equipped = page.locator(`.inventory-equipped .item[title^="${SWORD}"]`);
  check((await equipped.count()) === 1, 'sword sits in the weapon slot');
  const icon = equipped.locator('img.game-icon-model');
  check((await icon.count()) === 1, 'weapon slot shows the model render (icon3d)');
  await shot('01_inventory_glow100');
  await equipped.screenshot({ path: resolve(outDir, '01b_slot_glow100.png') });

  await page.keyboard.press('i');
  await page.waitForTimeout(300);
  const attack = page.locator('.attack-weapon');
  check((await attack.count()) === 1, 'attack button shows the weapon render');
  await attack.screenshot({ path: resolve(outDir, '02b_attack_glow100.png') });
  await closeUp(page, '02_hand_glow100');

  for (const level of [0, 2]) {
    await page.evaluate((v) => (window as unknown as Rpg).__rpg.view.setWeaponGlow(v), level);
    await page.waitForTimeout(1800);
    await closeUp(page, `03_hand_glow${level * 100}`);
    await page.keyboard.press('i');
    await page.waitForTimeout(800);
    await shot(`04_inventory_glow${level * 100}`);
    await page.keyboard.press('i');
  }

  // Ngũ hành aura: Lôi arcs around the weapon, then around the bare fist.
  for (const level of [0, 1, 2]) {
    await page.evaluate((v) => {
      const view = (window as unknown as Rpg).__rpg.view;
      view.setWeaponGlow(1);
      view.setElementAura(v);
    }, level);
    await page.waitForTimeout(500);
    await closeUp(page, `06_aura${level * 100}`);
  }
  // A plain weapon (no linh quang): the arcs are the character's, not the sword's.
  await page.keyboard.press('i');
  await page.locator('.inventory-bag .item[title^="Thiết Kiếm"]').first().click();
  await page.keyboard.press('i');
  await page.waitForTimeout(1500);
  await closeUp(page, '06_aura200_iron');
  await page.evaluate(() => (window as unknown as Rpg).__rpg.view.unequip('main_hand'));
  await page.waitForTimeout(800);
  await closeUp(page, '07_aura200_fist');

  await page.evaluate(() => {
    const v = (window as unknown as Rpg).__rpg.view;
    v.setWeaponGlow(1);
    v.setElementAura(1);
    v.setQuality('low');
  });
  await page.waitForTimeout(1500);
  await closeUp(page, '05_hand_low');
} finally {
  const real = errors.filter((e) => !/favicon|ERR_CONNECTION_REFUSED/.test(e));
  check(real.length === 0, `no page errors (${real.slice(0, 3).join(' | ')})`);
  await browser.close();
}
console.log(`screenshots → ${outDir}`);
if (failures.length) process.exit(1);
