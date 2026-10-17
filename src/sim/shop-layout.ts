import { FURNITURE, SHOPS, productsFor, type FurnitureId, type ShopKind } from '../data/shops';
import { E, N, S, W, type Building } from './city';

/** Placed furniture. rot 0..3: front faces +z, +x, −z, −x. */
export interface Placed {
  type: FurnitureId;
  i: number;
  j: number;
  rot: 0 | 1 | 2 | 3;
  /** Product id for product furniture. */
  product?: string;
  stock?: number;
}

/** Interior grid of a property's ground floor (1 cell ≈ 1 m). */
export interface Grid {
  x0: number;
  z0: number;
  cols: number;
  rows: number;
  cw: number;
  ch: number;
  /** Cell just inside the door. */
  entry: number;
  /** Door on the wall and a point on the sidewalk in front of it. */
  door: { x: number; z: number; nx: number; nz: number };
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** Builds the ground-floor grid; the entrance is on the street side facing the city centre. */
export function makeGrid(b: Building): Grid {
  const inset = 0.3;
  const w = b.x1 - b.x0 - 2 * inset;
  const d = b.z1 - b.z0 - 2 * inset;
  const cols = Math.max(4, Math.floor(w));
  const rows = Math.max(4, Math.floor(d));
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const sides: Array<[number, number, number, number, number]> = [
    [N, cx, b.z0, 0, -1],
    [E, b.x1, cz, 1, 0],
    [S, cx, b.z1, 0, 1],
    [W, b.x0, cz, -1, 0],
  ];
  let best = sides[0] as [number, number, number, number, number];
  let bv = -Infinity;
  for (const s of sides) {
    if (!(b.facing & s[0])) continue;
    // prefer the side whose normal points towards the city centre
    const v = -(s[3] * cx + s[4] * cz) / Math.max(1, Math.hypot(cx, cz));
    if (v > bv) {
      bv = v;
      best = s;
    }
  }
  const [, dx, dz, nx, nz] = best;
  const g: Grid = { x0: b.x0 + inset, z0: b.z0 + inset, cols, rows, cw: w / cols, ch: d / rows, entry: 0, door: { x: dx, z: dz, nx, nz } };
  const ei = nx > 0 ? cols - 1 : nx < 0 ? 0 : Math.floor(cols / 2);
  const ej = nz > 0 ? rows - 1 : nz < 0 ? 0 : Math.floor(rows / 2);
  g.entry = ej * cols + ei;
  return g;
}

export function cellPos(g: Grid, cell: number): { x: number; z: number } {
  const i = cell % g.cols;
  const j = Math.floor(cell / g.cols);
  return { x: g.x0 + (i + 0.5) * g.cw, z: g.z0 + (j + 0.5) * g.ch };
}

export function footprint(p: Pick<Placed, 'type' | 'rot'>): { w: number; d: number } {
  const f = FURNITURE[p.type];
  return p.rot % 2 === 0 ? { w: f.w, d: f.d } : { w: f.d, d: f.w };
}

export function cellsOf(p: Placed): Array<[number, number]> {
  const { w, d } = footprint(p);
  const out: Array<[number, number]> = [];
  for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) out.push([p.i + a, p.j + b]);
  return out;
}

/** Cell in front of a piece's front side (where customers stand), or -1 if outside the grid. */
export function accessCell(g: Grid, p: Placed): number {
  const { w, d } = footprint(p);
  const [fx, fz] = DIRS[p.rot] as readonly [number, number];
  let i: number;
  let j: number;
  if (fx === 0) {
    i = p.i + Math.floor((w - 1) / 2);
    j = fz > 0 ? p.j + d : p.j - 1;
  } else {
    j = p.j + Math.floor((d - 1) / 2);
    i = fx > 0 ? p.i + w : p.i - 1;
  }
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return -1;
  return j * g.cols + i;
}

