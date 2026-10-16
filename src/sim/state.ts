import { BALANCE } from '../data/balance';
import type { KitchenId } from '../data/kitchens';
import type { MilestoneId } from '../data/pacing';
import type { StatKey } from '../data/quests';
import { UPGRADE_ORDER, type UpgradeId } from '../data/upgrades';

export type Quality = 0 | 1 | 2;

/** Saved per-cart state. */
export interface CartState {
  id: number;
  spot: string;
  kitchen: KitchenId;
  price: number;
  stock: number;
  supplies: number;
  /** Cleanliness 0..100. */
  clean: number;
  /** Quality of the last cooked batch. */
  quality: Quality;
  up: Record<UpgradeId, number>;
  served: number;
  earned: number;
}

export interface SideGoalState {
  idx: number;
  base: number;
}

/** Everything that is saved. Pedestrians and queues are transient. */
export interface GameState {
  seed: number;
  rng: number;
  cash: number;
  /** Simulated seconds played (all sessions). */
  time: number;
  day: number;
  clockMin: number;
  carts: CartState[];
  nextCartId: number;
  stats: Record<StatKey, number>;
  quest: number;
  side: Array<SideGoalState | null>;
  sideNext: number;
  milestones: Partial<Record<MilestoneId, number>>;
  /** Tutorial/hint flags (UI owned, persisted with the game). */
  flags: Record<string, boolean>;
}

export function emptyUpgrades(): Record<UpgradeId, number> {
  const r = {} as Record<UpgradeId, number>;
  for (const id of UPGRADE_ORDER) r[id] = 0;
  return r;
}

export function emptyStats(): Record<StatKey, number> {
  return { cooks: 0, served: 0, earned: 0, upgrades: 0, carts: 1, priceChanges: 0, cleans: 0, restocks: 0, perfects: 0, bestAppeal: 0, maxUpgradeLevel: 0 };
}

export function newCart(id: number, spot: string, kitchen: KitchenId, price: number): CartState {
  return {
    id,
    spot,
    kitchen,
    price,
    stock: 0,
    supplies: BALANCE.cart.startSupplies,
    clean: 100,
    quality: 1,
    up: emptyUpgrades(),
    served: 0,
    earned: 0,
  };
}

export function newGameState(seed: number = BALANCE.start.seed, firstSpot = 's_0_0_s', price = 5): GameState {
  return {
    seed,
    rng: seed ^ 0x5f3759df,
    cash: BALANCE.start.cash,
    time: 0,
    day: 1,
    clockMin: BALANCE.start.clockMin,
    carts: [newCart(1, firstSpot, 'hotdog', price)],
    nextCartId: 2,
    stats: emptyStats(),
    quest: 0,
    side: [
      { idx: 0, base: 0 },
      { idx: 1, base: 0 },
    ],
    sideNext: 2,
    milestones: {},
    flags: {},
  };
}
