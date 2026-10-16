/** First-session milestone targets (seconds of play). The pacing simulator checks the corridor. */
export type MilestoneId = 'gameplayStart' | 'firstSale' | 'firstUpgrade' | 'secondCart' | 'firstWorker' | 'firstAutomation' | 'firstShop' | 'tomorrowPayoff';

export interface MilestoneTarget {
  id: MilestoneId;
  target: number;
  min: number;
  max: number;
  /** Phase in which the milestone becomes reachable; later phases are reported as "n/a". */
  phase: number;
}

export const PACING: readonly MilestoneTarget[] = [
  { id: 'firstSale', target: 15, min: 6, max: 25, phase: 1 },
  { id: 'firstUpgrade', target: 45, min: 25, max: 75, phase: 1 },
  { id: 'secondCart', target: 120, min: 85, max: 170, phase: 1 },
  { id: 'firstWorker', target: 240, min: 180, max: 320, phase: 2 },
  { id: 'firstAutomation', target: 420, min: 330, max: 540, phase: 2 },
  { id: 'firstShop', target: 660, min: 540, max: 800, phase: 3 },
  { id: 'tomorrowPayoff', target: 900, min: 720, max: 1100, phase: 2 },
];

/** The phase the current build implements (pacing sim skips later milestones). */
export const CURRENT_PHASE = 1;
