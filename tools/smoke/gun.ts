/**
 * Ranged weapons in the real client (D-033), against a running dev server:
 *   pnpm dev                 (in another terminal)
 *   pnpm smoke:gun [url]     (default http://localhost:5173)
 * The offline test gunner (?char=player_gunner) equips every gun, fires it,
 * empties the pistol (auto reload), overheats the rifle and swaps back to the
 * sword. Checks the host events and writes reports/smoke/gun_*.png: a close-up
 * on the shot frame (muzzle / tracer / pose) and a game-camera view.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
function gameUrl(quality?: 'low' | 'high'): string {
  const target = new URL(url);
  target.searchParams.set('debug', '');
  target.searchParams.set('char', 'player_gunner');
  if (quality) target.searchParams.set('quality', quality);
  else if (!target.searchParams.has('quality')) target.searchParams.set('quality', 'high');
  return target.toString();
}
const outDir = resolve(import.meta.dirname, '../../reports/smoke');
mkdirSync(outDir, { recursive: true });

const failures: string[] = [];
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures.push(msg);
};

const GUNS = [
  'item_gun_pistol',
  'item_gun_carbine',
  'item_gun_rifle',
  'item_gun_shotgun',
  'item_gun_sniper',
] as const;

/** Runs inside the page: helpers on window.__rpg (dev / ?debug only). */
interface Rpg {
  view: {
    attackDown(aim?: { x: number; z: number } | null): void;
    attackUp(): void;
    reload(): void;
    equip(instanceId: string): void;
    send(intent: { type: 'ATTACK_TARGET'; targetId: number }): void;
    debugEntities(): {
      id: number;
      kind: string;
      action: string;
      wx: number;
      wz: number;
    }[];
    playerState: {
      inventory: { instanceId: string; itemId: string }[];
      equipment: { main_hand?: string };
      ranged: { rangedId: string; ammo: number; magazine: number } | null;
    } | null;
    sampled: Map<number, { x: number; z: number; yaw: number }>;
    join: { playerId: number };
    rig: {
      camera: {
        alpha: number;
        beta: number;
        radius: number;
        lowerRadiusLimit: number;
        targetScreenOffset: { y: number };
      };
      opts: { minRadius: number; minBeta: number; maxBeta: number };
    };
  };
  host: { onEvents(cb: (events: { type: string }[]) => void): () => void };
}

async function inPage<T, A>(page: Page, fn: (rpg: Rpg, arg: A) => T, arg: A): Promise<T> {
  // Playwright evaluates this test-only expression inside the page.
  return page.evaluate(
    `(${fn.toString()})(window.__rpg, ${JSON.stringify(arg) ?? 'null'})`,
  ) as Promise<T>;
}

const counts = (page: Page) =>
  page.evaluate(() => ({
    ...(window as unknown as { __gunLog: Record<string, number> }).__gunLog,
  }));

async function equip(page: Page, itemId: string): Promise<boolean> {
  const ok = await inPage(
    page,
    (rpg, id: string) => {
      const inv = rpg.view.playerState?.inventory.find((i) => i.itemId === id);
      if (inv) rpg.view.equip(inv.instanceId);
      return !!inv;
    },
    itemId,
  );
  await page.waitForTimeout(600);
  return ok;
}

/** Aim point `metres` ahead of the player along its facing. */
const ahead = (page: Page, metres: number) =>
  inPage(
    page,
    (rpg, m: number) => {
      const me = rpg.view.sampled.get(rpg.view.join.playerId);
      return me ? { x: me.x + Math.sin(me.yaw) * m, z: me.z + Math.cos(me.yaw) * m } : null;
    },
    metres,
  );

/** Camera around the player: `offset` from its facing (π/2 = front), close or game view. */
const camera = (page: Page, offset: number, close: boolean) =>
  inPage(
    page,
    (rpg, a: { offset: number; close: boolean }) => {
      const me = rpg.view.sampled.get(rpg.view.join.playerId);
      const cam = rpg.view.rig.camera;
      const rig = rpg.view.rig.opts;
      cam.lowerRadiusLimit = 0.5;
      rig.minRadius = 0.5;
      rig.minBeta = 0.1;
      rig.maxBeta = 1.55;
      cam.alpha = a.offset - (me?.yaw ?? 0);
      cam.beta = a.close ? 1.25 : 0.85;
      cam.radius = a.close ? 4.2 : 11;
      cam.targetScreenOffset.y = a.close ? 0.4 : 0;
    },
    { offset, close },
  );

