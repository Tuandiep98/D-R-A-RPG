/** Creation design preview audit, using an isolated API fixture (no player accounts written). */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const folder = resolve('reports/element-preview');
mkdirSync(folder, { recursive: true });
const sizes = [
  [1440, 900],
  [1280, 720],
  [1024, 640],
  [820, 1180],
  [1180, 820],
  [390, 844],
  [360, 640],
  [844, 390],
  [667, 375],
];
const elements = ['kim', 'moc', 'thuy', 'hoa', 'tho'];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [width = 1280, height = 720] of sizes) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    const created: { characterDefId?: string; element?: string }[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/auth/login', (route) =>
      route.fulfill({ json: { accessToken: 'preview-fixture', refreshToken: 'preview-fixture' } }),
    );
    await page.route('**/characters', (route) => {
      if (route.request().method() === 'POST') {
        created.push(route.request().postDataJSON());
        return route.fulfill({ status: 201, json: { id: 'preview-fixture-character' } });
      }
      return route.fulfill({ json: { characters: [] } });
    });
    await page.goto(`${base}/?online&quality=low`);
    await page.getByPlaceholder('Tên đăng nhập').fill('preview');
    await page.getByPlaceholder('Mật khẩu').fill('preview-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByLabel('Ngũ hành bản mệnh').waitFor();
    await page.getByLabel('Ngũ hành bản mệnh').selectOption('kim');
    for (const kit of [
      'player_default',
      'player_phap',
      'player_the',
      'player_tran',
      'player_anh',
      'player_thu',
    ]) {
      await page.getByLabel('Bộ kỹ năng khởi đầu').selectOption(kit);
      await page.getByPlaceholder('Tên nhân vật mới').fill('Preview Kit');
      await page.getByRole('button', { name: 'Tạo nhân vật', exact: true }).click();
      await page.waitForFunction(
        () =>
          (document.querySelector('input[placeholder="Tên nhân vật mới"]') as HTMLInputElement)
            ?.value === '',
      );
      if (created.at(-1)?.characterDefId !== kit || created.at(-1)?.element !== 'kim')
        throw new Error('Creation form submitted the wrong kit or affinity');
    }
    for (const element of elements) {
      await page.getByLabel('Ngũ hành bản mệnh').selectOption(element);
      await page.locator('.element-preview').scrollIntoViewIfNeeded();
      for (const action of ['Đánh thường', 'Lộn', 'Tốc biến', 'Nhảy']) {
        const button = page.getByRole('button', { name: action, exact: true });
        await button.click();
        await page.waitForTimeout(50);
        if ((await button.getAttribute('aria-pressed')) !== 'true')
          throw new Error(`${element}: action selection failed`);
      }
      await page.getByRole('button', { name: 'Súng', exact: true }).click();
      await page.getByRole('button', { name: 'Kiếm', exact: true }).click();
      await page.getByRole('button', { name: 'Đánh thường', exact: true }).click();
      await page.waitForTimeout(50);
      const issues = await page.evaluate(() => {
        const problems: string[] = [];
        if (document.documentElement.scrollWidth > innerWidth + 1)
          problems.push('horizontal overflow');
        for (const button of document.querySelectorAll('.element-preview button')) {
          const box = button.getBoundingClientRect();
          if (box.width < 44 || box.height < 44)
            problems.push(`small target: ${button.textContent}`);
        }
        const form = document.querySelector('.chars');
        if (
          form &&
          getComputedStyle(form).backdropFilter !== 'blur(0px)' &&
          getComputedStyle(form).backdropFilter !== 'none'
        )
          problems.push('blur enabled on Low');
        return problems;
      });
      if (issues.length || errors.length)
        throw new Error(`${width}x${height}/${element}: ${[...issues, ...errors].join(', ')}`);
      await page.screenshot({
        path: resolve(folder, `${width}x${height}-${element}.png`),
        fullPage: true,
      });
    }
    for (const [element, expression] of [
      ['moc', 'thunder'],
      ['thuy', 'ice'],
    ]) {
      await page.getByLabel('Ngũ hành bản mệnh').selectOption(element ?? 'moc');
      await page.getByLabel('Biểu hiện', { exact: true }).selectOption(expression ?? 'base');
      await page.locator('.element-preview').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(folder, `${width}x${height}-${expression}.png`),
        fullPage: true,
      });
    }
    console.log(`preview OK ${width}x${height}: 5 elements, 2 expressions, basic/roll/blink/jump`);
    await context.close();
  }
} finally {
  await browser.close();
}
