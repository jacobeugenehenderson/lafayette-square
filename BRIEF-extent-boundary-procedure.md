# BRIEF — the Extent tool: boundary-derived building inclusion

**You are a specialist brought in on ONE subsystem: the Extent tool.** The rest of this platform has reached a fairly sophisticated, reliable standard. Extent has not, and Jacob (the owner) knows it. In his words:

> *"The extent tool persists as an unfinished and shaky element in our scheme… because it's the fundamental base of everything I don't think it's totally without risk to continue without just fixing it once and for all; but of course if it were that simple I would have done it already."*

Assume the problem is genuinely hard and that the obvious fixes have been tried. Your job is the structural one.

> ⛔ **BEFORE YOU WRITE ANY CODE you must confirm alignment with Jacob and get an explicit go-ahead — see §7.** Two prior passes at this subsystem proceeded confidently on a wrong model. Reading and analysis: go ahead. Editing: not until §7 is satisfied.

---

## 0. ROUTE FIRST — this is a hard gate, not advice

`CLAUDE.md` at the repo root is a mandatory routing gate. Follow it before forming any opinion:

1. **`ORIENTATION.md`** (root) — universal first read.
2. **`README.md` §⭐ START HERE** + its cross-cutting feature index — find the Extent/intake topic; it names the home doc + existing forensics.
3. **Then the topic canon.** ⭐ **Start with `cartograph/ARCHITECTURE.md` § "The Extent tool & the Pour" — "⭐ THE PROCEDURE, as-built"** is the live home for this subsystem's doctrine. Then: `cartograph/PIPELINE.md` (the boundary clip / data-wall neuter), `cartograph/INTAKE.md §0.5`, `NEIGHBORHOOD-INPUTS.md §5.1–5.2`, `cartograph/PREBAKE.md`, `SLAB-CONTRACT.md`, `HANDOFF-boundary-trio.md`, `HANDOFF-lodz-ksiezy-mlyn.md`.

> ⛔ **THIS BRIEF IS OLDER THAN THE CANON IT POINTS AT — read this before §4.** It was written 2026-07-20 14:27. At **19:26 that same day**, `004a33e3` **retracted the excluder model across nine docs**. Two sections below were written under the retracted model and are corrected inline, but assume anything here about *membership mechanism* is five hours stale and **the canon wins**. This is not incidental: the retraction commit exists precisely because *"an agent obeying the routing gate could not avoid being told the inclusion polygon was dead — two passes were, and both reached the wrong conclusion."* You would have been the third. *(Corrected 2026-07-21.)*

**Rebuilding the model from grep + first principles when the canon already spells it out is this repo's named recurring failure.** The previous agent on this topic — and the coordinator briefing it — both got burned by exactly that. Cite what you actually read.

---

## 1. The corrected mental model (read this before the code)

Two prior analyses of this subsystem reached **wrong conclusions**. They are recorded here so you don't repeat them.

### ❌ Wrong: "the inclusion polygon is unfinished / vestigial"
### ✅ Right: the polygon is the INTENDED mechanism. The circle is what Jacob settled for.

Jacob, verbatim:

> *"The polygon isn't gone; that's the sore spot. The system needs to be able to create an encompassing area polygon from one of the methods I mentioned. It should use that polygon to include or exclude buildings… I **settled** for the circle because we couldn't get this right but here we are and it sucks and this is how and why."*

### ❌ Wrong: "hipointe-demun's polygon is a legacy artifact"
### ✅ Right: HPDM is the **EXEMPLAR** — the proof the scheme works.

Jacob:

> *"It is actually the exemplar neighborhood in that it has 4 distinct boundary streets and I have used the tools to activate individual buildings adjacent to the boundary."*

Note also: **HPDM is not an "official" neighborhood — it is two neighborhoods stacked together.** So the boundary mechanism must express operator intent, not just reproduce an administrative record.

### The two things that get conflated — keep them apart

| | **The DISC (radius)** | **The MEMBERSHIP POLYGON** |
|---|---|---|
| Job | how much world we **render** — extent, fade bands, ground mesh, tile grid | what is **in the neighborhood** — which buildings belong |
| Status | load-bearing, every scene has one, **keep it** | the intended inclusion mechanism, currently only on HPDM |

Jacob: *"We need the radius though, because that's what we render."* Do **not** propose replacing the disc.

⚠️ **The names are backwards and will mislead you.** In `neighborhood_boundary.json`, the field `boundary` is the **256-gon render disc** derived from `radius`. Membership lives in a field called `polygon`. Anyone reasoning from field names reasons wrong.

---

## 2. THE PROCEDURE Jacob wants (this is the spec)

Numbered as he gave it, with his clarifications:

