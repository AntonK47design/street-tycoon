/** Phase 4: land, raw materials and production chains. Everything here is data — systems read it. */

export type GoodId =
  | 'wheat'
  | 'potato'
  | 'tomato'
  | 'cotton'
  | 'egg'
  | 'wool'
  | 'milk'
  | 'livestock'
  | 'log'
  | 'stone'
  | 'coal'
  | 'ore'
  | 'plank'
  | 'ingot'
  | 'cloth'
  | 'meat'
  | 'flour'
  | 'furniture'
  | 'tools'
  | 'gadget'
  | 'sweater'
  | 'bread';

export interface GoodDef {
  id: GoodId;
  /** Base sell price at the trading post. */
  price: number;
  color: number;
  /** Raw goods come from land (farm, ranch, mine, forest). */
  raw: boolean;
}

export const GOODS: Record<GoodId, GoodDef> = {
  wheat: { id: 'wheat', price: 1.6, color: 0xe2c25a, raw: true },
  potato: { id: 'potato', price: 2.2, color: 0xb98a55, raw: true },
  tomato: { id: 'tomato', price: 3, color: 0xd9573f, raw: true },
  cotton: { id: 'cotton', price: 3, color: 0xf3efe6, raw: true },
  egg: { id: 'egg', price: 2.4, color: 0xf6e7c8, raw: true },
  wool: { id: 'wool', price: 7, color: 0xeee9df, raw: true },
  milk: { id: 'milk', price: 4, color: 0xf5f5f0, raw: true },
  livestock: { id: 'livestock', price: 45, color: 0x8b6a4f, raw: true },
  log: { id: 'log', price: 2.5, color: 0x8f6a46, raw: true },
  stone: { id: 'stone', price: 1.4, color: 0xa9a49b, raw: true },
  coal: { id: 'coal', price: 3.5, color: 0x3b3b3f, raw: true },
  ore: { id: 'ore', price: 6, color: 0xb0704a, raw: true },
  plank: { id: 'plank', price: 4, color: 0xd2a56d, raw: false },
  ingot: { id: 'ingot', price: 22, color: 0x9aa1a8, raw: false },
  cloth: { id: 'cloth', price: 16, color: 0x7b9bc9, raw: false },
  meat: { id: 'meat', price: 11, color: 0xc4553b, raw: false },
  flour: { id: 'flour', price: 4.5, color: 0xf2ecdc, raw: false },
  furniture: { id: 'furniture', price: 55, color: 0xa4744d, raw: false },
  tools: { id: 'tools', price: 75, color: 0x5a6270, raw: false },
  gadget: { id: 'gadget', price: 120, color: 0x3f7fb0, raw: false },
  sweater: { id: 'sweater', price: 58, color: 0xc9643b, raw: false },
  bread: { id: 'bread', price: 9, color: 0xc99257, raw: false },
};

export const GOOD_ORDER = Object.keys(GOODS) as GoodId[];

export type FacilityKind = 'farm' | 'ranch' | 'mine' | 'forest' | 'sawmill' | 'smelter' | 'workshop' | 'loom' | 'butcher' | 'mill' | 'recycler';

export interface Recipe {
  id: string;
  facility: FacilityKind;
  inputs: Partial<Record<GoodId, number>>;
  outputs: Partial<Record<GoodId, number>>;
  /** Seconds per batch (real time; runs offline too). */
  sec: number;
  /** Money spent per batch (seeds, fuel). */
  cost?: number;
  /** Mine depth needed. */
  depth?: number;
  /** Ranch animal this recipe belongs to. */
  animal?: 'chicken' | 'sheep' | 'cow';
}

export interface FacilityDef {
  kind: FacilityKind;
  cost: number;
  /** Raw producers sit on land; processors are buildings. */
  raw: boolean;
  /** Worker role name key (staff.role.*). */
  role: 'farmer' | 'miner' | 'craftsman';
  color: number;
}

export const FACILITIES: Record<FacilityKind, FacilityDef> = {
  farm: { kind: 'farm', cost: 250, raw: true, role: 'farmer', color: 0x7f9b5c },
  ranch: { kind: 'ranch', cost: 450, raw: true, role: 'farmer', color: 0xb8432e },
  mine: { kind: 'mine', cost: 500, raw: true, role: 'miner', color: 0x8f877e },
  forest: { kind: 'forest', cost: 300, raw: true, role: 'farmer', color: 0x5e874b },
  sawmill: { kind: 'sawmill', cost: 600, raw: false, role: 'craftsman', color: 0xa4744d },
  mill: { kind: 'mill', cost: 550, raw: false, role: 'craftsman', color: 0xe6caa0 },
  smelter: { kind: 'smelter', cost: 900, raw: false, role: 'craftsman', color: 0x55606e },
  workshop: { kind: 'workshop', cost: 1100, raw: false, role: 'craftsman', color: 0x3f7fb0 },
  loom: { kind: 'loom', cost: 750, raw: false, role: 'craftsman', color: 0x7b5ea7 },
  butcher: { kind: 'butcher', cost: 650, raw: false, role: 'craftsman', color: 0xd9573f },
  recycler: { kind: 'recycler', cost: 700, raw: false, role: 'craftsman', color: 0x4f6b5a },
};

