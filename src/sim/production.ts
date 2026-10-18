import { BALANCE } from '../data/balance';
import { FACILITIES, GOODS, LAND, recipeById, recipesFor, type FacilityKind, type GoodId, type Recipe } from '../data/production';
import { WORKERS } from '../data/workers';
import type { Parcel } from './city';
import type { Sim } from './sim';
import type { FacilityState, ParcelState, WorkerState } from './state';
import { addXp, workerWage } from './workers';

const DT = 1 / BALANCE.SIM_HZ;

/** Land, facilities, storage and the trading post. Jobs run on world time, so they also finish offline. */
export class ProductionSystem {
  /** Goods produced since the last call to takeProduced() (offline report, effects). */
  private produced = 0;

  constructor(private readonly sim: Sim) {}

  private get st() {
    return this.sim.state;
  }

  // ---------------------------------------------------------------- queries

  parcel(id: number): Parcel | undefined {
    return this.sim.city.parcels[id];
  }

  owned(id: number): ParcelState | undefined {
    return this.st.land.parcels.find((p) => p.id === id);
  }

  /** The facility on a parcel (also when the parcel is the annex of a merged facility). */
  facilityAt(id: number): { main: ParcelState; f: FacilityState } | null {
    const p = this.owned(id);
    if (!p) return null;
    const main = p.annexOf >= 0 ? this.owned(p.annexOf) : p;
    return main?.facility ? { main, f: main.facility } : null;
  }

  parcelPrice(): number {
    return Math.round(LAND.parcelCost * Math.pow(LAND.parcelGrowth, this.st.land.parcels.length));
  }

  storageCap(): number {
    return LAND.storageCap + LAND.storageUpgrade * this.st.land.storageLevel;
  }

  storageUpgradeCost(): number {
    return Math.round(LAND.storageUpgradeCost * Math.pow(LAND.storageUpgradeGrowth, this.st.land.storageLevel));
  }

  stored(): number {
    let n = 0;
    for (const v of Object.values(this.st.land.storage)) n += v ?? 0;
    return n;
  }

  have(g: GoodId): number {
    return this.st.land.storage[g] ?? 0;
  }

  price(g: GoodId): number {
    const sat = this.st.land.saturation[g] ?? 0;
    return Math.round(GOODS[g].price * (1 - sat) * 100) / 100;
  }

  workerOf(parcelId: number): WorkerState | undefined {
    return this.st.workers.find((w) => w.facility === parcelId);
  }

  depth(f: FacilityState): number {
    return Math.min(LAND.maxDepth, 1 + Math.floor(f.dug / LAND.depthEvery));
  }

  /** Recipes this facility can run right now (mine depth, ranch animal). */
  recipes(f: FacilityState): Recipe[] {
    return recipesFor(f.kind).filter((r) => (r.depth ?? 0) <= this.depth(f) && (!r.animal || !f.animal || r.animal === f.animal));
  }

  /** Output multiplier: merged parcels, ranch herd size, worker training. */
  outputMult(f: FacilityState, w: WorkerState | undefined): number {
    let m = f.merged >= 0 ? LAND.mergedMult : 1;
    if (f.kind === 'ranch') m *= Math.max(0.25, f.animals / LAND.animalsRef);
    if (w) m *= 1 + LAND.yieldPerStage * Math.min(3, w.auto - 1);
    return m;
  }

  jobSec(r: Recipe, w: WorkerState | undefined): number {
    return r.sec * (w && w.auto >= 5 ? WORKERS.fastMul : 1);
  }

  /** Why a job can't start (or null if it can). */
  blocker(id: number): 'building' | 'busy' | 'inputs' | 'cash' | 'storage' | 'none' | null {
    const at = this.facilityAt(id);
    if (!at) return 'none';
    const { f } = at;
    if (this.st.worldTime < f.builtAt) return 'building';
    if (f.job) return 'busy';
    const r = recipeById(f.recipe);
    if (!r) return 'none';
    for (const [g, q] of Object.entries(r.inputs) as Array<[GoodId, number]>) if (this.have(g) < q) return 'inputs';
    if ((r.cost ?? 0) > this.st.cash) return 'cash';
    if (this.stored() >= this.storageCap()) return 'storage';
    return null;
  }

  // ---------------------------------------------------------------- actions

