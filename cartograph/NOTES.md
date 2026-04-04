# Cartograph — Session Notes (2026-04-03)

## Current State (96 blocks, stable baseline)

### Architecture
- **Streets and alleys are separate layers** with independent controls in preview
- **Blocks from parcel unions per polygonized face** — DCEL face extraction (node.js → polygonize.js → classify.js) groups parcels into faces, 4m morph-close unions them
- **Sidewalks = layered rendering** — block fills in sidewalk color, lot (uniform inset) paints green on top; perimeter ring IS the sidewalk
- **Alleys render under streets** in SVG z-order
- **Face-polygon fallback** for faces with zero parcels
- **Benton Place median** created from closed loop geometry (isMedian=true, no sidewalk inset)
- **Loop street cutting** carves Benton/Mackay roads from surrounding blocks for curved sidewalk
- **Loop streets from OSM** (not streets.json) — stem 2x curated width, loop 1x, smooth curves (0.3m simplification)

### SVG Layer Order
ground → sidewalk (=block fill) → lot (=shrunk block) → alleys → curb → streets → stripes → labels

### Marker Tool
- Preview has ✏ Marker button for freehand annotation
- Draw with mouse/pen (Intuos-compatible via pointer events)
- Strokes auto-save to `data/clean/marker_strokes.json` via `serve.js`
- Run `node serve.js` → `http://localhost:3333` for live preview + marker persistence
- `/analyze` endpoint reports parcels/blocks/faces under marker strokes
- Used for human→Claude communication about map issues

## Fixes Applied (2026-04-03)

### Benton/Park Corner Gap — RESOLVED
- Root cause: two Park Ave parcels (2123, 2107) were falsely excluded as "park parcels"
- The park exclusion filter used size + proximity heuristics (area > 10K sqft within 250m of park center)
- Fix: only exclude parcels with actual park/recreation land use codes (4800 series)
- Also improved face assignment: parcels now contribute to ALL faces they overlap (any vertex inside), not just the face containing their centroid

### Sidewalk Footway Notches — RESOLVED
- Parcels have indentations where footway easements cross them
- Morph-close doesn't fill exterior-edge concavities
- Fix: `Clipper.CleanPolygon` at 3m after morph-close smooths the perimeter

### Street Width / Sidewalk Overlap — RESOLVED
- **Root cause**: `block_shapes.json` `width` field is the assessor ROW (includes sidewalks), but `render.js` was using it as the SVG stroke width (curb-to-curb). Streets painted 18m wide when they should be 12m.
- **Also**: OSM centerlines are often off-center in the ROW, so even correct-width streets can cover one sidewalk
- Fix 1: `render.js` now loads survey data and uses `pavementHalfWidth * 2` (curb-to-curb) instead of ROW for rendering. Fallback: ROW minus 5.8m (2 × sidewalk zone)
- Fix 2: `survey.js` computes pavement width from lane geometry (lanes × width + parking + gutter) when lane count is known, with ROW as a cap. Prevents ROW/2-sidewalkZone formula from over-widening streets
- Fix 3: `derive.js` clips street pavement polygons against block polygons — streets can never paint inside blocks
- Fix 4: `render.js` normalizes width per named non-divided, non-loop street — all segments get the max width, preventing stray one-way tags from creating width discontinuities
- Missouri Avenue: was 18.2m (ROW), now 12.1m (pavement). Survey corrected to remove false `oneway:true` tag
- Affected streets: Dillon, Saint Vincent, Allen, Carroll all had overflow; now fixed by pavement-based widths

### Marker Tool
- Replaced pen tool with freehand marker (Intuos/pointer-compatible)
- `serve.js` at localhost:3333 serves preview + auto-saves marker strokes
- `/analyze` endpoint reports parcels/blocks under marker strokes
- Strokes persist in `data/clean/marker_strokes.json`

## Remaining Issues

### Sidewalk Straightness
- Block perimeters follow parcel shapes, not straight lines
- Sidewalks (block perimeter strips) inherit irregularities
- CleanPolygon smoothing helps but doesn't enforce straight lines between corners
- Need either: (a) compute sidewalks as independent straight-line geometry, or (b) regularize block edges to straight lines

### Street Terminations — RESOLVED (Divide rule)
- Dead-end streets that penetrate into a block get a road channel cut
- Cut half-width = `halfWidth + sidewalkZone + 2m` (matches cross-street gap)
- Segment endpoint pulled back by `halfWidth` so round cap gap matches side gap
- If dead end is NOT inside the block but block is nearby (<16m): short fill buffer near dead end first, then cut
- Detection: degree-1 nodes in the noded street graph, vehicular streets only (not alleys/footways), interior only (not map boundary)
- render.js: dead-end round caps pull back by w/2 so cap doesn't spill into sidewalk; alleys excluded from dead-end detection so passing alleys don't suppress round caps
- Face polygon has zero-width spikes at dead ends — do NOT clip buffers to face boundary

