/* npm run sim:pacing — plays the economy headless with an "average player" bot and checks the milestone corridor. */
import { CURRENT_PHASE, PACING } from '../src/data/pacing';
import { runPacing } from '../src/sim/bot';
import { Sim } from '../src/sim/sim';
import { newGameState } from '../src/sim/state';

const MINUTES = Number(process.argv[2] ?? 15);
const RUNS = Number(process.argv[3] ?? 5);
const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const results: Array<Record<string, number>> = [];
let log = '';
for (let r = 0; r < RUNS; r++) {
  const st0 = newGameState();
  st0.rng = (st0.rng ^ Math.imul(r + 1, 0x9e3779b1)) >>> 0; // vary pedestrians, not the city
  const sim = new Sim(st0);
  const samples: string[] = [];
  const m = runPacing(sim, MINUTES * 60, undefined, r + 7, (t) => {
    if (r === 0 && t > 0 && t % 60 === 0) {
      const st = sim.state;
      samples.push(
        `  ${fmt(t)}  cash $${st.cash.toFixed(0).padStart(6)}  income $${sim.incomePerMin().toFixed(0).padStart(5)}/min  served ${String(st.stats.served).padStart(4)}  carts ${st.carts.length}  upgrades ${st.stats.upgrades}  quest #${st.quest}  ★${(sim.runtime[0]?.stars ?? 0).toFixed(1)}`,
      );
    }
  });
  results.push(m);
  if (r === 0) log = samples.join('\n');
}

console.log(`Pacing simulator — ${RUNS} runs × ${MINUTES} min, average-player bot\n`);
console.log('Run 1 timeline:\n' + log + '\n');
let fail = false;
console.log('Milestone            target   corridor        median    runs');
for (const p of PACING) {
  if (p.phase > CURRENT_PHASE) {
    console.log(`  ${p.id.padEnd(18)} ${fmt(p.target).padStart(6)}   (phase ${p.phase})`);
    continue;
  }
  const ts = results.map((m) => m[p.id]).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
  const med = ts.length === RUNS ? (ts[Math.floor(ts.length / 2)] as number) : NaN;
  const ok = Number.isFinite(med) && med >= p.min && med <= p.max;
  if (!ok) fail = true;
  console.log(
    `  ${p.id.padEnd(18)} ${fmt(p.target).padStart(6)}   ${fmt(p.min)}–${fmt(p.max)}`.padEnd(42) +
      `${Number.isFinite(med) ? fmt(med) : 'never'}`.padStart(8) +
      `    ${ts.map(fmt).join(' ')}  ${ok ? 'OK' : 'OUT OF CORRIDOR'}`,
  );
}
if (fail) {
  console.error('\nPACING FAILED');
  process.exit(1);
}
console.log('\nPACING OK');
