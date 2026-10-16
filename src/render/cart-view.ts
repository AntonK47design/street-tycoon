import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { CITY } from '../data/city';
import { KITCHENS } from '../data/kitchens';
import type { CartSpot } from '../sim/city';
import type { CartState } from '../sim/state';
import { GeoBuilder } from './geom';
import { PAL } from './palette';

const TOP = CITY.curb;
const BOX = new BoxGeometry(1, 1, 1);
const CYL = new CylinderGeometry(1, 1, 1, 12);
const CYL6 = new CylinderGeometry(1, 1, 1, 6);
const ICO = new IcosahedronGeometry(1, 0);
const SAUSAGE = new CylinderGeometry(0.045, 0.045, 0.32, 6);
SAUSAGE.rotateZ(Math.PI / 2);

const m = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const s = new Vector3();
const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);

function at(x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, rz = 0): Matrix4 {
  q.setFromAxisAngle(X, rx);
  if (rz) q.multiply(new Quaternion().setFromAxisAngle(Z, rz));
  return m.compose(v.set(x, y, z), q, s.set(sx, sy, sz));
}

const sausageMat = new MeshLambertMaterial({ color: 0xb4513a });
const PATTY = new CylinderGeometry(0.075, 0.075, 0.035, 10);
const pattyMat = new MeshLambertMaterial({ color: 0x6b3d24 });
const CREPE = new CylinderGeometry(0.11, 0.11, 0.015, 14);
const crepeMat = new MeshLambertMaterial({ color: 0xf1d29a });
const glowMat = new MeshBasicMaterial({ color: 0xffd98a });
const neonMat = new MeshBasicMaterial({ color: 0xff8a5c });
const litterGeo = new BoxGeometry(0.22, 0.02, 0.16);
const litterMat = new MeshLambertMaterial({ color: 0xf1ece0 });

