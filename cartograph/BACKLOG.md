# Cartograph Backlog

Last updated: 2026-04-15

Architecture: The cartograph IS the 3D scene viewed flat (orthographic top-down).
One renderer (StreetRibbons.jsx), two viewports (cartograph = flat, main app = 3D).
No separate SVG renderer. What you see in the cartograph IS what renders in the app.

---

## Phase 0 — Cartograph as Three.js app ✓ COMPLETE

| # | Task | Status |
|---|------|--------|
| 0.1 | cartograph.html + src/cartograph/main.jsx entry point | done |
| 0.2 | vite.config.js multi-page: serve at /cartograph | done |
| 0.3 | CartographApp.jsx: Canvas + orthographic camera + MapControls | done |
| 0.4 | Mount StreetRibbons.jsx (renders all 122 streets + face fills) | done |
| 0.5 | Verify: pan/zoom, flat rendering, full neighborhood visible | done |
| 0.6 | Aerial imagery as ground-plane texture (always mounted, toggle) | done |
| 0.7 | Port surveyor tools as Three.js overlay | done |
| 0.8 | Port marker as window-level overlay, measure as Three.js overlay | done |
| 0.9 | Master CSS (cartograph.css with token system) | done |
| 0.10 | Neighborhood boundary clipping (convex hull of buildings + 100m) | done |
| 0.11 | Camera position persists to localStorage | done |
| 0.12 | Marker as independent toggle (works in any mode) | done |
| 0.13 | Scroll wheel zoom works in all modes | done |

---

## Phase 1 — Land-use face fills ✓ COMPLETE

| # | Task | Status |
|---|------|--------|
| 1.1 | Face-fill polygons in ribbons.json (ring + land_use per face) | done |
| 1.2 | Render face fills in StreetRibbons.jsx | done |
| 1.3 | Land-use color palette | done |
| 1.4 | Verify street layers fully cover face fill at edges | not started |

---

## Phase 2 — Default rendering: pavement + curb only

The system does NOT guess at sidewalks or treelawns. An unmeasured street renders
as pavement fill + curb line only. Sidewalks and treelawns appear ONLY where the
operator has explicitly measured them via the band stack in Measure mode.

| # | Task | Status |
|---|------|--------|
| 2.1 | Strip default sidewalk/treelawn from computeStreetProfile() | not started |
| 2.2 | Pipeline only emits sidewalk/treelawn rings when band stack data exists | not started |
| 2.3 | Verify land-use fill covers to curb edge with no gaps | not started |

---

## Phase 3 — Surveyor → pipeline → renderer loop

When the operator edits centerlines in Surveyor mode and exits, the pipeline
rebuilds ribbons.json and the cartograph reloads with updated geometry.

| # | Task | Status |
|---|------|--------|
| 3.1 | Pipeline reads centerlines.json as primary street source | done (render.js) |
| 3.2 | Pipeline reads centerlines.json in derive.js (for polygonization + ribbons) | not started |
| 3.3 | Exit surveyor → rebuild pipeline → reload cartograph | not started |
| 3.4 | Smooth slider applies Catmull-Rom to centerline before pipeline | done (UI exists) |
| 3.5 | Pipeline reads `capStyle` (round/blunt) from centerlines.json for dead-end streets | not started |
| 3.6 | ribbons.json carries `capStyle` per street for dead-end rendering | not started |
| 3.7 | StreetRibbons.jsx renders round or blunt endcap geometry from `capStyle` | not started |
| 3.8 | Pipeline reads `_bands` (measured band stack) from centerlines.json | not started |
| 3.9 | Band stack → flat profile conversion for ribbons.json | not started |

---

## Phase 4 — Measure mode → pipeline wiring

Band stack defines per-street cross-sections. Operator composes bands visually
in Measure mode; the result flows to the pipeline and renders in the map.

| # | Task | Status |
|---|------|--------|
| 4.1 | Band stack data model (ordered array of material + width per street) | done (in centerlines.json as `_bands`) |
| 4.2 | Measure overlay: filled ribbons + caustic cross-section + draggable nodes | done (needs polish) |
| 4.3 | Code-compliant snap (sidewalk 5ft, treelawn 4.5ft, etc.) | done |
| 4.4 | Copy/paste profile between streets | done (UI) |
| 4.5 | Right-click to add treelawn/sidewalk bands | done |
| 4.6 | Band reorder/remove in panel | done |
| 4.7 | Multiple caustic keyframes per street (width varies along length) | partially done (data model ready, UI has single midpoint) |
| 4.8 | Asymmetric left/right profiles | not started (symmetric flag exists) |
| 4.9 | Batch apply: select streets → paste measured profile | not started |
| 4.10 | Measure overlay visual polish (visibility, contrast, interaction feel) | needs work |

---

## Phase 5 — Corner bands

Arm rings work. Corner bands (sidewalk merge at intersections) are designed
and the bezier formula is proven. Implementation in StreetRibbons.jsx.