export const FACILITY_ORDER: readonly FacilityKind[] = ['farm', 'ranch', 'forest', 'mine', 'mill', 'sawmill', 'smelter', 'loom', 'butcher', 'workshop', 'recycler'];

const R = (id: string, facility: FacilityKind, inputs: Recipe['inputs'], outputs: Recipe['outputs'], sec: number, extra: Partial<Recipe> = {}): Recipe => ({ id, facility, inputs, outputs, sec, ...extra });

/** Forward recipes. Recycler recipes are generated from these (see RECYCLE_YIELD). */
export const RECIPES_FORWARD: readonly Recipe[] = [
  R('grow_wheat', 'farm', {}, { wheat: 30 }, 120, { cost: 6 }),
  R('grow_potato', 'farm', {}, { potato: 34 }, 180, { cost: 8 }),
  R('grow_tomato', 'farm', {}, { tomato: 34 }, 240, { cost: 10 }),
  R('grow_cotton', 'farm', {}, { cotton: 18 }, 300, { cost: 10 }),
  R('raise_chicken', 'ranch', { wheat: 4 }, { egg: 10 }, 90, { animal: 'chicken' }),
  R('raise_sheep', 'ranch', { wheat: 6 }, { wool: 5 }, 150, { animal: 'sheep' }),
  R('raise_cow', 'ranch', { wheat: 8 }, { milk: 8 }, 150, { animal: 'cow' }),
  R('fell_trees', 'forest', {}, { log: 14 }, 120),
  R('dig_stone', 'mine', {}, { stone: 16 }, 60),
  R('dig_coal', 'mine', {}, { coal: 10 }, 90, { depth: 2 }),
  R('dig_ore', 'mine', {}, { ore: 8 }, 120, { depth: 4 }),
  R('mill_flour', 'mill', { wheat: 10 }, { flour: 6 }, 60),
  R('bake_bread', 'mill', { flour: 4, egg: 2 }, { bread: 6 }, 90),
  R('saw_planks', 'sawmill', { log: 4 }, { plank: 6 }, 60),
  R('smelt_ingot', 'smelter', { ore: 3, coal: 2 }, { ingot: 2 }, 90),
  R('weave_cloth', 'loom', { wool: 3 }, { cloth: 2 }, 90),
  R('weave_cotton', 'loom', { cotton: 6 }, { cloth: 2 }, 90),
  R('knit_sweater', 'loom', { cloth: 2, wool: 1 }, { sweater: 1 }, 120),
  R('butcher_meat', 'butcher', { livestock: 1 }, { meat: 8 }, 60),
  R('make_furniture', 'workshop', { plank: 8 }, { furniture: 1 }, 120),
  R('make_tools', 'workshop', { ingot: 2, plank: 2 }, { tools: 1 }, 120),
  R('make_gadget', 'workshop', { ingot: 3, cloth: 1 }, { gadget: 1 }, 150),
];

/** Disassembly yield: share of each input recovered. */
export const RECYCLE_YIELD = 0.75;

/** "Everything can be taken apart again": every crafted good can be recycled into its inputs. */
export const RECIPES_RECYCLE: readonly Recipe[] = RECIPES_FORWARD.filter((r) => !FACILITIES[r.facility].raw && Object.keys(r.inputs).length > 0 && Object.keys(r.outputs).length === 1).map((r) => {
  const [good, qty] = Object.entries(r.outputs)[0] as [GoodId, number];
  const outputs: Recipe['outputs'] = {};
  for (const [g, q] of Object.entries(r.inputs) as Array<[GoodId, number]>) outputs[g] = Math.max(1, Math.floor(q * RECYCLE_YIELD));
  return R(`recycle_${r.id}`, 'recycler', { [good]: qty }, outputs, Math.round(r.sec * 0.6));
});

export const RECIPES: readonly Recipe[] = [...RECIPES_FORWARD, ...RECIPES_RECYCLE];

export function recipesFor(kind: FacilityKind): Recipe[] {
  return RECIPES.filter((r) => r.facility === kind);
}

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

export const LAND = {
  /** Price to open the Outskirts district. */
  unlockCost: 1200,
  /** Parcel price: base × growth^owned. */
  parcelCost: 400,
  parcelGrowth: 1.25,
  /** Construction time (s). */
  buildSec: 20,
  /** Merged (large) facilities produce this much more per batch. */
  mergedMult: 2.2,
  /** Ranch animals: start, capacity small / merged. Each finished batch breeds one animal until full,
   *  then surplus animals become livestock. Output scales with animals / animalsRef. */
  animalsStart: 2,
  animalsCap: 8,
  animalsCapMerged: 16,
  animalsRef: 4,
  /** Mine depth grows by one level every `depthEvery` goods dug (max depth). */
  depthEvery: 60,
  maxDepth: 8,
  /** Storage. */
  storageCap: 400,
  storageUpgrade: 300,
  storageUpgradeCost: 600,
  storageUpgradeGrowth: 1.6,
  /** Trading post: each sale pushes the price down (saturation) and it recovers over time. */
  saturationPerValue: 0.0006,
  saturationMax: 0.6,
  saturationRecoverPerSec: 0.004,
  /** Worker stages for facilities: 2–4 add output, 5 is faster. */
  yieldPerStage: 0.15,
  /** Demolish refund. */
  refund: 0.5,
} as const;
