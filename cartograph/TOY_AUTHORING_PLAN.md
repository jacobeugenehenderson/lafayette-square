# Toy Authoring Plan — Survey/Measure as the kit-design surface

**Status:** Phase 0 is the next-session target. Framing below is directional, not blocking.
**Owner:** next session opener.

### What matters now (Jacob, 2026-05-08, EOD)
> "Phase 0 next session, but the goal is a working toy to validate LS, irrespective of its eventual utility. We need to fix these corners once and for all."

**Immediate goal: validate the corner model end-to-end on toy.** Kit-design and training-environment framings (below) are the long-game shape; do not let them slow Phase 0. If a kit-shaped decision adds session-time without clearing the corner-validation path, defer it.

### Author goal (Jacob, 2026-05-08, mid-session)
> "If we're making a toy we might as well make it a tool. We're building a *kit* — there is lots of LS-specific stuff, but we need it to be map-agnostic. We should endeavor to include 'one of everything'; I can anticipate this being the place a designer would work on the map before trying to go full-neighborhood."
>
> "The toy can also be a training environment for users; if the project starts as centerlines cast as symmetrical standard sizes and they can go from start to finish in the toy..."

This is **multi-session work**. Don't try to land the whole thing in one sitting. Each phase has a concrete exit criterion and is independently shippable.

---

## Framing — the kit, not the application

Cartograph is a **kit** for authoring neighborhood maps. LS is one application of the kit. The toy is **not** "a place to validate the LS pipeline" — it's the kit's design surface, the place a feature lands first, and the canonical training environment for someone learning the kit.

Three corollaries that shape every phase below:

- **Map-agnostic.** No LS terminology in toy code paths (no "Mississippi Avenue", no LS-specific naming conventions, no special-cases for stale `ix.streets[].ix` indices or duplicated names — those are *application data debt*, not kit concerns).
- **One of everything.** The toy fixture is canonical. Every feature the kit supports has a representative case in toy. Adding a kit feature means adding it to toy first, then proving it elsewhere.
- **Scenes, not "toy vs real".** A scene is a named map dataset (centerlines + overlay + faces + ...). Toy is a scene. LS is a scene. Future neighborhoods are scenes. Code should branch on *capabilities* (does this scene have an overlay? a stencil?), not on `scene === 'toy'`.

### Toy as training environment

Toy doubles as the on-ramp for any new user of the kit. The intended designer journey is **start to finish in the toy**:

1. Open toy → see a default scene: hand-authored centerline topology, every street cast with a symmetric standard-size residential measure (5m pavement HW, 1.5m treelawn, 1.5m sidewalk both sides). No empty state, no decision paralysis.
2. Use Survey to inspect, select, and (later phases) modify centerlines. Learn how the topology authoring feels.
3. Use Measure to override default measures per street: asymmetry, median, per-segment overrides. Watch V2 re-render live.
4. Use the Look-level corner-radius authoring kit to tune the corner geometry.
5. End up with a finished, published map — entirely from the toy scene.

This implies a few constraints on every phase:

- **Defaults must be sensible.** A new scene with no overlay should render correctly with sane symmetric measures inferred from `highway` tags. Phase 0's seeding decision (D4) is partly about this.
- **Affordances must be discoverable.** Tooltips, panel labels, keyboard shortcuts shown contextually. Don't bury features behind unmarked clicks.
- **The progression is the curriculum.** Each kit feature in the "one of everything" catalog corresponds to a moment a designer encounters the corresponding tool affordance. Order the catalog from easy to hard so the toy walks you through it.
- **Reset must be cheap.** A trainee should be able to revert toy to its default state without losing other work. Toy overlay/centerline files versioned in git; a "reset toy" panel button writes the seed back.

## Why we're doing this

1. **Kit completeness.** Survey is read-only today; the kit needs centerline authoring (draw, split, swap, close loop) for any new neighborhood, not just toy. Building it on toy first means the affordances are designed against a clean dataset, not LS's quirks.
2. **V2 coverage.** `buildBlockGeometryV2` is unproven on loops, one-way pairs, and median chains. The "one of everything" toy fixture surfaces these gaps systematically rather than ambushing us during a real-neighborhood bake.
3. **Designer ergonomics.** A designer starting a new map shouldn't have to bootstrap on LS data. They open toy, learn the kit, then point the same tools at their own scene.

## The current state (2026-05-08, post-EOD)

- V2 surfaces are wired through the shared `useSurfaceMaterial` hook (real BAND_COLORS + fade pipeline). Legacy StreetRibbons is hidden in toy.
- Toy fixture is a 4+4 grid (9 blocks) with one bent chain (VW3), one jogged chain (HW3), one dead-end stub. Authored as `toy-input.json` → derived to `toy-ribbons.json` by `cartograph/derive-toy.js`.
- Survey/Measure are gated OFF in toy (`scene !== 'toy'` in CartographApp:681,685,758). The store loads only neighborhood data from `/api/cartograph/centerlines` + `/overlay`. V2Debug reads `toyRibbons` static JSON, not the store.

