# HANDOFF — City/County divide as a rendered feature (HiPointe-DeMun)

**Status: SPEC — data acquired, render unbuilt.** New feature surfaced during the HiPointe-DeMun pour (2026-07-02). HiPointe-DeMun straddles a **real jurisdictional boundary**: the City of St. Louis is an independent city (separate from St. Louis County since 1876). Hi-Pointe = City; DeMun = St. Louis County / City of Clayton. Jacob: *"we should make a visual distinction, the city/county divide is real."*

## The decision (Jacob, 2026-07-02)
**Visual treatment = divide LINE + per-side ground TINT**, on its own Stage layer/toggle (like lamps / neon / grade-separated). City side (Hi-Pointe) vs County side (DeMun/Clayton) get subtly different ground washes; a distinct administrative stroke runs along the limit. First-draft + overridable (NEIGHBORHOOD-INPUTS §0.0).

## The data (acquired)
- **`cartograph/data/hipointe-demun/raw/admin_boundaries.json`** — the St. Louis City limit (OSM relation **1180533**, "Saint Louis", admin_level=6), clipped to the extent: **3 segments, ~2835 m**, in local meters (hipointe-demun frame) + WGS84.
- The line runs diagonally through the **west** of the extent — **NOT** along McCausland (150–750 m west of it). Everything west of it (DeMun, Concordia Seminary) is County.
- Neighbors present in-extent (from the admin sweep): County rel 1180456; cities Clayton (139955), Richmond Heights, Maplewood, University City. If side-tint needs true polygon fills (not just half-plane from the line), fetch the **City (1180533) ∩ extent** and **Clayton (139955) ∩ extent** polygons.

## Knobs (Jacob, 2026-07-02 — "the line and tint will need knobs")
Both the line and the tint are **authored, overridable Stage channels** — not hardcoded — living in the Panel (source of truth for authored channels: `feedback_panel_is_source_of_truth_for_authored_channels`), resolved through the per-shot look cascade (`HANDOFF-channel-variant-cascade.md`), mirroring existing Stage knobs (layerColors, TodChannel, per-layer toggle). Minimum set:
- **Layer toggle** — show/hide the whole divide feature.
- **Line** — color · width · dash on-off (+ dash scale) · opacity. (Independent enable.)
- **Tint** — City-side color · County-side color · strength/opacity · enable (independent of the line, so either can run alone).
Reuse existing color-well + slider primitives (`feedback_dont_reinvent_existing_ux`); do not invent new UI. Defaults are a best-guess a operator overrides (§0.0).

## Where it plugs in (pipeline)
`raw/admin_boundaries.json` → carry through prebake/survey as an **admin-boundary layer** (distinct from land-use faces) → **Stage**: (a) stroke the divide polyline as an administrative line; (b) a per-side ground wash (two tints keyed by which side of the line a tile/face falls on). New Stage layer + toggle; mirrors how grade-separated roads / neon are their own layers. Don't reinvent UX — read the existing layer/toggle + land-use-color primitives first (`feedback_dont_reinvent_existing_ux`, `cartograph/RIBBONS.md`, `STAGE.md`).

## Blocked on
The render can't be **seen** until HiPointe has a slab: **skeleton → prebake → survey → bake** must run for `hipointe-demun` first (today only raw OSM/MSBF/parcels exist; `clean/` is empty). So: build the map pipeline for #2, then land this layer.

## Sibling data gap (separate track)
DeMun (County) has **no parcel coverage** — `03-fetch-stl-parcels.py` hits the STL **City** assessor only (returned 3201 City parcels; DeMun absent). DeMun parcels need the **St. Louis County** assessor (a second Tier-② endpoint / new fetch adapter). Tracks with this feature but is its own fetch.
