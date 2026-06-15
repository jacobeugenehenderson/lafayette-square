# RENDER-PATH CENSUS — the single live path, and every carpet layer around it

> 🗄️ **ARCHIVED 2026-06-14 (doc cleanup).** Stale pre-Wall census (the "LS renders at 0% / blockCustoms graveyard" regime is superseded by the tile model). Kept as the dated deep-dive record. **Live home: `DOC-CODE-COHERENCE.md`** (the live divergence ledger). (Was `cartograph/RENDER-PATH-CENSUS.md`.)

> **Cartographer: Vesalius** (continuing — traced `pipeline.js`/`derive.js`/skeleton in `OSM-FORENSICS.md`+`-EVAL.md`, now maps the whole render path). Delivered 2026-06-01. **READ-ONLY forensics — a MAP, not a demolition.** Companion: `HANDOFF-render-path-census.md`, `HANDOFF-chain-consumer-census.md` (Plumb — Phase B internals; this extends it upstream). Every LIVE/DEAD/PARALLEL/BYPASSED verdict is read-traced; unconfirmed items flagged.

## The verdict, up front

The palimpsest is real, and it has a **subfloor the carpet was hiding**. Three findings reframe everything:

1. **The brief's premise needs one correction, and it matters.** "Blocks + intersections read raw `osm.json`, not `skeleton.json`" is **half right**. The rendered **block *shape*** is built from `ribbons.streets`, which **IS the skeleton** (`skelStreets`). Only **intersections** (corner anchors) and **faces** (parcel/LU) take the raw-OSM path. The skeleton is *on* the critical path for geometry — it is **not** a fully-bypassed sidecar. (My own `OSM-FORENSICS-EVAL.md` said "blocks built from raw OSM" — that was imprecise; corrected here. The imprecision is itself an exhibit of the palimpsest: even the people mapping it mislabel which layer is load-bearing.)

2. **The actual cause of LS-renders-at-0% is neither the skeleton nor the emitter.** It is documented in `BACKLOG.md §NOW.1` and read-confirmed: the **`blockCustoms` two-regime graveyard** (legacy integer/per-side keys *and* V2 coordinate/per-fe keys, never reconciled) **+ blockKey rounded-vs-sharp drift** on the customs write→read round-trip. The C5 emitter cutover is *done and correct*; the break is the **pre-wall customs subfloor**. Boz's standing decision: *"stop polishing LS pre-wall — it's the doomed intermediate."* This census exists to prove that's where the body is.

3. **The render core has already collapsed to one path — the divergence is mostly behind us.** Bake (`bake-ground.js`) and Designer-live (`BlockGeometryV2Debug.jsx`) both call the *same* `buildBlockGeometryV2` with the *same* `emitBlockRingBands` keeper (`useRingBandEmitter=true` everywhere). The legacy per-leg emitters are **parallel-dead** (defined, unreachable). The remaining drift is the live-drag sidecar (`buildChainBandsLive`) and the upstream raw-OSM-vs-skeleton split. So "collapse to one path" is **80% done at the emitter and 0% done at the data source.**

---

## Part 1 — The single live path (raw data → pixels), both surfaces

### Surface A — the BAKE (what Jacob sees on hard-refresh)

```
raw/osm.json
  └─ pipeline.js (reads osm directly, L28)  ──┐
        └─ deriveLayers() = derive.js          │  TWO sources merge inside derive.js:
              ├─ vehicularStreets (RAW OSM, L1056) → nodeEdges → polygonize → FACES (L1163)
              │                                   → nodeEdges deg≥3 → INTERSECTIONS (L2334)
              └─ skelStreets (skeleton.json, L2316) → ribbonStreets → ribbons.streets (L2909)
        └─ map.json (layers.ribbons = {streets, intersections, faces, medians, alleys, paths})
  └─ promote-ribbons.js → src/data/ribbons.json  (verbatim copy of map.layers.ribbons, L26/32)
  └─ bake-ground.js (bakeGround, L571)
        ├─ reads ribbons.json (L587) + map.json overlays (L588) + design.json (L589) + neighborhood_boundary stencil
        ├─ buildV2BakeShape → buildBlockGeometryV2(ribbons, {useRingBandEmitter:true}) (L282/595)
        │     └─ emitBlockRingBands (L2910)  ← the mono-width keeper (C5 done)
        ├─ clipAllToStencil + PAINT_ORDER triangulation
        └─ writes public/baked/<look>/ground.json (manifest, 45 groups) + ground.bin (L801/802)
  └─ BakedGround.jsx (L295)
        ├─ resolveLookId: prop > URL ?look= > INSTANCE.lookId ("default") (L275-280)
        ├─ fetch baked/<look>/ground.json + .bin, cache-bust on bakedAt (L310-319)
        └─ per group → THREE.BufferGeometry → GrassMesh | FadeMesh  →  PIXELS
```

