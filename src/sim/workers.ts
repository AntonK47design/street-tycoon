import { WORKERS, type AutoStage } from '../data/workers';
import type { Quality, WorkerState } from './state';

export interface Candidate {
  name: string;
  stars: 1 | 2 | 3;
  cost: number;
  /** Wage per portion. */
  wage: number;
}

function hash(a: number, b: number): number {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

/** Deterministic candidate list for the next hire (same seed + hire count → same people). */
export function candidates(seed: number, hires: number): Candidate[] {
  const out: Candidate[] = [];
  const base = WORKERS.hireCosts[Math.min(hires, WORKERS.hireCosts.length - 1)] as number;
  const names: readonly string[] = WORKERS.names;
  for (let k = 0; k < WORKERS.candidates; k++) {
    const h = hash(seed + hires * 31, k);
    // first hire: always one cheap 1★ option so the quest is reachable
    const stars = (k === 0 ? 1 : 1 + ((h >>> 3) % 3)) as 1 | 2 | 3;
    const name = names[(h >>> 8) % names.length] as string;
    out.push({ name, stars, cost: Math.round(base * (WORKERS.hireStarFactor[stars] as number)), wage: WORKERS.wage[stars] as number });
  }
  // distinct names
  for (let k = 1; k < out.length; k++) {
    while (out.slice(0, k).some((c) => c.name === (out[k] as Candidate).name)) {
      const i = names.indexOf((out[k] as Candidate).name);
      (out[k] as Candidate).name = names[(i + 1) % names.length] as string;
    }
  }
  return out.sort((a, b) => a.stars - b.stars);
}

export function xpForLevel(level: number): number {
  return Math.round(WORKERS.xpBase * Math.pow(level, 1.5));
}

/** Adds XP; returns true if the worker levelled up. */
export function addXp(w: WorkerState, xp: number): boolean {
  if (w.level >= WORKERS.maxLevel) return false;
  w.xp += xp;
  let up = false;
  while (w.level < WORKERS.maxLevel && w.xp >= xpForLevel(w.level)) {
    w.xp -= xpForLevel(w.level);
    w.level++;
    up = true;
  }
  return up;
}

export function workerCookSec(w: WorkerState): number {
  const fast = w.auto >= 5 ? WORKERS.fastMul : 1;
  return WORKERS.cookSec * Math.pow(WORKERS.speedPerLevel, w.level - 1) * fast;
}

export function workerQuality(w: WorkerState, roll: number): Quality {
  const p = (WORKERS.perfectByStars[w.stars] as number) + WORKERS.perfectPerLevel * (w.level - 1);
  const g = WORKERS.goodByStars[w.stars] as number;
  return roll < p ? 2 : roll < p + g ? 1 : 0;
}

export function workerWage(w: WorkerState): number {
  return WORKERS.wage[w.stars] as number;
}

export function nextStage(w: WorkerState): AutoStage | null {
  return w.auto < 5 ? ((w.auto + 1) as AutoStage) : null;
}

export function trainingInfo(stage: AutoStage): { cost: number; sec: number } | null {
  return stage >= 2 ? WORKERS.training[stage as 2 | 3 | 4 | 5] : null;
}
