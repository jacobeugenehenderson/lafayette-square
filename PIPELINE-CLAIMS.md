> ## ⛔⛔ STATUS 2026-08-02 — WRITTEN BEFORE THE SWEEP; DO NOT TRUST IT YET
>
> This file distils the doc corpus. **Hours after it was written, six adversarial sweeps graded that
> corpus ~91 false claims out of ~290** (`scratch/doc-sweep-1..6-*.md`, commit `d8cdeaad`) — so this
> inherits whatever they found. It already inherited two errors that were caught by hand:
> a "divided detection is geometry-first" claim that had been fixed days earlier, and
> **3.3's "prebake never reads operator authoring — zero reads, verified"**, which is FALSE:
> `derive.js:2510` reads `clean/overlay.json` (52 authored LS streets). Only `design.json`/
> `blockCustoms` go unread.
>
> ⭐ **What survives on its own authority is the plain-language chain** — confirmed line by line with
> Jacob: the to-code skeleton, **the armed mine at step 3**, chain *links* dying at the Wall,
> the condensation principle, and The Ward. That part is his words, not a distillation.
>
> **Rebuild this after the Tier-1 corrections land** (`_handoffs/HANDOFF-doc-sweep-corrections.md`),
> or delete it. Do not build a design exercise on it in its current state.

# PIPELINE CLAIMS — OSM to the Section tool, in checkable prose

> **Every line here is a claim that can be checked and shown false.**
> **A falsified claim is corrected or deleted — never annotated, never superseded in place.**
> If you cannot state something as a checkable claim, it does not belong in this file.
>
> This file exists because the corpus grew large enough that people build on sentences instead of
> re-deriving, and several of those sentences were wrong for weeks. It is deliberately short.

**Two labels, and they mean different things:**

| | |
|---|---|
| **[REQ]** | a **requirement** — something the system must achieve. Binding. |
| **[OUR]** | **our current answer** — one way we chose to satisfy a REQ. ⛔ A fresh designer should NOT inherit these. They exist so a falsifier can check them, and so an independent design's divergences are visible. |

**Confidence:** ✅ verified in code · 📄 from canon, not verified by the author · ❓ low confidence.

---

## 0 — Extent: deciding what the town IS

- **0.1 [REQ] 📄 ⭐ A neighbourhood is a collection of buildings/structures connected by people-run accounts.** Hard surfaces *describe* it; soft contents *enliven* it. The unit is the **structure**, not the area.
- **0.2 [REQ] 📄 ⭐⭐ Losing soft contents outranks losing geometry.** A bake that takes a hood's listings from 84 to 5 is not a content bug — it is the neighbourhood dying. Geometry can be re-poured; the accounts cannot.
- **0.3 [REQ] 📄** The boundary and the membership **mutually determine** — *"a self-tensing circle."* ⛔ Do not resolve them into a hierarchy in either direction: you need the polygon to know who is in, and you don't know where the hood is until you have them.
- **0.4 [REQ] 📄** The area must be decided **before** the full fetch, because the fetch is bounded by it.
- **0.5 [REQ] 📄** Membership is authored as **inclusion** — you say what it IS. Exclusions are corrections to that, never the primary gesture. ⚠️ *The circle was a **concession**, not the design: "I settled for the circle because we couldn't get this right."* The polygon decides; the disc only renders.
- **0.6 [REQ] 📄** Street names come **from** the fetch, so the boundary can only be authored **after** data lands. A gazetteer ring is a **hint, never a requirement** — an invented neighbourhood (two areas someone joined) is the **normal case**, so selection must work from zero.
- **0.7 [REQ] 📄 ⭐** The rendered disc is the **ground plane** — the hood is a planet and its rim is the horizon. So an off-centre disc is **world-breaking, not cosmetic**.
- **0.8 [REQ] 📄 ⭐** The frame origin may **grow or shrink but must NEVER move.** Grow/shrink from a fixed centre leaves every retained coordinate and id resolving; moving it reprojects everything at once and re-orders identity.
- **0.9 [OUR] 📄** Two passes: a **soft fetch** (generous, cheap, reversible — and where identity is minted) → author the boundary → a **hard fetch = the SEAL**, which permanently freezes the soft fetch and bakes the skeleton. ⭐ **The lock IS the registry**: once the soft fetch is frozen, a fetch ordinal becomes a legitimate permanent key, and afterwards augmentation is **strictly append — nothing is ever renumbered.**
- **0.10 [REQ] 📄** A missing input must **not block the seal.** It becomes a **declared channel** and the skeleton bakes anyway.
- **0.11 [OUR] 📄** Three nested sizes, **hood < disc < bb**, and **two independent centres**: the frozen frame origin, and a hood centroid that may roam. The bounding box is the radius **+ ~20–25%** — a *percentage*, never an absolute distance. ⚠️ The lock makes soft-fetch mistakes permanent, so that padding is **the only future headroom that exists**.

