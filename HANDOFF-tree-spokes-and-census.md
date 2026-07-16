# HANDOFF — the "spokes" forensic + the HPDM tree/vegetation census gap

**To:** tomorrow's eyes (Boz or fresh). **From:** the 2026-07-15 night session (Boz + Jacob). **Trunk:** `curb-offset-draw` (solo; push/merge freely; PROD = `origin/main`).
**Route first** (CLAUDE.md): `ORIENTATION.md` → `README §⭐ START HERE` → `arborist/README §⭐ START HERE` → **`HANDOFF-overhead-disc-display.md`** (the sibling; read it BEFORE this one — it owns the Browse/overhead arc and its own ruled-out tail) → this.
Memory: [[project_atlaskind_classifier_substring_bug]] · [[project_hpdm_tree_census_jurisdiction_gap]] · [[project_overhead_impostor_capture_fix]].

Two threads ran tonight. **Thread 1 (census) is DONE — findings banked, one free win queued.** **Thread 2 (spokes) is HALF-SOLVED: one real bug found + eye-confirmed, one artifact still unidentified.**

---

# THREAD 1 — the census: it stops at the city limit ✅ answered

**Jacob's ask:** *"find a tree and vegetation census for hipointe demun as described by our map."*

**Answer: we have one, but it only covers the Hi-Pointe (City) wedge. The DeMun half has no census and never did.** HPDM straddles the St. Louis city limit; the data doesn't cross it.

Measured by projecting the raw wells against `neighborhood_boundary.json`'s quad (`x=(lon−lon0)·lonToMeters, z=(lat0−lat)·latToMeters`, per `serve.js:437`):
- City Forestry fetched **6,146** trees → **444 inside our polygon, ALL at x=301..706**, the SE City wedge between McCausland (x≈255) and Skinker (x≈580). **West of x=301: zero.** The fetch dies at lon −90.31047.
- Street positions are ground-truthed from our own `clean/skeleton.json`, not memory: Skinker x=580 (east edge) · De Mun Ave x=136 (mid-map) · Forest Park Pkwy z=−609 (north) · McCausland x=255. Quad spans x=−772..780.

**What the bake actually eats** — the `clean/*.json` metas say it outright:

| well | n | what it really is |
|---|---|---|
| `park_trees.json` | 560 | real census — *"City (Hi-Pointe) only"* |
| `osm_trees.json` | 870 | real positions, **species invented** — *"mix-sampled from City empirical distribution"* |
| `derived_trees.json` | **6,399** | NLCD **30m** canopy-% scatter — procedural |

⚠️ Those counts are from the **pre-re-bake** artifact (6,967 trees). Jacob re-baked mid-session (now 9,806, and `25c6648b` changed placement to the frozen curb). **Re-run the composition count before quoting a filler %.** The *jurisdictional* finding is independent of the bake — it's about the raw wells — and holds.

## Ranked sources (researched + endpoint-tested)
1. **Clayton's inventory EXISTS but is unpublished — the only real answer.** The County's canopy layer self-reports `H_muni_tree_inventory: "Yes"`, TreeCity_USA 33 yrs, `AveTreeCanopy` 34.55%. **Davey Resource Group inventoried ~11,000 trees in 2022/23 under a Missouri Dept. of Conservation TRIM grant** and loaded it into Clayton's GIS. Verified negatives: no ArcGIS org (`portals/self` → null for clayton/claytonmo/cityofclayton), no TreeKeeper tenant, `gis.`/`maps.claytonmo.gov` NXDOMAIN. **It was public-grant-funded → a records request to Clayton Public Works is the highest-value move**; it would carry species + DBH + condition. *(Caveat: claytonmo.gov is Akamai bot-blocked — "not public" is inference from four independent absences, not from reading their site.)*
2. **⭐ FREE WIN, do this first — `FORESTRY_TREES/MapServer/**4**` (FOREST_PARK_TREES).** We read layer **1** and ignore layer 4, which has **4,297 trees in our bbox** on the endpoint we already trust, with a far richer schema: `Scientific_Name, Genus, Family, Cultivar, DBH, Condition, Height, Crown_Spread, Native, Risk_Rating`. Best local species prior available; costs one integer.
3. **USGS 3DEP LiDAR EPT — VERIFIED, best automated fallback.** `https://usgs-lidar-public.s3.amazonaws.com/USGS_LPC_MO_StLouis_2017_LAS_2018/ept.json` (6.18B pts, public, no auth, EPSG:3857, carries `Classification`/`ReturnNumber`). Covers the whole footprint → CHM + crown segmentation = real positions/heights/crown radius. **No species.** Would reopen [[project_lidar_arc_dormant]].
4. **Meta/WRI 1m CHM — VERIFIED.** quadkey `023111311`: `https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/023111311.tif` → 200. **1m vs our NLCD 30m.** No species. Generalizes worldwide.
5. **WustlTrees** `services2.arcgis.com/yL7v93RXrxlqkeDx/…/WustlTrees/FeatureServer/0` — public, 5,248 trees, 208 species, 4,144 west of Skinker **but 100% Danforth campus**, not DeMun streets. Personal-account owner, no license → fragile.

