# Dispatch brief — AERIAL FOCUS LOADER (two-layer: low-res base + on-demand hi-res focus)

**For a COLD agent.** Assume no prior context — every code location is cited with file:line. This is a **standalone, card-independent** fix in the **Neighborhood Disc** arc; it does NOT depend on Survey/Section or the boundary-card work. It's runtime-only (no bake involved). Pick a name; sign your commits.

---

## 0. The problem, in one line

The aerial imagery "takes a dog's age to load." Diagnosis: it loads the **whole neighborhood disc at one global high zoom** regardless of what's selected — `CartographApp.jsx:947` renders `<AerialTiles zoom={tool === 'measure' ? 20 : 18} />`, and `AerialTiles.buildTiles(z)` fires ~190 (z18) / ~750 (z20) **live ArcGIS tile fetches at once** (browser throttles ~6/host → long waves; no LOD, no priority, no cache). We already cull outside the circle (`tileTouchesFade`), so culling is NOT the problem — the **load strategy** is.

## 1. The insight that drives the fix (Jacob)

**Hi-res is a property of ATTENTION, not place.** You only need hi-res aerial *behind the activated, translucent block while zoomed in* (the editing handles appear there — that's where the operator's eye is). Everywhere else, low-res is fine. So:

- **Base layer** — low-res, whole disc, **always on**. A handful of tiles, near-instant, never blank.
- **Focus layer** — hi-res, **only over the clicked/activated block**, at a **resolution driven by camera distance** (closer camera → higher zoom), loaded **nearest-the-click first**, **released on deselect / zoom-out.**

At any instant that's a *handful* of hi-res tiles, not 750.

**Resolved decisions (Jacob, 2026-06-02):**
- Focus latches to the **clicked block(s)** — NOT a cursor-following spotlight.
- Resolution = **camera distance** (the `tool === 'measure' ? 20 : 18` hardcode is wrong and goes away).

## 2. Canon / context to read first

