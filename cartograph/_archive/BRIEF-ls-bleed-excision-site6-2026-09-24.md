# Diary — BRIEF-ls-bleed-excision §3.1, site 6 (the sky at St. Louis's latitude)

Retired from the live brief 2026-09-24 (Wellhead): site 6 was closed by `e688555c` (*"Every town's sky was painted on St. Louis's schedule while its sun stood in the right place"*); `hydrate-anchor-cards.js` no longer exists and the sky derives per town (`src/cartograph/skyGrid.js`, ▶ `node checks/claims-sky-follows-its-town.mjs`). Kept for the reasoning, not the currency.

### 3.1 ⚠️ Site 6 is NOT a constant swap — scope it honestly

The generator (`hydrate-anchor-cards.js`) builds the whole 4×24×5 sky table from `lat/lon/tz` +
SunCalc, so **no data need be acquired** — that half is genuinely easy and the file is re-runnable.

The hard half is **consumption**: `skyGrid.js:160` exports `ANCHOR_CARDS` as a **static module
constant**, read by pure functions (`buildMosaicForDate`, `resolveSkyAtMinute`, `flankingAnchors`)
across four files (`CelestialBodies.jsx`, `Atmosphere.jsx`, `SkyGradientGrid.jsx`, `proceduralSky.js`).
Per-Look means deciding **where per-Look cards live and how the render reaches them** — most likely
baked into `scene.json` with the consumers rewired to read the slab.

**This is a render-path change and the eye gates it across all seven TOD slots**
(`feedback_proxy_render_is_not_the_operator_eye`). ⛔ Do not land it on a proxy render. **M–L, not S.**

**Also fix while in there:** `skyGrid.js`'s `SKY_ANCHOR_DOY` / `flankingAnchors(doy)` take **no
latitude** and hardcode northern solstice/equinox day-numbers, while `useCalendar.js:26` correctly
inverts seasons for `lat < 0`. A southern-hemisphere town gets a summer calendar against a winter sky.
Latent; no install affected.

