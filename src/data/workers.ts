/** Worker tuning (Phase 2: cart role). All numbers here — systems read them, never hard-code. */
export type WorkerRole = 'cart' | 'cashier' | 'storage' | 'farmer' | 'miner' | 'builder' | 'driver';

/** Automation stages in order. A worker starts at stage 1 (cooks); training unlocks the next. */
export type AutoStage = 1 | 2 | 3 | 4 | 5;

export const WORKERS = {
  /** Roles available in this build. */
  roles: ['cart'] as readonly WorkerRole[],
  /** Price to hire the n-th worker (index 0 = first), × candidate star factor. */
  hireCosts: [220, 600, 1400, 3000, 6000, 11000, 18000],
  hireStarFactor: [1, 1, 1.35, 1.8],
  /** Wage per portion cooked, by stars (index = stars). Paid only while producing. */
  wage: [0, 0.75, 0.9, 1.1],
  /** Seconds to cook a batch at level 1; × speedPerLevel^(level-1). */
  cookSec: 4.2,
  speedPerLevel: 0.96,
  /** Quality odds (perfect, good) by stars; + per level. */
  perfectByStars: [0, 0.12, 0.22, 0.34],
  goodByStars: [0, 0.5, 0.52, 0.5],
  perfectPerLevel: 0.012,
  /** XP per portion cooked; level n needs xpBase × n^1.5 XP. */
  xpPerPortion: 1,
  xpBase: 20,
  maxLevel: 20,
  /** Reaction delay before a worker starts cooking (s). */
  reactSec: 1.2,
  /** Cooks when stock is at or below this (or below the queue). */
  cookBelow: 1,
  /** Training: cost and real-time duration (s) for stages 2..5. Runs offline too. */
  training: {
    2: { cost: 150, sec: 60 },
    3: { cost: 480, sec: 40 * 60 },
    4: { cost: 1500, sec: 2 * 3600 },
    5: { cost: 5000, sec: 6 * 3600 },
  } as Record<2 | 3 | 4 | 5, { cost: number; sec: number }>,
  /** A training at least this long counts as "something that pays out tomorrow". */
  longTrainingSec: 1800,
  /** Stage 2: restock when supplies fall below batches × batch size. */
  restockBelowBatches: 2,
  /** Stage 3: price steering. */
  autoPrice: { minFactor: 0.95, maxFactor: 1.55, upQueue: 4, downIdleSec: 15, stepEverySec: 8 },
  /** Stage 4: clean below this. */
  cleanBelow: 62,
  /** Stage 5: speed bonus for cooking and serving. */
  fastMul: 0.75,
  /** Names (original, generic). */
  names: ['Mia', 'Leo', 'Ava', 'Noah', 'Lina', 'Theo', 'Zoe', 'Finn', 'Ella', 'Max', 'Ida', 'Ben', 'Nora', 'Paul', 'Emma', 'Jonas', 'Lea', 'Tom', 'Sara', 'Luca', 'Mila', 'Jan', 'Rosa', 'Kai'],
  candidates: 3,
} as const;

/** Offline earnings and retention. */
export const RETENTION = {
  /** Absence is credited up to this many seconds. */
  offlineCapSec: 8 * 3600,
  /** Fraction of the online rate earned while away (no rushes, no perfect cooks). */
  offlineEfficiency: 0.6,
  /** Absences shorter than this show no popup. */
  offlineMinSec: 120,
  /** Daily reward cycle (cash), × (1 + perCart × (carts − 1)). */
  dailyRewards: [60, 100, 150, 220, 320, 450, 800],
  dailyPerCart: 0.6,
  /** Daily tasks unlock after this quest index (second cart). */
  dailyFromQuest: 5,
  dailyTaskCount: 3,
  /** Daily task rewards scale like the daily reward. */
} as const;
