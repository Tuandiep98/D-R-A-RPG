/** Real API auth + real-time Colyseus + Low browser; isolated in-memory database. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { buildApi } from '../../apps/api-server/src/app';
import { loadConfig } from '../../apps/game-server/src/config';
import { startGameServer } from '../../apps/game-server/src/server';
import { ZoneRoom } from '../../apps/game-server/src/zone-room';
import { hashPassword } from '../../packages/auth/src';
import { openDatabase } from '../../packages/persistence/src/db';

const out = resolve('reports/online-kits');
const profiles = [
  'player_default',
  'player_phap',
  'player_the',
  'player_tran',
  'player_anh',
  'player_thu',
];
const onlyProfile = process.argv[3];
if (onlyProfile && !profiles.includes(onlyProfile))
  throw new Error(`Unknown profile ${onlyProfile}`);
mkdirSync(out, { recursive: true });
const database = await openDatabase({});
const game = await startGameServer(
  loadConfig({
    NODE_ENV: 'test',
    PORT: '0',
    HOST: '127.0.0.1',
    AUTH_SECRET: 'online-kit-smoke-local-only-test-secret!',
    LOG_LEVEL: 'fatal',
    COMBAT_CONTENT: 'starter',
    AUTOSAVE_SECONDS: '2',
  }),
  { database },
);
const { repo, tokens, content, navFor } = ZoneRoom.deps;
const api = await buildApi({
  repo,
  tokens,
  content,
  gameServerUrl: `ws://127.0.0.1:${game.port}`,
  corsOrigins: [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/],
  logLevel: 'fatal',
  rateLimit: false,
});
const apiUrl = await api.listen({ host: '127.0.0.1', port: 0 });
const password = 'online-kit-test-password';
const hash = await hashPassword(password);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results: unknown[] = [];
try {
  for (const profile of profiles) {
    if (onlyProfile && profile !== onlyProfile) continue;
    const def = content.characters.get(profile);
    if (!def) throw new Error(`missing profile ${profile}`);
    const username = `online_${profile}`;
    const name = `Test ${profile.slice(7)}`;
    const accountId = await repo.createAccount(username, hash);
    const mapId = 'map_forest_mechanism_01';
    const characterId = await repo.createCharacter({
      accountId,
      name,
      characterDefId: profile,
      mapId,
      element: 'moc',
      expression: profile === 'player_default' ? 'thunder' : 'base',
    });
    const stored = await repo.loadCharacter(characterId);
    if (!stored) throw new Error('missing saved fixture');
    const pos = navFor(mapId)?.closest({ x: -10, z: 10 }) ?? { x: -10, z: 10 };
    // Pre-learned authored mid-game save; no world clock/stat/cost overrides after join.
    await repo.saveCharacter(
      characterId,
      {
        ...stored.save,
        realm: 'truc_co',
        learnedSkills: def.prototypeSkills,
        hp: def.stats.hp,
        mp: def.stats.mp,
        inventory:
          profile === 'player_default'
            ? [{ instanceId: 'online-sword', itemId: 'item_sword_iron', count: 1 }]
            : [],
        equipment: profile === 'player_default' ? { main_hand: 'online-sword' } : {},
      },
      { mapId, ...pos },
      [],
    );
    const context = await browser.newContext({
      viewport: {
        width: profile === 'player_thu' ? 390 : 1440,
        height: profile === 'player_thu' ? 844 : 900,
      },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Forward the production client's configured API origin to this real ephemeral HTTP API.
    await page.route('http://localhost:3000/**', async (route) => {
      const source = new URL(route.request().url());
      const response = await route.fetch({ url: `${apiUrl}${source.pathname}${source.search}` });
      await route.fulfill({ response });
    });
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5175');
    for (const [key, value] of Object.entries({ online: '', debug: '', webgl: '', quality: 'low' }))
      url.searchParams.set(key, value);
    await page.goto(url.toString());
    await page.locator('input[autocomplete="username"]').fill(username);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.locator('.chars button').filter({ hasText: name }).click();
    await page.waitForFunction(
      () => {
        // biome-ignore lint/suspicious/noExplicitAny: browser debug view from real online game.
        return !!(window as any).__rpg?.view.playerState;
      },
      null,
      { timeout: 60000 },
    );
    if (!(await page.locator('.debug').innerText()).includes('online'))
      throw new Error('not online');
    const timings = def.prototypeSkills.flatMap((id) => {
      const skill = content.skills.get(id);
      if (!skill?.anim?.cast) return [];
      return [
        {
          id,
          clip: skill.anim.cast,
          speed: skill.anim.castSpeed,
          seconds:
            Math.round((skill.timeline?.windup ?? skill.castTime) * 20) / 20 +
            (skill.effects.some((effect) => effect.type === 'dash')
              ? Math.round((skill.timeline?.active ?? 0) * 20) / 20
              : 0),
        },
      ];
    });
    await page.evaluate((timings) => {
      // biome-ignore lint/suspicious/noExplicitAny: real network event trace.
      const game = (window as any).__rpg;
      // biome-ignore lint/suspicious/noExplicitAny: test-owned log.
      (window as any).__onlineEvents = [];
      // biome-ignore lint/suspicious/noExplicitAny: test-owned first-impact clip measurements.
      (window as any).__onlineTimings = {};
      const starts = new Map<string, number>();
      const incomingMelee = new Map<string, number>();
      game.host.onEvents((events: unknown[]) => {
        // biome-ignore lint/suspicious/noExplicitAny: test-owned log.
        (window as any).__onlineEvents.push(...events);
        // biome-ignore lint/suspicious/noExplicitAny: renderer inspection from real network events.
        for (const event of events as any[]) {
          const timing = timings.find((entry) => entry.id === event.skillId);
          if (timing && event.type === 'CAST_START' && event.sourceId === game.view.join.playerId)
            starts.set(timing.id, performance.now());
          // biome-ignore lint/suspicious/noExplicitAny: debug measurement storage.
          const measured = (window as any).__onlineTimings;
          if (
            event.type === 'DAMAGE' &&
            event.targetId === game.view.join.playerId &&
            !event.skillId
          )
            for (const entry of timings)
              if (starts.has(entry.id) && !measured[entry.id])
                incomingMelee.set(entry.id, (incomingMelee.get(entry.id) ?? 0) + 1);
          if (
            !timing ||
            event.sourceId !== game.view.join.playerId ||
            measured[timing.id] ||
            (event.type !== 'SKILL_IMPACT' && event.type !== 'SKILL_PROJECTILE')
          )
            continue;
          const group = game.view.views.get(game.view.join.playerId).visual.clips.get(timing.clip);
          const fps = group.targetedAnimations[0].animation.framePerSecond;
          const frame =
            group.animatables.find((animation: { paused: boolean }) => !animation.paused)
              ?.masterFrame ?? group.getCurrentFrame();
          const expected = Math.min(group.to, group.from + timing.seconds * timing.speed * fps);
          const wallSeconds =
            (performance.now() - (starts.get(timing.id) ?? performance.now())) / 1000;
          const playbackExpected = Math.min(
            group.to,
            group.from + wallSeconds * timing.speed * fps,
          );
          measured[timing.id] = {
            ...timing,
            frame,
            expected,
            driftSeconds: Math.abs(frame - expected) / fps / timing.speed,
            wallSeconds,
            deliveryDeltaSeconds: wallSeconds - timing.seconds,
            playbackDriftSeconds: Math.abs(frame - playbackExpected) / fps / timing.speed,
            incomingMeleeHits: incomingMelee.get(timing.id) ?? 0,
            speedAtImpact: group.speedRatio,
            line: event.line ?? null,
          };
        }
      });
      game.view.send({ type: 'BASIC_ATTACK' });
    }, timings);
    await page.waitForTimeout(800);
    for (const action of ['roll', 'blink', 'jump']) {
      await page.evaluate((action) => {
        // biome-ignore lint/suspicious/noExplicitAny: actual mobility input.
        (window as any).__rpg.view.send({ type: 'MOBILITY', action });
      }, action);
      await page.waitForTimeout(500);
    }
    const skills =
      profile === 'player_default'
        ? [
            'skill_thunder_arc',
            'skill_thunder_pierce',
            'skill_thunder_execution',
            'skill_thunder_judgement',
          ]
        : def.prototypeSkills;
    for (const skillId of skills) {
      const skill = content.skills.get(skillId);
      if (!skill) throw new Error(`missing skill ${skillId}`);
      const petCommand = skill.effects.some(
        (effect) => effect.type === 'pet_attack' || effect.type === 'pet_support',
      );
      let started = false;
      for (let attempt = 0; attempt < 10 && !started; attempt++) {
        await page.evaluate(
          ({ skillId, petCommand, range }) => {
            // biome-ignore lint/suspicious/noExplicitAny: snapshots select an aim; only real intents mutate sim.
            const view = (window as any).__rpg.view;
            const me = view.sampled.get(view.join.playerId);
            if (petCommand) {
              const pet = [...view.sampled.values()].find(
                // biome-ignore lint/suspicious/noExplicitAny: owned pet from authoritative snapshot.
                (entity: any) =>
                  entity.state.kind === 'pet' &&
                  entity.state.ownerId === view.join.playerId &&
                  entity.state.hp > 0,
              );
              if (pet && Math.hypot(pet.x - me.x, pet.z - me.z) > range - 0.5) {
                view.send({ type: 'MOVE_TO', target: { x: pet.x, z: pet.z } });
                return;
              }
            }
            const candidates = [...view.sampled.values()].filter(
              // biome-ignore lint/suspicious/noExplicitAny: private sampled entities.
              (entity: any) => entity.state.kind === 'monster' && entity.state.hp > 0,
            );
            candidates.sort(
              (a: { x: number; z: number }, b: { x: number; z: number }) =>
                Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z),
            );
            const target = candidates[0];
            view.send({
              type: 'CAST_SKILL',
              skillId,
              ...(skillId === 'skill_anh_pursuit' && target ? { targetId: target.state.id } : {}),
              point:
                target && Math.hypot(target.x - me.x, target.z - me.z) < 5
                  ? { x: target.x, z: target.z }
                  : { x: me.x, z: me.z + 1 },
            });
          },
          { skillId, petCommand, range: skill.range },
        );
        await page.waitForTimeout(500);
        started = await page.evaluate((skillId) => {
          // biome-ignore lint/suspicious/noExplicitAny: trace from real Colyseus events.
          return (window as any).__onlineEvents.some(
            (event: { type: string; skillId?: string }) =>
              event.type === 'CAST_START' && event.skillId === skillId,
          );
        }, skillId);
      }
      if (!started) {
        const diagnostic = await page.evaluate(() => {
          // biome-ignore lint/suspicious/noExplicitAny: failure evidence from authoritative snapshots/events.
          const win = window as any;
          return {
            state: win.__rpg.view.playerState,
            snapshot: win.__rpg.view.buffer.latest,
            events: win.__onlineEvents.slice(-60),
          };
        });
        writeFileSync(
          resolve(out, `${profile}-failure.json`),
          JSON.stringify({ skillId, diagnostic }, null, 2),
        );
        throw new Error(`${profile}: no cast ${skillId}; see failure.json`);
      }
      await page.waitForTimeout(1000);
    }
    const before = await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: authoritative private state.
      const win = window as any;
      const view = win.__rpg.view;
      const own = win.__onlineEvents.filter(
        (event: { sourceId?: number }) => event.sourceId === view.join.playerId,
      );
      return {
        state: view.playerState,
        tick: view.buffer.latest.tick,
        count: own.length,
        timings: win.__onlineTimings as Record<
          string,
          { driftSeconds: number; speed: number; speedAtImpact: number }
        >,
        basic: own.some((event: { type: string }) => event.type === 'ATTACK'),
        mobility: ['skill_roll', 'skill_blink', 'skill_jump'].every((id) =>
          own.some(
            (event: { type: string; skillId?: string }) =>
              event.type === 'CAST_START' && event.skillId === id,
          ),
        ),
      };
    });
    if (!before.basic || !before.mobility)
      throw new Error(`${profile}: missing basic/mobility server events`);
    writeFileSync(resolve(out, `${profile}-timings.json`), JSON.stringify(before.timings, null, 2));
    for (const skillId of skills) {
      const timing = before.timings[skillId];
      if (
        !timing ||
        timing.driftSeconds > 0.075 ||
        Math.abs(timing.speedAtImpact - timing.speed) > 0.001
      )
        throw new Error(`${profile}: clip timing ${skillId}: ${JSON.stringify(timing)}`);
    }
    if (errors.length) throw new Error(JSON.stringify(errors));
    await page.screenshot({ path: resolve(out, `${profile}.png`) });
    await page.waitForTimeout(2200);
    await page.reload();
    await page.locator('.chars button').filter({ hasText: name }).click();
    await page.waitForFunction(
      () => {
        // biome-ignore lint/suspicious/noExplicitAny: fresh online join.
        return !!(window as any).__rpg?.view.playerState;
      },
      null,
      { timeout: 60000 },
    );
    const after = await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: fresh authoritative private state.
      const view = (window as any).__rpg.view;
      return { state: view.playerState, tick: view.buffer.latest.tick };
    });
    if (
      after.state.characterId !== profile ||
      !skills.every((id) =>
        after.state.skills.some((entry: { skillId: string }) => entry.skillId === id),
      ) ||
      errors.length
    )
      throw new Error(`reload lost kit ${profile}`);
    const ultimate = skills.at(-1);
    const ready = (state: { skills: { skillId: string; readyAtTick: number }[] }, tick: number) =>
      Math.max(
        0,
        (state.skills.find((entry) => entry.skillId === ultimate)?.readyAtTick ?? 0) - tick,
      );
    const beforeCd = ready(before.state, before.tick),
      afterCd = ready(after.state, after.tick);
    if (
      beforeCd <= 0 ||
      afterCd <= 0 ||
      afterCd > beforeCd + 1 ||
      after.state.element !== before.state.element ||
      after.state.expression !== before.state.expression
    )
      throw new Error(`reload lost affinity/cooldown ${profile}: ${beforeCd} → ${afterCd}`);
    results.push({
      profile,
      eventCount: before.count,
      timings: before.timings,
      before: before.state,
      after: after.state,
      beforeCooldownTicks: beforeCd,
      afterCooldownTicks: afterCd,
    });
    console.log(
      `PASS ${profile}: real HTTP login/session → Low online basic/mobility/skills → refresh/rejoin`,
    );
    await context.close();
  }
} finally {
  writeFileSync(
    resolve(out, onlyProfile ? `results-${onlyProfile}.json` : 'results.json'),
    JSON.stringify(results, null, 2),
  );
  await browser.close();
  await api.close();
  await game.close();
  await database.close();
}
