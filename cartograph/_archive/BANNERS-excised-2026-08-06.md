# Correction-banners excised from the active docs — 2026-08-06

**Diary. One file for the whole banner-excision pass** (`BRIEF-excise-the-banners.md`, Quill). Not
authoritative — this is where the *false sentences* went, so the active docs could stop carrying them.

**Why this exists.** `CLAUDE.md §PRUNE AS YOU GO` (2026-08-06): *"a correction banner sitting next to the
false sentence it corrects"* is the anti-pattern — **excise the sentence**; the banner's job is done when
its subject is gone. A false claim outlives its correction because it is shorter and reached first. The
trigger was measured: on 2026-08-06 `tileGround.js`'s header comment *"the IX is never constructed"* —
which the Tier 2 sweep had already proved false and deliberately left in the file — was read and reported
to Jacob as a live finding.

⛔ **Nothing in this file is true.** It is the record of what was removed and why, so the removal is
auditable. For what IS true, follow the "live home" pointer on each entry.

---

## 1. `src/lib/tileGround.js` header — *"the IX is never constructed"*

**Removed (header step 3, `:26`):**

> The intersection fills where the tiles meeting at a node each contribute their asphalt — **the IX is
> never constructed.**

**Falsified by:** `[E3.2] THE JUNCTION CONSTRUCTION` in the same file — it consumes
`ribbons.junctionMap`, trims runs back by a window, welds the continuity pair at a shared curb point and
lays one apron per node; `[E3.3]` then constructs the corner identities off it. Generalized from a
censused node list to every node on 2026-06-07 (`9c275ce`). Coverage check:
`node -e "const r=require('./src/data/ribbons.json');console.log(r.junctionMap.nodes.length)"`.

**Live home:** the corrected `tileGround.js` header · `cartograph/SKELETON.md §5e`.

**Note for the record:** this comment was load-bearing *outside* its own file —
`OSM2STREETS-GROUNDING §2/§3.2` quoted it verbatim as evidence of a live architectural divergence from the
field standard. A false comment in source is not a local problem.

---

## 2. `cartograph/OSM2STREETS-GROUNDING.md` — the 2026-08-04 ACCORD BANNER and the four claims it corrected

The banner is gone because its four subjects are gone. What the banner said, preserved:

1. **§3.1 "the 18th mis-pair" was presented as a live bug; it is FIXED.** On the committed skeleton
   `south-18th-street-1` is `motorway_link`/`single`/`pairKey null` and `-4` is `service`/`single`/`null` —
   neither the pairing nor the class flattening survives. The gate is `carriagewayGates` in `skeleton.js`,
   run data-first, `scoreOnewayPair` demoted to confirmation. The genuine pair (`-5`/`-6`, both
   `secondary`) still pairs.
2. **§4.2 recommendation 1 was described as unported; it is substantially LANDED.** The only surviving
   sub-clause is *"tighten 60 m toward a plausible median ceiling"* — `DIVIDED_MAX_GAP = 60` unchanged.
3. **§4.2 recommendation 2 ("intersection-everywhere") was called the big remaining architectural item;
   it is largely LANDED** (`9c275ce`, junctionMap generalized). `SKELETON §5e` was right and this doc was
   the stale side of the contradiction. What genuinely remains is apron *geometry* coverage, not the map.
4. **§2/§3.2 rested the "defining divergence" verdict on the stale `tileGround.js` comment** in entry 1.

**Also excised from that doc, as superseded framing rather than fact:**

