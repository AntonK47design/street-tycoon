import { describe, expect, it } from 'vitest';
import { loadBlob, migrate, newBlob, normalizeGame, parseBlob, SAVE_BACKUP_KEY, SAVE_KEY, SAVE_VERSION, writeBlob, type KeyValueStore } from '../../src/core/save';
import { runPacing } from '../../src/sim/bot';
import { Sim } from '../../src/sim/sim';

class MemStore implements KeyValueStore {
  m = new Map<string, string>();
  dataGet(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  dataSet(k: string, v: string): void {
    this.m.set(k, v);
  }
  dataRemove(k: string): void {
    this.m.delete(k);
  }
}

describe('save', () => {
  it('round-trips a played game exactly', () => {
    const sim = Sim.fresh();
    runPacing(sim, 200);
    const store = new MemStore();
    const blob = newBlob();
    blob.game = sim.state;
    writeBlob(store, blob);
    const { blob: loaded, fresh } = loadBlob(store);
    expect(fresh).toBe(false);
    expect(loaded.game).toEqual(JSON.parse(JSON.stringify(sim.state)));
    // and the loaded state runs on
    const sim2 = new Sim(loaded.game);
    sim2.step();
    expect(sim2.state.carts.length).toBe(sim.state.carts.length);
  });

  it('starts fresh without a save', () => {
    const { blob, fresh } = loadBlob(new MemStore());
    expect(fresh).toBe(true);
    expect(blob.v).toBe(SAVE_VERSION);
    expect(blob.game.carts.length).toBe(1);
  });

  it('falls back to the backup when the main save is damaged', () => {
    const store = new MemStore();
    const blob = newBlob();
    blob.game.cash = 123;
    writeBlob(store, blob);
    blob.game.cash = 456;
    writeBlob(store, blob);
    expect(parseBlob(store.dataGet(SAVE_BACKUP_KEY))?.game.cash).toBe(123);
    store.dataSet(SAVE_KEY, '{broken');
    expect(loadBlob(store).blob.game.cash).toBe(123);
  });

  it('migrates unversioned blobs', () => {
    const m = migrate({ game: { cash: 50 } });
    expect(m.v).toBe(SAVE_VERSION);
    expect(parseBlob(JSON.stringify({ game: { cash: 50, carts: [{ spot: 's_0_0_s', price: 6 }] } }))?.game.cash).toBe(50);
  });

  it('rejects saves from the future instead of corrupting them', () => {
    expect(parseBlob(JSON.stringify({ v: SAVE_VERSION + 5, game: {} }))).toBeNull();
  });

  it('normalizes garbage into a playable state', () => {
    const g = normalizeGame({ cash: 'lots', carts: [{ spot: 's_0_0_s', up: { grill: 999 }, clean: -40 }, 7], quest: -3 });
    expect(g.cash).toBeGreaterThanOrEqual(0);
    expect(g.carts.length).toBe(1);
    expect(g.carts[0]!.up.grill).toBe(10);
    expect(g.carts[0]!.clean).toBe(0);
    expect(g.quest).toBe(0);
  });
});
