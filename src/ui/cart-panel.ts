import { KITCHENS } from '../data/kitchens';
import { UPGRADES, UPGRADE_ORDER, upgradeCost, type UpgradeId } from '../data/upgrades';
import { formatCash, formatPrice, t } from '../core/i18n';
import { batchSize, fairPrice, ingredientCost, patienceSec, priceMult, serveSec, stockCap, suppliesCap } from '../sim/cart';
import { BALANCE } from '../data/balance';
import type { CartState } from '../sim/state';
import type { UiContext } from './context';
import { h, haptic, icon, onTap, setHtml, setText, toggle } from './dom';
import type { IconName } from './icons';
import { StaffBox } from './retention-ui';

const UP_ICON: Record<UpgradeId, IconName> = { grill: 'grill', speed: 'speed', recipe: 'recipe', sign: 'sign', comfort: 'comfort', pantry: 'pantry' };

interface UpCard {
  root: HTMLDivElement;
  level: HTMLSpanElement;
  effect: HTMLDivElement;
  buy: HTMLButtonElement;
}

/** Side panel (desktop/landscape) or bottom sheet (portrait) for one cart. Non-blocking: the game keeps running. */
export class CartPanel {
  readonly el: HTMLDivElement;
  private ci = -1;
  private tab: 'overview' | 'upgrades' = 'overview';
  private readonly title: HTMLDivElement;
  private readonly stars: HTMLDivElement;
  private readonly tabOverview: HTMLButtonElement;
  private readonly tabUpgrades: HTMLButtonElement;
  private readonly upBadge: HTMLSpanElement;
  private readonly overview: HTMLDivElement;
  private readonly upgrades: HTMLDivElement;
  private readonly stock: HTMLDivElement;
  private readonly supplies: HTMLDivElement;
  private readonly clean: HTMLDivElement;
  private readonly queue: HTMLDivElement;
  readonly cookBtn: HTMLButtonElement;
  readonly restockBtn: HTMLButtonElement;
  readonly cleanBtn: HTMLButtonElement;
  private readonly price: HTMLDivElement;
  readonly priceDown: HTMLButtonElement;
  readonly priceUp: HTMLButtonElement;
  private readonly priceInfo: HTMLDivElement;
  private readonly appealBars: Record<'clean' | 'location' | 'price' | 'taste', HTMLElement>;
  private readonly cards = new Map<UpgradeId, UpCard>();
  onCook: (ci: number) => void = () => {};
  onHire: (ci: number) => void = () => {};
  readonly staff: StaffBox;
  private readonly headIcon: HTMLDivElement;
  onClose: () => void = () => {};