- The §3.1 forensic table (raw ways `28522831` `motorway_link` / `166624144` `service`, both named "South
  18th Street", fabricated `chainGap: 3.21`) and its "Dissolves under the standard? Yes" disposition. The
  *rule* it bought — **geometric similarity is confirmation, never detection** — is kept in the live doc.
- §3.2's "two honest deltas" paragraph, whose delta (a) — E3 stamps ~86 census-selected nodes vs. the
  standard's every node — was closed by `9c275ce`. The *lesson* is kept live: **a censused exception list
  is a coverage bug wearing a fix's clothes.**
- §2 rows asserting ours is "at 50 stamped nodes" / "a stamped exception list". Replaced with the command
  that re-derives coverage, per `CLAUDE.md §PRUNE AS YOU GO` rule 1.

**Live home:** `cartograph/OSM2STREETS-GROUNDING.md` (kept as a grounding reference; §1/§2/§4.3 are the
live part) · `cartograph/SKELETON.md §5e` · `cartograph/RIBBONS.md §1` for the still-open apron question.

---

## 3. `cartograph/RIBBONS.md §1` DOCTRINE — the pointer to the deleted comment

**Removed:** *"This **supersedes the old `"the IX is never constructed"` line** (`tileGround.js:26`)."*

Deleted rather than repointed: once the false sentence is gone, a note recording that it was superseded is
itself a banner on a corpse. The doctrine it introduced — **construct the hard polygons, derive only the
simple block faces** — is untouched and stays in `RIBBONS §1`.

---

## 4. `cartograph/POLYGON-FIRST.md` — four banners, three of them corrections

**(a) §1 — "this section used to say the curb *is* the parallel offset, full stop."** Excised as
archaeology; the *warning* it carried is kept forward as **"'the curb is the parallel offset' describes
MOST blocks, not the map — check `producer` on the tile before you reason from it."**

**(b) §1 — the CORNER REGISTRY attempt's self-report.** Removed: the before/after table (228 → **261**
nodes · 695 → **769** corners · 160 `sameChain` · **50 of 50** caps with a `pendant-tip` · **6 of 6** blind
mouth corners), the "one list replaces two" design description, the Source 0b degree-2 note, and the
"stamp does NOT predict 8 constructed corners" open finding (513 fillet corners, 455 predicted, 50 map-edge,
8 away). **Every one of these came from `scratch/stamp-mouth-audit.mjs` or `scratch/stamp-predicts-fill.mjs`,
which `7b5b87a3` deleted while its own message said the probes were kept.** They are unreproducible; the
section stated that rule and then printed the numbers anyway, three screens further down.

⭐ Kept and restated forward as prohibitions: `corners.all` does not exist · do not quote the attempt's
numbers · a commit message is part of the corpus and nothing audits it · measure against a fresh
`pipeline.js` run, never the committed `ribbons.json` · **a width-step test is not a tip test** · **degree 1
alone over-counts dead ends on any town — the surplus is the envelope cut** · the dominant defect is
bounding, not existence.

**(c) §1 — "why the old count was wrong"** (the 46-of-49 → 50-of-50 archaeology: `hickory-street-1`,
`henrietta-place`, `south-22nd-street` measured 195 m / 154 m / 328 m from the cap). Excised. The two
method rules it bought are kept forward: **read the tip off the frozen `cap.vertexIdx`, never a FILL run's
span end**, and **a chain that caps twice in one tile must count twice** — with the observation that both
mistakes make the defect look *smaller*, which is why they survived.

**(d) §3 — "Corrected 2026-07-31: this table first read '32 median · 10 small'."** Left in place — see the
report; it sits inside a live reconciliation of three counts and cutting it risked a fifth over-swing.

**Live home:** `cartograph/POLYGON-FIRST.md` · `_handoffs/HANDOFF-deadend-face-resolution.md` §C0 ·
`_handoffs/HANDOFF-pipeline-reproducibility.md`.

---

## 5. ⭐ `CLAUDE.md` Layer 0 + `ORIENTATION.md` — the standing-evidence slot had expired. Twice.

**Removed from both docs:** the claim that **`ROADMAP` A07 is OPEN** — *"the code has two curb producers
and picks between them without telling anyone… at least 30 of LS's 101 tiles… its own comment says
'Falling back to legacy is never a regression'"* — cited at `tileGround.js:3326` / `:3347` / `:3345` /
`:3309`.

**Falsified by:** `ROADMAP A07` itself, which records **✅ CLOSED 2026-08-04 (`0464c136`)**. Every tile
carries `producer` + `producerReason` (`tileGround.js:3749`), the bake prints the split per pour,
degeneracy is loud and separate, and the *"never a regression"* comment is gone from the source. **All four
line numbers had also drifted.**

⚠️ **This is the pass's most important finding, and it is not a stale count — it is the gate doc failing
its own doctrine.** `CLAUDE.md` Layer 0 exists to prove *"no fallbacks"* with a live receipt, and its
footnote says in as many words: *"when you close a fallback, come back and re-arm this slot with a live
one — a doctrine whose evidence doesn't check out teaches agents to stop trusting the first read."* The
slot had then expired **a second time** (it previously cited `measureModel.js`, fixed 2026-07-31), meaning
the instruction was written and then not followed by the next closure.

**Re-armed with a receipt verified live 2026-08-06** — `POLYGON-FIRST §2.1` Check A,
`cartograph/litmus-curb-parallel.mjs`: `:77` still passes `blockCustoms: null` (runs with authoring OFF,
scores authored widths as defects — Layer 0 q3) and `:86` still reads `if (!tile?.iA?.length) continue`
(silently skips a tile with no curb ring, printing "no curb" as a modest bow — Layer 0 q2). Both checked in
the file, not quoted from a doc.

