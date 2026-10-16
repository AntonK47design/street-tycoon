import { describe, expect, it } from 'vitest';
import { generateCity } from '../../src/sim/city';

describe('city layout', () => {
  const a = generateCity(42);

  it('is deterministic for a seed', () => {
    expect(JSON.stringify(generateCity(42))).toBe(JSON.stringify(a));
    expect(JSON.stringify(generateCity(43).buildings)).not.toBe(JSON.stringify(a.buildings));
  });

  it('has a connected sidewalk graph with border nodes', () => {
    for (const n of a.nodes) {
      expect(n.nb.length).toBeGreaterThan(0);
      for (const id of n.nb) expect(a.nodes[id]?.nb).toContain(n.id);
    }
    // BFS from node 0 reaches every node
    const seen = new Set([0]);
    const q = [0];
    while (q.length) {
      for (const nb of a.nodes[q.shift() as number]!.nb) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        q.push(nb);
      }
    }
    expect(seen.size).toBe(a.nodes.length);
    expect(a.nodes.some((n) => n.border)).toBe(true);
  });

  it('offers cart spots on real path edges, first spot on the square', () => {
    expect(a.spots.length).toBeGreaterThanOrEqual(10);
    expect(a.spots[0]?.id).toBe('s_0_0_s');
    for (const s of a.spots) expect(a.nodes[s.a]?.nb).toContain(s.b);
    expect(new Set(a.spots.map((s) => s.id)).size).toBe(a.spots.length);
  });

  it('has doors for customers to come out of', () => {
    expect(a.doors.length).toBeGreaterThan(50);
  });
});
