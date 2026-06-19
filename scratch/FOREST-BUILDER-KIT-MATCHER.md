# The Forest Builder v2 — the Kit-Matcher (architecture → staged build)

> **Author: Florilegium** (a fresh, from-the-canon planning agent. *Florilegium* — a curated
> gathering of botanical reference plates; the right noun for a kit whose keystone is a robust,
> referenced species dossier, i.e. "fashion plates for trees.") Dispatched 2026-06-18 against
> `scratch/brief-forest-builder-kit-matcher.md`. **No production code was written. This document is
> the only deliverable.** It formalizes a design that was already settled in operator session
> (2026-06-17/18) and encoded in the brief — it does **not** re-design the tree builder. It builds on
> the settled Arborist canon and cites the sections it rides.

---

## 0. What this is, and what it supersedes

The Forest Builder is the Arborist's **front** — the organizing / findability / authoring layer that
sits on top of the already-working publish spine. The brief encodes the settled design; this doc turns
it into (1) the canonical architecture, (2) the **rubric spelled out completely** (the keystone),
(3) the dossier + matcher data shapes, (4) a **staged, dispatchable build plan** with eye-gated
acceptance, and (5) the **keep / rebuild / retire ledger** against Increment's audit.

**It supersedes `cartograph/_archive/FOREST-BUILDER-DESIGN-v1-superseded-2026-06-18.md` (Espalier, v1).** What carries forward, verbatim in
spirit: **articulation = deep chassis-core catalog × deformer envelope, no limb modules** (Espalier
§1.4/§2); **leaf scale + leaf color are absence-of-derivation bugs fixed at the bake** (Espalier §3);
**no-cull is doctrine; the hero-LOD impostor/cull arc is PARKED — dormant, not deleted** (Espalier §7.3; operator call 2026-06-18, same as LiDAR/Procedural — see §14). What changes: those
leaf fixes stop being a standalone "Increment 0" and become **axes inside the rubric** (the brief's
explicit reframe — "the leaf-colorer and bark fixes become axes inside this, not standalone patches");
and **Procedural + LiDAR are KEPT as equal peer tracks, not retired** — a deliberate reversal of
Espalier's decision #1, settled by the operator (§11 below; brief §1.10). Everything else in Espalier
that still holds is folded in; the framing is replaced by the kit-matcher spine.

**The one-line shape:** *one shared rubric vocabulary (harvested from botany) → robust species
dossiers keyed by common name (each with a reference image) → parts auto-conformed + auto-tagged on
ingest → the matcher turns a species name into ranked workable options per part-type → the user picks
→ parametric leaf/bark primitives generate the library from few samples → a readiness dashboard shows
per-species status → the viewer's controls **are** the rubric, authored against the reference.*

