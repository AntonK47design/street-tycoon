import { BoxGeometry, CylinderGeometry, Group, IcosahedronGeometry, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3, type BufferGeometry, type Material } from 'three';
import { CITY } from '../data/city';
import { FURNITURE, SHOP_COLORS, productById } from '../data/shops';
import type { Building } from '../sim/city';
import { footprint, type Grid, type Placed } from '../sim/shop-layout';
import type { PropertyState } from '../sim/state';
import { addBuilding } from './city-mesh';
import { GeoBuilder } from './geom';
import { PAL } from './palette';

const TOP = CITY.curb;
const BOX = new BoxGeometry(1, 1, 1);
const CYL = new CylinderGeometry(1, 1, 1, 10);
const ICO = new IcosahedronGeometry(1, 1);
const Y = new Vector3(0, 1, 0);
const WALL_H = 1.15;

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpV = new Vector3();
const tmpS = new Vector3();

/** Local-space helper: primitives relative to a furniture piece's centre and rotation. */
class Local {
  private readonly base = new Matrix4();
  private readonly out = new Matrix4();

  constructor(private readonly g: GeoBuilder) {}

  set(x: number, z: number, rot: number): void {
    this.base.compose(tmpV.set(x, TOP, z), tmpQ.setFromAxisAngle(Y, rot), tmpS.set(1, 1, 1));
  }

  add(geo: BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number): void {
    tmpM.compose(tmpV.set(x, y, z), tmpQ.identity(), tmpS.set(sx, sy, sz));
    this.out.multiplyMatrices(this.base, tmpM);
    this.g.add(geo, this.out, hex, { base: TOP, h: 0.6, min: 0.8 }, { skipDown: true });
  }
}

function shade(hex: number, k: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/** Adds one furniture piece (stock fraction drives how full the shelves look). */
export function addFurniture(g: GeoBuilder, grid: Grid, it: Placed): void {
  const fp = footprint(it);
  const cx = grid.x0 + (it.i + fp.w / 2) * grid.cw;
  const cz = grid.z0 + (it.j + fp.d / 2) * grid.ch;
  const rot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][it.rot] as number;
  const L = new Local(g);
  L.set(cx, cz, rot);
  const f = FURNITURE[it.type];
  const prod = it.product ? productById(it.product) : undefined;
  const fill = f.capacity ? Math.max(0, Math.min(1, (it.stock ?? 0) / f.capacity)) : 0;
  const pc = prod?.color ?? 0xcccccc;
  const W = f.w * 0.98;
  const D = f.d * 0.98;
  switch (it.type) {
    case 'shelf': {
      L.add(BOX, 0, 0.95, -D / 2 + 0.06, W, 1.9, 0.1, PAL.woodDark);
      for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) L.add(BOX, x, 0.95, 0, 0.06, 1.9, D * 0.8, PAL.wood);
      for (let k = 0; k < 4; k++) {
        const y = 0.12 + k * 0.5;
        L.add(BOX, 0, y, 0, W - 0.1, 0.05, D * 0.78, PAL.wood);
        // products: rows that empty from the right
        const n = Math.round(fill * 6);
        for (let m = 0; m < n; m++) L.add(BOX, -W / 2 + 0.22 + m * ((W - 0.3) / 6), y + 0.16, 0.02, 0.22, 0.26, D * 0.5, shade(pc, 0.9 + (m % 2) * 0.12));
      }
      break;
    }
    case 'fridge': {
      L.add(BOX, 0, 0.98, -0.02, W * 0.94, 1.96, D * 0.9, 0xeef1f3);
      L.add(BOX, 0, 1.05, D * 0.44, W * 0.8, 1.6, 0.03, 0x9fc3d6);
      for (let k = 0; k < 4; k++) {
        const n = Math.round(fill * 3);
        for (let m = 0; m < n; m++) L.add(BOX, -0.24 + m * 0.24, 0.45 + k * 0.38, D * 0.36, 0.16, 0.24, 0.1, shade(pc, 0.92 + (m % 2) * 0.1));
      }
      L.add(BOX, W * 0.38, 1.1, D * 0.47, 0.04, 0.5, 0.04, PAL.metalLight);
      break;
    }
    case 'display': {
      L.add(BOX, 0, 0.42, 0, W * 0.9, 0.08, D * 0.9, PAL.wood);
      L.add(BOX, 0, 0.2, 0, W * 0.8, 0.4, D * 0.8, PAL.woodDark);
      const n = Math.round(fill * 8);
      for (let m = 0; m < n; m++) {
        const x = -0.55 + (m % 4) * 0.37;
        const z = -0.4 + Math.floor(m / 4) * 0.8;
        L.add(CYL, x, 0.62, z, 0.13, 0.32, 0.13, shade(pc, 0.9 + (m % 3) * 0.08));
        L.add(ICO, x, 0.86, z, 0.16, 0.14, 0.16, shade(pc, 1.1));
      }
      break;
    }
    case 'checkout': {
      L.add(BOX, 0, 0.5, -0.1, W * 0.95, 1.0, D * 0.6, 0xd9cdb6);
      L.add(BOX, 0, 1.02, -0.1, W, 0.06, D * 0.7, PAL.woodDark);
      L.add(BOX, -W * 0.25, 1.06, -0.05, W * 0.4, 0.02, D * 0.4, 0x3a3c41);
      L.add(BOX, W * 0.25, 1.2, -0.12, 0.34, 0.26, 0.3, 0x3a3c41);
      L.add(BOX, W * 0.25, 1.42, -0.18, 0.3, 0.2, 0.04, 0x8fd0c8);
      break;
    }
    case 'plant': {
      L.add(CYL, 0, 0.22, 0, 0.24, 0.44, 0.24, 0x9a5c3f);
      L.add(ICO, 0, 0.75, 0, 0.36, 0.45, 0.36, 0x6f9a53);
      L.add(ICO, 0.1, 1.05, -0.05, 0.24, 0.3, 0.24, 0x86a95d);
      break;
    }
    case 'lamp': {
      L.add(CYL, 0, 0.03, 0, 0.2, 0.06, 0.2, PAL.metal);
      L.add(CYL, 0, 0.8, 0, 0.03, 1.6, 0.03, PAL.metal);
      L.add(CYL, 0, 1.62, 0, 0.22, 0.26, 0.22, 0xfff1c9);
      break;
    }
    case 'rug':
      L.add(BOX, 0, 0.012, 0, W * 0.94, 0.02, D * 0.94, 0xc9643b);
      L.add(BOX, 0, 0.016, 0, W * 0.74, 0.02, D * 0.74, 0xe0a83a);
      break;
    case 'bench':
      L.add(BOX, 0, 0.42, 0.05, W * 0.9, 0.08, D * 0.5, PAL.wood);
      L.add(BOX, 0, 0.7, -0.2, W * 0.9, 0.36, 0.06, PAL.wood);
      for (const x of [-W * 0.38, W * 0.38]) L.add(BOX, x, 0.2, 0.05, 0.06, 0.4, D * 0.45, PAL.metal);
      break;
  }
}

