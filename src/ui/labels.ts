import { CITY } from '../data/city';
import type { KitchenId } from '../data/kitchens';
import { formatCash, t } from '../core/i18n';
import { batchSize } from '../sim/cart';
import { Mood, PedState } from '../sim/peds';
import type { ScreenPoint } from '../render/view';
import type { UiContext } from './context';
import { h, icon, onTap, setHtml, toggle } from './dom';
import { ICON } from './icons';
import { starsHtml } from './cart-panel';

const TOP = CITY.curb;
const KITCHEN_ICON: Partial<Record<KitchenId, 'hotdog' | 'burger' | 'crepe'>> = { hotdog: 'hotdog', burger: 'burger', crepe: 'crepe' };

interface Badge {
  el: HTMLDivElement;
  key: string;
}

/** World-anchored DOM labels: cart badges, customer emotes, money popups, placement labels. */
export class Labels {
  private readonly layer: HTMLDivElement;
  private readonly badges: Badge[] = [];
  private readonly emotes: HTMLDivElement[] = [];
  private readonly popups: Array<{ el: HTMLDivElement; x: number; y: number; z: number; t: number }> = [];
  private readonly markerLabels: HTMLDivElement[] = [];
  private markerIds: string[] = [];
  private readonly sp: ScreenPoint = { x: 0, y: 0, visible: false };
  onBadge: (ci: number) => void = () => {};
  onMarker: (spot: string) => void = () => {};

  constructor(private readonly ctx: UiContext) {
    this.layer = h('div', 'labels');
    ctx.root.append(this.layer);
    for (let i = 0; i < 14; i++) {
      const e = h('div', 'emote');
      this.layer.append(e);
      this.emotes.push(e);
    }
    for (let i = 0; i < 20; i++) {
      const e = h('div', 'popup');
      this.layer.append(e);
      this.popups.push({ el: e, x: 0, y: 0, z: 0, t: 0 });
    }
  }

  badgeEl(ci: number): HTMLElement | undefined {
    return this.badges[ci]?.el;
  }

  private ensureBadges(): void {
    while (this.badges.length < this.ctx.sim.state.carts.length) {
      const ci = this.badges.length;
      const el = h('div', 'badge');
      onTap(el, () => this.onBadge(ci));
      this.layer.append(el);
      this.badges.push({ el, key: '' });
    }
  }

  /** "+$5" rising above a world point. */
  popup(x: number, y: number, z: number, text: string, kind: 'cash' | 'tip' | 'info' = 'cash'): void {
    const p = this.popups.find((q) => q.t <= 0) ?? this.popups[0];
    if (!p) return;
    p.x = x;
    p.y = y;
    p.z = z;
    p.t = 1.1;
    p.el.className = `popup show ${kind}`;
    p.el.innerHTML = text;
  }

  showMarkers(ids: string[], kitchen: KitchenId = 'hotdog'): void {
    this.markerIds = ids;
    while (this.markerLabels.length < ids.length) {
      const el = h('div', 'marker-label');
      const idx = this.markerLabels.length;
      onTap(el, () => {
        const id = this.markerIds[idx];
        if (id) this.onMarker(id);
      });
      this.layer.append(el);
      this.markerLabels.push(el);
    }
    const sim = this.ctx.sim;
    this.markerLabels.forEach((el, i) => {
      const id = ids[i];
      toggle(el, 'hidden', !id);
      if (!id) return;
      const s = sim.spotById.get(id);
      if (!s) return;
      const comp = sim.competitorsNear(s, kitchen);
      el.innerHTML = `<div class="ml-stars">${starsHtml(s.traffic * 5)}</div><div class="ml-text">${t('place.traffic')}</div>${comp > 0 ? `<div class="ml-warn">${t('place.competition')}</div>` : ''}`;
    });
  }

  hideMarkers(): void {
    this.markerIds = [];
    for (const el of this.markerLabels) toggle(el, 'hidden', true);
  }

