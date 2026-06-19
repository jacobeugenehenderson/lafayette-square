# Brief — The Forest Builder v2: the Kit-Matcher (architecture → staged build)

> **Agent: FRESH.** This is a re-architecture of the Arborist's *front* (the organizing/findability/
> authoring layer). Fresh eyes formalize the settled design below + plan the build. *Why fresh: the
> v1 designer's session is closed, and this supersedes v1 — a clean read of the new architecture is
> the point.*
>
> **This brief ENCODES a design that is already settled** (a long operator design session,
> 2026-06-17/18). Your job is **NOT to re-design the tree builder** — it's to (1) formalize this
> into the canonical architecture doc, (2) produce a **staged, dispatchable build plan** with
> eye-gated acceptance, and (3) write the **keep/rebuild/retire ledger** against the current
> Arborist + Increment's audit. If you think any settled decision below is wrong, **stop and flag
> Boz** — do not silently re-litigate it.
>
> **PLANNING — no production code in this brief.** One write: your design doc to `scratch/`. The
> *build* dispatches in stages after Jacob ratifies the architecture (standup-before-build). Make the
> blueprint build-ready (data shapes, the rubric, the ingest procedure, the matcher, stage gates) —
> Stage 1 should be dispatchable the moment Jacob says go.

**You are the dispatched agent. Name yourself** — one word, novel, not on the project's name-trail
(check `arborist/NOTES.md` + recent commits). The name is yours.

---

## 0. The aim (operator's words — build from this, don't re-derive)

A **"fashion plates" kit for trees**: the user thinks *"I need a ⎽⎽⎽ tree"* (e.g. "London Plane"),
the system **consults a robust entry** for it and **presents workable chassis, bark, and leaf
*options*** from the library; the user **picks among the options**; if nothing's workable (or a
better model exists), a human decides to go get one. *"Theoretically we should be able to do almost
everything automatically, in a much more kit-like way."*

**The governing principle — "if it's not going to be automated, do the cognitive lift up front /
procedurally."** There is **no agent-loop automation at authoring time** (unlike the cloud Tuner's
quartet — see read-list; we take its *dossier/rubric*, not its agent swarm). Instead the intelligence
moves **upstream of the operator**: by the time a human sits at the viewer, the hard thinking is
done and they're *refining toward a known target*, not grinding sliders from zero. **This is
affordable because the plant kingdom is robustly annotated** — bark types, leaf shapes, arrangement,
growth habits, which species have which, reference imagery are all exhaustively documented. We
**harvest** that annotation; we don't invent it. Every sub-library (bark, leaf, chassis, species) is
therefore "a manageable list."

---

## 1. The architecture spine (the settled design)

**One shared rubric vocabulary** (harvested from botany) → **robust species entries / dossiers**
(keyed by common name, each with a reference image) → **parts auto-conformed + auto-tagged on
ingest** (chassis/bark/leaf, described in the rubric) → **the matcher** (turns a species name into
ranked **workable options** per part-type) → **the user picks** → **parametric leaf/bark primitives**
(few samples + ramps + knobs generate the library) → **a readiness dashboard** (per-species status) →
**the viewer redesigned so the controls *are* the rubric**, authored against the reference.

Built on the existing publish spine, not a fork: **recipe → single master atlas → InstancedMesh
batch.** The leaf-colorer and the bark fixes become **axes inside this**, not standalone patches.

### 1.1 The rubric (the keystone — assembled + settled)

The shared vocabulary both the entries and the parts speak. **Discipline (from the cloud Tuner):
atomic, orthogonal characteristics — completeness** (every characteristic has a knob that generates
it) **+ orthogonality** (each dial-able without disturbing the others). Plain-language, not
scientific nomenclature.

