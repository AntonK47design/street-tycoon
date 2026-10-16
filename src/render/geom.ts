import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Matrix4, Vector3 } from 'three';

export interface AoOpts {
  /** World y of the ground under the object. */
  base: number;
  /** Height over which the contact darkening fades out. */
  h: number;
  /** Multiplier at the ground. */
  min: number;
}

const tmpColor = new Color();
const va = new Vector3();
const vb = new Vector3();
const vc = new Vector3();
const n = new Vector3();
const e1 = new Vector3();
const e2 = new Vector3();
const m4 = new Matrix4();

/**
 * Accumulates flat-shaded, vertex-coloured triangles (non-indexed) and bakes simple ambient occlusion
 * into the colours. Everything static in the city is built with this and merged into a few meshes.
 */
export class GeoBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private extra: number[] | null = null;
  /** Optional extra per-vertex attribute (used by the crowd shader). */
  extraValue: number[] = [];
  extraSize = 0;

  get triangles(): number {
    return this.pos.length / 9;
  }

  enableExtra(size: number): void {
    this.extra = [];
    this.extraSize = size;
    this.extraValue = new Array<number>(size).fill(0);
  }

  /** Adds one triangle (world positions) with a colour and optional AO. */
  tri(a: Vector3, b: Vector3, c: Vector3, color: Color, ao?: AoOpts, shade = 1): void {
    for (const v of [a, b, c]) {
      this.pos.push(v.x, v.y, v.z);
      let k = shade;
      if (ao) {
        const t = Math.max(0, Math.min(1, (v.y - ao.base) / ao.h));
        k *= ao.min + (1 - ao.min) * (t * t * (3 - 2 * t));
      }
      this.col.push(color.r * k, color.g * k, color.b * k);
      if (this.extra) for (let i = 0; i < this.extraSize; i++) this.extra.push(this.extraValue[i] as number);
    }
  }

  triHex(a: Vector3, b: Vector3, c: Vector3, hex: number, ao?: AoOpts): void {
    this.tri(a, b, c, tmpColor.set(hex).clone(), ao);
  }

  /** Adds a three.js geometry transformed by `m`. */
  add(g: BufferGeometry, m: Matrix4, hex: number, ao?: AoOpts, opts: { skipDown?: boolean; shade?: number } = {}): void {
    const src = g.index ? g.toNonIndexed() : g;
    const p = src.getAttribute('position');
    const color = tmpColor.set(hex);
    const c = color.clone();
    for (let i = 0; i < p.count; i += 3) {
      va.fromBufferAttribute(p, i).applyMatrix4(m);
      vb.fromBufferAttribute(p, i + 1).applyMatrix4(m);
      vc.fromBufferAttribute(p, i + 2).applyMatrix4(m);
      if (opts.skipDown) {
        e1.subVectors(vb, va);
        e2.subVectors(vc, va);
        n.crossVectors(e1, e2).normalize();
        if (n.y < -0.95) continue;
      }
      this.tri(va, vb, vc, c, ao, opts.shade ?? 1);
    }
    if (src !== g) src.dispose();
  }

  /** Axis-aligned (optionally Y-rotated) box from centre and size. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, hex: number, ao?: AoOpts, rotY = 0, shade = 1): void {
    m4.makeRotationY(rotY).scale(va.set(sx, sy, sz)).setPosition(cx, cy, cz);
    this.add(UNIT_BOX, m4, hex, ao, { skipDown: true, shade });
  }

  /** Horizontal rectangle at height y (two triangles, facing up). */
  rect(x0: number, z0: number, x1: number, z1: number, y: number, hex: number, shade = 1): void {
    const c = tmpColor.set(hex).clone();
    va.set(x0, y, z0);
    vb.set(x0, y, z1);
    vc.set(x1, y, z1);
    this.tri(va, vb, vc, c, undefined, shade);
    va.set(x0, y, z0);
    vb.set(x1, y, z1);
    vc.set(x1, y, z0);
    this.tri(va, vb, vc, c, undefined, shade);
  }

  /** Quad rotated around Y, lying flat (for stripes). */
  flatQuad(cx: number, cz: number, w: number, d: number, y: number, rotY: number, hex: number): void {
    const c = tmpColor.set(hex).clone();
    const cs = Math.cos(rotY);
    const sn = Math.sin(rotY);
    const pt = (lx: number, lz: number, out: Vector3): Vector3 => out.set(cx + lx * cs + lz * sn, y, cz - lx * sn + lz * cs);
    pt(-w / 2, -d / 2, va);
    pt(-w / 2, d / 2, vb);
    pt(w / 2, d / 2, vc);
    this.tri(va, vb, vc, c);
    pt(-w / 2, -d / 2, va);
    pt(w / 2, d / 2, vb);
    pt(w / 2, -d / 2, vc);
    this.tri(va, vb, vc, c);
  }

  /** Vertical quad facing direction (nx, nz) — cheap window for far LODs. */
  wallQuad(cx: number, cy: number, cz: number, w: number, h: number, nx: number, nz: number, hex: number): void {
    const c = tmpColor.set(hex).clone();
    const tx = -nz;
    const tz = nx;
    const x0 = cx - (tx * w) / 2;
    const z0 = cz - (tz * w) / 2;
    const x1 = cx + (tx * w) / 2;
    const z1 = cz + (tz * w) / 2;
    va.set(x0, cy - h / 2, z0);
    vb.set(x1, cy - h / 2, z1);
    vc.set(x1, cy + h / 2, z1);
    this.tri(va, vc, vb, c);
    va.set(x0, cy - h / 2, z0);
    vb.set(x0, cy + h / 2, z0);
    vc.set(x1, cy + h / 2, z1);
    this.tri(va, vb, vc, c);
  }

  /** Builds a BufferGeometry with flat normals. */
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    if (this.extra) g.setAttribute('aExtra', new BufferAttribute(new Float32Array(this.extra), this.extraSize));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export const UNIT_BOX = new BoxGeometry(1, 1, 1);
export const mat = new Matrix4();
