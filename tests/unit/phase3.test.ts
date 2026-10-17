import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { FURNITURE } from '../../src/data/shops';
import { applyOffline } from '../../src/sim/retention';
import { accessCell, autoPlace, canPlace, makeGrid, rateLayout, type Placed } from '../../src/sim/shop-layout';
import { DAY_SEC } from '../../src/sim/shops';
import { Sim } from '../../src/sim/sim';

const steps = (sim: Sim, sec: number): void => {
  for (let i = 0; i < sec * BALANCE.SIM_HZ; i++) sim.step();
};

describe('shop layout', () => {
  const sim = Sim.fresh();
  const b = sim.city.buildings[sim.city.properties[0]!.building]!;
  const g = makeGrid(b);

  it('has an entrance on the grid edge facing the street', () => {
    const i = g.entry % g.cols;
    const j = Math.floor(g.entry / g.cols);
    expect(i === 0 || j === 0 || i === g.cols - 1 || j === g.rows - 1).toBe(true);
  });

  it('rejects overlaps, out-of-bounds, blocked entrance and blocked access', () => {
    const shelf: Placed = { type: 'shelf', i: 1, j: 1, rot: 0 };
    expect(canPlace(g, [], shelf)).toBe(true);
    expect(canPlace(g, [shelf], { type: 'fridge', i: 2, j: 1, rot: 0 })).toBe(false);
    expect(canPlace(g, [], { type: 'shelf', i: g.cols - 1, j: 0, rot: 0 })).toBe(false);
    const ei = g.entry % g.cols;
    const ej = Math.floor(g.entry / g.cols);
    expect(canPlace(g, [], { type: 'plant', i: ei, j: ej, rot: 0 })).toBe(false);
    // a fridge right in front of the shelf blocks its access cell
    const a = accessCell(g, shelf);
    expect(canPlace(g, [shelf], { type: 'fridge', i: a % g.cols, j: Math.floor(a / g.cols), rot: 0 })).toBe(false);
  });

  it('rates layouts: closed without checkout, better with variety and decor', () => {
    expect(rateLayout(g, [], 'snack').open).toBe(false);
    const items: Placed[] = [];
    for (const t of ['checkout', 'shelf'] as const) items.push(autoPlace(g, items, t)!);
    items[1]!.product = 'chips';
    const r1 = rateLayout(g, items, 'snack');
    expect(r1.open).toBe(true);
    const more = [...items];
    for (const t of ['fridge', 'display', 'plant', 'lamp'] as const) {
      const p = autoPlace(g, more, t)!;
      if (FURNITURE[t].slot) p.product = t === 'fridge' ? 'soda' : 'fruit';
      more.push(p);
    }
    expect(rateLayout(g, more, 'snack').total).toBeGreaterThan(r1.total);
  });
});

describe('shops', () => {
  it('renting opens a working shop that sells to walk-in customers', () => {
    const sim = Sim.fresh();
    sim.state.cash = 5000;
    const inf = sim.shops.info(0)!;
    expect(sim.shops.acquire(0, 'snack', false)).toBe(true);
    expect(sim.shops.acquire(0, 'snack', false)).toBe(false);
    expect(sim.state.cash).toBe(5000 - inf.rentPerDay);
    expect(sim.state.milestones.firstShop).toBeDefined();
    const rt = sim.shops.runtime.get(0)!;
    expect(rt.rating.open).toBe(true);
    steps(sim, 240);
    expect(sim.state.stats.shopSales).toBeGreaterThan(0);
    expect(sim.state.properties[0]!.shop!.earned).toBeGreaterThan(0);
  });

  it('charges rent continuously and buying stops it', () => {
    const sim = Sim.fresh();
    sim.state.cash = 100000;
    sim.shops.acquire(0, 'gift', false);
    const perDay = sim.shops.rentBalancePerDay();
    expect(perDay).toBeLessThan(0);
    expect(sim.shops.buyOut(0)).toBe(true);
    expect(sim.shops.rentBalancePerDay()).toBe(0);
    expect(sim.state.stats.owned).toBe(1);
  });

  it('furniture: place costs money, sell refunds half, restock fills shelves', () => {
    const sim = Sim.fresh();
    sim.state.cash = 5000;
    sim.shops.acquire(0, 'flower', true);
    const g = sim.shops.grid(0)!;
    const items = sim.state.properties[0]!.shop!.items;
    const spot = autoPlace(g, items, 'display')!;
    const cash = sim.state.cash;
    expect(sim.shops.place(0, spot)).toBe(true);
    expect(sim.state.cash).toBe(cash - FURNITURE.display.cost);
    const idx = items.length - 1;
    expect(items[idx]!.stock).toBe(0);
    expect(sim.shops.restock(0)).toBeGreaterThan(0);
    expect(items[idx]!.stock).toBe(FURNITURE.display.capacity);
    const c2 = sim.state.cash;
    expect(sim.shops.remove(0, idx)).toBe(true);
    expect(sim.state.cash).toBe(c2 + Math.round(FURNITURE.display.cost * 0.5));
  });

  it('apartments: renovate an owned building, tenant pays rent (also offline)', () => {
    const sim = Sim.fresh();
    sim.state.cash = 1e5;
    sim.shops.acquire(0, 'snack', true);
    const p = sim.state.properties[0]!;
    expect(p.apartments.length).toBeGreaterThan(0);
    expect(sim.shops.renovate(0, 0)).toBe(true);
    const r = applyOffline(sim, 3600);
    expect(r.tenants).toBe(1);
    expect(sim.state.stats.tenants).toBe(1);
    expect(sim.shops.rentBalancePerDay()).toBeGreaterThan(0);
    const cash = sim.state.cash;
    const r2 = applyOffline(sim, DAY_SEC);
    expect(r2.rent).toBeGreaterThan(0);
    expect(sim.state.cash).toBeGreaterThan(cash);
  });

  it('a cashier can be hired for the shop and trained stage 2 restocks', () => {
    const sim = Sim.fresh();
    sim.state.cash = 1e5;
    sim.shops.acquire(0, 'snack', false);
    const id = sim.shops.hireCashier(0, 0);
    expect(id).toBeGreaterThan(0);
    expect(sim.shops.cashierOf(0)?.id).toBe(id);
    sim.workerById(id)!.auto = 2;
    for (const it of sim.state.properties[0]!.shop!.items) if (it.stock !== undefined) it.stock = 0;
    sim.step();
    expect(sim.shops.stockFraction(0)).toBeGreaterThan(0.9);
  });

  it('saves and reloads shops exactly', async () => {
    const { normalizeGame } = await import('../../src/core/save');
    const sim = Sim.fresh();
    sim.state.cash = 1e4;
    sim.shops.acquire(1, 'gift', true);
    sim.shops.renovate(1, 0);
    steps(sim, 30);
    const g = normalizeGame(JSON.parse(JSON.stringify(sim.state)));
    expect(g.properties).toEqual(JSON.parse(JSON.stringify(sim.state.properties)));
    const sim2 = new Sim(g);
    sim2.step();
    expect(sim2.shops.runtime.get(1)?.rating.open).toBe(true);
  });
});