- memory `project_neighborhood_disc` — the design this implements (the boundary is always a circle; this is fix "A/the loader rework", and it retires the whole-disc hi-res pre-bake idea).
- `RIBBONS.md §5` — the Measure/Survey translucency-focus model (selected chain + its block go translucent ~0.55; **that translucency is BY DESIGN** — it's *why* hi-res aerial behind the block matters). Don't redesign it.
- `AGENT-VALIDATION-SURFACES.md` — validate on **LS in the live app** (toy has no aerial: `sceneCfg.hasAerial` is false for toy). Jacob's eye gates.

---

## 3. The wiring (all current, file:line)

**Render gate (the change site):** `src/cartograph/CartographApp.jsx:947`
```jsx
{sceneCfg.hasAerial && (!!tool || aerialVisible) && <AerialTiles visible={true} zoom={tool === 'measure' ? 20 : 18} />}
```

**The loader:** `src/cartograph/AerialTiles.jsx`
- `buildTiles(z)` (`:70-89`) — generates tiles across the WGS84 `BBOX` at zoom `z`, culls outside the circle via `tileTouchesFade` (`:62-68`), returns `{x,z,w,h,url}[]`.
- `lonLatToTile` (`:43`), `tileToLonLat` (`:51`), `wgs84ToLocal` (`:36`) — tile math.
- `TileMesh` (`:93`) — loads one tile via `loader.load(url)` in a `useMemo`; `injectCircleCrop` (`:10`) applies the radial alpha fade. **Note: textures are never `.dispose()`d** — with on-demand churn you MUST add disposal (see §5).
- Default export `AerialTiles({zoom, visible})` (`:122`) — maps `buildTiles(zoom)` to `<TileMesh>`.

**Selection state** (`src/cartograph/stores/useCartographStore.js`):
- `selectedStreet` (`:1562`) — numeric index into **skeleton-order** `centerlineData.streets[]`. Set by `selectStreet(idx)` (`:1908`).
- `corridorByIdx` (`:1561`, built `:1709`) — `Map<streetIdx, Set<streetIdx>>` (divided carriageways/continuations = one corridor).
- `corridorSelected = toolActive && selectedStreet !== null` — computed at `CartographApp.jsx:790`. **This is the gate for showing the focus layer.**
- `selectedMeasurePoint` `{x,z}` — the **world-space click projected onto the street**, stored by the Measure click handler (see below). Use it as the nearest-first load seed.

**Click handler / world-space seed:**
- `MeasureOverlay.jsx onPointerDown` (`:446-489`): captures world click via `screenToWorld(...)` (`:54-61`, raycast to ground y=0 → `{x,z}`), then on a centerline hit calls `selectStreet(bestIdx)` and `setMeasurePoint({x,z})` (the projected point). So **Measure stores the seed; Survey does not** — `SurveyorOverlay.jsx` has the same handler pattern but no `setMeasurePoint`. **Add the equivalent store write in `SurveyorOverlay` so Survey also seeds the focus** (small), or fall back to the block centroid when `selectedMeasurePoint` is null.

**Selected-street → block region (for the focus bbox):**
- The skeleton-order `selectedStreet` must be translated to ribbons-order before indexing ribbon/block geometry. The translation already exists: `selectedRibbonsChainIdx` in `BlockGeometryV2Debug.jsx:287-300` (matches by `skelId`, falls back to `name`).
- `buildBlockGeometryV2` output (`buildBlockGeometryV2.js:3116`): `blocks[]` = `{ring:[[x,z]...], blockKey, lu}` (`:3123`); `byChain[]` = per-chain `{asphaltRings, treelawnRings, sidewalkRings, ...}` (`:3129`), indexed by **ribbons-order** chainIdx.
- **Pragmatic focus region (recommended):** the focus bbox doesn't need to be exact — a generous box that covers the selected street + its flanking blocks is correct, since it's just "where to load hi-res." Compute it from the **selected street's own polyline** (`centerlineData.streets[selectedStreet].points`, world `[x,z]`) → min/max bbox → **expand by a margin** (≈ a typical block depth; start ~60-80m, tune by eye). Optionally tighten using `byChain[selectedRibbonsChainIdx]` ring bbox if you want it snugger. **Avoid building a precise street→block adjacency map — it's unnecessary for an aerial focus region.**

**Camera (for resolution):**
- R3F: `const { camera } = useThree()` (`useThree`/`useFrame` imported `CartographApp.jsx:2`). The Designer is **orthographic**; `camera.zoom` encodes view scale (higher = more zoomed-in). Camera rig + refs: `CartographApp.jsx:135-350` (`orthoRef`, `controlsRef`). Existing `useFrame` examples at `:333` and `:340`.
- **No zoom→tileZ formula exists yet — you define it.** Principled approach: pick the tile zoom `z` whose ground-resolution (meters/pixel) ≈ the on-screen meters/pixel. For the ortho camera, on-screen m/px ≈ (visible world height) / (canvas height px); a web-mercator tile at zoom `z` is `≈ (earthCircumference·cos(lat))/(2^z·256)` m/px. Choose `z` so they match, **quantize to an integer**, **clamp** to `[BASE_Z+1, 21]`, and **debounce** so a slow dolly snaps between discrete LOD steps instead of thrashing tile loads every frame.

**Boundary/disc constants** (`src/cartograph/boundary.js`): `BOUNDARY_CENTER_XZ` (`:17`), `BOUNDARY_RADIUS` (`:18`), `FADE_INNER`/`FADE_OUTER` (`:22-23`), `STREET_FADE_INNER`/`OUTER` (`:29-30`), sourced from `cartograph/data/lafayette-square/neighborhood_boundary.json`. The base layer culls to `FADE_OUTER` exactly as today.

---

## 4. The build

**Refactor `buildTiles`** to `buildTiles(z, regionBbox?)` — when `regionBbox = {minX,maxX,minZ,maxZ}` is passed, additionally skip tiles whose `{x,z,w,h}` rect doesn't intersect `regionBbox` (cheap AABB test) on top of the existing circle cull.

**Split `AerialTiles` into two layers** (two components, or one managing both):
1. **`AerialBase`** — `buildTiles(BASE_Z)` over the whole disc, always rendered (when `sceneCfg.hasAerial && (!!tool || aerialVisible)`). `BASE_Z` = a low fixed zoom (start z15/16; tune by eye for "fast + acceptable overview"). This stays **live-fetched** for now (few tiles; pre-baking the base is a later Disc step, out of scope here).
2. **`AerialFocus`** — rendered only when `corridorSelected`. Each frame (via `useFrame`, quantized+debounced), compute `focusZ` from `camera.zoom`; compute `focusBbox` from the selection (§3); `buildTiles(focusZ, focusBbox)`; **sort the tiles nearest-first by distance from `selectedMeasurePoint`** (fallback: focusBbox center) so the spot under the click sharpens first; render `<TileMesh>` for each. On deselect / zoom-out / focusZ change, unmount the old tiles.

**Wire at `:947`:** replace the single `<AerialTiles zoom=...>` with `<AerialBase/>` + `<AerialFocus/>`. **Delete the `tool === 'measure' ? 20 : 18` hardcode** — focus zoom is camera-derived; base zoom is fixed-low.

**Texture disposal (required, not optional):** `TileMesh`'s `useMemo` calls `loader.load` but nothing disposes the `THREE.Texture` on unmount. With the focus layer churning tiles as you dolly/reselect, add a cleanup (`useEffect` return → `texture.dispose()`, and dispose the material) or you'll leak GPU memory. (Tighten this for the focus layer at minimum; the base is stable.)

---

## 5. Definition of done (Jacob's eye, LS, live app)

1. **Initial load is fast** — LS Designer shows the low-res base over the disc near-instantly; no more waiting on a full hi-res map.
2. **Select a centerline (Measure or Survey), zoomed in** → hi-res aerial appears behind the translucent block, sharpening from the click point outward.
3. **Dolly closer → higher resolution; pull back → coarser** (quantized; no per-frame load thrash).
4. **Deselect / zoom out → hi-res focus releases** and its textures are disposed (no GPU-memory growth over a session of selecting around).
5. The `measure?20:18` hardcode is gone; resolution is a function of camera distance, not tool.

## 6. Non-scope (do not do here)

- **No FloorGizmo / boundary card** (separate Disc piece).
- **No authorable feather**, no circle/256-gon cleanup, **no intake pre-bake of the aerial** (the base stays live-fetched; pre-bake is a later Disc step).
- Don't touch the geometry/tile construction, Survey/Section, or the bake. This is purely the runtime aerial loader.

## 7. Commit ladder (suggested)

1. Refactor `buildTiles(z, regionBbox?)` + split into `AerialBase`/`AerialFocus`; render **base only** at `:947`. Land the fast low-res base first and confirm initial-load speed.
2. Add `AerialFocus`: derive `focusBbox` from selection (street polyline + margin), render hi-res when `corridorSelected`; add the Survey-side click-seed write.
3. Camera-driven `focusZ` (`useFrame`, ortho.zoom→tileZ, quantize+clamp+debounce) + nearest-first load order + texture disposal on unmount.

Validate each rung on LS in the app. Report when initial-load speed + the focus behavior are both confirmable on Jacob's eye.

## 8. Gotchas (banked)

- **Validate on Jacob's eye in the live app, not a proxy** — a self-built measurement that disagrees with the screen is void.
- **`scratch/` is git-tracked** — don't `rm -rf`; delete throwaways by exact name.
- **Verify edits applied** (Read/`git diff`) before trusting build output.
- The skeleton-order (`selectedStreet`) vs ribbons-order (`byChain`) index mismatch is real — **always translate via `selectedRibbonsChainIdx`** if you index ribbon/block geometry (`BlockGeometryV2Debug.jsx:287-300`). But prefer the street-polyline bbox path to sidestep it.

*Provenance: Boz, 2026-06-02. Grounded in two fresh code-location sweeps (AerialTiles + selection/camera wiring). Cold-start self-contained per the dispatch model.*
