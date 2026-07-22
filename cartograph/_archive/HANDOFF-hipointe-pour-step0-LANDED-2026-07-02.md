# HANDOFF — HiPointe-DeMun pour, step 0 (extent + folder palace)

**Agent: FRESH.** The first concrete step of pouring neighborhood #2. Self-contained; the whole design landed in `NEIGHBORHOOD-INPUTS.md` (commit `2bcbe3f1`). This step is *only* the extent + the folder + the config seam — deliberately small.

## Name yourself, then read (in order)
1. `CLAUDE.md` route gate → `ORIENTATION.md` → `README §⭐ START HERE`.
2. `NEIGHBORHOOD-INPUTS.md` — the pour template. Especially **§0.0** (the governing law: *everything is a best guess and overridable*), **§0.1** (the three transferability tiers), **§7** (pour sequence), **§9** (the HiPointe extent), **§11** (intake = Cartograph's step 0, on the aerial).
3. `cartograph/INTAKE.md §0–1` — the sources + the local metric frame (`config.py`: CENTER + `x=(lon−CENTER_LON)·86774`, `z=(CENTER_LAT−lat)·111000`).
4. `src/instance.js` — the per-neighborhood config seam (lookId, geography center lat/lon, projection constants, timezone, domain).

## The task — stand up the extent + the folder, nothing heavier
1. **Geocode the extent (§9).** Resolve the four border streets to their corner intersections (McCausland∩Oakland/Forest-Park-Pkwy = NW · ∩Big Bend = NE · Big Bend∩Clayton = SE · Clayton∩McCausland = SW) → a box → a **center lat/lon + radius (m)** that contains it. Use OSM / Nominatim via WebFetch/WebSearch. Report the numbers *and how you got them*; the contested edges (Skinker, Wydown/DeMun) are best-guess — **flag them, don't agonize** (they're operator-nudgeable on the aerial later, §11).
2. **Folder palace.** Create `cartograph/data/hipointe-demun/` mirroring `cartograph/data/lafayette-square/` (its `raw/` + `clean/` layout) and write `neighborhood_boundary.json` (center + radius) — the extent artifact the pipeline clips to.
3. **Instance config.** Draft the HiPointe geography block for `src/instance.js`: lookId `hipointe-demun`, name, center lat/lon, timezone `America/Chicago`, domain TBD, and **recompute `lonToMeters = 111320·cos(centerLat)`** for the new latitude (LS's `86774` is latitude-specific; HiPointe is ~38.63°N so it'll be close but recompute honestly). ⚠️ `instance.js` is **single-instance today** ("switching neighborhoods = replace it"). **Do NOT build multi-instance routing** — leave a clean draft and *flag* the routing question as the next step.

## Boundaries
- **Do NOT run the heavy Tier-① fetches** (OSM/MSBF/parcels/LiDAR) — that's step 1, a separate brief. Step 0 is *just* extent + folder + config seam.
- Canon (`INTAKE`, `NEIGHBORHOOD-INPUTS`, `ORIENTATION`) is **read-only.** You may create the new `cartograph/data/hipointe-demun/` files + a draft `instance.js` block.
- Commit only your own new files; leave others' in-flight work untouched. Branch `curb-offset-draw` (or ask Jacob).

## Done =
center + radius reported (with method) · `cartograph/data/hipointe-demun/neighborhood_boundary.json` written · a draft `instance.js` HiPointe block, with the multi-instance-routing question flagged for the next brief.