- **Chassis** — habit/silhouette (vase · columnar · oval · spreading · weeping · multi-stem/clumping
  · pyramidal · rounded · irregular) · size (real-m) · **lean (two intents: *correction* of a crooked
  model vs *morph* of an authored leaning variant — the rubric must distinguish them)** · branch
  density/texture. Articulation = **deep core catalog × deformer envelope** (lean/twist/density/season)
  — **NO limb modules** (locked; vendor stock is flat-merged, no branch graph).
- **Bark** — type (smooth · furrowed · plated · scaly · ridged · exfoliating · fibrous · mottled) ·
  color · master-shader knobs (groove_depth, plate_size, scale_frequency…).
- **Leaf** — silhouette (palmate · lobed · heart · ovate · lanceolate · compound · fan · star) ·
  **Ways/arrangement** (see §1.4) · size (legibility) · front/back · season-state · occupancy.
- **Overlay** — flowers · fruit/seed · **thorns** (honey locust) · seasonal props. Same card pipeline
  as leaves; resolution-order above the botanical default.
- **Age/maturity** — a **master dial** scaling deformer + size + bark coarseness together (young↔mature).

### 1.2 The dossier / species entry (the "robust entry")

Per common-name species: **reference image(s)** + plain descriptor + the **rubric values** (its
required characteristics) + the resolved **recipe** (chosen chassis + bark + leaf + knob settings).
**Seed already exists:** `arborist/species-map.json` is a thin proto-dossier today (label, scientific,
leafMorph, barkMorph, deciduous, tints, bark spec per species) — **make it robust + express it in the
rubric**, don't greenfield. Entries are **largely pre-populated** (habit/bark/leaf are documented
facts) and the operator *ratifies* — that's the cognitive lift, done up front.

### 1.3 Conform-and-tag on ingest (finish existing plumbing — consolidate, don't rebuild)

Every part auto-processes on ingest: **conform** (recenter to trunk origin · rescale unit-bugs ·
size to real-m · correct rotation/lean) — **this is the Brief 19/20/23 plumbing that was started and
never finished; finish it and run it on ingest** — and **auto-draft tags** into the rubric (habit
from chassis geometry: bounding shape + branch-angle stats; leaf morph from pack metadata; bark type
from the primitive). The auto-tag is a **draft the operator ratifies**, never gospel (proxy-isn't-
the-eye). Auto-tag is also what makes unified findability work across sources.

### 1.4 Leaf Ways (the missing axis — new)