1. **The operator types a name — or boundary streets separated by commas — into the initial search field.** They then re-enter those streets in the fields below.
2. **The system pulls a generous bounding box.** It will be large and contain lots we don't need. *That does not matter* — most gets carved away and only a portion is sent through.
3. **The operator finds streets on the map and enters them in the blanks**, as many as the shape needs. There are already **pulldowns** here — Jacob likes them: no typos.
4. **The system includes all the buildings in that area.** (Jacob: *"this is already how it has been at one or more points"* — so this has worked before; find out what happened to it.)
5. **The operator may add or subtract buildings** — exclusion bands for whole strips, the per-building tool for singles.
6. **Bake.** Takes the panel information + the included buildings + the radius and prebakes it into the **skeleton**. It enters the skeleton as a smaller-but-still-hairy dataset and exits smaller and polished.

**Step 4 is the "first, hopefully final, and correct" inclusion.** Step 5 is *correction*, not the mechanism. Today the situation is inverted: the pen and per-building hides ARE the mechanism, which is how one exclusion loop silently removed **147 buildings** including a landmark (see §4).

### Jacob's open idea, worth evaluating
> *"What if the system were 'Select next boundary > clicks on map'"*

i.e. the operator picks each boundary edge by clicking the feature on the map rather than (or as well as) typing/selecting a name. Evaluate this seriously — it may subsume the unnamed-feature problem below.

---

## 3. The three description modes — and the gap Jacob named

Neighborhoods are described in at least three ways, and the tool currently pretends there is one:

- **(a) A named neighborhood** — extrapolate to a boundary.
- **(b) Described by its boundary streets** — how people actually describe neighborhoods.
- **(c) Streets combined with natural / infrastructural edges** — river, railway, park edge.

Jacob explicitly flags (c) as unaccounted for: *"THIS doesn't account for neighborhoods framed by natural boundaries."*

**Research finding that sharpens (c) — the gap is not "natural", it is UNNAMED:**
- Named non-street features are already typable. The Jasień river is `name="Jasień"` in OSM; Scheibler's industrial railway is `name="Kolej Scheiblerowska"` across ~25 ways. If the blanks look up *any named way* rather than filtering to `highway=*`, rivers and railways come free with no new concept.
- **Unnamed ways are the real gap, and it is not hypothetical.** The City of Łódź's *own* district boundary for Księży Młyn (OSM relation `17367850`, `admin_level=10`) uses **unnamed service/frontage roads for its entire north and east edges**, plus four unnamed corner connectors. There is no name to type.
- **Where no feature exists at all**, someone must draw that segment. This is arguably the pen's correct job: contributing one segment to an otherwise-real ring, rather than acting as a blind excluder.

**Also relevant to (a):** for a named neighborhood, **OSM may already hold the boundary.** Księży Młyn exists as a closed 357-point admin relation. `serve.js:578–611` already has a Nominatim path that returns a polygon as a best-guess extent (`polygon_geojson=1`, takes the largest outer ring). Find out why that isn't the primary path for mode (a).

---

## 4. Verified findings from today — evidence, not the whole problem

All of these were traced against code/data on 2026-07-20. Re-verify anything you build on.

⛔ ~~**The excluder model is what's live**~~ — **RETRACTED the same day this brief was written** (`004a33e3`, 2026-07-20 19:26). **Membership = `(polygon ∪ activate) − (exclusions ∪ hide)`** — the polygon DECIDES, the disc RENDERS, and the disc is only the fallback when a scene has no polygon. `pipeline.js:246-255` had implemented this all along; what was missing was persistence plus two server paths that destroyed a polygon on sight. Applied in `pipeline.js:104–115` and `:242–254`, re-applied belt-and-suspenders in `bake-buildings.js:603–613`. **Do not build to the excluder model.**

**What a single extent edit did to Łódź** (1819 → 1640 buildings):
- **147 dropped by one exclusion loop** (including Church of St. Anne, `osm-108945966`)
- **32 dropped by hand-hides** (`building-overrides.json`)
- **0 dropped by the circle** — radius 1530 enclosed everything fetched
- The `[bake-buildings] membership: 1640 → 1640 (poly=false, excl=1, +0/−32)` log is misleading: `+N/−M` are **counts of override entries, not a delta**.

**There are no reason codes.** `pipeline.js` pre-clips raw input before deriving, so by `map.json` the excluded buildings are simply gone — no per-building record of *why*. Nothing downstream can tell the operator what their own gesture removed. This may be the deepest structural cause of the shakiness.

**Membership is reimplemented five times**: `pipeline.js:104–115`, `pipeline.js:245–256`, `bake-buildings.js:614–621`, `ExtentApp.jsx:927–936`, `neighborhood-membership.mjs:68–71` — with comments instructing future editors to keep them in sync.

