# Features & Roles

Read this first if you're new (human or agent). It's the product orientation doc — what the thing is, what each part is for, and the load-bearing decisions that shape why the code looks the way it does.

> Part of the **cartograph trinity** (`cartograph/FEATURES.md` / `cartograph/ARCHITECTURE.md` / `cartograph/BACKLOG.md`). Read at session start; flag contradictions during work; update at session end. Goal: keep this doc pristine and current. Stale claims are worse than no claims — they actively mistrain readers. The LS consumer app has its own parallel trinity under `ls/` — see root `README.md` for the index.

For *file layout* and the publish-loop pattern, see `ARCHITECTURE.md` (this directory). For *dev setup*, see the root `README.md`. This doc is conceptual.

---

## Architecture in one paragraph

Cartograph + Stage produce a **slab** — a baked, flattened, fortified, secure, optimized artifact under `public/baked/<look>/` — that the LS app builds on top of like a building on a foundation. Authoring is slow, careful, fortification work; the slab is fast, dumb, impenetrable substrate that the LS app trusts unconditionally. **Preview** is the slab inspection environment, used during authoring to stress-test the slab (GPU profiler, phone-aspect frame, per-layer cost matrix) before handing it off. The LS app and its end-user-facing features (place cards, businesses, accounts, etc.) live downstream — outside the cartograph repo today, but bundled with the slab at deploy time.

The architecture is the deliverable. Lafayette Square is the v1 instance. Other neighborhoods will pour their own slabs from the same toolkit; other operators will do the pouring. Every design decision in this codebase is in service of that kit ambition.

## The ribbon doctrine — read this BEFORE any geometry/corner/curb/intersection work

This section is canonical and load-bearing. Anyone — human or agent — touching ribbons, curbs, corners, intersections, or block geometry MUST read it first and reason inside it. Most regressions in this repo trace to someone re-deriving a points-and-chains framing for a problem the polygon system already answers. We have litigated this enough times to make a doctrine of it.

### The model in one sentence

**Blocks are positive space; streets are the void around them; everything visible at street level — asphalt, curb, sidewalk, treelawn, corner mouths — is a property of the block polygons' silhouettes, not of the chain centerlines that derive them.**

### Print, not web — the load-bearing principle

