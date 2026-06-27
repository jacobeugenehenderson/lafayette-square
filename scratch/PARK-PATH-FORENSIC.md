# PARK-PATH-FORENSIC — Phase 0 (read-only) findings

**Agent: Sorrel** (fresh). `curb-offset-draw`, 2026-06-27. Serves `HANDOFF-park-path-unify.md`.
Read-only — no code touched. Stop-and-flag before Phase 1, per the brief.

---

## Q1 — Where do park footways enter? → ✅ THE GOOD BRANCH

**Park footways are ALREADY in `src/data/ribbons.json` `.paths`.** The separate fetch + data file
are pure duplication and retire outright. Scope stays "unfork + reclip," NOT "merge a fetch."

Evidence:
- `ribbons.json` `.paths` = **345** paths `{name, kind, points, pavedWidth}` (no `osm_id`).
- Spatial test (compass→park-axis inverse of `parkAxisToCompass`, axis-aligned ±175 m):
  **76 paths fully inside** the park (≥90% pts) — kinds **footway 65, steps 8, path 3** —
  **14 straddlers** (short entrance stubs crossing the fence), 255 fully outside.
- `bake-ground.js:419` already **subtracts the park** from neighborhood paths
  (`luByClass.park`) and its comment says park paths "render gravel-shaded via
  LafayettePark.jsx — a baked duplicate pokes through." So today: bake excludes park,
  the **fork** (`park_paths.json` → private `buildPathRibbons`) renders them. That's the defect.

→ **`scripts/14-fetch-park-paths.{sh,py}` + `src/data/park_paths.json` retire.** No re-fetch.

## Q2 — Clip-region split → point-in-polygon, via the lib's `intersect`

- Partition: a path is "park" iff its geometry lies inside `park-polygon.json` (4-corner,
  tilt −9.2°, half-width 175 m). Point-in-polygon against the corner ring is robust and
  matches the existing `pointInRing` in the fork.
- **Recommended Phase-1 mechanism:** emit a dedicated park-path group in `bake-ground.js`
  via the lib's existing `intersect` option (`buildPathRibbons.js:119-147`), passing the
  **park-polygon corner ring** as the intersect region — the exact mirror of how
  neighborhood paths intersect `parcelInteriors` at `:422`. Neighborhood paths keep
  excluding the park; park paths get their own group. No double-render.

## Q3 — Gravel shader deps (Phase 3 scope, no surprises)

`pathMat` (`LafayettePark.jsx:300-407`) needs, to move into the path/material system:
- `uSunAltitude` ← `useTimeOfDay.getState().getLightingPhase().sunAltitude` (per-frame).
- `uLampMap` ← `getLampLightmap()` (already shared with StreetRibbons).
- `patchTerrain(mat, {perVertex:true})` — rides terrain across the 350 m extent.
- `customProgramCacheKey = 'park-path-gravel-v1'` — MUST stay unique or three collapses
  it onto another `terrain-vp-std` material (documented trap, `:396-401`).
- `polygonOffset` (-1/-1) so paths win over coplanar lake island / banks.
- Pure-procedural Voronoi/FBM in `vPathPos.xz` — no atlas/texture dep beyond the lamp map.

## Q4 — Rebuild risk → noted LOUD

Routing park paths re-runs `skeleton → pipeline → promote-ribbons` = regenerates ALL of
`ribbons.json`. Per `LOOP-STREETS §5`, loop renders **drift on rebuild even byte-identical**.
**Every rebuild phase needs an eye-check: Benton + Waverly + neighborhood paths un-regressed.**
`ribbons.json`, `park_paths.json`, `park-polygon.json` are all **clean** in git right now.

---

## ⚠️ FINDINGS BEYOND THE BRIEF — need a Jacob/Boz call before Phase 1

