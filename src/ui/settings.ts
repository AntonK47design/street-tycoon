import { availableLocales, t } from '../core/i18n';
import type { QualitySetting, Settings } from '../core/save';
import type { UiContext } from './context';
import { h, icon, onTap } from './dom';

/** Settings modal (blocking: pauses the sim and reports gameplayStop while open). */
export class SettingsPanel {
  private readonly el: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private open = false;
  onChange: (s: Settings) => void = () => {};
  onResetTutorial: () => void = () => {};

  constructor(
    private readonly ctx: UiContext,
    private readonly settings: Settings,
    private readonly tierLabel: () => string,
  ) {
    this.el = h('div', 'modal hidden');
    this.card = h('div', 'modal-card');
    this.el.append(this.card);
    ctx.root.append(this.el);
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target === this.el) this.hide();
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.render();
    this.el.classList.remove('hidden');
    this.ctx.setBlocking(true);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    this.ctx.setBlocking(false);
  }

  private seg<T extends string>(label: string, value: T, options: Array<[T, string]>, set: (v: T) => void): HTMLElement {
    const row = h('div', 'set-row');
    row.append(h('div', 'set-label', label));
    const seg = h('div', 'seg');
    for (const [v, text] of options) {
      const b = h('button', `seg-btn${v === value ? ' on' : ''}`, text);
      onTap(b, () => {
        set(v);
        this.onChange(this.settings);
        this.ctx.sfx.play('tap');
        this.render();
      });
      seg.append(b);
    }
    row.append(seg);
    return row;
  }

  private render(): void {
    const s = this.settings;
    this.card.innerHTML = '';
    const head = h('div', 'panel-head');
    head.append(h('div', 'panel-icon', icon('gear')), h('div', 'panel-title', t('ui.settings')));
    const close = h('button', 'icon-btn close', icon('close'));
    close.setAttribute('aria-label', t('ui.close'));
    onTap(close, () => this.hide());
    head.append(close);
    this.card.append(head);
    const q: Array<[QualitySetting, string]> = [
      ['auto', `${t('set.auto')}${s.quality === 'auto' ? ` (${this.tierLabel()})` : ''}`],
      ['low', t('set.low')],
      ['medium', t('set.medium')],
      ['high', t('set.high')],
    ];
    this.card.append(this.seg(t('set.quality'), s.quality, q, (v) => (s.quality = v)));
    this.card.append(
      this.seg(
        t('set.sound'),
        s.sound ? 'on' : 'off',
        [
          ['on', t('set.on')],
          ['off', t('set.off')],
        ],
        (v) => (s.sound = v === 'on'),
      ),
    );
    const langs: Array<['auto' | 'en' | 'de', string]> = [['auto', t('set.auto')]];
    for (const l of availableLocales()) langs.push([l as 'en' | 'de', t(`lang.${l}`)]);
    this.card.append(this.seg(t('set.language'), s.lang, langs, (v) => (s.lang = v)));
    const tut = h('button', 'btn', t('set.tutorialAgain'));
    onTap(tut, () => {
      this.onResetTutorial();
      this.hide();
    });
    const row = h('div', 'set-row');
    row.append(h('div', 'set-label', t('set.tutorial')), tut);
    this.card.append(row);
    const resume = h('button', 'btn primary big', t('ui.resume'));
    onTap(resume, () => this.hide());
    this.card.append(resume, h('div', 'credits', t('set.credits')));
  }
}
