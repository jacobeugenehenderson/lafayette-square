# EXTENT — excavation, audit, prior art, reconciliation

> ⭐ **THIS IS THE EVIDENCE LAYER. The design of record is [`EXTENT-DESIGN.md`](EXTENT-DESIGN.md)** (ratified with Jacob 2026-07-22) — read that for *what we decided*; read this for *why we know it*. Every claim in the design traces back here. If the two ever disagree, the design wins and this file gets a pointer, never a silent edit. As-built engineering: `cartograph/ARCHITECTURE.md §Extent`; as-built operator flow: `cartograph/INTAKE.md §0.5`.

**Agent: Marl.** Fresh, single-subsystem pass. No production code written; no file modified but this one. Two throwaway scripts in `scratch/` (`marl-extent-invariants.mjs`, `marl-ksi-polygon-cost.mjs`, `marl-galeria-check.mjs`).

**Read order followed as mandated** (§1 → §2 → §3 → §4 → *then* §5): `CLAUDE.md` → `ORIENTATION.md` → `README.md §⭐ START HERE` → `cartograph/ARCHITECTURE.md §"The Extent tool & the Pour" → ⭐THE PROCEDURE, as-built`. Then the excavation sweeps, the code audit, and the prior-art survey. `BRIEF-extent-boundary-procedure.md` was read **last**, after §§2–4 were drafted.

> ⚠️ **The seal in §5 was already broken by §1.** The brief's own routing gate (§1.3) makes `cartograph/ARCHITECTURE.md §Extent` a *mandatory* first read; §5 then seals that same section. It is not sealable — it is the live doctrinal home, and it now contains the self-tensing-circle, planet-ground-plane, shown-vs-activated, two-centerpoints and rationale-expiry material. I read it at §1 as instructed. **What was genuinely sealed from me, and stayed sealed, was `BRIEF-extent-boundary-procedure.md`** — and reading it last did work: three of my findings below contradict or extend it. Recommend the next brief seal *only the prior brief*, and say so.

---

# PART 0 — ⭐ THE SPEC

**Ruled by Jacob, 2026-07-21, in conversation. This is not a finding, a proposal, or an inference — it is the spec, and it governs everything below it.** Prior passes re-derived this instead of building from it; do not repeat that.

> ## **The boundary is a ring of streets or named features. Those line segments must eventually create a polygon.**

The polygon is the **output**. The ring of named segments is the **artifact**. Corners fall out of the walk; they are never placed.

## 0.1 The two-pass fetch

The single change that makes the rest affordable: **stop fetching everything up front.**

| | **LIGHT pass — at Search** | **HEAVY pass — at Bake** |
|---|---|---|
| scoped to | the generous envelope | the square containing the **disc**, + padding |
| purpose | author the boundary | pour the neighborhood |
| reversible | yes — cheap, re-runnable | this is now the irreversible step |

**Why this order.** All you need to author a boundary is chains, names, and enough painted fabric to see the place. Everything else — parcels, land use, tags, heights, materials, POIs — is pour material, and fetching it before you know what you want is why a generous envelope is expensive today. Defer it and generosity becomes free.

**Consequence — "frame tighter than feels natural" is dead.** It was always a vestige of the era when the whole fetch rode through the pipeline (see X2), and it fights the requirement that the envelope be safely too big. Under the two-pass split it has no premise left.

**Consequence — `bbox ⊇ disc` becomes true by construction.** Today the box is framed *before* the disc is known, which is why Altadena's disc runs 981 m past its own data and LS's runs 226 m (D1). If the heavy fetch is derived from the disc, the invariant is not a check to add — it stops being expressible.

## 0.2 The line — what the LIGHT pass keeps

**KEEPS**
- **Chains, names, junctions** → `clean/street-index.json` (built by `skeleton.js --index`). ⚠️ **Present for only 2 of 6 scenes** (`centrum` 2.0 MB, `lafayette-square-staging` 0.3 MB) — absent for `lafayette-square`, `hipointe-demun`, `altadena`, `ksi-y-m-yn`. The two-pass SOFT-fetch design here and PART C's face-enumeration both assume it is a per-scene given; it is not. *(Re-checked 2026-08-04.)* This is the vocabulary; nothing can be named before it exists.
- **OSM query 1, NARROWED to** `highway` + `waterway` + `railway` + `boundary` — the named linear features a boundary can run along.
- **The building source this pour will use, painted** — MSBF where it exists, OSM buildings where it doesn't.

**DROPS to the heavy pass**
- OSM query 1's bulk: `landuse`, `leisure`, `amenity`, `surface`, `man_made`, `barrier`, `natural`
- parcels · land use · POIs · trees · lamps
- building tags: heights, `building:levels`, materials, roof shapes, addresses
- every derive step

**Sizing, measured.** `osm.json` is the monster — 43.1 MB (HPDM), 63.4 MB (ksi), **121 MB (centrum)** — and it is large because of the tagged ground features, not the buildings. `msbf.json` is 9.1 / 32.2 MB and is *already* pure geometry. Narrowing query 1 is where the saving is. *(Free extra: `fetch.js:209` writes `JSON.stringify(output, null, 2)` — pretty-printed.)*

⛔ **Buildings must be PAINTED, at today's fidelity or better.** `ExtentApp.jsx:466` renders every MSBF footprint; `:552` paints them high-contrast violet because **the aerial alone is not legible enough to judge an edge against**. Substituting OSM for MSBF would cost HPDM 28% of its painted fabric (7,142 vs 9,880) — a fidelity regression at exactly the place the operator is looking. **Sequence the MSBF fetch into the light pass.** It is cheap; it is not the thing to defer.

*Same family as the archived "you can't visually select a boundary you can't read" finding (R2 / re-homing loss) — one layer down.*

**Bonus: this kills the preview/slab divergence.** Paint the source you pour, and they agree by construction rather than by a rule about not persisting derived numbers.

## 0.3 The seed — place name OR comma-separated postal codes

When Nominatim has no usable hood (the normal case — R7), the operator names the **postal codes that enclose the hood**, plural. Union them, pad, square, fetch light.

⚠️ **This does NOT revive what `c8ef2949` retired.** That objection — *"a hood spans several ZIPs; a ZIP spans several hoods"* — was against ZIP as a **boundary** seed. This is ZIP as an **envelope** seed: spanning several is fine if you name them all, and containing several hoods is fine because the envelope is *supposed* to be too big. Different job; the objection does not reach it.

*Between this and today:* `geocodeZip` (`api.js:67`) returns a **centroid**, not an extent, and hits `api.zippopotam.us/us/` — a hardcoded-US network dependency, against the local-files rule (R24). Census ZCTA polygons are a free bulk download and would satisfy R24 better than the current place search. Postal-code geometry outside the US is patchy — this is **one seed among several, not the seed.**

## 0.4 Padding and squaring

- **The heavy fetch must cover the DISC, not the polygon.** The shown tier (R26) lives in the band *between* polygon and rim — stop at the polygon and that band was never acquired.
- **Padding % on top of the disc** is headroom to grow the boundary later without re-fetching. That is what makes the living boundary (R15) actually free.
- **A closing check — "how much of this did we end up using?"** — pares the bulk and turns the padding from a guessed constant into a measured one.
- **Square in METRES, both passes.** The light pass squares because the hood's shape is unknown; the heavy pass squares because the disc is a circle and a circle cannot fit a rectangle narrower than its diameter. A lat/lon square is oblong on the ground everywhere but the equator.

## 0.5 Scope — v1 is the MSBF path

**Księży Młyn and Centrum are explicitly out of scope for v1.** They were gestures to Pawel and served their purpose as the portability proof. LS and HPDM are the hoods that must be right.

⚠️ **Deferred ≠ forked.** This is a scope decision, not a second code path — `feedback_no_parallel_pipeline_for_scenes` ("a scene is a dataset, not a branch") still binds, and a Polish-hoods branch would be exactly the palimpsest this repo keeps paying to remove. The only real variance is **which building source the pour uses**, and that is already data-driven (`pipeline.js:76-83` prefers MSBF, falls through to OSM). v1 exercises and hardens the MSBF path; the OSM-source path stays working but unpolished.

