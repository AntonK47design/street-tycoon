/** City layout constants (metres). x = east, z = south, y = up. */
export const CITY = {
  /** Block edge length including its sidewalk ring. */
  block: 40,
  road: 10,
  sidewalk: 5,
  curb: 0.16,
  /** Pedestrian path line distance from the block edge (street side of the sidewalk). */
  pathInset: 1.5,
  /** Customer serve line (between path and cart). */
  serveInset: 2.75,
  /** Cart centre distance from the block edge. */
  cartInset: 3.95,
  /** Blocks rendered around the centre (radius 3 → 7×7). */
  renderRadius: 3,
  /** Blocks pedestrians walk in (radius 2 → 5×5). */
  walkRadius: 2,
  /** Start district radius (1 → 3×3 around Market Square). */
  startRadius: 1,
  /** Lot grid inside a block: cells × cells perimeter buildings. */
  lotCells: 3,
  floorHeight: 3.1,
  /** Camera pan bounds (centre of view), metres from origin. */
  cameraBounds: 62,
} as const;

export const PITCH = CITY.block + CITY.road;
