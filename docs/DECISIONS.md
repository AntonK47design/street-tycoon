# Design decisions

- **Sim tick 10 Hz** (prompt suggested ~4). Queues and walking need smooth positions; the render interpolates. Still deterministic and cheap.
- **Demand-driven customers.** Pedestrians who happen to pass a cart are too few with ≤ 100 visible people. Arrivals are
  a Poisson process per cart: rate = base × traffic × sign × appeal × price × hunger × queue × competition. The nearest walking pedestrian is recruited. If there is none, someone steps out of a nearby door. This keeps the economy independent of the quality tier, and the pacing simulator measures the real game.
- **Fixed cart spots** (16 in the start district) instead of free placement. This avoids blocked sidewalks and bad placements on touch. Spots show foot traffic and competition. Free placement can come with the room editor (Phase 3).
- **Visual time of day never gets dark.** The game day runs 08:00–20:00 and drives demand (lunch/dinner rush). The lighting shifts from morning to golden late afternoon, in line with the art direction.
- **Procedural geometry only** (no external asset packs yet). One vertex-coloured Lambert material, AO baked into vertex colours, buildings merged per block → ~30 draw calls on Medium. No licences to track except the fonts (OFL).
- **Minigame does not pause the game.** Customers keep coming, which keeps it tense and short. Blocking UI (Settings) pauses the sim and reports `gameplayStop`.
- **Low tier**: no shadows, no backdrop ring, fewer people and cars, DPR 1, 30 FPS cap if it still struggles.
- **Anti soft-lock**: if a cart has no stock, no supplies and you cannot afford one portion, a free crate arrives.
- **One cook per cart** (Phase 2 only has the cart role). Hiring uses a deterministic candidate list (seed + hire count), so reloading can't reroll candidates.
- **Training runs on "world time"** (play time + credited absence). Long trainings (40 min+) are the Phase 2 "pays off tomorrow" hook. Production chains with waiting times come in Phase 4.
- **Offline is analytic**: min(demand, cook capacity, serve capacity) × 60 % × time, capped at 8 h. Without stage-2 training, supplies run out. Carts without a cook only sell their stock. This rewards hiring and training, the systems that make the game play itself.
- **Daily reward/tasks use the local calendar date** (the sim stays pure: the app passes `YYYY-MM-DD`). Missing a day resets the streak. The daily button only appears after the second cart, so the first minutes stay focused.
- **Pages deploy** from every push of the default branch; the CrazyGames SDK falls back to the mock (localStorage) there.
- **Rentable spaces are fixed** (6 ground floors of shop buildings near the square). Those buildings are rendered separately from the merged block meshes so they can be cut away. Merging rooms across buildings is postponed.
- **Cut-away = dollhouse**: in the editor the whole exterior is hidden and replaced by an interior floor with 1.15 m walls and a door gap. Furniture is only rendered in cut-away mode (the shell hides it otherwise).
- **Floors**: the ground floor is the shop (editor). Upper floors of an owned building are apartments, managed as a list in the panel's Building tab rather than with an editor.
- **Rent is continuous** (cash never goes below 0, no eviction) to avoid a soft-lock. Shops are tuned to clear rent with the starter layout (~+$20/min) and to roughly double with a good layout.
- **Shop demand** = base × √(area/90) × traffic × (0.3 + 0.9 × layout rating) × price factor. Customers are pedestrians recruited from the street, like cart customers.
