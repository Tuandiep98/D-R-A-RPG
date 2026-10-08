/** Real Worker/WebGL kit smoke; core hit geometry is covered by authored-content integration tests. */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = resolve('reports/combat-kits');
mkdirSync(out, { recursive: true });
interface DebugGame {
  view: {
    playerState: { skills: { skillId: string }[] } | null;
    sampled: Map<
      number,
      { x: number; z: number; state: { kind: string; hp: number; cloakEndTick?: number | null } }
    >;
    join: { playerId: number };
    send(intent: unknown): void;
  };
  host: {
    onEvents(
      fn: (events: { type: string; skillId?: string; phase?: string }[]) => void,
    ): () => void;
  };
}
declare global {
  interface Window {
    __kitSmoke: { type: string; skillId?: string; phase?: string }[];
  }
}
const kits = [
  {
    id: 'player_thu',
    skills: ['skill_thu_strike', 'skill_thu_bond', 'skill_thu_combo', 'skill_thu_wave'],
  },
  {
    id: 'player_anh',
    skills: ['skill_anh_blade', 'skill_anh_cloak', 'skill_anh_pursuit', 'skill_anh_flurry'],
  },
  {
    id: 'player_tran',
    skills: ['skill_tran_place', 'skill_tran_pulse', 'skill_tran_link', 'skill_tran_great'],
  },
  {
    id: 'player_phap',
    skills: ['skill_phap_arrow', 'skill_phap_seal', 'skill_phap_guard', 'skill_phap_storm'],
  },
  {
    id: 'player_the',
    skills: ['skill_the_mountain', 'skill_the_guard', 'skill_the_quake', 'skill_the_avatar'],
  },
];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    if (process.argv.includes('--mobile') && viewport.width > 500) continue;
    for (const kit of kits) {
      const onlyKit = process.argv.find((arg) => arg.startsWith('--kit='))?.slice(6);
      if (onlyKit && kit.id !== onlyKit) continue;
      const context = await browser.newContext({
        viewport,
        isMobile: viewport.width < 500,
        hasTouch: viewport.width < 500,
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() =>
        localStorage.setItem('rpg.controls', JSON.stringify({ autoFullscreen: false })),
      );
      const url = new URL(base);
      for (const [key, value] of Object.entries({
        debug: '',
        webgl: '',
        quality: 'low',
        char: kit.id,
      }))
        url.searchParams.set(key, value);
      await page.goto(url.toString());
      await page.waitForFunction(
        () => !!(window as unknown as { __rpg?: DebugGame }).__rpg?.view.playerState,
        undefined,
        { timeout: 60000 },
      );
      const learned = await page.evaluate(() => {
        const game = (window as unknown as { __rpg: DebugGame }).__rpg;
        window.__kitSmoke = [];
        game.host.onEvents((events) => window.__kitSmoke.push(...events));
        return game.view.playerState?.skills.map((s) => s.skillId) ?? [];
      });
      for (const skill of kit.skills)
        if (!learned.includes(skill)) throw new Error(`${kit.id}: missing ${skill}`);
      if (kit.id === 'player_thu') {
        await page.evaluate(() =>
          (window as unknown as { __rpg: DebugGame }).__rpg.view.send({
            type: 'MOVE_TO',
            target: { x: 0, z: -32 },
          }),
        );
        await page.waitForFunction(
          () => {
            const view = (window as unknown as { __rpg: DebugGame }).__rpg.view;
            return (view.sampled.get(view.join.playerId)?.z ?? 0) < -31;
          },
          undefined,
          { timeout: 30000 },
        );
        await page.evaluate(() =>
          (window as unknown as { __rpg: DebugGame }).__rpg.view.send({ type: 'STOP' }),
        );
        await page.waitForTimeout(1000);
        await page.locator('.companion-info').waitFor({ state: 'visible' });
        await page.screenshot({ path: resolve(out, `${kit.id}-${viewport.width}-pet.png`) });
      }
      await page.evaluate(() => {
        const view = (window as unknown as { __rpg: DebugGame }).__rpg.view;
        const p = view.sampled.get(view.join.playerId);
        if (!p) throw new Error('missing player position');
        view.send({ type: 'BASIC_ATTACK', aim: { x: p.x, z: p.z + 4 } });
      });
      await page.waitForFunction(
        () => window.__kitSmoke.some((e) => e.type === 'ATTACK'),
        undefined,
        { timeout: 15000 },
      );
      await page.waitForTimeout(1500);
      for (const skillId of kit.skills) {
        if (skillId === 'skill_anh_pursuit') {
          await page.evaluate(() => {
            const view = (window as unknown as { __rpg: DebugGame }).__rpg.view;
            const p = view.sampled.get(view.join.playerId);
            if (!p) throw new Error('missing player');
            const target = [...view.sampled.values()]
              .filter((e) => e.state.kind === 'monster' && e.state.hp > 0)
              .sort(
                (a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
              )[0];
            if (!target) throw new Error('missing combat target');
            view.send({ type: 'MOVE_TO', target: { x: target.x, z: target.z } });
          });
          await page.waitForFunction(
            () => {
              const view = (window as unknown as { __rpg: DebugGame }).__rpg.view;
              const p = view.sampled.get(view.join.playerId);
              return (
                p &&
                [...view.sampled.values()].some(
                  (e) =>
                    e.state.kind === 'monster' &&
                    e.state.hp > 0 &&
                    Math.hypot(e.x - p.x, e.z - p.z) < 4.8,
                )
              );
            },
            undefined,
            { timeout: 30000 },
          );
          await page.evaluate(() =>
            (window as unknown as { __rpg: DebugGame }).__rpg.view.send({ type: 'STOP' }),
          );
          await page.waitForTimeout(400);
        }
        await page.evaluate((id) => {
          const view = (window as unknown as { __rpg: DebugGame }).__rpg.view;
          const p = view.sampled.get(view.join.playerId);
          if (!p) throw new Error('missing player position');
          const target = [...view.sampled.entries()]
            .filter(([, e]) => e.state.kind === 'monster' && e.state.hp > 0)
            .sort(
              ([, a], [, b]) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
            )[0];
          view.send({
            type: 'CAST_SKILL',
            skillId: id,
            ...(id === 'skill_anh_pursuit' ? { targetId: target?.[0] } : {}),
            point:
              id.startsWith('skill_anh') &&
              target &&
              Math.hypot(target[1].x - p.x, target[1].z - p.z) <= 7
                ? { x: target[1].x, z: target[1].z }
                : { x: p.x, z: p.z + 3 },
          });
        }, skillId);
        try {
          await page.waitForFunction(
            (id) =>
              window.__kitSmoke.some(
                (e) =>
                  e.type ===
                    (id === 'skill_phap_arrow' || id === 'skill_anh_blade'
                      ? 'SKILL_PROJECTILE'
                      : 'SKILL_IMPACT') && e.skillId === id,
              ),
            skillId,
            { timeout: 15000 },
          );
        } catch (error) {
          console.log(
            JSON.stringify({
              kit: kit.id,
              skillId,
              errors,
              trace: await page.evaluate(() => window.__kitSmoke.slice(-25)),
              state: await page.evaluate(
                () => (window as unknown as { __rpg: DebugGame }).__rpg.view.playerState,
              ),
            }),
          );
          throw error;
        }
        if (skillId === 'skill_anh_cloak') {
          await page.waitForFunction(() => {
            const view = (window as unknown as { __rpg: DebugGame }).__rpg.view;
            return !!view.sampled.get(view.join.playerId)?.state.cloakEndTick;
          });
          await page.screenshot({ path: resolve(out, `${kit.id}-${viewport.width}-cloak.png`) });
        }
        if (skillId.endsWith('_guard') || skillId === 'skill_tran_link') {
          await page.locator('.shield-info').waitFor({ state: 'visible' });
          await page.screenshot({ path: resolve(out, `${kit.id}-${viewport.width}-shield.png`) });
        }
        await page.waitForTimeout(700);
      }
      if (kit.id !== 'player_anh')
        await page.waitForFunction(
          () => window.__kitSmoke.some((e) => e.type === 'SHIELD' && e.phase === 'gain'),
          undefined,
          { timeout: 10000 },
        );
      if (kit.id === 'player_phap' || kit.id === 'player_anh') {
        await page.waitForFunction(
          (ultimate) =>
            window.__kitSmoke.filter((e) => e.type === 'SKILL_IMPACT' && e.skillId === ultimate)
              .length === 3,
          kit.id === 'player_phap' ? 'skill_phap_storm' : 'skill_anh_flurry',
          { timeout: 15000 },
        );
        if (
          kit.id === 'player_phap' &&
          !(await page.evaluate(() =>
            window.__kitSmoke.some(
              (e) => e.type === 'SKILL_PROJECTILE' && e.skillId?.startsWith('skill_phap_bolt'),
            ),
          ))
        )
          throw new Error('basic spell did not launch');
      }
      if (kit.id === 'player_thu') {
        await page.waitForFunction(
          () =>
            window.__kitSmoke.some(
              (e) => e.type === 'SKILL_PROJECTILE' && e.skillId === 'skill_pet_wave',
            ),
          undefined,
          { timeout: 15000 },
        );
      }
      const touch = viewport.width < 500;
      if (await page.locator('.menu-trigger').isVisible()) {
        if (touch) await page.locator('.menu-trigger').tap();
        else await page.locator('.menu-trigger').click();
      }
      if (touch) await page.getByRole('button', { name: 'Kỹ năng', exact: true }).tap();
      else await page.getByRole('button', { name: 'Kỹ năng', exact: true }).click();
      await page.screenshot({ path: resolve(out, `${kit.id}-${viewport.width}.png`) });
      if (errors.length) throw new Error(errors.join('\n'));
      console.log(
        `PASS ${kit.id} ${viewport.width}: basic, four skills, ${kit.id === 'player_anh' ? 'cloak' : 'shield'}, Worker events, no page errors`,
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
}
