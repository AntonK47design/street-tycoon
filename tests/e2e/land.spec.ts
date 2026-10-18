import { expect, test } from '@playwright/test';
import { attachConsole, waitForGameplay } from './helpers';

type St = {
  sim: {
    state: { cash: number; quest: number; worldTime: number; flags: Record<string, boolean>; stats: { goodsSold: number; produced: number }; land: { unlocked: boolean; parcels: Array<{ id: number; facility: { kind: string } | null }>; storage: Record<string, number> } };
  };
  save(): void;
};

test('open the Outskirts, buy a parcel, build a farm, harvest and sell', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = attachConsole(page);
  await page.goto('/');
  await waitForGameplay(page);
  await page.evaluate(() => {
    const s = (window as unknown as { __st: St }).__st;
    s.sim.state.cash = 5000;
    s.sim.state.quest = 21; // "open the Outskirts"
  });
  await expect(page.locator('.land-btn')).toBeVisible();
  await page.locator('.land-btn').click({ force: true });
  await expect(page.locator('.land-panel.open')).toBeVisible();
  await page.waitForTimeout(600); // panel slides in
  await page.locator('.land-panel .btn.primary.big').click({ force: true }); // unlock
  await expect.poll(() => page.evaluate(() => (window as unknown as { __st: St }).__st.sim.state.land.unlocked)).toBe(true);
  await page.locator('.land-panel .btn.primary.big').click({ force: true }); // buy this parcel
  await expect.poll(() => page.evaluate(() => (window as unknown as { __st: St }).__st.sim.state.land.parcels.length)).toBe(1);
  await page.locator('.land-panel .facility-grid .kitchen-card').first().click({ force: true }); // farm
  await expect.poll(() => page.evaluate(() => (window as unknown as { __st: St }).__st.sim.state.land.parcels[0]?.facility?.kind)).toBe('farm');
  await page.evaluate(() => ((window as unknown as { __st: St }).__st.sim.state.worldTime += 25)); // construction done
  await expect(page.locator('.land-panel .btn.primary.big:not(.hidden)')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/land-farm-${info.project.name}.png` });
  await page.locator('.land-panel .btn.primary.big:not(.hidden)').click({ force: true }); // start
  await page.evaluate(() => ((window as unknown as { __st: St }).__st.sim.state.worldTime += 130)); // crops grow
  await expect.poll(() => page.evaluate(() => (window as unknown as { __st: St }).__st.sim.state.land.storage.wheat ?? 0)).toBeGreaterThan(0);
  await page.locator('.land-panel .icon-btn.close').click({ force: true });
  await expect(page.locator('.storage-btn')).toBeVisible();
  await page.locator('.storage-btn').click({ force: true });
  await expect(page.locator('.storage-modal .good-row')).toHaveCount(1);
  await page.screenshot({ path: `screenshots/land-storage-${info.project.name}.png` });
  await page.locator('.storage-modal .good-row .btn.buy').click({ force: true }); // sell all
  await expect.poll(() => page.evaluate(() => (window as unknown as { __st: St }).__st.sim.state.stats.goodsSold)).toBeGreaterThan(0);
  // save → reload keeps the land
  await page.evaluate(() => (window as unknown as { __st: St }).__st.save());
  await page.reload();
  await waitForGameplay(page);
  const after = await page.evaluate(() => ({ u: (window as unknown as { __st: St }).__st.sim.state.land.unlocked, k: (window as unknown as { __st: St }).__st.sim.state.land.parcels[0]?.facility?.kind }));
  expect(after).toEqual({ u: true, k: 'farm' });
  expect(errors).toEqual([]);
});
