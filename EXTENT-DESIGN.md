# EXTENT — the rebuild design (make every scene the same, built by the one kit)

**Status:** DESIGN, ratified in conversation with Jacob 2026-07-22 (Boz). Successor to
`EXTENT-EXCAVATION.md` (the forensic — the evidence for every claim here). This doc is the
*design of record*: what the Extent tool makes, what "the same" means, the two operator surfaces,
the seal sequence, and the ordered v1 worklist. Not yet decomposed into dispatch briefs.

> ⛔ **Route first** (`CLAUDE.md`): `ORIENTATION.md` → `README §⭐ START HERE` → then the canon this
> design builds on: **`cartograph/SKELETON.md §0–§2, §6`** (the skeleton is the First Bake, a black
> box, the artifact a gajillion consumers trust) · **`cartograph/ARCHITECTURE.md §"The Extent tool &
> the Pour"`** (the live procedure) · **`EXTENT-EXCAVATION.md §0–§0.8`** (Jacob's ruled spec) ·
> **`cartograph/_archive/BRIEF-polygon-asks-the-stamp-2026-07-30.md`** (the same disease one layer down) ·
> **`BRIEF-ls-bleed-excision.md`** + **`INTAKE-CATALOGUE.md`** (the bleed class; the Inputs tab).

---

## 0. The one insight — mint identity ONCE, carry it, never re-derive it

The Extent subsystem and the polygon/stamp subsystem have the **same disease**, at two scales:

- **Stamp (`cartograph/_archive/BRIEF-polygon-asks-the-stamp-2026-07-30.md`):** the skeleton types every node; `extractFaces` throws
  the type away and emits `{ring, edges}`; the FILL re-guesses identity *from shape* and co-claims
  1400 m². Cure: *the polygon asks the stamp* — carry identity onto the face; the FILL **reads**
  ownership instead of negotiating it.
- **Extent (`EXTENT-EXCAVATION.md` PART D):** *membership is computed, never recorded.* Membership is
  re-derived in **nine** places, two disagreeing. ✅ **The identity half is FIXED for `msbf-`** — the
  registry + high-water allocator landed at `fetch-msbf.js:179` (*"an existing footprint keeps its
  PERMANENT msbfId; an unseen one appends at highWater+1; nothing is renumbered"*), so `msbfId: i` =
  fetch array index is **history, not a live defect**. ⛔ **Still open: `osm-` ids never got the
  registry** — `msbf-identity.js` has exactly one importer, so the OSM fetcher (i.e. **both Polish
  pours**) is unlocked. That port is the remaining work; membership recording is untouched.

**One cure both times: mint identity once, upstream; freeze it; carry it forward; never re-derive it.**

And the two are not merely analogous — **they are the same artifact.** The skeleton the Extent tool
makes mints **two identities in one freeze**: every **building** gets a permanent id, and every
**junction gets a stamp** (its node kind — dead-end / corner / T / cross / Y — `SKELETON.md §2
junctions[]`, richer on `ribbons.junctionMap.nodes`). Both are decided once at the seal; both must be
**carried** onto everything downstream, never re-guessed. This document applies the one cure to **both
identities the skeleton mints — building ids and junction stamps.**

---

## 1. What the Extent tool actually makes — THE SKELETON, served

Jacob, 2026-07-22: *"Make sure you understand what the extent tool actually makes: The Skeleton. If
the skeleton isn't served it is not doing its job. A gajillion consumers hang off the skeleton info."*

The Extent tool's product is **not** the boundary disc. It is the **skeleton** — `clean/<scene>/skeleton.json`,
the First Bake (`SKELETON.md §0`), the frame all downstream geometry trusts. The boundary disc is a
small artifact *beside* it. A scene is only "poured" when the skeleton → ribbons chain is **served**
from `cartograph/data/<scene>/clean/`, the way every consumer reaches a scene's geometry.

**⭐ What the skeleton ACTUALLY is (Jacob, 2026-07-22): a labeled point cloud.** "Skeleton" is a human
convenience — the real substance is a set of **points, each carrying a label** (its node kind / stamp).
We unite the points with **line segments** for two reasons only: so a person can *see* it as a
skeleton, and so we have something to **stroke** into streets, curbs and sidewalks. So the primary
artifact is the labeled points; the segment-skeleton and the polygons derived from it are both
*downstream views*. **The identity lives on the points, not the lines** — which is the whole reason a
polygon must *ask the stamp* (`cartograph/_archive/BRIEF-polygon-asks-the-stamp-2026-07-30.md`): when segments become faces, the point's
label must ride along, or the FILL re-guesses it from bare shape and gets it wrong. Same for building
ids: the label is on the thing, and every view of it must carry the label, never re-derive it.

**The two-pass fetch that produces it (`EXTENT-EXCAVATION §0.1, §0.8`):**

| Step | What it does |
|---|---|
| **SOFT fetch** | generous envelope; chains, names, junctions, **painted MSBF/OSM footprints**. Mints building identity. Reversible, cheap, re-runnable. |
| **EDIT** | author the boundary runs → polygon, exclusions, `activate`/`hide`; fill/declare inputs. |
| **HARD fetch = SEAL** | ① **permanently freezes the soft fetch** ② **bakes the skeleton** (serves `clean/<scene>/`) ③ with inputs **or declared channels for** missing inputs. Irreversible *because it locks its input.* |

---

## 2. The definition of DONE — sameness, and the detector that measures it

Jacob: *"They all need to be the same, built by the same kit."* Concretely, **done =**

- **zero scene-name branches** (no `scene === 'lafayette-square'` anywhere);
- **one identity scheme** (no `bldg-` / `msbf-` / `osm-` divergence; all locked, stable);
- **one membership decision**, recorded per building (not re-computed in nine places);
- **one served path** — every scene's geometry served from `clean/<scene>/`, nothing name-imported
  from the shared `src/data/*` root.

**The gate is `scratch/served-parity.mjs`** (committed `17f5691e`) — the machine check that asserts
every scene is built and served the same way. It doubles as the `BRIEF-ls-bleed-excision §6.4` class
regression guard. Measured today:

| scene | ns | poured / served? | notes |
|---|---|---|---|
| **lafayette-square** | `bldg-` (1082) | ⛔ **NOT poured** — no `clean/ribbons.json` | render data lives at `src/data/*`, name-imported at **19 sites** |
| **hipointe-demun** | `msbf-` (1281) | ✅ served from `clean/` | namespace correct; **identity unstable** (fetch-index) |
| altadena | `msbf-` (15397) | ✅ served | fetch-index |
| ksi-y-m-yn | `osm-` (1640) | ✅ served | fetch-index; deferred (§0.5) |
| centrum | `osm-` (2954) | ✅ served | fetch-index; deferred |

### 2.1 ⭐ The root — LS is not a scene; it is the mold the kit was cast around

Every other hood is a scene under `clean/<scene>/`. **LS's artifacts live at the shared default
paths** — `src/data/ribbons.json`, `src/data/buildings.json`, `src/data/street_lamps.json`,
`src/data/landmarks.json`, `src/data/park-feature-elev.json` — **imported by literal name** across the
app (`loadInstanceData.js` even hands LS `import('./ribbons.json')` = the shared root). So
`src/data/*` is simultaneously *"the shared default"* **and** *"LS's own render data"*. That
conflation is the root the entire LS-bleed class grows from: when a poured scene's input is absent,
the kit falls back to `src/data/*` — which **is** Lafayette Square. LS bleeds into everyone because
LS *is* the fallback. Retire the name-imports → the whole bleed brief closes at the root instead
of site-by-site.

> ⭐ **COUNT THE SITES, DON'T QUOTE THEM** *(2026-08-08 — this paragraph said "19 sites" and the
> figure does not reproduce; nobody can say how it was counted, and it is the number the work is
> sized on).* Run it:
> ```
> grep -rn "data/\(ribbons\|buildings\|street_lamps\|landmarks\|park-feature-elev\)\.json" src cartograph
> ```
> ⚠️ **Split code from docs before sizing** — a large share of the hits are *doc* mentions, which are
> repointing work, not import work. **The import sites are the ticket; the doc mentions ride along in
> the same sweep.**

---

## 3. The two operator surfaces

### 3.1 The Inputs tab (`SourcesPanel`) — the new-map onboarding checklist

The Inputs tab is the operator's manifest, mounted from **both** the Extent and Stage toolbars. Today
it is a hand-authored catalogue of *source procedures* grouped by supplier (Automatic/locked · Public
records · Local knowledge), each row an action `FETCH` / `DOC` / `OWED`.

**The eventual shape (Jacob, 2026-07-22):** open a new map → every input is a **blank row with a "get"
button**, and "get" is three things in one:
1. **help** — the row's `where` / `steps` (how + where to obtain it) — *already present*;
2. **fetch** — press-and-go where an endpoint exists (`FETCH` rows) — *already present*;
3. **a typed accept-drop** — the row knows the *correct file type* and validates on drop — **new**.

Two design consequences:
- **"Correct type of files" = a schema per row.** Each row grows an `accepts` — extension + a
  validator that rejects the wrong thing at the door (enforces the *"a social URL returns a grey
  placeholder — look at every one"* problem). One field beside the existing `where`/`sources`/`steps`.
- **The blanks ARE the served-parity view.** A row is blank-or-filled **per scene** — the per-scene
  state the panel lacks today, and exactly what the detector prints. The onboarding checklist and the
  sameness detector are the **same surface from two ends**: the operator fills blanks; the machine
  asserts none silently fell back to LS. A row still blank at **seal** time = a **declared channel**;
  the hard fetch bakes anyway (§0.8 ③, owed rows never gate the seal).

### 3.2 The Extent screen (`ExtentApp`) — author the boundary

Unchanged in spirit (`ARCHITECTURE §Extent` — THE PROCEDURE): the boundary is a **ring of named
street runs** that eventually create a **polygon** (`EXTENT-EXCAVATION §0`); corners fall out of the
walk, never placed (R11). Exclusion loops + per-building `activate`/`hide` are the margin corrections
(R14, durable, independent files). The disc is what we **render** — the ground plane / the world's
horizon (R4) — drawn on the **hood center**, frame on the **fetch center** (R10, two centerpoints).

### 3.3 ⭐ The size/centroid model — the whole thing (Jacob, 2026-07-22)

The single most re-derived thing in this subsystem. Nested sizes **hood < disc < bb**, **two
independent centers**, and the two fetches doing **different jobs**:

1. **SEARCH** (name / zip[s]) → the **original centroid** *and* the candidate **street list**. The
   center is anchored by the search — **not** a buildings auto-fit.
2. **SOFT fetch — big and generous *because* it's light.** Cheap (chains, names, junctions,
   footprints — no heights/parcels/derive), so over-fetch on purpose and author the boundary against
   the whole area. Casual, reversible.
3. **Author the DISC** — radius = the (tiny) hood's actual size **+ slight aesthetic padding**,
   centered on the search centroid. The disc **HIDES** buildings outside it; bands + exclusions/
   `activate`/`hide` curate the rest.
4. **HARD fetch — the FREEZE.** Big, not-casual, irreversible. bb = **radius + ~20–25% = the "forever
   safety zone."** It is a **percentage** (scales with the hood), never an absolute distance (a fixed
   1000 m is enormous on a tiny hood, trivial on a big one). Floor: the % must clear the fade band and
   reach the first junction past the boundary streets, so corners still close.
