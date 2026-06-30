# CRASH FORENSIC — "Extra Wavy" place-card crash on iOS Safari (mobile-only)

**Agent:** Tern (fresh forensics) · **Date:** 2026-06-30 · **Branch:** `curb-offset-draw`
**Scope:** INVESTIGATION ONLY — no code edited, nothing committed.
**Symptom:** Opening/closing a business place card on mobile (iOS Safari) intermittently kills the tab "back to load"; once produced WebKit's **"This page cannot be opened"** (a process **jetsam / OOM kill**, not a JS exception). Most reproducible on **Extra Wavy** (`lmk-003`, `bldg-0086`, Malt House Lofts — a **4-listing multi-tenant building on the neighborhood border**). Desktop is fine.

---

## TL;DR — the contrarian headline

**The operator's primary suspicion (missing frustum culling → OOM) is the wrong lever.** Frustum culling sets `.visible=false`, which **skips draw calls but does not free a single byte of resident GPU memory**. The "page cannot be opened" symptom is a **resident-allocation OOM kill**, so culling cannot fix it.

The real resident-memory bomb is **tree geometry cloned per map-tile**: `InstancedTrees` buckets mesh trees per `(GLB-url × tile)` and `VariantInstances` does `geometry.clone()` + `mergeGeometries()` **once per bucket**. Only **14 unique GLBs** are fetched (**38.8 MB on disk**), but they are cloned across all **16 tiles** into **173 mesh groups** totalling **~474 MB of resident geometry** (proxy; true decoded figure is higher — see §1). The tile-bucketing exists **only to scope bounding spheres for a per-tile cull that was excised 2026-06-27** — so today it is **pure cost with zero benefit**.

**The surest, lowest-blast-radius fix is geometry de-duplication (merge once per URL), not culling.** It removes ~400+ MB of resident VRAM with **zero visual change** and very likely drops the baseline far enough below the iOS ceiling that the place-card transient (camera fly + photo decode + pin reconcile) no longer tips it over.

---

## SSoT render-stack question — ANSWERED (the "is it the same goose?")

**Yes, Stage / Preview / Production now share ONE component render stack.** All three entry points import and mount the *same* `LafayetteScene` + `InstancedTrees`:

- **Production:** `src/App.jsx:585` → `<Scene/>` → `src/components/Scene.jsx:830` `<InstancedTrees lookId=…/>` and `:841` `<LafayetteScene hiddenLayers={{building:true}}/>`.
- **Preview:** `src/preview/PreviewApp.jsx:14` imports `InstancedTrees`, `:38` imports `LafayetteScene`, mounts both in `CanvasContents`.
- **Stage:** `src/stage/StageApp.jsx:22` imports `LafayetteScene`; the cartograph path (`src/cartograph/CartographApp.jsx`) mounts `InstancedTrees`.

They differ **only in the Canvas wrapper config**, not the scene components:

| | Production mobile | Production desktop | Preview / Stage |
|---|---|---|---|
| `dpr` | **1** (forced) `Scene.jsx:798` | `[1,1.5]` | desktop-class |
| `frameloop` | `demand` always `:746` | `demand`, `always` in hero | `always` |
| MSAA / `antialias` | **off** `:766` | on | on |
| `logarithmicDepthBuffer` | **off** `:776` | on | — |
| Post-FX | **FilmGrade+SMAA+Grain only** `PostProcessing.jsx:413-429` (no N8AO/pyramid/DoF/bloom) | full pyramid stack | full |
| Lamps | `DeferredStreetLights` (4 s delay) `:848` | `BakedLamps` `:843` | — |

**Implication for the historical culling break (Linden, 2026-06-24, black-screened Stage AND Preview):** that failure came from **three.js's *automatic* `InstancedMesh` bounding-sphere cull** fighting the runtime terrain-lift/sway (geometry is baked tree-local via `g.applyMatrix4(o.matrixWorld)`, `InstancedTrees.jsx:127`, so the auto bound is wrong once `uExag` lifts/sways verts → false drops). Because the stack is now unified, **a *manual* world-space cull that does NOT rely on three's bound is safe across all three** — but any cull change must still be eye-gated in all three. The historical reason is mooted *for a manual cull*; it is **not** mooted for re-enabling three's auto cull (still don't — keep `frustumCulled={false}`).

---

## 1. OOM hypothesis — tested with real numbers

