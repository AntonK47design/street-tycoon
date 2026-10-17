import { BALANCE } from '../data/balance';
import type { KitchenId } from '../data/kitchens';
import type { MilestoneId } from '../data/pacing';
import type { StatKey } from '../data/quests';
import { UPGRADE_ORDER, type UpgradeId } from '../data/upgrades';
import type { AutoStage } from '../data/workers';
import type { ShopKind } from '../data/shops';
import type { Placed } from './shop-layout';

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

export interface WorkerState {
  id: number;
  name: string;
  stars: 1 | 2 | 3;
  level: number;
  xp: number;
  /** Id of the cart the worker runs (-1 = none). */
  cart: number;
  /** Property id of the shop the worker runs as cashier (-1 = none). */
  shop: number;
  auto: AutoStage;
  /** Running training: target stage and the world time it finishes. */
  training: { stage: AutoStage; endsAt: number } | null;
}

export interface ShopState {
  kind: ShopKind;
  items: Placed[];
  /** Price per product id. */
  prices: Record<string, number>;
  sold: number;
  earned: number;
}

export interface ApartmentState {
  /** 'empty' → renovating (until endsAt) → 'rented'. */
  status: 'empty' | 'renovating' | 'rented';
  endsAt: number;
}

export interface PropertyState {
  /** Property id (index into the city's property list). */
  id: number;
  status: 'rented' | 'owned';
  shop: ShopState | null;
  apartments: ApartmentState[];
}

export interface DailyTaskState {
  idx: number;
  base: number;
  claimed: boolean;
}

/** Real-calendar retention data (dates are local YYYY-MM-DD strings supplied by the app). */
export interface DailyState {
  /** Date the current daily tasks were drawn for. */
  date: string;
  streak: number;
  lastClaim: string;
  tasks: DailyTaskState[];
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
  workers: WorkerState[];
  nextWorkerId: number;
  /** Workers hired so far (drives candidate generation and prices). */
  hires: number;
  /** Seconds of world time: play time plus credited offline time (timers run on this). */
  worldTime: number;
  daily: DailyState;
  properties: PropertyState[];
}

export function emptyUpgrades(): Record<UpgradeId, number> {
  const r = {} as Record<UpgradeId, number>;
  for (const id of UPGRADE_ORDER) r[id] = 0;
  return r;
}

export function emptyStats(): Record<StatKey, number> {
  return {
    cooks: 0,
    served: 0,
    earned: 0,
    upgrades: 0,
    carts: 1,
    priceChanges: 0,
    cleans: 0,
    restocks: 0,
    perfects: 0,
    bestAppeal: 0,
    maxUpgradeLevel: 0,
    workers: 0,
    trainings: 0,
    longTrainings: 0,
    kitchens: 1,
    dailyTasks: 0,
    workerCooks: 0,
    properties: 0,
    shopSales: 0,
    bestLayout: 0,
    owned: 0,
    tenants: 0,
  };
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
    workers: [],
    nextWorkerId: 1,
    hires: 0,
    worldTime: 0,
    daily: { date: '', streak: 0, lastClaim: '', tasks: [] },
    properties: [],
  };
}