**Plainly not found:** St. Louis County (polygon aggregates only) · MSDIS (176 datasets, zero canopy) · E-W Gateway TCC 2021 (30m — no better than we have) · Missouri Botanical Garden (nothing public, and ~3mi outside) · no 1m UTC assessment for St. Louis.

**OSM not worth improving:** DeMun side = **905 trees, 0 species, 0 genus.** Only salvage = `leaf_type` present on ~53% → enough to gate broadleaf vs conifer chassis rather than invent it.

## 🔥 Canon conflict this exposes — needs Jacob's call
`NEIGHBORHOOD-INPUTS.md:73/261` frames the tree census as a **Tier-② "re-point the fetch per town"** well. **That's only true for 3DEP and Meta** (global grids you re-window by bbox). **Every species-bearing source is bespoke per municipality**, on a different endpoint with a different schema — and Clayton's needs a *human to ask*. Realistic per-town intake = **LiDAR for shape (automated) + species census where one exists (hand-onboarded)** — **two pipelines, not one re-pointed fetch.** Reconcile `NEIGHBORHOOD-INPUTS` once Jacob confirms.

---

# THREAD 2 — the "spokes"

**Jacob's words, in order (the drift matters — read all three):**
1. *"we are still showing what looks like perhaps impostor Spokes? I have been referring to them as group trees, but they might actually be impostor artifacts."*
2. *"the straight-line artifact sticking out from the side of the tree diagonally in both directions"* — with a **Browse** screenshot.
3. 🔑 **THE BEST CLUE:** *"just now when I went from browse to hero all the trees flashed off momentarily during the transition (that's not uncommon) BUT all the weird straight line trees stayed on and seemed independent from the rest of the trees."*

## 🔑 What clue #3 proves — start here tomorrow
**The artifact is NOT drawn by the tree renderer.** In `InstancedTrees.jsx:898-971` everything tree-ish lives inside two **mutually-exclusive** gated groups:
- `<group visible={!overheadMode}>` (:905) — mesh trees + hero impostors
- `<group visible={overheadMode}>` (:961) — overhead discs

That toggle **is** the flash Jacob saw. **Anything that survives the swap is a different component.** Hunt there. Do not re-audit the tree path — a full night went into it and it came back clean.

Still-unchecked ungated mounts in `Scene.jsx:826-849`: `ViewKeyedBakedGround` · `LafayetteScene` (neon / street labels / landmark markers / click-catcher) · `SlabBuildings` · `GatewayArch` (desktop = mounted in BOTH browse+hero) · `MountainBackdrop`.

