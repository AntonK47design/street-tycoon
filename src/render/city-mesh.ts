import { BoxGeometry, CylinderGeometry, Group, IcosahedronGeometry, Matrix4, Mesh, Quaternion, Vector3, type Material } from 'three';
import { CITY, PITCH } from '../data/city';
import { Rng } from '../core/rng';
import { E, N, S, W, type Block, type Building, type CityLayout } from '../sim/city';
import { GeoBuilder, type AoOpts } from './geom';
import { PAL } from './palette';

const HALF = CITY.block / 2;
const TOP = CITY.curb;
const FH = CITY.floorHeight;
const SHOP_H = 3.8;
const WALL_AO: AoOpts = { base: TOP, h: 1.8, min: 0.7 };
const PROP_AO: AoOpts = { base: TOP, h: 0.6, min: 0.75 };

const CYL6 = new CylinderGeometry(1, 1, 1, 6);
const CYL10 = new CylinderGeometry(1, 1, 1, 10);
const CYL20 = new CylinderGeometry(1, 1, 1, 20);
const ICO0 = new IcosahedronGeometry(1, 0);
const ICO1 = new IcosahedronGeometry(1, 1);

const m = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const s3 = new Vector3();
const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);

function place(px: number, py: number, pz: number, sx: number, sy: number, sz: number, rotY = 0, tiltX = 0): Matrix4 {
  q.setFromAxisAngle(Y, rotY);
  if (tiltX) q.multiply(new Quaternion().setFromAxisAngle(X, tiltX));
  return m.compose(v.set(px, py, pz), q, s3.set(sx, sy, sz));
}

/** Facade frame: origin at the wall surface centre, local x along the wall, out along the normal. */
interface Facade {
  cx: number;
  cz: number;
  nx: number;
  nz: number;
  tx: number;
  tz: number;
  len: number;
  rot: number;
}

function facades(b: Building): Facade[] {
  const out: Facade[] = [];
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const mk = (bit: number, x: number, z: number, nx: number, nz: number, len: number): void => {
    if (!(b.facing & bit)) return;
    const rot = Math.atan2(nx, nz);
    out.push({ cx: x, cz: z, nx, nz, tx: Math.cos(rot), tz: -Math.sin(rot), len, rot });
  };
  mk(N, cx, b.z0, 0, -1, w);
  mk(E, b.x1, cz, 1, 0, d);
  mk(S, cx, b.z1, 0, 1, w);
  mk(W, b.x0, cz, -1, 0, d);
  return out;
}

/** Box on a facade: u along the wall, y up, out from the wall (centre of the box depth). */
function fbox(g: GeoBuilder, f: Facade, u: number, y: number, out: number, w: number, h: number, depth: number, hex: number, ao?: AoOpts, tilt = 0): void {
  const x = f.cx + f.tx * u + f.nx * out;
  const z = f.cz + f.tz * u + f.nz * out;
  g.add(UNIT, place(x, y, z, w, h, depth, f.rot, tilt), hex, ao, { skipDown: tilt === 0 });
}

const UNIT = new BoxGeometry(1, 1, 1);

export function buildingHeight(b: Building): number {
  return TOP + (b.shop ? SHOP_H : FH) + (b.floors - 1) * FH;
}

