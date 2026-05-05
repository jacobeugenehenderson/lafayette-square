# Features & Roles

Read this first if you're new (human or agent). It's the product orientation doc — what the thing is, what each part is for, and the load-bearing decisions that shape why the code looks the way it does.

> Part of the **trinity of working docs** (`FEATURES.md` / `ARCHITECTURE.md` / `cartograph/BACKLOG.md`). Read at session start; flag contradictions during work; update at session end. Goal: keep this doc pristine and current. Stale claims are worse than no claims — they actively mistrain readers.

For *file layout* and the publish-loop pattern, see `ARCHITECTURE.md`. For *dev setup*, see `README.md`. This doc is conceptual.

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

**Aerial toggle:** the toolbar's `Aerial` button replaces the SVG/curated background with the high-resolution photo (max-res, never shipped, no GPU concern). When a tool (Survey or Measure) is active *and* Aerial is on, Designer enters a focus mode: ribbon bands stay visible (the measurement targets), but the land-use face fills, all decoration in `MapLayers` (buildings, landscape, lamps, water, trees, labels, parking, barriers), and `DesignerArch` step aside so the operator can align directly to the photo without visual competition. Toggle Aerial off, or exit the tool, and full decoration returns.

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

The only legitimate uses of any rotation constant in the codebase are:
1. `LafayettePark.parkAxisToCompass(px, pz)` — a one-helper authoring shortcut for placing the four fence corners as axis-aligned `±a` and rotating them into their actual compass-frame positions. Could be replaced with hardcoded GPS lookups.
2. The Browse shot's `up` vector (Heading slider) — cosmetic screen orientation only.

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
  bake-ground.js + bake-paths.js → public/baked/<id>/ground.{json,bin}
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

## Known live architecture issues / load-bearing decisions

Decisions that affect how to think about new work:

### Bake artifacts are browser-cached; cache-bust signal must be unique per bake

`BakedGround` and `InstancedTrees` fetch `/baked/<look>/{ground,buildings,scene}.json` and `default.json` with `?t=${bakeLastMs}`. If the same `bakeLastMs` value is reused across bakes, the browser hits its HTTP cache and serves stale geometry — the bake artifacts on disk update, but the page doesn't see them. **`bakeLastMs` must be set to `Date.now()` on every bake completion**, not to the bake's duration. (Historical bug: `useCartographStore.js:runBake` used `r.ms` (duration) as the cache-bust signal; incremental no-op bakes returned identical small durations and the browser cached them. Symptom: "I edited X days ago, Designer shows it, Stage doesn't." Fixed 2026-05-04.)

### Bake handler blocks the cartograph event loop

`cartograph/serve.js`'s POST `/looks/:id/bake` runs each step via `execSync` — synchronous. The Node event loop is blocked for the entire duration of the bake. *No* other API request to the cartograph server (centerlines, overlay, measurements, anything) can be served while a bake is running. If a step hangs, the whole server hangs.

**Symptom:** every `/api/cartograph/*` request shows "Pending" in DevTools, including subsequent bake requests. Backlogged requests pile up and never resolve until the server is killed and restarted.

**Workaround today:** kill `node cartograph/serve.js` (the `carto` process) and restart `npm run dev`. Loses any in-flight bake progress.

