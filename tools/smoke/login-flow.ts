/**
 * End-to-end account flow against `pnpm dev:stack` + `pnpm dev`:
 * register → create character → enter the game → open friends/guild panel →
 * create a guild → chat.
 *   pnpm smoke:login [webUrl]
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const base =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ??
  "http://localhost:5173";
const outDir = resolve(import.meta.dirname, "../../reports/smoke");
mkdirSync(outDir, { recursive: true });
const failures: string[] = [];
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures.push(msg);
};

const user = `smoke${Date.now().toString(36)}`;
const browser = await chromium.launch({
  channel: process.argv.includes("--chromium") ? undefined : "chrome",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

try {
  await page.goto(`${base}/?online&debug`);
  await page.fill('input[autocomplete="username"]', user);
  await page.fill('input[type="password"]', "password123");
  await page.click('button:has-text("Tạo tài khoản")');
  await page.waitForSelector('input[placeholder="Tên nhân vật mới"]', {
    timeout: 15_000,
  });
  check(true, "registered and logged in");
  await page.fill(
    'input[placeholder="Tên nhân vật mới"]',
    `Hiệp ${user.slice(-4)}`,
  );
  await page.click('button:has-text("Tạo nhân vật")');
  await page.waitForSelector('.chars button:has-text("Luyện Khí")', {
    timeout: 15_000,
  });
  await page.click('.chars button:has-text("Luyện Khí")');
  await page.waitForFunction(() => "__rpg" in window, null, {
    timeout: 60_000,
  });
  await page.waitForTimeout(2000);
  const debug = await page.locator(".debug").innerText();
  check(
    debug.includes("online"),
    `in game via API session (${debug.split("\n")[1]})`,
  );

  await page.click('button[title="Bạn bè & Bang hội"]');
  await page.waitForSelector('input[placeholder="Tên bang"]', {
    timeout: 10_000,
  });
  await page.fill('input[placeholder="Tên bang"]', `Bang ${user.slice(-4)}`);
  await page.click('button:has-text("Lập bang")');
  await page
    .waitForSelector('button:has-text("Rời bang")', { timeout: 10_000 })
    .catch(() => null);
  check(
    (await page.locator('button:has-text("Rời bang")').count()) === 1,
    "created a guild from the social panel",
  );
  await page.screenshot({ path: resolve(outDir, "06_social.png") });
  await page.click(".panel-head button");

  await page.keyboard.press("Enter"); // Enter focuses chat
  await page.keyboard.type("xin chào thế giới");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  check(
    (await page.locator(".chat-list").innerText()).includes(
      "xin chào thế giới",
    ),
    "chat message relayed by the server",
  );
  check(errors.length === 0, `no console errors (${errors.length})`);
  for (const e of errors) console.log(`  error: ${e}`);
} catch (err) {
  failures.push(String(err));
  console.error(err);
  await page
    .screenshot({ path: resolve(outDir, "login-failure.png") })
    .catch(() => {});
} finally {
  await browser.close();
}
console.log(
  failures.length
    ? `\nLOGIN FLOW FAILED (${failures.length})`
    : "\nLOGIN FLOW OK",
);
process.exit(failures.length ? 1 : 0);
