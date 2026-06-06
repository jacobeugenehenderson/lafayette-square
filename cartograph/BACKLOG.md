# Cartograph Backlog

> **STATE + forward-work only** (`BOZ.md` doc architecture). No diary (→ `NOTES.md` + git), no how-it-works (→ Reference: `SKELETON` / `PREBAKE` / `SURVEY` / `RIBBONS` / `ARCHITECTURE` / `PIPELINE`). When an arc completes: *fact* → Reference, *why* → ARCHITECTURE decisions, *narrative* → NOTES — it leaves here.
>
> *Reshaped 2026-06-05 to the polygon-first program. The pre-reshape backlog (DONE-narratives, the superseded C5/wall-move/palimpsest thread, the prong-4 red herring) is in git history; the deeper pre-prune blob at `git show 4bf8af2:cartograph/BACKLOG.md`. ★IP NACTO/AASHTO pad + ADA-radius decisions still carried for ARCHITECTURE's Decisions section.*

---

## 🔥 NOW — the polygon-first program

**The committed arc (Jacob, 2026-06-05):** **(1) fortify the Skeleton + its Prebake → (2) polygonize Survey (all authoring tools connected + rendering live) → (3) a DataWall with prepared artifacts behind it.** The false corner / thorns are **symptoms** of Survey not being polygon-first — the corner-patch is **KILLED** (`_archive/handoffs/`). Cure = move the chain→polygon conversion into **prebake** + freeze (wall → ~P3). Doctrine: `SURVEY.md §5.1` · `PREBAKE.md §5`. Trunk: `cartograph-looks-pass-ab`.

| Stage | Status |
|---|---|
| intake | ⏭️ deferred (LS has `osm.json`); Provincetown = first run |
| **skeleton** | centerlines polygon-ready ✅; remaining = fortification (name-logic doglegs) |
| **prebake** | ⚠️ **thin two-source compile** — the polygon-ization + freeze (the wall-move) is the live target |
| **survey** | tile construction live (LS, unflagged) but **NOT yet polygon-first**; authoring mid-migration (T3) |
| WALL | at `sectionPass` today; target = the prebake→survey boundary (~P3) |
| section | ~70% (`sectionPass` chain-incapable by closure) |
| bake → 3D | working; LS visual correctness gated on the above |

