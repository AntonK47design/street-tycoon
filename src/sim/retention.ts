import { BALANCE } from '../data/balance';
import { DAILY_TASKS, type QuestDef } from '../data/quests';
import { RETENTION, WORKERS } from '../data/workers';
import { batchSize, ingredientCost, serveSec } from './cart';
import type { Sim } from './sim';
import type { GameState } from './state';
import { addXp, workerCookSec, workerWage } from './workers';

export interface OfflineReport {
  /** Seconds credited (after the cap). */
  seconds: number;
  /** Seconds actually away. */
  away: number;
  earned: number;
  served: number;
  /** Trainings that finished while away. */
  trained: number;
}

/** Average hunger over the game day (offline has no rush hours). */
function averageHunger(): number {
  const pts = BALANCE.hungerByHour;
  let area = 0;
  for (let i = 1; i < pts.length; i++) {
    const [h0, v0] = pts[i - 1] as readonly [number, number];
    const [h1, v1] = pts[i] as readonly [number, number];
    area += ((v0 + v1) / 2) * (h1 - h0);
  }
  const first = (pts[0] as readonly [number, number])[0];
  const last = (pts[pts.length - 1] as readonly [number, number])[0];
  return area / (last - first);
}

/**
 * Credits time away analytically (no tick-by-tick simulation). Carts with a worker keep selling at a
 * reduced rate; without stage-2 training they stop when supplies run out. Carts without a worker only
 * sell what was already cooked. Trainings progress on world time.
 */
export function applyOffline(sim: Sim, awaySec: number): OfflineReport {
  const st = sim.state;
  const seconds = Math.max(0, Math.min(RETENTION.offlineCapSec, awaySec));
  const report: OfflineReport = { seconds, away: Math.max(0, awaySec), earned: 0, served: 0, trained: 0 };
  // trainings run on real time, uncapped up to a day
  const before = st.workers.filter((w) => w.training).length;
  st.worldTime += Math.max(0, Math.min(awaySec, 24 * 3600));
  sim.tickTraining();
  report.trained = before - st.workers.filter((w) => w.training).length;
  if (seconds <= 0) return report;
  const hunger = averageHunger();
  const eff = RETENTION.offlineEfficiency;
  st.carts.forEach((c, ci) => {
    const w = sim.workerOf(ci);
    // demand without queue and at average hunger
    const rate = sim.arrivalRate(ci, hunger, 0);
    let sold: number;
    let earned: number;
    if (!w) {
      sold = Math.min(c.stock, Math.floor(rate * seconds * eff));
      c.stock -= sold;
      earned = sold * c.price;
    } else {
      const fast = w.auto >= 5 ? WORKERS.fastMul : 1;
      const cookRate = batchSize(c) / (workerCookSec(w) + WORKERS.reactSec);
      const serveRate = 1 / (serveSec(c) * fast);
      let n = Math.floor(Math.min(rate, cookRate, serveRate) * seconds * eff);
      if (w.auto < 2) n = Math.min(n, Math.floor(c.supplies) + c.stock);
      const fromStock = Math.min(c.stock, n);
      const cooked = n - fromStock;
      c.stock -= fromStock;
      // stage 2 buys what it cooks; otherwise supplies are used up
      const bought = w.auto >= 2 ? Math.max(0, cooked - Math.floor(c.supplies)) : 0;
      c.supplies = Math.max(0, c.supplies - (cooked - bought));
      sold = n;
      earned = n * c.price - cooked * workerWage(w) - bought * ingredientCost(c);
      addXp(w, cooked * WORKERS.xpPerPortion);
      st.stats.workerCooks += Math.floor(cooked / Math.max(1, batchSize(c)));
      st.stats.cooks += Math.floor(cooked / Math.max(1, batchSize(c)));
    }
    if (w && w.auto >= 4) c.clean = Math.max(c.clean, WORKERS.cleanBelow);
    else c.clean = Math.max(0, c.clean - sold * BALANCE.cart.dirtPerSale * 0.5);
    earned = Math.max(0, earned);
    c.served += sold;
    c.earned += earned;
    st.cash += earned;
    st.stats.served += sold;
    st.stats.earned += earned;
    report.earned += earned;
    report.served += sold;
  });
  report.earned = Math.round(report.earned * 100) / 100;
  return report;
}

// ---------------------------------------------------------------- daily reward & tasks (dates are YYYY-MM-DD)

export function prevDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) - 86400000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

function scale(st: GameState): number {
  return 1 + RETENTION.dailyPerCart * (st.carts.length - 1);
}

export function dailyUnlocked(st: GameState): boolean {
  return st.quest >= RETENTION.dailyFromQuest;
}

/** Draws today's tasks if the date changed. Returns true when a new day started. */
export function refreshDaily(st: GameState, today: string): boolean {
  if (st.daily.date === today) return false;
  st.daily.date = today;
  let h = 0;
  for (const ch of today + st.seed) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  const pool = DAILY_TASKS.map((_, i) => i).filter((i) => DAILY_TASKS[i]?.stat !== 'workerCooks' || st.workers.length > 0);
  const picked: number[] = [];
  while (picked.length < Math.min(RETENTION.dailyTaskCount, pool.length)) {
    h = (Math.imul(h ^ (h >>> 13), 0x5bd1e995) + 0x9e3779b9) >>> 0;
    const idx = pool[h % pool.length] as number;
    if (!picked.includes(idx)) picked.push(idx);
  }
  st.daily.tasks = picked.map((idx) => ({ idx, base: st.stats[(DAILY_TASKS[idx] as QuestDef).stat], claimed: false }));
  return true;
}

export function canClaimDailyReward(st: GameState, today: string): boolean {
  return st.daily.lastClaim !== today;
}

/** Streak day (1-based) the next claim would be. */
export function nextStreak(st: GameState, today: string): number {
  return st.daily.lastClaim === prevDate(today) ? st.daily.streak + 1 : 1;
}

export function dailyRewardAmount(st: GameState, streakDay: number): number {
  const r = RETENTION.dailyRewards;
  return Math.round((r[(streakDay - 1) % r.length] as number) * scale(st));
}

export function claimDailyReward(st: GameState, today: string): number {
  if (!canClaimDailyReward(st, today)) return 0;
  const day = nextStreak(st, today);
  const amount = dailyRewardAmount(st, day);
  st.daily.streak = day;
  st.daily.lastClaim = today;
  st.cash += amount;
  return amount;
}

export function taskReward(st: GameState, def: QuestDef): number {
  return Math.round(def.reward * scale(st));
}

export function taskProgress(st: GameState, k: number): { def: QuestDef; value: number; done: boolean; claimed: boolean } | null {
  const t = st.daily.tasks[k];
  const def = t ? DAILY_TASKS[t.idx] : undefined;
  if (!t || !def) return null;
  const value = Math.min(def.target, st.stats[def.stat] - t.base);
  return { def, value: Math.max(0, value), done: value >= def.target, claimed: t.claimed };
}

export function claimTask(st: GameState, k: number): number {
  const p = taskProgress(st, k);
  const t = st.daily.tasks[k];
  if (!p || !t || !p.done || p.claimed) return 0;
  t.claimed = true;
  const amount = taskReward(st, p.def);
  st.cash += amount;
  st.stats.dailyTasks++;
  return amount;
}