function addBuilding(g: GeoBuilder, b: Building, lod: number): void {
  const rng = new Rng(b.seed);
  const wall = PAL.walls[b.wall % PAL.walls.length] as number;
  const accent = PAL.accents[b.accent % PAL.accents.length] as number;
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const groundH = b.shop ? SHOP_H : FH;
  const top = buildingHeight(b);
  const h = top - TOP;
  // body + plinth
  g.box(cx, TOP + h / 2, cz, w, h, d, wall, lod < 2 ? WALL_AO : undefined);
  if (lod < 2) g.box(cx, TOP + 0.25, cz, w + 0.12, 0.5, d + 0.12, shade(wall, 0.78));
  // roof
  if (b.roof === 'gable') {
    addGable(g, b, top, lod);
  } else {
    g.box(cx, top + 0.15, cz, w + 0.3, 0.3, d + 0.3, lod < 2 ? PAL.parapet : shade(wall, 0.9));
    if (lod < 2) {
      g.box(cx, top + 0.31, cz, w - 0.5, 0.04, d - 0.5, PAL.roof);
      const props = rng.int(1, 3);
      for (let k = 0; k < props; k++) {
        const px = cx + rng.range(-w / 2 + 1.5, w / 2 - 1.5);
        const pz = cz + rng.range(-d / 2 + 1.5, d / 2 - 1.5);
        if (rng.chance(0.3) && lod === 0) {
          // water tank on legs
          g.add(CYL10, place(px, top + 1.6, pz, 0.9, 1.5, 0.9), PAL.wood);
          g.add(CYL6, place(px, top + 2.45, pz, 1.0, 0.25, 1.0), PAL.woodDark);
          for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]] as const) g.box(px + lx, top + 0.6, pz + lz, 0.1, 0.9, 0.1, PAL.metal);
        } else {
          g.box(px, top + 0.65, pz, rng.range(1.0, 1.6), 0.7, rng.range(0.8, 1.2), PAL.metalLight, { base: top + 0.3, h: 0.5, min: 0.7 });
        }
      }
    }
  }
  for (const f of facades(b)) addFacade(g, b, f, lod, wall, accent, groundH, rng);
}

function addGable(g: GeoBuilder, b: Building, top: number, lod: number): void {
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const alongX = w >= d;
  const span = (alongX ? d : w) + 0.5;
  const length = (alongX ? w : d) + 0.5;
  const rise = Math.min(2.4, span * 0.32);
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const half = span / 2;
  const slope = Math.atan2(rise, half);
  const slab = Math.hypot(half, rise);
  const rot = alongX ? 0 : Math.PI / 2;
  // two roof slabs
  for (const sgn of [-1, 1]) {
    const ox = alongX ? 0 : (sgn * half) / 2;
    const oz = alongX ? (sgn * half) / 2 : 0;
    const tilt = sgn * slope;
    const mm = new Matrix4().compose(
      new Vector3(cx + ox, top + rise / 2 + 0.05, cz + oz),
      new Quaternion().setFromAxisAngle(Y, rot).multiply(new Quaternion().setFromAxisAngle(X, tilt)),
      new Vector3(length, 0.14, slab + 0.05),
    );
    g.add(UNIT, mm, PAL.roofTile, undefined);
  }
  if (lod > 1) return;
  // gable end triangles (wall colour)
  const wall = PAL.walls[b.wall % PAL.walls.length] as number;
  for (const sgn of [-1, 1]) {
    const ex = alongX ? cx + (sgn * (length - 0.5)) / 2 : cx;
    const ez = alongX ? cz : cz + (sgn * (length - 0.5)) / 2;
    const a = alongX ? new Vector3(ex, top, cz - half + 0.25) : new Vector3(cx - half + 0.25, top, ez);
    const bb = alongX ? new Vector3(ex, top, cz + half - 0.25) : new Vector3(cx + half - 0.25, top, ez);
    const tip = new Vector3(ex, top + rise - 0.1, ez);
    g.triHex(sgn > 0 === alongX ? a : bb, sgn > 0 === alongX ? bb : a, tip, wall);
    g.triHex(sgn > 0 === alongX ? bb : a, sgn > 0 === alongX ? a : bb, tip, wall);
  }
}

function shade(hex: number, k: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const gg = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (gg << 8) | b;
}