5. **FOREVER, inside the zone, no re-pour** (R15, the living boundary): **hide/reveal buildings ·
   change the radius · move the centroid.** All live, because the frozen square holds every point in
   the zone. The ~20–25% is sized to contain *every future edit* — that is *why* it is frozen and
   chosen deliberately, not casually.

**⭐ The bb centroid must never MOVE.** Once laid down at the hard fetch, the frame origin is frozen
forever. The extent *may* grow (append) and *may* shrink (**destructively** — you lose the trimmed
data, and that is allowed); the one operation it may **never** do is **move**. The reason is precise:
grow or shrink *from a fixed center* leaves every **retained** coordinate and id exactly where it was,
so blockKeys, authored work, and content anchors all still resolve — only *moving* the origin
reprojects everything at once and re-orders identity (the 84→5 content death). The identity lock
already embodies this: on any re-fetch, retained footprints keep their `msbfId` and dropped ones keep
reserved numbers — **verified**, the tight re-fetch shrank 13,427→8,460 footprints with **zero
renumbers**. "Never move the center" is the whole content safeguard.

**Two centers (R10), and the interaction that follows:** the **bb / frame origin is poured once and
frozen** (fetch center, append-only); the **disc centroid is a separate, draggable value** that roams
the forever zone (hood center). That draggable-centroid is R10 made a handle — reuse the `CircleHandle`
/ `ParkTitleHandle` dot pattern.

