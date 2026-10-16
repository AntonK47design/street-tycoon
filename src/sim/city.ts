import { CITY, PITCH } from '../data/city';
import { Rng } from '../core/rng';

/** Side bit flags: which sides of a footprint face a street. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export type BlockKind = 'plaza' | 'buildings' | 'park';

export interface Block {
  i: number;
  j: number;
  cx: number;
  cz: number;
  kind: BlockKind;
  /** 0 = start district, 1 = next ring (locked), 2 = backdrop. */
  ring: number;
}

export type RoofKind = 'flat' | 'gable';

export interface Building {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  floors: number;
  /** Street-facing sides (N/E/S/W bit flags). */
  facing: number;
  /** Ground floor has a shop front with awning. */
  shop: boolean;
  roof: RoofKind;
  /** Palette indices (resolved by the renderer). */
  wall: number;
  accent: number;
  ring: number;
  seed: number;
}

export interface PathNode {
  id: number;
  x: number;
  z: number;
  nb: number[];
  /** On the outer border of the walk area: pedestrians spawn and leave here. */
  border: boolean;
}

export interface CartSpot {
  id: string;
  /** Cart centre. */
  x: number;
  z: number;
  /** Unit vector from the cart towards the customers (street side). */
  fx: number;
  fz: number;
  /** Path edge the spot lies on (node ids). */
  a: number;
  b: number;
  /** Serve point (first in queue stands here). */
  sx: number;
  sz: number;
  /** Foot traffic rating 0..1 (location appeal). */
  traffic: number;
  ring: number;
}

export interface Door {
  x: number;
  z: number;
  /** Outward normal (towards the street). */
  nx: number;
  nz: number;
  shop: boolean;
}

export interface Crosswalk {
  x: number;
  z: number;
  /** true: stripes run across a road going north-south (people walk east-west). */
  ew: boolean;
}

export interface CityLayout {
  seed: number;
  blocks: Block[];
  buildings: Building[];
  nodes: PathNode[];
  spots: CartSpot[];
  crosswalks: Crosswalk[];
  doors: Door[];
  /** Trees and props as data so the renderer and sim agree. */
  trees: Array<{ x: number; z: number; s: number }>;
  fountain: { x: number; z: number; r: number };
}

const HALF = CITY.block / 2;

function ringOf(i: number, j: number): number {
  const r = Math.max(Math.abs(i), Math.abs(j));
  return r <= CITY.startRadius ? 0 : r <= CITY.walkRadius ? 1 : 2;
}

/** Deterministic city from a seed. Pure data — no rendering. */
export function generateCity(seed: number): CityLayout {
  const rng = new Rng(seed);
  const blocks: Block[] = [];
  const buildings: Building[] = [];
  const trees: CityLayout['trees'] = [];
  const R = CITY.renderRadius;
  for (let j = -R; j <= R; j++) {
    for (let i = -R; i <= R; i++) {
      const ring = ringOf(i, j);
      let kind: BlockKind = 'buildings';
      if (i === 0 && j === 0) kind = 'plaza';
      else if ((i === 2 && j === -1) || (i === -2 && j === 2) || (i === -3 && j === -2)) kind = 'park';
      blocks.push({ i, j, cx: i * PITCH, cz: j * PITCH, kind, ring });
    }
  }

  for (const b of blocks) {
    if (b.kind === 'buildings') genBuildings(b, rng, buildings);
    else genGreen(b, rng, trees);
  }
  // street trees along sidewalks (between curb and path), skipping corners and cart spots
  for (const b of blocks) {
    if (b.ring > 1) continue;
    for (let s = 0; s < 4; s++) {
      for (const t of [-12, 12]) {
        if (rng.chance(0.25)) continue;
        const d = HALF - 0.75;
        const p = sidePoint(b, s, t, d);
        trees.push({ x: p.x, z: p.z, s: rng.range(0.75, 1.0) });
      }
    }
  }

  const { nodes, crosswalks } = genPaths(blocks);
  const spots = genSpots(blocks, nodes);
  const doors = genDoors(buildings);
  return { seed, blocks, buildings, nodes, spots, crosswalks, doors, trees, fountain: { x: 0, z: 0, r: 4.2 } };
}

/** Point on side s (0 N, 1 E, 2 S, 3 W) of a block, t along the side (-HALF..HALF), d = inset from block centre. */
function sidePoint(b: Block, s: number, t: number, d: number): { x: number; z: number } {
  switch (s) {
    case 0:
      return { x: b.cx + t, z: b.cz - d };
    case 1:
      return { x: b.cx + d, z: b.cz + t };
    case 2:
      return { x: b.cx + t, z: b.cz + d };
    default:
      return { x: b.cx - d, z: b.cz + t };
  }
}

