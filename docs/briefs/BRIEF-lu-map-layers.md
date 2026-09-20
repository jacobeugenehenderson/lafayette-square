<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20
evict-when: RULING: Jacob's eye on huron's pier and a toilet marker, in the Designer AND in the slab.
-->

# BRIEF — A BENCH IS NOT A LAND USE, AND IT STILL BELONGS ON THE MAP

*Written 2026-09-20 by Lex, on Jacob's ruling: **"pile ② is its own brief."*** Split out of
`cartograph/_archive/BRIEF-lu-vocabulary-2026-09-20.md`, which landed the land-use half.

> ### ⭐ THE RULING THIS EXISTS TO SERVE — Jacob, 2026-09-20
> *"I don't know why we wouldn't just provide the completest picture we can; if all of that is
> available why not have the option to show it? (Toilets in particular; beach? that's great stuff
> for a local map)"*

---

## 1. You are the dispatched agent. Name yourself — one word, yours.

## 2. Agent: **FRESH**

## 3. ⛔ THE STATE: THESE ARE DECLARED, NOT DISCOVERED. YOUR INPUT ALREADY EXISTS.

⭐⭐ **THE SORT IS DONE AND IT IS IN THE SOURCE — do not redo it, and do not restate it here.**
`derive.js`'s **`OSM_LU_DECLARED`** carries every tag that is *on the map but not a land use*, by
name, with a reason, in the form `map-layer: …` / `map-layer (STRUCTURE|LINE): …` / `none: …`.

▶ **Your worklist is the `map-layer` rows of that table**, and it is one command:
```
node -e "const s=require('fs').readFileSync('cartograph/derive.js','utf8');
const m=s.match(/const OSM_LU_DECLARED = \{([\s\S]*?)\n  \}/)[1];
for(const r of m.matchAll(/'([^']+)':\s*'(map-layer[^']*)'/g)) console.log(r[1].padEnd(28), r[2])"
```
⛔ **Never copy that list into this file.** It is a live table with an owner; a second copy is how the
first vocabulary drifted. The `none:` rows are decided and are **not yours** — `man_made:bridge` in
particular is the skeleton's (grade separation), and it is 123 features tempting you.

⛔ **AND DO NOT PROMOTE ONE TO `OSM_TO_LU` TO MAKE IT VISIBLE.** That paints a whole block face the
colour of *bench*. The two questions are **"is this a land-use FACE?"** and **"should this be ON THE
MAP?"** — the first is answered no for every row you own; the second is why you exist.

## 4. ⛔⛔ THE HARD PART IS NOT THE TABLE — THERE IS NO RENDERER, AND THEY ARE NOT POINTS

**`FURNITURE_DEFS` (`src/cartograph/Panel.jsx`) is six linear/point scene props** — trees, lamps,
fences, walls, retaining walls, hedges. It is not a marker system, and nothing in it will carry a
toilet.

⭐⭐ **AND THE SHAPE WILL SURPRISE YOU: these arrive as WAYS, not nodes.** Measured on
hipointe-demun — `amenity:bench` ×22 with 2–6 coordinates each, `amenity:toilets` ×22 with 6–30.
They are **footprints**. ⛔ So "add a point marker" is the wrong first instinct; a bench is a small
polygon and a pier is a 183-feature linear structure. ⚠️ OSM *nodes* are fetched (`HEAVY_NODES`) but
`wayToFeature` needs ≥2 coordinates — **whether a single-node amenity survives intake at all is NOT
established. Measure it before designing around it.**

### ⭐ THE OTHER HALF, AND IT IS ALREADY A DEFECT ON A LIVE TOWN
**The Designer draws more than the slab ships**, and the divergence is two allow-lists:
- `bake-ground.js` — `LEISURE_KEYS` is five (`garden · playground · swimming_pool · pitch ·
  sports_centre`) and `NATURAL_KEYS` is three (`wood · scrub · tree_row`). Anything else is dropped
  from the slab.
- `MapLayers.jsx`'s `landscapeByKind` groups by `item.use` with **no allow-list at all** — every
  subtype renders live.
⇒ ⛔ **`leisure=park` is emitted as an overlay by `derive.js` and then dropped at the bake.** The
eye-gate surface and the shipped artifact disagree **by construction**, which inverts
`SLAB-CONTRACT`'s rule. ⚠️ Fixing it **changes LS's look** (LS has parks that currently draw in the
Designer and not in the slab) — so it is an eye-gate, not a cleanup. ⛔ Do not slip it in.