⛔ **Blocked today by D4:** the code **forces disc center = origin** (`ExtentApp.jsx:1145`
`if (committed) return { x: 0, z: 0 }` — *line re-verified 2026-08-08; it had drifted from the `~1138`
recorded here* — plus `makeCircleBoundary` hardcodes `center:[0,0]`), discarding the `keptCenter` it
just computed. **Fixing D4 is what enables the draggable centroid.**

> ⭐⭐ **D4 IS A LIVE RISK TO LS SPECIFICALLY, AND LS IS ONE OF THE TWO SAFEGUARDED MAPS.** Measured
> 2026-08-08 — **LS is the only scene carrying authored values in this artifact:**
>
> | scene | center | innerFadeOffset | polygon |
> |---|---|---|---|
> | **lafayette-square** | **`[-15,-15]`** (Lafayette Park centroid) | **134** | ⛔ **none** |
> | hipointe-demun | `[0,0]` | 200 (default) | 4 pts |
> | ksi-y-m-yn | `[0,0]` | 200 (default) | ⛔ none |
>
> `PART D`'s destruction table: commit-extent / rescope **always resets `center`, `fade`, `streetFade`,
> `innerFadeOffset` to hardcoded values, with no protection and no warning.** ⇒ **the first time the
> Extent tool touches LS, its two authored values are silently gone** — and LS is production
> (`lafayette-square.com`). *(Reproduce: print each scene's `cartograph/data/<scene>/neighborhood_boundary.json`.)*
> ⭐ LS's missing `polygon` is the same artifact and is already on the board as **B6**'s tree-membership
> fallback — *the file exists; the polygon inside it does not.* ⚠️ The recurring
trap: resizing the **bb** when the **disc** is the problem (an un-authored scene auto-fits the disc to
*all* fetched buildings → huge radius, off-center), and conflating the big-generous SOFT with the
deliberate HARD. Author the disc; keep the bb's forever-zone. (Home:
`[[project_extent_disc_centroid_radius_bb_model]]`.)

