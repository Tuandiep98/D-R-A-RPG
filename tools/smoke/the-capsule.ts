/** Real Worker/Low Phá Sơn warning and impact use the committed capsule, including round caps. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const out = resolve('reports/the-capsule');
mkdirSync(out, { recursive: true });
const results: unknown[] = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5175');
    for (const [key, value] of Object.entries({
      debug: '',
      char: 'player_the',
      quality: 'low',
      webgl: '',
    }))
      url.searchParams.set(key, value);
    await page.goto(url.toString());
    await page.waitForFunction(
      () => {
        // biome-ignore lint/suspicious/noExplicitAny: renderer debug state.
        const view = (window as any).__rpg?.view;
        return view?.views.get(view.join.playerId)?.visual?.clips?.size > 0;
      },
      null,
      { timeout: 60000 },
    );
    await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: debug-only browser measurement.
      const win = window as any;
      const game = win.__rpg;
      const view = game.view;
      view.rig.camera.radius = 7;
      win.__capsule = {};
      // biome-ignore lint/suspicious/noExplicitAny: actual host event trace and mesh inspection.
      game.host.onEvents((events: any[]) => {
        for (const event of events) {
          if (event.sourceId !== view.join.playerId || event.skillId !== 'skill_the_mountain')
            continue;
          const phase =
            event.type === 'CAST_START'
              ? 'warning'
              : event.type === 'SKILL_IMPACT'
                ? 'impact'
                : null;
          if (!phase) continue;
          const mesh = view.scene.meshes.find(
            // biome-ignore lint/suspicious/noExplicitAny: renderer private pooled meshes.
            (mesh: any) =>
              mesh.name.startsWith(phase === 'warning' ? 'tele_sector_' : 'impact_line_') &&
              mesh.isEnabled(),
          );
          if (!mesh) throw new Error(`Missing ${phase} capsule mesh`);
          mesh.computeWorldMatrix(true);
          const box = mesh.getBoundingInfo().boundingBox;
          win.__capsule[phase] = {
            line: event.line,
            bounds: {
              minX: box.minimumWorld.x,
              maxX: box.maximumWorld.x,
              minZ: box.minimumWorld.z,
              maxZ: box.maximumWorld.z,
            },
          };
        }
      });
      view.send({ type: 'CAST_SKILL', skillId: 'skill_the_mountain' });
    });
    await page.waitForFunction(() => {
      // biome-ignore lint/suspicious/noExplicitAny: test-owned observation.
      return !!(window as any).__capsule.warning;
    });
    await page.screenshot({ path: resolve(out, `${width}-warning.png`) });
    await page.waitForFunction(() => {
      // biome-ignore lint/suspicious/noExplicitAny: test-owned observation.
      return !!(window as any).__capsule.impact;
    });
    await page.screenshot({ path: resolve(out, `${width}-impact.png`) });
    const result = await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: test-owned observation.
      return (window as any).__capsule;
    });
    if (JSON.stringify(result.warning.line) !== JSON.stringify(result.impact.line))
      throw new Error('Impact changed capsule');
    for (const phase of ['warning', 'impact']) {
      const { line, bounds } = result[phase];
      if (
        !line ||
        Math.abs(line.radius - 0.35) > 0.001 ||
        Math.abs(bounds.maxX - bounds.minX - 0.7) > 0.001 ||
        Math.abs(bounds.maxZ - bounds.minZ - 3.1) > 0.001 ||
        errors.length
      )
        throw new Error(JSON.stringify({ width, phase, result, errors }));
    }
    results.push({ width, ...result });
    console.log(`PASS ${width}: Low warning/impact bounds 0.7×3.1m match committed capsule`);
    await page.close();
  }
} finally {
  writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
