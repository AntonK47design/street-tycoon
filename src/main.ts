import '@fontsource/fredoka/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './ui/styles.css';
import { BALANCE } from './data/balance';
import { Sfx } from './audio/sfx';
import { FixedLoop } from './core/loop';
import { resolveLocale, setLocale, t } from './core/i18n';
import { loadBlob, today, writeBlob, type SaveBlob } from './core/save';
import { createPlatform, type Platform } from './platform/platform';
import { detectTier, lowerTier, resolveTier, TIERS, type Tier } from './render/quality';
import { GameView } from './render/view';
import { Sim } from './sim/sim';
import { AppUi } from './ui/app-ui';
import type { UiContext } from './ui/context';

declare global {
  interface Window {
    __stBootT0?: number;
    __st?: unknown;
  }
}

const DEBUG = import.meta.env.DEV || import.meta.env.VITE_DEBUG === '1';
const TEST_HOOKS = import.meta.env.DEV || import.meta.env.MODE === 'e2e';

function gpuName(): string {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(s ?? '');
  } catch {
    return '';
  }
}

function fatal(msg: string): void {
  const el = document.createElement('div');
  el.className = 'fatal';
  el.textContent = msg;
  document.body.append(el);
  document.getElementById('boot')?.remove();
}

async function boot(): Promise<void> {
  const platform: Platform = await createPlatform();
  platform.loadingStart();
  const { blob, fresh } = loadBlob(platform);
  blob.stats.sessions++;
  const returning = !fresh && blob.stats.lastDay !== today();
  blob.stats.lastDay = today();

  setLocale(blob.settings.lang === 'auto' ? resolveLocale([platform.locale(), navigator.language]) : blob.settings.lang);

  const device = platform.deviceType();
  const mobile = device !== 'desktop' || matchMedia('(pointer: coarse)').matches;
  const nav = navigator as Navigator & { deviceMemory?: number };
  let autoTier: Tier = detectTier({ mobile, memory: nav.deviceMemory, cores: nav.hardwareConcurrency, gpu: gpuName() });
  let tier = resolveTier(blob.settings.quality, autoTier);

  const sim = new Sim(blob.game, TIERS[tier].population);
  const root = document.getElementById('game') as HTMLElement;
  let view: GameView;
  try {
    view = new GameView(root, sim, tier, mobile);
  } catch (e) {
    fatal(t('error.webgl'));
    throw e;
  }
  const uiRoot = document.createElement('div');
  uiRoot.id = 'ui';
  root.append(uiRoot);
  document.documentElement.classList.toggle('touch', mobile);

  const sfx = new Sfx();
  sfx.setEnabled(blob.settings.sound);
  sfx.setPlatformMuted(platform.isMuted());
  platform.onMuteChange((m) => sfx.setPlatformMuted(m));

  let loop: FixedLoop | null = null;
  let blocking = false;
  let playStart = performance.now();
  const save = (): void => {
    blob.game = sim.state;
    blob.stats.playSec += (performance.now() - playStart) / 1000;
    playStart = performance.now();
    try {
      writeBlob(platform, blob);
    } catch (e) {
      platform.record(`save failed ${String(e)}`);
    }
  };
  const ctx: UiContext = {
    sim,
    view,
    sfx,
    platform,
    root: uiRoot,
    save,
    isMobile: mobile,
    setBlocking: (on) => {
      blocking = on;
      if (loop) loop.simPaused = on;
      if (on) platform.gameplayStop();
      else platform.gameplayStart();
    },
  };
  const ui = new AppUi(ctx, blob.settings, () => t(`set.${view.currentTier}`));
  ui.settingsPanel.onChange = (s) => {
    sfx.setEnabled(s.sound);
    const nt = resolveTier(s.quality, autoTier);
    if (nt !== view.currentTier) view.applyTier(nt);
    tier = nt;
    const lang = s.lang === 'auto' ? resolveLocale([platform.locale(), navigator.language]) : s.lang;
    blob.settings = s;
    save();
    if (lang !== document.documentElement.lang) location.reload();
  };

  const resize = (): void => {
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth);
    const hgt = Math.round(vv?.height ?? window.innerHeight);
    view.resize(w, hgt);
    document.documentElement.classList.toggle('portrait', hgt > w);
    document.documentElement.classList.toggle('compact', Math.min(w, hgt) < 560);
  };
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  resize();

  // FPS probe: in the first seconds and continuously after, step quality down if frames are slow (auto only)
  let fpsAcc = 0;
  let fpsFrames = 0;
  let slowFor = 0;
  let fps = 60;
  let started = false;
  const bootT0 = window.__stBootT0 ?? 0;

  loop = new FixedLoop(1 / BALANCE.SIM_HZ, {
    update: () => sim.step(),
    render: (alpha, dt) => {
      ui.update(dt);
      view.render(alpha, dt);
      if (!started) {
        started = true;
        platform.loadingStop();
        platform.gameplayStart();
        const t0 = Math.round(performance.now() - bootT0) / 1000;
        sim.markMilestone('gameplayStart', t0);
        platform.record(`interactive after ${t0}s`);
        document.getElementById('boot')?.remove();
        if (returning) ui.toasts.show(t('toast.welcomeBack'), 'good', 3200);
      }
      fpsAcc += dt;
      fpsFrames++;
      if (fpsAcc >= 1) {
        fps = fpsFrames / fpsAcc;
        fpsAcc = 0;
        fpsFrames = 0;
        if (blob.settings.quality === 'auto' && !blocking) {
          slowFor = fps < (view.currentTier === 'low' ? 0 : 40) ? slowFor + 1 : 0;
          if (slowFor >= 3 && view.currentTier !== 'low') {
            autoTier = lowerTier(view.currentTier);
            view.applyTier(autoTier);
            tier = autoTier;
            slowFor = 0;
            platform.record(`fps ${fps.toFixed(0)} → quality ${autoTier}`);
          }
          // low tier that still struggles: a steady 30 beats jitter
          if (view.currentTier === 'low' && fps < 45 && loop) loop.fpsCap = 30;
        }
      }
    },
  });
  loop.start();

  // autosave + lifecycle
  setInterval(() => {
    if (!document.hidden) save();
  }, BALANCE.save.autosaveSec * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      ui.onHidden();
      save();
      loop?.stop();
      sfx.suspend(true);
      platform.gameplayStop();
    } else {
      loop?.start();
      sfx.suspend(false);
      if (!blocking) platform.gameplayStart();
    }
  });
  window.addEventListener('pagehide', save);
  // block long-press menus, pinch-zoom and selection on the page itself
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  if (TEST_HOOKS) {
    window.__st = { sim, view, ui, platform, blob: (): SaveBlob => blob, save, loop, fps: (): number => fps };
  }
  if (DEBUG) {
    void import('./ui/debug').then(({ DebugOverlay }) => new DebugOverlay(uiRoot, { sim, view, platform, loop: loop as FixedLoop, fps: () => fps }));
  }
}

void boot().catch((e: unknown) => {
  console.error(e);
});