**Confirmed:** the bake reads **only derived artifacts** (`ribbons.json`, `map.json`) — never raw `osm.json`/`skeleton.json` directly (agent-traced, `bake-ground.js` L587-589). The raw-OSM dependency is *upstream*, baked into `ribbons.json` by `derive.js`.

### Surface B — the DESIGNER live render (the in-editor preview)

```
src/data/ribbons.json (static import, ribbonsRaw)  +  useCartographStore.centerlineData (live edits)
  └─ mergeLiveRibbons(ribbons, liveStreets) → liveRibbons   (BlockGeometryV2Debug.jsx L265)
  └─ buildBlockGeometryV2(liveRibbons, {useRingBandEmitter:true})  (L333; CartographApp mounts it L890)
        └─ emitBlockRingBands  ← SAME keeper as the bake
  └─ + buildChainBandsLive(selectedChain, …) (L549)  ← the ~1ms live-drag sidecar (no Clipper)
  → React-Three meshes  →  PIXELS (editor)
```

### Where the two surfaces diverge (the [[project_ribbon_three_representations]] drift, named)

| Representation | Code | Reads | Drift risk |
|---|---|---|---|
| (1) Committed bake | `buildBlockGeometryV2` in `bake-ground.js` | `ribbons.json` (derive-merged) | — |
| (2) Designer live | `buildBlockGeometryV2` in `BlockGeometryV2Debug.jsx` | `ribbons.json` + live store via `mergeLiveRibbons` | **(1)↔(2) now share the emitter** — drift only from the live-store merge (uncommitted edits) |
| (3) Live-drag | `buildChainBandsLive` (L3137) | selected chain + `emitOneBlockRingBands` | **The real residual third rep** — parallel emitter, must lockstep ([[feedback_live_drag_preview_migrates_with_main_emitter]]) |

**The good news the brief didn't assume:** (1) and (2) converged at C5. The geometry-core divergence is largely closed; what's left is (3) the drag sidecar and the *data-source* split (Part 2).

---

## Part 2 — Where the skeleton actually enters (the precise split)

`skeleton.json` is read by `skeleton.js` (writes it), `derive.js` (L2316), `migrate-overlay.js`, `serve.js`. The render-relevant read is **`derive.js` L2316**. Inside `deriveLayers`, the split is exact:

| `ribbons.json` field | Built from | Source file:line | Drives in the render |
|---|---|---|---|
| **`streets`** | `ribbonStreets` ← `skelStreets` (**SKELETON**) | `derive.js` L2316→L2335→L2909 | `emitChain` asphalt rects → `asphaltSharp` → **`blockSharp`/`blockRounded`** (block shape) + ribbons + curb + mouths |
| **`intersections`** | `nodeEdges(vehicularStreets)` deg≥3 (**RAW OSM**), projected onto `ribbonStreets` w/ 3 m snap | `derive.js` L1162, L2334-2466 (`IX_SEG_SNAP=3.0` L2407) | `cornersAtIx` corner records → **corner rounding** |
| **`faces`** | `polygonize(nodeEdges(vehicularStreets))` (**RAW OSM**) | `derive.js` L1163 → `faceFills` | **parcel/LU fill** (P13, `blocks[].lu`) |
| **`medians`** | divided-pair detection | `derive.js` (geoDivided) | median polygons |
| **`streets[].{caps, seed, junctions-via-skeleton, nameTransitions, medianWidth, lanes, surface}`** | **Vesalius P1 enrichment** | `skeleton.js` | **NOTHING — inert.** Carried in `skeleton.json` but `derive.js`/`promote-ribbons` drop all but `points/measure/capEnds/anchor/highway/couplers/segmentMeasures` (L2909-2932) |