**The governing principle (operator's words):** *if it's not going to be automated, do the cognitive
lift up front, procedurally.* There is **no agent-loop automation at authoring time** (we take the
cloud Tuner's *dossier + rubric artifact*, not its agent swarm — `meteorologist/TUNER.md §2`). The
intelligence moves **upstream of the operator**: by the time a human sits at the viewer the hard
thinking is done and they're *refining toward a known target*, not grinding sliders from zero. This is
affordable **because the plant kingdom is robustly annotated** — bark types, leaf shapes, arrangement,
growth habit, reference imagery are exhaustively documented. We **harvest** that annotation; we don't
invent it. Every sub-library is therefore "a manageable list."

---

## 1. The architecture spine

```
        ┌──────────────────────────────────────────────────────────────────────┐
        │  THE RUBRIC  (one shared vocabulary, harvested from botany)  §2        │
        │  atomic · orthogonal · complete · plain-language                       │
        └───────────────┬───────────────────────────────────┬──────────────────┘
                        │ entries SPEAK it                  │ parts SPEAK it
                        ▼                                   ▼
        ┌───────────────────────────────┐   ┌──────────────────────────────────────┐
        │ DOSSIERS  (robust species      │   │ PARTS  (chassis · bark · leaf · overlay)│
        │  entries, keyed by common name)│   │  auto-CONFORMED + auto-TAGGED on ingest │
        │  §3 — ref image · required      │   │  §4 — recenter/rescale/orient + draft   │
        │  characteristics · recipe       │   │  rubric tags the operator RATIFIES      │
        └───────────────┬───────────────┘   └──────────────────┬───────────────────┘
                        │ required characteristics             │ part tags
                        └──────────────┬───────────────────────┘
                                       ▼
                        ┌──────────────────────────────────┐
                        │  THE MATCHER  §7                  │
                        │  per-axis tolerance → ranked      │
                        │  WORKABLE OPTIONS per part-type   │
                        └──────────────┬───────────────────┘
                                       ▼ surfaces options; user PICKS
                        ┌──────────────────────────────────┐
                        │  THE VIEWER  §9  (controls = the  │
                        │  rubric, authored vs the reference)│
                        │  + parametric leaf/bark §6        │
                        └──────────────┬───────────────────┘
                                       ▼ Adopt → Re-publish → Grove Bake
        ════════════ the EXISTING publish spine, ridden unchanged ════════════
        generate-salon → publish-glb → bake-look (single master atlas) → bake-trees
                                       ▼
                        ┌──────────────────────────────────┐
                        │  READINESS DASHBOARD  §8          │
                        │  per-species Chassis·Bark·Leaves   │
                        │  → "buildable today" + shopping list│
                        └──────────────────────────────────┘
```

Everything below the double line is **kept and ridden** (`arborist/ARCHITECTURE.md`): the publish-loop,
the sha1-deduped single master atlas (`bake-look.js#unifyAtlases`), the 2-bind Bloom-stable runtime
material (`treeAtlasMaterial.js`), `InstancedTrees.jsx`, heroes-on-fillers substitution, the
decimation levers, the wind/canary contracts. The leaf-colorer and the bark fixes are **axes inside
this spine**, not standalone patches. **No new pipeline, no fork** (`feedback_no_parallel_pipeline_for_scenes`).

The four things that are genuinely **new or rebuilt** — the rubric, robust dossiers, the matcher, the
readiness dashboard + reference-driven viewer — are all the **front**, the layer the canon never
coherently built. Three existing files are their **seeds**, evolved not greenfielded: `species-map.json`
→ dossier, `leaf-pack-bindings.json` → matcher, `roster-coverage.js` → readiness dashboard. **The seed
content is mined from the library as it actually exists** — we analyze, we don't greenfield (§13 Stage 0).

**A physical counterpart runs underneath:** the **Library Builder (§4.5)** is the filesystem analog of
the rubric — a background task of every ingest / authoring / ratify action that converges the on-disk
part tree toward one clean, canonically-named folder-per-part-type. The logical rubric organizes the
*concepts*; the Library Builder organizes the *files*.

---

## 2. THE RUBRIC — the keystone (spelled out completely)

The shared vocabulary both the dossiers and the parts speak. It is **the** load-bearing artifact: get
it right and the matcher, the dashboard, the viewer, and the ingest tagger all fall out of it; get it
wrong and every downstream layer inherits the confusion.

**Discipline (from the cloud Tuner, `TUNER.md §2`):** decompose to **atomic, orthogonal
characteristics** — a basis.
- **Completeness** — every characteristic has a knob (or a pick) that generates it. No quality the
  rubric names that the kit can't produce.
- **Orthogonality** — each axis is dial-able without disturbing the others, so stacked qualities are
  independently reachable.
- **Plain-language, not scientific nomenclature** — "spreading," not "deliquescent Troll's-model."

**The rubric is data** (`rubric.json`), not prose. It is the contract the entries declare *against* and
the parts are tagged *into*. Each axis carries: `id`, `partType`, `name`, `kind` (`enum` | `scalar` |
`ordinal` | `dual`), the value-set or range, the plain-language gloss, where it lives in code today,
whether it is reliably **auto-derivable** on ingest or **operator-ratified**, and an orthogonality
note. The schema mirrors the Tuner's `Atom` (`TUNER.md §8.2`) but describes *parts*, not shader knobs:

```jsonc
// rubric.json — one Axis record
{
  "id": "chassis.habit",
  "partType": "chassis",
  "name": "Habit / silhouette",
  "kind": "enum",
  "values": ["vase","columnar","oval","spreading","weeping","multi-stem","pyramidal","rounded","irregular"],
  "plain": "The overall shape you'd read from across the street.",
  "home": "chassis bbox + branch-angle stats; today implicit in survey-deleaf morphology guess",
  "tagging": "draft-then-ratify",          // auto | draft-then-ratify | human-only
  "orthogonality": "Independent of size — a small and a large tree can both be 'spreading'."
}
```

### 2.1 Chassis axes

| Axis | Kind | Value-set / range | Plain-language | Home in code | Tagging |
|---|---|---|---|---|---|
| `chassis.habit` | enum | vase · columnar · oval · spreading · weeping · multi-stem · pyramidal · rounded · irregular | The shape you read from across the street | bbox aspect + branch-angle stats; `survey-deleaf` morphology guess | draft-then-ratify |
| `chassis.size` | scalar | real metres (height); `canopyRadiusM` paired | How big the tree actually is | `tree-bounds.js` → `canopyByVariant`; Brief-20 recenter (Y-min 0) | **auto** |
| `chassis.lean` | **dual** | `{mode: correct\|morph, azimuth°, angle 0–15°}` | Is it leaning **because the model is crooked** (fix it) or **because this variety leans** (keep it)? | correct → `transform.rotation` (Brief 19); morph → deformer center (Brief 3A `uDeformLeanRange`) | human-only |
| `chassis.density` | ordinal | sparse · medium · dense | How much wood/branch texture fills the silhouette | leaf/wood prim tri-stats; or operator | draft-then-ratify |

**The lean axis carries two intents and the rubric must keep them distinct** (brief §1.1). *Correction*
is an author-time orientation fix (the gnomon gizmo, baked once into geometry — `ARCHITECTURE.md
§authored transform bake`). *Morph* is an authored leaning **variant identity** (a pinned point inside
the per-instance deformer range — `ARCHITECTURE.md §Per-instance deformer`). Same visual degree of
freedom, two completely different meanings; collapsing them is the bug the rubric exists to prevent.

**Articulation is locked: deep core catalog × deformer envelope, NO limb modules** (brief §1.1;
Espalier §1.4). Vendor chassis arrive **flat-merged** (1–3 WOOD primitives, no walkable branch graph),
so "a limb" is not addressable. Silhouette variety comes from **picking a different chassis-core**;
morph variety from the **deformer continuum** (lean/twist/wander, `[lo,hi]` ranges). The morphability
budget is multiplicative — `(cores) × (deformer continuum) × (bark/leaf/overlay) × (season)` — without
ever needing limb surgery. There is **no per-part compatibility matrix**: any core serves any species
(chassis is free geometry, `FEATURES.md §keying spine`); picking a core *is* the assignment.

### 2.2 Bark axes

| Axis | Kind | Value-set / range | Plain-language | Home in code | Tagging |
|---|---|---|---|---|---|
| `bark.type` | enum | smooth · furrowed · plated · scaly · ridged · exfoliating · fibrous · mottled | What the bark pattern reads as | `species-map.barkMorph` (furrowed/scaly/ridged/smooth/plated/papery today — **surface as the NAME**, not `Bark003`) | draft-then-ratify |
| `bark.color` | scalar(band) | a bounded handle on a tint band | The bark's hue/value | `tintBase` + Brief-2 gradient stops; `barkGradientByVariant` | **auto** (sample) + ratify |
| `bark.groove_depth` | scalar | 0–1 | How deep the furrows cut | master-shader knob (§6) | operator |
| `bark.plate_size` | scalar | 0–1 | How big the plates are | master-shader knob | operator |
| `bark.scale_frequency` | scalar | 0–1 | How fine the scaling is | master-shader knob | operator |
| `bark.exfoliation_density` | scalar | 0–1 | How much it peels (sycamore/birch) | master-shader knob — the **mottled/exfoliating** hard case (§6, Birch forces it) | operator |

**The unhelpful list is upstream of the bad quality** (brief §1.5). The current barks look bad *and*
are listed opaquely (`Bark003`/`Bark007` — the botanical type lives one field over in `barkMorph` but
isn't surfaced as the name). You can't fix or source what you can't see. The rubric makes `bark.type`
the organizing name → gaps + targets become visible → quality becomes addressable.

### 2.3 Leaf axes

| Axis | Kind | Value-set / range | Plain-language | Home in code | Tagging |
|---|---|---|---|---|---|
| `leaf.silhouette` | enum | palmate · lobed · heart · ovate · lanceolate · compound · fan · star | One leaf's shape | `species-map.leafMorph` + `leaf-pack-bindings.morphology` | **auto** (pack meta) |
| `leaf.ways` | enum | scattered/alternate · all-one-direction · mirrored/opposite · sprays-of-leaflets · clusters | **How cards attach + orient** (§5) | **missing today** — new | human-only (from phyllotaxy annotation) |
| `leaf.size` | scalar | real metres, vs a **legibility floor** | How big the leaf reads (never bare) | `pack.meta.naturalSize` (cm) **unused today** + `canopyByVariant` | **auto** (derive at bake) |
| `leaf.face` | dual | `{front ramp, back ramp}` off one silhouette | Two-tone shimmer (maple, poplar) | orphaned `tintFront`/`tintBack` + `doubleSided:true` — **wire them** | operator |
| `leaf.color` | scalar(band) | a **value + saturation band**; **hue preserved per species** | Harmonized to one lit world — dead-dark lifted, fake-bright tamed; species stay distinct hues | posterize substrate + ramp LUT (§6); per-species hue from `tints` | draft (from `tints`) + ratify |
| `leaf.season` | curve | day-of-year ramp (0–365) | Summer-green → gold → russet → bare | year-long-tree (`ARCHITECTURE.md §Phase F Layer 2`) | draft (from `tints`) + ratify |
| `leaf.occupancy` | scalar | 0.25–0.95 | Canopy density | `composition.leaves.occupancy` | operator |

**`leaf.size` and `leaf.season` are the carried-forward Espalier fixes, demoted from "patches" to
axes.** Leaf size today is `BASE_CARD_SIZE (0.5 m) × leaves.scale` — a unitless constant, so a leaf on
a 30 m Linden is the same metric size as one on an 8 m Magnolia and small-leaved species fall below a
pixel and read as a **bare winter chassis** (Espalier §3.1). The fix is the `leaf.size` axis: derive
the card's real-metre extent from `canopyByVariant` (already emitted) + `pack.meta.naturalSize`
(already present, today unused) against a **legibility floor**, with the operator slider redefined as a
bounded multiplier (0.7–1.4×) *below which they cannot reach*. **`leaf.season` IS the color engine** —
the gradient ramp owns summer/transitioning/dead as a day-of-year curve. **`leaf.color` is the
harmonization axis (LOCKED 2026-06-18, operator reframe):** species **keep their distinct hues** (a
maple-green is not an oak-green) — the band clamps **value and saturation only** (lift the dead-dark,
tame the fake-bright) so every leaf reads as belonging to **one lit world — harmonized, not unified.**
This **supersedes** Espalier §3.2's "normalize to a green-band" (which would have collapsed hue): the
band is a value/saturation envelope, **not** a hue target. All three leaf-color axes ride the bark
gradient-LUT machinery that already shipped (§6).

### 2.4 Overlay axes

| Axis | Kind | Value-set / range | Plain-language | Home in code | Tagging |
|---|---|---|---|---|---|
| `overlay.type` | enum | flowers · fruit/seed · **thorns** · seasonal-props | Extra botanical or art-direction additions | `species-map.hasFlowers`; Phase F Layer 3 per-Look packs (largely unbuilt) | human-only |

Overlay rides the **same card pipeline as leaves** (`public/textures/leaves/shapes/<pack>/`), with
**resolution-order above the botanical default** (`ARCHITECTURE.md §Phase F Layer 3`). Honey locust →
thorns, crabapple/redbud → flowers, fall litter → seasonal props. It is a first-class part-type, not a
leaf special-case.

### 2.5 The master maturity dial (cross-cutting)

| Axis | Kind | Value-set / range | Plain-language | Home in code | Tagging |
|---|---|---|---|---|---|
| `age` | scalar | 0–1 (young ↔ mature) | One dial that ages the whole tree | composes `deformer` + `chassis.size` + `bark` coarseness | operator |

**Age is a master dial** that scales the deformer envelope, size, and bark coarseness *together*
(brief §1.1) — not three knobs the operator keeps in sync. It is orthogonal to every other axis (a
young and a mature tree can share habit, silhouette, bark type) but **drives** several at once; it is
the rubric's one deliberate "conductor" axis.

### 2.6 Two non-axes (deliberately excluded — so completeness stays honest)

- **Branch-angle / limb-count / scaffold-count** are **not** rubric axes — they'd require the limb
  graph we don't have (§2.1). Silhouette variety = pick a different core.
- **3C-class canopy asymmetry / per-branch jitter** stay deferred — they need inverse-transpose normals
  the deformer deliberately avoids (`ARCHITECTURE.md §Per-instance deformer`).

Naming them as non-axes is part of the discipline: the rubric promises completeness *over the axes it
declares*, and these are explicitly out of that promise.

---

## 3. The dossier / species entry (the "robust entry")

A dossier is a **robust species entry keyed by common name** — `species-map.json` made robust and
expressed in the rubric, **not greenfielded** (brief §1.2). It is the durable artifact the operator
ratifies once (the cognitive lift, done up front) and the matcher reads forever.

```jsonc
// dossier — one species, keyed by common name (the operator-facing key)
{
  "key": "Sugar Maple",                    // common name — the findability key
  "scientific": "Acer saccharum",
  "canonicalId": "maple_sugar",            // existing slug spine (FEATURES §keying spine)
  "referenceImages": ["ref/sugar_maple_summer.jpg", "ref/sugar_maple_fall.jpg", "ref/sugar_maple_bark.jpg"],
  "descriptor": "Dense oval-rounded shade tree; opposite palmate leaves; gold-to-orange fall; furrowed grey bark.",

  // REQUIRED characteristics — the rubric values this species demands, with hardness + tolerance.
  "required": {
    "chassis.habit":     { "target": "oval",      "hardness": "hard", "tol": 1 },   // 1 = adjacent ok
    "chassis.size":      { "target": 18,          "hardness": "soft", "tol": 0.4 }, // ±40%
    "bark.type":         { "target": "furrowed",  "hardness": "soft", "tol": 1 },
    "leaf.silhouette":   { "target": "palmate",   "hardness": "hard", "tol": 0 },   // identity
    "leaf.ways":         { "target": "mirrored",  "hardness": "soft" },
    "leaf.season":       { "anchors": ["#3a7b30 summer","#d4801f fall"] },          // from tints
    "overlay.type":      { "target": null }
  },

  // RESOLVED recipe — what the operator picked/authored (written back by the viewer).
  "recipe": {
    "chassis": "<core-id>", "bark": { "ref": "...", "band": "..." },
    "leaf": { "pack": "palmate", "ways": "mirrored", "sizeMult": 1.0 },
    "overlay": null, "deformer": { "range": {} }, "transform": {}, "age": 0.7
  }
}
```

**Field-by-field migration from `species-map.json` (don't lose what's there):**

| Existing field | Becomes |
|---|---|
| `label` / `scientific` | `key` / `scientific` |
| `leafMorph` | `required["leaf.silhouette"].target` |
| `barkMorph` | `required["bark.type"].target` |
| `bark.{trunk,branch}` | `recipe.bark` (the resolved spec; region-split survives) |
| `tints` (buds/spring/summer/fall/winter) | `required["leaf.season"].anchors` (the ramp seed) |
| `deciduous` | `required["leaf.season"]` cardinality (deciduous ≈ 6 anchors; evergreen ≈ 2) |
| `hasFlowers` | `required["overlay.type"]` |
| `heroSpecies` / `qualityOverride` | unchanged (substitution lottery) |
| **new** | `referenceImages[]`, `descriptor`, per-axis `hardness` + `tol`, `recipe.{ways,sizeMult,age}` |

**Entries are largely pre-populated** — habit, bark, leaf, phyllotaxy are documented botanical facts;
the operator *ratifies* rather than authors from zero (brief §1.2). The reference image(s) are the
cloud-Tuner's ground truth made a **UI element, not an agent** (`TUNER.md §8.2 Dossier`) — "so we know
what we're going for." Gathering them is real labor, done once, up front (see review §15).

---

## 4. Conform-and-tag on ingest (finish the plumbing — consolidate, don't rebuild)

Every part auto-processes the moment it enters the library. Two halves:

**Conform** (the geometry normalization the canon *started and never finished* — Brief 19/20/23):
- **recenter** to dominant-trunk base at origin, Y-min 0 (`survey-deleaf.js` Brief 20 — done, the
  chassis-frame contract `ARCHITECTURE.md §authored transform bake`);
- **rescale** unit-bug outliers (`>100m → ÷10^k`, Brief 23 — done);
- **forest-split** multi-tree meshes into per-tree cores (Brief 23 `surveyTrunkClusters`, ≥3 trunks — done);
- **orient** — correct rotation/lean (the gnomon gizmo, baked; per-composition, Brief 19).

Most of conform is *already shipped in `survey-deleaf.js`*; "finish Brief 19/20/23" means **wire it to
run on ingest as one procedure** (§10) and close the residual (the per-composition orientation is still
hand-done at the viewer; the rest is automatic).

**Auto-tag** (draft the rubric values from the part itself):

| Rubric axis | Auto-tag source | Confidence |
|---|---|---|
| `chassis.size` / `canopyRadiusM` | `tree-bounds.js` bbox (post-recenter) | **high — trust** |
| `leaf.silhouette` | leaf-pack `meta.morphology` | **high — trust** |
| `bark.color` | sample the bark texture's dominant hue | high — trust (ratify the band handle) |
| `chassis.habit` | bbox aspect ratio + branch-angle stats | **low — draft** (flat-merged stock is noisy) |
| `bark.type` | primitive/texture classification | **low — draft** (texture classification is hard) |
| `leaf.ways` | not in the card geometry at all | **none — author** from species annotation |

**The auto-tag is a DRAFT the operator ratifies, never gospel** (brief §1.3 — *proxy-isn't-the-eye*,
`feedback_proxy_render_is_not_the_operator_eye`). The split above is the *recommended* auto-vs-ratify
boundary and is **a named review decision** (§15) — getting it wrong either floods the operator with
ratification labor or lets noisy proxy tags poison the matcher. The matcher treats **unratified tags as
provisional** (down-weighted + flagged in the options list, §7). Auto-tag is also what makes **unified
findability** work across sources (Authored / LiDAR / Procedural all get tagged into one vocabulary).

---

## 4.5 The Library Builder — the physical layer beneath the rubric (new)

The rubric (§2) is the *logical* navigable list; the **Library Builder is its filesystem counterpart**
— the same "make it a navigable list" discipline applied to the actual files on disk. It is **not a
one-time cleanup chore and not a manual step**: it is a **background task the Arborist front end runs on
every ingest / authoring / ratify action**, converging the file tree toward a perfectly clean
architecture over time.

**What it converges toward:**
- **one canonical folder per part-type** — `leaves/`, `barks/`, `chassises/`. Today: leaves are *split*
  across flat `<morph>.png` placeholders **and** `shapes/<pack>/` packs; barks are an opaque `Bark0NN`
  pile; chassis are a flat 241-entry heap in `_chassis/`.
- **consistent naming by rubric value, not vendor id** — a bark folder named for its `bark.type`
  (`furrowed/`, `exfoliating/`), not `Bark003`; the rubric's "surface the type as the name" (§2.2) made
  true on disk.
- **paired meta** beside every part (the `meta.json` the matcher reads), and **generated documentation**
  — front-end (the readiness / library view) and back-end (a written manifest of what's where).

**How it relates to the other layers:**
- The **ingest procedure (§4/§10) writes into the structure the Library Builder owns** — ingest doesn't
  drop a file wherever; it hands each part to the Builder, which places it canonically, names it by
  rubric value, and pairs its meta.
- The **dossier + matcher reference parts by the clean canonical paths** the Builder maintains — so when
  a part is renamed or relocated, the references the matcher resolves stay valid (the Builder owns the
  indirection).
- It **normalizes the current mess incrementally** — the split leaves, the opaque bark IDs, the flat
  241-chassis pile are exactly what it converges away from, a little on every authoring action, **never
  as a blocking migration.**

In the build plan it is a **background concern threaded through Stage 1's ingest** (§13), **not a
separate stage or a manual task** — every Stage-1 ingest of a part-in-hand runs through the Library
Builder, so by the end of Stage 1 the parts that have been touched are already canonically placed and
named. It is the filesystem analog of how the rubric organizes the *concepts*: build it once, it pays
off on every part forever.

---

## 5. Leaf Ways — the missing axis (new)

**Arrangement: how cards attach and orient** — distinct from silhouette (one leaf's shape) and from
the color ramps. The value-set (brief §1.4):

| Way | Reads as | Load-bearing for |
|---|---|---|
| scattered / alternate | the default cloud-scatter | most broadleaves |
| all-one-direction | drooping curtain | **willow** |
| mirrored / opposite | pairs across the twig (pinnate, decussate) | **maple, ash** |
| sprays-of-leaflets | compound fronds | **locust, ash** |
| clusters / groups | fans on spur shoots | **ginkgo** |

It **lives on top of the existing leaf-attachment anchor system** (`generate-salon.js#buildLeaf-
GeometryFromAttachments` + `leafAttachmentTags`; today leaves scatter on a deterministic upper-bbox
point cloud — `FEATURES.md §Leaf emission`). Ways is the **orientation grammar** layered over those
anchors: same anchor cloud, different per-card yaw/pitch/grouping rule. **Seed:** the May handoff named
this "cluster grammar" and never built it (`handoff-2026-05-21 §doctrine`). It is **load-bearing for
willow / locust / ginkgo identity** — without it, all three read as generic broadleaf scatter.
Phyllotaxy is exhaustively annotated → another manageable list we harvest.

*(Note the procedural path already has a phyllotaxis primitive — `sca.phyllotaxisMode === 'opposite'`
pair-spawn, `ARCHITECTURE.md §Opposite-phyllotaxis`. Leaf Ways is the **card-attachment** analog for
the composed/Authored path; the two are cousins, not the same code.)*

---

## 6. Parametric leaf + bark primitives (fewer samples, more mileage)

Both are the **same knob-turner**: a luminance/silhouette substrate + gradient ramp(s) + knobs. This is
how a "manageable list" of samples generates the whole library.

**Leaf** — one silhouette × ramps generates the states:
- **The gradient ramp IS the seasonal/state engine** — summer (deep-green) / transitioning
  (green→gold→russet) / dead (brown), as a **day-of-year ramp curve** (`leaf.season`, the year-long
  manifest `annualCycle` already exists, `ARCHITECTURE.md §Phase F Layer 2`).
- **Front/back** = two ramps off one silhouette (wire the orphaned `tintFront`/`tintBack` +
  `doubleSided:true` to the `leaf.face` axis).
- **Posterize** the leaf substrate to flatten chromatic noise (the "calm" half) *before* the ramp
  recolors (the "coherent" half). **The band harmonizes value + saturation, NOT hue (LOCKED 2026-06-18 —
  operator reframe, §2.3):** a too-dark pack gets its value lifted, a too-neon pack gets its saturation
  tamed, so a maple-green and an oak-green **stay distinct hues but read as one lit world.** A pack's
  hue survives; only its value/saturation is clamped into the shared envelope. This **supersedes**
  Espalier §3.2's "come out the same green" — **harmonized, not unified.** This is the
  leaf half of the **already-shipped** bark gradient/posterize machinery (`bake-look.js` LUT compile +
  sha1 dedup + the single Bloom-stable shader).
- **Honesty:** ramps own color/value states + occupancy owns shed; a true *shape* change (dead-leaf
  curl) needs a second silhouette or alpha trick — **deferred edge, not v1** (brief §1.5).

**Bark** — the master shader: 6+ luminance platonics × `{groove_depth, plate_size, scale_frequency,
exfoliation_density, tint}` (the `bark.*` scalar axes, §2.2). The machinery exists (`barkGradient` /
`barkPosterized` / `barkDetail`, verified in code). **Mottled / exfoliating (Birch, Sycamore) is the
hard case** the May plan deferred — it needs a **second mask channel** for spatial color variation.
**Birch (species #10) forces it** (§12 / Stage 3).

**Both ride the single master atlas** (the Bloom single-program constraint — gradient LUTs are 256×1,
~free; sha1 dedup collapses shared tiles). Nothing here adds a sampler or a second program.

---

## 7. The matcher (surfaces options; the user picks)

Given a dossier's `required` characteristics → **filter + rank the workable options per part-type** and
present them. The user **chooses** (pre-select only when there is exactly one workable). **Seed:**
`leaf-pack-bindings.json` is a proto-matcher (morphology → packs, ordered candidates +
`coverageGaps`) — make it general across all part-types and tolerance-driven.

### 7.1 Data shapes

```jsonc
// a tagged part (output of §4 ingest)
{ "partId": "...", "partType": "chassis", "source": "authored|lidar|procedural",
  "tags": { "chassis.habit": {"value":"spreading","ratified":false},
            "chassis.size": {"value":16.2,"ratified":true}, ... },
  "conformReport": { "recentered": true, "rescaled": false } }

// matcher(dossier, partType) → ranked options
{ "partType": "chassis", "preselect": null,            // a partId iff exactly one workable
  "options": [
    { "partId": "maple-core-07", "verdict": "workable", "score": 0.92,
      "perAxis": [
        { "axis": "chassis.habit", "required": "oval", "actual": "rounded",
          "hard": true,  "withinTol": true,  "distance": 1, "provisional": false },
        { "axis": "chassis.size", "required": 18, "actual": 16.2,
          "hard": false, "withinTol": true,  "distance": 0.10, "provisional": false }
      ] },
    { "partId": "elm-core-02", "verdict": "stretch", "score": 0.55, "perAxis": [...] }
  ] }
```

### 7.2 The tolerance engine (the real engine work — where human taste re-enters)

"**Workable**" = a per-axis tolerance match (brief §1.6). A chassis tagged "spreading, fine" is
workable for a London Plane's "spreading" habit even if it's not literally a plane tree — *a tree is a
recipe, not a literal model* (the kit premise, `handoff-2026-05-21`). Per-axis distance:

- **enum** (`habit`, `bark.type`, `leaf.silhouette`, `leaf.ways`): a small **hand-authored similarity
  matrix** per axis — `spreading↔rounded` near, `spreading↔columnar` far. `distance` = matrix hops;
  `withinTol` = `distance ≤ tol`. This is exactly where **human taste re-enters** (brief §1.6) — the
  matrices *are* the taste, made explicit and editable.
- **scalar** (`size`, `color-band`): `distance = |actual − target| / target`; `withinTol = distance ≤
  tol`. The **legibility floor** is a hard clamp underneath (a too-small leaf is never workable, §6).
- **ordinal** (`density`): adjacent buckets = workable.

Each `required` axis carries a **hardness**: `hard` axes (e.g. a maple's palmate silhouette) must be
`withinTol` or the option drops from **workable** → **stretch**; `soft` axes never disqualify, they only
move the rank. `score` = weighted closeness across axes (hard axes weighted up). **Provisional** (un-
ratified, §4) tags are down-weighted and badged so the operator sees *which* matches rest on a guess.

The matcher must surface **how close** + **which axes are hard vs nice-to-have**, so the operator can
ratify the pick or say **"no, go get a real one"** (brief §1.6) — that "go get one" routes to the
shopping list (§8) / the import procedure (§10).

**The tolerance basis is a named review decision** (§15) — it is the single hardest design call in the
whole kit, and the place the matcher is right or wrong.

---

## 8. The readiness dashboard (the Library view)

Each species row + a **per-part progress indicator: Chassis · Bark · Leaves** (🟢 in hand / 🟡 stretch
/ 🔴 gap). **Seed:** `roster-coverage.js` already computes have-vs-need coverage (`literal` / `composite`
/ `gap`, the `/coverage` join, `FEATURES.md` Brief 24) — make it **granular** (per-part, not per-species)
and **visual**.

It does three jobs:
1. surfaces the 10 priority species' status (§12);
2. reveals **"buildable today"** — every species whose three parts are already green (the matcher
   returns a workable option for each part-type). **Do not cap at 10** — sweep up every freebie (brief
   §1.8);
3. shows exactly **which part to procure** for the blocked ones → the shopping list that drives the
   import procedure (§10).

It is the dashboard the matcher feeds: a species is green-Chassis iff `matcher(dossier,'chassis')`
returns a workable option, etc. So the dashboard is a *view* over the matcher, not a separate
bookkeeping system — which is why it stays honest as parts are ingested.

---

## 9. The viewer (controls = the rubric, against the reference)

**Evolve the Salon Workstage — do not fork** (`feedback_no_parallel_pipeline`; the Salon already opens
by default, navigates by roster species, and carries the slot/viewport/perf-gauge scaffold,
`FEATURES.md §Salon mode`). The current 21-knob panel is "awkward + not quite right" (brief §1.9). Three
moves:

1. **Replace raw sliders with the rubric axes** — the same vocabulary you search by. The Parts rail
   becomes four typed pickers (chassis-core / bark / leaf / overlay), each showing the matcher's ranked
   **options** with the per-axis closeness badges (§7). Picking is choosing among options, not dialing
   from zero.
2. **Show the reference beside the live tree** — the dossier's `referenceImages` as a UI panel (the
   cloud-Tuner's ground truth as a *UI element, not an agent*, `TUNER.md §8.2`). "So we know what we're
   going for."
3. **Leaf authoring = one orthogonal control surface** — pick a silhouette from the matched options →
   the customizing axes (`leaf.ways`, `leaf.size`, `leaf.face`, `leaf.season`, `leaf.occupancy`) appear
   **pre-filled** from the entry + the ingest derivation → refine. Same shape for bark. The
   **"new leaf / import" tools are the gap escape hatch** — surfaced only when no library silhouette is
   workable (one creation path = the ingest procedure §10, not a tool per leaf type).

The flow is unchanged in shape: `pick parts (from options) → tune rubric axes → scrub season → Adopt
(writes the recipe into the dossier) → Re-publish (stage to library) → Grove Bake (ship to slab)`. The
**two-gesture authoring/production split stays** (Brief 14). The Salon-preview-IS-the-published-artifact
parity doctrine stays (`ARCHITECTURE.md §Salon preview ↔ LS parity`) — if a leaf reads bare or off-band
in the preview, it reads that way in LS; there is no daylight to cross.

---

## 10. Import (one automated procedure, two triggers)

Ingest is **one automated procedure** = conform + tag (§4) — the Brief 28 "+ Add Model" / upload
endpoint design. It runs **agent/CLI for the buildout now** (fastest, no UI block — `node
arborist/survey-deleaf.js` for chassis, `compose-leaf-packs.mjs` for leaves, drop bark source + bake;
brief §1.7, brief-28 §"For now"). The **same procedure** gets a user button as the kit matures (Brief
28's single-asset / incremental ingest mode + the `serve.js` upload endpoint + the two Salon
affordances). The human's permanent job is **ratify, never plumb**. "Procure more" = run the procedure
on a new asset; the dashboard's shopping list (§8) is the queue. The procedure **writes through the
Library Builder (§4.5)** — it never drops files ad hoc; it hands each part to the Builder, which places
it canonically, names it by rubric value, and pairs its meta.

---

## 11. Scope: Authored-only now; LiDAR + Procedural are equal peers, kept

**We work only on the Authored path now.** But **LiDAR and Procedural are equal peer tracks — kept
alive, distinct, never co-published with Authored** (brief §1.10; locked, `MEMORY: no-cull, Authored-
only, LiDAR/Proc equal peers, kept`). The navigation is designed so the three tracks have **equal
standing**; we **build only the Authored path**.

> ⚠️ **This is a deliberate reversal of Espalier v1's decision #1** (which recommended *retiring*
> Procedural + LiDAR). The operator's settled call is to **keep them as peers** the operator may return
> to. So the retire ledger (§14) does **not** retire `generate-procedural.js` / `spaceColonization.js`
> / the LiDAR track — and the auto-tagger (§4) tags all three sources into the **one** rubric so
> findability is unified across them. I am flagging this divergence explicitly (per the brief's "if a
> settled decision looks wrong, flag it") — it is *not* a contradiction, it is the operator overriding
> the v1 recommendation, and I am honoring it.

---

## 12. The forcing function — the top 10 LS species (381 trees, ~50%)

From `src/data/park_trees.json` (756 placements, 89 species). Exact inventory strings in parentheses:

| # | Species (manifest string) | Count | What it forces |
|---|---|---|---|
| 1 | Sugar Maple (`Maple, Sugar`) | 88 | palmate · **the vertical-slice hero** (the proof) |
| 2 | Green Ash (`Ash, Green`) | 50 | ⚠️ **compound leaf — no pack** (`coverageGaps: compound`) |
| 3 | Silver Maple (`Maple, Silver`) | 48 | palmate — *kit mileage* |
| 4 | Pin Oak (`Oak, Pin`) | 42 | lobed (`LeafSet016` in hand) |
| 5 | Red Maple (`Maple, Red`) | 33 | palmate — *kit mileage* |
| 6 | Flowering Crabapple (`Crabapple, Flowering`) | 28 | ⚠️ **ornamental chassis = 0 + flowers overlay** |
| 7 | Sweetgum (`Sweetgum (undesirable)`) | 27 | star leaf (likely gap) |
| 8 | Redbud (`Redbud`) | 23 | heart leaf (`LeafSet004` in hand) + **flowers/ornamental** |
| 9 | Bald Cypress (`Cypress, Bald`) | 23 | ⚠️ **deciduous conifer, scale foliage** (`coverageGaps: scale`) |
| 10 | Birch (`Birch`) | 19 | ⚠️ **exfoliating/mottled bark — the hard bark case** (§6) |

These deliberately span the whole system: a **kit-mileage core** (3 maples + oak → many trees from
shared palmate/lobed parts) + **completeness-forcers** (compound leaf, scale conifer, ornamental
chassis + flower overlay, exfoliating bark, star leaf). Getting these 10 perfect = the whole system
proven, not the happy path.

---

## 13. The staged build plan (gates are Jacob's eye on the lit app)

Sequence after the cloud-Tuner wisdom: **build the spine → prove on the easy case → force the gaps**
(`TUNER.md §7`). Each stage rides the **single master atlas** (no multi-page) + the **one pipeline**
(no fork); acceptance is **Jacob's eye on the running app, never a proxy render**
(`feedback_proxy_render_is_not_the_operator_eye`). **Stage 1 is dispatchable the moment Jacob ratifies
the architecture** (standup-before-build).

### Stage 0 — the keystone (nothing renders)
**Dispatch unit:** one library-analysis + authoring agent (the rubric + part-tag seed) **plus a research
agent** to harvest the 10 dossiers (confirmed 2026-06-18 — bounded, only 10 trees). **Build:**
- **FIRST — analyze the current library and seed from it; do NOT greenfield (operator directive).** Take
  the rubric value-sets, the initial part tags, and the dossier required-characteristics + recipes as
  **cues from what's already there** + the organizing work already done. Read concretely:
  `public/textures/leaves/` (split: flat `<morph>.png` placeholders **and** the real `shapes/<pack>/`
  packs with `meta.json` morphology / naturalSize), `public/textures/bark/Bark0NN/` (map each → a
  `bark.type`), the **241 chassis** `public/trees/_chassis/*.{glb,meta.json}` + the operator curation
  `arborist/state/_chassis-curation.json` (approve / reject / unreviewed = a **strong seed signal**),
  plus `species-map.json`, `roster-coverage.js`, `leaf-pack-bindings.json`. ⚠️ **Mine for organization
  cues ONLY — the current assets are NOT deploy-ready or "good"** (the barks look bad, leaves vanish);
  the seed is about *structure*, not blessing the assets. **Quality is Stage-2/3 work.**
- `rubric.json` — every axis of §2 encoded as data (schema + value-sets + similarity-matrix stubs),
  **seeded from the analysis above.**
- the dossier schema (§3) + the **10 species entries harvested** (research agent) from botanical
  annotation + the seed above (robust: required-characteristics with hardness, descriptor, recipe).
- **reference images gathered** for the 10 (one canonical summer + fall + bark per §15.5).
- the **Library Builder's** target structure declared (§4.5) — the canonical folder/naming scheme the
  Stage-1 ingest will write into.
**Acceptance gate:** Jacob reviews `rubric.json` + the 10 dossiers **against botanical reference** —
are the axes atomic/orthogonal/complete, are the value-sets right, do the required-characteristics read
true? Sign-off here unblocks everything. *(This is the vocabulary everything hangs off; it ships first
and alone as data — see review §15.)*

### Stage 1 — the spine
**Dispatch unit:** 2 agents (ingest/tagger; matcher+dashboard) — can run in parallel after Stage 0.
**Build:**
- **conform-and-tag-on-ingest** as one procedure (§4) — wire the shipped `survey-deleaf` conform +
  the auto-tagger drafting rubric values with confidence flags; run it on **the parts in hand**.
- **the Library Builder (§4.5)** — threaded *through* that ingest, not a separate chore: every
  part-in-hand ingested this stage is placed + named canonically by the Builder (the ingest agent owns
  this; it's a background concern, not a manual migration).
- **the matcher** (§7) — the tolerance engine over `rubric.json`, returning ranked workable options
  per part-type; generalize `leaf-pack-bindings.json` to all four part-types.
- **the readiness dashboard** (§8) — `roster-coverage.js` made per-part + visual; a view over the
  matcher.
**Acceptance gate:** on the lit app, the dashboard shows **real, granular coverage**; the matcher
returns sensible **ranked options** for Sugar Maple (and flags provisional tags). Jacob eyeballs that
"workable" reads as workable and the gaps read as the real gaps.

### Stage 2 — prove the kit (vertical slice first)
**Dispatch unit:** 1 agent, sequential within the stage.
**Build:**
- **one complete Sugar Maple end-to-end — every layer perfect** (chassis option picked + morphed, bark
  band, leaf silhouette + Ways + derived size + season ramp + front/back) **as the proof**.
- then the rest of the **kit-mileage core** (Silver Maple, Red Maple, Pin Oak) from **shared parts +
  parametric leaf/bark** (§6) — proving "fewer samples, more mileage."
**Acceptance gate:** Jacob's eye on the running app — Sugar Maple reads **perfect** (no bare-chassis,
one coherent palette, correct silhouette + arrangement); the maple-mileage trio + oak read **distinct
and correct** from shared parts.

### Stage 3 — force the gaps (each a deliberate, eye-gated cycle)
**Dispatch unit:** one agent per gap (5 cycles; procurement via the import procedure §10).
- **Green Ash** → **compound leaf** (+ Leaf Ways: sprays-of-leaflets).
- **Bald Cypress** → **scale/needle deciduous conifer** (scale foliage + deciduous-conifer season).
- **Crabapple + Redbud** → **ornamental chassis** (the `habit=0` gap) **+ flower overlay** (§2.4).
- **Birch** → **the exfoliating/mottled bark channel** (the second mask channel, §6).
- **Sweetgum** → **star leaf** silhouette.
**Acceptance gate (per gap):** Jacob's eye on the lit app for that species — the forced feature reads
true (e.g. Birch's bark mottles; Ash's compound fronds spray correctly).

### Stage 4 — all 10 perfect + sweep the freebies
**Build:** polish the 10 to perfect; the dashboard reveals **every other species whose parts are now in
hand** ("buildable today," uncapped, §8) → sweep them up.
**Acceptance gate:** Jacob signs off the 10; the freebie sweep is visible in the dashboard and the lit
forest.

---

## 14. Keep / rebuild / retire (against Increment's audit `scratch/audit-arborist.md`)

### KEEP (ride, don't fork)
The **publish-loop**; the **single master atlas** (`bake-look.js#unifyAtlases`, sha1 dedup); the
**2-bind Bloom-stable material** (`treeAtlasMaterial.js`, single program); `InstancedTrees.jsx` + the
`stampTreeVertexAttrs` merge contract; heroes-on-fillers **substitution** (`bake-trees.js#pickVariant`,
`qualityOverride`); the **decimation levers** (3/4/5/6); the **bark gradient / posterize / detail**
machinery (the engine §6 builds on); **`tree-bounds.js` + `canopyByVariant`** (the `leaf.size`
derivation input — note Increment §6 caught an agent mislabeling `tree-bounds.js` "vestigial"; it is
**live**, sole consumer `bake-look.js:29`); the **wind + canary** contracts; the **two-gesture**
authoring/production split; `survey-deleaf.js` + the chassis curation surface; the
**`atlas-kind-classifier.js`** single SSoT. **Also KEEP, per §11 (reversing Espalier): the Procedural
track** (`generate-procedural.js`, `spaceColonization.js`, `monopodialWhorl.js`) **and the LiDAR track**
(`bake-tree.py`, `lidar_extract.py`, `lidar-publish.js`) — equal peers, kept alive.

**Seeds to evolve (consolidate, don't greenfield):** `species-map.json` → the **dossier** (§3);
`roster-coverage.js` → the **readiness dashboard** (§8); `leaf-pack-bindings.json` → the **matcher**
(§7).

### REBUILD (the front — never coherently built)
The **rubric vocabulary** (`rubric.json`, §2) · **robust dossiers** (§3) · the **matcher / options-
picker** (§7) · the **readiness dashboard** (§8) · the **reference-driven viewer** (§9) ·
**conform-and-tag-on-ingest** (finish Brief 19/20/23 → run on ingest, §4) · the **full leaf model**
(Leaf Ways §5 + ramps-as-season-engine + front/back §6) · the **bark library organization + quality**
(§2.2/§6 — surface the type, fix the barks).

### RETIRE
- **The hero-LOD / DoF arc** (`HANDOFF-tree-hero-lod.md`) — **PARK, do NOT delete** (operator call 2026-06-18; same treatment as LiDAR/Procedural — a real approach we may return to). No-cull is doctrine, so the **cull half** (trees disappear) is **vetoed**; the **detail-taper / DoF half** (trees stay, detail softens in blurred zones — the romance-DoF direction) is the part that might return, and its design thinking is preserved in the parked brief. **Leave the hero-LOD code dormant, not deleted:** `bake-trees.js`'s `classifyHeroTiers` / `FALLBACK_HERO_TARGET` / `heroTierMeta` / the `cull` tier; the slab `heroTier` field; `InstancedTrees.jsx`'s `aHeroTier`; `treeAtlasMaterial.js`'s `treeHeroTierQC` uniform + `?heroTierQC=1` overlay. It's unwired under no-cull → harmless dormant weight (minor accepted debt, like the dormant LiDAR/Procedural code). Its **§2 mis-aimed-classifier bug is moot while unused** — no need to fix; if the arc ever returns it would likely rebuild around *real* DoF, so the value preserved is the *design*, not the buggy classifier. **`tree-bounds.js` + `canopyByVariant` are KEPT and repurposed** for `leaf.size` (§2.3) regardless.
- **Supersede Espalier v1** (`cartograph/_archive/FOREST-BUILDER-DESIGN-v1-superseded-2026-06-18.md`) — carry forward cores×deformer + the
  leaf-fix mechanics (now **as rubric axes**, §2.3/§6); supersede the framing and its retire-decision #1
  (§11).
- **Do NOT retire LiDAR / Procedural** (§11) — the one place this ledger diverges from Espalier.

**Natural to fold into the same retirement commit** (Increment §1c/§3, independent of the Builder but
cheap and adjacent): the stale duplicate bake `public/baked/lafayette-square.json` (no producer/
consumer); the completed one-shot migration scripts → `arborist/_attic/`; the two doc-drift header
comments (`tree-bounds.js`, `build-index.js`); `Grove.jsx#hovered` (cosmetic-only); `Workstage.jsx`
legacy (post-18B). Two duct-tape fixes Increment flags are **adjacent but separate** (not Builder work):
the `BAKE_URL` hard-wire (`baked/default.json`) and `computeTier`'s stale-camera calibration.

---

## 15. For the Boz / Jacob review

Five decisions need Jacob's eye **before Stage 1 dispatches**. Each is a lean recommendation + the one
real tradeoff (prose, not a checklist — `feedback_design_via_prose_discussion`).

> **Review resolution — 2026-06-18 (Jacob).** Decisions **1, 2, 5 accepted as recommended**; **3
> accepted — the rubric ships first, alone, as data.** **4 reframed and LOCKED** (folded into §2.3 /
> §6 + restated below): species **keep distinct hues**; the band clamps **value + saturation** for
> realism (lift dead-dark, tame fake-bright) so leaves share **one lit world — harmonized, not unified.**
> The **dossier harvest goes to a research agent** (confirmed — bounded, only 10 trees). Two additions
> folded into the architecture: **(A) Stage 0 seeds from the current library — analyze, don't
> greenfield** (§13 Stage 0), and **(B) the Library Builder** — the filesystem counterpart of the
> rubric, a background task of every ingest / authoring / ratify action (new §4.5, threaded through
> §13 Stage 1).

**1. The per-axis tolerance basis for "workable" — the matcher's real engine.** I recommend
**hand-authored similarity matrices per enum axis** (habit, bark-type, leaf-silhouette, leaf-ways) +
**percentage tolerances for the scalars** (size, color-band), with the legibility floor as a hard
clamp. The tradeoff: this makes "close enough" a small set of taste tables the operator owns and edits
by hand — explicit and legible, but it is *standing* curation (the matrices need tending as the library
grows), versus an opaque learned/embedding distance that would need no hand-tending but couldn't be
reasoned about or corrected when it ranks something wrong. I lean hand-authored because the kit's whole
premise is that these lists are *manageable* and because the matcher must explain *how close* and *which
axes are hard* to the operator — a matrix can show its work; an embedding can't. This is the single
hardest call in the kit and the place it's right or wrong, so it wants your eye first.

**2. The auto-derivable vs. human-ratified split for part tags.** I recommend the ingest tagger
**drafts everything it can, each tag stamped with a confidence**, and the operator **ratifies in the
dashboard** — with the matcher **down-weighting and badging unratified tags** so a match never silently
rests on a guess. My proposed boundary (§4): *trust* size, leaf-silhouette, bark-color (cheap and
reliable); *draft-then-ratify* habit and bark-type (flat-merged stock and texture classification are
genuinely noisy — proxy-isn't-the-eye); *author* leaf-ways (it isn't in the geometry at all). The
tradeoff is where to put the line: draft too little and the operator hand-tags everything (the cognitive
lift stops being "up front, once"); draft too much and noisy proxy tags poison the matcher's ranking.
I lean toward drafting generously *because* the ratify-in-dashboard step + the provisional badge make
over-drafting cheap to correct, whereas under-drafting is pure labor. Confirm the boundary.

**3. Ship the rubric first and alone, as data, before anything renders (Stage 0).** I recommend the
keystone — `rubric.json` + the 10 dossiers + reference images — be a standalone first deliverable that
**renders nothing**, gated by your eye on the *vocabulary* (are the axes atomic, orthogonal, complete;
are the value-sets and required-characteristics true to botany). The tradeoff: this is slower to a
visible "forest builder screen" — there's a whole stage where the only artifact is a JSON file and ten
filled-in entries — but the rubric is what the matcher, dashboard, viewer, and tagger *all* derive
from, so a wrong vocabulary discovered after Stage 1 is built is far more expensive than a careful read
now. Recommended; the keystone earns a gate of its own.

**4. Leaf color — RESOLVED + LOCKED (2026-06-18): harmonize value/saturation, keep hue.** The band is
**not** a hue target and does **not** collapse species to "one green" — Espalier §3.2's "normalize to a
green-band" is **superseded.** Species **keep their distinct hues** (maple-green ≠ oak-green); the band
is a **value + saturation envelope** that lifts the dead-dark and tames the fake-bright so every leaf
reads as belonging to **one lit world — harmonized, not unified.** The mechanism is unchanged (a baked
LUT sampled by luminance, the posterize substrate, per-Look art-direction riding on top — §6); only the
*target* changes — clamp value/saturation, **preserve hue.** This is **locked into the rubric now** as
the `leaf.color` axis (§2.3). The realism win (no dead-dark, no fake-bright) arrives **without** the cost
Espalier accepted (losing each pack's authentic hue), which is why the reframe is strictly better — and
because it is now an *axis*, it is settled at the rubric (Stage 0), not deferred.

**5. The reference-image standard + who harvests the 10 dossiers.** I recommend a **fixed per-species
reference set** — one canonical summer plate, one fall plate (for the season ramp), one bark plate —
sourced once, up front, and stored beside the dossier as the viewer's ground-truth panel. The tradeoff
is that gathering robust, correctly-identified, usable reference imagery for 10 species (and the
botanical ratification of their required-characteristics) is **real cognitive-lift labor** — it is
*the* "do the thinking up front" cost the whole kit premise rests on, and it lands in Stage 0 before any
code. Worth deciding: who does that harvest (you, an agent dispatch, or a mix), and whether one
canonical photo per state suffices or you want the cloud-Tuner's *varied* reference set
(`TUNER.md §2 dossier`) per species. This gates Stage 0's acceptance.

---

*Florilegium · 2026-06-18 · planning only · this design doc is the sole artifact. Stage 1 is
dispatchable the moment the architecture is ratified.*
