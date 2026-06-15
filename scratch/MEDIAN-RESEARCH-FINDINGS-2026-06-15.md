# Median model — deep-research findings (2026-06-15)

Deep-research harness (104 agents, 21 sources, 89 claims → 25 verified → 22 confirmed / 3 killed). Preserved here because the run was expensive and its citations are load-bearing for `HANDOFF-construct-hard-polygons.md` + the `RIBBONS §1` doctrine. **Verdict: construct a generic median positively; never import as the default; abandon real-shape fidelity.**

## Verified findings (confidence high unless noted)
1. **Three median strategies exist; none positively CONSTRUCTS the median by default.** (a) emergent gap between paired one-ways (OSM/A-B Street default); (b) median-as-a-lane "separator" in an ordered cross-section (osm2lanes — markings + width only, *no median type*); (c) opt-in `area:highway=traffic_island` polygon. [OSM wiki Dual_carriageway; a-b-street geometry docs; osm2streets/osm2lanes repos]
2. **osm2streets MERGES dual carriageways into one road by default** (collapses the median entirely) — so the "osm2streets keeps the gap" premise is incomplete; its default consolidation dissolves it. [osm2streets README Transformations]
3. **A/B Street explicitly calls medians a KNOWN LIMITATION:** *"Pedestrian islands, slip lanes, gores, and medians are all real-world elements that don't fit nicely in this model"* (centerline + width). The closest system to ours gave up on centerline-derived median shape. [a-b-street geometry docs]
4. **Centerline→carriageway derivation is a validated primitive (PLOS ONE):** 6-iteration reconstruction (offset/join/trim/extend/snap/connect); divided roads built by offsetting carriageway edges **25% of road width to each side of the centerline** (gated by bi-directionality + ~6 m min width). The median is the IMPLICIT gap between the offsets — width sourced from the areal polygon where measurable, else a class-default offset. [PLOS ONE 10.1371/journal.pone.0262801; PMC8863235]
5. **Importing polygons is a COVERAGE TRAP:** areal road polygons overlap OSM centerlines only ~70% (54% Helsinki), "not widely available everywhere"; `area:highway=traffic_island` is de-facto. ⚠️ **Precise coverage figures could NOT be verified** — 3 claims asserting "<1%" or "85% as areas" were all REFUTED 0-3. Qualitative finding only: coverage is incomplete/uneven → import can't be the reliable default.
6. **RECOMMENDATION (synthesized):** derive a generic symmetric median positively from the carriageway gap as the default; polygon import opt-in only; width = gap-derived where measurable, fixed per-road-class default otherwise. The only approach where every median renders reliably.
7. **Corner case A — refuge / sidewalk-through-median:** a SEPARATE footway layer, not median surface. `footway=traffic_island` (paired with `highway=footway`, alternating with `footway=crossing` for multi-stage), or `crossing:island=yes` when not mapped separately (mutually exclusive). [OSM wiki footway=traffic_island, traffic_calming=island]
8. **Corner case B — signal hardware:** instanced ASSETS from `highway=traffic_signals` points, NOT road/median geometry (medium confidence — absence-of-evidence across StreetGen/osm2streets/A-B Street/PLOS; no primary source prescribes the asset workflow). [ar5iv 1801.05741 StreetGen]

## Killed (0-3) — do not cite
- "85% of OSM traffic islands are micromapped as areas" · "area:highway=traffic_island <1% usage" · "de-facto + ~1% distribution." No trustworthy precise coverage statistic exists.

## Open (not covered by surviving claims)
- How Mapbox/MapLibre, Esri/ArcGIS, Cesium/3D Tiles, Cities:Skylines, Google/Apple 3D specifically handle medians (the named commercial/game targets — no surviving claim).
- Actual area-polygon coverage by region (would set how often import vs fallback fires).
- The median-width default-by-road-class table for a stylized look (25%-of-width vs fixed metric).

## Key sources (primary)
osm2streets (github.com/a-b-street/osm2streets) · osm2lanes · a-b-street.github.io/docs/tech/map/geometry · PLOS ONE PMC8863235 · OSM wiki: Dual_carriageway, Tag:area:highway=traffic_island, Tag:footway=traffic_island, Tag:traffic_calming=island, Key:traffic_signals · StreetGen (ar5iv 1801.05741) · CSUR (Cities:Skylines).