**Arrangement / how cards attach + orient** — distinct from silhouette (one leaf's shape) and ramps
(color): *all-one-direction* (willow droop) · *mirrored across the twig* (opposite/pinnate) · *sprays
of leaflets* (locust compound) · *clusters/groups* (ginkgo fans on spur shoots). Lives on top of the
existing leaf-attachment anchor system (today leaves scatter on a cloud; arrangement is missing).
**Seed:** the May handoff named "cluster grammar," never built. **Load-bearing for willow/locust/
ginkgo identity.** Phyllotaxy is exhaustively annotated — another manageable list.

### 1.5 Parametric leaf + bark primitives (fewer samples, more mileage)

Both are the **same knob-turner**: a **luminance/silhouette substrate + gradient ramp(s) + knobs.**

- **Leaf:** one silhouette × ramps generates the states. **The gradient ramp IS the seasonal/state
  engine** — summer (deep-green ramp) / transitioning (green→gold→russet) / dead (brown), as a
  **day-of-year ramp curve**. **Front/back** = two ramps off one silhouette (the orphaned
  `tintFront`/`tintBack` + `doubleSided:true` already seed this — wire them). **Posterize** the leaf
  substrate to flatten chromatic noise (the "calm" half) before the ramp recolors (the "coherent"
  half). **Honesty:** ramps own color/value states + occupancy owns shed; a true *shape* change (dead-
  leaf curl) needs a second silhouette or alpha trick — **deferred edge, not v1.**
- **Bark:** the master-shader (6+ luminance platonics × {groove_depth, plate_size, scale_frequency,
  exfoliation_density, tint…}). The machinery exists (`barkGradient`/`barkPosterized`/`barkDetail` —
  verified in code) **but the current barks look bad and are listed opaquely** (`Bark003`/`Bark007` —
  the botanical type lives in `barkMorph` one field over but isn't surfaced as the name). **The
  unhelpful list is upstream of the bad quality** — you can't fix/source what you can't see. Organize
  barks into the annotated, referenced list (type + reference + sample) → gaps + targets become
  visible → quality becomes addressable. Mottled/exfoliating (Birch, Sycamore) is the hard case the
  May plan deferred (needs a second mask channel) — Birch forces it (§3).

### 1.6 The matcher (surfaces options; user picks)

Given an entry's required characteristics → **filter + rank the workable options per part-type** and
present them; the user **chooses** (pre-select only when there's exactly one). **"Workable" = a
tolerance match per axis** — a chassis tagged "spreading, fine" is workable for a London Plane's
"spreading" habit even if it's not literally a plane tree (the kit premise: a tree is a recipe, not a
literal model). The matcher must surface **how close** + which axes are **hard requirements vs nice-
to-have**, so the user can ratify or say "no, go get a real one." **Seed:** `leaf-pack-bindings.json`
is a proto-matcher (morphology→packs). Defining the per-axis tolerance ("close enough") is the real
engine work — and where human taste re-enters.

### 1.7 Import (one automated procedure, two triggers)

Ingest is **one automated procedure** (= §1.3 conform+tag; Brief 28's "+ Add Model" / upload
endpoint). **Agent/CLI-run for the buildout now** (fastest, no UI block); the **same procedure** gets
a user button as the kit matures (Brief 28). Human's permanent job = **ratify**, never plumb.
"Procure more" = run the procedure on a new asset.

### 1.8 The readiness dashboard (the Library view)

Each species row + a **per-part progress indicator: Chassis · Bark · Leaves.** Surfaces the 10
priority species' status, reveals **"buildable today"** (all-green freebies — **do not cap at 10;
sweep up every species whose parts are already in hand**), and shows exactly which part to procure
for the blocked ones. **Seed:** `roster-coverage.js` already tracks coverage — make it granular +
visual.

### 1.9 The viewer (controls = the rubric, against the reference)

Evolve the Salon Workstage (don't fork). The current 21-knob panel is "awkward + not quite right."
Replace raw sliders with the **rubric axes** (the same vocabulary you search by). **Show the
reference beside the live tree** (the cloud-Tuner's ground truth, as a UI element not an agent — "so
we know what we're going for"). Leaf authoring = **one orthogonal control surface**: pick a silhouette
from the matched options → the customizing axes (Ways, size, front/back, season, occupancy) appear
**pre-filled** from the entry + derivation → refine; the **"new leaf/import" tools are the gap escape
hatch** (surfaced only when no library silhouette is workable — one creation path, = the ingest
procedure, not a tool per leaf type). Same shape for bark.

### 1.10 Scope: Authored-only; LiDAR + Procedural are equal peers, kept, out of scope now

LiDAR and Procedural are **equal peer tracks** to Authored — kept alive (not retired; operator may
return to them), **distinct** (LiDAR isn't treated like Authored), and **never co-publish** with
Authored (taste, not a rule). **We work only on Authored now.** Design the navigation so the three
have equal standing; build only the Authored path.

---

## 2. The forcing function — the top 10 LS species (381 trees, ~50%)

From the manifest `src/data/park_trees.json` (756 placements, 89 species):

| # | Species | Count | Forces |
|---|---|---|---|
| 1 | Sugar Maple | 88 | palmate · canonical hero (the vertical-slice proof) |
| 2 | Green Ash | 50 | ⚠️ **compound leaf — no pack** |
| 3 | Silver Maple | 48 | palmate — *kit mileage* |
| 4 | Pin Oak | 42 | lobed (LeafSet016 in hand) |
| 5 | Red Maple | 33 | palmate — *kit mileage* |
| 6 | Flowering Crabapple | 28 | ⚠️ **ornamental chassis = 0 + flowers** |
| 7 | Sweetgum | 27 | star leaf (likely gap) |
| 8 | Redbud | 23 | heart leaf (in hand) + **flowers/ornamental** |
| 9 | Bald Cypress | 23 | ⚠️ **deciduous conifer, scale foliage — gap** |
| 10 | Birch | 19 | ⚠️ **exfoliating/mottled bark — the hard bark case** |

These deliberately span the whole system: a **kit-mileage core** (3 maples + oak → many trees from
shared palmate/lobed parts) + **completeness-forcers** (compound leaf, scale conifer, ornamental
chassis + flower overlay, exfoliating bark, star leaf). Getting these 10 perfect = the whole system
proven, not the happy path.

---

## 3. The staged build plan (you produce this in detail; gates are Jacob's eye on the lit app)

Sequence after the cloud-Tuner wisdom (build spine → prove on the easy case → force the gaps).
Each stage: rides the **single master atlas** (bloom constraint — no multi-page) + the **one pipeline**
(no fork); acceptance = **Jacob's eye on the running app**, never a proxy render.

- **Stage 0 — the keystone:** the rubric + dossier shape + the **10 species entries harvested**
  (robust, from botanical annotation) + **reference images gathered**. Nothing renders; this is the
  vocabulary everything hangs off.
- **Stage 1 — the spine:** conform-and-tag-on-ingest procedure + part tagging + the matcher
  (options) + the readiness dashboard. Run ingest on the parts in hand; the dashboard now shows the
  real coverage.
- **Stage 2 — prove the kit (vertical slice first):** **one complete Sugar Maple end-to-end — every
  layer perfect — as the proof**, then the rest of the kit-mileage core (Silver/Red Maple, Pin Oak)
  from shared parts + parametric leaf/bark. This validates "fewer samples, more mileage."
- **Stage 3 — force the gaps (each is a deliberate, eye-gated cycle):** Ash → compound leaf · Bald
  Cypress → scale/needle conifer · Crabapple + Redbud → ornamental chassis + flower overlay · Birch →
  the exfoliating/mottled bark channel · Sweetgum → star leaf. Procurement via the import procedure.
- **Stage 4 — all 10 perfect + sweep the freebies** the dashboard reveals (any other species whose
  parts are already in hand).

---

## 4. Keep / rebuild / retire (write this ledger against Increment's audit `scratch/audit-arborist.md`)

- **KEEP (ride, don't fork):** the publish-loop · the single master atlas (`bake-look.js#unifyAtlases`,
  sha1 dedup) · `InstancedTrees.jsx` + the merge contract · the decimation levers · the bark
  gradient/posterize/detail machinery (the **engine** §1.5 builds on) · `tree-bounds.js` +
  `canopyByVariant` (leaf-size derivation) · wind/canary contracts · the two-gesture authoring/
  production split. **Seeds to evolve (consolidate, don't greenfield):** `species-map.json` (→ dossier),
  `roster-coverage.js` (→ readiness dashboard), `leaf-pack-bindings.json` (→ matcher).
- **REBUILD (the front — never coherently built):** the rubric vocabulary · robust dossiers · the
  matcher/options-picker · the readiness dashboard · the reference-driven viewer · conform-and-tag-
  on-ingest (finish Brief 19/20/23) · the full leaf model (Ways + ramps-as-season-engine + front/back)
  · the bark library *organization* + quality.
- **RETIRE:** the hero-LOD impostor/cull arc (`HANDOFF-tree-hero-lod.md`) — **no-cull is doctrine,
  all trees draw at every distance** (deleting it also clears Increment's §2 mis-aimed-classifier
  conflict for free). **This brief supersedes** the v1 design `cartograph/_archive/FOREST-BUILDER-DESIGN-v1-superseded-2026-06-18.md`
  (Espalier) — carry forward what still holds (cores×deformer, the calm-canopy leaf fixes as *axes*),
  supersede the rest. **Do NOT retire LiDAR/Procedural** (§1.10).

---

## 5. Read first (HARD GATE — read to the section before formalizing)

1. `ORIENTATION.md` — kit mental model; "shape automatic, look hand-made"; the slab contract.
2. The **arborist quartet** end-to-end: `arborist/README.md` · `ARCHITECTURE.md` (publish-loop;
   heroes-on-fillers substitution; the **single master atlas** innovation; the decimation levers) ·
   `FEATURES.md` (Salon authoring) · `BACKLOG.md` · `NOTES.md` (why LiDAR/Procedural slowed; the
   compose-not-synthesize pivot).
3. `cartograph/_archive/FOREST-BUILDER-DESIGN-v1-superseded-2026-06-18.md` (Espalier, v1 — **what you supersede**; carry cores×deformer +
   the leaf-fix mechanics, supersede the framing).
4. `scratch/handoff-2026-05-21-tree-builder-articulated-blank.md` — **the prior art**: the "Fashion
   Plates" doctrine, *tree = recipe*, the silhouette-platonic vocabulary, "cluster grammar" (=Leaf
   Ways), the canopy-depth overdraw solution. This vision was landed then orphaned — you're realizing it.
5. `meteorologist/TUNER.md` — the **dossier/rubric tags↔knobs model** (take the dossier + characteristic-
   rubric *artifact*; **leave the multi-agent quartet** — we're not automating authoring) — and
   `meteorologist/CLOUD-PHASE0.md` (the morphology-taxonomy *method*).
6. `scratch/audit-arborist.md` (Increment) — the as-built inventory for the keep/rebuild/retire ledger.
7. `scratch/brief-28-streamline-asset-intake.md` — the asset-intake / "+ Add Model" design (§1.7).
8. Part SoT + the manifest: `arborist/species-map.json`, `arborist/leaf-pack-bindings.json`
   (coverageGaps), `arborist/roster-coverage.js`, the bark refs `public/textures/bark/*`,
   `src/data/park_trees.json` (the 10 species), `src/components/treeAtlasMaterial.js` (where leaf
   color/front-back/tint resolve — and where the leaf currently bypasses the bark pipeline),
   `arborist/generate-salon.js` (`BASE_CARD_SIZE`; the leaf compose).

If anything contradicts this brief, **stop and flag Boz.**

## 6. Coordination boundary

The **render/post-process channel economy + DoF + mobile-thermal** are a **separate, parallel track**
(Jacob's Preview reorg + the channel-economy forensic `scratch/CHANNEL-ECONOMY-FORENSIC.md`). This
brief is the **asset/library/authoring kit** — the *look* of the trees (assets), riding the existing
render path. **Out of scope here:** DoF (deferred to romance-optional, decided separately), the
channel toggles/gauges, the no-cull *render* mechanics (the doctrine holds; the implementation is the
other track). The two tracks meet only at the channel-control surface, where the Preview reorg is the
SSoT and lands first — the tree channels *consume* it, never redefine it.

## 7. Deliverable

A single doc: **`scratch/FOREST-BUILDER-KIT-MATCHER.md`** (or a better name, in `scratch/`). Commit it
(untracked otherwise = lost). Contents: the formalized architecture (§1), the rubric spelled out
completely (the keystone), the dossier + matcher data shapes, the staged build plan (§3) with
per-stage acceptance gates, and the keep/rebuild/retire ledger (§4). End with **"For the Boz/Jacob
review"** — the 3–5 decisions that need Jacob's eye **before Stage 1 dispatches** (lean recommendation
+ one tradeoff each; prose, per `feedback_design_via_prose_discussion`). Candidates already known to
need his eye: the **per-axis tolerance basis** for "workable" (§1.6 — the real engine), and how much
of part-tagging is reliably **auto-derivable vs. human-ratified** (§1.3).
