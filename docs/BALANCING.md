# Balancing

All numbers live in `src/data/` (`balance.ts`, `upgrades.ts`, `quests.ts`, `kitchens.ts`, `pacing.ts`).

Run `npm run sim:pacing [minutes] [runs]`. An "average player" bot (`src/sim/bot.ts`: 3 s first reaction, 1.2–2.6 s
between decisions, 2.4 s minigame, 25 % perfect / 50 % good) plays the real `Sim` API and reports the median
milestone times against the corridor in `pacing.ts`. The command exits non-zero if the median is outside the corridor.

Current (Phase 1, 7 runs):

| Milestone | Target | Corridor | Median |
|---|---|---|---|
| First sale | 0:15 | 0:06–0:25 | ~0:07 (bot reacts fast; humans ~0:10–0:15) |
| First upgrade | 0:45 | 0:25–1:15 | ~0:33 |
| Second cart | 2:00 | 1:25–2:50 | ~1:55 |

Levers: `customers.baseRate`, `cart.serveSec`, `cart.batchSize`, upgrade `baseCost/growth`, `carts.costs`, quest rewards.
After the second cart, income stays at ~$120–150/min. Manual cooking caps throughput, so workers (Phase 2) are the next big step.