---

## 4. The seal — the lock that is the registry

The **hard fetch = SEAL** (§0.8 ①②). It freezes the soft fetch permanently; nothing about the
envelope, frame origin, or street vocabulary may move afterward.

**⭐ The seal IS the building-identity registry.** Once the soft fetch is frozen, a fetch ordinal is a
legitimate permanent key — there is no second fetch to renumber it. Consequences:
- **Identity is minted in the SOFT pass** (footprints are painted there to judge edges — §0.2), not
  the prebake. The prebake and every baker already just carry it — correct, no change.
- **After the seal, augmentation is strictly APPEND** — an allocator with a persisted high-water mark,
  never an array index. Activating a perimeter building later takes a *fresh* number; nothing is
  renumbered.
- **⚠️ Name the new lock `sealed`/`committed`, NOT `locked`.** `SourcesPanel:86` already uses `locked`
  for **governance** ("chosen for you by region, no button"). The seal is a **different** lock — *by
  sequence* ("the hard fetch froze this"). Two axes, one word — name the new one distinctly before
  both ship, or the next reader merges them.

**The cost of the seal, and its mitigation.** Locking makes the soft fetch's *mistakes* permanent, so
§0.4's padding is now the only future headroom that exists — it must be generous, and the seal gate
must enforce **`bbox ⊇ disc + padding`** (today violated: LS 226 m, Altadena 981 m — `EXTENT-EXCAVATION
D1`) and **the frame origin frozen** (R10; D4 finds the code currently forces the two centerpoints
equal — fix in the schema split below).