1. **WIDTH REGRESSION (eye-call).** Park-interior ribbon paths carry the *real OSM*
   `pavedWidth` = **1.524 m** (73 of them, 5 ft) / **1.219 m** (3, 4 ft). The fork
   **hardcodes 2.8 m**. The lib uses `p.pavedWidth`, so a naive unify renders park paths
   **~half as wide** (1.5 m vs 2.8 m). The brief already says "preserve 2.8 m as behavior"
   → confirms we need a **park-path width override** (per-kind or per-group), not the ribbon
   width. **Q for Jacob: keep the wide 2.8 m gravel feel, or adopt the real 1.5 m OSM width?**

2. **STEPS newly appear (8) inside the park.** The fork's Overpass query was
   `footway|path|cycleway` (0 steps → 99 footway + 3 path = 102). The main intake's
   `.paths` has **8 `steps` inside the ±175 box** the fork never rendered. Unifying will
   newly draw them. Need to confirm they're real park steps (grotto?) vs. building stoops
   caught by the bounding box. If unwanted → restrict the park clip to `footway`/`path`
   or eye-gate. (Steps are "Built" kind → Layer A only, per the brief's Phase 2 grouping.)

3. **Count delta 102 → 76 (+14 straddle).** Fork drew 102 (dedicated "within park" query);
   ribbons-inside is 76 + 14 straddle. The main skeleton chains/merges paths differently
   (and may split the perimeter ring). **Eye-gate that no genuine interior path is missing**
   post-unify (lake loop, grotto, monument walks).

4. **4A perimeter-ring detect.** The 14 straddlers are all short (2–5 pt) entrance
   connectors crossing the fence — the polygon clip trims them cleanly. The genuine
   **perimeter ring** lives inside the 76 (segments hugging the fence at radius ≈175 −
   inset). Detect it as segments within a small inset of the boundary and drop it (the
   ribbon system owns that sidewalk, per 4A-CONFIRMED). Eye-gate carefully — don't
   over-drop an interior path that runs near the edge.

5. **Runtime move.** Park paths render today via live `<ParkPaths/>` (`LafayettePark.jsx:917`),
   NOT the slab. Post-unify they become a baked group (`bake-ground` → `BakedGround`
   `isGroupVisible`). Phase 3 gravel must move onto the **baked-group material**, and the
   group gets a `layerVis` key. Bridge-Y lift (`PATH_BRIDGE_Y=0.5` vs land `0.4`) +
   `classifyBridgePath` (water-midpoint majority test) must be **carried into the unified
   path** so lake bridges still clear the water — bake-side or a runtime per-group Y.

---

## DECISIONS (Jacob, 2026-06-27)
1. **Width:** use **real OSM width** (1.524/1.219 m) to start. A width controller (per-kind or
   per-group dial) is a clean later add — don't build it now.
2. **Steps:** **show them.** They're real park staircases (6 deep interior near lake/grotto,
   2 at the south entrance). The fork never drew any (`highway=steps` excluded from its query).
   - **2a — flat now:** steps already flow through the lib + bake as a flat stone ribbon
     (`#A0907E`, `['mat','steps']`); unifying makes the 8 park steps appear for free.
   - **2b — REAL STAIRS = Phase 5** (Jacob excited). Render `steps` as tread/riser geometry off
     terrain elevation. Separate build, touches lib+bake for all ~36 steps. AFTER unify lands.

## SEQUENCING NOTE (Sorrel's call — flag at Phase 1 eye-gate)
The brief puts "stop subtracting the park at `bake-ground.js:419` + own clip group" in Phase 1.
But **bridges** (paths over the lake) need a Y-lift that flat baked rings draped on terrain can't
carry without bridge metadata in the slab — see finding #5. Lowest-risk decomposition:
- **Phase 1 = unfork the LIVE component in place:** `ParkPaths` reads `ribbons.json` `.paths`,
  clips to the park polygon via the **shared lib**, keeps the gravel material + `classifyBridgePath`
  + Y-lifts. Delete `park_paths.json` + `scripts/14` + the private `buildPathRibbons`. Drop the
  perimeter ring. **bake-ground keeps excluding the park** (no double-render; no bake change).
  This removes the fork's defect (own fetch / own data / own geometry fn) and hits the eye-gate.
