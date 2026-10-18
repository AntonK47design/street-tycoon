import { FACILITIES, FACILITY_ORDER, GOODS, GOOD_ORDER, LAND, recipeById, type FacilityKind, type GoodId, type Recipe } from '../data/production';
import { formatCash, formatNumber, formatPrice, t } from '../core/i18n';
import type { UiContext } from './context';
import { h, haptic, icon, onTap, setHtml, toggle } from './dom';
import { Modal } from './modal';
import { StaffBox, duration } from './retention-ui';

export function goodChip(g: GoodId, n?: number): string {
  return `<span class="gchip"><i class="dot" style="background:#${GOODS[g].color.toString(16).padStart(6, '0')}"></i>${n !== undefined ? `${formatNumber(n)} ` : ''}${t(`good.${g}`)}</span>`;
}

function recipeHtml(r: Recipe, mult = 1): string {
  const ins = (Object.entries(r.inputs) as Array<[GoodId, number]>).map(([g, q]) => goodChip(g, q)).join(' ');
  const outs = (Object.entries(r.outputs) as Array<[GoodId, number]>).map(([g, q]) => goodChip(g, Math.max(1, Math.round(q * mult)))).join(' ');
  return `${ins || (r.cost ? `<span class="gchip">${icon('coin')}${formatCash(r.cost)}</span>` : '')}<span class="arrow">→</span>${outs}<span class="rt">${duration(r.sec)}</span>`;
}

/** Side panel for a land parcel: buy → build → run recipes, workers, merge, demolish. */
export class LandPanel {
  readonly el: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private id = -1;
  private key = '';
  private tick = 0;
  private live: Array<() => void> = [];
  private confirmDemolish = false;
  readonly staff: StaffBox;
  buyBtn: HTMLButtonElement | null = null;
  unlockBtn: HTMLButtonElement | null = null;
  startBtn: HTMLButtonElement | null = null;
  firstBuildCard: HTMLElement | null = null;
  onHire: (parcel: number) => void = () => {};
  onStorage: () => void = () => {};

