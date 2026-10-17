import { SHOP_COLORS, SHOP_KINDS, productsFor, type ShopKind } from '../data/shops';
import { formatCash, formatPrice, t } from '../core/i18n';
import { DAY_SEC } from '../sim/shops';
import { starsHtml } from './cart-panel';
import type { UiContext } from './context';
import { h, haptic, icon, onTap, setHtml, toggle } from './dom';
import { StaffBox, duration } from './retention-ui';

type Tab = 'shop' | 'building';

/** Side panel for a rentable property: rent/buy, then shop stats, prices, cashier, apartments. */
export class PropertyPanel {
  readonly el: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly tabShop: HTMLButtonElement;
  private readonly tabBuilding: HTMLButtonElement;
  private readonly body: HTMLDivElement;
  private pi = -1;
  private tab: Tab = 'shop';
  private kind: ShopKind = 'snack';
  private key = '';
  private tick = 0;
  /** Elements refreshed every tick (text only). */
  private live: Array<() => void> = [];
  readonly staff: StaffBox;
  editBtn: HTMLButtonElement | null = null;
  rentBtn: HTMLButtonElement | null = null;
  onEdit: (pi: number) => void = () => {};
  onHireCashier: (pi: number) => void = () => {};
  onClose: () => void = () => {};

