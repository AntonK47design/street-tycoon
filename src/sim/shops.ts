import { BALANCE } from '../data/balance';
import { FURNITURE, SHOPS, productById, productsFor, type FurnitureId, type ShopKind } from '../data/shops';
import { WORKERS } from '../data/workers';
import type { Building, PathNode } from './city';
import { Mood, PedState, type Ped } from './peds';
import { accessCell, autoPlace, blockedMap, canPlace, cellPos, makeGrid, path, rateLayout, type Grid, type Placed, type RatingParts } from './shop-layout';
import type { Sim } from './sim';
import type { PropertyState, ShopState, WorkerState } from './state';
import { addXp, workerWage } from './workers';

/** Seconds per game day (rent and apartment income are spread over it). */
export const DAY_SEC = ((BALANCE.clock.dayEndMin - BALANCE.clock.dayStartMin) / 60) * BALANCE.clock.realSecPerGameHour;

const DT = 1 / BALANCE.SIM_HZ;
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** Shop customer phases (stored in ped.phase). */
export enum ShopPhase {
  Enter = 0,
  ToStop = 1,
  Browse = 2,
  ToCheckout = 3,
  Queue = 4,
  Exit = 5,
}

export interface ShopRuntime {
  grid: Grid;
  rating: RatingParts;
  inside: number[];
  queue: number[];
  serveT: number;
  /** Bumped on every layout/stock change so the view can rebuild. */
  version: number;
  stockVersion: number;
  priceT: number;
  idleT: number;
}

export interface PropertyInfo {
  id: number;
  building: Building;
  traffic: number;
  area: number;
  rentPerDay: number;
  buyPrice: number;
  floors: number;
}

/** Real estate, shops, shop customers, rent and apartments. Owned by Sim; pure TS. */
export class ShopSystem {
  readonly runtime = new Map<number, ShopRuntime>();
  private readonly grids = new Map<number, Grid>();

  constructor(private readonly sim: Sim) {
    for (const p of sim.state.properties) this.ensureRuntime(p);
  }

  // ---------------------------------------------------------------- queries

  info(pi: number): PropertyInfo | null {
    const pr = this.sim.city.properties[pi];
    const b = pr ? this.sim.city.buildings[pr.building] : undefined;
    if (!pr || !b) return null;
    const area = Math.round((b.x1 - b.x0) * (b.z1 - b.z0));
    const loc = 0.7 + 0.6 * pr.traffic;
    const rentPerDay = Math.round(area * SHOPS.rentPerSqmDay * loc);
    return { id: pi, building: b, traffic: pr.traffic, area, rentPerDay, buyPrice: rentPerDay * SHOPS.buyDays, floors: b.floors };
  }

  grid(pi: number): Grid | null {
    let g = this.grids.get(pi);
    if (!g) {
      const inf = this.info(pi);
      if (!inf) return null;
      g = makeGrid(inf.building);
      this.grids.set(pi, g);
    }
    return g;
  }

  property(pi: number): PropertyState | undefined {
    return this.sim.state.properties.find((p) => p.id === pi);
  }

  cashierOf(pi: number): WorkerState | undefined {
    return this.sim.state.workers.find((w) => w.shop === pi);
  }

  /** Cost to fill every shelf. */
  restockCost(pi: number): number {
    const pr = this.property(pi);
    if (!pr?.shop) return 0;
    let c = 0;
    for (const it of pr.shop.items) {
      const f = FURNITURE[it.type];
      const prod = it.product ? productById(it.product) : undefined;
      if (f.capacity && prod) c += (f.capacity - (it.stock ?? 0)) * prod.cost;
    }
    return c;
  }

  stockFraction(pi: number): number {
    const pr = this.property(pi);
    if (!pr?.shop) return 0;
    let have = 0;
    let cap = 0;
    for (const it of pr.shop.items) {
      const f = FURNITURE[it.type];
      if (!f.capacity) continue;
      have += it.stock ?? 0;
      cap += f.capacity;
    }
    return cap ? have / cap : 0;
  }

