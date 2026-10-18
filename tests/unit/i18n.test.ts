import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import de from '../../src/data/locales/de.json';
import en from '../../src/data/locales/en.json';
import { QUESTS, SIDE_GOALS } from '../../src/data/quests';
import { UPGRADE_ORDER } from '../../src/data/upgrades';
import { FURNITURE_ORDER, PRODUCTS, SHOP_KINDS } from '../../src/data/shops';
import { FACILITIES, FACILITY_ORDER, GOOD_ORDER } from '../../src/data/production';

const files = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? files(join(d, n)) : n.endsWith('.ts') ? [join(d, n)] : []));

describe('locales', () => {
  it('German has every English key and no extras', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('every literal key used in code exists', () => {
    const keys = new Set(Object.keys(en));
    const missing: string[] = [];
    for (const f of files('src')) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) if (!keys.has(m[1] as string)) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('has names for quests and upgrades', () => {
    for (const q of [...QUESTS, ...SIDE_GOALS]) expect(en).toHaveProperty([`quest.${q.id}`]);
    for (const p of PRODUCTS) expect(en).toHaveProperty([`prod.${p.id}`]);
    for (const f of FURNITURE_ORDER) expect(en).toHaveProperty([`furn.${f}`]);
    for (const k of SHOP_KINDS) expect(en).toHaveProperty([`shop.${k}`]);
    for (const g of GOOD_ORDER) expect(en).toHaveProperty([`good.${g}`]);
    for (const f of FACILITY_ORDER) {
      expect(en).toHaveProperty([`fac.${f}`]);
      expect(en).toHaveProperty([`staff.hire.${FACILITIES[f].role}`]);
    }
    for (const a of ['chicken', 'sheep', 'cow']) expect(en).toHaveProperty([`animal.${a}`]);
    for (const id of UPGRADE_ORDER) {
      expect(en).toHaveProperty([`up.${id}.name`]);
      expect(en).toHaveProperty([`up.${id}.fx`]);
    }
  });
});
