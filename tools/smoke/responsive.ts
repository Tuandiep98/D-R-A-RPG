/**
 * Responsive HUD audit against a running dev server:
 *   pnpm dev                       (in another terminal)
 *   pnpm smoke:responsive [url]    (default http://localhost:5173)
 * Boots the game at desktop / tablet / phone sizes, opens each window and
 * reports layout problems: horizontal page overflow, HUD/panel boxes outside
 * the viewport, overlapping HUD widgets, touch targets under 44 px and text
 * under 11 px. Screenshots go to reports/responsive/<viewport>_<state>.png.
 * Exit code 1 when any check fails (`--report` only prints).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Browser, chromium, type Page } from 'playwright-core';

const url = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';
const reportOnly = process.argv.includes('--report');
const outDir = resolve(import.meta.dirname, '../../reports/responsive');
mkdirSync(outDir, { recursive: true });

interface Viewport {
  label: string;
  width: number;
  height: number;
  touch: boolean;
}

const viewports: Viewport[] = [
  { label: 'desktop-1440', width: 1440, height: 900, touch: false },
  { label: 'desktop-1280', width: 1280, height: 720, touch: false },
  { label: 'laptop-1024', width: 1024, height: 640, touch: false },
  { label: 'tablet-portrait', width: 820, height: 1180, touch: true },
  { label: 'tablet-landscape', width: 1180, height: 820, touch: true },
  { label: 'phone-portrait', width: 390, height: 844, touch: true },
  { label: 'phone-small', width: 360, height: 640, touch: true },
  { label: 'phone-landscape', width: 844, height: 390, touch: true },
  { label: 'phone-se-landscape', width: 667, height: 375, touch: true },
];

const panels: [string, string][] = [
  ['skills', 'Kỹ năng'],
  ['inventory', 'Túi đồ (I)'],
  ['character', 'Nhân vật (C)'],
  ['cultivation', 'Tu luyện & Đột phá (K)'],
  ['settings', 'Cài đặt'],
];

/** HUD widgets that must not overlap each other while no window is open. */
const widgets = [
  '.player-hud',
  '.target-hud',
  '.frame-boss',
  '.quest',
  '.chat',
  '.menu',
  '.attack-button',
  '.action-rows',
  '.joystick-zone .joystick-base',
  '.notices',
  '.help',
  '.potion',
  '.action-reload',
  '.action-swap',
];

const failures: string[] = [];
const fail = (msg: string) => {
  console.log(`FAIL  ${msg}`);
  failures.push(msg);
};

interface Audit {
  overflowX: number;
  offscreen: string[];
  overlaps: string[];
  smallTargets: string[];
  tinyText: string[];
  panelScroll: string | null;
}

