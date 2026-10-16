import { BALANCE } from '../data/balance';
import { KITCHENS, KITCHEN_ORDER, type KitchenId } from '../data/kitchens';
import { WORKERS, type AutoStage } from '../data/workers';
import type { MilestoneId } from '../data/pacing';
import { QUESTS, SIDE_GOALS, type QuestDef, type StatKey } from '../data/quests';
import { UPGRADES, UPGRADE_ORDER, upgradeCost, type UpgradeId } from '../data/upgrades';
import { Emitter } from '../core/events';
import { Rng } from '../core/rng';
import { generateCity, type CartSpot, type CityLayout, type PathNode } from './city';
import { appeal, batchSize, fairPrice, ingredientCost, patienceSec, priceMax, priceMin, priceMult, reach, restockCost, roundPrice, serveSec, stockCap, suppliesCap, type AppealParts } from './cart';
import { Mood, PedState, makePed, type Ped } from './peds';
import { newCart, newGameState, type CartState, type GameState, type Quality, type WorkerState } from './state';
import { addXp, candidates, trainingInfo, workerCookSec, workerQuality, workerWage, type Candidate } from './workers';

export const DT = 1 / BALANCE.SIM_HZ;
const CU = BALANCE.customers;
const PD = BALANCE.peds;

export type SimEvent =
  | { type: 'sale'; cart: number; amount: number; tip: number }
  | { type: 'cooked'; cart: number; portions: number; quality: Quality; byWorker: boolean }
  | { type: 'hired'; cart: number; worker: number }
  | { type: 'trainingStarted'; worker: number; stage: AutoStage }
  | { type: 'trained'; worker: number; stage: AutoStage }
  | { type: 'workerLevel'; worker: number; level: number }
  | { type: 'angry'; cart: number }
  | { type: 'upgrade'; cart: number; id: UpgradeId; level: number }
  | { type: 'cartBought'; cart: number }
  | { type: 'restock'; cart: number; amount: number }
  | { type: 'cleaned'; cart: number }
  | { type: 'questDone'; id: string; reward: number; side: boolean }
  | { type: 'milestone'; id: MilestoneId; t: number }
  | { type: 'rescue'; cart: number }
  | { type: 'newDay'; day: number }
  | { type: 'priceChanged'; cart: number };

/** Runtime (unsaved) per-cart data. */
export interface CartRuntime {
  queue: number[];
  serveT: number;
  cleanT: number;
  cooking: boolean;
  /** Who is cooking right now. */
  cookBy: 'player' | 'worker' | null;
  /** Worker timers: cooking countdown, reaction delay, price steering, idle time without customers. */
  workerT: number;
  reactT: number;
  priceT: number;
  idleT: number;
  /** Short animation timers for the view. */
  saleFlash: number;
  appeal: AppealParts;
  /** Cached stars (updated every tick). */
  stars: number;
}

export type CookResult = 'ok' | 'full' | 'noSupplies' | 'busy';

/**
 * The whole game simulation. Pure TypeScript, deterministic for a given seed and input sequence.
 * The app calls `step()` at BALANCE.SIM_HZ; the view reads state and subscribes to `events`.
 */
export class Sim {
  readonly city: CityLayout;
  readonly events = new Emitter<SimEvent>();
  readonly peds: Ped[] = [];
  readonly runtime: CartRuntime[] = [];
  readonly spotById = new Map<string, CartSpot>();
  private readonly rng: Rng;
  private readonly borderNodes: PathNode[];
  private targetPop: number;
  private spawnAcc = 0;
  private rescueCooldown = 0;
  /** Income of the last `incomeWindowSec` seconds, one bucket per second. */
  private readonly incomeBuckets: number[];
  private incomeSec = 0;
  /** Session time (seconds) — milestones in the first session use state.time instead. */
  sessionTime = 0;

  constructor(
    public state: GameState,
    population: number = PD.balancePopulation,
  ) {
    this.city = generateCity(state.seed);
    for (const s of this.city.spots) this.spotById.set(s.id, s);
    this.rng = new Rng(state.rng);
    this.borderNodes = this.city.nodes.filter((n) => n.border);
    this.targetPop = population;
    const cap = Math.max(...Object.values(PD.populationByTier)) + 12;
    for (let i = 0; i < cap; i++) this.peds.push(makePed(i));
    this.incomeBuckets = new Array<number>(BALANCE.incomeWindowSec).fill(0);
    for (let i = 0; i < state.carts.length; i++) this.runtime.push(this.makeRuntime());
    this.populate();
    if (state.time === 0) this.sendFirstCustomers();
  }

