import { BALANCE } from '../data/balance';
import { KITCHENS } from '../data/kitchens';
import { UPGRADES } from '../data/upgrades';
import type { CartSpot } from './city';
import type { CartState } from './state';

const C = BALANCE.cart;
const A = BALANCE.appeal;

/** Derived cart numbers (upgrades applied). Pure functions of the saved state. */
export function fairPrice(c: CartState): number {
  return KITCHENS[c.kitchen].fairPrice * (1 + UPGRADES.recipe.perLevel * c.up.recipe);
}

export function batchSize(c: CartState): number {
  return C.batchSize + UPGRADES.grill.perLevel * c.up.grill;
}

export function stockCap(c: CartState): number {
  return batchSize(c) * C.stockBatches;
}

export function suppliesCap(c: CartState): number {
  return C.suppliesCap + UPGRADES.pantry.perLevel * c.up.pantry;
}

export function ingredientCost(c: CartState): number {
  return KITCHENS[c.kitchen].ingredientCost * Math.max(0.5, 1 - 0.03 * c.up.pantry);
}

export function serveSec(c: CartState): number {
  return C.serveSec * KITCHENS[c.kitchen].serveMul * Math.pow(1 - UPGRADES.speed.perLevel, c.up.speed);
}

export function reach(c: CartState): number {
  return C.baseReach + UPGRADES.sign.perLevel * c.up.sign;
}

export function patienceSec(c: CartState): number {
  return BALANCE.customers.patienceSec * (1 + UPGRADES.comfort.perLevel * c.up.comfort);
}

export function priceMin(c: CartState): number {
  return roundPrice(fairPrice(c) * C.priceMinFactor);
}

export function priceMax(c: CartState): number {
  return roundPrice(fairPrice(c) * C.priceMaxFactor);
}

export function roundPrice(p: number): number {
  return Math.max(C.priceStep, Math.round(p / C.priceStep) * C.priceStep);
}

export function restockCost(c: CartState): number {
  return Math.max(0, suppliesCap(c) - c.supplies) * ingredientCost(c);
}

export interface AppealParts {
  clean: number;
  location: number;
  price: number;
  taste: number;
  stars: number;
}

/** Appeal breakdown (each part 0..1) and total stars 0..5. */
export function appeal(c: CartState, spot: CartSpot | undefined, out?: AppealParts): AppealParts {
  const o = out ?? { clean: 0, location: 0, price: 0, taste: 0, stars: 0 };
  o.clean = Math.max(0, Math.min(1, c.clean / 100));
  o.location = Math.min(1, (spot?.traffic ?? 0.6) * 0.85 + 0.035 * c.up.sign);
  const ratio = c.price / fairPrice(c);
  o.price = Math.max(0, Math.min(1, (A.priceSour - ratio) / (A.priceSour - A.priceSweet)));
  o.taste = Math.min(1, (A.tasteByQuality[c.quality] ?? 0.6) + 0.02 * c.up.recipe);
  const comfort = 0.025 * c.up.comfort;
  const score = A.wClean * o.clean + A.wLocation * o.location + A.wPrice * o.price + A.wTaste * o.taste + comfort;
  o.stars = Math.max(0, Math.min(5, score * 5));
  return o;
}

/** Purchase-chance multiplier from price alone. */
export function priceMult(c: CartState): number {
  const m = Math.pow(fairPrice(c) / Math.max(0.01, c.price), BALANCE.customers.elasticity);
  return Math.max(BALANCE.customers.priceMultMin, Math.min(BALANCE.customers.priceMultMax, m));
}