async function audit(page: Page, touch: boolean, checkOverlap: boolean) {
  return page.evaluate(
    ({ touch, checkOverlap, widgets }): Audit => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const name = (el: Element) =>
        `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')}`;
      const visible = (el: Element) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          s.display !== 'none' &&
          s.visibility !== 'hidden' &&
          Number(s.opacity) > 0.05 &&
          r.width > 0 &&
          r.height > 0
        );
      };
      const hud = document.querySelector('.hud');
      const all = hud ? [...hud.querySelectorAll('*')].filter(visible) : [];

      // Elements clipped by the viewport (ignore content inside scrollers).
      const inScroller = (el: Element) => {
        for (let p = el.parentElement; p && p !== hud; p = p.parentElement) {
          const o = getComputedStyle(p).overflowY;
          if (o === 'auto' || o === 'scroll' || o === 'hidden') return true;
        }
        return false;
      };
      const offscreen = all
        .filter((el) => !inScroller(el))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1;
        })
        .filter((el) => !el.closest('.joystick-zone'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${name(el)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}]`;
        });

      const overlaps: string[] = [];
      if (checkOverlap) {
        const boxes = widgets
          .map((sel) => [sel, document.querySelector(sel)] as const)
          .filter(([, el]) => el && visible(el))
          .map(([sel, el]) => [sel, (el as Element).getBoundingClientRect()] as const);
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const [a, ra] = boxes[i];
            const [b, rb] = boxes[j];
            const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (w > 2 && h > 2) overlaps.push(`${a} ∩ ${b} (${Math.round(w)}×${Math.round(h)})`);
          }
      }

      const smallTargets = touch
        ? all
            .filter((el) => el.matches('button, [role=button], input, select'))
            .filter((el) => {
              // A checkbox/radio inside a <label> is tapped through the label.
              const r = (el.closest('label') ?? el).getBoundingClientRect();
              return r.width < 43.5 || r.height < 43.5;
            })
            .map((el) => {
              const r = el.getBoundingClientRect();
              return `${name(el)} "${(el.getAttribute('title') ?? el.textContent ?? '').trim().slice(0, 18)}" ${Math.round(r.width)}×${Math.round(r.height)}`;
            })
        : [];

      const tinyText = all
        .filter((el) =>
          [...el.childNodes].some(
            (n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0,
          ),
        )
        .filter((el) => Number.parseFloat(getComputedStyle(el).fontSize) < 11)
        .map(
          (el) =>
            `${name(el)} ${getComputedStyle(el).fontSize} "${(el.textContent ?? '').trim().slice(0, 16)}"`,
        );

      const panel = document.querySelector('.hud .panel');
      let panelScroll: string | null = null;
      if (panel && visible(panel)) {
        const r = panel.getBoundingClientRect();
        if (r.height > vh + 1 || r.width > vw + 1)
          panelScroll = `panel ${Math.round(r.width)}×${Math.round(r.height)} > viewport`;
      }

      return {
        overflowX: document.documentElement.scrollWidth - vw,
        offscreen,
        overlaps,
        smallTargets: [...new Set(smallTargets)],
        tinyText: [...new Set(tinyText)].slice(0, 12),
        panelScroll,
      };
    },
    { touch, checkOverlap, widgets },
  );
}

function report(tag: string, a: Audit) {
  if (a.overflowX > 0) fail(`${tag}: page scrolls horizontally by ${a.overflowX}px`);
  for (const o of a.offscreen.slice(0, 8)) fail(`${tag}: off-screen ${o}`);
  for (const o of a.overlaps) fail(`${tag}: overlap ${o}`);
  for (const t of a.smallTargets.slice(0, 10)) fail(`${tag}: touch target < 44px ${t}`);
  for (const t of a.tinyText) console.log(`WARN  ${tag}: text < 11px ${t}`);
  if (a.panelScroll) fail(`${tag}: ${a.panelScroll}`);
}

async function run(browser: Browser, v: Viewport) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 2,
    isMobile: v.touch,
    hasTouch: v.touch,
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // tsx keeps function names via a `__name` helper that page.evaluate lacks.
  await page.addInitScript('window.__name = (f) => f;');
  await page.addInitScript(() => {
    try {
      localStorage.setItem('rpg.controls', JSON.stringify({ autoFullscreen: false }));
    } catch {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => '__rpg' in window, null, {
    timeout: 60_000,
  });
  await page.waitForTimeout(4000); // let the zone banner fade out
  const shot = (state: string) =>
    page.screenshot({ path: resolve(outDir, `${v.label}_${state}.png`) });

  console.log(`\n== ${v.label} ${v.width}×${v.height} ${v.touch ? 'touch' : 'desktop'}`);
  await shot('hud');
  report(`${v.label}/hud`, await audit(page, v.touch, true));

  const tap = async (sel: string) => {
    const el = page.locator(sel).first();
    if (v.touch) await el.tap();
    else await el.click();
  };
  for (const [id, title] of panels) {
    try {
      if (await page.locator('.menu-trigger').isVisible()) await tap('.menu-trigger');
      await tap(`.menu button[title="${title}"]`);
      await page.waitForTimeout(300);
      await shot(id);
      report(`${v.label}/${id}`, await audit(page, v.touch, false));
      await tap('.hud .panel .panel-head button:last-child');
      await page.waitForTimeout(150);
    } catch (err) {
      fail(`${v.label}/${id}: could not open/close (${String(err).split('\n')[0]})`);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  if (errors.length) fail(`${v.label}: page errors ${errors.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

const browser = await chromium.launch({
  channel: process.argv.includes('--chromium') ? undefined : 'chrome',
  headless: true,
});
try {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  for (const v of viewports) if (!only || v.label.includes(only)) await run(browser, v);
} finally {
  await browser.close();
}
console.log(
  failures.length
    ? `\n${failures.length} issue(s); screenshots in reports/responsive/`
    : '\nresponsive audit OK',
);
if (failures.length && !reportOnly) process.exit(1);