## 0.6 ⭐ CONFORM, DON'T PROTECT — R22 is overturned

**Ruled by Jacob, 2026-07-21:** *"We purposefully put the protection regime on there but I think we need to just be brave and deliberate."*

**"Lafayette Square must stay byte-identical" (R22) is retired.** LS and HPDM are to be **conformed to the tool**, not exempted from it. Fix the Extent tool first, then pour both through it.

**Why the protection regime became the disease.** LS's own `neighborhood.json` says it: *"BACKFILL (not poured): LS predates the Extent tool… The bake was NOT re-run."* So **every LS hardwire protects LS from a pipeline LS has never run.** The exemptions do not defend a known incompatibility — they defend an untested assumption, and each new one exists because the previous one made LS look special. That is circular, and conforming LS is what breaks it. Most of the nine sites in D11 dissolve on their own once LS carries a polygon.

**The worked example, and the general warning.** The authored 4-corner `park-polygon.json` was defended in-code on the grounds that OSM's 41-vertex park trace produces dirty corner plugs. Jacob disputed it: *"LS is made of 4 barrier streets but the system was not working as well back then."* He is right, and the evidence is threefold — the file is dated **2026-05-14**, predating the tile model, junction-protected RDP and the corner machinery; `ARCHITECTURE.md:326` already asserts that resolving onto centerlines takes **Księży Młyn's 357 vertices down to 4 corners**; and LS's four boundary streets are *already recorded* (`sides: [Chouteau Avenue, South Jefferson Avenue, Lafayette Avenue, Truman Parkway]`), so conforming it is not a research project.

⚠️ **This is the sixth expired rationale in this subsystem (A3), and this pass walked into it** — read the comment, accepted its stated reason, never asked whether the reason still held. **A code comment explaining WHY is evidence of a past decision, not proof of a present constraint. Check the file date.**

**⛔ The deliberate half — what "brave" must not mean.** The protection regime was standing in for a **verification we do not have**. It said: *we cannot tell whether a change breaks LS, so freeze LS.* Removing the freeze without supplying the missing check is not brave, it is blind. Per Jacob's own prior instruction (`BRIEF-extent-boundary-procedure.md:149`): *"any plan that re-pours an existing scene must say so loudly, and must be verifiable… without it, migration is hopeful rather than provable."*

So conforming LS is gated on **two checks that do not exist yet**, both cheap:

1. **A membership diff** — same scene, old scheme vs new: which buildings enter, which leave, and why. This is what makes a re-pour provable instead of hopeful.
2. **A scene-parity check on layer counts** — raw OSM feature count vs `map.json` count, per layer, per scene. A layer LS keeps and a poured scene drops to ~zero is a hardwire by definition. This would have caught the park drop (63 → 0) the day it landed, without anyone knowing parks were the thing to look for. It is the detector the repo's own doctrine calls for (`POLYGON-FIRST §5`, *"let the machine catch the bugs… that checker is the real prize"*), and it is why the next removal campaign will succeed where the previous ones did not.

**Sequence, ruled:** fix the tool → build the two checks → conform HPDM → conform LS. **LS is production (`lafayette-square.com`) and has never been poured; it is conformed last, and never the night before a demo.**

## 0.7 Between this spec and today

1. **We compute the ring and throw it away.** `computeBoundaryFromSelection` walks the runs, derives corners, persists only corners + bare name strings. *The segments never reach disk.* **This is the foundation — the rest are small beside it.**
2. **The resolver takes whole streets only** — no partial runs, which is the common case in a city centre (R27, `BRIEF-boundary-partial-edges.md`).
3. **The feature lookup filters to `highway=*`** — named rivers and railways are excluded by a filter, not by a missing concept.
4. **`railway` is not in the Overpass query at all** (`fetch.js:85-100`). Kolej Scheiblerowska was never fetched, so removing the filter alone would not surface it. Two fixes, not one; both cheap.
5. **Genuinely unnamed segments** — Łódź's own district boundary uses unnamed service roads for two entire edges. The only part needing a new gesture: contributing one drawn segment to an otherwise-real ring.

## 0.8 ⭐ THE SEQUENCE, THE LOCK, AND WHERE IDENTITY IS MINTED (Jacob, 2026-07-22)

Ratifies §0.1 and adds the three pieces it does not carry. **The nomenclature is Jacob's, verbatim:**

> *"We soft fetch, edit, hard fetch permanently fixes the soft fetch and bakes the skeleton with either inputs **or** channels for inputs."*

| Step | What it does |
|---|---|
| **SOFT fetch** | §0.1's light pass — generous envelope; chains, names, junctions, **painted footprints** |
| **EDIT** | author the boundary runs, corners, exclusions, `activate`/`hide` |
| **HARD fetch** | ① **permanently fixes the soft fetch** ② **bakes the skeleton** ③ with inputs **or channels for** inputs |

**① The lock — the hard fetch freezes the soft fetch, permanently.** §0.1 says the heavy pass "is now the irreversible step"; this is stronger and more useful — it is irreversible *because it locks its input*. Nothing about the envelope, the frame origin, or the street vocabulary may move afterward.

⚠️ **NAME COLLISION — do not merge these.** `SourcesPanel.jsx:86` already uses `locked` for *"chosen for you by region — nothing to supply"* (MSBF in the US, OSM in Europe): immutable **by governance**. This lock is immutable **by sequence**. Two axes, one word. Name the new one distinctly (`sealed`/`committed`) before both ship, or the next reader merges them.

**⭐ ② The lock is what makes building identity stable.** ✅ **BUILT for `msbf-` (`fetch-msbf.js:179`)** — a per-scene registry + high-water allocator: an existing footprint keeps its permanent `msbfId`, an unseen one appends at `highWater+1`, **nothing is renumbered**, with a coincident-centroid collision warning. ⛔ **NOT built for `osm-`**: `msbf-identity.js` has exactly one importer, so the OSM fetcher never received it and **both Polish pours remain unlocked**. *(Verified 2026-08-04. The paragraph below described `msbfId: i` = fetch array index as the live state — that was true when written and is now history for msbf-, live for osm-.)* Under the old scheme a re-fetch **renumbered every building**, and every listing, logo, place card and `activate`/`hide` entry silently re-pointed — with no error. This is the **identity instance of PART D's structural finding** (*"membership is computed, never recorded… a re-fetch silently changes answers"*): membership is not recorded, and neither is identity. Both are re-derived from fetch order.

**The lock fixes it by construction.** Once the soft fetch is frozen, a fetch ordinal is a legitimate permanent key — there is no second fetch that can renumber it. **The lock IS the registry.** Consequences:
- **Identity is minted in the SOFT pass, not the prebake** — because §0.2 puts MSBF footprints in the light pass (you must see them to judge an edge). The prebake and every baker already just carry it (`derive.js:4703`, `bake-buildings.js:66`, `bake-content.js:126`); that part is correct and needs no change.
- **After the lock, augmentation is strictly APPEND.** Activate a perimeter building later → it takes a fresh number. Nothing is ever renumbered. An allocator with a persisted high-water mark, never an array index.
- ⚠️ **LS is on a third namespace.** LS carries `bldg-NNNN` (0019–1726 for 1,082 survivors — ordinals from an original ~1,727-feature ingest, with gaps). **Nothing in `cartograph/*.js` mints `bldg-` at all** — it is from an ingest path that no longer exists. HPDM uses `msbf-NNNN`. Verified end-to-end: the id *does* reach the slab intact (1,082 → 1,082, `id` preserved in `public/baked/lafayette-square/buildings.json`), so the thread exists; it is the *stability* that does not. Conforming LS (§0.6) must therefore **geometry-match `bldg-NNNN` into the new locked scheme, once** — anchored on lon/lat centroid, not `x`/`z`, so it survives a frame-origin shift too. That migration is the identity half of §0.6's check #1 (the membership diff), and it is throwaway: after the lock, nothing needs it again.

