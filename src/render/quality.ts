import type { QualitySetting } from '../core/save';

export type Tier = 'low' | 'medium' | 'high';

export interface TierConfig {
  dpr: number;
  shadows: boolean;
  shadowMap: number;
  post: boolean;
  population: number;
  /** Fog end distance. */
  fogFar: number;
  /** Render outer ring (backdrop) blocks. */
  backdrop: boolean;
  /** Ambient cars. */
  cars: number;
}

export const TIERS: Record<Tier, TierConfig> = {
  low: { dpr: 1, shadows: false, shadowMap: 512, post: false, population: 45, fogFar: 190, backdrop: false, cars: 16 },
  medium: { dpr: 1.25, shadows: true, shadowMap: 1024, post: false, population: 70, fogFar: 240, backdrop: true, cars: 26 },
  high: { dpr: 1.5, shadows: true, shadowMap: 2048, post: true, population: 90, fogFar: 280, backdrop: true, cars: 34 },
};

export interface DeviceInfo {
  mobile: boolean;
  memory?: number;
  cores?: number;
  gpu: string;
}

/** Initial guess from the device; the FPS probe can lower it afterwards. */
export function detectTier(d: DeviceInfo): Tier {
  const gpu = d.gpu.toLowerCase();
  const software = /swiftshader|llvmpipe|software|basic render/.test(gpu);
  if (software) return 'low';
  if (d.mobile) {
    if ((d.memory !== undefined && d.memory <= 3) || (d.cores !== undefined && d.cores <= 4)) return 'low';
    return 'medium';
  }
  if ((d.memory !== undefined && d.memory <= 4) || /intel\(r\) (hd|uhd) graphics [2-6]\d{2}\b|mali-[gt]\d{2}\b|adreno \(tm\) [3-5]\d{2}/.test(gpu)) return 'medium';
  return 'high';
}

export function resolveTier(setting: QualitySetting, auto: Tier): Tier {
  return setting === 'auto' ? auto : setting;
}

export function lowerTier(t: Tier): Tier {
  return t === 'high' ? 'medium' : 'low';
}

/** Max device pixel ratio: mobile screens are dense, keep them cheaper. */
export function dprFor(t: Tier, mobile: boolean): number {
  const cap = TIERS[t].dpr;
  const dev = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(dev, mobile ? Math.min(cap, t === 'high' ? 1.25 : 1) : cap);
}