  unlock(): boolean {
    if (this.st.land.unlocked || this.st.cash < LAND.unlockCost) return false;
    this.st.cash -= LAND.unlockCost;
    this.st.land.unlocked = true;
    this.sim.events.emit({ type: 'landUnlocked' });
    return true;
  }

  buyParcel(id: number): boolean {
    if (!this.st.land.unlocked || !this.parcel(id) || this.owned(id)) return false;
    const price = this.parcelPrice();
    if (this.st.cash < price) return false;
    this.st.cash -= price;
    this.st.land.parcels.push({ id, facility: null, annexOf: -1 });
    this.st.stats.parcels = this.st.land.parcels.length;
    return true;
  }

  build(id: number, kind: FacilityKind, animal?: 'chicken' | 'sheep' | 'cow'): boolean {
    const p = this.owned(id);
    const def = FACILITIES[kind];
    if (!p || p.facility || p.annexOf >= 0 || this.st.cash < def.cost) return false;
    this.st.cash -= def.cost;
    const first = recipesFor(kind).find((r) => !r.depth && (!r.animal || r.animal === (animal ?? 'chicken')));
    p.facility = {
      kind,
      recipe: first?.id ?? '',
      job: null,
      builtAt: this.st.worldTime + LAND.buildSec,
      merged: -1,
      animals: kind === 'ranch' ? LAND.animalsStart : 0,
      animal: kind === 'ranch' ? (animal ?? 'chicken') : undefined,
      dug: 0,
      made: 0,
      idleSince: this.st.worldTime + LAND.buildSec,
    };
    this.st.stats.facilities = this.st.land.parcels.filter((x) => x.facility).length;
    this.sim.events.emit({ type: 'facilityBuilt', parcel: id, kind });
    return true;
  }

  /** Merge an owned, empty neighbour into a facility ("Grundstücke zusammenlegen"): bigger output. */
  merge(id: number, other: number): boolean {
    const p = this.owned(id);
    const o = this.owned(other);
    const parcel = this.parcel(id);
    if (!p?.facility || !o || o.facility || o.annexOf >= 0 || p.facility.merged >= 0 || !parcel?.neighbours.includes(other)) return false;
    p.facility.merged = other;
    o.annexOf = id;
    this.sim.bump('merges');
    this.sim.events.emit({ type: 'facilityBuilt', parcel: id, kind: p.facility.kind });
    return true;
  }

  demolish(id: number): boolean {
    const p = this.owned(id);
    if (!p?.facility) return false;
    this.st.cash += Math.round(FACILITIES[p.facility.kind].cost * LAND.refund);
    if (p.facility.merged >= 0) {
      const o = this.owned(p.facility.merged);
      if (o) o.annexOf = -1;
    }
    const w = this.workerOf(id);
    if (w) w.facility = -1;
    p.facility = null;
    this.sim.events.emit({ type: 'facilityBuilt', parcel: id, kind: 'farm' });
    return true;
  }

  setRecipe(id: number, recipe: string): boolean {
    const at = this.facilityAt(id);
    const r = recipeById(recipe);
    if (!at || !r || r.facility !== at.f.kind || at.f.job || !this.recipes(at.f).includes(r)) return false;
    at.f.recipe = recipe;
    return true;
  }

  /** Starts one batch (takes inputs and cost now). */
  start(id: number, at = this.st.worldTime): boolean {
    if (this.blocker(id) !== null) return false;
    const fa = this.facilityAt(id);
    if (!fa) return false;
    const { main, f } = fa;
    const r = recipeById(f.recipe) as Recipe;
    for (const [g, q] of Object.entries(r.inputs) as Array<[GoodId, number]>) this.st.land.storage[g] = this.have(g) - q;
    this.st.cash -= r.cost ?? 0;
    const w = this.workerOf(main.id);
    f.job = { recipe: r.id, endsAt: at + this.jobSec(r, w) };
    return true;
  }

  upgradeStorage(): boolean {
    const c = this.storageUpgradeCost();
    if (this.st.cash < c) return false;
    this.st.cash -= c;
    this.st.land.storageLevel++;
    return true;
  }

