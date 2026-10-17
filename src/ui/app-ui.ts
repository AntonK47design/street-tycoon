import { formatCash, formatPrice, t } from '../core/i18n';
import type { Settings } from '../core/save';
import type { SimEvent } from '../sim/sim';
import { CITY } from '../data/city';
import { CartPanel } from './cart-panel';
import type { UiContext } from './context';
import { h, haptic, icon, onTap } from './dom';
import { Hud, Toasts, questName } from './hud';
import { CameraInput } from './input';
import { Labels } from './labels';
import { Minigame } from './minigame';
import { SettingsPanel } from './settings';
import { Tutorial } from './tutorial';
import { PropertyPanel } from './property-panel';
import { RoomEditor } from './editor';
import { QUESTS } from '../data/quests';
import { DailyModal, HireModal, KitchenModal, OfflineModal } from './retention-ui';
import type { KitchenId } from '../data/kitchens';

const TOP = CITY.curb;
const RENT_FROM = QUESTS.findIndex((q) => q.id === 'q_rent');

/** Composes the overlay and routes input between world, panels and the minigame. */
export class AppUi {
  readonly hud: Hud;
  readonly panel: CartPanel;
  readonly minigame: Minigame;
  readonly labels: Labels;
  readonly tutorial: Tutorial;
  readonly toasts: Toasts;
  readonly settingsPanel: SettingsPanel;
  readonly input: CameraInput;
  private placing = false;
  private readonly placeBar: HTMLDivElement;
  private placeKitchen: KitchenId = 'hotdog';
  readonly hireModal: HireModal;
  readonly kitchenModal: KitchenModal;
  readonly offlineModal: OfflineModal;
  readonly dailyModal: DailyModal;
  readonly propertyPanel: PropertyPanel;
  readonly editor: RoomEditor;

  constructor(
    private readonly ctx: UiContext,
    settings: Settings,
    tierLabel: () => string,
    today: () => string,
  ) {
    this.input = new CameraInput(ctx.view.renderer.domElement, ctx.view.camera);
    this.labels = new Labels(ctx);
    this.hud = new Hud(ctx);
    this.panel = new CartPanel(ctx);
    this.toasts = new Toasts(ctx.root);
    this.minigame = new Minigame(ctx);
    this.tutorial = new Tutorial(ctx, this.hud, this.panel, this.labels);
    this.settingsPanel = new SettingsPanel(ctx, settings, tierLabel);

    this.hireModal = new HireModal(ctx);
    this.kitchenModal = new KitchenModal(ctx);
    this.offlineModal = new OfflineModal(ctx);
    this.dailyModal = new DailyModal(ctx, today);
    this.hud.dailyPending = () => this.dailyModal.pending();
    this.hud.onDaily = () => this.dailyModal.open();
    this.panel.onHire = (ci) => this.hireModal.openFor(ci);
    this.hireModal.onHired = () => this.panel.update(true);
    this.kitchenModal.onPick = (k) => this.beginPlacing(k);
    this.propertyPanel = new PropertyPanel(ctx);
    this.editor = new RoomEditor(ctx);
    this.propertyPanel.onEdit = (pi) => {
      this.propertyPanel.close();
      this.editor.enter(pi);
    };
    this.propertyPanel.onHireCashier = (pi) => this.hireModal.openForShop(pi);
    this.editor.onExit = (pi) => this.openProperty(pi);
    this.labels.onProperty = (pi) => this.openProperty(pi);
    this.tutorial.shop = { panel: this.propertyPanel, editor: this.editor };
    this.placeBar = h('div', 'place-bar hidden');
    const cancel = h('button', 'btn', `${icon('close')}<span>${t('place.cancel')}</span>`);
    onTap(cancel, () => this.endPlacing());
    this.placeBar.append(h('div', 'place-text', t('place.pick')), cancel);
    ctx.root.append(this.placeBar);

    this.input.onTap = (x, y) => this.tapWorld(x, y);
    this.labels.onBadge = (ci) => this.quickCook(ci);
    this.labels.onMarker = (id) => this.place(id);
    this.panel.onCook = (ci) => this.cook(ci);
    this.hud.onNewCart = () => this.startPlacing();
    this.hud.onSettings = () => this.settingsPanel.show();
    this.settingsPanel.onResetTutorial = () => {
      ctx.sim.state.flags.tutorialSkipped = false;
      ctx.sim.state.flags.tutorialDone = false;
      ctx.save();
    };
    ctx.sim.events.on((e) => this.onEvent(e));
  }

