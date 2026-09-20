<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-20
evict-when: node checks/claims-every-lu-tag-has-a-home.mjs
-->

# BRIEF — THE LAND-USE VOCABULARY IS LAFAYETTE SQUARE'S, AND TOWNS HAVE WORDS IT LACKS

*Written 2026-09-20 by the coordinator seat. Ruled by Jacob: **"We need new tables and new LU, it's a kit."***

> ### ⭐ HOW IT SURFACED — and the route matters, because the detector was in the wrong place
> Jacob, on huron: *"There is lots of ag/farm land in OH which is not growable surface."* Sylva went
> to check whether the tree bake would plant it, and found the safety net **could not fire.**

---

## 1. You are the dispatched agent. Name yourself — one word, yours.

## 2. Agent: **FRESH**

⚠️ `cartograph/derive.js` and the LU consumers are quiet right now, but check `git status` before your
first write — this repo runs several sessions against one index.

## 3. ⛔⛔ THE DEFECT: THE SAFETY NET SITS DOWNSTREAM OF THE HOLE

`cartograph/lu-policy.mjs` promises, in its own header:
> *"an UNRECOGNIZED class defaults to **plantable-and-loud** rather than silently to hardscape."*

⭐ **That guarantee only covers classes that SURVIVE THE VOCABULARY.** One stage earlier,
`cartograph/derive.js:3144` `OSM_TO_LU` maps OSM tags → LU classes, and `:3140-3143` states the
fallthrough in its own words:
```
1. OSM landuse polygons (authoritative) — whichever LU category covers the most area wins
2. Parcel majority vote
3. 'residential' default
```
⇒ ⛔ **A TAG WITH NO MAPPING NEVER BECOMES AN LU POLYGON AT ALL.** So `landuse:farmland` is never an
*unrecognized* class — **it is never a class.** The face falls to the parcel vote, else to
**`'residential'`**. **A cornfield is presented as residential lawn, confidently, with no line of
output anywhere.**

⭐⭐ **AND THIS IS NOT THE HPDM `median` SHAPE, WHICH IS WHY THAT ONE WORKED.** `median` *reached*
`luByClass`, so the detector saw it and the fix was one policy entry. Agricultural land is **erased a
stage earlier and arrives wearing a recognized class's name.** ⛔ Layer 0 q2 in its purest form: not a
missing feature — **a silent substitution.**

**Measured on huron (Sylva, verified by the coordinator seat):** the frozen shape carries **9 LU
classes — commercial, industrial, institutional, island, park, parking, recreation, residential,
underived — every one "(kit default)", and ZERO unrecognized-class warnings.** The 53 agricultural
features are simply gone.

## 4. ⭐⭐ THE REAL SIZE — 32 MAPPINGS DECLARED, 80 TAGS ON DISK WITH NO HOME

▶ Re-derive; do not quote. Read `OSM_TO_LU`'s keys out of `derive.js` and diff against every town's
`raw/osm.json` (`landuse` · `leisure` · `natural` · `amenity`). Measured 2026-09-20 across LS, huron,
hipointe-demun and altadena: **`OSM_TO_LU` declares 32 tag mappings. 80 distinct tags are present on
disk with no mapping, 1,937 features.** The head of that list:
```
landuse:brownfield      469   ← altadena 459.  A real land use, and the largest single gap.
natural:sand            238
natural:water           157   ⛔ WATER HAS NO LU CLASS
natural:bare_rock       153
leisure:park             88   ⛔⛔ IN ALL FOUR TOWNS. A PARK HAS NO LU CLASS.
natural:grassland        86
landuse:flowerbed        82
natural:scree            58
landuse:railway          52
landuse:farmland         38   ← the one that started this
natural:grass            38
natural:wetland          26
landuse:meadow           15
leisure:nature_reserve   15
natural:beach            14   ← huron is on Lake Erie
```

### ⛔ MAP ALL 80 — **INTO THE RIGHT TABLE.** *(Jacob, 2026-09-20, correcting this brief)*

> *"Why not? I don't know why we wouldn't just provide the completest picture we can; if all of that
> is available why not have the option to show it? (Toilets in particular; beach? that's great stuff
> for a local map)"*

⛔ **AN EARLIER DRAFT OF THIS BRIEF SAID "DO NOT MAP ALL 80" AND THAT WAS WRONG.** It collapsed two
different questions into one:
- **"Is this a land-use FACE?"** — a bench is not. ⛔ Painting a whole block face the colour of
  *bench* is a real error and it is the one to avoid.