  /** Customers per second right now (0 when the layout can't trade). */
  arrivalRate(pi: number, queueAware = true): number {
    const pr = this.property(pi);
    const rt = this.runtime.get(pi);
    const inf = this.info(pi);
    if (!pr?.shop || !rt || !inf || !rt.rating.open) return 0;
    if (queueAware && rt.inside.length >= this.capacity(pi)) return 0;
    let pm = 0;
    let n = 0;
    for (const it of pr.shop.items) {
      const prod = it.product ? productById(it.product) : undefined;
      if (!prod) continue;
      const price = pr.shop.prices[prod.id] ?? prod.fair;
      pm += Math.max(0.15, Math.min(1.6, Math.pow(prod.fair / Math.max(0.1, price), SHOPS.elasticity)));
      n++;
    }
    const priceFactor = n ? pm / n : 0;
    // bigger shops draw more people (sub-linear)
    const size = Math.sqrt(inf.area / 90);
    return SHOPS.baseRate * size * inf.traffic * (SHOPS.ratingBase + SHOPS.ratingSlope * rt.rating.total) * priceFactor;
  }

  capacity(pi: number): number {
    const g = this.grid(pi);
    return g ? Math.max(2, Math.floor((g.cols * g.rows) / SHOPS.cellsPerCustomer)) : 0;
  }

  // ---------------------------------------------------------------- actions

  private ensureRuntime(p: PropertyState): void {
    const g = this.grid(p.id);
    if (!g) return;
    if (!this.runtime.has(p.id)) this.runtime.set(p.id, { grid: g, rating: rateLayout(g, [], 'snack'), inside: [], queue: [], serveT: 0, version: 0, stockVersion: 0, priceT: 0, idleT: 0 });
    this.rerate(p.id);
  }

  rerate(pi: number): void {
    const pr = this.property(pi);
    const rt = this.runtime.get(pi);
    if (!pr || !rt) return;
    const w = this.cashierOf(pi);
    rt.rating = pr.shop ? rateLayout(rt.grid, pr.shop.items, pr.shop.kind, w && w.auto >= 4 ? SHOPS.tidyBonus : 0) : rateLayout(rt.grid, [], 'snack');
    const pct = Math.round(rt.rating.total * 100);
    if (pct > this.sim.state.stats.bestLayout) this.sim.state.stats.bestLayout = pct;
    rt.version++;
  }

  private newShop(pi: number, kind: ShopKind): ShopState {
    const g = this.grid(pi) as Grid;
    const prices: Record<string, number> = {};
    for (const p of productsFor(kind)) prices[p.id] = p.fair;
    const shop: ShopState = { kind, items: [], prices, sold: 0, earned: 0 };
    for (const s of SHOPS.starter) {
      const pl = autoPlace(g, shop.items, s.type);
      if (pl) {
        this.assignProduct(shop, pl);
        shop.items.push(pl);
      }
    }
    return shop;
  }

  private assignProduct(shop: ShopState, p: Placed): void {
    const slot = FURNITURE[p.type].slot;
    if (!slot) return;
    const options = productsFor(shop.kind, slot);
    // pick the product of this slot the shop has least of
    let best = options[0];
    let bestN = Infinity;
    for (const o of options) {
      const n = shop.items.filter((it) => it.product === o.id).length;
      if (n < bestN) {
        bestN = n;
        best = o;
      }
    }
    p.product = best?.id;
    p.stock = FURNITURE[p.type].capacity ?? 0;
  }

  /** Rent (first day paid upfront) or buy a property and open a shop of `kind` with a starter layout. */
  acquire(pi: number, kind: ShopKind, buy: boolean): boolean {
    const inf = this.info(pi);
    if (!inf || this.property(pi)) return false;
    const price = buy ? inf.buyPrice : inf.rentPerDay;
    if (this.sim.state.cash < price) return false;
    this.sim.state.cash -= price;
    const apartments = Array.from({ length: Math.max(0, inf.floors - 1) }, () => ({ status: 'empty' as const, endsAt: 0 }));
    const p: PropertyState = { id: pi, status: buy ? 'owned' : 'rented', shop: this.newShop(pi, kind), apartments };
    this.sim.state.properties.push(p);
    this.ensureRuntime(p);
    this.sim.state.stats.properties = this.sim.state.properties.length;
    if (buy) this.sim.state.stats.owned++;
    this.sim.milestone('firstShop');
    this.sim.events.emit({ type: 'propertyAcquired', property: pi, owned: buy });
    return true;
  }