### Is `skeleton.js` on the render's critical path? **Yes — for shape. No — for corners, parcels, or any enriched attribute.**

- **Block/ribbon geometry**: flows from the skeleton (`ribbons.streets.points` → asphalt → `blockRounded`). The skeleton is load-bearing here.
- **Corner anchors**: bypass the skeleton (raw-OSM intersections, 3 m-projected back).
- **Parcels/LU**: bypass the skeleton (raw-OSM faces).
- **The enriched fields** (junction types, caps, seeds, name-transitions, median width): **written then dropped at `promote-ribbons`** — the serializer (`derive.js` L2909-2932) only forwards a fixed field set. They never reach `ribbons.json`, so no consumer can read them.

### Why the P1 enrichment produced zero visible change — the precise, double-cause answer

1. **Geometry: the recovered junction vertices are *colinear* on through-streets.** Restoring a deleted T-node adds a vertex that sits *on* the through-street's straight asphalt edge — it fixes junction *topology* but doesn't move the asphalt *rectangle*. So `blockRounded` is geometrically ~identical (bake verts moved 0.2%). Topology improved; shape didn't.
2. **Attributes: the new typed fields are dropped at `promote-ribbons`.** Even the parts that *would* change behavior (cap-as-fact, seed, median width) never reach `ribbons.json`.
3. **And the thing that's actually broken (customs) is downstream of all of it.** Even a perfect frame can't render through a mis-keyed customs graveyard.

This is the honest mechanism behind "I wouldn't say it's visually improved." It was triple-invisible: colinear geometry + dropped attributes + a broken consumer.

---

## Part 3 — The carpet & linoleum inventory (every layer, a verdict)

**Verdicts:** **LIVE** (on the render path, working) · **LIVE-BROKEN** (on the path, miskeyed) · **BYPASSED** (skeleton/frame data re-derived from raw OSM instead) · **PARALLEL** (a second impl/input that shadows the live one) · **DEAD** (zero call sites) · **INERT** (written, never read).