  static fresh(population?: number): Sim {
    return new Sim(newGameState(), population);
  }

  private makeRuntime(): CartRuntime {
    return { queue: [], serveT: 0, cleanT: 0, cooking: false, cookBy: null, workerT: 0, reactT: 0, priceT: 0, idleT: 0, saleFlash: 0, appeal: { clean: 1, location: 1, price: 1, taste: 1, stars: 3 }, stars: 3 };
  }

  setPopulation(n: number): void {
    this.targetPop = n;
  }

  // ---------------------------------------------------------------- queries

  spotOf(c: CartState): CartSpot {
    return this.spotById.get(c.spot) ?? (this.city.spots[0] as CartSpot);
  }

  hunger(): number {
    const h = this.state.clockMin / 60;
    const pts = BALANCE.hungerByHour;
    if (h <= (pts[0] as readonly [number, number])[0]) return (pts[0] as readonly [number, number])[1];
    for (let i = 1; i < pts.length; i++) {
      const [h1, v1] = pts[i] as readonly [number, number];
      const [h0, v0] = pts[i - 1] as readonly [number, number];
      if (h <= h1) return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
    }
    return (pts[pts.length - 1] as readonly [number, number])[1];
  }

  isRush(): boolean {
    return this.hunger() >= BALANCE.rushThreshold;
  }

  incomePerMin(): number {
    let s = 0;
    for (const v of this.incomeBuckets) s += v;
    const window = Math.min(BALANCE.incomeWindowSec, Math.max(10, this.sessionTime));
    return (s * 60) / window;
  }

  nextCartCost(): number | null {
    const n = this.state.carts.length - 1;
    const costs = BALANCE.carts.costs;
    return n < costs.length ? (costs[n] as number) : null;
  }

  freeSpots(): CartSpot[] {
    const used = new Set(this.state.carts.map((c) => c.spot));
    return this.city.spots.filter((s) => !used.has(s.id));
  }

  /** Same-kitchen carts within competition radius of a spot (excluding `except`). */
  competitorsNear(spot: CartSpot, kitchen: string, except = -1): number {
    let n = 0;
    const r2 = CU.competitionRadius * CU.competitionRadius;
    this.state.carts.forEach((c, i) => {
      if (i === except || c.kitchen !== kitchen) return;
      const s = this.spotOf(c);
      const dx = s.x - spot.x;
      const dz = s.z - spot.z;
      if (dx * dx + dz * dz < r2) n++;
    });
    return n;
  }

  currentQuest(): QuestDef | null {
    return QUESTS[this.state.quest] ?? null;
  }

  questProgress(q: QuestDef, base = 0): number {
    const v = this.statValue(q.stat);
    return Math.min(q.target, q.absolute ? v : v - base);
  }

  statValue(k: StatKey): number {
    return this.state.stats[k];
  }

  cheapestUpgrade(): number {
    let best = Infinity;
    for (const c of this.state.carts) {
      for (const id of UPGRADE_ORDER) if (c.up[id] < UPGRADES[id].maxLevel) best = Math.min(best, upgradeCost(id, c.up[id]));
    }
    return best;
  }

  // ---------------------------------------------------------------- actions

  /** Can the cart start cooking? The minigame runs in the UI, then `finishCook` applies the result. */
  canCook(ci: number): CookResult {
    const c = this.state.carts[ci];
    const rt = this.runtime[ci];
    if (!c || !rt) return 'busy';
    if (rt.cooking) return 'busy';
    if (c.stock >= stockCap(c)) return 'full';
    if (c.supplies < 1) return 'noSupplies';
    return 'ok';
  }

  startCook(ci: number, by: 'player' | 'worker' = 'player'): CookResult {
    const r = this.canCook(ci);
    if (r === 'ok') {
      const rt = this.runtime[ci] as CartRuntime;
      rt.cooking = true;
      rt.cookBy = by;
    }
    return r;
  }

  finishCook(ci: number, quality: Quality): number {
    const c = this.state.carts[ci];
    const rt = this.runtime[ci];
    if (!c || !rt) return 0;
    const byWorker = rt.cookBy === 'worker';
    rt.cooking = false;
    rt.cookBy = null;
    const want = batchSize(c) + (quality === 2 ? BALANCE.minigame.perfectBonus : 0);
    const portions = Math.max(0, Math.min(want, Math.floor(c.supplies), stockCap(c) + (quality === 2 ? BALANCE.minigame.perfectBonus : 0) - c.stock));
    if (portions <= 0) return 0;
    c.stock += portions;
    c.supplies -= portions;
    c.quality = quality;
    this.bump('cooks');
    if (quality === 2) this.bump('perfects');
    this.events.emit({ type: 'cooked', cart: ci, portions, quality, byWorker });
    return portions;
  }