function addFacade(g: GeoBuilder, b: Building, f: Facade, lod: number, wall: number, accent: number, groundH: number, rng: Rng): void {
  const bays = Math.max(1, Math.floor((f.len - 0.8) / 2.6));
  const bayW = (f.len - 0.8) / bays;
  const style = b.seed % 4;
  const startFloor = b.shop ? 1 : 0;
  for (let fl = startFloor; fl < b.floors; fl++) {
    const yBase = TOP + (fl === 0 ? 0 : groundH + (fl - 1) * FH);
    const wy = yBase + (fl === 0 ? 1.75 : FH * 0.55);
    for (let k = 0; k < bays; k++) {
      const u = -f.len / 2 + 0.4 + bayW * (k + 0.5);
      // ground floor of non-shop buildings: the door takes the middle bay
      if (fl === 0 && Math.abs(u) < bayW * 0.5) continue;
      if (lod === 2) continue;
      if (lod === 1) {
        g.wallQuad(f.cx + f.tx * u + f.nx * 0.02, wy, f.cz + f.tz * u + f.nz * 0.02, 1.05, 1.45, f.nx, f.nz, PAL.glass);
        continue;
      }
      const tall = style === 1 ? 1.85 : 1.55;
      fbox(g, f, u, wy, 0.04, 1.25, tall + 0.2, 0.1, PAL.frame);
      fbox(g, f, u, wy + 0.02, 0.07, 1.0, tall - 0.05, 0.08, PAL.glass);
      fbox(g, f, u, wy + 0.02, 0.1, 0.07, tall - 0.05, 0.06, PAL.frame);
      fbox(g, f, u, wy - tall / 2 - 0.12, 0.12, 1.45, 0.1, 0.24, shade(wall, 0.85));
      if (style === 2 && fl % 2 === 1 && fl > 0) {
        // small balcony
        fbox(g, f, u, yBase + 0.2, 0.45, 1.7, 0.12, 0.9, PAL.stone);
        fbox(g, f, u, yBase + 0.75, 0.88, 1.7, 0.05, 0.05, PAL.metal);
        fbox(g, f, u - 0.83, yBase + 0.5, 0.88, 0.05, 0.55, 0.05, PAL.metal);
        fbox(g, f, u + 0.83, yBase + 0.5, 0.88, 0.05, 0.55, 0.05, PAL.metal);
      } else if (rng.chance(0.18)) {
        // flower box
        fbox(g, f, u, wy - tall / 2 - 0.02, 0.24, 1.1, 0.22, 0.22, PAL.woodDark);
        fbox(g, f, u, wy - tall / 2 + 0.12, 0.24, 1.0, 0.14, 0.18, rng.chance(0.5) ? 0xd76a5a : 0x6f9a53);
      }
    }
    if (lod === 2 && fl > 0) {
      g.wallQuad(f.cx + f.nx * 0.02, wy, f.cz + f.nz * 0.02, f.len - 1.2, 1.2, f.nx, f.nz, shade(PAL.glass, 1.15));
    }
    // floor band
    if (lod === 0 && style !== 3 && fl > 0) fbox(g, f, 0, yBase - 0.02, 0.04, f.len + 0.02, 0.14, 0.1, shade(wall, 0.88));
  }
  // ground floor
  if (b.shop) addShopFront(g, f, lod, accent, rng);
  else if (lod < 2) {
    fbox(g, f, 0, TOP + 1.15, 0.05, 1.3, 2.3, 0.12, PAL.frame);
    fbox(g, f, 0, TOP + 1.1, 0.09, 1.05, 2.15, 0.1, PAL.door);
    fbox(g, f, 0, TOP + 0.07, 0.45, 1.8, 0.14, 0.7, PAL.stone);
    if (lod === 0) fbox(g, f, 0, TOP + 2.55, 0.3, 1.7, 0.08, 0.6, shade(accent, 0.9));
  }
}

