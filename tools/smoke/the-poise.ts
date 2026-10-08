/** Real Worker wolf bites → poise pressure/break → HUD. Only normal movement intents. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const out = resolve('reports/the-poise');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results: unknown[] = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 844 }, { width: 844, height: 390 }]) {
    const mobile = Math.min(viewport.width, viewport.height) < 500;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('rpg.controls', JSON.stringify({ autoFullscreen: false })));
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5175');
    for (const [key, value] of Object.entries({ debug: '', webgl: '', quality: 'low', char: 'player_the', map: 'map_forest_mechanism_01' })) url.searchParams.set(key, value);
    await page.goto(url.toString());
    await page.waitForFunction(() => {
      // biome-ignore lint/suspicious/noExplicitAny: read debug host, no sim mutations.
      const game = (window as any).__rpg;
      return !!game?.view.playerState && game.view.sampled.size > 1;
    }, null, { timeout: 60000 });
    await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: read real snapshots and send gameplay intents.
      const win = window as any;
      const game = win.__rpg;
      const view = game.view;
      const me = view.sampled.get(view.join.playerId);
      const wolves = [...view.sampled.values()].filter(
        // biome-ignore lint/suspicious/noExplicitAny: sampled protocol entities.
        (entity: any) => entity.state.defId === 'wolf_001' && entity.state.hp > 0,
      );
      wolves.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
      const target = wolves[0];
      if (!target) throw new Error('missing authored wolf');
      win.__poiseAudit = { pressure: null, broken: null, locked: [], released: null };
      game.host.onSnapshot((snapshot) => {
        const actor = snapshot.entities.find((entity) => entity.id === view.join.playerId);
        if (!actor) return;
        const audit = win.__poiseAudit;
        const poise = actor.poise;
        if (!audit.pressure && poise?.pressure > 0) audit.pressure = { tick: snapshot.tick, ...poise };
        if (!audit.broken && poise?.staggerUntilTick > snapshot.tick) {
          audit.broken = { tick: snapshot.tick, pos: { ...actor.pos }, ...poise };
          const wolf = snapshot.entities.find((entity) => entity.id === target.state.id);
          const dx = actor.pos.x - (wolf?.pos.x ?? actor.pos.x + 1);
          const dz = actor.pos.z - (wolf?.pos.z ?? actor.pos.z);
          const length = Math.hypot(dx, dz) || 1;
          view.send({ type: 'MOVE_DIR', dir: { x: dx / length, z: dz / length } });
        }
        if (audit.broken && snapshot.tick > audit.broken.tick && snapshot.tick < audit.broken.staggerUntilTick)
          audit.locked.push({ tick: snapshot.tick, pos: { ...actor.pos } });
        if (audit.broken && snapshot.tick >= audit.broken.staggerUntilTick && !audit.released && actor.action === 'move') {
          audit.released = { tick: snapshot.tick, pos: { ...actor.pos } };
          view.send({ type: 'STOP' });
        }
      });
      view.send({ type: 'MOVE_TO', target: { x: target.x, z: target.z } });
    });
    const pressure = page.locator('.poise-info[data-phase="pressure"]');
    await pressure.waitFor({ timeout: 45000 });
    await page.screenshot({ path: resolve(out, `pressure-${viewport.width}.png`) });
    const stagger = page.locator('.poise-info[data-phase="stagger"]');
    await stagger.waitFor({ timeout: 15000 });
    const box = await stagger.boundingBox();
    await page.screenshot({ path: resolve(out, `stagger-${viewport.width}.png`) });
    await page.waitForFunction(() => {
      // biome-ignore lint/suspicious/noExplicitAny: event-owned observations only.
      return !!(window as any).__poiseAudit.released;
    }, null, { timeout: 5000 });
    const immune = page.locator('.poise-info[data-phase="immune"]');
    await immune.waitFor({ timeout: 3000 });
    await page.screenshot({ path: resolve(out, `immune-${viewport.width}.png`) });
    const audit = await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: event-owned observations only.
      return (window as any).__poiseAudit;
    });
    if (!box || box.x < 0 || box.y < 0 || box.x + box.width > viewport.width || box.y + box.height > viewport.height || errors.length || audit.locked.length < 2 || audit.locked.some((sample) => Math.hypot(sample.pos.x - audit.broken.pos.x, sample.pos.z - audit.broken.pos.z) > 0.01))
      throw new Error(JSON.stringify({ viewport, box, audit, errors }));
    results.push({ viewport, box, audit, errors });
    console.log(`PASS Worker Thể pressure/break/HUD/root/release ${viewport.width}×${viewport.height}`);
    await context.close();
  }
} finally {
  writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
