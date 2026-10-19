/**
 * Lôi Kiếm Tu kit smoke (phantom-step / giant-sword / thunder-domain /
 * long-cut / tribulation FX):
 *   pnpm dev              (in another terminal)
 *   pnpm smoke:kit [url] [--skill=leap] [--element=hoa]
 * Offline in the main thread (`?noworker`) so the test can reach the world:
 * learns the skill, lines three dummies up in front of the player, casts and
 * takes timed shots. Screenshots → reports/kit/<skill>_<element>_<n>.png.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

interface Case {
  skill: string;
  id: string;
  /** Seconds after the cast to take each shot. */
  shots: number[];
  /** Cast again after this many seconds (toggle off). */
  recast?: number;
  point?: boolean;
  /** Camera distance (closer for small effects). */
  radius?: number;
}

const SKILLS: Case[] = [
  {
    skill: 'step',
    id: 'skill_thunder_step',
    shots: [0.12, 0.28, 0.6],
    point: true,
    radius: 9,
  },
  { skill: 'leap', id: 'skill_thunder_leap', shots: [0.25, 0.5, 1.2] },
  {
    skill: 'field',
    id: 'skill_thunder_field',
    shots: [0.7, 1.6, 3.2],
    recast: 2.6,
    radius: 11,
  },
  {
    skill: 'execution',
    id: 'skill_thunder_execution',
    shots: [0.42, 0.6, 1.1],
    point: true,
  },
  {
    skill: 'judgement',
    id: 'skill_thunder_judgement',
    shots: [0.95, 1.7, 2.4, 3.6],
  },
];
const ELEMENTS = ['loi', 'hoa', 'kim', 'thuy', 'tho', 'moc', 'bang'];

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
const only = args.find((a) => a.startsWith('--skill='))?.slice(8);
const onlyElement = args.find((a) => a.startsWith('--element='))?.slice(10);
const levels = args.includes('--levels');
const outDir = resolve(import.meta.dirname, '../../reports/kit');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
for (const c of SKILLS.filter((s) => !only || s.skill === only)) {
  const elements = onlyElement ? [onlyElement] : ELEMENTS;
  const variants: [string, number, string][] = elements.map((e) => [e, 1, 'high']);
  if (levels) variants.push(['hoa', 0, 'high'], ['hoa', 2, 'high'], ['loi', 1, 'low']);
  for (const [element, level, quality] of variants) {
    const name = `${c.skill}_${element}${level !== 1 ? `_${level * 100}` : ''}${quality === 'low' ? '_low' : ''}`;
    const page = await browser.newPage({
      viewport: { width: 1000, height: 720 },
    });
    page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
    await page.goto(
      `${base}/?debug&noworker&quality=${quality}&map=map_sandbox_01&element=${element}`,
    );
    await page.waitForFunction(() => '__rpg' in window, null, {
      timeout: 60_000,
    });
    await page.waitForTimeout(3000);
    await page.evaluate(
      ([id, lvl, point, distance]) => {
        // biome-ignore lint/suspicious/noExplicitAny: debug hook
        const { view, host } = (window as any).__rpg;
        view.setElementAura(lvl);
        const world = host.world;
        const me = world.entities.get(view.join.playerId);
        me.skills.set(id, 0);
        me.stats.mp = me.stats.maxMp = 400;
        me.yaw = Math.PI / 2;
        me.movement.dir = null;
        // Three dummies in a row along +x, in front of the player.
        const mobs = [...world.entities.values()].filter(
          // biome-ignore lint/suspicious/noExplicitAny: debug hook
          (e: any) => e.kind === 'monster' && e.life.alive,
        );
        mobs.slice(0, 3).forEach(
          // biome-ignore lint/suspicious/noExplicitAny: debug hook
          (m: any, i: number) => {
            m.ai = null;
            m.stats.hp = m.stats.maxHp = 1_000_000;
            m.pos = {
              x: me.pos.x + 2.6 + i * 2.2,
              z: me.pos.z + (i - 1) * 0.6,
            };
            m.previousPos = { ...m.pos };
            m.movement.goal = null;
            m.movement.path = null;
          },
        );
        for (const m of mobs.slice(3)) m.pos = { x: me.pos.x - 40, z: me.pos.z - 40 };
        if (mobs[2]) me.combat.targetId = mobs[2].id;
        const cam = view.rig.camera;
        cam.beta = 0.92;
        cam.radius = distance;
        cam.alpha = -Math.PI / 2;
        (window as unknown as { __cast: () => void }).__cast = () =>
          view.send({
            type: 'CAST_SKILL',
            skillId: id,
            ...(point ? { point: { x: me.pos.x + 7, z: me.pos.z } } : {}),
          });
      },
      [c.id, level, !!c.point, c.radius ?? 15] as const,
    );
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as unknown as { __cast: () => void }).__cast());
    let t = 0;
    let recast = c.recast;
    for (const [i, at] of c.shots.entries()) {
      if (recast !== undefined && recast <= at) {
        await page.waitForTimeout((recast - t) * 1000);
        t = recast;
        recast = undefined;
        await page.evaluate(() => (window as unknown as { __cast: () => void }).__cast());
      }
      await page.waitForTimeout(Math.max(0, at - t) * 1000);
      t = at;
      await page.screenshot({ path: resolve(outDir, `${name}_${i}.png`) });
    }
    await page.close();
    console.log(`shot ${name}`);
  }
}
await browser.close();
if (errors.length) {
  console.log(`FAIL page errors: ${errors.slice(0, 3).join(' | ')}`);
  process.exit(1);
}
console.log(`screenshots → ${outDir}`);
