/** Phase 3: real estate and shops. All numbers here. */
export type ShopKind = 'snack' | 'flower' | 'gift';
export type SlotType = 'shelf' | 'fridge' | 'display';
export type FurnitureId = 'shelf' | 'fridge' | 'display' | 'checkout' | 'plant' | 'lamp' | 'rug' | 'bench';

export interface FurnitureDef {
  id: FurnitureId;
  /** Footprint in cells at rotation 0 (w along x, d along z). Front faces +z. */
  w: number;
  d: number;
  cost: number;
  /** Holds products of this slot type. */
  slot?: SlotType;
  capacity?: number;
  /** Layout-rating decor points. */
  decor?: number;
  /** Customers may walk over it (rugs). */
  walkable?: boolean;
}

export const FURNITURE_ORDER: readonly FurnitureId[] = ['shelf', 'fridge', 'display', 'checkout', 'plant', 'lamp', 'rug', 'bench'];

export const FURNITURE: Record<FurnitureId, FurnitureDef> = {
  shelf: { id: 'shelf', w: 2, d: 1, cost: 60, slot: 'shelf', capacity: 14 },
  fridge: { id: 'fridge', w: 1, d: 1, cost: 90, slot: 'fridge', capacity: 10 },
  display: { id: 'display', w: 2, d: 2, cost: 75, slot: 'display', capacity: 10, decor: 0.5 },
  checkout: { id: 'checkout', w: 2, d: 1, cost: 80 },
  plant: { id: 'plant', w: 1, d: 1, cost: 25, decor: 1 },
  lamp: { id: 'lamp', w: 1, d: 1, cost: 30, decor: 1 },
  rug: { id: 'rug', w: 2, d: 2, cost: 35, decor: 1.5, walkable: true },
  bench: { id: 'bench', w: 2, d: 1, cost: 40, decor: 1 },
};

export interface ProductDef {
  id: string;
  kind: ShopKind;
  slot: SlotType;
  /** Wholesale cost per item. */
  cost: number;
  /** Fair retail price. */
  fair: number;
  /** Colour of the product blocks on the furniture. */
  color: number;
}

export const PRODUCTS: readonly ProductDef[] = [
  { id: 'chips', kind: 'snack', slot: 'shelf', cost: 1.1, fair: 3, color: 0xe0a83a },
  { id: 'candy', kind: 'snack', slot: 'shelf', cost: 0.8, fair: 2.5, color: 0xe4708f },
  { id: 'soda', kind: 'snack', slot: 'fridge', cost: 0.9, fair: 2.5, color: 0xd9573f },
  { id: 'sandwich', kind: 'snack', slot: 'fridge', cost: 2, fair: 5, color: 0xd8c08a },
  { id: 'fruit', kind: 'snack', slot: 'display', cost: 1.2, fair: 3, color: 0x7fb24a },
  { id: 'seeds', kind: 'flower', slot: 'shelf', cost: 1, fair: 3.5, color: 0x9a7b4f },
  { id: 'cutflowers', kind: 'flower', slot: 'fridge', cost: 3, fair: 9, color: 0xe57a9a },
  { id: 'bouquet', kind: 'flower', slot: 'display', cost: 5, fair: 14, color: 0xf2c14e },
  { id: 'pottedplant', kind: 'flower', slot: 'display', cost: 4, fair: 11, color: 0x5d8c3a },
  { id: 'postcard', kind: 'gift', slot: 'shelf', cost: 0.5, fair: 2, color: 0x8fb3c9 },
  { id: 'mug', kind: 'gift', slot: 'shelf', cost: 2.5, fair: 8, color: 0xf0e3c9 },
  { id: 'plush', kind: 'gift', slot: 'display', cost: 4, fair: 13, color: 0xc9a26a },
  { id: 'snowglobe', kind: 'gift', slot: 'display', cost: 5, fair: 16, color: 0x95b0c4 },
  { id: 'icecream', kind: 'gift', slot: 'fridge', cost: 1.5, fair: 4.5, color: 0xf6d7bf },
];

export const SHOP_KINDS: readonly ShopKind[] = ['snack', 'flower', 'gift'];

/** Awning / sign colour per shop kind. */
export const SHOP_COLORS: Record<ShopKind, number> = { snack: 0xe0a83a, flower: 0x5d8c3a, gift: 0x7b5ea7 };

export const SHOPS = {
  /** Properties offered in the start district. */
  propertyCount: 6,
  /** Rent per game day per m² of floor, × location (traffic 0..1 → 0.7..1.3). */
  rentPerSqmDay: 0.6,
  /** Buy price = rent per day × this. */
  buyDays: 28,
  /** Rent is paid continuously: per day over this many real seconds (one game day). */
  /** Customers per second at traffic 1, rating 1, fair prices. */
  baseRate: 0.3,
  ratingBase: 0.3,
  ratingSlope: 0.9,
  /** Customers in the shop at once: floor cells / this. */
  cellsPerCustomer: 7,
  browseSec: 1.6,
  /** Stops per visit (product furniture visited) and items bought per stop. */
  stopsMin: 1,
  stopsMax: 3,
  itemsMax: 2,
  /** Seconds per customer at the checkout: self-checkout vs. cashier. */
  selfCheckoutSec: 4,
  cashierSec: 1.6,
  /** Price elasticity per product (like carts). */
  elasticity: 1.4,
  /** Starter layout cost is included in the first rent. */
  starter: [
    { type: 'checkout' as FurnitureId, rot: 0 },
    { type: 'shelf' as FurnitureId, rot: 0 },
    { type: 'fridge' as FurnitureId, rot: 0 },
  ],
  /** Furniture sells back for this share of its cost. */
  sellBack: 0.5,
  /** Layout rating weights. */
  rating: { checkout: 0.15, reach: 0.25, variety: 0.15, density: 0.2, decor: 0.15, space: 0.1 },
  /** Cashier stage 4 ("tidy") bonus on the rating. */
  tidyBonus: 0.08,
  /** Apartments (upper floors of owned buildings). */
  apartment: { renovateCost: 450, renovateGrowth: 1.35, renovateSec: 600, rentPerDay: 45, rentGrowth: 1.2 },
} as const;

export function productsFor(kind: ShopKind, slot?: SlotType): ProductDef[] {
  return PRODUCTS.filter((p) => p.kind === kind && (!slot || p.slot === slot));
}

export function productById(id: string): ProductDef | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