### Slab inventory (measured)
- **Trees:** `tree-anchors.json count=745`. `public/baked/default.json` (the bake `InstancedTrees` actually fetches, `InstancedTrees.jsx:47` `BAKE_URL=/baked/default.json`): **745 placements → 466 `heroTier:"mesh"`, 279 `"cull"` (dropped at runtime), 0 `"impostor"`.** So **every visible tree renders as a full `lod1` mesh** — the impostor render path carries nothing here.
- **Lamps:** `lamps.json count=80`. On mobile these mount via `DeferredStreetLights` → `BakedLamps` after a 4 s timeout (`Scene.jsx:726-734,848`), as 3 `InstancedMesh` (post/glow/bulb), each `frustumCulled={false}` (`StreetLights.jsx:402,420,427`). 80 instances × 3 = cheap; **lamps are a red herring for OOM** (tiny geometry, single shared geometry, no per-tile cloning).

### The geometry-clone multiplier (the bomb) — measured
`InstancedTrees.jsx:642-771` buckets mesh instances into `Map<url, Map<tileId, instances[]>>` using a 4×4 tile grid (`default.json.tiles`, `cols=4 rows=4`). One `<VariantInstances>` mounts **per `(url × tile)`** (`:870` `key={url}#{tileId}`). Each `VariantInstances.meshes` `useMemo` (`:112-250`) does, **per bucket**: `geometry.clone()` for every primitive, `applyMatrix4`, stamps **4 extra `Float32` vertex attributes** (`aBark`, `aBarkRegion`, `aWindTier`, `aTreeHeightNorm` — `:142,154,189,220`), then `mergeGeometries`.

Replaying the exact grouping + substitution logic over `default.json`:

```
drawn mesh instances:            466
substituted (out-of-roster):     249   ← scatters every roster variant across ALL tiles
mesh GROUPS (geometry clones):   173
unique GLBs fetched (drei cache): 14  = 38.8 MB on disk
Σ GLB bytes across 173 groups:        ~473.8 MB   ← resident geometry proxy
```

Worst offenders (variant × tile-spread):
```
linden_american/skeleton-1-lod1  6.37 MB × 13 tiles = 82.8 MB
ash_green/skeleton-1-lod1        3.37 MB × 16 tiles = 54.0 MB
oak_white/skeleton-1-lod1        3.37 MB × 15 tiles = 50.6 MB
maple_sugar/skeleton-1-lod1      2.75 MB × 16 tiles = 44.1 MB
maple_silver/skeleton-1-lod1     1.63 MB × 14 tiles = 22.8 MB
maple_red/skeleton-1-lod1        1.63 MB × 13 tiles = 21.2 MB
```

**Why every heavy variant lands in all 16 tiles:** 249 of 466 placements are out-of-roster (`default.json` has ~25 species; only 14 GLB folders ship) and get **deterministically substituted to a same-category roster variant** (`fallbackFor`, `:666-677`) — which **scatters each of the 14 roster variants uniformly across the whole map**, so each spans nearly all 16 tiles → maximal clone duplication.

**Verification the proxy is conservative, not inflated:**
- GLBs are **uncompressed** (no `KHR_draco_mesh_compression` / `EXT_meshopt_compression` in the JSON chunk) → GLB bin ≈ decoded `BufferGeometry` 1:1.
- The 4 added `Float32` attributes add **+16 bytes/vertex** on top of pos+normal+uv (32 B/vert) ≈ **+50%**. So true resident tree geometry ≈ **~600–700 MB**, not 474 MB.

### Texture VRAM (measured)
Runtime binds **only the unified atlas** (`treeAtlasMaterial.js:958-961` loads `atlas.colorPath` + `atlas.normalPath`; the `-leaves-*`/`-bark-*`/`-viz` PNGs are intermediates, never bound):
- `trees-atlas-color.png` **3640×2848 RGBA** = 41.5 MB → ×1.33 mip ≈ **55 MB**
- `trees-atlas-normal.png` 3640×2848 RGBA ≈ **55 MB**
- → **~110 MB tree textures** (mobile too — no mobile downscale).
- Ground: 3 × 1024² RGBA (`colormap/lightmap/poolmap`) ≈ **16 MB**. Ground mesh `ground.bin` 11 MB (single copy). Buildings `buildings.bin` 2.85 MB (single merged slab).

