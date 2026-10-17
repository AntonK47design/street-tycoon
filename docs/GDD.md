# Street Tycoon — Game Design Document (short)

Working title. Offline single-player 3D business sim for the browser (CrazyGames, desktop + mobile).
Start with one food cart on a market square, grow into a company: carts → workers → shops → land &
production → market → logistics. The "living economy" comes from simulated pedestrians and (later) AI companies.

## KPIs and what serves them

| KPI | Target | Main levers |
|---|---|---|
| Conversion (≥ 1 min played) | ≥ 80 % | No menu, world interactive in < 4 s, cart already placed, hungry customers walking up, first sale ≈ 15 s |
| Avg. session | ≥ 10 min | Always-visible goal bar + 2 side goals, upgrades that change visuals and play, second cart at ~2 min, multitasking between carts |
| Day-1 retention | ≥ 15 % | (Phase 2) offline income, daily reward + streak, daily tasks, things with waiting time |

## Session pacing (tunable in `src/data/pacing.ts`, checked by `npm run sim:pacing`)

| Time | Milestone | Phase |
|---|---|---|
| 0:00–0:10 | World interactive (`gameplayStart`) | 0 |
| ~0:15 | First sale | 1 |
| ~0:45 | First upgrade | 1 |
| ~2:00 | Second cart | 1 |
| ~4:00 | First worker | 2 |
| ~6–8:00 | First automation level | 2 |
| ~10–12:00 | First rented room / shop | 3 |
| ~15:00 | Something that pays out "tomorrow" | 2 |

## Core loop (Phase 1)

1. Pedestrians walk the sidewalks of the start district (Market Square + 8 blocks). Hunger follows the
   day rhythm (lunch and dinner rush).
2. When a pedestrian passes a cart (within its *reach*), they roll once whether to buy. The chance depends
   on **appeal**, **price** vs. the fair price, hunger, queue length and competition from nearby carts of the
   same kitchen.
3. Customers queue. The cart sells from its **stock**; empty stock → customers wait, lose patience, leave.
4. The player refills stock with a **cooking minigame** (timing bar, ~3 s). Result quality (OK / Good /
   Perfect) gives tips and feeds the *taste* part of appeal. One cook = one batch (grill size).
5. Each portion uses **supplies** (bought via *Restock*). Each sale makes the cart a bit dirtier → *Clean*.
6. Cash buys **upgrades** (6 paths per cart, visible on the model) and **more carts** on fixed cart spots.

### Appeal (0–5 stars)
Weighted: cleanliness 30 %, location 30 % (spot foot traffic + sign upgrade), price 25 %, taste 15 %.

### Upgrade paths (per cart)
| Path | Effect | Visual |
|---|---|---|
| Bigger Grill | +1 portion per batch | wider grill, more sausages |
| Quick Hands | faster serving | — (faster vendor animation) |
| Secret Recipe | higher fair price | menu board |
| Neon Sign | longer reach, location appeal | sign grows, glows |
| Shade & Seats | more patience, appeal | umbrella, stools, string lights |
| Cooler Box | more supplies, cheaper ingredients | cooler next to the cart |

### Kitchens
Hotdog (Phase 1). Burger, Sushi, Crêpe, Fish & Chips, Pizza, Burrito are data entries with their own
minigame variant (Phase 2: 3 kitchens total).

## Anti-frustration
- No soft-locks: if cash, stock and supplies are all zero a free starter crate is handed out.
- First customers are patient (tutorial). Tutorial is contextual (arrow + one sentence) and skippable.
- Saving: autosave every 30 s, on `visibilitychange`/`pagehide`, after purchases. Versioned format.

## Phase 2 — Workers & retention
- Cooks (hire per cart, paid per portion, XP levels), 5 automation stages unlocked by real-time training.
- Kitchens: Hot Dog, Burger (40 served), Crêpe (150 served). Different kitchens don't compete.
- Offline earnings (8 h cap, 60 %), "While you were away" popup with an optional 2× rewarded ad.
- Daily reward (7-day streak) + 3 daily tasks.

## Phase 3 — Real estate & shops
- Rent or buy ground-floor shop spaces; Snack / Flower / Gift shops with products, wholesale restock, prices.
- Room editor in a cut-away view; layout rating (checkout & queue, paths, variety, displays, decor, space) drives sales.
- Cashiers (worker role) with their own automation stages; owned buildings rent out upper floors to tenants.

## Next
Land & production (4); market (5); logistics (6).
