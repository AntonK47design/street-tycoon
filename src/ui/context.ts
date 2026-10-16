import type { Sfx } from '../audio/sfx';
import type { Platform } from '../platform/platform';
import type { GameView } from '../render/view';
import type { Sim } from '../sim/sim';

/** Shared handles every UI module needs. */
export interface UiContext {
  sim: Sim;
  view: GameView;
  sfx: Sfx;
  platform: Platform;
  root: HTMLElement;
  /** Persist now (after purchases and other important actions). */
  save(): void;
  /** Blocking UI (settings): pauses the sim and reports gameplayStop. */
  setBlocking(on: boolean): void;
  isMobile: boolean;
}
