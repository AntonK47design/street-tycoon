import { KITCHENS, KITCHEN_ORDER, type KitchenId } from '../data/kitchens';
import { RETENTION, WORKERS, type AutoStage } from '../data/workers';
import { formatCash, formatNumber, formatPrice, t } from '../core/i18n';
import { claimDailyReward, claimTask, canClaimDailyReward, dailyRewardAmount, dailyUnlocked, nextStreak, taskProgress, taskReward, type OfflineReport } from '../sim/retention';
import { trainingInfo, xpForLevel } from '../sim/workers';
import type { UiContext } from './context';
import type { WorkerState } from '../sim/state';
import { h, haptic, icon, onTap, setHtml, toggle } from './dom';
import { Modal } from './modal';

export function starRow(n: number, max = 3): string {
  let s = '<span class="mini-stars">';
  for (let i = 0; i < max; i++) s += `<span class="${i < n ? 'on' : ''}">${icon('star')}</span>`;
  return s + '</span>';
}

export function duration(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

const STAGE_KEYS: Record<AutoStage, string> = { 1: 'auto.cook', 2: 'auto.restock', 3: 'auto.price', 4: 'auto.clean', 5: 'auto.fast' };
const CASHIER_KEYS: Record<AutoStage, string> = { 1: 'auto.cashier', 2: 'auto.shelves', 3: 'auto.price', 4: 'auto.tidy', 5: 'auto.fast' };

/** Hire dialog: three candidates for one cart. */
export class HireModal extends Modal {
  private cart = -1;
  private shop = -1;
  onHired: (ci: number) => void = () => {};

  constructor(ctx: UiContext) {
    super(ctx, 'hire-modal');
  }

  openFor(ci: number): void {
    this.cart = ci;
    this.shop = -1;
    this.setTitle(t('hire.title', { n: ci + 1 }), 'people');
    this.render();
    this.show();
  }

  openForShop(pi: number): void {
    this.cart = -1;
    this.shop = pi;
    this.setTitle(t('hire.titleShop'), 'people');
    this.render();
    this.show();
  }

  render(): void {
    const sim = this.ctx.sim;
    this.body.innerHTML = '';
    this.body.append(h('div', 'modal-sub', t(this.shop >= 0 ? 'hire.subShop' : 'hire.sub')));
    sim.candidates().forEach((c, k) => {
      const card = h('div', 'cand');
      card.innerHTML = `<div class="cand-face">${icon('people')}</div><div class="cand-mid"><div class="cand-name">${c.name} ${starRow(c.stars)}</div><div class="cand-info">${t('hire.wage', { w: formatPrice(c.wage) })} · ${t('hire.quality', { q: Math.round(((WORKERS.perfectByStars[c.stars] as number) + (WORKERS.goodByStars[c.stars] as number)) * 100) })}</div></div>`;
      const btn = h('button', `btn buy${sim.state.cash < c.cost ? ' poor' : ''}`, `${icon('coin')}<span>${formatCash(c.cost)}</span>`);
      onTap(btn, () => {
        if ((this.shop >= 0 ? sim.shops.hireCashier(k, this.shop) : sim.hire(k, this.cart)) >= 0) {
          this.ctx.sfx.play('cart');
          haptic(20);
          this.ctx.save();
          const ci = this.cart;
          this.hide();
          this.onHired(ci);
        } else this.ctx.sfx.play('error');
      });
      card.append(btn);
      this.body.append(card);
    });
  }
}

/** Kitchen picker shown before placing a new cart. */
export class KitchenModal extends Modal {
  onPick: (k: KitchenId) => void = () => {};

  constructor(ctx: UiContext) {
    super(ctx, 'kitchen-modal');
  }

  open(): void {
    this.setTitle(t('kitchen.pick'), 'cart');
    const sim = this.ctx.sim;
    const unlocked = sim.unlockedKitchens();
    const owned = new Set(sim.state.carts.map((c) => c.kitchen));
    this.body.innerHTML = '';
    this.body.append(h('div', 'modal-sub', t('kitchen.sub')));
    const grid = h('div', 'kitchen-grid');
    for (const id of KITCHEN_ORDER) {
      const k = KITCHENS[id];
      if (k.unlockServed === null) continue;
      const ok = unlocked.includes(id);
      const card = h('button', `kitchen-card${ok ? '' : ' locked'}`);
      card.style.setProperty('--kc', `#${k.body.toString(16).padStart(6, '0')}`);
      card.innerHTML = `<div class="kc-name">${t(`kitchen.${id}`)}</div><div class="kc-info">${ok ? t('kitchen.price', { p: formatPrice(k.fairPrice) }) : `${icon('lock')} ${t('kitchen.unlock', { n: k.unlockServed })}`}</div>${ok && !owned.has(id) ? `<div class="kc-new">${t('kitchen.new')}</div>` : ''}`;
      card.disabled = !ok;
      onTap(card, () => {
        if (!ok) return;
        this.hide();
        this.onPick(id);
      });
      grid.append(card);
    }
    this.body.append(grid);
    this.show();
  }
}

/** "While you were away" — offline earnings with an optional 2× rewarded ad (feature-flagged). */
export class OfflineModal extends Modal {
  constructor(ctx: UiContext) {
    super(ctx, 'offline-modal');
  }

  open(r: OfflineReport): void {
    this.setTitle(t('offline.title'), 'sun');
    this.body.innerHTML = '';
    const big = h('div', 'offline-big', `${icon('coin', 'ic coin')}<span>+${formatCash(r.earned)}</span>`);
    const sub = h('div', 'modal-sub', t('offline.sub', { time: duration(r.away), n: formatNumber(r.served) }));
    this.body.append(big, sub);
    if (r.away > RETENTION.offlineCapSec) this.body.append(h('div', 'modal-note', t('offline.capped', { h: RETENTION.offlineCapSec / 3600 })));
    if (r.trained > 0) this.body.append(h('div', 'modal-note good', `${icon('check')} ${t('offline.trained', { n: r.trained })}`));
    if (r.earned <= 0) this.body.append(h('div', 'modal-note', t('offline.hireTip')));
    const row = h('div', 'modal-actions');
    const ok = h('button', 'btn primary big', t('offline.collect'));
    onTap(ok, () => this.hide());
    row.append(ok);
    const platform = this.ctx.platform;
    if (platform.adsAvailable && r.earned > 0) {
      const dbl = h('button', 'btn big ad', `${icon('sparkle')}<span>${t('offline.double')}</span>`);
      onTap(dbl, () => {
        dbl.disabled = true;
        this.ctx.sfx.suspend(true);
        void platform
          .requestAd('rewarded', () => {})
          .then((res) => {
            this.ctx.sfx.suspend(false);
            if (res.ok) {
              this.ctx.sim.state.cash += r.earned;
              this.ctx.save();
              this.ctx.sfx.play('quest');
            }
            this.hide();
          });
      });
      row.prepend(dbl);
    }
    this.body.append(row);
    this.show();
    this.ctx.sfx.play('coin');
  }
}

/** Daily reward calendar (7-day streak) and three daily tasks. */
export class DailyModal extends Modal {
  constructor(
    ctx: UiContext,
    private readonly today: () => string,
  ) {
    super(ctx, 'daily-modal');
  }

  open(): void {
    this.setTitle(t('daily.title'), 'sun');
    this.render();
    this.show();
  }

  render(): void {
    const st = this.ctx.sim.state;
    const today = this.today();
    this.body.innerHTML = '';
    const can = canClaimDailyReward(st, today);
    const next = nextStreak(st, today);
    const current = can ? next : st.daily.streak;
    const strip = h('div', 'reward-strip');
    const cycle = RETENTION.dailyRewards.length;
    const base = Math.floor((current - 1) / cycle) * cycle;
    for (let i = 1; i <= cycle; i++) {
      const day = base + i;
      const cls = day < current || (day === current && !can) ? 'got' : day === current ? 'now' : '';
      strip.append(h('div', `reward-day ${cls}`, `<div class="rd-n">${t('daily.day', { d: day })}</div>${icon('coin', 'ic coin')}<div class="rd-v">${formatCash(dailyRewardAmount(st, day))}</div>${cls === 'got' ? `<div class="rd-check">${icon('check')}</div>` : ''}`));
    }
    this.body.append(strip);
    const claim = h('button', `btn primary big${can ? '' : ' done'}`, can ? t('daily.claim', { v: formatCash(dailyRewardAmount(st, next)) }) : t('daily.claimed'));
    claim.disabled = !can;
    onTap(claim, () => {
      const v = claimDailyReward(st, today);
      if (v > 0) {
        this.ctx.sfx.play('quest');
        haptic(25);
        this.ctx.save();
        this.render();
      }
    });
    this.body.append(claim, h('div', 'modal-note', t('daily.streakNote')));
    if (!dailyUnlocked(st)) return;
    this.body.append(h('div', 'box-head', `${icon('target')}<span>${t('daily.tasks')}</span>`));
    for (let k = 0; k < st.daily.tasks.length; k++) {
      const p = taskProgress(st, k);
      if (!p) continue;
      const row = h('div', `task${p.done ? ' done' : ''}${p.claimed ? ' claimed' : ''}`);
      row.innerHTML = `<div class="task-mid"><div class="task-name">${t(`quest.${p.def.id}`, { n: formatNumber(p.def.target) })}</div><div class="goal-bar"><i style="width:${(p.value / p.def.target) * 100}%"></i></div></div>`;
      const btn = h('button', `btn ${p.done && !p.claimed ? 'buy' : ''}`, p.claimed ? icon('check') : `${icon('coin')}<span>${formatCash(taskReward(st, p.def))}</span>`);
      btn.disabled = !p.done || p.claimed;
      onTap(btn, () => {
        if (claimTask(st, k) > 0) {
          this.ctx.sfx.play('quest');
          this.ctx.save();
          this.render();
        }
      });
      row.append(btn);
      this.body.append(row);
    }
  }

  /** Count of things to collect (HUD badge). */
  pending(): number {
    const st = this.ctx.sim.state;
    let n = canClaimDailyReward(st, this.today()) ? 1 : 0;
    if (dailyUnlocked(st)) for (let k = 0; k < st.daily.tasks.length; k++) {
      const p = taskProgress(st, k);
      if (p && p.done && !p.claimed) n++;
    }
    return n;
  }
}

/** Staff box inside the cart panel: hire button, or the worker card with automation stages and training. */
export class StaffBox {
  readonly el: HTMLDivElement;
  readonly hireBtn: HTMLButtonElement;
  readonly trainBtn: HTMLButtonElement;
  private readonly body: HTMLDivElement;
  onHire: () => void = () => {};
  private cashier = false;

  constructor(private readonly ctx: UiContext) {
    this.el = h('div', 'staff-box');
    this.el.append(h('div', 'box-head', `${icon('people')}<span>${t('staff.title')}</span>`));
    this.body = h('div', 'staff-body');
    this.hireBtn = h('button', 'btn primary hire', '');
    this.trainBtn = h('button', 'btn buy train', '');
    onTap(this.hireBtn, () => this.onHire());
    this.el.append(this.body, this.hireBtn, this.trainBtn);
  }

  update(ci: number): void {
    this.updateFor(this.ctx.sim.workerOf(ci));
  }

  /** Shows a given worker (or the hire button when none). Shop cashiers use the cashier stage names. */
  updateFor(w: WorkerState | undefined, cashier = false): void {
    const sim = this.ctx.sim;
    this.cashier = cashier;
    toggle(this.hireBtn, 'hidden', !!w);
    if (!w) {
      const c0 = sim.candidates()[0];
      setHtml(this.body, `<div class="staff-empty">${t(cashier ? 'staff.noneShop' : 'staff.none')}</div>`);
      setHtml(this.hireBtn, `${icon('people')}<span>${t(cashier ? 'staff.hireCashier' : 'staff.hire')}</span>${c0 ? `<span class="cost">${icon('coin')}${formatCash(c0.cost)}</span>` : ''}`);
      toggle(this.trainBtn, 'hidden', true);
      return;
    }
    const need = xpForLevel(w.level);
    let stages = '';
    for (let s = 1 as AutoStage; s <= 5; s = (s + 1) as AutoStage) {
      const on = w.auto >= s;
      const running = w.training?.stage === s;
      stages += `<div class="stage${on ? ' on' : ''}${running ? ' run' : ''}">${on ? icon('check') : running ? icon('sun') : icon('lock')}<span>${t((this.cashier ? CASHIER_KEYS : STAGE_KEYS)[s])}</span>${running && w.training ? `<b>${duration(w.training.endsAt - sim.state.worldTime)}</b>` : ''}</div>`;
    }
    setHtml(
      this.body,
      `<div class="worker"><div class="cand-face">${icon('people')}</div><div class="cand-mid"><div class="cand-name">${w.name} ${starRow(w.stars)}</div><div class="cand-info">${t('staff.level', { l: w.level })} · ${t('hire.wage', { w: formatPrice(WORKERS.wage[w.stars] as number) })}</div><div class="goal-bar xp"><i style="width:${w.level >= WORKERS.maxLevel ? 100 : (w.xp / need) * 100}%"></i></div></div></div><div class="stages">${stages}</div>`,
    );
    const nextStage = w.auto < 5 ? ((w.auto + 1) as AutoStage) : null;
    const info = nextStage ? trainingInfo(nextStage) : null;
    toggle(this.trainBtn, 'hidden', !info || !!w.training);
    if (info && nextStage && !w.training) {
      setHtml(this.trainBtn, `<span>${t('staff.train', { s: t((this.cashier ? CASHIER_KEYS : STAGE_KEYS)[nextStage]), d: duration(info.sec) })}</span><span class="cost">${icon('coin')}${formatCash(info.cost)}</span>`);
      toggle(this.trainBtn, 'poor', sim.state.cash < info.cost);
    }
  }

  bindTrain(fn: () => void): void {
    onTap(this.trainBtn, fn);
  }
}
