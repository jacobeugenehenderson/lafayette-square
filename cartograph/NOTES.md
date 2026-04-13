# Cartograph — Operator Handoff

This document explains how to (re)build the Lafayette Square neighborhood map from
scratch, the principles behind the pipeline, and the work-in-progress problems the
next operator should pick up. Read this top-to-bottom before touching any code.

---

## 1. What the map is

A vector neighborhood map of Lafayette Square (St. Louis, MO) rendered as an SVG with a
live HTML preview. The map shows:

- **Streets** (vehicular pavement, with curbs, center stripes, edge lines, bike lanes,
  parking stripes, and labels)
- **Blocks** (the land between streets — rendered in two layers: an outer ring in
  sidewalk color and an inner "lot" filled by dominant land use)
- **Buildings** (footprints positioned to assessor centroids)
- **Alleys, footways, parking aisles, paths**
- **Streetlamps, contour lines, the Lafayette Park polygon**
- **Loop-street medians** (the green centers of Benton Place and Mackay Place)

The pipeline is intended to be reusable — it should not be Lafayette-Square-specific.
Avoid hardcoded coordinates, bespoke fixes, or one-off carve-outs unless truly
unavoidable. Generalizable always wins.

---

## 2. Data sources (inputs)

| File | Source | Contents |
|------|--------|----------|
| `cartograph/data/raw/osm.json` | OpenStreetMap (one-time fetch) | All highway features (streets, alleys, footways, sidewalks, crossings), building footprints, landuse polygons, leisure polygons (park), amenity polygons (parking) |
| `cartograph/data/raw/survey.json` | City Assessor + manual measurement | Per-street `rowWidth`, `pavementHalfWidth`, lane count, oneway, cycleway, type. The variable difference between rowWidth/2 and pavementHalfWidth IS the sidewalk + tree-lawn zone |
| `cartograph/data/raw/elevation.json` | USGS National Map (cached) | Sparse elevation samples for building elevations and contour generation |
| `scripts/raw/stl_parcels.json` | St. Louis City Assessor (one-time fetch) | Parcel polygons with handle, owner, land_use_code, zoning, units, building_sqft, centroid, and rings |
| `cartograph/data/neighborhood_boundary.json` | Hand-curated | Polygon defining what's "in the neighborhood" — render filters blocks/buildings/streets by this |
| `cartograph/data/clean/marker_strokes.json` | Live drawing in preview | Freehand strokes from the marker tool — used as a feedback channel from human → operator |

### CRITICAL: data file safety

These raw files are gitignored but **must never be re-fetched**. The 2026-04-05
incident: a `min_lon` change in `scripts/config.py` from `-90.2255` to `-90.2210`
caused a re-fetch that lost ~4 parcels and changed many parcel vertex positions
permanently. The original 2345 parcels are unrecoverable; we now have 2341 that are
slightly different.

- The correct `min_lon` is **`-90.2255`** (the true original value)
- `.gitignore` now tracks `stl_parcels.json`, `osm.json`, `survey.json`,
  `elevation.json`, `map.json`
- Before doing ANYTHING that re-fetches, back up the existing file first

---

## 3. Architectural principles

These are the load-bearing decisions behind the pipeline. Internalize before changing
the code.

### 3.1 Streets are the master grid
Streets (their measured centerlines + standard widths) define the quadrilateral grid
of the neighborhood. Block faces come from polygonizing the street network. Streets
are the AUTHORITY for "where blocks live."

### 3.2 Variable street/sidewalk gap is intentional
Lafayette Square is a historic neighborhood with non-standard, varied geometry. The
gap between street curb and sidewalk varies street-by-street and sometimes block-by-
block. We measure this from the actual data:
- `survey.json` provides per-street `rowWidth` and `pavementHalfWidth`. The difference
  `(rowWidth/2) − pavementHalfWidth` = the natural variable sidewalk + tree-lawn zone
  on each side
- OSM `footway=sidewalk` lines provide ground-truth confirmation of where sidewalks
  actually exist