**The two-tier idea is real but inconsistently adopted.** `bake-trees.js` and `bake-lamps.js` use `makeMembership` with fade/dissolve; `bake-labels.js:105` hard-cuts; **buildings don't use the shared module at all** — `pipeline.js` and `bake-buildings.js` carry private copies that know nothing about `fade`/`density`/`keep`.

**LS is exempt from the cull entirely** — `bake-buildings.js:598` gates it on `scene !== 'lafayette-square'`. Whatever you build, LS is not exercising it.

**A destructive default, now guarded (2026-07-20).** `serve.js` rescope used to DROP the inclusion polygon unconditionally, and `ExtentApp` always sends an exclusions array — so *any* extent edit silently deleted an authored boundary, even with zero loops. HPDM was one Bake away from becoming a bare circle. Now preserved unless `dropPolygon: true`, plus a `.prebak-rescope` snapshot. **The guard is not the fix** — it stops destruction, it doesn't make the polygon primary.

**Rollback is partial.** `.prebak` covers `geography.json`, boundary and `neighborhood.json` on the *first-pour* path only (`serve.js:1393`, `:1476`). Not covered: `clean/map.json`, promoted ribbons, `public/baked/<look>/**`, `content/listings.json`.

**One small bypass causes three symptoms.** `ExtentApp` calls `bakeLook` **directly** (`:1202`, `:1257`), bypassing the store's `runBake` (`useCartographStore.js:1756`), which owns the client-side `bakeRunning` lock and sets `bakeLastMs`. Consequences: (1) the Extent Bake button reports done while the bake runs — a false finish; (2) the Designer then fires a second bake and meets the server's 409; (3) `bakeLastMs` is the cache-bust token — `BakedGround.jsx:131` requests `ground.lightmap.png?t=${bakeLastMs}` — so **the browser serves a cached AO lightmap against freshly-baked geometry**. This is a small fix with a large symptom and is independent of the boundary redesign; it may be a good stage 1.

**Live, unreported:** 4 listings point at building ids absent from the baked set (`km-eat-71`, `km-eat-77`, `km-eat-78`, `km-lst-kosciol-sw-anny`). `bake-content.js:762` has an orphan check that logged it; nobody caught it.

