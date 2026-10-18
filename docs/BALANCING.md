# Balancing

All numbers live in `src/data/` (`balance.ts`, `upgrades.ts`, `quests.ts`, `kitchens.ts`, `pacing.ts`).

Run `npm run sim:pacing [minutes] [runs]`. An "average player" bot (`src/sim/bot.ts`: 3 s first reaction, 1.2–2.6 s
between decisions, 2.4 s minigame, 25 % perfect / 50 % good) plays the real `Sim` API and reports the median
milestone times against the corridor in `pacing.ts`. The command exits non-zero if the median is outside the corridor.

Current (Phase 4, 5 runs):

| Milestone | Target | Corridor | Median |
|---|---|---|---|
| First sale | 0:15 | 0:06–0:25 | 0:07 (bot reacts fast; humans ~0:10–0:15) |
| First upgrade | 0:45 | 0:25–1:15 | 0:33 |
| Second cart | 2:00 | 1:25–2:50 | 1:47 |
| First worker | 4:00 | 3:00–5:20 | 3:49 |
| First automation (training done) | 7:00 | 5:30–9:00 | 7:45 |
| First shop rented | 11:00 | 8:30–13:40 | 8:48 |
| "Pays off tomorrow" (40-min training started) | 15:00 | 12:00–18:20 | 12:35 |
| First goods produced (Outskirts) | 41:00 | 30:00–55:00 | 45:46 |

Worker and retention numbers live in `src/data/workers.ts` (`WORKERS`, `RETENTION`).

Levers: `customers.baseRate`, `cart.serveSec`, `cart.batchSize`, upgrade `baseCost/growth`, `carts.costs`, quest rewards.
Income: ~$110/min at 5 min, ~$200/min at 15 min (3 carts, 1–2 cooks).

Shops: `src/data/shops.ts`. Starter snack shop ≈ $50/min sales, ≈ +$20–25/min after rent and wholesale; rent ≈ $57–127 per game day.

Land & production: `src/data/production.ts` (`GOODS` prices, `FACILITIES` costs, `RECIPES_FORWARD`, `LAND`).
A farm earns ≈ $42 per 2-minute wheat batch (30 × $1.60 − $6 seeds) before saturation; processing roughly doubles the value per raw input.
Trading post saturation: −0.06 % price per $1 sold (max −60 %), recovering 0.4 %/s.