- **"Should this be ON THE MAP?"** — ⭐ **a bench absolutely should.**

⇒ **THE ANSWER IS NOT "DON'T MAP IT", IT IS "DON'T MAP IT AS THE WRONG KIND OF THING."** Three piles,
and ⭐ **the third should be nearly EMPTY:**

| pile | destination | examples |
|---|---|---|
| **① LU FACE** | `OSM_TO_LU` + a colour (`m3Colors`) + a plantability (`lu-policy`) + optionally a **surface treatment** (§4a) | farmland · brownfield · beach · wetland · **park** · grassland · sand · scree |
| **② MAP LAYER** | a `layerVis` layer + a marker — ⭐ **`FURNITURE_DEFS` in `Panel.jsx` ALREADY EXISTS for exactly this** | toilets · benches · bicycle parking · bleachers · shelters · outdoor seating |
| **③ genuinely nothing** | declared IGNORED, by name, with the reason | ⭐ if this pile is large, the sort is wrong |

⭐ **`natural:beach` is pile ① on a Lake Erie town, not furniture** — 14 features on huron, a real
surface, currently invisible. ⭐ **`amenity:toilets` (38) is pile ② and is genuinely useful** — a
public toilet on a neighborhood map is the local-map value the Society Pages exist for.
⚠️ Declared-IGNORED remains the distinction that makes the check possible: *"we looked and decided
no"* and *"nobody has looked"* are the same silence today. That is `sources.js`'s
UNDECLARED / DECLARED-NONE / DECLARED arriving in a third domain — ⛔ reuse the idea, do not re-invent
the mechanism.

### ⛔⛔ AND AN ENTIRE BUCKET IS MISSING — `man_made`. THE 80 ABOVE WAS TOO SMALL.

**CORRECTED 2026-09-20.** The count above swept `landuse · leisure · natural · amenity`. It **did not
sweep `man_made` at all.** Re-measured across the same four towns:

> **105 distinct unmapped tags · 2,423 features** *(was 80 / 1,937)*
> **`man_made` alone: 476 features** — LS 34 · huron 244 · hipointe-demun 133 · altadena 65.
> ⛔ **Every `man_made` value is unmapped. All of them.**

```
man_made:pier       213      man_made:planter          19
man_made:bridge     123      man_made:embankment       11
man_made:gantry      29      man_made:reservoir_covered 8
man_made:storage_tank 22     man_made:tower             4
man_made:breakwater  22      man_made:silo              3
```

⭐⭐ **AND IT IS THE `railway` BUG, THIRD INSTANCE.** `man_made` IS in `fetch.js`'s `HEAVY_WAYS` — it
is **fetched** — and it is **NOT in `tagPriority`**, so it is never **bucketed.** Every one of those
476 falls through to `ground.other[]`. On huron that is **214 of 246 `other[]` features.**
`fetch.js:309` records the lesson in its own comment about railway: ***"the fetch was one and this is
the other."*** Somebody added `man_made` to the query and never to the bucket.

⇒ ⛔ **THIS BRIEF HAS TWO HALVES, NOT ONE.** The tag→class vocabulary (`OSM_TO_LU`) **and** the
fetch→bucket vocabulary (`tagPriority`). A tag can be missing from either and the symptom is
identical: it is on disk and reaches nothing. ▶ **The check in §7 must cover BOTH**, or it will pass
a town whose piers are in `other[]`.

⚠️ **`man_made:bridge` at 123 is its own question and probably not yours** — bridges are structural,
`skeleton.js` already has grade-separation fields (`layer`/`bridge`/`tunnel`), and a bridge is not a
land use. ⛔ **Surface it; do not classify it.**
⭐ **And huron's waterfront is why this surfaced**: breakwater 22 · pier 215 · groyne 1 · reef 4 ·
`barrier=retaining_wall` 6. See `BRIEF-boulder-revetment.md`, which is BLOCKED ON THIS BRIEF.

## 4a. ⭐⭐ NEW CLASSES UNLOCK FOLIAGE — the mechanism already exists

*Jacob: "Will we be able to fill a field with Corn? Just realizing we should add more foliage if
that's possible."*

