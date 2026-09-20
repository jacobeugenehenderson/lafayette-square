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

⛔⛔ **DO NOT MAP ALL 80. THAT IS THE TRAP IN THIS BRIEF.** Many are **not land-use faces at all** —
`amenity:bench` (23), `amenity:bicycle_parking` (29), `leisure:bleachers` (14), `amenity:toilets` (38)
are street furniture and point features. ⭐ **Mapping them would invent land use where there is none,
which is the same error as erasing it.**
▶ **SORT the 80 into three piles, and the third pile is the important one:**
  ① **a real LU face that needs a class** — farmland, brownfield, water, park, wetland, beach…
  ② **NOT a land-use face — declared IGNORED, by name, with the reason.**
  ③ **cannot tell without looking** — bring it to Jacob.
⭐ **The declared-ignored pile is what makes this honest and what makes the check possible.** "We
looked and decided no" is a different fact from "nobody has looked", and today they are the same
silence. That distinction is `sources.js`'s UNDECLARED / DECLARED-NONE / DECLARED, arriving in a third
domain — ⛔ reuse the idea, do not re-invent the mechanism.

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