## Decision points called out

These are forks worth deciding before code, not during it.

- **D1: Server route shape.** Given the kit framing, **unify under `/api/cartograph/:scene/...`** rather than mirroring per-scene. Toy and LS are both scenes; future neighborhoods are scenes. Hard-coding `toy/` paths sets the wrong precedent.
- **D2: Centerlines vs overlay split.** Keep the real-pipeline split: a scene has `centerlines` (topology — points, names) and an `overlay` (per-street measure, anchor, segmentMeasures). The toy stores them as `toy-centerlines.json` + `toy-overlay.json`. `toy-input.json` was the pre-kit hand-authored single-file shape; it gets retired or kept only as a seed.
- **D3: Survey authoring scope.** Phase 2 below introduces real authoring affordances (draw/delete/split/swap/loop). These are *kit features*, not toy features — once they exist they should work in any scene. Confirm before starting Phase 2.
- **D4: How to seed a new scene.** When a scene's overlay is empty, do we (a) infer reasonable defaults from centerline `highway` tags, (b) leave streets unmeasured until the operator measures them? Recommend (a) — toy and any new scene get a working render on first load; the operator re-measures to override.
- **D5: One-of-everything fixture catalog.** Lock the kit-feature checklist (next section) before authoring Phase 1's expanded toy. The catalog *defines* what the kit covers.

## "One of everything" — the kit-feature catalog

Toy must include a representative case for each kit feature. New kit features add a row here. Phase 1 onward, the toy fixture is built up to cover this list.

