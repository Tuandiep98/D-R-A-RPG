/** Actual three-step Worker basic projectiles and clip frames; town keeps damage hit-stop out of calibration. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { loadContentFromDir } from '../../packages/game-data/src/node';

const content = loadContentFromDir(resolve('game-data'));
const out = resolve('reports/kit-basics');
mkdirSync(out, { recursive: true });
const results: unknown[] = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const profile of ['player_phap', 'player_tran', 'player_thu']) {
    const character = content.characters.get(profile);
    const combo = character && content.combos.get(character.combos.unarmed);
    if (!combo) throw new Error(`missing combo ${profile}`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5175');
    for (const [key, value] of Object.entries({
      char: profile,
      map: 'map_sandbox_01',
      quality: 'low',
      webgl: '',
      debug: '',
    }))
      url.searchParams.set(key, value);
    await page.goto(url.toString());
    await page.waitForFunction(
      () => {
        // biome-ignore lint/suspicious/noExplicitAny: actual debug renderer.
        const view = (window as any).__rpg?.view;
        return view?.views.get(view.join.playerId)?.visual?.clips?.size > 0;
      },
      null,
      { timeout: 60000 },
    );
    // Calibrate playback after the model has rendered; cold-load stalls are a separate performance gate.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          // biome-ignore lint/suspicious/noExplicitAny: render-only readiness, no sim mutation.
          const scene = (window as any).__rpg.view.scene;
          let frames = 0;
          const observer = scene.onAfterRenderObservable.add(() => {
            if (++frames < 12) return;
            scene.onAfterRenderObservable.remove(observer);
            resolve();
          });
        }),
    );
    await page.evaluate((combo) => {
      // biome-ignore lint/suspicious/noExplicitAny: actual Worker event stream and clip groups.
      const win = window as any;
      const game = win.__rpg;
      const view = game.view;
      win.__basicSamples = [];
      const attacks = new Map<number, { variantId: string; step: number; receivedAt: number }>();
      let lastRenderAt = performance.now();
      view.scene.onAfterRenderObservable.add(() => {
        lastRenderAt = performance.now();
      });
      // biome-ignore lint/suspicious/noExplicitAny: game protocol in browser debug only.
      game.host.onEvents((events: any[]) => {
        for (const event of events) {
          if (event.sourceId !== view.join.playerId) continue;
          if (event.type === 'ATTACK' && event.combo)
            attacks.set(event.actionId, { ...event.combo, receivedAt: performance.now() });
          if (event.type !== 'SKILL_PROJECTILE') continue;
          const attack = attacks.get(event.actionId);
          if (!attack) continue;
          const variant = combo.steps[attack.step]?.variants.find(
            (variant) => variant.id === attack.variantId,
          );
          if (!variant || event.skillId !== variant.projectileSkillId)
            throw new Error('Wrong basic projectile');
          if (
            !(event.speed > 0) ||
            !(
              Math.hypot(
                event.destination.x - event.origin.x,
                event.destination.z - event.origin.z,
              ) > 0
            )
          )
            throw new Error('Basic projectile must have finite nonzero travel');
          const group = view.views.get(view.join.playerId).visual.clips.get(variant.clip);
          const fps = group.targetedAnimations[0].animation.framePerSecond;
          const frame =
            group.animatables.find((track: { paused: boolean }) => !track.paused)?.masterFrame ??
            group.getCurrentFrame();
          const release = Math.max(1, Math.round(variant.windup * 20)) / 20;
          const expected = group.from + release * variant.animSpeed * fps;
          win.__basicSamples.push({
            step: attack.step,
            variantId: variant.id,
            clip: variant.clip,
            actionId: event.actionId,
            projectileId: event.projectileId,
            frame,
            expected,
            driftSeconds: Math.abs(frame - expected) / fps / variant.animSpeed,
            deliveryDeltaSeconds: (performance.now() - attack.receivedAt) / 1000 - release,
            renderAgeSeconds: (performance.now() - lastRenderAt) / 1000,
            clipDuration: (group.to - group.from) / fps / variant.animSpeed,
            actionDuration: release + Math.round(variant.recovery * 20) / 20,
          });
        }
      });
    }, combo);
    for (let step = 0; step < 3; step++) {
      await page.evaluate(() => {
        // biome-ignore lint/suspicious/noExplicitAny: send actual gameplay intent.
        (window as any).__rpg.view.send({ type: 'BASIC_ATTACK', aim: { x: 0, z: 1 } });
      });
      await page.waitForFunction(
        (count) => {
          // biome-ignore lint/suspicious/noExplicitAny: event-owned observations.
          return (window as any).__basicSamples.length >= count;
        },
        step + 1,
        { timeout: 5000 },
      );
      const variant = combo.steps[step]?.variants[0];
      if (!variant) throw new Error('missing variant');
      await page.waitForTimeout((Math.round(variant.recovery * 20) / 20) * 1000 + 75);
    }
    const samples = await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: event-owned observations.
      return (window as any).__basicSamples as {
        step: number;
        driftSeconds: number;
        clipDuration: number;
        actionDuration: number;
      }[];
    });
    results.push({ profile, samples, errors });
    if (
      samples.length !== 3 ||
      samples.some(
        (sample, index) =>
          sample.step !== index ||
          sample.driftSeconds > 0.075 ||
          sample.clipDuration > sample.actionDuration + 0.05,
      ) ||
      errors.length
    )
      throw new Error(JSON.stringify({ profile, samples, errors }));
    console.log(
      `PASS ${profile}: all three finite basic releases/clip frames; animation fits action duration`,
    );
    await page.close();
  }
} finally {
  writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
