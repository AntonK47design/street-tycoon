import { BALANCE } from '../data/balance';
import { t } from '../core/i18n';
import type { Quality } from '../sim/state';
import type { UiContext } from './context';
import { h, haptic } from './dom';

interface Stage {
  key: string;
  zone: number;
  speed: number;
}

const MG = BALANCE.minigame;

/**
 * Cooking minigame (~3 s): two timing taps. The marker sweeps across a bar; tap when it is in the
 * highlighted zone. The sim keeps running meanwhile — customers keep arriving.
 */
export class Minigame {
  private readonly el: HTMLDivElement;
  private readonly catcher: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly zoneGood: HTMLDivElement;
  private readonly zonePerfect: HTMLDivElement;
  private readonly marker: HTMLDivElement;
  private readonly result: HTMLDivElement;
  private readonly food: HTMLDivElement;
  private readonly dots: HTMLDivElement;
  private cart = -1;
  private stages: Stage[] = [];
  private foods: [string, string] = ['sausage', 'bun'];
  private stage = 0;
  private pos = 0;
  private dir = 1;
  private elapsed = 0;
  private score = 0;
  private resultT = 0;
  private closing = 0;
  private onDone: ((q: Quality) => void) | null = null;
  private seed = 1;

  constructor(private readonly ctx: UiContext) {
    this.catcher = h('div', 'mg-catch');
    this.el = h('div', 'minigame');
    this.title = h('div', 'mg-title');
    this.food = h('div', 'mg-food');
    this.bar = h('div', 'mg-bar');
    this.zoneGood = h('div', 'mg-zone good');
    this.zonePerfect = h('div', 'mg-zone perfect');
    this.marker = h('div', 'mg-marker');
    this.bar.append(this.zoneGood, this.zonePerfect, this.marker);
    this.result = h('div', 'mg-result');
    this.dots = h('div', 'mg-dots');
    const hint = h('div', 'mg-hint');
    hint.textContent = ctx.isMobile ? t('mg.tapHint') : t('mg.keyHint');
    this.el.append(this.title, this.food, this.bar, this.dots, hint, this.result);
    this.catcher.append(this.el);
    ctx.root.append(this.catcher);
    this.catcher.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.tap();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (!e.repeat) this.tap();
      }
    });
  }

  get isOpen(): boolean {
    return this.cart >= 0;
  }

  get cartIndex(): number {
    return this.cart;
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** Starts cooking at cart `ci`. Returns false (and the reason) if the sim refuses. */
  open(ci: number, onDone: (q: Quality) => void): ReturnType<UiContext['sim']['startCook']> {
    if (this.isOpen) return 'busy';
    const r = this.ctx.sim.startCook(ci);
    if (r !== 'ok') return r;
    this.seed = (Date.now() % 100000) + 7;
    this.cart = ci;
    this.onDone = onDone;
    const kitchen = this.ctx.sim.state.carts[ci]?.kitchen ?? 'hotdog';
    const keys: Record<string, [string, string, string, string]> = {
      hotdog: ['mg.grill', 'mg.topping', 'sausage', 'bun'],
      burger: ['mg.flip', 'mg.cheese', 'patty', 'burger'],
      crepe: ['mg.spread', 'mg.filling', 'crepe', 'fold'],
    };
    const [k1, k2, f1, f2] = keys[kitchen] ?? (keys.hotdog as [string, string, string, string]);
    this.foods = [f1, f2];
    this.stages = [
      { key: k1, zone: 0.58 + this.rnd() * 0.22, speed: 1 },
      { key: k2, zone: 0.25 + this.rnd() * 0.5, speed: 1.18 },
    ];
    this.stage = 0;
    this.score = 0;
    this.closing = 0;
    this.startStage();
    this.catcher.classList.add('open');
    this.ctx.sfx.play('sizzle');
    return 'ok';
  }

  private startStage(): void {
    const s = this.stages[this.stage] as Stage;
    this.pos = 0;
    this.dir = 1;
    this.elapsed = 0;
    this.resultT = 0;
    this.title.textContent = t(s.key);
    const g = MG.goodHalf;
    const p = MG.perfectHalf;
    this.zoneGood.style.left = `${(s.zone - g) * 100}%`;
    this.zoneGood.style.width = `${g * 200}%`;
    this.zonePerfect.style.left = `${(s.zone - p) * 100}%`;
    this.zonePerfect.style.width = `${p * 200}%`;
    this.food.className = `mg-food ${this.foods[this.stage === 0 ? 0 : 1]}`;
    this.dots.innerHTML = this.stages.map((_, i) => `<i class="${i < this.stage ? 'done' : i === this.stage ? 'cur' : ''}"></i>`).join('');
    this.result.className = 'mg-result';
    this.result.textContent = '';
  }

  tap(): void {
    if (!this.isOpen || this.resultT > 0 || this.closing > 0) return;
    const s = this.stages[this.stage] as Stage;
    const d = Math.abs(this.pos - s.zone);
    const q: Quality = d <= MG.perfectHalf ? 2 : d <= MG.goodHalf ? 1 : 0;
    this.resolve(q);
  }

  private resolve(q: Quality): void {
    this.score += q;
    this.resultT = 0.45;
    const label = q === 2 ? 'mg.perfect' : q === 1 ? 'mg.good' : 'mg.ok';
    this.result.textContent = t(label);
    this.result.className = `mg-result show q${q}`;
    this.ctx.sfx.play(q === 2 ? 'perfect' : q === 1 ? 'good' : 'ok');
    haptic(q === 2 ? 22 : 12);
  }

  update(dt: number): void {
    if (!this.isOpen) return;
    if (this.closing > 0) {
      this.closing -= dt;
      if (this.closing <= 0) this.finish();
      return;
    }
    if (this.resultT > 0) {
      this.resultT -= dt;
      if (this.resultT <= 0) {
        this.stage++;
        if (this.stage >= this.stages.length) {
          this.closing = 0.12;
          this.catcher.classList.remove('open');
        } else this.startStage();
      }
      return;
    }
    const s = this.stages[this.stage] as Stage;
    this.elapsed += dt;
    this.pos += (this.dir * dt * s.speed) / MG.sweepSec;
    if (this.pos >= 1) {
      this.pos = 2 - this.pos;
      this.dir = -1;
    } else if (this.pos <= 0) {
      this.pos = -this.pos;
      this.dir = 1;
    }
    this.marker.style.left = `${this.pos * 100}%`;
    this.food.style.setProperty('--cook', this.pos.toFixed(3));
    if (this.elapsed > MG.timeoutSec / this.stages.length) this.resolve(0);
  }

  private finish(): void {
    const ci = this.cart;
    const q: Quality = this.score >= 4 ? 2 : this.score >= 2 ? 1 : 0;
    this.cart = -1;
    this.catcher.classList.remove('open');
    const cb = this.onDone;
    this.onDone = null;
    if (ci >= 0) cb?.(q);
  }

  /** Aborts without cooking (e.g. tab hidden). */
  cancel(): void {
    if (!this.isOpen) return;
    this.ctx.sim.cancelCook(this.cart);
    this.cart = -1;
    this.onDone = null;
    this.catcher.classList.remove('open');
  }
}
