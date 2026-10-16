import { Color, CylinderGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, BoxGeometry } from 'three';
import { CITY, PITCH } from '../data/city';
import { PedState, type Ped } from '../sim/peds';
import { GeoBuilder } from './geom';

const CAR_COLORS = [0xd9573f, 0x3f7fb0, 0xf0e3c9, 0x2f7a6d, 0xe0a83a, 0x55606e, 0xe9e5dc, 0x7b5ea7, 0x8fb3c9];
const HALF_ROAD = CITY.road / 2;
const LANE = 2.4;
const LIMIT = 2.7 * PITCH;
const CRUISE = 7.5;
const GAP = 7.5;

interface Car {
  axis: 0 | 1; // 0: drives along x (road at z = c), 1: along z
  c: number;
  dir: 1 | -1;
  s: number;
  v: number;
  wait: number;
  claim: string | null;
  color: number;
}

const m = new Matrix4();
const q = new Quaternion();
const p = new Vector3();
const one = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);

function carGeometry(): GeoBuilder {
  const g = new GeoBuilder();
  const BOX = new BoxGeometry(1, 1, 1);
  const wheel = new CylinderGeometry(0.34, 0.34, 0.22, 10);
  wheel.rotateZ(Math.PI / 2);
  const at = (x: number, y: number, z: number, sx: number, sy: number, sz: number): Matrix4 => new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(sx, sy, sz));
  // body (white → tinted by instance colour), cabin glass, bumpers, lights, wheels
  g.add(BOX, at(0, 0.62, 0, 1.86, 0.6, 4.1), 0xffffff, { base: 0.3, h: 0.5, min: 0.8 });
  g.add(BOX, at(0, 1.18, -0.25, 1.62, 0.56, 2.1), 0xffffff);
  g.add(BOX, at(0, 1.18, -0.25, 1.66, 0.42, 1.9), 0x3b4552);
  g.add(BOX, at(0, 1.18, -0.25, 1.5, 0.43, 2.14), 0x3b4552);
  g.add(BOX, at(0, 0.45, 2.07, 1.9, 0.22, 0.12), 0x5a5d63);
  g.add(BOX, at(0, 0.45, -2.07, 1.9, 0.22, 0.12), 0x5a5d63);
  g.add(BOX, at(0.62, 0.7, 2.06, 0.34, 0.14, 0.04), 0xfff4d0);
  g.add(BOX, at(-0.62, 0.7, 2.06, 0.34, 0.14, 0.04), 0xfff4d0);
  g.add(BOX, at(0.62, 0.7, -2.06, 0.34, 0.14, 0.04), 0xc0392b);
  g.add(BOX, at(-0.62, 0.7, -2.06, 0.34, 0.14, 0.04), 0xc0392b);
  for (const x of [-0.86, 0.86]) for (const z of [-1.3, 1.3]) g.add(wheel, at(x, 0.34, z, 1, 1, 1), 0x24262b);
  return g;
}

/** Ambient traffic (view only, no economic effect): cars keep distance, take turns at crossings and stop for pedestrians. */
export class Traffic {
  readonly mesh: InstancedMesh;
  private readonly cars: Car[] = [];
  private readonly claims = new Map<string, Car>();
  private readonly colorTmp = new Color();

  constructor(count: number) {
    const geo = carGeometry().build();
    const mat = new MeshLambertMaterial({ vertexColors: true });
    this.mesh = new InstancedMesh(geo, mat, 40);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'traffic';
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const roads: number[] = [];
    for (let i = -2; i <= 1; i++) roads.push((i + 0.5) * PITCH);
    // lanes: every road near the start district, both directions; cars spread evenly (golden-ratio offsets)
    const lanes: Array<[0 | 1, number, 1 | -1]> = [];
    for (const c of roads) for (const axis of [0, 1] as const) for (const dir of [1, -1] as const) lanes.push([axis, c, dir]);
    for (let k = 0; k < 40; k++) {
      const [axis, c, dir] = lanes[(k * 7) % lanes.length] as [0 | 1, number, 1 | -1];
      const frac = (k * 0.6180339887 + rnd() * 0.08) % 1;
      const car: Car = { axis, c, dir, s: -LIMIT + frac * LIMIT * 2, v: CRUISE, wait: 0, claim: null, color: CAR_COLORS[k % CAR_COLORS.length] as number };
      this.cars.push(car);
      this.mesh.setColorAt(k, this.colorTmp.set(car.color));
    }
    this.setCount(count);
  }