function addShopFront(g: GeoBuilder, f: Facade, lod: number, accent: number, rng: Rng): void {
  const L = f.len;
  const glassW = L - 1.0;
  if (lod === 2) {
    g.wallQuad(f.cx + f.nx * 0.03, TOP + 1.5, f.cz + f.nz * 0.03, glassW, 2.0, f.nx, f.nz, PAL.glassShop);
    fbox(g, f, 0, TOP + 3.0, 0.5, L - 0.6, 0.12, 1.0, accent);
    return;
  }
  // display window + frame + door
  fbox(g, f, 0, TOP + 0.3, 0.05, L - 0.4, 0.6, 0.12, shade(accent, 0.55));
  fbox(g, f, 0, TOP + 1.65, 0.05, glassW, 2.1, 0.1, PAL.glassShop);
  if (lod === 0) {
    const mullions = Math.max(1, Math.round(glassW / 2.2));
    for (let k = 0; k <= mullions; k++) fbox(g, f, -glassW / 2 + (glassW * k) / mullions, TOP + 1.65, 0.1, 0.1, 2.1, 0.06, PAL.frame);
    fbox(g, f, 0, TOP + 2.74, 0.1, glassW + 0.1, 0.1, 0.06, PAL.frame);
    // shelves/goods silhouettes behind the glass for depth
    for (let k = 0; k < 3; k++) fbox(g, f, -glassW / 3 + (glassW / 3) * k, TOP + 1.2, 0.03, glassW / 4, 0.5, 0.05, shade(PAL.accents[(k + 2) % PAL.accents.length] as number, 0.8));
  }
  fbox(g, f, 0, TOP + 1.15, 0.12, 1.15, 2.2, 0.08, PAL.door);
  fbox(g, f, 0, TOP + 1.25, 0.16, 0.7, 1.4, 0.04, PAL.glassShop);
  // striped awning (tilted)
  const segs = Math.max(4, Math.round((L - 0.6) / 0.6));
  const segW = (L - 0.6) / segs;
  const tilt = -0.38;
  const depth = 1.35;
  const yA = TOP + 3.05;
  for (let k = 0; k < segs; k++) {
    const u = -(L - 0.6) / 2 + segW * (k + 0.5);
    const col = k % 2 === 0 ? accent : PAL.frame;
    if (lod === 1 && k % 2 === 1) continue;
    fbox(g, f, u, yA, depth / 2, lod === 1 ? segW * 2 : segW, 0.06, depth, col, undefined, tilt);
    if (lod === 0) fbox(g, f, u, yA - 0.42, depth - 0.02, segW, 0.26, 0.04, col);
  }
  // sign board
  if (lod === 0) {
    const sw = Math.min(L - 1.2, rng.range(3, 5.5));
    fbox(g, f, 0, TOP + 3.65, 0.08, sw, 0.62, 0.12, shade(accent, 0.7));
    fbox(g, f, 0, TOP + 3.65, 0.15, sw - 0.3, 0.38, 0.04, PAL.frame);
    // abstract glyph blocks instead of text (no real brands)
    const n = rng.int(2, 4);
    for (let k = 0; k < n; k++) fbox(g, f, -sw / 2 + 0.5 + ((sw - 1) * (k + 0.5)) / n, TOP + 3.65, 0.18, ((sw - 1) / n) * 0.7, 0.16, 0.03, shade(accent, 0.6));
  }
}

function addTree(g: GeoBuilder, x: number, z: number, s: number, rng: Rng, lod: number, pit: boolean): void {
  if (pit) g.box(x, TOP + 0.01, z, 1.3, 0.04, 1.3, PAL.dirt);
  const trunkH = 1.7 * s;
  g.add(CYL6, place(x, TOP + trunkH / 2, z, 0.13 * s, trunkH, 0.13 * s), PAL.trunk, PROP_AO);
  const leaf = PAL.leaves[rng.int(0, PAL.leaves.length - (rng.chance(0.12) ? 1 : 2))] as number;
  const blobs = lod === 0 ? 3 : 1;
  for (let k = 0; k < blobs; k++) {
    const r = (k === 0 ? 1.35 : 0.95) * s;
    const ox = k === 0 ? 0 : rng.range(-0.7, 0.7) * s;
    const oz = k === 0 ? 0 : rng.range(-0.7, 0.7) * s;
    const oy = k === 0 ? trunkH + 0.75 * s : trunkH + rng.range(0.9, 1.6) * s;
    g.add(lod === 0 ? ICO1 : ICO0, place(x + ox, TOP + oy, z + oz, r, r * 0.92, r, rng.range(0, 6)), shadeRand(leaf, rng), { base: TOP + trunkH - 0.2, h: 1.8 * s, min: 0.78 });
  }
}