### 4.1 The seal mints a SECOND identity — the node stamp

The same freeze that gives every building its permanent id gives **every point in the labeled cloud
its stamp** (§1: the skeleton *is* a labeled point cloud). At the seal, `skeleton.js` types each node
by degree — dead-end / corner / T / cross / Y — and the prebake freezes the richer
`ribbons.junctionMap.nodes` (kinds[], legs, corners). This is a **frozen frame fact**, exactly like a
building id, and it obeys the same rule: **carry it, never re-derive it.**

> ### ⭐⭐⭐ THE NODE-IDENTITY SPEC — MEASURED AND SETTLED 2026-08-12 (agent Ferrule)
> **A real intersection cannot move under a weld. Measured on the REAL weld** (`skeleton.js` already
> performs one: 324 fragments → 217 chains), not a simulation:
> ```
> geometric degree   count   SURVIVES   MOVES   DISSOLVES
>   1 (dead-end tip)   100      100        0         0
>   2 (seam / bend)   1832      303      173      1356
>   3 (T)              136      136        0         0
>   4 (cross)           83       83        0         0
>   5+                  10       10        0         0
> ```
> ⭐ **deg≥3: 229 of 229 survive, ZERO move, ZERO dissolve — at EXACT coordinates, max displacement
> 0.0000 m.** deg-1: 100/100. **Only degree-2 dissolves (74%) — and those were never intersections.**
> **This doc's own `SKELETON §3` said why all along:** `weldLongitudinal` *"excludes degree-3+ nodes (a
> Y/junction is not a weld point)"*, and step 8's junction-protected RDP forces junction vertices as
> keeps. **The weld is structurally incapable of moving a real intersection.**
>
> ⇒ **THE KEY: mint a node id, consult by POSITION, validate with the name-set, mint on miss.** That is
> not an analogy to `fetch-msbf.js:179` — **it is the same mechanism**, since the msbf consult keys on
> the building *centroid*, i.e. position. **Tolerance ceiling, measured:** nearest-neighbour distance
> among the 229 is **min 2.53 m** · p05 7.30 · median 49.25 ⇒ **unambiguous below 2.53 m.**
> *(⛔ An earlier warning that "a 0.5 m bucket is fragile" conflated two things: 0.5 m is fragile as a
> **segmentation boundary**, not as an **intersection consult**.)*
> - ⛔ **Name-sets KILLED as a key** — 34 colliding sets covering **76 of 229 nodes (33.2%)**, and the
>   collisions are **divided roads by construction** (a divided avenue crossing a street makes four
>   nodes with one name-set, 8–20 m apart). Fine as a *validator*, never as the key.
> - ⭐⭐ **A RUN KEYS ON AN ORDERED NODE PAIR `(nodeA → nodeB)` — and the ORDER supplies the left/right
>   datum that `side` currently takes from chain forward-direction.** So the pair replaces **both**
>   `skelId` and `segOrd` in `feCustomKey`, and `side` keeps its meaning **without a chain**. A cap keys
>   on a single deg-1 node. **Measured: 26 of 28 `segOrd` slots keyable, ZERO failing for node
>   instability** (the 2 failures are the derive drift — endpoints absent from `skeleton.json`).
> - ⭐⭐⭐ **∴ CHAINS NEED NO PERMANENT ID AT ALL** — they become exactly what `§1` already calls them,
>   *a downstream view, with identity living on the points.* **And that is what "the Measure Tool should
>   never encounter nodes or chains" requires: if nothing authored is chain-keyed, nothing chain-shaped
>   needs to reach Measure.**
> - ⛔ **OSM node ids are RECEIVED AND THROWN AWAY** — `fetch.js:122` builds `nodes[el.id]`, `:140`
>   iterates `way.nodes`, and the id is discarded when projecting to coords. **We are handed a permanent
>   upstream identity and drop it one line before use.** Carrying `way.nodes[i]` onto each coord is small
>   and would make the consult exact rather than positional. **Own ticket.**
> - ⚠️ **UNMEASURED, and it is the live exposure: node stability across a RE-FETCH.** A weld concatenates
>   geometry; a re-fetch may re-*digitize* it. The tolerance is what would save the consult, and that is
>   untested — **the same exposure the msbf centroid consult already carries**, so the precedent is
>   honest but it is not proof.
> - ⚠️ **The 2 cap slots may be keyed to CLIP ARTIFACTS** (`carroll-street-0`, `south-18th-street-3`) —
>   `skeleton.json` is pre-clip so its deg-1 tips are real, but this was not verified per-tip. **Direct
>   interaction with the subtraction work; check it first.** → `PREBAKE §2.5a`.
> - ❓ Unsettled by measurement: whether a divided road's **4-node cluster** should model as one node or
>   four. Treated as four here, which is what the graph says.

