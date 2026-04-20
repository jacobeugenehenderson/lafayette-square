# Cartograph Backlog

Last updated: 2026-04-20

## 2026-04-20 session — locked decisions

Big day. Authoring loop went from "rough" to "passable." Toy fixture stood up.
Couplers Phase 1A (UI) shipped. Pipeline now clips paths to curb. Toolbar
redesigned and Fills semantics finally make sense.

### Architectural / strategic

1. **Stage IS the runtime scene.** Confirmed (after deep audit) that we don't
   need to "rebuild and copy over" — the runtime app already shares 90% of
   Stage's components (StreetRibbons, LafayetteScene, LafayettePark, etc.).
   The only forks are `StageSky` ↔ `CelestialBodies` (~1150 lines) and
   `StageArch` ↔ `GatewayArch`. Convergence path is well-defined: write
   `public/stage-config.json` schema → de-fork sky/arch with a `source` prop
   → wire cartograph "Publish" button → delete VectorStreets. Estimated
   ~3-4 focused days when ready.

2. **Toolbar redesigned, four orthogonal axes.** `tool` × `shot` × `scene` ×
   `Fills` are truly orthogonal — clicking through any combination lands in
   a coherent state.
   - Toolbar uses iOS-style segmented pills: `[Survey · Measure]`
     `[Fills]` `[Browse · Hero · Street]` `[Toy]` in Designer; shot mode
     swaps tools group for `[← Designer] [Publish]`.
   - Fills + Toy collapsed from 2-segment groups into single binary
     ToggleButtons. Aerial toggle dropped entirely (always on, redundant
     with Fills). New CSS tokens for the toolbar in cartograph.css.

3. **Toy scene operational.** Single 4-way intersection at origin with 4
   quadrant blocks, 12 houses (1878-1930 era → mansard / hip / flat roof
   variation + foundation pedestals via the real `Building` + `Foundations`
   components), 8 trees (real `ParkTrees`), 8 lamps on sidewalks (real
   `StreetLights`). Imports shared components, exports nothing. Lives in
   `src/toy/`. Hill terrain attempted then flattened pending elevation
   integration with `terrainShader` (task #9).

4. **Path/alley clipping is a pipeline rule, not a manual edit.** New
   `clipFeaturesOutsideCurb` helper in derive.js subtracts the union of
   `clippedStreets + CURB_WIDTH` from every footway/cycleway/steps/path/alley
   before emission. Paths now terminate at the curb everywhere. Z-fight
   killed by lifting MapLayers' path-family meshes to y=+0.06 (clears
   StreetRibbons face fills at y=+0.15 in shots).

5. **No destructive operations.** The old `splitAtNode` (turned one
   centerline into two separate entries with no rejoin) is gone. Replaced
   by **opt-in split couplers** — non-destructive markers on existing
   centerline nodes, fully reversible by toggling the same marker off. See
   `feedback_no_destructive_ops.md` (memory) for the principle. Wrote
   `cartograph/rejoin-splits.js` to remediate already-split centerlines (7
   pairs merged). Saved as a one-shot recovery utility.

6. **Couplers Phase 1A — UI + data only.** Right-click any interior node
   in Survey → toggles a split coupler at that node (renders as paired
   semicircles oriented along the street tangent — the "extension cord"
   visual). Persists as `centerlines.streets[i].couplers: [pointIdx]`.
   Pipeline doesn't yet split at coupler points — that's Phase 1B.

7. **Measure tool: real fixes shipped.**
   - Asymmetric drag bug fixed: pipeline reverses some ribbon segments
     relative to centerline orientation, causing left/right side mapping to
     flip. New orientation guard in StreetRibbons' merge step swaps
     `live.measure.left ↔ right` when ribbon tangent disagrees with live
     centerline tangent (dot product < 0).
   - Double-click-to-insert was being eaten by empty-pointerdown deselect.
     Removed the deselect; Esc remains the explicit deselect gesture.
   - Per-side reset removed (proved buggy). Replaced with **per-segment
     reset** (Phase 1B) — addressable once couplers split a street.
   - Min stripe width 1.0m enforced in `applyDrag` so handles can't visually
     collapse onto each other. Right/Ctrl-click remains the explicit "zero
     this stripe" gesture.
   - Handles **stagger along street tangent** when their `r` values are
     within `HANDLE_LONG + 0.5m` of each other — keeps them independently
     clickable on tight cross-sections (e.g. Park Avenue south side with
     8cm treelawn).