  /** Buy a property you already rent. */
  buyOut(pi: number): boolean {
    const p = this.property(pi);
    const inf = this.info(pi);
    if (!p || !inf || p.status === 'owned' || this.sim.state.cash < inf.buyPrice) return false;
    this.sim.state.cash -= inf.buyPrice;
    p.status = 'owned';
    this.sim.state.stats.owned++;
    this.sim.events.emit({ type: 'propertyAcquired', property: pi, owned: true });
    return true;
  }

  place(pi: number, item: Placed): boolean {
    const p = this.property(pi);
    const g = this.grid(pi);
    if (!p?.shop || !g) return false;
    const cost = FURNITURE[item.type].cost;
    if (this.sim.state.cash < cost || !canPlace(g, p.shop.items, item)) return false;
    this.sim.state.cash -= cost;
    const it: Placed = { type: item.type, i: item.i, j: item.j, rot: item.rot };
    this.assignProduct(p.shop, it);
    // a new shelf arrives empty: you stock it
    if (it.stock !== undefined) it.stock = 0;
    p.shop.items.push(it);
    this.rerate(pi);
    return true;
  }

  move(pi: number, idx: number, to: Pick<Placed, 'i' | 'j' | 'rot'>): boolean {
    const p = this.property(pi);
    const g = this.grid(pi);
    const it = p?.shop?.items[idx];
    if (!p?.shop || !g || !it) return false;
    const cand: Placed = { ...it, ...to };
    if (!canPlace(g, p.shop.items, cand, it)) return false;
    it.i = to.i;
    it.j = to.j;
    it.rot = to.rot;
    this.rerate(pi);
    return true;
  }

  remove(pi: number, idx: number): boolean {
    const p = this.property(pi);
    const it = p?.shop?.items[idx];
    if (!p?.shop || !it) return false;
    p.shop.items.splice(idx, 1);
    this.sim.state.cash += Math.round(FURNITURE[it.type].cost * SHOPS.sellBack);
    this.rerate(pi);
    return true;
  }

  /** Cycles the product on a piece of furniture (stock is kept as value, swapped 1:1 at wholesale). */
  cycleProduct(pi: number, idx: number): boolean {
    const p = this.property(pi);
    const it = p?.shop?.items[idx];
    const slot = it ? FURNITURE[it.type].slot : undefined;
    if (!p?.shop || !it || !slot) return false;
    const opts = productsFor(p.shop.kind, slot);
    if (opts.length < 2) return false;
    const k = opts.findIndex((o) => o.id === it.product);
    it.product = (opts[(k + 1) % opts.length] as { id: string }).id;
    it.stock = 0;
    this.rerate(pi);
    return true;
  }

  restock(pi: number): number {
    const p = this.property(pi);
    if (!p?.shop) return 0;
    let spent = 0;
    for (const it of p.shop.items) {
      const f = FURNITURE[it.type];
      const prod = it.product ? productById(it.product) : undefined;
      if (!f.capacity || !prod) continue;
      const want = f.capacity - (it.stock ?? 0);
      const n = Math.max(0, Math.min(want, Math.floor((this.sim.state.cash - spent) / prod.cost)));
      it.stock = (it.stock ?? 0) + n;
      spent += n * prod.cost;
    }
    this.sim.state.cash -= spent;
    const rt = this.runtime.get(pi);
    if (rt) rt.stockVersion++;
    if (spent > 0) this.sim.bump('restocks');
    return spent;
  }

