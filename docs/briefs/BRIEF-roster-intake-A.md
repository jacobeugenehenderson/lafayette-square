# BRIEF A — THE ROSTER'S MISSING INPUTS: node POIs · the assessor · the zoning engine

*Written 2026-09-20 by the coordinator seat. Dispatched by Jacob, same day, as the first of three.*

> ### ⭐ WHAT JACOB ASKED FOR
> *"I want to get the roster up, I want to populate as many buildings as we can and devise the system
> for finding out on non preserved towns."*
>
> **This brief is dispatch A of three.** B is Overture Places (the general path, runs in PARALLEL —
> different files, different source). C is prominence ranking (AFTER A, it ranks on A's signals).
> ⛔ **Do not do B's or C's work here.** If you find yourself designing a ranking, you have drifted.

> ### ⛔⛔ LAYER 0, SAID OUT LOUD BECAUSE THIS BRIEF IS ABOUT ONE TOWN'S DATA
> huron is the **witness**, not the subject. Every part of this must work on a town nobody has looked
> at. ⛔ A per-town hardcode, a "huron uses this URL" constant, or an Ohio-shaped parser fails the
> brief even if huron's roster fills. **The deliverable is the acquisition PATH, and huron is how you
> prove it runs.**

---

## 1. You are the dispatched agent. Name yourself — one word, yours.

## 2. Agent: **FRESH**

⛔ **Do NOT warm-start from Quill** — it holds the fade/SSoT arc and `CartographApp`/`boundary.js` are
in its bounds. Different region, no overlap, and two sessions in one index is the hazard.
⚠️ **You WILL touch `cartograph/bake-content.js`. Nobody else is in it today — verify that yourself**
(`git status`) before your first write, and re-verify before you commit.

## 3. Read this canon, by section

- **`INTAKE-CATALOGUE.md §3.2`** — *"**Assessor parcels** — ⭐ the single richest content well"*, and
  its own **CORRECTION** paragraph: address does NOT require a parcel authority; outside the US it
  lives in OSM `addr:*`. **What an assessor uniquely gives is valuation · zoning · year_built · units.**
- **`INTAKE-CATALOGUE.md §4.2`** — ⭐ **THE ONE-BUTTON RULE** (Jacob, 2026-07-20): *"where a source has
  a programmatic endpoint, the row's acquisition is ONE BUTTON — not an instruction."* Its own table
  lists **"Assessor parcels | per-jurisdiction ArcGIS/Socrata | varies — needs a per-town endpoint
  field."** ⭐⭐ **That sentence is this brief's §5 deliverable. It was written 2026-07-20 and never built.**
- **`INTAKE-CATALOGUE.md §4.1`** — the cheap-signal inventory. The method; huron's numbers are in §4 below.
- **`INTAKE-CATALOGUE.md §3.6 G3`** — the zoning defect. ⚠️ **Its four line numbers have ALL drifted and
  its disagreement claim is imprecise — see §4c. Do not quote it; re-derive it.**
- **`CLAUDE.md` Layer 0 q2** — ⛔ NO FALLBACKS. `|| 'residential'` in §4c is that rule being broken in
  the open.

## 4. The code sites, by `file:line` — all verified 2026-09-20

### (a) ⛔⛔ THE NODE DISCARD — the free win, and it is NOT a new hole

`cartograph/fetch.js:269-275`, `ingestElements`:
```js
if (el.type === 'node') {
  nodes[el.id] = [el.lon, el.lat]      // ⛔ COORDINATES ONLY. THE TAGS ARE THROWN AWAY.
} else if (el.type === 'way') {
  waysById.set(el.id, el)
  if (el.tags) target.push(el)          // only WAYS ever become features
}
```
`:304`, in `wayToFeature`:
```js
if (coords.length < 2) return null      // a point POI could not survive even if it got here
```

**Measured against Overpass in huron's own bbox, 2026-09-20 — 119 node POIs, 57 named:**
```
amenity  85  (31 named)      office  14  (14 named)      shop  10  (8 named)
tourism   8  ( 2 named)      craft    2  ( 2 named)
```
⭐⭐ **`node["amenity"]` HAS BEEN IN `HEAVY_NODES` SINCE FOREVER — all 85 were discarded too.** This is
not a hole opened by the `shop`/`tourism`/`office`/`craft` tags added earlier today (`fetch.js`, in the
tree); those merely made it visible. **It is a pre-existing hole in every town ever poured.**

⭐ **THE CONSUMER IS ALREADY READY — DO NOT REBUILD IT.** `cartograph/bake-content.js:203-228`,
`loadOsmPois`, already handles a one-coordinate feature:
```js
const [cx, cz] = coords.length > 2 ? ringCentroid(coords) : coords[0]
```
⇒ **Intake is the only broken half.** ⚠️ But `wayToFeature` is a WAY function; a node is not a
degenerate way. **Decide deliberately whether a node becomes a feature with a 1-point `coords`, and
say what `isClosed` means for it.** ⛔ Do not quietly let a 1-point ring flow into geometry consumers
that assume ≥2 — enumerate them first (`classify.js`, `skeleton.js`, `prebake`).

### (b) THE ASSESSOR — huron's real blocker is the ADDRESS SPINE

`cartograph/bake-content.js:140-142`:
```js
function loadParcels(scene) {
  for (const [file, jur] of [['stl_parcels.json', 'city'], ['stlco_parcels.json', 'county']]) {
```
⛔ **The FILENAMES are St. Louis.** `:172` does the same for `content/county-land-use-codes.csv`.
huron's bake says so out loud, every run:
```
[parcels] missing stl_parcels.json — skipping city
[landuse] county-land-use-codes.csv missing
frame-alignment: 0/3678 buildings matched a parcel (0%)
```

**Why this and not more OSM — measured on huron's `raw/osm.json`:**
```
addr:street 51  ·  addr:housenumber 46  ·  addr:postcode 49     against 3,678 buildings
```
⭐ **51 addresses.** The address is the join spine for the bare-building roster and the NR match
(`§3.2`). **No amount of POI work fixes that; an assessor does.**

⚠️ **huron is in ERIE COUNTY, OHIO** — not Huron County (Erie split off in 1838). ⛔ A search for
"Huron historic district" returns **Huron City, Michigan**, a false match that already cost this seat
a detour. **Confirm the jurisdiction from the geography record before you fetch anything.**

### (c) ⛔ THE ZONING ENGINE — the cap on everything above

⚠️ **`INTAKE-CATALOGUE §3.6 G3`'s line numbers have all drifted. Verified today:**

| claimed | actual |
|---|---|
| `useListings.js:47` | **`src/hooks/useListings.js:46`** `ZONING_CAT` (`:47` is `ZONING_SUB`) |
| `SceneNeon.jsx:77` | **`src/components/SceneNeon.jsx:83`** `_NEON_ZONING_CATEGORY` |
| `PlaceCard.jsx:45` | **`src/components/PlaceCard.jsx:49`** `ZONING_LABELS` |
| `bake-content.js:342` | **`cartograph/bake-content.js:361`** `ZONING_CAT` (`:362` `ZONING_SUB`) |

**And the disagreement is more specific than the doc says. Two live splits, re-derived:**

1. **`SceneNeon` runs a DIFFERENT TAXONOMY, not a drifted copy.** `D: 'residential'` where the other
   two say `'commercial'`; `F`/`G`/`H` → `'services'`; `J` → `'community'`; and it carries an **`I`**
   key the others do not have. ⚠️ **ASK WHETHER THIS IS A DEFECT AT ALL** — it maps zoning → *neon
   colour*, while `useListings` maps zoning → *search category*. Those are different questions and
   `§3.6` itself calls them *"two unrelated systems."* ⛔ **Layer 0 question 3: do not call a
   deliberate difference a bug. Bring it to Jacob; do not unify it on your own judgement.**
2. ⭐⭐ **THE ONE THAT IS UNAMBIGUOUS, AND THE DOC NEVER NAMES IT: `ZONING_SUB` disagrees between
   `useListings.js:47` and `bake-content.js:362` on FIVE keys** — `A`,`B`,`C`,`E`,`H` are
   **`'unnamed'`** in one and **`'houses'`/`'townhouses'`/`'lofts'`/`'houses'`/`'houses'`** in the
   other. ⛔ **`bake-content.js:359`'s own comment claims to mirror it** — *"(§useListings
   ZONING_CAT/SUB)"* — **and it does not.** A comment asserting a parity that does not hold.
   *(`ZONING_CAT` itself now AGREES between those two — so that half of G3 is ROT. Correct the doc.)*