8. **Fills semantics finalized.** Fills is a comprehensive *overlay
   shortcut* layered on top of per-layer panel state.
   - **Fills ON** (default): full digital map renders. Per-layer toggles
     in Designer panel control individual layers granularly.
   - **Fills OFF**: hide everything except aerial photo + roadway
     composites (ribbons + corner plugs + stripes/edges/bike lanes + paths
     + lamps). Per-layer state preserved underneath — re-toggling Fills
     ON returns you to whatever per-layer state existed.
   - Same gesture, same effect, regardless of tool. Per-layer state
     persists across tool changes.

9. **Translucency belongs to the ribbons, not the rest.** Survey ribbons
   render translucent blue (0.28 opacity); Measure ribbons render translucent
   per-stripe (0.45 opacity). Face fills + buildings + paths stay **opaque**
   in every tool. The aerial-through-ribbon affordance is the tool's edit
   surface; everything else stays clean.

10. **Aerial bumped to z=19, then reverted to z=18.** z=19 was hitting
    tile-availability limits in some areas. Bump back when we have a
    fallback strategy (try z=19, fall back to z=18 on 404).

## 2026-04-20 — queued items

| # | Task | Notes |
|---|------|------|
| C.1 | **Couplers Phase 1B.** Per-segment measure storage in store (`segmentMeasures: {"start-end": {...}}`). Measure tool selects segment-between-couplers. Per-segment reset button. Pipeline splits centerlines at coupler nodes when emitting ribbons. Helpers `segmentRangesForCouplers` + `measureForSegment` already exist in `streetProfiles.js`; store actions `toggleCoupler` + `resetSegment` already exist. Just need editor + pipeline wiring. | Foundation laid. |
| C.2 | **Aerial z=19 with z=18 fallback.** TextureLoader can take an `onError` callback; on 404 retry the equivalent z=18 tile and stretch. | UX win — aerial detail at zoom-in. |
| C.3 | **Survey shows measured silhouette stroke.** Once Measure has been used, the Survey ribbon outer-stroke should reflect the actual measured ROW, not the default. Closes the Survey↔Measure feedback loop the operator needs. | High value. |
| C.4 | **Shadow post-pass (Approach D).** Per-frame post-processing effect that reads scene depth + shadow map, masks with material-ID stencil, multiplies onto flat-shaded ground pixels. Solves shadows on StreetRibbons without changing its flat shader. ~2-3 days. See `SHADOW_HANDOFF.md`. | Publishing polish blocker. |
| C.5 | **Fix dead-end caps (again).** Endcaps regressed somewhere — round/blunt cap rendering inconsistent across streets that have `capStart`/`capEnd` set. Need to re-verify the cap-match-by-terminal logic in StreetRibbons (added 2026-04-17 to prevent chain-split spurious caps) is still working with the orientation guard from 2026-04-20. | Recurrence. |
| C.6 | **Fix Survey "smooth" feature.** Catmull-Rom smoothing slider in SurveyorPanel — operator drags 0–100, expects centerline to interpolate through the same nodes with curve tension. Currently does not produce expected result; either slider not wired or smoothing not applied to displayed line. | Authoring tool bug. |
| C.7 | **Audit non-residential land-use classification.** Walk the neighborhood face fills and verify non-residential blocks (commercial, institutional, parking, park) are correctly classified. Park Avenue commercial strip, churches, school on Park Ave, the park itself, off-street parking lots — each should land in its right `face.use` value, otherwise face-fill colors mislead. Pipeline reads from parcel `land_use_code` dominant per face; misclassifications usually trace to a face whose dominant parcel is misleading. | Map correctness. |
| C.8 | **Path / face-fill z-fight unresolved.** Tried two passes of lift (+0.06m, then +0.15m) on alley/footway/stripe/edgeline/bikelane meshes. Operator still sees flicker at marked spots. Likely shot-mode-specific (terrain displacement amplifies coplanar issues) or the `polygonOffset` on these flat materials competing with face-fill's offset. Real fix probably requires either: (a) higher polygonOffsetFactor on path materials specifically, (b) a separate render pass with depthTest off, or (c) merging path geometry into the StreetRibbons face-fill mesh so they share the same draw. Investigate when shadow post-pass lands (related infrastructure). | Visual polish. |

