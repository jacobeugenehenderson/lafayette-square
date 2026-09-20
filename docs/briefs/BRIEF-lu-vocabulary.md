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

⛔ **THIS IS HIS QUESTION AND IT IS NOT RULED. Do not decide it.** ⭐ The coordinator's read, offered
as a read: **neither, purely.** The shape this repo keeps arriving at is
**STATIC KIT VOCABULARY · DERIVED PER-TOWN PRESENCE · ABSENCE SHOWN, NOT HIDDEN** —
- the **vocabulary** stays kit-wide and static, or towns cannot be compared and no check can assert
  anything across them;
- **presence** is derived from what is on that town's disk;
- ⛔⛔ **and hiding an empty row is the trap.** If a layer vanishes because the town has none, the
  operator cannot tell *"this town has no benches"* from *"we never fetched benches"* — which is the
  silent substitution this whole brief is about, committed in the UI. **Show the row, and show which
  of the three states it is in.**
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
