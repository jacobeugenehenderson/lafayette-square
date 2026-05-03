# Cartograph Backlog

Last updated: 2026-05-02

## 2026-05-02 — Weather pack (in flight: clouds first)

The product vision crystallized this session: Lafayette Square as a living
place, today's actual weather + scheduled event Looks. Real weather data is
already wired (`useWeather.js` → `useSkyState` → existing shaders). What's
missing is visual fidelity. See `project_weather_and_events_vision.md`.

- [ ] **Cloud renderer upgrade** (in flight). Current `CloudDome.jsx` is
  noise-based; needs to clear "people would set this as their desktop home
  screen" quality bar. Options to evaluate: drei `<Cloud>` sprites
  (cheap-medium), 2D textured layer parallax (medium), volumetric
  raymarching (heavy but stunning), pre-baked cloud sprite cubemaps per
  weather state (free at runtime, expensive to author). Desktop-quality
  tier acceptable; mobile gets a downgraded variant.
- [ ] **Wind effects.** Tree sway shader uniform (affects all instanced
  trees), cloud movement direction + speed (CloudDome shader), audio
  (wind, leaves, distant thunder).
- [ ] **Precipitation effects.** Rain particles + wet-surface specular
  shader on streets. Snow particles + roof accumulation (white tint
  masked by surface normal). Drives off `useSkyState.storminess` +
  WMO weather codes.
- [ ] **Heat haze.** Full-screen shimmer distortion for hot summer days
  in the park / hero shot.
- [ ] **Autumn foliage.** Leaf-fall particles, color-shift in tree LODs.
- [ ] **Audio integration.** Wind/rain/birdsong/distant city sounds tied
  to weather + TOD.

## 2026-05-02 — Sky gradient editor parked

- [ ] **Sky gradient editor — re-evaluate.** Operator-facing maximalist
  50-swatch sky color editor was scoped (4 bands × 10 palettes + sun
  glow). Parked before code in favor of Events-as-product-surface vision.
  When Events are real, per-event sky overrides will live there as one
  of many bundled tweaks. The math + defaults stay; per-event overrides
  rendered via the same patterns as Mist/Halo (color fields). May not
  need full 50-swatch editor; might be 4–8 strategic swatches per event
  (e.g., Bastille Day = R/W/B horizon/mid/high override + dusk variants).

## 2026-05-02 — Milky Way parked

- [ ] **Milky Way (Sky & Light, CELESTIAL) — re-enable.** Hidden from
  operator UI + runtime mount on 2026-05-02 after Brunier panorama
  showed visible JPEG block artifacting + stretched/oversized stars at
  Hero/Street FOV. All scaffolding preserved: channel state in
  `useCartographStore`, store actions via factory, `MilkyWaySphere`
  component in `src/stage/StageSky.jsx`, 12000×6000 panorama at
  `public/textures/milky_way.jpg`. Mounts commented at
  `src/cartograph/CartographSkyLight.jsx` and `src/stage/StageSky.jsx`.
  When returning, the real fix is one of: 16K+ equirectangular source,
  cubemap with 4096×4096 per face, or a different MW source with
  naked-eye-style star brightness instead of long-exposure photography
  (Brunier's panorama is gorgeous data but optimized for print, not
  real-time rendering at our FOV). See `project_milkyway_parked.md`.

## 2026-05-01 — open items

### Tree pipeline (just stabilized)
- [x] Roster fallback: out-of-roster placements substitute a same-category roster variant deterministically. 644/644 placements survive a partial roster.
- [x] Operator transforms (`scaleOverride` / `rotationOverride` / `positionOverride`) flow Arborist → manifest → index → bake → runtime.
- [x] Forbidden-surface filter at bake time (water / building / pavement / alley / sidewalk / footway / path).
- [x] Scale baked into the GLB at Arborist publish (`bake-look.js`). Runtime renders at scale=1; placement bake no longer carries a `scale` field.
- [x] Toy scene migrated from `<ParkTrees>` → `<InstancedTrees bakeUrl="/baked/toy.json" lookId="lafayette-square" />`. Real arborist pipeline drives the testing fixture.
- [x] `LafayettePark.jsx` cleaned (1293 → 700 lines): ParkTrees + helpers + leafTypesData removed.
- [x] Per-tile InstancedMesh culling (2026-05-02). `bake-trees.js` emits a 4×4 spatial grid (`tiles.instancesByTile`); runtime splits each species into one InstancedMesh per (url × tile) sharing the single atlas material; `frustumCulled` flipped on. Off-screen tiles cull naturally — biggest wins on Browse-corner / Street shots.
- [ ] **Fill out `lafayette-square` tree roster.** 17 entries today; runtime substitutes by category until topped up. Common species missing: quercus_alba, acer_saccharum, betula_pendula, tilia_americana, nyssa_sylvatica.
- [ ] **Fix mismeasured `approxHeightM` in the Arborist** for variants whose authored size renders wrong (magnolias 4×, generic_tree_2 6.7×, garden_mix:3 7×, tilia_americana:1 0.39×, etc.). Either correct via `scaleOverride` in the Arborist UI or fix the publish-time `computeApproxHeight` measurement. The bake no longer clamps — wrong sizes ship until corrected.
- [ ] **Auto re-bake-look on `scaleOverride` change.** Today operators must trigger `POST /atlas/bake?look=<name>` (or run the CLI) for scale changes to propagate into per-Look GLBs. Wire `arborist/serve.js`'s overrides handler to dispatch a per-Look re-bake when scale changes (debounce).

