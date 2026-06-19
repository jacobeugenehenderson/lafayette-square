# Brief — The Forest Builder: an Arborist design pass (planning only, no code)

> **Agent: FRESH.** A from-the-canon design pass wants fresh eyes; no warm agent holds
> relevant in-context state (every prior tree agent's session is closed). Read the settled
> canon first, then design. *Why fresh, in one line: this is a re-think of the helper's
> shape, and the value is a clean read of what's settled vs. what we're deliberately retiring.*

**You are the dispatched agent. Name yourself** — one word, novel, not already on the
project's name-trail (check `arborist/NOTES.md` + recent commits before you choose). The
name is yours; no theme suggested. You own this design end-to-end.

**This is PLANNING ONLY. Write no code. Touch no pipeline.** Your single deliverable is a
design document. Canonical docs are READ-ONLY for you; you may *recommend* changes to them,
not make them. Your one write is the design doc itself, to `scratch/` (see Deliverable).

---

## Why this exists — the operator's framing (don't re-derive; build from it)

Jacob's call, 2026-06-17, verbatim in spirit:

> "Collect pieces of chassises and leaves which would allow us to have a fully articulated,
> morphable, customizable, buildable **forest builder**. Currently: no LiDAR, no procedural,
> only authored and curated."

Today the **Salon** authoring path composes *whole* de-leafed vendor chassis + whole
leaf-packs into a tree. Jacob wants this **finer-grained and morphable**: a curated **kit of
parts** (chassis-pieces + leaves + bark + overlays) an operator assembles and tunes into any
tree, and from many trees, a forest. The Forest Builder is an **evolution of Salon**, not a
parallel system — it rides the same publish-loop and the same runtime consumer.

### Three decisions are FIXED inputs (Jacob, 2026-06-17) — design *to* them, do not reopen

1. **Curated-only. LiDAR and Procedural are retired.** The Scan/LiDAR track (`bake-tree.py`,
   `lidar_extract.py`, `lil_vera*.py`, the three parallel skeleton extractors) and the
   Procedural track (`generate-procedural.js`, `spaceColonization.js`, the procedural heroes)
   are **dead paths**. Parts come *only* from harvesting + normalizing curated vendor stock
   (the 141 de-leafed chassis + the leaf packs). Nothing generated, nothing scanned. Your
   design says what replaces them and recommends their retirement (you don't delete code).
2. **Whole canopy, no cull — every tree draws at every distance.** This kills *both* halves
   of the paused hero-LOD arc (`HANDOFF-tree-hero-lod.md`): the impostor producer **and** the
   cull tier. There is no tiering by hero prominence. Consequence for you: the kit lives under
   a **hard per-tree budget** so the *entire* canopy can draw on a phone. That budget is a
   first-class design constraint, not a downstream optimization. (Aesthetics + perf are
   co-equal, 49/51 — the kit must be cheap *and* beautiful.)
3. **Two known leaf defects are SYMPTOMS — solve them systemically, not as patches.**
   - **(A) Leaf scale is wrong per-species.** Some species' leaves are so small they vanish
     at street/hero distance → the chassis reads as a *bare winter tree*. Leaf size is set
     implicitly at compose/attachment time (no explicit authored knob — grep confirms). The
     Builder must make **correct, legible leaf scale true by construction.**
   - **(B) Leaf color is un-normalized — some neon green, some muted.** Per-species `tints`
     in `species-map.json` are hand-set with no shared palette; the shader adds per-instance
     hue jitter on top; the raw leaf PNGs vary. The Builder must impose a **normalized leaf
     palette discipline** (a coherent green-band with intentional, bounded variation).

   These are the *acceptance lens* for the design: a reader should be able to point at the
   design and say "this is why no tree will ever look bare, and why the canopy reads as one
   coherent palette." If the design doesn't make that obvious, it isn't done.

---

## Read first — the canon, in this order (HARD GATE: read to the section before designing)

You are designing the shape of a mature, accreted helper. Re-deriving what's settled is the
recurring expensive failure here. Read, then design from what's settled:

1. `ORIENTATION.md` (root) — the kit mental model + the dependency chain (what a "helper" is,
   what "shape automatic / look hand-made" means, the slab contract).
2. `arborist/README.md` — the runtime contract + the quartet map.
3. **The arborist quartet, end to end:**
   - `arborist/ARCHITECTURE.md` — the load-bearing patterns: the **publish-loop applied**, the
     **two-tier heroes-on-fillers substitution**, the **single master-atlas** innovation
     (sha1 dedup → one color + one normal PNG → 2 material binds), the leaf-decimation levers.
     This is what your design must *ride*, not fork.
   - `arborist/FEATURES.md` — the shippable surface (Salon-default authoring; the four paths).
   - `arborist/BACKLOG.md` — the in-flight Salon arc + open items.
   - `arborist/NOTES.md` — the dated decision record (why Procedural slowed, why LiDAR shelved
     at N.3.0, the Salon "compose not synthesize" pivot). Mine it for *what was already tried*.
   - `arborist/SPEC.md` — the original v1 build spec (largely shipped; context).
4. **`scratch/audit-arborist.md` (Increment, 2026-05-27)** — the as-built forensic inventory
   of the entire tree pipeline with cruft classifications (real / duct-tape / vestigial /
   doc-drift). **Absorb this as your inventory — do not re-audit.** It already tells you what's
   live, what's dead, and where the bodies are. (Note: its §2/§7 hero-LOD findings are now
   moot — decision #2 kills that arc — but its pipeline map and cruft census stand.)
5. The leaf/parts source-of-truth files, to ground the parts model in reality:
   `arborist/leaf-pack-bindings.json`, `arborist/species-map.json` (per-species tints, bark
   morphs, leaf morphs), `arborist/leaf-attachment-defaults.json`, `arborist/survey-deleaf.js`
   + `scratch/brief-0-vendor-tree-survey-whittle.md` (the 141-chassis survey + coverage gaps —
   ornamental morphology = 0, tail-of-roster species skipped), `arborist/generate-salon.js`
   (the live compose path), `src/components/treeAtlasMaterial.js` (the one shared material —
   where leaf color/tint/jitter actually resolve), `src/components/InstancedTrees.jsx` (the
   runtime consumer + the `stampTreeVertexAttrs` merge contract).

If anything you read **contradicts this brief**, stop and flag Boz before designing around it.

---

## What the design document must work out

Design the **Forest Builder**. The doc is the deliverable; these are its required sections.
Lead with prose and diagrams, not a feature checklist. Where a choice has a real tradeoff,
state it and make a recommendation (don't enumerate options endlessly).

1. **The parts taxonomy — the heart of it.** What is an *atom*? Define the part kinds
   (candidates: trunk/chassis cores, branch/limb modules, leaf clusters, bark skins, flower/
   fruit/seasonal overlays) and the **composition grammar** — how parts snap together into a
   tree (attachment points, sockets, the role `tips-N.json`/leaf-attachment-tags plays today).
   Ground it in what `survey-deleaf` + the leaf packs actually give us. Be concrete about
   where the *pieces of a chassis* come from when we're curated-only (can a vendor chassis be
   decomposed into reusable limb modules? at what cost? or are "pieces" authored cuts?).

2. **The morph / articulation envelope.** What is tunable on a built tree, and within what
   bounds? (branch angle, limb length/count, canopy density, overall height, lean/asymmetry,
   season). Define the **morph parameters** and their ranges. Reconcile with the existing
   per-instance runtime jitter (Y-rot, XZ/Y scale, hue, wind phase) so authored morph and
   runtime jitter don't fight. Distinguish **author-time morph** (defines the variant) from
   **runtime jitter** (breaks repetition between instances of one variant).

3. **Leaf scale + color, designed-in (the acceptance lens).** Spell out exactly how the parts
   model makes **(A)** legible leaf scale automatic (per-morph real-meter leaf sizing tied to
   canopy bounds, with bounded author override) and **(B)** a **normalized leaf palette**
   (target green-band; how per-species `tints` relate to it; how/whether to rein in the shader
   hue jitter; whether normalization lives in the source PNGs, the atlas bake, or the shader —
   recommend one home). This section must read as the *fix* for the two symptoms.

4. **The curation workflow.** Curated-only means a human harvests + normalizes parts. Design
   that loop: how an operator pulls a part out of vendor stock, normalizes its scale/orientation/
   color, tags its morphology, and commits it to the catalog. What's the catalog's shape on
   disk? How does it stay deterministic + pristine (publish-loop conventions)?

5. **The authoring UX — how you *build* a tree.** The operator experience in `/arborist`: from
   the parts catalog → assemble → morph → preview → adopt as a variant → bake. Evolve the Salon
   Workstage; don't invent a parallel surface. Sketch the regions/flow (ASCII mockups welcome).

6. **The data model + pipeline impact.** How a built tree and its morph state serialize
   (operator state under `arborist/state/`, the static `config.json` defaults split). What
   changes in the publish-loop (`publish-glb.js` / `bake-look.js` / `bake-trees.js`) and what
   stays untouched. **Hard rule: ride the single publishing channel + the one master atlas +
   the 2-bind runtime material. Do not fork the pipeline** (`feedback_no_parallel_pipeline`).
   Confirm the per-tree budget (decision #2) is met — give a target tri/overdraw envelope and
   show the kit can hit it for a whole-canopy draw.

7. **The migration + retirement plan.** What of the as-built system the Builder **keeps**
   (master atlas, heroes-on-fillers substitution, `InstancedTrees`, the decimation levers),
   what it **evolves** (Salon → Forest Builder), and what it **retires** (Procedural + LiDAR
   tracks per decision #1; the impostor/cull arc per decision #2 — recommend deleting
   `HANDOFF-tree-hero-lod.md`'s machinery, name the files, but **don't delete them**). Stage it:
   what's the smallest first increment that proves the parts model, and what's the full arc?

8. **Open questions + risks for the Boz/Jacob review.** What you couldn't resolve from the
   canon; the creative forks that are genuinely Jacob's call (his eye, his will); the coverage
   gaps (ornamental morphology = 0 today — does the Builder need new harvested parts before it
   can populate the real LS roster?).

---

## Deliverable

A single design doc: **`cartograph/_archive/FOREST-BUILDER-DESIGN-v1-superseded-2026-06-18.md`** (or a better name you choose,
in `scratch/`). Self-contained, citing the canon sections it builds on. End with a **"For the
Boz/Jacob review"** section: the 3–5 decisions that need Jacob's eye before any code is
scoped, each framed as a lean recommendation + the one tradeoff (per
`feedback_design_via_prose_discussion` — prose, not a question-tool).

**Commit boundary:** you may commit the design doc to `scratch/` (it's untracked otherwise and
must not be lost). Nothing else. No pipeline files, no canon docs, no runtime code. If you find
yourself wanting to "just fix" leaf scale or a tint while you're in there — **don't**; capture
it in the design and flag it. The whole point is to plan the systemic fix, not patch a symptom.

**Check in with Boz** if: the canon contradicts a fixed input above; the parts model implies
forking the pipeline (it shouldn't — flag if you think it must); or the per-tree budget can't
be met without culling (decision #2 says no cull — if that's infeasible, that's a Jacob call,
surface it immediately).