/** Builds the static cart body for the given upgrade levels (local space, customers on +z). */
function buildBody(c: CartState): BufferGeometry {
  const k = KITCHENS[c.kitchen];
  const g = new GeoBuilder();
  const up = c.up;
  const ao = { base: 0, h: 0.5, min: 0.75 };
  const grillW = 0.8 + Math.min(0.5, up.grill * 0.06);
  // body
  g.add(BOX, at(0, 0.72, 0, 2.3, 0.78, 1.15), k.body, ao);
  g.add(BOX, at(0, 0.62, 0.585, 2.32, 0.16, 0.02), k.trim);
  g.add(BOX, at(0, 0.88, 0.585, 2.32, 0.05, 0.02), k.trim);
  g.add(BOX, at(0, 0.36, 0, 2.2, 0.06, 1.05), PAL.metal);
  g.add(BOX, at(0, 1.14, 0, 2.5, 0.07, 1.32), PAL.frame);
  // wheels
  for (const x of [-0.75, 0.75]) {
    for (const z of [-0.6, 0.6]) {
      g.add(CYL, at(x, 0.3, z, 0.3, 0.12, 0.3, Math.PI / 2), 0x2f3136);
      g.add(CYL, at(x, 0.3, z + Math.sign(z) * 0.065, 0.14, 0.02, 0.14, Math.PI / 2), PAL.metalLight);
    }
  }
  // handle
  g.add(BOX, at(1.32, 0.95, 0, 0.05, 0.05, 0.9), PAL.metal);
  g.add(BOX, at(1.22, 0.95, -0.42, 0.22, 0.05, 0.05), PAL.metal);
  g.add(BOX, at(1.22, 0.95, 0.42, 0.22, 0.05, 0.05), PAL.metal);
  // grill
  g.add(BOX, at(-0.45, 1.24, -0.05, grillW, 0.13, 0.62), 0x3a3c41);
  for (let i = 0; i < 6; i++) g.add(BOX, at(-0.45, 1.31, -0.3 + i * 0.1, grillW - 0.08, 0.015, 0.02), 0x6b6f76);
  // buns + condiments
  g.add(BOX, at(0.45, 1.24, -0.12, 0.5, 0.14, 0.36), 0x8f6a4a);
  g.add(BOX, at(0.45, 1.33, -0.12, 0.46, 0.05, 0.32), 0xe2b071);
  g.add(CYL6, at(0.85, 1.32, 0.15, 0.06, 0.28, 0.06), 0xd8402f);
  g.add(CYL6, at(0.97, 1.32, 0.15, 0.06, 0.28, 0.06), 0xe8c23a);
  g.add(CYL6, at(0.85, 1.48, 0.15, 0.025, 0.06, 0.025), 0xf3efe6);
  g.add(CYL6, at(0.97, 1.48, 0.15, 0.025, 0.06, 0.025), 0xf3efe6);
  // canopy poles + striped roof
  for (const x of [-1.15, 1.15]) g.add(CYL6, at(x, 1.75, -0.55, 0.035, 1.25, 0.035), PAL.metal);
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    const x = -1.35 + (2.7 / stripes) * (i + 0.5);
    const color = i % 2 === 0 ? k.body : k.trim;
    g.add(BOX, at(x, 2.42, -0.05, 2.7 / stripes, 0.06, 1.55, -0.12), color);
    g.add(BOX, at(x, 2.3, 0.72, 2.7 / stripes, 0.2, 0.03), color);
  }
  // sign board with a hot-dog glyph (geometry, no text)
  const signScale = 1 + Math.min(0.6, up.sign * 0.07);
  const sy = 2.85 + up.sign * 0.02;
  g.add(BOX, at(0, sy, -0.15, 1.5 * signScale, 0.52 * signScale, 0.08), k.trim);
  g.add(BOX, at(0, sy, -0.1, 1.38 * signScale, 0.4 * signScale, 0.04), k.body);
  const ss = signScale;
  if (c.kitchen === 'burger') {
    g.add(BOX, at(0, sy - 0.1 * ss, -0.07, 0.62 * ss, 0.08 * ss, 0.05), 0xd9a25c);
    g.add(BOX, at(0, sy - 0.03 * ss, -0.06, 0.66 * ss, 0.07 * ss, 0.05), 0x6b3d24);
    g.add(BOX, at(0, sy + 0.02 * ss, -0.05, 0.7 * ss, 0.035 * ss, 0.05), 0xf2c14e);
    g.add(BOX, at(0, sy + 0.05 * ss, -0.05, 0.68 * ss, 0.03 * ss, 0.05), 0x7fb24a);
    g.add(BOX, at(0, sy + 0.11 * ss, -0.07, 0.62 * ss, 0.1 * ss, 0.05), 0xe2a85e);
  } else if (c.kitchen === 'crepe') {
    g.add(CYL, at(0, sy, -0.06, 0.2 * ss, 0.05, 0.2 * ss, Math.PI / 2), 0xf1d29a);
    g.add(BOX, at(0.02 * ss, sy + 0.02 * ss, -0.03, 0.26 * ss, 0.05 * ss, 0.03), 0x6b3d24);
    g.add(BOX, at(-0.1 * ss, sy - 0.07 * ss, -0.03, 0.12 * ss, 0.04 * ss, 0.03), 0xd9573f);
  } else {
    g.add(BOX, at(0, sy - 0.04 * ss, -0.07, 0.8 * ss, 0.12 * ss, 0.05), 0xe2b071);
    g.add(CYL6, at(0, sy + 0.04 * ss, -0.06, 0.06 * ss, 0.9 * ss, 0.06 * ss, 0, Math.PI / 2), 0xc4553b);
    g.add(BOX, at(0, sy + 0.1 * ss, -0.04, 0.6 * ss, 0.025, 0.02), 0xf0c93a);
  }
  for (const x of [-0.5, 0.5]) g.add(BOX, at(x * signScale, 2.62, -0.15, 0.04, 0.3, 0.04), PAL.metal);
  // recipe: chalk menu board (A-frame) in front
  if (up.recipe > 0) {
    g.add(BOX, at(-1.55, 0.55, 0.85, 0.6, 0.85, 0.05, -0.18), PAL.woodDark);
    g.add(BOX, at(-1.55, 0.58, 0.88, 0.5, 0.65, 0.02, -0.18), 0x2f3a33);
    for (let i = 0; i < Math.min(4, 1 + Math.floor(up.recipe / 2)); i++) g.add(BOX, at(-1.55, 0.78 - i * 0.13, 0.9 - i * 0.02, 0.36, 0.03, 0.01, -0.18), 0xe9e4d6);
  }
  // comfort: stools, then a parasol table
  if (up.comfort > 0) {
    const stools = Math.min(3, up.comfort);
    for (let i = 0; i < stools; i++) {
      const x = -0.8 + i * 0.8;
      g.add(CYL, at(x, 0.36, 1.2, 0.04, 0.72, 0.04), PAL.metal);
      g.add(CYL, at(x, 0.74, 1.2, 0.2, 0.06, 0.2), k.trim);
    }
  }
  if (up.comfort >= 4) {
    g.add(CYL, at(2.35, 0.37, 0.9, 0.42, 0.04, 0.42), PAL.frame);
    g.add(CYL6, at(2.35, 0.19, 0.9, 0.04, 0.38, 0.04), PAL.metal);
    g.add(CYL6, at(2.35, 1.2, 0.9, 0.025, 1.6, 0.025), PAL.metal);
    g.add(CYL6, at(2.35, 2.02, 0.9, 1.0, 0.28, 1.0), k.body);
    g.add(BOX, at(2.35, 0.4, 1.55, 0.35, 0.04, 0.35), k.trim);
    g.add(BOX, at(2.35, 0.2, 1.55, 0.05, 0.4, 0.05), PAL.metal);
  }
  if (up.comfort >= 6) {
    for (const x of [-1.9, 1.9]) {
      g.add(BOX, at(x, 0.25, 1.75, 0.45, 0.5, 0.45), 0x9a5c3f);
      g.add(ICO, at(x, 0.72, 1.75, 0.36, 0.42, 0.36), 0x6f9a53);
    }
  }
  // pantry: cooler box(es)
  if (up.pantry > 0) {
    g.add(BOX, at(1.75, 0.27, -0.35, 0.6, 0.5, 0.45), 0x3f7fb0, ao);
    g.add(BOX, at(1.75, 0.55, -0.35, 0.64, 0.08, 0.49), PAL.frame);
  }
  if (up.pantry >= 4) {
    g.add(BOX, at(1.75, 0.2, 0.25, 0.55, 0.38, 0.45), PAL.wood, ao);
    g.add(BOX, at(1.75, 0.41, 0.25, 0.52, 0.04, 0.42), 0xe2b071);
  }
  const geo = g.build();
  return geo;
}