### Topology
- [x] 4-way IX (90°)
- [x] Bent chain (vertex with non-180° interior angle, mid-chain)
- [x] Mid-block jog (two opposing bends close together)
- [x] Dead-end stub (T off another chain, blunt end)
- [ ] T intersection (3-way, one chain terminates at another's interior)
- [ ] Y intersection (3-way at acute angle)
- [ ] 5-way+ intersection
- [ ] Looped chain (start = end, e.g., park drive, roundabout outer)
- [ ] Split chain pair (one-way couplet — two chains forming a divided road)
- [ ] Skewed IX (acute corner, e.g., 60°)
- [ ] Near-collinear IX (175° — barely an IX, tests degeneracy)

### Cross-section
- [x] Symmetric residential (sw + tl both sides)
- [ ] Asymmetric ped zones (tl one side, sw-only the other)
- [ ] Asymmetric pavement widths (wide left lane, narrow right)
- [ ] Sidewalk-only (no treelawn)
- [ ] No pedestrian zone (alley / footway profile)
- [ ] Median (chain with center treelawn or concrete strip)
- [ ] Per-segment measure override (`segmentMeasures` — different cross-section near an IX vs mid-block)

### Faces / land use
- [ ] Residential block
- [ ] Park / open-space block
- [ ] Mixed-use block
- [ ] Boundary face (scene edge)

### Out of scope for this plan (other kit surfaces)
Buildings, lamps, trees, terrain, time-of-day, looks. Each has its own toy expression elsewhere; this plan covers only the Survey → Measure → V2 ground-render path.

---

## Phase 0 — Plumbing (one session)

**Exit criterion:** in toy, change a single street's `pavementHW` via the Measure tool, observe V2 re-render. Survey is still read-only. LS scene's Survey/Measure is unaffected.

### Server

- Refactor existing routes to scene-aware: `GET/PUT /api/cartograph/:scene/centerlines`, `GET/PUT /api/cartograph/:scene/overlay`. The existing endpoints become `:scene = lafayette-square` (or `default`) under the hood; adapter keeps old paths working during migration.
- File layout per scene: `src/data/<scene>/centerlines.json` + `src/data/<scene>/overlay.json` (+ `faces.json`, etc.). Toy moves to `src/data/toy/centerlines.json` + `src/data/toy/overlay.json`.
- Migration: split current `toy-input.json` into `toy/centerlines.json` (points, names) + `toy/overlay.json` (measures). One-time conversion script.

### Store (`src/cartograph/stores/useCartographStore.js`)

- `_loadCenterlines` and `_loadMeasurements` (`_loadOverlay`) become scene-aware. Read `scene` from store; pick the right endpoint.
- `_saveOverlay` likewise scene-aware. The toy overlay never writes to the real overlay.
- On scene switch, re-fire the loads.

### CartographApp wiring

- Lift `scene !== 'toy'` from `surveyActive` and `measureActive` (lines 681, 685, 758). Survey/Measure tool buttons activate in toy.
- Pass `liveCenterlines` to whatever V2Debug consumes — currently V2Debug reads static `toyRibbons` import. Replace with store-derived data.

### V2Debug → store

- Read centerline + overlay-merged data from the store (`centerlineData.streets` shape) instead of `toyRibbons`. Build the same shape `buildBlockGeometryV2` expects.
- The shape may need normalization — real `centerlineData.streets` includes overlay merges already; toy needs the same. A small adapter is fine.

### Seed

- Decide D4. If (a), populate `toy-overlay.json` from current `toy-input.json` measures on first server start (idempotent: only seeds if file missing).

### Risks / unknowns in Phase 0

- The store's centerline loader does heavy LS-specific normalization (segment couplers, anchor inference, etc.). Toy data shouldn't trigger most of it; verify nothing crashes on a stripped-down toy chain.
- `derive-toy.js` may need to consume the new overlay too, so that the static-bake-and-look path still works after toy is wired live. Cheap to add.

---

## Phase 1 — Measure validation in toy (half session)

**Exit criterion:** every block in the toy grid has been re-measured via Measure. V2 renders correctly for symmetric, asymmetric, no-treelawn-one-side, and wide-vs-narrow-pavement cases.

- Walk each of the 9 blocks. Use Measure to set varied cross-sections.
- Catalog any V2 rendering bugs that surface (likely in `chainStripBand` clipping, or in `cornersAtIx` when `leftDepth/rightDepth` differ).
- Decide whether to fix bugs in this phase or queue them in BACKLOG.md.

This phase is a *validation* phase, not new code. Output is a list of confirmed-working scenarios + a list of confirmed-broken ones.

---

## Phase 2 — Survey authoring affordances (2–3 sessions)

**Exit criterion:** can author a new toy fixture entirely through Survey. Drawing, deleting, splitting, swapping, closing loops all work and persist.

Each affordance is a sub-phase; do them in this order, validate V2 after each.

### 2a — Draw centerline
- Survey gains a "draw" mode (button in SurveyorPanel).
- Click sequence places vertices, double-click ends. Esc cancels.
- New centerline persists via toy overlay (centerlines need to live somewhere editable — possibly extend `_saveOverlay` to also save centerline geometry, or add a separate `toy-centerlines-edits.json` overlay merged on read).
- IX detection re-runs on save (call into derive-toy's clustering logic or replicate it in the store).

### 2b — Delete street
- Survey: select street → keyboard delete or panel button → removes from store.
- IX cleanup: any IX referencing the removed chain re-clustered.

### 2c — Split chain
- Survey: select street, click on a vertex or interior point → splits into two chains, both inheriting the parent's measure.
- New names auto-generated (e.g., `HW3-a`, `HW3-b`).

### 2d — Swap direction
- Survey: button to reverse a chain's `points[]`. Important because left/right of a chain depend on direction; useful for sanity-checking that V2 doesn't depend on authoring direction.

### 2e — Close loop
- Survey: convert a chain whose endpoints are within snap to a closed polyline (first = last). V2 must handle this — likely needs work in `chainPavementRing` (currently emits two-rail rectangle; closed chain should emit an annulus).

### Risks / unknowns in Phase 2

- Survey's existing select/snap logic is built around skeleton-as-OSM-input. New "this chain came from Survey-draw" provenance may need a flag.
- The store's overlay shape is per-street; centerline edits don't fit it cleanly today. May need a new field or a sibling document.

---

## Phase 3 — Advanced features (2 sessions, possibly more)

**Exit criterion:** V2 correctly handles one-way pairs, median chains, and looped streets in toy. Each gets a dedicated test fixture.

### 3a — One-way pairs (split traffic)
- Two chains stitched as a corridor (real LS pattern: divided road = two one-way ways). Survey needs a "pair these chains" UI.
- Render: each chain emits its own pavement; the median between them is implicit (a face between the two pavement edges).
- V2 likely needs a "corridor face" concept or relies on the overlap of the two pavement rings to do the right thing.

### 3b — Median chains
- A chain whose cross-section includes a center median (treelawn or concrete strip). Authored via Measure: `measure.median = { width, terminal }`.
- V2: `chainPavementRing` becomes asymmetric; strip emission gets a third rail.

### 3c — Looped streets
- Topologically: a chain whose start = end (within snap). E.g., a roundabout's outer loop, or a closed park drive.
- V2: `applyRoundCornersToRing` walks polygon vertices, but a loop chain doesn't produce a normal block-bounding edge. Likely needs a separate code path or a pre-processing step that converts a loop chain into two opposing edges of an annular block.

---

## What this plan is NOT committing to

- Migrating LS itself to Survey-authored centerlines. Real LS still comes from OSM ingestion. This plan only changes toy.
- Adding live IX rounding-radius authoring (already exists separately via `cornerRadiusScale` / `cornerRadiusOverrides`).
- Replacing `derive-toy.js`. It still produces `toy-ribbons.json` for callers that want a baked artifact.

## How we'll track progress

- This file lives until Phase 3 exits, then gets archived to NOTES.md.
- Mid-stream blockers / bugs go into BACKLOG.md, not here.
- Each phase ends with a one-paragraph entry in NOTES.md describing what landed and what surfaced.
