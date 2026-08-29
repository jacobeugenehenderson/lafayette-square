# Arborist Architecture

> Part of the **arborist quartet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`). Load-bearing patterns specific to the tree helper. The kit-wide publish-loop pattern lives in `../cartograph/ARCHITECTURE.md`; this doc covers how it specializes for trees + the algorithms + the master-atlas innovation + the cartograph↔arborist boundary.

> 🌳 **The kit-matcher is the Arborist's architecture now (its front); these patterns are the KEPT spine it rides.** Front door: **`ORIENTATION.md`**. The publish-loop / single master atlas / 2-bind material / decimation levers documented here are **KEPT and ridden unchanged** — no fork (`feedback_no_parallel_pipeline_for_scenes`); the front (rubric → dossiers → matcher → Coverage → Library → Salon, **built** 2026-06-18/20) sits **on top**. New front modules live beside this spine: `rubric.json` · `dossiers/` · `ingest.js`+`ingest-tagger.js`+`library-builder.js` (→ `part-index.json`, `public/library/`) · `matcher.js` · `readiness.js` (→ Coverage) · `salon-options.js` (→ the Salon pickers). Doctrine: **no-cull** — every tree paints. ⛔ **Procedural + LiDAR are RETIRED, not peer tracks** (Jacob, 2026-08-23 — see §Procedural + LiDAR internals).

---

## Publish-loop pattern, applied

Arborist is one of four kit helpers (Cartograph / Arborist / Meteorologist / Courier) per `project_kit_helpers_pattern`. Each publishes one artifact through a pipeline of pure stages. For Arborist:

```
Authoring (the Salon)
    │  writes operator state under arborist/state/<species>/
    ▼
generate-salon.js        (compose from chassis · bark · leaf)
    │  emits a source GLB to /tmp
    ▼
publish-glb.js
    │  variant detection (namesSuggestVariants / nodesSpatiallySeparated)
    │  Brief 6.2 stamp — stampAtlasKind on variantDoc (atlas-kind-classifier.js shared with survey-deleaf)
    │  Brief 6 Lever 3 — decimateLeafPrimitives (card-aware leaf reduction, in-line import from decimate-tree.mjs)
    │  Brief 6.2 Lever 5 — decimateBarkPrimitives (connected-mesh bark, MeshoptSimplifier.simplifyWithAttributes at higher error tolerance, Linden-class only)
    │  Brief 6.3 Lever 6 — decimateLeafPrimitivesConnectedMesh (connected-mesh leaf, same machinery, leaf-side tuning: uvWeight 1.0 / error 0.02, Linden-class only)
    │  Brief 6 Lever 4 — adaptive simplify-to-bracket per LoD tier (replaces fixed 0.85/0.40/0.10)
    │  manifest emission, helper-mesh filtering, normalizeScale
    ▼
public/trees/<species>/{skeleton-N-lod0/1/2.glb, tips-N.json, manifest.json}
public/trees/index.json
    │
    ▼
bake-look.js              (per-Look, called by Grove on roster change)
    │  unifyAtlases — sha1-dedupes bark + leaf tiles across the roster
    │  emits master color + normal PNGs
    │  surfaces barkBySpecies into trees-atlas.json
    ▼
public/baked/<look>/trees-atlas.json + master PNGs
    │
    ▼
bake-trees.js             (substitution + per-placement geometry)
    │  pickVariant: speciesMap.map?.[parkSpecies] wins first; category fallback
    │  emits per-Look placement-substituted GLBs
    ▼
public/baked/<look>/trees/<species>/...
    │
    ▼ (runtime — consumed unchanged by deployed runtime)
src/components/InstancedTrees.jsx
```

**Foundational stages stay untouched across the v1.5 arc.** `publish-glb.js`, `bake-look.js`, `bake-trees.js`, `atlas-pack.js`, `atlas-survey.js`, and the runtime `treeAtlasMaterial.js` did not fork in any phase — generator output adapts to what they expect. This is the no-parallel-pipeline rule (`feedback_no_parallel_pipeline_for_scenes`) applied to a helper: one publishing channel, one runtime consumer. **Brief 6 (Spindle, 2026-05-22) + Brief 6.2 (Adze, 2026-05-23) + Brief 6.3 (Gnomon, 2026-05-23) extend `publish-glb.js`** with tree-aware decimation: leaf-card reduction (Lever 3, importable from `decimate-tree.mjs`), connected-mesh bark decimation (Lever 5, ditto), connected-mesh leaf decimation (Lever 6, ditto), adaptive simplify-to-bracket (Lever 4 inside `emitLod`). The pipeline shape and the no-parallel rule are preserved — the publish step gets richer, but the publishing channel stays singular. **Topology discriminator across the leaf levers:** all three leaf-touching levers gate on `extras.atlasKind === 'leaf'`, then split on `max-vert-use`: Lever 3 owns card-based (`=== 1`, e.g. Robinia's 4-vert quads), Lever 6 owns connected-mesh (`> 1`, e.g. Linden's sculpted leaves). Disjoint by construction — a leaf prim is never touched by both. Lever 5 (bark) and Lever 6 (leaf) gate on disjoint `atlasKind`, so their order is irrelevant. **Decimation-arc floor finding (Gnomon, Brief 6.3):** with Levers 5+6 both firing, Linden's lod2 still misses bracket — but the floor-bearer is now provably the **bark** prim, whose attribute-aware (UV-locked) simplify floor is ~57.7K tris regardless of error budget; the post-Lever-6 leaf prim collapses freely to ~100 tris under emitLod and is no longer a floor-bearer at any LoD. Clearing lod2 on Linden-class connected-mesh chassis is a Lever-5/Lever-4/bracket problem, not a leaf problem — see `scratch/brief-6.3-leaf-decimation-survey-gnomon.md`. **`arborist/atlas-kind-classifier.js`** is the single source of truth for LEAF/WOOD/AMBIGUOUS keyword classification, imported by both `publish-glb.js` (stamps `extras.atlasKind` on raw vendor variantDocs so the decimation gates fire) and `survey-deleaf.js` (chassis emission). Per [[feedback_classifier_keyword_cross_check]] — one keyword set, two consumers.

**Botanical mature height ships through `publish-glb.js#normalizeScale` (2026-06-25, `393c3646`/`bac11a43`).** `normalizeScale` now targets each species' **dossier mature height** (`required["chassis.size"].target`) instead of a per-category `TARGET_HEIGHT` — so trees render relatively-correct in LS (a sugar maple ~21m towers over an ~8m dogwood), matching what the Salon preview shows. `arborist/mature-heights.json` is an explicit **stopgap** for species whose dossier carries no usable height. ⚠️ **"Until real dossiers land" is the WRONG TEST.** The real condition is a **settled** `chassis.size` — a dossier existing proves nothing. **The stopgap is still load-bearing; retiring a row because a dossier exists would silently break scale for that species.** *(2026-08-25's example — `oak_bur`/`blackgum`/`linden_american` carrying `chassis.size: null` — has since been settled and they now carry real bands; the LIVE example is `quercus_alba`, nulled 2026-08-28.)*

> ### ⭐⭐ AND THE BAND WAS IN THE DOSSIER ALL ALONG, UNDER AN UNREAD AXIS *(Jacob, 2026-08-28: "there's no way we didn't get the values for silver maple")*
> `bake-trees#bandFor` read only `chassis.size.band` — sourced from ncsu/selectree, which reached 22 of 33 dossiers — so **7 of 10 LS species rendered at a FLAT 1:1, 69.4% of placements.** But **every** dossier was hydrated with the USDA pair, both `sourced: true`: `chassis.size_20yr` ("Height at 20 Years, Maximum") → `lo`, `chassis.size_max` ("Height, Mature") → `hi`. Silver maple: **13.7–27.4 m**, sitting unread in the same file. A real street population spans 20-year-old to mature trees, so this **is** a band, not a stand-in. `chassis.size.band` still wins; USDA is the fallback. ⇒ 100% of LS placements now vary.
> ⛔ **A `null` here can mean CONTESTED, not missing** — sources answering different questions. `quercus_alba` minted at **41.1 m** (ncsu forest-grown) against USDA's 30.5 m and selectree's 18.3 m; unguarded it would have shipped **519 white oaks at 41 m**. Nulled as contested, minted value kept under `chassis.size.mintedAs`. ▶ The real resolution is the `size_urban` / `size_natural` split — `BACKLOG.md` 2026-08-28.
> ▶ `node scratch/claims-every-placed-asset-has-a-size-band.mjs` — ranks by **placed** demand, which is the only axis that predicts render load. ▶ check before retiring any row: `node -e "const d=require('./arborist/dossiers/<id>.json');console.log(d.required['chassis.size'])"` (`project_dossier_annotation_is_first_class_ip`). ⚠️ **Flat-key gotcha:** dossier `required` uses rubric-axis-id keys (`required["chassis.size"]`), NOT nested (`required.chassis.size`) — the nested path silently no-op'd both the preview scale and the bake until corrected. A slab baked before this lands shows the old 12m-category trees → fix is a clean full `/grove/bake`.

**⭐ Weight vs. canopy-density are SEPARATE owners — do not conflate (2026-06-24).** The tree-**weight** win is the **bark smooth-weld** (`smoothWeldBark`, decimate-tree.mjs — recomputes smooth normals + welds the flat-shaded vendor soup so `simplify` can collapse bark by *topology*; **independent of the per-LOD `error`**). **Canopy density** is owned by each LOD's `error` in `publish-glb.js#LODS` (looser error → the bracket walk collapses more leaf CARDS). These are orthogonal: you can have light bark AND a full canopy. **`LODS` is the per-LOD policy, and lod1 is the HERO LOD** — both the Grove gallery (`bakedGlbUrl` defaults to **lod1** since 2026-08-28 — lod0 is no longer published) and the LS hero view render it, so **lod1 must keep a full canopy** (`error` 0.002). **lod2 is the far/overhead browse LOD** where leaf sparsity reads fine + DoF covers it, so it stays loose (`error` 0.05) for weight. ⛔ Regression bankrolled: `6c3ff5e5` loosened lod1 `error` 0.002→0.02 to shed weight via leaf-collapse — but that thinned the hero canopy ~90% (birch lod1 1,620 of 15,659 cards), surfacing as "Grove/hero trees are sparse specks" while the live Salon (no `publish-glb` decimation) looked correct. Reverted in `4f9c9a77`. The right place to shed lod1 weight is *not* the leaf `error` — and as of 2026-06-25 it's *not* the per-context cull arc either (see the tree-render reality below).