  cancelCook(ci: number): void {
    const rt = this.runtime[ci];
    if (rt) {
      rt.cooking = false;
      rt.cookBy = null;
    }
  }

  setPrice(ci: number, price: number): void {
    const c = this.state.carts[ci];
    if (!c) return;
    const p = Math.max(priceMin(c), Math.min(priceMax(c), roundPrice(price)));
    if (p === c.price) return;
    c.price = p;
    this.bump('priceChanges');
    this.events.emit({ type: 'priceChanged', cart: ci });
  }

  restock(ci: number): number {
    const c = this.state.carts[ci];
    if (!c) return 0;
    const unit = ingredientCost(c);
    const want = Math.floor(suppliesCap(c) - c.supplies);
    const afford = Math.floor(this.state.cash / unit);
    const n = Math.max(0, Math.min(want, afford));
    if (n <= 0) return 0;
    this.state.cash -= n * unit;
    c.supplies += n;
    this.bump('restocks');
    this.events.emit({ type: 'restock', cart: ci, amount: n });
    return n;
  }

  restockPrice(ci: number): number {
    const c = this.state.carts[ci];
    return c ? restockCost(c) : 0;
  }

  clean(ci: number): boolean {
    const c = this.state.carts[ci];
    const rt = this.runtime[ci];
    if (!c || !rt || rt.cleanT > 0 || c.clean >= 99.5) return false;
    rt.cleanT = BALANCE.cart.cleanSec;
    return true;
  }

  buyUpgrade(ci: number, id: UpgradeId): boolean {
    const c = this.state.carts[ci];
    if (!c) return false;
    const lvl = c.up[id];
    if (lvl >= UPGRADES[id].maxLevel) return false;
    const cost = upgradeCost(id, lvl);
    if (this.state.cash < cost) return false;
    this.state.cash -= cost;
    c.up[id] = lvl + 1;
    // keep the price in the valid range when the fair price moves
    if (id === 'recipe') c.price = Math.max(priceMin(c), Math.min(priceMax(c), c.price));
    this.bump('upgrades');
    this.state.stats.maxUpgradeLevel = Math.max(this.state.stats.maxUpgradeLevel, c.up[id]);
    this.milestone('firstUpgrade');
    this.events.emit({ type: 'upgrade', cart: ci, id, level: c.up[id] });
    return true;
  }

  /** Kitchens the player may open now (by customers served). */
  unlockedKitchens(): KitchenId[] {
    return KITCHEN_ORDER.filter((k) => {
      const u = KITCHENS[k].unlockServed;
      return u !== null && this.state.stats.served >= u;
    });
  }

  buyCart(spotId: string, kitchen: KitchenId = 'hotdog'): number {
    const cost = this.nextCartCost();
    const spot = this.spotById.get(spotId);
    if (cost === null || !spot || this.state.cash < cost) return -1;
    if (this.state.carts.some((c) => c.spot === spotId)) return -1;
    if (!this.unlockedKitchens().includes(kitchen)) return -1;
    this.state.cash -= cost;
    const c = newCart(this.state.nextCartId++, spotId, kitchen, roundPrice(KITCHENS[kitchen].fairPrice));
    this.state.carts.push(c);
    this.runtime.push(this.makeRuntime());
    this.state.stats.carts = this.state.carts.length;
    this.state.stats.kitchens = new Set(this.state.carts.map((x) => x.kitchen)).size;
    if (this.state.carts.length === 2) this.milestone('secondCart');
    const ci = this.state.carts.length - 1;
    this.events.emit({ type: 'cartBought', cart: ci });
    return ci;
  }

  // ---------------------------------------------------------------- workers

  /** Worker running cart index ci, if any. */
  workerOf(ci: number): WorkerState | undefined {
    const c = this.state.carts[ci];
    if (!c) return undefined;
    return this.state.workers.find((w) => w.cart === c.id);
  }

  workerById(id: number): WorkerState | undefined {
    return this.state.workers.find((w) => w.id === id);
  }

  cartIndexOfWorker(w: WorkerState): number {
    return this.state.carts.findIndex((c) => c.id === w.cart);
  }

  candidates(): Candidate[] {
    return candidates(this.state.seed, this.state.hires);
  }

