# The Forest Builder — a design pass (planning only)

> **Author: Espalier** (a fresh, from-the-canon design agent. *Espalier* — the horticultural
> art of training a tree into a deliberate, built form; the right verb for a curated, assembled
> forest.) Dispatched 2026-06-17 against `scratch/brief-arborist-forest-builder-design.md`.
> **No code was written. No pipeline was touched.** This document is the only deliverable.
> It builds on the settled Arborist canon and cites the sections it rides.

---

## 0. Thesis (read this first)

The Forest Builder is **Salon, finished** — not a parallel system. Today's Salon already composes
**chassis + bark + leaves** from curated libraries through the publish-loop, the single master
atlas, and the 2-bind runtime material (`arborist/FEATURES.md §Salon mode`;
`arborist/ARCHITECTURE.md §Grove single master atlas`). The Forest Builder makes that composition
**finer-grained, morphable, and legible-by-construction**, and it does so by adding *discipline and
derivation*, not new pipelines.

Three things change, and only three:

1. **Parts become typed atoms with a composition grammar** (§1). The "pieces of a chassis" Jacob
   wants are, in v1, **part-TYPES** (chassis-core · bark-skin · leaf-pack · overlay) plus a curated
   catalog of chassis-core *variants*. Intra-tree **limb modules** are a deliberate non-goal for v1
   — the vendor stock can't cheaply yield them (§1.4), and we don't need them: articulation comes
   from the **deformer envelope** (§2), not from snapping branch-legos.

2. **Morph is an explicit envelope** (§2) that already half-exists as the per-instance deformer
   (Brief 3A — lean/twist/wander). The Builder promotes it from a runtime jitter range to an
   **author-time morph** that *defines a variant*, with runtime jitter layered on top, cleanly.

3. **Leaf scale and leaf color stop being accidents** (§3). Both of Jacob's named defects are
   *absence-of-derivation* bugs: leaf size is a unitless constant today, and leaf color is the raw
   vendor PNG with no normalization. The Builder makes legible real-meter leaf scale and a
   normalized green-band **true by construction**, at the bake, riding the LUT machinery the bark
   path already shipped.

