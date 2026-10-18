import { BoxGeometry, CylinderGeometry, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Quaternion, Vector3, type Material } from 'three';
import { CITY } from '../data/city';
import { FACILITIES, GOODS, recipeById, type GoodId } from '../data/production';
import type { Parcel } from '../sim/city';
import type { Sim } from '../sim/sim';
import type { FacilityState } from '../sim/state';
import { GeoBuilder } from './geom';
import { PAL } from './palette';

const TOP = CITY.curb;
const BOX = new BoxGeometry(1, 1, 1);
const CYL = new CylinderGeometry(1, 1, 1, 8);
const CONE = new CylinderGeometry(0, 1, 1, 8);
const ICO = new IcosahedronGeometry(1, 0);
const UP = new Vector3(0, 1, 0);
const m = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const sc = new Vector3();

function at(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0): Matrix4 {
  return m.compose(v.set(x, y, z), q.setFromAxisAngle(UP, ry), sc.set(sx, sy, sz));
}

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

function hash(n: number): number {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return (h ^ (h >>> 15)) / 4294967296;
}

/** Ground slab for a parcel rectangle (deep, so the sides never show gaps). */
function slab(g: GeoBuilder, r: Rect, top: number, color: number): void {
  const deep = 12;
  g.box((r.x0 + r.x1) / 2, (top - deep) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, top + deep, r.z1 - r.z0, color);
}

function fence(g: GeoBuilder, r: Rect, color: number = PAL.wood): void {
  const posts = (ax: number, az: number, bx: number, bz: number): void => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / 2.2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      g.box(ax + (bx - ax) * t, TOP + 0.45, az + (bz - az) * t, 0.12, 0.9, 0.12, PAL.woodDark);
    }
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const horiz = Math.abs(bz - az) < 0.01;
    for (const y of [0.4, 0.75]) g.box(cx, TOP + y, cz, horiz ? len : 0.06, 0.07, horiz ? 0.06 : len, color);
  };
  posts(r.x0 + 0.2, r.z0 + 0.2, r.x1 - 0.2, r.z0 + 0.2);
  posts(r.x0 + 0.2, r.z1 - 0.2, r.x1 - 0.2, r.z1 - 0.2);
  posts(r.x0 + 0.2, r.z0 + 0.2, r.x0 + 0.2, r.z1 - 0.2);
  posts(r.x1 - 0.2, r.z0 + 0.2, r.x1 - 0.2, r.z1 - 0.2);
}

function shed(g: GeoBuilder, x: number, z: number, w: number, d: number, h: number, wall: number, roof: number, ry = 0): void {
  const ao = { base: TOP, h: 1.2, min: 0.75 };
  g.add(BOX, at(x, TOP + h / 2, z, w, h, d, ry), wall, ao, { skipDown: true });
  // gable roof as a squashed rotated box pair
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  for (const s of [-1, 1]) {
    const ox = (s * d) / 4;
    const mm = new Matrix4().compose(
      new Vector3(x + sn * ox, TOP + h + 0.45, z + cs * ox),
      new Quaternion().setFromAxisAngle(UP, ry).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), s * 0.55)),
      new Vector3(w + 0.4, 0.14, d / 2 + 0.5),
    );
    g.add(BOX, mm, roof);
  }
  g.add(BOX, at(x + sn * (d / 2 + 0.02), TOP + h * 0.4, z + cs * (d / 2 + 0.02), w * 0.3, h * 0.8, 0.06, ry), PAL.door);
}

/** Visual key: the parcel mesh is rebuilt only when this changes. */
function facilityKey(f: FacilityState | null, building: boolean, stage: number, depth: number, extra: string): string {
  if (!f) return 'empty';
  return `${f.kind}|${f.merged}|${building ? 'b' : ''}|${stage}|${depth}|${f.recipe}|${extra}`;
}

/** Renders the Outskirts: parcels, facilities, herds; the sim decides, this only draws. */
export class LandView {
  readonly group = new Group();
  private readonly meshes = new Map<number, Mesh>();
  private readonly keys = new Map<number, string>();
  private readonly animals: Record<'chicken' | 'sheep' | 'cow', InstancedMesh>;
  private time = 0;
  /** World points where facilities are working (smoke etc.). */
  readonly busy: Array<{ x: number; z: number; kind: string }> = [];