function shadeRand(hex: number, rng: Rng): number {
  return shade(hex, rng.range(0.92, 1.06));
}

function addLamp(g: GeoBuilder, x: number, z: number, rot: number): void {
  g.add(CYL6, place(x, TOP + 0.15, z, 0.16, 0.3, 0.16), PAL.metal);
  g.add(CYL6, place(x, TOP + 2.1, z, 0.06, 4.0, 0.06), PAL.metal);
  const hx = x + Math.sin(rot) * 0.5;
  const hz = z + Math.cos(rot) * 0.5;
  g.box((x + hx) / 2, TOP + 4.05, (z + hz) / 2, 0.08, 0.06, 0.08, PAL.metal);
  g.box(x + Math.sin(rot) * 0.25, TOP + 4.08, z + Math.cos(rot) * 0.25, 0.08, 0.06, 0.6, PAL.metal, undefined, rot);
  g.add(CYL6, place(hx, TOP + 3.95, hz, 0.22, 0.2, 0.22), PAL.metal);
  g.add(CYL6, place(hx, TOP + 3.82, hz, 0.17, 0.08, 0.17), 0xfff1c9);
}

function addBench(g: GeoBuilder, x: number, z: number, rot: number): void {
  g.box(x, TOP + 0.42, z, 1.7, 0.08, 0.5, PAL.wood, undefined, rot);
  const bx = Math.sin(rot) * -0.22;
  const bz = Math.cos(rot) * -0.22;
  g.box(x + bx, TOP + 0.72, z + bz, 1.7, 0.36, 0.06, PAL.wood, undefined, rot);
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  for (const u of [-0.7, 0.7]) g.box(x + cs * u, TOP + 0.2, z - sn * u, 0.08, 0.42, 0.45, PAL.metal, undefined, rot);
}

function addBin(g: GeoBuilder, x: number, z: number): void {
  g.add(CYL10, place(x, TOP + 0.45, z, 0.28, 0.9, 0.28), 0x4f6b5a, PROP_AO);
  g.add(CYL10, place(x, TOP + 0.92, z, 0.31, 0.06, 0.31), PAL.metal);
}

function sideTangent(s: number): [number, number] {
  return s === 0 || s === 2 ? [1, 0] : [0, 1];
}

function blockSide(b: Block, s: number, t: number, d: number): [number, number] {
  switch (s) {
    case 0:
      return [b.cx + t, b.cz - d];
    case 1:
      return [b.cx + d, b.cz + t];
    case 2:
      return [b.cx + t, b.cz + d];
    default:
      return [b.cx - d, b.cz + t];
  }
}

function addBlockGround(g: GeoBuilder, b: Block): void {
  // sidewalk slab and curb stones
  g.box(b.cx, TOP / 2, b.cz, CITY.block, TOP, CITY.block, PAL.sidewalk);
  const cw = 0.32;
  g.box(b.cx, TOP + 0.003, b.cz - HALF + cw / 2, CITY.block, 0.01, cw, PAL.curb);
  g.box(b.cx, TOP + 0.003, b.cz + HALF - cw / 2, CITY.block, 0.01, cw, PAL.curb);
  g.box(b.cx - HALF + cw / 2, TOP + 0.003, b.cz, cw, 0.01, CITY.block - 2 * cw, PAL.curb);
  g.box(b.cx + HALF - cw / 2, TOP + 0.003, b.cz, cw, 0.01, CITY.block - 2 * cw, PAL.curb);
  const inner = HALF - CITY.sidewalk;
  if (b.kind === 'buildings') {
    g.rect(b.cx - inner, b.cz - inner, b.cx + inner, b.cz + inner, TOP + 0.004, PAL.dirt);
    // paving joints across the sidewalk for texture
    if (b.ring === 0) {
      for (let s = 0; s < 4; s++) {
        const [tx, tz] = sideTangent(s);
        for (let t = -HALF + 2; t < HALF - 1; t += 2.5) {
          const [x, z] = blockSide(b, s, t, HALF - CITY.sidewalk / 2);
          g.flatQuad(x, z, tx ? 0.05 : CITY.sidewalk - 0.6, tz ? 0.05 : CITY.sidewalk - 0.6, TOP + 0.006, 0, 0xc6bca9);
        }
      }
    }
  }
}

