// Quick screenshot helper: node tools/shot.mjs [w] [h] [out] [waitMs] [script]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const [w = 1280, h = 720, out = 'screenshots/shot.png', wait = 3000, extra = ''] = process.argv.slice(2);
const srv = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', '4180', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:4180/?q=' + Date.now());
await page.waitForTimeout(Number(wait));
if (extra) { await page.evaluate(extra); await page.waitForTimeout(1200); }
await page.screenshot({ path: out });
const info = await page.evaluate(() => { const s = window.__st; return s ? { tier: s.view.currentTier, stats: s.view.stats(), fps: s.fps(), log: s.platform.log.map((l) => l.msg) } : null; });
console.log(JSON.stringify(info));
await browser.close();
srv.kill();