**Live work (the program, in dependency order):**
- **Doc campaign — the on-ramp (in flight).** Lean the corpus to rebuild-precision; front-half spec = `SKELETON`+`PREBAKE`+`SURVEY` (done/drafted, indexed). Remaining passes: `RIBBONS` lean to the tile model (coherence **D1**), `FEATURES` retire figure-ground-as-live (**D3**). Method: `[[feedback_docs_effluvium_buried_the_answer]]`. Ledger: **`DOC-CODE-COHERENCE.md`**.
- **(2) Prebake polygon-ization + freeze** — derive the block substrate from skeleton chains, resolve corner *identities* (divided transition via `phase.spineAt*`), freeze it; kill the two-source raw-OSM face seam (coherence **C5**). This is **the cure for the false corner.** `PREBAKE.md §5`.
- **(3) Polygonize Survey / connect authoring (T3)** — migrate handles / corner-R / cap-selector / strip-swap / translucency off the dead figure-ground onto tiles; **activated-block live redraw** (perf, the sticky-tools fix). `HANDOFF-tile-T3-authoring.md` · `HANDOFF-survey-section-tool-design.md` · `SURVEY.md §4.1`.
- **Skeleton fortification — name-logic doglegs** — weld same-name fragments + straighten within-name kinks. `HANDOFF-name-logic-skeleton-pass.md`.
- **Band-fold thorns** — local capacity clamp (thin-tile / T-mouth `iW` fold; ~100 instances). Distinct thorn-class; re-confirm scope once prebake-freeze lands. `HANDOFF-band-fold-fix.md` (+ `HANDOFF-junction-band-thorns-FINDINGS.md`).
- **⭐ Perpendicular-join protrusion (RE-CLASSED 2026-06-05, Jacob's eye).** The "bulge at the base of some T intersections" + **Benton's stem-joint protrusion** are ONE class: *a path meeting another perpendicularly → a spurious polygon protrusion opposite the meeting.* **NOT (just) band-fold** — a **junction-construction** artifact, same family as the false corner + the fold-at-join (the face-walk/fillet manufacturing spurious geometry at a junction). → folds into **E3** (broaden it to "clean every perpendicular junction," not just divided transitions). ⚠️ Visually-unified by the operator's eye; **the E3 spike must confirm the shared *code* root** (face-walk vs fillet vs band-fold) before assuming one fix lands all (the false-corner-saga discipline). Benton's full bless waits on this (the guard fixed only the collapse).
- **T4 — delete figure-ground** (`buildBlockGeometryV2` / `cornersAtIx`; coherence **C3/C4**) — after T3 migrates authoring off it.
- **Corpse-lie excision** — the code-side of every landed truth; via briefs at the code phase. `DOC-CODE-COHERENCE.md`.

## NEXT
- **Survey · Section · Stage rename** — decided; rides with T3 (⚠️ don't rename code until implemented).
- **Boundary-trio** — circle-SSOT, crop-to-circle-last, bake-time stencil-cull. `HANDOFF-boundary-trio.md`.
- **Asphalt-as-ribbon** — Survey-owns-SHAPE capability. `HANDOFF-asphalt-as-ribbon.md`.
- **Dead-end typology** — reframed as Survey-side authoring. `HANDOFF-dead-end-typology.md`.
- **Slab-content** — alleys / footways / overlays / highway-class asphalt.
- **Story-pass address-maps** — Meteorologist + Arborist (`[[project_story_pass_campaign]]`).

## LATER / PARKED
- **Onboarding / Intake** — Provincetown first run; designed, no code. `[[project_intake_onboard_process]]` · `[[project_real_tiny_town_spike_surface]]`.
- **⭐ Custom street data — import + manage (KIT)** — operator-measured per-street width/ROW/lanes is the **base-width source** (priority: custom → OSM → AASHTO; baked into the skeleton so the frame is born accurate, operator only tweaks). LS already has it: `raw/survey.json` (68 streets, 61 measured). The kit needs: **(a)** import it at onboarding *if the place has it*; **(b)** a canonical home/format; **(c)** a way to view/manage/edit it (it's operator authoring — existing tools, no new control class). Generalizes the LS `survey.json` into the Intake/Onboard flow. Docs: `SKELETON.md` (seed width-sourcing). *(The LS base-load fix — survey.json wins + propagates through divided splits — is **E1** in the divided-corridor/width build, NOW; this backlog item is the kit generalization, LATER.)*
- **Tile-bake footprint (P1) / curve-fineness (P3)** — parked; profile before cutting (`HANDOFF-tile-feature-ledger` E-rows).
- **Hosted bake service w/ auth** (v2+).
- **Hero keyframe FOV regression · TAA post-pass** — not urgent.
- **Doc-debt** — stale `BakedBuildings` refs in `ls/ARCHITECTURE.md` / `ls/reference/INVENTORY-DATA.md` / `RUNTIME-DELTA.md`.

## ⏸ AWAITING JACOB (QC / eye)
- **Grade-sep** faces-filtered + stroked-as-asphalt — live re-bake eye.
- **Buildings bake L1.3** · **Hero-tree LOD** · **Render-conformance Phases 4–7** (cold-review gate).

## 🏛 STANDING CAMPAIGNS
- **The living Process / doc-architecture** (`BOZ.md`) — now active as the doc campaign + the `DOC-CODE-COHERENCE` discipline.
- **Forensic audit + productization → Show Bible** — `HANDOFF-audit-{cartograph,arborist,ls-app,docs}`.

## 🛠 LIVE HANDOFFS (the dispatch layer — index)

| HANDOFF | what | bucket |
|---|---|---|
| skeleton-tile-hygiene | ✅ DONE (Lye, merged `06c394b`) — C1/C2/C9/C10/C11 excised; the writeFileSync drift gremlin killed via `io.js {touch:false}` | done |
| prebake-polygonization-scope | ✅ DONE (Mercator) → `PREBAKE-POLYGONIZATION-PLAN.md` (D1–D5 decomposition + validated spike; false corner is partly a DATA bug) | done |
| d1-carriageway-measure-hygiene | ✅ DONE (Gunter, `bbc3401`) — divided per-side measure hygiene | done |
| divided-corridor-model-scope | ✅ DONE (Alidade) → `DIVIDED-CORRIDOR-PLAN.md` (chains=inner-edge, constructed median, fold-at-join, rip-out ledger) | done |
| e1-custom-width-base | ✅ DONE (Lye, `2afeb0e`) — custom-width base baked into skeleton; major corner + many improvements (Jacob's eye) | done |
| benton-loop-guard | ✅ DONE (Stadia, `1bd711b`) — bad-data guard; both loops at sane widths (collapse fixed; Waverly pills gone). Role cross-sections = L.3 (later). | done |
| e2-constructed-median | ✅ DONE (Esplanade, `2d98861`) — constructed median (40 median + 60 merge); crossings-open rule; isMedianFacing/G3a retired; new `'median'` LU; Truman drop-off + island-pill cured; 43k m² reclaimed. **Shipped imperfect (Jacob 2026-06-06) — REFINE post-E3** (open: 53 m² Park-Ave piece, edge wobble; the E3 spike checks whether any sit at the transition noses E3 builds on). | done (refine later) |
| **e3-junction-cure-scope** | SPIKE: do the divided fold + (false) corner + perpendicular-join protrusion (T-bulges / Benton-stem) share a CODE root (one cure or several)? + polygon-first cure design on the E2 median edge → `JUNCTION-CURE-PLAN.md`; validate vs the 8 marks. THEN the build brief. | NOW — **dispatch-ready** (FRESH) |
| build sequence (D+E, in the plans) | **E1** ✅ → D2+E2 (prebake freeze + constructed median) → **D3+E3 (clean junction construction GENERALLY: divided folds + corners + perpendicular-join protrusions / T-bulges / Benton-stem — confirm shared code root in the spike)** → E4+D4 (rip-out inner-edge + retire C5) → D5 (perf). Parallel: brief F (north-void). | queued — Boz drafts each after the prior lands |
| **wall-phase-d** | the Wall as a real freeze — Section opens the frozen Survey data (Jacob's milestone, plumbing) | dispatch-ready (FRESH) — after the data cure for "correct data" |
| pipeline-reconception | tile re-pour umbrella (T1–T4) | NOW (context) |
| tile-feature-ledger | re-pour definition-of-done | NOW (reference) |
| tile-T3-authoring · survey-section-tool-design | polygonize Survey / authoring migration | NOW |
| name-logic-skeleton-pass | skeleton fortification (welds + kink-straighten) | NOW |
| band-fold-fix · junction-band-thorns-FINDINGS | thin-tile thorn clamp | NOW |
| boundary-trio | circle-SSOT + crop-to-circle | NEXT |
| asphalt-as-ribbon · dead-end-typology | Survey-side authoring capabilities | NEXT |
| render-conformance | env parity (DRAFT) | AWAITING (cold-review) |
| buildings-bake · tree-hero-lod | slab/3D | AWAITING (QC) |
| audit-{cartograph,arborist,ls-app,docs} | forensic pathology | STANDING |
| toy-to-stage-bake · cloud-specialist · dead-end-spike-prune | parked | LATER |
