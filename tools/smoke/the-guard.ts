/** Thể passive earned through real automatic punches, then rendered on desktop and phone Low. */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const out = resolve('reports/the-guard');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5173');
    for (const [key, value] of Object.entries({
      debug: '',
      webgl: '',
      quality: 'low',
      char: 'player_the',
    }))
      url.searchParams.set(key, value);
    await page.goto(url.toString());
    await page.waitForFunction(
      () => {
        // biome-ignore lint/suspicious/noExplicitAny: debug view for real input smoke.
        const view = (window as any).__rpg?.view;
        return !!view?.playerState;
      },
      null,
      { timeout: 60000 },
    );
    await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: read current snapshot, send actual intent only.
      const view = (window as any).__rpg.view;
      const me = view.sampled.get(view.join.playerId);
      const targets = [...view.sampled.values()].filter(
        // biome-ignore lint/suspicious/noExplicitAny: private sampled state.
        (entity: any) => entity.state.kind === 'monster' && entity.state.hp >= 180,
      );
      targets.sort(
        (a: { x: number; z: number }, b: { x: number; z: number }) =>
          Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z),
      );
      const target = targets[0];
      if (!target) throw new Error('missing authored target');
      view.send({ type: 'ATTACK_TARGET', targetId: target.state.id });
    });
    await page.getByRole('status').filter({ hasText: 'Kình Thể 3' }).waitFor({ timeout: 45000 });
    const status = page.getByRole('status').filter({ hasText: 'Kình Thể 3' });
    const box = await status.boundingBox();
    if (!box || box.x < 0 || box.x + box.width > width || errors.length)
      throw new Error(JSON.stringify({ width, box, errors }));
    await page.screenshot({ path: resolve(out, `guard-${width}.png`) });
    console.log(`PASS Thể real auto earns 3 stacks; HUD fits ${width}px`);
    await page.close();
  }
} finally {
  await browser.close();
}