function addPlaza(g: GeoBuilder, b: Block, layout: CityLayout, rng: Rng): void {
  const inner = HALF - CITY.sidewalk;
  g.rect(b.cx - inner, b.cz - inner, b.cx + inner, b.cz + inner, TOP + 0.005, PAL.paving);
  // pattern ring around the fountain and cross paths
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    g.flatQuad(b.cx + Math.sin(a) * 6.6, b.cz + Math.cos(a) * 6.6, 1.25, 0.5, TOP + 0.008, a, PAL.pavingDark);
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    // lawn with stone border
    const x0 = b.cx + sx * 5.6;
    const x1 = b.cx + sx * (inner - 0.9);
    const z0 = b.cz + sz * 5.6;
    const z1 = b.cz + sz * (inner - 0.9);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    g.box(cx, TOP + 0.1, cz, w + 0.3, 0.2, d + 0.3, PAL.stone);
    g.box(cx, TOP + 0.13, cz, w, 0.2, d, PAL.grass);
    // flower bed in the inner corner
    const fx = b.cx + sx * 7.2;
    const fz = b.cz + sz * 7.2;
    g.add(CYL10, place(fx, TOP + 0.3, fz, 1.2, 0.2, 1.2), PAL.grassDark);
    for (let k = 0; k < 7; k++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0.2, 0.95);
      g.add(ICO0, place(fx + Math.cos(a) * r, TOP + 0.45, fz + Math.sin(a) * r, 0.17, 0.15, 0.17), rng.pick([0xe57a63, 0xf2c14e, 0xf1efe6, 0xc77fb8]));
    }
    // benches facing the cross paths
    addBench(g, b.cx + sx * 3.9, b.cz + sz * 12, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  // fountain
  const f = layout.fountain;
  g.add(CYL20, place(f.x, TOP + 0.35, f.z, f.r, 0.7, f.r), PAL.stone, { base: TOP, h: 0.7, min: 0.8 });
  g.add(CYL20, place(f.x, TOP + 0.72, f.z, f.r + 0.15, 0.08, f.r + 0.15), shade(PAL.stone, 1.06));
  g.add(CYL20, place(f.x, TOP + 0.62, f.z, f.r - 0.35, 0.05, f.r - 0.35), PAL.water);
  g.add(CYL10, place(f.x, TOP + 1.2, f.z, 0.45, 1.4, 0.45), PAL.stone);
  g.add(CYL20, place(f.x, TOP + 1.95, f.z, 1.5, 0.3, 1.5), PAL.stone);
  g.add(CYL20, place(f.x, TOP + 2.08, f.z, 1.3, 0.03, 1.3), PAL.water);
  g.add(CYL10, place(f.x, TOP + 2.5, f.z, 0.22, 0.9, 0.22), PAL.stone);
  g.add(ICO1, place(f.x, TOP + 3.0, f.z, 0.36, 0.36, 0.36), PAL.stone);
}

function addPark(g: GeoBuilder, b: Block): void {
  const inner = HALF - CITY.sidewalk;
  g.box(b.cx, TOP + 0.06, b.cz, inner * 2, 0.12, inner * 2, PAL.grass);
  g.box(b.cx, TOP + 0.13, b.cz, 2.6, 0.04, inner * 2, PAL.paving);
  g.box(b.cx, TOP + 0.13, b.cz, inner * 2, 0.04, 2.6, PAL.paving);
}

