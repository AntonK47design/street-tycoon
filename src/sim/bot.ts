import { BALANCE } from '../data/balance';
import { UPGRADES, UPGRADE_ORDER, upgradeCost, type UpgradeId } from '../data/upgrades';
import { Rng } from '../core/rng';
import { batchSize, fairPrice, roundPrice } from './cart';
import type { AutoStage } from '../data/workers';
import { trainingInfo } from './workers';
import { FURNITURE } from '../data/shops';
import { autoPlace } from './shop-layout';
import { DT, type Sim } from './sim';
import type { Quality } from './state';

export interface BotProfile {
  /** Seconds before the first action (reading the first hint). */
  firstReaction: number;
  /** Seconds between decisions. */
  think: [number, number];
  /** Minigame length in seconds. */
  cookSec: number;
  /** Probability of perfect / good (rest = ok). */
  perfect: number;
  good: number;
  /** Upgrade priority (earlier = preferred among affordable). */
  priority: UpgradeId[];
}

export const AVERAGE_PLAYER: BotProfile = {
  firstReaction: 3,
  think: [1.2, 2.6],
  cookSec: 2.4,
  perfect: 0.25,
  good: 0.5,
  priority: ['grill', 'sign', 'speed', 'recipe', 'comfort', 'pantry'],
};

/** "Average player" that plays through the same Sim API as the UI. Used by the pacing simulator and tests. */
export class Bot {
  private readonly rng: Rng;
  private wait: number;
  private cooking = -1;
  private cookLeft = 0;

  constructor(
    private readonly sim: Sim,
    private readonly profile: BotProfile = AVERAGE_PLAYER,
    seed = 7,
  ) {
    this.rng = new Rng(seed);
    this.wait = profile.firstReaction;
  }

  /** Call once per sim step (before or after sim.step()). */
  tick(): void {
    if (this.cooking >= 0) {
      this.cookLeft -= DT;
      if (this.cookLeft <= 0) {
        const r = this.rng.next();
        const q: Quality = r < this.profile.perfect ? 2 : r < this.profile.perfect + this.profile.good ? 1 : 0;
        this.sim.finishCook(this.cooking, q);
        this.cooking = -1;
        this.wait = this.rng.range(0.4, 0.9);
      }
      return;
    }
    this.wait -= DT;
    if (this.wait > 0) return;
    this.wait = this.rng.range(this.profile.think[0], this.profile.think[1]);
    this.decide();
  }

  private decide(): void {
    const sim = this.sim;
    const st = sim.state;
    // 1) keep carts cooking: the emptiest cart that has customers first
    let best = -1;
    let bestScore = -Infinity;
    st.carts.forEach((c, ci) => {
      const rt = sim.runtime[ci];
      if (!rt || sim.canCook(ci) !== 'ok' || sim.workerOf(ci)) return;
      const need = rt.queue.length - c.stock;
      if (c.stock > 1 && need <= 0) return;
      const score = need * 2 - c.stock;
      if (score > bestScore) {
        bestScore = score;
        best = ci;
      }
    });
    if (best >= 0) {
      sim.startCook(best);
      this.cooking = best;
      this.cookLeft = this.profile.cookSec;
      return;
    }
    // 2) chores
    for (let ci = 0; ci < st.carts.length; ci++) {
      const c = st.carts[ci];
      if (!c) continue;
      const w = sim.workerOf(ci);
      if (c.supplies < batchSize(c) * (w ? 2 : 1) && (!w || w.auto < 2) && sim.restockPrice(ci) > 0 && st.cash >= 3) {
        sim.restock(ci);
        return;
      }
      if (c.clean < 60 && (!w || w.auto < 4) && sim.clean(ci)) return;
    }
    // 3) goals & purchases
    const q = sim.currentQuest();
    if (q?.focus === 'price' || (st.stats.priceChanges === 0 && st.stats.upgrades > 0)) {
      const c = st.carts[0];
      if (c) sim.setPrice(0, roundPrice(fairPrice(c) * 1.1));
      return;
    }
    const cartCost = sim.nextCartCost();
    const savingForCart = q?.focus === 'newCart' && cartCost !== null;
    if (savingForCart && st.cash >= (cartCost as number)) {
      this.buyCart();
      return;
    }
    // hire: cheapest candidate onto the best unstaffed cart
    const free = st.carts.map((_, ci) => ci).filter((ci) => !sim.workerOf(ci));
    const cand = sim.candidates()[0];
    const wantHire = q?.focus === 'hire' || (st.quest > 10 && free.length > 0);
    if (wantHire && cand && free.length && st.cash >= cand.cost) {
      sim.hire(0, free[0] as number);
      return;
    }
    // training: the next stage for the first idle worker
    const trainee = st.workers.find((w) => !w.training && w.auto < 5);
    const tInfo = trainee ? trainingInfo((trainee.auto + 1) as AutoStage) : null;
    const wantTrain = q?.focus === 'train' || (st.quest > 10 && tInfo !== null && st.cash > tInfo.cost * 2);
    if (wantTrain && trainee && tInfo && st.cash >= tInfo.cost) {
      sim.startTraining(trainee.id);
      return;
    }
    // shops
    if (this.shopChores(q?.focus)) return;
    const rentTarget = q?.focus === 'rent' ? Math.min(...sim.city.properties.map((_, i) => sim.shops.info(i)?.rentPerDay ?? Infinity)) + 120 : 0;
    const reserve = savingForCart ? (cartCost as number) : q?.focus === 'hire' && cand ? cand.cost : q?.focus === 'train' && tInfo ? tInfo.cost : rentTarget;
    for (const id of this.profile.priority) {
      for (let ci = 0; ci < st.carts.length; ci++) {
        const c = st.carts[ci];
        if (!c || c.up[id] >= UPGRADES[id].maxLevel) continue;
        const cost = upgradeCost(id, c.up[id]);
        if (st.cash - cost >= reserve && cost <= cheapestFor(c.up) * 2.5) {
          sim.buyUpgrade(ci, id);
          return;
        }
      }
    }
    // later carts once the chain asks for them or money piles up
    if (cartCost !== null && st.cash > cartCost * 1.5) this.buyCart();
  }