Cartograph delivers a print-like experience, not a reactive web app. The product is a **map** — a deliberate, settled surface the operator and end user trust without thinking about how it was made. Visual instability (corners that swing apart on widening, blocks that re-derive on every drag, geometry that "looks alive" because it's recomputing under the cursor) is a UX failure regardless of whether it's technically correct. Cognitive texture — the sliver of attention every operator spends every time they look at a wobbling map — is the design metric.

The instinct in modern web/software vernacular is: source of truth is the lowest-level data (chain.points, OSM features); everything else is reactively recomputed. That model is wrong for this product. It produces a map that's always slightly trembling. We are a print job, not a spreadsheet — and a print job freezes layout decisions early so attention can land on content, not on geometry that won't sit still.

When a design choice arises — "should this re-derive from chains every render?" "should the corner geometry react to chain edits?" — the answer is **no, freeze upstream and let downstream trust it**. Reactive recompute-from-source is the failure mode. Print-like-ness is achieved by data-shape walls, not by code discipline alone.

### The stage wall — where chains end forever

Chains and points exist in raw upstream data files (`cartograph/data/lafayette-square/raw/centerlines.json`, `osm.json`). They are the **provenance**, not the surface. From the operator's first interaction with the app onward, the system is **polygons**.

The pre-bake is the wall:

| Stage | Reads | Produces |
|---|---|---|
| 1. Survey (raw) | OSM ways, operator centerline edits | `chain.points`, IX vertices |
| 2. IX extraction | chains | IX centerpoint set |
| 3. Asphalt Intersection | chains (one-time, for long-run tangent) | per-IX leg-pair intersection points |
| 4. Adjusted Asphalt Intersection | corner-radius authoring + Stage-3 output | clean rounded corner geometry |
| **5. BAKE** | Stages 3–4 | **frozen polygon graph** (block polygons, asphalt edges, corner arcs, plug rings) |
| 6+. Surface (Designer / Stage / Preview / bake-output consumers) | **only the frozen polygon graph** | rendered map |

**After Stage 5, the chains are gone.** Stage 6+ code that reaches back into `chain.points` to compute leg tangents, snap endpoints, or extend rays is a **bug by definition**, even if it works. The wall is structural — surface code receives polygons, period.

Today's V2 implementation runs Stages 2–4 in the same hot path as Stage 6 (`buildBlockGeometryV2` re-walks chains on every Designer store update). The doctrine says this is wrong; the implementation will be migrated to the wall over time. Until that migration lands, every surface-stage code path that touches `chain.points` is doctrine-noncompliant and treated as tech debt; new surface-stage code MUST NOT add new chain references.

**Operator interaction model.** From the moment the operator opens the app, they work in polygons:
- Couplers attach to polygon corners.
- "Split traffic / center / left-offset" = polygon-edge attribute.
- "Widen drag" = polygon-edge offset.
- "Nudge in a section for parking" = sub-edge polygon edit.

The operator never has practical interest in the underlying chain — and the implementation should make that invisibility a **structural fact**, not a presentational accident.

### Authority order — load-bearing

1. **Polygons (block polygons)** are the authoring substrate. The park is a polygon. Each residential block is a polygon. A plaza is a polygon. Geometry decisions begin here.
2. **Sides** of a polygon are line segments between its corners. Sides carry the cross-section: pavement on the asphalt side, treelawn / sidewalk on the block side. Sides are STRAIGHT between corners (or smoothly curved by intent — never accidentally bent because a chain wandered).
3. **Corners** of a polygon are the vertices that matter. Each corner gets one rounding arc (Illustrator-style round-corners op, inset by R per the corner kit). Round-corners is applied to the polygon, not to chain endpoints.
4. **Chains and points** are downstream emergent artifacts — useful for UI selection, label placement, and as one input to the polygon derivation, but **not load-bearing for surface geometry**. A chain that bends slightly near a corner is data noise, not a geometric question.

If you find yourself reasoning about "the chain endpoint near the corner" or "snap this point" or "extend this segment to find the intersection" — stop. The polygon system answers the question without you. Re-frame in terms of polygons / sides / corners.

### What this gives you for free

- **Asphalt at intersections** = `stencil − unionOfBlockPolygons` (or, in V2's current implementation, derived through the chain rectangles' union and then `block = stencil − asphalt`). Either way, the *boundary* between asphalt and block is the polygon silhouette. Round-corners on the polygon → rounded asphalt mouth at the corner. Free.
- **Curb** = single offset of the block silhouette by `CURB_WIDTH`. One stroke, no separate curb-arc polygon. Honors round-corners by inheritance. The curb at the corner is the curb's natural arc around the polygon's rounded corner. Free.
- **Sidewalk + treelawn** = bands walked along block edges INWARD into the block (polygon-walking, D.3c). One ring per band per block-edge. Free.
- **Median** between paired carriageways = polygon between the two chains' inboard pavement edges. Emergent. Free if the polygon has room; absent if it doesn't.

### Corner plugs — load-bearing, polygon-derived, three components

At every IX corner V2 emits three distinct plug components. They are NOT anti-patterns — they are the canonical resolution of the corner. They are derived from the polygon (not constructed to paper over a bad join), but they ARE distinct geometry layers and must be respected by every consumer.

1. **Asphalt plug (`cornerAsphaltPlugs`)** — `asphaltRounded − union(per-chain asphalt rectangles)`. Each chain emits per-segment rectangles with square ends at IX vertices; the round-corners op then ADDS a fillet wedge to the unioned silhouette. That fillet area is part of `asphaltRounded` but NOT covered by any chain's rectangles; the asphalt plug fills it. Always opaque (structural surface; no per-chain translucency). `buildBlockGeometryV2.js:1643`.
2. **Curb plug** — the curb's natural arc around the corner. Emerges from `dilate(asphaltRounded) − asphaltRounded` (the unified curb stroke) traversing the polygon's rounded corner. No separate curb-arc emission — the curb-as-stroke pattern carries the corner for free, but it IS the corner plug for the curb material at that location.
3. **Concrete plug (`cornerSidewalkPads`)** — `cornerPadUnion ∩ blockRounded`. The sidewalk pad at the corner; emerges where treelawn/sidewalk bands from adjacent block-edges overlap at a convex corner. Lives in V2's `byMaterial` map alongside the band rings. `feedback_load_bearing_corner_pads` memory: do not remove pre-emptively. `feedback_corner_pad_continuity_first` memory: corner must be derived from the same source as the legs (the polygon), never constructed as a separate primitive.

All three are polygon-derived — they are properties of the rounded block silhouette and the band geometry, not patches over chain-joint failures. If any of them looks broken, the polygon is what's wrong; fixing the polygon fixes all three together.

### What this forbids — common anti-patterns

- ❌ **Snapping or editing chain endpoints to "clean up" a corner.** The corner geometry comes from the polygon. Chain endpoints are descriptive, not prescriptive. If a corner looks dirty (asphalt plug malformed, concrete plug missing or twisted, curb arc kinked), the polygon's corner vertex is wrong (cluster of micro-bends, not a single corner) — clean THE POLYGON.
- ❌ **Per-IX special-case extension math** that extends a chain segment to find where it meets another extended segment, computed off chain vertex tangents. Inherits chain-vertex bend noise. Compute corner records off polygon edges, not off extended chain tangents.
- ❌ **Authoring a fillet wedge primitive at a corner as a separate constructed polygon distinct from the corner plug components.** The three corner plugs above are NOT "fillet wedges"; they emerge from polygon ops on the silhouette and the band rings. A fourth filled object pasted on top is wrong.
- ❌ **Confusing V1's retired `buildCornerPlug` with V2's `cornerAsphaltPlugs` / `cornerSidewalkPads`.** V1's per-corner-annular-sector approach (`buildCornerPlug`, `buildCurbAnnulus`, `intersectionGeometry.js`) was retired in commit `0286cb1`. V2's three-component plug system is its replacement and is fully alive. Different model entirely.
- ❌ **Re-deriving "block polygon from chains" when an authored block polygon exists.** If the operator has authored the block polygon (e.g. the park's 4-corner polygon), the bake honors it; chain-derived polygons are fallback-only.
- ❌ **Splitting a chain at every slight bend to "respect topology."** Slight bends are OSM noise. The polygon system already collapses them. Splitting amplifies the noise.

### When the polygon doesn't look right

If a block's geometry is wrong (corners, sides, mouth, curb), there is exactly one diagnostic order:

1. **What's the polygon at this location?** Inspect block ring vertex count and corner positions. A 4-corner block should have ~4 vertices at corners (plus however many along sides). A 41-vertex blob with 5 vertices at each corner is the bug.
2. **Where does that polygon come from?** Authored (file, store), derived from chains (polygonization), or imported from OSM (`leisure=park`, etc.)?
3. **If the polygon is wrong: clean THE POLYGON, not the chains.** Either author it directly (canonical for block-of-record like the park), apply Douglas-Peucker / corner-detection at derivation, or change the source.
4. **Re-bake. Round-corners, curb, ribbons, asphalt mouth all reconcile automatically.**

There is no step "audit the chain endpoints near the corner." There is no step "snap the chain to the polygon." If a chain endpoint is materially off from the polygon corner, it is an unrelated authoring concern (label placement, perhaps), not a corner-geometry concern. The polygon owns the corner.

### Cross-references

- Block-as-positive-space derivation history: NOTES.md "the new model — figure-ground inversion."
- V2 polygon-walking band emission (D.3c): NOTES.md 2026-05-10 entries.
- Curb-as-unified-stroke: see the curb section later in this document.
- Corner-authoring kit (3-tier: global / per-IX / per-corner): see the corner section later in this document.
- Memory: `project_v2_curb_is_unified_stroke`, `project_v2_block_ring_extends_to_asphalt`, `feedback_corner_pad_continuity_first`, `feedback_load_bearing_corner_pads`, `feedback_clipping_mask_does_the_geometry`.

If a request, an investigation, or a brief invokes "snap chain points," "extend chain segments to corner," "consolidate vertex cluster at intersection," or "the chain endpoint doesn't agree with the polygon corner" — push back. Re-frame in terms of polygons. The polygon answer always exists; the chain framing rediscovers a problem the polygon system already solved.

---

## The conceptual model

Cartograph is recursive. Each authoring step makes a truth-claim that the next builds on:

- **centerlines** (Survey) → *provable truth*: streets exist here, with this geometry
- **+ thickness** (Measure) → *provable truth*: this street is N meters wide on each side
- **+ dimension** (ribbons) → *emergent*: 3D cross-section per street
- **+ finish** (Stage) → *authored*: materials, palettes, lighting, sky

**Designer is fortification, not invention.** Operator splits, defines, classifies, marks caps and couplers — against aerial-photo ground truth — but doesn't author geometry. *All* "other" data (buildings, parcels, landmarks, land use) flows through Designer for the same fortification treatment. Designer's job is to harden the layout into something the slab can be poured around.

**Stage is the second authoring environment** — the *theatrical* sense of "stage." Where the look gets staged: materials, palettes, lighting, sky, post-FX. The operator's design work, finalized into the slab when they hit Bake.

**The Bake is the slab pour.** It IS the publish moment for cartograph — but the artifact ships to the LS app, not directly to end users. Live deployment is downstream, bundling the slab with the LS app shell.

**The slab carries the operator's *full* authored product.** This is load-bearing. Anything an operator authors in cartograph — geometry AND optics: sky, atmosphere, post-FX, exposure, time-of-day overrides, per-shot camera, materials, neon, lamp glow, everything — must travel through the bake into `scene.json` (or another baked artifact). The deployed LS runtime trusts the slab unconditionally and cannot reach back into the cartograph authoring store. So anything authored-but-not-baked is invisible to the deployed product; the deployed product silently degrades to "operator-authored geometry + procedural-default optics," which isn't the product. The product is what the operator sees in Stage. See `BACKLOG.md` "Slab completeness" for the current gap inventory and the remediation track.

**Preview is the slab inspection environment.** Walks the slab with a GPU monitor strapped on — phone-aspect frame, per-layer cost readouts, post-FX toggle matrix. If the slab holds at acceptable mobile cost, it's ready for the LS app to build on.

**Authoring is linear-but-concurrent.** Survey → Measure → Stage is the canonical flow, but mid-Stage realizations frequently bounce back to Survey/Measure. Tool-switching is cheap; map state (zoom, position) persists across tools when feasible.

**Aesthetics + performance are co-equal non-negotiables.** Aesthetics are the differentiator (it's what separates the product from generic 3D maps). Performance is equally important and invisible (mobile playback can't compromise on it). The whole authoring-time complexity exists to guarantee both at runtime.

## Roles, plainly

| Component | Role | Audience | Deployed? |
|---|---|---|---|
| Designer / Survey / Measure | Fortification authoring (geometry + tabular data integrity) | Operator | No |
| Stage | Look authoring (materials, palettes, lighting, post-FX, shots) | Operator | No |
| **Bake** (action) | Slab pour — publishes to `public/baked/<look>/` | Operator clicks | N/A |
| Slab (`public/baked/<look>/*`) | Substrate — flat, fortified, secure, dumb | LS app + Preview | Yes (with LS app) |
| Preview (`/preview.html`) | Slab QA — GPU profiler, phone-aspect, layer cost | Operator | No |
| LS app | Consumer surface (place cards, businesses, accounts, …) | End users | Yes |
| Aerial photos (in Designer) | Ground-truth verification | Operator | No (max-res, never shipped) |

## The three operator environments

### 1. **Designer** (`/cartograph.html` in `inDesigner` mode)

**Owns: fortification of all spatial + tabular data, against aerial-photo ground truth.**

Tools: Survey (centerlines, lane counts, road metadata), Measure (street widths, sidewalk widths). Top-down orthographic view, compass-N up, paired with georeferenced aerial photos at maximum resolution (never shipped, so no size/GPU concern).

What the operator does: traces and corrects the street network, paths, lots, park boundary; classifies land use; integrates building data, parcels, landmarks, lamps. Splits, defines, marks caps, sets couplers — but doesn't author geometry. Centerlines are provable truth from OSM; Measure widths are provable truth from observation; Designer's job is to fortify and validate, not invent.

Output: `cartograph/data/raw/{centerlines,measurements}.json` + `cartograph/data/clean/overlay.json`.

**Toolbar = views, Panel = tools.** The Designer toolbar carries view-only controls (Aerial, Looks-or-Toy picker, Stage) — *what's the scene, what's the look, where's the aerial*. The panel's header is a 3-part pill (Survey | Measure | Design) that selects the authoring tool — *what am I doing in the panel*. "Design" is the no-tool default (formerly the absence of any pressed pill). One topic per place; the panel's content swaps based on the pill (`SurveyorPanel`, `MeasurePanel`, or the default Look-design controls).

**Looks picker also surfaces Toy.** The toolbar's Looks dropdown lists the active Look options plus a "🧪 Toy scene" entry. Picking Toy switches `scene → 'toy'`; picking any Look from toy switches `scene → 'neighborhood'` and sets that Look active. One consolidated context-switcher; no separate Toy button. (Toy is conceptually a scene — a different *dataset* — not a look. The picker just consolidates context-switching UI; under the hood the scene + Look state are still separate. See `cartograph/TOY_AUTHORING_PLAN.md` and the `feedback_no_parallel_pipeline_for_scenes` memory entry for the corollary architectural rule: a new scene is routed through the existing pipeline, never via toy-only branches.)

**Toy is the canonical pipeline test rig.** Toy is the cleanest place in cartograph to develop emitter + geometry changes: full V2 stack live (block fills, ribbons, corner authoring kit, smoothing, curb, bake), no LS-only data-quality noise (no stale ix-refs, no divided-road continuation joints, no undefined highway tags), and the smallest possible re-bake/iter loop. The fixture at `src/data/toy/toy-ribbons.json` is purpose-built with three deliberate irregularities — VW3's NE bend, HW3's saw-tooth jog, and a dead-end stub — that exercise the failure modes the next-gen emitter has to handle. Land geometry/emitter changes in Toy first, then cut LS over. See `cartograph/BACKLOG.md` "Toy is the test rig for the next emitter".

**Aerial toggle:** the toolbar's `Aerial` button replaces the SVG/curated background with the high-resolution photo (max-res, never shipped, no GPU concern). When a tool (Survey or Measure) is active *and* Aerial is on, Designer enters a focus mode: ribbon bands stay visible (the measurement targets), but the land-use face fills, all decoration in `MapLayers` (buildings, landscape, lamps, water, trees, labels, parking, barriers), and `DesignerArch` step aside so the operator can align directly to the photo without visual competition. Toggle Aerial off, or exit the tool, and full decoration returns.

**Corner-authoring kit (Blocks > Shape):** three layers of corner-radius authoring stack at every intersection. (1) The global `Corners` slider multiplies every IX radius for the active Look (1× = AASHTO/NACTO baseline; >1 = bubblier; 0 = fully square — useful for sponsored-event "retro" mode). (2) The `Edit corners` toggle surfaces draggable dots at every IX center (Illustrator pattern: drag radial distance from cursor to IX = new radius); a big blue dot per IX adjusts all its corners together. (3) Smaller cyan dots at each individual corner adjust that corner alone, for true corner cases. Color coding: blue/cyan = default, gold = operator-authored, white = mid-drag.

(The corner kit lives in Blocks because corner radius shapes the rounded-block-clip that derives every block polygon — it's a block-shape concern even though "corners" reads as intersection geometry. Curb width sits next to it in the same Shape subsection: `curb = dilate(asphaltRounded, CURB_WIDTH) − asphaltRounded` is also a block-boundary stroke. See ARCHITECTURE §"V2 curb is the unifying boundary stroke" and the V2 memory entry.)

Resolution at render time: per-corner override → per-IX override → data-table default, all × global scale. Authoring semantics: dragging the global slider *resets* both override maps on commit (operator's mental model: "scale all corners together to this × default"); dragging an IX center handle *resets* per-corner overrides at that IX only on commit (homogenizes the IX); per-corner drags just write a single override. Revert: right-click on an IX dot clears that IX's overrides (per-IX + per-corner-at-IX) without touching the rest of the map — cheap, common during authoring. The global Revert button (panel) stays for the "nuke everything + reset scale to 1" case. All three layers persist per-Look to `design.json`. Per-corner identity uses leg-pair keys (`<skelIdA>:<dirA>|<skelIdB>:<dirB>`) so authoring survives chain-edit churn at the IX. Bake reads the same maps, so Stage / Preview pick up authored corners on next re-bake.

### 2. **Stage** (`/cartograph.html` in shot modes — Browse, Hero, Street)

**Owns: look authoring — the theatrical sense of "stage," where the design happens.**

Tools: Surfaces panel, Sky & Light panel, Post-processing panel, Look manager, per-shot camera tuning. Perspective camera; multiple "shots" each with their own framing, atmosphere, and time-of-day baseline.

What the operator does: takes Designer's fortified data as truth and dresses it in a chosen aesthetic ("Look"). Lighting curves, building palettes, ribbon materials, sky gradient, post-FX, cloud presets. The artist spends most of their time here.

Output: `public/looks/<id>/design.json` per Look.

**Stage drag semantics:** Browse uses LEFT-drag = pan, ⌥/Alt+LEFT-drag (or RIGHT-drag) = orbit (3D-easter-egg). `mouseButtons` is passed as a prop to OrbitControls (not mutated imperatively in a useEffect) to avoid ref-timing races where drei's defaults would clobber ours. Hero/Street keep their rotate-by-default (LEFT=ROTATE, ⌥+LEFT=PAN) since they're 3D-inspection shots. Designer's "Stage →" always lands on Browse so the camera transition is continuous with Designer's overhead view.

**Two bake-related buttons; both always run, neither gates on `bakeStale`:**

- **Designer's "Stage →"** = navigate to the operator's last Stage shot *immediately*, then bake async in the background. The Stage view briefly shows the previous slab and refreshes via the `bakeLastMs` cache-bust when the bake finishes. Single click for "I edited, take me to the baked view." Fire-and-forget rather than awaiting — keeps the operator out of a multi-second disabled-button limbo.
- **Stage's "↻"** = bake in place. Single click for "I'm already in Stage, re-pour without moving me." Stays in current shot. Spins while baking. Small orange dot lights when authoring edits exist since last bake (passive indicator only — never disables the action).

Both accept ⌥-click to force a full rebuild (bypasses the server's dirty-check; the cache-bust escape hatch).

The **Browse shot** is the public-facing overhead view. Its `up` vector is the cosmetic screen-orientation knob (the "Heading" slider in the Browse panel) — purely a viewing preference, not a data transform. All spatial data is in compass frame; this just decides which way the screen is oriented relative to compass-N.

### 3. **Preview** (`/preview.html`)

**Owns: slab inspection — GPU profiling + phone-mode QA + post-bake verification.**

Reads the same baked artifacts the LS app will read, *plus* a substantial QA toolkit:

- **GPU profiler** — per-layer cost tracking (ms / draw calls / triangles), strip chart, GPU panel, scope-to-span events for bracketed measurement.
- **Phone-mode** — renders the scene inside `<PhoneFrame>` at a target scale, simulating deployed mobile aspect. Toggle persists via localStorage.
- **Layer toggle matrix** — scene layers (celestial, clouds, ground, buildings, trees, park, lights, arch) and post-FX (ao, bloom, aerial, grade, grain), each with live cost readout.
- **Time-of-day control** (DawnTimeline).
- **Soft-reload** — bumps a key to remount `CanvasContents`, forcing re-fetch of bake artifacts.
- **Trigger bar** — shot picker + reload + phoneBus span events.

Preview is operator-facing, never deployed. If a layer's cost is unexpectedly high in Preview, the GPU panel surfaces it before mobile users feel it. If something looks right in Stage but wrong in Preview, the bake didn't propagate. Preview is the proving ground before slab handoff.

---

## Helper apps

Each authors a discrete content type, ships one canonical artifact, knows nothing about the runtime. See `ARCHITECTURE.md §1` for the publish-loop pattern.

- **Arborist** (`/arborist.html`) — tree species library, per-species workstage, and **Grove** (visual roster + curation gallery). Operator browses, rates, and curates GLB tree variants. Bakes `public/baked/<look>.json` (placements: `{x, z, url, scale, rotY, species, variantId, ...}`) consumed by `InstancedTrees`. Placements come from `src/data/park_trees.json` (Python ETL, point-in-polygon-filtered against the real park boundary). Placements are universal across Looks; **roster + atlas are per-Look** (`public/looks/<id>/design.json#/trees` + `public/baked/<id>/trees-atlas-*` + per-Look UV-rewritten GLBs under `public/baked/<id>/trees/`).
  - **Grove is the per-Look roster surface.** Two scopes: "In Look" (the active Look's roster — click a tile to remove) and "All Rated" (every quality≥2 variant — click to add or remove from the active Look). Roster changes POST to `/api/cartograph/looks/<id>/trees` and fire `/api/arborist/atlas/bake?look=<id>` fire-and-forget so the per-Look atlas + rewritten GLBs are regenerated automatically. Stage/Preview pick up the new artifacts on next reload (cache-busted via `?v=<atlas.generatedAt>` in InstancedTrees). No design.json hand-editing, no manual `bake-look.js` invocation in the normal flow.
  - **Procedural authoring in-Arborist + skeleton-first redo (v1.5, Phases A + D + B-core + B.1.a shipped 2026-05-15 / 2026-05-16).** Five phases shipped: A (`2323a78` dice+adopt UI), D (`06f903e` SCA + tropism skeletons), B-core (`0b2f6cb` photo-PBR bark + retint shader infra), B.1.a (`6c5c957` UV-scale wiring + B-core atlasKind lookup fix; iterated through polish reverts to current state at `54355a4`). **Phase C pulled forward as the next phase per 2026-05-16 EOD doctrine pivot** — the maxi-brief's original D → E → C → B ordering was right; we shipped B before C to explore the bark space and learned why C should have been first (photo PBR on smooth `THREE.CylinderGeometry` produces visibly stretched + warped wraps; the visual ceiling is geometric, not shader-side). Bark stays at v1.5 baseline (photo PBR on smooth cylinders, per-Look retintable via `materialColors[<species>]`, Bloom-stable single shader program); Phase C's per-vertex radial displacement + multi-segment + flange rings + root flare break up the smoothness so the same bark stops looking warped. **Phase F scope reframed:** the parametric leaf-cluster compositor (`arborist/leafCluster.js`) is dropped; for 5 heroes, hand-authoring cluster atlases in Photoshop produces better species character at less engineering cost. F shrinks to "import authored PSD cluster PNGs, atlas + tint + sparse-occupancy at runtime." **Phase F.5 (parametric leaf editor) killed** — PS-authoring obviates the parametric path. **Phase E priority-dropped** (conifer is 7% of inventory). Same `generateTreeMesh()` params contract throughout; pipeline (publish-glb / bake-look / bake-trees) unmodified. **Phase A surface:** open `/arborist.html` → Procedural button → species dropdown → per-slot 🎲 dice (live preview, no file write) → ✓ adopt (persists seed to `arborist/state/<species>/seedlings.json`, gitignored) → Re-publish species (rebakes through publish-glb + fires per-Look atlas auto-bake). **Phase D surface:** the 4 SCA species' slot cards expose Envelope (profile dropdown of 5 named revolution curves + width/height/asymmetry/Y-offset sliders) and Tropism XYZ panels; silhouettes diverge correctly (weeping curtains 3m below trunk via envelope `offsetYFrac=-0.6` + Y-tropism=-0.4; columnar narrows to W/H≈0.29; broadleaf rounded-oval; ornamental broad-low). **Phase B-core + B.1.a surface:** every tree material (vendor + procedural) carries `extras.bark` with photo-PBR texture references + `uvScale` + `tintBase` + `tintJitterRange` + `roughnessOverride`; the shared `treeAtlasMaterial.js` shader reads them via per-draw uniforms set by `applyBarkUniforms`; per-vertex `aBark` attribute gates retint to bark fragments only. Conifer still routes through the v1 free-growth path until Phase E (priority-dropped). **Remaining v1.5 work:** C → F (reframed) → G.1–G.5. See `cartograph/BACKLOG.md` "Trees — Procedural v1.5" + `cartograph/NOTES.md` 2026-05-15 maxi-brief (status header reflects 2026-05-16 EOD reality).
  - **Procedural-variant fallback (v1, shipped 2026-05-14 commit `dbbd1ed`).** Arborist publishes a *generated* species family — `procedural_broadleaf`, `procedural_conifer`, `procedural_ornamental`, `procedural_columnar`, `procedural_weeping` — alongside scanned/vendor GLBs. A pure parametric generator function (`arborist/generate-procedural.js`, resurrected from the pre-`43c4aa3` `ParkTrees` branching algorithm) emits N variants per morphology as a multi-node source GLB under `/tmp`; shells out to the existing `publish-glb.js` for variant-split + LODs + manifest; sets `qualityOverride: 2` (Fill tier) on every variant so `build-index.js` ships them; appends entries to the active Look's `design.json#/trees`. `bake-look.js` then atlas-packs them like any other species. InstancedTrees substitutes from the same-category roster pool exactly as it does for hand-authored species — **the runtime sees no fork**. SpeedTree GLBs will replace these by raising quality ratings on roster entries — no code change at swap time. The slab carries procedurals exactly the same way it will carry SpeedTrees. Bark texture is per-species solid (vertex colors don't survive bake-look's atlas rewrite); leaves use the existing `public/textures/leaves/<morph>.png` library. The generator is parameter-first now (CLI today); the eventual procedural-authoring mode in the Arborist app is a UI surface bound to the same `generateTreeMesh({preset, seed, dbh, canopyR, canopyH, branching, leafMorph})` signature with no algorithm change — see `BACKLOG.md`.
- **Meteorologist** (in Stage) — clouds & weather rules. Authoring UI lives inside Stage's Sky & Light card. Publishes `public/clouds/{presets,almanac}.json`.

---

## Frame discipline

**All spatial data is in compass frame** (the unrotated output of equirectangular GPS→meters projection about the neighborhood center). One frame, every dataset, period.

There is no "park frame," no "world frame," no rotation constants in the math layer. If a render path imports a `PARK_GRID_ROTATION`-shaped constant, something is wrong.

The actual park grid is rotated ~9.2° from compass-N because of the city street layout — that rotation is *real-world geometry* baked into the data (every coord is at its true GPS-projected position). It is **not** a coordinate-system choice.

The rule: **no rotation constants in the math/data layer.** Local visual or geometric scoping inside a single component or shader is fine. The only legitimate uses of a 9.2° (or related) constant in the codebase are:

1. `LafayettePark.parkAxisToCompass(px, pz)` — a one-helper authoring shortcut for placing the four fence corners as axis-aligned `±a` and rotating them into their actual compass-frame positions. Could be replaced with hardcoded GPS lookups.
2. The Browse shot's `up` vector (Heading slider) — cosmetic screen orientation only.

If you find any *other* `9.2`, `-9.2`, `0.1605` (rad), `Math.PI/19.57`, or `GRID_ROTATION`-shaped constant in the math/data layer (bake scripts, store actions, runtime mounts, geometry builders, shaders), it is almost certainly vestigial from the de-parking episode and should be removed, not preserved. **This number has cost many hours; precision in this list is the firebreak.**

History: there was a long "de-parking" episode in May 2026 that tried to introduce a parallel "world frame" duality. It was misdiagnosed; the screen-orientation desire was a camera concern, not a data concern. The duality is removed. If you find yourself reaching for a second frame, stop and read the `project_compass_only_camera_heading` memory entry.

---

## Data flow & the bake chain

```
[Authoring inputs]
cartograph/data/<scene>/raw/
  ├── osm.json                  ← node cartograph/fetch.js (one-time)
  ├── elevation.tif             ← USGS 3DEP 1°×1° 1/3 arc-second GeoTIFF, .gitignored
  │                                (~453 MB; acquire via the staged-products S3
  │                                 mirror, NOT EPQS — see memory
  │                                 `reference_usgs_dem_s3_mirror`)
  ├── centerlines.json          ← legacy file (name-keyed); Survey wrote here historically
  └── measurements.json         ← Measure tool writes
cartograph/data/<scene>/clean/
  ├── skeleton.json             ← node cartograph/skeleton.js (derived from osm.json)
  └── overlay.json              ← Survey + Measure tools write (skelId-keyed operator-intent: measure, segmentMeasures, capStart/End, anchor, couplers)
cartograph/data/<scene>/neighborhood_boundary.json
                                ← canonical extent (boundary polygon, center,
                                  radius, streetFade). Single source of truth
                                  for "where is LS"; consumed by LS_STENCIL
                                  and bake-terrain's clip bbox.

scripts/raw/
  └── lafayette_park_trees.json ← city forestry data

src/data/  (some hand-authored, some Python ETL output, some kit-level bakes)
  ├── park_trees.json    ← scripts/12-process-park-trees.py
  ├── park_water.json    ← hand-authored (initial commit, OSM-derived)
  ├── park_paths.json    ← scripts/14-process-park-paths.py
  ├── street_lamps.json  ← scripts/13-fetch-street-lamps.py
  ├── terrain.json       ← bake-terrain.js (metadata only: width, height,
  │                        bounds, baseElev)
  └── terrain.bin        ← bake-terrain.js (Float32Array heightmap, row-major,
                           raw; paired with terrain.json. Kit's standard
                           bulk-numeric pattern — see memory
                           `kit-bin-pattern-for-bulk-numerics`)

public/looks/<id>/design.json   ← Stage panels write per-Look styling

[Pipeline]
node cartograph/pipeline.js     → cartograph/data/clean/map.json
node cartograph/promote-ribbons.js → src/data/ribbons.json
node cartograph/bake-terrain.js → src/data/terrain.{json,bin}
                                  (one-shot, ~0.2s. Re-run when
                                   neighborhood_boundary.json or the raw .tif
                                   changes. Clips the GeoTIFF to LS_STENCIL's
                                   bbox + 5 m/sample bilinear resample +
                                   local-min = 0 normalization. Pre-2026-05-13
                                   used EPQS per-point fetch, ~45 min for the
                                   same coverage.)

[Bakes — POST /api/cartograph/looks/<id>/bake]
  pipeline.js                              ← only if raw inputs are dirty
  promote-ribbons.js                       ← only if map.json is dirty
  bake-ground.js                 → public/baked/<id>/ground.{json,bin}
                                   (reads ribbons.json + map.json + design.json
                                    so every Designer toggle becomes a baked
                                    group with the Look's authored color)
  bake-buildings.js              → public/baked/<id>/buildings.{json,bin}
                                   (reads src/data/terrain.{json,bin} pair via
                                    fs to anchor building Y to local elevation)
  bake-lamps.js                  → public/baked/<id>/lamps.json
  bake-scene.js                  → public/baked/<id>/scene.json
                                   (per-Look authoring snapshot: sky / lighting /
                                    post-FX / shots / hero / arch / horizon /
                                    browseHeading / materials — every authored
                                    channel rides the slab as of SC.7)
  arborist/bake-trees.js         → public/baked/default.json
  bake-ground-ao.js              → public/baked/<id>/ground.lightmap.png

[Runtime]
Stage / Preview / production: read public/baked/<id>/* + public/baked/default.json
                              + (live) src/data/{park_trees,park_water,park_paths,street_lamps,ribbons}.json
```

The bake button (Stage's "Bake" affordance) chains all of this and is incremental — each step is skipped when its outputs are newer than its declared inputs. `?force=1` on the URL forces a full rebuild.

---

## Map state preservation: Designer ↔ Browse

Designer and Browse share the same overhead view; the operator's pan/zoom carries across. Both modes write to `localStorage[cartograph-camera]` every frame (Designer as ortho `{x, z, zoom}`; Browse as perspective `{x, z, altitude→zoom}` via FOV math). On any shot transition into Designer or Browse, the camera reads the shared key and lands the operator where they last were. Hero and Street are independent shots (their own SHOTS-table positions), not part of the overhead-share.

Resolved 2026-05-04. If a round-trip (Designer→Browse→Hero→Designer) starts losing state again, check `useFrame` in CameraRig — the persist hook needs to fire for both `'designer'` and `'browse'`.

## Layering / coplanar stacking / depth precision

Four orthogonal mechanisms keep surfaces from fighting each other. They solve different problems — picking the wrong one is the most common source of "the X is missing in Stage" / "the Y looks weird at distance" bugs. Use this table to decide before reaching for a fix:

| Mechanism | What it handles | Where it works | Cost / failure mode |
|---|---|---|---|
| **Geometric Y separation** — meshes at genuinely different heights (water 0.35m above ground, paths 0.4m, trees on top) | Surfaces that ARE at different heights in reality | All distances; robust under depth-buffer precision (with logarithmic depth on, see below) | Visible vertical gap if too aggressive — fine for top-down, gets noticeable in Hero/Street |
| **`polygonOffset` per renderOrder** — `polygonOffsetFactor: 0, polygonOffsetUnits: -renderOrder` per material | Coplanar surfaces (face fill + ribbon bands + paint stripes, all geometrically at y=0) | All distances within reason | Depth-buffer-precision-relative; the cumulative offset across many groups can run out of useful range at extreme distances |
| **Tiny Y-lift (0.01m increments)** — `block 0.01 → asphalt 0.04 → paths 0.05` per `BlockGeometryV2Debug.jsx` | **Designer ortho view only** | Top-down ortho; falls apart immediately in perspective at angle | Cheap but fragile — never use for Stage/Preview |
| **`renderOrder` + transparent material** — explicit paint order regardless of depth | Transparent overlays where you know the geometric relationship is monotonic (selected-chain band overlays, soft-circle silhouette fades) | Forces draw order; bypasses depth test for sort but not for occlusion | Wrong if surfaces aren't genuinely "in front of" each other — produces "this should be hidden but isn't" bugs |

**Plus a fifth axis the table doesn't cover: depth-buffer precision at distance.** The Canvas uses `logarithmicDepthBuffer: true` (added 2026-05-13). Without it, the 24-bit depth buffer's precision is non-uniformly distributed across `near=1, far=60000` — 90%+ of precision lives in the first few meters. At Browse altitude (1300m+) looking down, the 35cm water-above-ground gap was at the edge of resolvable precision and water would intermittently sort INTO the ground or get culled. Logarithmic mode redistributes precision so the gap remains resolvable at any reasonable distance. ~5% perf cost; acceptable on mobile budget.

**Decision rule for new ground layers:**
1. Does the layer have a real physical height different from the surface below it (water surface above lake floor, sidewalk curb above asphalt)? → **Geometric Y**, ≥1cm.
2. Is the layer coplanar with what it sits on (parking-lot fill on top of residential face, paint stripe on top of asphalt)? → **polygonOffset** per its renderOrder slot in `PAINT_ORDER` (bake) / `PRI` constants (Designer V2).
3. Is this a Designer-only authoring overlay (translucent selected-chain bands during Measure drag)? → **Tiny Y-lift OR `transparent opacity={1}` + renderOrder**. Not for Stage/Preview.
4. Is this an explicit "always draw on top of everything below, regardless of geometry" overlay (Aerial tiles when toggled, sky disc)? → **`renderOrder` + `depthTest: false`** if needed.

**Counter-rules:**
- Never stack two coplanar surfaces by tiny Y-lift in Stage/Preview; use polygonOffset. The Y-lift only survives in Designer ortho because the view is parallel-projection.
- Never assume a sub-meter Y separation will survive at Browse altitude without `logarithmicDepthBuffer`. Now that we have it, it does.
- If you write a custom shader (`makeGrassMaterial`, water ripples, gravel paths), set a unique `customProgramCacheKey` on the material BEFORE any `patchTerrain` or other wrapper — otherwise three's program cache can silently collapse it onto another patched material's compiled shader. Hit this 2026-05-13 with the gravel path shader, and again 2026-05-14 with LafayettePark's `pathMat` + `waterMat` after they were chained with `patchTerrain` next to plain `MeshStandardMaterial` siblings that collapsed both onto a vanilla `terrain-vp-std` cache key. Symptom: procedural gravel/ripple disappears, mesh renders as flat default-color PBR.
- Per-vertex `patchTerrain` adds depth-precision-sensitive shader code; wrapping a material with it can subtly affect distance-dependent sort even when `terrainExag = 0`. For pond surfaces (lake, grotto) — bank + water + island stacked with sub-meter Y separations — per-vertex displacement makes each mesh's interior interpolate independently across its own triangulation, and the larger bank polygon can rise above the smaller water polygon at the pond center. Use **rigid per-pond group lift** instead (`<PondGroup>` in `LafayettePark.jsx`: each pond's children share a single per-frame `position.y = centroidRaw × terrainExag.value` so the bank/water/island Y offsets ride together). The earlier whole-park rigid lift was the wrong granularity (corner mismatch was meters across the park's 350 m extent under b24fce5's real raw values); the right granularity is per-pond / per-feature, not per-park.

## Known live architecture issues / load-bearing decisions

Decisions that affect how to think about new work:

### Bake artifacts are browser-cached; cache-bust signal must be unique per bake

`BakedGround` and `InstancedTrees` fetch `/baked/<look>/{ground,buildings,scene}.json` and `default.json` with `?t=${bakeLastMs}`. If the same `bakeLastMs` value is reused across bakes, the browser hits its HTTP cache and serves stale geometry — the bake artifacts on disk update, but the page doesn't see them. **`bakeLastMs` must be set to `Date.now()` on every bake completion**, not to the bake's duration. (Historical bug: `useCartographStore.js:runBake` used `r.ms` (duration) as the cache-bust signal; incremental no-op bakes returned identical small durations and the browser cached them. Symptom: "I edited X days ago, Designer shows it, Stage doesn't." Fixed 2026-05-04.)

### Bake handler runs async (fixed 2026-05-13)

`cartograph/serve.js`'s POST `/looks/:id/bake` runs each step via `runShell` (Promise wrapper around `spawn` with `shell: true` + timeout). The Node event loop keeps serving other API requests while a bake child process runs. A per-look `_bakesInFlight` set rejects concurrent bake requests against the same Look with `409 { error: 'bake already in progress' }` so a double-click on the Stage button can't race two bakes writing to the same `public/baked/<id>/` directory.

Historical state (pre-2026-05-13): each step ran via `execSync`, blocking the Node event loop for the bake's entire duration. Every `/api/cartograph/*` request pended; if a step hung, the whole server hung. Workaround was to kill + restart `carto`. The async conversion removed both failure modes.

### Bake-chain dirty-skip: content-aware writes that ALSO touch mtime (2026-05-13)

The bake's per-step `needsRebuild` compares input mtimes (raw data + script source) to output mtimes. To make incremental bakes truly skip when nothing changed, two coupled rules must hold:

1. **Skip the disk write when bytes are byte-identical.** `cartograph/io.js`'s `writeIfChanged(path, content)` reads the existing file, compares, and skips `writeFileSync` on match. Avoids rewriting `map.json` / `ground.json` etc. on every authoring save.

2. **Touch the output's mtime on a no-op write.** This is canonical `make` behavior: a successful build verifies the output is up-to-date *as of now*, so the next dirty-check sees the chain as stable. Without (2), editing a source script (e.g., `pipeline.js`) permanently invalidates its downstream artifact — `pipeline.js > map.json` forever — and `needsRebuild` reruns every step on every bake. Verified on LS: first bake after a fix takes the usual ~40s to stamp the chain; subsequent no-op bakes return in 1 millisecond.

**Output-write ordering rule.** Any bake script that writes an OUTPUT file AND patches another step's output (e.g., `bake-ground-ao.js` writes `ground.lightmap.png` and ALSO patches `ground.json` to add the lightmap reference) must write the patched file BEFORE its own output. Otherwise the patched file ends up with a strictly newer mtime than the step's output, and `needsRebuild` reruns the step every bake. `bake-ground-ao.js` learned this the hard way 2026-05-13.

**To apply for any new bake step:** use `writeIfChanged` from `./io.js` for every output. If the step patches another step's output, patch first, output last.

### Treelawn matches adjacent parcel land-use (2026-05-13)

The treelawn strip between curb and sidewalk paints in the color of the **land-use block it abuts**, not a uniform green. Bake emits per-LU groups (`treelawn:residential`, `treelawn:park`, etc.); Designer's V2 live render does the same per-LU bucketing for parity. Each variant inherits the parcel's authored `luColors[lu]`; grass-LU variants (residential / park / recreation) route through `GrassMesh` and visually merge with the parcel face's procedural grass texture; non-grass-LU variants (commercial / parking / institutional / etc.) render flat via `FadeMesh` in that parcel's authored color so the frontage doesn't read green next to a brown block.

Adjacent-block lookup is **coordinate-based** (point-in-polygon on `ringInteriorProbe(fe.treelawnRings[0])` against `v2.blocks`), not a `blockKey` join. The reason: pass-1 frontage-edge `blockKey`s drift from pass-2 `blocks[].blockKey`s when asphalt widens via Measure customs (`blockKeyFromRing` rounds bbox center to 0.5m; wider asphalt shifts the center; key flips). A key-join misses ~80% of fees on LS; the coordinate probe attributes ~70% on the first pass with the remainder being legitimate edge cases (dead-end caps, stencil edges) that fall through to a bare `treelawn` group.

Designer toggle `treelawn` hides all per-LU variants together — the runtime visibility check strips the `:<lu>` suffix before `BAND_TO_LAYER` lookup.

### `BakedGround.GrassMesh` needs polygonOffset parity with `FadeMesh` (2026-05-13)

Both `FadeMesh` and `GrassMesh` in `src/components/BakedGround.jsx` render face / material groups; the bake assigns per-group `polygonOffsetUnits = -renderOrder` so coplanar fragments stack in paint order. `FadeMesh` honors this; `GrassMesh` historically didn't, and grass-shaded faces (residential / park / recreation; lawn / treelawn / median) z-fought with adjacent `FadeMesh` faces and rendered invisibly in Stage. The fix is one block in `GrassMesh`'s material build: `material.polygonOffset = true; material.polygonOffsetFactor = 0; material.polygonOffsetUnits = group.polygonOffsetUnits`. Any new material path in BakedGround needs the same parity.

### Terrain doctrine — every consumer reads one dial, every anchor uses corner-mean (2026-05-14)

After the b24fce5 clip-to-stencil terrain pipeline (local-min = 0 normalized raw float32 in `terrain.bin`), the runtime terrain integration was tuned to a single coherent set of rules. Every consumer that participates in elevation displacement multiplies by the same shared `uExag` uniform (driven from `terrainExag.value` in `src/utils/terrainShader.js`, which `BakedGround`'s `TerrainExagDriver` lerps toward `V_EXAG` from `src/lib/terrainCommon.js`). **V_EXAG is the single dial.** Changing it rescales the whole scene coherently — ground, foundations, buildings, lamps, trees, fence posts, paths, water, banks, islands, labels. The current value is `1.5`; visible LS-wide relief is ~52 m (35 m raw × 1.5), which keeps the neighborhood gradient dramatic without making the per-footprint foundation exposure run away on slopes.

**Anchor rule (foundations + walls).** Per `src/lib/foundationGeometry.js` doctrine, foundations are the contact joint between an upright rigid building and a non-flat heightfield. The "centroid Y" used for the rigid lift is the **mean of `getElevationRaw` sampled at every footprint vertex** — not a single sample at `building.position`. Both LafayetteScene's `Building` walls (via `patchTerrainAtCentroidRaw(mat, centroidRaw)` helper) and `Foundations` (via per-vertex `aCentroidY` attribute on each foundation block, preserved through `mergeBufferGeometries`) lift by this same value, so the slab top + wall bottom stay flush regardless of the slope across the footprint. Canonical reference: `cartograph/bake-buildings.js`'s `centroidY = mean(getElevationRaw(footprint[i]))` — match this anywhere a "centroid elevation" is needed. Sampling at `building.position` diverges from the rule by the convexity of the heightfield across the footprint; for LS's concave-down hill geometry, that meant ~0.5 m of extra exposure baked into every building.

**Instance-scale fix.** `TERRAIN_DISPLACE_INSTANCED` divides the lift by the instance's Y-axis scale (`length(instanceMatrix[1].xyz)`) so the world-space result lands at `sample × uExag` METERS regardless of instance scale. Without it, lamps at `LAMP_SCALE ≈ 1.38` over-lifted ~38%, and arborist trees at authored per-tree scale amplified by their own factor (~50 ft "lamps in the air" symptom from the 2026-05-13 brief). The billboard ShaderMaterials (`glowMat`, `haloMat`, `bulbMat`) in `StreetLights.jsx` bypass three's standard project_vertex chain, so they pick up the lift directly in `BILLBOARD_VS_INC` (`_bbCenter.y += texture × uExag` in world space, no scale division needed) and the lantern glow tracks the lamp post.

**Coverage parity.** Every ground-anchored consumer patches:
- Ground (`BakedGround.GrassMesh` + `FadeMesh`): `patchTerrain({ perVertex: true })`.
- Walls (`LafayetteScene.Building`, both branches): `patchTerrainAtCentroidRaw(mat, meanCornerRaw)`.
- Foundations (`LafayetteScene.Foundations`, merged mesh): per-vertex `aCentroidY` attribute (preserved through `mergeBufferGeometries` — extended 2026-05-14 to copy aCentroidY) + onBeforeCompile that adds `aCentroidY × uExag` to `transformed.y`.
- Lamps (`StreetLights`): `patchTerrainInstanced` on the GLB material; pool/base ShaderMaterials sample world-space; billboards lift via `BILLBOARD_VS_INC`.
- Trees (`treeAtlasMaterial`): `patchTerrainInstanced` chained after `injectFoliageSway` (instance matrix is T×R only, scale is baked into the GLB at Arborist publish time, so the Y-scale divide is a no-op for trees).
- Park items (`LafayettePark`): per-item terrain — paths/water/banks/island via per-pond `<PondGroup>` rigid lift; fence posts/rails via `patchTerrain` rigid (each mesh's own world origin); labels via `<ElevatedGroup>` (per-text `useFrame` lift at the label's XZ).

Anything mounted at the ground and missing patchTerrain in some path will visually de-couple from the heightfield. When auditing a new mesh, the question is "what's its anchor, and does it use the shared `uExag`?"

**Ground triangulation density.** Per-vertex `patchTerrain` samples the terrain texture at each baked vertex; fragments interpolate linearly between them. If a face polygon's triangulation has block-corner-only vertices (~50 m apart), the interior fragments interpolate across a span where the heightfield actually curves — and finer overlays (asphalt centerlines, foundation anchors, paths) computed against the real heightfield diverge from the face's rendered Y by however much the curve deviates from the linear interp. At LS scale that was 1–2 m of raw mismatch → 3–5 m of visible artifact under V_EXAG=1.5–1.8 (foundations "way too tall" on apparently-flat blocks, paths "in midair" relative to grass).

The fix is **bake-time triangulation refinement**: `cartograph/bake-ground.js`'s `triangulateAndRefine(outer, holes, maxEdge)` iteratively splits any triangle whose longest edge exceeds `maxEdge` into 4 child triangles via midpoint subdivision (midpoint cache shared across adjacent triangles → no T-junctions). Face groups + landscape overlays (parking_lot, garden, playground, swimming_pool, pitch, sports_centre, wood, scrub) emit at `maxEdge = 15 m` (≈3× the terrain texture's 5 m spacing — caps per-fragment interpolation error around 0.45 m raw / 0.7 m visible at V_EXAG=1.5). Ribbon bands (asphalt, curb, sidewalk, treelawn variants, footway, path, alley, etc.) skip refinement — their authored centerline density already matches the texture. Total LS ground vert count went from ~50 k to ~395 k; bin from ~1 MB to ~12 MB. Higher `maxEdge` cuts size more aggressively at the cost of interpolation accuracy; `REFINE_MAX_EDGE_M` in `bake-ground.js` is the tuning point.

### Frustum culling must be disabled on GPU-displaced meshes (2026-05-14)

`patchTerrain*` displaces vertices in the GPU vertex shader, but three.js's frustum culler checks the geometry's `boundingSphere` — computed once at construction from the *un-displaced* positions (typically Y=0 base). Once the camera moves so the stale sphere falls outside the view frustum, the mesh gets culled even though the actual displaced geometry is still on-screen — visible as "buildings popping out as I scroll past." Fix on `LafayetteScene.jsx`'s Building + Foundations meshes is `frustumCulled={false}`. The alternative — manually updating `boundingSphere` after each `uExag` lerp — is more code for the same effect. Any new mesh that uses `patchTerrain*` and displaces meaningfully should disable frustum culling.

### MapLayers `ground` mesh must NOT render in shot mode (2026-05-14)

`MapLayers.jsx` renders a full-LS-bbox `ground` plane (color `layerColors.ground = '#2A2826'`, near-black) at Y=-0.08 with ~25 m segmentation per-vertex terrain. In Designer mode that's the neighborhood base. **In shot mode** (Stage, Preview), `BakedGround` paints the full slab at finer-than-25m-when-refined triangulation — the MapLayers ground plane would sit on top of grass faces at Lafayette Park (terrain bulge interpolation differential ~14 m higher than face polygon's block-corner interp) and paint matte black over the grass procedural shader. Symptom we hit 2026-05-14: at Hero, grass invisible; at Browse (uExag → 0), grass "fills in like green liquid" as both planes flatten to coplanar and renderOrder + polygonOffset put face park on top. Fix: `SHOT_SKIP` set in `MapLayers.jsx` now includes `'ground'`. Any future `MapLayers` layer that duplicates a BakedGround group needs the same skip.

### Server changes require a `cartograph/serve.js` restart

`cartograph/serve.js` runs as a long-lived Node process (`carto` in `npm run dev`). Edits to its bake-endpoint chain, dirty-check logic, or any other server code are *not* picked up until the process restarts. The browser-side and the bake scripts (`derive.js`, `bake-ground.js`, etc.) are loaded fresh on each request / each `node X.js` invocation, so they auto-pick-up edits — but `serve.js` is the exception. If you change `serve.js` and don't restart, the Bake button keeps running yesterday's chain.

**Diagnostic:** compare the carto server's process start time (`ps aux | grep cartograph/serve`) to `serve.js`'s mtime (`stat -f %Sm cartograph/serve.js`). If file mtime > process start time, the server is stale — restart it. This bit us 2026-05-04 *twice in one session*; if the symptom is "my Designer edit doesn't appear after Bake," check process age before going on a tour of dirty-checks and cache-busts.

### `ribbons.streets[].highway` carries OSM class through (2026-05-09)

Every emitted street entry in `ribbons.json` now carries two class fields:

- `highway` — the raw OSM tag (`motorway`, `motorway_link`, `trunk`, `primary`, `secondary`, `tertiary_link`, `residential`, `service`, `unclassified`, …). This is the value any AASHTO/NACTO-keyed lookup should use (e.g., `intersectionGeometry.js:cornerRadiusFor` keys on raw class).
- `type` — the normalized streetProfiles vocabulary (`motorway` / `motorway_link` / `trunk` / `primary` / `secondary` / `service` / `footway` / `cycleway` / `pedestrian` / `steps` / `residential`). This is what `streetProfiles.defaultMeasure` and width-default code paths consume.

Both fall back to `'residential'` when the source tag is missing, so any consumer can rely on a defined value. The mapping lives in `derive.js:mapHighwayToStreetType`.

LS distribution as of this writing: 143 residential, 32 motorway_link, 23 motorway (I-44 main), 17 primary, 17 secondary, plus assorted tertiary/service/unclassified. Future neighborhoods will shift the mix; no class is assumed to be present.

Before this fix, both fields were absent from output and every chain fell through to residential corner-radius defaults — motorway crossings rendered with 4.5m corners. If a downstream consumer ever stops seeing the field, the most likely regression is in `derive.js`'s output-serialization map (`streets: ribbonStreets.map(st => ({...}))`) — fields that aren't whitelisted there get stripped.

### Survey/Measure operator-intent flows through `overlay.json`, not `centerlines.json`

This is the bug-magnet that's burned hours twice now. Survey + Measure tools save to `cartograph/data/clean/overlay.json` (skelId-keyed: `measure`, `segmentMeasures`, `capStart`/`capEnd`, `anchor`, `couplers`). The Designer runtime merges overlay into the live street list via `useCartographStore.js:_loadCenterlines`. The bake pipeline (`derive.js`) reads skeleton + raw/centerlines + raw/measurements + osm/elevation — and as of 2026-05-04 *also reads `overlay.json`* (after a fix). If the bake ever stops reflecting Designer Preview edits, the first thing to check is whether `derive.js`'s overlay merge is still in place. Legacy `cartograph/data/raw/centerlines.json` is fallback only (matched by name, used to seed older streets that don't have skelId entries yet).

### Divided-road inner-edge anchor — opt-in "paired-with-median" authoring mode

Divided roads stay as TWO separate centerlines per the locked positive-carriageway model — no pair synthesis, no median couplers, no collapse to a single spine. Each carriageway's chain carries `anchor` (`'center'` | `'inner-edge'`), `innerSign` (±1; which perpendicular side faces the median), and `pairId` (matches its mate). Skeleton emits these via the phase-aware welder; derive passes them through to ribbons.json untransformed.

**`anchor: 'inner-edge'` is an authoring mode, not a geometry override.** The chain stays at carriageway center (skeleton's OSM way center). The flag does three things:
1. Flips the chain's `measure.symmetric` to `false` (so dragging the outboard handle stops mirroring inboard — operator authors per side independently).
2. Seeds `inboard.pavementHW = 0` on flip — visible feedback that the mode took effect; operator can widen inboard from there to eat into the median.
3. The runtime `innerEdgeMeasure` helper zeroes the inboard ped zone (`treelawn`, `sidewalk`, `terminal`) so no sidewalk renders along the median. Pavement + curb stay whatever the operator has authored.

**Median emerges by construction**, never authored. The polygon between paired carriageways' chains, minus each carriageway's inboard pavement HW, IS the median (already produced by derive). If the gap can't accommodate one (operator drags inboard pavement wide enough to close the median, or the chains start too close), no median renders — free.

**Pair-aware authoring.** `useCartographStore.setAnchor` mirrors the anchor flip onto the pair mate (`pairId` carries the mate's `skelId`, not a shared pair-group identifier — look up via `s.skelId === st.pairId`). The flip transform applies to BOTH chains' `measure` AND every entry of `segmentMeasures`. Width authoring stays per-carriageway (asymmetric real-world cases like S Jefferson 7.72 / 9.16m).

**Asymmetric and Inner-edge are independent operator concepts** (the streets around the park are asymmetric-center-aligned — a valid combination authored via the MeasurePanel "Asymmetric" checkbox alone, no anchor change). `setAnchor` never clobbers operator-authored asymmetric values:
- Flip TO inner-edge from symmetric: applies the `symmetric: false` + inboard-seed transform.
- Flip TO inner-edge from asymmetric: anchor only; measure preserved (operator's per-side authoring is intentional).
- Un-flip TO center: detects the unmodified inner-edge footprint (symmetric=false AND inboard `pavementHW` exactly 0) and cleans up by restoring `symmetric: true` + mirroring outboard onto inboard. Anything else (operator widened inboard from zero, or had pre-existing asymmetric) → measure left alone.

**Single transform site for the ped-zone zero (2026-05-14).** `buildBlockGeometryV2` (`src/lib/buildBlockGeometryV2.js` ~line 1295) applies `innerEdgeMeasure` to every chain whose `anchor === 'inner-edge'` at the top of the function — `street.measure` AND each entry of `street.segmentMeasures`. Both consumers (`bake-ground.js` and Designer's `BlockGeometryV2Debug.jsx`) inherit; no per-call-site audit needed. `MeasureOverlay.jsx:360` calls `innerEdgeMeasure` separately for the operator's drag-handle preview.

### Algorithm drift between live live-render and offline ground bake — resolved

**Face-clip layer: consolidated.** The face-clip algorithm lives in `src/lib/ribbonsGeometry.js` (`buildRibbonGeometry(ribbons, stencilPolygon)`). Today `cartograph/bake-ground.js` is the sole consumer (the historical `src/components/StreetRibbons.jsx` live-render path was retired during the V2 migration; chain-rectangle live rendering is now done by V2's `src/cartograph/BlockGeometryV2Debug.jsx` against block-edge-owned geometry, not by re-using the face-clip helper). The legacy `bake-paths.js` was retired (alleys/paths now flow through `bake-ground.js` via the same shared geometry pipeline).

**Ribbon-stripe layer: never drifted.** Both sides already use `sideToStripes` from `src/cartograph/streetProfiles.js` — same source.

**Hole-handling caveat:** `buildRibbonGeometry` returns face data with explicit `{outer, holes}` topology. The bake honors holes; the live render currently flattens to `outer` only because `THREE.Shape` in `faceMeshes` doesn't consume the holes array. Visually identical to old behavior; if face-with-hole geometry ever needs to render correctly in Designer, update `faceMeshes` to pass holes through to `THREE.Shape.holes`.

**Designer-toggle ↔ bake parity (2026-05-05).** Every Designer-Panel toggle now has a matching bake group. `bake-ground.js` reads `map.json` directly for sub-block polygon overlays (`parking_lot`, leisure subtypes, natural subtypes) and buffers polylines (`stripe`, `edgeline`, `bikelane`, barriers) into thin polygons, so what the operator hides in Designer is what's hidden in Stage/Preview. Color resolution in the bake routes through `BAND_TO_LAYER` and `design.json`, so authored Look colors reach all groups (no more `BAND_COLORS` defaults masking operator overrides).

**Bake pipeline scene-parametric on the ground bake (2026-05-13).** `bake-ground.js`'s stencil is no longer hardcoded LS — `loadSceneStencil(scene)` reads `cartograph/data/<scene>/neighborhood_boundary.json` and falls back to nulls when absent. When the boundary file omits `fade` / `streetFade` fields (toy), the bake emits `manifest.stencil = null` and BakedGround skips the radial-fade shader. Ribbons input is also scene-keyed (LS uses `src/data/ribbons.json`; other scenes use `src/data/<scene>/<scene>-ribbons.json`). `bake-buildings.js` and `bake-lamps.js` accept `--scene` but ignore it pending the toy publish session — they're still LS-hardcoded under the hood.

**Stage / Preview lamp parity (2026-05-13).** `BakedLamps` lives in `src/components/` and is shared by Stage and Preview. LS Stage mounts `<BakedLamps />` instead of `<StreetLights />`; both surfaces fetch `/baked/<look>/lamps.json` from the same artifact, with cartograph-store `bakeLastMs` cache-bust so Stage's "↻" propagates without a hard reload. Toy Stage retains its `<StreetLights lamps={toyLamps.lamps} />` placeholder until the toy-data session.

**Buildings on Stage stay live (intentionally, 2026-05-13).** `LafayetteScene` reads `_allBuildings` from `src/data/buildings` for per-building interactivity (place state, neon, click handlers — these are downstream LS-app concerns that don't survive a merged-mesh bake). Neon specifically draws from active data, so the live-data path is currently load-bearing. Preview consumes the same authored source via `bake-buildings.js`'s merged opaque mesh for GPU-perf proof. Both consume the same authored data; they project it into two runtime shapes for two roles. NOT a Stage/Preview divergence — a deliberate split. **Side-burner until product port:** revisit when porting the LS app and place-state architecture; that's when the decision becomes load-bearing.

**Neon renderer (2026-05-13 → 2026-05-16, IN-FLIGHT REWRITE — see BACKLOG 2026-05-16).** `src/components/NeonBands.jsx` renders one merged shader mesh per scene (Path B, swapped in by `20ef7b1` replacing the per-Building inline `NeonBand`). **Current Stage mount is the fresh `NeonBandsV2.jsx`** running alongside v1 pending hero/browse-camera verification — this entry below still describes the v1 4-facet diamond / `neonTube` channel arrangement and will be rewritten once v2 is excised. v2 uses a full circular cross-section (8 facets), per-footprint PIP-probe winding detection, DoubleSide rendering without the fragment shader's `gl_FrontFacing` normal flip (so back faces fall to bleed-only dim glow → omnidirectional emissive look). Geometry: 4-facet diamond tube along the building footprint, offset `OFFSET_OUT=0.08m` outward; convex corners get arc-segment rings to keep offset uniform. Shader: AdditiveBlending, `toneMapped:false`, three Gaussian masks (core / tube / bleed) sampled by `r = 1 − dot(N, V)` and fed by `_neonUniforms.{coreUniform, tubeUniform, bleedUniform}` — the same uniforms Cartograph's `NeonPump` writes from the Sky & Light Neon channel per frame, and that production reads once via `useSceneJson(lookId)` from `scene.json.neon.values`. Toy mounts `<NeonBands forceOn />` directly; LS production mounts `<NeonBands places={openPlaces} lookId={INSTANCE.lookId} />` (open-by-hours filter on `neonTick` cadence). **Tube physics are now operator-authored** (`fba7047`): the formerly-provisional `TUBE_RADIUS` / `ROOF_LIFT` / frag-shader emissive constants live in the cartograph store as the `neonTube` channel (`{tubeRadius, roofLift, emissive}`, flat-value, non-TOD-animated). Stage Sky & Light gains three sliders + a Stage-only "Force Neon On (test)" checkbox (session-only state, not serialized) that bypasses the `openPlaces` business-hours filter for Stage QA. Operator drags → `useMemo` rebuilds the merged tube geometry on radius/lift change; emissive writes per-frame via uniform. The `[neon-diag]` and `[neon-pump]` console diagnostics + `window.__neon` global were stripped in the same commit (revert audit of `c6eea07` + `9906b58`). Defaults flipped to flat-on `{core: 1, tube: 1, bleed: 1}` (`d483151`) — both shipped Looks already authored 1/1/1; HANDOFF-neon.md documented Night as "core full, tube full, bleed full"; visibility is gated by `openPlaces`, not the intensity envelope.

**Non-street ribbons via shared helper (2026-05-13).** Alleys + footways + cycleways + steps + dirt paths went missing in Designer when V2 took over the live render — MapLayers retired its alley/footway block 2026-04-22 expecting the retired `StreetRibbons` V1 to own them, but V1 isn't mounted anywhere anymore (the file is deleted). Fixed via `src/lib/buildPathRibbons.js` — Clipper-based polyline offset with `jtRound` joints (no self-intersection at sharp bends, `ArcTolerance=25` ≈ 2.5cm for visibly smooth arcs). Both `cartograph/bake-ground.js` and `src/cartograph/BlockGeometryV2Debug.jsx` consume the same helper, so Designer and slab cannot drift. Paths clip to **parcel interiors** = `blocks[].ring − curbBands − frontageBands` (treelawn ∪ sidewalk rings), so they terminate at the sidewalk's inner edge rather than riding over the ped zone or curb stroke. See `feedback_designer_ylift_stacking` and `project_v2_block_ring_extends_to_asphalt` memory entries for the two non-obvious gotchas that bit during implementation.

**Universal alley end-cap dial (2026-05-13).** Designer Panel → Paths → Shape subsection has a 3-segment toggle that controls how ALL alleys in the active Look terminate. Three modes mapped to Clipper's open-polyline end types plus a fillet trick: `square` = `etOpenButt` (flush cut); `rounded` = `etOpenSquare` + morphological-opening fillet by `halfWidth × 0.4` (rounded-rectangle pad); `round` = `etOpenRound` (true semicircle). Stored as `design.alleyCap`, autosaves via the store; bake reads it. Other path kinds (footway/cycleway/steps/path) use per-kind defaults (`round`) and don't carry an operator surface — they're typically organic / blending into other paths so a universal authoring dial isn't needed yet.

**Corner-pad geometry is owned by V2 (2026-05-09).** `buildBlockGeometryV2` emits both the rounded asphalt silhouette (`asphaltRounded`) and the per-corner concrete pads (`cornerSidewalkPads`) in one pass. The bake adapter in `cartograph/bake-ground.js` flattens them into the same `byMaterial` map the rest of the bake walks, and Designer's `BlockGeometryV2Debug` renders them directly from V2's named outputs. Earlier per-corner-annular-sector and IP-rule attempts have been retired; the V1 corner-management code paths (`buildCornerPlug`, `buildCurbAnnulus`, `intersectionGeometry.js`) were deleted in commit `0286cb1`.

**One V2 input is load-bearing:** `cornerSidewalkPads = cornerPadUnion ∩ blockRounded`, and `blockRounded = stencil − asphaltRounded`. If the caller passes `stencil: null`, blockRounded is empty and corner pads vanish. Both consumers now pass the same neighborhood-boundary polygon (bake-side via `STENCIL_POLYGON`, Designer-side via `LS_STENCIL` in `CartographApp.jsx`'s `SCENE_REGISTRY`). New scenes adding V2 must register a stencil or pads won't render — even though every other piece (asphalt, curb, bands) renders fine without one.

### V2 curb is the unifying boundary stroke (2026-05-08)

In the rounded-block-clip model (V2 — `src/lib/buildBlockGeometryV2.js`), the **curb is the edge that separates asphalt from block**. It's not a per-side rectangular band like V1's curb stripe — it's a single continuous stroked polygon per block, derived directly from the rounded asphalt boundary that the corner geometry is already built on.

```
curb = dilate(asphaltRounded, CURB_WIDTH) − asphaltRounded
```

Read this as: the curb is the asphalt's silhouette, painted in width `CURB_WIDTH`, on the block side. Because `asphaltRounded` already carries the rounded corners (from the corner-radius authoring kit) and the cap shapes (from Survey: round / blunt / none), the curb honors all of them automatically. There is no separate corner-curb pass and no separate cap-curb annulus — one offset op covers every silhouette V2 produces.

What the curb traces:
- **On chain sides:** the asphalt edge running parallel to the centerline at `pavementHW`. This is the place V1 emits the per-side curb stripe; V2's curb covers it as part of the unified stroke.
- **At intersections:** the rounded asphalt corner. The corner-radius authoring kit (`cornerRadiusScale`, per-IX overrides, per-corner overrides) shapes `asphaltRounded`; the curb inherits that shape with no extra plumbing.
- **At dead ends:** whatever silhouette Survey + Measure authored. Round-capped end → round curb. Flat / blunt end → straight curb across the end. "None" / open end is the underauthored case (asphalt still closes structurally; if a true open dead-end is needed it requires unclosed asphalt geometry, which neither V1 nor V2 emit today).

Because curb width is global (one `CURB_WIDTH` constant — per-side `side.curb` overrides aren't supported in this model), the dilation produces a constant-width band with no seams. The other strip bands (treelawn, sidewalk) are emitted by **polygon-walking the block rings** (D.3c, 2026-05-10): for each ring in `blockSharp`, walk vertices, identify block corners by per-vertex turn angle, emit one band ring per block-edge by parallel-offsetting the block-edge polyline INWARD into the block. ONE ring per band per block-edge — chain-IX vertices that don't change block direction are interior to the polyline (no seam). Customs are keyed by `[blockKey][edgeOrd]` (D.5/D.6) — operator authors per block-edge; bands, plugs, and live drag preview all read the same identity. The unified curb stroke sits on top at render priority 6 (curb) > 5 (sidewalk) > 3 (treelawn).

**Don't rebuild this as per-side rectangles.** If a future task ever needs to vary curb width per side, the right move is to emit per-side curb sectors and *union* them with the global stroke, not replace it.

The principle in plain words: in V2, the silhouette of the asphalt — wherever it goes, however the corners and caps are shaped — IS the curb's path. Survey + Measure author the silhouette; the corner editor refines it; the curb traces it.

### Park paths auto-detect over-water bridges (2026-05-13)

`park_paths.json` has no `bridge` tag — every path is a flat polygon. `LafayettePark.jsx`'s `ParkPaths` partitions paths at mount-time: for each path, sample segment midpoints; if a majority fall over water (`lake.outer` minus `lake.island`, or `grotto`), classify the path as a bridge and render it at `PATH_BRIDGE_Y` (0.5) — clears the water surface (0.35) and the lake island top (0.4). Non-bridge paths render at `PATH_LAND_Y` (0.4). Path material carries `polygonOffset: factor=-1, units=-1` so the lake-perimeter path stops z-fighting with the bank at the shoreline.

A manual `bridge: true` per-path flag could ride on top of this later if auto-detection ever guesses wrong; no current path needs it.

### Two sources of water/lamps existed; deduped

The cartograph derive pulls OSM water and street lamps; the Python ETLs also produce `park_water.json` and `street_lamps.json`. Both versions used to render, causing visible double-outlines. As of 2026-05-04: `MapLayers.jsx` skips OSM water (`use === 'water'`) in the natural layer and skips `mapData.layers.streetlamp` in lamps. `park_water.json` and `street_lamps.json` are canonical.

### Arborist is the only tree-placement authority

`src/components/MapLayers.jsx` reads `park_trees.json` directly for the Designer-only flat tree dots. Stage / Preview / production read `public/baked/<look>.json` (the arborist's `bake-trees.js` output — `default.json` for the default Look, `lafayette-square.json` for LS, etc.) for InstancedTrees. The Arborist's Grove drives **roster** per Look (which species/variants ship into each Look's atlas + appear via substitution); placements stay universal. Per-Look config covers both the *roster* (`design.json#/trees`) and the *atlas* (textures); placements come from `park_trees.json` and don't change between Looks.

### Legacy `cartograph/render.js` knobs are NOT wired into JSX Designer

The pre-JSX SVG-rendered Designer (`cartograph/render.js`) still exists and contains authoring controls — most notably the `sv-smooth` slider (`render.js:1339`) plus tension/Catmull-Rom plumbing (`smoothPolyD`, `smoothLineD`, `smoothPolyline`). These are dead code from the live authoring path's perspective: the JSX Designer (`src/cartograph/`) does not read them. If you see "Smooth" referenced in render.js and assume it's wired through to current authoring, you will be wrong. The JSX path needs a parallel implementation. Tracked via Survey polish Phase 7.

### Loop streets — in-flight L.0–L.6 (see BACKLOG)

The V1 `LOOP_STREET_NAMES = new Set(['Benton Place', 'Mackay Place'])` at `cartograph/derive.js:1297` is wrong on two counts and dead on a third: **Mackay is not a loop street** (just a normal residential), **Waverly Place is** (and the V1 code path can't represent its divided-couplet topology at all), and **all of derive.js's loop-cut + median-creation paths are dead in production** post the V2 migration — `bake-ground.js` reads block geometry from `buildBlockGeometryV2` against `ribbons.json` and only consults `map.json` for sub-block overlays.

Full spec + phasing in `cartograph/BACKLOG.md` "Loop streets (L.0 through L.6, in flight)"; canonical algorithm in `cartograph/NOTES.md` 2026-05-10 "Loop streets: L.0 architecture lock". Three topologies in scope: Type A teardrop (stem + closed body — Benton), Type B couplet (parallel one-way carriageways enclosing a face, with optional bare cut-thru — Waverly), Type C pure ring (none observed yet). Per-chain `loop: { loopId, role }` flag denormalizes the canonical `overlay.loops[]` list; auto-detect runs in the pipeline, operator override via Survey UI is the safety valve. L.6 deletes `LOOP_STREET_NAMES` + dead V1 paths and migrates this section into a full FEATURES entry.

### The bake is for mobile delivery

The reason the bake pipeline exists is to flatten the runtime to as few files as possible with as light a footprint as possible. First-paint cost on a mobile device is the optimization target. Authoring environments can afford live re-render; production/Preview can't.

---

## Pointers

- `ARCHITECTURE.md` — file layout, publish-loop pattern, which helper publishes what
- `README.md` — dev setup, ports, scripts
- `cartograph/BACKLOG.md` — current punchlist (cartograph/Stage/Arborist work in flight)
- `cartograph/NOTES.md` — historical decisions, ribbons phase records
- `arborist/SPEC.md` — tree library / atlas / variant rating
- `meteorologist/SPEC.md` — clouds & weather authoring
- Project memory `~/.claude/projects/.../memory/MEMORY.md` — running collection of "don't forget" items per session
