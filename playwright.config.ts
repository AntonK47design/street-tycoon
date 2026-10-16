import { defineConfig, devices } from '@playwright/test';

const chromiumArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: { baseURL: 'http://localhost:4173/', launchOptions: { args: chromiumArgs } },
  webServer: {
    command: 'npx vite preview --outDir dist-e2e --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'mobile', use: { ...devices['Pixel 7 landscape'], browserName: 'chromium' } },
  ],
});
