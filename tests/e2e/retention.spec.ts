import { expect, test } from '@playwright/test';
import { attachConsole, waitForGameplay } from './helpers';

type Any = Record<string, unknown>;

test('returning after 2 h: offline earnings popup, then daily reward', async ({ page }, info) => {
  const errors = attachConsole(page);
  await page.goto('/');
  await waitForGameplay(page);
  // a player with a cook, past the second cart, who left two hours ago yesterday
  await page.evaluate(() => {
    const st = (window as unknown as { __st: Any }).__st as {
      sim: { state: Any & { cash: number; quest: number }; hire(k: number, ci: number): number };
      loop: { simPaused: boolean };
      platform: { dataGet(k: string): string | null; dataSet(k: string, v: string): void };
      save(): void;
      freezeSaves(): void;
    };
    st.sim.state.cash = 1000;
    st.sim.hire(0, 0);
    st.sim.state.quest = 6;
    st.loop.simPaused = true;
    st.save();
    // through the platform layer: the SDK (when it loads) stores data under its own keys
    const raw = JSON.parse(st.platform.dataGet('save') as string) as Any & { savedAt: number; stats: Any };
    raw.savedAt -= 2 * 3600 * 1000;
    raw.stats.lastDay = '2000-01-01';
    st.platform.dataSet('save', JSON.stringify(raw));
    st.freezeSaves();
  });
  const cashBefore = 1000 - 220;
  await page.reload();
  await waitForGameplay(page);
  await expect(page.locator('.offline-modal')).toBeVisible();
  await expect(page.locator('.offline-big')).toContainText('+$');
  // blocking: the platform got gameplayStop for the popup
  const log = await page.evaluate(() => ((window as unknown as { __st: { platform: { log: Array<{ msg: string }> } } }).__st.platform.log.map((l) => l.msg)));
  expect(log).toContain('gameplayStop');
  await page.screenshot({ path: `screenshots/offline-${info.project.name}.png` });
  await page.locator('.offline-modal .btn.primary').click();
  await expect(page.locator('.daily-modal')).toBeVisible();
  await page.screenshot({ path: `screenshots/daily-${info.project.name}.png` });
  await page.locator('.daily-modal .btn.primary').click();
  await expect(page.locator('.daily-modal .btn.primary')).toBeDisabled();
  const cash = await page.evaluate(() => ((window as unknown as { __st: { sim: { state: { cash: number } } } }).__st.sim.state.cash));
  expect(cash).toBeGreaterThan(cashBefore + 60);
  expect(errors).toEqual([]);
});