const shot = (page: Page, name: string) =>
  page.screenshot({ path: resolve(outDir, `gun_${name}.png`) });

const browser = await chromium.launch({
  channel: args.includes('--chromium') ? undefined : 'chrome',
});
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(gameUrl(), {
  waitUntil: 'domcontentloaded',
  timeout: 60_000,
});
await page.waitForFunction(() => '__rpg' in window, null, { timeout: 60_000 });
await page.waitForTimeout(5000); // models, clips and gear load
await page.evaluate(() => {
  const w = window as unknown as {
    __gunLog: Record<string, number>;
    __gunHits: number;
    __rpg: Rpg;
  };
  w.__gunLog = {};
  w.__gunHits = 0;
  w.__rpg.host.onEvents((events) => {
    for (const e of events) {
      w.__gunLog[e.type] = (w.__gunLog[e.type] ?? 0) + 1;
      if (
        e.type === 'DAMAGE' &&
        'sourceId' in e &&
        e.sourceId === w.__rpg.view.join.playerId &&
        'shot' in e &&
        e.shot
      )
        w.__gunHits++;
    }
  });
});

const start = await inPage(page, (rpg) => rpg.view.playerState?.ranged?.rangedId ?? null, null);
check(start === 'ranged_pistol', `gunner starts with the pistol (got ${start})`);

for (const gun of GUNS) {
  check(await equip(page, gun), `${gun} equipped`);
  const short = gun.replace('item_gun_', '');
  const before = await counts(page);
  await camera(page, 0.35, true);
  await page.waitForTimeout(200);
  const aim = await ahead(page, 9);
  await inPage(page, (rpg, a) => rpg.view.attackDown(a), aim);
  // The shot leaves after the wind-up (0.1–0.25 s); catch the muzzle flash.
  await page.waitForTimeout(gun === 'item_gun_sniper' ? 330 : 190);
  await shot(page, `${short}_shot`);
  await page.waitForTimeout(150);
  await inPage(page, (rpg) => rpg.view.attackUp(), null);
  await page.waitForTimeout(250);
  await camera(page, Math.PI / 2, true);
  await page.waitForTimeout(150);
  await shot(page, `${short}_aim`);
  const after = await counts(page);
  check((after.SHOT ?? 0) > (before.SHOT ?? 0), `${short}: SHOT event`);
  await page.waitForTimeout(1500);
}

// Pistol: empty the magazine → reload starts by itself, ammo comes back.
await equip(page, 'item_gun_pistol');
await camera(page, 0.6, false);
const pistolBefore = await counts(page);
for (let i = 0; i < 14; i++) {
  const aim = await ahead(page, 8);
  await inPage(page, (rpg, a) => rpg.view.attackDown(a), aim);
  await page.waitForTimeout(320);
}
await shot(page, 'pistol_reload');
const pistolAfter = await counts(page);
check(
  (pistolAfter.RELOAD ?? 0) > (pistolBefore.RELOAD ?? 0),
  `pistol reloads by itself when empty (${(pistolAfter.SHOT ?? 0) - (pistolBefore.SHOT ?? 0)} shots)`,
);
await page.waitForTimeout(1300);
const ammo = await inPage(page, (rpg) => rpg.view.playerState?.ranged?.ammo ?? -1, null);
check(ammo > 0, `pistol magazine refilled (ammo ${ammo})`);

// Rifle: hold the trigger until it overheats; the white bar drains over the head.
await equip(page, 'item_gun_rifle');
await camera(page, 0.6, false);
const rifleBefore = await counts(page);
const aim = await ahead(page, 10);
await inPage(page, (rpg, a) => rpg.view.attackDown(a), aim);
await page.waitForTimeout(1200);
await shot(page, 'rifle_auto');
await page.waitForTimeout(900);
await shot(page, 'rifle_overheat');
await inPage(page, (rpg) => rpg.view.attackUp(), null);
const rifleAfter = await counts(page);
check((rifleAfter.OVERHEAT ?? 0) > (rifleBefore.OVERHEAT ?? 0), 'rifle overheats when held');
check(
  (rifleAfter.SHOT ?? 0) - (rifleBefore.SHOT ?? 0) >= 12,
  `rifle fires automatically while held (${(rifleAfter.SHOT ?? 0) - (rifleBefore.SHOT ?? 0)} shots)`,
);
await page.waitForTimeout(2600);

// Shotgun from the game camera: the pellet fan.
await equip(page, 'item_gun_shotgun');
await camera(page, 0.6, false);
const fan = await ahead(page, 6);
await inPage(page, (rpg, a) => rpg.view.attackDown(a), fan);
await page.waitForTimeout(220);
await shot(page, 'shotgun_fan');

