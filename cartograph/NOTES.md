# Cartograph — Operator Handoff

This document explains how to (re)build the Lafayette Square neighborhood map from
scratch, the principles behind the pipeline, and the work-in-progress problems the
next operator should pick up. Read this top-to-bottom before touching any code.

---

## 2026-04-20 additions — read first

### Marker FAB → bottom-right of canvas (clear of Panel)

The Marker tool's FAB lives at `right: calc(340px + 14px); bottom: 14px;`
— the canvas's lower-right corner, just left of the 340px Panel. The main
pencil button sits at the bottom of the column; eraser/undo/clear minis
cascade *above* it when marker is active. Update the `340px` if Panel
width ever changes.

### Toolbar: four orthogonal axes, redesigned

Toolbar is now a row of segmented pill controls plus two single-button
toggles. Tool / shot / scene / Fills are truly orthogonal — pick any
combination, the scene composes coherently. CSS tokens live in
`cartograph.css` under the `.cartograph` scope (`--toolbar-*`).

```
Designer:  [Survey · Measure]  [Fills]  [Browse · Hero · Street]  [Toy]
In a shot: [← Designer]  [Publish]  [Browse · Hero · Street]  [Toy]
```

- **Fills** is a single binary toggle (no longer paired with Aerial — that
  was redundant; aerial is always on, and Fills off naturally exposes it).
- **Toy** is a single binary toggle replacing the old Neighborhood/Toy
  segmented pair.

### Fills: comprehensive overlay shortcut

**Fills ON** (default): full digital map, every layer at full opacity.
Per-layer toggles in the Designer panel control individual layers granularly.

**Fills OFF**: hide everything except aerial + roadway composites (ribbons +
corner plugs + stripes + edge lines + bike lanes + paths + lamps). Per-layer
state is preserved underneath — Fills back ON returns you to whatever
per-layer state existed.

Same gesture, same effect, regardless of tool. Per-layer state persists
across tool changes. The Fills hide-list is in `CartographApp.jsx` as
`decorationsHidden`.

### Translucency belongs to ribbons (not the rest)

Survey ribbons render translucent blue (#2250E8, opacity 0.28). Measure
ribbons render translucent per-stripe (opacity 0.45) with handles + edge
strokes on top. Face fills, buildings, paths — **opaque** in every tool.

The aerial-through-ribbon affordance is the tool's edit surface; everything
else stays clean. Earlier experiment with translucent face fills was
reverted (too much visual noise at once).

### Pipeline: paths/alleys clipped to curb

`derive.js` now computes `pavementWithCurb = clippedStreets ⊕ CURB_WIDTH`
and runs every footway / cycleway / steps / path / alley through
`clipFeaturesOutsideCurb` before emission. Paths terminate at the curb,
never punching into asphalt at intersections. One foolproof rule —
no per-endpoint tuning needed.

Z-fight fix: MapLayers' path-family meshes (alley, footway, stripes, edge
lines, bike lanes) lifted by `+0.06m` so they clear StreetRibbons face fills
(group y=0.15 in shot mode) under terrain displacement.

### Toy scene fixture

`src/toy/` is a permanent shader/shadow R&D fixture, accessed via the Toy
toolbar toggle. One 4-way intersection at origin, 4 quadrant blocks, 12
houses (1878-1930 era → mansard / hip / flat roof variation + foundation
pedestals via the *real* `Building` and `Foundations` components), 8 trees
(real `ParkTrees`), 8 lamps (real `StreetLights`).

Imports shared components, exports nothing. To stand up another fixture,
copy `src/toy/` and change the data files in `src/data/toy/`.

Hill terrain attempted then flattened — the global `terrainShader` is
wired to the neighborhood elevation map and isn't trivially swappable.
See task #9 (backlog) for the proper integration.

### No destructive operations

The old `splitAtNode` (turned one centerline into two separate entries
with no rejoin) is gone. Replaced by **opt-in split couplers** —
non-destructive markers on existing centerline nodes, fully reversible
by toggling the same marker off.

**Right-click any interior node in Survey** → toggles a split coupler.
Coupled nodes render as paired semicircles oriented along the street
tangent (the "extension cord" affordance). Stored as
`centerlines.streets[i].couplers: [pointIdx]`.

Phase 1A (UI + data) is shipped. Phase 1B (per-segment measure storage,
per-segment reset, pipeline split at coupler nodes) is queued — helpers
`segmentRangesForCouplers` and `measureForSegment` already exist in
`streetProfiles.js`, store actions `toggleCoupler` and `resetSegment`
already exist.

If you find legacy splits (e.g. `Lafayette Avenue` as `-a` / `-b`
entries), run `node cartograph/rejoin-splits.js` — it merges adjacent
same-name centerlines whose endpoints touch within 0.5m. Dry-run with
`--dry-run`. Backs up the file before writing.

### Measure tool fixes