  constructor(
    private readonly sim: Sim,
    private readonly material: Material,
  ) {
    this.group.name = 'land';
    const mk = (geo: BoxGeometry | IcosahedronGeometry, color: number): InstancedMesh => {
      const im = new InstancedMesh(geo, new MeshLambertMaterial({ color }), 64);
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.count = 0;
      im.castShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    };
    this.animals = { chicken: mk(new IcosahedronGeometry(0.22, 0), 0xf6f1e6), sheep: mk(new IcosahedronGeometry(0.45, 1), 0xf0ece4), cow: mk(new BoxGeometry(1.4, 0.8, 0.6), 0x8b6a4f) };
  }

  private rectOf(id: number, f: FacilityState | null): Rect {
    const p = this.sim.city.parcels[id] as Parcel;
    const r: Rect = { x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1 };
    if (f && f.merged >= 0) {
      const o = this.sim.city.parcels[f.merged];
      if (o) {
        r.x0 = Math.min(r.x0, o.x0);
        r.z0 = Math.min(r.z0, o.z0);
        r.x1 = Math.max(r.x1, o.x1);
        r.z1 = Math.max(r.z1, o.z1);
      }
    }
    return r;
  }

  /** Centre of a parcel's facility area (for labels). */
  centre(id: number): { x: number; z: number } {
    const at2 = this.sim.production.facilityAt(id);
    const r = this.rectOf(at2 ? at2.main.id : id, at2 ? at2.f : null);
    return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
  }