**③ Channels — the hard fetch does NOT block on missing inputs.** An input that has not arrived becomes a **declared channel**, and the skeleton bakes anyway. The mechanism already exists and needs no new surface: `SourcesPanel`'s three actions are `FETCH` (an endpoint exists) · `DOC` (a written procedure) · `OWED` (⚠ *"the procedure exists only in someone's head"*) — and the panel is mounted from **both** the Extent and the Stage/Cartograph toolbars (`ExtentApp.jsx:44,1839`), which is the "inputs pane in the extent and in the cartographer." What is new is only the rule: **`owed` rows outstanding do not gate the hard fetch.**

**⚠️ The cost of the lock, and its one mitigation.** Locking makes the soft fetch's *mistakes* permanent — a too-small envelope or a wrong frame origin becomes unfixable without starting over. So §0.4's padding is no longer merely nice: **under the lock it is the only future headroom that exists.** It must be generous, and §0.4's closing check ("how much of this did we end up using?") is what keeps it from being a guessed constant forever. Two invariants the lock gate must enforce, both already named here: **`bbox ⊇ disc + padding`** (§0.1, today violated — Altadena 981 m, LS 226 m) and **the frame origin frozen** (R10's two centerpoints — note D4 finds the code currently forces them equal).

---

## PART A — THE EXCAVATION

Requirements and methods are in separate lists, as required. Confidence: **(a)** Jacob verbatim · **(b)** prior agent/coordinator assertion · **(c)** unattributed.

### A1. REQUIREMENTS — what must be TRUE, and why

The root definition, which everything else inherits:

| # | Requirement (what must be true / why) | Provenance | Status | ⭐ Rationale status | Operator surface | Conf |
|---|---|---|---|---|---|---|
| **R1** | **A neighborhood is a collection of buildings/structures connected by people-run accounts.** Hard surfaces describe it; soft contents enliven it. | `dc35c2df` 2026-07-21; `ORIENTATION.md:54`; `ARCHITECTURE.md:307` | **LIVE — root** | Holds. New. | — (definition) | **(a)** |
| **R2** | **Losing soft contents outranks losing geometry.** A bake that takes listings 84→5 is not a content bug — it is the neighborhood dying. | `dc35c2df`; `ORIENTATION.md:54` | LIVE | Holds (inherits R1) | none | (b) |
| **R3** | **The boundary and the membership mutually determine — do not resolve into a hierarchy in either direction.** *"It's a self-tensing circle… the boundary isn't everything but it also is."* | `57dac5f4` 2026-07-21; `ARCHITECTURE.md:311` | **LIVE — supersedes `dc35c2df`'s "membership primary" by 9 min** | Holds | — | **(a)** |
| **R4** | **The disc is the ground plane — the hood is a planet, its rim is the horizon.** So hood centroid and disc centroid are linked; an off-center disc is world-breaking, not cosmetic. | `57dac5f4`; `ARCHITECTURE.md:317` | LIVE | Holds. Only *principled* (non-perf, non-ergonomic) rationale ever given for the circle. | none | **(a)** |
| **R5** | **We need the radius, because that's what we render. Do not propose replacing the disc.** | `BRIEF-extent-boundary-procedure.md:54` | LIVE | Holds, now upgraded by R4 from "we render it" to "it is the world" | radius handle ✅ | **(a)** |
| **R6** | **The polygon is the INTENDED membership mechanism. The circle was a concession.** *"I settled for the circle because we couldn't get this right… it sucks and this is how and why."* | `BRIEF-extent-boundary-procedure.md:36`; `INTAKE.md:33` | LIVE | Holds — **highest-authority statement in the corpus on this question** | polygon authorable ✅ (2026-07-20) | **(a)** |
| **R7** | **The gazetteer is a hint, never a requirement.** The invented hood (HPDM = two areas someone joined) is the *normal* case, not an error path. Street selection must work from zero. | `ec13e103`; `ARCHITECTURE.md:321` | LIVE | Holds | ✅ three equivalent entries | (b) |
| **R8** | **A bad boundary is worse than none.** "DeMun" falls through to `leisure=park`; handing the operator a park as their neighborhood is worse than an empty answer. | `db3078b2` 2026-07-20 | LIVE | Holds | gate ✅ (`cls`/`kind` shown) | (b) |
| **R9** | **Street names come FROM the fetch** — the boundary can only be authored after the data lands. Reasoning about it earlier is reasoning about data that does not exist. | `ec13e103`; `ARCHITECTURE.md:319`; orig. `scratch/BUILDLOG-extent-concerted.md:7-11` | LIVE | Holds | ordering enforced ✅ | (b) from **(a)** standup |
| **R10** | **Two centerpoints, never collapsed.** Fetch center = frame origin, frozen at commit. Hood center = kept-buildings centroid, a *value*. A correctly-isolated hood sits off-center; that is expected. | `ec13e103`; `ARCHITECTURE.md:354` | LIVE | Holds | ❌ **none — and the code forces them equal (D4)** | (b) |
| **R11** | **Order-independence is mandatory.** *"the 'order' of the bands has been an issue… it reads as brittle."* Corners are a by-product of the walk, never the method. | `55df128a` 2026-07-20 | LIVE | Holds | ✅ | **(a)** |
| **R12** | **A neighborhood doesn't cut a house or block in half.** | `BRIEF-boundary-partial-edges.md:34` | LIVE | Holds — but see **PART D**: centerline rings make this true of *blocks* and false of *frontage* | — | **(a)** |
| **R13** | **Everything is a best guess; everything is overridable. Override is first-class at every layer, never debt.** | `NEIGHBORHOOD-INPUTS.md:15`, Jacob 2026-07-02 | LIVE — governing | Holds | ✅ | **(a)** |
| **R14** | **Per-building correction is first-class and durable** — geometry is a proxy for the account relation and proxies fail at the margin. "Honorary Hood Residents." | `ARCHITECTURE.md:329`; `INTAKE.md:28`; `3217b711` | LIVE | Holds. **Verified true**: `osm-39524935` = Galeria Łódzka, activated, carries exactly **22 of 84** listings. | ✅ click-a-footprint | **(a)** phrase |
| **R15** | **The boundary is living** — re-editable forever; acquisition + bake must be re-runnable against a changed extent. "Keep fixing across sessions." | `NEIGHBORHOOD-INPUTS.md:323`; `_archive/…extent-pen:40` | LIVE | Holds | ✅ | (b) |
| **R16** | **Anything the operator can SEE must survive a reload.** (An HMR remount silently destroyed an 815-pt Centrum boundary mid-session.) | `49ed7654` 2026-07-20 | LIVE | Holds | ✅ debounced draft | (b) |
| **R17** | **The authoring surface must show the full raw fetch** — every building available to add or subtract. Perf may not be traded against this. | `a2d9aebb` 2026-07-14 (reverting `898ca119` 9 min later) | LIVE | Holds | ✅ | (c) |
| **R18** | **Membership curation must survive a clean re-bake** — `building-overrides.json` and `neighborhood_boundary.json` are git-tracked on purpose. | `NOTES.md:51`; `NEIGHBORHOOD-INPUTS.md:222` | LIVE | Holds | ✅ (`.gitignore` excepts) | (b) |
| **R19** | **`map.json` is the single filtered source** the 2D Designer and the bake both inherit. | `PIPELINE.md:64`; `20cd2c1d` | LIVE | Holds — **but violated for LS (D7)** | — | (b) |
| **R20** | **The Extent preview and the baked slab must agree.** | latent in `24323ab2`; enforced `ExtentApp.jsx:1164` | LIVE | Holds — **violated today for LS and every no-polygon committed scene (D4)** | — | (b) |
| **R21** | **Installation-agnostic** — no St. Louis defaults, no hood named in shared code. A drop-in town uses the same tool, zero kit edits. | `INTAKE.md:40`; `_archive/…concerted:85` | LIVE | Holds | — | (b) |
| **R22** | ~~**Lafayette Square must stay byte-identical.**~~ | `_archive/…perimeter-builder:78`; `_archive/…concerted:86` | ⛔ **OVERTURNED 2026-07-21 — see §0.6.** Jacob: *"we purposefully put the protection regime on there but I think we need to just be brave and deliberate."* **Conform LS, don't exempt it.** | **EXPIRED.** It protected LS from a pipeline LS has never run, and justified all nine hardwires in D11 | — | **(a)** |
| **R23** | **Never geocode for geometry.** An admin polygon is not a neighborhood (Altadena CDP ≈ 2× the real hood). Search is the fetch bootstrap only. | `1afb8253`; `PIPELINE.md:52` | LIVE | Holds | — | (b) |
| **R24** | **Every input is a local file; a pour must be reproducible with the network unplugged.** *"lighthearted enmity"* with corporate dependencies. | `4929a92b`; `BRIEF-intake-manifest.md:141` | LIVE | Holds — **constrains any prior-art adoption (PART D)** | — | **(a)** |
| **R25** | **Failure must be legible.** A street that doesn't close goes amber *on the map*, and the panel says why in the resolver's own terms (dangling / interior). | `1f6a70bd`; `FEATURES.md:15` | LIVE | Holds | ✅ | (b) |
| **R26** | **Membership may want to be TRI-STATE** — activated (extruded, clickable) / shown (flat stamp, operator colour) / absent. | `3ec82ef6` 2026-07-21; `ARCHITECTURE.md:332` | **LIVE, NEW, unbuilt** | New — flagged never previously raised | ❌ none | **(a)** |
| **R27** | **The boundary must be able to be a partial length of a street** — the common case in a real city centre. | `BRIEF-boundary-partial-edges.md:3` | **LIVE, unbuilt** | Holds | ❌ none | (b) |
| **R28** | **Descriptive border-street metadata is NOT geometry** — it exists for SEO/description; a mislabel is cosmetic and must never touch membership. | `_archive/…perimeter-builder:70`; `_archive/…extent-pen:48` | **⚠️ RE-HOMING LOSS** — stated in no live doc | Holds | ❌ | **(a)** rationale |
| **R29** | **Divided roads weld in the SKELETON, never in the boundary resolver.** A resolver tolerance knob papers over a source defect. | `_archive/…concerted:88` | **⚠️ RE-HOMING LOSS** — the *method* is homed (`SKELETON.md:95`); the **prohibition is not** | Holds, and live-relevant: the resolver is now the mechanism | — | (b) |
| **R30** | **Snap stores a coordinate, never a node reference — a re-derived skeleton must not move an authored corner.** | `_archive/…extent-pen:30` | **⚠️ RE-HOMING LOSS** | ⚠️ **This one I would re-open — see PART D.** It is the exact opposite of the prior art's unanimous answer. | — | (b) |
| **R31** | **Density cannot isolate the hood** — the symmetric bbox is full of neighbour towns. Rules out an entire solution class. | `_archive/…perimeter-builder:21` | **⚠️ RE-HOMING LOSS** | Holds | — | (b) |
| **R32** | **A degree-2 cycle resolver cannot close a real perimeter** — long arterials share junctions with 5–6 other picked streets → "interior". *"Three attempts confirmed it's the closure model, not the picks."* | `_archive/…extent-finish:19`; `scratch/altadena-boundary-snaproute.cjs:4-11` | **⚠️ RE-HOMING LOSS — highest-risk of all of them** | Holds, and **still unfixed**: `BRIEF-boundary-partial-edges.md:15` reports Piotrkowska/centrum failing the same way today | — | (b), measured |