/** One rentable building: exterior shell, and a cut-away interior with furniture for the room editor. */
export class PropertyView {
  readonly group = new Group();
  private shell: Mesh;
  private readonly interior: Mesh;
  private readonly furniture: Mesh;
  private readonly gridLines: Mesh;
  private readonly ghost: Mesh;
  private readonly ghostMat = new MeshBasicMaterial({ color: 0x9be37a, transparent: true, opacity: 0.45, depthWrite: false });
  private shellKey = '';
  private furnKey = '';
  cutaway = false;

  constructor(
    readonly id: number,
    readonly building: Building,
    readonly grid: Grid,
    private readonly material: Material,
  ) {
    this.group.name = `property_${id}`;
    this.shell = new Mesh(new GeoBuilder().build(), material);
    this.shell.castShadow = true;
    this.shell.receiveShadow = true;
    this.interior = new Mesh(this.buildInterior(), material);
    this.interior.receiveShadow = true;
    this.furniture = new Mesh(new GeoBuilder().build(), material);
    this.furniture.castShadow = true;
    this.furniture.receiveShadow = true;
    this.gridLines = new Mesh(this.buildGridLines(), new MeshBasicMaterial({ color: 0x6b5646, transparent: true, opacity: 0.3, depthWrite: false }));
    this.ghost = new Mesh(new BoxGeometry(1, 1, 1), this.ghostMat);
    this.ghost.visible = false;
    this.gridLines.visible = false;
    this.group.add(this.shell, this.interior, this.furniture, this.gridLines, this.ghost);
    this.setCutaway(false);
  }