## ✅ FOUND + EYE-CONFIRMED — the black canopies (a real bug, ready to fix)
**`arborist/atlas-kind-classifier.js:52-55`** is a keyword cascade over ancestor **node** names, then **material** names:
```js
52  if (ancestorNodeNames.some(n => /leaf|leaves|foliage/i.test(n)))                    return mk('LEAF','nodeName')
53  if (ancestorNodeNames.some(n => /branch(es)?|caps?|trunk|wood|bark|stem/i.test(n))) return mk('WOOD','nodeName')
54  if (/leaf|leaves|foliage|leafcard|branch/.test(matName))                            return mk('LEAF','matName')
55  if (/bark|trunk|wood|stem/.test(matName))                                           return mk('WOOD','matName')
```
**`acer_saccharum_multistem`'s root node is named `"Acer_saccharum_multistem_001"` → `/stem/` substring-matches "multi·stem·" → line 53 returns WOOD for EVERY prim before any material name is read.** Verified prim dump:
`["bark":33330 mat=stem_2 | "bark":312 mat=twig | "bark":5110 mat=stem_1 | "bark":23498 mat=front]`
— **`front` (23,498 tris) is the FOLIAGE, stamped `bark`.** So its canopy samples the bark atlas + bark retint (renders woody-black, not green) and gets `aWindTier 0` (barely sways) instead of 3 (flutters).
**Eye-confirmed 2026-07-15:** Jacob's Browse screenshot shows full-size **black canopies interleaved with healthy green ones** — the predicted signature.

**Deeper defect than the regex:** matching on **ancestor node names is wrong in principle** — the root node carries the **species name**, which is not a part name. Any species with stem/bark/wood/leaf in its name mis-fires wholesale. *(This is [[feedback_classifier_keyword_cross_check]] recurring — same failure mode, again.)*

**Same file, same cascade, other misses:**
- **Conifers** — `DouglasFir_Needles` (365,376 tris): **"needle(s)" is absent from the LEAF keyword list** → AMBIGUOUS → `atlasKind: null` → **no atlas tile**. Same for `picea_abies`, `cupressus_sempervirens`.
- **Magnolia** — node `"Magnolia 3"`, materials `"Material #2"/"Material #3"` (generic vendor names) → no keyword hits. The structural fallback **can't** save it: line 59's leaf heuristic requires **`vcount < 5000`**, and magnolia's leaf prim is 244,170 tris. **Big leaf prims fall through by construction.**
- **Self-contradiction:** `/branch/` → **LEAF** at :54 (matName) but **WOOD** at :53 (nodeName).

### Audit — `scratch/classifier-roster-audit.mjs` (HPDM, 35 variants / 9,806 placements)
| variant | inst | verdict |
|---|---|---|
| `acer_saccharum_multistem` ×2 | **256** | ALL WOOD — foliage tagged bark (the `/stem/` bug) |
| `magnolia_sp` ×3 | **412** | 100% unclassified |
| `cupressus_sempervirens` | 334 | 80% unclassified |
| `pseudotsuga_menziesii` | 57 | 87% unclassified |
| `picea_abies` | 47 | 84% unclassified |

**27/35 variants healthy; 1,106 / 9,806 placements (11.3%) broken.**

### 🎁 Why this is worth landing on its own
**It also explains the OPEN "conifer/platanus/quercus blank bands"** in `HANDOFF-overhead-disc-display.md §2` — unclassified needles get no atlas tile, so the band bakes empty. **One fix, two symptoms.** And it's self-contained: no dependency on the unsolved artifact below.

### ⚠️ Standup owed before coding (CLAUDE.md gate). The design question:
Anchoring the regex (`\bstem\b`) is a 30-second patch that fixes multistem — **but it doesn't fix the principle** (species-name matching) or magnolia (needs a structural path that tolerates big leaf prims: the `vcount<5000` guard is the blocker). Options to talk through: (a) **stop reading ancestor node names entirely** / skip the root+species node; (b) add `needle(s)` + resolve the `/branch/` contradiction; (c) raise or replace the `vcount<5000` structural gate; (d) all three. Prefer fix-at-source ([[feedback_fix_at_source_never_hack_the_symptom]]). Also: a fix requires a **re-publish of affected chassis + a `bake-look` atlas re-bake**, and note **a stale atlas blanks the WHOLE grove, all-or-nothing** (the LS eye-gate lesson).

