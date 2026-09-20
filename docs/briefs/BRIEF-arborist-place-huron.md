# BRIEF — PLACE TREES IN A TOWN THAT HAS NO TREE DATA

*Written 2026-09-20 by the coordinator seat, after a read-in on the arborist (new context this session).*

> ### ⭐ WHAT JACOB ASKED FOR
> *"We also need to engage the Arborist to place trees… We won't have all the trees on the list but
> we'll have enough to start and enough to distribute trunks, etc."*
>
> ⇒ ⭐⭐ **PARTIAL IS EXPLICITLY ACCEPTED. A THIN LIBRARY IS NOT A BLOCKER.** What is NOT accepted is
> a thin library being papered over. Every gap must be **visible, counted, and named** — never filled
> with a plausible substitute. Read `CLAUDE.md` Layer 0 q2 before you write a line.

---

## 1. You are the dispatched agent. Name yourself — one word, yours.

## 2. Agent: **FRESH**

Three sessions are already live (fade — landed; roster intake A; external listings B). ⛔ **None of
them is in the arborist and neither are you in theirs.** Your surfaces are `arborist/`,
`cartograph/tree-bake-inputs.mjs`, `scripts/1[3456]-*`, and `data/<scene>/tree-*.json`.
⚠️ **`cartograph/bake-content.js` is CONTESTED by two live sessions — stay out of it entirely.**

## 3. Read this canon, by section

- **`INTAKE-CATALOGUE §1.1`** — the census side: every well, what it unlocks, what happens when it is
  absent, **and how to acquire it per town**. This is the map for the whole brief.
- **`arborist/ARCHITECTURE.md §485`** — the species pipeline, census name → placeable tree. ⚠️ That is
  the **library** pipeline (what a tree IS). ⛔ **You are doing PLACEMENT (where trees GO). Do not
  drift into minting species** — it is a different arc with its own eight-stage machine.
- **`arborist/ARCHITECTURE.md §420`** — the cartograph ↔ arborist boundary. Respect it.
- **`TREE-INTAKE.md §5.4`** — *"If no municipal census, the mix needs a hand-authored seed — audit the
  table per region."* ⭐ **This brief's central procedure.**
- **`TREE-INTAKE.md §2`** — ⚠️ **Overpass 406s a default python-requests/curl UA. Send a real one.**

## 3a. ⛔⛔⛔ THE RULING THAT OVERRIDES EVERYTHING BELOW — JACOB, 2026-09-20

> ***"ALL LS FALLBACKS ARE STUPID AND ANNOYING AND COUNTERLOGICAL. If a map has no tree census, a
> fallback is nonsensical. The tree census is *another* item in the intake/setup which is listed in
> our inputs."***

⭐⭐ **THAT IS THE WHOLE DESIGN, AND IT REFRAMES THIS BRIEF.** An absent tree census is not a hole to
plug — **it is an UNACQUIRED INPUT**, and the honest product of a town without one is *"this town has
no tree census"*, shown on the manifest as a row to acquire. ⛔ Substituting another town's data is
not a graceful degradation; **it is a wrong answer wearing a right answer's clothes**, and it is
worst on exactly the town nobody has inspected.

### ⭐⭐ AND THE MECHANISM ALREADY EXISTS — BUILT TODAY, FOR PARCELS. ⛔ DO NOT BUILD A SECOND ONE.

`cartograph/sources.js` — *"WHERE A TOWN'S DATA COMES FROM, declared by the town"* — implements
Jacob's ruling verbatim, as a three-way distinction its own header calls *"the whole point, and it is
`CLAUDE.md` Layer 0 q2"*:

```
UNDECLARED     no sources.json entry. Nobody has said where this town's <well> comes from.
               ⛔ NOT "none" — "not looked into yet", and it is LOUD.
DECLARED-NONE  an explicit empty + a reason. An HONEST ZERO: a human established there is
               no well and wrote down why. The pour proceeds and says so once.
DECLARED       one or more wells, each naming endpoint, field map, and ⭐ `absent` —
               the fields it does NOT supply, so a gap never arrives as a value.
```

▶ **THE TREE CENSUS IS ANOTHER KEY IN THAT FILE**, alongside `parcels` and `landUseCodes` — which is
precisely what Jacob means by *"another item in the intake/setup which is listed in our inputs."*

