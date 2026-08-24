# Arborist — phase-2 worklist — **Wren**, 2026-08-23

**What is left to do, and nothing else.** Every item: what is wrong · the command that
shows it · the smallest change. Classified `ROT` (evict) / `REGRESSION` (fix the code) /
`ASPIRATION` (unbuilt intent — ⛔ Jacob's call).

⛔ **This file shrinks as items land. Delete an item when it is done — do not mark it done.**
*(The full phase-1 investigation, incl. the discovery narrative and the questions
`ORIENTATION.md` now answers, is retired to `_archive/LEDGER-exorcism-wren-full-2026-08-23.md`.
Doctrine + settled state live in `ORIENTATION.md`, never here.)*

---

## A. CODE — real defects, measured

**A1 · `roster-coverage.js:50` · REGRESSION · Coverage reads ONE census well; the bake reads five.**
92 species / 1,300 placements are placed by the bake and never listed by the have-vs-need
surface. ⭐ `tree-bake-inputs.mjs:103-108` documents this exact bug being fixed twice and
says **"Add new wells to BOTH"** — this is the third entry point and it was missed.
▶ `sed -n '110,116p' cartograph/tree-bake-inputs.mjs` vs `grep -n "parkTreesForScene =" arborist/roster-coverage.js`
**Fix:** resolve the census through `treeBakeInputsForScene(scene)` — one enumeration, not a fourth copy.

**A2 · `roster-coverage.js:139` · REGRESSION · Coverage shows ✓ for routes that cannot ship.**
`libExists` counts a chassis on disk as "exists", but the NO-FILLER gate keeps fillers out
of `index.variants`, which is the pool `bake-trees.js:685` actually draws from. 40 LS rows /
275 placements render ✓ and evaporate at bake. **Layer 0 question 2, inside an instrument.**
▶ `node --input-type=module -e "import {computeCoverage} from './arborist/roster-coverage.js';const c=await computeCoverage('lafayette-square');const f=c.species.filter(r=>(r.routing||[]).some(x=>/^procedural_|^generic_/.test(x.libId)));console.log(f.length,'rows',f.reduce((a,r)=>a+r.count,0),'placements | dangling:',f.filter(r=>r.dangling?.length).length)"`
**Fix:** `published` = has a variant in `index.variants`. Authored-but-unpublished is its own
**loud** state, never ✓. ⭐ Fix the check even after the filler routes are repointed — the
class outlives the instance.

**A3 · `Grove.jsx:908-1010` · ROT · 3 of the Grove editor's 5 controls are dead.**
rating (the 0–4 ladder retired 2026-07-08 for Promote/Demote) · category · notes. **Zero
values have ever been written through any of them.**
▶ `node -e "const v=require('./public/trees/index.json').variants;console.log(v.filter(x=>x.qualityOverride!=null).length,v.filter(x=>x.operatorNotes).length,v.filter(x=>x.categoryOverride!=null).length,'of',v.length)"`
**Fix:** delete the three from `EditorCard`. ⛔ Keep the `quality` *field* — `build-index` and
`pickVariant` still read it. Live: In-Look toggle, Set-canary.

**A4 · `tree-bake-inputs.mjs:120` · ROT · a comment promising a fallback that cannot happen.**
*"absent → bake-trees falls back to LS's global map"* — that global map no longer exists.
Absent actually yields an empty map, silently. `bake-trees.js:487` says that is intentional.
**Fix:** delete the fallback clause. ⛔ Do **not** restore a global map — that is the LS bleed.

**A5 · `bake-look.js` / `InstancedTrees.jsx:817` · the killed impostor is still baked.**
`impostorBySpecies` + `opaqueBySpecies` (10 species each) ship in every slab; the read path
is unreachable because `PROM_THRESHOLD = 0` classifies every placement `mesh`.
Dead by data, not by code. **Fix:** stop emitting both keys; delete `ImpostorSpecies`.
⛔ Capability removal — confirm with Jacob first.

**A6 · `TreeDiorama.jsx` · REGRESSION · the diorama mounts the shared tree material but drives
NONE of its per-scene state. ⭐ ONE root, THREE reported symptoms.**
In the map, `InstancedTrees` and `BakedGround` drive uniforms the material needs. The diorama
mounts its own `Ground` (a grass disc) and no tier driver, so those uniforms keep their
module defaults:
| uniform | driven in the map by | in the diorama | symptom |
|---|---|---|---|
| `uBarkShaderTier` | `InstancedTrees.jsx:556` (Salon: `SpecimenViewport.jsx:213`, `<20 m → tier 2`) | **never written → default `1`** | ⛔ **tier ≤1 replaces bark diffuse with the POSTERIZED 16-colour substrate** (`treeAtlasMaterial.js:715` `useVendor = step(1.5, uBarkShaderTier)`) ⇒ *"smooth, low-poly trunk"* — **the geometry is 116,794 tris, it is not low-poly** |
| `uGroundColorMap` | `BakedGround.jsx:176` | **unbound (null)** | no ground colour pulled onto the trunk |
| `uGroundFxMap` (G = contact shadow) | `BakedGround.jsx:157` | **unbound (null)** | ⛔ **no AO contact ring** — the feature already exists and ships in the map |
▶ `grep -n "treeBarkTierUniform.value =" src/components/*.jsx src/arborist/*.jsx` · `grep -rn "setGroundColorMap\|setGroundFxMap" src/`
⭐⭐ **This is why the Salon looks right and the diorama does not, and it is NOT the bake:**
baked lod0 and published lod0 are geometrically identical (116,794 bark tris / 41,688 leaf
cards both). **The Salon sits <20 m → tier 2 → vendor bark. The diorama stays tier 1 →
posterized bark. Same file, two shader paths.**
▶ `python3 scratch/_wren-glbstat.py public/baked/lafayette-square/trees/linden_american/skeleton-1-lod0.glb public/trees/linden_american/skeleton-1-lod0.glb`
**Fix:** drive the three in the diorama the way the map does. ⛔ Not a diorama-only hack —
the seam is *"a bare Canvas mounts no scene drivers,"* the same class as `ExposureTicker`.

**A6b · ⭐ THE ACTUAL ROOT of "no texture on the trunk" — `TreeDiorama` never called
`applyBarkUniforms`.** Every other consumer of the shared material does: `InstancedTrees:394`,
`SpecimenViewport:945` (Salon), `CanaryScene:454` (Meteorologist), `OverheadBaker:176`,
`HeroImpostorBaker:159`. **The diorama was the only one that did not**, so the per-species
bark slots kept their compile-time defaults — above all `uBarkUVScale = (1,1)`, so the
**tiling never ran and one 512px bark tile was stretched across a 20 m trunk.**
`uBarkTileOffset/Scale` were also unset, so the detail overlay and posterized substrate were
sampling the wrong atlas region entirely.
⭐ **The bake was never at fault: the linden's bark tile carries real detail (σ 27.5).**
▶ `node scratch/_wren-atlas-tile.mjs lafayette-square linden_american`
⚠️ **The tier fix (A6) was necessary but NOT sufficient** — it stopped the posterized
substitution; this is what puts bark grain on the trunk. **Two defects, one seam.**
**Fixed** — `<BarkSlots>` applies both per frame, the `CanaryScene` pattern.

**A7 · `bake-look.js:43` · bark tiles are capped at 512×1024 and the atlas is 23.5% full.**
The linden's bark tile is **512×512** on a 3888×2584 page holding 9 tiles.
`ARCHITECTURE` already calls this a one-line knob deferred until the roster settled; it has.
▶ `node -e "const j=require('./public/baked/lafayette-square/trees-atlas.json');let u=0;for(const t of j.tiles)u+=(t.w||512)*(t.h||512);console.log(j.tiles.length,'tiles',(100*u/(3888*2584)).toFixed(1)+'% of page')"`
⚠️ **Secondary to A6** — raising the cap sharpens vendor bark, which tier 1 currently
replaces anyway. **Fix A6 first, then re-measure before spending a re-bake on this.**

**A8 · ⚠️ NIGHT: the canopy reads lit while the trunk goes dark. CAUSE NOT ESTABLISHED.**
Ruled out: `treeLeafTransmission` defaults to **0** (`treeAtlasMaterial.js:127`) and nothing
writes it without `?leafT=`; `CelestialBodies` **is** mounted, so ambient/moon reach the
diorama. Consistent with `BACKLOG` 2026-08-23's undiagnosed *"the grass reads brighter than
the tree at night."* ⛔ **First measurement is which light path the LEAF fragments take** —
leaves are gated out of every bark path by `vBark`, so they may miss a dimming the bark gets.
**No fix specced. Do not tune anything until this is measured.**

---

## B. THE DEAD TRACKS — Jacob ruled 2026-08-23: procedural + LiDAR are ROT

~11,000 lines, ~28% of the app, **statically imported at `ArboristApp.jsx:37-40` so they
compile into the deployed bundle.** Plus the LiDAR corpus in `botanica/`.

- **front end** `LidarWorkstage.jsx` · `ProceduralWorkstage.jsx` · `Workstage.jsx` (Scan, LiDAR-fed)
- **backend** `lil_vera.py` · `lil_vera_v2.py` · `bidirectional_skeleton.py` · `lidar_extract.py`
  · `bake-tree.py` · `lidar-publish.js` · `generate-procedural.js` · `spaceColonization.js`
- **`serve.js`** — ~715 of 1,833 lines are lidar/procedural/seedling routes
- **docs** the Procedural/LiDAR/Scan sections of `FEATURES.md` and `ARCHITECTURE.md`
- **routing** 49 LS roster names still point at `procedural_*` — repointing them also
  removes most of A2's false ✓

⚠️ **Two wiring notes, not doubts:** `Workstage.jsx` is also `ArboristApp.jsx:106`'s fallback
when a species id is set — that branch needs a home. And `generate-procedural.js` exports
`PRESETS`/`generateSingleVariantGLB` that `serve.js` imports at module scope; unpick the
imports before deleting the file.

---

## C. DOCS — conform to `ORIENTATION.md`, then net down

| doc | excise | why |
|---|---|---|
| `ARCHITECTURE.md` | §Configuration D's *"trees ship ALL-MESH"* · the GPU-gauge paragraph **duplicated verbatim** · the AS-BUILT *"Gap 2 is open"* block · §Monopodial (the file never existed) · the SCA/procedural sections | the ALL-MESH line is the ghost that cost a month; `c8c85a1a` fixed only BACKLOG's copy |
| `README.md` | its `⭐ START HERE` + read-order (third front door) · the Grove→Slab troubleshooting block · `bake-trees --look` | `/grove/bake` **does** regenerate from source (`serve.js:1156-1216`); the flag is `--scene` |
| `FEATURES.md` | Procedural/LiDAR/Scan knob tables + endpoints · `src/data/park_*.json` paths · `--look` · the Grove "Re-publish" instruction | those files do not exist — census + routing are per-town under `cartograph/data/<scene>/` |
| `NOTES.md` | the 2026-06-25 (EOD) ALL-MESH bullet | same ghost |
| `BACKLOG.md` | *"the diorama looking worse … is the system WORKING"* | ⛔ a doc's editorial sentence, **not** Jacob's ruling, and he does not accept it |
| all | `/forest` and `/readiness` citations | built, then **deliberately dropped** (`0402dee5`) into `GET /coverage`. ⛔ Keep `matcher.js`/`readiness.js` — two endpoints use them |

⚠️ **`ORIENTATION` and `README`/`FEATURES` both say "matcher" and mean different things.**
The ranking **module** is live and load-bearing; the **Recommended UI toggle** is what was
ripped out. Name them apart — do not "finish the rip-out" from the wording.

---

## D. THE PRODUCT GAPS — in `ORIENTATION.md §7 OWED`; the work item is here

**D1 · Provenance per field — the highest-leverage change in this list.**
The effective resolver (`DEFAULTS → CHASSIS_DEFAULTS → overlay`) knows whether each value
was **authored** or **defaulted**, and discards it. Keeping it yields *complete / started /
not-started* on every surface, the left-column sub-sort, and the manifest's missing leaf
provenance — **no new state to maintain.** Today 12 of 13 species silently resolve to the
same default leaf and nothing distinguishes that from a choice.
▶ `node --input-type=module -e "import {readEffectiveCompositions} from './arborist/generate-salon.js';console.log((await readEffectiveCompositions('birch')).compositions?.[0]?.effective?.leaves)"`

**D2 · One key, and it is the operator's.** Dossiers are botanical-named; shipping trees are
roster-named. Botanical twins (`acer_saccharum`, `quercus_alba`, `tilia_americana`,
`nyssa_sylvatica`, `betula_pendula`) shadow shipped species. ⛔ **`acer_saccharum` holds a
real 2026-07-10 composition routed nowhere — MERGE onto `maple_sugar`, then retire.**

**D3 · Seasons need a live home.** `leaf.season` anchors are authored in every dossier and
read by no renderer; the axis's `home` field points at a retired design. The colours are
data and survive whatever replaces the mechanism.

**D4 · The Grove invariant** *(Jacob)*: a tree in the Grove is already baked and slab-ready.
Needs two answers first: **where the bake gesture lives**, and **where the impostor bakers
run** — they are browser-GPU authored inside the Grove and the CLI bake cannot reproduce them.

---

## E. ⛔ ASPIRATION — needs Jacob before anyone touches it

**E1 · The left-column bar (`groveThreshold`).** A top-N-with-pins build-eligibility dial,
built as UI + persistence and **read by nothing** — no baker, no runtime.
▶ `grep -rn "groveThreshold" arborist/ cartograph/` → only the endpoint that stores it
It also measures the wrong cost: atlas inclusion is already near-free per species (tiles
dedupe by sha1), so a dozen pines sharing a bark and a needle pack cost ~2 tiles.
**Wire it to geometry weight, or remove it — it must not stay looking live.**

**E2 · `Native` is already taken.** In the app it means *the leaf this species actually has*
(`Bare · Native · Synthetic`). **No regional-nativeness concept exists.** Grouping by region
is unbuilt *and* needs a different word.