Everything else — the publish-loop, the sha1-deduped master atlas, `InstancedTrees.jsx`, the
heroes-on-fillers substitution, the decimation levers, the wind/canary contracts — is **kept and
ridden**. Two whole tracks are **retired** (Procedural, LiDAR — decision #1) and one paused arc is
**deleted, not finished** (hero-LOD impostors + cull — decision #2). The net is a *smaller* system
that does more.

> **The acceptance lens (Jacob's two symptoms), stated up front so the rest can be checked against it:**
> *No tree will ever read as a bare winter chassis* because leaf-card size is **computed from canopy
> bounds in real meters against a legibility floor** (§3.1), not a constant. *The canopy reads as one
> coherent palette* because every leaf samples a **normalized green-band LUT baked once per Look**
> (§3.2), with bounded, intentional variation — instead of each vendor pack's raw, un-reconciled RGB.

---

## 1. The parts taxonomy — what is an atom?

### 1.1 The four part-types (the atoms)

A built tree is a **composition** of four typed parts. Three of the four already exist as Salon
slots; the fourth (overlay) is designed-in but largely unbuilt.

| Part-type | What it is | Where it lives today | Atom granularity |
|---|---|---|---|
| **Chassis-core** | A de-leafed wood skeleton: trunk + scaffold branches, recentered to dominant-trunk base at origin, Y-min 0, real-meter height. | `public/trees/_chassis/<name>.{glb,meta.json}` (241 chassis; `survey-deleaf.js`; Brief 0/20/23). | **One whole de-leafed tree.** *Not* sub-tree limbs — see §1.4. |
| **Bark-skin** | A photo-PBR material reference + UV scale + tint base + roughness + (Brief 2) a multi-stop gradient ramp. | `public/textures/bark/<ref>/`; authored into `composition.bark`. | One material binding, cousin-shared across species (sha1-deduped in the atlas). |
| **Leaf-pack** | An RGBA card texture (Color RGB × Opacity alpha) + a `meta.json` carrying `morphology`, `naturalSize` (cm), `recommendedSpecies`. | `public/textures/leaves/shapes/<pack>/` (10 packs; Brief 1.5e). | One card-sheet per morphology; attaches as a separate primitive (no geometry surgery — Brief 0 §"re-leaf utility"). |
| **Overlay** | Seasonal / art-direction additions: flowers, fruit, fall-litter, per-Look props (Halloween bats, etc.). | Designed in `arborist/ARCHITECTURE.md §Phase F Layer 3` (per-Look override packs); largely unbuilt. | Same card pipeline as leaf-pack; resolution-order *above* the botanical default. |

The **composition** that snaps these together is the existing record at
`arborist/state/<species>/compositions.json` (`arborist/FEATURES.md §Composition data model`):

```json
{ "chassis": "<core>", "bark": {…}, "leaves": {…},
  "deformer": { "range": {…} }, "transform": {…} }
```

This is the grammar. The Forest Builder's parts taxonomy is **this record, with two atoms made
honest** (leaves gain a derived real-meter size + a normalized palette binding, §3) and **one atom
added** (overlay as a first-class season/art-direction slot, §2's season axis).

### 1.2 The composition grammar — how parts snap

Composition is **attach, not weld**. Three mechanisms, all already in the canon:

- **Chassis-core is free geometry** (`arborist/FEATURES.md §keying spine`). Any core serves any
  roster species; the core's own `source.species` keys nothing. Picking a core *is* the assignment.
  This is the load-bearing simplification — there is no per-part compatibility matrix to maintain.

- **Leaves attach at points, not sockets.** The chassis carries `leafAttachmentTags` (operator-
  authoring field). When empty, `generate-salon.js` samples a deterministic point-set from the
  chassis upper-bbox volume (mulberry32-seeded by `hash(chassis|bark|pack)`) so there is always
  something to author against (`arborist/FEATURES.md §Leaf emission stub`). Leaf cards are emitted
  as their own primitive onto those points — **no merge with the wood mesh** (Brief 0 §6 hint).
  This is the role today's `tips-N.json` plays for the procedural path: an anchor cloud.

- **Bark + overlays are per-draw uniforms / extra primitives**, not geometry edits. Bark is a
  retint of the wood fragments (`treeAtlasMaterial.js`, gated by the per-vertex `aBark` attribute);
  overlays are additional card primitives in the same atlas. Nothing about snapping a new bark or a
  new overlay touches the chassis geometry.

So the "snap" is: **pick a core → stamp a bark uniform set on its wood → scatter a leaf-card
primitive on its anchor cloud → (optionally) scatter an overlay primitive.** The publish step
(`generate-salon.js → publish-glb.js`) bakes that into one variant GLB; the look bake
(`bake-look.js`) folds its tiles into the master atlas. **This is the existing path, unchanged.**

### 1.3 The chassis-core catalog (where the cores come from, curated-only)

Under decision #1, cores come **only** from harvesting vendor stock through `survey-deleaf.js`,
which already: de-leafs (classifies WOOD vs LEAF primitives via the shared
`atlas-kind-classifier.js`), recenters to dominant-trunk origin (Brief 20), rescales unit-bug
outliers (Brief 23, `>100m → ÷10^k`), and splits multi-tree forests into per-tree cores (Brief 23
`surveyTrunkClusters`, gated at ≥3 trunks). Brief 0's survey already covered the dominant LS species;
the known gap is **ornamental morphology = 0 clean chassis** (Brief 0 §3) and a tail of no-wood /
ambiguous stock the classifier skips.

For the Forest Builder this catalog is **the source of articulation variety**: 241 cores across
broadleaf (91) / columnar (15) / weeping (7) / conifer (10) / unknown (18) is already a deep bench,
and the deformer envelope (§2) multiplies each core into a continuum of reads. The catalog's job is
*coverage of silhouette archetypes*, not coverage of every species — substitution + morph fill the
rest.

### 1.4 The honest answer on "pieces of a chassis" (limb modules)

Jacob's framing — *"collect pieces of chassises"* — implies sub-tree **limb modules** you'd assemble
like legos. **I recommend against building that for v1, and the canon says why:**

- Vendor chassis arrive **flat-merged**: 1–3 WOOD primitives total, no walkable per-branch node
  graph (`arborist/FEATURES.md §Decimation`, Levers 1+2 "dropped before code"; Brief 6.1 cooled for
  exactly this reason). You cannot address "a limb" because the data has no limbs — only a wall of
  triangles.
- The only decomposition that *is* cheap is **spatial trunk-clustering** (Brief 23) — which separates
  whole *trees* in a forest mesh, not branches within one tree. Going from trunk-clustering to
  branch-order segmentation on a flat mesh is the crown-interleave problem (Brief 22 §open question)
  — genuinely hard, and it buys morph variety we can get more cheaply elsewhere.
- **Authored cuts** (an operator selecting a limb in Blender / an in-app cut tool and exporting it as
  a reusable module) are *possible* but expensive per-part hand-work — the opposite of the
  curate-then-derive economy the kit runs on.

**The recommendation:** in v1 the "pieces" are **part-TYPES** (§1.1) and **whole chassis-core
variants** (§1.3). Intra-tree limb modules are a **flagged R&D fork** (§8), justified only if the
deformer envelope (§2) proves unable to reach a silhouette Jacob wants. The articulation Jacob is
after — *fully articulated, morphable, customizable* — is delivered by the **deformer envelope on
composable part-types**, which is cheap, already half-built, and rides the single shader program.
This is the single most important scoping call in the design, so it's the first item in §8.

---

## 2. The morph / articulation envelope

### 2.1 The clean split: author-time morph vs runtime jitter

The brief's central reconciliation question. The answer the canon already points to:

- **Author-time morph DEFINES A VARIANT.** It is a *named composition* the operator adopts. It
  serializes into `compositions.json` and **bakes into the published variant GLB** (geometry that
  ships through the slab). One morph = one variant the substitution lottery can pick.
- **Runtime jitter BREAKS REPETITION between instances of one variant.** It is per-draw / per-vertex,
  hashed off `treeId` (rotation, XZ/Y scale) and the instance anchor XZ (the Brief 3A deformer:
  lean/twist/wander; hue jitter on bark). It ships as *ranges*, not values, and never changes the
  variant's identity (`arborist/ARCHITECTURE.md §Per-instance deformer`).

These don't fight **as long as they live at different layers**, which today they already do — except
the deformer is currently *only* a runtime range. The Forest Builder's move is to let the operator
**pin a point inside the deformer range as the variant's authored morph**, while the range continues
to spread instances around that point. Concretely: a variant authored at lean-azimuth 30°/8° still
gets per-instance ±jitter around 8°, but its *identity* is "the leaning one." Author-time morph =
the center; runtime jitter = the spread.

### 2.2 The morph parameters and their bounds

Drawn from what the canon already exposes (Brief 3A deformer + the existing transform gizmo +
the leaf/canopy knobs), grouped into one **morph envelope** on the composition:

| Axis | Parameter | Range (recommend) | Author-time or runtime | Source / home |
|---|---|---|---|---|
| **Stance** | lean azimuth + angle | 0–15° (base-planted, grows to top) | both (center + spread) | Brief 3A `uDeformLeanRange` |
| **Stance** | twist | 0–15° about Y | both | Brief 3A `uDeformTwistRange` |
| **Stance** | wander (centerline drift) | 0–0.5 m | both | Brief 3A `uDeformWanderRange` |
| **Frame** | overall height / uniform scale | 0.6–1.6× core height | author-time (variant) | `composition.transform.scale` (Brief 19) |
| **Frame** | orientation correction (tilt X/Z, rotateY) | author-time only | `composition.transform.rotation` (Brief 19, kept per Brief 20 decision) |
| **Canopy** | leaf occupancy (density) | 0.25–0.95 alpha | author-time | `composition.leaves.occupancy` |
| **Canopy** | leaf scale **multiplier** | 0.7–1.4× the *derived* size (§3.1) | author-time, bounded | redefined in §3.1 |
| **Season** | day-of-year phenology | 0–365, sampled at runtime | author-time anchors, runtime sample | year-long-tree doctrine (`arborist/ARCHITECTURE.md §Phase F Layer 2`) |

Two deliberate **non-parameters**: branch-angle / limb-count / scaffold-count are **not** morph
axes (they'd require the limb graph we don't have, §1.4 — silhouette variety comes from picking a
different chassis-core instead); and 3C-class canopy-asymmetry / per-branch jitter stay deferred
(they need inverse-transpose normals the deformer deliberately avoids, `arborist/ARCHITECTURE.md
§Per-instance deformer`).

### 2.3 Why this is enough articulation

The morphability budget is: `(241 cores) × (deformer continuum) × (bark/leaf/overlay choices) ×
(season)`. A single core at five deformer centers reads as five distinct trees before substitution
jitter even runs (`arborist/ARCHITECTURE.md §Per-instance deformer`: "one chassis → ~100 distinct
reads"). The forest's *variety* is multiplicative across the catalog without ever needing limb
surgery. This is the design's answer to "fully articulated, morphable" — **a deep parts catalog ×
a continuous deformer envelope**, not a combinatorial limb kit.

---

## 3. Leaf scale + color, designed-in (the acceptance lens)

This section is the *fix* for Jacob's two symptoms. Both are absence-of-derivation bugs; the fix is
to **add the derivation at the bake**, riding machinery that already shipped for bark.

### 3.1 Symptom A — leaf scale, made legible by construction

**Root mechanism (grounded in code).** Leaf-card size today is
`BASE_CARD_SIZE (0.5 m) × composition.leaves.scale (default 1.0)` in `generate-salon.js`, a
**unitless multiplier with no per-species real-meter knob** (confirmed by source trace). Every
species gets the same 0.5 m card at scale 1.0, so a leaf on a 30 m Linden is the same metric size as
one on an 8 m Magnolia. At hero/street distance the small-leaved species fall below a pixel and the
chassis reads as a **bare winter tree** — exactly Jacob's symptom (A). The `meta.json#naturalSize`
(cm) that Brief 1.5e added to every pack is **unused** — "operator slider remains the source of
truth" (Brief 1.5e "Doesn't fix").

**The fix — derive card size from canopy bounds against a legibility floor.** At bake, the card's
real-meter extent becomes:

```
cardSize = clamp(
    naturalSize_pack ,                       // botanical size from meta.json (cm → m)
    LEGIBILITY_FLOOR(canopyRadiusM),         // the "never bare" guarantee
    LEGIBILITY_CEIL(canopyRadiusM)           // don't tile a giant leaf on a sapling
) × leaves.scaleMultiplier                   // bounded author override, 0.7–1.4× (§2.2)
```

- `canopyRadiusM` (and `heightM`) **already exist** — `bake-look.js` emits them per rendered variant
  via the shared `tree-bounds.js` into `trees-atlas.json#canopyByVariant` (this is the *same*
  machinery the now-retired hero-LOD classifier was going to read, §7 — we **repurpose it** instead
  of deleting it). So the canopy's real-world size is in hand at the exact layer that bakes leaves.
- `LEGIBILITY_FLOOR` is the load-bearing term: a minimum card size **set so the leaf subtends ≥ N
  pixels at the canopy's *farthest design distance*** (hero pan distance for hero trees, street eye
  for street). This is the "no tree ever reads bare" guarantee, expressed as geometry, not a hope.
- The operator's `scale` slider is **redefined from absolute to a bounded multiplier** around the
  derived value (§2.2). The operator can nudge ±40%; they cannot accidentally set 0.3× and vanish the
  canopy. *This is what makes legibility true by construction* — the floor is enforced below the
  operator's reach.

**Why this home.** Scale must be derived where canopy bounds are known and where the leaf geometry is
actually built. `bake-look`/`generate-salon` is that place; the shader is the wrong home (it can't see
canopy bounds cheaply), and the raw PNG is the wrong home (size is per-composition, not per-texture).
This is a `generate-salon.js` change reading a `bake-look` artifact — **inside the single pipeline**,
no fork.

### 3.2 Symptom B — leaf color, normalized to a green-band

**Root mechanism (grounded in code).** Leaf color today is **100% the raw vendor pack PNG**. The
authored `composition.leaves.tintFront/tintBack` exist in the state file but are **orphaned — never
wired to any shader uniform or vertex attribute** (confirmed by source trace: leaf fragments hit the
`aBark`/`vBark` gate and bypass the entire bark retint pipeline; there is no `uLeafTint` analog).
The per-species `tints` in `species-map.json` (e.g. summer `#3a7b30`, `#3d6f30`, `#4a8a3a`,
`#2a5028`) are **authoring reference only — also unconsumed.** So whatever neon or muted RGB a vendor
baked into a pack PNG ships straight to screen, un-reconciled across the roster. That is Jacob's
symptom (B), exactly.

**The fix — a normalized leaf-gradient LUT, baked once per Look, sampled by luminance.** This is the
*leaf half of the already-shipped bark gradient* (Brief 2 / 2.1, `arborist/FEATURES.md §Bark gradient
maps`). Bark already: compiles a multi-stop ramp → a 256×1 sRGB LUT → packs it sha1-deduped into the
master atlas → the shader samples it by **per-pixel luminance** of the PBR texture (`luminance =
dot(rgb, vec3(0.299,0.587,0.114))`) → REPLACE. We do the **same for leaves**, with one addition:

- **A shared green-band palette discipline.** All leaf LUTs derive from one **canonical green-band**
  (a small set of season ramps: summer-deep, summer-light, the fall ramps) defined kit-wide. A
  species' identity is a *bounded offset within the band* — its `species-map.json` summer/fall tints
  become **constrained handles on the shared band**, not free RGB. The shader's existing per-instance
  hue jitter (the bark `jh*` channels) rides on top as *intentional, bounded* variation — and is
  **clamped to a small amplitude** so adjacent leaves vary without leaving the band.
- **Luminance-as-substrate means the raw PNG stops being the color source.** Just as bark made the
  vendor texture a luminance pattern under a palette LUT, leaves do too: the pack PNG contributes
  *shape and tonal structure*; the **LUT contributes the color**. A neon pack and a muted pack, sampled
  by luminance into the same green-band LUT, **come out the same green.** That is what reconciles the
  canopy to one palette by construction.

**Recommended home — the atlas bake (the LUT), not the PNGs, not the shader.** Three candidate homes;
pick one:

| Home | Verdict |
|---|---|
| **Re-author the source PNGs** to a common palette | ❌ Per-asset hand-work, fights the curate-then-derive economy, and re-locks color into geometry. Rejected. |
| **Normalize in the atlas bake (the LUT)** | ✅ **Recommend.** One green-band, compiled to sha1-deduped LUTs, sampled by luminance. Reuses the entire shipped bark-gradient machine. Per-Look art-direction (Halloween) rides the override layer cleanly. Palette is data, instantly re-tunable, no rebake of geometry. |
| **Shader-only clamp/normalize** | ⚠️ Can clamp hue jitter (we do, above) but can't impose a *target* palette without a LUT — the source PNG color still leaks through. Insufficient alone. |

This keeps the **single Bloom-stable shader program** (uniform-driven branch, the non-negotiable from
`arborist/ARCHITECTURE.md §Bark shader unification`) and rides the master atlas. The orphaned
`tintFront/tintBack` either get wired to the band handles or are retired in favor of the gradient
editor — an §8 cleanup call.

### 3.3 The acceptance statement

A reader can now point at the design and say: *no tree reads bare* because card size is derived from
canopy bounds against an enforced legibility floor the operator can't undercut (§3.1); *the canopy is
one palette* because every leaf's color is a luminance sample into one normalized green-band LUT, with
bounded jitter, baked once per Look (§3.2). Both fixes live at the bake, inside the one pipeline,
reusing shipped machinery.

---

## 4. The curation workflow (curated-only means a human harvests + normalizes)

Decision #1 makes curation the *only* source of parts. The loop, per part-type, riding the existing
deterministic/pristine publish-loop conventions (`arborist/README.md §Contract`):

**Chassis-core intake.** Drop vendor GLB(s) → `survey-deleaf.js` (de-leaf · classify · recenter ·
rescale · forest-split · emit `meta.json`). Today this is whole-library; Brief 28 (deferred) designs
the targeted **"+ Add Model"** single-asset mode + upload endpoint. The operator then curates in
Salon's Chassis section (Brief 1.5b): rename, approve/reject/unreview (`_chassis-curation.json`,
name-keyed so it survives regen). **Normalization is automatic** (recenter + rescale at source);
**orientation correction** is the per-composition gizmo (tilt/rotate/scale, Brief 19/20). The catalog
on disk is `public/trees/_chassis/<name>.{glb,meta.json}` — gitignored, **regenerable**, deterministic
(same source + same script → byte-identical, `arborist/FEATURES.md §Determinism`).

**Bark intake.** Drop a PBR pack at `public/textures/bark/<ref>/` → `extract-bark-detail.mjs` +
`extract-bark-posterized.mjs` auto-derive the detail + posterized sub-pages at bake. The operator
authors the gradient ramp in the Salon Bark panel. Normalization (the posterized substrate) is
automatic.

**Leaf-pack intake.** `compose-leaf-packs.mjs` composites vendor Color + Opacity → one RGBA
`shape.png` + a `meta.json` with **`naturalSize` (cm)** — which §3.1 promotes from documentation to
the real-meter scale driver, and **`morphology`** which drives auto-suggested defaults
(`leaf-pack-bindings.json`). **New normalization step the Builder adds:** the operator tags the pack's
place in the shared green-band (§3.2) — a single hue handle, bounded — instead of shipping its raw
palette.

**Overlay intake.** Same card pipeline as leaves (`public/textures/leaves/shapes/<pack>/`), tagged as
seasonal or per-Look art-direction.

**Catalog shape on disk** (all conventions already in place — the Builder adds no new top-level
location, only fields):

```
public/trees/_chassis/<core>.{glb,meta.json}          # cores (gitignored, regenerable)
public/textures/bark/<ref>/{color,detail,posterized,gradient?}.*
public/textures/leaves/shapes/<pack>/{shape.png,meta.json}   # meta.naturalSize → §3.1; meta.band → §3.2
arborist/state/<species>/compositions.json            # the built trees (operator state, gitignored)
arborist/state/_chassis-curation.json                 # approve/reject, name-keyed
arborist/leaf-pack-bindings.json + species-map.json   # morphology + palette handles (committed)
```

**How it stays deterministic + pristine:** parts are content-addressed (sha1 dedup in the atlas);
`writeIfChanged` keeps mtimes stable on no-op re-publish; state carries operator choices, static
config carries only defaults (`arborist/README.md §Contract`). The Builder adds discipline *fields*
to existing files — it introduces no new artifact channel and no new determinism surface.

---

## 5. The authoring UX — how you build a tree

**Evolve the Salon Workstage; do not invent a parallel surface** (brief §5, and
`feedback_no_parallel_pipeline`). The Salon already opens by default (Brief 18A), navigates by
**roster species** (Brief 26), and has the slot/viewport/perf-gauge scaffold. The Forest Builder is
**three additions** to that surface, not a new screen.

```
┌─ Arborist / Salon ────────────────────────────── LookPicker ·· Grove → ┐
│ ROSTER NAV │  ┌─ SLOT TABS  [Sugar Maple ·1·] [+]              ⬤dirty ┐ │
│ (have/need)│  │                                                        │ │
│ 🟢 Maple   │  │   ┌──────────────────────┐   PARTS RAIL               │ │
│ 🟡 Oak,Pin │  │   │                      │   ▸ Chassis-core  [pick ▾] │ │
│ 🔴 Ash     │  │   │     3D VIEWPORT       │   ▸ Bark-skin     [pick ▾] │ │
│ 🟢 Linden  │  │   │   (live composition,  │   ▸ Leaf-pack     [pick ▾] │ │
│   …        │  │   │    = published slab)  │   ▸ Overlay       [pick ▾] │ │
│            │  │   │                      │   ───────────────────────── │ │
│            │  │   │   Ground · Overhead   │   MORPH ENVELOPE  (§2)      │ │
│            │  │   └──────────────────────┘   lean ◑  twist ◑  wander ◑ │ │
│            │  │   perf: tris · cards · draws  height ◑  occupancy ◑     │ │
│            │  │   ☼ season ●────────────○──   leaf-scale ◑ (×derived)  │ │
│            │  │                               ───────────────────────── │ │
│            │  │   [↺ Reset] [✓ Adopt] [→ Canary]   SEASON ☼ [Jan…Dec]   │ │
│            │  └────────────────────────────────────────────────────────┘ │
└──── Re-publish species (stage to library) ────────── Grove: Bake (ship) ─┘
```

**Addition 1 — the Parts rail replaces three flat dropdowns with four typed pickers.** Chassis-core /
bark-skin / leaf-pack / overlay, each a thumbnail browser (Brief 18C designed this) filtered by
species morphology + approval state. The cousin-swap (one bark across many species) is visible-but-
implicit. This is the "kit of parts" surface Jacob asked for, made literal.

**Addition 2 — the Morph Envelope panel** (§2). Each deformer/canopy axis is a `DraftSlider` (the
shipped 150ms-idle-commit pattern). Two handles per stance axis (center = author-time morph, width =
runtime jitter spread, §2.1) shown as a range-slider so the operator *sees* "this variant's identity
vs the spread between its instances." **"Re-roll preview sample"** (Brief 3A) cycles one hashed
instance so the operator previews the jitter without leaving the slot.

**Addition 3 — the Season scrubber** (`☼`). A day-of-year slider that drives `uDayOfYear` in the live
preview (year-long-tree doctrine). The operator authors the phenology anchors (bud/summer/fall/shed)
and **scrubs to verify the tree is legible and on-palette in every season** — the §3 acceptance lens
made interactive. Leaf scale (§3.1) and the green-band LUT (§3.2) both update live, because **the
Salon preview IS the published artifact rendered live** (the load-bearing parity doctrine,
`arborist/ARCHITECTURE.md §Salon preview ↔ LS runtime parity`). If a leaf reads bare or neon in the
preview, it reads that way in LS — there is no daylight to cross.

**The flow** is unchanged in shape: `pick parts → morph → scrub seasons → Adopt (writes composition)
→ Re-publish species (stage to library) → Grove Bake (ship to slab)`. The two-gesture
authoring/production split (Brief 14) stays. The perf gauge (tris / leaf-cards / draws / programs)
stays as the author-time budget tripwire (§6).

---

## 6. The data model + pipeline impact

### 6.1 What serializes, and where

- **Operator state** (`arborist/state/<species>/compositions.json`): the built tree. Extends the
  existing schema with the **morph envelope** (§2.2 — already partly there as `deformer.range` +
  `transform`) and the **leaf discipline fields** (`leaves.scaleMultiplier` replacing the absolute
  `scale`; `leaves.band` handle replacing/【or feeding】 the orphaned `tintFront/back`). No new file.
- **Static defaults** (`arborist/config.json`, `decimation-defaults.json`, `leaf-pack-bindings.json`,
  `species-map.json`): the kit-wide green-band (§3.2), the legibility floor/ceil constants (§3.1),
  per-morphology defaults. The new global knobs live here, committed, with `.defaults.json` backstops
  per convention.
- **Published artifacts** (`public/trees/<species>/…` + `public/baked/<look>/…`): unchanged shapes.
  `manifest.json` already carries `bark`, `deformer.range`, gradient stops; it gains a `leaf` block
  (size + band) the same way. `trees-atlas.json` already carries `canopyByVariant` (the §3.1 input)
  and the gradient sub-atlas (the §3.2 mechanism) — it gains a `leafGradientByVariant` slot exactly
  parallel to `barkGradientByVariant`.

### 6.2 What changes in the publish-loop, what stays

| Stage | Change | Why it's not a fork |
|---|---|---|
| `survey-deleaf.js` | none required (catalog already produced); Brief 28 adds targeted intake later | additive operator tool |
| `generate-salon.js` | leaf card size reads `canopyByVariant` + `naturalSize` against the floor (§3.1); emits the `leaf` manifest block | reads an existing artifact; same emission path |
| `publish-glb.js` | **untouched** (decimation levers already shipped) | foundational stage stays frozen |
| `bake-look.js` | compiles the **leaf** gradient LUT into the master atlas (mirror of the bark LUT it already compiles) | reuses `unifyAtlases` + sha1 dedup; one more sub-page |
| `bake-trees.js` | **simplified** — the hero-LOD classifier is *deleted* (§7), not extended | net removal |
| `treeAtlasMaterial.js` | one uniform-driven leaf-color branch (mirror of the bark gradient branch) | single Bloom-stable program preserved |
| `InstancedTrees.jsx` | leaf path samples the leaf LUT; remove `aHeroTier`/QC (§7) | net removal + parallel add |

**The hard rule is met:** one publishing channel, one master atlas, the 2-bind runtime material. Every
addition is a *mirror* of a bark-side mechanism that already shipped through this exact path. No
parallel pipeline (`feedback_no_parallel_pipeline_for_scenes`).

### 6.3 The per-tree budget (decision #2 — whole canopy, no cull)

Decision #2 makes the per-tree budget a **first-class design constraint**: the *entire* canopy
(~745 placements, 39 variants, ~377 `url×tile` draw groups today — audit §1a) must draw at every
distance on a phone, with **no impostor tier and no cull**. The budget must therefore be met by the
**geometry tier and the overdraw discipline**, not by drawing fewer trees.

**Target envelope (recommend, to be confirmed against a mobile-profile run):**

- **Draw calls stay flat** — the single master atlas + 2 material binds means adding species/morph
  costs ~nothing in binds (sha1 dedup; `arborist/ARCHITECTURE.md §master atlas`). This is already true
  and is the reason no-cull is even thinkable.
- **Geometry: ship lod2 for the whole canopy** (already the production default; operator confirms it
  "looks great even at hero distance" — hero-LOD handoff finding #1). lod2 is the floor; the
  decimation brackets (Lever 4) bound per-tree tris.
- **The real constraint is overdraw (leaf-card fill-rate), not tris.** Set a **per-tree leaf-card
  ceiling** enforced at bake via the decimation brackets — Levers 3/5/6 already pull leaf prims down
  (Robinia −55%, Linden leaf −80%). Express the kit budget as *cards/tree × placements ≤ a canopy
  fill ceiling*, and let the bracket enforce it per variant. The §3.1 legibility floor and this card
  ceiling are the **two ends of one clamp**: big enough to read, few enough to afford.
- **The escape valve if mobile profiling fails the no-cull budget: Configuration D** (inner-mass as
  `THREE.Points`, zero alpha overdraw — `arborist/ARCHITECTURE.md §Configuration D`). It is *designed*
  but unbuilt, and it touches the runtime render path, so it carries fork-risk — **flag, don't
  assume.** It is the principled lever because it attacks overdraw (the actual cost) without culling.

**This is the design's biggest open risk.** "Whole canopy on a phone with no cull" is an assertion
that must be *measured*, not designed. Per the brief's check-in trigger, **if a mobile-profile run
can't hit the budget with lod2 + bracketed cards, that's a Jacob call** (accept Config-D's runtime
fork, or revisit no-cull). It is the first risk in §8 and a named review decision below.

---

## 7. Migration + retirement plan

### 7.1 Keep (ride, don't fork)

The single master atlas (`bake-look.js#unifyAtlases`, sha1 dedup) · the 2-bind shared material
(`treeAtlasMaterial.js`, single Bloom-stable program) · heroes-on-fillers substitution
(`bake-trees.js#pickVariant`, `qualityOverride`) · `InstancedTrees.jsx` + `stampTreeVertexAttrs` merge
· the decimation levers (3/4/5/6) · the wind + canary contracts · the bark gradient / detail /
posterized machinery (the **template** §3.2 mirrors) · `tree-bounds.js` + `canopyByVariant`
(**repurposed** as the §3.1 leaf-scale input — note this is the one piece of the hero-LOD prereq that
*survives*, because canopy bounds are useful independent of LOD) · `survey-deleaf.js` and the curation
surface · the two-gesture authoring/production split.

### 7.2 Evolve

**Salon → Forest Builder** (§5): four typed part pickers, the morph envelope panel, the season
scrubber. **Leaves: scale-by-derivation + green-band LUT** (§3). **`composition` schema:** leaf
discipline fields. All additive to files that already exist.

### 7.3 Retire (recommend deletion — **name the files, don't delete them**, per brief §7)

**Decision #1 — Procedural + LiDAR tracks (dead paths).** Recommend retiring:
`generate-procedural.js`, `spaceColonization.js`, `monopodialWhorl.js` (Phase E, never shipped);
`bake-tree.py`, `lidar_extract.py`, `lidar-publish.js`, `preview-laz.py`, and the three parallel
skeleton spikes `bidirectional_skeleton.py` / `lil_vera.py` / `lil_vera_v2.py`; the UI surfaces
`ProceduralWorkstage.jsx`, `LidarWorkstage.jsx`, and the legacy `Workstage.jsx`; the serve.js
`/procedural/*` and `/lidar/*` endpoint blocks; the `procedural_*` filler species rows once
substitution is re-pointed (see migration note below). *What replaces them:* nothing new — **curated
chassis-cores through `survey-deleaf` + the morph envelope** cover what procedural fillers and LiDAR
heroes were reaching for. The fillers' *role* (catch every un-authored roster species) is kept by
**substitution to a composed core**, not by a generated mesh.

> ⚠️ **Migration ordering for the fillers.** Today substitution leans on `procedural_broadleaf/conifer/
> ornamental/columnar/weeping` as the `quality:2` catch-all (`arborist/ARCHITECTURE.md §Two-tier
> substitution`). Before deleting those rows, the roster must route every park species onto a *composed*
> core (the Brief 26 / map-refresh work) — else the Grove bake substitutes nothing. **Retire fillers
> last, after composed coverage is complete.** This is the one sequencing hazard in the retirement.

**Decision #2 — the hero-LOD impostor + cull arc (`HANDOFF-tree-hero-lod.md`).** Recommend deleting its
machinery wholesale:

- `bake-trees.js`: `classifyHeroTiers` / the prominence-or-DoF-bands pass, `FALLBACK_HERO_TARGET`
  (`[400,45,-100]`), `heroTierMeta` emission, the `cull` tier.
- The slab field: per-instance `heroTier` in `default.json` (+ `heroTierMeta`).
- `InstancedTrees.jsx`: the `aHeroTier` runtime attribute.
- `treeAtlasMaterial.js`: the `treeHeroTierQC` uniform + the QC-tint shader injection; the
  `?heroTierQC=1` overlay.
- The Phase-B impostor producer and Phase-C runtime impostor path — **never built**, so this is
  deleting a plan, not code.

> **Bonus: this closes the audit's headline conflict for free.** Audit §2 flagged the heroTier
> classifier as scoring against the *wrong camera target* (~1200 m off, the
> `project_camera_framing_slab_contract` failure). Under decision #2 that bug doesn't need *fixing* —
> the whole classifier is **deleted**, so the conflict simply evaporates. The blocked-work ledger
> (audit §5) unblocks by removal. **Keep only `tree-bounds.js` + `canopyByVariant`** out of that
> prereq — repurposed for §3.1.

Also fold into the same retirement sweep the vestigials the audit already cleared (audit §1c, §3):
`public/baked/lafayette-square.json` (stale duplicate bake), the completed one-shot migration scripts
→ `arborist/_attic/`, and the two doc-drift header comments (`tree-bounds.js`, `build-index.js`). These
are independent of the Builder but the Builder's retirement commit is the natural moment.

### 7.4 Staging — smallest first increment → full arc

**Increment 0 (proves the parts model is *honest* — the acceptance lens, no new UX):**
1. **Leaf scale by derivation** (§3.1) — `generate-salon.js` reads `canopyByVariant` + `naturalSize`
   against a legibility floor; redefine the slider as a bounded multiplier. *Acceptance:* re-publish
   the existing roster, eyeball that no composed tree reads bare at hero/street. One file + a constant.
2. **Leaf green-band LUT** (§3.2) — mirror the bark gradient in `bake-look.js` + one shader branch.
   *Acceptance:* the canopy reads as one palette; a neon and a muted pack converge. Reuses shipped
   bark machinery end-to-end.

These two are the **proof of the whole thesis** (the symptoms are derivation bugs; the fix is at the
bake, inside the pipeline) and they ship without touching the UX or the retirements.

**Increment 1 (the parts UX):** the four-pane Parts rail + the Morph Envelope panel (§5 additions 1–2),
promoting the deformer range to an author-time center+spread (§2.1).

**Increment 2 (season + overlay):** the season scrubber (§5 addition 3) + overlay as a first-class
part-type, completing the year-long-tree integration.

**Increment 3 (retirements):** delete the hero-LOD arc (decision #2) — independent, do it early to
shed the audit-§2 conflict; then, *after composed roster coverage is complete*, retire the
Procedural/LiDAR tracks + the fillers (decision #1).

**Increment 4 (budget validation):** mobile-profile the whole no-cull canopy (§6.3). If it fails,
escalate the Config-D decision to Jacob. **This is a gate, not a guarantee** — sequence it before any
public ship of the full canopy.

---

## 8. Open questions + risks (for the Boz/Jacob review below)

- **Limb modules vs deformer envelope (§1.4).** The biggest scoping call. I recommend *no* limb
  surgery in v1 — articulation via deep core catalog × deformer envelope. If Jacob's "pieces of
  chassises" specifically means assemblable branches, that's an R&D fork with a real cost (authored
  cuts or branch-graph segmentation on flat-merged stock) and it needs his explicit will.
- **No-cull on a phone (§6.3).** The hard perf assertion. Must be *measured*. If lod2 + bracketed
  cards can't hit the mobile budget, the principled escape is Config-D points-canopy — which touches
  the runtime render path (fork-risk). Jacob's call if profiling fails.
- **Where the green-band lives + what happens to the orphaned `tintFront/tintBack` (§3.2).** I
  recommend the band lives in the atlas LUT and the orphaned per-composition tints either become the
  band handle or retire in favor of the gradient editor. A cleanup detail, but it touches the schema.
- **Ornamental coverage gap (Brief 0 §3: 0 clean ornamental chassis; `leaf-pack-bindings.json`
  coverageGaps: fan/fine-compound/tulip/scale).** The Builder can't populate the real LS roster's
  ornamentals/ginkgo/honeylocust until those parts are *harvested*. Does the Builder ship on the
  covered species first, with the gaps as a known shopping list (the Brief 24 coverage view already
  surfaces them)?
- **Retirement sequencing (§7.3).** The fillers must outlive the Procedural deletion until composed
  roster coverage is complete (the Brief 26 / map-refresh work). Confirm that ordering.

---

## For the Boz / Jacob review

Five decisions need Jacob's eye before any code is scoped. Each is a lean recommendation + the one
real tradeoff (prose, not a checklist — `feedback_design_via_prose_discussion`).

**1. Articulation comes from the deformer envelope, not limb modules.** I recommend the Forest
Builder's "pieces" be **part-TYPES (core / bark / leaf / overlay) + a deep chassis-core catalog**,
with morph delivered by the deformer envelope on whole cores — *not* assemblable branch-legos. The
tradeoff: this gives up literal limb-by-limb assembly (which Jacob's "pieces of chassises" phrasing
might want), in exchange for shipping on machinery that already exists and rides the single shader.
Limb surgery is real R&D on flat-merged stock; if Jacob wants it, it's a deliberate separate fork. *I
need to know: does "pieces" mean typed parts, or actual sub-tree limbs?*

**2. The leaf-symptom fixes are derivations at the bake, and they're Increment 0.** I recommend the
two acceptance-lens fixes ship *first and alone*: leaf-scale-from-canopy-bounds (§3.1) and the
normalized green-band LUT (§3.2), both mirroring shipped bark machinery. The tradeoff: this front-loads
the *systemic* fix (and proves the thesis) before any new UX — slower to a visible "forest builder
screen," faster to "no tree looks bare and the canopy is one palette." Recommended because it's
exactly Jacob's stated pain, and it de-risks everything after.

**3. Normalize leaf color in the atlas LUT, not the PNGs or the shader.** I recommend the green-band
live as a baked LUT sampled by luminance (the shipped bark pattern), with per-species tints demoted to
*bounded handles on the band* and the shader's hue jitter clamped. The tradeoff: we give up each vendor
pack's "authentic" baked color (some of which Jacob may like) for a coherent canopy — but per-Look
art-direction overrides still ride on top, so intentional palettes (fall, Halloween) are fully
expressible. *This is an aesthetic call: coherence-by-default vs per-pack fidelity.*

**4. Delete the hero-LOD impostor/cull arc now; it also clears the audit-§2 conflict.** Decision #2
already kills it; I recommend doing the deletion *early and independently*, because it removes the
mis-aimed-classifier conflict (audit §2/§5) for free and simplifies `bake-trees`. The tradeoff: we
commit to "whole canopy, every distance, no cull" as the standing doctrine — which means the per-tree
budget (decision #3 below) becomes load-bearing and must be validated on mobile. Recommended; the arc
was paused and mis-aimed anyway.

**5. The no-cull per-tree budget must be measured, and Config-D is the escape valve.** I recommend
expressing the budget as a *leaf-card/overdraw ceiling enforced at the decimation bracket* (the §3.1
legibility floor and this ceiling are one clamp), shipping lod2 for the whole canopy as today. The
tradeoff — and the one place this design could be *infeasible*: if a mobile-profile run can't draw the
full canopy without culling, the principled fix is Configuration D (points-as-inner-mass, zero
overdraw), which touches the runtime render path and is the one place I'd accept added complexity.
**This is flagged per the brief's check-in trigger: if the budget can't be met without culling, that's
your call, Jacob — accept the Config-D runtime work, or revisit no-cull.** Everything else in this
design is feasible on shipped machinery; this is the single assertion that needs a number, not a
drawing.

---

*Espalier · 2026-06-17 · planning only · design doc is the sole artifact.*