function genBuildings(b: Block, rng: Rng, out: Building[]): void {
  const n = CITY.lotCells;
  const lot0 = -HALF + CITY.sidewalk;
  const cell = (CITY.block - 2 * CITY.sidewalk) / n;
  // perimeter cells in order, merged into runs along each side
  const used = new Set<string>();
  const key = (x: number, z: number): string => `${x},${z}`;
  const centrality = b.ring === 0 ? 1 : b.ring === 1 ? 0.7 : 0.5;
  const push = (cx0: number, cz0: number, cx1: number, cz1: number): void => {
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) used.add(key(x, z));
    let facing = 0;
    if (cz0 === 0) facing |= N;
    if (cz1 === n - 1) facing |= S;
    if (cx0 === 0) facing |= W;
    if (cx1 === n - 1) facing |= E;
    const floorsMax = b.ring === 0 ? 5 : 6;
    const floors = rng.int(2, floorsMax) + (rng.chance(0.12 * centrality) ? 1 : 0);
    // small setback variation so facades are not one flat wall
    const inset = rng.chance(0.35) ? rng.range(0.2, 0.7) : 0;
    const x0 = b.cx + lot0 + cx0 * cell + (facing & W ? inset : 0.15);
    const x1 = b.cx + lot0 + (cx1 + 1) * cell - (facing & E ? inset : 0.15);
    const z0 = b.cz + lot0 + cz0 * cell + (facing & N ? inset : 0.15);
    const z1 = b.cz + lot0 + (cz1 + 1) * cell - (facing & S ? inset : 0.15);
    out.push({
      x0,
      z0,
      x1,
      z1,
      floors,
      facing,
      shop: rng.chance(0.55 + 0.25 * centrality),
      roof: floors <= 3 && rng.chance(0.4) ? 'gable' : 'flat',
      wall: rng.int(0, 7),
      accent: rng.int(0, 5),
      ring: b.ring,
      seed: rng.int(0, 1e9),
    });
  };
  // corners first (sometimes merged with a neighbour), then fill remaining perimeter cells
  const sides: Array<Array<[number, number]>> = [
    [[0, 0], [1, 0], [2, 0]],
    [[2, 1], [2, 2]],
    [[1, 2], [0, 2]],
    [[0, 1]],
  ];
  for (const side of sides) {
    let k = 0;
    while (k < side.length) {
      const [x, z] = side[k] as [number, number];
      if (used.has(key(x, z))) {
        k++;
        continue;
      }
      const next = side[k + 1];
      if (next && !used.has(key(next[0], next[1])) && rng.chance(0.4)) {
        push(Math.min(x, next[0]), Math.min(z, next[1]), Math.max(x, next[0]), Math.max(z, next[1]));
        k += 2;
      } else {
        push(x, z, x, z);
        k++;
      }
    }
  }
}

function genGreen(b: Block, rng: Rng, trees: CityLayout['trees']): void {
  const inner = HALF - CITY.sidewalk - 1.5;
  if (b.kind === 'plaza') {
    // trees in the four lawn quadrants, away from the cross paths and the fountain
    for (const qx of [-1, 1]) {
      for (const qz of [-1, 1]) {
        const cnt = 3;
        for (let k = 0; k < cnt; k++) {
          const x = b.cx + qx * rng.range(7.5, inner - 1.2);
          const z = b.cz + qz * rng.range(7.5, inner - 1.2);
          trees.push({ x, z, s: rng.range(0.9, 1.25) });
        }
      }
    }
    return;
  }
  const count = 9 + rng.int(0, 5);
  for (let k = 0; k < count; k++) {
    trees.push({ x: b.cx + rng.range(-inner, inner), z: b.cz + rng.range(-inner, inner), s: rng.range(0.85, 1.35) });
  }
}

