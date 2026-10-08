/** Live Worker/Low clip playback at authoritative release/impact, without seeking or pausing. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { loadContentFromDir } from '../../packages/game-data/src/node';

const content = loadContentFromDir(resolve('game-data'));
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:5175');
for (const [key, value] of Object.entries({ debug: '', webgl: '', quality: 'low' }))
  base.searchParams.set(key, value);
const out = resolve('reports/thunder-timing');
mkdirSync(out, { recursive: true });
const results: unknown[] = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const skill of content.skills.values()) {
    if (!skill.id.startsWith('skill_thunder_')) continue;
    const resolved =
      skill.id === 'skill_thunder_step' ? (content.skills.get('skill_roll') ?? skill) : skill;
    if (!resolved.anim?.cast) throw new Error(`Missing cast clip ${resolved.id}`);
    const windup = resolved.mobility
      ? resolved.duration
      : (resolved.timeline?.windup ?? resolved.castTime);
    const dash = !resolved.mobility && resolved.effects.some((effect) => effect.type === 'dash');
    const seconds =
      Math.round(windup * 20) / 20 +
      (dash ? Math.round((resolved.timeline?.active ?? 0) * 20) / 20 : 0);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base.toString());
    await page.waitForFunction(
      () => {
        // biome-ignore lint/suspicious/noExplicitAny: renderer debug inspection.
        const view = (window as any).__rpg?.view;
        return view?.views.get(view.join.playerId)?.visual?.clips?.size > 0;
      },
      null,
      { timeout: 60000 },
    );
    await page.evaluate(
      ({ requestedId, resolvedId, clip, speed, seconds }) => {
        // biome-ignore lint/suspicious/noExplicitAny: test subscribes to the actual Worker and reads live animation groups.
        const game = (window as any).__rpg;
        const view = game.view;
        let started = 0;
        // biome-ignore lint/suspicious/noExplicitAny: real host events.
        game.host.onEvents((events: any[]) => {
          for (const event of events) {
            if (event.sourceId !== view.join.playerId || event.skillId !== resolvedId) continue;
            if (event.type === 'CAST_START') started = performance.now();
            if (started && (event.type === 'SKILL_IMPACT' || event.type === 'SKILL_PROJECTILE')) {
              const group = view.views.get(view.join.playerId).visual.clips.get(clip);
              const fps = group.targetedAnimations[0].animation.framePerSecond;
              const expected = Math.min(group.to, group.from + seconds * speed * fps);
              const frame = group.getCurrentFrame();
              // biome-ignore lint/suspicious/noExplicitAny: test-owned measurement.
              (window as any).__timing = {
                requestedId,
                resolvedId,
                clip,
                seconds,
                speed,
                fps,
                frame,
                expected,
                driftSeconds: Math.abs(frame - expected) / fps / speed,
                wallSeconds: (performance.now() - started) / 1000,
              };
            }
          }
        });
        const me = view.sampled.get(view.join.playerId);
        view.send({
          type: 'CAST_SKILL',
          skillId: requestedId,
          point: { x: me.x, z: me.z + 1 },
        });
      },
      {
        requestedId: skill.id,
        resolvedId: resolved.id,
        clip: resolved.anim.cast,
        speed: resolved.anim.castSpeed,
        seconds,
      },
    );
    await page.waitForFunction(
      () => {
        // biome-ignore lint/suspicious/noExplicitAny: measurement log.
        return !!(window as any).__timing;
      },
      null,
      { timeout: 5000 },
    );
    const result = await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: measurement log.
      return (window as any).__timing;
    });
    results.push(result);
    if (result.driftSeconds > 0.075 || errors.length)
      throw new Error(JSON.stringify({ result, errors }));
    console.log(`PASS ${skill.id}: live contact drift ${Math.round(result.driftSeconds * 1000)}ms`);
    await page.close();
  }
} finally {
  writeFileSync(resolve(out, 'live.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