### A worked test case, already researched
Księży Młyn's boundary, verified against live OSM — all four corners meet at **0.0 m**:
`Aleja Marszałka Józefa Piłsudskiego` → `Aleja Marszałka Edwarda Śmigłego-Rydza` → `Milionowa` → `Jana Kilińskiego` (135.1 ha; reproduces the city's own SIM district to within 12.5%).
- ⚠️ The current fetch bbox `lat_max` of 51.760 **decapitates it** — the NE corner is at 51.7614. That is why Park Źródliska, the Palmiarnia and the Museum of Cinematography fell outside. Recommended bbox: lat 51.7480–51.7625, lon 19.4670–19.4910.
- ⚠️ OSM in Łódź uses **no `ul.`/`al.` prefixes** and spells honorifics in full (`Jana Kilińskiego`, `Księdza Biskupa Wincentego Tymienieckiego`). Exact-match lookups fail otherwise.
- ⚠️ `Śmigłego-Rydza` is a **divided arterial** modelled as two one-way ways — the same corridor-weld problem the Altadena divided-road case surfaced.
- A ring that *doesn't* close is the common case: the tourist-board definition of the district fails because Magazynowa dead-ends 310 m short of Milionowa.

---

## 4b. Established since this brief was written (2026-07-21)

Four additions. The first two are requirements the brief never stated; the third is a correction to a claim a coordinator pass invented; the fourth is a live defect.

- **⭐ STREET NAMES COME FROM THE FETCH.** The boundary can only be authored *after* step 2's fetch, because the vocabulary it is spoken in does not exist before then. The search sizes a generous envelope; **it does not know the neighborhood.** Any design that reasons about the boundary before the fetch is reasoning about data that hasn't been pulled. (This is why §2's ordering is not arbitrary.)
- **⭐ TWO CENTERPOINTS, which must not be collapsed.** The generous envelope of §2.2 and the hood discovered in §2.3–4 do not share a center and never will. **Fetch center** = envelope midpoint, becomes the frame origin, **frozen at commit** (moving it runs `reproject-raw`, rebuilds the skeleton, renumbers `segOrd`, and strands the x/z-only tree census — nothing reprojects it). **Hood center** = the kept-buildings centroid; a *value, not a frame*, so it is free to recompute every bake. **Once membership correctly isolates the hood, the kept buildings are an off-center cluster inside the envelope — that is expected, not a defect.** The disc must be drawn on the hood center. Today it cannot be: `ExtentApp.jsx:1247` computes `keptCenter` correctly and draws the disc on it, then **short-circuits to `{x:0,z:0}` when `committed`** (`:1248`); and `makeCircleBoundary` (`serve.js:612`) **hardcodes `center: [0,0]`**, so the artifact cannot carry a hood center even when one is known. ⚠️ Suspected same root as the open **3D Browse framing** bug ("too high and slightly to the left").
- **⛔ DO NOT invent a per-street "SIDE" property.** A 2026-07-21 coordinator pass proposed one, reasoning that HPDM's far-side-of-the-southern-street frontage is carried by 16 `activate` overrides that "must be re-picked whenever the polygon is re-derived." **That premise is false.** `building-overrides.json` is written only by `POST /<scene>/building-overrides` (`serve.js:1099`); `pipeline.js:96,:233` and `bake-buildings.js:674` only *read* it, and nothing in the pour or bake regenerates it. **Overrides survive a polygon re-derive** — re-authoring HPDM's borders costs zero of the 16 picks. §2.5 correction is the mechanism and it is durable by design. *(The one real gap, sized correctly: the pen carves **exclusion** loops only — `ExtentApp.jsx:1085` has `exclusionsLL` with no inclusion counterpart — so pulling in a run of far-side frontage is 16 clicks rather than one band. A gesture to add to an existing mechanism, not a new concept.)*
- **A destructive path that the listings guard only half-covers.** `bake-content.js:750-767` protects `content/listings.json` from being regenerated out from under hand-authored records — but **only when `listings.overrides.json` declares `meta.baseSource`**. Verified: `hipointe-demun` does **not** declare it, so HPDM's 192 listings regenerate from the OSM join on every bake, and place cards whose anchor building leaves the baked set are dropped with only a console line (`bake-content.js:554`). The guard was added after an Extent edit took Łódź from 84 → 5 listings.

## 5. Constraints

- **Do not clobber existing scenes.** Jacob: *"we have to be careful to not clobber them, AND we need to eventually migrate everything to the same scheme so we can stop this."* Current state (re-verified 2026-07-21): **`hipointe-demun` 4-pt polygon · `centrum` 815-pt polygon** (a freehand pen trace, not street-derived — the two are different in kind and the brief's original "only HPDM has one" is stale). `lafayette-square`, `ksi-y-m-yn`, `altadena`, `toy` have none.
- **Migration is required eventually** — but any plan that re-pours an existing scene must say so loudly, and must be verifiable. Consider proposing a **membership-diff** capability (same scene, old scheme vs new, which buildings enter and leave, and why) — without it, migration is hopeful rather than provable.
- **No big-bang rewrite.** This is load-bearing for every scene. Stages must be independently shippable and independently verifiable.
- **Keep the disc.** It is what renders.
- **The repo prefers excising vestigial paths to accreting new ones.** Say what you would DELETE.

---

## 6. What to deliver

1. **A map of the subsystem as it actually is** — operator gesture → boundary → pour → bake → skeleton → slab, naming real functions, endpoints and persisted files.
2. **A structural diagnosis** — why it stays shaky, grounded in code you read, with file:line. Label inference as inference.
3. **A design** implementing §2's procedure, handling all three description modes in §3, including unnamed and drawn edges, and saying what the single source of truth for the boundary is.
4. **A staged plan** — ordered, lowest-risk first, each stage independently verifiable, with what could break and how you'd prove it didn't.
5. **What you would delete.**
6. **Open questions for Jacob** where the call is a product decision, not an engineering one.

---

## 7. ⛔ CONFIRM ALIGNMENT BEFORE YOU WRITE ANY CODE

**This is a hard gate. Jacob's instruction, verbatim: *"the agent must confirm alignment before they start coding."*** It exists because two prior passes at this subsystem proceeded confidently on a wrong model, and one of them fed the wrong model to the next.

Before touching a single file, write back a **statement of alignment** and wait for Jacob's explicit go-ahead. It must demonstrate — in your own words, not by quoting this brief — that you have the scheme right:

1. **The disc vs the polygon.** What each is for, which one renders, which one decides membership, and why the disc stays.
2. **The procedure**, restated as the sequence you intend to implement, including what happens at Bake and what enters and leaves the skeleton.
3. **Where inclusion actually happens today vs where it should happen** — and why that inversion is the defect rather than a missing feature.
4. **How you'll handle all three description modes**, including the unnamed-edge case and the draw-a-segment case.
5. **Your read on "select next boundary → click on map"** — whether it replaces, complements, or subsumes the typed/pulldown path.
6. **What could break in each existing scene** (`lafayette-square`, `hipointe-demun`, `altadena`, `ksi-y-m-yn`, `toy`) and how you'd know before shipping.
7. **Anything in this brief you think is WRONG.** The brief is a coordinator's compression of a long session and contains at least one thing nobody has verified. Say what you'd check first. Disagreement here is more useful than agreement.

Then propose the staged plan and get it agreed. **Do not write code until Jacob has said go.** That is this repo's standing rule (`CLAUDE.md` §"Standup before code"), and it applies to you with particular force: this subsystem is the foundation every scene rests on.