  update(dt: number): void {
    const { sim, view } = this.ctx;
    this.ensureBadges();
    const st = sim.state;
    // cart badges
    for (let ci = 0; ci < this.badges.length; ci++) {
      const b = this.badges[ci] as Badge;
      const c = st.carts[ci];
      const rt = sim.runtime[ci];
      if (!c || !rt) continue;
      const s = sim.spotOf(c);
      const p = view.project(s.x, TOP + 3.75, s.z, this.sp);
      toggle(b.el, 'hidden', !p.visible);
      if (!p.visible) continue;
      b.el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0) translate(-50%, -100%)`;
      const cook = sim.canCook(ci);
      const lowSup = c.supplies < batchSize(c);
      const dirty = c.clean < 55;
      const worker = sim.workerOf(ci);
      const staffed = !!worker;
      let state = 'ok';
      if (rt.cooking) state = 'cooking';
      else if (c.stock === 0 && cook === 'ok' && !staffed) state = rt.queue.length > 0 ? 'urgent' : 'cook';
      else if (c.stock === 0 && cook === 'noSupplies') state = 'nosup';
      const lowSupShown = lowSup && !(worker && worker.auto >= 2);
      const dirtyShown = dirty && !(worker && worker.auto >= 4);
      const key = `${state}|${c.stock}|${lowSupShown}|${dirtyShown}|${staffed}|${c.kitchen}`;
      if (key !== b.key) {
        b.key = key;
        b.el.className = `badge ${state}`;
        let html = '';
        if (state === 'cooking') html = `${icon('flame')}<span>${t('badge.cooking')}</span>`;
        else if (state === 'urgent' || state === 'cook') html = `${icon('flame')}<span>${t('badge.cook')}</span>`;
        else if (state === 'nosup') html = `${icon('box')}<span>${t('badge.restock')}</span>`;
        else html = `${icon(KITCHEN_ICON[c.kitchen] ?? 'hotdog')}<b>${c.stock}</b>${cook === 'ok' ? `<span class="plus">${icon('plus')}</span>` : ''}`;
        if (staffed) html += `<span class="staff-ic">${icon('people')}</span>`;
        if (lowSupShown && state !== 'nosup') html += `<span class="warn-ic">${icon('box')}</span>`;
        if (dirtyShown) html += `<span class="warn-ic">${icon('broom')}</span>`;
        b.el.innerHTML = html;
      }
    }
    // emotes over customers that just bought / gave up
    let k = 0;
    for (const p of sim.peds) {
      if (k >= this.emotes.length) break;
      if (p.state === PedState.Off || p.mood === Mood.None) continue;
      const sp = view.project(p.x, TOP + 2.25 + (2.2 - p.moodT) * 0.25, p.z, this.sp);
      if (!sp.visible) continue;
      const e = this.emotes[k++] as HTMLDivElement;
      setHtml(e, p.mood === Mood.Happy ? ICON.heart : ICON.angry);
      e.style.transform = `translate3d(${Math.round(sp.x)}px, ${Math.round(sp.y)}px, 0) translate(-50%, -100%)`;
      e.style.opacity = String(Math.min(1, p.moodT * 2));
      toggle(e, 'hidden', false);
    }
    for (; k < this.emotes.length; k++) toggle(this.emotes[k] as HTMLDivElement, 'hidden', true);
    // popups
    for (const p of this.popups) {
      if (p.t <= 0) continue;
      p.t -= dt;
      if (p.t <= 0) {
        p.el.className = 'popup';
        continue;
      }
      const age = 1.1 - p.t;
      const sp = view.project(p.x, p.y + age * 1.6, p.z, this.sp);
      p.el.style.transform = `translate3d(${Math.round(sp.x)}px, ${Math.round(sp.y)}px, 0) translate(-50%, -100%) scale(${Math.min(1, 0.6 + age * 4).toFixed(2)})`;
      p.el.style.opacity = String(Math.min(1, p.t * 2.5));
    }
    // placement labels
    this.markerIds.forEach((id, i) => {
      const el = this.markerLabels[i];
      const s = sim.spotById.get(id);
      if (!el || !s) return;
      const sp = view.project(s.x, TOP + 3.4, s.z, this.sp);
      toggle(el, 'hidden', !sp.visible);
      el.style.transform = `translate3d(${Math.round(sp.x)}px, ${Math.round(sp.y)}px, 0) translate(-50%, -100%)`;
    });
  }

  saleText(amount: number, tip: number): string {
    return tip > 0 ? `+${formatCash(amount - tip)} <small>+${formatCash(tip)} ${t('popup.tip')}</small>` : `+${formatCash(amount)}`;
  }
}