| Layer | Verdict | Evidence | Fate |
|---|---|---|---|
| `emitBlockRingBands` / `emitOneBlockRingBands` (mono-width keeper) | **LIVE** | all 3 callers `useRingBandEmitter=true` (bake L595, Debug L195, App L890) | keeper |
| `silhouetteStraightEmitter` (L1583) + `buildFrontageBandsV2` (L1729) | **PARALLEL-DEAD** | defined; else-branch L2914-2922 unreachable (flag never false) | **delete W4** (deferred from C5 commit 3, `BACKLOG §NOW.1`) |
| `chainPavementRing` (L124) | **DEAD** | zero call sites (only comment refs; `NOTES.md` L352 confirms) | delete W4 |
| `buildFrontageBands` non-V2 (L1475) | **DEAD** | zero call sites (`RIBBONS.md` L402 confirms) | delete W4 |
| **`blockCustoms` two-regime graveyard** | **LIVE-BROKEN ⚠️** | legacy integer/per-side + V2 coord/per-fe keys, never reconciled (`BACKLOG §NOW.1`) | **the 0% cause**; dies in wall-move H4 |
| **blockKey rounded-vs-sharp drift** | **LIVE-BROKEN ⚠️** | `blockKeyFromRing(rounded)≠(sharp)` ([[feedback_block_key_rounded_vs_sharp_diverges]]); pass-1/pass-2 carry-forward (Plumb #14) | dies in wall-move H4 (stable ids) |
| `ribbons.faces` (parcels/LU) from raw OSM | **BYPASSED** | `derive.js` L1163 `polygonize(nodeEdges(vehicularStreets))` | Layer-2: faces-on-frame |
| `ribbons.intersections` from raw OSM + 3 m snap | **BYPASSED** | `derive.js` L1162/L2407 | Layer-2: intersections-on-frame |
| Skeleton enriched fields (caps/seed/junctions/nameTransitions/medianWidth/lanes/surface) | **INERT** | dropped at `promote` serializer (`derive.js` L2909-2932) | Layer-2 consumers read them |
| `overlay.json` (operator measure/caps/customs) | **LIVE (primary)** | `derive.js` L2326-2368 | keeper |
| `centerlines.json` (legacy measure/caps) | **PARALLEL (legacy fallback)** | `derive.js` L1503, 2008, 2255, 2511; `rejoin-splits.js` | retire once overlay is sole SSOT |
| `survey.json` (lamp-corrected widths) | **PARALLEL** | `derive.js` L678 `loadSurvey`, L1183 `correctStreetWidths` | audit; likely retire |
| `measurements.json` | **PARALLEL** | `derive.js` L2245 | audit; likely retire |
| `map.json` (overlays: parking/leisure/natural/barriers + `layers.ribbons`) | **LIVE** | `pipeline.js` output; `bake-ground` L588 | keeper (ribbons should split out) |
| `buildChainBandsLive` (L3137) | **LIVE (survey-tool drag)** | Debug L549 | SURVEY-TOOL-ONLY (Plumb #33); must lockstep keeper |
| circle stencil + `faceInBoundary`/`pointInBoundary` cull | **LIVE** | `src/cartograph/boundary.js`, `MapLayers.jsx` | the boundary-trio target |
| vestigial bbox (vs circle stencil) | **PARALLEL/vestigial** | `BACKLOG` boundary-trio | retire in boundary-trio |
| scene-blind `import ribbonsRaw from '../data/ribbons.json'` | **LIVE but scene-blind ⚠️** | 5 sites: `CartographApp` L44, `useCartographStore` L8, `MapLayers` L6, `measureModel` L16, `streetLabels` L27 | [[feedback_scene_blind_fixture_latent_fault]] — hard LS import; non-default scenes unrouted |
| dual derive paths in one file (raw-OSM faces/ix **and** skeleton ribbons) | **the structural seam** | `derive.js` L1056 vs L2316 | the collapse point (Part 4) |

**The two-source seam, named:** `derive.js` is *itself* the palimpsest's spine — it builds the figure-ground (faces) and intersections from **raw OSM** (a path that predates the skeleton), then separately reads the **skeleton** for ribbon chains, and stitches them in `ribbons.json`. The skeleton was bolted on *beside* the original raw-OSM derivation, not *in front of* it. That is the single architectural fact under every "oh, it wasn't even reading that."

---

## Part 4 — The collapse-to-one-path plan

**The single-source target:** one frozen artifact (the First Bake / *slab-shape*) that carries — by value — the block polygons, per-edge measures, corner records, caps, asphalt+material tags, parcels, and **stable ids** (Plumb's §H4), built **once** from the skeleton at Survey-exit. Everything downstream (Stage / Preview / production bake) reads *that* and **re-derives nothing** — no raw-OSM re-noding, no 3 m projection, no `blockKeyFromRing`.

**The unification — three "separate" efforts are one move:**

- **Layer-2 (faces + intersections on-frame)** = stop `derive.js` building faces/intersections from `vehicularStreets` (raw OSM); build them from the **enriched skeleton** (which now carries typed junctions + clean nodes). This deletes the raw-OSM bypass *and* the 3 m snap *and* the reason the densify/extend hacks existed.
- **The wall-move (H4 stable ids)** = freeze the block↔fe↔corner↔span links by explicit id instead of `blockKey`. This kills the **customs two-regime graveyard + blockKey drift** — i.e. **the actual 0% cause.**
- **The boundary-trio** = the circle stencil + cull become a clean clip of the single frozen artifact instead of a per-layer afterthought.

They are facets of one move because they all require the **same precondition**: a single frozen, id-stable, skeleton-sourced artifact. Build that, and all three fall out.

**Priority — what to pull up first, for the fastest *honest* LS render:**

1. **Wall-move H4 (stable-id customs) — FIRST.** It is the only thing that fixes the 0%. Nothing else makes LS render correctly; the customs graveyard is the floor under the carpet. (`BACKLOG §NOW.1`, Plumb §H4.)
2. **Layer-2 faces+intersections-on-frame — SECOND.** Once customs render, route blocks/intersections through the enriched skeleton so the frame's correctness (typed junctions, clean nodes) becomes visible and the raw-OSM bypass + 3 m snap retire. This is where my P1 work finally shows.
3. **Promote the enriched fields — cheap, do alongside #2.** Widen the `promote-ribbons` serializer (`derive.js` L2909-2932) to forward `caps`/`seed`/`medianWidth`/junction types so consumers *can* read them (today they're dropped at the seam).
4. **Then the boundary-trio + dead-code sweep** — clip the frozen artifact; delete the parallel-dead emitters and DEAD funcs.

**Safe-to-delete-now vs needs-care:**

- **Safe now (zero call sites, read-confirmed):** `chainPavementRing` (L124), `buildFrontageBands` non-V2 (L1475). *Pure deletions* — but `BACKLOG` schedules them for the W4 sweep, so coordinate with Boz rather than pre-empting.
- **Safe-after-flag-removal:** `silhouetteStraightEmitter` (L1583) + `buildFrontageBandsV2` (L1729) + the else-branch — unreachable while `useRingBandEmitter` is always true; delete with the flag in W4.
- **Needs care (still read):** `centerlines.json` / `survey.json` / `measurements.json` legacy measure inputs — retire only after confirming `overlay.json` is the sole authored SSOT (audit `derive.js` L1503/2008/2255/2511/678/2245). The H6 `segmentMeasures`/`couplers` coverage gap (Plumb) lives adjacent.
- **Needs care (architectural):** the `derive.js` two-source seam itself — the collapse, not a delete.

---

## Closing — the 3–5 things to pull up first

1. **The 0% is the customs subfloor, not the carpet.** `blockCustoms` two-regime graveyard + blockKey drift (`BACKLOG §NOW.1`, read-confirmed). The C5 emitter and the skeleton are *correct*; LS can't render through mis-keyed customs. **Pull this up first (wall-move H4).** Everything else is cosmetic until this is fixed.
2. **The skeleton is on the path for shape, bypassed for corners + parcels.** Correcting the brief's premise: `ribbons.streets`=skeleton (block shape), `ribbons.intersections`+`faces`=raw OSM. The bypass is *two* derivations, not "blocks." (`derive.js` L1056 vs L2316.)
3. **The enriched frame fields are dropped at the `promote-ribbons` seam** (`derive.js` L2909-2932) — inert until the serializer forwards them. Cheapest unblock for making P1 visible.
4. **The render core already collapsed to one emitter** (`emitBlockRingBands`, both surfaces); the legacy per-leg emitters are parallel-dead. The remaining divergence is the `buildChainBandsLive` drag sidecar + the data-source split — *not* the geometry core.
5. **`derive.js` is the palimpsest's spine** — it derives figure-ground/intersections from raw OSM (the original path) *and* reads the skeleton (the bolted-on path) and stitches both. Layer-2 + wall-move + boundary-trio are one move because they share one precondition: a single frozen, id-stable, **skeleton-sourced** artifact.

**The single-source target, one sentence:** build the figure-ground, intersections, corners, measures, and parcels **once, from the enriched skeleton, with stable ids, frozen at Survey-exit** — and let Stage/Preview/production read that artifact and re-derive nothing. The wall-move is not one of three efforts; it is the one move the other two are facets of.

— *Vesalius*

---
*Read-traces this session: `bake-ground.js` (Surface A), `BlockGeometryV2Debug.jsx`/`CartographApp.jsx` (Surface B), `derive.js` (the two-source seam + serializer), `promote-ribbons.js`, `node.js`/`polygonize.js` (the raw-OSM noding), `BACKLOG.md §NOW.1` (the 0% diagnosis), grep-verified call-site counts for the DEAD/PARALLEL verdicts. Built on Plumb's `HANDOFF-chain-consumer-census.md` (Phase B internals) — extended upstream to the data source, not redone.*