---

## Tree-render reality at LS (2026-07-22) — the IMPOSTOR IS THE FOUNDATION; geometry is an enhancement on the TALLEST trees

This is the load-bearing as-built of how Arborist trees actually render in production today, and the doctrine that governs how that changes. Design record: `_handoffs/HANDOFF-hero-impostor-foundation.md` (locked at standup 2026-07-17, built by Slat, merged to trunk `3e809a56` 2026-07-22).

**⭐ THE SPLIT — every tree paints; the tallest slice gets geometry.** The impostor is the **foundation, not the fallback**. Every placement renders as a canopy impostor by default; the **tallest `heroGeomFraction`** (default **0.15**, live via `?heroGeom=`) keeps real `lod1` mesh as the **anchors** — sprinkled through the whole depth of the scene, not clustered in a front row, so articulated branch-motion and real parallax read as truth-anchors while the impostor sea between them breathes. Tallest is the rule because that is where geometry earns its cost (crowns break the skyline, most parallax against the sky, worst to fake) and because it is **scene-generic** — it ports to town #2 and #3, unlike a hero-pan-prominence classifier. The selection is **stable at load** (a tree's height never changes → no thrash), which is why it is *not* the banned per-frame camera-distance swap. Doctrine it satisfies: **the LOD ladder is baked; the selection is runtime.**

> ⛔ **THE CULL IS RETIRED in foundation mode — do not reintroduce it as a density lever.** `classifyHeroTiers`'s `cull` verdict ran *before* the split and dropped most of HPDM onto bare ground with shadow-spots where trees should be (`ca38ad66`). Impostors are cheap billboards; nothing needs dropping. The legacy `cull`/prominence-role path survives **only** for foundation-off looks (no `heroImpostorBySpecies` record, or `scene.heroImpostor === false`). If density looks thin, the question is *"is the foundation on for this look?"* — never *"should we cull less?"*
>
> ### ⛔⛔ AND "IF DENSITY LOOKS THIN" WAS THE WHOLE DEFECT — it made a human the detector *(Jacob, 2026-08-27)*
> **The ground stamps a contact-shadow ring for EVERY placement, unconditionally, at bake** (`ground.poolmap.png` G channel, `groundColorState.js:22`) — while trees hydrate at runtime. So a foundation-off look renders **rings over bare ground and still looks like a map.** ⭐ **Jacob's tell, and it is the instrument: *"if you look at the ground and see circles without trees, we are not hydrating fully."*** The retirement above is real but **conditional**, and every look that never had its hero impostors shot is still living in the pre-retirement world — including, when this was written, the **staging** target.
> - ⛔ It was **silent**: `heroCulled` sat mid-string in an info-level `console.log` while its two *lesser* siblings (`meshNoRecord`, `legacyRoles`) each had their own ⛔ warn. It now warns, naming the look, the count and the fix (`InstancedTrees.jsx`).
> - ▶ **Offline, every look at once — this is the check, not the prose:** `node scratch/claims-every-shadowed-placement-renders.mjs`. It **pins** the two runtime lines it models and refuses to report if they drift. ⛔ Never quote a cull count from this doc; run it.
> - ⭐ **The fix is always to SHOOT the missing impostors in the Grove** (browser-GPU; the CLI bake cannot reproduce them), never to widen or re-tune the cull. An authored `scene.heroImpostor === false` is the **operator's decision** and the check reports it as such.

> ### ⛔⛔ SEATING: THE LIFT IS THE SHADER'S JOB, OFF A LIVE UNIFORM *(2026-08-28, Jacob's eye twice)*
> **1. `y: 0` in the slab is a SENTINEL, not sea level.** Every placement carries it. The impostor
> consumers read `typeof inst.y === 'number' ? inst.y : getElevationRaw(...)` — and `typeof 0` is
> `'number'`, so the lookup never ran and **4,867 hero cards sat under 2.6–34.8 m of terrain.** The
> mesh path survived only because it reads `groundRaw` and falls back on `undefined` — **a value the
> sentinel cannot counterfeit.** ⭐ That is the defence: fall back on something the sentinel can't fake.
> **2. THE EXAG IS AN ANIMATED PER-SHOT UNIFORM, NOT A CONSTANT.** `targetExag = street ? 1 : browse ?
> 0 : V_EXAG` — **Browse draws the ground FLAT.** A matrix-baked `raw × V_EXAG` is right in Hero and
> up to **52 m adrift in Browse**. ⇒ `treeGroundRaw()` returns RAW; `OVERHEAD_GROUND_LIFT` applies
> `aGroundRaw * uExag / _instYScale` in the vertex shader — the identical lift the mesh path has
> always used (`terrainShader.js:345`), which is why mesh trees ride the ground down and impostors did not.
> ⛔ **You cannot bake a tween.**
>
> ### ⛔⛔ AND THE EYE-GATE WAS BLIND TO THE ONLY TIER IT EXISTS TO CHECK
> `?heroTierQC=1`'s magenta was wired ONLY into `injectImpostorBillboard` — the **KILLED** octahedral
> impostor, zero instances on every slab — while a comment claimed it covered the captured billboards.
> So the QC view painted nothing and **the absence of magenta read as the absence of IMPOSTORS**,
> costing most of a session. Now on `injectHeroImpostorStamp`, where the live tier is.
> ⭐ **An instrument's silence is not evidence of absence — prove it REACHES the thing first.**
>
> ### ⚠️ THE IMPOSTOR TIER IS NOT CHEAP — 1.2× THE MESH IT REPLACED
> Each card is a **20×20 grid = 800 tris**, ×3 cards/tree = **2,400 tris**; 4,867 trees = **11.68M**,
> against 10.13M for the 260 mesh trees. A billboard is 2 tris. The tessellation is what buys the
> flutter, so it is a real trade — but it was never chosen. ⭐ **Jacob's lever (2026-08-28): only the
> FRONT leaf shell needs to flutter; the under shell and bark can be flat cards on randomised
> figure-8 paths.** front@20 + 2 flat = **3.97M (2.9×)**; front@12 = **1.48M (8×)**, no silhouette loss.
> ▶ `node scratch/hero-actual-triangles.mjs`

**TWO impostor systems, split by VIEWING HEMISPHERE — both live.** They are different constructions of the same tree, not competing versions; a top-down cross reads as an ugly line and a hero-viewed disc-stack reads as flat plates, so each hemisphere gets its own carrier:

| | **Overhead / Browse** | **Hero / side-on** |
|---|---|---|
| landed | 2026-07-10 (`a4458f4a`) | 2026-07-22 (`3e809a56`) |
| carrier | 3-slice horizontal snapshot (canopy / mid / branch), stacked for vertical parallax | azimuthal canopy bands — N azimuths × shells, camera-facing billboard |
| manifest key | `overheadBySpecies` | `heroImpostorBySpecies` |
| selected by | camera height (`useOverheadMode` → `viewMode === 'browse'`) | the height split at load (all non-anchor trees) |
| runtime | `OverheadTrees.jsx` | `HeroImpostorTrees.jsx` |
| baker | `OverheadBaker.jsx` | `HeroImpostorBaker.jsx` |

Both are **RTT captures of the real tree** — rendered from the actual `lod1` geometry through the shared atlas material — so colour, season and character match the mesh trees by construction. Both ride full optical parity (shared wind uniforms, weather relight, DoF/fog/grade) on one shader program. Both are **browser-GPU authored** on Bake→Slab and **carried** by `bake-look.js` — neither can be regenerated by the CLI bake, so a merge or a re-pour must preserve those manifest keys, never re-derive them.

⛔ **`impostorBySpecies` / `buildImpostorGeometry` (the whole-tree octahedral cross) is KILLED, not parked — do not revive.** It read as "floating dark leaf-slabs + a stone trunk" (operator, 2026-06-25). It is a *third*, analytic construction that predates both captures above; `bake-impostors.js` and `ImpostorSpecies` remain on disk only as the seam the foundation grew out of.

**Visual distance is owned by the depth gauges** (DoF CoC-by-depth + fog) — "DoF is the cover, not the cut." Far impostor cards are blurred for free; the far-field look is a depth-gauge concern, orthogonal to which representation a tree is.

**▶ OPEN on this arc** (Phases 3–4 of the brief, plus what the merge surfaced):
- **Weight is additive today** — the hero variety pool is **~70 MB** of PNG (leaf albedo 54 · bark 9 · AO 6), heavier than the 39 MB of `lod1` it relieves, and the anchor species still load their GLBs. **KTX2/Basis is REQUIRED, not optional** (~54 MB leaf → ~8–10 MB); secondary levers are azimuth count and persist resolution.
- **`dbh` is standing in for height** in the split (`InstancedTrees.jsx` ~L801). The brief calls for the bake to stamp real height; dbh is a proxy that happens to correlate. Fold the real measure in with the next bake.
- **Phase 3 streaming** (order GLB loads by pan-appearance, per-tree impostor→mesh crossfade) and **Phase 4** (the Stage geometry-budget knob writing the slab threshold) are unbuilt.
- ⛔ **BLANK BANDS ARE TWO CAUSES, NOT ONE (2026-08-28).** ① **The duplicate-id class** —
  `nyssa_sylvatica` / `acer_saccharum` are the RAW Latin twins of composed `blackgum` / `maple_sugar`;
  category fallback picks them, they have no composition, so they *cannot* capture. Re-baking never
  clears it. [[project_one_tree_two_library_ids]] · `BACKLOG.md` 2026-08-28. ② ✅ **THE FRAME BUG — FOUND AND
  FIXED 2026-08-28.** `prepareOverheadBands` cut the bands from raw `position.y` (chassis-LOCAL)
  while `renderTreeToTexture` clips `near`/`far` as `camY − y` (WORLD). Every GLB carries a node
  scale, so the cuts were off by it: **scale ≥ 1 pushed them inside the crown and always passed;
  scale < 1 pushed the top cut above it** and the canopy band rendered empty space — a transparent
  PNG, indistinguishable from a thin canopy. `maple_silver` (0.707) retained **2%** of its canopy
  band, which is why it "kept failing" and why a retry sometimes rescued it (the sliver's leaves
  move under the live sway uniforms). Both measures are world now; `chassisMinY/YRange` stay LOCAL
  because `stampTreeVertexAttrs` normalizes local positions against them.
