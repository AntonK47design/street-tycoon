/** Synthesised sound effects (WebAudio, no audio files). Silent until the first user gesture unlocks the context. */
type Ctx = AudioContext;

export type SfxName = 'coin' | 'tip' | 'tap' | 'sizzle' | 'perfect' | 'good' | 'ok' | 'upgrade' | 'quest' | 'angry' | 'cart' | 'clean' | 'restock' | 'error' | 'open';

export class Sfx {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ambience: AudioBufferSourceNode | null = null;
  private enabled = true;
  private platformMuted = false;
  private lastPlay = new Map<SfxName, number>();

  constructor() {
    const unlock = (): void => this.unlock();
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  /** Creates / resumes the context (iOS needs a gesture; also recovers from 'interrupted'). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.applyVolume();
        const len = this.ctx.sampleRate * 2;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        let b = 0;
        for (let i = 0; i < len; i++) {
          // pinkish noise
          b = 0.97 * b + 0.03 * (Math.random() * 2 - 1);
          d[i] = b * 6 + (Math.random() * 2 - 1) * 0.15;
        }
        this.startAmbience();
      }
      const st = this.ctx.state as string;
      if (st === 'suspended' || st === 'interrupted') void this.ctx.resume();
    } catch {
      /* audio unavailable: stay silent */
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.applyVolume();
  }

  setPlatformMuted(m: boolean): void {
    this.platformMuted = m;
    this.applyVolume();
  }

  /** Pause/resume with the page. */
  suspend(on: boolean): void {
    if (!this.ctx) return;
    try {
      if (on) void this.ctx.suspend();
      else void this.ctx.resume();
    } catch {
      /* ignore */
    }
  }

  private applyVolume(): void {
    if (!this.master || !this.ctx) return;
    const v = this.enabled && !this.platformMuted ? 0.55 : 0;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private startAmbience(): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    this.ambience = src;
  }

  private tone(freq: number, t0: number, dur: number, type: OscillatorType, vol: number, slide = 0): void {
    const ctx = this.ctx as Ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master as GainNode);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noiseBurst(t0: number, dur: number, freq: number, q: number, vol: number): void {
    const ctx = this.ctx as Ctx;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(this.master as GainNode);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  play(name: SfxName): void {
    if (!this.ctx || !this.master || !this.enabled || this.platformMuted) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // rate-limit identical sounds (many sales at once)
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < 0.06) return;
    this.lastPlay.set(name, now);
    try {
      switch (name) {
        case 'coin':
          this.tone(1318, now, 0.09, 'square', 0.05);
          this.tone(1976, now + 0.07, 0.22, 'square', 0.05);
          break;
        case 'tip':
          this.tone(1568, now, 0.08, 'square', 0.05);
          this.tone(2093, now + 0.06, 0.08, 'square', 0.05);
          this.tone(2637, now + 0.12, 0.25, 'square', 0.045);
          break;
        case 'tap':
          this.tone(660, now, 0.06, 'triangle', 0.12);
          break;
        case 'open':
          this.tone(520, now, 0.07, 'triangle', 0.1);
          this.tone(780, now + 0.05, 0.08, 'triangle', 0.08);
          break;
        case 'sizzle':
          this.noiseBurst(now, 1.6, 3800, 0.8, 0.12);
          break;
        case 'ok':
          this.tone(392, now, 0.18, 'triangle', 0.14);
          break;
        case 'good':
          this.tone(523, now, 0.1, 'triangle', 0.14);
          this.tone(659, now + 0.08, 0.2, 'triangle', 0.14);
          break;
        case 'perfect':
          [523, 659, 784, 1047].forEach((f, i) => this.tone(f, now + i * 0.07, 0.22, 'triangle', 0.15));
          break;
        case 'upgrade':
          [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, now + i * 0.055, 0.2, 'square', 0.045));
          this.noiseBurst(now + 0.25, 0.4, 7000, 1.5, 0.05);
          break;
        case 'quest':
          [659, 831, 988, 1319].forEach((f, i) => this.tone(f, now + i * 0.09, 0.32, 'triangle', 0.13));
          break;
        case 'cart':
          [392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, now + i * 0.08, 0.3, 'triangle', 0.14));
          break;
        case 'angry':
          this.tone(220, now, 0.32, 'sawtooth', 0.05, 0.6);
          break;
        case 'clean':
          this.noiseBurst(now, 0.25, 2500, 1.2, 0.12);
          this.noiseBurst(now + 0.3, 0.25, 2800, 1.2, 0.12);
          this.tone(1760, now + 0.6, 0.25, 'sine', 0.06);
          break;
        case 'restock':
          this.tone(330, now, 0.08, 'triangle', 0.14);
          this.tone(262, now + 0.09, 0.12, 'triangle', 0.14);
          break;
        case 'error':
          this.tone(200, now, 0.14, 'square', 0.05);
          this.tone(160, now + 0.12, 0.18, 'square', 0.05);
          break;
      }
    } catch {
      /* ignore */
    }
  }

  get hasAmbience(): boolean {
    return this.ambience !== null;
  }
}