## ❌ STILL UNIDENTIFIED — the chips in straight lines (the actual "spokes")
From the 23:52 Browse screenshot: **small dark chips strung along straight lines**, regularly spaced, each casting a real shadow, **not following HPDM's streets** (they cut diagonally across open ground past roads whose yellow centre-lines + tan sidewalks render fine). Jacob: *"probably half of the on-screen items are these artifacts."*
**These are NOT the black canopies** (item ✅ above) — two distinct symptoms; don't conflate them (I did, for hours).

## ⛔ RULED OUT — 9 theories, each MEASURED and killed. Do NOT re-walk.
1. **Hero impostors / `CROSS_PLANES=2` "+" cross-billboard** — both scenes' `heroTierMeta` report **`impostor: 0`**. `ImpostorSpecies` **never mounts**. The code is real; it renders nowhere.
2. **Instance alignment** — all 9,806 instances carry a **varied `rotY`**.
3. **`generateBranches` wagon-wheel** (`impostorGeometry.js:388`, NPRIMARY limbs at evenly-spaced azimuth ±11°) — a genuine smell, but reachable **only from `SpecimenViewport.jsx` (Salon preview)**, never the player.
4. **Unit / scale error** — prim-local bounds look insane (`tilia_americana` bark = 2376×3089×2346 "m") but **node scales compensate** (tilia = 0.01). **True world heights are all sane: 2.9–55.4m.** ⚠️ Docs ARE mixed-scale (`1,1,1 | 0.1,0.1,0.1`; `abies_concolor` = `30.48` ft→cm) and **the decimation levers read RAW LOCAL POSITIONS with no node transform** (`decimate-tree.mjs:546` `trunkCutBark` compares leaf-Y vs bark-Y across prims possibly in different scales) — **a latent hazard, not shown to bite. Worth a look someday.**
5. **Bark-crush slivers** — `crushFlooredBark` (`decimate-tree.mjs:518`; gate `atlasKind==='bark'` && tris > `CRUSH_FLOOR`=50000) does position-weld + plain simplify ("breaks tiling, smears") and **DOES fire** (linden 116,794→3,122; pseudotsuga 53,116→41; tilia 118,960→1,003). **But measured in TRUE WORLD units the worst edge is 13.8m on a 20.7m spruce (67% of H) — 3 tris of 7,436.** No scene-crossing geometry exists. **Audit in world units; local units mislead by 100×.**
6. **LafayettePark** — mounted ungated at `Scene.jsx:827` and it **does** hardcode `import parkPolygon from '…/lafayette-square/clean/park-polygon.json'` (a real scene-blind import) — **but it self-guards at `LafayettePark.jsx:848`** `if (INSTANCE.lookId !== 'lafayette-square') return null`, and `INSTANCE` **is** URL-resolved (`instance.js:42`). Renders nothing in HPDM.
7. **Mesh-fallback-in-Browse** — see the corpse-lie below; those species render **nothing** in Browse, not something.
8. **Marker strokes** — `marker_strokes.json` consumers are **all `src/cartograph/*`** (authoring). Never production.
9. **Lamps** — `BakedLamps` fetches `baked/<resolvedLookId>/lamps.json` (correct) and `StreetLights.jsx:74` is `lampsProp || (INSTANCE.lookId === 'lafayette-square' ? lampData.lamps : [])` → **the look-scoped prop wins.** (`StreetLights.jsx:12` + `lampLightmap.js:5` DO hardcode LS's `street_lamps.json` — guarded today, but they're live scene-blind imports worth excising.)

## ▶ NEXT STEP — instrument, don't theorise (this is the lesson of the night)
Add a temporary probe that walks the R3F scene graph in Browse and logs, per mounted object: **component name · instance count · world position of instance 0 · visible flag**. The chips are ~half the screen, so they'll be a large obvious entry and it **names the component in one page load**. Revert after.
This is the same lesson `HANDOFF-overhead-disc-display.md` already teaches — *"the one true signal was the `VALIDATE_STATUS false` shader error… check for a shader compile error first — it's cheaper than the whole tail above."* **Tonight ran the tail anyway. Don't.**

