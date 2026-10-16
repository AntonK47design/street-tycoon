import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { QUESTS } from '../../src/data/quests';
import { RETENTION, WORKERS } from '../../src/data/workers';
import { migrate, parseBlob, SAVE_VERSION } from '../../src/core/save';
import { applyOffline, claimDailyReward, claimTask, dailyRewardAmount, prevDate, refreshDaily, taskProgress } from '../../src/sim/retention';
import { Sim } from '../../src/sim/sim';

const steps = (sim: Sim, sec: number): void => {
  for (let i = 0; i < sec * BALANCE.SIM_HZ; i++) sim.step();
};

describe('workers', () => {
  it('candidates are deterministic and the first is an affordable 1★', () => {
    const a = Sim.fresh().candidates();
    expect(a).toEqual(Sim.fresh().candidates());
    expect(a[0]?.stars).toBe(1);
    expect(a[0]?.cost).toBe(WORKERS.hireCosts[0]);
    expect(new Set(a.map((c) => c.name)).size).toBe(a.length);
  });

  it('a hired cook grills on their own and is paid per portion', () => {
    const sim = Sim.fresh();
    sim.state.cash = 1000;
    expect(sim.hire(0, 0)).toBeGreaterThan(0);
    expect(sim.hire(0, 0)).toBe(-1); // one worker per cart
    expect(sim.state.milestones.firstWorker).toBeDefined();
    steps(sim, 40);
    expect(sim.state.stats.workerCooks).toBeGreaterThan(0);
    expect(sim.state.stats.served).toBeGreaterThan(0);
    expect(sim.workerOf(0)?.xp ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('training runs on world time and unlocks auto-restock', () => {
    const sim = Sim.fresh();
    sim.state.cash = 5000;
    const id = sim.hire(0, 0);
    expect(sim.startTraining(id)).toBe(true);
    expect(sim.startTraining(id)).toBe(false); // already training
    steps(sim, (WORKERS.training[2].sec as number) + 1);
    const w = sim.workerById(id)!;
    expect(w.auto).toBe(2);
    expect(sim.state.milestones.firstAutomation).toBeDefined();
    const c = sim.state.carts[0]!;
    c.supplies = 0;
    steps(sim, 1);
    expect(c.supplies).toBeGreaterThan(0);
  });

  it('long trainings count as the "pays off tomorrow" milestone', () => {
    const sim = Sim.fresh();
    sim.state.cash = 1e5;
    const id = sim.hire(0, 0);
    sim.workerById(id)!.auto = 2;
    expect(sim.startTraining(id)).toBe(true);
    expect(sim.state.stats.longTrainings).toBe(1);
    expect(sim.state.milestones.tomorrowPayoff).toBeDefined();
  });
});

describe('kitchens', () => {
  it('unlock by customers served and cannot be bought early', () => {
    const sim = Sim.fresh();
    sim.state.cash = 1e5;
    const spot = sim.freeSpots()[0]!.id;
    expect(sim.unlockedKitchens()).toEqual(['hotdog']);
    expect(sim.buyCart(spot, 'burger')).toBe(-1);
    sim.state.stats.served = 200;
    expect(sim.unlockedKitchens()).toEqual(['hotdog', 'burger', 'crepe']);
    const ci = sim.buyCart(spot, 'burger');
    expect(sim.state.carts[ci]?.kitchen).toBe('burger');
    expect(sim.state.stats.kitchens).toBe(2);
  });
});

describe('offline', () => {
  it('carts with a cook keep earning; capped at 8 h', () => {
    const sim = Sim.fresh();
    sim.state.cash = 1000;
    sim.hire(0, 0);
    sim.workerOf(0)!.auto = 2;
    const cash = sim.state.cash;
    const r = applyOffline(sim, 3600);
    expect(r.earned).toBeGreaterThan(50);
    expect(sim.state.cash).toBeCloseTo(cash + r.earned, 1);
    const sim2 = Sim.fresh();
    sim2.state.cash = 1000;
    sim2.hire(0, 0);
    sim2.workerOf(0)!.auto = 2;
    const long = applyOffline(sim2, 48 * 3600);
    expect(long.seconds).toBe(RETENTION.offlineCapSec);
  });

  it('without a cook only the cooked stock sells; without restock training supplies run out', () => {
    const sim = Sim.fresh();
    sim.state.carts[0]!.stock = 4;
    const r = applyOffline(sim, 3600);
    expect(r.served).toBeLessThanOrEqual(4);
    const sim2 = Sim.fresh();
    sim2.state.cash = 1000;
    sim2.hire(0, 0);
    const r2 = applyOffline(sim2, 8 * 3600);
    expect(r2.served).toBeLessThanOrEqual(BALANCE.cart.startSupplies);
    expect(sim2.state.carts[0]!.supplies).toBe(0);
  });

  it('finishes trainings that ended while away', () => {
    const sim = Sim.fresh();
    sim.state.cash = 1000;
    const id = sim.hire(0, 0);
    sim.startTraining(id);
    const r = applyOffline(sim, 600);
    expect(r.trained).toBe(1);
    expect(sim.workerById(id)!.auto).toBe(2);
  });
});

describe('daily', () => {
  it('streak grows on consecutive days and resets after a gap', () => {
    const st = Sim.fresh().state;
    expect(prevDate('2026-03-01')).toBe('2026-02-28');
    expect(claimDailyReward(st, '2026-10-16')).toBe(dailyRewardAmount(st, 1));
    expect(claimDailyReward(st, '2026-10-16')).toBe(0);
    claimDailyReward(st, '2026-10-17');
    expect(st.daily.streak).toBe(2);
    claimDailyReward(st, '2026-10-20');
    expect(st.daily.streak).toBe(1);
  });

  it('draws 3 tasks per day and pays them once', () => {
    const st = Sim.fresh().state;
    expect(refreshDaily(st, '2026-10-16')).toBe(true);
    expect(refreshDaily(st, '2026-10-16')).toBe(false);
    expect(st.daily.tasks.length).toBe(RETENTION.dailyTaskCount);
    const p = taskProgress(st, 0)!;
    st.stats[p.def.stat] += p.def.target;
    const cash = st.cash;
    expect(claimTask(st, 0)).toBeGreaterThan(0);
    expect(claimTask(st, 0)).toBe(0);
    expect(st.cash).toBeGreaterThan(cash);
  });
});

describe('save v1 → v2', () => {
  it('maps the old quest index by id', () => {
    const v1 = { v: 1, game: { quest: 5, carts: [{ spot: 's_0_0_s' }] } }; // q_serve40 in the old chain (removed)
    const m = migrate(v1 as Record<string, unknown>);
    expect(m.v).toBe(SAVE_VERSION);
    expect(QUESTS[(m.game as { quest: number }).quest]?.id).toBe('q_hire');
    const v1b = { v: 1, game: { quest: 6, carts: [{ spot: 's_0_0_s' }] } }; // q_appeal4 still exists
    expect(QUESTS[parseBlob(JSON.stringify(v1b))!.game.quest]?.id).toBe('q_appeal4');
  });
});
