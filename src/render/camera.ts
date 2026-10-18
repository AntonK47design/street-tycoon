import { PerspectiveCamera, Vector3 } from 'three';
import { CITY } from '../data/city';

/**
 * Tycoon orbit camera: target on the ground, distance (zoom), yaw (rotate), pitch tied to zoom.
 * Input handlers call pan/rotate/zoom; `update` smooths towards the goal values.
 */
export class TycoonCamera {
  readonly cam: PerspectiveCamera;
  readonly target = new Vector3(6, 0, 12);
  private goal = new Vector3(6, 0, 12);
  dist = 34;
  private goalDist = 34;
  yaw = 0.62;
  private goalYaw = 0.62;
  readonly minDist = 14;
  readonly maxDist = 95;
  private velX = 0;
  private velZ = 0;
  /** Focus animation (tap a cart → glide over). */
  private glide = 0;

  constructor(aspect: number) {
    this.cam = new PerspectiveCamera(38, aspect, 0.5, 900);
    this.apply();
  }

  /** Pan by screen-space pixels (drag). */
  panPixels(dx: number, dy: number, viewportH: number): void {
    const worldPerPx = (2 * this.dist * Math.tan((this.cam.fov * Math.PI) / 360)) / viewportH;
    this.panWorld(-dx * worldPerPx, -dy * worldPerPx * 1.25);
  }

  /** Pan in camera-relative ground axes (right, forward). */
  panWorld(right: number, fwd: number): void {
    const cs = Math.cos(this.yaw);
    const sn = Math.sin(this.yaw);
    // forward on the ground points away from the camera
    const fx = -sn;
    const fz = -cs;
    const rx = cs;
    const rz = -sn;
    this.goal.x += rx * right - fx * fwd;
    this.goal.z += rz * right - fz * fwd;
    this.glide = 0;
    this.clamp();
  }

  fling(vx: number, vz: number): void {
    this.velX = vx;
    this.velZ = vz;
  }

  /** Turns the camera to look from direction (dx, dz) towards the target (shortest way round). */
  lookFrom(dx: number, dz: number): void {
    let want = Math.atan2(dx, dz);
    while (want - this.goalYaw > Math.PI) want -= Math.PI * 2;
    while (want - this.goalYaw < -Math.PI) want += Math.PI * 2;
    this.goalYaw = want;
  }

  rotate(d: number): void {
    this.goalYaw += d;
  }

  zoom(factor: number): void {
    this.goalDist = Math.max(this.minDist, Math.min(this.maxDist, this.goalDist * factor));
  }

  focus(x: number, z: number, dist?: number): void {
    this.goal.set(x, 0, z);
    if (dist !== undefined) this.goalDist = dist;
    this.glide = 1;
    this.clamp();
  }

  /** Extra room to the east once the Outskirts are open. */
  maxX: number = CITY.cameraBounds;

  private clamp(): void {
    const b = CITY.cameraBounds;
    this.goal.x = Math.max(-b, Math.min(this.maxX, this.goal.x));
    this.goal.z = Math.max(-b, Math.min(b, this.goal.z));
  }

  pitch(): number {
    // closer → flatter, further → more top-down
    const t = (this.dist - this.minDist) / (this.maxDist - this.minDist);
    return 0.62 + t * 0.42;
  }

  update(dt: number): void {
    if (Math.abs(this.velX) + Math.abs(this.velZ) > 0.01) {
      this.goal.x += this.velX * dt;
      this.goal.z += this.velZ * dt;
      const k = Math.exp(-dt * 5);
      this.velX *= k;
      this.velZ *= k;
      this.clamp();
    }
    const kp = 1 - Math.exp(-dt * (this.glide > 0 ? 4 : 14));
    this.target.lerp(this.goal, kp);
    this.dist += (this.goalDist - this.dist) * (1 - Math.exp(-dt * 10));
    this.yaw += (this.goalYaw - this.yaw) * (1 - Math.exp(-dt * 10));
    this.apply();
  }

  private apply(): void {
    const p = this.pitch();
    const h = Math.sin(p) * this.dist;
    const r = Math.cos(p) * this.dist;
    this.cam.position.set(this.target.x + Math.sin(this.yaw) * r, h, this.target.z + Math.cos(this.yaw) * r);
    this.cam.lookAt(this.target.x, 0.8, this.target.z);
  }

  setAspect(a: number): void {
    this.cam.aspect = a;
    // narrow portrait screens: widen the vertical FOV so the scene still fits
    this.cam.fov = a < 1 ? 52 : 38;
    this.cam.updateProjectionMatrix();
  }

  snap(): void {
    this.target.copy(this.goal);
    this.dist = this.goalDist;
    this.yaw = this.goalYaw;
    this.apply();
  }
}
