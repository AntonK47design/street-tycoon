import { t } from '../core/i18n';
import { QUESTS } from '../data/quests';
import type { PropertyPanel } from './property-panel';
import type { RoomEditor } from './editor';
import type { LandPanel } from './land-panel';
import { LAND } from '../data/production';
import { batchSize } from '../sim/cart';
import type { ScreenPoint } from '../render/view';
import type { CartPanel } from './cart-panel';
import type { UiContext } from './context';
import { h, onTap, setText, toggle } from './dom';
import type { Hud } from './hud';
import type { Labels } from './labels';

const TUTORIAL_END = QUESTS.findIndex((q) => q.id === 'q_kitchen');

type Target = { el: HTMLElement } | { world: [number, number, number] } | null;

interface Hint {
  id: string;
  text: string;
  target: Target;
}

/**
 * Contextual tutorial: one sentence + a bouncing arrow at the thing to press. Driven by game state, not
 * by a script, so it never gets stuck. Skippable; tips about supplies/cleaning appear once each.
 */
export class Tutorial {
  private readonly bubble: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly skip: HTMLButtonElement;
  private readonly arrow: HTMLDivElement;
  private readonly sp: ScreenPoint = { x: 0, y: 0, visible: false };
  private tipUntil = 0;
  private tip: Hint | null = null;
  private time = 0;
  placing = false;
  minigameOpen = false;
  shop: { panel: PropertyPanel; editor: RoomEditor } | null = null;
  land: LandPanel | null = null;

  constructor(
    private readonly ctx: UiContext,
    private readonly hud: Hud,
    private readonly panel: CartPanel,
    private readonly labels: Labels,
  ) {
    this.bubble = h('div', 'hint hidden');
    this.text = h('div', 'hint-text');
    this.skip = h('button', 'hint-skip', t('tut.skip'));
    onTap(this.skip, () => {
      this.flags.tutorialSkipped = true;
      ctx.save();
    });
    this.bubble.append(this.text, this.skip);
    this.arrow = h('div', 'tut-arrow hidden');
    ctx.root.append(this.bubble, this.arrow);
  }

  private get flags(): Record<string, boolean> {
    return this.ctx.sim.state.flags;
  }

  get active(): boolean {
    return !this.flags.tutorialSkipped && !this.flags.tutorialDone;
  }

  /** One-off tips (shown once per save). */
  maybeTip(id: string, cartIdx = -1): void {
    if (this.flags[`tip_${id}`] || this.tip) return;
    this.flags[`tip_${id}`] = true;
    const c = cartIdx >= 0 ? this.ctx.sim.state.carts[cartIdx] : undefined;
    const s = c ? this.ctx.sim.spotOf(c) : undefined;
    this.tip = { id, text: t(`tip.${id}`), target: s ? { world: [s.x, 4.2, s.z] } : null };
    this.tipUntil = this.time + 5.5;
  }

  private cartTarget(ci = 0): Target {
    if (this.panel.isOpen) return null;
    const el = this.labels.badgeEl(ci);
    return el && !el.classList.contains('hidden') ? { el } : null;
  }

  /** Short guide for the Outskirts — shown even after the main tutorial unless it was skipped. */
  private landHint(): Hint | null {
    const sim = this.ctx.sim;
    const st = sim.state;
    const q = sim.currentQuest();
    const lp = this.land;
    if (!q || !lp || this.flags.tutorialSkipped) return null;
    const hud = this.hud.landBtn;
    const travel = !hud.classList.contains('hidden') && !lp.isOpen ? { el: hud } : null;
    switch (q.id) {
      case 'q_land':
        if (st.cash < LAND.unlockCost) return null;
        if (lp.unlockBtn && lp.isOpen) return { id: 'land2', text: t('tut.landUnlock'), target: { el: lp.unlockBtn } };
        return { id: 'land1', text: t('tut.land'), target: travel };
      case 'q_parcel': {
        if (st.cash < sim.production.parcelPrice()) return null;
        if (lp.isOpen && lp.buyBtn) return { id: 'parcel2', text: t('tut.parcelBuy'), target: { el: lp.buyBtn } };
        const el = this.labels.parcelEl(0);
        return { id: 'parcel1', text: t('tut.parcel'), target: el && !el.classList.contains('hidden') ? { el } : travel };
      }
      case 'q_farm': {
        if (lp.isOpen && lp.firstBuildCard) return { id: 'farm2', text: t('tut.farmBuild'), target: { el: lp.firstBuildCard } };
        const own = st.land.parcels[0];
        const el = own ? this.labels.parcelEl(own.id) : undefined;
        return { id: 'farm1', text: t('tut.farm'), target: el && !el.classList.contains('hidden') ? { el } : travel };
      }
      case 'q_produce': {
        if (lp.isOpen && lp.startBtn && !lp.startBtn.classList.contains('hidden') && !lp.startBtn.disabled) return { id: 'prod2', text: t('tut.produceStart'), target: { el: lp.startBtn } };
        return null;
      }
      case 'q_sellGoods': {
        const b = this.hud.storageBtn;
        if (sim.production.stored() < 20 || b.classList.contains('hidden')) return null;
        return { id: 'sell', text: t('tut.sellGoods'), target: { el: b } };
      }
      default:
        return null;
    }
  }