## 2026-04-19 session — locked decisions

Captured end of day. Supersedes conflicting 2026-04-18 items.

1. **Measure model rewrite landed.** `measure: {left, right, symmetric}` per
   street; each side is `{pavementHW, treelawn, sidewalk, terminal}`. Hardwired
   stripe sequence asphalt → curb(fixed) → [treelawn] → [sidewalk|lawn].
   `_bands` removed from centerlines.json; pipeline + renderer + overlay +
   panel all rewritten. Old 8-material band stack retired. Parking is out of
   Measure entirely — becomes a separate overlay layer.

2. **Corner plug is universal + narrower-sidewalk rule.** One primitive per
   corner (bezier-rounded asphalt + curb + sidewalk arcs). Sized to the
   narrower sidewalk of the two meeting legs; wider surfaces butt. Skip the
   sidewalk arc only when neither leg has sidewalk. See memory
   `project_corner_plug_rules.md`.

3. **Royal blue = architectural color.** `#2250E8` for authoring overlays:
   centerlines in both Survey + Measure, Survey ribbon tint, outer property
   stroke. See memory `project_architectural_blue.md`. Reserved for tool
   context; ribbons never get this blue in production rendering.

4. **Measure UX: rectangular pills on strokes, anchored at click.** Handles
   are 5m × 1.2m pills oriented along the street, positioned at the click
   point's tangent frame (not midpoint). Drag to resize; right/ctrl-click
   to remove; double-click the sidewalk zone to insert a treelawn split.
   Symmetric by default; Asymmetrical unlock in panel.

5. **Ribbons tint in Measure + Survey.** `measureActive` → per-stripe
   translucent fills + per-material opaque strokes at every boundary.
   `surveyActive` → uniform blue tint + blue stroke at outermost boundary
   only. Aerial shows through fills in both modes.

6. **Residential land use gets the grass shader** in shots. Factored via
   `makeGrassMaterial({ color: luColors.residential })` — same noise shader
   as park. Treelawn ribbons adopt the residential grass material, lawn
   ribbons adopt the park grass material. Designer keeps flat face fills.

7. **Stage terrain coverage complete** for the obvious layers:
   - Lamps / glow / pool / base now instanced-terrain-displaced
     (`patchTerrainInstanced` in `terrainShader.js`).
   - Street markings (centerStripe / parkingLine / bikeLane) rebuilt as
     quad-strip ribbons (`stripeRibbonGeo`) that pick up terrain from
     `makeFlatMat`. No more 1-px lines buried under lifted ground.
   - Alley z-fighting fixed by reducing `makeFlatMat` polygonOffset to
     match StreetRibbons scale.

8. **Park-data coordinate systems clarified.** `park_trees.json` +
   `park_water.json` are park-local (axis-aligned in park frame), need
   `PARK_GRID_ROTATION` wrapper to sit in world. `park_paths.json` is
   world-aligned, counter-rotates inside LafayettePark. See NOTES.md's
   "RECURRING CONFUSER" section.

## 2026-04-18 — new items queued

| # | Task | Notes |
|---|------|------|
| A.1 | **Uplighting at the base of the Gateway Arch.** Ground-level warm lights that kick on at night (match streetlamp night-gate). | Visual accent; arch is the neighborhood's visual anchor. |
| A.2 | **Gradient editor for the skydome.** Operator-authored color gradient for the shot sky — enables branding looks (sports games, seasonal themes). | Future extension: fireworks particle system once the editor exists. |
| A.3 | **Fix Surveyor + Measure tool interfaces.** Currently usable but rough; needs UX pass (selection feedback, band add/remove flow, cap-marking clarity, keyboard shortcuts). | Direction set; execution pending. |
| A.4 | **Camera animations + controls for shots.** Browse/Hero/Street transitions, smooth tweens between shots, programmable camera paths. Current OrbitControls is serviceable but shot transitions are instant snaps. |
| A.5 | **Thicker barrier lines.** 707 barriers emit correctly (598 fence / 56 wall / 45 retaining_wall / 8 hedge, mostly property-line fencing; ~15 around the park). `LineBasicMaterial.linewidth` is ignored in WebGL on most platforms — lines render at 1 px. Upgrade to extruded line meshes (e.g. `meshline` or a custom ribbon strip) so fences read on the map at Browse zoom. |



