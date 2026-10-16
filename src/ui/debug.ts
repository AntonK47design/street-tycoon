import type { FixedLoop } from '../core/loop';
import type { Platform } from '../platform/platform';
import type { GameView } from '../render/view';
import type { Sim } from '../sim/sim';

interface DebugDeps {
  sim: Sim;
  view: GameView;
  platform: Platform;
  loop: FixedLoop;
  fps: () => number;
}

/** Dev-only overlay (toggle with F2 or the backquote key): FPS, draw calls, memory, milestones, fast-forward, cash cheat. */
export class DebugOverlay {
  private readonly el: HTMLDivElement;
  private readonly info: HTMLPreElement;
  private visible = false;

  constructor(root: HTMLElement, private readonly d: DebugDeps) {
    this.el = document.createElement('div');
    this.el.className = 'debug hidden';
    this.info = document.createElement('pre');
    const btns = document.createElement('div');
    const mk = (label: string, fn: () => void): void => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        fn();
      });
      btns.append(b);
    };
    mk('+$100', () => (d.sim.state.cash += 100));
    mk('+$10k', () => (d.sim.state.cash += 10000));
    for (const s of [1, 4, 16]) mk(`${s}×`, () => (d.loop.timeScale = s));
    mk('low', () => d.view.applyTier('low'));
    mk('med', () => d.view.applyTier('medium'));
    mk('high', () => d.view.applyTier('high'));
    this.el.append(this.info, btns);
    root.append(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F2' || e.code === 'Backquote') {
        this.visible = !this.visible;
        this.el.classList.toggle('hidden', !this.visible);
      }
    });
    setInterval(() => this.refresh(), 250);
  }

  private refresh(): void {
    if (!this.visible) return;
    const { sim, view } = this.d;
    const st = view.stats();
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const ms = Object.entries(sim.state.milestones)
      .map(([k, v]) => `  ${k.padEnd(15)} ${Number(v).toFixed(1)}s`)
      .join('\n');
    this.info.textContent = [
      `fps ${this.d.fps().toFixed(0)}  tier ${view.currentTier}  ×${this.d.loop.timeScale}`,
      `calls ${st.calls}  tris ${(st.triangles / 1000).toFixed(1)}k  geo ${st.geometries}`,
      mem ? `heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : '',
      `peds ${sim.activeCount()}  session ${sim.sessionTime.toFixed(0)}s  play ${sim.state.time.toFixed(0)}s`,
      `milestones:\n${ms}`,
      `platform: ${this.d.platform.kind}`,
      ...this.d.platform.log.slice(-5).map((l) => `  ${(l.t / 1000).toFixed(1)}s ${l.msg}`),
    ].join('\n');
  }
}