  setPrice(pi: number, product: string, price: number): void {
    const p = this.property(pi);
    const prod = productById(product);
    if (!p?.shop || !prod) return;
    const v = Math.max(Math.round(prod.fair * 0.4 * 2) / 2, Math.min(Math.round(prod.fair * 3 * 2) / 2, Math.round(price * 2) / 2));
    if (p.shop.prices[product] === v) return;
    p.shop.prices[product] = v;
    this.sim.bump('priceChanges');
  }

  /** Hire candidate k as cashier for property pi. */
  hireCashier(k: number, pi: number): number {
    const p = this.property(pi);
    if (!p?.shop || this.cashierOf(pi)) return -1;
    return this.sim.hireFor(k, -1, pi);
  }

  renovate(pi: number, floor: number): boolean {
    const p = this.property(pi);
    const a = p?.apartments[floor];
    if (!p || p.status !== 'owned' || !a || a.status !== 'empty') return false;
    const cost = this.renovateCost(floor);
    if (this.sim.state.cash < cost) return false;
    this.sim.state.cash -= cost;
    a.status = 'renovating';
    a.endsAt = this.sim.state.worldTime + SHOPS.apartment.renovateSec * (1 + floor * 0.5);
    this.sim.events.emit({ type: 'renovating', property: pi, floor });
    return true;
  }

  renovateCost(floor: number): number {
    return Math.round(SHOPS.apartment.renovateCost * Math.pow(SHOPS.apartment.renovateGrowth, this.sim.state.stats.tenants + floor));
  }

  apartmentRent(floor: number): number {
    return Math.round(SHOPS.apartment.rentPerDay * Math.pow(SHOPS.apartment.rentGrowth, floor));
  }

  /** Net rent per game day: + apartments, − rented shops. */
  rentBalancePerDay(): number {
    let v = 0;
    for (const p of this.sim.state.properties) {
      const inf = this.info(p.id);
      if (p.status === 'rented' && inf) v -= inf.rentPerDay;
      p.apartments.forEach((a, k) => {
        if (a.status === 'rented') v += this.apartmentRent(k);
      });
    }
    return v;
  }

  // ---------------------------------------------------------------- tick

  tick(): void {
    const st = this.sim.state;
    // rent & apartment income, continuously
    const bal = this.rentBalancePerDay();
    if (bal !== 0) st.cash = Math.max(0, st.cash + (bal * DT) / DAY_SEC);
    this.settleRenovations();
    for (const p of st.properties) {
      if (!p.shop) continue;
      const rt = this.runtime.get(p.id);
      if (!rt) continue;
      if (this.sim.rng.chance(this.arrivalRate(p.id) * DT)) this.recruit(p.id);
      this.tickCheckout(p, rt);
      const w = this.cashierOf(p.id);
      if (w) this.tickCashier(p, rt, w);
    }
  }

  /** Tenants move in once a renovation is done (also after offline time). */
  settleRenovations(): number {
    const st = this.sim.state;
    let n = 0;
    for (const p of st.properties) {
      p.apartments.forEach((a, k) => {
        if (a.status === 'renovating' && st.worldTime >= a.endsAt) {
          a.status = 'rented';
          st.stats.tenants++;
          n++;
          this.sim.events.emit({ type: 'tenant', property: p.id, floor: k });
        }
      });
    }
    return n;
  }

  /** Offline: sells from stock at a reduced rate (restocks only with a trained cashier). Returns revenue. */
  creditOffline(seconds: number, eff: number): { earned: number; items: number } {
    let earned = 0;
    let items = 0;
    for (const p of this.sim.state.properties) {
      const shop = p.shop;
      if (!shop) continue;
      const rate = this.arrivalRate(p.id, false);
      const w = this.cashierOf(p.id);
      let want = Math.floor(rate * seconds * eff * 1.6);
      const restock = !!w && w.auto >= 2;
      for (const it of shop.items) {
        if (want <= 0) break;
        const prod = it.product ? productById(it.product) : undefined;
        const cap = FURNITURE[it.type].capacity ?? 0;
        if (!prod || !cap) continue;
        const share = Math.ceil(want / Math.max(1, shop.items.filter((x) => x.product).length));
        let n = Math.min(share, it.stock ?? 0);
        it.stock = (it.stock ?? 0) - n;
        let rev = n * (shop.prices[prod.id] ?? prod.fair);
        if (restock) {
          const extra = share - n;
          rev += extra * ((shop.prices[prod.id] ?? prod.fair) - prod.cost);
          n += extra;
          it.stock = cap;
        }
        want -= n;
        items += n;
        earned += rev;
      }
      shop.sold += items;
    }
    const st = this.sim.state;
    st.cash += earned;
    st.stats.earned += earned;
    st.stats.shopSales += items;
    return { earned, items };
  }