  private current(): Hint | null {
    const sim = this.ctx.sim;
    const st = sim.state;
    const lh = this.landHint();
    if (lh) return lh;
    if (!this.active) return null;
    const q = sim.currentQuest();
    if (!q || st.quest >= TUTORIAL_END) {
      this.flags.tutorialDone = true;
      return null;
    }
    const c0 = st.carts[0];
    if (!c0) return null;
    switch (q.id) {
      case 'q_cook':
        if (this.panel.isOpen) return { id: 'cook', text: t('tut.cookPanel'), target: { el: this.panel.cookBtn } };
        return { id: 'cook', text: t('tut.cook'), target: this.cartTarget(0) };
      case 'q_serve3':
        if (st.stats.served === 0) return { id: 'serve', text: t('tut.serve'), target: null };
        if (c0.stock === 0 && sim.canCook(0) === 'ok') return { id: 'more', text: t('tut.cookMore'), target: this.cartTarget(0) };
        return null;
      case 'q_upgrade': {
        if (st.cash < sim.cheapestUpgrade()) return c0.stock === 0 && sim.canCook(0) === 'ok' ? { id: 'more', text: t('tut.cookMore'), target: this.cartTarget(0) } : null;
        if (!this.panel.isOpen) return { id: 'up1', text: t('tut.openCart'), target: this.cartTarget(0) };
        if (this.panel.currentTab !== 'upgrades') return { id: 'up2', text: t('tut.upgradesTab'), target: { el: this.panel.upgradesTab } };
        const btn = this.panel.cardButton('grill');
        return { id: 'up3', text: t('tut.buyUpgrade'), target: btn ? { el: btn } : null };
      }
      case 'q_price':
        if (!this.panel.isOpen) return { id: 'price1', text: t('tut.priceOpen'), target: this.cartTarget(0) };
        if (this.panel.currentTab !== 'overview') return { id: 'price2', text: t('tut.priceTab'), target: null };
        return { id: 'price3', text: t('tut.price'), target: { el: this.panel.priceUp } };
      case 'q_cart2': {
        const cost = sim.nextCartCost() ?? Infinity;
        if (this.placing) return { id: 'place', text: t('tut.place'), target: null };
        if (st.cash < cost) return c0.stock === 0 && sim.canCook(0) === 'ok' ? { id: 'more', text: t('tut.cookMore'), target: this.cartTarget(0) } : null;
        return { id: 'cart', text: t('tut.newCart'), target: { el: this.hud.newCart } };
      }
      case 'q_hire': {
        const cand = sim.candidates()[0];
        if (!cand || st.cash < cand.cost) return null;
        if (!this.panel.isOpen) return { id: 'hire1', text: t('tut.hireOpen'), target: this.cartTarget(0) };
        if (this.panel.currentTab !== 'overview') return { id: 'hire2', text: t('tut.priceTab'), target: { el: this.panel.overviewTab } };
        return { id: 'hire3', text: t('tut.hire'), target: { el: this.panel.staff.hireBtn } };
      }
      case 'q_workerCooks':
        return { id: 'worker', text: t('tut.workerWorks'), target: null };
      case 'q_train': {
        const w = st.workers[0];
        if (!w || w.training || st.cash < 150) return w?.training ? { id: 'training', text: t('tut.training'), target: null } : null;
        const ci = sim.cartIndexOfWorker(w);
        if (this.panel.cartIndex !== ci) return { id: 'train1', text: t('tut.trainOpen'), target: this.cartTarget(Math.max(0, ci)) };
        if (this.panel.currentTab !== 'overview') return { id: 'train2', text: t('tut.priceTab'), target: { el: this.panel.overviewTab } };
        return { id: 'train3', text: t('tut.train'), target: { el: this.panel.staff.trainBtn } };
      }
      case 'q_rent': {
        const sh = this.shop;
        if (!sh) return null;
        const free = sim.city.properties.map((_, i) => i).filter((i) => !sim.shops.property(i));
        const cheapest = Math.min(...free.map((i) => sim.shops.info(i)?.rentPerDay ?? Infinity));
        if (st.cash < cheapest) return null;
        if (sh.panel.isOpen && sh.panel.rentBtn) return { id: 'rent2', text: t('tut.rentPick'), target: { el: sh.panel.rentBtn } };
        const best = free.sort((a, b) => (sim.shops.info(b)?.traffic ?? 0) - (sim.shops.info(a)?.traffic ?? 0))[0];
        const el = best !== undefined ? this.labels.propertyEl(best) : undefined;
        return { id: 'rent1', text: t('tut.rent'), target: el && !el.classList.contains('hidden') ? { el } : null };
      }
      case 'q_shopSales':
        return this.shop?.editor.isOpen ? { id: 'shop1', text: t('tut.shopEditor'), target: { el: this.shop.editor.doneBtn } } : { id: 'shop2', text: t('tut.shopSells'), target: null };
      case 'q_layout': {
        const sh = this.shop;
        if (!sh) return null;
        if (sh.editor.isOpen) {
          if (sh.editor.modeKind !== 'idle') return { id: 'lay3', text: t('tut.layoutPlace'), target: null };
          const b = sh.editor.catalogButtons.get(st.cash >= 75 ? 'display' : 'plant');
          return { id: 'lay2', text: t('tut.layout'), target: b ? { el: b } : null };
        }
        if (sh.panel.isOpen && sh.panel.editBtn) return { id: 'lay1', text: t('tut.layoutOpen'), target: { el: sh.panel.editBtn } };
        const own = st.properties[0];
        const el = own ? this.labels.propertyEl(own.id) : undefined;
        return { id: 'lay0', text: t('tut.layoutOpen'), target: el && !el.classList.contains('hidden') ? { el } : null };
      }
      default:
        return null;
    }
  }