/** Blocked cells (non-walkable furniture). */
export function blockedMap(g: Grid, items: readonly Placed[], skip?: Placed): Uint8Array {
  const m = new Uint8Array(g.cols * g.rows);
  for (const p of items) {
    if (p === skip || FURNITURE[p.type].walkable) continue;
    for (const [i, j] of cellsOf(p)) if (i >= 0 && j >= 0 && i < g.cols && j < g.rows) m[j * g.cols + i] = 1;
  }
  return m;
}

/** Can `p` be placed (inside, no overlap, entrance free, access cell walkable)? */
export function canPlace(g: Grid, items: readonly Placed[], p: Placed, skip?: Placed): boolean {
  const occupied = new Set<number>();
  for (const q of items) if (q !== skip) for (const [i, j] of cellsOf(q)) occupied.add(j * g.cols + i);
  for (const [i, j] of cellsOf(p)) {
    if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return false;
    const c = j * g.cols + i;
    if (occupied.has(c) || c === g.entry) return false;
  }
  if (FURNITURE[p.type].walkable) return true;
  // never stand on the spot where customers use another piece
  const mine = new Set(cellsOf(p).map(([i, j]) => j * g.cols + i));
  for (const q of items) {
    if (q === skip || FURNITURE[q.type].walkable) continue;
    const qa = accessCell(g, q);
    if (qa >= 0 && mine.has(qa)) return false;
  }
  const a = accessCell(g, p);
  if (a < 0) return FURNITURE[p.type].slot === undefined && p.type !== 'checkout';
  const blocked = blockedMap(g, items, skip);
  for (const [i, j] of cellsOf(p)) blocked[j * g.cols + i] = 1;
  return blocked[a] === 0;
}

/** BFS distances from a cell over walkable cells (-1 = unreachable). */
export function distances(g: Grid, blocked: Uint8Array, from: number): Int16Array {
  const dist = new Int16Array(g.cols * g.rows).fill(-1);
  if (blocked[from]) return dist;
  const q = [from];
  dist[from] = 0;
  for (let k = 0; k < q.length; k++) {
    const c = q[k] as number;
    const i = c % g.cols;
    const j = Math.floor(c / g.cols);
    for (const [dx, dz] of DIRS) {
      const ni = i + dx;
      const nj = j + dz;
      if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) continue;
      const n = nj * g.cols + ni;
      if (dist[n] !== -1 || blocked[n]) continue;
      dist[n] = (dist[c] as number) + 1;
      q.push(n);
    }
  }
  return dist;
}

/** Shortest path (cells, excluding `from`) using BFS distances from `to`. */
export function path(g: Grid, blocked: Uint8Array, from: number, to: number): number[] {
  const dist = distances(g, blocked, to);
  if (dist[from] === -1) return [];
  const out: number[] = [];
  let c = from;
  for (let guard = 0; guard < 400 && c !== to; guard++) {
    const i = c % g.cols;
    const j = Math.floor(c / g.cols);
    let next = c;
    for (const [dx, dz] of DIRS) {
      const ni = i + dx;
      const nj = j + dz;
      if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) continue;
      const n = nj * g.cols + ni;
      if (dist[n] !== -1 && (dist[n] as number) < (dist[next] as number)) next = n;
    }
    if (next === c) break;
    out.push(next);
    c = next;
  }
  return out;
}

export interface RatingParts {
  checkout: number;
  reach: number;
  variety: number;
  density: number;
  decor: number;
  space: number;
  total: number;
  /** Shop can trade at all (checkout reachable and at least one reachable product). */
  open: boolean;
}

