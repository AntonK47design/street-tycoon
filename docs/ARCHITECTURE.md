# Architecture

```
src/
  core/       loop (fixed sim tick + interpolated render), rng (seeded), i18n, events, save format
  sim/        pure simulation (no three.js, no DOM): city layout, pedestrians, carts, economy, quests, tutorial
  render/     three.js: renderer + quality tiers, city mesh builder, carts, crowd (instanced, GPU-animated), fx, camera
  ui/         DOM/CSS overlay: HUD, goal bar, cart panel, minigame, placement, settings, toasts, debug overlay
  data/       balance numbers, kitchens, upgrades, quests, pacing targets, locales (en, de)
  platform/   CrazyGames SDK v3 adapter + mock fallback, storage, ad flags
  audio/      WebAudio synthesized SFX (no audio files)
tools/        pacing simulator, bundle size check, zip
tests/        unit (vitest, sim), e2e (Playwright smoke: desktop + mobile)
```

## Rules
- `src/sim/**` never imports three.js, DOM, platform or UI (enforced by ESLint). The view reads sim state
  and subscribes to sim events (`sim.events`).
- The sim runs at a fixed **10 ticks/s** (`balance.SIM_HZ`), deterministic (seeded `Rng`). Rendering runs at
  display rate and interpolates pedestrian positions (`px/pz` → `x/z`).
- Every balancing number lives in `src/data/`. Systems read `BALANCE`, `KITCHENS`, `UPGRADES`, `QUESTS`.
- Player actions go through `Sim` methods (`cook`, `restock`, `clean`, `setPrice`, `buyUpgrade`, `buyCart`).
  The pacing bot uses the same API, so `npm run sim:pacing` measures the real game.
- Platform: only `src/platform/*` touches `window.CrazyGames`. `Platform` wraps it with an idempotent
  gameplayStart/Stop state machine; falls back to `MockAdapter` (localStorage) when the SDK is missing,
  blocked or `environment === 'disabled'`.
- Ads: prepared in the adapter, gated by `VITE_ADS=on` (default off for Basic Launch).

## Rendering
- One vertex-coloured `MeshLambertMaterial` for the whole static city; geometry is generated from modular
  parts (walls, window bays, doors, awnings, roofs, props) and merged per block chunk → ~40 draw calls.
  Ambient occlusion is baked into vertex colours (ground-contact darkening, recess darkening).
- Pedestrians: a single `InstancedMesh`; walk cycle is done in the vertex shader (per-vertex limb id,
  per-instance phase/colours) → 1 draw call (+1 shadow) for up to 100 people.
- Lighting: hemisphere + one directional light with PCF soft shadows; shadow frustum follows the camera
  target. ACES filmic tone mapping, sRGB output, distance fog.
- Quality tiers Low / Medium / High picked from device + GPU string, then corrected by an FPS probe in the
  first seconds. High adds post-processing (FXAA, light bloom, vignette), loaded lazily.

## Save
`SaveBlob { v, savedAt, game, settings, stats }` as JSON in the CrazyGames Data module (fallback
localStorage). `MIGRATIONS[n]` upgrades v n → n+1; `normalize()` fills defaults so new fields never break
old saves. Pedestrians are transient and not saved.