  update(dt: number): void {
    this.time += dt;
    const sim = this.ctx.sim;
    // tips
    sim.state.carts.forEach((c, ci) => {
      if (sim.state.stats.served < 6) return;
      if (c.supplies < batchSize(c) * 2) this.maybeTip('supplies', ci);
      else if (c.clean < 60) this.maybeTip('clean', ci);
    });
    if (this.tip && this.time > this.tipUntil) this.tip = null;
    const hint = this.minigameOpen ? null : (this.current() ?? this.tip);
    toggle(this.bubble, 'hidden', !hint);
    toggle(this.skip, 'hidden', !hint || hint === this.tip || !this.active);
    if (!hint) {
      toggle(this.arrow, 'hidden', true);
      return;
    }
    setText(this.text, hint.text);
    let x = 0;
    let y = 0;
    let ok = false;
    const tg = hint.target;
    if (tg && 'el' in tg) {
      const r = tg.el.getBoundingClientRect();
      const root = this.ctx.root.getBoundingClientRect();
      ok = r.width > 0 && r.height > 0;
      x = r.left + r.width / 2 - root.left;
      y = r.top - root.top;
    } else if (tg && 'world' in tg) {
      const p = this.ctx.view.project(tg.world[0], tg.world[1], tg.world[2], this.sp);
      ok = p.visible;
      x = p.x;
      y = p.y;
    }
    toggle(this.arrow, 'hidden', !ok);
    if (ok) {
      const bob = Math.sin(this.time * 6) * 6;
      this.arrow.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y - 6 + bob)}px, 0) translate(-50%, -100%)`;
    }
  }
}