**Real fix (task #23):** switch to `spawn` / `execFile` with Promises so the server keeps handling other requests during a bake.

### Server changes require a `cartograph/serve.js` restart

`cartograph/serve.js` runs as a long-lived Node process (`carto` in `npm run dev`). Edits to its bake-endpoint chain, dirty-check logic, or any other server code are *not* picked up until the process restarts. The browser-side and the bake scripts (`derive.js`, `bake-ground.js`, etc.) are loaded fresh on each request / each `node X.js` invocation, so they auto-pick-up edits — but `serve.js` is the exception. If you change `serve.js` and don't restart, the Bake button keeps running yesterday's chain.

**Diagnostic:** compare the carto server's process start time (`ps aux | grep cartograph/serve`) to `serve.js`'s mtime (`stat -f %Sm cartograph/serve.js`). If file mtime > process start time, the server is stale — restart it. This bit us 2026-05-04 *twice in one session*; if the symptom is "my Designer edit doesn't appear after Bake," check process age before going on a tour of dirty-checks and cache-busts.

### Survey/Measure operator-intent flows through `overlay.json`, not `centerlines.json`

This is the bug-magnet that's burned hours twice now. Survey + Measure tools save to `cartograph/data/clean/overlay.json` (skelId-keyed: `measure`, `segmentMeasures`, `capStart`/`capEnd`, `anchor`, `couplers`). The Designer runtime merges overlay into the live street list via `useCartographStore.js:_loadCenterlines`. The bake pipeline (`derive.js`) reads skeleton + raw/centerlines + raw/measurements + osm/elevation — and as of 2026-05-04 *also reads `overlay.json`* (after a fix). If the bake ever stops reflecting Designer Preview edits, the first thing to check is whether `derive.js`'s overlay merge is still in place. Legacy `cartograph/data/raw/centerlines.json` is fallback only (matched by name, used to seed older streets that don't have skelId entries yet).

### Algorithm drift between live `StreetRibbons.jsx` and offline `bake-paths.js` — partially resolved (2026-05-04)

**Face-clip layer: consolidated.** The face-clip algorithm now lives in `src/lib/ribbonsGeometry.js` (`buildRibbonGeometry(ribbons, stencilPolygon)`); `StreetRibbons.jsx`'s `clippedFaces` useMemo and `cartograph/bake-ground.js` both call it. Drift at the face layer is structurally impossible.

**Ribbon-stripe layer: never drifted.** Both sides already use `sideToStripes` from `src/cartograph/streetProfiles.js` — same source.

**Hole-handling caveat:** `buildRibbonGeometry` returns face data with explicit `{outer, holes}` topology. The bake honors holes; the live render currently flattens to `outer` only because `THREE.Shape` in `faceMeshes` doesn't consume the holes array. Visually identical to old behavior; if face-with-hole geometry ever needs to render correctly in Designer, update `faceMeshes` to pass holes through to `THREE.Shape.holes`.

### Two sources of water/lamps existed; deduped

The cartograph derive pulls OSM water and street lamps; the Python ETLs also produce `park_water.json` and `street_lamps.json`. Both versions used to render, causing visible double-outlines. As of 2026-05-04: `MapLayers.jsx` skips OSM water (`use === 'water'`) in the natural layer and skips `mapData.layers.streetlamp` in lamps. `park_water.json` and `street_lamps.json` are canonical.

### Arborist is the only tree-placement authority

`src/components/MapLayers.jsx` reads `park_trees.json` directly for the Designer-only flat tree dots. Stage / Preview / production read `public/baked/default.json` (the arborist's bake output) for InstancedTrees. The arborist's Grove drives all Looks — per-Look config covers the *atlas* (textures), not placements.

### Legacy `cartograph/render.js` knobs are NOT wired into JSX Designer

The pre-JSX SVG-rendered Designer (`cartograph/render.js`) still exists and contains authoring controls — most notably the `sv-smooth` slider (`render.js:1339`) plus tension/Catmull-Rom plumbing (`smoothPolyD`, `smoothLineD`, `smoothPolyline`). These are dead code from the live authoring path's perspective: the JSX Designer (`src/cartograph/`) does not read them. If you see "Smooth" referenced in render.js and assume it's wired through to current authoring, you will be wrong. The JSX path needs a parallel implementation. Tracked via Survey polish Phase 7.

### Loop street designation is hardcoded by name in `derive.js`

`cartograph/derive.js:1297` defines `LOOP_STREET_NAMES = new Set(['Benton Place', 'Mackay Place'])` and references it in 7+ places (block cutting at L1307/L1492, frontage gap patching at L1597/L1621, median generation at L1821, etc.). There is **no operator-facing affordance** to add a loop street; new ones require a code edit. Pending lift to `overlay.json` `isLoopStreet` flag (Survey polish Phase 5).

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