### 3.3 Parcels do NOT define block shape
Parcels (assessor data) provide land-use classification and lot detail INSIDE blocks.
They are not the source of truth for block boundaries. The historical neighborhood has
multi-tenant lots, missing parcels, easements, and other irregularities that make
parcel unions an unreliable source for block geometry.

### 3.4 Buildings sit on blocks; they don't define them
Building footprints are decoration. A block exists because of the street grid, not
because there's a building there. Don't use building data to inform block shape.

### 3.5 Sidewalks confirm block existence (positive signal, not geometry)
OSM `footway=sidewalk` lines are inset from the actual block edge (drawn down the
centerline of the sidewalk concrete). They are NOT literal block edges. Use them as
a presence signal: "if there's a sidewalk in a region, that confirms there's a block
nearby." Use this as a fallback validation, not as geometry.

### 3.6 Visual smoothing belongs in the renderer, not the geometry pipeline
Clipper polygon operations should produce sharp-cornered polygons (`jtMiter` joins,
no arc tolerance bloat). All visual corner rounding happens in `render.js` via
`bezierPolyD()` (cubic Bézier corners). This keeps polygon vertex counts low and
gives clean, scale-independent visual output.

---

## 4. Procedure: how to build the map

### 4.1 Prerequisites (do once, then never re-run)
```bash
cd cartograph
node fetch.js              # one-time: fetch OSM data into data/raw/osm.json
node survey.js             # one-time: generate variance data into data/raw/survey.json
# stl_parcels.json should already exist in scripts/raw/ — DO NOT re-fetch
```

### 4.2 Build the map
```bash
cd cartograph
node pipeline.js --skip-elevation     # skips USGS fetch (uses cached elevation)
node render.js                        # generates SVG + preview HTML
open data/clean/preview.html          # view the result
```

### 4.3 Live preview with marker tool
```bash
cd cartograph
node serve.js                         # serves preview at http://localhost:3333
                                      # marker strokes auto-save to marker_strokes.json
                                      # /analyze endpoint reports parcels under strokes
```

The marker tool is the primary way for humans to communicate problem locations to
the operator. When the user says "look at the marker strokes," read
`data/clean/marker_strokes.json` and find which blocks/streets each stroke is near.

---

## 5. Pipeline stages (what happens inside `pipeline.js`)

```
[1] Load raw OSM      → data/raw/osm.json
[2] Snap coordinates  → snap.js (quantize to 0.01m grid)
[3] Derive layers     → derive.js
    [3a] Filter vehicular streets, alleys, sidewalks
    [3b] Polygonize street network → DCEL faces
    [3c] Classify faces (block / park / parking / island / fragment)
    [3d] Assign parcels to block faces
    [3e] Detect dead-end street endpoints
    [3f] Buffer streets → pavement polygons
    [3g] Build blocks per face (current: parcel-union with morph-close)
    [3h] Carve dead-end channels through blocks (Divide rule)
    [3i] Round corners, simplify
    [3j] Derive lot inset, sidewalk strip, alleys, contours
    [3k] Compute building footprints with assessor sizes
[4] Elevation         → USGS interpolation (cached)
[5] Write             → data/clean/map.json
```

`render.js` consumes `map.json` and produces `map.svg` + `preview.html`. It applies
neighborhood boundary filtering, bezier corner rendering, street labels, and the
marker tool UI.

### Key files
| File | Role |
|------|------|
| `pipeline.js` | Top-level orchestration |
| `node.js` | Snap streets to a planar graph (split at intersections) |
| `polygonize.js` | DCEL face extraction from the noded graph |
| `classify.js` | Tag faces as block / park / parking / island / fragment |
| `derive.js` | The big one — does block building, sidewalk derivation, lot inset, alleys, lamps, contours, and building enrichment |
| `render.js` | Convert `map.json` to SVG (bezier corners, layers, labels, preview HTML) |
| `serve.js` | Local dev server with marker tool persistence |
| `standards.js` | Constants for street widths, sidewalk widths, curb radii, etc. |

---

## 6. Block-building approach (current state)

For each polygonized face classified as `block`:

1. **`buildParcelBlock(faceParcels, faceRing)`** unions all parcels in the face using a
   morph-close (4m expand → union → 4m contract) at `jtRound` join with coarse
   `ARC_TOL`. Then `Clipper.CleanPolygon` at 3m removes footway-easement notches.

2. **Curve detection** — if the face has a long run of consecutive short edges (the
   densified S 18th Street arc), replace the parcel block with a face inset at
   `6.5 + sidewalkZone` so the block follows the curve.

3. **Loop-street cutting** — Benton Place and Mackay Place are CLOSED LOOPS. Their
   geometry is cut OUT of surrounding blocks so the sidewalk follows the loop curve.

4. **Dead-end Divide rule** — for each dead-end street endpoint inside a face, buffer
   the street segment by `halfWidth + sidewalk + 2m` and subtract from the block.
   This carves a road channel from the block at the dead end.

5. **roundCorners (jtMiter)** — apply two passes of shrink-expand at `jtMiter` joins
   for smooth structural corners (no arc vertex bloat).

6. **Sidewalk inset** — `shrinkPaths(block, sidewalkWidth)` produces the lot polygon.
   The block is the outer ring; the lot is the inner inset; the sidewalk strip is
   `block − lot`. Both render in `render.js` via `bezierPolyD` for smooth corners.

7. **Land use classification** — count parcels per `land_use_code`, dominant code
   determines the lot fill class (residential / commercial / vacant / etc).

### Files relevant to block building (line numbers approximate)
- `derive.js:1038` — vehicular street filter
- `derive.js:1100-1120` — densify S 18th curve, extend LaSalle
- `derive.js:1123` — `nodeEdges(streetPolylines)`
- `derive.js:1124` — `polygonize(nodedSegments)`
- `derive.js:1316` — assign parcels to block faces
- `derive.js:1438` — dead-end vertex detection (uses noded segments)
- `derive.js:1354` — `buildParcelBlock` function
- `derive.js:1413` — `buildFaceBlock` (face inset fallback)
- `derive.js:1533` — block building loop per face
- `derive.js:1668` — dead-end "Divide" treatment
- `derive.js:1763` — roundCorners + add to allBlockPaths
- `derive.js:1808` — loop street median creation
- `derive.js:1822` — sidewalk strip / lot inset

---

## 7. The work-in-progress problem — REFRAMED 2026-04-07

> The previous operator (§7 in earlier revisions) framed the WIP as "dead-end Place
> streets fail to split faces, leaving missing corner blocks." A long diagnostic
> session on 2026-04-07 disproved that framing for the markers actually on the map.
> Read this section in full before touching any code. It's the most important part
> of this document right now.

### 7.1 What the user actually circled

There are 6 marker strokes in `data/clean/marker_strokes.json` (as of 2026-04-07).
Their centers, the nearest named features, and what layer they fall into:

| # | Center (m)   | Size  | Nearest features              | In any layer? |
|---|--------------|-------|-------------------------------|---------------|
| 0 | (360, -196)  | 46×49 | Mississippi Alley, Rutger ~30m| **void**      |
| 1 | (517, -157)  | 46×27 | service+footway, Dolman ~30m  | **void**      |
| 2 | (288, -37)   | 43×24 | footway+service, Vail Pl ~26m | **void**      |
| 3 | (541,  45)   | 56×82 | service, Truman/Dolman ~33m   | **void**      |
| 4 | (-253,-282)  | 55×52 | 3 service ways, Park Ave ~44m | **void**      |
| 5 | (-217,-197)  | 39×31 | service+footway, Park Ave ~33m| **void**      |

Five of six are nearest to **alleys / service ways**, not to dead-end Place streets.
Only stroke 2 is even *near* a Place (Vail), and it's mid-frontage, not at the tip.
**These are mid-block voids, not corner-lot omissions.** §7 in the previous revision
was solving the wrong problem for these markers.

### 7.2 Diagnostic done, results

A diagnostic with **proper hole testing** (point-in-polygon must respect ring holes,
not just outer rings) confirmed: **all 6 stroke centers lie in pure void** — outside
every block, every pavement polygon, every alley feature. They sit in the geometric
gap between the parcel-union block edge and the street/alley pavement edge, with
gaps of **5–17 m** wide.

