/** Stat counters the sim tracks; quests and side goals refer to them. */
export type StatKey =
  | 'cooks'
  | 'served'
  | 'earned'
  | 'upgrades'
  | 'carts'
  | 'priceChanges'
  | 'cleans'
  | 'restocks'
  | 'perfects'
  | 'bestAppeal'
  | 'maxUpgradeLevel'
  | 'workers'
  | 'trainings'
  | 'longTrainings'
  | 'kitchens'
  | 'dailyTasks'
  | 'workerCooks';

export interface QuestDef {
  id: string;
  stat: StatKey;
  /** Target value. For 'earned'/'served' etc. counted from the moment the quest becomes active if `fromStart` is false. */
  target: number;
  /** true: absolute stat value counts (e.g. "own 2 carts"); false: progress since the quest started. */
  absolute: boolean;
  reward: number;
  /** UI element the goal bar can point at (tutorial highlight). */
  focus?: 'cart' | 'cook' | 'upgrades' | 'price' | 'newCart' | 'clean' | 'restock' | 'hire' | 'train' | 'daily';
}

/** Main goal chain (always one visible). Never reorder or remove ids without a save migration (core/save.ts). */
export const QUESTS: readonly QuestDef[] = [
  { id: 'q_cook', stat: 'cooks', target: 1, absolute: true, reward: 0, focus: 'cook' },
  { id: 'q_serve3', stat: 'served', target: 3, absolute: true, reward: 6 },
  { id: 'q_upgrade', stat: 'upgrades', target: 1, absolute: true, reward: 10, focus: 'upgrades' },
  { id: 'q_price', stat: 'priceChanges', target: 1, absolute: true, reward: 8, focus: 'price' },
  { id: 'q_cart2', stat: 'carts', target: 2, absolute: true, reward: 25, focus: 'newCart' },
  { id: 'q_hire', stat: 'workers', target: 1, absolute: true, reward: 40, focus: 'hire' },
  { id: 'q_workerCooks', stat: 'workerCooks', target: 5, absolute: true, reward: 30 },
  { id: 'q_train', stat: 'trainings', target: 1, absolute: true, reward: 60, focus: 'train' },
  { id: 'q_kitchen', stat: 'kitchens', target: 2, absolute: true, reward: 80, focus: 'newCart' },
  { id: 'q_longTrain', stat: 'longTrainings', target: 1, absolute: true, reward: 150, focus: 'train' },
  { id: 'q_serve150', stat: 'served', target: 150, absolute: true, reward: 100 },
  { id: 'q_hire2', stat: 'workers', target: 2, absolute: true, reward: 120, focus: 'hire' },
  { id: 'q_appeal4', stat: 'bestAppeal', target: 4, absolute: true, reward: 60 },
  { id: 'q_up5', stat: 'maxUpgradeLevel', target: 5, absolute: true, reward: 120 },
  { id: 'q_cart4', stat: 'carts', target: 4, absolute: true, reward: 300, focus: 'newCart' },
  { id: 'q_kitchen3', stat: 'kitchens', target: 3, absolute: true, reward: 250, focus: 'newCart' },
  { id: 'q_earn5k', stat: 'earned', target: 5000, absolute: true, reward: 400 },
  { id: 'q_hire4', stat: 'workers', target: 4, absolute: true, reward: 500, focus: 'hire' },
  { id: 'q_serve1000', stat: 'served', target: 1000, absolute: true, reward: 800 },
  { id: 'q_cart6', stat: 'carts', target: 6, absolute: true, reward: 1500, focus: 'newCart' },
  { id: 'q_earn50k', stat: 'earned', target: 50000, absolute: true, reward: 3000 },
];

/** Quest chain of save version 1 (Phase 1) — used to migrate the saved quest index. */
export const QUESTS_V1: readonly string[] = ['q_cook', 'q_serve3', 'q_upgrade', 'q_price', 'q_cart2', 'q_serve40', 'q_appeal4', 'q_up5', 'q_cart3', 'q_earn2k', 'q_serve300', 'q_cart4', 'q_earn10k', 'q_cart5', 'q_serve1500'];

/** Daily task pool: 3 per real day, progress counted from when the day's tasks were drawn. */
export const DAILY_TASKS: readonly QuestDef[] = [
  { id: 'd_serve', stat: 'served', target: 60, absolute: false, reward: 80 },
  { id: 'd_perfect', stat: 'perfects', target: 8, absolute: false, reward: 70 },
  { id: 'd_earn', stat: 'earned', target: 600, absolute: false, reward: 90 },
  { id: 'd_upgrades', stat: 'upgrades', target: 3, absolute: false, reward: 70 },
  { id: 'd_clean', stat: 'cleans', target: 3, absolute: false, reward: 50 },
  { id: 'd_cooks', stat: 'cooks', target: 15, absolute: false, reward: 60 },
  { id: 'd_restock', stat: 'restocks', target: 3, absolute: false, reward: 50 },
  { id: 'd_workerCooks', stat: 'workerCooks', target: 20, absolute: false, reward: 80 },
];

/** Side goals: two visible at a time, drawn from this pool in order, progress counted from activation. */
export const SIDE_GOALS: readonly QuestDef[] = [
  { id: 's_perfect3', stat: 'perfects', target: 3, absolute: false, reward: 12 },
  { id: 's_clean', stat: 'cleans', target: 1, absolute: false, reward: 8, focus: 'clean' },
  { id: 's_restock', stat: 'restocks', target: 1, absolute: false, reward: 10, focus: 'restock' },
  { id: 's_serve25', stat: 'served', target: 25, absolute: false, reward: 30 },
  { id: 's_perfect10', stat: 'perfects', target: 10, absolute: false, reward: 45 },
  { id: 's_upgrades5', stat: 'upgrades', target: 5, absolute: false, reward: 60 },
  { id: 's_earn500', stat: 'earned', target: 500, absolute: false, reward: 70 },
  { id: 's_serve100', stat: 'served', target: 100, absolute: false, reward: 120 },
  { id: 's_perfect25', stat: 'perfects', target: 25, absolute: false, reward: 150 },
  { id: 's_upgrades15', stat: 'upgrades', target: 15, absolute: false, reward: 300 },
  { id: 's_earn5k', stat: 'earned', target: 5000, absolute: false, reward: 450 },
  { id: 's_serve400', stat: 'served', target: 400, absolute: false, reward: 600 },
];