`src/components/BakedGround.jsx:71`:
```js
const GRASS_FACES = new Set(['park', 'residential', 'recreation'])   // the noise-based grass shader
```
⭐ **A per-face-kind SURFACE TREATMENT, keyed off the LU class.** ⇒ a `farmland` class can take a
**crop-row variant** exactly the way `park` takes grass. ⚠️ **Another three-entry table holding
precisely the three faces LS has** — the same shape as everything else in this brief.
⇒ **Every new LU class is an opportunity for a surface treatment**: crop rows, wetland reeds, beach
sand, scree. ⛔ **Do not build the shaders in this brief** — establish that the hook is per-class and
say what each new class WANTS. The foliage is its own arc and it is Jacob's to scope.

## 4b. ⚠️ THE TOGGLE LIST IS HARD-WIRED — and Jacob has asked the right question about it

`src/cartograph/Panel.jsx:422-429` builds the Designer's layer panel from **six static arrays**:
`STREETS_DEFS · BLOCKS_DEFS · PATHS_DEFS · LAND_COVER_DEFS · FURNITURE_DEFS · LABELS_DEFS`.
⇒ **A town with farmland gets no toggle for it even after the LU class exists.** The UI vocabulary is
LS's too, one layer above the data vocabulary this brief is about.

> *Jacob: "does this mean they should be dynamic to the installation and what is made available in
> every distinct map? Or is it just a long list and we only display what we have?"*

### ✅ RULED 2026-09-20 BY JACOB — **AN EMPTY LAYER DOES NOT APPEAR.**
> *"For a community with no toilets (say) what will happen to the toggle? Can ineligible things not
> even appear? The list is already long, we don't want to also make it confusing."*

⭐⭐ **AND THE SURFACES THAT SETTLE IT ALREADY EXIST AND ARE ALREADY DISTINGUISHED.**
`src/cartograph/SourcesPanel.jsx:9-11`, verbatim:
> *"Intake answers **'what does THIS town still need'**, Sources answers **'what goes into a town at
> all, and where do I go.'**"*

| surface | its question | an empty layer |
|---|---|---|
| **Designer layer panel** (`Panel.jsx`) | *what am I looking at right now* | ⛔ **DOES NOT APPEAR** |
| **Intake panel** (Extent tool) | *what does THIS town still need* | ⭐ **the three states live HERE** |
| **Sources panel** (Stage toolbar) | *what goes into a town at all* | the kit-wide vocabulary |

⛔ **THE COORDINATOR'S EARLIER READ — "show the row, never hide it" — WAS AN OVER-APPLICATION AND IS
WITHDRAWN.** "Absence must be loud" governs MEASUREMENT surfaces: a census, a bake report, a check.
**The layer panel is a WORKING CONTROL, not a census.** A row for a thing the town does not have is
noise there, and a list nobody can scan is its own kind of silence. ⭐ The distinction is not lost —
it is RELOCATED to the panel that exists to carry it. One fact, one home; two copies disagree.

> ### ⚠️⚠️ THE ONE BOUNDARY, AND IT IS A PRECONDITION, NOT A CAVEAT
> **HIDE ON "THIS TOWN HAS NONE". NEVER HIDE ON "WE HAVE NOT LOOKED."**
> If a layer is absent because nobody fetched it and the toggle silently vanishes, the gap is
> invisible in BOTH places — and that is precisely the silent substitution this entire brief is
> about, committed in the UI.
> ⇒ ⛔ **THE PANEL MAY HIDE FREELY ONLY BECAUSE INTAKE CARRIES THE OTHER HALF. IF INTAKE DOES NOT YET
> COVER LAYERS, HIDING IS UNSAFE AND THE INTAKE WORK COMES FIRST.**
> ⭐ Establish that before the first toggle is hidden — today Intake carries the big intake ROWS, and
> whether it reaches per-LAYER presence is **not established**. Measure it; do not assume it.

⚠️ A 37 → 80 row panel is a real usability problem and his *"just a long list"* worry is fair — but
that is **presentation** (collapse empty sections by default), not truth. ⛔ Solve it by collapsing,
never by hiding.

## 5. ⛔ THE SCOPE: "NEW TABLES", PLURAL — THE CLASS SET IS NAMED IN AT LEAST NINE PLACES

