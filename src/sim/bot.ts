import { BALANCE } from '../data/balance';
import { UPGRADES, UPGRADE_ORDER, upgradeCost, type UpgradeId } from '../data/upgrades';
import { Rng } from '../core/rng';
import { batchSize, fairPrice, roundPrice } from './cart';
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
      if (!rt || sim.canCook(ci) !== 'ok') return;
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
      if (c.supplies < batchSize(c) && sim.restockPrice(ci) > 0 && st.cash >= 3) {
        sim.restock(ci);
        return;
      }
      if (c.clean < 60 && sim.clean(ci)) return;
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
      const spot = sim.freeSpots().sort((a, b) => b.traffic - a.traffic - (sim.competitorsNear(b, 'hotdog') - sim.competitorsNear(a, 'hotdog')) * 0.3)[0];
      if (spot) sim.buyCart(spot.id);
      return;
    }
    const reserve = savingForCart ? (cartCost as number) : 0;
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
    if (cartCost !== null && st.cash > cartCost * 1.5) {
      const spot = sim.freeSpots()[0];
      if (spot) sim.buyCart(spot.id);
    }
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