**⛔ AND THE TOWN-#2 KILLER, in both files:**
```js
category: ZONING_CAT[z] || 'residential'
```
A town with no STL zoning letter ⇒ **every building residential, every neon tube sage.** ⭐ That is
Layer 0 question 2 verbatim: a fallback converting "we do not know" into a confident wrong answer.
**⛔ The fix is NOT a better default — it is a LOUD absence.** An unknown zoning must be
distinguishable from a known residential one, everywhere it is read.

⚠️ **`src/hooks/useListings.js` has a second silent drop in the same function:** the bare-building
filter requires `b.address &&`, so **a building with no address is silently absent from the Society
Pages.** On huron that is ~3,627 of 3,678. **Same class, same fix discipline.**

## 5. ⭐ THE DELIVERABLE THAT MAKES THIS A KIT FIX — the per-town endpoint field

`§4.2` names it and nobody built it: **"needs a per-town endpoint field."**

▶ **Add the assessor source to the town's own record, not to code.** A town declares where its parcels
come from; `loadParcels` reads the declaration. ⛔ **`stl_parcels.json` as a hardcoded filename must
not survive this brief** — that is the LS-bleed shape (`§0`, the headline finding).
⭐ **Then it is a BUTTON**, per `§4.2`, and huron is how you prove the button runs.
⚠️ **Where the declaration lives is a real design call** (`geography.json`? the boundary record? a new
`sources` record?). **Propose it, with the reason, before you build it.**