Today it is minted and then *not believed*: `extractFaces` emits `{ring, edges}` and drops the label,
so the FILL re-guesses (dead-ends counted three ways — 70/29/50 — and 1400 m² of corner co-claim).
The fix is `cartograph/_archive/BRIEF-polygon-asks-the-stamp-2026-07-30.md` — **polygonization consumes the stamp and carries identity
onto the emitted face; the FILL reads ownership instead of negotiating it.** That brief is its own
campaign (SHAPE/FILL, not Extent), but it is listed here because it is *the same identity discipline
the seal exists to enforce*, one artifact down — and because "what the Extent tool makes" is a
**stamped** skeleton, not a bare one. A seal that froze building ids but let node stamps be re-guessed
downstream would only half-apply the one cure.

---

## 5. The structural fixes v1 depends on

### 5.1 Split the three-jobs artifact (`EXTENT-EXCAVATION` PART D#1) — the cheapest structural fix

`neighborhood_boundary.json` welds **three jobs**: the render disc (`center`, `radius`, `boundary[256]`,
`fade`, `streetFade`), the membership polygon, and the exclusion loops. `makeCircleBoundary`
*constructs a fresh object* on every commit/rescope, regenerating the disc fields from hardcoded
constants while two `if` branches hand-preserve membership — which is why the disc silently clobbers
LS's authored `center: [-15,-15]` / `innerFadeOffset: 134` (D4), why ksi's polygon is in the wrong
file (D2), and why the polygon was ever droppable (X3). **Three jobs → three artifacts.** A schema
split, not a redesign. Fixes D4 (stop forcing the two centerpoints equal) in passing.

### 5.2 Record membership per building, with a reason code

The structural cause of every extent defect: *membership is computed, never recorded.* v1 records the
outcome **per building** (in / shown / out) **with a reason** (inside-polygon / activated / excluded /
hidden), so it can be **diffed, explained, and migrated provably** — the prerequisite for conforming
LS at all. This is also R26's tri-state prerequisite (activated / shown / absent), left unbuilt.

---

## 6. The v1 worklist — ordered

**Scope ruling (`EXTENT-EXCAVATION §0.5`):** v1 hardens the **MSBF path** (LS + HPDM). ksi/centrum stay
working but unpolished. **Deferred ≠ forked** — one code path, no Polish branch.

**Priority ruling (Jacob, 2026-07-22):** *"I can't abide HPDM getting off on the wrong foot since it's
the only actual commercially requested map."* **HPDM is checked hardest and made right first; LS — the
progenitor — is conformed last** (it is production `lafayette-square.com` and has never been poured;
never the night before a demo).