- **Asymmetric drag bug:** the pipeline reverses some ribbon segments
  relative to centerline orientation, so `live.measure.left` would render
  on the visually-right side. New orientation guard in StreetRibbons'
  merge step swaps `left ↔ right` when ribbon tangent disagrees with
  centerline tangent (dot product < 0). Diagnostics gated on
  `window.__measureDebug` if anything regresses.
- **Double-click to insert** now works (empty pointerdown was
  deselecting the street before dblclick could fire).
- **Min stripe width 1.0m** enforced in `applyDrag` so handles can't
  visually collapse onto each other. Right/Ctrl-click is the explicit
  "zero this stripe" gesture.
- **Handles stagger along the street** when `r` values are within
  `HANDLE_LONG + 0.5m` — keeps each independently clickable on tight
  cross-sections (e.g. Park Avenue south-side with 8cm treelawn).

### Stage convergence path locked

After audit: the runtime (lafayette-square.com) is **not** a separate
build target waiting for replacement. It already shares 90% of Stage's
components. The remaining work for "publish" is:

1. Define `public/stage-config.json` schema (arch, SHOTS, palette,
   env defaults).
2. De-fork `StageSky` ↔ `CelestialBodies` (~1150 lines) and `StageArch`
   ↔ `GatewayArch` with a `source: 'runtime' | 'authored'` prop.
3. Wire cartograph "Publish" button to write `stage-config.json`.
4. Delete `VectorStreets` (CSS3D SVG hack); runtime sky goes opaque
   (matching StageSky variant).

Estimated 3-4 focused days. The cartograph map polish is the long pole;
runtime flip is a short tail.

---

## 2026-04-19 additions — read first

### Measure / Survey tool refactor (the big one)

The old 8-band system (`_bands: [{material, width}]`) is gone. Replaced with a
focused per-side model that matches physical reality and the operator's mental
model:

```js
// Per street in centerlines.json (and ribbons.json output):
measure: {
  left:  { pavementHW, treelawn, sidewalk, terminal: 'sidewalk' | 'lawn' | 'none' },
  right: { ...same fields... },
  symmetric: true
}
```

**Hardwired stripe sequence** (from centerline outward, positions imply material):
`asphalt (pavementHW) → curb (fixed CURB_WIDTH) → [treelawn] → [sidewalk | lawn]`

No per-stripe pulldowns — the material of each stripe is determined by its
position in the sequence. Curb is constant-width, not editable. When `terminal`
is `'none'` the side stops at curb (alleys, footways).

**Why this shape:** Previous 8-material system was too much UI for too little
signal. Parking is a separate overlay layer now. Per-side asymmetry is essential
for park-edge streets. `terminal` lets the operator pick one of three real-world
cases (sidewalk / lawn-only / nothing) with one control. See
`src/cartograph/streetProfiles.js` for the helpers (`defaultMeasure`,
`sideToStripes`, `refEdges`).

**Corner plug rules** (see `project_corner_plug_rules.md` memory):
- Every corner has a plug; it's the universal rounding primitive.
- Shape: proven bezier, sized to the NARROWER sidewalk of the two meeting legs.
- Wider sidewalks / treelawns / retail plazas on the other leg BUTT against the
  plug — they do not expand it.
- corner_sw is emitted only when at least one leg has sidewalk; curb + asphalt
  corners emit always.

### Measure tool UX (the new authoring loop)

- **Royal blue centerlines** (architectural color `#2250E8`, 0.7m thick ribbons
  via `polylineRibbon` in `src/cartograph/overlayGeom.js`) in both Measure and
  Survey modes.
- Click a centerline to select. Handles **anchor at the click point** (not the
  midpoint) — store `selectedMeasurePoint` on the store, compute per-click
  tangent frame via `frameAtPoint`.
- Handles are **rectangular pills** (5m × 1.2m, white fill + black outline)
  oriented along the street direction. One handle per real stripe boundary per
  side: `pavementHW`, `treelawnOuter` (only when treelawn > 0), `propertyLine`.
  Curb has no handle (fixed width is inferred).
- **Drag** a handle to resize its boundary. In symmetric mode (default) the
  drag mirrors to the other side. `measure.symmetric: false` unlocks sides.
- **Right / Ctrl-click** a handle to remove that boundary (collapse the stripe).
- **Double-click** anywhere in the sidewalk zone to insert a treelawn/sidewalk
  split. If a side has `terminal: 'none'`, double-click reseeds the pedestrian
  zone at that radius.
- Map rendering when `measureActive`: ribbons render translucent (opacity 0.45)
  with opaque per-material strokes at every stripe's outer boundary. Aerial
  shows through fills; boundaries stay crisp.
- Map rendering when `surveyActive`: ribbons render uniform blue tint
  (#2250E8, opacity 0.28) with slim blue stroke at the outermost (property
  line) boundary only. Per-stripe materials are suppressed.