Architecture: The cartograph IS the 3D scene viewed flat (orthographic top-down).
**Stage is embedded in cartograph** (not a separate app) — the same Canvas hosts
Designer (ortho) and Browse/Hero/Street shots (perspective) via a two-camera rig.

## 2026-04-17 session — locked decisions

Captured at end of day. Where these conflict with 2026-04-16, these win.

1. **Cartograph hosts Stage.** One `<Canvas>`, two cameras (ortho for Designer,
   perspective for shots). No more dual-Canvas architecture. `StageCanvas.jsx` is
   deleted; its children live inside `CartographApp.jsx` via a
   `<group visible={!inDesigner}>` wrapper for environment-only meshes. Fixes the
   long-standing WebGL context-loss skew bug that appeared when flipping between
   the two modes.

2. **Tool and Shot are orthogonal axes.** `tool: null | 'surveyor' | 'measure'`
   (null = neutral Design state, no `'design'` enum value). `shot: 'designer' |
   'browse' | 'hero' | 'street'`. Toolbar morphs on shot. Shot selector always
   visible. Supersedes the unified `mode` field. `Publish` button is a stub;
   implement when we're ready to publish.

3. **Stage is the scene authority, in progress.** `archState` in `StageApp.jsx`
   is the first slice — arch distance / scale / rotation / Y offset, plus
   horizon disc radius + fade live in one place and drive both Stage rendering
   and the Designer plan-view silhouette (`DesignerArch`). Eventually persists
   to `public/stage-config.json` and the main app reads from it. For now it's
   in-memory. See `project_stage_is_scene_authority.md` (memory).

4. **The palette is data, not constants.** `src/cartograph/m3Colors.js` is the
   single source of truth for default layer + land-use colors and for the
   `BAND_TO_LAYER` mapping between ribbon band materials and Designer-panel
   picker ids. `MapLayers` and `StreetRibbons` resolve every material color via
   `store.layerColors[id] || DEFAULT_LAYER_COLORS[id]`. Panel color pickers
   now drive rendering live. Palette is currently "vibrant graphic map" —
   muted M3 was too dark through ACES in shots.

5. **Tree / Lamp / Labels pickers are hidden** until they have real authoring
   sections. "Lamp color" isn't the right abstraction (light color + intensity
   is); "Tree color" isn't either (foliage material is); Labels needs
   typography + scale. A single color well was misleading.

6. **Park is a ribbon-rendered surface.** `StreetRibbons` face fills render the
   park face like any other block. The "Park" authored layer can later receive
   a swappable material (grass today; snow / autumn / drought / illuminated
   night are all Park-material variants, not separate layers). Paths + water
   are still owned by `LafayettePark` (shots) / `DesignerPark` (Designer), but
   their placement references the ribbon park face. See
   `project_park_as_ribbon_surface.md` (memory).

7. **Rotation is unlocked in shots** so the operator can orbit under the map
   (diagnostic). `minPolarAngle: 0, maxPolarAngle: π`. Leave unlocked.

## 2026-04-16 session — locked decisions

Captured before any interruption. These supersede earlier conflicting items:

1. **Defaults are Material-3 compliant until edited.** Every styleable property ships a
   sober, neutral default; the Designer is where users override. Measure-tool caustics
   stay loud but live in a separate palette (`CAUSTIC_BAND_COLORS`), never leaking into
   the rendered map. See `feedback_material3_defaults.md` (memory).

2. **Sidewalks are a default, not an operator-placed extra.** Every sidewalk-eligible
   street (residential / secondary / primary) gets a default sidewalk band filling the
   full curb-to-property-line gap. Tree lawns stay operator-placed; operator adds
   them by biting into the default sidewalk width. This supersedes
   `feedback_no_default_sidewalks.md`. **Not eligible:** service, footway, cycleway,
   pedestrian, steps — they're walking surfaces themselves. Alleys are pavement-only.

3. **Property line is survey-derivable.** `rowWidth/2 − pavementHalfWidth` from
   `survey.json` gives the authoritative per-street curb-to-property-line distance.
   Default band stacks are sized from this, not from a flat "5 ft" everywhere.

4. **Cross-section is asymmetric.** Schema: `bands: { left: [...], right: [...] }`
   on each street in ribbons.json. Up to 4 bands per half-width. Symmetric case =
   `left === right`. L/R is defined by traversing the centerline from `points[0]`
   onward; `side = +1` (matching existing `offsetPolyline`) is right.