### Mobile budget verdict
- **dpr forced to 1** (`Scene.jsx:798`) and **no bloom/DoF/pyramid on mobile** (`PostProcessing.jsx:413`) keep framebuffers/render-targets small — good, those are **not** the problem.
- **Baseline resident ≈ 600–700 MB geometry + 110 MB textures + ~30 MB ground/buildings ≈ 750–850 MB**, before the page's JS heap (the `PlaceCard.jsx` component is **4,203 lines**), WebKit overhead, and CoreAnimation layers.
- iOS Safari jetsam kills tabs well below device RAM — roughly **~600–800 MB on 3 GB devices** (iPhone SE/older), ~1–1.5 GB on newer. GPU buffers/textures count. **A 750–850 MB baseline is already at/over the kill line on midrange phones** → "intermittent, device-dependent" matches exactly.

### What the place-card transition ADDS (the trigger)
On `select()` (`useSelectedBuilding.js:13`) three things fire together over that near-ceiling baseline:
1. **Camera fly** — `SidePanel.jsx:448,463` `flyTo(...)`; on mobile `frameloop="demand"` so this wakes a **render burst** (transient driver/GPU allocation) during the move.
2. **Photo decode** — `PlaceCard` `PhotosTab`/hero load `thumb_2048` images (`PlaceCard.jsx:1549,3607`); a 2048-px JPEG decodes to **~11 MB RGBA each**; a multi-tenant card surfaces several → **tens of MB transient**.
3. **drei `<Html>` pin reconcile** — see §2; multi-tenant cluster repositions a fan of portal pins → DOM/CoreAnimation churn.

On a baseline already at the ceiling, any of these is the straw. **Border + multi-tenant = worst case:** border maximizes resident geometry that's off-frame-but-still-resident, multi-tenant maximizes pins + photos.

**Adversarial conclusion:** OOM is real and is the **best explanation for "page cannot be opened."** But the dominant resident cost is **geometry clone-per-tile duplication**, *not* the absence of culling. **Culling would not have prevented this kill** — it frees no resident memory.

---

## 2. drei `<Html>` reconcile spark — tested

Documented in code at `LafayetteScene.jsx:1074-1080`: selecting recomputes `LandmarkMarkers.filteredLandmarks` (`:1136-1140`, the filter **includes `l.id === selectedListingId`** so the set changes on every select/deselect) and the de-overlap `pinOffsets` (`:1149-1183`), remounting/repositioning the drei `<Html>` pins (`:1068`) **mid-click**. The historical "~75% intermittent crash" was band-aided with `requestAnimationFrame(() => select(...))` (`:1080`), which **is present in current code**.

**Assessment:** MEDIUM, and **a distinct failure mode from the OOM.** A drei reconcile crash is a **JS/React exception** — it would surface as an `R3FErrorBoundary` trip / blank canvas / app reload ("crashes all the way back to load"), **not** WebKit's "page cannot be opened." So this likely explains the *intermittent JS reload* the operator also sees, while §1 explains the *hard process kill*. It **compounds** the OOM: each `<Html>` pin is a composited DOM layer; a multi-tenant cluster spawns a fan of them, and the filtered-set recompute remounts the **whole pin set** on every select. The rAF band-aid only defers the reconcile past the click; it does not reduce churn.

---

## 3. Ranked hypotheses