> **⭐ On R32.** The current mechanism is a junction-based resolver. The forensic explaining why the *previous* junction-based resolver failed exists only in `cartograph/_archive/`. That is the single most dangerous re-homing loss in this corpus: it is the one a future pass is most likely to rediscover by spending a session on it.

### A2. METHODS — how we currently do it (kept separate on purpose)

Search sizes a square envelope (place bbox + 1000 m, squared **in metres**) · fetch is the one irreversible step and produces the street **index**, not the skeleton · boundary authored as a set of named street **runs**, three equivalent entries (click / pulldown / text) · corners = junctions consecutive runs share · exclusion loops via `BezierPen`, lon/lat anchors · per-building `activate`/`hide` → `building-overrides.json` · `commit-extent` re-centers (>100 m) → `reproject-raw` → `skeleton.js` · `makeDiscRecord` (`boundaryRecords.mjs`) writes a 256-gon · `pipeline.js` pre-clips raw input then derives then clips again · `bake-buildings.js` re-applies membership.

**None of these is a requirement.** Each is our answer to one, and several are the answer to a requirement whose reason has since expired.

### A3. ⭐ EXPIRED RATIONALES — the openings

These are requirements that are **live** (never retracted, still enforced) whose **reason is dead**. This is the failure mode the subsystem keeps paying for, and I found five.

| # | The rule, still enforced | Its stated reason | Why the reason has expired |
|---|---|---|---|
| **X1** | **The two-region dissolve** (`neighborhood-membership.mjs`) — literal inside, thinned outside | *"outside, inside the radius, we watch for GPU"* (Jacob, 2026-07-15) | Jacob, 2026-07-21: trees are optimized, *"I don't think we're in the GPU emergency we were before."* A **performance concession read as design doctrine.** And it has no operator surface at all. ⚠️ **Worse than reported — see D3: the code does not implement the rule its own docstring states.** |
| **X2** | **"Frame TIGHTER than feels natural"** (`INTAKE.md:40`, `OPERATIONS.md:18`) | Wide fetches made huge artifacts / OOM'd the pour | `1d8b3d05` states it plainly: *"a pre-exclusion vestige from when the whole fetch rode through the pipeline."* The real bottleneck is derive-before-clip, still open. **The advice now actively fights R9** (fetch generously so the unknown hood fits) and caused Księży Młyn's decapitated bbox. Retired "in spirit," never retired in the docs the operator reads. |
| **X3** | **Drop the inclusion polygon on re-bake** (`24323ab2`) | Altadena's stale 628-pt snap-route ring clipped wrongly | Altadena carries **no polygon** — verified on disk. The fix outlived its cause by six days and became the destruction surface that left HPDM one Bake from a bare circle. **Textbook.** (Now gated behind `dropPolygon`.) |
| **X4** | **⛔ "Do not build an instant re-membership lane that re-clips against the frozen frame with no re-center"** (`_archive/…extent-pen:55`) | Jacob's *prediction*, 2026-07-12: *"large post-commit swings won't happen in practice"* | A prediction is not a principle. And **we built it anyway** — `/rescope` is exactly that lane (`OPERATIONS.md:23`). The prohibition is unhomed and silently violated; nobody noticed because the reason was never a reason. |
| **X5** | **`scene !== 'lafayette-square'` membership exemption** (`bake-buildings.js:671`) | R22, "LS must stay byte-identical" | Byte-identity is achievable *with* the cull — LS has zero overrides and no polygon, so the cull is a no-op for it. The hardwire buys nothing and costs D7. `bake-buildings.js:141` already declares this hardwire "retired"; **:671 didn't get the message.** |

---

## PART B — THE AUDIT

### B1 (§3a). The subsystem as it actually is

```
operator gesture                    persisted                       consumed by
─────────────────────────────────────────────────────────────────────────────────
geocodePlace (serve.js:578)     →  (transient: bbox + official ring)
frame + Fetch                   →  geography.json {lat,lon,bbox}    ⛔ IRREVERSIBLE
  POST /:scene/fetch-extent        raw/osm.json, msbf.json, parcels
  → skeleton.js --index            clean/street-index.json          street-names endpoint
pick boundary streets           →  neighborhood.json.polygon (lon/lat, draft)
  computeBoundaryFromSelection
draw exclusions (BezierPen)     →  neighborhood.json.exclusions (lon/lat)
click footprints                →  building-overrides.json {activate,hide}   ← INDEPENDENT FILE
Bake → POST /commit-extent      →  neighborhood_boundary.json  ⟵ makeDiscRecord({radius, center, prior})
  (>100 m: reproject-raw+skeleton)    {center, radius, fade, streetFade, boundary[256], polygon?}
  POST /rescope (committed path)  →  same file, .prebak-rescope snapshot
POST /pour → pipeline.js        →  clean/map.json  (PRE-clipped, then clipped again)
  → promote-ribbons.js          →  clean/ribbons.json {faces, tiles, streets}
bakeLook                        →  public/baked/<look>/**  = the slab
```

**Membership is decided in nine places.** The brief said five; it is nine, and they do not agree:

| # | Site | Reads | Formula | Agrees? |
|---|---|---|---|---|
| 1 | `pipeline.js:104-115` (raw pre-clip) | `nb.polygon` ∥ circle, overrides | `hide → out; activate → IN; excl → out; poly ∥ circle` | private copy |
| 2 | `pipeline.js:161-178` (post-derive clip) | `streetFade.outer + 30` | **radius only — polygon ignored entirely** | ⚠️ different test |
| 3 | `bake-buildings.js:687-694` | same as 1 | same as 1, keyed on ledger `b.id` | private copy; **gated off for LS** |
| 4 | `neighborhood-membership.mjs:68` | `nb.polygon` ∥ circle | `isInside` + `density` + `keep` | the shared module |
| 5 | `bake-lamps.js:69` | via 4 | dissolve | ✅ shared |
| 6 | `bake-labels.js:104` | via 4 | **hard cut, no dissolve** | ⚠️ diverges from 5 |
| 7 | `ExtentApp.jsx:1160-1178` (`excludedIds`) | live draft | mirrors 1, comment cites `pipeline.js:246-255` (**line ref rotted**) | preview |
| 8 | `sceneStencil.js` / `src/cartograph/boundary.js` | boundary 256-gon | render stencil | separate concern |
| 9 | `derive.js:1211`, `tree-bake-inputs.mjs:130`, `bake-terrain.js:49`, `scripts/13,14,17,18` | boundary file | assorted | assorted |

**Buildings do not use the shared module.** Sites 1 and 3 are private copies that know nothing about `fade`/`density`/`keep`. This is the stated prerequisite for R26 (tri-state) and I confirm it: `pipeline.js` deletes non-members from `raw.buildings` **before** derive, so by `map.json` a "shown" building does not exist.

### B2 (§3b). Structural diagnosis — why it stays shaky

**D1 — The invariant `bbox ⊇ disc ⊇ membership` is violated in 2 of 5 scenes right now, and is still checked nowhere.** Measured (`scratch/marl-extent-invariants.mjs`):

| scene | tightest bbox half-extent | radius | verdict |
|---|---|---|---|
| lafayette-square | 666 m (S) | 892 | ❌ **violated by 226 m** |
| altadena | 3180 m (S) | 4161 | ❌ **violated by 981 m** |
| hipointe-demun | 2484 m | 1251 | ✅ |
| ksi-y-m-yn | 1941 m | 1530 | ✅ (bbox since widened — `ARCHITECTURE.md:303`'s "2.07×1.55 km" figure is **stale**) |
| centrum | 2762 m | 2147 | ✅ |

`1d8b3d05` added a *warning* and explicitly deferred the hard refusal to `commit-extent`. **No commit implements it.** Altadena today draws 981 m of disc over territory that was never fetched — and `pipeline.js:165` keeps data out to `streetFade.outer + 30` = R + 190, making it worse. Also note Altadena's origin sits 212 m off its own bbox centre, so the overshoot is asymmetric.

**D2 — Księży Młyn's membership polygon is in the wrong file, and has been since the retraction.** `neighborhood.json` carries a 357-pt `polygonSource:"official"` ring. `neighborhood_boundary.json` — **the file every membership consumer reads** — has no `polygon` key. So ksi falls through to the disc. Measured (`scratch/marl-ksi-polygon-cost.mjs`):

> Of the **1,640** buildings baked into Księży Młyn today, **1,099 fall outside its own recorded polygon.** The polygon would keep **541**. Nothing the polygon would admit is currently excluded — the disc is a strict superset, three times too large.

The `17f3c7eb`/`db3078b2` fixes made the *code* preserve polygons. They did not repair the *scene*, and nothing reports the mismatch. `g d70a4a81` predicted "573 buildings and 53 of 84 listings" — that state was never persisted to the file that decides.

**D3 — The dissolve does not do what its own docstring says.** `neighborhood-membership.mjs:78-84`:

```js
const density = (x, z) => {
  if (isInside(x, z)) return 1
  const r = Math.hypot(x, z)
  if (r >= fadeOut) return 0
  if (r <= fadeIn) return 1        // ← outside the polygon, but full density
  ...
}
```

`fade.inner` is always `radius − innerFadeOffset` (200 m, or 134 for LS). So a point **outside the polygon** but inside `radius − 200` returns density **1**. The polygon only affects density inside a thin rim annulus — **9.4 % of Altadena's disc area, 17.8 % of Centrum's**. The documented two-region rule ("inside the polygon literal, outside thinned") is not what runs. The rule, its expired GPU rationale (X1), and the code are three different things. *(Inference, clearly labelled: I read the code and the constants; I did not render trees to confirm the visual consequence. `neighborhood-membership.mjs:23` independently reports "trees ignore it entirely" — consistent, but that is a second claim I did not verify.)*

**D4 — The disc cannot carry a hood center, and the code actively forces it to the origin.** Three sites, confirmed:
- `ExtentApp.jsx:1138` — `if (committed) return { x: 0, z: 0 }`. The correct `keptCenter` is computed 3 lines later and then never used for a committed hood.
- `serve.js:622` — `makeCircleBoundary` returns `center: [0, 0]`, hardcoded.
- `ExtentApp.jsx:1174` — the preview's circle fallback uses that zeroed `keptCenter`.

Consequence beyond the known framing bug: **LS's `neighborhood_boundary.json` carries `center: [-15, -15]`.** It is committed, so the panel routes it to `/rescope`, which also called the disc constructor. **The first time LS was touched through the panel its disc would have silently recentered to the origin and its hand-authored `innerFadeOffset: 134` been overwritten with 200.** That was R22 (byte-identical LS) broken by the tool built to protect it. It also broke R20: for any committed no-polygon scene the preview tested against origin while the artifact said otherwise. ✅ **CLOSED — `center` `71f5ff36`, the fade set `025f1083`. The hazard never fired; LS's values are intact.** ▶ `node scratch/claims-boundary-record-split.mjs`

**D5 — The most-run destructive path has a dead safety net.** `/rescope` is the path every *subsequent* extent edit takes on a committed hood. It writes `${bPath}.prebak-rescope` (`serve.js:1664`). **Nothing reads it** — grep across `cartograph/` and `src/` returns exactly that one write site. There is no rescope-rollback endpoint and no UI. `/rollback-extent` reads only `.prebak`, which only `commit-extent` writes.

**D6 — `.prebak` is never cleaned on success, so `/rollback-extent` is a loaded gun.** Three stale snapshots on disk. `centrum/geography.json.prebak` holds a *different frame*: `lat 51.7625 / lon 19.46014 / timezone America/Chicago` against the live `51.76352 / 19.45901 / Europe/Warsaw`. Pressing rollback on Centrum today would silently revert it to its uncommitted, wrong-timezone frame **and re-run `reproject-raw` + `skeleton.js` against it.** Same for `ksi-y-m-yn`. Commit clears `.prebak` at the *start* of the next commit and rollback deletes them, but a **successful** commit leaves them forever.

**D7 — `bake-buildings.js` contradicts itself inside one file, and LS is exempt from the mechanism.** `:141` — *"The branch is now DATA (does a ledger exist?), not the 'lafayette-square' proper noun — the hardwire retired."* `:671` — `if (scene !== 'lafayette-square' && existsSync(nbP))`. The hardwire is half-retired. Related: **the per-scene render ledger `data/<scene>/buildings.json` exists only for `lafayette-square`** — `ARCHITECTURE.md:368` says "for every scene"; on disk, one. Every other scene falls back to adapting `map.json`, which `pipeline.js` already clipped. So the "belt-and-suspenders" second cull re-tests an already-filtered set, while LS — the one scene with a ledger — skips the cull entirely. **R19 ("one filtered source") holds for poured scenes and is inverted for LS.**

**D8 — ✅ RULED 2026-08-04. The CODE was right; the canon's formula was wrong, in eleven documents.** This section spotted it: canon said `(polygon ∪ activate) − (exclusions ∪ hide)`, while `pipeline.js` (both sites) and `bake-buildings.js` return `true` on `activate` **before** the exclusion test — so a building both activated and inside an exclusion loop is IN in code, OUT under the formula. **It then sat unruled for six weeks**, which is the finding's real lesson: *a recorded contradiction that nobody rules is a decision the code makes silently.* **The ruling: the formula is ORDERED and the finest gesture wins** — `hide` ⇒ OUT · `activate` ⇒ IN · exclusion loop ⇒ OUT · polygon/disc. `((polygon − exclusions) ∪ activate) − hide`. A per-building override demoted to a silent no-op is the `CLAUDE.md` Layer 0 q3 failure. Full rationale: **`NEIGHBORHOOD-INPUTS §5.2`**.

**D9 — ID namespaces are per-source and unvalidated.** Overrides key on `msbf-<id>` (HPDM 16, Altadena 1) or `osm-<id>` (ksi 2 + 32) depending on which source the pour used; the LS ledger uses `bldg-NNNN`. `pipeline.js:107` and `bake-buildings.js:689` derive the id differently (raw tags vs ledger field). Nothing validates that an override id resolves to a building. A stale or mis-namespaced override is silently inert — `a1bcddb6` already recorded *"activate is inert without a polygon"* as a symptom class.

**D10 — Soft contents, which R2 says outrank geometry, have a broken join.** In `ksi-y-m-yn`: **15 of 84 listings carry `building_id: null`** (18 % anchored to nothing), and **only 5 of 1,640 roster entries carry any `listing_ids`** — Galeria Łódzka's roster entry has an empty `listing_ids` array despite 22 listings pointing *at* it. The forward join works; the reverse join is essentially unpopulated. Combined with `bake-content.js:554` dropping cards whose anchor left the baked set, and D2 (ksi's membership 3× too wide), the content layer is anchored to a building set that does not match the recorded neighborhood.