5. **Gutter collapses into curb.** Visually indistinguishable at map scale. If the
   Designer wants to style it differently, it falls out as a stroke on the curb's
   inner edge via the layer-effects UI.

6. **Each mode has its own visual vernacular.** Subject matter (centerlines+nodes in
   Surveyor, bands in Measure, strokes in Marker) is visually dominant; aerial is
   context, not foreground. See `feedback_wysiwyg_authoring.md` (memory).

7. **One renderer.** SurveyorOverlay's private translucent `buildRibbonGeo()` is
   the two-renderer antipattern. Kill it; surveyor/measure overlays emit ONLY edit
   affordances (nodes, handles, labels). StreetRibbons renders the map beneath.

8. **Fills toggle.** Default: ribbons render at full opacity over aerial (the map is
   the subject). User can toggle fills off for aerial-only orientation.

---

## Phase X ✓ COMPLETE — Fills toggle + single-renderer detour

| # | Task | Status |
|---|------|--------|
| X.1 | Add `fillsVisible` store flag (default true) + toolbar toggle | done |
| X.2 | Show StreetRibbons + MapLayers in tool modes too (gated by fillsVisible) | done |
| X.3 | Delete SurveyorOverlay's private `buildRibbonGeo` + translucent ribbon meshes | done |
| X.4 | MeasureOverlay similarly — keep caustic + selected-street drag UI only | deferred (works as-is) |

---

## Phase 8 ✓ COMPLETE — Full 8-material band pipeline

Pipeline + renderer now consume `bands: {left, right}` per street. Corner bezier
preserved. Regression: a stale WebGL context was producing a "parallelogram"
render artifact after several crashes; a hard refresh / site-data clear resolved.

| # | Task | Status |
|---|------|--------|
| 8.1 | `streetProfiles.js`: Material-3 `BAND_COLORS`; caustic palette renamed `CAUSTIC_BAND_COLORS` | done |
| 8.2 | `getDefaultBandsFromSurvey(type, survey)` builds full stack incl. default sidewalk | done |
| 8.3 | `derive.js`: emit `bands: {left, right}` per ribbon street; keep `profile` for back-compat | done |
| 8.4 | Regenerate `ribbons.json` via pipeline | done |
| 8.5 | `StreetRibbons.jsx`: `sideBandsToRings()` → one ring per band; `refEdgesForSide()` (curb-inner, curb-outer, property-line) | done |
| 8.6 | Corner plug code: swap inputs to reference-edge helpers; bezier formula preserved verbatim | done |
| 8.7 | SurveyorOverlay hook-count bug from strip (moved early-return below all hooks) | done |
| 8.8 | Migrate existing `_bands` on Mississippi & Park Avenue from flat array to `{left, right}` symmetric in centerlines.json | pending — pipeline auto-symmetrizes for now |

---

## Phase 9 — Panel reorg + stroke feature + decoration split

