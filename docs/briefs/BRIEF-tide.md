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

## The ruling (Jacob, 2026-09-28): the LEVELS are ours, the TIMING is NOAA's
*"We decide the 'high' and 'low' tides, and clamp them to the times."*
- **The levels are the town's:** its authored low and high (terrain.json `water`: MLLW and MHW, and the flood
  extents baked at them). NOAA's predicted HEIGHTS are never drawn.
- **The timing is NOAA's:** the station's predicted highs and lows. At each predicted high the water stands exactly
  at our high (phase 1), at each low exactly at our low (phase 0), and between two adjacent extrema it eases by a
  half-cosine — so the phase never leaves [0, 1] by construction, with no plateaus.
- **One timing source:** the Almanac's high/low times and the water's phase come from the same `tideExtrema`.
- **How:** the station's harmonic constituents (CO-OPS `harcon`, a few dozen numbers) and MSL above MLLW reach the
  player through the town manifest (`bake-manifest.mjs` → `tide`); `cartograph/tide.mjs` computes the extrema for
  any date. No live API call, no prediction table in the slab, no terrain re-bake.
- A town that is not tidal has no `tide` in its manifest: absent, never zero. A tidal town whose constituents
  cannot be fetched fails the acquisition loudly. Outside the US there is no CO-OPS: name the regional source in the
  intake catalogue when a non-US tidal town arrives, and fail loudly until then.

## Findings
- ⛔ `src/components/SlabRevetment.jsx`, the `levels` memo: `try { return waterLevels(terrainWater()) } catch { return
  null }` swallows the refusal `waterLevels` exists to make, so a town with an unreadable water record draws a dry
  wetted band and says nothing. Filed for the shore's owner; not fixed here.

## Consumers
- The Almanac's back face in The Ward: the next high and low times.
- `tidePhase()` (the water surface and the shore's wetted band): between the town's own low and high, on NOAA's
  clock. ⚠️ This changes what a tidal town's water looks like — Jacob's eye gate, sequenced with the shore's work.

## Checks
- The computed extrema against NOAA's own published predictions for the named station, over a week, within a
  stated tolerance (times and heights of the turning points).
- Every town with `water.tidal === true` has `tide` in its manifest; every other town has none.
- The water's phase stays in [0, 1] over a year of predicted times.

## Docs
Rewrite `cartograph/FEATURES.md` (the water section) for the capability, and the intake catalogue
for the source and its licence.
