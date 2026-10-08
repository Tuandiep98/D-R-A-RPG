/** Real Worker + Low renderer: cancel a melee windup with roll and reject its queued impact FX. */
import { chromium } from 'playwright-core';

const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5173');
for (const [key, value] of Object.entries({ debug: '', webgl: '', quality: 'low' }))
  url.searchParams.set(key, value);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url.toString());
  await page.waitForFunction(
    () => {
      // biome-ignore lint/suspicious/noExplicitAny: debug-only inspection of renderer state.
      const view = (window as any).__rpg?.view;
      return view?.views.get(view.join.playerId)?.visual?.clips?.size > 0;
    },
    null,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: real sim events + private renderer instrumentation.
    const game = (window as any).__rpg;
    const view = game.view;
    const log = {
      oldId: 0,
      canceled: false,
      rolled: false,
      staleCancelKeptRoll: false,
      arcs: 0,
      impacts: 0,
    };
    // biome-ignore lint/suspicious/noExplicitAny: test-owned log.
    (window as any).__cancelSmoke = log;
    const arc = view.fx.swingArc.bind(view.fx);
    const impact = view.fx.impact.bind(view.fx);
    view.fx.swingArc = (...args: unknown[]) => {
      log.arcs++;
      return arc(...args);
    };
    view.fx.impact = (...args: unknown[]) => {
      log.impacts++;
      return impact(...args);
    };
    // biome-ignore lint/suspicious/noExplicitAny: events originate from the real Worker host.
    game.host.onEvents((events: any[]) => {
      for (const event of events) {
        if (event.sourceId !== view.join.playerId) continue;
        if (event.type === 'ATTACK' && !log.oldId) {
          log.oldId = event.actionId;
          view.send({ type: 'MOBILITY', action: 'roll' });
        }
        if (event.type === 'ACTION_CANCEL' && event.actionId === log.oldId) log.canceled = true;
        if (event.type === 'CAST_START' && event.skillId === 'skill_roll') {
          log.rolled = true;
          // Simulate a late cancellation of the previous action after roll starts.
          view.handleEvents([
            { type: 'ACTION_CANCEL', sourceId: view.join.playerId, actionId: log.oldId },
          ]);
          log.staleCancelKeptRoll =
            view.presentedActions.get(view.join.playerId) === event.actionId &&
            view.views.get(view.join.playerId).visual.oneShotActive === 'cast';
        }
      }
    });
    view.send({ type: 'BASIC_ATTACK' });
  });
  await page.waitForTimeout(1200);
  const log = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test-owned log.
    return (window as any).__cancelSmoke;
  });
  if (
    !log.canceled ||
    !log.rolled ||
    !log.staleCancelKeptRoll ||
    log.arcs ||
    log.impacts ||
    errors.length
  )
    throw new Error(JSON.stringify({ log, errors }));
  console.log(
    `PASS melee cancel → roll: no stale arc/impact, late cancel preserves roll; ${JSON.stringify(log)}`,
  );
} finally {
  await browser.close();
}