  private build(id: number, f: FacilityState | null, owned: boolean, building: boolean, progress: number, depth: number): Mesh {
    const g = new GeoBuilder();
    const r = this.rectOf(id, f);
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const seed = id * 97 + 13;
    if (!f) {
      slab(g, r, TOP, owned ? 0xa68e6c : 0x8aa362);
      if (!owned) {
        // wild grass tufts and a "for sale" stake
        for (let k = 0; k < 14; k++) g.add(ICO, at(r.x0 + 1 + hash(seed + k) * (w - 2), TOP + 0.12, r.z0 + 1 + hash(seed + k * 7) * (d - 2), 0.35, 0.22, 0.35), 0x7f9b5c);
        g.box(cx, TOP + 0.6, r.z1 - 1.5, 0.1, 1.2, 0.1, PAL.woodDark);
        g.box(cx, TOP + 1.3, r.z1 - 1.5, 1.4, 0.6, 0.08, 0xf5efe4);
        g.box(cx, TOP + 1.3, r.z1 - 1.45, 1.1, 0.14, 0.04, 0x2f7a6d);
      } else fence(g, r, 0xd8c7a6 as number);
      return this.finish(g);
    }
    const def = FACILITIES[f.kind];
    if (building) {
      slab(g, r, TOP, 0xa68e6c);
      // scaffold + half-built walls
      const h = 1 + progress * 3;
      g.box(cx, TOP + h / 2, cz, Math.min(w, 8) * 0.9, h, Math.min(d, 8) * 0.9, def.color, { base: TOP, h: 1, min: 0.8 });
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) g.box(cx + sx * Math.min(w, 8) * 0.5, TOP + 2.2, cz + sz * Math.min(d, 8) * 0.5, 0.12, 4.4, 0.12, 0xe0a83a);
      for (const y of [1.4, 2.8, 4.2]) {
        g.box(cx, TOP + y, cz - Math.min(d, 8) * 0.5, Math.min(w, 8), 0.1, 0.1, 0xe0a83a);
        g.box(cx, TOP + y, cz + Math.min(d, 8) * 0.5, Math.min(w, 8), 0.1, 0.1, 0xe0a83a);
      }
      g.box(cx + 2.5, TOP + 0.3, cz + 3, 1.6, 0.6, 1.0, PAL.wood);
      return this.finish(g);
    }
    switch (f.kind) {
      case 'farm': {
        slab(g, r, TOP, 0x8d6b4a);
        const crop = recipeById(f.recipe)?.outputs;
        const good = (crop ? (Object.keys(crop)[0] as GoodId) : 'wheat') ?? 'wheat';
        const col = GOODS[good].color;
        const rows = Math.floor((d - 2) / 1.3);
        for (let k = 0; k < rows; k++) {
          const z = r.z0 + 1.3 + k * 1.3;
          g.box(cx, TOP + 0.08, z, w - 2.4, 0.16, 0.6, 0x7a5a3d);
          const n = Math.floor((w - 2.6) / 0.9);
          for (let i = 0; i < n && progress > 0.02; i++) {
            const x = r.x0 + 1.5 + i * 0.9;
            const hgt = 0.15 + progress * (good === 'wheat' ? 0.9 : 0.55);
            g.add(good === 'wheat' ? BOX : ICO, at(x, TOP + 0.16 + hgt / 2, z, good === 'wheat' ? 0.18 : 0.3 * (0.4 + progress), hgt, good === 'wheat' ? 0.18 : 0.3 * (0.4 + progress)), progress > 0.95 ? col : 0x6f9a53);
          }
        }
        shed(g, r.x0 + 2.2, r.z0 + 2, 2.6, 2.4, 2.2, 0xd78f6e, 0x8f877e, Math.PI / 2);
        fence(g, r);
        break;
      }
      case 'ranch': {
        slab(g, r, TOP, 0x93ad6b);
        shed(g, r.x0 + 3.2, r.z0 + 3, 4.2, 3.6, 2.8, 0xb8432e, 0xf0e3c9);
        g.box(cx + 2, TOP + 0.3, cz + 2, 2.2, 0.4, 0.7, PAL.woodDark);
        g.box(cx + 2, TOP + 0.52, cz + 2, 2.0, 0.06, 0.5, 0xe2c25a);
        fence(g, r);
        break;
      }
      case 'forest': {
        slab(g, r, TOP, 0x7f9b5c);
        // trees regrow over the batch; stumps when just felled
        const n = Math.round((w * d) / 14);
        const standing = Math.round(n * (0.3 + 0.7 * progress));
        for (let k = 0; k < n; k++) {
          const x = r.x0 + 1.2 + hash(seed + k * 3) * (w - 2.4);
          const z = r.z0 + 1.2 + hash(seed + k * 5 + 1) * (d - 2.4);
          if (k >= standing) {
            g.add(CYL, at(x, TOP + 0.15, z, 0.2, 0.3, 0.2), PAL.trunk);
            continue;
          }
          const s = 0.8 + hash(seed + k) * 0.5;
          g.add(CYL, at(x, TOP + 0.9 * s, z, 0.14 * s, 1.8 * s, 0.14 * s), PAL.trunk);
          g.add(CONE, at(x, TOP + 2.6 * s, z, 1.0 * s, 2.4 * s, 1.0 * s), 0x4f7a43);
          g.add(CONE, at(x, TOP + 3.5 * s, z, 0.7 * s, 1.6 * s, 0.7 * s), 0x5e874b);
        }
        g.box(r.x1 - 2, TOP + 0.3, r.z1 - 1.5, 2.4, 0.6, 0.9, PAL.wood);
        break;
      }
      case 'mine': {
        // visible digging: terraced pit, one step per depth level
        const step = 0.85;
        const ring = 1.0;
        const levels = depth;
        const rim = 1.2;
        const ir: Rect = { x0: r.x0 + rim, z0: r.z0 + rim, x1: r.x1 - rim, z1: r.z1 - rim };
        // rim frame at street level
        slab(g, { x0: r.x0, z0: r.z0, x1: r.x1, z1: ir.z0 }, TOP, 0xa69a88);
        slab(g, { x0: r.x0, z0: ir.z1, x1: r.x1, z1: r.z1 }, TOP, 0xa69a88);
        slab(g, { x0: r.x0, z0: ir.z0, x1: ir.x0, z1: ir.z1 }, TOP, 0xa69a88);
        slab(g, { x0: ir.x1, z0: ir.z0, x1: r.x1, z1: ir.z1 }, TOP, 0xa69a88);
        for (let k = 1; k <= levels; k++) {
          const o = (k - 1) * ring;
          const a: Rect = { x0: ir.x0 + o, z0: ir.z0 + o, x1: ir.x1 - o, z1: ir.z1 - o };
          const top = TOP - k * step;
          const col = k % 2 ? 0x9c8f7c : 0x8a7d6b;
          if (k === levels || a.x1 - a.x0 < 2 * ring + 1) {
            slab(g, a, top, k >= 4 ? 0x6e5d4e : col);
            break;
          }
          slab(g, { x0: a.x0, z0: a.z0, x1: a.x1, z1: a.z0 + ring }, top, col);
          slab(g, { x0: a.x0, z0: a.z1 - ring, x1: a.x1, z1: a.z1 }, top, col);
          slab(g, { x0: a.x0, z0: a.z0 + ring, x1: a.x0 + ring, z1: a.z1 - ring }, top, col);
          slab(g, { x0: a.x1 - ring, z0: a.z0 + ring, x1: a.x1, z1: a.z1 - ring }, top, col);
        }
        // ore glints in deep levels, rock piles and a little crane
        for (let k = 0; k < 6; k++) g.add(ICO, at(r.x0 + 0.6 + hash(seed + k) * 0.6, TOP + 0.3, r.z0 + 1 + k * ((d - 2) / 6), 0.5, 0.4, 0.5), 0x9c9488);
        g.box(r.x1 - 0.7, TOP + 2.2, cz, 0.2, 4.4, 0.2, 0xe0a83a);
        g.box(r.x1 - 2.6, TOP + 4.3, cz, 4.0, 0.2, 0.2, 0xe0a83a);
        g.box(r.x1 - 4.4, TOP + 3.2, cz, 0.04, 2.2, 0.04, PAL.metal);
        break;
      }
      default: {
        // processing buildings: shed + props per kind
        slab(g, r, TOP, 0xc9bfae);
        const bw = Math.min(w - 3, 9);
        const bd = Math.min(d - 4, 7);
        shed(g, cx, cz - 1, bw, bd, 3.4, def.color, 0x6b6560);
        if (f.kind === 'smelter') {
          g.add(CYL, at(cx + bw / 2 - 1, TOP + 4.5, cz - 2, 0.5, 4, 0.5), 0x5a5d63);
          g.add(CYL, at(cx + bw / 2 - 1, TOP + 6.6, cz - 2, 0.6, 0.3, 0.6), 0x3a3c41);
        } else if (f.kind === 'sawmill') {
          for (let k = 0; k < 6; k++) g.add(CYL, at(r.x0 + 1.5, TOP + 0.3 + (k % 3) * 0.5, cz + 3 + Math.floor(k / 3) * 0.5, 0.25, 3, 0.25).multiply(new Matrix4().makeRotationZ(Math.PI / 2)), PAL.wood);
          g.box(r.x1 - 2, TOP + 0.4, cz + 3.5, 2.5, 0.8, 1.2, 0xd2a56d);
        } else if (f.kind === 'mill') {
          g.add(CYL, at(r.x1 - 2.6, TOP + 3, r.z0 + 2.6, 1.2, 6, 1.2), 0xf0e3c9);
          g.add(CONE, at(r.x1 - 2.6, TOP + 6.8, r.z0 + 2.6, 1.5, 1.6, 1.5), 0xa9563f);
        } else if (f.kind === 'loom') {
          for (let k = 0; k < 4; k++) g.add(CYL, at(r.x0 + 1.5 + k * 0.9, TOP + 0.35, cz + 3.6, 0.3, 0.7, 0.3), [0x7b9bc9, 0xc9643b, 0xf3efe6, 0x7b5ea7][k] as number);
        } else if (f.kind === 'recycler') {
          for (let k = 0; k < 3; k++) g.box(r.x0 + 1.8 + k * 1.6, TOP + 0.6, cz + 3.6, 1.3, 1.2, 1.1, [0x2f7a6d, 0x3f7fb0, 0xe0a83a][k] as number);
        } else if (f.kind === 'workshop') {
          g.box(cx, TOP + 0.5, cz + 3.4, 3, 1, 1.2, PAL.wood);
          g.box(cx + 2.4, TOP + 0.6, cz + 3.4, 1, 1.2, 1, 0x55606e);
        } else if (f.kind === 'butcher') {
          g.box(cx, TOP + 3.9, cz - 1 + bd / 2 + 0.3, bw * 0.8, 0.5, 0.1, 0xf5efe4);
        }
        break;
      }
    }
    return this.finish(g);
  }

  private finish(g: GeoBuilder): Mesh {
    const mesh = new Mesh(g.build(), this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  update(dt: number): void {
    this.time += dt;
    const prod = this.sim.production;
    const st = this.sim.state;
    const counts = { chicken: 0, sheep: 0, cow: 0 };
    this.busy.length = 0;
    this.sim.city.parcels.forEach((_p, id) => {
      const owned = prod.owned(id);
      if (owned && owned.annexOf >= 0) {
        // drawn by its main parcel
        const mesh = this.meshes.get(id);
        if (mesh) {
          this.group.remove(mesh);
          mesh.geometry.dispose();
          this.meshes.delete(id);
          this.keys.delete(id);
        }
        return;
      }
      const f = owned?.facility ?? null;
      const building = !!f && st.worldTime < f.builtAt;
      let progress = 0;
      if (building && f) progress = 1 - (f.builtAt - st.worldTime) / 20;
      else if (f?.job) {
        const r = recipeById(f.job.recipe);
        progress = r ? Math.max(0, Math.min(1, 1 - (f.job.endsAt - st.worldTime) / r.sec)) : 0;
      } else if (f?.kind === 'forest' || f?.kind === 'farm') progress = f.made > 0 && f.kind === 'forest' ? 1 : 0;
      const stage = Math.floor(progress * 5);
      const depth = f?.kind === 'mine' ? prod.depth(f) : 0;
      const key = `${owned ? 'o' : 'u'}|${st.land.unlocked}|` + facilityKey(f, building, stage, depth, '');
      if (this.keys.get(id) !== key) {
        this.keys.set(id, key);
        const old = this.meshes.get(id);
        if (old) {
          this.group.remove(old);
          old.geometry.dispose();
        }
        const mesh = this.build(id, f, !!owned, building, progress, depth);
        this.meshes.set(id, mesh);
        this.group.add(mesh);
      }
      if (f && !building && f.job) {
        const c = this.centre(id);
        this.busy.push({ x: c.x, z: c.z, kind: f.kind });
      }
      // herds wander inside their pen
      if (f?.kind === 'ranch' && !building && f.animal) {
        const r = this.rectOf(id, f);
        const im = this.animals[f.animal];
        const n = Math.min(f.animals, 24);
        for (let k = 0; k < n && counts[f.animal] < im.instanceMatrix.count; k++) {
          const s = id * 31 + k;
          const tx = 0.5 + 0.38 * Math.sin(this.time * (0.08 + hash(s) * 0.06) + s);
          const tz = 0.5 + 0.38 * Math.cos(this.time * (0.07 + hash(s + 9) * 0.05) + s * 1.7);
          const x = r.x0 + 2 + tx * (r.x1 - r.x0 - 4);
          const z = r.z0 + 6 + tz * (r.z1 - r.z0 - 8);
          const hdg = Math.atan2(Math.cos(this.time * 0.08 + s), -Math.sin(this.time * 0.07 + s * 1.7));
          const y = f.animal === 'cow' ? 0.75 : f.animal === 'sheep' ? 0.55 : 0.25 + Math.abs(Math.sin(this.time * 6 + k)) * 0.05;
          im.setMatrixAt(counts[f.animal]++, at(x, TOP + y, z, 1, 1, 1, hdg));
        }
      }
    });
    for (const k of ['chicken', 'sheep', 'cow'] as const) {
      this.animals[k].count = counts[k];
      this.animals[k].instanceMatrix.needsUpdate = true;
    }
  }

  /** Parcel under a ground point (merged annexes map to their facility's parcel). */
  parcelAt(x: number, z: number): number {
    for (const p of this.sim.city.parcels) {
      if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) {
        const o = this.sim.production.owned(p.id);
        return o && o.annexOf >= 0 ? o.annexOf : p.id;
      }
    }
    return -1;
  }
}