  constructor(private readonly ctx: UiContext) {
    this.el = h('div', 'panel cart-panel');
    const head = h('div', 'panel-head');
    this.title = h('div', 'panel-title');
    this.stars = h('div', 'stars');
    const close = h('button', 'icon-btn close', icon('close'));
    close.setAttribute('aria-label', t('ui.close'));
    onTap(close, () => this.close());
    const titleWrap = h('div', 'title-wrap');
    titleWrap.append(this.title, this.stars);
    this.headIcon = h('div', 'panel-icon', icon('hotdog'));
    head.append(this.headIcon, titleWrap, close);

    const tabs = h('div', 'tabs');
    this.tabOverview = h('button', 'tab', t('panel.tabOverview'));
    this.tabUpgrades = h('button', 'tab', t('panel.tabUpgrades'));
    this.upBadge = h('span', 'tab-badge');
    this.tabUpgrades.append(this.upBadge);
    onTap(this.tabOverview, () => this.setTab('overview'));
    onTap(this.tabUpgrades, () => this.setTab('upgrades'));
    tabs.append(this.tabOverview, this.tabUpgrades);

    // overview
    this.overview = h('div', 'tab-body');
    const statRow = h('div', 'stat-row');
    this.stock = h('div', 'stat');
    this.supplies = h('div', 'stat');
    this.clean = h('div', 'stat');
    this.queue = h('div', 'stat');
    statRow.append(this.stock, this.supplies, this.clean, this.queue);
    const actions = h('div', 'actions');
    this.cookBtn = h('button', 'btn primary big cook', `${icon('flame')}<span>${t('panel.cook')}</span>`);
    this.restockBtn = h('button', 'btn restock', '');
    this.cleanBtn = h('button', 'btn clean', '');
    onTap(this.cookBtn, () => this.onCook(this.ci));
    onTap(this.restockBtn, () => this.restock());
    onTap(this.cleanBtn, () => this.doClean());
    const small = h('div', 'actions-row');
    small.append(this.restockBtn, this.cleanBtn);
    actions.append(this.cookBtn, small);

    const priceBox = h('div', 'price-box');
    const priceHead = h('div', 'box-head', `${icon('tag')}<span>${t('panel.price')}</span>`);
    const priceCtl = h('div', 'price-ctl');
    this.priceDown = h('button', 'btn round', '−');
    this.priceUp = h('button', 'btn round', '+');
    this.priceDown.setAttribute('aria-label', t('panel.priceDown'));
    this.priceUp.setAttribute('aria-label', t('panel.priceUp'));
    this.price = h('div', 'price-val');
    onTap(this.priceDown, () => this.nudgePrice(-1));
    onTap(this.priceUp, () => this.nudgePrice(1));
    priceCtl.append(this.priceDown, this.price, this.priceUp);
    this.priceInfo = h('div', 'price-info');
    priceBox.append(priceHead, priceCtl, this.priceInfo);

    const appealBox = h('div', 'appeal-box');
    appealBox.append(h('div', 'box-head', `${icon('star')}<span>${t('panel.appeal')}</span>`));
    const mkBar = (key: string): HTMLElement => {
      const row = h('div', 'bar-row', `<span>${t(key)}</span><div class="bar"><i></i></div>`);
      appealBox.append(row);
      return row.querySelector('i') as HTMLElement;
    };
    this.appealBars = { clean: mkBar('appeal.clean'), location: mkBar('appeal.location'), price: mkBar('appeal.price'), taste: mkBar('appeal.taste') };
    this.staff = new StaffBox(ctx);
    this.staff.onHire = () => this.onHire(this.ci);
    this.staff.bindTrain(() => {
      const w = ctx.sim.workerOf(this.ci);
      if (w && ctx.sim.startTraining(w.id)) {
        ctx.sfx.play('upgrade');
        haptic(20);
        ctx.save();
      } else ctx.sfx.play('error');
      this.update(true);
    });
    this.overview.append(statRow, actions, this.staff.el, priceBox, appealBox);

    // upgrades
    this.upgrades = h('div', 'tab-body upgrades');
    for (const id of UPGRADE_ORDER) {
      const root = h('div', 'up-card');
      const level = h('span', 'up-level');
      const name = h('div', 'up-name', `${icon(UP_ICON[id])}<span>${t(`up.${id}.name`)}</span>`);
      name.append(level);
      const effect = h('div', 'up-effect');
      const buy = h('button', 'btn buy', '');
      onTap(buy, () => this.buy(id));
      root.append(name, effect, buy);
      root.dataset.up = id;
      this.upgrades.append(root);
      this.cards.set(id, { root, level, effect, buy });
    }

    const body = h('div', 'panel-body');
    body.append(this.overview, this.upgrades);
    this.el.append(head, tabs, body);
    ctx.root.append(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.setTab('overview');
  }

  get isOpen(): boolean {
    return this.ci >= 0;
  }

  get cartIndex(): number {
    return this.ci;
  }

  get currentTab(): 'overview' | 'upgrades' {
    return this.tab;
  }

  get overviewTab(): HTMLElement {
    return this.tabOverview;
  }

  get upgradesTab(): HTMLElement {
    return this.tabUpgrades;
  }

  cardButton(id: UpgradeId): HTMLElement | undefined {
    return this.cards.get(id)?.buy;
  }

  open(ci: number): void {
    if (this.ci === ci) return;
    this.ci = ci;
    this.el.classList.add('open');
    document.documentElement.classList.add('panel-open');
    this.ctx.view.setSelected(ci);
    this.ctx.sfx.play('open');
    this.update(true);
  }

  close(): void {
    if (this.ci < 0) return;
    this.ci = -1;
    this.el.classList.remove('open');
    document.documentElement.classList.remove('panel-open');
    this.ctx.view.setSelected(-1);
    this.onClose();
  }

  setTab(tab: 'overview' | 'upgrades'): void {
    this.tab = tab;
    toggle(this.tabOverview, 'active', tab === 'overview');
    toggle(this.tabUpgrades, 'active', tab === 'upgrades');
    toggle(this.overview, 'hidden', tab !== 'overview');
    toggle(this.upgrades, 'hidden', tab !== 'upgrades');
    this.update(true);
  }

  private cart(): CartState | undefined {
    return this.ctx.sim.state.carts[this.ci];
  }

  private nudgePrice(dir: number): void {
    const c = this.cart();
    if (!c) return;
    this.ctx.sim.setPrice(this.ci, c.price + dir * BALANCE.cart.priceStep);
    this.ctx.sfx.play('tap');
    haptic(8);
    this.update(true);
  }

  private restock(): void {
    const n = this.ctx.sim.restock(this.ci);
    if (n > 0) {
      this.ctx.sfx.play('restock');
      this.ctx.save();
    } else this.ctx.sfx.play('error');
    this.update(true);
  }

  private doClean(): void {
    if (this.ctx.sim.clean(this.ci)) this.ctx.sfx.play('clean');
    this.update(true);
  }

  private buy(id: UpgradeId): void {
    if (this.ctx.sim.buyUpgrade(this.ci, id)) {
      this.ctx.sfx.play('upgrade');
      haptic(20);
      this.ctx.save();
      const card = this.cards.get(id);
      if (card) {
        card.root.classList.remove('bought');
        void card.root.offsetWidth;
        card.root.classList.add('bought');
      }
    } else {
      this.ctx.sfx.play('error');
    }
    this.update(true);
  }

  private tick = 0;

  update(force = false, dt = 0): void {
    if (this.ci < 0) return;
    this.tick += dt;
    if (!force && this.tick < 0.1) return;
    this.tick = 0;
    const c = this.cart();
    const rt = this.ctx.sim.runtime[this.ci];
    if (!c || !rt) return;
    const cash = this.ctx.sim.state.cash;
    setText(this.title, t('panel.title', { kitchen: t(`kitchen.${c.kitchen}`), n: this.ci + 1 }));
    setHtml(this.stars, starsHtml(rt.stars));
    setHtml(this.headIcon, icon(c.kitchen === 'burger' ? 'burger' : c.kitchen === 'crepe' ? 'crepe' : 'hotdog'));
    // affordable upgrades badge
    let affordable = 0;
    for (const id of UPGRADE_ORDER) if (c.up[id] < UPGRADES[id].maxLevel && cash >= upgradeCost(id, c.up[id])) affordable++;
    setText(this.upBadge, affordable > 0 ? String(affordable) : '');
    toggle(this.upBadge, 'hidden', affordable === 0);

    if (this.tab === 'overview') {
      setHtml(this.stock, `${icon(c.kitchen === 'burger' ? 'burger' : c.kitchen === 'crepe' ? 'crepe' : 'hotdog')}<b>${c.stock}/${stockCap(c)}</b><span>${t('panel.stock')}</span>`);
      const lowSup = c.supplies < batchSize(c);
      setHtml(this.supplies, `${icon('box')}<b class="${lowSup ? 'warn' : ''}">${Math.floor(c.supplies)}/${suppliesCap(c)}</b><span>${t('panel.supplies')}</span>`);
      setHtml(this.clean, `${icon('broom')}<b class="${c.clean < 55 ? 'warn' : ''}">${Math.round(c.clean)}%</b><span>${t('panel.clean')}</span>`);
      setHtml(this.queue, `${icon('people')}<b>${rt.queue.length}</b><span>${t('panel.queue')}</span>`);
      const can = this.ctx.sim.canCook(this.ci);
      this.cookBtn.disabled = can !== 'ok';
      setHtml(
        this.cookBtn,
        `${icon('flame')}<span>${can === 'full' ? t('panel.full') : can === 'noSupplies' ? t('panel.noSupplies') : can === 'busy' ? t('panel.cooking') : t(`panel.cookN.${c.kitchen}`, { n: batchSize(c) })}</span>`,
      );
      const rc = this.ctx.sim.restockPrice(this.ci);
      this.restockBtn.disabled = rc <= 0;
      setHtml(this.restockBtn, `${icon('box')}<span>${rc > 0 ? t('panel.restock', { cost: formatCash(Math.ceil(rc)) }) : t('panel.restockFull')}</span>`);
      toggle(this.restockBtn, 'attention', lowSup && rc > 0);
      const cleaning = rt.cleanT > 0;
      this.cleanBtn.disabled = cleaning || c.clean >= 99.5;
      setHtml(this.cleanBtn, `${icon('broom')}<span>${cleaning ? t('panel.cleaning') : t('panel.cleanBtn')}</span>`);
      toggle(this.cleanBtn, 'attention', c.clean < 55 && !cleaning);
      this.staff.update(this.ci);
      setText(this.price, formatPrice(c.price));
      const pm = priceMult(c);
      const demand = pm > 1.25 ? 'high' : pm > 0.8 ? 'normal' : pm > 0.45 ? 'low' : 'veryLow';
      const profit = c.price - ingredientCost(c);
      setHtml(
        this.priceInfo,
        `<span>${t('panel.fair', { p: formatPrice(fairPrice(c)) })}</span><span class="demand ${demand}">${t(`demand.${demand}`)}</span><span>${t('panel.profit', { p: formatPrice(Math.round(profit * 100) / 100) })}</span>`,
      );
      const a = rt.appeal;
      this.appealBars.clean.style.width = `${a.clean * 100}%`;
      this.appealBars.location.style.width = `${a.location * 100}%`;
      this.appealBars.price.style.width = `${a.price * 100}%`;
      this.appealBars.taste.style.width = `${a.taste * 100}%`;
    } else {
      for (const id of UPGRADE_ORDER) {
        const card = this.cards.get(id) as UpCard;
        const lvl = c.up[id];
        const max = UPGRADES[id].maxLevel;
        setText(card.level, t('up.level', { l: lvl, max }));
        setText(card.effect, effectText(c, id));
        if (lvl >= max) {
          card.buy.disabled = true;
          setHtml(card.buy, `<span>${t('up.max')}</span>`);
          toggle(card.root, 'can', false);
        } else {
          const cost = upgradeCost(id, lvl);
          card.buy.disabled = false;
          toggle(card.buy, 'poor', cash < cost);
          toggle(card.root, 'can', cash >= cost);
          setHtml(card.buy, `${icon('coin')}<span>${formatCash(cost)}</span>`);
        }
      }
    }
  }
}

export function starsHtml(stars: number): string {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const fill = Math.max(0, Math.min(1, stars - i));
    s += `<span class="st" style="--f:${Math.round(fill * 100)}%">${icon('star', 'st-ic')}</span>`;
  }
  return s;
}