**⭐ The structural cause, stated once.** Every defect above is an instance of one thing: **membership is computed, never recorded.** The artifact is a *ring of coordinates*; membership is what you get when you run a predicate over it, in nine places, at pour time, with no per-building record of the outcome or the reason. So: nothing can be diffed, nothing can be explained to the operator, nothing can be migrated provably, a re-fetch silently changes answers, and a copy that drifts (D3, D6, D8) is undetectable. `BRIEF-extent-boundary-procedure.md:111` names the symptom — *"There are no reason codes… this may be the deepest structural cause of the shakiness."* **I agree, and I would go one further: reason codes are unavailable because there is no per-building record to attach them to.** That is the finding PART D turns on.

### B3 (§3c). The destruction surface

| Gesture | Destroys | Protected? | Recovery |
|---|---|---|---|
| **Fetch** | everything outside the bbox — never acquired | ⛔ no | **none, ever** |
| **commit-extent, center moves >5 m on committed hood** | `blockCustoms`, corner/hero work keyed off bbox-derived block keys — *orphaned, not deleted* | ✅ 409 guard, `allowRecenter` opt-in | `.prebak` + `/rollback-extent` |
| **commit-extent / rescope, any** | `center`, `fade`, `streetFade`, `innerFadeOffset` — **always reset to hardcoded values** (D4) | ❌ **none** | none — silent |
| **rescope** | boundary file | snapshot written | ❌ **`.prebak-rescope` is never read (D5)** |
| **rescope with `dropPolygon`** | the membership polygon | ✅ explicit opt-in | `.prebak-rescope` (unusable) |
| **`/rollback-extent` on a healthy scene** | the live committed frame → stale `.prebak` (D6) | ❌ **none** | git only |
| **Bake, HPDM** | its 192 listings regenerate — no `meta.baseSource` declared | ❌ **none** | git only |
| **Bake, any** | place cards whose anchor left the baked set — `bake-content.js:554`, console line only | ❌ **none** | git only |
| **Pour** | `clean/map.json`, ribbons, `public/baked/**` | ❌ not in `.prebak` | re-pour |
| **Any edit** | `building-overrides.json`, `nb.exclusions` | ✅ **durable — separate files, read-only to pipeline/bake** | n/a |

**The good news, and it is load-bearing:** the correction layer really is durable. `building-overrides.json` is written only by `POST /<scene>/building-overrides`; `pipeline.js` and `bake-buildings.js` only read it. **I re-verified this independently** and confirm `3217b711`'s retraction: re-authoring a polygon costs zero of HPDM's 16 picks. The brief is right and the side-property idea was correctly killed.

**The bad news:** everything the operator *can't* see — center, fade band, the rescope snapshot, the rollback's staleness — is unprotected, and the three worst destructions (D4, D5, D6) are all **silent**.

### B4 (§3d). Dispatch-artifact staleness

56 artifacts checked; 11 make extent claims. Worst offenders:

1. **`HANDOFF-boundary-trio.md`** (2026-06-01, `d30e71c4`) — **49 days 19 hours older than the retraction**. Opens with a section headed *"The one idea"* whose one idea is `:9` *"**The circle is the real boundary. The bbox should be derived from it.**"* — stated more baldly than in any doc the retraction actually corrected. **And `BRIEF-extent-boundary-procedure.md:19` cites it as required reading**, so the *corrected* brief routes agents straight into it. It also carries `:24` *"Retire the manual toggles"*, contradicting R14.
2. **`HANDOFF-lodz-ksiezy-mlyn.md`** (2026-07-19, 22h47m pre-retraction) — `:48` files name-the-boundary-streets as **"(retired)"** in a kit backlog. An agent reading it will *decline to build the mechanism*. Its recency makes it look trustworthy.
3. **`HANDOFF-altadena-pour.md:167`** — prefixed **"Doctrine:"**, short and quotable, five days pre-retraction.

**⭐ ✅ CLOSED — the retraction gap was swept 2026-07-23; re-verified 2026-08-04.** This section reported that `004a33e3` corrected headers and summaries but left the **step-by-step procedures** — what an agent actually follows — still teaching the retracted excluder model, so *"an agent obeying the routing gate could not avoid being told the inclusion polygon was dead."* **Every site it named now states the corrected model, in place:** `PREBAKE.md` (the one file the retraction commit missed) leads with the inclusion-polygon model and carries the fix note; `ARCHITECTURE.md §disc`, `OPERATIONS.md` step 7 and `NEIGHBORHOOD-INPUTS §11` each carry the corrected model with an explicit retraction; `INTAKE.md §0.5` carries the full retraction banner.

⛔ **Left standing, this section manufactures distrust of docs that are now correct** — which costs a re-sweep to discover. Kept only as the record of the failure mode: *a retraction that lands in headings and not in procedures has not landed.*

### B5 (§3e). What I would DELETE

1. **`scene !== 'lafayette-square'` at `bake-buildings.js:671`** (X5, D7) — a hardwire the same file already declares retired. Deleting it is a no-op for LS today (no polygon, no overrides) and removes an exemption that guarantees LS never exercises the mechanism.
2. **The `.prebak-rescope` write** (`serve.js:1664`) — delete it *or* wire a rollback. A snapshot nobody can restore is worse than none: it reads as protection.
3. **`neighborhood.json`'s duplicate `polygon` / `polygonSource` / `radius`** — the same values live in two files and already disagree (HPDM `radius` 1260 vs 1251; ksi polygon in one and not the other, D2). One of these files should own each field.
4. ⛔ **NOT the `sides` field — RESOLVED 2026-08-04, do not delete it.** `ARCHITECTURE` called it vestigial and `INTAKE` called it the mechanism; **the code settles it as the mechanism** — 22 references in `ExtentApp.jsx` (declared, auto-saved into the draft, hydrated from `nb.sides`, resolved to geometry, driving `<ExtentClickableStreets selected={sides}>` and the boundary-street picker UI). `ARCHITECTURE` is corrected. What *does* remain is the naming collision: Altadena persists `borderStreets: []`, a third name for the same idea — unify the name, keep the field.
5. **`ExtentApp.jsx:1138`'s `if (committed) return {x:0,z:0}`** — this is not cleanup, it is D4's fix, but it is a deletion.
6. **`HANDOFF-boundary-trio.md`, `HANDOFF-hipointe-pour-step0.md`** → archive with a retraction banner. Both are dead work described in a retracted model, and the first is *cited as required reading*.

---

## PART C — PRIOR ART

Full survey with sources is long; the load-bearing findings:

**1. OSM declines to draw this boundary, on principle.** `place=neighbourhood`: *"Where the borders are fluid or there is no broad agreement… it is best to use a node."* `boundary=place`: *"not all named places have verifiable boundaries — in that case, the boundary should not be mapped."* And the US community explicitly rejects `admin_level` for informal neighborhoods. **This is a real answer, not a gap** — and it is the strongest available argument for R26's tri-state and for a core/fringe representation over a hard edge.

**2. OSM's boundary *relation* is boundary-by-reference, and it is directly analogous.** A boundary is an ordered set of *member references* — `outer` ways, `inner` rings (**which are exactly our exclusion loops, already standardised**), plus `admin_centre` and `label` roles that decouple label placement from centroid. A way can belong to several boundary relations at once, so adjacent neighborhoods sharing a street cannot drift apart. **The ring is pointers into the street graph, not a copy of it.**

**3. The Census block model is the deepest idea in the survey.** Blocks are *bounded on all sides by visible features*, and — critically — *"an automated computer process looks for all visible and nonvisible features… and creates a block each time those features create a polygon."* **The Census does not draw blocks. It planar-enumerates the faces of the street graph.** Blocks tile space with no gaps and no overlaps because faces of a planar graph do. Tracts and NTAs are then *aggregations of atoms*, and change across decennials is reconciled by publishing atom-level **relationship files**, not by redrawing. NYC's NTAs adopt exactly this for named neighborhoods, with the sharpest disclaimer in the field.

**4. Parcels supply the thing centerlines cannot: the rear lot line.** When a resident says "the neighborhood runs to Jefferson," they rarely mean the centerline — they mean the parcels fronting it. Parcel fabrics never bisect a building. (But they assume a cadastre and a recording authority, which an invented hood lacks.)

**5. Linear referencing is the standard answer to R27** (partial-length boundary edges). Store `(street_id, m_start, m_end)` and dynamically segment. Strictly better than OSM's way-splitting because recording a boundary opinion never mutates the street network.

**6. Alpha shapes / concave hulls are the inverse operator we don't have.** If membership is primitive, the display polygon is *derived* from the member set. Flickr/Quattroshapes/WOF all run it this way.

**7. Who's On First supplies identity discipline** — stable IDs, `supersedes`/`superseded_by` chains instead of destructive edits, concordances to external IDs, deprecation that retains geometry.

**8. Municipal practice supplies provenance-as-data.** Milwaukee, Boston, Chicago and NYC all publish neighborhood polygons *with an explicit non-authority disclaimer in the record*. Milwaukee's stated inputs — "subdivisions, major streets, physical barriers, community group participation, housing styles, types, ages, historic areas, and residents' opinions" — is a ready-made operator prompt set.