### Curved Streets (South 18th Street arc) — RESOLVED
- OSM "West 18th Street" segment had only 9 points on the arc
- Fix: Catmull-Rom densification at 3m intervals in both derive.js and render.js (only West 18th, not the straight S 18th segments)
- block_shapes.json also densified (96 points for the curve portion)
- Blocks along the curve use face-inset when `maxConsecutiveShort >= 25` edges detected (single-polygon blocks only)
- Face inset uses road-aware distance: `6.5m + sidewalkZone` from centerline
- LaSalle Street extended to meet S 18th at the curve ([506.6, -391.1]) in both block_shapes.json and streets.json
- Junction circles for same-width streets now working (Dillon/Carroll corner fixed)

### Loop Streets (Benton Place, Mackay Place)
- Green median ✓ (Benton only — Mackay not a closed loop in OSM)
- Curved sidewalk around loop ✓
- Stem wider than loop ✓
- Park Ave gap ✓ (fixed via parcel exclusion fix)

## Build Commands
```
cd cartograph
node fetch.js              # fetch OSM data (one-time)
node survey.js             # generate variance data (one-time)
node pipeline.js           # run pipeline (--skip-elevation to skip USGS fetch)
node render.js             # generate SVG + preview HTML
open data/clean/preview.html
```

## Fixes Applied (2026-04-03, session 2)

### S 18th Street Curve — RESOLVED
- Catmull-Rom densification of "West 18th Street" OSM segment (9 → 37 points at 3m)
- Both derive.js (block geometry) and render.js (street rendering) densify independently
- render.js skips Douglas-Peucker simplification for curve streets (preserves interpolated points)
- LaSalle Street extended to meet S 18th at the curve

### Block Classification — RESOLVED
- `classify.js`: added `retail`, `industrial`, `religious` to block-producing landuse types
- Fixes missing commercial blocks at Park/Mississippi intersection
- Fixes missing church lawn blocks (e.g., Saint Joseph's Church / Mackay Place area)

### Dead-End Street Treatment — RESOLVED
- "Divide" rule: cut road channel from blocks at dead-end termini
- "Fill + Divide" for non-spanning cases (block nearby but doesn't cross road)
- Semicircular sidewalk wrap at dead end, gap matches adjacent cross-street
- Round cap pullback in render.js for both streets and alleys

## Remaining Issues

### Sidewalk Straightness
- Block perimeters follow parcel shapes, not straight lines
- Sidewalks (block perimeter strips) inherit irregularities

### Church Lawn Connectivity
- Saint Joseph's Church / Mackay Place area: lawn fragments may need merging
- The "Join" concept for connecting separate blocks across dead-end streets

## Fixes Applied (2026-04-03, session 3)

### Land-Use Coloring — DONE
- Lot paths now carry CSS classes from dominant parcel `use` (residential, commercial, vacant, etc.)
- SVG has per-class fill rules: `#layer-lot path.residential { fill: var(--lot-residential, #3a4a2a) }`
- Preview panel Land Use controls (already existed) now actually drive lot fills
- Classification: for each lot ring, find parcels whose centroid falls inside, take dominant use

### Gap Between Blocks 7/8/84 (Park/Lafayette/Bratton intersection) — OPEN
- **The problem**: Three block faces meet at a diagonal intersection. The polygonize step creates separate faces for blocks 7 (NW), 8 (SW), and 84 (the narrow diagonal strip). Between them is a ~16m gap (the street width) that no block covers. At the east end where the two diagonal streets converge, this creates a visible dark triangle.
- **What was tried and why it failed**:
  1. **Render.js plug polygon** (hardcoded block+lot rings) — filled the gap but looked artificial: sharp rectangular edges, no dead-end cap treatment, wrong layering
  2. **block_patches.json → buildParcelBlock** — patch centroid fell inside a face at runtime but morph-close collapsed the thin geometry. Even when injected directly into allBlockPaths, the rounded/inset block was too small
  3. **Flood-fill + street-cut in derive.js** — closest to correct: flood a generous polygon, subtract existing blocks, cut street buffers through. Produced proper dead-end cap. BUT: flood polygon size was hard to tune (too small = dark voids, too large = fragments overlapping adjacent blocks with wrong land-use color). The street-intersection filter also caught wrong streets.
- **What should work (next session)**:
  - The flood-and-cut approach is correct in principle
  - Key insight from user: "fill the whole space between the blocks, then chop the street/gap/sidewalk out freshly like in the other dead-end instances"
  - Needs: (a) subtract existing blocks from flood BEFORE street cuts, (b) tightly scope which streets get cut (only the two diagonals, identified by name or by actual intersection with the flood polygon centroid), (c) add the "pullback" treatment so the round cap sits cleanly
  - The flood polygon should be generous but NOT extend past Dolman Street to the west — that caused the "lump" artifact
  - Consider: instead of one big flood, use the actual face 249 geometry (the long thin strip between the streets) expanded to fill the gap

## Key Design Principles
- Streets and blocks are INDEPENDENT — the gap between them is natural/variable
- Don't apply global fixes for local problems — scope fixes tightly
- Blocks come from real property data (parcels), streets from code/standards
- Sidewalks should be straight lines between corners (NOT YET ACHIEVED)
- Every streetlamp must render on lot/sidewalk, never in street
- Land-use drives lot fill color, not a uniform green