| # | Hypothesis | Confidence | Evidence FOR | Evidence AGAINST |
|---|---|---|---|---|
| **1** | **OOM from tree-geometry clone-per-tile duplication** (~600–700 MB resident), tipped by the place-card transient | **HIGH** | 173 clones / ~474 MB proxy measured; uncompressed GLBs; "page cannot be opened" = jetsam OOM; border/multi-tenant = worst case; baseline ≈ kill line on midrange phones | None material. (Note the *root* is duplication, not "missing culling.") |
| **2** | **Image-decode spike as the TRIGGER** (not root) | **MED-HIGH** | `thumb_2048` → ~11 MB/photo decode; multi-tenant surfaces several; crash correlates with card open | `loading="lazy"` on the grid (`:1664`) defers most; hero + first photos still decode |
| **3** | **drei `<Html>` pin reconcile spark** on select/deselect | **MEDIUM** | Documented ~75% crash, rAF band-aid only; filtered-set recompute remounts all pins; multi-tenant cluster | "Page cannot be opened" is OOM not a JS crash → explains the *other* symptom; compounds, not sole cause |
| **4** | **Missing frustum culling as the DIRECT OOM cause** (operator's framing) | **LOW (refuted as cause)** | Off-frame trees/lamps do draw every frame (perf/thermal cost) | `.visible=false` frees **no** resident memory; cannot fix a resident-allocation OOM. A perf contributor, not the memory cause. |
| **5** | **R3F WebGL context-loss mishandling** | **LOW** | `Scene.jsx:790-796` handler only **logs** on `webglcontextrestored` (no resource re-init) | "Page cannot be opened" is a **process kill**, not a recoverable context-loss event → handler is moot here |

**They compound:** **1 + 2** produce the hard OOM kill; **3** produces the intermittent JS reload. The **multi-tenant border building maximizes all three at once** — which is exactly why Extra Wavy is the most reproducible.

---

## 4. Manual world-space per-tile `.visible` cull — safe-by-construction design

> Needed only as a **perf/thermal topping AFTER the memory fix** (it does not address OOM). Designed to be immune to the 2024-06 auto-cull failure.

**Failure it must avoid:** three's auto `InstancedMesh` bounding-sphere is computed from baked tree-local geometry, then `patchTerrainInstancedBaked` lifts/sways verts at runtime via `uExag`/sway → the static bound no longer contains the displaced verts → **false drops of on-screen tiles** (Linden's black-screen).