### Data integrity
- [x] `bldg-0924 building_sqft` corrected (1,310,842 → 2,125; the park's 30-acre area was mis-assigned to the building entry).
- [x] `bldg-0924 / bldg-0985` tagged `parkInterior: true`.
- [x] Kern Pavilion (lmk-124) + Betsy Cook Pavilion (lmk-125) added to `landmarks.json` under `parks/pavilions`.
- [ ] **Audit other buildings for the same `building_sqft` slip pattern.** Any entry whose `building_sqft` exceeds plausible footprint × stories likely has the same source-data error.

### Architecture / longer arc (deferred)
- [ ] **Formalize the −9.2° rotation.** Hardcoded across LafayettePark, MapLayers, InstancedTrees, bake-trees, ParkWater capture-frame undo. Should live in one module, sourced from a per-neighborhood setup record, revisitable via a settings panel. See `memory/project_backlog_rotation_formalize.md`.
- [ ] **Decide "Park as separate entity" vs full absorption.** Half-here today (water, paths, fence, labels still in `LafayettePark.jsx`; ground + trees absorbed into pipeline). Don't drift indefinitely. See `memory/project_backlog_park_as_entity.md`.
- [ ] **Tree Y-position from elevation field.** Trees plant at y=0 today; should sample `getElevation(x, z) × V_EXAG` so they ride the terrain. See `memory/project_terrain_elevation_field.md`.
- [ ] **Already-on-file longer arcs:** Y-offset → polygonOffset sweep, lamp-glow bake, Stage Time-of-Day parameterizer, intake procedure, pre-public cleanout/security audit.

### Historical sections below
The sections after this point document earlier skeleton/derive pipeline phases. Kept for historical context — Phases 1–4 landed; Phase 5 (knit) and Phase 6 (emergent grass median) remain open but are not the current focus.

## 2026-04-26 — Path B Phases 1+2+3+4 SHIPPED

| Phase | Status | Commits |
|---|---|---|
| 1. Skeleton phase analyzer | ✅ shipped | `613a6ff`, `6d7045c` (tuning) |
| 2. Phase-aware welding | ✅ shipped | `78f78bd` |
| 3. Skeleton emits phase metadata | ✅ shipped | `d6a3c42` |
| 4. Derive consumes phase info | ✅ shipped | (this session) |
| 5. Ribbon knitting | ⏳ next | — |
| 6. Emergent grass median | ⏳ | — |

**Phase 4 results:**
- 23 emergent medians (was 6 — old geometric `meanGap < 30m`
  threshold under-detected).
- 46 chains marked `anchor='inner-edge'` (was 0 — old buildCorridors
  pair-detection silently failed; oneway-edge node clustering rarely
  satisfied `sA===eB && eA===sB`).
- 23 carriageway-A + 23 carriageway-B chains (was 17+17 — pairKey
  gating in welder revealed pair structure that was silently fused).
- 18 pinch transitions across 69 corridors.
- 182 ribbon chains total (was 154); the +28 are pair-correctness.
  Phase 5 knit will close the visible seams.

**What changed structurally:**
- `analyzePhases` stamps stable `pairKey` per divided pair.
- `weldChains` gates on `(signature, pairKey)`. Different pairs in
  the same corridor (Lafayette has 4 A-pairs) can no longer fuse.
- Skeleton emits `phase.pairKey` per chain.
- Derive `ribbonStreets` carries `phase` through; pairing is now a
  pairKey slot-fill — no `meanPerpDistance`, no `tanDot`, no
  edge-key matching.
- Deleted from skeleton: `splitAtFolds`, `dropShadowedChains`,
  `nearestOnPolyline`.
- Deleted from derive: ~325 lines of geometric pair detection,
  `buildCorridors` edge-key logic, `offsetPolyline`/`avgTangent`/
  `meanPerpDistance` helpers, `medians[].meanGap` field.

## Operational notes worth remembering

- **`pipeline.js` does NOT run `skeleton.js`** — they're separate
  scripts. After editing skeleton, run `node skeleton.js` first,
  then `node pipeline.js`. Forgetting gives a stale skeleton.json
  and silent regressions in derive.
- If Survey/Measure go blank, check `lsof -i :3333` — `serve.js`
  may have died. `node serve.js &` to restart.

## Phase 5 pickup pointer

Phase 5 ("ribbon knitting") closes the 18 pinch transitions where a
single phase meets a divided phase. Each transition has a node coord
and an emergent wedge: median grass opens at single→divided, tapers
to zero at divided→single. Implementation candidates:
- "Merge plug" geometry analogous to corner plugs.
- Extend insert-coupler taper logic.

Start at `src/components/StreetRibbons.jsx` line ~703 (main fills
per-chain loop). The `corridors[].transitions[]` array in
`data/clean/map.json → layers.ribbons` already lists every seam
location — Phase 5 just renders them.

---

## 2026-04-26 PM — Path B chosen (phase-aware skeleton emission)

**Premise:** stripped back to OSM data and found skeleton over-welds
divided roads into single chains. Lafayette: 22 OSM ways → 1 chain
(should be ~5–8 phase-segmented chains). Jefferson: 19 OSM ways → 4
chains (only 2 of which were correctly tagged divided, by accident
when their welded super-chain folded).

The unified-centerline strategy isn't a bug — it exists because
ribbons emit per chain with no stitching, so chain == ribbon segment.
But the trade-off costs us divided-road fidelity.

**Path B chosen** (over Path A "stricter welder + visible breaks" and
Path C "manual operator override"): restructure skeleton to produce
chains per **phase**, where a phase is single-bidirectional or
divided-pair. Add ribbon-knitting at phase transition nodes.

Plan in `cartograph/NOTES.md` 2026-04-26 PM entry.
Memory: `project_phase_aware_skeleton_emission.md`.

### Phase-by-phase implementation

| Phase | Description | Effort |
|---|---|---|
| 1. Skeleton phase analyzer | Detect divided pairs + single fragments + transition nodes from OSM ways before welding | 1 session |
| 2. Phase-aware welding | Weld within phases only; output one chain per phase per direction | small |
| 3. Skeleton emits phase metadata | `phase: { kind, corridorName, role, transitions }` per chain | small |
| 4. Derive consumes phase info | Rewrite `buildCorridors`; delete `splitAtFolds` + `dropShadowedChains` + after-the-fact divided detection | medium |
| 5. Ribbon knitting | Geometry at phase transitions where ribbons merge/split | hardest, visual iteration |
| 6. Emergent grass median + merge points | Replaces `ribbons.medians`; falls naturally out of (5) | small after (5) |

### What carries forward from prior sessions

- `streetProfiles.innerEdgeMeasure` (zeros inboard treelawn/sidewalk).
- `StreetRibbons.inboardPedZoneless` wrapper.
- Ordinal-keyed `segmentMeasures` + couplers.
- Overlay file persistence + `setAnchor` operator override.
- Tool-scoped translucency.

### Inherited issues — still queued after Path B lands

- **Re-measure inner-edge chains** (auto-survey `pavementHW` is wrong
  for divided roads; will need re-measurement of all chains tagged by
  the new phase analyzer).
- **Royal-blue centerline visibility over asphalt** — Path B doesn't
  fix this directly. Top suspect: copy MapLayers' yellow-stripe
  pattern (`MeshStandardMaterial`, polygonOffset -14/-56).
- **Loop streets** (Benton, Mackay) — closed-polyline phase detection.
- **Corner plug at oblique IXes** — open from 2026-04-24.
- **12 legacy measure overrides** flipped by direction normalization.

---

## 2026-04-26 AM session — inner-edge anchor for divided carriageways (SUPERSEDED by Path B)

The Step A/B/C arc started this session is folded into Path B's plan.
What was shipped (still in code):
- `derive.js` auto-detect anchor (8 chains tagged from `kind: 'divided'`
  corridor phases). After Path B, this will be driven by skeleton's
  phase emission rather than derive's after-the-fact detection.
- Persistence (overlay file) + `setAnchor` action.
- `SurveyorPanel` Anchor dropdown.
- `streetProfiles.innerEdgeMeasure` + `StreetRibbons.inboardPedZoneless`
  (cross-section model: chain at carriageway center, zero out inboard
  treelawn/sidewalk).

Pivoted from earlier offset-polyline + synthetic pavement approach
during the AM session per operator feedback ("each roadway gets a
centerline, expand center out in both directions").

Open visibility issue (royal-blue centerlines occluded by asphalt's
polygonOffset) carries forward — Path B doesn't address it.

---

## 2026-04-26 session (in progress) — inner-edge anchor for divided carriageways

### Shipped this session

- **Step A — auto-detect anchor.** `derive.js` walks `corridors`, marks
  chains in `kind: 'divided'` phases with `anchor: 'inner-edge'`,
  `innerSign`, `pairId`. 8 chains tagged in current data.
- **Persistence.** Anchor override flows through overlay file via
  `setAnchor` action; `_autoAnchor` tracks default so save only writes
  when overridden.
- **`SurveyorPanel` Anchor row.** Center / Inner-edge dropdown, disabled
  when no paired chain detected.
- **Step B model PIVOT.** Initial offset-polyline + synthetic pavement
  approach scrapped per operator. Replaced with simpler:
  - Chain at carriageway center; visible centerline = chain.
  - Cross-section authored two-sided; inner-edge chains zero out
    inboard `treelawn`/`sidewalk`, keep pavement+curb on both sides.
  - `streetProfiles.innerEdgeMeasure` + `StreetRibbons.inboardPedZoneless`
    helpers; called in main fills, edge strokes, face-clip per-segment loops.

### OPEN BLOCKER — render visibility

Royal-blue authoring centerlines (`MeasureOverlay`) aren't visible over
asphalt — depth/renderOrder fight with asphalt's `polygonOffset`. Three
attempts this session, none resolved. Diagnostic in place; operator
testing morning of 2026-04-26.

### Still open (after blocker resolves)

- **Re-measure 8 inner-edge chains.** Auto-survey `pavementHW` values
  are wrong for divided roads (Truman 2m vs reality ~10m). Use Measure
  tool — drag both sides of carriageway pavement on each.
- **Step C — emergent grass median.** Replace `ribbons.medians` lens
  with runtime polygon between paired chains' inboard pavement edges.
  Close at `corridors[].transitions[].pinch === true`.
- **Loop streets** (Benton, Mackay) — extend inner-edge auto-detect to
  closed polylines (winding-derived `innerSign`) once divided pairs
  verify. Deferred; same model applies.

See `cartograph/NOTES.md` 2026-04-26 entry for full breakdown +
`project_inner_edge_anchor_in_flight.md` memory for next-session pickup.

---

## 2026-04-25 session — couplers shipped end-to-end

### Shipped this session (kept)

- **Canonical chain direction in `skeleton.js`.** Non-oneway chains
  oriented so dominant of `(last − first)` is positive (50/93 flipped).
  Closes the "left of A == right of B" twist for adjacent chains and
  stabilizes ribbon winding across rebuilds. Oneway chains untouched
  (their direction is direction of travel).
- **Coupler authoring in Survey.** Ctrl/⌘-click interior node → toggle.
  Orange diamond marker, panel coupler/segment count + hint.
- **`segmentMeasures` ordinal-keyed schema.** `"0", "1", "2"` instead
  of `"from-to"`. Stable across skeleton/ribbons coord systems.
  Couplers carry world coords for projection. Helpers
  `segmentRangesForCouplers(pts, couplers)` and
  `measureForSegment(street, ord)` are the single read points.
- **Per-segment Measure tool.** Click resolves segment via
  `resolveSegmentOrdinal`. Drag / dblclick-insert / right-click-delete /
  Reset all scope to the clicked segment. Empty-space click and Enter
  both accept (deselect); Esc still works.
- **`StreetRibbons` segment-aware fills.** Main fills, edge strokes,
  caps, corner plugs, face-clipping all walk segments per chain. Face
  clip emits one ring per (segment × side) instead of one per chain.
- **Live merge by `skelId`.** `derive.js` emits `skelId` on each ribbon
  street. All three merge sites in `StreetRibbons` (main fills, edge
  strokes, face-clip) prefer skelId-match over name-match. Mississippi
  carriageways no longer leak into each other.
- **Tool-scoped translucency.** Selected-corridor dim only applies
  while a tool is active. Unselected chains in Measure render opaque.
  No-tool view never dims a chain even if `selectedStreet` is set.

Closes B.1 (foundation) and ships C.1 (Couplers Phase 1B).

### Still open / next-session candidates

- **Persistence for couplers + segmentMeasures.** Currently in-memory
  only. Overlay file design (caps + couplers + segmentMeasures) is the
  unblock for shipping authoring durably.
- **Direction-normalize legacy measure overrides.** 12 streets in
  `centerlines.json` had pre-existing `measure` overrides; if their
  chain was among the 50 flipped, left/right is now swapped. Either
  manually re-measure or write a one-shot migration that detects flip
  by comparing the chain's pre/post first-point.
- **Corner plug at oblique IXes** — unchanged, still the priority
  picked up from 2026-04-24. See that section below.
- **Test split + insert coupler co-existing.** Code paths are
  independent but no current data exercises both on the same chain.

---

## 2026-04-24 evening session — corner plug deep dive, geometry still open

### Shipped this session (kept)

- **IX-lookup fix** in `StreetRibbons.jsx:647-678`. ~80 missing plugs at
  oblique IXes recovered. 99/183 → 183/183 cross-street pairs resolve.
  Root cause: `derive.js:2415` shifts `ix.streets[].ix` by name, breaking
  multi-chain same-name corridors. Runtime works around via point-proximity
  matching against `ix.point` rather than trusting the IX-level index.
- **R = treelawn + sidewalk** (`plugSwWidth` redefinition). ADA-corner-pad
  scale at oblique IXes. Operator picked option ii after seeing 1 m vs
  2.7 m radii at Mississippi × Park.

### OPEN — corner plug shape at oblique IXes

**Test case**: Mississippi × Park, IX at (229, −158.9), interior angle
~69°/111°. Right-angle IXes look fine; oblique IXes don't.

- Acute (~70°) sectors render as thin spike/tongue.
- Obtuse (~110°) sectors render with a "tooth" where plug curb meets
  leg curb. Re-measuring sidewalk widths in Measure mode produced
  noticeably different (also-broken) shapes — the geometry is fragile,
  not just imperfect.

Root cause (numerically traced): plug's leg-end cross-sections sit on
each leg's *parallel* offset line; leg arms terminate on the *perpendicular*
at IX. These lines coincide only at 90°.

**See `cartograph/NOTES.md` 2026-04-24 evening entry for the full list
of approaches tried this session that all reverted.** Do not re-try them
blindly.

### Operator's mental model (foundational, do not re-derive)

- Geometry comes from per-IX ribbon-overlap intersections, never from a
  global formula or centerline-derived rule.
- 4 corners + bezier arc per quadrant; arc bows toward IX.
- "If the shape is squashed, the arc gets squashed" — accept oblique
  shearing in principle.
- Outer corner of plug = property-line corner.
- Inner corner of plug = asph corner.
- No treelawn in the plug.
- Plug curb meets leg curb flush at the legs.

### Memories to update

- `project_corner_plug_open_problem.md` — narrow scope to "oblique IXes
  only" (right-angle works).
- New: `feedback_corner_geometry_attempts_to_avoid.md` documenting the
  6 reverted approaches.

---

## 2026-04-23/24 session — skeleton pipeline landed; three bugs left in selection-based aerial reveal

### Session outcomes (all NEW since last BACKLOG entry)

**Shipped and working:**
- **Phase-0 skeleton extractor** (`cartograph/skeleton.js`) — reads OSM,
  emits one clean chain per carriageway to `data/clean/skeleton.json`.
  Same-direction tangent-aware welding, fold-split at 180° reversals,
  shadow-drop of duplicate short parallels, angular-tolerance RDP.
- **`derive.js` routed through skeleton** — old same-name welding +
  direction-alignment dance deleted. Skeleton is sole street-geometry
  source. Intersection-finding splices on the nearest skeleton segment
  (not vertex) with descending (afterIdx, t) apply order; this
  eliminated the `cos=-1` crimp artifacts that were plaguing divided
  roads.
- **`ribbons.json` new fields:**
  - `medians[]` — emergent polygon between paired oneway carriageways;
    6 medians in Lafayette Square (Truman, S 14th, S 18th ×2, Park Ave,
    S Jefferson).
  - `corridors[]` — 69 corridors with ordered `phases` and pinch
    `transitions`. Park Ave = 3 phases with a pinch at (424, -89).
  - Face fills **clipped** to ribbon outer edge (MIN of left/right)
    so they don't bleed under road ribbons.
- **`StreetRibbons.jsx` cleanup** — deleted `resolveStreetSources`,
  `hasReversal`, `authoredIsSubstantive`, `hasAuthoredMedian`,
  `bboxDiag`, `SUBSTANTIVE_RATIO`. Added `medianMeshes` renderer.
- **Survey shrink** — `SurveyorOverlay` −60%, `SurveyorPanel` −50%.
  Geometry is read-only. Authoring surface = caps + name/type overrides.
  Store pruned (−~200 lines): undo stacks, nodeMenu state, old coupler
  setters, move/hide/disable/revert actions. `NodeContextMenu.jsx`
  deleted.
- **Corridor-level Survey selection** — click any chain, whole
  corridor's centerlines highlight yellow.
- `window.cs = useCartographStore` dev hook for browser-console
  debugging.

### Foundational decisions (do not re-derive)

See `~/.claude/projects/-Users-jacobhenderson-Desktop-lafayette-square/memory/`:

- `project_skeleton_architecture.md` (SHIPPED)
- `project_positive_carriageway_model.md` — divided roads = 2
  centerlines, emergent median polygon between them, never authored
- `feedback_couplers_are_segment_local.md` — medians are couplers on
  a single carriageway, NOT cross-section bands
- `project_cartograph_pipeline_shape.md` — full pipeline + "Frequent
  re-derivations to avoid" checklist

### OPEN — selection-based aerial reveal (must-have; three bugs)

Clicking a centerline should make that street's ribbon transparent
enough that the operator can align Measure handles to real curb edges
visible in the aerial photo underneath. **This is required for
authoring, not optional.** Partial implementation landed — three bugs
prevent it from being usable.

Root cause: the `groups` vs `groupsSelected` split added to
`meshes` useMemo in `StreetRibbons.jsx` is incomplete and its cache
dependencies are wrong.

- **E.A.1 Park Avenue (all 4 chains) not rendering ribbons** in any
  mode (Survey/Measure/Designer). Centerlines + handles show; ribbon
  bands are absent. Data in `ribbons.json` is correct (4 chains with
  valid measures). Likely: Park Ave routed into `groupsSelected` at
  initial render when no corridor should be selected, or cache
  staleness from missing deps.
- **E.A.2 Measure handle drags don't visibly update ribbons.**
  `st.measure` mutates, `centerlineData.streets` gets a new array
  ref, but the `meshes` useMemo does NOT list `selectedCorridorNames`
  as a dep — cached mesh data with stale `m.selected` flags can
  survive the drag.
- **E.A.3 Corner plugs disrupted on selected corridors.** Corner-plug
  geometry (around line 765 in `StreetRibbons.jsx`) pushes directly
  to `groups['corner_sw'|'corner_curb'|'corner_asph']` — not updated
  to use `activeGroups`. Corner plugs always land in the opaque
  bucket, visible inconsistency when the adjacent band is in the
  translucent selected bucket.

**Fix plan (ONE pass, in order):**

1. Add `selectedCorridorNames` to every relevant useMemo's deps array
   in `StreetRibbons.jsx` (`meshes`, `silhouetteMeshes`, `medianMeshes`,
   `edgeStrokes`, `pathRibbons`).
2. Route corner-plug pushes through `activeGroups` instead of `groups`
   directly.
3. Trace Park Ave end-to-end in console: hard-refresh, do NOT select
   anything; run:
   ```js
   cs.getState().selectedStreet                          // should be null
   cs.getState().corridorByIdx.size                      // should be >0
   ```
   Open Park Ave in the scene, confirm ribbon geometry renders.
   If not, instrument `buildMeshes` with a console.log of which
   streets ended up in each group. Park Ave should be in `groups`,
   not `groupsSelected`, when nothing is selected.
4. Verify handle drags: add a `console.log('[meshes memo]')` at the
   top of the `meshes` useMemo. Drag a handle — should log each time.
   If it logs but geometry doesn't change, the `measure` update isn't
   propagating through `mergedStreets` build.

**Fallback if the split keeps fighting back:** use three.js stencil
buffer. Render the selected corridor's ribbon silhouette to stencil
(colorWrite=false, stencilWrite=true, stencilRef=1,
stencilZPass=THREE.ReplaceStencilOp). Face fills and non-selected
ribbon bands render with stencilFunc=NotEqual, stencilRef=1 — pixels
where the selected silhouette wrote to stencil are rejected, revealing
aerial. No geometry-buildup split needed; one state guard.

### OPEN — architectural question to resolve before overlay file

**Is the reference line for a divided carriageway its centerline or its
inner curb?** Raised at end of 2026-04-24 session. Currently we use
centerline (two per divided road) with symmetric left/right bands. But
a carriageway around a median is inherently asymmetric — its inner
edge (median-facing curb) is the engineered boundary, and building
bands OUTWARD from that edge matches both construction reality and
aerial authoring workflow. Proposed unified model:

- Divided carriageway: reference line = inner curb; bands build
  outward (pavement → outer curb → treelawn → sidewalk → lot).
- Undivided street: reference line = centerline; bands build
  symmetrically (current behavior, asymmetric per-side override).

If we adopt this for divided roads:
- Skeleton output for divided carriageways emits inner-edge polyline
  (OSM centerline offset by inner pavementHW) OR keeps centerline
  with a "which side is inner" flag.
- Measure for divided carriageways becomes a single outward stack —
  simpler UX than symmetric handles.
- Emergent median polygon = space between two inner-edge polylines
  (cleaner than today's "between centerlines").
- Chicken-and-egg on the bootstrap (knowing inner pavementHW requires
  authored data) — no worse than today.

Resolve before finalizing overlay file schema, since measure's shape
differs between the two models.

### OPEN — pipeline-level followups

- **Park Ave median plausibility** — the auto-detected median for Park
  Ave's east divided section has 3 chains forming a pair, but some of
  the pair-endpoint matching is still loose. Verify the emergent
  median polygon for Park Ave actually pinches correctly at the
  Park × Grattan transition.
- **S 18th Street has 6 chains** — the street is divided in multiple
  short sections. Corridor walking may not emit clean phase sequences;
  test and adjust NODE_TOL in `derive.js`'s corridor builder if phases
  look wrong in Survey.
- **Measure persistence** — `_saveCenterlines()` is a no-op; drags
  evaporate on reload. Overlay file design still TBD (was intended as
  the milestone after skeleton). Draft schema:
  ```js
  // data/clean/overlay.json
  {
    streets: {
      "park-avenue-0": { measure: {...}, capStart: null, capEnd: 'round' },
      ...
    }
  }
  ```

### Files touched this session (full list)

- `cartograph/skeleton.js` — NEW
- `cartograph/derive.js` — consumes skeleton; medians, corridors,
  face fill clip added; old OSM welding removed
- `cartograph/serve.js` — `/skeleton` route
- `cartograph/NOTES.md`, `cartograph/BACKLOG.md` — session entries
- `src/components/StreetRibbons.jsx` — removed `resolveStreetSources`
  stack, added median render, added selected-vs-unselected split
  (source of E.A.1–E.A.3 bugs)
- `src/cartograph/SurveyorOverlay.jsx` — rewrite/shrink
- `src/cartograph/SurveyorPanel.jsx` — rewrite/shrink
- `src/cartograph/CartographApp.jsx` — corridor selection wiring,
  aerial-reveal hiding logic (reverted after it was too aggressive)
- `src/cartograph/api.js` — `fetchSkeleton` added, `saveCenterlines`
  removed
- `src/cartograph/stores/useCartographStore.js` — major prune,
  `corridorByIdx`, dev hook
- `src/cartograph/NodeContextMenu.jsx` — DELETED

---

## 2026-04-22 → 2026-04-23 session — Survey/Measure rework

Long session attempting to "fix Survey and Measure once and for all." Landed
a lot of infrastructure; hit the limits of the centerlines.json data; left
several visual states still off. Key takeaways at the top, detail below.

### Architectural discoveries (most important thing from this session)

1. **The pipeline's OSM-way stitching produces loop chains for divided
   roads.** Two parallel one-way OSM ways of a divided road (Park Avenue
   east of 18th, Truman Parkway, Chouteau, Lafayette, Russell, S. 12th,
   S. 14th, Gravois) get stitched into a single polyline that folds back
   on itself at its apex. Buffering a reversing polyline produces
   self-overlapping quads — the bowtie/chevron visible in Survey and the
   seam artifacts in Design. Detectable: adjacent-segment dot product
   `< -0.5` = reversal. `hasReversal()` helper in `StreetRibbons.jsx`.

2. **Single centerline per street + median as a band is the right model.**
   Not "split the loop into two lanes and render parallel." The authored
   centerline runs down the **spine of the ROW** (not a lane), and a
   median insert coupler carves a center slice that renders with a new
   `median` band material (grass/concrete). Band stack becomes
   `[median, asphalt, curb, treelawn, sidewalk]`. Data model + renderer
   now support this (see `resolveInserts` + the `hasMedian` branch in
   `meshes` useMemo + `streetProfiles.BAND_COLORS.median`). UI: right-click
   menu has **Median** entry.

3. **centerlines.json has mixed data quality.** Of 444 valid authored
   centerlines, only 73 match a pipeline street name; the other 371 are
   orphans (legacy / outside neighborhood). Of the 73 matched, many are
   stubs (authored bbox diagonal < 50% of pipeline chain diagonal —
   Benton Place is 47m authored vs 209m pipeline loop). Several streets
   have duplicate authored entries (Lasalle Street ×3, S. 18th Street ×2,
   Waverly Place ×2, Ann Avenue ×2). The "one centerline per street"
   architecture requires an operator pass through every street to
   re-author as a single clean spine line.

4. **Survey / Measure / Design / 3D must share the same street source.**
   Divergence between silhouette (old: liveCenterlines) and meshes
   (welded pipeline) causes visible mismatches. Current state:
   silhouette + meshes + edgeStrokes all iterate the same
   `renderRibbons.streets` output from `resolveStreetSources`.
   **SurveyorOverlay still reads centerlineData directly**, so the
   navy centerline spine can disagree with the silhouette for
   stub-authored streets. Unresolved.

### Locked (changes that stuck)

1. **Reroute coupler** (`feature: 'jog'`) — data model in `streetProfiles.js`
   (`resolveInserts` contributes signed `lateralOffset`), store actions
   `setRerouteCoupler` / `removeRerouteCoupler`, right-click menu entry,
   draggable yellow handle, live silhouette bending.
2. **Median coupler** (`feature: 'median'`) — new `median` band material
   (`BAND_COLORS.median = '#4a6a32'`), band stack shifts outward by
   `medianHW[i]` per point via `halfRingVarRaw`, median band renders
   grass fill. Store actions + right-click menu entry. UI for adjusting
   taper/hold/medianHW not yet built.
3. **Alleys + paths as first-class roadway ribbons.** `derive.js` emits
   `ribbons.alleys[]` (145) and `ribbons.paths[]` (345) as centerlines +
   `pavedWidth`. `StreetRibbons.jsx` renders them via `pathAsStreet`
   helper + `pathRibbons` useMemo. `MapLayers.jsx` no longer renders
   alley/footway polygons. Paths participate in Survey silhouette.
4. **Circle crop on aerial.** `AerialTiles.jsx` injects a radial alpha
   fade matching `FADE_CENTER (162,-127)` / `FADE_INNER 758` /
   `FADE_OUTER 892` — aerial silhouette matches the main-map circle.
5. **Design + Fills OFF = aerial only.** Distinct from Survey/Measure
   Fills-off behavior; both documented in NOTES.md Fills section.
6. **GroundMesh.jsx deleted.** Was disabled with `{false && ...}`.
7. **Centerline spine in Survey** = navy `#0a1a4a`, miter joints
   (`polylineRibbon` rewritten to compute miter offset
   `halfWidth / cos(θ/2)` with 6× clamp), transparent material
   (`transparent: true`) to force Three.js to draw it in the
   transparent pass — otherwise opaque centerlines get drawn in the
   opaque pass and subsequent transparent silhouettes paint over them.
   This was a tough root-cause debugging story.
8. **NodeContextMenu** is a DOM-level component portaled to `document.body`,
   driven by store state (`nodeMenu: {x, y, nodeIdx}`). Rendering DOM
   inside R3F Canvas crashes the WebGL context (reconciler confusion).
9. **Pipeline segment direction alignment** from earlier (2026-04-22
   morning) — `derive.js` reverses ribbon chains whose local tangent
   disagrees with the authored centerline's direction. Was 37/122
   reversed; now 0/122. Downstream orientation swaps deleted.

### Unlocked / still broken (punch list to pick up next)

| # | Issue | Notes |
|---|-------|-------|
| E.1 | **Aerial photo not reliably visible under streets in Survey/Measure + Fills ON.** Current attempt: hide `MapLayers.ground` when `toolActive`. Still not showing aerial consistently in user testing. Suspect: `StreetRibbons` face fills extending into road gaps, OR some other opaque layer between road ribbon and aerial. Need to diagnose which layer is occluding aerial in the road gap area. | Core fail. |
| E.2 | **"Two streets stacked" on divided roads** (Lafayette Avenue, Russell Boulevard, probably Chouteau). Pipeline has two parallel chains (divided OSM ways). When authored isn't substantive, both chains render as separate ribbons. Proper fix: author these streets as single spine centerlines, add median coupler. Or: detect divided pairs at pipeline time, merge into a single spine with median width derived from parallel gap. | Architectural. |
| E.3 | **Selection-driven translucency not implemented.** User's desire: "roadway becomes translucent when you select the street." Currently all Survey streets show translucent silhouette; all Measure streets show translucent per-stripe. Intended: unselected = opaque (Design-like) or simpler silhouette; selected = translucent edit surface. Requires splitting `meshes` useMemo output into selected vs. other groups for per-street materials. | UX. |
| E.4 | **SurveyorOverlay reads centerlineData directly** — doesn't pull from `renderRibbons`. So the navy centerline spine follows authored points even where `StreetRibbons` rendered pipeline geometry (Benton Place's loop is rendered, but SurveyorOverlay draws only the authored 8-pt stub). Unify: either (a) SurveyorOverlay iterates `renderRibbons.streets`, (b) `centerlineData` gets populated from pipeline for non-authored streets on load. | Source-of-truth consistency. |
| E.5 | **Dead-end endcap previews in Survey must show for all dead-ends,** not just the selected street. Currently cap preview is gated inside `selectedStreet !== null` block in `SurveyorOverlay.jsx`. Extract and render for every authored dead-end. | UX. |
| E.6 | **Right-side pan/drag dead zone.** User reported that pan/zoom doesn't work on the right side of the screen even when the panel isn't there. Investigate which overlay is capturing pointer events with full-width DOM. Candidates: `StagePanel`, `Panel`, `Toolbar`. Not yet investigated. | Bug. |
| E.7 | **Measure tool "no centerline to select"** after introducing renderRibbons routing. Measure needs to let the operator select a street to bring up its per-stripe handles. Currently mediated by `selectedStreet` from `centerlineData`, which requires the street to be in `centerlineData`. Pipeline-sourced streets aren't there, so they can't be selected in Measure. Fix: populate `centerlineData` fully on load, or teach Measure to select from `renderRibbons`. | Core feature regression. |
| E.8 | **Duplicate authored centerlines** (Lasalle Street ×3, S. 18th Street ×2, Waverly Place ×2, Ann Avenue ×2, Rutger Street ×2) render as multiple overlapping centerlines in SurveyorOverlay. Either dedupe at load, weld during load, or operator cleanup. | Data quality. |
| E.9 | **Orphan centerlines** (371 entries not in pipeline). Currently filtered out at render. Could also be deleted from centerlines.json as one-shot cleanup. | Data quality. |
| E.10 | **No corner plugs on authored streets.** The pipeline's intersections are indexed against pipeline points, which don't match authored points after we switch source. `resolveStreetSources` sets authored streets' `intersections: []`. Design-mode renders for Park Avenue etc. have flat intersections. Fix: spatial intersection detection at render time — find where two authored centerlines share a node and emit plug there. | Design rendering polish. |
| E.11 | **Median coupler UI is add/remove only.** No inspector for taper/hold/medianHW sliders. Defaults sized for residential (taperIn 8m, hold 30m, taperOut 8m, medianHW 3m). | UX completion. |
| E.12 | **Authored-vs-pipeline source heuristic is fragile.** Ratio of 0.5 between authored bbox diagonal and pipeline longest chain's diagonal. Breaks when authored is a closed loop (Truman — first=last, diagonal = 0 using endpoint-only) — internal span is actually wide but the heuristic can misjudge. Current heuristic uses full bbox diagonal which works for Truman; verify across full neighborhood. Long-term: operator flag per centerline ("this is the canonical one"). | Heuristic risk. |
| D.2 | **Chevron reads as dead-end in Measure.** Still queued from earlier session. Likely resolved incidentally if divided-road authoring lands (see E.2). | Related. |

### The real architectural fix — skeleton extraction as "Phase 0"

The premise of this whole session was wrong. Survey has been operating on
the pipeline's raw OSM-derived fragments (122 chains for ~68 logical
streets, plus tangled divided-road loops). That's why every data quality
problem surfaced as a rendering bug. The answer isn't more heuristics at
render time — it's a **skeleton extraction step** between raw OSM and
everything downstream.

**Phase 0 — Skeleton extraction** (new):
- Input: raw OSM highways (or whatever source a new neighborhood brings).
- Output: `skeleton.json` — one clean continuous polyline per logical
  street, with intersection topology and flags (divided, one-way,
  median width, type).
- Algorithm:
  1. Group OSM ways by name.
  2. Weld end-to-end within each group.
  3. Detect divided pairs (same name + parallel + opposite one-way):
     emit one synthetic spine line at the midpoint + a synthetic
     median insert coupler sized by the perpendicular gap.
  4. Unnamed fragments: attach to nearest named group by proximity +
     tangent alignment, or drop as "unclassified" for later triage.
  5. **Simplify to minimum nodes.** Ramer-Douglas-Peucker with ~0.5m
     tolerance + collinear-collapse + curvature-aware thinning. Most
     OSM polylines are over-subdivided; per-street node counts should
     drop from dozens to ~8-12 control points.
- Result: ~68 clean Street objects for Lafayette Square. Each with the
  minimum control-point set that describes its shape. No duplicates,
  no stubs, no orphans.

**Curve interpolation at render time** (renderer change, paired with
skeleton):
- Ribbon renderer samples the centerline as a C1-continuous spline
  (Catmull-Rom or cubic Bézier) to ~0.5m spacing BEFORE building quad
  geometry. Control points stay sparse and operator-editable; the mesh
  is always smooth.
- Benton Place (8 control points) renders as a perfect smooth loop.
  W 18th Street (5 control points) renders as a perfect arc. No "smooth
  slider" — smoothness is the default rendering behavior.
- Per-node `corner: true` flag breaks the spline for genuine sharp
  corners (e.g. at a T-intersection where the centerline abruptly turns).
  Default smooth; corners are opt-in.
- Kills the pointy-joint problem (miter math becomes unnecessary for
  smooth streets — adjacent segments are already tangent-continuous).

**Survey operates on the skeleton, not on raw pipeline fragments.** The
operator sees ~68 clean lines. Editing becomes tractable.

**centerlines.json becomes a thin overlay** on top of the skeleton —
just operator edits (moved nodes, couplers, measure overrides). Not the
source of geometry. The skeleton is regenerable from OSM; the overlay
is operator intent. Merging skeleton + overlay at render time is
deterministic and simple.

Downstream is almost untouched:
- StreetRibbons' rendering path: identical. Just consumes skeleton +
  overlay instead of ribbons + centerlines.
- Median coupler, reroute coupler, band system: unchanged.
- Measure tool: unchanged, just fewer streets to iterate.

**What Phase 0 replaces:**
- `resolveStreetSources` and its ratio heuristic — gone.
- End-to-end weld and reversal-split logic at render time — moved
  upstream into skeleton extraction; happens once per pipeline build.
- The authored-vs-pipeline question at every level — the skeleton is
  authoritative; the overlay adjusts it.

**What remains separate:**
- Face-fill vs. aerial (issue E.1) — geometric/rendering issue;
  separate from skeleton. Fix: clip `ribbons.faces` against street
  ribbon extent, or stencil-mask aerial-through-road area.
- Selection-driven translucency, dead-end-preview-always, right-side
  pan dead zone, Measure selection regression — all UI-level; easy
  once the skeleton exists.

### Sequenced plan for next session

1. **Write skeleton extractor** (`cartograph/skeleton.js`). Consumes
   `data/raw/osm.json`, emits `data/clean/skeleton.json`. Includes:
   group-by-name, end-to-end weld, divided-pair detection + synthetic
   spine emission, unnamed-fragment attachment, RDP simplification to
   minimum control-point set.
2. **Add spline interpolation to StreetRibbons.** Pre-sample centerline
   at ~0.5m via Catmull-Rom before extruding ribbon quads. Respect
   per-node `corner: true` breaks. Eliminate render-time node-count
   assumptions elsewhere.
3. **Route the renderer through skeleton.** StreetRibbons +
   SurveyorOverlay + MeasureOverlay all read from skeleton + overlay.
   Delete `resolveStreetSources` and its machinery. Delete the
   `polylineRibbon` miter math (unnecessary once curves are smooth).
4. **Decide overlay merge semantics.** Skeleton has stable slugified
   IDs (`park-avenue`, `south-18th-street`). Overlay keys by
   `{streetId, pointIdx}` for node overrides; by `{streetId}` for
   measure / couplers / caps. One-time migration script moves existing
   `centerlines.json` edits into the new overlay shape by name +
   spatial match.
5. **Face-fill vs. aerial** (E.1). Algorithmic clip of `ribbons.faces`
   polygons against street ribbon extent at pipeline time so there's a
   true road gap for aerial to show through in Fills-on tool mode.
6. **UI polish.** Selection-driven translucency (E.3), cap previews
   for all dead-ends (E.5), right-side pan dead zone (E.6), Measure
   selection regression (E.7). Small fixes once the base is solid.
7. **Median / reroute coupler inspector UI** (E.11). Sliders for
   taper / hold / medianHW / offset. Right-click menu already triggers
   the couplers.

---

## 2026-04-22 session — Survey/Measure split + segment direction fix

Two structural moves landed, plus data-model scaffolding for complex street
geometry (medians, jogs).

### Locked

1. **Survey vs. Measure division of labor.**
   - Survey owns longitudinal structure (centerline shape, nodes, couplers,
     caps, terminal, jog/median inserts). Renders as translucent blue
     silhouette envelope + centerline spine + outer property-line outline.
     No per-stripe strokes.
   - Measure owns cross-section (pavementHW/curb/treelawn/sidewalk per side,
     per coupler-segment). Renders as per-stripe translucent fills with
     per-material edge strokes. The color story.
   - Both write to `centerlines.json`; every surface (Survey overlay,
     Measure overlay, Designer ribbon, Stage shots) reads from the same
     live source.
   - "Fills" toggle unchanged — governs everything except the tool's
     subject matter (street-ways/paths).

2. **Silhouette renderer** (`StreetRibbons.jsx`, Survey-only).
   Iterates live centerlines (not `ribbons.streets` — that caused per-
   segment fragmentation on long multi-segment streets). One translucent
   blue envelope per street via `halfRingVarRaw` with per-point inner/outer
   radii, so insert couplers can carve the envelope.

3. **Insert-coupler data model** (`streetProfiles.js`).
   Couplers are now a mixed array of numbers (legacy split couplers) and
   objects. Object form:
   ```js
   { kind: 'insert', feature: 'median', pointIdx: 42,
     taperIn: 5, hold: 40, taperOut: 5, medianHW: 3 }
   ```
   `normalizeCoupler()` handles back-compat. `resolveInserts(street)`
   walks arc-length and returns per-point `{medianHW, lateralOffset}`
   with cosine-eased fairings. `segmentRangesForCouplers` updated to only
   pay attention to `kind: 'split'` (inserts don't segment the street).

   "Rock in the river" metaphor: one coupler carries taper-in / hold /
   taper-out as a composed object — not four loose keyframes the operator
   has to coordinate. Extends to jogs (`feature: 'jog'`), slip lanes,
   curb bulges without adding new primitives.

4. **Pipeline-level segment direction alignment.**
   `derive.js` now reverses ribbon chains whose local tangent disagrees
   with the authored centerline's direction over the span the chain
   covers. Was 37/122 reversed segments in `ribbons.json`, now 0/122.
   Consequence: `measure.left` is physical-left on every segment of every
   street. Downstream orientation-guard swaps in StreetRibbons
   (`meshes` + `edgeStrokes` useMemos) deleted — runtime stays simple.

   Root cause: OSM way-ordering is a drawing convention on two-way
   streets, not a directionality constraint. 23 of 25 direction-flipped
   streets were two-way (Park Ave, Rutger, Lafayette, Lasalle, Geyer,
   Jefferson, Truman Parkway…). Not a one-way-traffic issue.

   Why it matters: asymmetric Measure drags on long multi-segment streets
   were growing "both sides" because the guard's per-segment swap
   propagated the growth to inconsistent physical sides. Now consistent.

5. **Measure stripe-stroke reduction.** Per-stripe strokes in Measure
   now emit only at the pavement edge (asphalt outer) and the property
   line (outermost ring) — intermediate curb-outer / treelawn-outer
   strokes were visual noise on wide boulevards.

### Shelved / Partial

6. **Silhouette renderer doesn't handle medians yet.** The renderer
   consumes `resolveInserts` → per-point `medianHW` and carves the
   envelope correctly, but no Survey UI to author inserts. Test requires
   hand-editing `centerlines.json`:
   ```json
   "couplers": [{"kind":"insert","feature":"median","pointIdx":18,
     "taperIn":8,"hold":30,"taperOut":8,"medianHW":3}]
   ```

### Follow-ups

| # | Task | Notes |
|---|------|-------|
| D.1 | **Survey UI for insert couplers.** Right-click node → Split \| Median insert \| (future: Jog / Bulge). Inspector with taperIn/hold/taperOut/medianHW sliders + live silhouette feedback. Store action `setCouplerInsert(nodeIdx, props)`. | Queued; data model + renderer ready. |
| D.2 | **Chevron reads as dead-end in Measure.** Park Ave × 18th: pipeline segments Park Ave at the chevron; each segment ends flush with no continuation. Solutions: (a) don't segment at the chevron — it's an insert, not an intersection; (b) merge adjacent same-named segments seamlessly at render; (c) bake chevron from median/jog insert in derive. Likely (c) once D.1 lands. | Blocked on D.1. |
| D.3 | **Jog/lane-shift insert.** Same pattern as median, but modifies `lateralOffset` instead of `medianHW`. `resolveInserts` already reserves the field. Handles the Park Ave × 18th chevron geometry cleanly: coupler at the jog anchor, shift amount = Δy of the two halves, taper = chevron length. | Queued. |

## 2026-04-21 session — alley clipping landed

Long debugging cycle. Pointy-alley-end artifact at cross-street terminations
traced all the way to the alley ROW computation. Ribbons render the full
back-of-sidewalk at `pavementHW + CURB_WIDTH + treelawn + sidewalk`, but the
derive.js alley clip was subtracting two terms (curb, and survey data on
fallback streets) and over-halving divided streets. Result: alleys poked
through the sidewalk and terminated as knife-shaped wedges where the clip
polygon turned a corner.

### Locked

1. **Alley trim = polyline clip by per-street ROW, at sidewalkOuter.**
   `derive.js [7/8]` builds `streetROWUnion` by buffering each vehicular
   centerline by the full outer reach (pavement + curb + treelawn + sidewalk),
   then `Clipper.ctDifference` against each alley polyline via `PolyTree +
   OpenPathsFromPolyTree`. Flat caps (`EndType.etOpenButt`). 8m min-length
   filter drops sub-curb stubs. 113 alley polygons.

2. **Measure source preference:** `centerlines.json` per-side measure first,
   `defaultMeasure(type, correctedSurvey[name])` fallback — survey is now
   passed into the fallback so arterial streets (Chouteau, Jefferson,
   Dolman, S. 18th) that lack centerline data still get their surveyed
   `pavementHalfWidth` + sidewalk offsets instead of flat residential defaults.

3. **No divide-by-2 for divided streets in alley clip.** We want the buffer
   to reach the outer back-of-sidewalk regardless of whether the OSM
   centerline represents whole pavement or one half.

4. **CURB_WIDTH imported from `streetProfiles.js`** so `derive.js` uses the
   same constant as the ribbon renderer. Single source of truth.

### Shelved

5. **GroundMesh experiment** (`src/cartograph/GroundMesh.jsx`, ~270 lines)
   — planar subdivision + poly2tri Steiner grid to bake all ground layers
   into one z-fight-free mesh. Disabled via `{false &&}` in CartographApp.
   Was the wrong tool for this session's problem (alley ROW math, not
   z-fighting). Revisit if spillage becomes the top priority.

### Follow-ups

- Task #9: Debug remaining terminal-into-street cases. "One of these is
  fixed" after iter 15 — spot-check the full neighborhood for alleys still
  poking past sidewalkOuter. Likely candidates: streets where survey has
  no `pavementHalfWidth` at all (they'd still hit `TYPE_PAVEMENT_HW`
  defaults).
- Per-alley manual override JSON as an escape hatch if a specific
  terminal resists the algorithmic fix.

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
| C.1 | ~~**Couplers Phase 1B.**~~ **SHIPPED 2026-04-25.** `segmentMeasures` keyed by ordinal (not `"from-to"` — stable across coord systems). Survey places couplers (Ctrl-click); Measure binds per-segment with reset; renderer walks segments end-to-end. Persistence still in-memory only — see new "overlay file" item. | Done. |
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