- Panel has an **Asymmetrical** checkbox that toggles `measure.symmetric`. Each
  side shows its own terminal dropdown + read-only stripe widths.

### Pipeline: survey-aware per-side defaults

`defaultSideMeasure(type, survey, sideKey)` in `streetProfiles.js` now uses
`survey.sidewalkLeft` / `sidewalkRight` per side:
- If present for a sidewalk-eligible street → terminal=`sidewalk`, treelawn
  width computed from the gap between curb-outer and `swDist − SV_SIDEWALK/2`.
- If present on the OTHER side only (asymmetric, park-edge case) → this side
  gets `terminal: 'lawn'` with a modest grass strip.
- If absent on both sides → fallback residential treelawn + sidewalk default.

19 streets came out asymmetric in the current data (park-edges: Park Place,
Park Avenue, Gravois, Soulard, West 18th, Kennett, Singleton, Henrietta,
Waverly, Dillon, Preston, St. Vincent Court, etc.).

Symmetric flag is auto-set: `measure.symmetric = (L.terminal == R.terminal
&& L.treelawn ≈ R.treelawn && L.sidewalk ≈ R.sidewalk)`. Park-edge streets
start asymmetric.

### Stage-view fixes (terrain + markings + alleys)

- **Lamps + glow + pool + base** (4 instanced meshes in `StreetLights.jsx`)
  now terrain-displaced. Added `patchTerrainInstanced` + `UNIFORMS` export in
  `src/utils/terrainShader.js`. The shader samples terrain at each instance's
  world origin (`modelMatrix * instanceMatrix * (0,0,0)`) and lifts all
  vertices of that instance uniformly. No more lamps underground.
- **Street markings** (centerStripe / parkingLine / bikeLane) rebuilt as
  thin quad-strip ribbons (`stripeRibbonGeo` in `MapLayers.jsx`) with
  `makeFlatMat` so they pick up terrain displacement. Previously they were
  `THREE.Line` at fixed y=0.2 — buried under lifted terrain in shots.
- **Alley z-fighting** fixed by reducing `makeFlatMat` polygonOffset from
  `factor=-pri*4, units=-pri*50` to `factor=-pri, units=-pri*4` (matches
  StreetRibbons). Old values were so aggressive they caused precision
  collisions once terrain displaced everything simultaneously.

### Grass shaders wired for residential + treelawn + lawn

- **Residential faces** get a separate `residentialGrass` material
  (`makeGrassMaterial({ color: luColors.residential })`) in shots; same noise
  shader as park, slightly brighter green. Falls back to flat color in Designer.
- **Park grass** already wired; now also `patchTerrain({ perVertex: true })`
  so it displaces with terrain.
- **Treelawn ribbons** use `residentialGrass.material` in shots so the strip
  flows seamlessly into the adjacent block's grass.
- **Lawn ribbons** (park-edge `terminal: 'lawn'`) use `parkGrass.material` in
  shots so the strip reads as an extension of the park lawn.
- Designer keeps flat band colors for plan-view legibility.

### Park data coordinate systems — RECURRING CONFUSER

The data files in `src/data/park_*.json` use different frames. Getting this
wrong produces rotated/misplaced water, trees, or paths.

- `park_trees.json` — **park-local, axis-aligned**. Raw x, z within ±175m
  (matching the `PARK` constants). Must be rotated by `PARK_GRID_ROTATION`
  (-9.2°) to land correctly in world, because the real Lafayette Park is
  tilted 9° from world axes (the street grid is).
- `park_water.json` — **park-local, axis-aligned** (same frame as trees).
  Lake outer / island / grotto polygons are in the park's own frame. Must
  also be rotated by `PARK_GRID_ROTATION`.
- `park_paths.json` — **world-aligned**. Counter-rotates with `-GRID_ROTATION`
  inside LafayettePark to cancel the parent wrapper.

Because LafayettePark wraps its contents in `<group rotation={[0,
GRID_ROTATION, 0]}>`, park-local data (trees, water) needs NO extra rotation
inside LafayettePark, while world-aligned data (paths) counter-rotates.

MapLayers is flat and has no parent rotation, so park-local data needs a
`PARK_GRID_ROTATION` wrapper there to look the same.

**The park face in `ribbons.json`** is already rotated in world (vertex
coords encode the 9° tilt). That's the authority for park boundary — when in
doubt, match what the park face looks like in Designer (which renders the
ribbons face directly).

---

## 2026-04-17 additions — read first

### The big architectural move: Stage is embedded in Cartograph

Previously cartograph had **two Canvases** — a flat ortho one for the
Designer and a perspective one for Stage mode — switched by unmounting one
and mounting the other. This caused a persistent **WebGL context-loss skew
bug**: every time you flipped Designer ↔ Stage, the browser threw away one
GL context and created another, and on return the view-projection matrix
uniforms came back corrupted, producing a "parallelogram" tilt that only a
hard refresh + cache purge could fix. It was the most-reported visual bug
against the cartograph for weeks.

