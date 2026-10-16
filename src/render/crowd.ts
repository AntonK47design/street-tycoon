import { BoxGeometry, Color, CylinderGeometry, DynamicDrawUsage, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, type BufferGeometry } from 'three';
import { GeoBuilder } from './geom';

/** Parts (colour slot) and limbs (animated) of the person mesh. */
const SKIN = 0;
const SHIRT = 1;
const PANTS = 2;
const HAIR = 3;
const SHOES = 4;
const APRON = 5;

const LEG_L = 1;
const LEG_R = 2;
const ARM_L = 3;
const ARM_R = 4;

const HIP = 0.86;
const SHOULDER = 1.45;

const BOX = new BoxGeometry(1, 1, 1);
const m = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const sc = new Vector3();
const UP = new Vector3(0, 1, 0);

function put(g: GeoBuilder, geo: BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, part: number, limb: number, pivot: number, rx = 0): void {
  g.extraValue[0] = part;
  g.extraValue[1] = limb;
  g.extraValue[2] = pivot;
  q.setFromAxisAngle(new Vector3(1, 0, 0), rx);
  m.compose(v.set(x, y, z), q, sc.set(sx, sy, sz));
  g.add(geo, m, 0xffffff);
}

/** Low-poly person (~230 triangles), feet at y=0, facing +z. */
export function buildPersonGeometry(apron: boolean): BufferGeometry {
  const g = new GeoBuilder();
  g.enableExtra(3);
  const cyl = new CylinderGeometry(0.2, 0.165, 1, 7);
  const head = new IcosahedronGeometry(1, 1);
  for (const [sx, limb] of [[-1, LEG_L], [1, LEG_R]] as const) {
    put(g, BOX, sx * 0.1, 0.05, 0.03, 0.13, 0.1, 0.25, SHOES, limb, HIP);
    put(g, BOX, sx * 0.1, 0.48, 0, 0.135, 0.78, 0.15, PANTS, limb, HIP);
  }
  put(g, BOX, 0, 0.92, 0, 0.34, 0.2, 0.2, PANTS, 0, 0);
  put(g, cyl, 0, 1.24, 0, 1, 0.56, 0.62, SHIRT, 0, 0);
  if (apron) put(g, BOX, 0, 1.0, 0.1, 0.32, 0.62, 0.04, APRON, 0, 0);
  for (const [sx, limb] of [[-1, ARM_L], [1, ARM_R]] as const) {
    put(g, BOX, sx * 0.25, 1.3, 0, 0.1, 0.32, 0.12, SHIRT, limb, SHOULDER);
    put(g, BOX, sx * 0.25, 1.03, 0, 0.085, 0.26, 0.1, SKIN, limb, SHOULDER);
  }
  put(g, BOX, 0, 1.53, 0, 0.09, 0.08, 0.09, SKIN, 0, 0);
  put(g, head, 0, 1.68, 0, 0.145, 0.16, 0.145, SKIN, 0, 0);
  put(g, head, 0, 1.75, -0.025, 0.155, 0.11, 0.16, HAIR, 0, 0);
  const geo = g.build();
  geo.computeBoundingSphere();
  return geo;
}

const SKINS = [0xf1c9a5, 0xe0ac85, 0xc68863, 0x9a6545, 0x6e4630, 0xf6d7bf];
const SHIRTS = [0xd9573f, 0x3f7fb0, 0x2f7a6d, 0xe0a83a, 0x7b5ea7, 0x5d8c3a, 0xf0e3c9, 0x3d4a5c, 0xe4aba2, 0x8fb3c9, 0xc9643b, 0x4f6b5a];
const PANTSC = [0x3b4250, 0x5a4a3c, 0x2f3a4f, 0x6c6f75, 0x8b7355, 0x2b2b30, 0x4d5d77];
const HAIRS = [0x2b1d14, 0x4a3020, 0x7a5232, 0xc9a26a, 0x1a1a1a, 0x8c8c8c, 0xa3492e];

export interface PersonLook {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  scale: number;
}

/** Deterministic appearance from a seed. */
export function lookFromSeed(seed: number, out: PersonLook): PersonLook {
  let s = seed >>> 0;
  const r = (): number => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
  out.shirt = SHIRTS[Math.floor(r() * SHIRTS.length)] as number;
  out.pants = PANTSC[Math.floor(r() * PANTSC.length)] as number;
  out.skin = SKINS[Math.floor(r() * SKINS.length)] as number;
  out.hair = HAIRS[Math.floor(r() * HAIRS.length)] as number;
  out.scale = 0.9 + r() * 0.16;
  return out;
}

