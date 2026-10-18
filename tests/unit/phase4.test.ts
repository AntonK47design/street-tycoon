import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { GOODS, LAND, RECIPES, RECIPES_RECYCLE, recipeById } from '../../src/data/production';
import { normalizeGame } from '../../src/core/save';
import { applyOffline } from '../../src/sim/retention';
import { Sim } from '../../src/sim/sim';

const steps = (sim: Sim, sec: number): void => {
  for (let i = 0; i < sec * BALANCE.SIM_HZ; i++) sim.step();
};

const rich = (): Sim => {
  const sim = Sim.fresh();
  sim.state.cash = 1e6;
  sim.production.unlock();
  return sim;
};

describe('land & production data', () => {
  it('every recipe references known goods and every crafted good can be recycled', () => {
    for (const r of RECIPES) for (const g of [...Object.keys(r.inputs), ...Object.keys(r.outputs)]) expect(GOODS).toHaveProperty([g]);
    const crafted = new Set(RECIPES.filter((r) => !['farm', 'ranch', 'mine', 'forest', 'recycler'].includes(r.facility)).flatMap((r) => Object.keys(r.outputs)));
    for (const g of crafted) expect(RECIPES_RECYCLE.some((r) => g in r.inputs), g).toBe(true);
  });

  it('the city has 12 parcels in the Outskirts with neighbours to merge', () => {
    const sim = Sim.fresh();
    expect(sim.city.parcels.length).toBe(12);
    for (const p of sim.city.parcels) expect(p.neighbours.length).toBe(2);
  });
});

describe('production', () => {
  it('needs the district unlocked, then parcels get pricier', () => {
    const sim = Sim.fresh();
    sim.state.cash = 1e5;
    expect(sim.production.buyParcel(0)).toBe(false);
    expect(sim.production.unlock()).toBe(true);
    const p0 = sim.production.parcelPrice();
    expect(sim.production.buyParcel(0)).toBe(true);
    expect(sim.production.buyParcel(0)).toBe(false);
    expect(sim.production.parcelPrice()).toBeGreaterThan(p0);
  });

  it('a farm is built, grows a crop and puts it into storage', () => {
    const sim = rich();
    sim.production.buyParcel(0);
    expect(sim.production.build(0, 'farm')).toBe(true);
    expect(sim.production.blocker(0)).toBe('building');
    steps(sim, LAND.buildSec + 1);
    expect(sim.production.start(0)).toBe(true);
    steps(sim, recipeById('grow_wheat')!.sec + 1);
    expect(sim.production.have('wheat')).toBe(30);
    expect(sim.state.stats.produced).toBe(30);
  });

  it('processing takes inputs; a ranch breeds and a mine gets deeper', () => {
    const sim = rich();
    for (const id of [0, 1, 2]) sim.production.buyParcel(id);
    sim.production.build(0, 'ranch', 'chicken');
    sim.production.build(1, 'mine');
    sim.state.worldTime += LAND.buildSec + 1;
    sim.state.land.storage.wheat = 100;
    expect(sim.production.start(0)).toBe(true);
    expect(sim.production.have('wheat')).toBe(96);
    const f = sim.production.facilityAt(0)!.f;
    const animals = f.animals;
    sim.state.worldTime += 200;
    sim.production.advance();
    expect(f.animals).toBe(animals + 1);
    expect(sim.production.have('egg')).toBeGreaterThan(0);
    const mine = sim.production.facilityAt(1)!.f;
    expect(sim.production.recipes(mine).map((r) => r.id)).toEqual(['dig_stone']);
    mine.dug = LAND.depthEvery * 4;
    expect(sim.production.recipes(mine).map((r) => r.id)).toContain('dig_ore');
  });

  it('merging a neighbour doubles-plus the output', () => {
    const sim = rich();
    sim.production.buyParcel(0);
    sim.production.buyParcel(1);
    sim.production.buyParcel(3);
    sim.production.build(0, 'forest');
    expect(sim.production.merge(0, 3)).toBe(false); // not a neighbour
    expect(sim.production.merge(0, 1)).toBe(true);
    expect(sim.production.facilityAt(1)?.main.id).toBe(0);
    sim.state.worldTime += LAND.buildSec + 1;
    sim.production.start(0);
    sim.state.worldTime += 500;
    sim.production.advance();
    expect(sim.production.have('log')).toBe(Math.round(14 * LAND.mergedMult));
  });

  it('a worker keeps the facility running, also while offline', () => {
    const sim = rich();
    sim.production.buyParcel(0);
    sim.production.build(0, 'farm');
    expect(sim.production.hireWorker(0, 0)).toBeGreaterThan(0);
    sim.state.land.storageLevel = 10;
    const r = applyOffline(sim, 3600);
    // 1 h of 2-min batches (after construction), each 30 wheat
    expect(r.produced).toBeGreaterThan(30 * 20);
    // and stops when storage is full
    const sim2 = rich();
    sim2.production.buyParcel(0);
    sim2.production.build(0, 'farm');
    sim2.production.hireWorker(0, 0);
    expect(applyOffline(sim2, 3600).produced).toBeLessThanOrEqual(sim2.production.storageCap());
  });

  it('storage caps production; the trading post price drops as you sell and recovers', () => {
    const sim = rich();
    sim.state.land.storage.wheat = sim.production.storageCap();
    sim.production.buyParcel(0);
    sim.production.build(0, 'farm');
    sim.state.worldTime += LAND.buildSec + 1;
    expect(sim.production.blocker(0)).toBe('storage');
    const p0 = sim.production.price('wheat');
    const cash = sim.state.cash;
    const got = sim.production.sell('wheat', 200);
    expect(got).toBeGreaterThan(0);
    expect(sim.state.cash).toBeCloseTo(cash + got, 2);
    expect(sim.production.price('wheat')).toBeLessThan(p0);
    steps(sim, 200);
    expect(sim.production.price('wheat')).toBeCloseTo(p0, 2);
  });

  it('recycling gives back most of the inputs', () => {
    const sim = rich();
    sim.production.buyParcel(0);
    sim.production.build(0, 'recycler');
    sim.state.worldTime += LAND.buildSec + 1;
    sim.state.land.storage.furniture = 1;
    expect(sim.production.setRecipe(0, 'recycle_make_furniture')).toBe(true);
    expect(sim.production.start(0)).toBe(true);
    sim.state.worldTime += 200;
    sim.production.advance();
    expect(sim.production.have('plank')).toBe(Math.floor(8 * 0.75));
  });

  it('round-trips land through the save format', () => {
    const sim = rich();
    sim.production.buyParcel(4);
    sim.production.buyParcel(5);
    sim.production.build(4, 'mine');
    sim.production.merge(4, 5);
    sim.state.land.storage.stone = 12;
    sim.production.sell('stone', 2);
    const g = normalizeGame(JSON.parse(JSON.stringify(sim.state)));
    expect(g.land).toEqual(JSON.parse(JSON.stringify(sim.state.land)));
  });
});