  sell(g: GoodId, qty: number): number {
    const n = Math.min(Math.floor(qty), this.have(g));
    if (n <= 0) return 0;
    let total = 0;
    for (let k = 0; k < n; k++) {
      const p = this.price(g);
      total += p;
      const sat = (this.st.land.saturation[g] ?? 0) + p * LAND.saturationPerValue;
      this.st.land.saturation[g] = Math.min(LAND.saturationMax, sat);
    }
    total = Math.round(total * 100) / 100;
    this.st.land.storage[g] = this.have(g) - n;
    this.st.cash += total;
    this.st.stats.earned += total;
    this.st.stats.goodsSold += total;
    this.sim.addIncome(total);
    this.sim.events.emit({ type: 'goodsSold', good: g, qty: n, amount: total });
    return total;
  }

  hireWorker(k: number, parcelId: number): number {
    const at = this.facilityAt(parcelId);
    if (!at || this.workerOf(at.main.id)) return -1;
    // no back-pay: the worker starts from now
    at.f.idleSince = this.st.worldTime;
    return this.sim.hireFor(k, -1, -1, at.main.id);
  }

  // ---------------------------------------------------------------- time

  /** Finishes due jobs; facilities with a worker chain the next batch at the exact time the last one ended
   *  (or when the facility became idle), so offline time produces exactly what online time would. */
  advance(): void {
    const now = this.st.worldTime;
    for (const p of this.st.land.parcels) {
      const f = p.facility;
      if (!f) continue;
      for (let guard = 0; guard < 600; guard++) {
        if (f.job) {
          if (now < f.job.endsAt) break;
          const endedAt = f.job.endsAt;
          if (!this.finish(p, f)) break;
          f.idleSince = endedAt;
        }
        const w = this.workerOf(p.id);
        if (!w || now < f.builtAt) break;
        const t = Math.min(now, Math.max(f.builtAt, f.idleSince ?? now));
        if (!this.start(p.id, t)) {
          f.idleSince = now;
          break;
        }
        // workers are paid per batch they run
        this.st.cash -= Math.min(this.st.cash, workerWage(w) * 6);
        if (addXp(w, 4)) this.sim.events.emit({ type: 'workerLevel', worker: w.id, level: w.level });
      }
    }
  }

  /** Puts a job's output into storage. Returns false (job stays) if storage is full. */
  private finish(p: ParcelState, f: FacilityState): boolean {
    const r = recipeById(f.job?.recipe ?? '');
    if (!r) {
      f.job = null;
      return true;
    }
    const w = this.workerOf(p.id);
    const mult = this.outputMult(f, w);
    const out: Array<[GoodId, number]> = [];
    let total = 0;
    for (const [g, q] of Object.entries(r.outputs) as Array<[GoodId, number]>) {
      const n = Math.max(1, Math.round(q * mult));
      out.push([g, n]);
      total += n;
    }
    if (this.stored() + total > this.storageCap()) {
      if (!f.full) this.sim.events.emit({ type: 'storageFull' });
      f.full = true;
      return false;
    }
    f.full = false;
    for (const [g, n] of out) this.st.land.storage[g] = this.have(g) + n;
    f.job = null;
    f.made += total;
    this.produced += total;
    this.st.stats.produced += total;
    this.sim.milestone('firstGoods');
    if (!FACILITIES[f.kind].raw) this.st.stats.crafted += total;
    if (f.kind === 'mine') f.dug += total;
    if (f.kind === 'ranch') {
      const cap = f.merged >= 0 ? LAND.animalsCapMerged : LAND.animalsCap;
      if (f.animals < cap) f.animals++;
      else this.st.land.storage.livestock = this.have('livestock') + 1;
    }
    this.sim.events.emit({ type: 'produced', parcel: p.id, amount: total, good: out[0]?.[0] ?? 'wheat' });
    return true;
  }

  tick(): void {
    const sat = this.st.land.saturation;
    for (const k of Object.keys(sat) as GoodId[]) {
      const v = (sat[k] ?? 0) - LAND.saturationRecoverPerSec * DT;
      if (v <= 0) delete sat[k];
      else sat[k] = v;
    }
    this.advance();
  }

  /** Offline: prices recover for the time away. */
  recover(seconds: number): void {
    const sat = this.st.land.saturation;
    for (const k of Object.keys(sat) as GoodId[]) {
      const v = (sat[k] ?? 0) - LAND.saturationRecoverPerSec * seconds;
      if (v <= 0) delete sat[k];
      else sat[k] = v;
    }
  }

  takeProduced(): number {
    const n = this.produced;
    this.produced = 0;
    return n;
  }
}
