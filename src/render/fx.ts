import { CylinderGeometry, DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Quaternion, Vector3, type Scene } from 'three';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  spin: number;
  gravity: number;
}

function pool(n: number): Particle[] {
  return Array.from({ length: n }, () => ({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, spin: 0, gravity: 0 }));
}

const m = new Matrix4();
const q = new Quaternion();
const p = new Vector3();
const s = new Vector3();
const axis = new Vector3(0.3, 1, 0.2).normalize();

/** Pooled particle bursts: coins on sales, smoke while cooking, sparkles on upgrades, fountain spray. */
export class Fx {
  private readonly coins = pool(80);
  private readonly smoke = pool(60);
  private readonly sparks = pool(80);
  private readonly spray = pool(70);
  private readonly coinMesh: InstancedMesh;
  private readonly smokeMesh: InstancedMesh;
  private readonly sparkMesh: InstancedMesh;
  private readonly sprayMesh: InstancedMesh;
  private sprayAcc = 0;
  private seed = 1;

  constructor(scene: Scene) {
    const coinGeo = new CylinderGeometry(0.16, 0.16, 0.04, 10);
    coinGeo.rotateX(Math.PI / 2);
    this.coinMesh = this.mk(coinGeo, new MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x7a5410 }), this.coins.length, scene);
    this.coinMesh.castShadow = true;
    this.smokeMesh = this.mk(new IcosahedronGeometry(0.2, 0), new MeshBasicMaterial({ color: 0xf4efe8, transparent: true, opacity: 0.55, depthWrite: false }), this.smoke.length, scene);
    this.sparkMesh = this.mk(new IcosahedronGeometry(0.09, 0), new MeshBasicMaterial({ color: 0xffe08a }), this.sparks.length, scene);
    this.sprayMesh = this.mk(new IcosahedronGeometry(0.06, 0), new MeshBasicMaterial({ color: 0xd9f1f7, transparent: true, opacity: 0.85 }), this.spray.length, scene);
  }

  private mk(geo: CylinderGeometry | IcosahedronGeometry, mat: MeshBasicMaterial | MeshLambertMaterial, n: number, scene: Scene): InstancedMesh {
    const im = new InstancedMesh(geo, mat, n);
    im.instanceMatrix.setUsage(DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false;
    scene.add(im);
    return im;
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private spawn(list: Particle[], x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, gravity: number): void {
    const pt = list.find((a) => !a.active);
    if (!pt) return;
    pt.active = true;
    pt.x = x;
    pt.y = y;
    pt.z = z;
    pt.vx = vx;
    pt.vy = vy;
    pt.vz = vz;
    pt.life = 0;
    pt.max = life;
    pt.size = size;
    pt.spin = this.rnd() * 6;
    pt.gravity = gravity;
  }

  coinBurst(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const sp = 0.8 + this.rnd() * 1.4;
      this.spawn(this.coins, x, y, z, Math.cos(a) * sp, 3.6 + this.rnd() * 1.8, Math.sin(a) * sp, 0.9 + this.rnd() * 0.3, 1, 11);
    }
  }

  puff(x: number, y: number, z: number): void {
    this.spawn(this.smoke, x + (this.rnd() - 0.5) * 0.4, y, z + (this.rnd() - 0.5) * 0.3, (this.rnd() - 0.5) * 0.2, 0.9 + this.rnd() * 0.4, (this.rnd() - 0.5) * 0.2, 1.4, 0.8 + this.rnd() * 0.6, -0.2);
  }

  sparkle(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const r = 0.6 + this.rnd() * 1.4;
      this.spawn(this.sparks, x + Math.cos(a) * r, y + this.rnd() * 2.2, z + Math.sin(a) * r, 0, 1.2 + this.rnd() * 1.4, 0, 0.8 + this.rnd() * 0.5, 0.8 + this.rnd() * 0.8, 0);
    }
  }

  fountain(x: number, y: number, z: number, dt: number): void {
    this.sprayAcc += dt * 28;
    while (this.sprayAcc >= 1) {
      this.sprayAcc -= 1;
      const a = this.rnd() * Math.PI * 2;
      const sp = 0.5 + this.rnd() * 0.35;
      this.spawn(this.spray, x, y, z, Math.cos(a) * sp, 2.0 + this.rnd() * 0.6, Math.sin(a) * sp, 1.0, 1, 4.2);
    }
  }

  update(dt: number): void {
    this.step(this.coins, this.coinMesh, dt, (pt, k) => {
      q.setFromAxisAngle(axis, pt.spin + pt.life * 12);
      return k < 0.8 ? 1 : (1 - k) * 5;
    });
    this.step(this.smoke, this.smokeMesh, dt, (pt, k) => {
      q.identity();
      return pt.size * (0.4 + k * 1.2) * (1 - k * 0.7);
    });
    this.step(this.sparks, this.sparkMesh, dt, (pt, k) => {
      q.identity();
      return pt.size * Math.sin(k * Math.PI);
    });
    this.step(this.spray, this.sprayMesh, dt, (_pt, k) => {
      q.identity();
      return 1 - k * 0.5;
    });
  }

  private step(list: Particle[], mesh: InstancedMesh, dt: number, shape: (pt: Particle, k: number) => number): void {
    let n = 0;
    for (const pt of list) {
      if (!pt.active) continue;
      pt.life += dt;
      if (pt.life >= pt.max) {
        pt.active = false;
        continue;
      }
      pt.vy -= pt.gravity * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
      if (pt.gravity > 5 && pt.y < 0.25) {
        pt.y = 0.25;
        pt.vy *= -0.35;
        pt.vx *= 0.6;
        pt.vz *= 0.6;
      }
      const sc = shape(pt, pt.life / pt.max);
      m.compose(p.set(pt.x, pt.y, pt.z), q, s.set(sc, sc, sc));
      mesh.setMatrixAt(n++, m);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }
}
