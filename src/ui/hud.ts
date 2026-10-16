import { QUESTS, SIDE_GOALS, type QuestDef } from '../data/quests';
import { formatCash, formatNumber, t } from '../core/i18n';
import type { UiContext } from './context';
import { h, icon, onTap, setHtml, setText, toggle } from './dom';

/** Top bars: cash, income, goal bar, side goals, clock; bottom-left: new cart. */
export class Hud {
  readonly cashEl: HTMLDivElement;
  private readonly cashVal: HTMLSpanElement;
  private readonly income: HTMLDivElement;
  readonly goal: HTMLDivElement;
  private readonly goalText: HTMLDivElement;
  private readonly goalFill: HTMLElement;
  private readonly goalCount: HTMLSpanElement;
  private readonly goalReward: HTMLDivElement;
  private readonly side: HTMLDivElement;
  private readonly clock: HTMLDivElement;
  readonly newCart: HTMLButtonElement;
  readonly settingsBtn: HTMLButtonElement;
  private shownCash = 0;
  private lastQuest = -1;
  private tick = 0;
  onNewCart: () => void = () => {};
  onSettings: () => void = () => {};
  onDaily: () => void = () => {};
  dailyPending: () => number = () => 0;
  readonly dailyBtn: HTMLButtonElement;
  private readonly dailyBadge: HTMLSpanElement;

  constructor(private readonly ctx: UiContext) {
    const tl = h('div', 'hud tl');
    this.cashEl = h('div', 'cash-pill');
    this.cashVal = h('span', 'cash-val');
    this.cashEl.innerHTML = icon('coin', 'ic coin');
    this.cashEl.append(this.cashVal);
    this.income = h('div', 'income');
    tl.append(this.cashEl, this.income);

    const tc = h('div', 'hud tc');
    this.goal = h('div', 'goal');
    this.goalText = h('div', 'goal-text');
    const bar = h('div', 'goal-bar', '<i></i>');
    this.goalFill = bar.querySelector('i') as HTMLElement;
    this.goalCount = h('span', 'goal-count');
    this.goalReward = h('div', 'goal-reward');
    const mid = h('div', 'goal-mid');
    const row = h('div', 'goal-row');
    row.append(bar, this.goalCount);
    mid.append(this.goalText, row);
    this.goal.append(h('div', 'goal-icon', icon('target')), mid, this.goalReward);
    this.side = h('div', 'side-goals');
    tc.append(this.goal, this.side);

    const tr = h('div', 'hud tr');
    this.clock = h('div', 'clock');
    this.settingsBtn = h('button', 'icon-btn', icon('gear'));
    this.settingsBtn.setAttribute('aria-label', t('ui.settings'));
    onTap(this.settingsBtn, () => this.onSettings());
    this.dailyBtn = h('button', 'icon-btn daily-btn hidden', icon('sun'));
    this.dailyBtn.setAttribute('aria-label', t('daily.title'));
    this.dailyBadge = h('span', 'tab-badge hidden');
    this.dailyBtn.append(this.dailyBadge);
    onTap(this.dailyBtn, () => this.onDaily());
    tr.append(this.clock, this.dailyBtn, this.settingsBtn);

    const bl = h('div', 'hud bl');
    this.newCart = h('button', 'btn new-cart', '');
    onTap(this.newCart, () => this.onNewCart());
    bl.append(this.newCart);

    ctx.root.append(tl, tc, tr, bl);
    this.shownCash = ctx.sim.state.cash;
  }

  private questLabel(q: QuestDef): string {
    return t(`quest.${q.id}`, { n: formatNumber(q.target) });
  }

  /** Flash the goal bar when a quest completes. */
  celebrate(): void {
    this.goal.classList.remove('done');
    void this.goal.offsetWidth;
    this.goal.classList.add('done');
  }

  bumpCash(): void {
    this.cashEl.classList.remove('bump');
    void this.cashEl.offsetWidth;
    this.cashEl.classList.add('bump');
  }

