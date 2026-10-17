import { FURNITURE, FURNITURE_ORDER, productById, type FurnitureId } from '../data/shops';
import { formatCash, t } from '../core/i18n';
import { autoPlace, canPlace, cellsOf, footprint, type Placed } from '../sim/shop-layout';
import type { UiContext } from './context';
import { h, haptic, icon, onTap, setHtml, toggle } from './dom';

type Mode = { kind: 'idle' } | { kind: 'placing'; ghost: Placed } | { kind: 'selected'; idx: number } | { kind: 'moving'; idx: number; ghost: Placed };

const SWATCH: Record<FurnitureId, string> = {
  shelf: '#a4744d',
  fridge: '#9fc3d6',
  display: '#7d5538',
  checkout: '#d9cdb6',
  plant: '#6f9a53',
  lamp: '#f2c14e',
  rug: '#c9643b',
  bench: '#a4744d',
};

/**
 * Room editor in the cut-away view: catalogue at the bottom, ghost preview on the grid, select / rotate /
 * move / change product / sell. Not blocking — customers keep shopping while you rearrange.
 */
export class RoomEditor {
  private readonly bar: HTMLDivElement;
  private readonly catalog: HTMLDivElement;
  private readonly ctxBar: HTMLDivElement;
  private readonly ratingEl: HTMLDivElement;
  private pi = -1;
  private mode: Mode = { kind: 'idle' };
  private tick = 0;
  readonly catalogButtons = new Map<FurnitureId, HTMLButtonElement>();
  readonly doneBtn: HTMLButtonElement;
  onExit: (pi: number) => void = () => {};