The fix was architectural, not a polish pass: **collapse to a single
Canvas** with two cameras (`OrthographicCamera` for Designer via the
`<Canvas orthographic>` default; `<PerspectiveCamera makeDefault={!inDesigner}>`
for shots). Both cameras always mounted; `makeDefault` swaps which one is
active. `MapControls` is keyed on `inDesigner ? 'ortho' : 'persp'` so it
remounts cleanly when the active camera changes. **No more context loss, no
more skew.**

### Tool vs. Shot: two orthogonal axes

The old `mode` field conflated authoring intent (marker / surveyor / measure
/ stage) with camera intent. These are different concerns. Replaced with:

- **`tool: null | 'surveyor' | 'measure'`** — the authoring tool in use.
  `null` is the default **Design** state (no tool selected). No `'design'`
  enum value; absence is the meaning. Marker is controlled separately via
  `markerActive` because it layers over any tool.
- **`shot: 'designer' | 'browse' | 'hero' | 'street'`** — which camera +
  environment preset is active. `'designer'` = the authoring workspace
  (ortho plan view, aerial tiles, overlays). `'browse'` / `'hero'` /
  `'street'` are the three Stage camera shots authored in `SHOTS` (in
  `src/stage/StageApp.jsx`).

**Toolbar morphs on `shot`:**
- Designer shot → `Marker | Surveyor | Measure` + shot selector
- Any other shot → `← Return to Designer | Publish` + shot selector

Shot selector (`Browse | Hero | Street`) is always visible on the right
side of the toolbar. `Publish` is a stub right now (logs a line) — wire
it up when we're ready to publish.

### Environment pipeline wired into Cartograph

The Stage environment stack now runs inside Cartograph's unified Canvas
whenever a non-Designer shot is active:

- `<StageShadows />` (SoftShadows helper) — gated `{!inDesigner}`
- `<PostProcessing />` (EffectComposer with AO, Bloom, AerialPerspective,
  FilmGrade, FilmGrain) — gated `{!inDesigner}`
- `TimeTicker` + `SkyStateTicker` — always running; ticker callbacks are
  side-effect-only and cheap enough
- `CelestialBodies` + `CloudDome` — wrapped in `<group visible={!inDesigner}>`

All exported from `src/stage/StageApp.jsx`. `StageCanvas.jsx` is deleted —
its entire contents now live inside `CartographApp.jsx` via the shot-only
group.

**Consequence: the Environment panel's sliders in Stage mode now drive live
rendering.** Previously they wrote to `envState` but nothing in cartograph
read that, so they were cosmetic. Now every slider (Exposure, AO, Bloom,
Aerial Haze, Film Grade, Film Grain, Shadows) updates the composer per
frame through refs.

### Arch & Horizon controls + swappable ground disc

Added `archState` to `src/stage/StageApp.jsx` alongside `envState`, exposed
as `setArch` / `useArchState`. Defaults in `ARCH_DEFAULTS`: distance (from
origin along a fixed bearing), scale, rotation, Y offset, and horizon
disc radius + fade band.

`GatewayArch` reads these every frame — no hardcoded constants. A new
`GroundDisc` sibling component renders a soft-edged round plane beneath
the arch, fading from opaque to transparent between `horizonFadeInner` and
`horizonFadeOuter`, colored by the live sky `horizonColor`. Simulates the
horizon so the arch reads as "heroic on the ground" from the shot camera.

`StagePanel` gets a new **Arch & Horizon** collapsible section with sliders
for every archState field. `DesignerArch` (exported from `StageArch.jsx`)
renders a flat-black catenary silhouette in the Designer — the arch is a
plan-view feature of the map, not just a Stage thing.

**This is the first piece of the** `stage-config.json` **authority story**
(see `project_stage_is_scene_authority.md`) — Arch & Horizon values live
in a store that will eventually persist to disk and be consumed by the main
app's scene. For now it's in-memory only.

### Color pickers wired to rendering

The Designer panel's color pickers used to write to `layerColors` in the
store, but neither `MapLayers` nor `StreetRibbons` read that — they used
hardcoded constants (`C.*` in MapLayers, `BAND_COLORS` in streetProfiles).
**All pickers were cosmetic.**

Now:

- `src/cartograph/m3Colors.js` is the single source of truth for defaults.
  It exports `DEFAULT_LAYER_COLORS` (per panel layer id),
  `DEFAULT_LU_COLORS` (per land-use), and `BAND_TO_LAYER` (maps ribbon
  band materials like `'asphalt'` → panel picker ids like `'street'`).
- `MapLayers` subscribes to `store.layerColors` and resolves each material
  via `layerColors[id] || DEFAULT_LAYER_COLORS[id]`. Re-memos on change.