1. **Schema split** (§5.1) — three artifacts. No PART E dependency; unblocks the rest.
2. ✅ **HPDM identity lock — DONE** (`fetch-msbf.js:179`, the per-scene registry + high-water allocator;
   verified 2026-08-04). ⛔ **The remaining half is `osm-`**: `msbf-identity.js` has one importer, so the
   OSM fetcher never got the registry and **both Polish pours are still unlocked**. Port it there.
   *(This step was the worklist's #2 and was described as "the single thing between HPDM and safe to
   hand a customer" — for HPDM it is closed; the sentence is now true of the Polish scenes instead.)*
3. **The two gate checks** (`EXTENT-EXCAVATION §0.6`) — the **membership diff** (old vs new: who
   enters/leaves and why) + the **scene-parity layer-count check** (raw OSM feature count vs `map.json`
   per layer — the detector that would've caught the park drop 63→0). Plus the served-parity guard
   (§2, already built). These make conforming *provable*, not hopeful.
4. **Retire the 19 `src/data/*` name-imports** → per-scene served path (§2.1). Closes the entire
   LS-bleed class at the root. Each import is independent — land smallest first.
5. **Conform LS, last** — pour LS through the one path → `clean/lafayette-square/{skeleton,ribbons,map}.json`,
   served like HPDM; **geometry-match `bldg-NNNN` → the locked scheme once** (anchored on lon/lat
   centroid so it survives a frame-origin shift); excise the exemptions (`scene !== 'lafayette-square'`
   at `bake-buildings.js:671`, the LS-only ledger). Gated on step 3's checks.

---

## 7. What v1 is NOT (the horizon, held but not built)

- **Face-as-membership-atom** (`EXTENT-EXCAVATION` PART C) — the Census-block idea (membership atoms =
  faces of the street graph, which we already compute via `extractFaces`). The direction is right and
  it converges with the stamp brief, but it is a rewrite; v1 does not bet the customer on it.
- **The full typed-intake UI** (§3.1's "get" buttons with typed accept-drops) — the north star for the
  Inputs tab. v1 makes the panel *state-aware* (blank/filled/sealed per scene) but need not build every
  typed uploader.
- **ksi/centrum normalization** (official rings → centerlines) — deferred (§0.5); `EXTENT-EXCAVATION`
  PART E Q2/Q5.

### 7.1 Backlog — Extent tool capabilities (Jacob, 2026-07-23)

- **Change the bb — additively OR destructively (never move).** An operator gesture in the Extent
  tool to **grow** the fetched square (add area → re-fetch the delta) or **shrink** it (destructive,
  drop the trimmed data), always **from the frozen center** (§3.3 — grow/shrink OK, moving forbidden).
  This is the "forever safety zone can be extended if you outgrow it" made a real control, and it's
  append-safe (identity preserved: new area appends, retained ids unchanged; a shrink tombstones).
- **Duplicate a map for a new version.** Fork a scene in the Extent tool into a new version — e.g. to
  **add a neighborhood to an existing map**, or spin a v2 to author against without disturbing the
  live one. First-class version of the manual `lafayette-square → lafayette-square-staging` pattern we
  did by hand this session; the swap/promote flow (§6 step 6) is its natural sibling.

---

## 8. Open questions still Jacob's (from `EXTENT-EXCAVATION` PART E — the ones this scope touches)

- **Q1 — must the boundary close?** v1 assumes yes (the disc composes against a closed ring). Flag if
  a fuzzy/open edge is ever legitimate.
- **Q4 — what does a boundary street's SIDE mean?** centerline / near frontage / both. The mechanism
  (R14 per-building) is durable; the question is what the operator's words mean. Not blocking v1.
- **Q6 — does face-enumeration-for-selection violate `fe1bb3a1`?** Only blocks the §7 horizon, not v1.

None block steps 1–4. Step 5 (LS) is gated on the step 3 checks, by ruling, not on an open question.

---

*Written 2026-07-22 (Boz), from the session that assembled this model with Jacob. Reference-kind —
keep it lean; when the design changes, change it here and repoint. Evidence lives in
`EXTENT-EXCAVATION.md`; do not duplicate it.*