- **Three overhead bands baked BLANK and shipped undetected** — `platanus_acerifolia` canopy+branch, `linden_american` canopy (measured 2026-07-22, `scratch/overhead-band-coverage.mjs`). Root cause for the platanus: `applyBarkUniforms` sets `uBarkTileScale (0,0)` when a species has no `barkDetailBySpecies` record, so all its bark samples an empty atlas region — and only Salon-composed species get that record, which the merged London plane never was. `OverheadBaker` now **refuses to POST a species with any blank band** rather than shipping a hole. ✅ **The linden's canopy was the FRAME bug above** (scale 0.782 → 27% retained), not a second mystery.

⭐⭐ **THE RULE, AND IT IS THE TRANSFERABLE PART: THE FRAME A BAND IS CUT IN MUST BE THE FRAME THE CAMERA CLIPS IN.** The same slip also shipped the card **height** in the wrong frame — `maple_silver` 29.7 m for a 21.0 m tree, `picea_abies` **681 m** on HPDM — because `heightM` came off un-transformed geometry bboxes while `canopyRadiusM` was already world-corrected. ⛔ One record, two frames, and nothing said a word. **A look baked before the fix carries wrong heights and must re-bake.**
▶ `node scratch/claims-the-capture-frame-is-the-clip-frame.mjs` — pins both measures + the cut rule, and reports any stored height that is not the GLB's world height.

> ⚠️ **The GPU "gauge" is NOT a perf signal.** The Preview emulator gauge is a count-vs-**interim-fake-budget** verdict (draws/200, tris/1M) that **ignores frame-ms and reads red even with no trees on screen.** It drove a whole tree-degradation arc (the impostor-tiering "gauge is red → geometry must go" reasoning) that was then reverted. **Gate tree perf on real device frame-ms + the operator's eye on the cinematic pan** ([[feedback_instrument_verdict_then_fix]], `[[project_smooth_pan_is_the_only_perf_target]]`) — the pan's visible set is fixed/predictable, so it's the only surface that must be smooth. Fixing the gauge's fake budgets is a backlog item, not a render trigger.

---

## The Grove Hero↔Browse preview — TAKES the player's animation (2026-07-16)