---

## 6. `cartograph/POLYGON-FIRST.md §3` — "prebake is authoring-blind"

**Narrowed, not removed:** the headline *"Prebake is authoring-blind by construction"* → *"Prebake is
blind to the per-fe SHAPE channel."* The sentence's own evidence only ever supported the narrow claim
(`design.json`/`blockCustoms` read zero times); the broad phrasing contradicts `ORIENTATION §3`, which
names it *"the overgeneralisation that mis-scoped the curb-freeze question"* — prebake **does** read
`clean/overlay.json`. A03/A06 were scoped off the broad reading.

---

## 7. `arborist/ARCHITECTURE.md` — two whole superseded DESIGN sections, migrated verbatim

Both carried a `⚠️ SUPERSEDED 2026-06 … Kept as historical design record` banner introducing a design
that never became the live model — CLAUDE.md's "RESOLVED, kept for context" anti-pattern at section scale.
**Live homes** are named in the stubs left behind. Reproduced verbatim below.

### 7a. Phase F leaf-color architecture (design, 2026-05-19) — NOT the live model

Phase F's leaf surface architecture went through three pivots on 2026-05-19. The final shape consolidates three doctrines: vendor-pack binding, year-long tree (annual cycle), and per-Look art-direction overrides. See `BACKLOG.md` Phase F for full pivot history; [[project_year_long_tree_doctrine]] for the year-long manifest schema in detail.

#### Layer 1 — Leaf-pack library (greyscale shape + PBR)

Leaf shapes live as vendor or operator-authored PBR packs at `public/textures/leaves/shapes/<pack_id>/`:

- `Color.jpg` — desaturated → luminance value used as gradient-map t-coordinate
- `Opacity.jpg` — alpha mask (shape silhouette)
- `NormalGL.jpg` — per-leaf surface direction (real per-leaf lighting)
- `Displacement.jpg` — optional bevel/relief (defer use to v1.6 unless visible at Hero)

10 vendor packs live at `assets/botanical-reference-hires/LeafSet0xx/` covering ~80% of LS inventory by morphology (palmate via LeafSet010, oak/lobed via LeafSet016, willow/narrow via LeafSet013, redbud/heart via LeafSet004, pine needles via LeafSet019, etc.). README in that directory pre-tags each pack to morphology — canonical source.

**Morphology → pack mapping** lives in (planned) `arborist/leaf-pack-bindings.json` — drives auto-suggested defaults per species in the workspace UI. Coverage gaps (Ginkgo `fan`, Honeylocust `fine_compound`, etc.) are explicit; flagged for operator-authoring or future vendor sourcing.

Per [[feedback_leverage_vendor_pbr_before_authoring]]: operator authoring is for coverage gaps, not the default path. Configuration-by-binding before Photoshop.

#### Layer 2 — Year-long tree (annual cycle in manifest)

Per [[project_year_long_tree_doctrine]] (locked 2026-05-19 PM): the species manifest carries its annual phenology cycle. Runtime samples a `uDayOfYear` uniform (Meteorologist-published) and interpolates between authored season anchors:

```json
"leafCluster": {
  "morphology": "palmate",
  "shapeRef": "LeafSet010",
  "annualCycle": [
    { "day":  15, "label": "winter",      "presence": 0.0, "scale": 0.0 },
    { "day": 105, "label": "spring buds", "presence": 0.6, "scale": 0.4,
      "shapeRef": "LeafSet010_spring_buds",
      "gradientFront": [{"t":0,"color":"#7eba5e"},{"t":1,"color":"#aece8a"}] },
    { "day": 196, "label": "summer peak", "presence": 1.0, "scale": 1.0,
      "gradientFront": [{"t":0,"color":"#2a5825"},{"t":0.5,"color":"#3a7530"},{"t":1,"color":"#5a9850"}] },
    { "day": 288, "label": "fall peak",   "presence": 1.0, "scale": 1.0,
      "gradientFront": [{"t":0,"color":"#882010"},{"t":0.3,"color":"#c84015"},{"t":0.6,"color":"#e87020"},{"t":1,"color":"#f8b830"}] },
    { "day": 320, "label": "late fall",   "presence": 0.4, "scale": 0.85 },
    { "day": 350, "label": "shed",        "presence": 0.0, "scale": 0.0 }
  ]
}
```

**Per-anchor fields:** `day` (1–365), `presence` (card alpha 0–1), `scale` (card size 0–1), optional `shapeRef` (per-season shape override — e.g., spring buds use smaller pack), `gradientFront` + `gradientBack` (multi-stop color ramps for front and back of leaf — front/back tinting drives maple-style wind shimmer via `gl_FrontFacing`).

