import type { Page } from '@playwright/test';

/** Console errors, ignoring the blocked CrazyGames SDK request (sandbox / adblock case the game must survive). */
export function attachConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource|crazygames-sdk/.test(text)) return;
    errors.push(text);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

export interface StHandle {
  sim: {
    state: { cash: number; stats: { served: number; cooks: number }; carts: Array<{ stock: number }>; time: number };
    canCook(ci: number): string;
  };
  platform: { log: Array<{ t: number; msg: string }> };
  save(): void;
}

/** Waits for gameplayStart and returns the boot→interactive time in seconds. */
export async function waitForGameplay(page: Page): Promise<number> {
  await page.waitForFunction(() => {
    const st = (window as unknown as { __st?: StHandle }).__st;
    return !!st && st.platform.log.some((l) => l.msg === 'gameplayStart');
  }, undefined, { timeout: 15_000 });
  return page.evaluate(() => {
    const st = (window as unknown as { __st: StHandle }).__st;
    const m = st.platform.log.find((l) => l.msg.startsWith('interactive after'));
    return m ? parseFloat(m.msg.replace('interactive after ', '')) : 99;
  });
}