Jacob's ruling is *"new tables and new LU"*, and a new class is not one edit. Sites that name the LU
class set, found by grepping three class names (`institutional`, `vacant-commercial`, `underived`):
```
cartograph/derive.js            OSM_TO_LU — the producer
cartograph/parcel-landuse.mjs   assessor codes → LU (the other producer)
cartograph/lu-policy.mjs        plantability
cartograph/forbidden-surface.mjs
src/cartograph/m3Colors.js      ⭐ THE COLOURS — a class with no colour is invisible or wrong
src/cartograph/CartographSurfaces.jsx
src/lib/ribbonsGeometry.js · src/lib/buildBlockGeometryV2.js · src/lib/tileGround.js
src/stage/StageApp.jsx
```
⚠️ ▶ **That list is a STARTING POINT from three probe names, not an inventory. Derive the real one**
— and ⭐ **if adding a class means touching nine files, the finding is that the vocabulary has nine
homes**, and *that* may be the more valuable half of this brief. ⛔ Do not silently refactor it into
one; measure it, report it, and propose.

## 6. ⚠️ WHAT ONLY JACOB CAN DECIDE — take it to him, do not choose

**What the new classes ARE.** This is product vocabulary, not a lookup table:
- Is `farmland` its own class, or one `agricultural` class covering farmland/meadow/greenhouse?
- ⭐ **`orchard` is genuinely trees, planted in rows by a farmer.** It is not a corn field and it is
  not a park. It may deserve its own class precisely because the tree bake should treat it differently.
- `brownfield` (469 on altadena) — is that `vacant`, or its own thing? altadena is post-fire.
- `natural:water` — water is already drawn by another path. Does it need an LU class, or is its
  absence here correct? ⛔ **Establish that before adding it.**
- ⭐ Each new class needs a **colour** (`m3Colors.js`) and a **plantability** (`lu-policy.mjs`), and
  those are two different judgments. A class can be soft and ugly.

## 7. ⛔ Can the instrument SEE the change? — AND THIS IS THE DELIVERABLE

⭐⭐ **THE CHECK IS WORTH MORE THAN THE CLASSES.** One assertion kills the whole class in a town nobody
has looked at:
> **Every LU-bearing OSM tag present in any town's `raw/osm.json` resolves to a declared LU class, or
> is declared IGNORED by name.** Anything else FAILS, loudly, naming the tag and the town.

▶ `checks/claims-every-lu-tag-has-a-home.mjs`. ⛔ **It must READ `OSM_TO_LU` out of `derive.js`, never
restate it** (`CLAUDE.md`: a check reads the source, so it cannot go stale — `claims-revert-field-coverage`
is the pattern). ⛔ **MUTATION-TEST IT**: delete one mapping and prove it fails by name.
⚠️ **And heed today's lesson before you write it:** a check that can only see SYMPTOMS cannot pin a
defect the symptom does not express. This defect has NO symptom — the erased class arrives wearing a
valid name and everything downstream looks fine. **Assert the VOCABULARY directly, not its effects.**

**Eye-gate surface:** huron and altadena, in the Designer. ⛔ Not LS — it is the town whose vocabulary
this already is, so it will look correct no matter what you do. ⚠️ **Three times on 2026-09-20 an
"LS is clean" result meant the test was INERT there, not that the code was right.**

## 8. Write/commit bounds

**In bounds:** `derive.js`'s `OSM_TO_LU` · `lu-policy.mjs` · `m3Colors.js` · `parcel-landuse.mjs` ·
the consumers above · the new check.
⛔ **OUT:** the tree bake (Sylva, live) · the fade/boundary arc · `bake-content.js`.
⛔ **A re-pour is required to see any of this** — `derive.js` runs at pour time. huron is safe to
re-pour (nothing authored). ⛔ **LS, HPDM and altadena are NOT — come back to Jacob.**
⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.**

## 9. The validation surface that already exists
⛔ No parallel spike. `derive.js` + the Designer are the harness. ⭐ **altadena is the better witness
than huron here** — 459 brownfield features, the single largest gap, and it is nobody's mould.

---

## What "done" looks like
1. The 80 are **sorted into three piles**, and the ignored pile is **declared, by name, with reasons.**
2. The new classes exist end to end — producer, colour, plantability — and Jacob chose them.
3. `claims-every-lu-tag-has-a-home` exists and has been **seen to fail.**
4. The number of homes the LU vocabulary has is **reported**, whether or not it is reduced.
5. huron's agricultural land is **visible as what it is**, and the tree subtraction can finally be sized.