| # | Task | Status |
|---|------|--------|
| 9.1 | Reorganize Panel into three sections: **Street Materials / Block Fills / Map Decoration** | pending |
| 9.2 | Wire `BAND_COLORS` overrides through store → StreetRibbons reads overrides | pending |
| 9.3 | Split MapLayers decoration: `alley`, `footway`, `path`, `cycleway`, `steps` each independently toggled + colored (none get sidewalks) | pending |
| 9.4 | Layer-effects collapsible row per layer (Photoshop-style): fill color + stroke color + stroke weight + revert; collapsed by default. **No fill-visibility toggle** — designers hide a layer by matching its neighbor's color (see `feedback_styling_vs_visibility.md`). | pending |
| ~~9.5a~~ | ~~Move Fills button into Measure mode~~ — **CANCELLED**: operator wants Fills as a global orientation toggle regardless of mode (off = aerial + strokes for reality-alignment). Stays in toolbar permanently. | cancelled |
| 9.5b | Replace the 3 flat toolbar buttons (Survey / Measure / Stage) with a **3-way segmented pill** — makes "one at a time" visually explicit. | pending |
| 9.5 | Apply stroke to appropriate layers (curb, sidewalk edge, block outlines, building outlines) | pending |
| 9.6 | Measure: L/R side picker with direction-of-travel arrow (**"Side A/Side B"** not Left/Right — user rejected L/R naming as "wrong 50% of the time") | pending |
| 9.7 | Per-band material dropdown in Measure panel (so click-to-insert's auto-assigned material can be relabeled) | pending |
| 9.8 | Parallel-vs-angled parking sub-selector in Measure panel band row | pending |

---

## Phase 11 — Fold park + water into the pipeline (ACTIVE — top of queue)

Park is authored as a **ribbon-rendered surface** (not a bespoke LafayettePark
component). "Park" is the layer; the material attached to it is grass today,
seasonally-swappable later. `LafayettePark`'s grass plane retires; its path
and water rendering moves to a shared layer consumed by both Designer and
shots. Only true 3D landmarks (GatewayArch etc.) stay as bespoke components.

**Today's state (end of 2026-04-17):**

- ✅ StreetRibbons face fills render park like any other block (filter removed).
- ✅ `DesignerPark.jsx` shell created, renders paths + water only.
- ❌ Paths + water still mis-placed (rotation unresolved — coords may be
  world-aligned and no rotation is needed; empirically test with 0 first).
- ❌ LafayettePark's grass plane still renders in shots, z-fighting with the
  ribbon park face. By design during transition.
- ❌ Grass shader not yet attached to the ribbon park face.

**Tomorrow's work (this phase, in order):**

| # | Task | Status |
|---|------|--------|
| 11.0 | Fix path + water placement in DesignerPark — empirically test `rotation = 0`, then `-GRID_ROTATION`, then `+GRID_ROTATION` and pick what aligns; may need a translation too | **NEXT** |
| 11.1 | Extract noise-based grass shader from `LafayettePark`'s `ParkGround` into a reusable material factory (`makeGrassMaterial`) | pending |
| 11.2 | Apply that material to the ribbon park face **in shots only** (Designer keeps flat face fill) — detect park face in StreetRibbons' `makeMaterial` and branch on layer id | pending |
| 11.3 | Remove LafayettePark's own grass plane (`ParkGround` component) — ribbon face owns that surface now | pending |
| 11.4 | Promote LafayettePark's path + water rendering to run in both Designer and shots; retire `DesignerPark` when parity reached | pending |
| 11.5 | Water polygons from `park_water.json` eventually become face-type entries in the ribbons pipeline (like `use: 'water'`); ribbons-time triangulation with outer/island holes | pending |
| 11.6 | Trees remain in `park_trees.json` (already decoration) — verify rendering parity after LafayettePark's grass plane is gone | pending |

**Future material variants for the Park layer (not in this phase):**

- Grass (default, current)
- Snow / frost (winter)
- Autumn foliage on fallen-leaf carpet
- Drought-brown
- Illuminated night (grass + lamppost light interaction)

These are Stage-authored material switches, selected per time/weather/season.
See `project_park_as_ribbon_surface.md`.

---

## Phase 12 — Material authoring: Design swatch → Stage editor

Every material (asphalt, grass, water, brick, parking, curb, sidewalk, treelawn…)
appears in the Design panel as a swatch with name + inline color picker. For deep
edits (shader, noise, tint map, texture tiling, procedural variation) the swatch
has an **"Edit in Stage →"** affordance that opens Stage pre-scoped to that material.

| # | Task | Status |
|---|------|--------|
| 12.1 | Material swatch component: name + color picker + "Edit in Stage" link | pending |
| 12.2 | Stage entry-point accepts a `?material=<id>` query param that jumps to that material in its gallery | pending |
| 12.3 | Migrate Stage's surface gallery (already built, per BACKLOG 6B.1) to be driven by the same material registry as cartograph | pending |
| 12.4 | Grass shader (already exists in LafayettePark) becomes the `grass` material's Stage view | pending |

---

## Phase 13 — Smart band populator + manual measurement snap + duplication

Note 2026-04-16: populator scope **narrowed**. Generic default is now minimal
(`asphalt + curb + sidewalk-for-eligible`, no default parking/treelawn) — the
operator captures irregular real-world cross-sections via the caustic ruler
(click-to-insert). 13.1–13.3 remain for optional smart augmentation but are
less urgent now that defaults are deliberately minimal.

| # | Task | Status |
|---|------|--------|
| 13.1 | `getDefaultBandsForStreet(tags, survey, parcels)` — consult OSM `sidewalk` tag first; fall back to street-class default | pending (optional) |
| 13.2 | Emit asymmetric `bands.left` / `bands.right` when OSM says `sidewalk=left`/`right` | pending (optional) |
| 13.3 | Parcel adjacency check — streets with no building/parcel frontage on a side (parks, rail, ramps) get no default sidewalk on that side | pending (optional) |
| 13.4 | Boundary-aware dead-end detection — endpoints near `neighborhood_boundary.json` are map exits, not cul-de-sacs. Combines with Phase 14 (divided oneways). | pending |
| 13.5 | **Snap-always on manual measurement drag-release.** | done |
| 13.6 | **Template duplication.** Measure panel "Apply this profile to…" action: operator selects a measured street, tool offers candidates (same type, similar ROW, same class) as multi-select, one click applies the band stack to all selected. | pending |

---

## Phase 14 — Divided one-ways + medians

Lafayette Square has divided one-way classes: Truman Parkway, the loop streets
(Benton Place, Mackay Place), possibly Russell and parts of Jefferson. In OSM
these are two separate `oneway=yes` ways sharing a `name`, running parallel with
a median gap. They currently break cross-section modeling and plug counts.
Update 2026-04-16: auto-detection of dead-ends was retired; caps are now
per-endpoint and operator-marked in Survey mode, so divided-road halves can be
correctly left uncapped by the operator. Phase 14 is still wanted for median
rendering and plug handling, but is no longer blocking cap re-enablement.

| # | Task | Status |
|---|------|--------|
| 14.1 | Detect divided pairs — same name + parallel + opposite `oneway` + within ~30m of each other over most of their length | pending |
| 14.2 | Emit asymmetric bands per half: outer side (toward property) = full stack; inner side (toward median) = narrow curb only, no parking, no sidewalk | pending |
| 14.3 | Median polygon emitted as its own face (`use: 'median'` or `'park'` for grass medians; `'paved'` for concrete) | pending |
| 14.4 | Suppress caps on inner-facing endpoints of each half — they're "rejoin-with-the-other-half" boundaries, not cul-de-sacs | pending |
| 14.5 | Plug logic at divided intersections: two halves meeting a cross-street = one logical intersection with 4 quadrants (not 8) | pending |
| 14.6 | ~~Re-enable cap rendering~~ — **DONE** (2026-04-16): caps are now operator-marked per endpoint; `StreetRibbons` `CAP_ENABLED = true`. | done |

---

## Phase 10 — Corner rounding, endcaps, polish

Corner plug *geometry* landed in 8.6 (proven bezier preserved, inputs rewired to
band-stack reference edges). Endcap assignment + rendering landed 2026-04-16.
Remaining work is visual validation + polish.

| # | Task | Status |
|---|------|--------|
| 10.1 | Propagate per-endpoint `capStart`/`capEnd` from `centerlines.json` through `derive.js` into `ribbons.json` | done |
| 10.2 | `StreetRibbons.jsx` renders round endcap geometry via `quarterCapRaw` per band per side. Blunt caps need no extra geometry. | done |
| 10.3 | Validate corner plugs visually across all 180 intersections — find any that look wrong with the new band-stack reference edges | pending |
| 10.4 | Verify the sidewalk×treelawn corner case: treelawn dead-ends, sidewalk fills through to form the corner curb ramp | pending |
| 10.5 | Polish the aesthetic curb stripe (`corner_curb` band) — color + width tuning via the Design panel | pending |
| 10.6 | Verify corners for streets with measured (asymmetric-capable) bands — Mississippi Avenue, Park Avenue — refs come from the correct side's band stack | pending |
| 10.7 | Corner plugs at dead-end intersections (T-intersections where one arm terminates) — special case handling | pending |

**Don't touch:** the bezier formula `ctrl = 2×mid(P0,P1) − oo`. It's proven across
all 4 quadrants with the oo↔ii distance-check swap. Only adjust *inputs* to it,
never the math itself. See `project_corner_rounding_progress.md`.

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

## Phase 2 — Default rendering: pavement + curb only (SUPERSEDED 2026-04-16)

~~The system does NOT guess at sidewalks or treelawns.~~ Superseded by the Material-3-
defaults principle: sidewalks ARE a default (reality, every block has one). Tree lawns
remain operator-placed. See the 2026-04-16 session notes above, and Phase 8.

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