  /** Hires candidate k for cart ci. Returns the worker id, or -1. */
  hire(k: number, ci: number): number {
    const cand = this.candidates()[k];
    const c = this.state.carts[ci];
    if (!cand || !c || this.workerOf(ci) || this.state.cash < cand.cost) return -1;
    this.state.cash -= cand.cost;
    const w: WorkerState = { id: this.state.nextWorkerId++, name: cand.name, stars: cand.stars, level: 1, xp: 0, cart: c.id, auto: 1, training: null };
    this.state.workers.push(w);
    this.state.hires++;
    this.state.stats.workers = this.state.workers.length;
    const rt = this.runtime[ci] as CartRuntime;
    rt.reactT = WORKERS.reactSec;
    this.milestone('firstWorker');
    this.events.emit({ type: 'hired', cart: ci, worker: w.id });
    return w.id;
  }

  /** Starts training the next automation stage (runs on world time, also while offline). */
  startTraining(workerId: number): boolean {
    const w = this.workerById(workerId);
    if (!w || w.training || w.auto >= 5) return false;
    const stage = (w.auto + 1) as AutoStage;
    const info = trainingInfo(stage);
    if (!info || this.state.cash < info.cost) return false;
    this.state.cash -= info.cost;
    w.training = { stage, endsAt: this.state.worldTime + info.sec };
    this.bump('trainings');
    if (info.sec >= WORKERS.longTrainingSec) {
      this.bump('longTrainings');
      this.milestone('tomorrowPayoff');
    }
    this.events.emit({ type: 'trainingStarted', worker: w.id, stage });
    return true;
  }

  /** Completes trainings whose time has come (also called after offline time is credited). */
  tickTraining(): void {
    for (const w of this.state.workers) {
      if (!w.training || this.state.worldTime < w.training.endsAt) continue;
      w.auto = w.training.stage;
      w.training = null;
      this.milestone('firstAutomation');
      this.events.emit({ type: 'trained', worker: w.id, stage: w.auto });
    }
  }

  private tickWorker(ci: number, w: WorkerState): void {
    const c = this.state.carts[ci] as CartState;
    const rt = this.runtime[ci] as CartRuntime;
    // stage 1: cook
    if (rt.cookBy === 'worker') {
      rt.workerT -= DT;
      if (rt.workerT <= 0) {
        const q = workerQuality(w, this.rng.next());
        const n = this.finishCook(ci, q);
        if (n > 0) {
          // wage only while producing; never more than the cash we have
          this.state.cash -= Math.min(this.state.cash, n * workerWage(w));
          this.bump('workerCooks');
          if (addXp(w, n * WORKERS.xpPerPortion)) this.events.emit({ type: 'workerLevel', worker: w.id, level: w.level });
        }
        rt.reactT = WORKERS.reactSec;
      }
    } else if (!rt.cooking) {
      const need = c.stock <= Math.max(WORKERS.cookBelow, rt.queue.length - 1);
      if (need && this.canCook(ci) === 'ok') {
        rt.reactT -= DT;
        if (rt.reactT <= 0 && this.startCook(ci, 'worker') === 'ok') rt.workerT = workerCookSec(w);
      }
    }
    // stage 2: restock
    if (w.auto >= 2 && c.supplies < batchSize(c) * WORKERS.restockBelowBatches && this.state.cash >= ingredientCost(c) * batchSize(c)) this.restock(ci);
    // stage 3: steer the price by queue length
    if (w.auto >= 3) {
      const ap = WORKERS.autoPrice;
      rt.idleT = rt.queue.length === 0 ? rt.idleT + DT : 0;
      rt.priceT += DT;
      if (rt.priceT >= ap.stepEverySec) {
        rt.priceT = 0;
        const fair = fairPrice(c);
        if (rt.queue.length >= ap.upQueue && c.price < fair * ap.maxFactor) this.setPrice(ci, c.price + BALANCE.cart.priceStep);
        else if (rt.idleT >= ap.downIdleSec && c.price > fair * ap.minFactor) this.setPrice(ci, c.price - BALANCE.cart.priceStep);
      }
    }
    // stage 4: clean
    if (w.auto >= 4 && c.clean < WORKERS.cleanBelow) this.clean(ci);
  }

  // ---------------------------------------------------------------- tick

  step(): void {
    const st = this.state;
    st.time += DT;
    st.worldTime += DT;
    this.sessionTime += DT;
    this.advanceClock();

    this.tickTraining();
    for (let ci = 0; ci < st.carts.length; ci++) {
      this.tickCart(ci);
      const w = this.workerOf(ci);
      if (w) this.tickWorker(ci, w);
    }
    this.tickPeds();
    this.spawn();
    this.tickIncome();
    this.checkQuests();
    this.antiSoftlock();
    st.rng = this.rng.state;
  }