function genPaths(blocks: Block[]): { nodes: PathNode[]; crosswalks: Crosswalk[] } {
  const nodes: PathNode[] = [];
  const W2 = CITY.walkRadius;
  const d = HALF - CITY.pathInset;
  const cornerId = new Map<string, number>();
  const add = (x: number, z: number, border = false): number => {
    const id = nodes.length;
    nodes.push({ id, x, z, nb: [], border });
    return id;
  };
  const link = (a: number, b: number): void => {
    const na = nodes[a] as PathNode;
    const nb = nodes[b] as PathNode;
    if (!na.nb.includes(b)) na.nb.push(b);
    if (!nb.nb.includes(a)) nb.nb.push(a);
  };
  const walk = blocks.filter((b) => Math.abs(b.i) <= W2 && Math.abs(b.j) <= W2);
  for (const b of walk) {
    // corners: 0 NW, 1 NE, 2 SE, 3 SW
    const c = [add(b.cx - d, b.cz - d), add(b.cx + d, b.cz - d), add(b.cx + d, b.cz + d), add(b.cx - d, b.cz + d)];
    c.forEach((id, k) => cornerId.set(`${b.i},${b.j},${k}`, id));
    if (b.kind === 'plaza') {
      // side midpoints + an inner diamond around the fountain
      const mids = [add(b.cx, b.cz - d), add(b.cx + d, b.cz), add(b.cx, b.cz + d), add(b.cx - d, b.cz)];
      const r = 7;
      const inner = [add(b.cx, b.cz - r), add(b.cx + r, b.cz), add(b.cx, b.cz + r), add(b.cx - r, b.cz)];
      for (let k = 0; k < 4; k++) {
        link(c[k] as number, mids[k] as number);
        link(mids[k] as number, c[(k + 1) % 4] as number);
        link(mids[k] as number, inner[k] as number);
        link(inner[k] as number, inner[(k + 1) % 4] as number);
      }
    } else {
      for (let k = 0; k < 4; k++) link(c[k] as number, c[(k + 1) % 4] as number);
    }
  }
  const crosswalks: Crosswalk[] = [];
  const get = (i: number, j: number, k: number): number | undefined => cornerId.get(`${i},${j},${k}`);
  for (const b of walk) {
    // east neighbour: my NE(1)↔their NW(0), my SE(2)↔their SW(3)
    const e0 = get(b.i + 1, b.j, 0);
    if (e0 !== undefined) {
      link(get(b.i, b.j, 1) as number, e0);
      link(get(b.i, b.j, 2) as number, get(b.i + 1, b.j, 3) as number);
      const x = b.cx + HALF + CITY.road / 2;
      crosswalks.push({ x, z: b.cz - d, ew: true }, { x, z: b.cz + d, ew: true });
    }
    // south neighbour: my SW(3)↔their NW(0), my SE(2)↔their NE(1)
    const s0 = get(b.i, b.j + 1, 0);
    if (s0 !== undefined) {
      link(get(b.i, b.j, 3) as number, s0);
      link(get(b.i, b.j, 2) as number, get(b.i, b.j + 1, 1) as number);
      const z = b.cz + HALF + CITY.road / 2;
      crosswalks.push({ x: b.cx - d, z, ew: false }, { x: b.cx + d, z, ew: false });
    }
  }
  // border: corners on the outside of the walk area
  const lim = W2 * PITCH + d - 0.01;
  for (const n of nodes) if (Math.abs(n.x) >= lim || Math.abs(n.z) >= lim) n.border = true;
  return { nodes, crosswalks };
}

function nearestEdge(nodes: PathNode[], x: number, z: number): [number, number] {
  let best: [number, number] = [0, 0];
  let bd = Infinity;
  for (const a of nodes) {
    for (const bi of a.nb) {
      if (bi < a.id) continue;
      const b = nodes[bi] as PathNode;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const px = a.x + dx * t - x;
      const pz = a.z + dz * t - z;
      const dd = px * px + pz * pz;
      if (dd < bd) {
        bd = dd;
        best = [a.id, b.id];
      }
    }
  }
  return best;
}

function genSpots(blocks: Block[], nodes: PathNode[]): CartSpot[] {
  const spots: CartSpot[] = [];
  const start = blocks.filter((b) => b.ring === 0);
  // facing vectors per side (towards the street, i.e. away from block centre)
  const F = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const;
  const SIDE = ['n', 'e', 's', 'w'];
  for (const b of start) {
    for (let s = 0; s < 4; s++) {
      const f = F[s] as readonly [number, number];
      // sides that face the plaza (or all four for the plaza itself)
      const towardCentre = -(f[0] * Math.sign(b.cx) + f[1] * Math.sign(b.cz)) > 0;
      if (b.kind !== 'plaza' && !towardCentre) continue;
      const along = b.kind === 'plaza' ? 9 : 6;
      const t = (s === 0 || s === 3 ? -1 : 1) * along;
      const p = sidePoint(b, s, t, HALF - CITY.cartInset);
      const sp = sidePoint(b, s, t, HALF - CITY.serveInset);
      const [a, bb] = nearestEdge(nodes, sp.x, sp.z);
      const corner = b.i !== 0 && b.j !== 0;
      spots.push({
        id: `s_${b.i}_${b.j}_${SIDE[s]}`,
        x: p.x,
        z: p.z,
        fx: f[0],
        fz: f[1],
        a,
        b: bb,
        sx: sp.x,
        sz: sp.z,
        traffic: b.kind === 'plaza' ? (s === 2 ? 1 : 0.95) : corner ? 0.72 : 0.84,
        ring: 0,
      });
    }
  }
  // the first cart's spot (plaza south side, facing the camera) goes first
  spots.sort((p, q) => (p.id === 's_0_0_s' ? -1 : q.id === 's_0_0_s' ? 1 : q.traffic - p.traffic));
  return spots;
}

/** One door per street-facing side for shops (centre), one door for other buildings. Renderer and sim share these. */
function genDoors(buildings: Building[]): Door[] {
  const doors: Door[] = [];
  for (const b of buildings) {
    if (b.ring > 1) continue;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const sides: Array<[number, number, number, number, number]> = [
      [N, cx, b.z0, 0, -1],
      [E, b.x1, cz, 1, 0],
      [S, cx, b.z1, 0, 1],
      [W, b.x0, cz, -1, 0],
    ];
    let placed = false;
    for (const [bit, x, z, nx, nz] of sides) {
      if (!(b.facing & bit)) continue;
      if (!b.shop && placed) continue;
      doors.push({ x, z, nx, nz, shop: b.shop });
      placed = true;
    }
  }
  return doors;
}
