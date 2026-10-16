import { BALANCE } from '../data/balance';
import { KITCHENS } from '../data/kitchens';
import { QUESTS, SIDE_GOALS } from '../data/quests';
import { UPGRADES, UPGRADE_ORDER } from '../data/upgrades';
import { emptyStats, emptyUpgrades, newGameState, type CartState, type GameState } from '../sim/state';

export const SAVE_KEY = 'save';
export const SAVE_BACKUP_KEY = 'save_backup';
export const SAVE_VERSION = 1;

export type QualitySetting = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  quality: QualitySetting;
  sound: boolean;
  lang: 'auto' | 'en' | 'de';
}

export const DEFAULT_SETTINGS: Settings = { quality: 'auto', sound: true, lang: 'auto' };

export interface SaveStats {
  sessions: number;
  playSec: number;
  firstDay: string;
  lastDay: string;
}

/** One versioned JSON blob. */
export interface SaveBlob {
  v: number;
  savedAt: number;
  game: GameState;
  settings: Settings;
  stats: SaveStats;
}

export interface KeyValueStore {
  dataGet(key: string): string | null;
  dataSet(key: string, value: string): void;
  dataRemove(key: string): void;
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * MIGRATIONS[n] upgrades a blob from version n to n+1. Never remove entries: old saves must always load.
 * New fields with defaults do not need a migration — `normalize` fills them in.
 */
export const MIGRATIONS: Record<number, Migration> = {
  // 0 → 1: pre-release blobs had no version field
  0: (raw) => ({ ...raw, v: 1 }),
};

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let cur = raw;
  let v = typeof cur.v === 'number' ? cur.v : 0;
  if (v > SAVE_VERSION) throw new Error(`save from the future (v${v})`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`no migration from v${v}`);
    cur = m(cur);
    v++;
    cur.v = v;
  }
  return cur;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, d: number, min = -Infinity, max = Infinity): number => (isNum(x) ? Math.max(min, Math.min(max, x)) : d);

function normalizeCart(raw: unknown, i: number): CartState | null {
  if (!isObj(raw)) return null;
  const kitchen = typeof raw.kitchen === 'string' && raw.kitchen in KITCHENS ? (raw.kitchen as CartState['kitchen']) : 'hotdog';
  const up = emptyUpgrades();
  const rup = isObj(raw.up) ? raw.up : {};
  for (const id of UPGRADE_ORDER) up[id] = Math.floor(num(rup[id], 0, 0, UPGRADES[id].maxLevel));
  if (typeof raw.spot !== 'string') return null;
  return {
    id: Math.floor(num(raw.id, i + 1, 1)),
    spot: raw.spot,
    kitchen,
    price: num(raw.price, KITCHENS[kitchen].fairPrice, 0.5, 1e6),
    stock: Math.floor(num(raw.stock, 0, 0, 1e4)),
    supplies: num(raw.supplies, BALANCE.cart.startSupplies, 0, 1e5),
    clean: num(raw.clean, 100, 0, 100),
    quality: (Math.floor(num(raw.quality, 1, 0, 2)) as 0 | 1 | 2),
    up,
    served: Math.floor(num(raw.served, 0, 0)),
    earned: num(raw.earned, 0, 0),
  };
}