> ⭐ **0.12 [REQ] 📄 What this stage actually produces is THE SKELETON, not a boundary.** *"If the skeleton isn't served it is not doing its job. A gajillion consumers hang off the skeleton info."* The disc is a small artifact beside it.

## 1 — Intake: fetch and label

- **1.1 [OUR] ✅** Labelling happens in the **same pass** as the fetch, not as a second step.
- **1.2 [REQ] ✅ ⭐** Centreline **geometry** and street **widths** come from **different sources with different authority** and must never be conflated when debugging.
- **1.3 [OUR] ✅** Geometry = OSM + a few hand-curated fixes. ⚠️ **Not survey-grade** — it is a digitisation, jags and all. Nodes sit at true real-world positions; the *shape between them* is a trace, not a measurement.
- **1.4 [OUR] ✅** Widths = operator-**measured** first (61 of 68 LS streets), then OSM tags, then a published urban standard. **This is measured; trust it.**
- **1.5 [OUR] ✅** The standard chosen is pedestrian-scale, not truck-scale — deliberately.
- **1.6 [REQ] ✅** A town lacking any optional source must still pour, and its absence must never become another town's data.
- **1.7 [REQ] 📄** Inputs fall into three tiers, and the tier predicts the per-town cost: **① global** (nothing to do) · **② municipal wells** (re-point the fetch) · **③ authored/completist** (the real work — measured widths, idiosyncratic shape, the look).
- **1.8 [REQ] 📄 ⭐** **Every input is a LOCAL FILE. A pour must be reproducible with the network unplugged.** Fetching *acquires* a file once; it is **never** how the pipeline reads.
- **1.9 [REQ] 📄** The catalogue is **aspirational**: it lists everything a town *could* have. A town that hasn't acquired a row simply doesn't render it — the panel shows every row, the render shows only what exists.

## 2 — Skeleton: the to-code frame

- **2.1 [REQ] 📄 ⭐** The skeleton is **a labelled point cloud.** The substance is points, each carrying a label (its node kind). Segments exist so a person can see it and so we have something to stroke. **Identity lives on the points, not the lines.**
- **2.2 [REQ] 📄** Simplification must **never destroy a junction.** A junction-blind pass deleted 79 interior T-junctions that existed in the source at 0.00 m.
- **2.3 [REQ] 📄** A road must stay **one road across a name change**.
- **2.4 [REQ] ✅ ⭐** What leaves this stage is **to code** — regular, to-spec streets. **It is not yet what is on the ground.**
- **2.5 [OUR] ✅** Base widths are seeded here from the 1.4 ladder.

## 3 — Prebake: the polygon world ⚠️ THE ARMED MINE

- **3.1 [REQ] ✅** The street graph must be resolved into **bounded regions** — the blocks between streets — and that decision frozen once.
- **3.2 [OUR] ✅** Those regions are the **faces of the centreline graph**; each carries, per edge, which street owns it and which side.
- **3.3 [OUR] ✅ ⚠️** **Prebake never reads operator authoring — zero reads, verified.**
- **3.4 [REQ] ✅ ⛔** **Therefore anything frozen at this stage is the to-code default, NOT the town.** Freezing authoring-dependent geometry here is structurally impossible, and any instruction to do so is wrong. *(This claim alone cost three separate passes on 2026-07-31.)*

## 4 — Survey: conform the drawing to reality

