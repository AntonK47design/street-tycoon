import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { UPGRADES, upgradeCost } from '../../src/data/upgrades';
import { Bot, runPacing } from '../../src/sim/bot';
import { batchSize, fairPrice, stockCap, suppliesCap } from '../../src/sim/cart';
import { PedState } from '../../src/sim/peds';
import { Sim } from '../../src/sim/sim';
import { newGameState } from '../../src/sim/state';

const steps = (sim: Sim, sec: number): void => {
  for (let i = 0; i < sec * BALANCE.SIM_HZ; i++) sim.step();
};

describe('sim', () => {
  it('is deterministic for the same inputs', () => {
    const a = Sim.fresh();
    const b = Sim.fresh();
    const ba = new Bot(a);
    const bb = new Bot(b);
    for (let i = 0; i < 1800; i++) {
      ba.tick();
      a.step();
      bb.tick();
      b.step();
    }
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.peds.map((p) => [p.x, p.z])).toEqual(b.peds.map((p) => [p.x, p.z]));
  });

  it('sends the first customers straight to the first cart', () => {
    const sim = Sim.fresh();
    expect(sim.runtime[0]?.queue.length).toBe(BALANCE.start.firstCustomers);
    steps(sim, 12);
    const front = sim.peds[sim.runtime[0]!.queue[0]!]!;
    expect(front.state).toBe(PedState.Queue);
  });

  it('cooks a batch from supplies, never above the stock cap', () => {
    const sim = Sim.fresh();
    const c = sim.state.carts[0]!;
    expect(sim.startCook(0)).toBe('ok');
    expect(sim.startCook(0)).toBe('busy');
    expect(sim.finishCook(0, 1)).toBe(batchSize(c));
    expect(c.supplies).toBe(BALANCE.cart.startSupplies - batchSize(c));
    sim.startCook(0);
    sim.finishCook(0, 0);
    expect(c.stock).toBe(stockCap(c));
    expect(sim.canCook(0)).toBe('full');
  });

  it('sells to queued customers, earns money and gets dirty', () => {
    const sim = Sim.fresh();
    sim.startCook(0);
    sim.finishCook(0, 1);
    const cash0 = sim.state.cash;
    steps(sim, 20);
    expect(sim.state.stats.served).toBeGreaterThanOrEqual(2);
    expect(sim.state.cash).toBeGreaterThan(cash0);
    expect(sim.state.carts[0]!.clean).toBeLessThan(100);
    expect(sim.state.milestones.firstSale).toBeGreaterThan(0);
  });

  it('upgrades cost money and change the cart', () => {
    const sim = Sim.fresh();
    expect(sim.buyUpgrade(0, 'grill')).toBe(false);
    sim.state.cash = 1000;
    const before = batchSize(sim.state.carts[0]!);
    expect(sim.buyUpgrade(0, 'grill')).toBe(true);
    expect(sim.state.cash).toBe(1000 - upgradeCost('grill', 0));
    expect(batchSize(sim.state.carts[0]!)).toBe(before + UPGRADES.grill.perLevel);
    sim.buyUpgrade(0, 'pantry');
    expect(suppliesCap(sim.state.carts[0]!)).toBe(BALANCE.cart.suppliesCap + UPGRADES.pantry.perLevel);
    const fp = fairPrice(sim.state.carts[0]!);
    sim.state.cash = 1e6;
    sim.buyUpgrade(0, 'recipe');
    expect(fairPrice(sim.state.carts[0]!)).toBeGreaterThan(fp);
  });

  it('clamps prices to the allowed range', () => {
    const sim = Sim.fresh();
    sim.setPrice(0, 9999);
    expect(sim.state.carts[0]!.price).toBe(Math.round(fairPrice(sim.state.carts[0]!) * BALANCE.cart.priceMaxFactor * 2) / 2);
    sim.setPrice(0, -5);
    expect(sim.state.carts[0]!.price).toBeGreaterThan(0);
    expect(sim.state.stats.priceChanges).toBe(2);
  });

  it('buys more carts on free spots only', () => {
    const sim = Sim.fresh();
    sim.state.cash = 10000;
    const spot = sim.freeSpots()[0]!;
    expect(sim.buyCart(spot.id)).toBe(1);
    expect(sim.buyCart(spot.id)).toBe(-1);
    expect(sim.state.carts.length).toBe(2);
    expect(sim.state.milestones.secondCart).toBeDefined();
  });

  it('restocks what it can afford', () => {
    const sim = Sim.fresh();
    const c = sim.state.carts[0]!;
    c.supplies = 0;
    sim.state.cash = 6;
    const n = sim.restock(0);
    expect(n).toBeGreaterThan(0);
    expect(sim.state.cash).toBeGreaterThanOrEqual(0);
    expect(c.supplies).toBe(n);
  });

  it('never soft-locks: a broke cart without stock or supplies gets a free crate', () => {
    const sim = Sim.fresh();
    const c = sim.state.carts[0]!;
    c.supplies = 0;
    c.stock = 0;
    sim.state.cash = 0;
    let rescued = false;
    sim.events.on((e) => {
      if (e.type === 'rescue') rescued = true;
    });
    sim.step();
    expect(rescued).toBe(true);
    expect(sim.canCook(0)).toBe('ok');
  });

  it('completes quests in order and pays rewards', () => {
    const sim = Sim.fresh();
    const done: string[] = [];
    sim.events.on((e) => {
      if (e.type === 'questDone' && !e.side) done.push(e.id);
    });
    sim.startCook(0);
    sim.finishCook(0, 2);
    sim.step();
    expect(done).toEqual(['q_cook']);
    expect(sim.state.quest).toBe(1);
  });

  it('cleaning restores cleanliness after a short delay', () => {
    const sim = Sim.fresh();
    sim.state.carts[0]!.clean = 40;
    expect(sim.clean(0)).toBe(true);
    steps(sim, BALANCE.cart.cleanSec + 0.2);
    expect(sim.state.carts[0]!.clean).toBe(100);
  });

  it('keeps the pedestrian population near the target', () => {
    const sim = new Sim(newGameState(), 50);
    steps(sim, 60);
    expect(sim.activeCount()).toBeGreaterThan(35);
    expect(sim.activeCount()).toBeLessThanOrEqual(sim.peds.length);
  });

  it('pacing: second cart within the corridor for an average player', () => {
    const m = runPacing(Sim.fresh(), 240);
    expect(m.firstSale).toBeLessThan(25);
    expect(m.firstUpgrade).toBeLessThan(75);
    expect(m.secondCart).toBeLessThan(200);
  });
});