  private tapWorld(x: number, y: number): void {
    if (this.minigame.isOpen) return;
    if (this.placing) {
      const id = this.ctx.view.pickMarker(x, y);
      if (id) this.place(id);
      return;
    }
    if (this.editor.isOpen) {
      this.editor.tap(x, y);
      return;
    }
    const ci = this.ctx.view.pickCart(x, y);
    if (ci < 0) {
      const pi = this.ctx.view.pickProperty(x, y);
      if (pi >= 0 && (this.ctx.sim.shops.property(pi) || this.ctx.sim.state.quest >= RENT_FROM)) {
        this.openProperty(pi);
        return;
      }
    }
    if (ci >= 0) {
      this.propertyPanel.close();
      this.panel.open(ci);
      const c = this.ctx.sim.state.carts[ci];
      if (c) {
        const s = this.ctx.sim.spotOf(c);
        this.ctx.view.camera.focus(s.x + s.fx * 2, s.z + s.fz * 2);
      }
    } else {
      if (this.panel.isOpen) this.panel.close();
      if (this.propertyPanel.isOpen) this.propertyPanel.close();
    }
  }

  openProperty(pi: number): void {
    this.panel.close();
    this.propertyPanel.open(pi);
    const g = this.ctx.sim.shops.grid(pi);
    if (g) this.ctx.view.camera.focus(g.door.x + g.door.nx * 4, g.door.z + g.door.nz * 4);
  }

  /** Badge tap: cook right away if possible, otherwise open the panel to show why not. */
  private quickCook(ci: number): void {
    if (this.minigame.isOpen) return;
    const r = this.ctx.sim.canCook(ci);
    if (r === 'ok') this.cook(ci);
    else this.panel.open(ci);
  }

  cook(ci: number): void {
    const r = this.minigame.open(ci, (q) => {
      const n = this.ctx.sim.finishCook(ci, q);
      if (n > 0) {
        const c = this.ctx.sim.state.carts[ci];
        if (c) {
          const s = this.ctx.sim.spotOf(c);
          this.labels.popup(s.x, TOP + 2.8, s.z, t('popup.cooked', { n }), 'info');
        }
      }
      this.panel.update(true);
    });
    if (r === 'full') this.toasts.show(t('toast.full'), 'info');
    else if (r === 'noSupplies') {
      this.toasts.show(t('toast.noSupplies'), 'warn');
      this.panel.open(ci);
    }
    if (r === 'ok') haptic(10);
  }

  private startPlacing(): void {
    const sim = this.ctx.sim;
    if (this.editor.isOpen) this.editor.exit();
    this.propertyPanel.close();
    const cost = sim.nextCartCost();
    if (cost === null) return;
    if (sim.state.cash < cost) {
      this.toasts.show(t('toast.needCash', { cost: formatCash(cost) }), 'warn');
      this.ctx.sfx.play('error');
      return;
    }
    if (sim.unlockedKitchens().length > 1) {
      this.panel.close();
      this.kitchenModal.open();
      return;
    }
    this.beginPlacing('hotdog');
  }

  private beginPlacing(kitchen: KitchenId): void {
    const sim = this.ctx.sim;
    this.panel.close();
    this.placing = true;
    this.placeKitchen = kitchen;
    this.tutorial.placing = true;
    const ids = sim.freeSpots().map((s) => s.id);
    this.ctx.view.showMarkers(ids);
    this.labels.showMarkers(ids, kitchen);
    this.placeBar.classList.remove('hidden');
    this.ctx.view.camera.focus(0, 6, 72);
    this.ctx.sfx.play('open');
  }

  private endPlacing(): void {
    this.placing = false;
    this.tutorial.placing = false;
    this.ctx.view.hideMarkers();
    this.labels.hideMarkers();
    this.placeBar.classList.add('hidden');
  }

  private place(id: string): void {
    if (!this.placing) return;
    const ci = this.ctx.sim.buyCart(id, this.placeKitchen);
    if (ci < 0) {
      this.ctx.sfx.play('error');
      return;
    }
    this.endPlacing();
    const s = this.ctx.sim.spotById.get(id);
    if (s) this.ctx.view.camera.focus(s.x + s.fx * 3, s.z + s.fz * 3, 34);
    this.ctx.sfx.play('cart');
    this.ctx.platform.happytime();
    this.toasts.show(`${icon('cart')}<span>${t('toast.cartBought')}</span>`, 'good');
    this.ctx.save();
  }

