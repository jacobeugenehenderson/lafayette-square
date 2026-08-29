# Arborist Backlog

> Part of the **arborist quartet** (`FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md`). Read at session start; check off completions during work; prune toward pristine. Resolved items belong out of this doc, not in a "Done" section. Migrated 2026-05-18 out of `cartograph/BACKLOG.md`. Tree work that intersects cartograph-side code (Couplers wiring, scene channels) still appears in `cartograph/BACKLOG.md`; tree-internal items live here.

> 🌳 **CURRENT ARC — the Forest Builder kit-matcher (supersedes the Salon arc below as the front-end direction).** Ratified architecture: **`scratch/FOREST-BUILDER-KIT-MATCHER.md`**. **Locked doctrine:** **no-cull** (all trees draw); hero-LOD impostor arc **ARCHIVED** (`cartograph/_archive/HANDOFF-tree-hero-lod-2026-06-21.md`) → the **real-DoF return** is now `cartograph/_archive/HANDOFF-real-dof-2026-06-27.md`; leaf scale + color are **rubric axes**; **Procedural + LiDAR kept** as equal peer tracks.
>
> **✅ STAGE 0 + STAGE 1 DONE (2026-06-18/19, on `curb-offset-draw`).** Keystone `arborist/rubric.json` (19 axes + similarity matrices) + `arborist/dossiers/` (10 species, ratified vs botany). Spine `arborist/{ingest-tagger,library-builder,ingest,matcher,readiness,library-inventory,forest-dashboard-html}.js` → `arborist/state/part-index.json` + canonical `public/library/` + `public/library/INVENTORY.md` ⚠️ *(the `GET /readiness` + `GET /forest` dashboards were DROPPED in `0402dee5` and folded into the Grove's **Coverage** view — the modules `readiness.js`/`matcher.js` are still live and feed `/coverage`)*. Parts procured: 4 Poly Haven CC0 barks (7/8 types) + 6 scanned vendor leaf packs (star+fan filled; hi-res in `assets/leaf-packs-2026/`, gitignored). **All 10 species buildable, 0 blockers, buildable-CLEAN=5** (Sugar/Silver/Pin Oak/Red Maple/Sweetgum). **Eye it: the Grove → Coverage view** (or `INVENTORY.md`).
>
> **▶ NEXT UP (pinned durable):** **(1) STAGE 2** = vertical slice — one Sugar Maple perfect end-to-end (viewer §9 wired to matcher options + reference panel; leaf model = Ways §5 + derived `leaf.size` + season ramp + front/back), then the maple/oak kit-mileage core. **(2) Leaf polish:** ash **compound** + cypress **feathery-needle** still 🟡 placeholders (the 6 vendor packs didn't cover them); **Various-Fall-Leaves.zip** (Desktop) → the `leaf.season` ramp; `scale` silhouette unused by top-10. **(3) Bark:** birch **salmon river-birch color + 2nd mask channel** (Stage-3 exfoliating hard case). **(4) Chassis:** ideal **ornamental cores** for crabapple/redbud (stand-ins work today). **(5) Street-shot:** raise the **atlas leaf-tile budget** (device-profile) so the 2048 leaf sources render crisp up close. **(6)** habit-untag backlog (80 chassis); ratify Bark003 (ambientCG "smooth" vs our ridged). Tooling: `scratch/compose-leaf-packs.mjs` (deterministic atlas builder; ~20 scans/pack in `assets/leaf-packs-2026/`). The May-2026 Salon-composition + Procedural-v1.5 brief arcs (the as-built the kit-matcher rides) are **cooled to `_archive/BACKLOG-2026-05-brief-arcs.md`** — read the architecture doc first; the live open items that survived are distilled in `§ Live open work carried forward` (bottom).

---

## ▶ 2026-08-28 — ⛔⛔ ONE TREE, TWO LIBRARY IDS — AND THE FALLBACK PICKS THE UNCOMPOSED ONE

> Jacob: *"Sugar maple is definitely on the list, so that's a naming problem… is that other tree
> from the master library that might be invoked in another neighborhood?"* — yes, and it is in
> **every** town.

**The pairs.** One tree, two ids: a COMPOSED common-named asset and a RAW Latin-named twin.

| | composed twin | raw twin | LS | staging | HPDM | toy |
|---|---|---|---|---|---|---|
| Sugar Maple | `maple_sugar` ✅ | `acer_saccharum` ⛔ | 616 / 251 | 300 / 132 | 488 / 101 | — / 3 |
| Blackgum | `blackgum` ✅ | `nyssa_sylvatica` ⛔ | 338 / 231 | 132 / 133 | 369 / 124 | — |

⛔ **~990 placements kit-wide land on the UNCOMPOSED twin.** `bake-trees#pickVariant`'s **category
fallback** can reach any asset in the category, including raw ones nobody authored. When it does,
that tree is **guaranteed to ship as permanent mesh**: no composition → no `barkDetailBySpecies`
record → `uBarkTileScale` (0,0) → blank band → `OverheadBaker` correctly refuses to POST. The Grove
banner has been reporting the symptom (`no impostor: maple_silver, nyssa_sylvatica`) for months.
⛔ **And the raw twin has NO ROSTER ROW**, so it has no light of any colour — the operator cannot
see it, judge it, or withhold it. It is a tree on the map nobody chose.

⭐⭐ **THE NAMING IS ALREADY WIRED — THIS IS A FOLLOW-THROUGH, NOT NEW MACHINERY.**
`arborist/vocabulary.mjs#resolveSpecies` **already collapses every pair**:
```
acer_saccharum → "Sugar Maple"   ≡  maple_sugar → "Sugar Maple"
nyssa_sylvatica → "blackgum"     ≡  blackgum    → "blackgum"
quercus_alba   → "Oak, White"    ≡  oak_white   → "Oak, White"
```
`pickVariant` simply never asks. ⚠️ **The two vocabulary functions DISAGREE and the fix must key on
the right one:** `aliasesFor('blackgum')` returns `["blackgum","nyssa_sylvatica","Nyssa sylvatica"]`,
but `aliasesFor('maple_sugar')` returns only `["maple_sugar"]` — the Latin twin is missing from the
alias list even though `resolveSpecies` unifies them.

**Two moves, and the first is the load-bearing one:**
1. ⭐ **CATEGORY FALLBACK MAY ONLY SELECT A COMPOSED ASSET.** An unauthored asset reached by an
   automatic path is guaranteed to ship as mesh forever — the same principle as the **NO-FILLER
   gate**. This makes the class *impossible* rather than repaired, in every town, and it needs no
   per-pair authoring. ⛔ It must fail LOUDLY when a category has no composed candidate, never
   silently drop the placement.
2. Resolve candidate ids through `resolveSpecies` so the two halves of a pair are one candidate,
   and repair `aliasesFor`'s sugar-maple entry so the two functions agree.

▶ `node scratch/claims-the-roster-light-tells-the-truth.mjs` reports these as **direction B**
("PLACED BUT UNEXPORTED — selected by CATEGORY FALLBACK, no roster row routes to it").

---

## ▶ 2026-08-28 — ⭐⭐ A SPECIES HAS TWO SIZE WINDOWS, AND THE TOWN PICKS ONE *(Jacob's arc)*

> **"This isn't an old growth forest… is that a new column we should add to the dossiers? `urbanMax` `naturalMax`? …you know, altadena, other places, maybe they do in fact have old-growth versions of things."**

⛔ **THE SOURCES WERE NEVER IN CONFLICT — THEY ANSWER DIFFERENT QUESTIONS.** `chassis.size` forces one
number to mean two things, and the collapse is what manufactures the "contested" nulls
(`ARCHITECTURE.md:53` — `oak_bur`, `blackgum`, `linden_american` all nulled for exactly this).
Sugar maple makes it plain:

| source | Sugar Maple | Oak, White | what it is |
|---|---|---|---|
| selectree `height_high` | 60 ft (18.3 m) | 60 ft (18.3 m) | a **landscape/street** planting figure |
| ncsu `Dimensions` | 40–120 ft (12–37 m) | 50–135 ft (15–41 m) | **species potential**, forest-grown |
| usda `Height, Mature` | 100 ft (30.5 m) | 100 ft (30.5 m) | between the two |

A street sugar maple is **60 ft**; the same species in a forest reaches **120 ft**. 2×, and neither is wrong.

⭐ **THE DATA IS ALREADY HARVESTED — ALL 34 SPECIES CARRY BOTH FIGURES.** Nothing needs re-fetching;
▶ `node -e` over `scratch/dossier-raw-observations.jsonl` + `-batch2.jsonl` (34/34 have an ncsu range
AND a selectree landscape height). The split is **derived from provenance** (`askedAs` records which
database each cell came from), so it satisfies `bake-trees.js:589` — nothing invented.

⭐⭐ **AND THE SELECTOR IS NOT ON THE SPECIES — IT IS ON THE INSTALLATION.** "Urban street grid or a
place with old growth" is a fact about **Lafayette Square vs Altadena**, and belongs on the Look
beside `heroLook` / `layerVis`. That is the kit-shaped half: town #2 gets the right window without
re-authoring a single species. ⛔ Do not put a habitat flag on the dossier.

**Shape:** two new sibling axes next to the three that already exist (`chassis.size`,
`chassis.size_20yr`, `chassis.size_max` — the rubric carries 36 axes, so this is a fourth/fifth
sibling, not a new concept). Consumers to touch: `rubric.json` (keystone), `units.mjs`, `matcher.js`,
`publish-glb.js#normalizeScale`, `ingest-tagger.js`, `bake-trees.js#bandFor`. **Needs a standup** —
it touches the rubric keystone.

⚠️ **Blocked on this today:** `quercus_alba` was minted 2026-08-28 with `chassis.size` merged from
ncsu+selectree to a **41.1 m target**, which would have rendered **519 white oaks at 41 m** — taller
than any measured species on the map. Nulled as contested per precedent; `bandFor` now falls through
to the USDA pair (7.6–30.5 m) and `normalizeScale` to `mature-heights.json`'s 25 m stopgap. The
minted value is preserved under `chassis.size.mintedAs` for whoever settles it.

⭐ **ALSO SURFACED, AND IT IS ITS OWN BUG:** the harvest's `ROWS` table is ranked by **roster demand**,
but render load follows **placed** demand after substitution. "Oak, White" is **9** placements in the
census and **519** on the slab — it is the substitution target for Oak, Pin (459). It fell below the
harvest cut on the wrong axis. ▶ Re-rank the harvest by placed assets, and check what else that hid.

---

## ▶ 2026-08-27 — ⭐⭐ THOUSANDS OF TREES IS THE PERMANENT CONDITION *(Jacob: "the next unblocker")*

*"We are going to consistently have thousands of trees to show, so tackling that fact head
on is now the next unblocker."* ⛔ **Not an LS problem — a KIT constraint.** HiPointe already
places **more** trees than LS.
▶ `for t in lafayette-square hipointe-demun ksi-y-m-yn; do node -e "console.log('$t',require('./public/baked/'+'$t'+'/trees.json').instances.length)"; done`

**The proposal (Jacob):** reduce *rendering complexity* with distance — "an extremely truncated
colour/texture/alpha overwrite profile for the most distant trees" — so that **more** trees can
stay mesh rather than fewer. Not only size and perf: **flicker and artifacting**.

⭐ **It is on the SANCTIONED side of the LOD line, and that matters.** `ARCHITECTURE §View-aware
bark tiering` disambiguates explicitly: the **shader** tier is *"legitimately selected at runtime
by camera"*; **geometry** is role-at-bake and never camera-swapped (`GeoTierDriver` is retired).
This widens the sanctioned axis. ⛔ It is NOT a revival of runtime geometry swapping.

⭐ **And it fills a rung that does not exist.** An impostor is already a truncated profile —
truncated all the way to a billboard. The ladder jumps from *full mesh + full shader* to *2D
card* with nothing between. "Keep the mesh, collapse the shading" is the missing middle.

### ✅ SETTLED 2026-08-27 — the counts, and the budget arithmetic

**FOUR fields, three meanings, ONE authority.** They read alike; they answer different questions.
▶ `node -e "const I=require('./public/baked/lafayette-square/trees.json').instances;const f={};for(const i of I)for(const k of ['meshTier','heroTier','heroRole'])if(i[k]!==undefined)f[k+'='+i[k]]=(f[k+'='+i[k]]||0)+1;console.log(f)"`

| field | LS | what it is | authority |
|---|---|---|---|
| `meshTier` | 2,282 true | **species**-level operator eligibility, from the Grove bar (`b.tier==='mesh'`) | not a render decision |
| `heroTier` | 114 mesh / 5,013 cull | the Phase-A classifier | **QC tint only** (`aHeroTier`) |
| `heroRole` | **399 mesh / 4,728 impostor** | the geometry budget | ⭐ **the one the runtime obeys** (`InstancedTrees.jsx:859`) |

⛔ **AND THE BUDGET RECONCILES EXACTLY — I claimed otherwise and was wrong.**
Σ lod1 triangles of the 399 = **14,979,130** = `trianglesSpent`, to the triangle. The error was
assuming the runtime draws each instance's `url` (lod2); `InstancedTrees#lodForRole` overrides it
to **lod1** for mesh role, so weighing lod1 is correct.
▶ `node scratch/hero-band-reconcile.mjs`

### ⭐⭐ AND THE MEASUREMENT FOUND THE LEVER

Same 399 placements, both ladders:
```
Σ lod1   14,979,130   ← charged AND drawn
Σ lod2      878,524   ← 17× cheaper
```
**`lodForRole = (_inst) => 'lod1'`** (`InstancedTrees.jsx:770`) takes the instance and throws it
away. Every placement already carries **`panDist`**, baked — its distance to the authored hero pan.
⇒ A distance-graded LOD is **already plumbed and unused**, and grading by `panDist` is role-at-bake
(a baked distance, not a live camera), so it is on the sanctioned side of the LOD line.

⚠️ **The same 15M budget would afford roughly 17× more mesh trees** if the far half of the band drew
lod2. ⛔ NOT a licence to change the constant — what lod2 looks like at band distance is an eye
question, and the 2026-06-24 regression (lod1 decimated to specks) is what that mistake looks like.

⭐ **This does NOT displace Jacob's proposal — it is the geometry half of the same idea.** His is the
shading half. Triangles are a *vertex*-cost proxy; the cost that hurts at distance is fragments and
overdraw, which alpha-tested leaf cards make worse by defeating early-Z (`opaqueCanopyMaterial`'s
own comment). **Whether the budget's currency should be fragments rather than triangles is still
open, and still question 2.**

### Already built — ⛔ do not rebuild
- **lod2 for mesh-role placements** — done. All 2,282 already point at `lod2`.
- **`opaqueCanopyMaterial`** (`treeAtlasMaterial.js`) — a sibling material with `alphaTest` OFF,
  deliberately opaque for early-Z and near-zero overdraw. **That is a truncated alpha profile,
  built, in the same program family — and NOTHING in `src/` consumes it.** ⛔ Whether it was
  abandoned, superseded or simply never wired is NOT established; finding out is cheaper than
  designing the tier from scratch, and it is the first place to look.
  ▶ `grep -rn "opaqueCanopyMaterial" src/`
- **The bark shader tier** — `treeBarkTierUniform`, camera-selected, three tiers, live.

### Order
1. **Settle the three mesh counts and the budget arithmetic.** Nothing below can be evaluated
   through an instrument that does not close.
2. **Answer whether the budget's currency should be fragments/overdraw rather than triangles.**
3. **Find out why `opaqueCanopyMaterial` is dark**, then wire or retire it.
4. **Then** the truncated distance profile, against a budget that measures what it costs.

⚠️ Interacts with the bark arc above: a vector/greyscale bark IS a cheaper distant profile. Do not
build two distance-tier mechanisms.

---

## ▶ 2026-08-27 — BARK: VECTOR COLOUR OVER TESSELLATED GREYSCALE *(Jacob's arc)*

**The proposal, in his words:** *"do the heaviest/most expensive colour work with the vectors
and then we have a bunch of tessellated greyscale texture files."* Vector carries **colour and
form** at street/LOD0 where nothing may pixelate; a shared library of **tileable greyscale**
carries grain and relief everywhere. ⭐ The standing constraint over all of it: *"a premium
viewing experience is 50% of the project. It has to look perfect and gorgeous, but if it
doesn't load that's irrelevant."*

**Why it is the right split, and it is not mainly about bytes.** Colour is what breaks the
atlas's own economics. `ORIENTATION §7 DONE`: *"atlas cost scales with distinct PARTS, not
species count."* Two species with the same furrow structure and different colour need two
photographs today; split, they share ONE greyscale tile and differ only in vector. The rubric's
~8 bark **types** becomes a literal count of greyscale tiles. Colour also stops being welded
into a photograph and becomes the thing the operator turns — which `bark.tintBase` and the
posterize colour axis were both reaching for and could not get.

⚠️ **The technique risk, named up front:** photographic bark carries CORRELATED colour and
structure — the dark is dark *because* it is a furrow. Drive the vector colour off the
greyscale luminance (what `compileGradientLUT` already does) or it reads as tinted plastic.
This is `SALON-INTERFACE §2`'s leaf near-tier pattern — *posterize substrate carrying form +
high-pass detail overlay carrying grain* — with the substrate promoted from raster to vector.

### ⛔ THE ORDER IS LOAD-BEARING. Steps 2–3 measured before step 1 are measured through a defect.

**1. TILING — `ARCHITECTURE §"Bark tile wrap is the open shader question (Phase B.2)"`, option 1:
WebGL2 texture arrays.** Everything here needs *"stitching to be a blasé operation"* and we do
not have it. The atlas is `ClampToEdge`; `RepeatWrapping` would wrap the whole sheet into
another species' tile; so `bake-look#transformUVs` folds tiling away with a per-vertex `frac()`.
⭐ **It also kills the tear for free** — most of a trunk's triangles straddle a repeat line and
run the texture backwards across the tile.
▶ `node scratch/claims-atlas-uv-rect-survives-the-bake.mjs`
⛔ Option 3 (a texture per species) breaks Bloom's single-program constraint. Not viable.

**2. THE GREYSCALE LIBRARY** — sized against the rubric's bark **types**, not per species. One
channel, not three; tileable, so a tile stops needing to be large — repetition supplies area.

**3. VECTOR COLOUR** — the new work. Today's posterize is an indexed PNG: quantised raster, not
resolution-independent. `extract-bark-posterized.mjs` is the producer to grow, not replace.
⚠️ **This inverts a LOOK decision, not just a budget.** Today `treeBarkTierUniform` sends
street (<20 m) → tier 2 → **vendor bitmap**, hero/browse → tiers 0/1 → **posterized**, and the
comment records that as deliberate: the kit illustrated look far, PBR realism near. Jacob's
order is the reverse — stylised near, photographic far — because a vector does not degrade as
you walk up to it and a bitmap is least useful when minified. **Confirm the look intent when
this step starts; it is an artistic call, not a perf one.**

**4. REPACK THE SHEET** — independent of 1–3, do it whenever. Half the atlas is empty.
▶ `node scratch/atlas-occupancy.mjs`

### What is already built — do not rebuild it
- **Posterize**: `arborist/extract-bark-posterized.mjs` (Brief 10B), bound for every composed
  species, and far smaller than the vendor bitmap it stands in for.
- **View-aware tiering**: `treeBarkTierUniform` + the tier gate in `treeAtlasMaterial`.
- **A detail-overlay slot**: `barkDetailBySpecies` — the grain half of the near tier already
  has a home.
▶ `node -e "const a=require('./public/baked/lafayette-square/trees-atlas.json');for(const k of ['barkBySpecies','barkPosterizedBySpecies','barkDetailBySpecies'])console.log(k,Object.keys(a[k]||{}).length)"`

### Absorbed from the 2026-08-23 punch list
**"The trunks look too artificial."** Already diagnosed there and it is this arc's root: the
trunk is **not** low-poly — it reads smooth because its bark is a *slice of one sheet shared
across every species*. ⛔ Do NOT fix it by binding the raw kit texture: that was tried and
reverted — it discards `tintBase`/`tintJitterRange`/`roughnessOverride` and the
gradient/detail/posterized slots, i.e. the operator's authored bark TREATMENT. Any fix belongs
inside that path — which is what steps 2–3 build.

---

## ▶ 2026-08-27 — ⛔ THE MAP'S PER-SPECIES BARK UNIFORMS HAVE NEVER REACHED THE GPU

⛔⛔ **`InstancedTrees.jsx`'s Phase-B `onBeforeRender` does not do what its comment says.**
Verbatim: *"we overwrite right before three.js submits the draw, and three.js uploads uniform
values per draw."* **It does not.** three.js uploads a material's uniforms only when the program
changed or `material.id !== _currentMaterialId`:

```
three.module.js:30289-30310   let refreshMaterial = false
                              if (state.useProgram(program.program)) refreshMaterial = true
                              if (material.id !== _currentMaterialId) refreshMaterial = true
                              ... if (refreshMaterial) WebGLUniforms.upload(...)
```

Every mesh-role tree draws with the **one shared** `treeMaterial`, so for the second and every
subsequent species in a frame the write is silently dropped. **Whichever species draws first
paints its bark onto all of them**, and three depth-sorts opaque meshes, so the winner changes
with the camera.

⭐ **WHY NOBODY HAS EVER SEEN IT, AND WHY THAT IS THE DANGEROUS PART.** Every LS species carries
the *same* bark defaults — `tintBase #ffffff`, `tintJitterRange 0.08`, `roughnessOverride 0.85`.
The only per-species value that differs is the gradient slot, and exactly one species has one.
**The path has never been exercised with values that differ, so it has never visibly failed.**
The first authored bark tint on a second species turns it on.
▶ `node -e "const a=require('./public/baked/lafayette-square/trees-atlas.json');console.log(a.barkBySpecies)"`

**Found by:** the Grove, 2026-08-27 — the first surface to draw ten species side by side. Jacob's
eye: *"they look great until the trunks switch to red."* The Grove is fixed by giving each species
its own material instance in one shader program (`treeAtlasMaterial#cloneTreeMaterial`); **the map
is NOT fixed and this item is that work.** ⛔ Do not "fix" it by deleting the comment — the
uniforms are meant to be per-species; the delivery is what is broken.

⚠️ **The same question hangs over every other per-draw write on that material** —
`applyDeformerUniforms`, `setWhipRadius` — which ride the identical `onBeforeRender`. Not
measured. ⛔ Do not assume they are fine because bark was the one that showed.

---

## ▶ 2026-08-26 — THE SIMILARITY MATRICES ARE OWED, AND THE OWED LIST IS SHORT

⛔⛔ **THE MATCHER SCORES 8 ENUM AXES THAT HAVE NO SIMILARITY MATRIX.** Without one,
`enumDistance` returns `farDistance` (9) for *any* non-identical pair (`matcher.js:53-57`),
so the axis is **exact-match-or-nothing** and a near miss scores as far as an absurd one.
▶ `node scratch/claims-matched-axes-have-matrices.mjs` — the list, the term counts, and the
pairs to author. ⛔ Never quote the numbers; re-run it.

⭐⭐ **THIS IS THE ASPIRATION CASE** (`CLAUDE.md`'s smell detector): `rubric.json`'s
`_cutover.similarityMatrices.owed` **lists five leaf axes and none was built.** Filed as
owed, read as done. Neither rot to evict nor a doc to quietly correct — **unbuilt work.**

⭐ **AND THE OWED LIST IS ITSELF INCOMPLETE — the check found more than was filed.**
`overlay.type`, `overlay.fruit_type`, `overlay.appendage` and `chassis.trunks` are scored by
the matcher and were never recorded as owed at all. It also lists `leaf.growthway`, which
the matcher does **not** score. ⛔ So the owed list is not the scope; **the check is.**

**The measured consequence, one instance, and it is not the only one:** `serviceberry, downy`
(70 placements) reports *"leaf — no matchable asset"* while we own `serrate_ovate`, which is
green and passes cell agreement. Its dossier says `elliptical` + `serrate`; `elliptical`
cannot reach `ovate`, so the pack we hold is invisible to it. ⭐ **That is not a procurement
problem wearing a matcher's clothes — it is the reverse**, and it is why the 2026-08-25 leaf
expedition was right to acquire nothing (`cartograph/_archive/BRIEF-leaf-pack-expedition-2026-08-26.md`, retired — its 318-placement premise is the thing that was false).

⛔⛔ **A MATRIX IS TASTE, NOT DATA. NOTHING CAN GENERATE ONE.** `rubric.similarityMatrices._doc`:
*"the single place human taste re-enters (§15.1)"*. Shape is `value → { neighbor: distance }`,
`0` identity, `1` near/workable, `2` stretch, unlisted = far; **symmetric by construction**
(`enumDistance` tries both orders, so author each pair once). The two built matrices —
`chassis.habit`, `bark.texture` — are the worked examples.

▶ **THE REAL QUESTION IS WHERE THE OPERATOR AUTHORS THEM, and there is no surface today.**
Jacob, 2026-08-26: *"I have wondered if we should make a little leaf studio or bark studio…
I guess it's a bit like the shelf we have for the chassises, but that's not perfect/totally
finished now."* ⭐ The matrices, the **5 cell-inconsistent leaf packs**
(`node scratch/claims-leaf-pack-cells-agree.mjs`) and the stale part-index are all the same
job — **curating the library we already own** — and all three are currently authored by
editing JSON or not at all. ⛔ **Not designed, not scoped, not started.** Standup before code.

---

## ▶ 2026-08-23 — THE DIORAMA IS LIVE ON THE SITE; JACOB'S PUNCH LIST

⛔⛔ **THE SPECIMEN VIEWER IS NOT THE PROBLEM — THE BAKE IS. Measured 2026-08-23**
after Jacob put the Salon and the diorama side by side ("the tree in the salon is
beautiful and the full monte looks awful"). Same species, same variant, two
surfaces, and the difference is in the FILE:

    baked/lafayette-square/trees/<sp>/skeleton-1-lod0.glb
      linden_american      12.4 MB   331,389 verts   200,171 tris   3 prims
      oak_white             3.7 MB   102,353 verts    56,654 tris   2 prims
      maple_sugar           3.2 MB    90,312 verts    49,111 tris   2 prims
      platanus_acerifolia   0.3 MB     8,761 verts     8,360 tris   4 prims

⭐ **The linden is the only richly-baked specimen — 4× the maple, 24× the plane.**
That is why it is the canary, and why everything else looks thin beside it.

⭐ **THE TWO SURFACES READ DIFFERENT ARTIFACTS.** The Salon POSTs a live
composition and renders a FRESH build (`SalonWorkstage:615`); the diorama loads
the frozen bake (`TreeDiorama:411`) because what it shows must be a thing that
actually deploys.
⛔ **CORRECTED 2026-08-23 — this block used to conclude "so the diorama looking
worse than the Salon is the system WORKING." Jacob does not accept that, and it
was a doc's editorial sentence, not his ruling.** A bake that thin is a DEFECT
in the bake. ✅ **And it is now fixed at the source:** `publish-glb` was cutting
lod0's canopy to `leafDecimation.targetRatio` 0.20 and the bracket simplifier
was crushing its bark; lod0 is now the SOLO lod, emitted pristine, and matches
the Salon EXACTLY on both species (`5ef05604`).

⚠️ **CONSEQUENCE FOR THE CANARY, and it should be said before anyone switches:**
pointing the canary at sugar maple will make the diorama look WORSE until maple
is re-baked at linden parity. Bake first, then switch. ⛔ Do not respond to the
thin render by tuning the viewer; nothing in TreeDiorama can put back geometry
that is not in the file. The bake is dated 2026-07-31 and 14 commits have touched
`arborist/` or `treeAtlasMaterial.js` since — but ⚠️ that is circumstantial:
**which of those changed leaf density is NOT established.**

◻ **RENAME "FULL MONTE"** (Jacob, 2026-08-23): *"I don't even get why we're using
that terminology anymore; it's just the street-level full-detail single tree
export."* He is right — the name says nothing about what it is. Blast radius is
small and known: 6 files in `src/`, 4 docs, and ⛔ one URL contract,
`?view=fullmonte` (`ArboristApp.jsx:90`), which is written into `ls/OPERATIONS §5`
and the site's docs. Rename the concept AND the param, or neither — a param that
disagrees with its own name is how the next reader loses an hour.


`?embed=tree` (framed, on theward-online) and the Arborist's `?view=fullmonte`
are the same component — `src/components/TreeDiorama.jsx`. Working end to end:
the canary specimen on ground, under the real sky, authored camera, production
FX chain, `ward-time` from the host page.

⛔ **THE BUG THAT NEARLY SANK IT — read this before touching the Canvas.** Framed,
the tree appeared and then vanished, leaving grass and a horizon under a camera
that had never been posed; top-level the same component was perfect. Measured:

    atlas "ready" · framed true · memo 6 → 43 → 85 → … → 260  (~46×/second)
    …with `url` and the loaded `scene.uuid` IDENTICAL, and the measure
    effect NEVER committing once.

A `useMemo([scene])` recomputing 46×/s on a stable dep is a REMOUNT every frame:
`App` re-renders on every store tick → the Canvas re-renders → R3F re-runs
`root.render()` under a fresh context Bridge → the whole scene subtree is torn
down and rebuilt before React commits an effect. Geometry built 46×/s, measured
zero times. ⇒ `export default memo(TreeDiorama)`. ⛔ Do not remove it because
"it takes no props so it cannot re-render" — taking no props is what makes memo
total. ▶ Any bare `<Canvas>` mounted under `App` has this exposure.

⭐⭐ **WHY THIS SURFACE IS WORTH THE SPEND — IT IS THE PROVING GROUND FOR STREET
VIEW.** Jacob, 2026-08-23: *"our tree will need to take a lot of moonlight, as
well. Again, being that it's a single tree. We will be able to use all these
settings and features when we elaborate the street view of the trees."*
⇒ ⛔ **So nothing here may be a diorama-only hack.** Every lighting gain must be
built as an AUTHORED knob on the shared material/channels, defaulting to today's
value, so the street view inherits it by turning it up rather than by
reimplementing it. That is why the transmission proposal below is a uniform
defaulting to 0 and not a second material.
⭐ **Moonlight is already plumbed and authored** — `scene.json#dirMoon` is a TOD
channel (`night ×2 · dusk ×1 · dawn 0 · sunset 0`) driving `SecondaryOrb` through
`dirMoonMulRef`, and the diorama receives it because it mounts `CelestialBodies`.
⇒ "take a lot of moonlight" is a TUNING question on an existing channel, not a
missing feature — and it ports to street view for free.

◻ **JACOB'S LIST, 2026-08-23, verbatim** — "work on wind motion, add trunk and
ground shading, re-add visible time slider; perhaps add actual 'grass' texture?
around tree? Work on luminance and back lighting, pump up color saturation."
  - **wind motion — ⭐ THE REAL CRITIQUE IS THAT IT IS NOT REALISTIC** (Jacob,
    2026-08-23), which is a bigger statement than the repeat-rate note this
    replaces and should not be collapsed back into it. A believable canopy is
    not one gust played at a better interval: it is turbulence — many scales at
    once, leaves moving before branches, the whole crown never in phase with
    itself. ⚠️ CAUSE NOT ESTABLISHED and no fix is specced; what is measured is
    only what follows. ⛔ Do not start by tuning the period — that answers the
    old, narrower complaint.
    The old note, still true and still a constraint on any fix: ⚠ Its period is a SHARED
    shader constant in `treeAtlasMaterial`'s sway block, so tuning it is a
    whole-map look change, not a diorama tweak. And wind is still OWED at the
    source: the meteorologist does not author a `wind` block into the directive
    (`ls/OPERATIONS.md §5`), so `uWindIntensity` is 0 and only the 5 mm rustle
    floor runs. ▶ `node -e "const a=require('./public/clouds/almanac.json');console.log(a.rules.filter(r=>JSON.stringify(r).includes('\"wind\"')).length+'/'+a.rules.length)"`
  - **trunk shading** — ▶ absorbed into `▶ 2026-08-27 BARK: VECTOR COLOUR OVER
    TESSELLATED GREYSCALE`, which is its root and its fix.
  - **ground shading + a real grass texture around the tree** — the ground is
    currently a flat `makeGrassMaterial` disc with a radial fade. It is scenery,
    not the Ward's ground.
  - **visible time slider** — the opaque embed now covers the band, so the
    `.skyband-mark` no longer shows (site repo).
  - **luminance, back lighting, colour saturation — ALPHA CONFIRMED SOUND;
    THE GAP IS LEAF TRANSMISSION.** Jacob asked to confirm alpha "mostly for
    luminance within the canopy and when backlit and at golden hour." Measured
    from `trees-atlas.json#atlas`:

        alphaMode "MASK" · alphaCutoff 0.5 · alphaTest 0.5 · doubleSided TRUE

    ⇒ Backlit cards are **not** culled (double-sided), and distance erosion is
    already solved by the coverage-preserving mip chain. ⛔ **Nothing is wrong
    with the alpha.**
    ⭐ **What is missing is that a leaf cannot transmit light.** `grep -i
    "transmission|translucen|subsurface|wrap"` over `treeAtlasMaterial.js`
    returns NOTHING. Leaves are opaque `MeshStandardMaterial` faces, so a
    double-sided leaf lit from behind shows an unlit back face and goes flat —
    which is exactly what golden hour shows: at 18:40 with the sun directly
    behind the trunk and a warm horizon burning through, the canopy stays a
    uniform mid-green with no warm rim and no glow anywhere.
    ✅✅ **BUILT 2026-08-23.** `uLeafTransmission` + `uLeafTransmissionSharpness`, shared material, default 0, gated on `vBark`, looping **every** directional light so the moon transmits too. Tune by eye: `?view=fullmonte&leafT=&leafK=`. ⚠️ **Not authored per Look yet — that value is Jacob's call and until it is made the map is unchanged.** The spec it was built to, kept because it records what was ruled out:
      - `uLeafTransmission` on the SHARED tree material (`treeAtlasMaterial.js`,
        wired in `injectFoliageSway` beside the existing sway uniforms), plus a
        module-scoped `{ value }` object so one write drives every mounted tree
        — the `treeSwayUniforms` / `treeBarkTierUniform` pattern exactly.
      - ⛔ **A UNIFORM BRANCH, NEVER A SHADER VARIANT.** The single-program
        constraint is load-bearing for Bloom (`treeAtlasMaterial.js:232` and the
        Phase-B notes). A second program is the one thing that must not happen.
      - Gate on LEAF fragments only — `vBark` is already interpolated to the
        fragment shader (set at `:455` from the `aBark` attribute), so the gate
        exists; no new attribute, no re-bake, GLBs stay byte-identical.
      - Backlight factor from the view/light geometry (wrap or
        `pow(saturate(dot(-V, L)), k)`), tinted by the sampled leaf albedo so a
        lit leaf glows its OWN colour rather than a uniform wash.
      - ⭐ **DEFAULT 0.** With the uniform at 0 the map renders bit-identical to
        today — which is what makes this safe to land on the shared material
        before anyone has authored a value.
      - Then author it up per Look (the diorama first), so ⭐ **the street view
        inherits it by turning a knob** rather than by reimplementing it. That
        is the whole reason it lives on the shared material and not here.
    ⚠ Do NOT reach for pixel readback to quantify this: the Canvas runs without
    `preserveDrawingBuffer`, so `drawImage`/`getImageData` returns all zeros and
    reads as "everything is black." That is the method failing, not a finding.
    Already spent on the licence ("only one tree, almost certainly desktop"):
    shadow map retargeted ±900 m → ~60 m (0.44 m → ~15 mm per texel), dpr
    1.5 → 2, `StageShadows`.
  - ⚠ Also observed, undiagnosed: stars render in a DAYLIT sky in this Canvas,
    and the grass reads brighter than the tree at night.

◻ **ALSO TOMORROW — WRITE THE REUSE CLAIM INTO `ls/FEATURES.md`** (Jacob asked
for this, 2026-08-23). It belongs beside the existing line about the panel
embeds — *"making them embeddable was a route, not a refactor"* — because this
is the 3D analogue of the same claim, and right now it is only visible to
someone who reads the imports.
⭐ **The claim, and it is evidence not sentiment: a surface nobody designed for
was built almost entirely out of parts that already existed.** Assembled, not
written — `CelestialBodies` (which carries the LIGHTS, not just the dome),
`InstancedTrees#SwayDriver`, the shared per-Look atlas material +
`stampTreeVertexAttrs`, `ExposureTicker`, `PostProcessing`, `StageShadows`,
`makeGrassMaterial`, `CANARY_GROUND_CAMERA`, the `ward-time` bridge already in
`App`, and `useCanaryTree`. Genuinely new: the camera fit, a ground disc,
`ShadowFocus`.
⚠️ **Write the counterweight too or it is marketing, not documentation:** every
real cost landed at a SEAM, not inside a module — `ExposureTicker` exists for a
bare Canvas and nothing told us to mount it; the canary camera lived in the
UNFINISHED surface so the finished one depended on it backwards; and the
per-frame remount sits between `App` and R3F, which no module owns. The modules
held; the joins are where the time went. ⛔ Do not write this as praise — name
the parts and name the seams, or leave it out.

⛔ **LEAVES ARE NOT ON THE LIST.** Measured: 174,136 verts / 83,377 tris on the
canopy ≈ 42,000 alpha CARDS (leaf packs, not geometry). Jacob: "the tree you
already had with the leaves it already had were already great."

---

## ▶ 2026-08-22 — A PUBLISHED TREE GLB PAINTS ITS LEAVES WITH BARK

Surfaced from outside the runtime, building a marketing page: a published
`skeleton-N-lod*.glb` carries **ONE material** and applies it to every mesh —
including the leaves.

```
/trees/tilia_americana/skeleton-1-lod1.glb   809 KB · 4,977 tris · 45 ms
  materials  EuropeanLindenBark_Mat          ← the only one
  images     EuropeanLinden_Tree_Normal, …
  nodes      BranchesSG · CapsSG · LeavesSG  ← all three get the bark material
```

**So the GLB is self-contained for BARK and not for LEAVES.** Loaded anywhere
but the Ward runtime — the Salon, a third-party viewer, an embedding page — the
canopy renders as bark-coloured cards. Assign the leaf kit by hand and the
leaves disappear instead, because the cards' UVs expect the atlas tile they were
authored against, not a whole leaf sheet.

⚠️ **Consequences worth deciding on when the arborist comes back up:**
- **A tree GLB is not portable on its own.** Anything that consumes one outside
  the runtime needs the Look's leaf material too, and nothing in the file says
  so. That is the same shape as a silent fallback: it does not fail, it just
  looks wrong.
- The published artifact contract (`FEATURES §What it produces`) says
  `skeleton-N.glb` + `tips-N.json` + `manifest.json`. It does not say the mesh
  is only half-dressed.
- `manifest.json` for `tilia_americana` has **`bark: null`, `leafCluster: null`**
  — so the file that would name the missing material names nothing.

⚠️ **A second, smaller trap for whoever picks this up:** the node names do NOT
survive loading. After `GLTFLoader`, every mesh reports its parent as `Scene`;
`BranchesSG` / `CapsSG` / `LeavesSG` are on the meshes themselves, in draw
order. Matching on `parent.name` silently classifies everything as branches.

▶ **Repro, 30 seconds:** `scratch/tree-viewer.html` — an off-the-shelf three.js
viewer, no Ward code. `?tree=tilia_americana&lod=0&bark=bark_brown_01&leaf=heart`
prints the material/mesh/kit mapping in the corner. lod0 is 202,936 tris and
loads in ~250 ms, so weight is NOT the obstacle here; dressing is.

---

## ▶ 2026-07-21 — SLAB WEIGHT: trees are ~85–88% of a poured neighborhood

Surfaced auditing the GitHub-Pages payload (tracked `public/` ≈ 1.03 GB against Pages' 1 GB soft limit). The finding is arborist-shaped: **the town is small, the trees are not.**

| scene | tracked | trees |
|---|---|---|
| centrum (2,954 buildings — the most in the repo) | **35 MB** | none baked yet |
| altadena | 117 MB | none (terrain-heavy) |
| lafayette-square | 147 MB | **126 MB — 85%** |
| hipointe-demun | 307 MB | **269 MB — 88%** |

Buildings + ground + lamps + shape + scene come to **20–35 MB**. Everything above that is the tree library baked per scene. **207 MB (25%) of `public/baked/` is byte-identical duplication.** Four items, cheapest first:

- [x] **⛔ BUG — `linden_american` skeleton variants are byte-identical** *(fixed 2026-07-22)*. **Cause, two links:** (1) `american_linden_a.glb` is a **shading-group chassis** (`BranchesSG` / `CapsSG` / `LeavesSG` — one tree in three meshes, exactly case 3 in `publish-glb`'s own variant-detection comment), and `generate-salon#writeMultiCompositionGLB` emitted **one top-level node per sub-mesh**, all named `linden_american_1`; (2) `publish-glb#namesSuggestVariants` counted the shared prefix without checking the names actually *differ* → three "variants", and keep-**by-name** then had each variant keep all three siblings → three byte-identical complete trees. Not stacked geometry: lod2 is 1,495 tris either way, so the *tree* always rendered correctly — the cost was publishing the full LOD ladder 3×, shipping it 3× per scene, and a roster that believed in three variants it never had. **Fixed at the source** (one node per *composition*, primitives merged onto one mesh) **and hardened downstream** (identical sibling names are not a variant signal; variants now keep by split-level **index**, not name, so a same-named forest scene can't collide either). Re-published → `variant mode: single (1 variant)`; stale `skeleton-2/3` removed from `public/trees/linden_american/`; the two dead roster entries removed from `looks/lafayette-square/design.json`. ▶ **Real linden variety is now an authoring job** — add slots in the Salon; the pipeline will publish them as genuinely distinct variants. ▶ **The baked copies under `public/baked/*/trees/linden_american/` are still the old triples until a re-bake.**
- [ ] **KTX2/Basis the tree atlases.** 97 MB of uncompressed PNG across scenes (HPDM alone: 73 MB — `trees-atlas-color` 20 MB + `normal` 17 MB + leaves/bark). Already scoped in `HANDOFF-hero-impostor-and-startup-weight.md:58` — *"27.6 MB → ~5 MB, smaller on wire AND in VRAM, independent of impostors."* No KTX2Loader exists in the repo yet.
- [ ] **Share the tree library instead of copying it per scene.** LS and Księży Młyn each carry 101.8 MB of tree GLBs — the *same* linden, maple, oak, plane. `InstancedTrees.jsx:780` rewrites every tree URL to `baked/<look>/trees/…` with **no fallback** to the shared `public/trees/` library, so each slab must carry its own copy. Deduping is an architecture change (it trades slab self-containment for a shared asset path) — **discuss before building**; it also interacts with the per-look 404s below.
- [x] **Atlas QA `-viz.png` untracked** (2026-07-21) — 20 MB, `bake-look.js:658` writes them, nothing loads them; gitignored so they stay local and stop shipping.

Related, same audit: **1,850 HPDM placements (17.9%) request GLBs absent under the look** — six species (`betula_pendula` 725, `magnolia_sp` 438, `acer_saccharum_multistem` 261, `nyssa_sylvatica` 152, `tilia_americana` 141, `acer_saccharum` 133) have no directory in `public/baked/hipointe-demun/trees/`, though all resolve fine against the shared library. Same class as the LS prod 404s, ~3× the exposure. Cause looks like ordering: `trees.json` is Jul 17 00:25, the atlas + GLB dirs Jul 16 13:22 — the re-plant landed after the GLB stage. **A re-bake is the fix.**

---

## ▶ 2026-07-08 — the operating model + the Salon/Grove interface pass (Jacob walkthrough)

**The settled operating model (design, agreed in prose 2026-07-07):**
- **Intake seeds the Look.** A neighborhood census becomes a Look with a *mandatory-real* seed roster: every census species → nearest real chassis (via `bake-trees CATEGORY_FALLBACK`) or an honest gap — **never a filler** (the no-filler pool + [[project_no_filler_gate_and_chassis_curation]] is this gate, moved to Look-birth). A Look opens complete + bakeable; the Salon only *refines*.
- **Three surfaces, one judgment each:** Intake **seeds** · Salon **adds/composes** (add blind, one tree) · Grove **culls in context** (see it next to siblings) · Bake **ships**.
- **Vocabulary = Promote / Demote, no ratings.** Kill the 0–4 Fill/Mid/Hero scale (false precision). **Promote** = vouch eligible (Salon). **Demote** = set aside, **reversible/non-destructive** (Grove, per-Look *and* global). Default = untouched. No hero bit.
- **Grove is add-nothing, remove-freely** (read-only for adds; keeps demotion). Adds happen in the Salon.

**✅ THE BIG JOB — BUILT 2026-07-11** (merge `f1496661`, agent Sylva; eye-gated "looking great"). **The composition workspace on the 9 habit SHELVES (NOT a matcher).** Jacob 2026-07-08: a per-species fuzzy-match / recommendation score is brittle — "Recommended (0)" everywhere is that fragility showing. **Categorize, don't recommend.** The rubric already closes the set, so there's nothing to score:
> - **The counts are finite + complete:** **9 chassis HABITS** — `vase · columnar · oval · spreading · weeping · multi-stem · pyramidal · rounded · irregular` (rubric axis 0); **10 leaf shapes** (palmate · lobed · heart · ovate · lanceolate · compound · fan · star · needle · scale, axis 10); **~8 bark types**. Every silhouette is one of the nine — a closed botanical set, not a growing list.
> - **Parts live on shelves.** Each chassis is assigned ONE of the 9 habits (a *fact*, assigned once — not a score recomputed); leaves → 1 of 10; bark → 1 of ~8. The chassis picker is a plate grid **grouped by shelf** (like bark/leaves already are).
> - **A species declares its habit** (also a fact — White Oak = rounded/spreading). Selecting it lands you on that shelf; browse other shelves freely. **No Recommended toggle, no match engine.**
> - **Coverage per species = "is there a part on each of its shelves?"** → chassis ✓ / bark ✓ / leaf ✗ surfaced in the roster list (the "just need leaves" read). The console reads: *"we have a model (+ the other chassises on its habit shelf · bark/leaf options)"* OR *"no model, but its habit → these chassises, its bark → these barks, **just need the leaves**."*
>
> **The tagging is the reliable kind of work — assign-one-of-N, no ML:** the existing **~80-chassis habit-untag backlog** (1 of 9) + leaf-shape + bark-type per part. Bounded, checkable, a curation afternoon. Species carry their habit via the dossier/rubric ([[project_dossier_annotation_is_first_class_ip]]).
>
> Also in the workspace: roster list gets **All / By-Look** scope over the **growing cross-intake species library**; the `SLOT`-header spot → **collapsible species header** (light now: name · botanical · category · coverage; full dossier — reference photos + descriptor — when the species is tagged). Supersedes the [[project_arborist_kit_matcher]] recommendation framing.
>
> **✅ LANDED 2026-07-11 (merge `f1496661`, agent Sylva) — the Shelves gauntlet + Phase 4:**
> - **Shelves surface** (`ShelvesWorkstage.jsx`, `chassisThumbnails.js`, `chassisForms.jsx` + backend catalog/part-shelf tags): browse all 241 chassis, **silhouette-only** into the 9 forms, junk auto-flag + set-aside, **whole-chassis crown-silhouette** thumbnails.
> - **Phase 4 Salon** composes off the shelves; the matcher (`chassisPlateList` / `salonOptions` ranking + base-dedup) is **ripped out of the picker** — collapsed to "Oval (declared) + Other", dossier-first.
> - **Library QC fallout, fixed:** wood-coverage / **stub-wood checker** (`backfill-wood-coverage.js` — leaves-first vendor variants like `black_gum_i` render bare-wood as a stub) + **47 orphaned-mesh chassis repaired** (`repair-orphan-meshes.js`, `glb-scene-utils.js`); **producer fix in `survey-deleaf.js`** (`attachOrphansToScene` + `computeWoodCoverage` at emit → a re-run reproduces both). The `_chassis` backfill/repair already wrote to the shared gitignored library.
> - **Curation data:** `setAside` **decoupled from `approved`** (16 migrated `approved:false` → `setAside:true`) so the Salon isn't painted red.
>
> **◻ OPEN (the arc *enabled* these — not done):**
> - **The tagging pass itself** — only ~5 chassis classified; the shelves stay empty until a **curation afternoon** (the whole point of the surface).
> - **Vestigial:** the `InsideHeader` **"recommended" scope toggle** (old matcher UI) is still wired — sweep it (left in to keep Phase 4 contained).
> - **Roster coverage lights (🟢/🟡/🔴)** are still the OLD `park_species_map` routing coverage, **NOT** reconceived as shelf/part coverage (chassis✓/bark✓/leaf✗) — a future arc.
> - **Species-key seam** (roster slug `maple_sugar` vs botanical `acer_saccharum`) still tangled; Phase-4 landing works only because `/salon/:id/options` resolves both — **fragile; the #1 reliability fix** (ORIENTATION seam #2).

**◻ Canary picker → Meteorologist side.** Removed the Salon's `→ Set canary` (2026-07-08). The Meteorologist has `CanaryScene` (reads the `meteorologist-canary-tree` localStorage pref, renders it) but **no picker** — needs a species/variant selector there (list from the Look's atlas/roster) that writes the same payload. Until built, the canary still *renders* the last-set value but can't be *changed* from the UI.

**✅ LANDED 2026-07-08 (Salon interface pass, `SalonWorkstage.jsx` + `generate-salon.js`):** Leaf Source → 3-way `Bare · Native · Synthetic` (Bare ships bare — authored, `hideLeaves` in preview+publish; dropped the preview-only Visible toggle); Leaf + Bark pack libraries → collapsible; removed the Overhead (Browse) section, the Name/Reset/Set-Canary footer, the "SLOT · adopted" header, the "all adopted" counter, and the leaf helper-text; roster list dropped the Todo/Done/N/A task-status tabs (→ scope All/By-Look is part of the big job); **species intro (ReferencePanel) → top of the tools stack** (blank on un-dossiered species until the light fallback lands); removed the species-header **`Recommended / Show all`** toggle + **`Mark not-available`** (chassis picker defaults to show-all; recommendation → the 9-habit shelves, above). Grove earlier: no-filler + one-tile-per-species dedupe. Species intro (ReferencePanel) → top of stack; `Recommended/Show all` + `Mark not-available` cut; `1 tree/3 variants` → `Solo/Group`; chassis thumbnails re-centered; Fix-orientation re-aligned; Chassis/Bark/Leaf **libraries → collapsible + called-out chips**; roster rows trimmed to `species · N placements` (slug + state words gone).

**◻ OPEN — surfaced in the 2026-07-08 interface pass (verified findings):**
- **Bark knobs hide-when-inert** (or seed a bark entry). `tint / uvScale / roughness / jitter` are runtime uniforms keyed by a per-species bark manifest entry; **no entry → they do nothing**, so they're **dead on every Native/substituted tree** — the code says so at `generate-salon.js:1571`. The bark **ref swap** works everywhere. Fix: hide the four knobs when there's no entry, or give every composed species a bark entry.
- **Yellow/green species → seed the Salon composition** (this IS intake-seeds-the-Look). A 🟡 (composite/substitute) species opens **blank** because the substitute is a bake-time routing, not a seeded composition. Wire: 🟡 → pre-load the substitute · 🟢 → pre-load the literal · only 🔴 empty. "If there's a yellow light, there should be something in the Salon" (Jacob).
- **Species-intro light fallback** — `ReferencePanel` returns `null` without a dossier (~10 of 84 have one), so the top-of-stack intro is blank for most species. Show **name · botanical · category · coverage** always; upgrade to the full dossier card (reference photos + descriptor) when the species is tagged.
- **Meteorologist canary picker** — canary *setting* was removed from the Salon (2026-07-08). The Meteorologist renders the canary (`CanaryScene`, reads `meteorologist-canary-tree` localStorage) but has **no picker**. Build a species/variant selector there that writes the same payload. Interim: the last-set canary still renders; it just can't be changed from any UI.

---

## ▶ 2026-06-25 — the Salon "fashion plates" rebuild + a deep vestigia sweep (LANDED). Front door: **`SALON-INTERFACE.md`**

The Salon became the rubric-forward **plate-rack** the kit-matcher always implied. **Full design + decisions + open threads: `SALON-INTERFACE.md` (root); narrative: `NOTES.md` 2026-06-25.** Commits `curb-offset-draw`: `ab3bbbd5` `4631b688` `62dd9988` `65d00f06` `6c29f7a7`.

**LANDED:**
- [x] **A1 — deformer → automatic** (`generate-salon.js#DEFORMER_BY_MORPHOLOGY`, panel retired; engine/seam unchanged). ⚠️ **parked pending 3C** — the deformer is anti-stamping, not diversity.
- [x] **B1 — bark + leaf visual plate grids** (`PlatePicker`): replace the dropdowns + the redundant matcher-text; leaf **gaps marked** ("needed" tags) = a coverage map; `(Add +)` tiles.
- [x] **B2 — chassis live gray-silhouette plates** (`ChassisPlate.jsx`): top-N from the matcher (vendor-filtered), **wood-only**, per-plate **★ Approve**, "Browse all" fallback.
- [x] **Variant preview** (1/3 toggle) — the deformer eye-gate.
- [x] **WYSIWYG plumbing verified carrying to the slab** (autosave ✓ · regenerate-on-bake ✓ `15682e55` · shared preview material ✓ Brief 7; **byte-proven** `scratch/measure-leaf.mjs`). Piece-3 locked "good enough."
- [x] **Vestigia swept:** Oubliette · bark gradient editor · Adopt · RE-PUBLISH SPECIES (+ `publishedVariants` tracking; routing preserved via effect) · STUDIO/WORM · Tilt/Y-up → "advanced" drawer · bio card → tools-rail + inline photos. **Kept (operator):** progress filter, Mark-N/A, multi-slot, Set Canary.

**OPEN / NEXT:**
- [ ] **Fill the ~6 leaf-base gaps** the coverage grid exposes: `fan` (Ginkgo) · `compound` (Ash) · `fine_compound` (Honeylocust) · `palmate_compound` (Buckeye) · `tulip` (Tuliptree) · `short_needle` (Spruce). The ~25-base leaf library is half-stocked (`leaf-pack-bindings.json` needed-list).
- [ ] **`(Add +)` behavior** — affordance built, action TBD → ties to the **online models/assets library** (hosted, versioned home for the ~40 build-once bases; where `(Add +)` procures from, reusable town-to-town).
- [ ] **3C** (canopy asymmetry / branch jitter) — the real per-tree diversity; revisit the deformer magnitudes + any per-species control *then*.
- [ ] **Part-base near/far render tiers** (`SALON-INTERFACE §2`) — leaf near-tier (posterize + high-pass detail + artificial translucency, reusing the bark toolbox), bark PBR/posterize, chassis real/impostor. The build that makes the part model real.
- [ ] **Green-light readiness gate** for bake membership (per-plate ★ Approve exists; the all-green Kit·C·B·L gate is unbuilt). · **Chassis plate perf** (8 demand-canvases; render-once-to-image fallback). · Chassis rename/notes row keep-or-fold. · arborist has **no `OPERATIONS.md`** (knobs live in `FEATURES.md`).

---

## ▶ 2026-06-23 (EOD) — ⛔ THE WALL: trees are 16MB, decimation floors. **(Largely SUPERSEDED — see status)**

> 🔄 **STATUS (2026-06-25):** The 16MB wall was **fixed at the source** — it was **flat normals**, not UV-lock: smooth-normals + weld + simplify gives a real lod0/1/2 ladder (`_archive/BATON-tree-weight-smooth-normals-2026-06-24.md`, rolled out library-wide). The **per-context Street/Hero/Browse-LOD + GeoTierDriver** strategy below is **SUPERSEDED** by the role-at-bake doctrine (`arborist/ARCHITECTURE.md §"Tree-render reality at LS"`): geometry = a per-placement ROLE at bake, depth gauges own visual distance, `GeoTierDriver` RETIRED. ⭐ **The impostor is the FOUNDATION and ships today** — `3e809a56`, 2026-07-22; live as-built in `ARCHITECTURE.md §"Tree-render reality at LS"`. Kept here for the cull-oracle half (`classifyHeroTiers`, occlusion cull) which the future impostor arc reuses.

The afternoon found the foundational blocker and the strategy to beat it. **Full detail: `_archive/HANDOFF-visibility-cull-lods-2026-06-23.md` (root).**
- **Wall:** connected-mesh bark is UV-locked → `simplify` can't reduce below ~127K tris (lod0=lod1 byte-identical, GLBs 16MB, lod1 set = 1.7GB). The **Grove context-losses (GPU OOM)** loading them → stale frame → "edits don't show." (Brief 6.3-followup, now acute.)
- **Strategy:** bake-time **per-context visibility culling** — delete surfaces the known camera tracks never see (don't simplify). Lossless, sidesteps the floor. **Street** = 1 full + rest Hero + DoF-blur BG. **Hero** = lod1 + PVS-cull vs hero pan + DoF. **Browse** = overhead trunk-cut below canopy (most aggressive). Impostors HELD (operator skeptical). DoF = cover, not cut.
- **Design Q (before Hero):** per-variant cull (keeps instancing) vs per-placement (aggressive, breaks it).
- **Role model:** Salon = tweaking + per-context knobs in all 3 views; Grove = cosmetic → renders a LIGHT LOD (fixes its crash).
- **Build order:** (1) Browse trunk-cut, (2) Grove on light LOD + quick Grove→lod2, (3) Hero PVS-cull (+instancing call), (4) Street focal+DoF-BG, (5) per-context knobs.
- **Built (committed):** Phase 1 regenerate-into-bake `15682e55` (needs backend restart); doc correction `f802cb95`. **Uncommitted (HMR-live):** autosave (✓), enterGrove (fires but Grove crashes first), Salon 3 context views, bake `lods`, GeoTierDriver (moot/risky until LODs light), 🧹 debug logs to remove.

---

## ▶ 2026-06-23 (PM) — ROOT-CAUSE NAILED: the Salon↔Grove stale-artifact divergence; the WYSIWYG/autosave arc **(mostly LANDED 2026-06-25)**

> ✅ **STATUS (2026-06-25):** the decided target arc below mostly **LANDED** — autosave ✓, regenerate-from-source folded into the bake ✓ (`15682e55`), the Salon stripped to fashion plates ✓ (the 2026-06-25 entry above). Residual open: the **green-light readiness gate** (per-plate ★ Approve exists; the all-green Kit·C·B·L gate is unbuilt) + LoD stays dormant-not-deleted. The night-emissive sub-arc is still parked (carried forward below).

**The symptom the operator hit:** leaf/bark knobs update in the **Salon** but **not the Grove / LS / after a bake**; hard-refresh doesn't help; the slab looks "pre-leaf." **Confirmed in code (`serve.js`), not memory** — two daylight gaps:
1. **live-preview ≠ published** — the Salon preview is `generateSingleCompositionGLB`@LOD0 (`/salon/generate`), a *different artifact* than what `generate-salon` publishes.
2. **publish ≠ bake** — `/grove/bake` (serve.js:1100) calls **only** `bakeLook`+`bakeTrees`; it **never** re-runs `generate-salon`, so it repacks the *last-published-per-species* GLBs. `/salon/:id/publish` (serve.js:1389) is the ONLY regenerate-from-source, and it's per-species + manual.

**Today's workaround:** `POST /salon/:id/publish` each edited species → *then* `/grove/bake`. (Vendor-only species with no composition — e.g. `platanus_acerifolia` — can't take the knobs at all.)

**Docs corrected (this session, route-first + accord sweep):** `ARCHITECTURE.md §Salon preview ↔ LS parity` now leads with an **AS-BUILT REALITY** block (the flow + 2 gaps + symptom→fix table) instead of the false "no daylight" claim; `README.md §Grove → Slab` gains the troubleshooting + target; `NOTES.md` 2026-06-23 PM carries the narrative.

**▶ THE DECIDED TARGET ARC (operator, 2026-06-23) — the unification that fixes the bug AND is the interface pivot:**
- **Autosave** the Salon (kill the manual per-species Re-publish gesture).
- **Fold regenerate-from-source into the bake** so published is always fresh (closes gap 2 — the long-queued finish of the *Grove→Slab 2026-06-20* decision).
- **All three surfaces render the published artifact** — retire the separate live LOD0 preview (closes gap 1) so Salon == Grove == LS literally.
- **Green-light readiness gate** decides Grove/bake membership: *not all green (Kit C·B·L + approve) = not ready = doesn't bake.*
- **Strip the Salon UI** toward "fashion plates" (folds in the morning's item #3 + the `Bark007`-opaque-ids complaint).
- **LoD stays dormant-not-deleted** — dropping it rides on the *unproven* bet that **DoF far-blur replaces LoD swaps**; the far-field perf mechanism is orthogonal to this WYSIWYG parity. The DoF eval (below) is how that bet gets settled. Do NOT write LoD's obituary.

*(The morning's #1 night-emissive is parked behind this — but it surfaced a confirmed finding: night foliage stays green because **hardcoded lights ignore every knob** — `CelestialBodies.jsx:1219` white ambient 0.45 + `:1236` fill 0.06 + `:1203` hemi-floor 0.20 ≈ 0.51 un-zeroable. "0 doesn't mean 0." Fix = ramp those to 0 on `nightFactor` so the existing framework goes naturally dark. Separate small arc.)*

---

## ▶ 2026-06-23 — Grove→slab connected; leaf-size knob fixed; night-emissive + interface NEXT **(interface LANDED)**

> ✅ **STATUS (2026-06-25):** the "fashion plates" interface pivot (item 3) **LANDED** (`SALON-INTERFACE.md`); the leaf-size knob + Grove→slab work shipped. Still open: **#1 night-emissive** (carried forward below) + the DoF evaluation (#2, a cartograph-side render-conformance item). Birch-bare leaf-UV follow-up still open (carried forward).

**LANDED (uncommitted, branch `curb-offset-draw`):**
- **Grove "Bake → Slab" button** — `POST /grove/bake?look=` (bakeLook + bakeTrees, awaited) + `bakeGroveToSlab` store action + green button in `Grove.jsx`. One-gesture ship-to-slab (was CLI-only). 745 trees, ~5–7s.
- **Leaf-size knob works on NATURAL leaves, all topologies** — `scaleLeafCardsInPlace` rewritten to scale each leaf as a **connected component** about its centroid (union-find), so it resizes the model's own leaves in place on cards (maple) AND connected mesh (blackgum). Slider 0.4–2.5×. Leaves left **natural** everywhere; operator tunes size. Anchored-synthesis built + kept (synth samples anchors from vendor leaf verts) but NOT the default.
- Slab rebaked from the (natural) compositions.

**NEXT (tomorrow, with operator):**
1. **#3 night-emissive (diagnosed).** Foliage glows green with lights+bloom off = leaf albedo under residual ambient/hemi (NOT a rogue emissive; lamp-glow is separate/correct). Build: (a) foliage goes dark at night, (b) the intended **night illumination map** (gated emissive → bloom). Needs design call: dusk→night ramp? per-species? Home: `treeAtlasMaterial.js` + sky channels.
2. **DoF evaluation** — measure how much the DoF/LoD solution is buying us; may need optimizing. (`cartograph/_archive/HANDOFF-real-dof-2026-06-27.md`, `HANDOFF-render-conformance.md`.)
3. **Interface = the "fashion plates" pivot** — rubric-named + thumbnailed visual plates (kill `Bark007`), plate-based selection, **Grove/Salon render parity** (Grove=published GLB@LOD1/master atlas vs Salon=`generateSingleCompositionGLB`@LOD0 — same tree, two pipelines, they diverge).

**Follow-ups surfaced:**
- Fold **regenerate-from-source** (`generateSalon`) into `/grove/bake` so a bake never ships stale GLBs (the May-25-vs-June-leaf trap). Decided doctrine, not yet wired.
- **Birch authored renders bare** — connected-mesh leaf UVs map to empty atlas space (per-species texturing fix).
- Commit tonight's work (code + compositions + baked slab) — left for operator review.

---


## Live open work carried forward (distilled from the archived May-2026 brief arcs)

> The full brief-by-brief record is in `_archive/BACKLOG-2026-05-brief-arcs.md` (almost all `[x]` shipped / `[~]` folded). These are the items that were still genuinely open when the arc cooled — re-homed here so the active doc carries the open state. Several are subsumed by the kit-matcher (`§ NEXT UP` top) or the tree-render doctrine (`arborist/ARCHITECTURE.md §"Tree-render reality at LS"`); kept because no successor explicitly closed them.

**Kit / library (live — feed the kit-matcher front):**
- [ ] **Streamline asset intake** (old Brief 28) — "+ Add Model / + Add Leaves" targeted single-asset ingest (today: chassis via whole-library `survey-deleaf.js`; bark auto-extract at bake; leaves via `compose-leaf-packs.mjs`). The thin button rides a `serve.js` upload endpoint + a single-asset ingest mode. **Now ties to the 2026-06-25 `(Add +)` + online-asset-library thread** (top entry). 🧊 pull forward when asset-adding is a routine cadence.
- [ ] **Map-refresh — `cartograph/data/<scene>/tree-species-map.json`** (operator-curated, PER-TOWN). The stale (2026-04-29, pre-chassis-library) routing `bake-trees.js#pickVariant` fans the messy park-names onto published species. Seeding the roster isn't "done" until every park-name routes onto a seeded species (or a deliberate filler). Coverage view surfaces the diagnostic; curation is by hand (no auto-guess gets it right).
- [ ] **Brief 25 — persist + bake provenance** (literal vs composite) into `manifest.json` so Coverage reads it from data instead of deriving on the fly.
- [ ] **Raise atlas `CONTENT_CAP`** (`bake-look.js`) once the roster shrinks post-Grove-curation — bark 512×1024→1024×2048 / leaf 512→1024 for a fidelity bump at no runtime cost. One-line knob; the actual roster size drives the cap. (Related: the kit-matcher §NEXT-UP "raise the atlas leaf-tile budget, device-profile" for crisp street-shot leaves.)

**Tree-render / geometry (live, under the role-at-bake + hero-impostor FOUNDATION — `arborist/ARCHITECTURE.md §"Tree-render reality at LS"` is the single source of truth for render state):**
- [ ] **Night-emissive** — foliage glows green with lights+bloom OFF because **hardcoded lights ignore every knob** (`CelestialBodies.jsx:1219` ambient 0.45 + `:1236` fill 0.06 + `:1203` hemi-floor 0.20 ≈ 0.51 un-zeroable). Fix = ramp those to 0 on `nightFactor` + a gated night-illumination emissive that feeds bloom. Needs an operator design call. *(Whole-system winter/season concern intersects the impostor season-capture plan.)*
- [ ] **Fix the GPU-gauge fake budgets** — the emulator gauge is a count-vs-INTERIM-FAKE-budget verdict (draws/200, tris/1M) that ignores frame-ms and reads red with no trees on screen. It drove a reverted degradation arc. Either wire it to real frame-ms or relabel it so it stops being read as a perf signal. (See NOTES 2026-06-25 EOD.)
- [ ] **Camera-aware hemisphere cull** (old Brief 4) — drop back-facing leaf-card overdraw at hero distance (uniform-driven, single-program). Overdraw is the standing tree cost; folds into the parked impostor/opaque-shell overdraw-killer arc.
- [ ] **Birch authored renders bare** — its connected-mesh leaf UVs map to empty atlas space (a per-species texturing fix).
- [ ] **Build blocker (env, not code): restore `photos-wikimedia/other`** — `public/photos/lafayette-square/other` is a dangling symlink; `npm run build` transforms all modules then fails in vite's publicDir copy. Blocks production builds until the target is restored.

**Superseded / moot (recorded so they aren't re-opened):**
- ~~Brief 17 per-species bottom-cut~~ + ~~the lod2 browse trunk-cut~~ — **moot** under all-mesh + role-at-bake ("if we get good impostors we skip cutting off trunks" — Jacob; `_archive/TREE-GROUND-ELEVATION-FORENSIC-2026-06-25.md`).
- ~~Brief 6.3-followup connected-mesh bark lod2 floor~~ — the 16MB wall was **flat normals**, fixed by smooth-weld (`_archive/BATON-tree-weight-smooth-normals-2026-06-24.md`), not the UV-lock the followup assumed.
- ~~Brief 11 / GeoTierDriver runtime tier-swap~~ — **RETIRED** (geometry by baked role, not live camera distance).
- ~~SpeedTree library~~ — peer-track placeholder; the kit-matcher (Authored-only active) is the live track.

---

> 🗄️ **Archived:** the May-2026 Salon-composition + Procedural-v1.5 brief arcs (Briefs 0–31, Phases A–G, the fallback-v1 / cross-helper / SpeedTree tails) → **`_archive/BACKLOG-2026-05-brief-arcs.md`** (2026-06-25). Companion diary: `_archive/NOTES-2026-05-diary.md`.
