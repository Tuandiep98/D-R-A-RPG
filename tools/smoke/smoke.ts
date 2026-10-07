/**
 * Headless smoke test of the running dev server:
 *   pnpm dev            (in another terminal)
 *   pnpm smoke [url]    (default http://localhost:5173)
 * Uses the locally installed Chrome (no browser download). Checks boot, ground-click attack,
 * click-to-attack and console errors; writes screenshots to reports/smoke/.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

interface DebugEntity {
  id: number;
  kind: string;
  action: string;
  hp: number;
  wx: number;
  wz: number;
  x: number;
  y: number;
}

const url =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ??
  "http://localhost:5173";
const outDir = resolve(import.meta.dirname, "../../reports/smoke");
mkdirSync(outDir, { recursive: true });

const failures: string[] = [];
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch({
  // --chromium: Playwright's bundled browser (CI); default: the locally installed Chrome.
  channel: process.argv.includes("--chromium")
    ? undefined
    : process.argv.includes("--edge")
      ? "msedge"
      : "chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  if (m.type() === "warning" || m.type() === "error")
    console.log(`  [console.${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(e.message));

const entities = () =>
  page.evaluate(() =>
    (
      window as unknown as {
        __rpg: { view: { debugEntities(): DebugEntity[] } };
      }
    ).__rpg.view.debugEntities(),
  );
const debugText = () =>
  page
    .locator(".debug")
    .innerText()
    .catch(() => "(no debug overlay)");

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => "__rpg" in window, null, {
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(outDir, "01_boot.png") });
  console.log(`  debug: ${(await debugText()).replace(/\n/g, " | ")}`);

  let list = await entities();
  const player = list.find((e) => e.kind === "player");
  check(!!player, "player entity rendered");
  check(
    list.filter((e) => e.kind === "monster").length === 5,
    "5 monsters rendered",
  );
  if (!player) throw new Error("no player");

  check(
    (await page.locator(".actionbar .skills .skill").count()) === 4,
    "desktop action bar has four skill slots",
  );
  await page.locator('.menu button[title="Kỹ năng"]').click();
  check(
    (await page.locator(".skill-list-item").count()) === 7,
    "skill menu lists the full default kit",
  );
  await page.screenshot({ path: resolve(outDir, "01b_skills.png") });
  await page
    .locator(".skill-list-item", { hasText: "Lôi Ảnh Trảm" })
    .getByRole("button", { name: "Gán" })
    .click();
  await page.locator(".skill-panel .panel-head button").last().click();
  check(
    (
      await page
        .locator(".actionbar .skills .skill")
        .first()
        .getAttribute("title")
    )?.includes("Lôi Ảnh Trảm") ?? false,
    "desktop skill slot accepts an assignment",
  );
  // Desktop ground click starts a basic swing instead of walking to the point.
  const start = { x: player.wx, z: player.wz };
  await page.mouse.click(player.x + 120, player.y + 60);
  const swung = await page
    .waitForFunction(
      (id) =>
        (
          window as unknown as {
            __rpg: { view: { debugEntities(): DebugEntity[] } };
          }
        ).__rpg.view
          .debugEntities()
          .some((e) => e.id === id && e.action === "cast"),
      player.id,
      { timeout: 1000 },
    )
    .then(() => true)
    .catch(() => false);
  check(swung, "desktop ground click starts a basic attack");
  await page.waitForTimeout(1000);
  list = await entities();
  const afterClick = list.find((e) => e.id === player.id);
  const dist = afterClick
    ? Math.hypot(afterClick.wx - start.x, afterClick.wz - start.z)
    : 0;
  check(dist < 1, `ground click did not issue movement (${dist.toFixed(2)} m)`);

  await page.keyboard.press("Digit1");
  const cooldown = await page
    .locator(".actionbar .skills .skill-cd")
    .first()
    .waitFor({ timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  check(cooldown, "assigned skill casts with key 1 and enters cooldown");

  // Walk forward until a monster is on screen, then click-to-attack the nearest one.
  const onScreen = (e: DebugEntity) =>
    e.x > 40 && e.x < 1240 && e.y > 90 && e.y < 660;
  const findTarget = (all: DebugEntity[]) => {
    const me = all.find((e) => e.id === player.id) ?? player;
    return all
      .filter((e) => e.kind === "monster" && e.action !== "dead" && onScreen(e))
      .sort(
        (a, b) =>
          Math.hypot(a.wx - me.wx, a.wz - me.wz) -
          Math.hypot(b.wx - me.wx, b.wz - me.wz),
      )[0];
  };
  let target = findTarget(list);
  for (let i = 0; i < 6 && !target; i++) {
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1500);
    await page.keyboard.up("KeyW");
    list = await entities();
    target = findTarget(list);
  }
  check(!!target, "found a monster to attack");
  if (target) {
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(500);
    const frame = await page
      .locator(".frame-target")
      .innerText()
      .catch(() => "");
    check(
      frame.length > 0,
      `target frame shown (${frame.replace(/\n/g, " ")})`,
    );
    await page.waitForTimeout(7000);
    await page.screenshot({ path: resolve(outDir, "02_combat.png") });
    list = await entities();
    const after = list.find((e) => e.id === target.id);
    const lootAppeared = list.some((e) => e.kind === "loot");
    check(
      !!after &&
        (after.hp < target.hp || after.action === "dead" || lootAppeared),
      `monster took damage (hp ${target.hp} → ${after?.hp})`,
    );
  }

  // Camera rotate + zoom must not throw.
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(800, 330, { steps: 8 });
  await page.mouse.up({ button: "right" });
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, "03_camera.png") });
  console.log(`  debug: ${(await debugText()).replace(/\n/g, " | ")}`);

  // Skills via hotkeys, then the inventory panel.
  await page.keyboard.press("Digit2");
  await page.waitForTimeout(600);
  await page.keyboard.press("KeyI");
  await page.waitForTimeout(400);
  check(
    (await page.locator(".panel").count()) === 1,
    "inventory panel opens with I",
  );
  await page.screenshot({ path: resolve(outDir, "04_inventory.png") });
  await page.keyboard.press("KeyI");

  // NPC dialog: talk to the elder and accept the first quest (offline only: fresh character).
  if (!url.includes("online")) {
    // Combat can leave the player far from town, especially in software-rendered
    // Chromium. Start this independent scenario at the village spawn.
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => "__rpg" in window, null, {
      timeout: 60_000,
    });
    await page.waitForTimeout(1500);
    const npcs = (await entities()).filter((e) => e.kind === "npc");
    check(npcs.length === 3, `village has 3 NPCs (${npcs.length})`);
    const elder = npcs.find((e) => e.defId === "npc_elder");
    if (elder) {
      console.log(
        `  elder on screen at ${elder.x.toFixed(0)},${elder.y.toFixed(0)}`,
      );
      if (onScreen(elder)) await page.mouse.click(elder.x, elder.y);
      else
        await page.evaluate((id) => {
          // biome-ignore lint/suspicious/noExplicitAny: debug hook
          (window as any).__rpg.view.send({ type: "INTERACT", entityId: id });
        }, elder.id);
      await page
        .waitForSelector(".npc-panel", { timeout: 30_000 })
        .catch(() => null);
      check(
        (await page.locator(".npc-panel").count()) === 1,
        "NPC dialog opens",
      );
      await page
        .locator(".npc-panel button", { hasText: "Nhận" })
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(600);
      check(
        (await page.locator(".quest-tracker .quest").count()) >= 1,
        "accepted quest shows in the tracker",
      );
      await page.screenshot({ path: resolve(outDir, "04b_npc.png") });
      await page.keyboard.press("Escape");
    }
  }

  // Second scenario: the forest map with elite and boss (offline only; online, the server owns the map).
  if (!url.includes("online")) {
    await page.goto(
      `${url}${url.includes("?") ? "&" : "?"}map=map_forest_mechanism_01`,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await page.waitForFunction(() => "__rpg" in window, null, {
      timeout: 60_000,
    });
    await page.waitForTimeout(2500);
    const forest = await entities();
    const mobs = forest.filter((e) => e.kind === "monster");
    check(mobs.length >= 18, `forest spawns monsters (${mobs.length})`);
    check(
      mobs.some((e) => e.defId === "mech_golem_001"),
      "forest has the boss",
    );
    check(
      mobs.some((e) => e.defId === "stag_elite_001"),
      "forest has the elite",
    );
    check(
      forest.filter((e) => e.kind === "portal").length === 3,
      "forest has three portals (town, dungeon, exit)",
    );
    console.log(`  debug: ${(await debugText()).replace(/\n/g, " | ")}`);
    await page.screenshot({ path: resolve(outDir, "05_forest.png") });
  }

  check(errors.length === 0, `no console errors (${errors.length})`);
  for (const e of errors) console.log(`  error: ${e}`);
} catch (err) {
  failures.push(String(err));
  console.error(err);
  await page
    .screenshot({ path: resolve(outDir, "failure.png") })
    .catch(() => {});
} finally {
  await browser.close();
}

console.log(
  failures.length === 0 ? "\nSMOKE OK" : `\nSMOKE FAILED (${failures.length})`,
);
console.log(`screenshots: ${outDir}`);
process.exit(failures.length === 0 ? 0 : 1);
