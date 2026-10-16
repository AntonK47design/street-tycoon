import { expect, test } from '@playwright/test';
import { attachConsole, waitForGameplay, type StHandle } from './helpers';

type Win = { __st: StHandle & { sim: StHandle['sim'] & { state: Record<string, unknown> } } };

test('loads straight into the game, no errors, interactive < 10 s', async ({ page }, info) => {
  const errors = attachConsole(page);
  const t0 = Date.now();
  await page.goto('/');
  const interactive = await waitForGameplay(page);
  expect(interactive).toBeLessThan(10);
  expect(Date.now() - t0).toBeLessThan(15_000);
  // HUD + first goal + cook badge are there immediately
  await expect(page.locator('.cash-pill')).toBeVisible();
  await expect(page.locator('.goal-text')).toHaveText(/Cook your first hot dogs/);
  await expect(page.locator('.badge').first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `screenshots/smoke-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('first minute: cook via the badge, play the minigame, sell', async ({ page }, info) => {
  const errors = attachConsole(page);
  await page.goto('/');
  await waitForGameplay(page);
  const badge = page.locator('.badge').first();
  await badge.click({ force: true });
  await expect(page.locator('.mg-catch.open')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/minigame-${info.project.name}.png` });
  // timing taps until the minigame closes (it also auto-resolves after a few seconds)
  for (let i = 0; i < 12 && (await page.locator('.mg-catch.open').count()) > 0; i++) {
    await page.mouse.click(30, 200);
    await page.waitForTimeout(500);
  }
  await expect(page.locator('.mg-catch.open')).toBeHidden({ timeout: 8000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__st.sim.state.stats.cooks)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__st.sim.state.stats.served), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.goal-text')).toHaveText(/Serve 3 customers/);
  await page.screenshot({ path: `screenshots/first-sale-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('save → reload → identical state', async ({ page }) => {
  const errors = attachConsole(page);
  await page.goto('/');
  await waitForGameplay(page);
  await page.evaluate(() => {
    const st = (window as unknown as Win).__st;
    st.sim.state.cash = 321.5;
    (st.sim as unknown as { setPrice(c: number, p: number): void }).setPrice(0, 6.5);
    (st.sim as unknown as { buyUpgrade(c: number, id: string): boolean }).buyUpgrade(0, 'grill');
  });
  // pause the sim so nothing changes between the snapshot and the save
  const before = await page.evaluate(() => {
    const st = (window as unknown as Win).__st as unknown as { loop: { simPaused: boolean }; sim: { state: unknown }; save(): void };
    st.loop.simPaused = true;
    st.save();
    return JSON.stringify(st.sim.state);
  });
  await page.reload();
  await waitForGameplay(page);
  const after = await page.evaluate(() => JSON.stringify((window as unknown as Win).__st.sim.state));
  const a = JSON.parse(before) as Record<string, unknown>;
  const b = JSON.parse(after) as Record<string, unknown>;
  // the clock/time advance a few ticks after load; everything economic must match exactly
  for (const k of ['cash', 'carts', 'stats', 'quest', 'side', 'sideNext', 'flags', 'seed', 'day', 'nextCartId']) expect(b[k], k).toEqual(a[k]);
  expect(errors).toEqual([]);
});

test('works with tiny viewports and portrait', async ({ page }) => {
  for (const [w, h] of [
    [800, 450],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await waitForGameplay(page);
    await page.waitForTimeout(800);
    await expect(page.locator('.goal')).toBeVisible();
    await page.screenshot({ path: `screenshots/viewport-${w}x${h}.png` });
  }
});