- `StreetRibbons` does the same for band colors, routed through
  `BAND_TO_LAYER` so a single "Streets" picker paints asphalt + parking
  bands, "Curb" paints curb + gutter, "Sidewalk" paints sidewalk + treelawn
  + lawn. Face-fill colors still use `luColors` from the Panel + LU
  defaults.

**Palette direction shifted** from "M3 muted neutrals" → "vibrant graphic
map" during the session. The muted palette was calibrated for flat
pass-through viewing (Designer) but crushed to near-black under ACES tone
mapping in shots. Bumped residential to grass-green (#5A8A3A), asphalt to
#4A4A48, sidewalks to warm cream (#B8B2A4). This is still placeholder —
we'll converge on final colors once the park/shader work lands.

**Pickers currently hidden**: `tree`, `lamp`, `labels`. Each needs its own
authoring section (light color + intensity for lamps, foliage material for
trees, typography + scale for labels) — not a color well. Tree/lamp are
mostly driven by `LafayettePark` / `StreetLights` internals right now;
labels have no renderer.

### Caps propagation bug fixed

**Symptom:** operator set `capStart`/`capEnd` in Survey mode, edit saved to
`centerlines.json`, but the ribbon map didn't update to show the cap.

**Root cause, two parts:**

1. `updateStreetField` in the store was mutating the street in place and
   calling `set({ centerlineData: { ...centerlineData } })` — the outer
   object identity changed but the `streets` array stayed the same
   reference. `StreetRibbons`' `useMemo([liveCenterlines])` therefore
   didn't re-run. Fix: rebuild the streets array in the setter.
2. The merge loop in `StreetRibbons` was blanket-applying
   `capEnds: { start, end }` to every ribbon segment matching the
   centerline's name. For chain-split streets (one centerline → multiple
   ribbon segments), this produced spurious caps at intersection joints.
   Fix: apply `capStart` only when the ribbon segment's first point
   matches the centerline's first point (within 0.5m); same for `capEnd`.

### Park architecture (the unfinished piece)

**Decision made today, work only partly executed.** The park should be a
ribbon-rendered surface like any other block. "Park" is the authored layer;
grass is its current material. Future material variants (snow, autumn,
drought, illuminated night) are Park-surface treatments, not separate
layers. The Park material is picked in Stage like any other surface.

**Current state (end of 2026-04-17):**

- `StreetRibbons` face fills now render every face including the park (the
  earlier filter that skipped `use: 'park'` is removed).
- `DesignerPark.jsx` exists but renders only paths + water (no boundary
  polygon). Path + water **placement is still wrong** — the coords in
  `park_paths.json` and `park_water.json` are in some park-local system;
  neither `rotation = GRID_ROTATION` nor `-GRID_ROTATION` aligns them to
  world, which implies they may already be world-aligned and my rotation
  added the offset. Empirically test with `rotation = 0` first.
- `LafayettePark` still renders its own SVG-backed grass plane in shots,
  which z-fights with the ribbon park face. This is expected during the
  transition.

**Tomorrow's work, in order:**

1. Place paths + water correctly (iterate rotation until they sit inside
   the ribbon park face).
2. Remove `LafayettePark`'s grass plane (its territory is the ribbon park
   face now).