  private onEvent(e: SimEvent): void {
    const sim = this.ctx.sim;
    switch (e.type) {
      case 'sale': {
        const c = sim.state.carts[e.cart];
        if (!c) break;
        const s = sim.spotOf(c);
        this.labels.popup(s.sx, TOP + 2.0, s.sz, e.tip > 0 ? `+${formatPrice(e.amount - e.tip)} <small>+${formatPrice(e.tip)} ${t('popup.tip')}</small>` : `+${formatPrice(e.amount)}`, e.tip > 0 ? 'tip' : 'cash');
        this.ctx.sfx.play(e.tip > 0 ? 'tip' : 'coin');
        this.hud.bumpCash();
        break;
      }
      case 'questDone':
        this.ctx.sfx.play('quest');
        if (!e.side) this.hud.celebrate();
        this.toasts.show(`${icon('check')}<span>${questName(e.id)}</span>${e.reward > 0 ? `<b>${icon('coin')}+${formatCash(e.reward)}</b>` : ''}`, 'good');
        this.ctx.save();
        break;
      case 'angry':
        this.ctx.sfx.play('angry');
        this.tutorial.maybeTip('angry', e.cart);
        break;
      case 'cleaned':
        this.panel.update(true);
        break;
      case 'rescue':
        this.toasts.show(`${icon('box')}<span>${t('toast.rescue')}</span>`, 'info', 3500);
        break;
      case 'newDay':
        this.toasts.show(`${icon('sun')}<span>${t('toast.newDay', { d: e.day })}</span>`, 'info');
        break;
      case 'upgrade':
        this.ctx.save();
        break;
      case 'hired': {
        const w = sim.workerById(e.worker);
        if (w) this.toasts.show(`${icon('people')}<span>${t('toast.hired', { name: w.name })}</span>`, 'good', 3200);
        this.panel.update(true);
        break;
      }
      case 'trainingStarted': {
        const w = sim.workerById(e.worker);
        if (w) this.toasts.show(`${icon('sun')}<span>${t('toast.training', { name: w.name })}</span>`, 'info');
        break;
      }
      case 'trained': {
        const w = sim.workerById(e.worker);
        if (w) this.toasts.show(`${icon('check')}<span>${t('toast.trained', { name: w.name, s: t(`auto.${['', 'cook', 'restock', 'price', 'clean', 'fast'][e.stage]}`) })}</span>`, 'good', 3600);
        this.ctx.sfx.play('upgrade');
        this.ctx.save();
        break;
      }
      case 'propertyAcquired':
        this.toasts.show(`${icon('key')}<span>${t(e.owned ? 'toast.bought' : 'toast.rented')}</span>`, 'good', 3200);
        break;
      case 'shopSale': {
        const g = sim.shops.grid(e.property);
        if (g && (this.ctx.view.cutaway === e.property || this.ctx.view.camera.dist < 60)) this.labels.popup(g.door.x + g.door.nx * 0.8, TOP + 2.4, g.door.z + g.door.nz * 0.8, `+${formatPrice(e.amount)}`, 'cash');
        this.ctx.sfx.play('coin');
        break;
      }
      case 'tenant':
        this.toasts.show(`${icon('people')}<span>${t('toast.tenant')}</span>`, 'good', 3200);
        this.ctx.sfx.play('quest');
        this.ctx.save();
        break;
      case 'workerLevel': {
        const w = sim.workerById(e.worker);
        const ci = w ? sim.cartIndexOfWorker(w) : -1;
        const c = sim.state.carts[ci];
        if (w && c) {
          const s = sim.spotOf(c);
          this.labels.popup(s.x, TOP + 3.2, s.z, t('popup.level', { name: w.name, l: e.level }), 'info');
        }
        break;
      }
      default:
        break;
    }
  }

  update(dt: number): void {
    this.input.enabled = !this.minigame.isOpen && !this.settingsPanel.isOpen && !this.hireModal.isOpen && !this.kitchenModal.isOpen && !this.offlineModal.isOpen && !this.dailyModal.isOpen;
    this.input.update(dt);
    this.minigame.update(dt);
    this.tutorial.minigameOpen = this.minigame.isOpen || this.settingsPanel.isOpen || this.hireModal.isOpen || this.kitchenModal.isOpen || this.offlineModal.isOpen || this.dailyModal.isOpen;
    this.hud.update(dt);
    this.panel.update(false, dt);
    this.propertyPanel.update(false, dt);
    this.editor.update(dt);
    this.labels.update(dt);
    this.tutorial.update(dt);
  }

  /** Called when the page hides: abort the minigame cleanly. */
  onHidden(): void {
    this.minigame.cancel();
  }
}