| # | Task | Status |
|---|------|--------|
| 5.1 | Implement corner band mesh (proven bezier: ctrl = 2×mid(P0,P1) − oo) | not started |
| 5.2 | All material cases (sidewalk×sidewalk, sidewalk×treelawn, grass×grass) | not started |
| 5.3 | Treelawn dead-end + sidewalk fill-through | not started |
| 5.4 | Aesthetic curb stripe at corners | not started |
| 5.5 | Validate across all 180 intersections | not started |

Architecture: rings not filled, polygonOffset (positive, pushes back), FrontSide.
Winding: CCW from above (indices flipped 2026-04-15). PBR lighting, not flat shader.
DO NOT change the bezier formula. It works.

---

## Phase 6 — Stage (3D art direction tool)

Stage IS the neighborhood app with creative tools instead of app UI. Same Canvas,
same components, different overlay. To be folded into the cartograph as a mode.

### 6A — Environment & cameras

| # | Task | Status |
|---|------|--------|
| 6A.1 | Stage entry point + vite config (stage.html, src/stage/) | done |
| 6A.2 | Shot selector (Hero / Browse / Street) | done |
| 6A.3 | Camera: keyframe timeline, Catmull-Rom, scrubber, speed, go-to | done |
| 6A.4 | Time of day: dawn-to-dawn SunCalc waypoints + slider | done |
| 6A.5–6A.10 | Environment controls (exposure, AO, bloom, grade, grain, haze) | done |
| 6A.11 | Shadow size/samples | done (UI) |
| 6A.12 | GPU budget meter with 30/60fps target | done |
| 6A.13 | StageSky: forked CelestialBodies, opaque sky dome | done |
| 6A.14 | StageArch: forked with thickened cross-section | done |
| 6A.15–6A.19 | Terrain, ribbons edge fade, building pedestals | done |
| 6A.20 | Per-component GPU profiling | not started |
| 6A.21 | **Stage as cartograph toolbar mode (not separate /stage URL)** | **NEXT** |

### 6B — Surfaces (~50 material classes)

| # | Task | Status |
|---|------|--------|
| 6B.1 | Surface gallery UI (tabbed: Streets, Land Use, Walls, Roofs, etc.) | done (UI only) |
| 6B.2 | Per-surface controls: color picker, roughness, emissive, texture | done (UI only) |
| 6B.3 | Surface config store + surfaces.json persistence | not started |
| 6B.4 | Wire StreetRibbons to read colors from surface store | not started |
| 6B.5 | Building wall palette (5 materials → color ranges, per-building seed) | not started |
| 6B.6–6B.9 | Neon palette, tree palette, texture maps, shader balls | not started |

### 6C — Persistence & export

| # | Task | Status |
|---|------|--------|
| 6C.1–6C.4 | shots.json, surfaces.json, environment.json persistence | not started |

---

## Phase 7 — Production migration

Migrate Stage's clean 3D ground to the production app. Replace all SVG/CSS3D hacks.

| # | Task | Status |
|---|------|--------|
| 7.1 | Retire VectorStreets/CSS3D SVG in Scene.jsx | not started |
| 7.2–7.6 | Port StageSky, StageArch, StreetRibbons, pedestals, shadows to production | not started |

---

## Surveyor tool improvements (from 2026-04-15 session)

| # | Task | Status |
|---|------|--------|
| S.1 | Per-street undo (Cmd+Z, 50 levels) | done |
| S.2 | Split at node (two segments, same street identity) | done |
| S.3 | Dead-end endcap preview (round/blunt toggle) | done |
| S.4 | Disabled streets visible as red lines (clickable to re-enable) | done |
| S.5 | Bold nodes with dark outlines | done (needs more contrast) |
| S.6 | Add node (insert point on segment) | not started |
| S.7 | Draw new street | not started |
| S.8 | Join streets at intersection | not started |
| S.9 | Visual weight pass (everything too subtle on aerial) | needs work |

---

## Neighborhood extent (from 2026-04-15 session)

| # | Task | Status |
|---|------|--------|
| N.1 | Convex hull boundary from building catalog | done |
| N.2 | Boundary clipping in StreetRibbons + MapLayers | done |
| N.3 | Refine boundary via marker tool (8 zones marked) | not started |
| N.4 | Fade/vignette at edges (blocks fade, streets fade further) | not started |
| N.5 | Create missing blocks for boundary zones | not started |
| N.6 | Camera default to neighborhood center | not started |

---

## Done (this session, 2026-04-15)

| Item | 
|------|
| Phase 0 complete — cartograph is a working Three.js app at /cartograph |
| Housekeeping: deleted 7 dead files, archived 2 docs, fixed derive.js duplicate key |
| Data contract verified: pipeline output byte-identical to ribbons.json |
| Identity architecture documented (geometry vs identity tracks) |
| Building catalog audited: 1056 buildings with wall/roof materials ready for Stage |
| Master CSS with token system for client theming |
| Marker QA: full round-trip, spatial analysis, overlay toggle |
| Neighborhood boundary: tight convex hull, clipping in all layers |
| Surveyor workspace: aerial + width ribbons, per-street undo, split, endcap preview |
| Measure workspace: band stack model, filled ribbons, caustic cross-sections, code snap |
| Scroll wheel fix, camera persistence, smart cursor hover detection |