## 5. ⚠️ THE PANEL QUESTION, RULED BUT WITH AN UNMET PRECONDITION

✅ **Jacob ruled: AN EMPTY LAYER DOES NOT APPEAR.** *"For a community with no toilets (say) what will
happen to the toggle? Can ineligible things not even appear? The list is already long, we don't want
to also make it confusing."* The Designer layer panel is a **working control, not a census**.

> ### ⛔⛔ AND THE PRECONDITION IS STILL NOT MET — THIS IS THE ONE THING THAT CAN MAKE THIS BRIEF WRONG
> **HIDE ON "THIS TOWN HAS NONE". NEVER HIDE ON "WE HAVE NOT LOOKED."** If a layer is absent because
> nobody fetched it and the toggle silently vanishes, the gap is invisible in both places — the
> silent substitution, committed in the UI. The panel may hide freely **only because Intake carries
> the other half**, and **whether Intake reaches per-LAYER presence is NOT established.**
> ▶ **Measure that first. If Intake does not cover layers, the Intake work comes first and hiding is
> unsafe.** *(`SourcesPanel.jsx:9-11` states the division: Intake = "what does THIS town still need";
> Sources = "what goes into a town at all.")*

⚠️ **Today the LU rows went the other way and deliberately so.** `CartographSurfaces.jsx`'s Land Use
tab gained ten static rows on 2026-09-20 — a town with no farmland gets a Farmland row. That is noise,
and noise was chosen over the unsafe direction until the precondition is met. ⭐ **When you meet it,
that list is the second customer.** ⛔ Solve the long-list problem by **collapsing empty sections**,
never by hiding an unmeasured one.

## 6. ⚠️ WHAT ONLY JACOB CAN DECIDE
- **How many layers?** One "Street Furniture" toggle, or a row per kind (benches / toilets / bike
  parking)? ⭐ His *"the list is already long"* cuts toward fewer, his *"toilets in particular"* cuts
  toward naming them. **Ask; do not infer from the two quotes.**
- **Do structures get HEIGHT?** A pier and a breakwater are the waterfront's silhouette
  (`BRIEF-boulder-revetment.md`, which is adjacent and now unblocked). A flat pier may read as paint.
- **Markers vs footprints.** At map zoom a 2 m bench footprint is sub-pixel. Symbol, or true shape?

## 7. ⛔ Can the instrument SEE the change?
- ⭐ **Extend `claims-every-lu-tag-has-a-home.mjs` rather than writing a second check** — it already
  parses `OSM_LU_DECLARED` and already fails on an undeclared tag. The new assertion is the one it
  cannot make today: **every `map-layer` row reaches a bake group**, so a declared destination that
  was never built fails by name instead of reading as handled. ⛔ That is the whole risk of a
  declaration table: `map-layer` is a **promise**, and an unkept promise looks exactly like a
  decision.
- **Designer ∩ slab**: assert the two allow-lists in §4 agree, mutation-tested by removing one key.

**Eye-gate surface:** **huron** (pier, breakwater, lighthouse, marina) and **hipointe-demun**
(benches, toilets, bicycle parking, flowerbeds — 82 of them). ⛔ **Not LS**, whose vocabulary this
already is.

## 8. Write/commit bounds
**In bounds:** `OSM_LU_DECLARED`'s `map-layer` rows · a bake group + `layerVis` id per layer ·
`Panel.jsx`'s `FURNITURE_DEFS`/`LAND_COVER_DEFS` · `MapLayers.jsx` · the check extension.
⛔ **OUT:** `OSM_TO_LU` and the LU classes (landed; do not reopen) · `man_made:bridge` and the `none:`
rows · the crop/water shaders (`BRIEF-field-shader.md`, `BRIEF-water-shader.md`) · the revetment
geometry (`BRIEF-boulder-revetment.md`).
⛔ **A re-pour is required** — the bucket and the tables run at pour time. **huron is safe to
re-pour; LS, HPDM and altadena are NOT — come back to Jacob.**
⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.**

---

## What "done" looks like
1. Every `map-layer` row **reaches something on the map**, or is honestly re-declared `none:`.
2. The check fails on a declared destination that was never built.
3. The Designer and the slab **draw the same set** — and if Jacob accepts the LS change, `leisure=park`
   is in it.
4. The panel hides an empty layer **only after** Intake is measured to carry per-layer presence.
