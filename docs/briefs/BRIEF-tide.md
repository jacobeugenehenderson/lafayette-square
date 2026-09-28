<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-27
evict-when: RULING: the computed-vs-NOAA tide check exists and passes on every tidal town
-->
# BRIEF — Tide, for towns that have one

**For:** a fresh agent, in the kit. **Written:** 2026-09-27.
**Spec it serves:** The Ward's `README.md` §4 (tide on the back of the Almanac) and §7 (a lighter
slab).

## What exists — confirm, and say what you found
1. **The water shader's tide is a stub.** `tidePhase()` in `cartograph/waterLevel.mjs` returns a
   constant (`WaterSurface.jsx` feeds it to `uPhase`).
2. **The bake already names the tide station.** A town's `public/baked/<town>/terrain.json`
   carries a `water` record: `tidal`, the low and high datums, and the nearest NOAA station (id,
   name, position). At writing, one poured town is tidal (station 8446121) and one is a
   non-tidal Great Lakes gauge (`tidal: false`). ▶
   `node -e "for (const t of require('fs').readdirSync('public/baked')) { try { const w = require('./public/baked/'+t+'/terrain.json').water; console.log(t, w ? {tidal: w.tidal, station: w.station?.id} : '—') } catch {} }"`
3. `waterLevels()` in the same file already refuses a record it cannot read (*"a missing level is
   never read as 0"*). Keep that standard.

## The approach to evaluate first — it fits the lighter-slab rule
A tide is a sum of known harmonic constituents. NOAA publishes each station's constituents. So:
**bake the station's constituents** (a few dozen numbers) **and compute the tide in the player**,
for any date, forever, with no live API call and no table of predictions in the slab.
- ⚠️ **To verify before building:** that CO-OPS serves harmonic constituents for the station the
  bake names, their units and datum, and that the computed curve matches NOAA's published
  predictions for that station over a test window. That comparison **is** the check.
- A town that is not tidal has no tide face and no tide data: absent, never zero.
- A tidal town whose constituents cannot be fetched fails the bake loudly.
- Outside the US there is no CO-OPS. The source is per region; name it in the intake catalogue
  when a non-US tidal town arrives, and fail loudly until then.

## Consumers
- The Almanac's back face in The Ward: the tide now, the next high and low.
- `tidePhase()` in the water shader: the water level moves with the real tide.

## Checks
- Computed vs NOAA's published predictions for the named station, over a week, within a stated
  tolerance.
- Every town with `water.tidal === true` has constituents in its slab; every other town has none.

## Docs
Rewrite `cartograph/FEATURES.md` (the water section) for the capability, and the intake catalogue
for the source and its licence.