**9. Bostonography treats the boundary as a scalar field**, not a line: ~2,300 crowd polygons over a 75 m hex grid yields *"75 % of people who drew the South End agree this location is in it."* Core/fringe is the honest structure of an informal neighborhood. (Needs crowd volume we don't have — but the *representation* is adoptable single-operator.)

**10. Nextdoor is the cautionary case** — the same object ("buildings connected by people-run accounts"), platform-drawn polygons adjustable by early residents, with documented segregation effects. The literature's mitigation is not "don't let one person draw it"; it is **append-only, attributed, revisable provenance**.

### C1 — the direct answer, no hedging

**No single standard to adopt wholesale. But the *decomposition* is standard, and continuing to invent the decomposition is the mistake.** Every mature system solves exactly one of **identity** / **extent representation** / **membership**, and the ones with the strongest membership models assume an authority an invented neighborhood lacks by definition. This tool currently answers all three with one artifact — a coordinate ring evaluated by point-in-polygon — and that conflation is, on this evidence, the actual defect.

**The single most valuable thing I can report: the atom the Census model calls for already exists in this repo.**

`ORIENTATION.md` states the construction model as *"tiles = faces of the centerline graph; the centerlines are the grout."* `derive.js:29` imports `extractFaces` from `tileGround.js` and `RIBBONS.md` documents it as a pure DCEL walk. Verified on disk:

| scene | `ribbons.faces` | `ribbons.tiles` | `ribbons.streets` |
|---|---|---|---|
| hipointe-demun | 302 | 196 | 300 |
| centrum | 481 | 571 | 851 |
| ksi-y-m-yn | 32 | 77 | 137 |

**We already planar-enumerate the faces of the street graph. That is the Census block algorithm, running in this codebase, for a different purpose.** The prior art's central recommendation is not a rewrite — it is *using an artifact we already compute* as the membership atom.

**One honest caveat, and it is the whole difficulty:** faces are extracted in `derive.js`, which runs **after** `pipeline.js` has already clipped. So today the atom is *downstream of the membership decision it should be upstream of*. This is an **ordering problem, not an availability problem** — `clean/street-index.json` (welded, named, unsimplified, 2.1 MB vs the skeleton's 22.6 MB) exists before any boundary is authored, and a DCEL walk over it would yield the faces at pick time. That is the concrete hinge. *(I did not build or run this; it is a proposal, and `fe1bb3a1`'s rule — "nothing downstream of the Wall may consume the index and nothing may derive geometry from it" — would need Jacob's ruling on whether face-enumeration-for-selection counts as deriving geometry. That is R29/PART E territory, not mine to settle.)*

### C2 — where OUR answer is better than the standard one

Three places, and they are real:

1. **Name → extent for a name that exists nowhere.** No standard solves this. OSM refuses and places a node. Census has no names. Municipal portals cover a few hundred cities and disclaim what they publish. Quattroshapes/Zetashapes need a large geotagged-social corpus we don't have and can't manufacture. **An operator naming the bounding streets is a higher-quality signal than any of them** — it captures a resident's actual mental model in one step and degrades gracefully to a town of 3,000 with no portal and no gazetteer entry. R7's "must work from zero" is the correct requirement and the prior art validates it. **Keep this interaction unchanged.**
2. **Single-operator authorship beats crowd consensus at low N.** Bostonography needed ≥5 submissions per hood. Below that a consensus surface is noise. One informed operator making attributed assertions is better *and* auditable — you can ask why 412 Park is out. Nextdoor's warning is about *unrecorded, unrevisable* authorship, not single authorship.
3. **Per-building override is more principled than the standard alternatives — once its status is fixed.** Today it reads as a patch on a failing model (`BRIEF…procedure.md:71`: *"the situation is inverted"*). Under the Census framing it *is* the primary verb — assignment of atoms to a set — which is exactly what parcel-fabric line points and NYC's tract→NTA equivalency tables do. **R13/R14's instinct was right; only its architectural status was wrong.** This reframing costs nothing and removes a whole class of awkwardness.

**Also relevant to R24 (network-unplugged reproducibility):** every adoptable piece above is an *algorithm or a schema*, not a service. Faces, linear referencing, alpha shapes, supersede chains and provenance records are all local. Only Overture/WOF *seeding* is networked, and that is optional and already how the gazetteer hint works.

---

## PART D — RECONCILIATION WITH §5

### Where our built answer matches my independent conclusion

- **The polygon is the mechanism; the disc renders (R6).** Independently reached and correct. `pipeline.js` implemented it before anything could author it.
- **The correction layer is durable (R14).** I re-verified `3217b711` from the code and confirm it. The per-street "side" property was correctly killed; I would not revive it.
- **The gazetteer is a hint (R7, R23).** Correct, and the prior art strengthens it: OSM's own community says an informal neighborhood is not an admin boundary and should not be tagged as one.
- **Order-independence (R11); corners as by-product.** Correct, and matches JOSM's `Follow line`, which auto-advances while degree ≤ 2 and prompts at branch nodes.
- **The self-tensing circle (R3).** I'd have got this wrong. My §3b instinct was "membership is primary, the ring is a render" — which is precisely the over-correction `57dac5f4` marks do-not-repeat. **The disc is not a render; it is the world's ground plane (R4).** The tension is genuine and my PART C recommendation must live inside it, not resolve it.

### Where I diverge

**1. `neighborhood_boundary.json` is not one artifact; it is three, welded.** It carries the render disc (`center`, `radius`, `boundary[256]`, `fade`, `streetFade`), the membership polygon, *and* the exclusion loops. Because `makeCircleBoundary` **constructs a fresh object** on every commit and rescope, the disc fields are regenerated from hardcoded constants while the membership fields are hand-preserved by two `if` branches — which is exactly why the polygon was droppable (X3), why LS's authored center and fade will be silently destroyed (D4), and why ksi's polygon is in the wrong file (D2). `ARCHITECTURE.md:295` correctly says *"three boundaries, three jobs."* **They should be three artifacts.** This is a schema split, not a redesign, and it is the cheapest structural fix available. ✅ **LANDED `025f1083` as three RECORDS in one file** (`boundaryRecords.mjs`) — 13 production sites open the artifact by literal path, so the composed file stays the wire format; splitting the *file* is a consumer migration, not a schema split.

**2. `BRIEF-extent-boundary-procedure.md:113` says membership is reimplemented five times. It is nine (B1), and two of them disagree in kind** — `pipeline.js:161` tests radius only and ignores the polygon entirely; `bake-labels.js` hard-cuts where `bake-lamps.js` dissolves.

**3. R30 ("snap stores a coordinate, never a node reference") is the one archived requirement I would re-open.** It is the exact opposite of the prior art's unanimous answer — OSM relations, PostGIS TopoGeometry, ArcGIS map topology and linear referencing all store *references*, precisely so a re-derived network doesn't silently change the answer. Its stated reason — "a re-derived skeleton must not move an authored corner" — is real, but references + measures solve it *better*: the corner moves **with** the street it was placed on, which is what the operator meant. **This is a Jacob call, not mine.** I flag it as an expired-rationale candidate, not a decision.

**4. The `sides`/`borderStreets` field is worse than "vestigial."** `ARCHITECTURE.md:364` calls it vestigial; `INTAKE.md:33` says it is the mechanism; LS and HPDM persist `sides:[4]`, Altadena persists `borderStreets:[]`, ksi and centrum persist `sides:[]` while carrying real polygons. Three names, four states, no owner. And **R28 — border-street fields are descriptive/SEO metadata, never geometry** — is stated in no live doc, so the next pass will have to guess which it is.

**5. The brief's §5 list of "retired approaches not to revive" needs one addition and one caveat.** Addition: `HANDOFF-boundary-trio.md`'s "the circle is the real boundary, derive the bbox from it" is the most quotable statement of the retracted model in the repo and is *cited as required reading* by the prior brief. Caveat: the excluder pen is **not** retired — it is demoted to correction and still load-bearing (R14). Listing it flatly among "retired approaches" risks the next pass excising a live mechanism, which is precisely the mistake `a05fc129` had to retract.

---

## PART E — OPEN QUESTIONS FOR JACOB

**Surfaced, not answered.** A prior pass invented answers in this class.

1. **Must the boundary close?** Every mechanism assumes a closed ring, and `_archive/…extent-pen:104` asserts it as an invariant that is now re-homed nowhere. But OSM's own doctrine is that an unverifiable place gets a *point*, not a polygon, and R26's tri-state plus a core/fringe representation would both survive an open edge. **Is a fuzzy or open edge ever legitimate — or is closure non-negotiable because the disc must be composed against something?**
2. **When gazetteer and resident disagree, who wins — and is overruling the official answer a correction, or the primary act?** R7 says the gazetteer is a hint; R23 says an admin polygon is not a neighborhood. But `ksi-y-m-yn` and `centrum` both persist `polygonSource: "official"` at 357 and 815 raw cadastral vertices, un-normalised onto street centerlines. `ARCHITECTURE.md:326` says resolving them onto centerlines is what makes "doesn't cut a block in half" true by construction — **that normalisation has not happened for either scene.** Is the official ring a legitimate terminal state, or always an input to be resolved?
3. **Should the greater circle thin at all?** (X1.) The GPU premise is largely expired, the code doesn't implement the documented rule (D3), and there is no knob. Three separate decisions bundled: *does it thin* · *what does thinning mean* · *who controls it*.
4. **What is the boundary street's SIDE supposed to mean?** Not the retracted side-*property* — the semantic question underneath it. When you say "bounded by Clayton Road," do you mean the centerline, the near frontage, or both frontages? The prior art is unanimous that centerline is the reading residents mean *least* often, and HPDM's 16 activates are the evidence. **The mechanism is fine (R14 is durable). The question is what the operator's words mean, and only you can say.**
5. **Is Księży Młyn's current 1,640-building membership intended, or is D2 a bug to repair?** The polygon exists and says 541. I did not touch it.
6. **Does face-enumeration-for-selection violate `fe1bb3a1`'s "nothing may derive geometry from the index"?** PART C's hinge depends on the answer.
7. **Is R22 (LS byte-identical) still worth what it costs?** It justifies the exemption that keeps LS from ever exercising the mechanism (X5, D7) — and D4 shows the tool will silently break LS's byte-identity anyway, the first time it is touched.

---

## PART F — WHAT I THINK IS WRONG WITH THE BRIEF

Requested explicitly, and offered in that spirit.

1. **§5's seal is self-contradictory** (top of this document). §1.3 mandates the exact section §5 seals. The seal that *did* work was the one on the prior brief — keep that, drop the other, and say which.
2. **"§5 is sealed so our methods can't contaminate you" understates how much doctrine now lives in `ARCHITECTURE §Extent`.** Four of the corpus's most important requirements (R3, R4, R10, R26) exist only there and are dated within 24 hours of the brief. A future fresh agent sealed from it would be sealed from the best material in the repo.
3. **§0's diagnosis — "premature synthesis" — is right but incomplete.** All three wrong passes obeyed the routing gate. Two were told the wrong thing *by the canon* (`a05fc129`: *"The canon was the trap"*). B4 shows **the canon is still telling agents the wrong thing today** — `PREBAKE.md:56` was never swept, and `INTAKE.md:26` and `OPERATIONS.md:20` still state the retracted model inside the docs whose headers were corrected. The next pass's most likely failure is not premature synthesis; it is **obeying the gate correctly and being misinformed again.**
4. **§2's premise — "the requirements already exist, scattered"** — is right, and the sweep found ~32. But **the highest-value ones are re-homing losses in `cartograph/_archive/`** (R28–R32), and R32 in particular explains why the *current* resolver's predecessor failed. The brief asked me to sweep archives; it did not anticipate that the archive holds the load-bearing forensic.
5. **The one thing nobody had verified — I checked it, and it holds.** *"One `activate` on Galeria Łódzka carries 22 listings"* is repeated in the brief (:134), `ARCHITECTURE.md:309` and `:329`, and `INTAKE.md:28`. Verified: `osm-39524935`, `building:retail / shop=mall`, present in `ksi-y-m-yn`'s activate list, and exactly **22 of 84** listings carry that `building_id`. **True.** But the *inference* it supports is undercut by D10 — that building's roster entry has an empty `listing_ids` array, and 15 of the 84 listings are anchored to no building at all. The strongest evidence for "structures full of accounts are first-class members" sits on a join that is half-broken.
6. **§6.1's coordinator inference — "membership is the primary artifact and the boundary is downstream" — is marked "test it, don't inherit it," and it should be marked SUPERSEDED.** `57dac5f4` retracted it nine minutes after `dc35c2df` wrote it, as an over-correction. The brief (`aa1c835a`, 11:58) predates that retraction (12:23) and still presents it as a live inference to test. **I nearly inherited it.** It is the fourth instance in this subsystem of an artifact being older than the doctrine it points at — the exact class §3d exists to catch.
7. **§3c asks what has no recovery path; it does not ask what has a recovery path that doesn't work.** That is where D5 and D6 live, and they are worse than an absent one, because a written snapshot reads as protection.

---

## STATUS — stopping here, per §7

No production code. No file modified but this one. Two throwaway scripts in `scratch/`.

**Nothing above is a design I am proposing to build.** PART C names a direction — the membership atom is the street-graph face, and we already compute it — and PART D names the cheapest structural fix — split the three-jobs artifact into three. Both need your ruling, and PART E has seven questions that are yours before any of it is actionable.

**If you want one thing fixed first and it isn't the redesign:** D2 (Księży Młyn's polygon is in the wrong file — its neighborhood is 3× too large today) and D6 (`/rollback-extent` will silently revert Centrum to a wrong-timezone frame). Both are live, both are data, neither needs a design decision.
