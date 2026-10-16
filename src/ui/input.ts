import type { TycoonCamera } from '../render/camera';

interface Ptr {
  x: number;
  y: number;
  sx: number;
  sy: number;
  t: number;
  button: number;
}

/**
 * Camera input: drag = pan, right/middle drag = rotate, wheel / pinch = zoom, two-finger twist = rotate,
 * WASD/arrows pan, Q/E rotate, +/- zoom. A short press without movement is a tap.
 */
export class CameraInput {
  private readonly ptrs = new Map<number, Ptr>();
  private dragging = false;
  private lastPinch = 0;
  private lastAngle = 0;
  private lastMid = { x: 0, y: 0 };
  private vel = { x: 0, y: 0, t: 0 };
  private readonly keys = new Set<string>();
  enabled = true;
  onTap: (x: number, y: number) => void = () => {};

  constructor(
    private readonly el: HTMLElement,
    private readonly cam: TycoonCamera,
  ) {
    el.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move, { passive: true });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancel);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private readonly down = (e: PointerEvent): void => {
    if (!this.enabled) return;
    const p = this.local(e);
    this.ptrs.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), button: e.button });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.cam.fling(0, 0);
    if (this.ptrs.size === 2) this.startTwo();
  };

  private startTwo(): void {
    const [a, b] = [...this.ptrs.values()] as [Ptr, Ptr];
    this.lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
    this.lastAngle = Math.atan2(b.y - a.y, b.x - a.x);
    this.lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.dragging = true;
  }

  private readonly move = (e: PointerEvent): void => {
    const pt = this.ptrs.get(e.pointerId);
    if (!pt) return;
    const p = this.local(e);
    const dx = p.x - pt.x;
    const dy = p.y - pt.y;
    pt.x = p.x;
    pt.y = p.y;
    const h = this.el.clientHeight || 1;
    if (this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()] as [Ptr, Ptr];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.lastPinch > 0 && d > 0) this.cam.zoom(this.lastPinch / d);
      let da = ang - this.lastAngle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.cam.rotate(-da);
      this.cam.panPixels(mid.x - this.lastMid.x, mid.y - this.lastMid.y, h);
      this.lastPinch = d;
      this.lastAngle = ang;
      this.lastMid = mid;
      return;
    }
    if (!this.dragging && Math.hypot(p.x - pt.sx, p.y - pt.sy) > 8) this.dragging = true;
    if (!this.dragging) return;
    if (pt.button === 2 || pt.button === 1) {
      this.cam.rotate(-dx * 0.008);
      return;
    }
    this.cam.panPixels(dx, dy, h);
    const now = performance.now();
    const dtm = Math.max(1, now - this.vel.t);
    this.vel = { x: dx / dtm, y: dy / dtm, t: now };
  };

  private readonly up = (e: PointerEvent): void => {
    const pt = this.ptrs.get(e.pointerId);
    if (!pt) return;
    this.ptrs.delete(e.pointerId);
    const p = this.local(e);
    if (!this.dragging && this.ptrs.size === 0 && performance.now() - pt.t < 600 && pt.button === 0) this.onTap(p.x, p.y);
    else if (this.dragging && this.ptrs.size === 0 && pt.button === 0 && performance.now() - this.vel.t < 80) {
      // fling: convert px/ms to world units via a pan of the velocity
      const h = this.el.clientHeight || 1;
      const k = (2 * this.cam.dist * Math.tan((this.cam.cam.fov * Math.PI) / 360)) / h;
      const cs = Math.cos(this.cam.yaw);
      const sn = Math.sin(this.cam.yaw);
      const vx = -this.vel.x * 1000 * k * 0.35;
      const vy = -this.vel.y * 1000 * k * 0.35 * 1.25;
      this.cam.fling(cs * vx + sn * vy, -sn * vx + cs * vy);
    }
    if (this.ptrs.size === 0) this.dragging = false;
    if (this.ptrs.size === 1) {
      const rest = [...this.ptrs.values()][0] as Ptr;
      rest.sx = rest.x;
      rest.sy = rest.y;
    }
  };

  private readonly cancel = (e: PointerEvent): void => {
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size === 0) this.dragging = false;
  };

  private readonly wheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this.enabled) return;
    const d = Math.max(-200, Math.min(200, e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY));
    this.cam.zoom(Math.exp(d * 0.0012));
  };

  update(dt: number): void {
    if (!this.enabled) return;
    const k = this.keys;
    const sp = this.cam.dist * 0.9 * dt;
    let r = 0;
    let f = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) r -= sp;
    if (k.has('KeyD') || k.has('ArrowRight')) r += sp;
    if (k.has('KeyW') || k.has('ArrowUp')) f -= sp;
    if (k.has('KeyS') || k.has('ArrowDown')) f += sp;
    if (r || f) this.cam.panWorld(r, f);
    if (k.has('KeyQ')) this.cam.rotate(-1.6 * dt);
    if (k.has('KeyE')) this.cam.rotate(1.6 * dt);
    if (k.has('Equal') || k.has('NumpadAdd')) this.cam.zoom(1 - dt * 1.5);
    if (k.has('Minus') || k.has('NumpadSubtract')) this.cam.zoom(1 + dt * 1.5);
  }
}