function addStreetProps(g: GeoBuilder, b: Block, rng: Rng, layout: CityLayout): void {
  const spots = layout.spots;
  for (let s = 0; s < 4; s++) {
    for (const t of [-5, 5, 15, -15]) {
      if (Math.abs(t) > 14 && rng.chance(0.5)) continue;
      const [x, z] = blockSide(b, s, t, HALF - 0.55);
      // keep cart spots clear
      if (spots.some((p) => Math.hypot(p.sx - x, p.sz - z) < 4.5)) continue;
      if (Math.abs(t) === 5) {
        const [ox, oz] = blockSide({ ...b, cx: 0, cz: 0 }, s, 0, 1);
        addLamp(g, x, z, Math.atan2(ox, oz) + Math.PI);
      } else if (rng.chance(0.6)) {
        addBin(g, x, z);
      }
    }
  }
}

export interface CityMeshes {
  group: Group;
  chunks: Mesh[];
  triangles: number;
}

/** Builds the static city: one mesh per block (frustum culled), plus roads and markings. */
export function buildCity(layout: CityLayout, material: Material): CityMeshes {
  const group = new Group();
  group.name = 'city';
  const chunks: Mesh[] = [];
  let triangles = 0;
  const rng = new Rng(layout.seed ^ 0xabcdef);
  const R = CITY.renderRadius;

  const roads = new GeoBuilder();
  const ext = (R + 0.5) * PITCH + 120;
  roads.rect(-ext, -ext, ext, ext, 0, PAL.asphalt);
  // centre dashes (skip intersections)
  for (let i = -R - 1; i <= R; i++) {
    const c = (i + 0.5) * PITCH;
    for (let t = -(R + 0.5) * PITCH; t < (R + 0.5) * PITCH; t += 4.5) {
      const rel = ((t % PITCH) + PITCH) % PITCH; // 0..PITCH, block centre at 0
      if (rel > HALF - 1 && rel < HALF + CITY.road + 1) continue;
      roads.flatQuad(c, t + 1.1, 0.16, 2.2, 0.01, 0, PAL.marking);
      roads.flatQuad(t + 1.1, c, 2.2, 0.16, 0.01, 0, PAL.marking);
    }
  }
  for (const cw of layout.crosswalks) {
    for (let k = -4; k <= 4; k++) {
      if (cw.ew) roads.flatQuad(cw.x + k * 0.95, cw.z, 0.5, 2.6, 0.012, 0, PAL.marking);
      else roads.flatQuad(cw.x, cw.z + k * 0.95, 2.6, 0.5, 0.012, 0, PAL.marking);
    }
  }
  const roadMesh = new Mesh(roads.build(), material);
  roadMesh.receiveShadow = true;
  roadMesh.name = 'roads';
  group.add(roadMesh);
  triangles += roads.triangles;

  for (const b of layout.blocks) {
    const g = new GeoBuilder();
    const lod = b.ring === 0 ? 0 : b.ring === 1 ? 1 : 2;
    addBlockGround(g, b);
    if (b.kind === 'plaza') addPlaza(g, b, layout, rng);
    else if (b.kind === 'park') addPark(g, b);
    if (b.ring <= 1) addStreetProps(g, b, rng, layout);
    for (const bd of layout.buildings) {
      const cx = (bd.x0 + bd.x1) / 2;
      const cz = (bd.z0 + bd.z1) / 2;
      if (Math.abs(cx - b.cx) < HALF && Math.abs(cz - b.cz) < HALF) addBuilding(g, bd, lod);
    }
    for (const t of layout.trees) {
      if (Math.abs(t.x - b.cx) <= HALF && Math.abs(t.z - b.cz) <= HALF) {
        const onSidewalk = Math.abs(t.x - b.cx) > HALF - CITY.sidewalk || Math.abs(t.z - b.cz) > HALF - CITY.sidewalk;
        addTree(g, t.x, t.z, t.s, rng, lod, onSidewalk);
      }
    }
    const mesh = new Mesh(g.build(), material);
    mesh.castShadow = b.ring <= 1;
    mesh.receiveShadow = true;
    mesh.name = `block_${b.i}_${b.j}`;
    mesh.userData.ring = b.ring;
    chunks.push(mesh);
    group.add(mesh);
    triangles += g.triangles;
  }
  return { group, chunks, triangles };
}