  update(dt: number): void {
    const sim = this.ctx.sim;
    const st = sim.state;
    // cash counts up smoothly
    const diff = st.cash - this.shownCash;
    this.shownCash += Math.abs(diff) < 0.5 ? diff : diff * Math.min(1, dt * 9);
    setText(this.cashVal, formatCash(this.shownCash));
    this.tick += dt;
    if (this.tick < 0.1) return;
    this.tick = 0;
    const ipm = sim.incomePerMin();
    setText(this.income, ipm > 0 ? t('hud.income', { v: formatCash(ipm) }) : '');
    // goal
    const q = sim.currentQuest();
    if (q) {
      const prog = sim.questProgress(q);
      setText(this.goalText, this.questLabel(q));
      this.goalFill.style.width = `${(prog / q.target) * 100}%`;
      setText(this.goalCount, q.target > 1 ? `${formatNumber(prog)}/${formatNumber(q.target)}` : '');
      setHtml(this.goalReward, q.reward > 0 ? `${icon('coin')}<span>+${formatCash(q.reward)}</span>` : '');
      toggle(this.goalReward, 'hidden', q.reward <= 0);
      if (st.quest !== this.lastQuest) {
        this.lastQuest = st.quest;
        this.goal.classList.remove('enter');
        void this.goal.offsetWidth;
        this.goal.classList.add('enter');
      }
    } else {
      setText(this.goalText, t('quest.allDone'));
      this.goalFill.style.width = '100%';
      setText(this.goalCount, '');
      toggle(this.goalReward, 'hidden', true);
    }
    toggle(this.goal, 'hidden', false);
    // side goals (only after the first two main goals, so the very first minute has one focus)
    let html = '';
    if (st.quest >= 2) {
      for (const s of st.side) {
        if (!s) continue;
        const d = SIDE_GOALS[s.idx];
        if (!d) continue;
        const p = sim.questProgress(d, s.base);
        html += `<div class="side"><span class="side-text">${t(`quest.${d.id}`, { n: formatNumber(d.target) })}</span><span class="side-prog">${formatNumber(p)}/${formatNumber(d.target)}</span><span class="side-rew">${icon('coin')}${formatCash(d.reward)}</span></div>`;
      }
    }
    setHtml(this.side, html);
    // clock
    const hh = Math.floor(st.clockMin / 60);
    const mm = Math.floor(st.clockMin % 60);
    const rush = sim.isRush();
    setHtml(
      this.clock,
      `${icon('sun')}<span>${t('hud.day', { d: st.day })} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</span>${rush ? `<b class="rush">${t(hh < 15 ? 'hud.lunchRush' : 'hud.dinnerRush')}</b>` : ''}`,
    );
    // daily rewards / tasks (after the second cart, so the first minutes stay focused)
    const pend = this.dailyPending();
    toggle(this.dailyBtn, 'hidden', st.quest < 4);
    setText(this.dailyBadge, String(pend));
    toggle(this.dailyBadge, 'hidden', pend === 0);
    toggle(this.dailyBtn, 'pending', pend > 0);
    // new cart button
    const cost = sim.nextCartCost();
    const spots = sim.freeSpots().length;
    toggle(this.newCart, 'hidden', cost === null || spots === 0 || (st.stats.served < 3 && st.carts.length === 1));
    if (cost !== null) {
      setHtml(this.newCart, `${icon('cart')}<span class="lbl">${t('hud.newCart')}</span><span class="cost">${icon('coin')}${formatCash(cost)}</span>`);
      toggle(this.newCart, 'poor', st.cash < cost);
      toggle(this.newCart, 'ready', st.cash >= cost);
    }
  }
}

/** Short messages under the goal bar. */
export class Toasts {
  private readonly el: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.el = h('div', 'toasts');
    root.append(this.el);
  }

  show(html: string, kind: 'good' | 'info' | 'warn' = 'info', ms = 2600): void {
    const tEl = h('div', `toast ${kind}`, html);
    this.el.append(tEl);
    while (this.el.children.length > 3) this.el.firstElementChild?.remove();
    setTimeout(() => tEl.classList.add('out'), ms);
    setTimeout(() => tEl.remove(), ms + 400);
  }
}

export function questName(id: string): string {
  const q = QUESTS.find((x) => x.id === id) ?? SIDE_GOALS.find((x) => x.id === id);
  return q ? t(`quest.${q.id}`, { n: formatNumber(q.target) }) : id;
}