  private active = 0;

  setCount(n: number): void {
    this.active = Math.min(n, this.cars.length);
    this.mesh.count = this.active;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private world(car: Car, s: number): [number, number] {
    // right-hand traffic
    return car.axis === 0 ? [s, car.c + LANE * car.dir] : [car.c - LANE * car.dir, s];
  }

  update(dt: number, peds: readonly Ped[]): void {
    const d = Math.min(dt, 0.1);
    for (let k = 0; k < this.active; k++) {
      const car = this.cars[k] as Car;
      let blocked = false;
      const front = car.s + car.dir * 2.1;
      // 1) car ahead on the same lane
      for (let j = 0; j < this.active; j++) {
        const o = this.cars[j] as Car;
        if (o === car || o.axis !== car.axis || o.c !== car.c || o.dir !== car.dir) continue;
        const ahead = (o.s - car.s) * car.dir;
        if (ahead > 0 && ahead < GAP) blocked = true;
      }
      // 2) next crossing: claim it, or wait if another car holds it
      // the crossing stays "next" until the rear has left it
      const rear = car.s - car.dir * 2.1;
      const nextIdx = car.dir > 0 ? Math.ceil((rear - HALF_ROAD) / PITCH - 0.5) : Math.floor((rear + HALF_ROAD) / PITCH - 0.5);
      const cross = (nextIdx + 0.5) * PITCH;
      const distEntry = (cross - front) * car.dir - HALF_ROAD;
      const key = car.axis === 0 ? `${cross}|${car.c}` : `${car.c}|${cross}`;
      if (distEntry < 9 && distEntry > -HALF_ROAD) {
        const holder = this.claims.get(key);
        if (holder && holder !== car && holder.axis !== car.axis) blocked = true;
        else if (!holder) {
          if (car.claim && car.claim !== key) this.claims.delete(car.claim);
          this.claims.set(key, car);
          car.claim = key;
        }
      }
      // release a claim once the rear has left the crossing
      if (car.claim && car.claim !== key) {
        this.claims.delete(car.claim);
        car.claim = null;
      }
      // 3) pedestrians on the road just ahead
      const [fx, fz] = this.world(car, car.s + car.dir * 6.5);
      for (const pd of peds) {
        if (pd.state === PedState.Off) continue;
        const dx = pd.x - fx;
        const dz = pd.z - fz;
        if (dx * dx + dz * dz < 3.2 * 3.2) {
          const relx = Math.abs(pd.x - Math.round(pd.x / PITCH) * PITCH);
          const relz = Math.abs(pd.z - Math.round(pd.z / PITCH) * PITCH);
          if (relx > CITY.block / 2 || relz > CITY.block / 2) blocked = true;
        }
      }
      if (blocked && car.claim === key && distEntry < 0) blocked = false; // never stop inside a crossing we hold
      car.wait = blocked ? car.wait + d : 0;
      if (car.wait > 6) blocked = false; // safety valve against gridlock
      const target = blocked ? 0 : CRUISE;
      car.v += Math.max(-14 * d, Math.min(4 * d, target - car.v));
      car.s += car.v * car.dir * d;
      if (car.s > LIMIT) car.s -= LIMIT * 2;
      else if (car.s < -LIMIT) car.s += LIMIT * 2;
      const [x, z] = this.world(car, car.s);
      const heading = car.axis === 0 ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.dir > 0 ? 0 : Math.PI;
      q.setFromAxisAngle(UP, heading);
      m.compose(p.set(x, 0, z), q, one);
      this.mesh.setMatrixAt(k, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