  constructor(private readonly ctx: UiContext) {
    this.el = h('div', 'panel land-panel');
    const head = h('div', 'panel-head');
    const tw = h('div', 'title-wrap');
    this.title = h('div', 'panel-title');
    this.sub = h('div', 'panel-sub');
    tw.append(this.title, this.sub);
    const close = h('button', 'icon-btn close', icon('close'));
    close.setAttribute('aria-label', t('ui.close'));
    onTap(close, () => this.close());
    head.append(h('div', 'panel-icon', icon('field')), tw, close);
    this.body = h('div', 'panel-body');
    this.el.append(head, this.body);
    ctx.root.append(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.staff = new StaffBox(ctx);
    this.staff.onHire = () => this.onHire(this.id);
    this.staff.bindTrain(() => {
      const w = ctx.sim.production.workerOf(this.mainId());
      if (w && ctx.sim.startTraining(w.id)) {
        ctx.sfx.play('upgrade');
        ctx.save();
      } else ctx.sfx.play('error');
    });
  }

  get isOpen(): boolean {
    return this.id >= 0;
  }

  get parcelId(): number {
    return this.id;
  }

  private mainId(): number {
    return this.ctx.sim.production.facilityAt(this.id)?.main.id ?? this.id;
  }

  open(id: number): void {
    this.id = id;
    this.key = '';
    this.confirmDemolish = false;
    this.el.classList.add('open');
    document.documentElement.classList.add('panel-open');
    this.ctx.sfx.play('open');
    this.update(true);
  }

  close(): void {
    if (this.id < 0) return;
    this.id = -1;
    this.el.classList.remove('open');
    document.documentElement.classList.remove('panel-open');
  }

  update(force = false, dt = 0): void {
    if (this.id < 0) return;
    this.tick += dt;
    const prod = this.ctx.sim.production;
    const at = prod.facilityAt(this.id);
    const owned = prod.owned(this.id);
    const st = this.ctx.sim.state;
    const building = !!at && st.worldTime < at.f.builtAt;
    const key = `${st.land.unlocked}|${!!owned}|${at?.f.kind}|${at?.f.merged}|${at?.f.recipe}|${building}|${!!prod.workerOf(this.mainId())}|${at ? prod.recipes(at.f).length : 0}|${this.confirmDemolish}|${at?.f.animal}`;
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
    const prod = this.ctx.sim.production;
    const st = this.ctx.sim.state;
    this.body.innerHTML = '';
    this.live = [];
    this.buyBtn = null;
    this.unlockBtn = null;
    this.startBtn = null;
    this.firstBuildCard = null;
    const box = h('div', 'tab-body');
    this.body.append(box);
    const owned = prod.owned(this.id);
    const at = prod.facilityAt(this.id);
    this.sub.textContent = t('land.parcel', { n: this.id + 1 });
    if (!st.land.unlocked) {
      this.title.textContent = t('land.district');
      this.sub.textContent = t('land.locked');
      box.append(h('div', 'modal-sub', t('land.unlockIntro')));
      const ul = h('ul', 'feature-list');
      for (const k of ['land.feat1', 'land.feat2', 'land.feat3']) ul.append(h('li', '', t(k)));
      box.append(ul);
      const btn = h('button', 'btn primary big', '');
      this.unlockBtn = btn;
      onTap(btn, () => {
        if (prod.unlock()) {
          this.ctx.sfx.play('quest');
          haptic(25);
          this.ctx.save();
          this.update(true);
        } else this.ctx.sfx.play('error');
      });
      box.append(btn);
      this.live.push(() => {
        setHtml(btn, `${icon('key')}<span>${t('land.unlock', { v: formatCash(LAND.unlockCost) })}</span>`);
        toggle(btn, 'poor', st.cash < LAND.unlockCost);
      });
      return;
    }
    if (!owned) {
      this.title.textContent = t('land.forSale');
      box.append(h('div', 'modal-sub', t('land.intro')));
      this.buyBtn = h('button', 'btn primary big', '');
      onTap(this.buyBtn, () => {
        if (prod.buyParcel(this.id)) {
          this.ctx.sfx.play('cart');
          haptic(20);
          this.ctx.save();
          this.update(true);
        } else this.ctx.sfx.play('error');
      });
      box.append(this.buyBtn);
      this.live.push(() => {
        const p = prod.parcelPrice();
        setHtml(this.buyBtn as HTMLElement, `${icon('coin')}<span>${t('land.buy', { v: formatCash(p) })}</span>`);
        toggle(this.buyBtn as HTMLElement, 'poor', st.cash < p);
      });
      return;
    }
    if (!at) {
      this.title.textContent = t('land.empty');
      box.append(h('div', 'modal-sub', t('land.build')));
      const grid = h('div', 'kitchen-grid facility-grid');
      for (const kind of FACILITY_ORDER) {
        const def = FACILITIES[kind];
        const card = h('button', 'kitchen-card');
        card.style.setProperty('--kc', `#${def.color.toString(16).padStart(6, '0')}`);
        const outs = new Set<GoodId>();
        for (const r of this.recipesOf(kind)) for (const g of Object.keys(r.outputs) as GoodId[]) outs.add(g);
        card.innerHTML = `<div class="kc-name">${t(`fac.${kind}`)}</div><div class="kc-info">${[...outs]
          .slice(0, 4)
          .map((g) => t(`good.${g}`))
          .join(', ')}</div><div class="kc-cost">${icon('coin')}${formatCash(def.cost)}</div>`;
        onTap(card, () => this.build(kind));
        grid.append(card);
        if (!this.firstBuildCard) this.firstBuildCard = card;
        this.live.push(() => toggle(card, 'poor', st.cash < def.cost));
      }
      box.append(grid);
      return;
    }
    const { f, main } = at;
    const def = FACILITIES[f.kind];
    this.title.textContent = `${t(`fac.${f.kind}`)}${f.merged >= 0 ? ` · ${t('land.large')}` : ''}`;
    if (st.worldTime < f.builtAt) {
      const bar = h('div', 'goal-bar big', '<i></i>');
      const lab = h('div', 'modal-sub');
      box.append(h('div', 'box-head', `${icon('build')}<span>${t('land.building')}</span>`), bar, lab);
      this.live.push(() => {
        const left = f.builtAt - st.worldTime;
        (bar.querySelector('i') as HTMLElement).style.width = `${(1 - left / LAND.buildSec) * 100}%`;
        lab.textContent = duration(left);
      });
      return;
    }
    // current job
    const job = h('div', 'staff-box');
    const jobHead = h('div', 'box-head');
    const jobBar = h('div', 'goal-bar big', '<i></i>');
    const jobInfo = h('div', 'modal-sub');
    this.startBtn = h('button', 'btn primary big', '');
    onTap(this.startBtn, () => {
      if (prod.start(main.id)) {
        this.ctx.sfx.play('restock');
        haptic(12);
      } else this.ctx.sfx.play('error');
    });
    job.append(jobHead, jobBar, jobInfo, this.startBtn);
    box.append(job);
    if (f.kind === 'ranch') {
      const herd = h('div', 'modal-note');
      box.append(herd);
      this.live.push(() => (herd.textContent = t('land.herd', { n: f.animals, cap: f.merged >= 0 ? LAND.animalsCapMerged : LAND.animalsCap, a: t(`animal.${f.animal ?? 'chicken'}`) })));
    }
    if (f.kind === 'mine') {
      const dep = h('div', 'modal-note');
      box.append(dep);
      this.live.push(() => (dep.textContent = t('land.depth', { d: prod.depth(f), max: LAND.maxDepth })));
    }
    this.live.push(() => {
      const w = prod.workerOf(main.id);
      const r = recipeById(f.job?.recipe ?? f.recipe);
      const blk = prod.blocker(main.id);
      setHtml(jobHead, `${icon('build')}<span>${r ? recipeHtml(r, prod.outputMult(f, w)) : ''}</span>`);
      const p = f.job && r ? Math.max(0, Math.min(1, 1 - (f.job.endsAt - st.worldTime) / prod.jobSec(r, w))) : 0;
      (jobBar.querySelector('i') as HTMLElement).style.width = `${p * 100}%`;
      jobInfo.textContent = f.full ? t('land.full') : f.job ? t('land.ready', { d: duration(f.job.endsAt - st.worldTime) }) : w ? t(blk === 'inputs' ? 'land.waitInputs' : 'land.idle') : t('land.manual');
      const startable = blk === null;
      toggle(this.startBtn as HTMLElement, 'hidden', !!f.job || !!w);
      (this.startBtn as HTMLButtonElement).disabled = !startable;
      setHtml(this.startBtn as HTMLElement, `${icon('build')}<span>${blk === 'inputs' ? t('land.needInputs') : blk === 'storage' ? t('land.storageFull') : blk === 'cash' ? t('land.needCash') : t('land.start')}</span>`);
    });
    // recipes
    const list = prod.recipes(f);
    if (list.length > 1) {
      const rb = h('div', 'price-box');
      rb.append(h('div', 'box-head', `${icon('recipe')}<span>${t('land.recipes')}</span>`));
      for (const r of list) {
        const row = h('button', `recipe-row${r.id === f.recipe ? ' on' : ''}`, recipeHtml(r, prod.outputMult(f, prod.workerOf(main.id))));
        onTap(row, () => {
          if (prod.setRecipe(main.id, r.id)) {
            this.ctx.sfx.play('tap');
            this.update(true);
          } else this.ctx.sfx.play('error');
        });
        rb.append(row);
      }
      if (f.kind === 'mine' && list.length < this.recipesOf('mine').length) rb.append(h('div', 'modal-note', t('land.digDeeper')));
      box.append(rb);
    }
    // staff
    box.append(this.staff.el);
    this.live.push(() => this.staff.updateFor(prod.workerOf(main.id), false, def.role));
    // storage shortcut
    const sb = h('button', 'btn', `${icon('box')}<span>${t('land.openStorage')}</span>`);
    onTap(sb, () => this.onStorage());
    box.append(sb);
    // merge / demolish
    const tools = h('div', 'actions-row');
    const parcel = this.ctx.sim.city.parcels[main.id];
    const mergeable = f.merged < 0 ? (parcel?.neighbours ?? []).find((n) => {
      const o = prod.owned(n);
      return o && !o.facility && o.annexOf < 0;
    }) : undefined;
    if (mergeable !== undefined) {
      const mb = h('button', 'btn buy', `${icon('move')}<span>${t('land.merge')}</span>`);
      onTap(mb, () => {
        if (prod.merge(main.id, mergeable)) {
          this.ctx.sfx.play('upgrade');
          this.ctx.save();
          this.update(true);
        }
      });
      tools.append(mb);
    } else if (f.merged < 0) tools.append(h('div', 'modal-note', t('land.mergeHint')));
    const db = h('button', `btn${this.confirmDemolish ? ' attention' : ''}`, `${icon('trash')}<span>${this.confirmDemolish ? t('land.demolishSure', { v: formatCash(Math.round(def.cost * LAND.refund)) }) : t('land.demolish')}</span>`);
    onTap(db, () => {
      if (!this.confirmDemolish) {
        this.confirmDemolish = true;
        this.update(true);
        return;
      }
      prod.demolish(main.id);
      this.confirmDemolish = false;
      this.ctx.save();
      this.update(true);
    });
    tools.append(db);
    box.append(tools);
  }

  private recipesOf(kind: FacilityKind): Recipe[] {
    return this.ctx.sim.production.recipes({ kind, recipe: '', job: null, builtAt: 0, merged: -1, animals: 0, dug: 1e9, made: 0 });
  }

  private build(kind: FacilityKind): void {
    const prod = this.ctx.sim.production;
    // ranch: pick the herd by what's affordable to feed — chickens first, then sheep and cows by rotation
    const ranches = this.ctx.sim.state.land.parcels.filter((p) => p.facility?.kind === 'ranch').length;
    const animal = (['chicken', 'sheep', 'cow'] as const)[ranches % 3];
    if (prod.build(this.id, kind, animal)) {
      this.ctx.sfx.play('cart');
      haptic(20);
      this.ctx.save();
      this.update(true);
    } else this.ctx.sfx.play('error');
  }
}

/** Storage & trading post: what you have, what it sells for, capacity upgrade. */
export class StorageModal extends Modal {
  private tickT = 0;
  private live: Array<() => void> = [];

