export interface LoopHooks {
  /** Fixed-step simulation update. */
  update(): void;
  /** Render with interpolation factor alpha in [0,1] and the real frame delta (s). */
  render(alpha: number, frameDt: number): void;
}

const MAX_FRAME = 0.25;

/**
 * Fixed-timestep loop (accumulator, clamped delta) with interpolated rendering.
 * The sim tick rate is independent of the display rate. `timeScale` is a debug fast-forward.
 */
export class FixedLoop {
  private acc = 0;
  private last = -1;
  private raf = 0;
  private running = false;
  /** When true the sim does not advance but rendering continues. */
  simPaused = false;
  /** 0 = uncapped (display rate), otherwise target FPS (e.g. 30). */
  fpsCap = 0;
  timeScale = 1;
  private sinceRender = 0;

  constructor(
    private readonly step: number,
    private readonly hooks: LoopHooks,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -1;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  get isRunning(): boolean {
    return this.running;
  }

  private readonly frame = (tMs: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const t = tMs / 1000;
    if (this.last < 0) this.last = t;
    let dt = t - this.last;
    this.last = t;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    if (dt < 0) dt = 0;
    if (this.fpsCap > 0) {
      this.sinceRender += dt;
      if (this.sinceRender < 1 / this.fpsCap - 0.004) return;
      dt = Math.min(this.sinceRender, MAX_FRAME);
      this.sinceRender = 0;
    }
    this.advance(dt);
  };

  advance(dt: number): void {
    if (!this.simPaused) {
      this.acc += dt * this.timeScale;
      let steps = 0;
      const max = 40 * Math.max(1, this.timeScale);
      while (this.acc >= this.step && steps < max) {
        this.hooks.update();
        this.acc -= this.step;
        steps++;
      }
      if (steps >= max) this.acc = 0;
    }
    this.hooks.render(this.simPaused ? 1 : Math.min(1, this.acc / this.step), dt);
  }
}