A false lead during the diagnostic: an early pass showed 5/6 strokes "inside the
pavement layer" with one giant 2679×2520 m pavement polygon containing 80 holes.
That suggested a street-buffer winding/orientation bug. **It was a mistake in the
diagnostic** — the test ignored hole rings. The pavement polygon has a huge bbox
because the connected vehicular street network (incl. I-44 ramps, Truman Pkwy,
Jefferson Ave) extends well past the visible neighborhood, but the *filled area*
is just thin ribbons with 80 block-shaped holes. **There is no pavement-layer bug.**
Don't go down this path again.

### 7.3 Mechanical cause of the voids

Blocks are built from `buildParcelBlock()` (`derive.js:1354`), which morph-closes
the assessor parcel union. Assessor parcels stop at the property line, not the
ROW edge. The property line is usually back-of-sidewalk, not curb. So the block's
perimeter sits 5–17 m inside the actual face boundary. The 4 m morph-close is too
small to bridge that, and there's nothing else trying to fill the space, so it
renders as void (sometimes pavement-shaped on the outside, but inside the block hole).

### 7.4 The deeper conceptual problem (USER-CONFIRMED 2026-04-07)

While debugging the above we worked out — through several dead ends — what's
*actually* wrong with the model. Quoting and synthesizing the user:

> "Alleys don't get sidewalks. My plan was that alleys render over the block and
> clip to the block or join to the street."

> "There are many places that are paved with concrete that aren't street or
> sidewalk. There are big lawns around the park. The stores that front onto Park
> Avenue by the park have sidewalks 3 or 4× the usual width."