- **Slab migration** (stop-subtracting + park-path baked group + bridge metadata in the slab)
  folds into **Phase 3**, alongside gravel→Stage, since both cross the same material/render boundary.
This keeps SHAPE kit-compliant now (one pipeline = `ribbons.json` via shared lib) and defers the
bridge-baking risk to where it's handled properly.

---

## PHASE 1 — LANDED (code + bake; awaiting Jacob's eye-gate)
Jacob's steers (2026-06-27): paths must ride the SAME ground layer stack as the ribbons (terrain) —
so park LAND paths are now **baked into the ground stack**, not a live overlay. Bridges folded into
Phase 5 (off-the-ground paths, with stairs). Real OSM width. "Paths are paths" — the lib offsets
open polylines with end-caps; only the park boundary is a closed clip region.

**What shipped:**
- `src/lib/parkPathClassify.js` (NEW) — `pointInRing/fracInRing/pointInWater/classifyBridgePath`,
  shared by the bake AND LafayettePark (one SSoT for the park-path partition).
- `src/lib/ringsToFlatGeo.js` (NEW) — shared rings→flat-mesh (designer's copy noted for later dedup).
- `src/components/gravelPathMaterial.js` (NEW) — the Voronoi gravel shader, shared by the baked
  `park-path` group AND the live bridge overlay.
- `cartograph/bake-ground.js` — emits a `park-path` group: land paths (bridge excluded) from
  `ribbons.paths` via the shared lib, clipped to the park polygon. PAINT_ORDER slot after `path`.
  Scene-keyed park-polygon + park_water load in `bakeGround()`.
- `src/cartograph/m3Colors.js` — `park-path` default color `#928a7c`.
- `src/components/BakedGround.jsx` — `GravelMesh` branch renders the `park-path` group with the
  gravel shader (rides terrain via patchTerrain like every ground group; own TOD uniform).
- `src/components/LafayettePark.jsx` — fork DELETED (private buildPathRibbons + ParkPaths + the
  `park_paths.json` import). New slim `ParkBridge` renders ONLY the lake bridge (1 path), lifted,
  from the same ribbons data via the shared lib + gravel material.
- DELETED: `src/data/park_paths.json`, `scripts/14-fetch-park-paths.sh`, `scripts/14-process-park-paths.py`.

**Validated (non-eye):**
- Bake ran clean: 24→**25 groups (+park-path)**, 2210 verts / 2242 tris, color #928a7c, renderOrder 23.
- Neighborhood unaffected: `footway` still present; `steps`/`path` groups were ALREADY empty in the
  committed slab (they clip to nothing on parcel interiors) — NOT a regression from this change.
- ⭐ Phase 1 re-runs ONLY `bake-ground` (reads existing `ribbons.json`) — it does NOT re-run
  skeleton→pipeline→promote, so **no loop-street drift risk this phase** (Q4 only bites on a
  ribbons rebuild, which Phase 2/5 may trigger).
- All edited/new files pass esbuild transform + node --check.

**EYE-GATE (Jacob, 2026-06-27): "Looks right."** ✅ Phase 1 confirmed in the lit app.

**Corner clip-relax (Jacob-requested follow-up, DONE):** Jacob noticed park paths stopped ~3 m short
at corners (a grass delta). Diagnosis: the OSM paths already run to the sidewalk (endpoints at
edge-dist ~−3), but my clip to the bare square polygon (edge-dist 0) cut them; the perimeter
sidewalk inner edge measures ~−2.7. Fix: `offsetClosedRing` (NEW in buildPathRibbons.js) relaxes the
clip region outward `PARK_PATH_CLIP_PAD_M=3` m with ROUNDED joins (no street-corner bleed);
membership stays the bare polygon. Re-baked: park-path min edge-dist −0.0 → **−3.0** (reaches the
walk). The forks at corners are REAL (38 OSM junction nodes), not artifacts.

**BACKLOG (deferred polish):** the flared entrance **apron/delta** where a park path meets the
sidewalk — IRL a paved triangular widening. Same shape as the streets' dead-end-mouth corner-wrap;
candidate as a real kit "path→sidewalk apron" feature, or Jacob's shader-flange idea. Not built.

Slab (`public/baked/*`) re-baked but must NOT be committed with my code.

---

## PHASE 2 — Layer-B per-kind sweep-smoothing (code done; awaiting eye-gate)
- `buildPathRibbons.js`: organic kinds (`footway`/`cycleway`/`path`) get a centerline bow via the
  SHARED `smoothChain` (centripetal Catmull-Rom, corners >30° pinned) applied on a copy before the
  Clipper offset; `PATH_SMOOTH=0.5` (~6 m spacing). BUILT kinds (`alley`/`steps`) untouched = Layer A
  only. Added `offsetClosedRing` export (Phase-1 relax) lives here too.
- ⛔ `STREET_SMOOTH` stays 0 — NOT reused. Path smoothing is safe where the curb isn't: paths use the
  robust Clipper offsetter, and `buildPathRibbons` never sees a street polygon.
- **Validated:** re-bake — asphalt/curb/sidewalk vert counts BYTE-IDENTICAL to HEAD (streets
  untouched); footway 2483→2873 (organic bow); park steps/alleys crisp. WYSIWYG: the live designer
  consumes the same lib so its path render bows identically.
- **Tunable:** `PATH_SMOOTH` is the gentleness dial — eye-gate the amount; lower if too wavy.

**⏳ EYE-GATE (Jacob):** park + neighborhood footways/cycleways/paths sweep gently around features;
alleys + park steps unchanged; streets visibly + numerically unchanged. Hard-reload.

---

## 2D VISIBILITY + TOGGLE WIRING (Jacob: "visible in 2D + wired to on/off toggles", DONE)
Park paths must show in the 2D cartograph AND gate off the on/off toggles. The in-place `park_path`
row was `kind:'material'` — color-only, **never gated** (CartographSurfaces §80: only layer/lu kinds
gate). Fixed + unified on ONE key `layerVis['park_path']`:
- `src/lib/parkPaths.js` (NEW SSoT) — `buildParkPathRings(ribbons,{polygon,water})` → `{land,bridge}`
  + `mergeRings`. The ONE place that partitions + clips park paths; consumed by the bake, the 2D
  Designer, and the bridge overlay (no drift).
- Bake group renamed `park-path` → **`park_path`** (matches the toggle id; convention = toggle id ===
  bake group id). bake-ground + m3Colors + BakedGround GRAVEL_MATERIALS all updated; bake re-runs
  via the shared helper.
- `BlockGeometryV2Debug.jsx` (2D) — renders `parkPathGeo` (shared builder on liveRibbons → flat
  gravel colour) in both path render blocks, gated `layerVis.park_path !== false`. WYSIWYG with bake.
- `LafayettePark.jsx` — bridge overlay now via `buildParkPathRings(...).bridge`, gated on the SAME
  `park_path` toggle (reads scene.layerVis).
- `CartographSurfaces.jsx` — `park_path` row `material`→**`layer`** (eye + colour → layerVis+layerColors).
- `Panel.jsx PATHS_DEFS` — added a **"Park Paths"** row (Design 2D panel, writes layerVis['park_path']).

**Validated:** re-bake clean, `park_path` group present (2706 verts, #928a7c); no leftover hyphen
group refs; colorFor('park_path')→#928a7c; all files esbuild-clean; no orphan imports.
**This also lands Phase 4's Design half** (visibility toggle + 2D). Remaining Phase 4 = the Stage
material-card finish (folds into Phase 3).

---

## PHASE 3 — gravel as a look-driven material (NARROW; Jacob picked (a))
Strategy convo (Jacob): materials want a future "world-materials palette" with TWO backends —
bitmap (tintable/scalable) for bounded/identity-rich/close surfaces (buildings), procedural for
unbounded/noise-like/multi-scale ground (gravel/grass) — keeps the slab lean + no horizon tiling
shimmer. **Don't converge backends; converge the interface.** Logged as its own arc (task #6).
Phase 3 = the first procedural entry done right, narrow:
- `gravelPathMaterial.js`: `makeGravelPathMaterial({ tintHex, roughness, scale })` — all optional,
  **defaults reproduce the exact dialed-in look** (tint=(1,1,1), roughness=0.95, scale=1). `uTint`
  multiplies the gravel hue (referenced to NEUTRAL #928a7c so the default swatch = no-op); `uPathScale`
  scales the pebble pattern domain (NOT the lamp UV — lamp stays world-coord). Uniforms, so the
  program cache key is unchanged.
- Source = the look: tint ← `layerColors.park_path` (the Surfaces swatch), roughness/scale ←
  `materialPhysics.park_path`. Wired into BakedGround `GravelMesh` + LafayettePark `ParkBridge`.
- The park_path swatch now tints BOTH the 2D flat color (colorFor) AND the 3D Voronoi gravel —
  consistent. roughness/scale read from the look but have no slider yet (Pass C / arc #6).
- No rebake needed (runtime material params; slab geometry unchanged).

**⏳ EYE-GATE (Jacob):** gravel looks identical by default; changing the Park → Paths color swatch
(Stage Surfaces) shifts the gravel hue in 2D + 3D. World-materials palette = arc #6 (logged).

---

## PHASE 5a — REAL STAIRS (runtime-first; awaiting eye-gate)
Jacob calls: descend toward water · standard 0.15 riser / 0.3 tread · runtime-first.
- `src/lib/buildStairGeometry.js` (NEW, pure) — 2-pt steps polyline → treads + risers,
  N=round(run/tread), world x/z + local Y profile (top y=0, −riser/step). Reusable by the bake later.
- `parkPaths.js` — `steps` split OUT of the flat `land` group → returned as raw polylines (`steps`).
  Re-baked: flat steps gone from `park_path` (2706→2590); no flat strip under the 3D stairs.
- `LafayettePark.jsx` `ParkStairs` — builds each staircase, places RIGIDLY on terrain (PondGroup
  lift — a stair is a grade transition, can't drape), stone `#A0907E`, gated `layerVis.steps`.
  Direction = descend toward water (end within 25 m) else toward lower terrain.
- 8 park staircases, drops 0.6–1.65 m. Neighborhood cycleway/steps/path groups now bake too
  (0% in park — older HEAD slab simply lacked them; not a regression, no double-render).

⚠️ **DIRECTION — Jacob's catch:** some park steps ASCEND to a monument, not descend to water. We have
NO monument coordinates (landmarks.json = 87 businesses; OSM monument nodes unreadable; promote drops
tags) → can't auto-detect. v1 uses the water/terrain heuristic; the up-to-monument ones read backwards
until Jacob points them out (per-step flip is a one-liner).
**BACKLOG (kit-general direction):** carry OSM `incline=up/down` through skeleton→promote onto path
records + a per-step operator override toggle (pairs with the Phase-5 bridge override). Then bake
stairs into the slab.

**⏳ EYE-GATE (Jacob, hard-reload):** 8 stone staircases appear in the park; water-side ones descend
to the water, others to lower ground; "Steps" toggle hides them. Flag: which ascend to monuments
(backwards), and whether the drop/Y reads right on the flat-park + raised-pond model.
