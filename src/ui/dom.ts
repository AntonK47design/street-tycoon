import { ICON, type IconName } from './icons';

/** Minimal element helper. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  return el;
}

export function icon(name: IconName, cls = 'ic'): string {
  return `<span class="${cls}">${ICON[name]}</span>`;
}

/** Sets text only when it changed (avoids layout churn in per-frame HUD updates). */
export function setText(el: HTMLElement, s: string): void {
  if (el.textContent !== s) el.textContent = s;
}

export function setHtml(el: HTMLElement, s: string): void {
  if ((el as HTMLElement & { _h?: string })._h !== s) {
    (el as HTMLElement & { _h?: string })._h = s;
    el.innerHTML = s;
  }
}

export function toggle(el: HTMLElement, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** Button that reacts on pointerup without the 300 ms click delay and without firing after a drag. */
export function onTap(el: HTMLElement, fn: (e: PointerEvent | KeyboardEvent) => void): void {
  let down: { x: number; y: number; id: number } | null = null;
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  el.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved < 14) fn(e);
  });
  el.addEventListener('pointercancel', () => (down = null));
  el.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') fn(e);
  });
}

/** Short haptic tick where supported. */
export function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}
