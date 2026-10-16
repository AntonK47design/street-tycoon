export type UpgradeId = 'grill' | 'speed' | 'recipe' | 'sign' | 'comfort' | 'pantry';

export interface UpgradeDef {
  id: UpgradeId;
  maxLevel: number;
  baseCost: number;
  growth: number;
  /** Effect per level (meaning depends on the path, see sim/cart.ts). */
  perLevel: number;
}

export const UPGRADE_ORDER: readonly UpgradeId[] = ['grill', 'speed', 'recipe', 'sign', 'comfort', 'pantry'];

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  /** +perLevel portions per batch */
  grill: { id: 'grill', maxLevel: 10, baseCost: 40, growth: 1.7, perLevel: 1 },
  /** serve time × (1 - perLevel)^level */
  speed: { id: 'speed', maxLevel: 10, baseCost: 42, growth: 1.68, perLevel: 0.09 },
  /** fair price × (1 + perLevel × level) */
  recipe: { id: 'recipe', maxLevel: 10, baseCost: 60, growth: 1.75, perLevel: 0.14 },
  /** recruit radius + perLevel m, arrival rate + customers.signRate/level, location appeal */
  sign: { id: 'sign', maxLevel: 10, baseCost: 44, growth: 1.7, perLevel: 1.5 },
  /** patience × (1 + perLevel × level), appeal bonus */
  comfort: { id: 'comfort', maxLevel: 10, baseCost: 48, growth: 1.72, perLevel: 0.2 },
  /** supplies cap + perLevel, ingredient cost −3 %/level */
  pantry: { id: 'pantry', maxLevel: 10, baseCost: 38, growth: 1.68, perLevel: 15 },
};

export function upgradeCost(id: UpgradeId, level: number): number {
  const d = UPGRADES[id];
  return Math.round(d.baseCost * Math.pow(d.growth, level));
}
