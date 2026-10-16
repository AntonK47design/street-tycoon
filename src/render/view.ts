import {
  ACESFilmicToneMapping,
  BackSide,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PCFShadowMap,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  BufferAttribute,
} from 'three';
import { BALANCE } from '../data/balance';
import { CITY, PITCH } from '../data/city';
import { PedState } from '../sim/peds';
import type { Sim, SimEvent } from '../sim/sim';
import { CartView } from './cart-view';
import { buildCity, type CityMeshes } from './city-mesh';
import { Crowd, lookFromSeed, type PersonLook } from './crowd';
import { Fx } from './fx';
import { TycoonCamera } from './camera';
import { Traffic } from './traffic';
import { PAL } from './palette';
import { TIERS, dprFor, type Tier } from './quality';
import type { Post } from './post';

const TOP = CITY.curb;
const tmpV = new Vector3();
const look: PersonLook = { shirt: 0, pants: 0, skin: 0, hair: 0, scale: 1 };

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

/** Owns the three.js scene and draws the sim state. Reads the sim; never mutates it. */
export class GameView {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: TycoonCamera;
  readonly fx: Fx;
  private readonly sun: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly cityMat = new MeshLambertMaterial({ vertexColors: true });
  private city: CityMeshes;
  private readonly crowd: Crowd;
  private readonly vendors: Crowd;
  private readonly traffic: Traffic;
  private readonly carts: CartView[] = [];
  private readonly lookGen: number[] = [];
  private readonly lookScale: number[] = [];
  private readonly moving: number[] = [];
  private readonly markers = new Group();
  private markerSpots: string[] = [];
  private tier: Tier;
  private post: Post | null = null;
  private postLoading = false;
  private time = 0;
  private selected = -1;
  private contextLost = false;
  private width = 1;
  private height = 1;
  private readonly unsub: () => void;

  constructor(
    readonly container: HTMLElement,
    private readonly sim: Sim,
    tier: Tier,
    private readonly mobile: boolean,
  ) {
    this.tier = tier;
    this.renderer = new WebGLRenderer({ antialias: tier !== 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.id = 'scene';
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
    });

    this.scene.background = new Color(PAL.sky);
    this.scene.fog = new Fog(PAL.fog, 90, TIERS[tier].fogFar);
    this.hemi = new HemisphereLight(0xfff0dc, 0x8a7a66, 1.35);
    this.scene.add(this.hemi);
    this.sun = new DirectionalLight(0xffd9a8, 2.3);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.makeSky());