function effectText(c: CartState, id: UpgradeId): string {
  const next: CartState = { ...c, up: { ...c.up, [id]: Math.min(UPGRADES[id].maxLevel, c.up[id] + 1) } };
  const maxed = c.up[id] >= UPGRADES[id].maxLevel;
  const pair = (a: string, b: string): string => (maxed ? a : `${a} → ${b}`);
  switch (id) {
    case 'grill':
      return t('up.grill.fx', { v: pair(String(batchSize(c)), String(batchSize(next))) });
    case 'speed':
      return t('up.speed.fx', { v: pair(serveSec(c).toFixed(1) + 's', serveSec(next).toFixed(1) + 's') });
    case 'recipe':
      return t('up.recipe.fx', { v: pair(formatPrice(fairPrice(c)), formatPrice(fairPrice(next))) });
    case 'sign':
      return t('up.sign.fx', { v: pair(`+${Math.round(c.up.sign * BALANCE.customers.signRate * 100)}%`, `+${Math.round(next.up.sign * BALANCE.customers.signRate * 100)}%`) });
    case 'comfort':
      return t('up.comfort.fx', { v: pair(Math.round(patienceSec(c)) + 's', Math.round(patienceSec(next)) + 's') });
    case 'pantry':
      return t('up.pantry.fx', { v: pair(String(suppliesCap(c)), String(suppliesCap(next))) });
  }
}

export function kitchenName(id: keyof typeof KITCHENS): string {
  return t(`kitchen.${id}`);
}