/** One cart in the world: body (rebuilt on upgrade), sausages, glow, litter, selection ring. */
export class CartView {
  readonly group = new Group();
  private body: Mesh;
  private readonly sausages: Mesh[] = [];
  private readonly lights: Mesh[] = [];
  private readonly litter: Mesh[] = [];
  private readonly neon: Mesh;
  private readonly ring: Mesh;
  private bounce = 0;
  private pop = 0;
  private builtKey = '';
  /** Vendor stands here (world coords). */
  readonly vendor = { x: 0, z: 0, heading: 0 };

  constructor(
    readonly spot: CartSpot,
    material: Material,
    c: CartState,
  ) {
    const rot = Math.atan2(spot.fx, spot.fz);
    this.group.position.set(spot.x, TOP, spot.z);
    this.group.rotation.y = rot;
    this.group.name = 'cart';
    this.body = new Mesh(new GeoBuilder().build(), material);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.group.add(this.body);
    for (let i = 0; i < 12; i++) {
      const sm = c.kitchen === 'burger' ? new Mesh(PATTY, pattyMat) : c.kitchen === 'crepe' ? new Mesh(CREPE, crepeMat) : new Mesh(SAUSAGE, sausageMat);
      sm.visible = false;
      sm.castShadow = false;
      this.group.add(sm);
      this.sausages.push(sm);
    }
    // string lights (comfort ≥ 3)
    const bulb = new IcosahedronGeometry(0.05, 0);
    for (let i = 0; i < 9; i++) {
      const b = new Mesh(bulb, glowMat);
      const t = i / 8;
      b.position.set(-1.15 + t * 2.3, 2.2 - Math.sin(t * Math.PI) * 0.18, 0.72);
      b.visible = false;
      this.group.add(b);
      this.lights.push(b);
    }
    this.neon = new Mesh(new BoxGeometry(1, 1, 1), neonMat);
    this.neon.visible = false;
    this.group.add(this.neon);
    // litter around the cart (pre-placed, shown by dirtiness)
    let seed = c.id * 9301 + 49297;
    const rnd = (): number => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 10; i++) {
      const lm = new Mesh(litterGeo, litterMat);
      const a = rnd() * Math.PI - Math.PI * 0.1;
      const r = 1.3 + rnd() * 1.3;
      lm.position.set(Math.cos(a) * r * 1.2, 0.012, Math.sin(a) * r * 0.9 + 0.2);
      lm.rotation.y = rnd() * 6;
      lm.visible = false;
      lm.receiveShadow = true;
      this.group.add(lm);
      this.litter.push(lm);
    }
    this.ring = new Mesh(new RingGeometry(2.0, 2.25, 40), new MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(0, 0.03, 0.2);
    this.ring.visible = false;
    this.group.add(this.ring);
    this.vendor.x = spot.x - spot.fx * 0.95;
    this.vendor.z = spot.z - spot.fz * 0.95;
    this.vendor.heading = rot;
    this.rebuild(c);
  }