  constructor(private readonly ctx: UiContext) {
    this.bar = h('div', 'editor-bar hidden');
    const top = h('div', 'editor-top');
    this.ratingEl = h('div', 'editor-rating');
    this.doneBtn = h('button', 'btn primary', `${icon('check')}<span>${t('editor.done')}</span>`);
    onTap(this.doneBtn, () => this.exit());
    top.append(this.ratingEl, this.doneBtn);
    this.ctxBar = h('div', 'editor-ctx hidden');
    this.catalog = h('div', 'editor-catalog');
    for (const id of FURNITURE_ORDER) {
      const b = h('button', 'cat-item', `<i class="sw" style="background:${SWATCH[id]}"></i><span class="cn">${t(`furn.${id}`)}</span><span class="cc">${icon('coin')}${formatCash(FURNITURE[id].cost)}</span>`);
      onTap(b, () => this.startPlacing(id));
      this.catalog.append(b);
      this.catalogButtons.set(id, b);
    }
    this.bar.append(top, this.ctxBar, this.catalog);
    ctx.root.append(this.bar);
    this.bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    // desktop: ghost follows the mouse
    ctx.view.renderer.domElement.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.pi < 0) return;
      if (this.mode.kind !== 'placing' && this.mode.kind !== 'moving') return;
      const r = ctx.view.renderer.domElement.getBoundingClientRect();
      this.moveGhostTo(e.clientX - r.left, e.clientY - r.top);
    });
    window.addEventListener('keydown', (e) => {
      if (this.pi < 0) return;
      if (e.code === 'KeyR') this.rotate();
    });
  }

  get isOpen(): boolean {
    return this.pi >= 0;
  }

  get propertyId(): number {
    return this.pi;
  }

  get modeKind(): Mode['kind'] {
    return this.mode.kind;
  }

  enter(pi: number): void {
    const g = this.ctx.sim.shops.grid(pi);
    if (!g) return;
    this.pi = pi;
    this.mode = { kind: 'idle' };
    this.ctx.view.setCutaway(pi, true);
    const cx = g.x0 + (g.cols * g.cw) / 2;
    const cz = g.z0 + (g.rows * g.ch) / 2;
    // look into the shop from its street side, slightly from the corner
    const cam = this.ctx.view.camera;
    cam.focus(cx, cz, Math.max(28, Math.max(g.cols, g.rows) * 2.9));
    cam.lookFrom(g.door.nx - g.door.nz * 0.45, g.door.nz + g.door.nx * 0.45);
    this.bar.classList.remove('hidden');
    document.documentElement.classList.add('editing');
    this.ctx.sfx.play('open');
    this.render();
  }

  exit(): void {
    if (this.pi < 0) return;
    const pi = this.pi;
    this.ctx.view.showGhost(pi, null, false);
    this.ctx.view.setCutaway(-1);
    this.pi = -1;
    this.mode = { kind: 'idle' };
    this.bar.classList.add('hidden');
    document.documentElement.classList.remove('editing');
    this.ctx.save();
    this.onExit(pi);
  }

  private items(): Placed[] {
    return this.ctx.sim.shops.property(this.pi)?.shop?.items ?? [];
  }

  private startPlacing(type: FurnitureId): void {
    const g = this.ctx.sim.shops.grid(this.pi);
    if (!g) return;
    if (this.ctx.sim.state.cash < FURNITURE[type].cost) {
      this.ctx.sfx.play('error');
      return;
    }
    const ghost = autoPlace(g, this.items(), type) ?? { type, i: 0, j: 0, rot: 0 };
    this.mode = { kind: 'placing', ghost };
    this.ctx.sfx.play('tap');
    this.render();
  }

  /** Taps in the world while editing. */
  tap(x: number, y: number): void {
    const cell = this.ctx.view.cellAt(this.pi, x, y);
    if (!cell) return;
    const m = this.mode;
    if (m.kind === 'placing' || m.kind === 'moving') {
      const fp = footprint(m.ghost);
      const i = cell.i - Math.floor((fp.w - 1) / 2);
      const j = cell.j - Math.floor((fp.d - 1) / 2);
      if (i === m.ghost.i && j === m.ghost.j) this.confirm();
      else {
        m.ghost.i = i;
        m.ghost.j = j;
        this.render();
      }
      return;
    }
    // select the piece under the tap (or deselect)
    const idx = this.items().findIndex((it) => cellsOf(it).some(([a, b]) => a === cell.i && b === cell.j));
    this.mode = idx >= 0 ? { kind: 'selected', idx } : { kind: 'idle' };
    if (idx >= 0) this.ctx.sfx.play('tap');
    this.render();
  }

  private moveGhostTo(x: number, y: number): void {
    const m = this.mode;
    if (m.kind !== 'placing' && m.kind !== 'moving') return;
    const cell = this.ctx.view.cellAt(this.pi, x, y);
    if (!cell) return;
    const fp = footprint(m.ghost);
    m.ghost.i = cell.i - Math.floor((fp.w - 1) / 2);
    m.ghost.j = cell.j - Math.floor((fp.d - 1) / 2);
  }

  private rotate(): void {
    const m = this.mode;
    const shops = this.ctx.sim.shops;
    if (m.kind === 'placing' || m.kind === 'moving') {
      m.ghost.rot = ((m.ghost.rot + 1) % 4) as 0 | 1 | 2 | 3;
    } else if (m.kind === 'selected') {
      const it = this.items()[m.idx];
      if (!it) return;
      for (let k = 1; k <= 3; k++) {
        const rot = ((it.rot + k) % 4) as 0 | 1 | 2 | 3;
        if (shops.move(this.pi, m.idx, { i: it.i, j: it.j, rot })) break;
      }
    }
    this.ctx.sfx.play('tap');
    this.render();
  }

  private confirm(): void {
    const m = this.mode;
    const shops = this.ctx.sim.shops;
    if (m.kind === 'placing') {
      if (shops.place(this.pi, m.ghost)) {
        this.ctx.sfx.play('upgrade');
        haptic(15);
        const type = m.ghost.type;
        // keep placing the same type while there's room and money (quick room filling)
        const g = shops.grid(this.pi);
        const next = g && this.ctx.sim.state.cash >= FURNITURE[type].cost ? autoPlace(g, this.items(), type) : null;
        this.mode = next && FURNITURE[type].decor && !FURNITURE[type].slot ? { kind: 'placing', ghost: next } : { kind: 'idle' };
        this.ctx.save();
      } else this.ctx.sfx.play('error');
    } else if (m.kind === 'moving') {
      if (shops.move(this.pi, m.idx, m.ghost)) {
        this.ctx.sfx.play('tap');
        this.mode = { kind: 'selected', idx: m.idx };
      } else this.ctx.sfx.play('error');
    }
    this.render();
  }

  private cancel(): void {
    this.mode = { kind: 'idle' };
    this.render();
  }

  private render(): void {
    const m = this.mode;
    this.ctxBar.innerHTML = '';
    toggle(this.ctxBar, 'hidden', m.kind === 'idle');
    toggle(this.catalog, 'hidden', m.kind !== 'idle');
    const btn = (ic: Parameters<typeof icon>[0], label: string, fn: () => void, cls = 'btn'): void => {
      const b = h('button', cls, `${icon(ic)}<span>${label}</span>`);
      onTap(b, fn);
      this.ctxBar.append(b);
    };
    if (m.kind === 'placing' || m.kind === 'moving') {
      this.ctxBar.append(h('div', 'ctx-name', `${t(`furn.${m.ghost.type}`)}${m.kind === 'placing' ? ` · ${formatCash(FURNITURE[m.ghost.type].cost)}` : ''}`));
      btn('rotate', t('editor.rotate'), () => this.rotate());
      btn('check', t(m.kind === 'placing' ? 'editor.place' : 'editor.drop'), () => this.confirm(), 'btn primary');
      btn('close', t('editor.cancel'), () => this.cancel());
      this.ctxBar.append(h('div', 'ctx-hint', t(this.ctx.isMobile ? 'editor.hintTouch' : 'editor.hintMouse')));
    } else if (m.kind === 'selected') {
      const it = this.items()[m.idx];
      if (!it) {
        this.mode = { kind: 'idle' };
        return this.render();
      }
      const prod = it.product ? productById(it.product) : undefined;
      this.ctxBar.append(h('div', 'ctx-name', `${t(`furn.${it.type}`)}${prod ? ` · ${t(`prod.${prod.id}`)}` : ''}`));
      btn('rotate', t('editor.rotate'), () => this.rotate());
      btn('move', t('editor.move'), () => {
        this.mode = { kind: 'moving', idx: m.idx, ghost: { ...it } };
        this.render();
      });
      if (FURNITURE[it.type].slot) btn('swap', t('editor.product'), () => {
        this.ctx.sim.shops.cycleProduct(this.pi, m.idx);
        this.ctx.sim.shops.restock(this.pi);
        this.render();
      });
      btn('trash', t('editor.sell', { v: formatCash(Math.round(FURNITURE[it.type].cost * 0.5)) }), () => {
        this.ctx.sim.shops.remove(this.pi, m.idx);
        this.ctx.sfx.play('restock');
        this.mode = { kind: 'idle' };
        this.render();
      });
      btn('close', '', () => this.cancel(), 'btn icon-only');
    }
  }

  update(dt: number): void {
    if (this.pi < 0) return;
    const m = this.mode;
    const shops = this.ctx.sim.shops;
    const g = shops.grid(this.pi);
    if (g && (m.kind === 'placing' || m.kind === 'moving')) {
      const skip = m.kind === 'moving' ? this.items()[m.idx] : undefined;
      this.ctx.view.showGhost(this.pi, m.ghost, canPlace(g, this.items(), m.ghost, skip));
    } else if (m.kind === 'selected') {
      const it = this.items()[m.idx];
      this.ctx.view.showGhost(this.pi, it ?? null, true);
    } else this.ctx.view.showGhost(this.pi, null, false);
    this.tick += dt;
    if (this.tick < 0.2) return;
    this.tick = 0;
    const r = shops.runtime.get(this.pi)?.rating;
    if (r) setHtml(this.ratingEl, `${icon('star')}<span>${t('editor.rating', { v: Math.round(r.total * 100) })}</span>${r.open ? '' : `<b class="warn">${t('shop.closedShort')}</b>`}`);
    for (const [id, b] of this.catalogButtons) toggle(b, 'poor', this.ctx.sim.state.cash < FURNITURE[id].cost);
  }
}
