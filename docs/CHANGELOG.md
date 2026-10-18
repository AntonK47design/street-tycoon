# Changelog

## Phase 4 — Land & production

- **The Outskirts**: three blocks east of the start district open for $1,200 once the city runs (goal after "earn $5,000"). A HUD button flies the camera between the city and the Outskirts.
- **12 parcels** to buy (price grows with each one). Each parcel shows a world label: price, facility, worker, and a warning when storage is full or materials are missing.
- **Raw producers**: farm (wheat, potatoes, tomatoes, cotton — visible rows that grow with the batch), ranch (chickens, sheep or cows that wander in their pen; every batch breeds an animal until the pen is full, then surplus becomes livestock), forest (trees regrow), quarry (a terraced pit that visibly gets deeper; coal from depth 2, ore from depth 4).
- **Processing**: mill & bakery, sawmill, smelter (with smoke), loom, butcher, workshop (furniture, tools, gadgets) and a recycling yard that takes any crafted good apart into 75 % of its inputs. All recipes are data (`src/data/production.ts`).
- **Merge** two neighbouring parcels into a large facility (×2.2 output). **Demolish** refunds half the cost.
- **Workers** for facilities (farmer, miner, craftsman): they start every batch on their own, also offline; training stages raise yield and then speed.
- **Storage & trading post**: one shared storage with upgrades. Selling pushes the price down (saturation) and it recovers over time. This is the first step towards the Phase 5 market.
- Offline: facilities keep producing while you're away and the popup shows the goods produced.
- Goal chain: open the Outskirts, buy a parcel, build a farm, produce, sell goods, craft, 3 facilities, merge, craft 200. New daily tasks: produce, sell goods. The guide points at each step (unless the tutorial was skipped).
- Save format v4 with migration. New pacing milestone `firstGoods` (~41 min).

## Phase 3 — Real estate & shops

- **6 rentable shop spaces** in the start district, each marked with a "For rent" sign and label in the world. Rent is paid continuously per game day. Buying costs 28 days of rent and ends the rent.
- **Shops**: Snack, Flower or Gift shop with 4–5 products each, a wholesale restock and per-product prices. Customers walk in through the door, browse 1–3 shelves, queue at the checkout and pay. Self-checkout is slow; a hired **cashier** is fast, and their training stages are: fills shelves → sets prices → keeps it tidy → faster.
- **Room editor** with a cut-away view (upper floors and walls hidden, low dollhouse walls) and a 1 m grid. It has 8 furniture types (shelf, fridge, display, checkout, plant, lamp, rug, bench). You can place, rotate, move, change the product or sell, with a green/red ghost preview. Placement can't block the entrance or another piece's access spot.
- **Layout rating** (0–100 %) built from checkout and queue space, reachable paths, product variety, display density, decor and free space. It drives how many people come in. Without a reachable checkout and a stocked shelf, the shop is closed.
- **Owned buildings**: renovate the upper floors (real-time timer) and tenants move in and pay rent per game day, also while you're away.
- Offline earnings now include shops (from stock, or restocked by a trained cashier), rent and tenants.
- Goal chain extended: rent a shop, sell 15 items, reach a 70 % layout, second shop, buy a building, first and fourth tenant. Save format v3 with migration.

## Phase 2 — Workers & retention (first Basic Launch candidate)

- **Cooks**: hire one per cart from 3 candidates (1–3★, wage per portion only while producing). They cook on their own, gain XP and level up (faster, better dishes).
- **Automation stages** per cook via training: cooks → buys supplies → sets prices → cleans → works faster. Trainings run on real time (1 min, 40 min, 2 h, 6 h) and keep going while you're away.
- **Kitchens**: Burger (unlocks at 40 customers served) and Crêpe (150), with their own minigame steps, cart sign and food. Kitchens are picked when buying a cart; different kitchens don't compete.
- **Offline earnings**: on return (or after a long hidden tab) the absence is credited analytically, capped at 8 h, at 60 % efficiency. A "While you were away" popup shows the result, with a 2× rewarded-ad button behind `VITE_ADS`.
- **Daily reward** with a 7-day streak and **3 daily tasks** per calendar day. Returning players see them after the offline popup.
- Goal chain extended to 21 goals: hire, train, new kitchen, long training ("pays off tomorrow").
- Save format v2 with migration of the Phase 1 quest index.
- Blocking popups pause the sim and report `gameplayStop`, with nesting handled.
- World labels are projected after the camera update and snapped to whole pixels, so they no longer lag or jitter. The "Cook!" pulse is calmer.
- CI on GitHub Actions (check, tests, pacing, size, e2e, zip artifact) and a GitHub Pages deployment.

## Phase 0 + 1 — Setup and core loop

**Setup (Phase 0)**
- Vite + TypeScript (strict) + three.js, ESLint, Vitest, Playwright (desktop + mobile).
- CrazyGames SDK v3 adapter (`src/platform/`) with an idempotent gameplay/loading state machine and a mock fallback
  (localStorage) for when the SDK is missing, blocked (adblock) or disabled. Ads are prepared and gated by `VITE_ADS`, off by default.
- Versioned save format with migrations, normalization (damaged saves never crash) and a backup copy.
- Quality tiers Low/Medium/High: picked automatically from the device and GPU, then stepped down by an FPS watchdog. Can be changed in Settings.
- Debug overlay, dev builds only (F2 / backquote): FPS, draw calls, triangles, heap, milestones, 1×/4×/16× time, cash cheat.
- `npm run size` (initial download budget), `npm run sim:pacing` (headless pacing simulator), `npm run zip`.

**Core loop (Phase 1)**
- Procedural start district from a seed: Market Square with a fountain, lawns and benches; 8 surrounding blocks of
  modular buildings (shop fronts, striped awnings, balconies, gable or flat roofs); 2 rings of backdrop city with LOD.
- Pedestrians (one instanced draw call, walk cycle in the vertex shader), ambient car traffic that stops for people and at crossings.
- Hot dog cart: cooking minigame (two timing taps, ~3 s, OK/Good/Perfect), stock, supplies, cleanliness, price, 4-part appeal, 6 upgrade paths that are visible on the model.
- Demand model with a lunch and dinner rush. Customers walk up, queue, pay, tip and show emotes. They leave if you keep them waiting too long.
- Additional carts on marked spots, with foot-traffic ratings and a competition warning.
- Goal bar with a 15-step chain, 2 rotating side goals, a contextual skippable tutorial and one-off tips.
- Juice: coin bursts, cash popups, sparkles, cart squash and pop, synthesized WebAudio SFX, haptics.
- Autosave every 30 s, on hide or pagehide, and after purchases.
- English + German.