3. Attach the noise-based grass shader (currently living in
   `LafayettePark`'s `ParkGround` component) to the ribbon park face's
   material **only in shots**. In Designer the face stays flat-colored.
4. Once LafayettePark's path/water rendering is what shots use, Designer
   can consume the same component. Then `DesignerPark` dies.

### Ribbon lighting pipeline details

- `SHADOW_TINTED_FLAT` is applied to ribbons in shots (not just Designer).
  Math: extract luminance ratio from PBR output, undo BRDF's 1/π division
  so palette tones land near their Designer values, clamp to `[0.25, 3.5]`
  so shadows don't go to void and bright-lit surfaces have headroom.
- `polygonOffset` on ribbons is `factor = -pri, units = -pri * 4` —
  negative pulls ribbons toward the camera in depth to beat terrain (which
  has zero offset), and `factor = -pri` preserves intra-ribbon priority
  (higher pri = more negative = more forward). Asphalt pri=8 beats
  terrain; sidewalk pri=5 sits behind corner plugs pri=10, etc.
- Ribbon group is lifted to `y = 0.15` in shot mode so it clears the
  terrain mesh (`y = -0.1` with uExag displacement on top). In Designer
  (terrain hidden) the lift is zero so MapLayers' footway polygons at
  `y = 0` aren't buried under ribbons.
- **Terrain mesh is hidden in shots** via `<group visible={false}>` but
  its shader uniforms stay live so ribbons and buildings still get the
  terrain displacement. Good for now; we may bring it back once the park
  is fully owned by ribbons.

### Known issues carried into tomorrow

- **Park paths + water mis-placed** (see Park architecture above)
- **No cast shadows on ribbons at any time of day** (including /stage).
  The shadow map renders, the ribbons have `receiveShadow: true`, the
  shader reads `reflectedLight.directDiffuse` (which includes shadow
  attenuation) — yet visible cast shadows don't appear on the street
  surfaces. Investigate: shadow-camera frustum coverage, bias/normalBias,
  or the SHADOW_TINTED_FLAT clamp swallowing the shadow delta.
- **Ribbons in shots look darker than expected for midday** — palette
  brightening helped significantly but the darker base colors (asphalt
  especially) still crunch through ACES + PostProcessing. This is at
  /stage parity now; diverging further would mean either further palette
  brightening or a graphic-map emissive treatment.
- **Designer sidewalks render too visibly** — the sidewalk tone
  (`#B8B2A4`) is correct for the plan view but shows as prominent white
  strips against dark asphalt. When LafayettePark eventually owns the park
  surface and we refine the palette, revisit.
- **Camera in shots can go underground** — I unlocked `minPolarAngle: 0,
  maxPolarAngle: π` so the operator can diagnose underside rendering.
  Leave unlocked; it's diagnostic-useful.

### Files touched today

- `src/cartograph/CartographApp.jsx` — unified Canvas + camera rig
- `src/cartograph/StageCanvas.jsx` — **deleted**
- `src/cartograph/stores/useCartographStore.js` — `tool` + `shot` replace `mode`
- `src/cartograph/Toolbar.jsx` — morph on shot, shot selector
- `src/cartograph/Panel.jsx` — reads tool, palette from `m3Colors.js`, hides unwired pickers
- `src/cartograph/m3Colors.js` — **new**. Canonical palette + band→layer mapping
- `src/cartograph/DesignerPark.jsx` — **new**. Paths + water (placement unfinished)
- `src/stage/StageApp.jsx` — adds `archState`, exports `StageShadows`/`PostProcessing`, adds `ArchHorizonControls`
- `src/stage/StageArch.jsx` — reads `archState`, adds `GroundDisc` + `DesignerArch`
- `src/stage/StageSky.jsx` — sky-dome ticker fix (confirmed; no change today)
- `src/components/StreetRibbons.jsx` — live `layerColors`, SHADOW_TINTED_FLAT π comp, polygon offset flip, no-face-filter for park, cap-match by terminal point

---

## 2026-04-16 additions — read first

**Dead-end caps are per-endpoint + operator-marked.** Each street in
`centerlines.json` has `capStart: 'round'|'blunt'|null` and `capEnd` set by the
operator in Survey mode (per-endpoint cap dropdown). The pipeline reads these
directly and emits `capEnds: {start, end}` on each ribbon street.
`StreetRibbons.jsx` renders them via `quarterCapRaw`. No auto-detection —
operator is authority. Supersedes the earlier auto-detection attempt which
produced too many false caps on divided-road inner endpoints.

**Divided one-ways remain a distinct class** (Truman Parkway, Benton Place,
Mackay Place loop streets, parts of Russell/Jefferson). The operator can now
correctly leave their inner-facing endpoints uncapped via Survey mode, so caps
are no longer blocked by them. Still want Phase 14 for median rendering and
plug handling.

**Manual measurement snapping.** On drag-release in Measure mode, band width
rounds to the nearest `SNAP_TARGETS` entry (5/6/8/10 ft for sidewalk, 7 or 8 ft
for parking, etc.). At typical map zoom 1 px ≈ 3 inches — sub-foot precision is
fiction. Survey-derived widths stay raw. Enables reliable template duplication.

**Measure caustic ruler (2026-04-16).** Clicking a centerline in Measure mode
draws a perpendicular **ruler** from centerline to property line at the street's
midpoint, colored per band with dots at each boundary. Operator clicks *on the
ruler* at a radius to **insert a new band boundary** — the band being split
keeps its material on both halves; the operator relabels via the panel
dropdown. Drag the dots to tune widths (snap-always). No along-street band
strips — those duplicated what `StreetRibbons` already shows.

**Default band stack is deliberately minimal.** Generic street =
`asphalt + curb`. Sidewalk-eligible (residential/secondary/primary) =
`asphalt + curb + sidewalk`. **No default parking or treelawn** — the operator
adds those via the ruler where reality shows them. This matches the "irregular
geometry" reality of the neighborhood (wide plaza sidewalks at retail,
missing sidewalks next to ramps, non-standard parking).

