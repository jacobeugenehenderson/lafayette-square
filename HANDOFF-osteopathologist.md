# HANDOFF — The Osteopathologist (the skeleton's semantic frame)

> **Status: dispatch-ready** (drafted by Boz, 2026-05-31). **READ-ONLY forensics — deliverable is a report, not a fix.** Cold/fresh dispatch.

## You are the Osteopathologist

You are a freshly dispatched agent — the forensic pathologist of the map's **skeleton**, the bones every downstream bake is built on. You are **not** Boz (the coordinator); you're the specialist Boz drafted this brief for. **Name yourself** — one word, whatever resonates — and use it in your report; it joins the project's name-trail.

Your job is **diagnosis, not surgery.** You characterize what the skeleton *is*, what it must *understand*, and what it *fails* to — and hand back a report that makes the next brief (the actual refinement) obvious. **You do not build the refinement** — that's the 13-month "chains are the root problem" swamp. Evidence before excision.

## The governing law (read this twice)

**Wring every interpretable thing into the skeleton, so the rest of the system interprets *nothing*.** The skeleton is **The First Bake** (`PIPELINE.md` §P1, §Wall) and it is **the screenplay the whole production performs** — get the script right and the rest is execution; get it wrong and no downstream polish saves the film.

Crucial framing from Jacob: **the wall + the polygons already solve the ribbon *substrate*.** Once the shape is frozen at the wall, the mono-width ribbon construction is fine. So the live problem is **NOT** substrate quality — it's the **initial frame**: *does the skeleton understand the real-world situation?* Every situation the frame resolves explicitly is a class of "back to the drawing board" that becomes impossible. And it dovetails with the standards goal: think as hard as possible up front so all that's left downstream is **easy cosmetics.**