  private buildInterior(): BufferGeometry {
    const g = new GeoBuilder();
    const b = this.building;
    const gr = this.grid;
    // checker tiles
    for (let j = 0; j < gr.rows; j++)
      for (let i = 0; i < gr.cols; i++) g.rect(gr.x0 + i * gr.cw, gr.z0 + j * gr.ch, gr.x0 + (i + 1) * gr.cw, gr.z0 + (j + 1) * gr.ch, TOP + 0.02, (i + j) % 2 ? 0xe9dfcc : 0xddd0b8);
    // low cut-away walls with a gap at the door
    const wall = PAL.walls[b.wall % PAL.walls.length] as number;
    const t = 0.3;
    const dx = gr.door.x;
    const dz = gr.door.z;
    const seg = (ax: number, az: number, bx: number, bz: number): void => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.05) return;
      g.box((ax + bx) / 2, TOP + WALL_H / 2, (az + bz) / 2, Math.abs(bx - ax) + t, WALL_H, Math.abs(bz - az) + t, wall, { base: TOP, h: 0.8, min: 0.8 });
      g.box((ax + bx) / 2, TOP + WALL_H + 0.04, (az + bz) / 2, Math.abs(bx - ax) + t + 0.04, 0.08, Math.abs(bz - az) + t + 0.04, shade(wall, 0.8));
    };
    const half = 0.75;
    const wallLine = (ax: number, az: number, bx: number, bz: number, horizontal: boolean): void => {
      const onDoor = horizontal ? Math.abs(az - dz) < 0.5 : Math.abs(ax - dx) < 0.5;
      if (!onDoor) return seg(ax, az, bx, bz);
      if (horizontal) {
        seg(ax, az, dx - half, bz);
        seg(dx + half, az, bx, bz);
      } else {
        seg(ax, az, bx, dz - half);
        seg(ax, dz + half, bx, bz);
      }
    };
    wallLine(b.x0 + t / 2, b.z0 + t / 2, b.x1 - t / 2, b.z0 + t / 2, true);
    wallLine(b.x0 + t / 2, b.z1 - t / 2, b.x1 - t / 2, b.z1 - t / 2, true);
    wallLine(b.x0 + t / 2, b.z0 + t / 2, b.x0 + t / 2, b.z1 - t / 2, false);
    wallLine(b.x1 - t / 2, b.z0 + t / 2, b.x1 - t / 2, b.z1 - t / 2, false);
    return g.build();
  }

  private buildGridLines(): BufferGeometry {
    const g = new GeoBuilder();
    const gr = this.grid;
    for (let i = 0; i <= gr.cols; i++) g.flatQuad(gr.x0 + i * gr.cw, gr.z0 + (gr.rows * gr.ch) / 2, 0.03, gr.rows * gr.ch, TOP + 0.035, 0, 0xffffff);
    for (let j = 0; j <= gr.rows; j++) g.flatQuad(gr.x0 + (gr.cols * gr.cw) / 2, gr.z0 + j * gr.ch, gr.cols * gr.cw, 0.03, TOP + 0.035, 0, 0xffffff);
    // entrance marker
    const ei = gr.entry % gr.cols;
    const ej = Math.floor(gr.entry / gr.cols);
    g.flatQuad(gr.x0 + (ei + 0.5) * gr.cw, gr.z0 + (ej + 0.5) * gr.ch, gr.cw * 0.8, gr.ch * 0.8, TOP + 0.03, 0, 0x9be37a);
    return g.build();
  }

  /** Rebuilds the exterior when ownership / shop kind changes. */
  updateShell(p: PropertyState | undefined): void {
    const key = p ? `${p.status}|${p.shop?.kind ?? ''}` : 'free';
    if (key === this.shellKey) return;
    this.shellKey = key;
    const g = new GeoBuilder();
    addBuilding(g, this.building, 0);
    const gr = this.grid;
    const d = gr.door;
    const tx = -d.nz;
    const tz = d.nx;
    const rot = Math.atan2(d.nx, d.nz);
    if (!p) {
      // "for rent" board on a stand in front of the door
      const sx = d.x + d.nx * 1.6 + tx * 1.6;
      const sz = d.z + d.nz * 1.6 + tz * 1.6;
      g.box(sx, TOP + 0.6, sz, 0.08, 1.2, 0.08, PAL.metal);
      g.box(sx, TOP + 1.3, sz, 1.2, 0.7, 0.08, 0xf5efe4, undefined, rot);
      g.box(sx + d.nx * 0.05, TOP + 1.3, sz + d.nz * 0.05, 1.0, 0.18, 0.06, 0xd9573f, undefined, rot);
    } else if (p.shop) {
      // shop banner in the kind's colour above the door
      const col = SHOP_COLORS[p.shop.kind];
      g.box(d.x + d.nx * 0.12, TOP + 3.65, d.z + d.nz * 0.12, 3.4, 0.75, 0.16, col, undefined, rot);
      g.box(d.x + d.nx * 0.22, TOP + 3.65, d.z + d.nz * 0.22, 2.2, 0.32, 0.06, 0xfff8ea, undefined, rot);
    }
    this.shell.geometry.dispose();
    this.shell.geometry = g.build();
  }

  /** Rebuilds furniture when the layout or stock changed (key from the sim's version counters). */
  updateFurniture(items: readonly Placed[], key: string): void {
    if (key === this.furnKey) return;
    this.furnKey = key;
    const g = new GeoBuilder();
    for (const it of items) addFurniture(g, this.grid, it);
    this.furniture.geometry.dispose();
    this.furniture.geometry = g.build();
  }

  setCutaway(on: boolean, editing = false): void {
    this.cutaway = on;
    this.shell.visible = !on;
    this.interior.visible = on;
    this.furniture.visible = on;
    this.gridLines.visible = on && editing;
    if (!on) this.ghost.visible = false;
  }

  /** Placement preview (green = fits, red = blocked). */
  showGhost(it: Placed | null, ok: boolean): void {
    if (!it) {
      this.ghost.visible = false;
      return;
    }
    const fp = footprint(it);
    const gr = this.grid;
    this.ghost.visible = true;
    this.ghost.scale.set(fp.w * gr.cw * 0.96, 1.2, fp.d * gr.ch * 0.96);
    this.ghost.position.set(gr.x0 + (it.i + fp.w / 2) * gr.cw, TOP + 0.6, gr.z0 + (it.j + fp.d / 2) * gr.ch);
    this.ghostMat.color.set(ok ? 0x9be37a : 0xe8574a);
  }

  dispose(): void {
    this.shell.geometry.dispose();
    this.furniture.geometry.dispose();
    void this.material;
  }
}
