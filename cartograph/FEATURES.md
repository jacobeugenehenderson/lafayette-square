# Features & Roles

Read this first if you're new (human or agent). It's the product orientation doc — what the thing is, what each part is for, and the load-bearing decisions that shape why the code looks the way it does.

> Part of the **cartograph trinity** (`cartograph/FEATURES.md` / `cartograph/ARCHITECTURE.md` / `cartograph/BACKLOG.md`). Read at session start; flag contradictions during work; update at session end. Goal: keep this doc pristine and current. Stale claims are worse than no claims — they actively mistrain readers. The LS consumer app has its own parallel trinity under `ls/` — see root `README.md` for the index.

For *file layout* and the publish-loop pattern, see `ARCHITECTURE.md` (this directory). For *dev setup*, see the root `README.md`. This doc is conceptual.

---

## Architecture in one paragraph

Cartograph + Stage produce a **slab** — a baked, flattened, fortified, secure, optimized artifact under `public/baked/<look>/` — that the LS app builds on top of like a building on a foundation. Authoring is slow, careful, fortification work; the slab is fast, dumb, impenetrable substrate that the LS app trusts unconditionally. **Preview** is the slab inspection environment, used during authoring to stress-test the slab (GPU profiler, phone-aspect frame, per-layer cost matrix) before handing it off. The LS app and its end-user-facing features (place cards, businesses, accounts, etc.) live downstream — outside the cartograph repo today, but bundled with the slab at deploy time.

The architecture is the deliverable. Lafayette Square is the v1 instance. Other neighborhoods will pour their own slabs from the same toolkit; other operators will do the pouring. Every design decision in this codebase is in service of that kit ambition.

## The conceptual model

Cartograph is recursive. Each authoring step makes a truth-claim that the next builds on:

- **centerlines** (Survey) → *provable truth*: streets exist here, with this geometry
- **+ thickness** (Measure) → *provable truth*: this street is N meters wide on each side
- **+ dimension** (ribbons) → *emergent*: 3D cross-section per street
- **+ finish** (Stage) → *authored*: materials, palettes, lighting, sky

**Designer is fortification, not invention.** Operator splits, defines, classifies, marks caps and couplers — against aerial-photo ground truth — but doesn't author geometry. *All* "other" data (buildings, parcels, landmarks, land use) flows through Designer for the same fortification treatment. Designer's job is to harden the layout into something the slab can be poured around.

**Stage is the second authoring environment** — the *theatrical* sense of "stage." Where the look gets staged: materials, palettes, lighting, sky, post-FX. The operator's design work, finalized into the slab when they hit Bake.

**The Bake is the slab pour.** It IS the publish moment for cartograph — but the artifact ships to the LS app, not directly to end users. Live deployment is downstream, bundling the slab with the LS app shell.

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