**Sensible defaults per morphology class:** deciduous-broadleaf template carries ~6 anchors (winter / spring-buds / summer-peak / fall-peak / late-fall / shed); evergreen-conifer ~2 anchors (winter-darker / summer-lighter, presence always 1.0). Operators tweak per species from morphology defaults — keeps authoring effort to ~10 minutes per hero for a meaningful annual cycle.

**Runtime shader:** Phase F gradient LUT is per-anchor (256×1 RGBA texture baked at manifest-hash-keyed from gradient stops). Fragment shader samples luminance(`vColor`) → indexes the LUT for current bracket → `mix()` between adjacent anchors weighted by `uDayOfYear`. Per-card alpha multiplied by interpolated `presence`; per-card scale multiplied by interpolated `scale`. Single shader program preserved.

#### Layer 3 — Per-Look art-direction overrides

The year-long manifest is the species's botanical TRUTH. Per-Look art-direction overrides ride the existing `scene.materialColors[<species>]` channel, extended to carry both shape-pack AND gradient overrides per (Look, species) pair:

```json
// in public/looks/halloween/design.json
"trees": {
  "speciesOverrides": {
    "acer_saccharum_procedural": {
      "shapeRef": "halloween_bats",
      "gradientFront": [{"t":0,"color":"#1a0008"},{"t":1,"color":"#4a0020"}]
    },
    "quercus_alba": { "shapeRef": "halloween_bats" }
  }
}
```

**Resolution order at runtime:** per-Look override (if present) wins → else year-long annual-cycle interpolation at current `uDayOfYear` → else species default.

Halloween bats, Christmas candy canes, Diwali ornament gold, Pride rainbow, Valentine's pink — all expressible as per-Look override packs on top of botanical defaults. Phase W wind animates override packs identically (bats flutter in canopy). New override packs live at `public/textures/leaves/shapes/<pack_id>/` alongside vendor LeafSet packs — same greyscale + opacity + normal pipeline.

---


### 7b. Configuration D canopy render (Phase L Cycle 2 + Phase H supersession, 2026-05-19) — NOT the live model

Per [[project_configuration_d_canopy_render]] (locked 2026-05-19 PM): the canopy renders as **outer-shell A2C cards + inner-mass `THREE.Points` point cloud**.

| Layer | Geometry | Material | Cost |
|---|---|---|---|
| **Outer shell** | D.1b leaf cards on camera-facing surface only (~1500 cards/tree, 70% reduction from current 5500) | Phase F gradient-map alpha-blend | Alpha overdraw on ~1500 cards |
| **Inner mass** | `THREE.Points` rendering of canopy-volume samples (algorithmic), size-attenuated | Sampled gradient color + slight bloom | One-to-nine opaque pixels per point — zero alpha overdraw |
| **Skeleton** | Cylinders (LiDAR-baked via QSM or procedural via SCA) | Per-region bark shader | Standard cylinder cost |

**Why this is the architectural pillar of Phase L:** alpha-blend overdraw is the dominant GPU cost in foliage rendering. `THREE.Points` rendering bypasses alpha entirely — interior-mass cost collapses by ~10×. Outer-shell card count drops ~70% (silhouette + camera-facing only). Bloom + film grade in the LS post-FX stack smooths the point-cloud-as-foliage into "foliage volume" — the visual sleight-of-hand is robust at LS Hero/Browse distances.

**Source-split (Option δ):** in v1.5 the inner-mass points are **algorithmically sampled** from the canopy-volume envelope, not from real LiDAR canopy points. The LiDAR-canopy-point alternative is reserved for v1.6+ per the Option δ scope split (see "LiDAR pipeline + Option δ scope" above).

**Supersedes the original Phase H plan** (alpha-test cards for core + A2C cards for shell). Configuration D is strictly better because POINTS HAVE NO ALPHA — the original card-core approach still had alpha-test cost on interior; the new approach has zero. Procedural-only trees that don't (yet) ship through Configuration D fall back to the original Phase H plan; LiDAR-baked trees ship through Configuration D from Phase L Cycle 2.

**LoD progression:** lod0 = dense algorithmic points + cards-shell. lod1 = 30% point subsample + cards-shell. lod2 = alpha billboard or cards-only, no points.

**Single shader program constraint:** Configuration D's outer-shell uses the Phase F gradient-map material; inner-mass points use a sibling material (different draw call, may compile to a separate program — verify at Cycle 2; if true, accept the 2nd program as load-bearing for the architectural win).

---