**Live centerlines → StreetRibbons.** `StreetRibbons.jsx` accepts a
`liveCenterlines` prop (the store's `centerlineData.streets`). For each street,
live `_bands` / `capStart` / `capEnd` override `ribbons.json`'s static values.
Measure / Survey edits show in the rendered map **instantly**, no pipeline
rebuild needed. Intersections and face fills stay static from the pipeline.

**Fills toggle = orientation mode.** Global toolbar button. Off = hide
StreetRibbons + MapLayers fills, keep line features (center stripes, edge
lines, bike lanes) + aerial visible. Operator uses this to visually align the
rendered map against the real aerial imagery.

**Glass-card styling.** Toolbar and each Panel section use the same glass
treatment as Stage (`.glass-panel` values from `src/index.css`, mirrored in
`.carto-glass` in `cartograph.css`): `rgba(0,0,0,0.25)` + blur(20px)
saturate(160%) + subtle border/shadow. Floating over the canvas so the map
shows through.

---

## 1. What the map is

A vector neighborhood map of Lafayette Square (St. Louis, MO) rendered as a Three.js
scene. The cartograph is the authoring tool — it shows the same 3D scene as the main
app but viewed from a flat, top-down orthographic camera. One renderer, two viewports.

The ground plane is built from **ribbon geometry**: each street is a set of
non-overlapping annular ring strips (asphalt, curb, treelawn, sidewalk) generated
from measured centerlines and cross-section profiles. Corner plugs merge sidewalks
at intersections using proven quadratic bezier curves. Block interiors are filled
with a single color per polygonized face based on dominant land-use classification.

**What renders:**
- **Streets** as ribbon rings (asphalt fill + curb edge, sidewalk/treelawn only where measured)
- **Land-use fills** (one color per block face: residential, commercial, park, etc.)
- **Buildings** (footprints positioned to assessor centroids)
- **Corner plugs** (sidewalk merge at intersections)

**Key constraint:** the system does NOT guess at sidewalks or treelawns. An unmeasured
street renders as pavement + curb only. Sidewalks appear only where the operator has
explicitly placed measurement bands. This prevents the map from showing inaccurate
geometry that the user would have to audit and undo.

The pipeline is intended to be reusable — it should not be Lafayette-Square-specific.
Avoid hardcoded coordinates, bespoke fixes, or one-off carve-outs unless truly
unavoidable. Generalizable always wins.

---

## 2. Data sources (inputs)

| File | Source | Contents |
|------|--------|----------|
| `cartograph/data/raw/centerlines.json` | Surveyor mode (seeded from block_shapes + OSM) | **PRIMARY**: 451 street centerlines with metadata (type, oneway, dead-end, loop, smooth). Each street has `_original` for revert. Editable in Surveyor mode. |
| `cartograph/data/raw/measurements.json` | Measure mode | Per-street cross-section overrides. Measurement bands define asymmetric left/right profiles. |
| `cartograph/data/raw/osm.json` | OpenStreetMap (one-time fetch) | All highway features, building footprints, landuse/leisure/amenity polygons. **Fallback** — centerlines.json takes priority. |
| `cartograph/data/raw/survey.json` | City Assessor + OSM sidewalk distance | Per-street `pavementHalfWidth`, lane count, oneway, cycleway. **Fallback** — measurements.json takes priority. |
| `cartograph/data/raw/elevation.json` | USGS National Map (cached) | Sparse elevation samples for building elevations and contour generation |
| `scripts/raw/stl_parcels.json` | St. Louis City Assessor (one-time fetch) | Parcel polygons with land_use_code, zoning, building_sqft, centroid, rings |
| `cartograph/data/neighborhood_boundary.json` | Hand-curated | Polygon defining what's "in the neighborhood" |
| `cartograph/data/clean/marker_strokes.json` | Marker mode | Freehand strokes for debugging — human → operator communication |
| `src/data/ribbons.json` | Pipeline output | Street ribbon geometry for Three.js rendering (streets, profiles, intersections, face fills) |

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

## 11. Cartograph application modes

The cartograph is a Three.js app with an orthographic top-down camera. It renders
the same scene as the main app (StreetRibbons.jsx) viewed flat. Four modes:

### 11.1 Marker mode
Freehand strokes for debugging. Human→operator communication channel.
Strokes persist to `data/clean/marker_strokes.json`. The `/analyze` endpoint
reports which blocks/parcels overlap the marker bbox.

### 11.2 Surveyor mode
Centerline editor. The operator cleans up street geometry and sets metadata.

- Click a street to select → shows editable centerline with draggable nodes
- Metadata panel: name, type, one-way, dead-end, loop
- Smooth slider (0–100): Catmull-Rom tension for curved streets
- Toggle Node (hide/show individual points), Toggle Street (disable/enable)
- Revert to Original (restores `_original` from seed data)
- Arrow key nudging (0.15m, shift = 1.0m)
- Exit surveyor → saves centerlines.json → rebuilds pipeline → reloads

Data: `data/raw/centerlines.json` (451 streets, seeded by `seed-centerlines.js`)

**Surveyor defines WHAT and WHERE.** Type, direction, topology, geometry.

### 11.3 Measure mode
Cross-section editor. The operator defines per-side widths from aerial imagery.

- Click-click line placement with waypoints
- Per-segment material assignment (asphalt, concrete, brick, etc.)
- Drag endpoints and waypoints, arrow-key nudging
- Aerial overlay with centerlines as reference

Data: `data/raw/measurements.json` (per-street cross-section overrides)

**Measure defines HOW WIDE.** Asymmetric left/right profiles supported.
Only measured cross-sections render — no default sidewalks or treelawns.

### 11.4 Design mode (planned)
Styling controls for the composed map:
- Material colors (asphalt, curb, land-use fills)
- Per-layer strokes (color + width, like Photoshop layer effects)
- Font and text treatments for street labels
- **Launch button** → opens the main app (localhost:5175) with same scene +
  lighting, shadows, terrain, post-processing

### 11.5 Data flow
```
Surveyor → centerlines.json (geometry + metadata)
                ↓
Measure  → measurements.json (per-side cross-section overrides)
                ↓
         survey.json + standards.js (fallbacks)
                ↓
         Pipeline (derive.js) → ribbons.json (ribbon geometry + face fills)
                ↓
         StreetRibbons.jsx ← ONE RENDERER
            ↓                    ↓
   Cartograph (flat)      Main app (3D)
   orthographic cam       perspective cam
   surveyor/measure       lighting/terrain
```

### 11.6 Authority stack for cross-section profiles
```
1. measurements.json  (operator-measured, per-side)     ← highest
2. survey.json        (OSM sidewalk distance + assessor ROW)
3. standards.js       (generic defaults by street type)  ← lowest
```

Only measured data produces sidewalk/treelawn rings. Survey and standards
provide pavement width only.

---

## 12. Build commands cheat sheet

```bash
cd cartograph

# Seed centerlines (one-time, or delete centerlines.json to re-seed)
node seed-centerlines.js

# Full pipeline rebuild
node pipeline.js --skip-elevation

# Legacy SVG preview (being replaced by Three.js cartograph)
node render.js && node serve.js  # http://localhost:3333

# Copy ribbons to app data
node -e 'const m=require("./data/clean/map.json"); require("fs").writeFileSync("../src/data/ribbons.json", JSON.stringify(m.layers.ribbons,null,2))'

# Inspect data
node -e 'const r=require("../src/data/ribbons.json"); console.log("streets:", r.streets.length, "ix:", r.intersections.length, "faces:", r.faces?.length)'
node -e 'const c=require("./data/raw/centerlines.json"); console.log("centerlines:", c.streets.length)'
```

### serve.js endpoints
| Method | URL | Purpose |
|--------|-----|---------|
| GET/POST | `/markers` | Marker strokes |
| GET/POST | `/measurements` | Measurement data |
| GET/POST | `/centerlines` | Surveyor centerline data |
| GET | `/analyze` | Report parcels/blocks under markers |
| POST | `/rebuild` | Run render.js, return when done |

---

## 13. Three.js ground plane (StreetRibbons)

The ground plane is native Three.js ribbon meshes rendered by `StreetRibbons.jsx`.
This component renders the ENTIRE neighborhood from `src/data/ribbons.json` — 122
streets, 180 intersections, 99 face fills. It is used by both the cartograph
(orthographic top-down) and the main app (3D perspective).

### Ring model (WORKING for all 122 streets)

Each street material is a non-overlapping **ring** (annular strip, inner→outer HW),
split at IX into left/right halves. Materials don't overlap on the same street, so
there are NO priority conflicts between same-street layers.

Priority (only matters at crossings where streets overlap):
face_fill(1) < treelawn(3) < sidewalk(5) < curb(6) < asphalt(8)

**Default rendering:** pavement + curb only. Sidewalk and treelawn rings only appear
where the operator has explicitly measured them. The system does not guess.

### Face fills (WORKING)

Each polygonized block face gets a single flat color from its dominant land-use
classification (residential, commercial, park, etc.). 99 faces, rendered at
priority 1 (lowest). Streets render on top.

### Corner plugs (WORKING on Rutger × Missouri, not yet all intersections)

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
| `src/components/StreetRibbons.jsx` | Three.js ribbon renderer (arms + corner plugs + face fills) |
| `src/components/Scene.jsx` | Mounts StreetRibbons in the main app scene |
| `src/data/ribbons.json` | Pipeline output: streets, profiles, intersections, face fills |
| `cartograph/data/raw/centerlines.json` | Surveyor-edited street centerlines (canonical) |
| `cartograph/data/raw/survey.json` | Per-street pavement widths (fallback) |
| `cartograph/data/raw/measurements.json` | Per-street cross-section overrides (highest authority) |
| `cartograph/seed-centerlines.js` | One-time script to generate centerlines.json from curated + OSM |
| `cartograph/serve.js` | Dev server with endpoints for markers, measurements, centerlines, rebuild |

---

## 14. Glossary

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