## 6. ⛔ Can the instrument SEE the change?

**Yes, and it is unusually good here — everything lands on DISK.**
- `raw/osm.json` — node features present or absent. `node -e`, one line.
- `content/listings.json` / `roster.json` — the bake prints its own census, per run:
  `base listings (OSM): N` · `roster: N buildings · parcel-matched N · with-listings N`.
- ⭐ **BASELINE, measured 2026-09-20 — re-derive, do not quote:** huron **37 listings**, `with-listings 35`,
  **0/3678 parcel-matched**, 3,678 buildings.
- ⚠️ **`frame-alignment: 0%` already prints a LOW-match warning.** Good. ⛔ **Check it can actually FAIL
  loudly rather than warn-and-continue** — a 0% match that proceeds is the silent-substitution class.

**Eye-gate surface:** the **Society Pages**, in the app, on huron — not a probe.
⛔⛔ **MUTATION-TEST ANY CHECK YOU WRITE.** `MEMORY §C`: a passing check proves nothing until seen to
FAIL. On 2026-09-20 a check in this repo **passed for the wrong reason** — a lazy regex matched 3 of N
and reported green. Make yours fail on purpose first, by name.

## 7. Write/commit bounds

**In bounds:** `cartograph/fetch.js` · `cartograph/bake-content.js` · `src/hooks/useListings.js` ·
`src/components/SceneNeon.jsx` + `PlaceCard.jsx` *(read freely; ⛔ edit only after §4c(1) is ruled)* ·
huron's `data/` artifacts · a new check · **and the `INTAKE-CATALOGUE §3.6 G3` correction** — its line
numbers and its stale `ZONING_CAT` claim. That doc edit is **part of this fix**, per CLAUDE.md's
three-part rule, and ⛔ **the commit message must name the register it reached** (`FEATURES` /
`OPERATIONS`) or say "reaches no register" outright.

⛔ **OUT of bounds:** the fade/`streetFade`/`boundary.js` arc (**Quill, live**) · Overture (**brief B**) ·
prominence ranking (**brief C**) · the scene-leak (`BRIEF-scene-leak.md`, parked).

### ⛔⛔ THE IRREVERSIBLE STEP, AND THE ONE THING TO COME BACK FOR
**A re-fetch overwrites `raw/osm.json`.**
- ✅ **huron is SAFE and already proven today:** it has **no `design.json` and no `blockCustoms`** —
  nothing authored — and `raw/osm.json` is **git-tracked**, so an overwrite is `git checkout`-able.
  A re-fetch was already run against it today with no loss (2744 → 2760 features, strict superset).
- ⛔⛔ **LS, HPDM, altadena and staging are NOT safe and you may not re-fetch them.** LS is heavily
  authored and whether authored state survives an intake it is keyed against **has not been measured.**
  **Come back to Jacob. Do not decide this inside the brief.**

⛔ **SURFACE SCOPE DRIFT, DO NOT ABSORB IT.**

## 8. The validation surface that already exists

⛔ **Do NOT build a parallel spike.** `bake-content.js` runs on any scene in seconds and prints a
census — **it IS the harness.** Run it before and after, on huron, via the production path.
⚠️ Use LS as the **reference consumer**, never the subject: it is the finished picture
(1,082 buildings, 98.8% address, 87 landmarks) and it is what "done" looks like — ⛔ but it is the
*mould the kit was cast around*, so **do not port its shapes; measure against it.**

---

## What "done" looks like

1. OSM **nodes become features**; huron's 57 named node POIs reach `listings.json`.
2. The assessor path is **declared per town, not hardcoded**, and huron's parcel match is no longer 0%.
3. `|| 'residential'` and `b.address &&` **fail loudly** instead of silently substituting.
4. `ZONING_SUB`'s five-key split is resolved, and `bake-content.js:359`'s parity comment is true or gone.
5. `INTAKE-CATALOGUE §3.6 G3` is corrected — line numbers, and the `ZONING_CAT` claim that is now ROT.
6. A check, **seen to fail before it passes**.
7. ⛔ `SceneNeon`'s taxonomy is **ruled by Jacob**, not unified by you.
