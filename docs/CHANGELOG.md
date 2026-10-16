# Changelog

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
