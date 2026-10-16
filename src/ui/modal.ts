import { t } from '../core/i18n';
import type { UiContext } from './context';
import { h, icon, onTap } from './dom';
import type { IconName } from './icons';

/** Blocking modal card: pauses the sim and reports gameplayStop while open (CrazyGames requirement). */
export class Modal {
  readonly el: HTMLDivElement;
  readonly body: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly iconEl: HTMLDivElement;
  private isShown = false;
  onClose: () => void = () => {};

  constructor(
    protected readonly ctx: UiContext,
    cls = '',
  ) {
    this.el = h('div', `modal hidden ${cls}`);
    const card = h('div', 'modal-card');
    const head = h('div', 'panel-head');
    this.iconEl = h('div', 'panel-icon');
    this.titleEl = h('div', 'panel-title');
    const close = h('button', 'icon-btn close', icon('close'));
    close.setAttribute('aria-label', t('ui.close'));
    onTap(close, () => this.hide());
    head.append(this.iconEl, this.titleEl, close);
    this.body = h('div', 'modal-body');
    card.append(head, this.body);
    this.el.append(card);
    ctx.root.append(this.el);
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target === this.el) this.hide();
    });
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }

  get isOpen(): boolean {
    return this.isShown;
  }

  protected setTitle(text: string, ic: IconName): void {
    this.titleEl.textContent = text;
    this.iconEl.innerHTML = icon(ic);
  }

  show(): void {
    if (this.isShown) return;
    this.isShown = true;
    this.el.classList.remove('hidden');
    this.ctx.setBlocking(true);
    this.ctx.sfx.play('open');
  }

  hide(): void {
    if (!this.isShown) return;
    this.isShown = false;
    this.el.classList.add('hidden');
    this.ctx.setBlocking(false);
    this.onClose();
  }
}
