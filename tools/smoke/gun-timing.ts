/** Real Worker + Low gun playback: shot cadence, recoil segments and continuous rifle clip phase. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { loadContentFromDir } from '../../packages/game-data/src/node';

const content = loadContentFromDir(resolve('game-data'));
const out = resolve('reports/gun-timing');
mkdirSync(out, { recursive: true });
const results: unknown[] = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const id of ['pistol', 'carbine', 'rifle', 'shotgun', 'sniper']) {
    const def = content.ranged.get(`ranged_${id}`);
    if (!def) throw new Error(`Missing gun ${id}`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5175');
    for (const [key, value] of Object.entries({
      debug: '',
      webgl: '',
      quality: 'low',
      char: 'player_gunner',
    }))
      url.searchParams.set(key, value);
    await page.goto(url.toString());
    await page.waitForFunction(
      () => {
        // biome-ignore lint/suspicious/noExplicitAny: private renderer debug state.
        const view = (window as any).__rpg?.view;
        return view?.views.get(view.join.playerId)?.visual?.clips?.size > 0 && view.playerState;
      },
      null,
      { timeout: 60000 },
    );
    await page.evaluate((id) => {
      // biome-ignore lint/suspicious/noExplicitAny: debug view, actual equip intent.
      const view = (window as any).__rpg.view;
      const item = view.playerState.inventory.find(
        (item: { itemId: string }) => item.itemId === `item_gun_${id}`,
      );
      if (!item) throw new Error(`Missing weapon ${id}`);
      view.equip(item.instanceId);
    }, id);
    await page.waitForFunction((id) => {
      // biome-ignore lint/suspicious/noExplicitAny: private state.
      return (window as any).__rpg.view.playerState.ranged?.rangedId === `ranged_${id}`;
    }, id);
    await page.waitForTimeout(500);
    await page.evaluate(
      ({ def }) => {
        // biome-ignore lint/suspicious/noExplicitAny: actual host events, read-only animation instrumentation.
        const game = (window as any).__rpg;
        const view = game.view;
        let tick = 0;
        const samples: unknown[] = [];
        // biome-ignore lint/suspicious/noExplicitAny: test-owned log.
        (window as any).__gunTiming = samples;
        game.host.onSnapshot((snapshot: { tick: number }) => {
          tick = snapshot.tick;
        });
        // biome-ignore lint/suspicious/noExplicitAny: schema-validated host events.
        game.host.onEvents((events: any[]) => {
          for (const event of events) {
            if (event.type !== 'SHOT' || event.sourceId !== view.join.playerId) continue;
            const actor = view.views.get(view.join.playerId);
            const group = actor.visual.overlayGroup;
            if (!group) throw new Error('SHOT without upper-body recoil');
            const fps = group.targetedAnimations[0].animation.framePerSecond;
            const clip = def.anim.loop?.clip ?? def.anim.shoot;
            if (actor.visual.clips.get(clip) !== group)
              throw new Error(`Wrong recoil clip ${def.id}`);
            const sample = {
              tick,
              shotId: event.shotId,
              fps,
              frame:
                group.animatables.find((animation: { paused: boolean }) => !animation.paused)
                  ?.masterFrame ?? 0,
              speed: group.speedRatio,
              duration: actor.visual.clipSeconds(clip),
              loop: group.loopAnimation,
              from: group.animatables[0]?.fromFrame,
              to: group.animatables[0]?.toFrame,
            };
            samples.push(sample);
          }
        });
        const me = view.sampled.get(view.join.playerId);
        view.attackDown({ x: me.x, z: me.z + 8 });
      },
      { def },
    );
    await page.waitForTimeout(id === 'rifle' ? 1300 : id === 'carbine' ? 600 : 450);
    await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: real trigger release.
      (window as any).__rpg.view.attackUp();
    });
    const samples = await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: measurement log.
      return (window as any).__gunTiming as {
        tick: number;
        frame: number;
        fps: number;
        speed: number;
        duration: number;
        loop: boolean;
        from: number;
        to: number;
      }[];
    });
    if (!samples.length || errors.length) throw new Error(JSON.stringify({ id, samples, errors }));
    if (def.anim.loop) {
      if (samples.length < 8) throw new Error(`Insufficient rifle cadence ${samples.length}`);
      const intervalTicks = Math.max(1, Math.round(def.fireInterval * 20));
      const first = samples[0];
      if (!first) throw new Error('Missing first shot');
      let elapsed = 0;
      let maxDrift = 0;
      for (let index = 1; index < samples.length; index++) {
        const previous = samples[index - 1],
          sample = samples[index];
        if (!sample || !previous) continue;
        if (sample.tick - previous.tick !== intervalTicks)
          throw new Error(`Rifle shot cadence ${sample.tick - previous.tick}`);
        const cycleFrames = sample.duration * sample.fps;
        elapsed +=
          ((sample.frame - previous.frame + cycleFrames) % cycleFrames) / sample.fps / sample.speed;
        maxDrift = Math.max(maxDrift, Math.abs(elapsed - (sample.tick - first.tick) / 20));
        if (
          !sample.loop ||
          Math.abs(sample.duration / sample.speed / def.anim.loop.shots - intervalTicks / 20) >
            0.001
        )
          throw new Error('Rifle visual cadence differs from authoritative cadence');
      }
      if (maxDrift > 0.075) throw new Error(`Rifle clip phase drift ${maxDrift}`);
      results.push({ id, samples, maxDriftSeconds: maxDrift });
      console.log(
        `PASS rifle ${samples.length} shots: continuous recoil drift ${Math.round(maxDrift * 1000)}ms`,
      );
    } else {
      for (const sample of samples) {
        if (
          Math.abs(sample.from / sample.fps - def.anim.shootFrom) > 0.001 ||
          Math.abs(sample.speed - def.anim.shootSpeed) > 0.001
        )
          throw new Error(`Wrong live recoil segment ${id}`);
      }
      // Authored Shoot recoil begins around clip time 0.30s (D-033).
      const lead = Math.max(0, 0.3 - def.anim.shootFrom) / def.anim.shootSpeed;
      if (lead > 0.05) throw new Error(`Recoil after SHOT is too late ${id}: ${lead}`);
      if (
        def.burst &&
        (samples.length !== def.burst.count ||
          samples
            .slice(1)
            .some(
              (sample, index) =>
                sample.tick - (samples[index]?.tick ?? 0) !==
                Math.max(1, Math.round((def.burst?.interval ?? 0) * 20)),
            ))
      )
        throw new Error('Burst cadence differs from authored ticks');
      results.push({ id, samples, recoilLeadSeconds: lead });
      console.log(`PASS ${id}: live recoil segment, shot→recoil lead ${Math.round(lead * 1000)}ms`);
    }
    await page.close();
  }
} finally {
  writeFileSync(resolve(out, 'live.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