- **4.1 [REQ] ✅** The operator edits **only polygons**. Chains and nodes are **immutable** to them, and every node sits at its real-world position.
- **4.2 [REQ] ✅** The operator works against an **aerial** and reshapes until the drawing matches the ground.
- **4.3 [REQ] ✅** A single block may carry **different widths along its span**, and widths must be authorable **asymmetrically**, per side.
- **4.4 [REQ] ✅** Authored values apply **at shape time**, never at prebake time (follows from 3.3).
- **4.5 [REQ] 📄 ⭐** **The corner is TWO things in TWO tools:** its *shape* (how round the curb is) belongs here; its *fill* (how the ribbon bends around it) belongs to Section. **A fill cannot settle while the shape under it is still moving** — conflating them is the root of the corner mess.
- **4.6 [OUR] ✅** Output is a frozen per-tile shape — the curb line.

## 5 — The Wall

- **5.1 [REQ] ✅ ⭐** After this boundary there is **no such thing as "this chain link."** Forever after it is **"this surface / this edge of this tile."** Chains stop being independent entities.
- **5.2 [OUR] ✅** Enforced **structurally on the consumer**: the consuming function has no chain in lexical scope, so reaching back requires a visible signature change.
- **5.3 [OUR] ✅ 🔴** **Not** enforced on the **producer** — 59 of 101 tiles are produced chain-free, 42 are not. **A known open gap, not a claim of success.**

## 6 — Section: the pedestrian fill

- **6.1 [REQ] ✅** Strokes **inward** from the frozen curb only.
- **6.2 [OUR] ✅** Physically cannot see a chain.
- **6.3 [REQ] ✅** Every edge gets a **sane default with no operator action**; authoring is override-only. The operator never starts from blank.
- **6.4 [OUR] ✅** Those defaults trace to intake — treelawn presence is *gleaned* from measured widths, not guessed.

---

## The cross-cutting requirements — these govern everything above

- **R1 [REQ] ✅ ⭐⭐ THE OVERRIDE IS THE PRODUCT.** The machine pours a strong first draft; the operator may override any of it. An override is **first-class, never a defect to drive to zero.** A real neighbourhood is historical and idiosyncratic — **that is what the authoring tools are FOR.**
  - **R1a [REQ] ✅** Therefore **any measurement taken without the scene's authored state loaded is measuring the wrong map** — and it fails worst on the most heavily authored town while looking cleanest on a fresh pour.

- **R2 [REQ] ✅ ⭐⭐ EACH STAGE HANDS THE NEXT SOMETHING SIMPLER — AND EACH STAGE'S FAILURE IS UNRECOVERABLE DOWNSTREAM.** Everything is processor-heavy, so nothing can be re-litigated later: **every step fails if the previous one is not fully and correctly resolved.** This is why the freezes exist, and why *"we'll fix it in the next stage"* is never available. It is also why authoring must be fluid — **anything requiring the whole map retraced 60× a second does not work**, and that binds the pre-wall stages as much as the post-wall ones.

- **R3 [REQ] ✅ ⛔ NO FALLBACKS.** When an input is absent or a value cannot be derived, the system must **say so loudly** — never substitute a plausible value. A fallback converts a failure into a **plausible-looking success**, which is the worst outcome available: the operator sees a map and trusts it.

- **R4 [REQ] 📄 THE OPERATOR'S EYE IS THE GATE.** A count, a percentage or a passing probe is **evidence, not a verdict.** Measurements that were all green have been judged worse on sight and reverted.

- **R5 [REQ] ✅ THE DELIVERABLE IS THE CHECK.** For any defect, the deliverable is the check that catches its **whole class in a town nobody has looked at.** A fix requiring an operator who has already seen the street delivers nothing to town #2. ⛔ Skip lists and exception tables are not results.

- **R6 [REQ] 📄 ⭐⭐ MINT IDENTITY ONCE, UPSTREAM; FREEZE IT; CARRY IT FORWARD; NEVER RE-DERIVE IT.** Every downstream view must carry the label rather than re-guess it from shape. Two known failures of exactly this: a face-walk that discarded the node's stamp and left the fill re-guessing ownership; and building identity keyed to a fetch **array index**, so a re-fetch renumbered everything and silently re-pointed content.

