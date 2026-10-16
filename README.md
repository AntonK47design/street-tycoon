# Street Tycoon (working title)

3D business sim for the browser (CrazyGames). Start with one hot dog cart, grow a street-food empire.
Offline and single-player. three.js + TypeScript + Vite.

```
npm install
npm run dev          # http://localhost:5173 (debug overlay: F2)
npm run check        # tsc + eslint
npm run test         # vitest (sim, save, city, locales)
npm run sim:pacing   # headless pacing simulator
npm run size         # build + initial download budget
npm run e2e          # Playwright smoke (desktop + mobile), screenshots in screenshots/
npm run zip          # build + street-tycoon.zip for upload
```

Docs: `docs/GDD.md`, `docs/ARCHITECTURE.md`, `docs/BALANCING.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md`.
