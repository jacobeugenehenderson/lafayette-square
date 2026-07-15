# HANDOFF — Altadena: the load, the landscape, and the ground that won't bake

**To:** fresh eyes. **From:** the 2026-07-14/15 session (Tally, dispatched). **Trunk:** `curb-offset-draw` (solo; push/merge freely; PROD = `origin/main`).
**Route first** (CLAUDE.md): `ORIENTATION.md` → `README §⭐ START HERE` → this + `DESIGNER-LOAD-FORENSIC.md`.
Sibling context: [[project_altadena_pour_identity_and_ground_perf]] · [[project_altadena_mountain_landscape_hero]] · `cartograph/SECTION.md §7`.

Altadena is a **Census-Designated Place** — 15,397 buildings, 694 tiles, **4,161 m** radius. LS is 892 m: **69× the area.** Nearly everything below is a thing that was true-and-fine at LS scale and is false at CDP scale. That's the throughline; if you read one sentence, read that one.

---

## Where Altadena actually stands

| | |
|---|---|
| Designer load | **~180 s → ~18 s** — browser-verified (Jacob's console + eye) |
| `ground.bin` | **41 MB, flat-baked, coarse 64 m** — loadable, and **not what we want** |
| `terrain.bin` | **12 MB, real** — 1750×1750 @ 5 m, elev 221→1,701 m, 0 misses |
| `elevation.tif` | **434 MB**, USGS `n35w119`, `data/altadena/raw/` (gitignored) |
| mountain | **baked + in the slab** — 655k tris, 15 MB GLB, geo-anchored |
| lamps | **wrong — they're LS's.** Jacob: *"I'll fix them later."* Not ours. |
| LS (PROD) | **clean.** Slab untouched (nothing newer than 07-14 17:20). `design.json` carries ONLY Jacob's `mackay-place-0` Section edit. |

**⛔ The blocker:** the ground is flat because *baking it with terrain produces 26.3M tris / 457 MB / 88 min CPU*. Jacob's ruling — **"The neighborhood should not be poured flat. The elevation data should be baked in the step between the Design tools and the Stage"** — is blocked on **that alone**. The data is fetched and baked; only the ground refine stands in the way. **OPEN #1, and it's the job.**

---

## OPEN — prioritised

### 1. ⛔ The ground refine is LS-tuned and explodes on a CDP

The adaptive refine is **already correct in design** and already the default — read the doctrine at `bake-ground.js:59`: *"split only where the heightfield bends enough that a coarser triangle would lift its interior off the terrain by more than TOL. Flat blocks stay coarse."* That **is** Jacob's spec (*"we don't need fine ground detail and in flat sections we can let it be flat"*). **Don't redesign it.**

The **constants** are the bug:
```js
const GROUND_REFINE_TOL_M      = 0.50;   // half-metre fidelity
const GROUND_REFINE_MIN_EDGE_M = 6;      // hard floor
const GROUND_REFINE_MAX_EDGE_M = 64;
```
`TOL=0.50` on LS (*"locally planar, median ~1.4 cm deviation over a 30 m edge"*) splits almost nothing. On a mountainside with canyons it splits **everything**, to the 6 m floor, across kilometres. **26M triangles is the correct answer to the question those numbers ask.**

**`MIN_EDGE` is the lever** — it caps the worst case over Altadena's 8,742 m span:

| MIN_EDGE | worst-case quads | |
|---:|---:|---|
| 6 m *(today)* | 2.1M | **26.3M tris · 457 MB · 88 min** |
| 24 m | 133k | ~16× less — near the flat bake's 2.1M tris / 42 MB, **but conformant** |
| 32 m | 75k | ~28× less |

**Proposal (Jacob has NOT ruled):** a **per-hood knob defaulting to today's values**, next to the extent SSoT in `neighborhood_boundary.json` — LS keeps `6 / 0.50` and bakes **byte-identical**; Altadena declares coarser. His own rule from the cull: *"the margin is a **knob**, never hardwired."* Possibly span-seeded, operator-overridable.

**Cheap next step:** ONE `MIN_EDGE=24` bake (~2–5 min by arithmetic), constants overridden **in a worktree** — never the PROD path — then Jacob's eye. If coarse-but-conformant reads right, the knob is small and safe.

> **⚠️ The doubt worth carrying.** The deviation test spends detail **where the terrain bends** — on Altadena that's the *mountain*, i.e. **where nobody walks**. The town is in the flat south and gets almost none. The tuning optimises the scenery and starves the product. The right answer may not be a global floor at all, but something that knows *ground people stand on* from *backdrop*. Raised, not designed — deliberately.

### 2. The mountain: a radial cut (Jacob's design — MEASURED, not built)

The DEM is a **13,791 × 13,341 m square**; the hood is a small disc in its corner. Jacob, from the overhead: *"about 70% of it is totally irrelevant… could we stencil out the ground outside of the SSoT centrepoint extended to the front edge of the map?"*

Measured — a disc centred on the SSoT centrepoint (0,0), cut outside:

| radius | tris kept | **% cut** |
|---:|---:|---:|
| 4,371 m *(the hood's own stencil)* | 148,183 | 77.4% |
| **5,000 m** | 187,270 | **71.4%** ← his estimate, accurate to ~1% |
| 8,000 m | 396,960 | 39.4% |
| 12,000 m | 619,163 | 5.5% |

**Why his selector works where mine didn't:** mine asked *"is this inside the town?"* (**containment**). His asks *"how far from the town is it?"* (**distance**) — a good proxy for *does anyone here care*. It catches the deep back **and** the flanks.

**⚠️ Gate before building:** a hood-centred disc cuts the **far ridges first** — the skyline. At r=5,000 you keep the front range and lose Mt. Wilson and the crest. **Only the hero/street view can say whether the near ridge already occludes them.** If it does, r=5,000 is free. If they're the skyline, the cut wants to be **directional** (generous north, tight E/W), not a circle. The overhead cannot answer this.

**This is `bake-landscape` — it does NOT touch OPEN #1.** Both are "too much geometry"; they're unrelated. Don't let one read as fixing the other.

### 3. ⚠️ `MountainBackdrop` will crash in production
`MountainBackdrop.jsx:68` — `const channel = (landscapeOverride ?? scene?.landscape ?? DEFAULT).values`. A Look may opt in **without overrides**, so `scene.landscape = { source }` with no `values` is VALID → `channel` is `undefined` → `channel.snowline` (`:218`) **throws**. Works today ONLY because Stage passes a live `landscapeOverride`. **No override — i.e. production — Altadena white-screens.** One line: `.values ?? LANDSCAPE_FLAT_DEFAULTS`. Drafted; the edit was interrupted and never applied.

### 4. D6d — the FILL perf gate (`SECTION.md §7` names it THE gating item)
> *"Every override re-strokes the whole map; interactive handle/drag work **can't be cleanly validated** until the rebuild is block-local."*

**Half closed.** T4 removed the V2 half — Jacob: *"the authoring tool was 100% more responsive"* (eye-verified, LS). `sectionOpen` has a block-local cache (`sectionCacheRef`); **`parcelInteriors` (7–8 s) and `compose` (3.5 s) have none** and re-run whole per edit. LS feels fine; Altadena would be ~13 s/edit.

### 5. T3 — the last figure-ground organ
`buildBlockGeometryV2` survives ONLY as the frontage-edge identity builder (`feCustomKey` = `[chainSkelId, side, min(segOrds)]`) that Survey/Measure resolve customs against. **The tile `runs` already carry the identical triple** (`tileGround.js:935`) — a duplicate derivation. Migrate it and the file dies. ⚠️ **Gate on key parity** (`scratch/t4-fe-parity.mjs`): `blockCustoms` hashes off this key, so a drifted `segOrd` doesn't error — it **silently orphans every authored custom**.

### 6. Housekeeping
- **Strip the `[LOAD-FORENSIC]` instrumentation** (`BlockGeometryV2Debug.jsx`) — throwaway; the load is settled.
- **Unverified:** `terrain.bin` is in the slab with a *coarse 64 m* ground → the runtime bends a 64 m mesh over 1,480 m of relief. Might be exactly "coarse ground detail"; might read blocky. **Nobody has looked.**
- `undefined/p3-ls.json` at root — trees/census fallout, not this arc.
- Canon folds owed: pour/Look + landscape-intake doctrine → `NEIGHBORHOOD-INPUTS §11` / `INTAKE.md`.

---

## What landed (all on `curb-offset-draw`)

### The load: ~180 s → ~18 s

`DESIGNER-LOAD-FORENSIC.md` has the budget. **Four independent things, each ~fine at LS scale:**

| commit | what |
|---|---|
| `37c537b0` | **The forensic.** `buildBlockGeometryV2` was **94.8% of a 320 s CPU budget and drew nothing.** |
| `7f16d2a1` | **Gate it** on `surveyActive‖measureActive` → 320 s → 16 s (Design view only). |
| `4044bca1` | **T4 — delete figure-ground.** ~1,900 lines. `isTileScene` was hardcoded `true` → the whole render branch **unreachable**; `frontageBands` (214,759 ms) + `blockFill` (61,989 ms) + `ribbonUnion` (6,773 ms) = **99.4% of the emitter**, all feeding it. Also `buildChainBandsLive` (the census's *"residual third representation"*), the band emitters, `_v2Blocks` (read NOWHERE), `measureDragging`, `buildV2BakeShape` (dead-in-place since T2). **285 s → 0.45 s.** fe parity EXACT (733 LS / 4,068 Altadena, byte-identical). |
| `72bbc989` | **The race.** `frozenShape` had no *pending* state, so between mount and the fetch resolving `tileGeos` fell through to a full `buildTileGround` — **27.5 s, three times, all discarded.** Plus `_loadCenterlines` deduped (StrictMode ×2 + `if (import.meta.hot)` firing at **module eval**, not on hot update). |
| `59e5f109` | **Build ONCE.** `sectionGeos` built **4×** (~70 s). Triggers, named by instrumentation: `FIRST RUN` (stencil=null, default curbWidth → **wrong, discarded**) · `liveStreets(set→set)` (nothing selected → **pure waste**) · `stencil(null→set)` · `curbWidth+blockCustoms` (**the only correct build**). Hoisted `selSkel`; gated on `stencil` + `_designHydrated`. |
| `78a15273` | **My regression.** `59e5f109` made `sectionGeos` return null while *waiting*; `tileGeos` gated on its **output**, so `buildTileGround` came back. Replaced two ad-hoc gates with one named concept — `frozenNotReady`. Truth-tabled all 8 paths. |

**Remaining ~18 s, attributable:** `parcelInteriors` 7.2 s · `sectionOpen` 2–7 s · compose 3.5 s (curb 1.8 + asphalt 1.2) · `pathGeoByKind` 1.9 s · **GPU upload ~15 ms** (a hypothesis the console killed).

### The landscape family — four leaks, one root

`landscape` carries a **Stage-intake declaration** (`source`) but was wired as a generic knob-channel that only understands `values`.

| commit | what |
|---|---|
| `d32fab73` | **`"design is not defined"` — every bake 500'd since `a20619cc`.** A bare `design` reference in a scope that only had `DESIGN` (a *path*). **The fix meant to make the pour safe is what broke the pour**, and it shipped without anyone clicking Bake once. This is why "Full Altadena slab bake" was never done — it *couldn't* be. |
| `13a3c370` | **Stop writing a mountain into every Look.** `serializeDesign` wrote all channels unconditionally, and the store seeds `landscape` from `LANDSCAPE_FLAT_DEFAULTS` — which **hold the real San Gabriel values** (`snowline 1500`, `distance 5400`; the "defaults" are a measurement, hardcoded — that's why they're misnamed). Jacob's first LS Section edit autosaved a mountain into **PROD**. Also: `migrateGroupChannel` returns `{values}` and **ate `source`** — latent, but the day the Stage upload flow lands, the first design edit would silently delete the operator's mountain. |
| `f24ae945` | **Stop stamping it at bake.** `bake-scene.js:134` fell back to the same defaults, so removing it from design.json alone didn't help. |
| `65b6d6a1` | **`--source`.** `a20619cc` moved the assets to `_landscape-intake/` and passed `--source=` but never taught `bake-landscape.js` to read it. |

**Three halves of one fix, none of them ever run.** Closed now at all three ends: `a20619cc` (not from FILES) · `13a3c370` (not from DEFAULTS in the store) · `f24ae945` (not from DEFAULTS at bake). Plus `source` survives a design edit.

> **The rule, Jacob verbatim (2026-07-15):** *"The OSM terrain comes in with the initial intake… The mountains, separate from the terrain, as a set piece, are uploaded by the user in the Stage panel, so in the 'chronology' I'd rather just keep them **extremely separated** to avoid even the opportunity for confusion or accidental reading/load-in."*

**Still missing:** nothing SETS `landscape.source` — `serve.js:1794`: *"Until the Stage upload flow sets that, the pour emits no landscape."* Altadena's was set **by hand** to `cartograph/_landscape-intake/altadena/terrain/sangabriel.obj`. **The Stage upload flow is unbuilt** — and it's now safe to build.

### `faa3278e` — SCENE BLEED (read this one)

Jacob switched the extent to LS, clicked **Measure**, and **Altadena's centerlines came up.** Two bugs:
1. **The `_loadCenterlines` dedupe was scene-blind** (`if (_clInFlight) return _clInFlight`). The impl captures `get().scene` at its start, so switching mid-flight (Altadena takes 20–70 s — *ordinary*, not exotic) handed LS's caller **Altadena's promise**. Now scene-keyed.
2. **PRE-EXISTING and worse:** every `set()` lands **after an await** with no scene check — the old hood's load completes and writes **its** ribbons/geography/boundary/centerlines/**design** into the new hood's store. Five writes, five `stale()` guards.

Simulated: **scene-keying ALONE still loses** — the stale write wins. It takes the guards.

**Why it matters more than a wrong render:** LS is PROD and he was in Measure. Authoring against a foreign hood's centerlines writes `blockCustoms` keyed by **that hood's** identities — the silent-orphan mode, same family as the Looks-pulldown masquerade (`79bc1584`).

### Altadena's terrain — the doctrine change, half-done

`bake-terrain.js` was **already scene-generic** (*"No installation is privileged: LS bakes through the exact same path as every poured town"*) and already runs **between the Design tools and Stage** — exactly where Jacob said elevation belongs. **Altadena was flat only because nobody had fetched its DEM.**

- USGS `n35w119` from the **S3 staged-products mirror** ([[reference_usgs_dem_s3_mirror]] — never EPQS; 0.7 s vs ~45 min).
- `bake-terrain --scene=altadena` → 1750×1750 @ 5 m, **221→1,701 m**, 0 misses, **0.7 s**.
- Then `bake-ground` → **26.3M tris / 457 MB / 88 min** → **OPEN #1**.

---

## REVERTED — the mountain stencil cut (`56364a8d`). Read before retrying.

I cut the DEM with the hood's disc — dropped tris whose centroid was **inside** the boundary. **Wrong, instructively.** It removed the **hole under the town** and left the **RING**: ~3.5 km of DEM due **east**, ~1.6 km due **west**, at the town's own latitude. Jacob: *"You stenciled out the wrong directions."*

**The error was conceptual, not arithmetic.** A stencil is a **containment** test; a backdrop is a **visibility** question — what can be seen from the town, and in which direction. Different questions; the disc could never answer this one. No radius fixes it. Jacob's word for the right model is a **curtain**: not a clipped volume but *a surface hung at a distance, facing you* — which may not want the DEM at all (655k tris of true topography to draw a skyline is possibly the wrong instrument). **Deferred until specified** — his call, twice.

**Kept:** `cartograph/sceneStencil.js` — `loadSceneStencil` extracted from `bake-ground` so the bake side has ONE derivation from the extent SSoT (verified identical for LS / Altadena / toy). Jacob: *"the stencil has a SSoT and it's in extent."* ⚠️ A Designer-side twin remains (`CartographApp stencilFromBoundary`) — unifying is a separate pass.

---

## LS (PROD) — clean. Read before touching LS.

Slab untouched all session. `design.json` carries **only** `mackay-place-0` — a real Section edit (treelawn 1.5, sidewalk depths, LU↔SW swap; correct scene, correct per-fe shape, and the first behavioural proof T4 left Measure intact). The mountain block that leaked in was **stripped textually**, never re-serialized ([[feedback_json_stringify_loses_handauthored_format]]).

> ### ⚠️ The hazard worth carrying forward
> **Applying/committing an extent on an already-authored hood RE-CENTERS it.** An LS Extent apply moved `center [-15,-15] → [0,0]`, re-poured, reprojected `ribbons.json`, re-baked in the shifted frame. **The Look design survived — which is the trap:** `blockCustoms` / corner overrides hash off **bbox-derived block keys**, plus shot bounds and hero keyframes. Shift the frame and authored work isn't deleted, it's **silently orphaned**.

**Doctrine:** the exclusion-band / pen tooling is Altadena-shaped. LS predates it and doesn't want it.

---

## Gotchas — don't relearn these

- **NEVER partial-bake against PROD.** Standalone `bake-ground.js` **drops `poolmap`/`colormap`**.
- **`console.time` is wall-clock — it measures STARVATION.** `[SML] map fetch+parse: 102s` was ~1 s of network behind 100 s of blocked main thread. It cost a wrong hypothesis; read every timer that way.
- **Vite returns HTTP 200 + `index.html` for ANY missing file under `/baked/`.** So **every `if (!r.ok)` guard on a slab artifact is dead in dev**, and behaves differently in prod. It's why a missing artifact reports `Unexpected token '<'` instead of 404.
- **`push(...arr)` blows the call stack at ~300k args.** Reassign.
- **Toy has NO fade** — `boundary` with no `fade` = rectangular clip, no radial dissolve. Any stencil work must keep that path.
- **The adaptive ground refine already exists and is the default.** Don't "add" it.
- **Measure on a copy, and cap the experiment.** An uncapped measurement bake overwrote the slab with 457 MB and cost 88 min.

---

## Process notes

The previous session named a pattern: *"a confident theory pointing away from the measurement in front of me."* It recurred — mine this time — and the shape is worth having:

- **I was wrong every time I reasoned instead of measured, and right every time I measured.** GPU-upload (12 ms, not seconds) · the `dataToEsm` theory (173 ms, not seconds) · "compose → React commit" (it was `parcelInteriors`). Each died to one console line. Conversely, *"the gap is the point"* found nothing the instrumentation wasn't already printing.
- **My own greps lied to me twice, by case.** `setFrozenPending` doesn't match `frozenPending`; `setSectionCurbRings` doesn't match `sectionCurbRings`. The second nearly had me report a regression I hadn't caused.
- **A fix that closes a race can open one.** `59e5f109` fixed `sectionGeos` and reopened `tileGeos` — because the gate asked about **output** instead of **intent**. Name the condition once (`frozenNotReady`).
- **Jacob's eye caught what no harness could.** The `buildTileGround` race exists only in the window between two async arrivals; a Node harness that calls functions in order cannot see it. *"Proxy renders mislead; the operator's eye is the gate"* earned its keep twice.
- **Three separate bugs were half-finished fixes never run once** (`a20619cc` alone: the bare `design`, the un-taught `--source`, the eaten `source`). Running the thing you fixed, once, catches all three.
- **When Jacob says the model is wrong, stop.** He said *"I don't even think that's the right solution anymore"* and I reached for the stencil anyway, because it was the tool in my hand. The disc was never going to answer a visibility question.