  private tickCheckout(p: PropertyState, rt: ShopRuntime): void {
    const front = rt.queue[0];
    if (front === undefined) return;
    const ped = this.sim.peds[front] as Ped;
    if (ped.state !== PedState.InShop || ped.phase !== ShopPhase.Queue || ped.slot !== 0 || ped.waypoints.length) return;
    const w = this.cashierOf(p.id);
    const sec = w ? SHOPS.cashierSec * (w.auto >= 5 ? WORKERS.fastMul : 1) : SHOPS.selfCheckoutSec;
    rt.serveT += DT;
    if (rt.serveT < sec) return;
    rt.serveT = 0;
    const shop = p.shop as ShopState;
    const st = this.sim.state;
    st.cash += ped.basket;
    shop.earned += ped.basket;
    shop.sold += ped.items;
    st.stats.earned += ped.basket;
    st.stats.shopSales += ped.items;
    this.sim.addIncome(ped.basket);
    if (w) {
      // cashiers are paid per customer served, and learn from it
      st.cash -= Math.min(st.cash, workerWage(w));
      if (addXp(w, WORKERS.xpPerPortion)) this.sim.events.emit({ type: 'workerLevel', worker: w.id, level: w.level });
    }
    this.sim.events.emit({ type: 'shopSale', property: p.id, amount: ped.basket, items: ped.items });
    ped.basket = 0;
    ped.items = 0;
    ped.mood = Mood.Happy;
    ped.moodT = 2;
    rt.queue.shift();
    rt.queue.forEach((id, k) => {
      const q = this.sim.peds[id] as Ped;
      q.slot = k;
      this.goQueueSlot(p.id, q);
    });
    this.exit(p.id, ped);
  }

  private tickCashier(p: PropertyState, rt: ShopRuntime, w: WorkerState): void {
    if (w.auto >= 2 && this.stockFraction(p.id) < 0.35) this.restock(p.id);
    if (w.auto >= 3 && p.shop) {
      rt.idleT = rt.inside.length === 0 ? rt.idleT + DT : 0;
      rt.priceT += DT;
      if (rt.priceT >= WORKERS.autoPrice.stepEverySec) {
        rt.priceT = 0;
        const busy = rt.queue.length >= 3 || rt.inside.length >= this.capacity(p.id);
        for (const prod of productsFor(p.shop.kind)) {
          const cur = p.shop.prices[prod.id] ?? prod.fair;
          if (busy && cur < prod.fair * WORKERS.autoPrice.maxFactor) this.setPrice(p.id, prod.id, cur + 0.5);
          else if (rt.idleT > WORKERS.autoPrice.downIdleSec && cur > prod.fair * WORKERS.autoPrice.minFactor) this.setPrice(p.id, prod.id, cur - 0.5);
        }
      }
    }
  }

  // ---------------------------------------------------------------- customers

  private doorOutside(pi: number): { x: number; z: number } {
    const g = this.grid(pi) as Grid;
    return { x: g.door.x + g.door.nx * 0.9, z: g.door.z + g.door.nz * 0.9 };
  }

  private recruit(pi: number): void {
    const rt = this.runtime.get(pi);
    if (!rt) return;
    const d = this.doorOutside(pi);
    const ped = this.sim.recruitPed(d.x, d.z, 24);
    if (!ped) return;
    ped.state = PedState.ToShop;
    ped.shop = pi;
    ped.basket = 0;
    ped.items = 0;
    ped.waypoints = [d.x, d.z];
    rt.inside.push(ped.idx);
  }