const col = new Color();

/**
 * Instanced crowd: one draw call for everyone. The walk cycle (legs, arms, bob) runs in the vertex
 * shader; fading in/out uses screen-door dithering so no transparency sorting is needed.
 */
export class Crowd {
  readonly mesh: InstancedMesh;
  private readonly shirt: InstancedBufferAttribute;
  private readonly pants: InstancedBufferAttribute;
  private readonly skin: InstancedBufferAttribute;
  private readonly hair: InstancedBufferAttribute;
  private readonly anim: InstancedBufferAttribute;
  private readonly mtx = new Matrix4();
  private readonly qq = new Quaternion();
  private readonly pp = new Vector3();
  private readonly ss = new Vector3();

  constructor(
    readonly capacity: number,
    apron = false,
  ) {
    const geo = buildPersonGeometry(apron);
    const mk = (n: number): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.shirt = mk(3);
    this.pants = mk(3);
    this.skin = mk(3);
    this.hair = mk(3);
    this.anim = mk(4);
    geo.setAttribute('iShirt', this.shirt);
    geo.setAttribute('iPants', this.pants);
    geo.setAttribute('iSkin', this.skin);
    geo.setAttribute('iHair', this.hair);
    geo.setAttribute('iAnim', this.anim);
    const mat = new MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec3 aExtra;
attribute vec3 iShirt;
attribute vec3 iPants;
attribute vec3 iSkin;
attribute vec3 iHair;
attribute vec4 iAnim;
varying float vFade;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
{
  float limb = aExtra.y;
  float piv = aExtra.z;
  float sw = sin(iAnim.x) * iAnim.y;
  float work = iAnim.w;
  float ang = 0.0;
  if (limb > 0.5 && limb < 1.5) ang = sw * 0.55;
  else if (limb > 1.5 && limb < 2.5) ang = -sw * 0.55;
  else if (limb > 2.5 && limb < 3.5) ang = -sw * 0.5 - work * (0.9 + 0.25 * sin(iAnim.x * 2.0));
  else if (limb > 3.5) ang = sw * 0.5 - work * (0.9 + 0.25 * cos(iAnim.x * 2.0));
  float c = cos(ang);
  float s = sin(ang);
  vec3 t = transformed;
  t.y -= piv;
  transformed.y = piv + t.y * c - t.z * s;
  transformed.z = t.y * s + t.z * c;
  transformed.y += abs(cos(iAnim.x)) * 0.04 * iAnim.y;
}`,
        )
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
{
  float part = aExtra.x;
  vec3 pc = part < 0.5 ? iSkin : part < 1.5 ? iShirt : part < 2.5 ? iPants : part < 3.5 ? iHair : part < 4.5 ? vec3(0.035, 0.03, 0.03) : vec3(0.86, 0.84, 0.8);
  vColor.rgb = pc;
  vFade = iAnim.z;
}`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
if (vFade < 0.999) {
  float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (n > vFade) discard;
}`,
        );
    };
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'crowd';
  }

  setLook(i: number, look: PersonLook): void {
    col.set(look.shirt);
    this.shirt.setXYZ(i, col.r, col.g, col.b);
    col.set(look.pants);
    this.pants.setXYZ(i, col.r, col.g, col.b);
    col.set(look.skin);
    this.skin.setXYZ(i, col.r, col.g, col.b);
    col.set(look.hair);
    this.hair.setXYZ(i, col.r, col.g, col.b);
    this.shirt.needsUpdate = this.pants.needsUpdate = this.skin.needsUpdate = this.hair.needsUpdate = true;
  }

  /** Instance i: position, heading (radians, 0 = +z), scale, walk phase, moving 0..1, fade 0..1, work (arms forward). */
  set(i: number, x: number, y: number, z: number, heading: number, scale: number, phase: number, moving: number, fade: number, work = 0): void {
    this.qq.setFromAxisAngle(UP, heading);
    this.mtx.compose(this.pp.set(x, y, z), this.qq, this.ss.set(scale, scale, scale));
    this.mesh.setMatrixAt(i, this.mtx);
    this.anim.setXYZW(i, phase, moving, fade, work);
  }

  commit(count: number): void {
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.anim.needsUpdate = true;
  }
}
