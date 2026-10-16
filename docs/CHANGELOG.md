# Changelog

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