    this.camera = new TycoonCamera(1);
    this.city = buildCity(sim.city, this.cityMat);
    this.scene.add(this.city.group);
    this.crowd = new Crowd(sim.peds.length);
    this.scene.add(this.crowd.mesh);
    this.vendors = new Crowd(16, true);
    this.scene.add(this.vendors.mesh);
    for (let i = 0; i < sim.peds.length; i++) {
      this.lookGen.push(-1);
      this.lookScale.push(1);
      this.moving.push(0);
    }
    this.fx = new Fx(this.scene);
    this.traffic = new Traffic(24);
    this.scene.add(this.traffic.mesh);
    this.scene.add(this.markers);
    for (let i = 0; i < sim.state.carts.length; i++) this.addCart(i);
    this.unsub = sim.events.on((e) => this.onEvent(e));
    this.applyTier(tier);
    const first = sim.state.carts[0];
    if (first) {
      const s = sim.spotOf(first);
      // the cart in the lower middle, Market Square behind it
      this.camera.focus(s.x - s.fx * 5, s.z - s.fz * 5, this.mobile ? 34 : 31);
      this.camera.snap();
    }
  }

  private makeSky(): Mesh {
    const geo = new SphereGeometry(700, 16, 10);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const top = new Color(PAL.skyTop);
    const hor = new Color(PAL.sky);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, pos.getY(i) / 450));
      c.copy(hor).lerp(top, Math.pow(t, 0.7));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    const mesh = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }));
    mesh.name = 'sky';
    mesh.renderOrder = -1;
    return mesh;
  }

  get currentTier(): Tier {
    return this.tier;
  }

  applyTier(tier: Tier): void {
    this.tier = tier;
    const cfg = TIERS[tier];
    this.renderer.setPixelRatio(dprFor(tier, this.mobile));
    this.renderer.shadowMap.enabled = cfg.shadows;
    this.sun.castShadow = cfg.shadows;
    if (cfg.shadows) {
      this.sun.shadow.mapSize.set(cfg.shadowMap, cfg.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    (this.scene.fog as Fog).far = cfg.fogFar;
    for (const ch of this.city.chunks) if ((ch.userData.ring as number) === 2) ch.visible = cfg.backdrop;
    this.sim.setPopulation(cfg.population);
    this.traffic.setCount(cfg.cars);
    this.traffic.mesh.castShadow = cfg.shadows;
    this.cityMat.needsUpdate = true;
    if (cfg.post && !this.post && !this.postLoading) {
      this.postLoading = true;
      void import('./post').then(({ Post }) => {
        this.postLoading = false;
        if (TIERS[this.tier].post) this.post = new Post(this.renderer, this.scene, this.camera.cam);
      });
    } else if (!cfg.post && this.post) {
      this.post.dispose();
      this.post = null;
    }
    this.resize(this.width, this.height);
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.setAspect(this.width / this.height);
    this.post?.setSize(this.width, this.height);
  }

  private addCart(ci: number): void {
    const c = this.sim.state.carts[ci];
    if (!c) return;
    const cv = new CartView(this.sim.spotOf(c), this.cityMat, c);
    this.carts[ci] = cv;
    this.scene.add(cv.group);
  }

  private onEvent(e: SimEvent): void {
    const c = 'cart' in e ? this.carts[e.cart] : undefined;
    switch (e.type) {
      case 'sale':
        if (c) {
          c.sold();
          this.fx.coinBurst(c.spot.sx, 1.4, c.spot.sz, e.tip > 0 ? 6 : 3);
        }
        break;
      case 'upgrade':
        if (c) {
          c.upgraded(this.sim.state.carts[e.cart] as never);
          this.fx.sparkle(c.spot.x, TOP + 0.3, c.spot.z, 26);
        }
        break;
      case 'hired':
        if (c) this.fx.sparkle(c.vendor.x, TOP + 0.5, c.vendor.z, 30);
        break;
      case 'cartBought':
        this.addCart(e.cart);
        {
          const cv = this.carts[e.cart];
          if (cv) this.fx.sparkle(cv.spot.x, TOP + 0.3, cv.spot.z, 40);
        }
        break;
      case 'cooked':
        if (c) this.fx.sparkle(c.spot.x - c.spot.fx * 0.1, TOP + 1.2, c.spot.z - c.spot.fz * 0.1, e.quality === 2 ? 22 : 8);
        break;
      case 'cleaned':
        if (c) this.fx.sparkle(c.spot.x, TOP + 0.2, c.spot.z, 18);
        break;
      default:
        break;
    }
  }

  setSelected(ci: number): void {
    this.selected = ci;
    this.carts.forEach((cv, i) => cv.setSelected(i === ci));
  }

  /** Shows glowing markers on free cart spots (placement mode). */
  showMarkers(spotIds: string[]): void {
    this.markers.clear();
    this.markerSpots = spotIds;
    const ringGeo = new RingGeometry(1.1, 1.45, 36);
    const beamGeo = new CylinderGeometry(1.1, 1.1, 3, 24, 1, true);
    const ringMat = new MeshBasicMaterial({ color: 0x9be37a, transparent: true, opacity: 0.95, depthWrite: false });
    const beamMat = new MeshBasicMaterial({ color: 0x9be37a, transparent: true, opacity: 0.18, depthWrite: false, side: BackSide });
    for (const id of spotIds) {
      const s = this.sim.spotById.get(id);
      if (!s) continue;
      const ring = new Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(s.x, TOP + 0.03, s.z);
      const beam = new Mesh(beamGeo, beamMat);
      beam.position.set(s.x, TOP + 1.5, s.z);
      this.markers.add(ring, beam);
    }
  }

  hideMarkers(): void {
    this.markers.clear();
    this.markerSpots = [];
  }

  /** Projects a world point to CSS pixels in the container. */
  project(x: number, y: number, z: number, out: ScreenPoint): ScreenPoint {
    tmpV.set(x, y, z).project(this.camera.cam);
    out.x = (tmpV.x * 0.5 + 0.5) * this.width;
    out.y = (-tmpV.y * 0.5 + 0.5) * this.height;
    out.visible = tmpV.z < 1 && tmpV.x > -1.2 && tmpV.x < 1.2 && tmpV.y > -1.2 && tmpV.y < 1.3;
    return out;
  }

  private readonly sp: ScreenPoint = { x: 0, y: 0, visible: false };

  /** Nearest cart under a screen point (generous radius for touch). */
  pickCart(px: number, py: number): number {
    let best = -1;
    let bd = Infinity;
    const r = Math.max(48, (this.height / this.camera.dist) * 2.2);
    this.carts.forEach((cv, i) => {
      for (const y of [0.8, 2.2]) {
        const p = this.project(cv.spot.x, TOP + y, cv.spot.z, this.sp);
        const d = Math.hypot(p.x - px, p.y - py);
        if (d < r && d < bd) {
          bd = d;
          best = i;
        }
      }
    });
    return best;
  }

  pickMarker(px: number, py: number): string | null {
    let best: string | null = null;
    let bd = Infinity;
    const r = Math.max(52, (this.height / this.camera.dist) * 2.4);
    for (const id of this.markerSpots) {
      const s = this.sim.spotById.get(id);
      if (!s) continue;
      const p = this.project(s.x, TOP + 1, s.z, this.sp);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < r && d < bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  }

  private updateLighting(): void {
    // morning → golden late afternoon; never dark
    const st = this.sim.state;
    const t = (st.clockMin - BALANCE.clock.dayStartMin) / (BALANCE.clock.dayEndMin - BALANCE.clock.dayStartMin);
    const az = -0.9 + t * 1.6;
    const el = 0.95 - Math.abs(t - 0.45) * 0.6;
    const tgt = this.camera.target;
    const d = 80;
    this.sun.position.set(tgt.x + Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, tgt.z - Math.cos(az) * Math.cos(el) * d * 0.6 + 25);
    this.sun.target.position.set(tgt.x, 0, tgt.z);
    const warm = Math.max(0, t - 0.55) / 0.45;
    this.sun.color.setRGB(1, 0.86 - warm * 0.1, 0.68 - warm * 0.16);
    this.sun.intensity = 2.3 - warm * 0.35;
    if (this.sun.castShadow) {
      const ext = Math.min(70, Math.max(22, this.camera.dist * 0.95));
      const sc = this.sun.shadow.camera;
      if (sc.right !== ext) {
        sc.left = -ext;
        sc.right = ext;
        sc.top = ext;
        sc.bottom = -ext;
        sc.near = 1;
        sc.far = 220;
        sc.updateProjectionMatrix();
      }
    }
  }

  /** Moves the camera for this frame. Call before UI labels are projected so they never lag a frame behind. */
  prepare(dt: number): void {
    this.camera.update(dt);
    this.camera.cam.updateMatrixWorld();
  }

  render(alpha: number, dt: number): void {
    this.time += dt;
    this.updateLighting();
    this.updateCrowd(alpha, dt);
    this.updateCarts(dt);
    this.traffic.update(dt, this.sim.peds);
    this.fx.fountain(this.sim.city.fountain.x, TOP + 2.9, this.sim.city.fountain.z, dt);
    this.fx.update(dt);
    if (this.contextLost) return;
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera.cam);
  }

  private updateCrowd(alpha: number, dt: number): void {
    const peds = this.sim.peds;
    const kMove = 1 - Math.exp(-dt * 8);
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      if (!p) continue;
      if (p.state === PedState.Off) {
        this.crowd.set(i, 0, -50, 0, 0, 0.0001, 0, 0, 0);
        continue;
      }
      if (this.lookGen[i] !== p.gen) {
        this.lookGen[i] = p.gen;
        lookFromSeed(p.look, look);
        this.lookScale[i] = look.scale;
        this.crowd.setLook(i, look);
        this.moving[i] = p.moving;
      }
      const x = p.px + (p.x - p.px) * alpha;
      const z = p.pz + (p.z - p.pz) * alpha;
      let dh = p.heading - p.pheading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const h = p.pheading + dh * alpha;
      const stride = p.pstride + (p.stride - p.pstride) * alpha;
      const mv = (this.moving[i] as number) + (p.moving - (this.moving[i] as number)) * kMove;
      this.moving[i] = mv;
      const relx = Math.abs(x - Math.round(x / PITCH) * PITCH);
      const relz = Math.abs(z - Math.round(z / PITCH) * PITCH);
      const y = relx <= CITY.block / 2 && relz <= CITY.block / 2 ? TOP : 0.0;
      this.crowd.set(i, x, y, z, h, this.lookScale[i] as number, (stride * Math.PI) / 0.72, mv, p.fade);
    }
    this.crowd.commit(peds.length);
  }

  private updateCarts(dt: number): void {
    const st = this.sim.state;
    let n = 0;
    for (let ci = 0; ci < this.carts.length; ci++) {
      const cv = this.carts[ci];
      const c = st.carts[ci];
      const rt = this.sim.runtime[ci];
      if (!cv || !c || !rt) continue;
      cv.update(c, dt, this.time, rt.cooking);
      if (rt.cooking && Math.random() < dt * 5) this.fx.puff(cv.spot.x - cv.spot.fx * 0.05 + (cv.spot.fz ? 0.45 : 0), TOP + 1.45, cv.spot.z - cv.spot.fz * 0.05 - (cv.spot.fx ? 0.45 : 0));
      const working = rt.cooking || (rt.serveT > 0 && rt.queue.length > 0) ? 1 : 0;
      const w = this.sim.workerOf(ci);
      const key = w ? w.id * 101 + 7 : -1;
      if (this.vendorKey[ci] !== key) {
        this.vendorKey[ci] = key;
        if (w) {
          lookFromSeed(w.id * 7919 + w.name.length * 13, look);
          look.shirt = 0x2f7a6d;
        } else {
          lookFromSeed(1234567, look);
          look.shirt = 0xf3efe6;
        }
        this.vendors.setLook(n, look);
      }
      this.vendors.set(n++, cv.vendor.x, TOP, cv.vendor.z, cv.vendor.heading, 1, this.time * (working ? 7 : 1.5), 0, 1, working);
    }
    this.vendors.commit(n);
  }

  private readonly vendorKey: number[] = [];

  stats(): { calls: number; triangles: number; geometries: number; textures: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }

  dispose(): void {
    this.unsub();
    this.renderer.dispose();
  }

  get selectedCart(): number {
    return this.selected;
  }
}