Useful discriminators Jacob can answer in 10s (production surface — **no layer toggles there**):
- **Does it reproduce in LS** (`?look=lafayette-square`)? Clean LS ⇒ HPDM data; both ⇒ code. ([[feedback_worked_before_means_regression]] — bisect.)
- **Fresh load straight into Browse** — present? Or only after a Hero→Browse round-trip ⇒ stale-mount/disposal.

---

# 🪲 Side-findings worth keeping (free, verified)
- **CORPSE-LIE for `cartograph/DOC-CODE-COHERENCE.md`:** `InstancedTrees.jsx:959` comments *"a species with no baked asset simply stays on mesh (never blank)"*. **False.** `:964-966` returns `null` and the mesh group is hidden by `visible={!overheadMode}`, so the **6 species lacking an `overheadBySpecies` entry render NOTHING in Browse**: `tilia_americana` · `acer_saccharum` · `acer_saccharum_multistem` · `magnolia_sp` · `betula_pendula` · `nyssa_sylvatica`. (17 species have overhead entries; 23 render species total.)
- **Stale comment:** `LafayettePark.jsx:846` says *"INSTANCE.lookId is always 'lafayette-square' until instance-boot lands"* — **instance-boot landed** (`instance.js:42`). Comment lies; guard works.
- **Duplicate roster species:** `linden_american` (706 inst) and `tilia_americana` (144 inst) are **the same species** (linden = tilia) — same 31.2m/31.0m asset, different chassis entries. Worth a Grove cull.
- **`Douglas_Fir_Forest_01`** — `pseudotsuga_menziesii`'s chassis node is literally a multi-tree **FOREST** asset used as one placement (57×). That's the real *"roster still holds forest variants"* item, independent of the classifier bug.
- **Hero renders `lod1`**, hardcoded: `InstancedTrees.jsx:720` `const lodForRole = (_inst) => 'lod1'` (`bake-trees.js:570` "hero→lod1, browse→lod2").

# 🔧 Forensics left in `scratch/` (git-tracked — reuse, don't rebuild)
| script | what it answers |
|---|---|
| `classifier-roster-audit.mjs` | runs the real `classifyPrim` over every roster variant → wood/leaf/ambiguous % + instance counts. **The audit that found the bug.** |
| `bark-crush-sliver-audit.mjs` | per-LOD longest-edge / sliver count **in TRUE WORLD units** (node transforms applied) |
| `scale-audit.mjs` | true world height + node scales per variant (**this is what killed the unit-error theory**) |
| `lod-tri-census.mjs` | per-LOD bark/leaf triangle counts + cut% across the roster |
| `lod-prim-detail.mjs` | prim + material + `atlasKind` + ancestor-node-name dump for one variant |
| `tilia-sliver-detail.mjs` | per-LOD bark bbox spans for the suspect variants |

*(All read `public/baked/hipointe-demun/trees.json` + `public/trees/**`; run with `node scratch/<x>.mjs` from repo root — they need the repo's `node_modules`, so they will NOT run from a scratchpad dir.)*

---

## Suggested order tomorrow
1. **The free win** — read `FORESTRY_TREES/MapServer/4` (4,297 Forest Park trees, richer schema). Cheap, real, improves species truth immediately.
2. **The probe** — name the chip component. One page load beats another night of theory.
3. **Standup the classifier fix**, then land it (clears the black canopies **and** the conifer blank-bands).
4. **Jacob's call:** the `NEIGHBORHOOD-INPUTS` Tier-② reconciliation, and whether to file the Clayton records request.

> **The honest note:** tonight killed 9 theories and found 1 real bug. The bug is good and eye-confirmed. But most of the night went to re-deriving inside the tree path when the routing gate + `HANDOFF-overhead-disc-display.md` were sitting right there, and Jacob's swap observation — which invalidated the entire search space in one sentence — arrived *after* the search, not before. **Route first; instrument early; ask Jacob for the discriminator before running the tail.**