/** Fills defaults and clamps everything, so a damaged or older blob never crashes the game. */
export function normalizeGame(raw: unknown): GameState {
  const d = newGameState();
  if (!isObj(raw)) return d;
  const carts = Array.isArray(raw.carts) ? raw.carts.map(normalizeCart).filter((c): c is CartState => c !== null) : [];
  const stats = emptyStats();
  const rs = isObj(raw.stats) ? raw.stats : {};
  for (const k of Object.keys(stats) as Array<keyof typeof stats>) stats[k] = num(rs[k], stats[k], 0);
  const side = Array.isArray(raw.side)
    ? raw.side.slice(0, 2).map((s) => (isObj(s) && isNum(s.idx) && s.idx < SIDE_GOALS.length ? { idx: Math.floor(s.idx), base: num(s.base, 0) } : null))
    : d.side;
  while (side.length < 2) side.push(null);
  const flags: Record<string, boolean> = {};
  if (isObj(raw.flags)) for (const [k, v] of Object.entries(raw.flags)) if (typeof v === 'boolean') flags[k] = v;
  const milestones: GameState['milestones'] = {};
  if (isObj(raw.milestones)) for (const [k, v] of Object.entries(raw.milestones)) if (isNum(v)) (milestones as Record<string, number>)[k] = v;
  const g: GameState = {
    seed: Math.floor(num(raw.seed, d.seed)),
    rng: Math.floor(num(raw.rng, d.rng)) >>> 0,
    cash: num(raw.cash, d.cash, 0),
    time: num(raw.time, 0, 0),
    day: Math.floor(num(raw.day, 1, 1)),
    clockMin: num(raw.clockMin, d.clockMin, BALANCE.clock.dayStartMin, BALANCE.clock.dayEndMin),
    carts: carts.length ? carts : d.carts,
    nextCartId: Math.floor(num(raw.nextCartId, carts.length + 1, carts.length + 1)),
    stats,
    quest: Math.floor(num(raw.quest, 0, 0, QUESTS.length)),
    side,
    sideNext: Math.floor(num(raw.sideNext, 2, 0, SIDE_GOALS.length)),
    milestones,
    flags,
  };
  g.stats.carts = g.carts.length;
  return g;
}

function normalizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!isObj(raw)) return s;
  if (raw.quality === 'auto' || raw.quality === 'low' || raw.quality === 'medium' || raw.quality === 'high') s.quality = raw.quality;
  if (typeof raw.sound === 'boolean') s.sound = raw.sound;
  if (raw.lang === 'auto' || raw.lang === 'en' || raw.lang === 'de') s.lang = raw.lang;
  return s;
}

export function today(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function newBlob(now = Date.now()): SaveBlob {
  return { v: SAVE_VERSION, savedAt: now, game: newGameState(), settings: { ...DEFAULT_SETTINGS }, stats: { sessions: 0, playSec: 0, firstDay: today(now), lastDay: today(now) } };
}

export function parseBlob(text: string | null): SaveBlob | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as unknown;
    if (!isObj(raw)) return null;
    const m = migrate(raw);
    const st = isObj(m.stats) ? m.stats : {};
    return {
      v: SAVE_VERSION,
      savedAt: num(m.savedAt, Date.now()),
      game: normalizeGame(m.game),
      settings: normalizeSettings(m.settings),
      stats: {
        sessions: Math.floor(num(st.sessions, 0, 0)),
        playSec: num(st.playSec, 0, 0),
        firstDay: typeof st.firstDay === 'string' ? st.firstDay : today(),
        lastDay: typeof st.lastDay === 'string' ? st.lastDay : today(),
      },
    };
  } catch {
    return null;
  }
}

/** Loads the main save, falling back to the backup copy if the main one is damaged. */
export function loadBlob(store: KeyValueStore): { blob: SaveBlob; fresh: boolean } {
  const main = parseBlob(store.dataGet(SAVE_KEY));
  if (main) return { blob: main, fresh: false };
  const backup = parseBlob(store.dataGet(SAVE_BACKUP_KEY));
  if (backup) return { blob: backup, fresh: false };
  return { blob: newBlob(), fresh: true };
}

/** Writes the blob; the previous good copy becomes the backup. */
export function writeBlob(store: KeyValueStore, blob: SaveBlob, now = Date.now()): void {
  blob.savedAt = now;
  blob.v = SAVE_VERSION;
  const text = JSON.stringify(blob);
  const prev = store.dataGet(SAVE_KEY);
  if (prev && prev !== text && parseBlob(prev)) store.dataSet(SAVE_BACKUP_KEY, prev);
  store.dataSet(SAVE_KEY, text);
}