  /** Rent / furnish / restock / buy shops. Returns true if it acted. */
  private shopChores(focus: string | undefined): boolean {
    const sim = this.sim;
    const st = sim.state;
    const shops = sim.shops;
    for (const p of st.properties) {
      if (!p.shop) continue;
      const w = shops.cashierOf(p.id);
      if ((!w || w.auto < 2) && shops.stockFraction(p.id) < 0.4 && shops.restockCost(p.id) > 0 && st.cash > shops.restockCost(p.id) * 0.5) {
        shops.restock(p.id);
        return true;
      }
    }
    if (focus === 'rent') {
      const free = sim.city.properties.map((_, i) => i).filter((i) => !shops.property(i));
      const pick = free.sort((a, b) => (shops.info(b)?.traffic ?? 0) - (shops.info(a)?.traffic ?? 0))[0];
      const inf = pick !== undefined ? shops.info(pick) : null;
      if (inf && pick !== undefined && st.cash >= inf.rentPerDay + 120) {
        shops.acquire(pick, st.properties.length % 2 ? 'gift' : 'snack', false);
        shops.restock(pick);
        return true;
      }
      return false;
    }
    if (focus === 'layout') {
      const p = st.properties[0];
      const g = p ? shops.grid(p.id) : null;
      if (p?.shop && g) {
        for (const t of ['display', 'fridge', 'plant', 'lamp', 'shelf', 'rug'] as const) {
          if (st.cash < FURNITURE[t].cost + 20) continue;
          const spot = autoPlace(g, p.shop.items, t);
          if (spot && shops.place(p.id, spot)) {
            shops.restock(p.id);
            return true;
          }
        }
      }
      return false;
    }
    if (focus === 'buy') {
      const p = st.properties.find((x) => x.status === 'rented');
      const inf = p ? shops.info(p.id) : null;
      if (p && inf && st.cash >= inf.buyPrice) {
        shops.buyOut(p.id);
        return true;
      }
    }
    return false;
  }

  /** New cart: newest unlocked kitchen we don't run yet, on the busiest spot without a same-kitchen rival. */
  private buyCart(): void {
    const sim = this.sim;
    const owned = new Set(sim.state.carts.map((c) => c.kitchen));
    const unlocked = sim.unlockedKitchens();
    const kitchen = [...unlocked].reverse().find((k) => !owned.has(k)) ?? 'hotdog';
    const spot = sim.freeSpots().sort((a, b) => b.traffic - a.traffic - (sim.competitorsNear(b, kitchen) - sim.competitorsNear(a, kitchen)) * 0.3)[0];
    if (spot) sim.buyCart(spot.id, kitchen);
  }
}

function cheapestFor(up: Record<UpgradeId, number>): number {
  let m = Infinity;
  for (const id of UPGRADE_ORDER) if (up[id] < UPGRADES[id].maxLevel) m = Math.min(m, upgradeCost(id, up[id]));
  return m;
}

/** Runs the sim with a bot for `seconds` and returns milestone times. */
export function runPacing(sim: Sim, seconds: number, profile: BotProfile = AVERAGE_PLAYER, seed = 7, onSecond?: (t: number) => void): Record<string, number> {
  const bot = new Bot(sim, profile, seed);
  const steps = Math.round(seconds * BALANCE.SIM_HZ);
  for (let i = 0; i < steps; i++) {
    bot.tick();
    sim.step();
    if (onSecond && i % BALANCE.SIM_HZ === 0) onSecond(i / BALANCE.SIM_HZ);
  }
  return { ...sim.state.milestones } as Record<string, number>;
}