// Fire at a real monster through the normal auto-target path, not only empty ground.
await equip(page, 'item_gun_rifle');
const targetId = await inPage(
  page,
  (rpg) => {
    const all = rpg.view.debugEntities();
    const me = all.find((e) => e.id === rpg.view.join.playerId);
    if (!me) return null;
    const monsters = all
      .filter((e) => e.kind === 'monster' && e.action !== 'dead')
      .sort(
        (a, b) => Math.hypot(a.wx - me.wx, a.wz - me.wz) - Math.hypot(b.wx - me.wx, b.wz - me.wz),
      );
    if (monsters[0]) rpg.view.send({ type: 'ATTACK_TARGET', targetId: monsters[0].id });
    return monsters[0]?.id ?? null;
  },
  null,
);
check(targetId !== null, 'monster available for ranged combat');
const dealtDamage =
  targetId !== null &&
  (await page
    .waitForFunction(() => (window as unknown as { __gunHits: number }).__gunHits > 0, null, {
      timeout: 20_000,
    })
    .then(() => true)
    .catch(() => false));
check(dealtDamage, 'rifle bullets damage a real monster');

// Back to the sword: no ranged state, attacks swing again.
await equip(page, 'item_sword_iron');
const melee = await inPage(page, (rpg) => rpg.view.playerState?.ranged ?? null, null);
check(melee === null, 'sword equipped: no ranged state');

check(
  errors.length === 0,
  `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`,
);

// A touch hold must feed the same automatic trigger and release it cleanly.
const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const mobile = await mobileContext.newPage();
const mobileErrors: string[] = [];
mobile.on('pageerror', (error) => mobileErrors.push(error.message));
await mobile.addInitScript(() => {
  localStorage.setItem('rpg.controls', JSON.stringify({ autoFullscreen: false }));
});
await mobile.goto(gameUrl('low'), {
  waitUntil: 'domcontentloaded',
  timeout: 60_000,
});
await mobile.waitForFunction(() => '__rpg' in window, null, {
  timeout: 60_000,
});
await mobile.waitForTimeout(2500);
check(await equip(mobile, 'item_gun_rifle'), 'mobile: rifle equipped');
await mobile.evaluate(() => {
  const win = window as unknown as { __touchShots: number; __rpg: Rpg };
  win.__touchShots = 0;
  win.__rpg.host.onEvents((events) => {
    for (const event of events) if (event.type === 'SHOT') win.__touchShots++;
  });
});
const attackButton = await mobile.locator('.attack-button').boundingBox();
check(attackButton !== null, 'mobile: attack button visible');
if (attackButton) {
  const cdp = await mobileContext.newCDPSession(mobile);
  const touch = {
    x: attackButton.x + attackButton.width / 2,
    y: attackButton.y + attackButton.height / 2,
    id: 1,
  };
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [touch],
  });
  await mobile.waitForTimeout(1000);
  const heldShots = await mobile.evaluate(
    () => (window as unknown as { __touchShots: number }).__touchShots,
  );
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  // Shots already queued in the worker may arrive after touchEnd. Compare a
  // settled count with a later count to verify the trigger has actually stopped.
  await mobile.waitForTimeout(250);
  const settledShots = await mobile.evaluate(
    () => (window as unknown as { __touchShots: number }).__touchShots,
  );
  await mobile.waitForTimeout(500);
  const releasedShots = await mobile.evaluate(
    () => (window as unknown as { __touchShots: number }).__touchShots,
  );
  check(heldShots >= 3, `mobile: holding attack fires automatically (${heldShots} shots)`);
  check(
    releasedShots === settledShots,
    `mobile: releasing attack stops firing (${settledShots} → ${releasedShots} shots)`,
  );
  await cdp.detach();
}
check(
  mobileErrors.length === 0,
  `mobile: no page errors${mobileErrors.length ? `: ${mobileErrors.slice(0, 3).join(' | ')}` : ''}`,
);
await mobile.screenshot({ path: resolve(outDir, 'gun_mobile.png') });
await mobileContext.close();
console.log(`screenshots → ${outDir}/gun_*.png`);
// A WebGL page can keep Chromium busy during shutdown; cap cleanup so the
// smoke command always reports its actual assertion result to CI.
await Promise.race([browser.close(), new Promise<void>((resolve) => setTimeout(resolve, 5000))]);
process.exit(failures.length > 0 ? 1 : 0);