  /** Moves a shop customer one tick; returns when the ped left the shop system. */
  tickPed(p: Ped): void {
    const pi = p.shop;
    const rt = this.runtime.get(pi);
    const pr = this.property(pi);
    if (!rt || !pr?.shop) {
      this.release(p);
      return;
    }
    if (p.waypoints.length) {
      this.walk(p, p.state === PedState.ToShop ? p.speed : 1.0);
      return;
    }
    if (p.state === PedState.ToShop) {
      // at the door: step in
      p.state = PedState.InShop;
      p.phase = ShopPhase.Enter;
      p.cell = rt.grid.entry;
      const c = cellPos(rt.grid, rt.grid.entry);
      p.waypoints = [c.x, c.z];
      return;
    }
    switch (p.phase as ShopPhase) {
      case ShopPhase.Enter: {
        // plan stops: product furniture with stock that we can reach
        const blocked = blockedMap(rt.grid, pr.shop.items);
        const options: number[] = [];
        pr.shop.items.forEach((it, k) => {
          if (FURNITURE[it.type].slot && (it.stock ?? 0) > 0 && accessCell(rt.grid, it) >= 0 && !blocked[accessCell(rt.grid, it)]) options.push(k);
        });
        const n = Math.min(options.length, this.sim.rng.int(SHOPS.stopsMin, SHOPS.stopsMax));
        p.stops = [];
        while (p.stops.length < n) {
          const k = this.sim.rng.pick(options);
          if (!p.stops.includes(k)) p.stops.push(k);
        }
        this.nextStop(pi, p);
        break;
      }
      case ShopPhase.ToStop:
        p.phase = ShopPhase.Browse;
        p.waitT = SHOPS.browseSec;
        {
          const it = pr.shop.items[p.stops[0] as number];
          if (it) {
            const a = cellPos(rt.grid, it.i + it.j * rt.grid.cols);
            p.heading = Math.atan2(a.x - p.x, a.z - p.z);
          }
        }
        break;
      case ShopPhase.Browse:
        p.waitT -= DT;
        if (p.waitT > 0) break;
        this.take(pr, p);
        p.stops.shift();
        this.nextStop(pi, p);
        break;
      case ShopPhase.ToCheckout:
        p.phase = ShopPhase.Queue;
        break;
      case ShopPhase.Queue:
        // waiting: handled by tickCheckout
        break;
      case ShopPhase.Exit:
        this.leaveBuilding(p);
        break;
    }
  }

  private take(pr: PropertyState, p: Ped): void {
    const shop = pr.shop as ShopState;
    const it = shop.items[p.stops[0] as number];
    const prod = it?.product ? productById(it.product) : undefined;
    if (!it || !prod || (it.stock ?? 0) <= 0) return;
    const price = shop.prices[prod.id] ?? prod.fair;
    const chance = Math.min(0.95, 0.8 * Math.pow(prod.fair / Math.max(0.1, price), SHOPS.elasticity));
    if (!this.sim.rng.chance(chance)) return;
    const n = Math.min(it.stock ?? 0, this.sim.rng.int(1, SHOPS.itemsMax));
    it.stock = (it.stock ?? 0) - n;
    p.items += n;
    p.basket += n * price;
    const rt = this.runtime.get(pr.id);
    if (rt) rt.stockVersion++;
  }

  private nextStop(pi: number, p: Ped): void {
    const rt = this.runtime.get(pi) as ShopRuntime;
    const pr = this.property(pi) as PropertyState;
    const shop = pr.shop as ShopState;
    const blocked = blockedMap(rt.grid, shop.items);
    const next = p.stops[0];
    if (next !== undefined) {
      const it = shop.items[next];
      const a = it ? accessCell(rt.grid, it) : -1;
      if (a < 0) {
        p.stops.shift();
        this.nextStop(pi, p);
        return;
      }
      this.routeTo(rt, blocked, p, a);
      p.phase = ShopPhase.ToStop;
      return;
    }
    if (p.items > 0) {
      rt.queue.push(p.idx);
      p.slot = rt.queue.length - 1;
      p.phase = ShopPhase.ToCheckout;
      this.goQueueSlot(pi, p);
    } else {
      p.mood = Mood.Angry;
      p.moodT = 2;
      this.exit(pi, p);
    }
  }