- **R7 [REQ] 📄 ⭐ EVERYTHING IS A DERIVATION OF THE CENTRELINE, IN STRICT ORDER: centreline → polygon → ribbon.** The centreline is the **root**. Two consequences: **(a)** the polygon is both the **geometry** source and the **identity** source — a rough centreline corrupts not just shape but *what things mean* (facet vertices misread as corners, one frontage shattering into many, materials fragmenting); **(b)** fix at the centreline first — patching a polygon or a ribbon while the centreline is rough is **editing a shadow.** ⛔ Diagnostic: if the polygon moves and the centreline does not, you are at the wrong layer.

- **R8 [REQ] 📄 CONSTRUCTION IS THE LAST RESORT, AFTER THE DERIVATION IS VERIFIED CORRECT.** Twice a "hard polygon" that looked like it needed positive construction dissolved once the *input* was fixed — one by correcting identity, one by correcting widths. Do not construct before exhausting the derivation fix.

---

## Ratified — locked, do not reopen

- **L1 📄** A divided road stays **two centrelines**; never merged to one spine.
- **L2 📄** The median is a **walked face**, derived — never a constructed polygon.
- **L3 📄** The pedestrian fill is a **mono-width concentric ribbon**; the corner is that band **BENT** around the arc, a slice of the same offsets — **never a separately-constructed primitive.**
- **L4 📄** Width priority is **measured → tags → standard**.
- **L5 📄** Concentric offsets use mitre joins, never round joins — round joins re-round an already-rounded ring and destroy operator-authored square corners.
- **L6 📄 ⭐** A **"loop street" is not a geometry concept** — it is an authoring-card *name*. The enclosed face is an ordinary walked face (sometimes a grass median, sometimes a normal city block); it is never a separately-authored polygon. ⛔ Do not build a loop primitive.
- **L7 📄** Divided-road detection is **data + topology first** — name, one-way flags, highway-class compatibility, ramp dispatch, and a split/rejoin trace — with **geometry used only as a check.** Geometry-first detection once fabricated a divided road from a motorway ramp and a service drive sharing a name.

---

## Known-open, stated so nobody reports them as discoveries

- **K1 ✅** The producer side of the Wall is not chain-free (5.3) — 42 of 101 tiles.
- **K2 ✅** The pipeline does not reproduce its own committed output — a fresh run differs from the committed artifact.
- **K3 ✅** The curb-parallelism check is mis-specified: it runs with authoring off and skips tiles it cannot measure.
- **K4 ✅** Land use is invented where it cannot be derived — a bare `residential` constant, ~11% of LS faces and ~40% of another town's.
- **K5 ✅** `unknown` land use is treated as hard surface, which is the visible grey.
- **K6 📄 ⭐** We **do not construct the intersection positively** at every node; the field's reference implementation does (roads trimmed back to an explicit intersection polygon). **That single divergence is the source of one whole bug family.**
*(A claim that divided-road detection is still geometry-first was written here on 2026-08-02 and **deleted the same hour as FALSE**: `skeleton.js:196–233` already ports the data-first gates — class compatibility, ramp dispatch, split/rejoin trace, geometry as at most a check. It had been fixed days after the doc I took it from was written. Recorded only as a caution: **the corpus's "known-open" lists go stale faster than its doctrine.**)*

---

*Written 2026-08-02 from Jacob's spoken corrections plus a read of the root and `cartograph/` doc collections. Scope is deliberately OSM → Section; Stage, Preview, Bake and The Ward are out of scope. Read for this: `ORIENTATION` · `CLAUDE` · `README` · `RIBBONS` · `SKELETON` · `SURVEY` · `SECTION` · `PREBAKE` · `POLYGON-FIRST` · `WALL` · `PIPELINE` · `INTAKE` · `ARCHITECTURE` · `OSM-FORENSICS` · `OSM2STREETS-GROUNDING` · `LOOP-STREETS` · `EXTENT-DESIGN` · `EXTENT-EXCAVATION` · `INTAKE-CATALOGUE` · `NEIGHBORHOOD-INPUTS`. Not read (out of scope): `STAGE` · `PREVIEW` · `BAKE` · `SLAB-CONTRACT` · `TOY_AUTHORING_PLAN` · the `ls/` collection · arborist · meteorologist.*