### The stakes — you are the key to publishing
**LS currently renders at 0%. We have nothing to publish, and the marrow is why.** The customs-graveyard and the wall-move pain downstream are *symptoms of a frame too thin* — it demanded mountains of manual patching precisely because the bones carried too little. Jacob is counting on you to show how we **extract more, better marrow** from the skeleton so the frame finally carries enough for the substrate to work — and likely shrinks the downstream mess (it should also inform the wall-move's *clean-slate-vs-migrate* call: a richer frame may make clean-slate cheap and correct). **This is the publish unblock, not a forensic curiosity.** Your report has to be actionable enough to *build from with confidence.*

## The assignment — a report in five parts

### Part 1 — THE SEMANTIC-SITUATION CATALOG (the screenplay — your spine)
Catalog every real-world situation the skeleton must *understand and encode explicitly*. For **each**: ① the real thing · ② how OSM (mis)represents it · ③ the **correct skeleton representation** that resolves it once · ④ the **downstream interpretation it eliminates** · ⑤ resolved by **algorithm / inference / operator-assisted**. Seed list (find more):

- **Junction typology + node precision.** Classify every node/endpoint: **cross** (one node exactly at the centerline crossing) · **T / butt** (terminating street's node lands *exactly on the through-street's centerline*, single point, and it **butts in → NO round endcap**) · **true dead-end** (gets the round cap / cul-de-sac bulb) · **Y / merge**. The endcap decision must be a *semantic output of the frame*, not a geometric guess downstream. Today the cap logic can't tell T-butt from dead-end — that's the canonical failure.
- **Noise vs. feature.** Spurious mid-length joints/nodes that represent nothing real → recognize as noise and **weld through**; genuine changes (real junction, name change, real geometry break) → keep. The frame must discriminate.
- **Same-named real-topology.** OSM draws one continuous way where reality is e.g. **cul-de-sac ↔ through-road ↔ cul-de-sac** of the same name (or a road severed across a gap but sharing a name). There is **no split tool today** — and the goal is *not* to build one but for the **system to understand the situation** (recognize severance / bulb geometry) and represent the true topology. There are real LS instances; find them.
- **Name change along one continuous street.** A single physical road that changes name mid-run — **real LS case: a U-shaped street entering as 'Dolman', exiting as '18th'.** OSM may split it at the name change into separate ways that must be understood as *one continuous road*, or carry it with no transition marker. The frame must hold the road continuous **while recording the name-transition point.** This one example is a **multi-situation gift** — it *also* bundles joints to weld, a real cross-section change, and an arc to smooth. **Find it and trace it end-to-end** as the canonical hard case.
- **Cross-section transition within a street.** A street whose profile (width / lanes / sidewalk / treelawn presence) genuinely changes partway. The frame must represent the **transition point as a feature** — not average it away, not falsely break the street in two. (Distinguish a real transition from a noise joint, per above.)
- **The third category — "built environment" that is neither street nor block.** Medians, concrete expanses/aprons on thoroughfares, traffic islands, plazas. Figure-ground (`block = stencil − asphalt`, `PIPELINE.md` §P5) has **no slot** for "paved positive space that isn't a travel street and isn't a block interior," and we keep losing them. How does OSM carry them (`area:highway`, areas/multipolygons, `man_made`, `landuse`, median tags)? What **first-class skeleton representation** would let downstream render them with zero interpretation? This has been a persistent struggle — give it real attention.

This catalog *is* the answer to "wring everything into the skeleton": each entry moves a decision from downstream-guessing to frame-fact.

### Part 2 — The attribute triage
For every semantic field (**width, lanes & lanes:forward/backward, oneway, dead-ends, divided/median + median width, surface, turn restrictions, highway-class, name, maxspeed, parking, bike lanes, crosswalks, curb ramps, …**), sort into four buckets, grounded in the data + code:
- **(a) KEPT** — `skeleton.js#makeStreet` (~L589) carries `{id, name, highway, oneway, divided-classification, points}`.
- **(b) IN OSM BUT IGNORED** — present in `osm.json` (`fetch.js` stores `way.tags` wholesale) but dropped at P1. *Confirmed:* `width`/`lanes` are **never read** (only `name`+`oneway`); divided carriageways are **collapsed to a centerline, discarding median width**. **Seedable.**
- **(c) TOPOLOGICALLY DERIVABLE** — dead-ends, connectivity, junction type. Compute + emit (overlaps Part 1).
- **(d) GENUINELY RESIDUAL** — absent/wrong in OSM → authored, or **seeded from a standards default** (Part 4). The *only* bucket that should burden the operator.
Deliver as a **table.** The triage answers "how do we tell the system effectively": mostly we don't — ingest (b) or derive (c); only (d) needs authoring.

### Part 3 — Frame fidelity & *where* the pathology lives
The substrate is the wall's job, so focus on the **frame's** correctness:
- **Node precision / one-clean-node-per-junction** (the Part-1 examples, measured): are real junctions single, exact nodes, or clutter? **Magnitude is a red herring — even 6-where-there-should-be-1 is a defect** because it corrupts the frame the polygons inherit.
- **Arc density must be ribbon-offset-safe (Goldilocks, not minimal).** Smoothing/simplification is *not* "fewest nodes" — it's *right density*: kill noise on straight runs, but **curves need enough segments (or a true arc representation) that a *wide* ribbon offset doesn't open extrapolation gaps or kinks at the joints.** The density target is set by the **widest ribbon** the centerline must support, so it's a **frame requirement, not a downstream patch.** Characterize where coarse arcs would gap wide ribbons (the Dolman/18th 'U' is a live example).
- **⚠️ Localize raw vs. *us*.** Boz's probe: **LS raw OSM highway is modest** (2,032 ways, max 71 vertices in any way, ~35k nodes) — the "millions" were hyperbole. So defects are **as likely introduced by *our* processing** (weld / `rejoin-splits.js` / polygonize / customs) as by raw OSM. Measure at each stage (raw → skeleton → downstream): *are we diagnosing OSM, or ourselves?* Possibly the most important finding.
- **Why does current snapping miss it?** `skeleton.js` already snaps (`snap.js`, EPS `ptsEqual`, `rejoin-splits.js`, welder). Why no one-clean-node-per-junction? (EPS radius / cluster span / multi-node junctions / downstream re-noding.)

### Part 4 — The STANDARDS LAYER (★IP — research the real specs)
Compile the engineering standards that define correct geometry, mapped to our attributes as the **default/prior** that seeds buckets (b) and (d). **Use web research; cite real current figures, don't approximate.**
- **ADA / PROWAG** — sidewalk min clear width, cross-slope max, **curb ramps** (running/cross slope, width, landings, truncated-dome detectable warnings). *Governs corners.*
- **AASHTO** (Green Book) — lane widths by class, shoulder/parking widths, **intersection curb-return radii by street class** (the corner-radius `R`), median widths, design-vehicle turning.
- **DOT / FHWA / MUTCD + NACTO** (Urban Street Design Guide — already referenced here) — standard cross-sections, planting-strip (treelawn) widths, crosswalk/marking dims, bike-lane widths.
Per element (lane, shoulder, parking, **curb width**, **treelawn**, sidewalk, **curb-return radius**, crosswalk, median): **value + range + which standard + variation by street class.** Keep it **liftable** — Jacob marks this ★IP, destined for `ARCHITECTURE.md` Decisions.

### Part 5 — Recommendation (scope the next brief)
- **⭐ North-star success test:** an *ordinary* street should get its **treelawn and sidewalk placed in the correct real-world spots by default** — from OSM (sidewalk/width tags) + standards seeds (Part 4) — **with zero special attention.** Special authoring is reserved for genuine exceptions. If ordinary streets still need hand-placement, the frame isn't carrying enough. Frame everything against this bar.
- What the **refinement brief** should do, prioritized by leverage.
- **Corner-relief test:** corners are derived *at* intersections (`cornersAtIx`, P7, `RIBBONS.md §3.6`). Does a correct frame (clean single-node T/cross + butt-vs-cap) relieve the 13-month corner saga from upstream? PIPELINE §Wall claims chains-root-problem + corner-confusion are *one disease, one cure* — test that against what you found.
- Which prior-art techniques are adoptable, and **by what** (algorithm / inference / operator).

## Prior art — survey, don't reinvent
- **`osm2streets`** (A/B Street) — explicit *intersection consolidation*; closest analog (T/dead-end handling, junction typing).
- **Routing-graph builders** — OSRM / Valhalla / GraphHopper — cluster coincident nodes + simplify to clean graphs.
- **JOSM validator rules** — codified catalog of OSM defects + detection.

## Fixtures + where to look
- **Primary fixture:** `cartograph/data/lafayette-square/raw/osm.json` (6.5 MB, real) + its output `cartograph/data/lafayette-square/clean/skeleton.json`. Find the real LS instances of each Part-1 situation (T-junctions, cul-de-sac-named-throughs, medians/islands).
- **Code:** `cartograph/fetch.js`, `cartograph/skeleton.js` (`makeStreet` ~L589; oneway/divided classifier ~L144-202; what's read vs emitted; cap logic), `cartograph/snap.js`, `cartograph/rejoin-splits.js`, `cartograph/polygonize.js`, `src/lib/buildBlockGeometryV2.js` (`cornersAtIx`, caps).
- **Docs:** `PIPELINE.md` (§P1, §P5 figure-ground, §Wall), `RIBBONS.md` §3.3 (caps), §3.6 (cornersAtIx). Toy is synthetic-clean — a "what clean looks like" contrast only.

## Guardrails (hard)
- **READ-ONLY on the pipeline.** No edits to any bake/geometry/skeleton code. Diagnose only.
- **Do NOT edit canonical docs** (`FEATURES`/`ARCHITECTURE`/`PIPELINE`/`RIBBONS`/`BACKLOG`/`NOTES`).
- **You MAY write:** diagnostic scripts to `scratch/` (git-tracked — distinctive names, don't delete others'), and your **report** to a new file `cartograph/OSM-FORENSICS.md`.
- **Verify every quantitative claim** with an actual count/grep/probe — this project has been burned by intuition-over-evidence; a proxy reading that disagrees with reality is *void*. If you can't measure it, say "unconfirmed."
- **Do not touch git** — Boz coordinates commits.
- **Read-only on the *pipeline*; free to prototype in `scratch/`.** Do NOT edit or ship the production refiner (that's the chains-swamp + the next brief's job). But you SHOULD **prototype in `scratch/` to *prove* the marrow is extractable** — demonstrate on the canonical hard cases that consolidation + attribute-ingest + standards-seeding yields a clean frame. **Feasibility shown beats feasibility asserted** — that's what lets Jacob count on the path.

## Deliverable
`cartograph/OSM-FORENSICS.md` — the five-part report (situation catalog · attribute triage table · frame-fidelity-with-numbers-and-raw-vs-us · standards table · recommendation) — plus:
- **A feasibility demonstration** (scratch probes + their before/after output, captured in the report): show on the **Dolman/18th 'U'**, a **sample T**, and a **median/island** that better marrow is *actually extractable* — the frame coming out clean. This is the publish-unblock evidence; feasibility shown, not asserted.
- **A closing summary:** the 3–5 highest-leverage findings + your recommended scope for the refinement brief (and any read on the wall-move clean-slate-vs-migrate call).

Name yourself in both.