/** Layout rating 0..1 with breakdown. */
export function rateLayout(g: Grid, items: readonly Placed[], kind: ShopKind, tidy = 0): RatingParts {
  const blocked = blockedMap(g, items);
  const dist = distances(g, blocked, g.entry);
  const cells = g.cols * g.rows;
  const productItems = items.filter((p) => FURNITURE[p.type].slot);
  let reachable = 0;
  for (const p of productItems) {
    const a = accessCell(g, p);
    if (a >= 0 && (dist[a] as number) >= 0) reachable++;
  }
  const checkout = items.find((p) => p.type === 'checkout');
  let checkoutScore = 0;
  let checkoutOk = false;
  if (checkout) {
    const a = accessCell(g, checkout);
    if (a >= 0 && (dist[a] as number) >= 0) {
      checkoutOk = true;
      // queue space: free cells in a line behind the access cell
      const [fx, fz] = DIRS[checkout.rot] as readonly [number, number];
      let free = 0;
      let i = a % g.cols;
      let j = Math.floor(a / g.cols);
      for (let k = 0; k < 3; k++) {
        i += fx;
        j += fz;
        if (i < 0 || j < 0 || i >= g.cols || j >= g.rows || blocked[j * g.cols + i]) break;
        free++;
      }
      checkoutScore = 0.4 + 0.2 * free;
    }
  }
  const products = new Set(productItems.map((p) => p.product).filter(Boolean));
  const kinds = productsFor(kind).length;
  let decor = 0;
  for (const p of items) decor += FURNITURE[p.type].decor ?? 0;
  let used = 0;
  for (let c = 0; c < cells; c++) if (blocked[c]) used++;
  const freeFrac = 1 - used / cells;
  const r = SHOPS.rating;
  const parts = {
    checkout: checkoutScore,
    reach: productItems.length ? reachable / productItems.length : 0,
    variety: Math.min(1, products.size / Math.max(1, Math.min(4, kinds))),
    density: Math.min(1, reachable / Math.max(1, cells / 14)),
    decor: Math.min(1, decor / Math.max(1, cells / 18)),
    space: Math.max(0, Math.min(1, (freeFrac - 0.25) / 0.2)),
  };
  const open = checkoutOk && reachable > 0;
  const total = open ? Math.min(1, r.checkout * parts.checkout + r.reach * parts.reach + r.variety * parts.variety + r.density * parts.density + r.decor * parts.decor + r.space * parts.space + tidy) : 0;
  return { ...parts, total, open };
}

/** Finds a free spot for a new piece, scanning from the back wall (opposite the entrance). */
export function autoPlace(g: Grid, items: readonly Placed[], type: FurnitureId, preferRot?: 0 | 1 | 2 | 3): Placed | null {
  const ei = g.entry % g.cols;
  const ej = Math.floor(g.entry / g.cols);
  // face towards the entrance by default
  const rot: 0 | 1 | 2 | 3 = preferRot ?? (g.door.nz > 0 ? 0 : g.door.nz < 0 ? 2 : g.door.nx > 0 ? 1 : 3);
  const cands: Array<{ p: Placed; score: number }> = [];
  for (let j = 0; j < g.rows; j++) {
    for (let i = 0; i < g.cols; i++) {
      for (const r of [rot, ((rot + 1) % 4) as 0 | 1 | 2 | 3, ((rot + 3) % 4) as 0 | 1 | 2 | 3]) {
        const p: Placed = { type, i, j, rot: r };
        if (!canPlace(g, items, p)) continue;
        const far = Math.hypot(i - ei, j - ej);
        // checkouts near the door, everything else towards the back, walls preferred
        const wall = i === 0 || j === 0 || i + footprint(p).w === g.cols || j + footprint(p).d === g.rows ? 1 : 0;
        const score = (type === 'checkout' ? -far : far) + wall * 2 + (r === rot ? 1 : 0);
        cands.push({ p, score });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  // keep the layout connected: take the best candidate that leaves every access cell reachable
  for (const c of cands.slice(0, 40)) {
    const next = [...items, c.p];
    const rating = rateLayout(g, next, 'snack');
    const blocked = blockedMap(g, next);
    const dist = distances(g, blocked, g.entry);
    const ok = next.every((p) => FURNITURE[p.type].walkable || accessCell(g, p) < 0 || (dist[accessCell(g, p)] as number) >= 0);
    if (ok || rating.open) return c.p;
  }
  return cands[0]?.p ?? null;
}