Resolution at render time: per-corner override → per-IX override → data-table default, all × global scale. Authoring semantics: dragging the global slider *resets* both override maps on commit (operator's mental model: "scale all corners together to this × default"); dragging an IX center handle *resets* per-corner overrides at that IX only on commit (homogenizes the IX); per-corner drags just write a single override. All three layers persist per-Look to `design.json`. Per-corner identity uses leg-pair keys (`<skelIdA>:<dirA>|<skelIdB>:<dirB>`) so authoring survives chain-edit churn at the IX. Bake reads the same maps, so Stage / Preview pick up authored corners on next re-bake.

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

- **Arborist** (`/arborist.html`) — tree species library and Grove (visual gallery). Operator browses, rates, and curates GLB tree variants. Bakes `public/baked/default.json` (tree placements with assigned variants) consumed by `InstancedTrees`. Tree placements come from `src/data/park_trees.json` (Python ETL, point-in-polygon-filtered against the real park boundary). The arborist is the single source of truth for what trees appear; it runs across all Looks (per-Look only changes the bark/leaves *atlas*, not which trees go where).
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
cartograph/data/raw/
  ├── osm.json                  ← node cartograph/fetch.js (one-time)
  ├── elevation.json            ← cached USGS pull
  ├── centerlines.json          ← legacy file (name-keyed); Survey wrote here historically
  └── measurements.json         ← Measure tool writes
cartograph/data/clean/
  ├── skeleton.json             ← node cartograph/skeleton.js (derived from osm.json)
  └── overlay.json              ← Survey + Measure tools write (skelId-keyed operator-intent: measure, segmentMeasures, capStart/End, anchor, couplers)

scripts/raw/
  └── lafayette_park_trees.json ← city forestry data

src/data/  (some hand-authored, some Python ETL output)
  ├── park_trees.json    ← scripts/12-process-park-trees.py
  ├── park_water.json    ← hand-authored (initial commit, OSM-derived)
  ├── park_paths.json    ← scripts/14-process-park-paths.py
  └── street_lamps.json  ← scripts/13-fetch-street-lamps.py

public/looks/<id>/design.json   ← Stage panels write per-Look styling

[Pipeline]
node cartograph/pipeline.js     → cartograph/data/clean/map.json
node cartograph/promote-ribbons.js → src/data/ribbons.json

[Bakes — POST /api/cartograph/looks/<id>/bake]
  pipeline.js                              ← only if raw inputs are dirty
  promote-ribbons.js                       ← only if map.json is dirty
  bake-ground.js                 → public/baked/<id>/ground.{json,bin}
                                   (reads ribbons.json + map.json + design.json
                                    so every Designer toggle becomes a baked
                                    group with the Look's authored color)
  bake-buildings.js              → public/baked/<id>/buildings.{json,bin}
  bake-lamps.js                  → public/baked/<id>/lamps.json
  bake-scene.js                  → public/baked/<id>/scene.json
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
- If you write a custom shader (`makeGrassMaterial`, water ripples, gravel paths), set a unique `customProgramCacheKey` on the material BEFORE any `patchTerrain` or other wrapper — otherwise three's program cache can silently collapse it onto another patched material's compiled shader. Saw this 2026-05-13 with the gravel path shader.
- Per-vertex `patchTerrain` adds depth-precision-sensitive shader code; wrapping a material with it can subtly affect distance-dependent sort even when `terrainExag = 0`. For features that should ride the terrain rigidly (the whole Lafayette Park group), prefer a single per-frame group-position lift (`group.position.y = getElevation(x, z) * terrainExag.value`) over patching individual materials.

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

### Algorithm drift between live live-render and offline ground bake — resolved

**Face-clip layer: consolidated.** The face-clip algorithm lives in `src/lib/ribbonsGeometry.js` (`buildRibbonGeometry(ribbons, stencilPolygon)`). Today `cartograph/bake-ground.js` is the sole consumer (the historical `src/components/StreetRibbons.jsx` live-render path was retired during the V2 migration; chain-rectangle live rendering is now done by V2's `src/cartograph/BlockGeometryV2Debug.jsx` against block-edge-owned geometry, not by re-using the face-clip helper). The legacy `bake-paths.js` was retired (alleys/paths now flow through `bake-ground.js` via the same shared geometry pipeline).

**Ribbon-stripe layer: never drifted.** Both sides already use `sideToStripes` from `src/cartograph/streetProfiles.js` — same source.

**Hole-handling caveat:** `buildRibbonGeometry` returns face data with explicit `{outer, holes}` topology. The bake honors holes; the live render currently flattens to `outer` only because `THREE.Shape` in `faceMeshes` doesn't consume the holes array. Visually identical to old behavior; if face-with-hole geometry ever needs to render correctly in Designer, update `faceMeshes` to pass holes through to `THREE.Shape.holes`.

**Designer-toggle ↔ bake parity (2026-05-05).** Every Designer-Panel toggle now has a matching bake group. `bake-ground.js` reads `map.json` directly for sub-block polygon overlays (`parking_lot`, leisure subtypes, natural subtypes) and buffers polylines (`stripe`, `edgeline`, `bikelane`, barriers) into thin polygons, so what the operator hides in Designer is what's hidden in Stage/Preview. Color resolution in the bake routes through `BAND_TO_LAYER` and `design.json`, so authored Look colors reach all groups (no more `BAND_COLORS` defaults masking operator overrides).

**Bake pipeline scene-parametric on the ground bake (2026-05-13).** `bake-ground.js`'s stencil is no longer hardcoded LS — `loadSceneStencil(scene)` reads `cartograph/data/<scene>/neighborhood_boundary.json` and falls back to nulls when absent. When the boundary file omits `fade` / `streetFade` fields (toy), the bake emits `manifest.stencil = null` and BakedGround skips the radial-fade shader. Ribbons input is also scene-keyed (LS uses `src/data/ribbons.json`; other scenes use `src/data/<scene>/<scene>-ribbons.json`). `bake-buildings.js` and `bake-lamps.js` accept `--scene` but ignore it pending the toy publish session — they're still LS-hardcoded under the hood.

**Stage / Preview lamp parity (2026-05-13).** `BakedLamps` lives in `src/components/` and is shared by Stage and Preview. LS Stage mounts `<BakedLamps />` instead of `<StreetLights />`; both surfaces fetch `/baked/<look>/lamps.json` from the same artifact, with cartograph-store `bakeLastMs` cache-bust so Stage's "↻" propagates without a hard reload. Toy Stage retains its `<StreetLights lamps={toyLamps.lamps} />` placeholder until the toy-data session.

**Buildings on Stage stay live (intentionally, 2026-05-13).** `LafayetteScene` reads `_allBuildings` from `src/data/buildings` for per-building interactivity (place state, neon, click handlers — these are downstream LS-app concerns that don't survive a merged-mesh bake). Neon specifically draws from active data, so the live-data path is currently load-bearing. Preview consumes the same authored source via `bake-buildings.js`'s merged opaque mesh for GPU-perf proof. Both consume the same authored data; they project it into two runtime shapes for two roles. NOT a Stage/Preview divergence — a deliberate split. **Side-burner until product port:** revisit when porting the LS app and place-state architecture; that's when the decision becomes load-bearing.

**Neon renderer — provisional tube physics (2026-05-13 evening).** `src/components/NeonBands.jsx` renders one merged shader mesh per scene (Path B, swapped in by `20ef7b1` replacing the per-Building inline `NeonBand`). Geometry: 4-facet diamond tube along the building footprint, offset `OFFSET_OUT=0.08m` outward; convex corners get arc-segment rings to keep offset uniform. Shader: AdditiveBlending, `toneMapped:false`, three Gaussian masks (core / tube / bleed) sampled by `r = 1 − dot(N, V)` and fed by `_neonUniforms.{coreUniform, tubeUniform, bleedUniform}` — the same uniforms Cartograph's `NeonPump` writes from the Sky & Light Neon channel per frame, and that production reads once via `useSceneJson(lookId)` from `scene.json.neon.values`. Toy mounts `<NeonBands forceOn />` directly; LS production mounts `<NeonBands places={openPlaces} lookId="lafayette-square" />` (open-by-hours filter on `neonTick` cadence). **Current provisional constants:** `TUBE_RADIUS=0.20m` (~8"), `ROOF_LIFT=0.30m`, frag-shader emissive `*4.0`. These guarantee LS-Browse/Hero/Street visibility while authoring controls are pending — see BACKLOG "Neon LS-scale visibility" pin. The shader's *aesthetic* was validated in toy (small + close-framed) but LS scale exposes sub-pixel coverage + 24-bit z-fight against rooftops; the chunky values clear both. `[neon-diag]` (LafayetteScene `openPlaces` console.log) and `[neon-pump]` (NeonBands useEffect console.log) are intentionally left live until the authoring pass lands.

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

`src/components/MapLayers.jsx` reads `park_trees.json` directly for the Designer-only flat tree dots. Stage / Preview / production read `public/baked/default.json` (the arborist's bake output) for InstancedTrees. The arborist's Grove drives all Looks — per-Look config covers the *atlas* (textures), not placements.

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
