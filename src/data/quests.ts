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
  | 'maxUpgradeLevel';

export interface QuestDef {
  id: string;
  stat: StatKey;
  /** Target value. For 'earned'/'served' etc. counted from the moment the quest becomes active if `fromStart` is false. */
  target: number;
  /** true: absolute stat value counts (e.g. "own 2 carts"); false: progress since the quest started. */
  absolute: boolean;
  reward: number;
  /** UI element the goal bar can point at (tutorial highlight). */
  focus?: 'cart' | 'cook' | 'upgrades' | 'price' | 'newCart' | 'clean' | 'restock';
}

/** Main goal chain (always one visible). Phase 1 content. */
export const QUESTS: readonly QuestDef[] = [
  { id: 'q_cook', stat: 'cooks', target: 1, absolute: true, reward: 0, focus: 'cook' },
  { id: 'q_serve3', stat: 'served', target: 3, absolute: true, reward: 6 },
  { id: 'q_upgrade', stat: 'upgrades', target: 1, absolute: true, reward: 10, focus: 'upgrades' },
  { id: 'q_price', stat: 'priceChanges', target: 1, absolute: true, reward: 8, focus: 'price' },
  { id: 'q_cart2', stat: 'carts', target: 2, absolute: true, reward: 25, focus: 'newCart' },
  { id: 'q_serve40', stat: 'served', target: 40, absolute: true, reward: 40 },
  { id: 'q_appeal4', stat: 'bestAppeal', target: 4, absolute: true, reward: 60 },
  { id: 'q_up5', stat: 'maxUpgradeLevel', target: 5, absolute: true, reward: 120 },
  { id: 'q_cart3', stat: 'carts', target: 3, absolute: true, reward: 150, focus: 'newCart' },
  { id: 'q_earn2k', stat: 'earned', target: 2000, absolute: true, reward: 200 },
  { id: 'q_serve300', stat: 'served', target: 300, absolute: true, reward: 300 },
  { id: 'q_cart4', stat: 'carts', target: 4, absolute: true, reward: 500, focus: 'newCart' },
  { id: 'q_earn10k', stat: 'earned', target: 10000, absolute: true, reward: 800 },
  { id: 'q_cart5', stat: 'carts', target: 5, absolute: true, reward: 1500, focus: 'newCart' },
  { id: 'q_serve1500', stat: 'served', target: 1500, absolute: true, reward: 2000 },
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