  constructor(ctx: UiContext) {
    super(ctx, 'storage-modal');
  }

  open(): void {
    this.setTitle(t('storage.title'), 'box');
    this.render();
    this.show();
  }

  private render(): void {
    const prod = this.ctx.sim.production;
    this.body.innerHTML = '';
    this.live = [];
    const cap = h('div', 'storage-cap');
    const bar = h('div', 'goal-bar big', '<i></i>');
    const up = h('button', 'btn buy', '');
    onTap(up, () => {
      if (prod.upgradeStorage()) {
        this.ctx.sfx.play('upgrade');
        this.ctx.save();
      } else this.ctx.sfx.play('error');
    });
    cap.append(bar, up);
    this.body.append(h('div', 'modal-sub', t('storage.sub')), cap);
    const list = h('div', 'goods-list');
    this.body.append(list);
    let any = false;
    for (const g of GOOD_ORDER) {
      if (prod.have(g) <= 0) continue;
      any = true;
      const row = h('div', 'good-row');
      const name = h('div', 'gr-name', goodChip(g));
      const qty = h('b', 'gr-qty');
      const price = h('span', 'gr-price');
      const s10 = h('button', 'btn small', t('storage.sell10'));
      const sAll = h('button', 'btn buy small', '');
      onTap(s10, () => this.sell(g, 10));
      onTap(sAll, () => this.sell(g, prod.have(g)));
      row.append(name, qty, price, s10, sAll);
      list.append(row);
      this.live.push(() => {
        const n = prod.have(g);
        qty.textContent = formatNumber(n);
        const p = prod.price(g);
        price.innerHTML = `${formatPrice(p)}${p < GOODS[g].price * 0.95 ? `<small> ${t('storage.saturated')}</small>` : ''}`;
        setHtml(sAll, `${icon('coin')}<span>${formatCash(n * p)}</span>`);
        toggle(row, 'empty', n <= 0);
      });
    }
    if (!any) list.append(h('div', 'modal-note', t('storage.empty')));
    this.live.push(() => {
      const used = prod.stored();
      const c = prod.storageCap();
      (bar.querySelector('i') as HTMLElement).style.width = `${Math.min(100, (used / c) * 100)}%`;
      bar.setAttribute('data-label', `${formatNumber(used)} / ${formatNumber(c)}`);
      setHtml(up, `${icon('up')}<span>${t('storage.upgrade', { v: formatCash(prod.storageUpgradeCost()) })}</span>`);
      toggle(up, 'poor', this.ctx.sim.state.cash < prod.storageUpgradeCost());
    });
    for (const f of this.live) f();
  }

  private sell(g: GoodId, n: number): void {
    const v = this.ctx.sim.production.sell(g, n);
    if (v > 0) {
      this.ctx.sfx.play('tip');
      haptic(10);
      this.ctx.save();
    }
    for (const f of this.live) f();
  }

  update(dt: number): void {
    if (!this.isOpen) return;
    this.tickT += dt;
    if (this.tickT < 0.3) return;
    this.tickT = 0;
    for (const f of this.live) f();
  }
}