  rebuild(c: CartState): void {
    const key = JSON.stringify(c.up);
    if (key === this.builtKey) return;
    this.builtKey = key;
    this.body.geometry.dispose();
    this.body.geometry = buildBody(c);
    const grillW = 0.8 + Math.min(0.5, c.up.grill * 0.06);
    this.sausages.forEach((sm, i) => {
      const row = i % 6;
      const col = Math.floor(i / 6);
      sm.position.set(-0.45 - grillW / 4 + col * (grillW / 2), 1.355, -0.3 + row * 0.1);
    });
    const signScale = 1 + Math.min(0.6, c.up.sign * 0.07);
    this.neon.visible = c.up.sign >= 3;
    this.neon.scale.set(1.56 * signScale, 0.05, 0.03);
    this.neon.position.set(0, 2.85 + c.up.sign * 0.02 + 0.27 * signScale, -0.13);
    for (const l of this.lights) l.visible = c.up.comfort >= 3;
  }

  /** Called on upgrade: rebuild and play a pop. */
  upgraded(c: CartState): void {
    this.rebuild(c);
    this.pop = 1;
  }

  sold(): void {
    this.bounce = 1;
  }

  setSelected(on: boolean): void {
    this.ring.visible = on;
  }

  update(c: CartState, dt: number, time: number, cooking: boolean): void {
    const visibleSausages = Math.min(this.sausages.length, c.stock + (cooking ? 2 : 0));
    for (let i = 0; i < this.sausages.length; i++) (this.sausages[i] as Mesh).visible = i < visibleSausages;
    const dirt = Math.max(0, 72 - c.clean);
    const pieces = Math.min(this.litter.length, Math.ceil(dirt / 6.5));
    for (let i = 0; i < this.litter.length; i++) (this.litter[i] as Mesh).visible = i < pieces;
    if (this.bounce > 0) this.bounce = Math.max(0, this.bounce - dt * 4);
    if (this.pop > 0) this.pop = Math.max(0, this.pop - dt * 2.2);
    const b = Math.sin(this.bounce * Math.PI) * 0.06;
    const p = Math.sin(this.pop * Math.PI * 2) * this.pop * 0.12;
    this.body.scale.set(1 - b * 0.5 + p, 1 + b + p, 1 - b * 0.5 + p);
    if (this.ring.visible) {
      const k = 1 + Math.sin(time * 4) * 0.04;
      this.ring.scale.set(k, k, k);
    }
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i] as Mesh;
      if (l.visible) l.scale.setScalar(0.85 + 0.25 * Math.max(0, Math.sin(time * 2 + i * 1.3)));
    }
  }

  dispose(): void {
    this.body.geometry.dispose();
  }
}