The Grove (`src/arborist/Grove.jsx`) has a **Hero / Browse** view toggle that previews trees through the **same slab consumers the universal player uses** — Hero = the lit 3D specimens; **Browse = `OverheadSpecies`** (the exact overhead disc the map ships in plan view, fed by `useOverheadAssets` off the last bake's `overheadBySpecies`). So the Grove is a *faithful* slab preview, not a lookalike: a defect visible in Browse (e.g. a near-blank conifer capture) is exactly what the slab renders.

**The Hero↔Browse transition takes the player's animation — it does NOT own or fork it** (the staging doctrine: what you stage = what ships). It reuses the shared **`createCameraTween`** (`src/preview/cameraTween.js` — the same `easeInOutCubic` + up-vector tilt the player runs Hero↔Browse) to move the Grove camera, and uses that tween's eased progress `e` to **crossfade the tree forms** (3D specimen fades out as the overhead disc fades in). `TransitionDriver` ticks the tween per frame; `OrbitControls` is disabled during it (`feedback_orbitcontrols_disable_to_drive_camera`). Fixed timing, **no knobs**. Browse is a true straight-down view (up-vector tilts to `[0,0,-1]`, rotate disabled — never tilted, the player's real plan projection).

Ambient life: **`GroveWind`** drives a constant gentle breeze (`HERO_BREEZE_MPS`) into the **shared `treeSwayUniforms`**, so both forms are alive in the Grove even though it has no live weather feed (the player drives the same uniforms from the weather directive). The **axial repeller** (`OverheadTrees.jsx#OverheadSpecies` per-instance Y offset) that keeps overlapping discs from z-fighting is in the shared consumer, so it fixes the slab's browse view too. *(Operator-facing: `arborist/FEATURES.md §Grove` — ⛔ **not** `OPERATIONS.md`, which is named across the suite but has never existed.)*

## Two-tier substitution (heroes on top of fillers)

Five morphology fillers and ~5 hand-tuned heroes coexist in the same roster.

⚠️ **The `procedural_*` fillers this section was written around are GONE from the runtime pool** — the
NO-FILLER gate excludes them from `index.json`, and `bake-trees#pickVariant` draws only from
`index.variants`. What survives is the *mechanism*: preferred-species routing wins, category fallback
covers the rest, and quality breaks ties among candidates.
⛔ **The LS routing map still points 49 roster names at `procedural_*` ids that can no longer ship.**
Those routes are inert and the census falls through to category fallback. `LEDGER-exorcism-wren.md §B`.

`bake-trees.js:pickVariant` already implements the lookup: `speciesMap.map?.[parkSpecies]` (preferred-species via the scene's `cartograph/data/<scene>/tree-species-map.json`) wins first; category fallback covers everything else. Heroes win their bucket's quality lottery automatically (`4 > 2`).

**Same mechanism is how SpeedTree would slot in at v2.** Imports get authored at `quality: 4+` and win their bucket. Substitution is the safety net; authored trees are the visible product. No new code; just authoring.

**Hand-authored / vendor species** (e.g. `platanus_acerifolia` ×9) coexist at whatever quality the operator rates them in the Grove. The operator-rated `qualityOverride` field wins over `quality` per `build-index.js` (`effQuality = v.qualityOverride ?? v.quality ?? 0`).

---

## The Grove's single master atlas (load-bearing innovation)

`bake-look.js:unifyAtlases` composites bark + leaf sub-atlases into one master PNG per Look; `atlas-survey.js` dedupes tiles by sha1 hash before pack. Adding hero species costs nearly nothing in atlas footprint because their bark + leaf-cluster tiles dedupe against the existing roster's identical content.

Combined with the Phase B bark shader unification (below), the unified atlas after the v1.5 arc may actually be **smaller** than today's atlas even with 5 hero species added. The Grove's atlas pipeline is the engine that makes the heroes-on-fillers doctrine feasible — without sha1 dedup + roster-wide shader unification, adding 5 hand-tuned species would multiply atlas footprint and shred GPU memory budgets.

`bake-look.js:CONTENT_CAP` caps tiles at `bark 512×1024 / leaf 512×512` (line 39). With ~10 trees in roster (post-Grove curation), ~60% of atlas area frees — raise to `bark 1024×2048 / leaf 1024×1024` for material fidelity bump at no runtime cost. One-line knob; defer until operator finishes Grove curation so the actual roster size drives the cap.

---

## Procedural + LiDAR internals — ⛔ RETIRED 2026-08-23 (Jacob's ruling)

⛔ **We are not using procedural or LiDAR.** *"Anything taking up space or confusing things or getting
in the way or being deceptively heavy is 100% rot"* (Jacob, 2026-08-23). This supersedes the
"kept as equal peer tracks" doctrine every doc in this folder used to carry.

**What was here:** the space-colonization + monopodial growth algorithms, the `generateTreeMesh`
kernel contract, the three architecture modes, the LiDAR/QSM pipeline and its Option-δ scope split,
opposite-phyllotaxis pair-spawn, the Phase-D.2 generator deformers, and the procedural seedlings
`effective`-payload layering. **All of it → `_archive/ARCHITECTURE-procedural-lidar-2026-08-23.md`.**

⚠️ **The CODE removal is a separate, larger job** — ~11,000 lines, and the three workstages are
statically imported at `ArboristApp.jsx:37-40`, so they compile into the deployed bundle. Scope,
file list and the two wiring snags: `LEDGER-exorcism-wren.md §B`.
⭐ **Still live and NOT part of this retirement:** the per-instance deformer on the shared material
(Brief 3A — §Bark shader unification), which is morphology-derived and ships on every tree.

## Salon preview ↔ LS runtime material parity (mostly LANDED 2026-06-25)

> ⭐ **UPDATE 2026-06-25 — mostly closed.** **Gap 2 (publish ≠ bake) is CLOSED:** the Grove "Bake → Slab" regenerates-from-source (`generate-salon` → `bake-look` → `bake-trees`, `15682e55`) — published is always fresh; propagation byte-proven (`scratch/measure-leaf.mjs`). **Gap 1 (live-preview ≠ published) is ACCEPTED, not closed — piece-3 locked "good enough"** (`SALON-INTERFACE.md §6`): the Salon keeps its live preview-atlas (instant authoring), and since Brief 7 it renders through the **same `treeAtlasMaterial`** as runtime (**no shader daylight**); the residual is only that the preview's *artifact* (per-composition atlas) differs from the published one — theoretical, since the published path is proven faithful. Revisit only if a real divergence surfaces. The TARGET block at the end is now largely realized (the Salon UI is the **plate-rack** — `SALON-INTERFACE.md`). The AS-BUILT detail below stays as the troubleshooting reference.

> ⚠️ **EXCISED 2026-08-23.** This section carried a long "AS-BUILT REALITY" block asserting that
> `/grove/bake` **never** calls `generate-salon` ("Gap 2"), and instructed the operator to publish each
> species by hand first. **That has been false since `15682e55`** — `/grove/bake` regenerates every
> composed species from source, rebuilds the index, then packs the atlas and places the census, in that
> order. ▶ `sed -n '1156,1216p' arborist/serve.js`. The block sat twenty lines below this section's own
> header saying Gap 2 was closed. Retired to `_archive/`; the live flow is §Sequencing below.

**The doctrine (the TARGET this section describes):** the Salon Workstage preview should BE the published artifact, rendered live — not "similar to," not "two consumers of the same material." The bake chain (compose → generate-salon → bake-look → bake-trees) is the slab boundary that publishes whatever the Salon authored; LS is where that published slab gets consumed. The aim is **no daylight** between Salon preview and LS render that the operator must step across to verify their work. *(Today: see the two gaps above.)*

**Sequencing (live since 2026-06-25).** Edits **autosave**; the Grove's **"Bake → Slab" regenerates from source** (`generate-salon` → `bake-look` → `bake-trees`). ⛔ **There is no per-species "Re-publish" gesture and no "Adopt" step** — do not document, wire, or reason from them. The flow is:

```
[operator iterates in the Salon]              ← AUTHORING (autosaves; must be visually complete here)
       ↓
[operator opens Grove, hits Bake → Slab]      ← SHIP TO SLAB (regenerates from source, explicit)
       ↓ generate-salon → bake-look → bake-trees (+ Vellum posterized extract)
       ↓ ════════ SLAB BOUNDARY ════════
[scene.json + trees-atlas + per-Look GLBs]   ← FROZEN ARTIFACT
       ↓ load
[InstancedTrees.jsx renders in LS]            ← CONSUMPTION
```

⭐ **What the retired two-gesture split was FOR, and the constraint it still encodes:** authoring must not spam-bake the slab, and the operator's mental model of *when LS changes* must stay honest (`project_authoring_is_live_production_is_static`). Autosave + an explicit Grove bake preserves both — the bake is still one deliberate gesture. ⛔ **And neither model relaxes the preview-equals-LS doctrine above:** when the bake fires is a separate question from what the operator authors against. Deeper: `README.md §The Grove → Slab`.

If a shader effect doesn't fire in the Salon preview, the operator can't author against it. Period. They have no iteration loop. Telling the operator to "verify in LS" routes them past the slab boundary into production — which IS the publishing step, not a verification step. That's the bug that triggered this doctrine (Brief 2.1, 2026-05-22).

**This is `project_preview_equals_ls_literally` applied to the Arborist helper.** Sibling enforcement of `project_stage_consumer_parity` (cartograph-side: Stage and production mount the same consumer file with override props). Forked consumers are drift; the only honest architecture is shared materials.

**The correct implementation shape — one path:**

The Salon preview path (`SpecimenViewport.jsx`) must render through `treeAtlasMaterial.js` directly, with the same `applyBarkUniforms` wiring the runtime uses (`InstancedTrees.jsx`). The preview supplies workstage-context overrides (live composition state, not baked manifest); the material logic is one implementation.

**Wrong shapes to avoid:**

- ❌ Preview renders raw GLB materials; runtime renders through `treeAtlasMaterial`. Two materials, two implementations, drift inevitable.
- ❌ Preview replicates fragment chunks via `onBeforeCompile` patches that mirror chunks living in `treeAtlasMaterial`. Two implementations of the same logic, must stay synchronized forever, drift on the first divergent edit.
- ⚠️ Preview uses `onBeforeCompile` patches for WORKSTAGE-ONLY effects (wind shader, debug overlays). Acceptable IF the chunk is truly workstage-only (never lands in published artifact). Today's wind patches are this case — and even they are drift-adjacent; consolidation candidate.

**The criterion every brief touching `treeAtlasMaterial.js` carries:** *Effect visible in Salon workstage preview at parameter authoring time, in the live composition state, without going through bake → reload LS.* The brief is unshipped until this is true. Per [[feedback_salon_preview_is_authoring_surface]] (2026-05-22, caught on Brief 2.1).

### Geometry-parity corollary: the authored transform bake (Brief 19, Quartz 2026-05-25)

The parity doctrine is not only about *materials* — it binds *geometry* too. The Salon gnomon gizmo authors a per-composition transform (stand-up / center / scale a mis-oriented chassis); that correction must ship in the published GLB **byte-faithfully to what the viewport displayed**, or the operator authored against a lie.

The load-bearing subtlety: the viewport does NOT render the chassis in a naïve `T·R·S`-about-origin frame. `SpecimenViewport.jsx`'s `<Skeleton>` composes (outer→inner)

```
display(v) = R · S · T_posOffset · T_autocenter · v
```

where `T_autocenter` (from `computeDominantTrunk` — bottom-5%-Y-slab densest-XZ-cell centroid) re-centers the dominant-trunk base on the bullseye **before** the authored transform. So rotation/scale pivot about the **trunk base**, and posOffset lives *inside* scale+rotation. Real chassis are off-origin ([[project_chassis_frame_not_origin_centered]]), so this is not academic — a flip baked about the group origin lands the tree metres from where the viewport showed it.

`generate-salon.js#bakeAuthoredTransform` therefore bakes the **conjugated** transform

```
v' = T_autocenter⁻¹ · R · S · T_posOffset · T_autocenter · v
```

(operator-chosen "in-place" semantics — the correction pivots about the trunk base, the base stays where it was; the viewport's centering is framing-only). Identity authoring → `T⁻¹·T = I` → geometry untouched (byte-identical, regression-safe). **The bake runs only on the publish path** (`writeMultiCompositionGLB` → `buildCompositionDocument`, after bark+leaf prims and after `bakeAllNodeTransforms` so POSITION == chassis-root-local); `generateSingleCompositionGLB` (live preview) leaves the transform null and the gizmo applies it for display — so the published GLB carries the transform baked **once**, never double-applied at runtime.

**Divergence hazard — defused at the source (Brief 20, Sextant 2026-05-25).** There are now THREE copies of the dominant-trunk algorithm: `computeDominantTrunk` (three.js, viewport), `computeAutoCenterPivot` (gltf-transform, Brief 19 producer), and `computeDominantTrunkBase` (gltf-transform, `survey-deleaf.js` chassis emission). They no longer need active sync-discipline: **`survey-deleaf.js` recenters every chassis to its dominant-trunk base at origin at creation time**, so on the chassis any consumer actually sees, all three return ~origin and **agree by construction** — the viewport's `T_autocenter` and the Brief 19 conjugation both degenerate to ≈ identity (the conjugation becomes plain `R·S·T` about origin). The KEEP-IN-SYNC hazard is "quiet," not removed: it re-arms only if someone RETUNES one copy's `GRID` / slab% / densest-cell rule without the others, which would shift the source frame and let the un-retuned downstream finders re-introduce a non-identity center. The recenter is **single-pass** — the grid estimator (0.5m XZ bins) has a period-2 limit cycle on boundary-straddle trunks, so the residual is sub-grid (≤~1.4m on ~10/241 chassis, <0.1m on 185), not bit-zero; "≈ identity," not "= identity." **Deferred cleanup** (post-verification, NOT done): delete the two now-quiet downstream finders, collapse Brief 19's conjugation to plain `R·S·T`, and lift a single shared dominant-trunk core (the shared-helper lift per [[feedback_classifier_keyword_cross_check]] — held back this brief because there is no precedent for `src/` importing executable `arborist/` JS, and lifting now then deleting two of three callers later is churn). **The chassis frame is now a contract: every chassis ships dominant-trunk-base at ~origin, Y-min at 0** — Sough's wind-frame assumption (Brief 9a `injectFoliageSway`: `X≈Z≈0, base≈0`) and Brief 3A's merge-time deformer pivot can both assume origin.

---

## Bark shader unification (Bloom-stable single program)

**Constraint:** Bloom requires every tree-material variant compile to the same WebGLProgram (`bake-look.js:200` — "non-negotiable"). Per-species GLSL pattern libraries → multiple programs → no Bloom. So bark variation lives in **uniforms**, not branched shaders.

`src/components/treeAtlasMaterial.js` carries (all per-draw, set in `applyBarkUniforms`):

| Uniform | Source | Purpose |
|---|---|---|
| `uBarkTintBase` (vec3) | `scene.materialColors[<species>]` or `manifest.bark.tintBase` | Per-(species, Look) base tint |
| `uBarkTintJitterRange` (float) | manifest | World-XZ hash → per-tree hue jitter range |
| `uBarkRoughnessOverride` (float) | manifest | Per-species roughness clamp |
| `uBarkUVScale` (vec2) | manifest | Tile repetition factor (broadleaf [1.5, 4], weeping [1.5, 2], etc.) |
| `uBarkTileOffset` / `uBarkTileScale` (vec2) | atlas `uvTransform` | Wrap-within-tile bounds |

## leaf.face — the paler leaf UNDERSIDE (LIVE 2026-08-28)

**Silver maple's whole canopy flashing silver in wind.** A declared rubric axis (`rubric.json#leaf.face`, `kind: dual`) that was **authored on 10 of 34 dossiers and reached no pixel for months** — the aspiration `SALON-INTERFACE.md` filed as decided on 2026-06-25. Now wired end to end, **mirroring the deformer's seam exactly** (Brief 3A): author coordinates, resolve parts, uniform-driven, nothing baked.

`dossier#leaf.face` → `generate-salon#resolveFace` → `manifest.json#leafFace` → `bake-look#leafFaceBySpecies` → `applyLeafFaceUniforms` (a **sibling** of `applyDeformerUniforms`, never a widened `applyBarkUniforms`) → the fragment's `gl_FrontFacing` branch.

- ⭐ **The operator overrides it** — Salon → Leaves → Tint front / Tint back / **Underside**. The dossier pours the default; the picker wins. Resolution takes the **RAW** composition, never the merged one: `DEFAULTS.leaves` carries non-null tints on every composition ever made, so reading the merged object lets a generic `#3a7530` beat the dossier's authored `#5A8C4A`. (It did, on the first run.)
- ⛔ **Strength is dossier-or-explicit, never inferred from the tints** — for the same reason. `strong`→1, `mild`→0.45, `none`→0; a strength with no colour pair resolves to 0 rather than shipping a dead control.
- **The front face is IDENTITY.** The front colour is the white-point the back's luminance is recast against — a two-COLOUR select, not the two-PALETTE swap, which still needs the unbuilt posterized leaf substrate.
- **Costs no vertex attribute.** `gl_FrontFacing` is a built-in and both ramps are uniforms — the only reason this fits, since the tree shader sits at exactly `MAX_VERTEX_ATTRIBS = 16`. Leaves are already `doubleSided` (`bake-look.js#leaves`), which is what makes the facing test meaningful.
- ⛔⛔ **TWO UNRELATED "FRONT/BACK"s LIVE IN TREE CODE.** *This* is leaf faces (adaxial/abaxial). The hero impostor's front/back **SHELLS** (`HeroImpostorTrees.jsx`) are DEPTH slices of the canopy and have nothing to do with which side of a leaf you see. Someone chasing "fronts and backs" will land in the wrong file.
- ▶ `node scratch/claims-the-leaf-face-axis-reaches-the-shader.mjs` — pins all 8 links, and asserts **every draw site that binds bark also binds the face** (the shared material carries the previous species' values; it found two unbound sites the hour it was written).

**Per-vertex gate:** `aBark` attribute baked at runtime-merge time in `InstancedTrees.jsx` from `geometry.userData.atlasKind` (`'bark'` or `'leaf'`). Leaves bypass the retint path; bark fragments retint.

**Fragment shader patches** (via `onBeforeCompile`):
- `<map_fragment>` replaced verbatim with a fract-wrap-inside-tile step: `localUV = fract((vMapUv − tileOffset) / tileScale × uvScale); mapUV = localUV × tileScale + tileOffset`. Gated by `vBark > 0.5 && uvScale != (1,1)`.
- `<roughnessmap_fragment>` patched for per-species roughness clamp, also gated by `vBark`.

**Per-instance hue jitter:** vertex shader passes `vWorldXZ`; fragment hashes world-XZ so adjacent trees of the same species look different but the whole tree is one color. Adopt rotation, scale, and phase jitter all hash `treeId` for stability.

**Per-Look palette override is instant** — `scene.materialColors[<species>]` wins over species default `tintBase` at runtime, no rebake required.

**Per-instance deformer (Brief 3A, Cant 2026-05-25) — vertex-shader displacement.** ⭐ **A1 UPDATE (2026-06-25): the ranges are now MORPHOLOGY-DERIVED, not per-species authored.** The Salon Deformer panel is retired; the per-instance lean/twist/wander defaults come from `generate-salon.js#DEFORMER_BY_MORPHOLOGY` (keyed on chassis `morphology`: broadleaf/conifer/columnar/weeping), injected at `resolveEffective` → `manifest.deformer.range` (proven: an empty `composition.deformer` now emits the morphology range). The table is the single tuning knob (operator). The runtime engine + transport below are **unchanged** — only the *producer* of the range moved (Salon UI → rubric/morphology table), riding the invariant `effective.deformer.range` seam (`SALON-INTERFACE.md §4`; identity-safe). Instance #1 of the rubric-forward rule (author coordinates, resolve parts). The compose-don't-synthesize capstone: one chassis → ~100 distinct reads. Three rigid ops (lean ∘ twist rotation + wander XZ drift) reshape `transformed` BEFORE Sough's wind sway, pivoting about the trunk base = origin (the Brief 20 contract above). Per-species `[lo,hi]` ranges (`uDeformLeanRange`/`uDeformTwistRange`/`uDeformWanderRange`, default `(0,0)` → bit-exact identity) set per-draw via a **sibling** `applyDeformerUniforms` (not a widened `applyBarkUniforms`); per-instance value = `mix(lo,hi, hash(instanceAnchorXZ))`, deterministic, one signature per tree. **Normals stay exact without inverse-transpose** because the ops are rigid rotations — but three.js bakes the normal in `<beginnormal_vertex>` (before `<begin_vertex>`), so the lean∘twist `mat3` is built + `objectNormal` rotated THERE, then the matrix + wander reused on `transformed` in `<begin_vertex>` via `main()`-scope locals. Single compiled program preserved (uniform+attribute branch, no `customProgramCacheKey`). New per-vertex attribute `aTreeHeightNorm` (normalized base→top Y) is computed at **runtime-merge** time (chassis-wide Y-scan, shared LS↔preview via `stampTreeVertexAttrs`'s `fallback.chassisMinY/chassisYRange`) — this is the `project_runtime_merge_vertex_attributes` slot's second consumer (Sough's `aWindTier` was the first; it reintroduces Cork's retired bbox scan, which was always sound). GLB + atlas bytes untouched; `manifest.json#deformer.range` → `trees-atlas.json#deformerBySpecies` (bake-look pass-through) → uniforms. Fires in Salon preview per the authoring-surface criterion above. 3C (canopy asymmetry, branch jitter) is the future per-vertex-displacement consumer that WILL need inverse-transpose — deliberately out of 3A.

**Pipeline survives SpeedTree migration unchanged.** SpeedTree-imported species would write the same `manifest.bark` shape and run through the same shader.

### Per-region bark binding (Phase L Cycle 2 Stage 1 — SHIPPED 2026-05-19 PM)

⚠️ *(Written for LiDAR-baked trees, which are retired. The per-region bark CARRIER below is live and species-agnostic — it keys off a radius threshold and mesh names, not off how the trunk was made.)* Segments carry cylinder-radius metadata. Sugar Maple bark looks different on trunk (heavy furrowed) vs branches (smoother, lighter); the manifest can carry per-region bark spec keyed by a radius threshold:

```json
"bark": {
  "trunk":  { "materialRef": "Bark007", "uvScale": [1.5, 4.0], "tintBase": "#3a2820", ... },
  "branch": { "materialRef": "Bark003", "uvScale": [1.0, 3.0], "tintBase": "#4a3424", ... },
  "regionThreshold": 0.08
}
```

Runtime classifies each cylinder by radius at bake time → assigns `aBark` attribute variant → fragment shader picks per-region uniforms. Single shader program preserved (uniforms-only branching, same Bloom constraint). When `bark` spec is single-value (current procedural pattern, no `trunk`/`branch` split), runtime treats all cylinders as one region — backwards-compatible.

**Carrier (locked Cycle 2 Stage 1):** primitive split. `bake-tree.py` emits a `trimesh.Scene` with two named geometries `trunkBark` + `branchBark` (radius ≥ median → trunk, sections=8; else branch, sections=6). `lidar-publish.js` attaches the per-region Bark photo packs as `baseColorTexture` + `normalTexture` on the matching materials so `atlas-survey.js` picks them up (without a `baseColorTexture` it'd skip the material entirely). `bake-look.js`'s atlas pass reads `mesh.getName()` to stamp `extras.barkRegion: 'trunk'|'branch'` alongside `extras.atlasKind: 'bark'`. `InstancedTrees.jsx` reads `geometry.userData.barkRegion` at runtime merge time, stamps a per-vertex `aBarkRegion` (1=trunk, 0=branch). The fragment shader gates region selection via `uBarkRegionSplit` (per-draw uniform: 1 enables region, 0 falls back to legacy single-spec). Stage 2's Configuration D will add a third+fourth primitive category (`canopyCard` outer-shell + inner-mass points) — the GLB structure inherits cleanly since each category is its own primitive with its own mesh-name marker.

### View-aware bark tiering (Brief 10 — sub-phase A SHIPPED 2026-05-23 by Cork)

> ℹ️ **Disambiguation:** this is the **bark *shader* tier** (`uBarkShaderTier` / `TierDriver` / `computeTier`) — which fragment path a bark pixel takes, legitimately selected at runtime by camera. It is **NOT geometry-LOD.** Geometry is **role-at-bake** and never camera-swapped (the runtime `GeoTierDriver` is RETIRED — see §Tree-render reality at LS).

`project_view_aware_baking` applied to the bark surface. One uniform — `uBarkShaderTier` — selects the fragment path per bark fragment; same compiled program serves all tiers (Bloom-stable, single-program-doctrine preserved). Three tiers map to three view classes:

| Tier | Fragment work | Atlas inputs | Status |
|---|---|---|---|
| **0 — Aerial** | Brief 2.1 luminance gradient REPLACE; NO Brief 2.1a detail Overlay composite | gradient LUT + bark color | shipped (10A) |
| **1 — Hero** | Brief 2.1 luminance-gradient REPLACE + Brief 2.1a detail Overlay composite | gradient LUT + bark color + bark detail | shipped (10A — current default) |
| **2 — Street** | Full vendor PBR (color + normal + roughness + optional displacement) | gradient LUT + bark color + bark roughness/displacement | falls back to tier 1 until 10C |

**Tier uniform shape (locked sub-phase A).** `treeBarkTierUniform` lives at module scope in `treeAtlasMaterial.js` (mirrors `treeSwayUniforms`); every mounted tree material — LS runtime and Salon preview — shares the same `value`, so flipping it once propagates everywhere. Sub-phase A exposes a debug setter via `window.__setBarkShaderTier(n)`; sub-phase D adds the Salon tier-selector overlay; Brief 11 wires the cartograph SHOT driver. The uniform is the frozen seam.

**Sampling axis (post-review pivot 2026-05-23).** Aerial and hero share the same Brief 2.1 luminance sampling axis (`lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))`) plus the existing `uBarkGradientHashAmp` per-tree modulation on `jh4`. The original draft used a per-vertex normalized chassis-Y axis (`aBarkWorldYNorm`), which read camera-angle-dependent — Overhead vs Ground saw different gradient distributions because different portions of bark surface were visible per framing. Pivoting to luminance gives camera-independent sampling and reduces aerial-vs-hero divergence to one knob: **aerial skips the detail Overlay composite; hero (and street, until 10C) include it.** Encoded in the shader as `barkColor = mix(barkColor, composite, uBarkDetailStrength * step(0.5, uBarkShaderTier))`. No new per-vertex attributes shipped — `aBarkWorldYNorm` retired. The `project_runtime_merge_vertex_attributes` slot (Sough's `aWindTier` precedent) stays load-bearing for any future per-vertex-only consumer (10C displacement is a candidate if vendor packs ship per-vertex displacement gates).

**Salon preset cameras (Brief 13 Vantage, 2026-05-23, refined same session).** Verifying tier work requires viewing the chassis at the camera distance the tier was designed for AND having the matching tier active. `SpecimenViewport.jsx` carries two preset framings (`presetFraming(preset, treeH)`): **Overhead** (`{distance: 0, height: treeH+20, lookAtY: 0, topDown: true}` — literal top-down plan view, camera directly above the trunk axis looking at origin) and **Ground** (`studioFraming` forwarded, `topDown: false`). The camera-state ref contract gained optional `lookAtY` and `topDown` fields; `DollyCam.useFrame` swaps `camera.up` to `(0,0,-1)` while topDown to avoid the +Y-look-direction gimbal singularity, then restores `(0,1,0)` for Ground. In topDown the wheel routes to `height` (altitude) instead of `distance` so wheel-zoom does the intuitive plan-view thing.

The tier auto-binds from the same `useFrame` loop: `topDown` → tier 0; else `distance < 20m` → tier 2 (street), `distance ≥ 20m` → tier 1 (hero). Threshold first-pass; tune by feel. The binding intentionally collapses what the original brief framed as separate Hero/Street preset buttons into a single Ground preset whose tier follows the operator's dolly — wheeling from 25m to 18m flips hero→street live. Cork's `window.__setBarkShaderTier(n)` now PINS the tier (sets `treeBarkTierPinned.value = true`, exported alongside `treeBarkTierUniform` from `treeAtlasMaterial.js`), suspending the auto-bind so the operator can verify cross-pairs like "street tier from the overhead camera"; `window.__releaseBarkShaderTier()` restores auto-bind.

**LS-runtime auto-bind (Brief 11 lightweight, Plumb 2026-05-23).** The same tier-write pattern is mounted in production as `TierDriver` in `src/components/InstancedTrees.jsx`, a sibling of `SwayDriver` inside `ParkPopulation`. Per-frame: `if (treeBarkTierPinned.value) return; const desired = computeTier(camera); if (treeBarkTierUniform.value !== desired) treeBarkTierUniform.value = desired`. Discriminating signal swapped from Salon's `distance-to-origin` to **camera altitude** (`camera.position.y`) because LS has no canonical origin — 745 placements scatter across a ~200m park. Thresholds calibrated against `Scene.jsx`'s `PRESETS`: `y > 150 → 0` (browse default y=600, range 50–4000), `y < 5 → 2` (street eyeHeight 1.73), else `1` (Hero y=55). Both surfaces share the same uniform + pin — pinning in Salon devtools sticks across LS frames and vice versa. The cartograph SHOT-driven per-Look tier authoring (operator authors "this SHOT uses tier X" in design.json) is the v2 follow-up; the lightweight runtime activation makes tier 0's per-fragment savings (skip detail Overlay sample) actually fire in production Browse views.

`H_MAX` 60→120 and `D_MAX` 150→300 stay even though Overhead no longer needs them (distance=0); Ground still benefits when the operator dollies out on a mature chassis. Generic studio-inspection distances; not cartograph SHOT imports — Salon stays helper-internal per `project_kit_helpers_pattern`.

**Identity-safe with no gradient bound.** When `uUseBarkGradient == 0`, both tiers use `legacyBark = diffuseColor.rgb * barkTint` as the substrate (Brief 2 fallback). Aerial just drops the detail composite on top of that substrate; hero keeps it. No black-bark failure mode.

**Posterized substrate swap (Brief 10B Vellum, 2026-05-23).** Under tier ≤ 1 (aerial + hero — v1.5 ship-path), `diffuseColor.rgb` is replaced with a sample from a fifth `barkPosterized` atlas sub-page BEFORE Brief 2.1's luminance math runs. Source: per-bark-ref median-cut palette-quantized PNG (`public/textures/bark/<ref>/posterized.png`, ~25 KB at 256² 16-color indexed; ~50× smaller than vendor `color.jpg`) produced by `arborist/extract-bark-posterized.mjs` — CLI + library entry-point with auto-trigger inside `bake-look.js` AND `salon-preview-atlas.js`, so a fresh checkout never needs a manual prereq. Posterized tile dedupes per-bark-ref (Brief 2.1a precedent); per-species emission rides on `barkPosterizedBySpecies[<species>] = { uvTransform, barkTileUV }` (same shape + species key as `barkDetailBySpecies`). Tier 2 (street) keeps vendor color via `step(1.5, uBarkShaderTier)`-gated mix — forward-compat with 10C street-PBR. Two new runtime uniforms `uBarkPosterizedTileOffset/Scale`; identity-safe when scale=0 (no slot bound, e.g. fresh-checkout fallback or species without `posterized.png`). `localUV` recovery from `vMapUv` lifted to the top of the bark fragment chunk so both the 10B substrate swap and Brief 2.1a's detail Overlay composite share one declaration. Why posterize: kit visual identity is illustrated not photoreal; gradient LUT indexing is sharper on discrete luminance buckets; aerial file-budget savings compound with Brief 11. Atlas growth at LS roster scale: +0.26 MB (5 bark refs after dedup at 7 species). Single shader program preserved (uniform-gated mix; no `customProgramCacheKey` change).

### Bark tile wrap is the open shader question (Phase B.2 — deferred)

The `fract`-inside-atlas wrap has unavoidable derivative discontinuity at wrap lines — narrow blurry stripes that "crawl" at close-up Hero. Proper fixes (one of):

1. **WebGL2 texture arrays** — one atlas layer per `materialRef`, `GL_REPEAT`, hardware tiling/mipmap/aniso. Single program preserved via layer-index uniform.
2. **Pre-tile in atlas at bake time** — bake-look composites N×M-tiled version into the atlas tile. Atlas footprint grows N×M for bark.
3. **Separate textures per species** — breaks Bloom's single-program constraint. Not viable.

Deferred until Phase C lands and bark-quality re-evaluation says the wrap-line crawl is the binding constraint. See `BACKLOG.md` Phase B.2.

---

## `atlasKind` extras — stamped at bake, gates runtime shaders

`buildSourceGLB` writes `atlasKind: 'bark'|'leaf'` to each primitive's gltf-transform `extras`. After load (`useGLTF`), the value lands on `mesh.geometry.userData.atlasKind`. Two consumers:

1. **Bark retint shader** (`treeAtlasMaterial.js`, Phase B). Per-vertex `aBark` attribute baked at runtime-merge time from `geometry.userData.atlasKind`. Gates retint, roughness override, and UV-wrap to bark fragments only.
2. **Workstage wind shader** (`SpecimenViewport.jsx`, Phase W preview). Per-material `uIsLeaf` uniform set at patch time from `geometry.userData.atlasKind === 'leaf'`. Leaves layer high-frequency flutter on top of slow sway; bark gets only the sway.

One extras field, two consumers — clean. New consumers (e.g. per-leaf seasonal tint, leaf shadow lighting) drop into the same gate.

`bake-look.js` also writes `atlasKind` at atlas-pack time (with `tile.classification` driving 'bark' / 'leaf' / 'unified'). The `buildSourceGLB` stamp ensures the in-memory workstage preview path also carries the gate, even though it bypasses `bake-look`.

---

## Phase F leaf-color architecture — ⛔ NOT the live model (design retired 2026-06)

⛔ **Do not build to the `annualCycle` manifest + per-Look override-packs design.** It was designed
2026-05-19 and never became the live model. **Leaf colour is a rubric axis recoloured via posterize**
(build-once greyscale base → posterized tint) — *not* a per-anchor gradient LUT keyed on `uDayOfYear`.

▶ **Live home:** `SALON-INTERFACE.md §2` (root) for the part model.
⚠️ **But leaf SEASON has no live home and that is a real gap.** `rubric.json`'s `leaf.season` is a
day-of-year curve and **every dossier already carries authored anchor colours** — yet no renderer
reads any of it, and the axis's own `home` field still points at the retired design above. The
colours are DATA and survive whatever mechanism replaces it. ▶ `ORIENTATION.md §7 OWED`.
▶ `grep -h '"leaf.season"' arborist/dossiers/*.json | wc -l` · `grep -c "season\|uDayOfYear" src/components/treeAtlasMaterial.js`
▶ The retired design, verbatim: `cartograph/_archive/BANNERS-excised-2026-08-06.md §7a`.

---

## Configuration D canopy render — ⛔ NOT the live model (design retired 2026-06)

⛔ **Do not build to the outer-shell-cards + inner-mass `THREE.Points` point-canopy design.** Geometry is
role-at-bake and **there is no points-canopy** — that ruling stands.
⚠️ *(Excised 2026-08-23: this block also claimed trees ship "all-mesh". They do not — the impostor is the
foundation. `PROM_THRESHOLD = 0` is real but it is the LEGACY bake-time classifier; the live split is at
runtime. See §Tree-render reality at LS, which is the one home for render state.)*

▶ **Live home:** `FEATURES.md` "What ships to LS today" + `ARCHITECTURE.md §Tree-render reality at LS`.
▶ The retired design, verbatim: `cartograph/_archive/BANNERS-excised-2026-08-06.md §7b`.

---

## cartograph ↔ arborist boundary

Per `project_kit_helpers_pattern`:

- **Arborist owns trees end-to-end.** Cartograph never imports tree code; the runtime imports only the published artifacts and the shared material.
- **No `procedural` token in `src/`** beyond `treeAtlasMaterial.js` extras (which gain bark + leaf shader patches in Phases B + F). Generator + state stays in `arborist/` and `public/trees/`.
- **No fork of foundational pipeline.** `publish-glb.js`, `bake-look.js`, `bake-trees.js`, `atlas-pack.js`, `atlas-survey.js` stay untouched.
- **Per-Look material overrides ride `scene.materialColors`** — same channel cartograph uses for any other authored color override. No tree-specific channel.
- **Stage's Surfaces.Trees panel** rebinds dynamically to `index.json`. No hardcoded species lists in cartograph code.

Stash-isolate every Arborist commit per `feedback_stash_isolate_per_file` — operator's working tree always has unrelated dirty files; each baby plumbs `design.json` / `index.json` via `git hash-object` + `update-index` to stage only the Arborist delta.

---

## Arborist ↔ Meteorologist canary contract

Cross-helper seam for the Meteorologist's CanaryScene hero tree. Mirrors the helper-isolation discipline of the cartograph boundary: no direct imports across helpers, no shared store; the seam is a frozen data contract.

- **Mechanism.** `localStorage` key `meteorologist-canary-tree`, origin-scoped (both helper apps run on the same Vite dev origin). Writing from Arborist fires the browser's `storage` event in every OTHER same-origin tab automatically. Meteorologist's CanaryScene subscribes and reacts.
- **Payload** (JSON-stringified): `{ species: string, variantId: number, lookId: string|null }`. `species` matches Arborist's `speciesId`; `lookId` is the active Look at write time (null if none).
- **Writer call-sites.** Two affordances, identical payload shape: (1) Grove's per-tile hover-card "→ Set as Meteorologist canary" for roster curation; (2) Salon's per-slot footer "→ Set canary" (Brief 8, Linnet) for the Adopt→Republish→canary→storm-test iteration loop. Salon's slot N maps to `variantId N` (matches `generate-salon.js`'s emission order). Salon's button is enabled only when the composition is non-dirty, variantId exists in `public/trees/<species>/manifest.json#variants`, and a Look is active.
- **Why localStorage, not a backend endpoint.** Per-operator UI preference — like Stage's debug-overlay toggle, not authored Look state. Wrong shape for `design.json` / `manifest.json` / serve.js (would survive across machines, leak into deploys, and demand a per-Look schema for a value that's just "what's the operator looking at right now"). Cross-tab via `storage` event is the lightest possible plumbing.
- **Store posture.** `useArboristStore` doesn't hold canary state; it exposes one pure side-effect action `setSalonCanary(species, slot, lookId)` that writes localStorage and dispatches a synthetic `StorageEvent` so same-tab listeners (the Salon active-canary indicator) react too. Same-tab needs the synthetic event because browsers fire `storage` in OTHER tabs only. Meteorologist owns the read.
- **No auto-rewrite on Look switch.** Stale `lookId` is intentional — operator re-clicks to refresh. Auto-update is a future-design call per the Meteorologist contract.
- **Independent ship halves.** Arborist (writer) and Meteorologist (reader) land separately; the contract is the only coupling.

---

## Arborist ↔ Meteorologist wind contract (Phase 7a / Brief 9a, 2026-05-22)

Second frozen seam between the helpers (after the canary contract). Same discipline: no helper-to-helper imports; both helpers import `src/lib/wind-field.js`. ADR at `scratch/wind-contract-phase7a.md` records the design decisions (S1–S5).

- **The module.** `src/lib/wind-field.js` exports `windAt(t, pos, windState) → { force: Vector3 (m/s), intensity: number (m/s) }`, plus `resolveWindState(directive)` and `defaultWindState()`. Pure — identical inputs return identical outputs, no global state.
- **Three temporal scales composed inside `windAt`.** (1) DRIFT = `baseDirection × baseSpeedMps`, scene-uniform. (2) GUST ENVELOPE — a [0,1] slow modulator (~30s period) authored by Phase 6 modulators. (3) GUST SPIKES — `smoothmax`-shaped 1–2 s spikes whose phase is offset per `pos` by `dot(pos, gustFrontVelocity)/|front|²` seconds, so spikes visibly travel across the scene at `|gustFrontVelocity|`.
- **`windState` shape (publisher contract).** `{ baseSpeedMps, baseDirection: Vector3, gustsScale, gustEnvelope, gustFrontVelocity: Vector3 }`. Resolved from the existing tweened directive channel — no new store key, no new React context.
- **Independent gust-front velocity (ADR S2).** `gustFrontVelocity` is independent of base wind, default `baseDirection × 10 m/s`; modulators may author it. Real-world outflow boundaries can outrun ambient wind, and the richer model is the architectural extension (`feedback_spec_compression`).
- **Tree consumer (`InstancedTrees.jsx` + shared `treeAtlasMaterial.js`).** Per-frame `SwayDriver` calls `resolveWindState(tweenedDirective)`, writes drift force + gust parameters into `treeSwayUniforms`. The vertex shader synthesises its own per-tree spatially-advected gust spike from `uGustsScale` + `uGustEnvelope` + `uGustFrontVelocity` — the spatial advection (AC #5) lives in the shader, not the CPU sample point. Multi-scale damping per `aWindTier` (0=trunk, 1=branch, 2=twig, 3=leaf).
- **`aWindTier` is runtime-merged (ADR S4).** Classified per vertex in `InstancedTrees.jsx#meshes` (LS path) and `stampTreeVertexAttrs` (Salon preview path) from local radial distance + Y. Chassis GLBs and `trees-atlas.json` stay byte-identical — the attribute materializes at merge time, not bake time. The pattern's load-bearing slot stayed open through Brief 10A's review pivot — Cork's `aBarkWorldYNorm` was retired in favor of per-pixel luminance — so the next runtime-only per-vertex consumer (e.g. 10C displacement-gate, if vendor packs ship one) still has the precedent.
- **Rustle floor is `injectFoliageSway` (ADR S3).** Always-on, ~5 mm leaf-tip noise gated by `uRustleAmplitude`. Operator-stated 2026-05-22: "very subtle 'rustle' as the 'floor' for ambient 'life'." Wind sway composes additively on top. Calm-weather scene shows rustle floor only; storm swamps it.
- **Retired uniforms.** Phase 5a's `uSwayWindSpeed` + `uSwayWindDir` are removed from the tree side (replaced by `uWindForce`/`uWindIntensity`). Atmosphere still owns `uWindScale`/`uWindDir` for its own cloud advection — Brief 9b retargets Atmosphere onto `windAt` too.
- **Single shader program preserved.** All new logic is uniform-driven; no `#define` branches, no parallel materials. Bloom remains stable.
- **Salon preview parity (`feedback_salon_preview_is_authoring_surface`).** SpecimenViewport's former `userData.__workstageWindPatched` onBeforeCompile patch is RETIRED — the workstage drives the same shared `treeSwayUniforms` the LS runtime drives. One vertex path, two consumers.

---

## Determinism guarantees

- Same `{species, slot, seed, params}` + same on-disk materials → byte-identical published GLBs across re-runs. Verified `sha1sum public/trees/<species>/skeleton-N-lod0.glb` is stable on every phase ship.
- All randomness routes through `mulberry32(seedN × 1664525 + 1013904223)` — same seed stream across Phase D / C.1 / C.1b.
- `bake-look.js` + `bake-trees.js` are deterministic given the same source artifacts (sha1 dedup is content-hash-keyed; substitution is hash-keyed on placement `treeId`).
- `writeIfChanged` touches mtime on no-op (`project_writeifchanged_touches_mtime`) so byte-identical re-publishes don't cascade rebuilds.

---

## Slab pattern: arborist publishes static, cartograph consumes static

Per `project_authoring_is_live_production_is_static`:

- **Authoring (cartograph Stage → Arborist /arborist):** live. Sliders re-render meshes / shaders / atlases on every commit; `scene.materialColors[<species>]` retints in real time without a rebake.
- **Production (deployed LS, Preview):** static. Reads the per-Look master atlas + the published GLBs; everything is frozen at bake time.

The boundary lives at the **`bake-look.js` + `bake-trees.js` invocation** — every authored channel travels through into the per-Look artifact (`trees-atlas.json` carries the `barkBySpecies` block, manifest carries the `bark` spec, etc.). Anything authored-but-not-baked is silently invisible to deployed users (`project_slab_carries_full_authored_product`).

---

## The species pipeline — census name → placeable tree, end to end (2026-08-25)

**Every stage either RESOLVES or REFUSES. There is exactly one fallback left in the chain and it is named below.** Written by reading the code, not from memory — the last procedure written from memory invented its own field names.

| # | Stage | Code | Refuses by |
|---|---|---|---|
| 1 | **Roster, demand-ordered** | `roster-coverage.js` (`CENSUS_WELLS`) | — |
| 2 | **Batch selection** | `scratch/dossier-harvest.mjs` `ROWS` | exclusions, recorded in-source |
| 3 | **Taxon determination** | `ROWS[].taxon` + `taxonBasis` | `taxonAmbiguous` |
| 4 | **Harvest** | `dossier-harvest.mjs` | per-source taxon guards |
| 5 | **Vocabulary** | `vocabulary.mjs` | unresolved · discarded · redirected |
| 6 | **Mint identity** | `mint-dossiers.mjs` | two taxon layers + cultivar stop |
| 7 | **Hydrate traits** | `hydrate-dossiers.mjs` | per-source taxon gate · `sourced` |
| 8 | **Settle** | `POST /salon/:species/settle` | the operator |

### 1–3. Roster → batch → taxon
Species are worked **in placement order** — the count is the whole argument for which twenty come next. A roster name is **not** a taxon, and turning one into the other is a **human determination recorded in `taxonBasis`**, never inferred silently. A name that is a genus, a cultivar *group*, or a census artifact is marked `taxonAmbiguous` or excluded with its reason written at the exclusion.

### 4. Harvest — the guards are per source, and they differ
- **USDA** — queried by symbol; the returned `ScientificName` is checked genus+epithet against `row.taxon`. On mismatch it emits `_taxon_mismatch` and **takes nothing**. ▶ two symbols were wrong on first use (an aster for a lilac, a rush for a juniper); both skipped clean.
- **SelecTree** — queried by name, then: exact non-cultivar match → **any non-cultivar record** → first result.
  > ⛔⛔ **THAT MIDDLE STEP IS A FALLBACK, AND `|| res[0]` BEHIND IT IS A SECOND ONE** that can return a cultivar. "Any non-cultivar record" can be *a different species*: a `Sorbus americana` query returned **`Sorbus decora`**, and its traits were emitted behind an `unverified` flag. That is a fallback in the Layer 0 sense — no exact match became a plausible-looking wrong answer — and it produced the only bad data in batch 2. It is contained downstream (§7) but **containment is not the fix**; USDA's skip-on-mismatch is the shape SelecTree should take.
- **NCSU** — slug-addressed record; no taxon assertion to check, so no guard is possible here.
- ⛔ **Oregon State is never fetched** (robots: ClaudeBot `Disallow: /`). Morton/MOBOT: schema shape only, never content. **Nothing is mirrored** — we store URLs and credit.

### 5. Vocabulary — one resolver, four outcomes
`resolveTerm(axis, raw)` tries, in order: **exact → plural → alias → contains → alias-contains**, else **unresolved** (`vocabulary.mjs`, `grep -n "via: '" arborist/vocabulary.mjs`). Beyond it:
- **`TERM_REDIRECTS`** — the *value* decides the axis, because sources ship one multi-valued field mixing concepts (USDA `Growth Form` carries silhouette, orientation, spread and trunk count at once).
- **`NOT_A_TRAIT`** — carries no morphology; **discarded with a counted reason, never silently**. A large discard count is how a *mismapped field* surfaces.
- ⛔ **A term unmappable ON PURPOSE belongs in `NOT_A_TRAIT`, not in the unresolved list.** Listing a settled decision as owed alias work is how the bad alias gets re-added by someone without the context.
- ⚠️ **An alias is only half a mapping.** Two axes read 0/20 with correct aliases because no field in `FIELD_MAP` fed them. `FIELD_MAP` is keyed on the field names sources **actually emit**.

### 6. Mint — identity, and only identity
Mints the **sourced skeleton** for a species nobody has authored. Judgment fields (`identityNotes`, `forces`, `leaf.face`, the recipe) mint **null** and are named in `owed`; the species reads **red** until a human authors it. Identity axes mint **soft** with `owedHardness` — a database plurality is not a commitment about what a tree *is*.

Three refusals, and they answer three different questions:
1. **Binomial** — `verifyTaxon(queried, returned)` → `exact` · `hybrid-mark` · `authority-only` · `mismatch`. ⛔ Verdict, never a boolean: a strict match would reject legitimate hybrids to catch cultivars.
2. **Cultivar** — `returnedRank` is *advisory in the library and decisive here*, because mint takes **morphology** from the record. `Acer rubrum 'Armstrong'` is nomenclaturally exact and **columnar where the species is not**.
3. **Census qualifier** — ⛔ `verifyTaxon` **cannot** answer this: it compares two binomials, and `Elm, Hybrid` is a roster name. `verifyTaxon('Ulmus','Ulmus americana')` returns `exact` and is *right to* — the wrongness lives in the census name it never sees.

⛔ **REJECT SOURCES, NOT SPECIES.** A source that answered with the wrong plant loses **its own** observations; identity is taken from a source that verified; the species is refused only when **nothing** verifies. Refusing the whole species discarded 68 good observations to avoid 22 bad ones.
⛔ **A binomial is genus + epithet.** The filename **is** the identity — `Sorbus americana Marshall` once minted `sorbus_americana_marshall.json`.

### 7. Hydrate — and the line that everything turns on
⭐⭐ **`sourced: true` IS THE LINE BETWEEN MACHINE OUTPUT AND AUTHORING.** "The override is the product" governs the **operator's** decisions; a scraped value is not an override. Stamped on **every** machine write:
- **sourced** cells always re-derive — so correcting a bad alias actually undoes what it wrote.
- **unsourced** cells are the operator's and are **never** touched; a disagreement is reported, not applied.
- ⛔ Without it a wrong machine value is **permanent and self-protecting**, and the cells must be cleared by hand.

Also here: the **per-source taxon gate** that contains §4's fallback, and ⛔ **a scraped value is never `hard`** — that is what turned a wrong word into a tol-0 lock on a broad rounded oak.

### ⭐⭐ 8. Publish the disagreement; the operator settles it *(Jacob, 2026-08-25)*
Sources disagree constantly and **every automatic rule lies in its own way**: most-frequent invents a consensus that does not exist, source-priority asserts an authority we never established, and writing nothing leaves a cell **indistinguishable from one nobody has scraped**.

So the disagreement **is the artifact**. Every candidate is written with the sources that claimed it, the cell is marked `contested`, and hydrate stops. A tie writes no target but **does** write the candidates — *empty-and-silent was the defect, not empty.* The Salon rail renders them; `settle` ends it, drops `sourced` (the pick is authoring, never re-derived) and keeps what was overruled in `settledOver`.

⛔ **Both writers must speak this vocabulary.** mint rebuilds a stub's whole `required` block, so when it used different names the rail silently went blank for nine species — behind run order, so checking one order proved nothing.

### ⭐⭐⭐ 8a. A HINT NARROWS; IT DOES NOT DECIDE *(Jacob, 2026-08-26)*
§8 handles sources that **disagree**. This handles a source that **cannot answer the question at the resolution we asked it** — the commoner and quieter failure, because it produces no disagreement to publish.

A field's vocabulary can be **coarser than the axis** it maps onto. SelecTree's `leaf_form` carries three values in the whole corpus (Simple · Pinnately Compound · Bipinnately Compound): it answers *simple-vs-compound* and has **no needle or scale vocabulary at all**, so `Simple` is its default for every conifer. Against our seven-term `leaf.type` that value does not name a term — it names the **set** `{simple, needle, scale, frond}`.

⛔ Stored as the point value `simple` it read correct on 26 broadleaves, where the set happens to collapse to one member, and wrote **`leaf.type: simple` onto White Pine, Austrian Pine and Chinese Juniper.** Those then scored GAP against `long_needle` — a pack already on the shelf — and reached a procurement brief as **100 placements of leaves to go buy.** ⭐ The signature: *cleanest on the common case, wrong exactly where the axis has more to say.*

⛔⛔ **AND THE OBVIOUS FIX IS A TRAP — measured, not theorised.** Discarding `Simple` outright fixes 4 conifers by **destroying 26 correct broadleaf cells.** The value is not wrong, it is **under-specified**, and the honest record of it is the set it admits.

So: a coarse value is declared in `COARSE_FIELDS` (`hydrate-dossiers.mjs`) and becomes a **constraint**. It eliminates candidates; it never votes.
- Constraints **intersect**, and cross-axis: a resolved **blade shape** or a **blade margin** rules out needle/scale/frond (`acicular`, `linear` and `entire` abstain — all three describe needles). "Not compound" ∩ "not needle/scale/frond" = **`simple`**, an answer neither source stated. This derives **25 cells** and is what keeps the 26 broadleaves.
- Where the intersection **collapses to one member** that is a derivation, and it votes — `askedAs` names the hints, so the operator sees it was inferred, not stated.
- Where it does not collapse, the cell is written with **no target and the admitted set published** (`admits`) — §8's rule one level up: *say what was ruled out, admit we cannot name the answer.* ⛔ Never a plausible guess.
- ⛔ **The authored guard must be repeated in the collapse path.** It lives in the observation loop, which `continue`s before anything reaches the tally, so an authored axis simply never has votes — and this path injects a vote *after* that loop. The first run walked straight past it and overwrote Taxodium's authored `needle` (hard, with a note recording the needle↔scale call) with a derived `simple`. **Deriving a value is not a licence to overwrite a decision.**

**Result, measured before/after on the readiness board:** Pine White + Pine Austrian 🔴 → 🟢 CLEAN, from packs already held. `juniper, Chinese` stays 🔴 — it needs a `scale` pack we do not own, which is now the *true* remaining procurement question instead of being hidden behind a wrong `simple`. `leaf.type` resolves 30/34, was 5.

### The checks — run these, do not trust prose
```
node scratch/claims-no-coarse-value-decides.mjs   # §8a — and REPORTS every field that is sole
                                                  # evidence for an axis it cannot fully reach
node scratch/claims-axis-keys-resolve.mjs        # axis ids, enum values, scalar units — SEVEN stores
node scratch/claims-verify-taxon.mjs             # every verdict branch, mutation-tested
node scratch/claims-dossier-writers-agree.mjs    # one vocabulary + order independence
node scratch/claims-cutover-casualties.mjs       # authored values the old rubric could not express
node scratch/claims-reference-credits.mjs        # plate credits, generated from the dossiers
```
⚠️ **`claims-verify-taxon` is RED on purpose right now.** It asserts no mismatched taxon reaches the observations file, and §4's SelecTree fallback puts one there. The assertion is right and the harvest is inconsistent — USDA skips, SelecTree flags. **Do not silence it; fix the fallback.**

> ⭐ **The lesson worth more than any single fix, from five instances in one day:** *a check agrees with its author because it asks the same incomplete question.* One knew three stores of axis ids and not the fourth. One resolved each field to its nominal axis and reported working code as broken. One passed with its own subject deleted. One validated keys but never values. One had its pass/fail gate above half its assertions. **None reported a problem.** Poison the input; mutate the guard; make the check fail for the right reason before believing it.

## Cross-references

- `FEATURES.md` — operator-facing surface
- `BACKLOG.md` — the live kit-matcher arc + carried-forward open items (May-2026 brief arcs cooled to `_archive/BACKLOG-2026-05-brief-arcs.md`)
- `NOTES.md` — dated architecture record (live + recent; the May-2026 brief diary, incl. the load-bearing 2026-05-15 maxi-brief, is cooled to `_archive/NOTES-2026-05-diary.md`)
- `README.md` — runtime contract (slimmer)
- `_archive/SPEC-2026-08-23.md` — the retired v1 (LiDAR/QSM) work order. History, not canon.
- `../cartograph/ARCHITECTURE.md` — kit-wide publish-loop pattern
- Memories: `project_kit_helpers_pattern`, `project_kit_bin_pattern_for_bulk_numerics`, `project_kit_deploy_path_agnostic`, `project_slab_is_the_instance_identity`, `project_authoring_is_live_production_is_static`, `project_doped_artifact_placecard_edit_pattern`, `feedback_stash_isolate_per_file`, `feedback_no_parallel_pipeline_for_scenes`, `feedback_preview_uses_production_pipeline`