### ✅ GATE LIFTED 2026-09-20 — A HAS LANDED (`8ce518df`, *"A town says where its data comes from,
### and says what it hasn't got"*). `cartograph/sources.js` and `data/*/sources.json` are **committed
and yours to extend.** ▶ Read A's commit before you touch them — its three-way distinction, its
`absent` mechanism and its refusal-on-zero-match are the shapes to follow, not to re-invent.
⚠️ **Still bring the tree-well declaration SHAPE to Boz before you build it** — extending a schema
another session just authored is a design decision, not a fill-in-the-blank.
⛔ If you find yourself inventing `tree-sources.json`, stop — that is the parallel mechanism this
section exists to prevent.

## 4. ⛔⛔ THE FALLBACK THIS BRIEF KILLS FIRST — LS-BLEED #3, LIVE

`cartograph/tree-bake-inputs.mjs:120`, verbatim from the source:

> *"Per-scene species routing collapses the census onto the scene's library palette; **absent →
> bake-trees falls back to LS's global map.**"*

**Measured on disk 2026-09-20:**
```
scene              tree-mix.json   tree-species-map.json
lafayette-square        ✓                 ✓
hipointe-demun          ✓                 ✓
altadena                ✗                 ✗
huron                   ✗                 ✗
toy                     ✗                 ✗
```

⇒ ⛔⛔ **BAKE TREES ON HURON TODAY AND AN OHIO LAKESHORE TOWN IS PLANTED WITH ST. LOUIS'S SPECIES
PALETTE — silently, and it will look fine.** That is `Layer 0 q2` exactly: a fallback converting "we
have no idea what grows here" into a confident, plausible answer. `INTAKE-CATALOGUE §1.1` already
files this as **LS-BLEED #3**; this brief is where it gets killed.

⭐ **THE FIRST DELIVERABLE IS THEREFORE NOT A TREE. IT IS DELETING THAT FALLBACK.** Not softening it,
not warning beside it — ⛔ **deleting it.** An absent species map **refuses, by name**, and the town
reports its census as UNDECLARED or DECLARED-NONE per §3a. ⚠️ Do this FIRST, before acquiring
anything — otherwise every later measurement is taken through the bleed and you cannot tell your own
work from St. Louis's.

⭐ **AND CHECK THE OTHER FOUR WELLS FOR THE SAME SHAPE WHILE YOU ARE IN THERE.** `:120` is the one I
found; ⛔ **I did not audit `park_census` / `park_trees` / `forest_park_trees` / `derived_trees` for
their own absent-behaviour.** Each should refuse or declare, never substitute. **Report what you find
even where it is already correct** — "the other four are clean" is a finding worth having.

## 5. The code sites, by `file:line` — verified 2026-09-20

### ⚠️ THE CATALOGUE SAYS FOUR WELLS. THE CODE HAS FIVE. Trust the code.
`cartograph/tree-bake-inputs.mjs:110-116`:
```js
const placements = [
  join(clean, 'park_census.json'),        // authored park census (hand-curated, real species)
  join(clean, 'park_trees.json'),         // City Forestry layer 1 (whole hood, real)
  join(clean, 'forest_park_trees.json'),  // City Forestry layer 4 (Forest Park, rich species)
  join(clean, 'osm_trees.json'),          // OSM floor (real positions)
  join(clean, 'derived_trees.json'),      // NLCD canopy fill (synthetic)
].filter(existsSync)
if (!placements.length) return null
```
⭐ **They are spatially disjoint LAYERS of one census, not alternatives.** `huron/clean/` today holds
`map.json`, `ribbons.json`, `skeleton.json`, `street-index.json` — ⛔ **none of the five.**

### ⛔⛔ AND READ THE COMMENT ABOVE THEM — `:100-109` — IT IS A SCAR, NOT A NOTE
> *"`park_census.json` was missing here until 2026-07-22, while bake-trees' own no-placements DEFAULT
> read ONLY `park_census.json`. Two entry points, two disjoint answers, each silently dropping what
> the other kept… **which is what shipped, so LS showed 729 park trees and no street trees at all.**
> ⭐ **Add new wells to BOTH.**"*