  constructor(private readonly ctx: UiContext) {
    this.el = h('div', 'panel property-panel');
    const head = h('div', 'panel-head');
    const tw = h('div', 'title-wrap');
    this.title = h('div', 'panel-title');
    this.sub = h('div', 'panel-sub');
    tw.append(this.title, this.sub);
    const close = h('button', 'icon-btn close', icon('close'));
    close.setAttribute('aria-label', t('ui.close'));
    onTap(close, () => this.close());
    head.append(h('div', 'panel-icon', icon('shop')), tw, close);
    this.tabs = h('div', 'tabs');
    this.tabShop = h('button', 'tab', t('prop.tabShop'));
    this.tabBuilding = h('button', 'tab', t('prop.tabBuilding'));
    onTap(this.tabShop, () => this.setTab('shop'));
    onTap(this.tabBuilding, () => this.setTab('building'));
    this.tabs.append(this.tabShop, this.tabBuilding);
    this.body = h('div', 'panel-body');
    this.el.append(head, this.tabs, this.body);
    ctx.root.append(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.staff = new StaffBox(ctx);
    this.staff.onHire = () => this.onHireCashier(this.pi);
    this.staff.bindTrain(() => {
      const w = ctx.sim.shops.cashierOf(this.pi);
      if (w && ctx.sim.startTraining(w.id)) {
        ctx.sfx.play('upgrade');
        ctx.save();
      } else ctx.sfx.play('error');
    });
  }

  get isOpen(): boolean {
    return this.pi >= 0;
  }

  get propertyId(): number {
    return this.pi;
  }

  open(pi: number): void {
    this.pi = pi;
    this.tab = 'shop';
    this.key = '';
    this.el.classList.add('open');
    document.documentElement.classList.add('panel-open');
    this.ctx.sfx.play('open');
    this.update(true);
  }

  close(): void {
    if (this.pi < 0) return;
    this.pi = -1;
    this.el.classList.remove('open');
    document.documentElement.classList.remove('panel-open');
    this.onClose();
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.key = '';
    this.update(true);
  }

  update(force = false, dt = 0): void {
    if (this.pi < 0) return;
    this.tick += dt;
    const sim = this.ctx.sim;
    const p = sim.shops.property(this.pi);
    const w = sim.shops.cashierOf(this.pi);
    const key = `${this.tab}|${p?.status}|${p?.shop?.kind}|${p?.apartments.map((a) => a.status).join(',')}|${!!w}|${this.kind}`;
    if (key !== this.key) {
      this.key = key;
      this.render();
      force = true;
    }
    if (!force && this.tick < 0.2) return;
    this.tick = 0;
    for (const f of this.live) f();
  }

  private render(): void {
    const sim = this.ctx.sim;
    const inf = sim.shops.info(this.pi);
    const p = sim.shops.property(this.pi);
    this.body.innerHTML = '';
    this.live = [];
    this.editBtn = null;
    this.rentBtn = null;
    if (!inf) return;
    this.title.textContent = p?.shop ? t(`shop.${p.shop.kind}`) : t('prop.forRent');
    this.sub.innerHTML = `${starsHtml(inf.traffic * 5)} <span>${t('prop.area', { a: inf.area })}</span>`;
    toggle(this.tabs, 'hidden', !p);
    toggle(this.tabShop, 'active', this.tab === 'shop');
    toggle(this.tabBuilding, 'active', this.tab === 'building');
    const box = h('div', 'tab-body');
    this.body.append(box);
    if (!p) {
      // choose a shop kind, then rent or buy
      box.append(h('div', 'modal-sub', t('prop.intro')));
      const grid = h('div', 'kitchen-grid');
      for (const k of SHOP_KINDS) {
        const card = h('button', `kitchen-card${k === this.kind ? ' picked' : ''}`);
        card.style.setProperty('--kc', `#${SHOP_COLORS[k].toString(16).padStart(6, '0')}`);
        card.innerHTML = `<div class="kc-name">${t(`shop.${k}`)}</div><div class="kc-info">${productsFor(k)
          .map((pr) => t(`prod.${pr.id}`))
          .join(', ')}</div>`;
        onTap(card, () => {
          this.kind = k;
          this.ctx.sfx.play('tap');
          this.update(true);
        });
        grid.append(card);
      }
      box.append(grid);
      const row = h('div', 'actions');
      this.rentBtn = h('button', 'btn primary big', `${icon('key')}<span>${t('prop.rent', { v: formatCash(inf.rentPerDay) })}</span>`);
      const buy = h('button', 'btn buy', `${icon('coin')}<span>${t('prop.buy', { v: formatCash(inf.buyPrice) })}</span>`);
      onTap(this.rentBtn, () => this.acquire(false));
      onTap(buy, () => this.acquire(true));
      row.append(this.rentBtn, buy, h('div', 'modal-note', t('prop.rentNote')));
      box.append(row);
      this.live.push(() => {
        toggle(this.rentBtn as HTMLElement, 'poor', sim.state.cash < inf.rentPerDay);
        toggle(buy, 'poor', sim.state.cash < inf.buyPrice);
      });
      return;
    }
    if (this.tab === 'shop' && p.shop) this.renderShop(box);
    else this.renderBuilding(box);
  }

  private acquire(buy: boolean): void {
    const sim = this.ctx.sim;
    if (sim.shops.acquire(this.pi, this.kind, buy)) {
      sim.shops.restock(this.pi);
      this.ctx.sfx.play('cart');
      haptic(25);
      this.ctx.platform.happytime();
      this.ctx.save();
      this.key = '';
      this.update(true);
      this.onEdit(this.pi);
    } else this.ctx.sfx.play('error');
  }

  private renderShop(box: HTMLElement): void {
    const sim = this.ctx.sim;
    const shops = sim.shops;
    const p = shops.property(this.pi);
    const shop = p?.shop;
    if (!p || !shop) return;
    // rating
    const rating = h('div', 'appeal-box');
    rating.append(h('div', 'box-head', `${icon('star')}<span>${t('shop.layout')}</span><b class="rating-pct"></b>`));
    const bars: Record<string, HTMLElement> = {};
    for (const k of ['checkout', 'reach', 'variety', 'density', 'decor', 'space']) {
      const row = h('div', 'bar-row', `<span>${t(`rating.${k}`)}</span><div class="bar"><i></i></div>`);
      rating.append(row);
      bars[k] = row.querySelector('i') as HTMLElement;
    }
    const closed = h('div', 'modal-note warn hidden', t('shop.closed'));
    rating.append(closed);
    this.editBtn = h('button', 'btn primary big', `${icon('layout')}<span>${t('shop.edit')}</span>`);
    onTap(this.editBtn, () => this.onEdit(this.pi));
    const stats = h('div', 'stat-row three');
    const sSold = h('div', 'stat');
    const sInside = h('div', 'stat');
    const sStock = h('div', 'stat');
    stats.append(sSold, sInside, sStock);
    const restock = h('button', 'btn restock', '');
    onTap(restock, () => {
      if (shops.restock(this.pi) > 0) {
        this.ctx.sfx.play('restock');
        this.ctx.save();
      } else this.ctx.sfx.play('error');
    });
    // prices
    const prices = h('div', 'price-box');
    prices.append(h('div', 'box-head', `${icon('tag')}<span>${t('panel.price')}</span>`));
    for (const prod of productsFor(shop.kind)) {
      const row = h('div', 'price-row');
      const val = h('b', 'pv');
      const dn = h('button', 'btn round small', '−');
      const up = h('button', 'btn round small', '+');
      onTap(dn, () => shops.setPrice(this.pi, prod.id, (shop.prices[prod.id] ?? prod.fair) - 0.5));
      onTap(up, () => shops.setPrice(this.pi, prod.id, (shop.prices[prod.id] ?? prod.fair) + 0.5));
      row.append(h('span', 'pn', `<i class="dot" style="background:#${prod.color.toString(16).padStart(6, '0')}"></i>${t(`prod.${prod.id}`)}`), dn, val, up);
      prices.append(row);
      this.live.push(() => {
        const v = shop.prices[prod.id] ?? prod.fair;
        val.textContent = formatPrice(v);
        val.className = `pv ${v > prod.fair * 1.4 ? 'hi' : v < prod.fair * 0.9 ? 'lo' : ''}`;
      });
    }
    prices.append(h('div', 'modal-note', t('shop.priceNote')));
    box.append(rating, this.editBtn, stats, restock, this.staff.el, prices);
    this.live.push(() => {
      const rt = shops.runtime.get(this.pi);
      if (!rt) return;
      const r = rt.rating;
      setHtml(rating.querySelector('.rating-pct') as HTMLElement, `${Math.round(r.total * 100)}%`);
      for (const k of Object.keys(bars)) (bars[k] as HTMLElement).style.width = `${(r as unknown as Record<string, number>)[k]! * 100}%`;
      toggle(closed, 'hidden', r.open);
      setHtml(sSold, `${icon('coin')}<b>${formatCash(shop.earned)}</b><span>${t('shop.earned')}</span>`);
      setHtml(sInside, `${icon('people')}<b>${rt.inside.length}</b><span>${t('shop.inside')}</span>`);
      const sf = shops.stockFraction(this.pi);
      setHtml(sStock, `${icon('box')}<b class="${sf < 0.3 ? 'warn' : ''}">${Math.round(sf * 100)}%</b><span>${t('shop.stock')}</span>`);
      const cost = shops.restockCost(this.pi);
      restock.disabled = cost <= 0;
      setHtml(restock, `${icon('box')}<span>${cost > 0 ? t('panel.restock', { cost: formatCash(Math.ceil(cost)) }) : t('panel.restockFull')}</span>`);
      toggle(restock, 'attention', sf < 0.3 && cost > 0);
      this.staff.updateFor(shops.cashierOf(this.pi), true);
    });
  }

  private renderBuilding(box: HTMLElement): void {
    const sim = this.ctx.sim;
    const shops = sim.shops;
    const p = shops.property(this.pi);
    const inf = shops.info(this.pi);
    if (!p || !inf) return;
    const status = h('div', 'staff-box');
    status.append(h('div', 'box-head', `${icon('key')}<span>${t(p.status === 'owned' ? 'prop.owned' : 'prop.rented')}</span>`));
    if (p.status === 'rented') {
      status.append(h('div', 'modal-note', t('prop.rentLine', { v: formatCash(inf.rentPerDay), m: formatPrice(Math.round(((inf.rentPerDay * 60) / DAY_SEC) * 10) / 10) })));
      const buy = h('button', 'btn buy', `${icon('coin')}<span>${t('prop.buyOut', { v: formatCash(inf.buyPrice) })}</span>`);
      onTap(buy, () => {
        if (shops.buyOut(this.pi)) {
          this.ctx.sfx.play('cart');
          this.ctx.platform.happytime();
          this.ctx.save();
          this.update(true);
        } else this.ctx.sfx.play('error');
      });
      status.append(buy, h('div', 'modal-note', t('prop.buyNote')));
      this.live.push(() => toggle(buy, 'poor', sim.state.cash < inf.buyPrice));
    } else status.append(h('div', 'modal-note', t('prop.ownedNote')));
    box.append(status);
    if (!p.apartments.length) return;
    const floors = h('div', 'staff-box');
    floors.append(h('div', 'box-head', `${icon('people')}<span>${t('prop.floors')}</span>`));
    p.apartments.forEach((a, k) => {
      const row = h('div', 'task');
      const mid = h('div', 'task-mid');
      const name = h('div', 'task-name', t('prop.floor', { n: k + 1 }));
      const info = h('div', 'cand-info');
      mid.append(name, info);
      const btn = h('button', 'btn buy', '');
      onTap(btn, () => {
        if (shops.renovate(this.pi, k)) {
          this.ctx.sfx.play('upgrade');
          this.ctx.save();
          this.update(true);
        } else this.ctx.sfx.play('error');
      });
      row.append(mid, btn);
      floors.append(row);
      this.live.push(() => {
        const locked = p.status !== 'owned';
        toggle(btn, 'hidden', a.status !== 'empty');
        btn.disabled = locked;
        setHtml(btn, `${icon(locked ? 'lock' : 'coin')}<span>${formatCash(shops.renovateCost(k))}</span>`);
        toggle(btn, 'poor', !locked && sim.state.cash < shops.renovateCost(k));
        info.textContent =
          a.status === 'rented'
            ? t('prop.tenant', { v: formatCash(shops.apartmentRent(k)) })
            : a.status === 'renovating'
              ? t('prop.renovating', { d: duration(a.endsAt - sim.state.worldTime) })
              : locked
                ? t('prop.needOwn')
                : t('prop.empty', { v: formatCash(shops.apartmentRent(k)) });
      });
    });
    box.append(floors);
  }
}