> "The treelawn and sidewalk is attached to the blocks." (i.e., the gap between
> curb and the block edge is NOT a separate zone — it's part of the block.)

> "We worked pretty hard to formalize the streets; if everything is going to come
> from the streets do we need to go back to the streets for the final real cleanup?"

The reframe that came out of this conversation:

**The model has been trying to express THREE categories of ground using only TWO
layers (street + block). The missing third category is "infrastructural space" —
concrete that is neither street nor block-sidewalk:**

- The plaza-like sidewalks in front of the Park Avenue commercial strip
- The wide aprons and lawns around Lafayette Park
- Civic forecourts, ceremonial pavers, oversized sidewalks at notable buildings

Currently these get absorbed into whichever neighbor "wins" the geometry fight,
and none are right.

The cleaner mental model the user converged on:

```
STREET PAVEMENT  →  curb-to-curb fill, includes parking and bike lanes
                    halfwidth = pavementHalfWidth
   |
   curb  ← THE single primitive that defines the block edge
   |
BLOCK            →  everything inside the curb that's "land"
                    INCLUDES tree-lawn AND sidewalk strip on perimeter, plus
                    interior lots and buildings.
                    Block edge = the curb itself, NOT back-of-sidewalk,
                    NOT ROW outer edge, NOT property line.
   ⤷ subdivided visually into: sidewalk strip (perimeter inset) + lot (interior)

INFRASTRUCTURAL  →  paved-but-not-street, not-block (NEW, DOESN'T EXIST YET)
                    ~5-10 polygons, hand-curated, rendered on top of blocks
                    in a sidewalk-ish but distinct color
```

**Implication for the pipeline:** parcels stop being a geometry source. They become
a *land-use classifier and building positioner only*, used to color the lot fill
and place building footprints. **Block geometry comes from streets** — specifically,
each polygonized face has its block built by offsetting each bordering street
inward by `pavementHalfWidth` (so the block edge sits exactly at the curb). The
sidewalk strip is then inset from the block by a sidewalk width as today.

The user has correctly noted that this means the streets are now load-bearing for
the entire pipeline, and any cleanup of blocks goes back to cleaning streets.

### 7.5 Risks and open questions for this reframe

Before any code changes, the new operator should think through:

1. **Are the OSM street centerlines actually clean enough to offset cleanly?**
   The user has done significant work — `survey.json`, `correctedSurvey` overrides,
   `dividedStreets`, S 18th densification, LaSalle extension, loop-street handling.
   Streets are the most-curated layer in the pipeline. But "good enough to use as
   the only geometry source" is a higher bar than "good enough as a master grid
   for polygonize." Test before committing.

2. **Variable, irregular setbacks.** Some lots are *deeper* than the uniform
   pavementHalfWidth offset would suggest (corner clip-offs, churches with
   ceremonial setbacks, the school on Park Ave). A pure street-offset model loses
   these. The user is *willing* to lose them in exchange for a clean curb network,
   but verify on the spike.

3. **Per-edge street resolution.** To offset each face edge by the right amount,
   the new code needs to know which OSM street each face edge came from. The DCEL
   from `polygonize.js` has half-edge → source-segment back-pointers; the resolution
   plumbing is probably already there but should be verified before building on it.

4. **"Infrastructural space" data.** This is a curated polygon list (~5-10 features
   for Lafayette Square). It does not yet exist anywhere. Spec to confirm with user:
   file location (`data/raw/infrastructural.json`?), schema (id, name, ring,
   render class), where in `derive.js` it's loaded, where in `render.js` it's drawn.

### 7.6 Recommended next move (the spike)

Do NOT start with a full reframe. Do the smallest possible test of the reframe:

1. Pick one face you trust visually (e.g., a typical interior block on Mississippi
   Avenue between two cross streets).
2. Build that one block by **only** offsetting its bordering polygonized face edges
   inward by their `pavementHalfWidth` (lookup via `correctedSurvey` / `survey.json`,
   fall back to `STANDARDS`). Discard the parcel union for this experiment.
3. Render it alongside the current parcel-union block for the same face.
4. Visual diff. Does it look right? Does it touch the curb everywhere it should?
   Does the sidewalk inset still work? Are the corners clean?

If the spike looks right, plan a phased migration. If it looks ragged because OSM
centerlines aren't clean enough, the next investment is in cleaning street data
(possibly a curated street centerline file), not in plugging block-builder bugs.

### 7.7 Things explicitly OFF the table now

- **Per-edge variable inset of the parcel-union block by `(rowWidth/2 − pavementHalfWidth)`.**
  This was proposed mid-conversation as a "plug" fix. The user objected: it
  treats block-edge as a derived quantity that needs coaxing into alignment with
  pavement-edge, instead of treating it as the curb itself. Drop this approach.

- **Dead-end Place projection / chord-splitting** (the previous §7 proposal).
  Not relevant to the markers actually on the map. There may still be missing
  corner lots at dead-end Places, but that's a separate problem from what's
  currently circled. If it comes back, address it after the reframe.

- **Pavement layer fixes / megablob hunting.** There is no pavement layer bug.
  The "megablob" was a diagnostic mistake from ignoring hole rings.

---

---

## 8. Recently fixed issues (so you don't redo them)

| Issue | Fix | When |
|-------|-----|------|
| Sidewalk footway notches | `Clipper.CleanPolygon` at 3m after morph-close | 2026-04-03 |
| Street width / sidewalk overlap | `render.js` uses `pavementHalfWidth × 2` (curb-to-curb) instead of full ROW; `survey.js` computes pavement from lane geometry | 2026-04-03 |
| S 18th curve | Catmull-Rom densification at 3m of "West 18th Street" OSM segment in both `derive.js` and `render.js`; LaSalle extended to meet S 18th | 2026-04-03 |
| Land-use lot coloring | Per-class CSS rules driven by dominant parcel `land_use_code` | 2026-04-03 |
| Building relocation | `deriveBuildings()` translates OSM footprint to assessor centroid | 2026-04-05 |
| Neighborhood boundary | `data/neighborhood_boundary.json` polygon filters what renders | 2026-04-05 |
| Polygon vertex bloat (jagged blocks) | `roundCorners` and `shrinkPaths` use `jtMiter` (no arc vertices); visual rounding moved to `render.js` `bezierPolyD()` | 2026-04-06 |
| Smooth block corners at all zoom levels | `bezierPolyD()` in `render.js` emits cubic Bézier curves at corners; straight edges stay as `L` commands | 2026-04-06 |
| Benton/Park corner gap | Park-parcel exclusion only for actual park land-use codes (4800 series) | 2026-04-03 |
| Reframed mid-block voids diagnosis | Confirmed via marker-stroke diagnostic that voids are gap between parcel-union block and curb, not a polygonize / pavement bug. See §7. | 2026-04-07 |

---

## 9. Things that have been TRIED and DID NOT WORK (don't redo these)

- **Excluding dead-end streets from polygonize input** by per-OSM-way endpoint degree.
  Result: misidentified Park Avenue, Lafayette Avenue, Chouteau Avenue, etc. as
  dead-ends because their OSM ways are split into many segments and per-way endpoints
  don't snap perfectly. Lost the entire Park Avenue corridor.
- **Polygonizing OSM sidewalks instead of streets** as the primary face source.
  Result: 86% of sidewalk endpoints are degree-1 (don't connect). Even at 1m snap
  it's 60%. Only 85 face-cycles emerge vs 106 baseline blocks; many fragments and
  duplicates. Sidewalks are useful as a presence signal, not as primary geometry.
- **Using building footprints to fill block gaps via parcel "rescue"** logic.
  Result: extends blocks to where buildings exist, but the user explicitly rejected
  this — buildings sit on blocks; they don't define them.
- **Face-fill via face-polygon inset union** with morph-close result.
  Result: blocks extended into streets (lamp-inside-block jumped from 10% → 19% in
  validation). Inset distances vary too much to use a uniform value.
- **Street-buffer orientation flip + SimplifyPolygons on `streetBufferPaths`** to
  fix a phantom "megablob" pavement polygon (2026-04-07). The megablob doesn't
  exist; it was a diagnostic mistake from skipping hole rings in point-in-polygon.
  Pavement layer is fine. Don't touch the pavement union code in pursuit of this.

---

## 10. Style & quality rules

- **No idiosyncratic fixes**: every change should be principled and generalizable.
  This pipeline must work for OTHER neighborhoods, not just Lafayette Square.
- **No global fixes for local problems**: scope each fix tightly. If something
  breaks one corner, don't apply a global pipeline change to fix it.
- **Curated > automated**: prefer hand-tuned data sources where they exist (the
  `survey.json` ROW values, the `correctedSurvey` overrides in `derive.js`).
- **Don't propose collecting PII**: this map is public-facing. No phone, email,
  real names tied to addresses.
- **Streetlamps must render on lot or sidewalk, never in street**: this is a hard
  constraint. Validation prints `Lamp validation: N/641 lamps inside blocks (N%)`
  at the end of the pipeline. Baseline target: ~10%. If your change pushes this
  significantly higher, blocks are extending into streets — investigate.

---

## 11. Build commands cheat sheet

```bash
cd cartograph

# Full rebuild
node pipeline.js --skip-elevation && node render.js && open data/clean/preview.html

# Live dev with marker tool
node serve.js  # http://localhost:3333

# Inspect block data
node -e 'const m = require("./data/clean/map.json"); console.log("blocks:", m.layers.block.length, "lots:", m.layers.lot.length)'

# Check marker strokes
cat data/clean/marker_strokes.json | jq 'length'
```

---

## 12. Three.js ground plane (StreetRibbons POC)

The ground plane is being migrated from CSS3DRenderer (inline SVG) to native Three.js
ribbon meshes. The POC lives in `src/components/StreetRibbons.jsx` and renders
Rutger Street × Missouri Avenue as a proof of concept alongside the existing SVG ground.

### Current state (2026-04-13)

**Ring model for straight arms (WORKING):**

Each street material is a non-overlapping **ring** (annular strip, inner→outer HW),
split at IX into left/right halves. Materials don't overlap on the same street, so
there are NO priority conflicts between same-street layers. This was validated after
extensively testing and rejecting the filled-ribbon model (which overlaps and requires
priority resolution that polygonOffset can't reliably provide).

- Asphalt ring: 0→6.1m (Rutger), 0→4.75m (Missouri) — runs FULL LENGTH through IX
- Treelawn ring: 6.1→7.4m (Rutger only) — split at IX, dead-ends at corner
- Sidewalk ring: 7.4→8.9m / 4.75→7.5m — split at IX

Priority (only matters at crossings where streets overlap):
asphalt(8) > sidewalk(5) > treelawn(3)

**Corner geometry (NOT YET WORKING — see conceptual model below):**

### Conceptual model (established 2026-04-13)

**Streets are positive geometry. Blocks are negative space.**

The street cross-section profile — asphalt, treelawn, sidewalk — is the authoritative
geometry, measured via the cartograph measurement tool. The block is whatever land
remains after the streets and their full cross-sections are accounted for. The block
is never explicitly constructed in this context.

At a corner, two streets meet. The corner problem is: **extend the outermost street
materials around the bend where two cross-sections meet.** This is additive to the
street, not subtractive from the block. There is no "void" to fill — the black area
at the intersection is asphalt (road surface), which is already correct.

**Curb is aesthetic, not measured.** The curb is a colored edge rendered along the
outer boundary of the asphalt, wherever asphalt meets sidewalk or treelawn. It has
configurable color and width but is NOT a measured material in the cross-section
profile. It does not participate in the measurement tool scheme.

### Corner band: what it is

The corner band is **sidewalk** (or grass, if neither street has sidewalk at that
edge). It extends the outermost pedestrian material from one street around the
bend to the other street.

**Shape:**
- **Outside edge (toward the block):** two straight lines meeting at angle θ,
  where θ is the actual angle between the two streets. This is the block corner /
  property line. NOT assumed to be 90° — θ is a real variable computed from street
  directions at the intersection.
- **Inside edge (toward the street):** quadratic bezier curve. This is the curb
  line rounding the corner — the physical curve a pedestrian walks along.

The band is a wedge-like shape: thick at the middle of the curve, tapering to zero
where it meets each arm (because at those points the arm's sidewalk ring is already
the full width).

**Sidewalk arms merge at the corner.** Both streets' sidewalk rings flow into the
same corner band. There is no "which street owns the corner" — the corner is the
merge zone where both sidewalks meet, just as in real life (you walk down one
sidewalk, the corner curves, you're on the other sidewalk).

**Treelawn always dead-ends** before the corner (ADA curb ramp constraint). The
sidewalk fills through behind the treelawn's blunt end.

### Corner materials by case

| Street A outer | Street B outer | Corner band material |
|----------------|----------------|---------------------|
| Sidewalk       | Sidewalk       | Sidewalk (merge)    |
| Sidewalk       | Treelawn       | Sidewalk (treelawn dead-ends) |
| Treelawn       | Sidewalk       | Sidewalk (treelawn dead-ends) |
| Grass          | Grass          | Grass (merge)       |

### Proven corner bezier (reuse this, don't re-derive)

The quadratic bezier with ctrl = 2×mid(P0,P1) − oo has been validated across all
4 quadrants with the oo↔ii distance-check swap. This curve:
- Bows inward (toward IX), rounding the corner
- Is tangent to both streets' straight edges at the endpoints

DO NOT change the bezier formula. It works.

### Things extensively tried that DID NOT WORK (don't redo)

| Approach | Why it failed |
|----------|---------------|
| **Filled ribbons** (center→halfWidth, overlapping layers) | Treelawn/sidewalk overlap on same street; polygonOffset doesn't reliably resolve z-fighting between them |
| **Fan from oo** (triangle fan radiating from block corner) | PBR lighting produces different colors per-triangle due to position-dependent shadow sampling; visible radial artifacts even in merged mesh |
| **Fan from IX** (triangle fan radiating from intersection) | Same PBR artifact, plus the fan center is inside the asphalt zone |
| **Circular arcs centered at IX** | Arc is tangent to arm ring outer edge (same radius); can never extend past the straight edge, so rounding is invisible |
| **Proportional scaling from oo** | Crushes thin layers (curb becomes sub-pixel at the corner) |
| **Merged mesh (same-material rings + fans in one BufferGeometry)** | Did NOT fix color mismatch — PBR shading is position-dependent, not draw-call-dependent |
| **Filled ribbon + arc fans** | Required overlapping layers with priority; treelawn interrupted by sidewalk due to z-fighting |
| **Y offsets between layers** | Causes visible color/lighting differences with MeshStandardMaterial (shadow map position-dependence) |
| **Large polygonOffset multipliers** | "No visible change" — polygonOffset alone cannot resolve coplanar z-fighting in this setup |
| **Stencil buffer clipping** | R3F/Three.js stencil props had no visible effect |
| **Custom shader discard** | Crashed WebGL context |
| **Overlay patches / corner fills at higher priority** | Adding geometry on top of arm strips doesn't remove the sharp L-corner underneath; the patch is either invisible (same color over same color) or creates seams (different mesh = different PBR shading) |
| **Arc geometry near IX** | Buried under full-length asphalt (pri 8 > sidewalk 5); never visible |
| **Per-material corner bands (curb + sidewalk as separate bands)** | Curb is now aesthetic, not a measured band; only one corner band needed (sidewalk) |

### Architecture decisions (locked)

- **Rings, not filled ribbons**: non-overlapping annular strips per material.
  Priority only needed at crossings (asphalt vs everything else).
- **Treelawn never arcs**: dead-ends at corner. Sidewalk fills the curb ramp area.
- **Curb is aesthetic**: a colored edge along the asphalt outer boundary, not a
  measured ring. Configurable color/width, rendered as a visual stripe. Not part
  of the cross-section measurement scheme.
- **Streets are positive, blocks are negative**: the corner band extends the street
  outward, it does not cut into or modify a block polygon.
- **Angle θ is a real variable**: streets don't always meet at 90°. All corner
  geometry must work for any intersection angle.
- **Sidewalk arms merge at corners**: no "ownership" — both streets' sidewalks
  flow into a single corner band.
- **Three.js meshes**: BufferGeometry with MeshStandardMaterial, receiveShadow.
  Must accept terrain and lighting (this surface is the base of a 3D scene).
  All coplanar at Y=0 within the group (group at Y=0.15 world).
- **Coordinates**: [x,z] = Three.js [x,z] directly.
- **NEVER use Y offsets** for coplanar stacking; polygonOffset only.

### Key files

| File | Purpose |
|------|---------|
| `src/components/StreetRibbons.jsx` | POC component (ring arms working, corner bands TODO) |
| `src/components/Scene.jsx` | Mounts StreetRibbons next to VectorStreets |
| `src/data/block_shapes.json` | Centerline polylines + ROW widths |
| `cartograph/data/raw/survey.json` | Pavement/sidewalk measurements |

### Data reference for the POC streets

**Rutger Street** (has treelawn):
- Sidewalk: 7.4→8.9m, Treelawn: 6.1→7.4m, Asphalt: 0→6.1m

**Missouri Avenue** (no treelawn):
- Sidewalk: 4.75→7.5m, Asphalt: 0→4.75m

**Intersection point**: [-134.2, -325.6] (shared by both centerlines)

---

## 13. Glossary

- **Face**: a closed polygon produced by polygonizing the street network (DCEL output)
- **Block**: the rendered land between streets — derived from a face via parcel union or face inset
- **Lot**: the inner area of a block, after the sidewalk perimeter is inset
- **Sidewalk strip**: the perimeter ring `block − lot` (rendered in sidewalk color)
- **Tree lawn**: the grass/planting strip between curb and sidewalk concrete
- **ROW**: right-of-way (full assessor width including pavement, curbs, tree lawn, sidewalks)
- **Dead-end Divide**: the rule that carves a road channel from a block where a dead-end street terminates inside it
- **Loop street**: a closed-loop street like Benton Place or Mackay Place (rendered with a green median)
- **Morph-close**: ClipperOffset expand → union → contract — fills small gaps between adjacent polygons
- **bezierPolyD**: the render-side function that converts a sharp polygon ring into a Bézier-cornered SVG path