⇒ **There are TWO entry points**: this resolver, and `arborist/bake-trees.js#SOURCE_BY_BASENAME` (the
filename → provenance table, named at `:100` as *"the one enumeration of what a census is made of"*).
⛔ **If you add a well, add it to BOTH.** This exact mistake already shipped an LS with no street trees.

### The acquirers that already exist — ⛔ do not write new ones
```
scripts/13-fetch-city-trees.py     municipal inventory (ArcGIS FeatureServer)
scripts/14-fetch-osm-trees.py      OSM tree points        ⭐ SEE BELOW
scripts/16-fetch-canopy.py         NLCD canopy raster → derived_trees.json
scripts/15-derive-tree-mix.py      census histogram → tree-mix / tree-species-map
```

⭐⭐ **THE OSM TREE FETCH HAS ITS OWN SCRIPT AND DOES NOT GO THROUGH `cartograph/fetch.js`.** That
matters and I checked it deliberately: `fetch.js#ingestElements` discards every OSM **node**'s tags
(brief A's subject), and `natural=tree` is a node — so huron's `raw/osm.json` shows **0** `natural=tree`.
⛔ **THAT ZERO IS AN ARTIFACT OF THE OTHER BUG AND IS NOT EVIDENCE ABOUT HURON'S TREES.** `scripts/14`
queries Overpass directly. **You are NOT blocked by brief A. Run the real fetch and get the real number.**
*(huron's `raw` does carry 19 `natural=tree_row` — those are ways, so they survived.)*

### ✅ One thing that is already right
`public/baked/huron/shape.json` **exists.** ⭐ So the retired paint-mask fallback — which
*"cannot see the road and will scatter trees into the carriageway"* — will not fire. **Verify it still
exists before you bake; the fade arc rewrote bake outputs today.**

## 6. The chain — what this trusts, and what trusts this

**Upstream:** `neighborhood_boundary.json` (⚠️ **rewritten today by `77aa5aa9`** — `streetFade` is gone
and the fade now derives from `radius + center + fadeBand`; **rebase before you measure anything**) ·
`public/baked/<scene>/shape.json` · `clean/map.json`.

**Downstream by name:** `bake-trees --placements` → `public/baked/<scene>/trees.json` + `trees/` →
`InstancedTrees` / `HeroImpostorTrees` / `OverheadTrees` / `DesignerTrees`.

### ⚠️⚠️ A LIVE UNANSWERED QUESTION FROM TODAY'S FADE WORK — IT IS NOW YOURS

**Trees and lamps take NO fade** — `DesignerTrees.jsx` and `DesignerLamps.jsx` reference no fade, no
`pointInBoundary`, no boundary at all (measured by Quill 2026-09-20). ⇒ **They are governed ENTIRELY
by the bake-time stencil.**

⛔⛔ **AND THE STENCIL SHRANK TODAY.** `targetR` was `streetFade.outer + 50`; `streetFade` is deleted
and the fade reverted inward, so `fade.outer === radius` and `targetR = radius + 50`:
```
                 stencil BEFORE → NOW        lost ring
lafayette-square   1050  →   942             −108 m
huron              3749  →  3589             −160 m
hipointe-demun     1461  →  1301             −160 m
altadena           4371  →  4211             −160 m
```
> ⚠️ **AN EARLIER VERSION OF THIS BRIEF SAID THE STENCIL GREW ~40 m. THAT WAS WRONG** — it described
> the additive model, which was ruled out the same day. **It shrank.** ⛔ If you saw the +40 figure
> anywhere, it is dead.

✅ **Measured: the lost ring holds ZERO LAMPS** — LS's furthest lamp is at 888 against R=892, HPDM's at
1220 against R=1251, and neither town has a lamp beyond `radius`, let alone beyond `radius + 50`.
⛔ **TREES ARE NOT MEASURED.** A first pass returned 0 for both towns, which means the extractor did
not parse the baked tree schema — **not** that there are no trees. ⭐ **You own the tree schema; go and
get the real number before you assume this is harmless.** *(Absence is a claim too.)*

▶ **You are the first person who will have trees on screen since the stencil moved. Look, and report —
even if the answer is "nothing changed."**

⭐ **Convert the constraint to a check** (`BOZ §3.5`):
> **No scene bakes trees using another scene's species map.** One assertion, kills the bleed class.

## 7. ⛔ Can the instrument SEE the change?

**Yes — everything lands on disk.** `clean/*_trees.json` per well, `baked/<scene>/trees.json`.
⭐ **Count PER WELL, never in total** — the wells are disjoint layers and a total hides which one is
empty. ⚠️ `arborist/bake-trees.js#SOURCE_BY_BASENAME` already stamps provenance; **report by `source`.**

⛔⛔ **MUTATION-TEST THE BLEED CHECK.** `MEMORY §C` — a passing check proves nothing until it has been
**seen to FAIL**. The mutation that matters: delete huron's species map and prove the bake **refuses**
rather than reaching for LS's. A check in this repo passed for the wrong reason earlier today.

**Eye-gate surface:** trees on huron, in the app, ⛔ **not a proxy render**
(`feedback_proxy_render_is_not_the_operator_eye`). ⚠️ And `feedback_dont_eye_gate_an_unready_construction`
— harness first, Jacob's eye second.

## 8. Write/commit bounds

**In bounds:** `cartograph/tree-bake-inputs.mjs` · `arborist/bake-trees.js` (the provenance table) ·
`scripts/13/14/15/16-*` (**invoke; edit only to fix a real defect, and say so**) ·
`data/huron/tree-mix.json` + `tree-species-map.json` · `data/huron/clean/*_trees.json` · a new check.

⛔ **OUT of bounds:** `cartograph/bake-content.js` (**two live sessions**) · `boundary.js` /
`sceneStencil.js` / `bake-ground.js` (fade arc, just landed) · `src/hooks/useListings.js` /
`src/tokens/categories.js` (**brief A, live**) · ⛔ **the species MINT pipeline** (`§485` stages 1–8) —
that is a different arc.

⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.** ⚠️ **This brief's specific drift risk is the library.**
You will find species in huron's census that have no chassis. ⭐ **That is expected and Jacob has
already accepted it** — *"we won't have all the trees on the list."* ⛔ **Count them, name them, place
what you can. Do NOT start minting species, and do NOT substitute a lookalike.**

### ⚠️ THE THING TO BRING JACOB BEFORE YOU HAND-AUTHOR A MIX
`TREE-INTAKE §5.4`'s procedure where no municipal census exists: **the city's approved street-tree
planting list + USDA hardiness zone + a state extension urban-tree guide → a ~18-species mix with
weights.** ⛔ That is a **judgement about a real place**, and it is the kind of authored seed that
becomes invisible truth later. **Propose the mix with its three sources cited, and let him approve it.**
⚠️ Huron is on **Lake Erie** — a lakeshore climate, not St. Louis's. ⛔ Confirm the county and zone from
the geography record; a search for "Huron" returns Huron County (wrong — Huron city is in **ERIE**
County) and Huron City, **Michigan**. That false match has already cost this project a detour today.

## 9. The validation surface that already exists

⛔ **No parallel pipeline** (`feedback_no_parallel_pipeline_for_scenes`). `bake-trees --placements` is
the harness; it runs per scene and reports per source.
⭐ **LS and HPDM are the two REFERENCE consumers** — both carry a full well set and a species map, so
they are what "complete" looks like. ⛔ **Never the subject, and never the template**: LS's map is the
thing that bleeds. **altadena and toy are in the same empty state as huron** — ⭐ if your fix is real,
it makes their absence loud too, without being told about them. **That is the town-#2 test for this
brief: check it.**

---

## What "done" looks like

1. ⛔ The LS species-map fallback is **DELETED**, not softened — LS-bleed #3 is dead, and the check
   proves it by having been seen to fail.
1a. The tree census is **declared like any other input** (§3a's three-way shape), so an absent one
   reads as an unacquired row on the manifest — never as a town with no trees.
2. huron has the wells it can actually have, **acquired by the existing scripts**, counted **per well**.
3. A hand-authored huron mix, **its three sources cited, approved by Jacob** — not invented.
4. Trees on huron, eye-gated, with the unplaceable species **counted and named, not substituted**.
5. The stencil-growth question answered for trees and lamps — **even if the answer is "no change."**
6. altadena and toy's absence is **loud too**, without either being named in code.