**Design (file: `src/components/InstancedTrees.jsx`):**
1. **Keep per-tile InstancedMeshes for cull granularity, but SHARE one merged geometry per URL** (see §5 fix — merge once per URL, hand the same `BufferGeometry` to each tile's `InstancedMesh`; only `instanceMatrix` differs). This is what makes culling meaningful *and* cheap.
2. Precompute, per tile group, a **static world-space `THREE.Box3`** from the slab tile bounds (`tileMeta.minX/minZ/tileW/tileD`) **or** the min/max XZ of that group's instance positions — **never** from three's `boundingSphere`. Pad it generously:
   - **Horizontal** `+MARGIN_XZ ≈ 20 m` (> max canopy radius ~10 m + sway ~2 m).
   - **Vertical** `y ∈ [groundMin − 2, groundMax + MAX_TREE_H + EXAG_HEADROOM]`, e.g. top `+35 m` (max tree height ~25 m + terrain-lift headroom).
3. A `<TreeCull>` component (one `useFrame`): build the frustum from
   `frustum.setFromProjectionMatrix(M.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))`,
   then per group `group.visible = frustum.intersectsBox(paddedBox)`. Throttle to every ~3rd frame / on camera-move (cheap: ≤ ~14 box tests).
4. **Why no visible-tree drop is possible:** the padded AABB exceeds **every** runtime displacement (sway ≤ ~2 m, `uExag` lift bounded, canopy radius ≤ ~10 m), and the test is intersection (keep if *any* corner is inside), so a tree whose trunk is just off-frame but canopy on-frame stays drawn. The bound is **static slab data**, untouched by terrain-lift — the exact thing that broke the auto cull.

**Gating:** ship **mobile-gated (`IS_MOBILE`) first** to bound blast radius; desktop hero runs `frameloop="always"` and has memory headroom, so it doesn't need it. Extend to desktop only after eye-gate.

---

## 5. Recommended minimal-risk fix SEQUENCE — "reliable on mobile TODAY"

Ordered by **(reliability win) ÷ (blast radius)**. Each step lists the Monte-Carlo failure modes and the eye-gate that catches them.

### STEP 1 — De-duplicate tree geometry (THE fix; ship first)
**Change:** stop bucketing mesh trees per tile. Minimal form: force single-bucket (`tileOf → () => 0`, or skip `bake.tiles`) so there is **one `<VariantInstances>` per URL** → **one clone/merge per URL** (14 groups, ~39 MB × ~1.3 ≈ **~50 MB**, down from ~474–700 MB). Visually identical (same instances, same positions; the per-tile bound was dead weight since the 2026-06-27 cull excision). Proper form (enables Step 3): merge **once per URL**, share the `BufferGeometry` across per-tile `InstancedMesh`es.
- **Why first:** ~**400–650 MB resident reclaimed**, **zero visual change**, contained to `InstancedTrees.jsx` grouping. Most likely **fixes the OOM outright** by dropping the baseline to ~200 MB.
- **Failure modes & catches:** (a) trees vanish / cold-load shimmer breaks → eye-gate trees present + filling on **phone Hero + Browse + Street**, **Preview**, **Stage**; watch the `forceReconcile` cold-load fill (`:787-795`) still pops them in. (b) draw-count regression → check the `[InstancedTrees]` console line (`:769`) shows `meshGroups` collapsed (~14) and `placements` unchanged (466). (c) per-instance bark/gradient/deformer wrong after merge → eye-gate bark tint + canopy look unchanged on a known species (linden, plane).

### STEP 2 — Throttle place-card image decode on mobile (kill the trigger)
**Change:** on `IS_MOBILE`, cap concurrent decoded photos, prefer `thumb_1024` over `thumb_2048` for the hero/grid, and rely on `loading="lazy"` (already on the grid `:1664`) for the rest; consider decoding the hero only when the Photos tab is shown.
- **Why second:** directly removes the **tens-of-MB transient** that tips the (now lower) baseline; low blast radius (`PlaceCard.jsx` only).
- **Failure modes & catches:** (a) blurrier hero photo → eye-gate card visual on phone. (b) layout shift from lazy → scroll the Photos tab on a multi-tenant card (Extra Wavy). (c) still crashes → indicates Step 1 didn't lower baseline enough → revisit atlas downscale (Step 4).

### STEP 3 — Manual mobile-gated per-tile visibility cull (perf topping)
Ship the §4 design (requires the shared-geometry form of Step 1). Reduces per-frame vertex/overdraw of off-frame trees → less thermal/transient pressure during the fly-in burst.
- **Failure modes & catches:** (a) on-screen trees blink out at frame edge / on zoom → eye-gate **slow pan + pinch-zoom** on phone watching tile boundaries, **and** confirm Preview + Stage unchanged (the goose that bit Linden). (b) pop at tile seams → widen `MARGIN_XZ`. Keep `frustumCulled={false}` (never re-arm three's auto cull).

### STEP 4 — (Only if Steps 1–2 insufficient) mobile atlas downscale
Bake/serve a half-res tree atlas on mobile (1820×1424 → ~28 MB vs 110 MB). Touches the bake + a mobile atlas-path branch; quality risk → eye-gate canopy crispness. Lower priority — Step 1 alone should clear the ceiling.

### STEP 5 — Harden the drei pin reconcile (kill the JS-reload mode)
Decouple selection highlight from `filteredLandmarks` so `selectedListingId` no longer changes the filtered SET (`LafayetteScene.jsx:1138`) → selecting stops remounting the whole pin cluster. Keep the rAF defer.
- **Failure modes & catches:** (a) selected pin no longer highlights → eye-gate the highlight ring still appears. (b) still sparks → confirm via console (R3FErrorBoundary trip vs silent OOM) which mode remains.

---

## Appendix — key file:line evidence
- Trees fetch the GLOBAL bake: `InstancedTrees.jsx:47` `BAKE_URL=/baked/default.json`.
- Per-`(url×tile)` mount + clone/merge: `InstancedTrees.jsx:642-771` (grouping), `:112-250` (clone/merge), `:870` (`key={url}#{tileId}`).
- Substitution scatter: `InstancedTrees.jsx:666-677,711-762` (249/466 substituted).
- `frustumCulled={false}` + excision note: `InstancedTrees.jsx:356-361,411`.
- Runtime binds only unified atlas: `treeAtlasMaterial.js:958-976`; atlas 3640×2848 (`trees-atlas.json#atlas`).
- Mobile Canvas: `Scene.jsx:746` (frameloop), `:766` (no MSAA), `:798` (dpr 1), `:848` (DeferredStreetLights), `:790-796` (log-only context-loss handler).
- Mobile post-FX (no pyramid/bloom/DoF): `PostProcessing.jsx:413-429`.
- drei pin reconcile + rAF band-aid: `LafayetteScene.jsx:1068,1074-1080,1136-1140,1149-1183`.
- Place-card photo decode: `PlaceCard.jsx:1549,1664,3607`; select→flyTo: `SidePanel.jsx:448,463`.
- Lamps (red herring): `lamps.json count=80`; `StreetLights.jsx:402,420,427`.
- Measured tree roles: `default.json` 745 → 466 mesh / 279 cull / 0 impostor; `heroTierMeta.cull=279`.