  private advanceClock(): void {
    const st = this.state;
    st.clockMin += (DT * 60) / BALANCE.clock.realSecPerGameHour;
    if (st.clockMin >= BALANCE.clock.dayEndMin) {
      st.clockMin = BALANCE.clock.dayStartMin;
      st.day++;
      this.events.emit({ type: 'newDay', day: st.day });
    }
  }

  private tickCart(ci: number): void {
    const c = this.state.carts[ci] as CartState;
    const rt = this.runtime[ci] as CartRuntime;
    appeal(c, this.spotOf(c), rt.appeal);
    rt.stars = rt.appeal.stars;
    if (rt.stars > this.state.stats.bestAppeal) this.state.stats.bestAppeal = Math.floor(rt.stars * 2) / 2;
    if (rt.saleFlash > 0) rt.saleFlash = Math.max(0, rt.saleFlash - DT);
    if (rt.cleanT > 0) {
      rt.cleanT -= DT;
      if (rt.cleanT <= 0) {
        rt.cleanT = 0;
        c.clean = 100;
        this.bump('cleans');
        this.events.emit({ type: 'cleaned', cart: ci });
      }
    }
    // demand: Poisson arrivals
    if (this.rng.chance(this.arrivalRate(ci) * DT)) this.recruit(ci);
    // serve the front customer once they stand at the counter
    const front = rt.queue[0];
    if (front !== undefined) {
      const p = this.peds[front] as Ped;
      if (p.state === PedState.Queue && p.slot === 0 && c.stock > 0) {
        rt.serveT += DT;
        const w = this.workerOf(ci);
        if (rt.serveT >= serveSec(c) * (w && w.auto >= 5 ? WORKERS.fastMul : 1)) {
          rt.serveT = 0;
          this.sell(ci, p);
        }
      } else if (c.stock <= 0) {
        rt.serveT = 0;
      }
    }
  }

  private sell(ci: number, p: Ped): void {
    const c = this.state.carts[ci] as CartState;
    const rt = this.runtime[ci] as CartRuntime;
    c.stock -= 1;
    const tipChance = CU.tipChanceByQuality[c.quality] ?? 0;
    const tip = this.rng.chance(tipChance) ? Math.max(0.5, roundPrice(c.price * CU.tipFraction)) : 0;
    const amount = c.price + tip;
    this.state.cash += amount;
    const k = this.incomeSec % this.incomeBuckets.length;
    this.incomeBuckets[k] = (this.incomeBuckets[k] ?? 0) + amount;
    c.earned += amount;
    c.served++;
    c.clean = Math.max(0, c.clean - BALANCE.cart.dirtPerSale);
    this.state.stats.served++;
    this.state.stats.earned += amount;
    rt.saleFlash = 0.4;
    this.milestone('firstSale');
    this.events.emit({ type: 'sale', cart: ci, amount, tip });
    this.leaveQueue(ci, p, Mood.Happy);
  }

  private leaveQueue(ci: number, p: Ped, mood: Mood): void {
    const rt = this.runtime[ci] as CartRuntime;
    const k = rt.queue.indexOf(p.idx);
    if (k >= 0) rt.queue.splice(k, 1);
    for (let i = 0; i < rt.queue.length; i++) {
      const q = this.peds[rt.queue[i] as number] as Ped;
      q.slot = i;
      if (q.state === PedState.Queue) q.state = PedState.ToCart;
    }
    rt.serveT = 0;
    p.mood = mood;
    p.moodT = 2.2;
    p.cart = -1;
    p.state = PedState.Leave;
    p.vip = false;
    if (mood === Mood.Angry) this.events.emit({ type: 'angry', cart: ci });
  }

  private antiSoftlock(): void {
    if (this.rescueCooldown > 0) {
      this.rescueCooldown -= DT;
      return;
    }
    const st = this.state;
    for (let ci = 0; ci < st.carts.length; ci++) {
      const c = st.carts[ci] as CartState;
      if (c.stock <= 0 && c.supplies < 1 && st.cash < ingredientCost(c)) {
        c.supplies += BALANCE.rescueSupplies;
        this.rescueCooldown = 20;
        this.events.emit({ type: 'rescue', cart: ci });
        return;
      }
    }
  }

