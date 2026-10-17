import { expect, test } from '@playwright/test';
import { attachConsole, waitForGameplay } from './helpers';

type St = {
  sim: { state: { cash: number; quest: number; stats: { shopSales: number; properties: number }; properties: Array<{ shop: { items: unknown[] } | null }> } };
  ui: { openProperty(pi: number): void };
};
const st = 'window.__st';

test('rent a shop, furnish it in the editor, customers buy', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = attachConsole(page);
  await page.goto('/');
  await waitForGameplay(page);
  await page.evaluate(() => {
    const s = (window as unknown as { __st: St }).__st;
    s.sim.state.cash = 3000;
    s.sim.state.quest = 8; // "rent your first shop"
    s.ui.openProperty(0);
  });
  await expect(page.locator('.property-panel.open')).toBeVisible();
  await page.screenshot({ path: `screenshots/shop-rent-${info.project.name}.png` });
  await page.locator('.property-panel .kitchen-card').nth(1).click({ force: true }); // flower shop
  await page.locator('.property-panel .btn.primary.big').click({ force: true }); // rent
  // renting jumps straight into the editor
  await expect(page.locator('.editor-bar')).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { __st: St }).__st.sim.state.properties[0]!.shop!.items.length);
  await page.locator('.cat-item').nth(4).click({ force: true }); // plant
  await expect(page.locator('.editor-ctx')).toBeVisible();
  await page.locator('.editor-ctx .btn.primary').click({ force: true }); // place
  await expect.poll(() => page.evaluate(() => (window as unknown as { __st: St }).__st.sim.state.properties[0]!.shop!.items.length)).toBe(before + 1);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `screenshots/shop-editor-${info.project.name}.png` });
  await page.locator('.editor-top .btn.primary').click({ force: true }); // done
  await expect(page.locator('.editor-bar')).toBeHidden();
  await expect(page.locator('.property-panel.open')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __st: St }).__st.sim.state.stats.shopSales), { timeout: 60_000 }).toBeGreaterThan(0);
  void st;
  expect(errors).toEqual([]);
});