  private goQueueSlot(pi: number, p: Ped): void {
    const rt = this.runtime.get(pi) as ShopRuntime;
    const shop = (this.property(pi) as PropertyState).shop as ShopState;
    const co = shop.items.find((it) => it.type === 'checkout');
    const blocked = blockedMap(rt.grid, shop.items);
    if (!co) {
      this.exit(pi, p);
      return;
    }
    const a = accessCell(rt.grid, co);
    const [fx, fz] = DIRS[co.rot] as readonly [number, number];
    let i = a % rt.grid.cols;
    let j = Math.floor(a / rt.grid.cols);
    for (let k = 0; k < p.slot; k++) {
      const ni = i + fx;
      const nj = j + fz;
      if (ni < 0 || nj < 0 || ni >= rt.grid.cols || nj >= rt.grid.rows || blocked[nj * rt.grid.cols + ni]) break;
      i = ni;
      j = nj;
    }
    this.routeTo(rt, blocked, p, j * rt.grid.cols + i);
    if (p.phase === ShopPhase.Queue) p.phase = ShopPhase.ToCheckout;
  }

  private exit(pi: number, p: Ped): void {
    const rt = this.runtime.get(pi) as ShopRuntime;
    const shop = (this.property(pi) as PropertyState).shop as ShopState;
    const k = rt.queue.indexOf(p.idx);
    if (k >= 0) rt.queue.splice(k, 1);
    this.routeTo(rt, blockedMap(rt.grid, shop.items), p, rt.grid.entry);
    const d = this.doorOutside(pi);
    p.waypoints.push(d.x, d.z);
    p.phase = ShopPhase.Exit;
  }

  private routeTo(rt: ShopRuntime, blocked: Uint8Array, p: Ped, to: number): void {
    const cells = p.cell === to ? [] : path(rt.grid, blocked, p.cell, to);
    p.waypoints = [];
    for (const c of cells) {
      const pos = cellPos(rt.grid, c);
      p.waypoints.push(pos.x, pos.z);
    }
    if (!cells.length && p.cell !== to) {
      // no path (layout changed): teleport-free fallback → walk straight
      const pos = cellPos(rt.grid, to);
      p.waypoints.push(pos.x, pos.z);
    }
    p.cell = to;
  }

  private walk(p: Ped, speed: number): void {
    const tx = p.waypoints[0] as number;
    const tz = p.waypoints[1] as number;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    const step = speed * DT;
    p.moving = 1;
    if (d <= step) {
      p.x = tx;
      p.z = tz;
      p.waypoints.splice(0, 2);
      if (!p.waypoints.length) p.moving = 0;
    } else {
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      p.heading = Math.atan2(dx, dz);
    }
    p.stride += Math.min(step, d);
  }

  private leaveBuilding(p: Ped): void {
    this.release(p);
    // back onto the sidewalk graph at the nearest node
    let best: PathNode | null = null;
    let bd = Infinity;
    for (const n of this.sim.city.nodes) {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (!best) {
      p.leaving = true;
      return;
    }
    this.sim.rejoin(p, best);
  }

  /** Removes a ped from shop bookkeeping (also when a shop disappears). */
  release(p: Ped): void {
    const rt = this.runtime.get(p.shop);
    if (rt) {
      const k = rt.inside.indexOf(p.idx);
      if (k >= 0) rt.inside.splice(k, 1);
      const q = rt.queue.indexOf(p.idx);
      if (q >= 0) rt.queue.splice(q, 1);
    }
    p.shop = -1;
    p.waypoints = [];
  }

  /** Furniture type list (for UI). */
  static types(): readonly FurnitureId[] {
    return Object.keys(FURNITURE) as FurnitureId[];
  }
}