  private tickIncome(): void {
    // one bucket per simulated second
    const sec = Math.floor(this.sessionTime);
    if (sec !== this.incomeSec) {
      this.incomeSec = sec;
      this.incomeBuckets[sec % this.incomeBuckets.length] = 0;
    }
  }

  private bump(k: StatKey, n = 1): void {
    this.state.stats[k] += n;
  }

  private milestone(id: MilestoneId): void {
    if (this.state.milestones[id] !== undefined) return;
    const t = Math.round(this.state.time * 10) / 10;
    this.state.milestones[id] = t;
    this.events.emit({ type: 'milestone', id, t });
  }

  /** Records a milestone from outside the sim (e.g. gameplayStart). */
  markMilestone(id: MilestoneId, t: number): void {
    if (this.state.milestones[id] === undefined) this.state.milestones[id] = t;
  }

  private checkQuests(): void {
    const st = this.state;
    st.stats.carts = st.carts.length;
    // main chain (several may complete in one tick)
    for (let guard = 0; guard < 4; guard++) {
      const q = QUESTS[st.quest];
      if (!q || this.questProgress(q) < q.target) break;
      st.quest++;
      st.cash += q.reward;
      this.events.emit({ type: 'questDone', id: q.id, reward: q.reward, side: false });
    }
    for (let k = 0; k < st.side.length; k++) {
      const s = st.side[k];
      if (!s) continue;
      const q = SIDE_GOALS[s.idx];
      if (!q) {
        st.side[k] = null;
        continue;
      }
      if (this.questProgress(q, s.base) >= q.target) {
        st.cash += q.reward;
        this.events.emit({ type: 'questDone', id: q.id, reward: q.reward, side: true });
        const next = SIDE_GOALS[st.sideNext];
        st.side[k] = next ? { idx: st.sideNext, base: this.statValue(next.stat) } : null;
        if (next) st.sideNext++;
      }
    }
  }

  // ---------------------------------------------------------------- pedestrians

  activeCount(): number {
    let n = 0;
    for (const p of this.peds) if (p.state !== PedState.Off) n++;
    return n;
  }

  private freePed(): Ped | null {
    for (const p of this.peds) if (p.state === PedState.Off) return p;
    return null;
  }

  private place(p: Ped, a: number, b: number, s: number, snap = true): void {
    const na = this.city.nodes[a] as PathNode;
    const nb = this.city.nodes[b] as PathNode;
    p.a = a;
    p.b = b;
    p.len = Math.max(0.01, Math.hypot(nb.x - na.x, nb.z - na.z));
    p.s = Math.min(s, p.len);
    p.checked = 0;
    this.pathPos(p);
    if (!snap) return;
    p.px = p.x;
    p.pz = p.z;
    p.pheading = p.heading;
  }

  private pathPos(p: Ped): void {
    const na = this.city.nodes[p.a] as PathNode;
    const nb = this.city.nodes[p.b] as PathNode;
    const dx = (nb.x - na.x) / p.len;
    const dz = (nb.z - na.z) / p.len;
    p.x = na.x + dx * p.s - dz * p.lane;
    p.z = na.z + dz * p.s + dx * p.lane;
    p.heading = Math.atan2(dx, dz);
  }

  private initPed(p: Ped): void {
    p.state = PedState.Walk;
    p.speed = this.rng.range(PD.speedMin, PD.speedMax);
    p.lane = this.rng.range(-PD.laneSpread, PD.laneSpread) * 0.6;
    p.edgesLeft = this.rng.int(PD.minEdges, PD.maxEdges);
    p.cart = -1;
    p.vip = false;
    p.mood = Mood.None;
    p.moodT = 0;
    p.leaving = false;
    p.look = this.rng.int(0, 1 << 30);
    p.stride = p.pstride = this.rng.range(0, 10);
    p.moving = 1;
    p.gen++;
  }

  private populate(): void {
    const nodes = this.city.nodes;
    const n = Math.min(this.targetPop, this.peds.length);
    for (let i = 0; i < n; i++) {
      const p = this.peds[i] as Ped;
      this.initPed(p);
      const a = this.rng.pick(nodes);
      const b = this.rng.pick(a.nb);
      this.place(p, a.id, b, 0);
      p.s = this.rng.range(0, p.len);
      this.pathPos(p);
      p.px = p.x;
      p.pz = p.z;
      p.fade = 1;
    }
  }

  /** Two pedestrians already walking up to the first cart: the first sale happens within seconds. */
  private sendFirstCustomers(): void {
    const c = this.state.carts[0];
    if (!c) return;
    const spot = this.spotOf(c);
    const na = this.city.nodes[spot.a] as PathNode;
    const nb = this.city.nodes[spot.b] as PathNode;
    for (let k = 0; k < BALANCE.start.firstCustomers; k++) {
      const p = this.freePed();
      if (!p) return;
      this.initPed(p);
      // start a few metres up the sidewalk, both sides
      const from = k % 2 === 0 ? na : nb;
      const to = k % 2 === 0 ? nb : na;
      const len = Math.hypot(to.x - from.x, to.z - from.z);
      const sAt = ((spot.sx - from.x) * (to.x - from.x) + (spot.sz - from.z) * (to.z - from.z)) / len;
      this.place(p, from.id, to.id, Math.max(0, sAt - 6 - k * 3));
      p.fade = 1;
      this.joinQueue(p, 0);
      p.vip = true;
    }
  }

  private spawn(): void {
    const active = this.activeCount();
    if (active >= this.targetPop) return;
    this.spawnAcc += DT * PD.spawnPerSec;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const p = this.freePed();
      if (!p || this.borderNodes.length === 0) return;
      this.initPed(p);
      const a = this.rng.pick(this.borderNodes);
      const inward = a.nb.filter((id) => !(this.city.nodes[id] as PathNode).border);
      const b = inward.length ? this.rng.pick(inward) : this.rng.pick(a.nb);
      this.place(p, a.id, b, 0);
      p.fade = 0;
    }
  }

  private joinQueue(p: Ped, ci: number): void {
    const rt = this.runtime[ci] as CartRuntime;
    const c = this.state.carts[ci] as CartState;
    const s = this.spotOf(c);
    if (!((p.a === s.a && p.b === s.b) || (p.a === s.b && p.b === s.a))) {
      const keepX = p.x;
      const keepZ = p.z;
      this.place(p, s.a, s.b, 0, false);
      p.x = keepX;
      p.z = keepZ;
    }
    p.state = PedState.ToCart;
    p.cart = ci;
    p.slot = rt.queue.length;
    p.patience = patienceSec(c);
    rt.queue.push(p.idx);
  }

  private slotPos(ci: number, slot: number): { x: number; z: number; hx: number; hz: number } {
    const c = this.state.carts[ci] as CartState;
    const s = this.spotOf(c);
    // queue runs along the sidewalk (perpendicular to facing), alternating sides after the first few
    const ax = -s.fz;
    const az = s.fx;
    const off = slot * CU.queueSpacing;
    return { x: s.sx + ax * off, z: s.sz + az * off, hx: -s.fx, hz: -s.fz };
  }

  /** Expected customers per second for a cart right now (demand model). */
  arrivalRate(ci: number, hunger = this.hunger(), queue = -1): number {
    const c = this.state.carts[ci] as CartState;
    const rt = this.runtime[ci] as CartRuntime;
    const s = this.spotOf(c);
    const q = queue >= 0 ? queue : rt.queue.length;
    if (q >= CU.maxQueue) return 0;
    const stars = queue >= 0 ? appeal(c, s).stars : rt.stars;
    const comp = this.competitorsNear(s, c.kitchen, ci);
    return (
      CU.baseRate *
      s.traffic *
      (1 + CU.signRate * c.up.sign) *
      (CU.appealBase + CU.appealSlope * stars) *
      priceMult(c) *
      hunger *
      Math.pow(CU.queuePenalty, q) *
      Math.pow(CU.competitionMult, comp)
    );
  }

  /** A customer decides to visit: the nearest free passer-by walks over, or someone steps out nearby. */
  private recruit(ci: number): void {
    const c = this.state.carts[ci] as CartState;
    const s = this.spotOf(c);
    const r = reach(c);
    let best: Ped | null = null;
    let bd = r * r;
    for (const p of this.peds) {
      if (p.state !== PedState.Walk || p.leaving || p.fade < 1 || p.checked === 0xffff) continue;
      const dx = p.x - s.sx;
      const dz = p.z - s.sz;
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) {
      // nobody close: someone steps out of a nearby door
      const p = this.freePed();
      if (!p) return;
      let door = null as null | { x: number; z: number; nx: number; nz: number };
      let dd = Infinity;
      for (const d of this.city.doors) {
        const v = Math.hypot(d.x - s.sx, d.z - s.sz) + this.rng.range(0, 8);
        if (v < dd) {
          dd = v;
          door = d;
        }
      }
      if (!door) return;
      this.initPed(p);
      this.place(p, s.a, s.b, 0);
      p.x = p.px = door.x + door.nx * 0.4;
      p.z = p.pz = door.z + door.nz * 0.4;
      p.heading = p.pheading = Math.atan2(door.nx, door.nz);
      p.fade = 0;
      best = p;
    }
    this.joinQueue(best, ci);
  }

  private tickPeds(): void {
    const nodes = this.city.nodes;
    for (const p of this.peds) {
      if (p.state === PedState.Off) continue;
      p.px = p.x;
      p.pz = p.z;
      p.pheading = p.heading;
      p.pstride = p.stride;
      if (p.moodT > 0) {
        p.moodT -= DT;
        if (p.moodT <= 0) p.mood = Mood.None;
      }
      if (p.leaving) {
        p.fade -= DT * 1.5;
        if (p.fade <= 0) {
          p.state = PedState.Off;
          p.fade = 0;
          continue;
        }
      } else if (p.fade < 1) p.fade = Math.min(1, p.fade + DT * 1.2);

      switch (p.state) {
        case PedState.Walk: {
          const step = p.speed * DT;
          p.s += step;
          p.stride += step;
          p.moving = 1;
          if (p.s >= p.len) {
            const arrived = nodes[p.b] as PathNode;
            p.edgesLeft--;
            if (p.edgesLeft <= 0 && arrived.border) {
              p.leaving = true;
              p.s = p.len;
            } else {
              const next = this.nextNode(arrived, p.a, p.edgesLeft <= 0);
              this.place(p, arrived.id, next, p.s - p.len, false);
              break;
            }
          }
          this.pathPos(p);
          break;
        }
        case PedState.ToCart:
        case PedState.Queue: {
          const t = this.slotPos(p.cart, p.slot);
          const dx = t.x - p.x;
          const dz = t.z - p.z;
          const d = Math.hypot(dx, dz);
          const step = p.speed * DT;
          if (d > 0.05) {
            const m = Math.min(step, d);
            p.x += (dx / d) * m;
            p.z += (dz / d) * m;
            p.stride += m;
            p.moving = 1;
            p.heading = turnTo(p.heading, Math.atan2(dx, dz), 0.45);
          } else {
            p.state = PedState.Queue;
            p.moving = 0;
            p.heading = turnTo(p.heading, Math.atan2(t.hx, t.hz), 0.3);
          }
          if (!p.vip) {
            p.patience -= DT;
            if (p.patience <= 0) this.leaveQueue(p.cart, p, Mood.Angry);
          }
          break;
        }
        case PedState.Leave: {
          // walk back to the path line, then continue along the edge
          const na = nodes[p.a] as PathNode;
          const nb = nodes[p.b] as PathNode;
          const ex = (nb.x - na.x) / p.len;
          const ez = (nb.z - na.z) / p.len;
          const proj = Math.max(0, Math.min(p.len, (p.x - na.x) * ex + (p.z - na.z) * ez)) + 1.2;
          const tx = na.x + ex * Math.min(p.len, proj) - ez * p.lane;
          const tz = na.z + ez * Math.min(p.len, proj) + ex * p.lane;
          const dx = tx - p.x;
          const dz = tz - p.z;
          const d = Math.hypot(dx, dz);
          const step = p.speed * DT;
          p.moving = 1;
          p.stride += step;
          if (d <= step + 0.05) {
            p.s = Math.min(p.len, proj);
            p.state = PedState.Walk;
            p.checked = 0xffff;
            this.pathPos(p);
          } else {
            p.x += (dx / d) * step;
            p.z += (dz / d) * step;
            p.heading = turnTo(p.heading, Math.atan2(dx, dz), 0.45);
          }
          break;
        }
      }
    }
  }

  private nextNode(at: PathNode, from: number, headOut: boolean): number {
    const nb = at.nb;
    if (nb.length === 1) return nb[0] as number;
    if (headOut) {
      // greedy towards the border
      let best = nb[0] as number;
      let bv = -Infinity;
      for (const id of nb) {
        const n = this.city.nodes[id] as PathNode;
        const v = Math.max(Math.abs(n.x), Math.abs(n.z)) + this.rng.range(0, 6);
        if (id !== from && v > bv) {
          bv = v;
          best = id;
        }
      }
      return best;
    }
    for (let guard = 0; guard < 6; guard++) {
      const id = this.rng.pick(nb);
      if (id !== from) return id;
    }
    return from;
  }
}

function turnTo(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export { fairPrice, batchSize, stockCap, suppliesCap, ingredientCost, serveSec, reach, patienceSec, priceMin, priceMax };
