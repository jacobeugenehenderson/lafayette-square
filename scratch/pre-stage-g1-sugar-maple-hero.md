# Pre-stage — G.1 Sugar Maple hero brief

> Coordinator pre-stage doc for Phase G.1 (`acer_saccharum_procedural`). Drafted
> 2026-05-19 by Arborist coordinator while strong-leader baby (G.0) was in
> flight. ~70% of the G.1 brief is settled here; ~30% (specific param values,
> visual screenshots, tri-budget projections) needs G.0 to land first.
>
> **2026-05-19 evening update — REVISED PATH:** the Option δ "LiDAR-baked
> hero variants + procedural variants mixed roster" path is superseded per
> [[project_lidar_as_training_data]]. G.1's new shape: PROCEDURAL-ONLY Sugar
> Maple with LiDAR-DERIVED PRESETS DEFAULTS via Phase T statistical extraction.
> No LiDAR-baked variants in the runtime roster. LiDAR's 110 Sugar Maple
> specimens become training data that informs the procedural Sugar Maple's
> default DBH / height / W:H / branching density / leader strength / etc.
> Operator iterates procedural authoring from a statistically-grounded
> starting point. See `arborist/NOTES.md` 2026-05-19 evening entry for the
> full pivot rationale.
>
> **Sections of this doc that need revision under the new path:**
> Section 1 (Promotion mechanism — still applies but simpler since no
> LiDAR-baked variants). Section 5 (Leaf cluster spec — annual-cycle authoring
> still applies; vendor-pack LeafSet010 binding still applies). Section 10
> (PRESETS row — values come from Phase T statistical extraction, not
> operator-tuned-from-defaults). Other sections largely unchanged.
>
> **When this brief gets dispatched:** after Phase T (LiDAR statistical
> extraction) ships AND operator validates the extracted Sugar Maple stats
> visually in workstage. The Phase T-derived values fill in the placeholders
> below.

---

## 1. Promotion mechanism — three options + recommendation

The G.1 question: where does `acer_saccharum_procedural`'s canonical state
live? Per [[feedback_procedural_trees_are_the_destination]] heroes ship
procedural; per the 2026-05-19 walk-the-knobs conversation, hero seedlings
are **committed to source**, not gitignored like filler operator-overlay.

**Option A — PRESETS row in JS source (`arborist/generate-procedural.js`)**
- Operator's adopted params become a `PRESETS.acer_saccharum_procedural` array
  with 3 variant entries, each carrying full `{slot, seed, params}` shapes
  with the architecture / leaderStrength / envelope / sca / deformers all
  spelled out
- Reset button works against this PRESETS table (snaps overlay to PRESETS
  values, as today for fillers)
- Pro: zero new mechanism; matches existing filler pattern; survives clones
- Con: hand-editing JS for seedling data is awkward; the dice-and-adopt
  workflow targets seedlings.json, so promoting means manually transcribing
  values from a JSON file into a JS literal

**Option B — committed `arborist/state/acer_saccharum_procedural/seedlings.json` + `.gitignore` exception**
- Operator dices/adopts as normal; the seedlings.json file lives in source
  control via `!arborist/state/acer_saccharum_procedural/` exception
- Reset button still works (snaps to PRESETS minimal stub)
- Pro: existing pipeline reads seedlings.json without modification; no new
  loading logic; operator workflow unchanged from filler iteration
- Con: gitignore exceptions are easy to miss; mixing committed + uncommitted
  state in same tree is footgun-prone (next hero needs its own exception)
- **The exception line in `.gitignore` looks like:**
  ```
  arborist/state/
  !arborist/state/acer_saccharum_procedural/
  !arborist/state/ginkgo_biloba_procedural/
  # etc per hero
  ```

**Option C — new `arborist/heroes/<hero_id>/seedlings.json` directory**
- Hero state lives outside `arborist/state/` entirely; the operator-overlay
  channel (`state/`) and the canonical-hero channel (`heroes/`) are
  structurally separate
- generate-procedural.js + serve.js gain a fork: read `heroes/<id>/` first if
  it exists, fall back to `state/<id>/`
- Pro: cleanest mental model — committed canonical vs uncommitted operator
- Con: most new infrastructure; touches `generate-procedural.js`, `serve.js`,
  potentially the store; doubles the read-paths for every existing endpoint

**Recommendation: Option B** (committed seedlings.json + gitignore exception).

Rationale: minimizes pipeline divergence (the existing channel reads the file
correctly), matches operator workflow (dice/adopt in the procedural
workstage works the same), and the gitignore-exception list grows linearly
with heroes (5 entries by G.5 ship time — manageable). Option A is awkward
JS-editing; Option C is structurally cleaner but adds infrastructure for a
problem that hasn't bitten us yet.

**Decision flag:** confirm with operator at G.1 dispatch time. The
mechanism choice locks in the pattern for G.2–G.5, so it's worth the 5 min
review.

---

## 2. Park species map routing

`src/data/park_species_map.json` currently has:

```json
"Maple, Sugar": ["acer_saccharum", "acer_saccharum_multistem"]
```

For G.1, prepend the hero so it wins the substitution lottery:

```json
"Maple, Sugar": ["acer_saccharum_procedural", "acer_saccharum", "acer_saccharum_multistem"]
```

`bake-trees.js:pickVariant` walks the array; first-found-with-effQuality
wins. Hero at `qualityOverride: 4` beats vendor at `quality: 0`.

**Inventory impact:** 88 placements of "Maple, Sugar" (verified via
park_trees.json — 11.6% of 756 total). All 88 will substitute to the hero on
next bake-trees run.

**Secondary routing question:** "Maple, Silver" and "Maple, Norway" currently
fall back to `acer_saccharum` (the vendor). Once hero lands, should they
fall back to `acer_saccharum_procedural`? Probably yes (closer match than
nothing), but flag at dispatch — these are 48 + 1 placements respectively
and the hero's silhouette may or may not read correctly for sibling species.

---

## 3. Bark binding

**Material:** Bark007 (confirmed at `public/textures/bark/Bark007/`, full PBR
pack — color + normal + roughness + LICENSE).

**Per-species spec** (manifest.bark shape per current Phase B doctrine):

```json
{
  "materialRef": "Bark007",
  "uvScale": [1.5, 4.0],
  "tintBase": "#3a2820",
  "tintJitterRange": 0.08,
  "roughnessOverride": null
}
```

Sugar Maple bark is gray-brown with deep furrows in mature specimens
(matches Bark007 — heavy furrowed). `tintBase` `#3a2820` is darker than the
filler-broadleaf default; jitter 0.08 gives per-tree variation without
straying off-species.

`uvScale` [1.5, 4.0] matches broadleaf filler — appropriate for tall trees
where vertical bark texture stretching would otherwise smear.

**Sha1 dedup:** since hero shares `materialRef: "Bark007"` with the
broadleaf filler, the atlas tile dedupes — adding the hero costs **zero
additional bark-tile atlas footprint**. Validated against the
"Grove pillar 0.5" doctrine in ARCHITECTURE.md.

---

## 4. Tint ramp targets

Per existing BACKLOG spec + sanity-check:

| Season | Inner | Outer |
|---|---|---|
| Summer | `#2a5825` (deep forest green) | `#3a7530` (lighter sunlit green) |
| Fall | `#a85020` (deep orange-red) | `#d4801f` (lighter amber-orange) |

The fall ramp matches actual Sugar Maple foliage (the species is famous for
brilliant orange-red autumn color — these values look right against
reference photos).

**Open: spring + winter ramps.** Are those needed at G.1, or just summer +
fall? BACKLOG's leaf-cluster spec only references those two seasons. Spring
(`#7eba5e` per manifest tints) could ride as a separate ramp tuple if the
weather/season system distinguishes spring from summer. Winter = null
(deciduous, no leaves shown).

---

## 5. Leaf cluster spec (REVISED 2026-05-19 PM — vendor-pack binding + year-long annual cycle)

**Phase F architecture finalized 2026-05-19 PM** — three doctrines:
(a) vendor-pack binding (no PSD authoring for G.1; LeafSet010 ships as-is),
(b) year-long tree (annual phenology cycle in manifest; runtime samples
`uDayOfYear`), (c) per-Look art-direction override channel. See
[[project_year_long_tree_doctrine]] for the full design.

**Shape pack binding:** point manifest at `LeafSet010` (auto-suggested via
`arborist/leaf-pack-bindings.json` species→morphology→pack mapping). Bake-look
reads the vendor JPGs; no copy / no authored intermediate file.

**Annual cycle authoring** (operator's main work for G.1 leaf surface):
~6 anchor points across the year, each carrying presence + scale +
multi-stop gradients for front and back of leaf. Sugar Maple's annual cycle
is botanically well-known; defaults below should land close on first pass:

| Day | Label | Presence | Scale | Gradient front | Gradient back |
|---|---|---|---|---|---|
| 15 | winter | 0.0 | 0.0 | — (no leaves) | — |
| 105 | spring buds | 0.6 | 0.4 | `#7eba5e→#aece8a` | `#a8c89a→#c8d8b0` |
| 196 | summer peak | 1.0 | 1.0 | `#2a5825→#3a7530→#5a9850` | `#a8b89a→#c8d8c0` |
| 288 | fall peak | 1.0 | 1.0 | `#882010→#c84015→#e87020→#f8b830` (4-stop green→yellow→orange→red) | `#a85020→#d8a060` |
| 320 | late fall | 0.4 | 0.85 | `#6a2010→#9a4520` | `#7a3018→#a85020` |
| 350 | shed | 0.0 | 0.0 | — | — |

**Optional shape variants per anchor:** spring-buds could use a smaller-leaf
shape pack (`LeafSet010_spring_buds` — operator-authored derivative);
fall-peak could use a curled-edge variant if desired. Both default to base
`shapeRef` when not specified — operator opts in per anchor.

**Per-Look art-direction overrides** (NOT G.1's authoring scope; channel
ready for downstream Looks):
- Halloween Look: `shapeRef: "halloween_bats"` (operator-authored silhouette
  pack) + dark gradient → maples grow bat silhouettes at dusk
- Christmas Look: candy-cane gradient → red+white striped maples
- Year-long defaults still drive most Looks; overrides are opt-in per
  (Look, species)

**Optional silhouette tweak (probably skip for G.1):** if LeafSet010's
generic palmate reads as too-not-Sugar-Maple-specific at LS Hero distance,
operator can author `LeafSet010_acer_saccharum_tweaked` in PS. At LS Hero
(30m+) the species-specific difference within palmate family is probably
invisible; ship LeafSet010 as-is and revisit if visual review flags it.

**Manifest shape (new pattern):**
```json
"leafCluster": {
  "shapeRef": "palmate_acer_saccharum",
  "occupancy": 0.7,
  "tintFront": {
    "summer": [
      {"t": 0,   "color": "#2a5825"},
      {"t": 0.5, "color": "#3a7530"},
      {"t": 1,   "color": "#5a9850"}
    ],
    "fall": [
      {"t": 0,   "color": "#882010"},
      {"t": 0.3, "color": "#c84015"},
      {"t": 0.6, "color": "#e87020"},
      {"t": 1,   "color": "#f8b830"}
    ]
  },
  "tintBack": {
    "summer": [
      {"t": 0, "color": "#a8b89a"},
      {"t": 1, "color": "#c8d8c0"}
    ],
    "fall": [
      {"t": 0, "color": "#a85020"},
      {"t": 1, "color": "#d8a060"}
    ]
  }
}
```

**Why front/back tinting is load-bearing for Sugar Maple specifically:**
Maples (Silver especially, Sugar to a lesser degree) are famous for the
wind-shimmer effect — leaf undersides are paler / silvery, fronts are
green, wind animation flips `gl_FrontFacing` per card per frame producing
shimmer. Phase F's gradient-map approach gets this for free via two LUT
samples in the fragment shader; the original color-PSD path couldn't
achieve this without mirror-aware UVs or two separate textures.

**Why multi-stop gradients matter for Sugar Maple specifically:**
Sugar Maple's fall foliage is famous for the green → yellow → orange → red
gradient ON A SINGLE LEAF. A 2-stop ramp can't carry that. Above 4-stop
spec captures the canonical fall coloration. Summer ramp can stay simpler
(2-3 stops).

**Occupancy = 0.7** — Sugar Maple has dense canopy (not honeylocust-sparse,
not spruce-packed). Per-tree alpha-density modulator the runtime shader
reads.

---

## 6. Atlas-bake implications

**Current atlas state** (LS Look):
- `trees-atlas-color.png` + `trees-atlas-normal.png` master atlas
- `barkBySpecies` block carries 5 procedural species entries
- `CONTENT_CAP = { bark: 512×1024, leaf: 512×512 }`

**Adding hero impact (revised post-Phase-F pivot):**
- New `acer_saccharum_procedural` entry appended to `barkBySpecies` —
  references Bark007 same as broadleaf filler → sha1 dedup → **no new bark
  tile in atlas**
- New per-species **shape tile** (`shapes/palmate_acer_saccharum/`) — IS
  new content, atlas grows by ~one shape tile (~512×512 = 256K pixels in
  atlas-space; possibly more if NormalGL + Displacement also pack into
  atlas, depending on bake-look schema)
- Gradient LUT textures (4× per hero: front-summer / front-fall /
  back-summer / back-fall) — each is 256×1 pixels = trivial bytes. May
  pack into a separate atlas region or live as standalone textures bound
  per-draw via uniform.
- Total atlas growth: ~3–5% per hero. Same order of magnitude as the
  original color-PSD plan (the gradient-map pivot doesn't change atlas
  footprint significantly — it changes WHAT'S IN the tile from color to
  greyscale-shape, not the tile SIZE).
- **Future Look palette overrides cost zero atlas growth** — gradient
  LUTs are runtime-rebakeable from JSON manifests; no per-Look texture
  authoring required.

**CONTENT_CAP raise question:** BACKLOG references the option to raise to
`bark 1024×2048 / leaf 1024×1024` once Grove curation prunes the roster.
**Recommendation: don't raise at G.1.** Keep the bar at "G.1 ships in current
atlas budget; CONTENT_CAP raise lands as a separate post-Grove-prune commit
to land 4× material fidelity bump on the freed atlas area." Two reasons:
(a) coupling the cap raise to G.1 inflates atlas size during hero validation
when we want a clean ship; (b) the cap raise pays dividends across ALL bark
tiles, not just hero — better as its own visible win.

**Bake time:** per existing measurements, full LS bake (`bake-look.js` +
`bake-trees.js`) takes ~30-60s. Adding hero adds maybe 5s for the new leaf
tile compositing + the 88 placement substitutions. Within debounce-flush
budget.

---

## 7. Acceptance criteria

**Visual side-by-sides** (operator-validated, not auto):
1. **Skeleton** — workstage view at default seed with leaves toggled off,
   side-by-side with the defoliated Sugar Maple photo (the one Jacob shared
   2026-05-19). Reads: strong central leader, ~5-7 lateral scaffolds
   emerging along trunk length, scaffolds run upward parallel to trunk,
   dense ramification at periphery. W:H ≈ 0.6.
2. **Summer canopy** — same view with leaves on, side-by-side with
   Britannica image. Reads: dense interior fill, layered tufted canopy,
   green color in correct range, no leaf-card stretching artifacts at
   Hero distance.
3. **Fall canopy** — switch tint ramp to fall, side-by-side with any of
   the many Sugar Maple fall photos online. Reads: brilliant orange-red,
   inner-to-outer gradient visible.

**Quantitative:**
- 88 LS Sugar Maple placements substitute correctly (`bake-trees.js` log
  shows 88 hero substitutions for `Maple, Sugar`).
- Atlas size growth ≤5% (sanity bound on the dedup working).
- Tri-budget: lod0 ≤ 50K (per the strong-leader full-axial-extension
  projection — verify after G.0 ships). lod1/lod2 scale proportionally.
- Determinism: same {species, slot, seed, params} → byte-identical GLB
  on re-publish.

**Subjective (Jacob's call):**
- "Reads as Sugar Maple to me from Hero distance" — final acceptance.

---

## 8. Documentation update sketches

Per [[feedback_features_md_is_a_working_doc]] all four quartet docs get
updates at G.1 ship:

**FEATURES.md:**
- Roster section adds `acer_saccharum_procedural` to the species list with a
  one-line description ("Sugar Maple — first hero species (G.1), procedural,
  strong-leader Architecture, decussate phyllotaxis, palmate PSD leaves")
- Hero authoring workflow section (probably new subsection): how to author
  the next hero following the G.1 pattern

**ARCHITECTURE.md:**
- "Two-tier substitution" section grows a concrete example: how Sugar Maple
  flows from inventory `"Maple, Sugar"` → park_species_map.json → bake-trees
  pickVariant → `acer_saccharum_procedural` hero (quality 4) winning over
  `acer_saccharum` vendor (quality 0)
- Promotion-mechanism subsection: documents Option B (chosen) with the
  gitignore-exception pattern for future heroes

**BACKLOG.md:**
- Phase G.1 entry flips to `[x] SHIPPED <date>` with full shipped-record
- Phase G.0 (Architecture dropdown) should already be shipped by this point
- Phase G.2–G.5 entries unchanged
- Post-G.1 follow-ups: CONTENT_CAP raise commit, hero-authoring workflow
  documentation, secondary routing (Maple, Silver / Norway → hero?)

**NOTES.md:**
- Dated entry covering: promotion mechanism choice + rationale, tuning
  values landed at, side-by-side screenshots embedded or referenced,
  scope-drift surfacings, the "build the rhythm" doctrine validated (or
  what slowed it down)

---

## 9. Open questions (need G.0 to land)

These can't resolve until strong-leader ships and operator tunes:

1. **Final param values** for the PRESETS row / seedlings.json:
   - Architecture: `strong-leader` (set)
   - Leader strength: ? (likely 0.9–1.0; needs visual tuning)
   - Envelope dimensions: ~7m × 12m proposed; needs verification
   - Phyllotaxis: `opposite` (set)
   - attractorCount: ? (likely 600–800; needs tuning for fasciculate density)
   - killRadius: ? (likely 0.6–0.8; tighter than oak default)
   - stepLength: ? (default 0.4 probably fine)
   - Deformers (trunk wander, branch jitter, bark relief): values from G.0
     tuning
   - Per-variant variation: 3 variants with different macro seeds + minor
     param tweaks for natural diversity

2. **Tri-budget reality check** — strong-leader's continuous axial trunk
   through full envelope height + N distributed scaffolds may push lod0
   higher than the spreading-mode baseline. Need post-G.0 measurement to
   know whether lod0 stays under 50K or pushes into mobile-perf-concern
   territory.

3. **Does the strong-leader output ACTUALLY match the photos?** Per
   [[feedback_evolve_vs_revert_judgment]] — if strong-leader ships but the
   silhouette still doesn't read as Sugar Maple, we iterate on G.0 first,
   not pile workarounds into G.1's hero tuning.

4. **Operator's PS leaf-cluster authoring readiness** — does Jacob have the
   maple-leaf cluster.png ready at G.1 dispatch time, or does that block as
   a parallel work-stream? Per BACKLOG, this was a "tomorrow's first move"
   item from 2026-05-19; status unknown.

---

## 10. PRESETS row template (placeholders for G.0 outputs)

```js
// In arborist/generate-procedural.js — PRESETS table

acer_saccharum_procedural: [
  {
    slot: 1,
    seed: <TUNED_SEED_1>,
    params: {
      // — Identity —
      morphology: 'broadleaf',

      // — Trunk —
      dbh: 0.35,  // 35 cm — mature Sugar Maple typical at LS

      // — Envelope —
      envelope: {
        profile: 'rounded_oval',  // or new 'tall_oval' if added; verify
        width: 7,
        height: 12,
        asymmetry: 0,
        offsetYFrac: 0,
      },

      // — Canopy (SCA) —
      sca: {
        architecture: 'strong-leader',  // NEW from G.0
        leaderStrength: <TUNED>,
        branchingStartFrac: 0.2,  // low scaffold start, Sugar Maple signature
        initialChildCount: <TUNED>,  // probably 5–7 distributed seeds
        phyllotaxisMode: 'opposite',  // decussate maple/ash pattern
        scaffoldEmergenceBias: 0,  // not used in strong-leader mode
        attractorCount: <TUNED>,  // dense ramification
        killRadius: <TUNED>,
        stepLength: 0.4,
        tropism: [0, 0, 0],  // global tropism zero; per-scaffold localTropism handles upsweep
      },

      // — Deformers —
      deformers: {
        trunkWander: 0.10,  // slight sinuosity
        trunkWavelength: 2.5,
        branchJitter: 0.12,
        barkRelief: 0.05,
      },
    },
  },
  // Variants 2 and 3 follow same shape with different seeds + minor tweaks
],
```

**Manifest stamp** (per-species, gets written to
`public/trees/acer_saccharum_procedural/manifest.json` on publish):

```json
{
  "species": "acer_saccharum_procedural",
  "label": "Sugar Maple",
  "scientific": "Acer saccharum",
  "source": "procedural",
  "tier": "hero",
  "leafMorph": "palmate",
  "barkMorph": "furrowed",
  "deciduous": true,
  "category": "broadleaf",
  "qualityOverride": 4,
  "approxHeightM": 12,
  "bark": {
    "materialRef": "Bark007",
    "uvScale": [1.5, 4.0],
    "tintBase": "#3a2820",
    "tintJitterRange": 0.08,
    "roughnessOverride": null
  },
  "leafCluster": {
    "morphology": "palmate",
    "shapeRef": "LeafSet010",
    "occupancy": 0.7,
    "annualCycle": [
      { "day":  15, "label": "winter",      "presence": 0.0, "scale": 0.0 },
      { "day": 105, "label": "spring buds", "presence": 0.6, "scale": 0.4,
        "gradientFront": [{"t":0,"color":"#7eba5e"},{"t":1,"color":"#aece8a"}],
        "gradientBack":  [{"t":0,"color":"#a8c89a"},{"t":1,"color":"#c8d8b0"}] },
      { "day": 196, "label": "summer peak", "presence": 1.0, "scale": 1.0,
        "gradientFront": [{"t":0,"color":"#2a5825"},{"t":0.5,"color":"#3a7530"},{"t":1,"color":"#5a9850"}],
        "gradientBack":  [{"t":0,"color":"#a8b89a"},{"t":1,"color":"#c8d8c0"}] },
      { "day": 288, "label": "fall peak",   "presence": 1.0, "scale": 1.0,
        "gradientFront": [{"t":0,"color":"#882010"},{"t":0.3,"color":"#c84015"},{"t":0.6,"color":"#e87020"},{"t":1,"color":"#f8b830"}],
        "gradientBack":  [{"t":0,"color":"#a85020"},{"t":1,"color":"#d8a060"}] },
      { "day": 320, "label": "late fall",   "presence": 0.4, "scale": 0.85,
        "gradientFront": [{"t":0,"color":"#6a2010"},{"t":1,"color":"#9a4520"}],
        "gradientBack":  [{"t":0,"color":"#7a3018"},{"t":1,"color":"#a85020"}] },
      { "day": 350, "label": "shed",        "presence": 0.0, "scale": 0.0 }
    ]
  },
  "tints": {
    "summer": "#3a7530",
    "fall": "#d4801f"
  }
}
```

(Legacy 2-stop `tintRamp` field removed from manifest — annual-cycle
gradient maps supersede it. Existing fillers stay on the legacy field
until they're migrated; coordinator BACKLOG carries the migration item
under Phase F follow-up. `tints` field retained for Stage UI legacy
binding; will deprecate when Stage migrates to annual-cycle awareness.)

---

## 11. Pre-flight checklist for G.1 brief author

Before drafting the G.1 brief, confirm:

- [ ] G.0 (strong-leader Architecture mode) shipped + reviewed
- [ ] Operator has tuned an adopted Sugar Maple variant in workstage
- [ ] Tri-budget verified (lod0 ≤ 50K target)
- [ ] PSD leaf cluster authored OR explicitly deferred (G.1 ships with
      filler leaves; cluster lands as G.1.a hot-fix)
- [ ] Promotion mechanism (Option B recommended) confirmed with operator
- [ ] LeafSet pack shortlist for venation reference completed (5 min task)
- [ ] Tint ramps verified against fall reference photos
- [ ] park_species_map.json secondary-routing decision made (Silver / Norway
      → hero or stay vendor)
- [ ] Any new file paths or env-deps for the hero accounted for in
      .gitignore / build pipeline

---

## Cross-references

- [[feedback_procedural_trees_are_the_destination]] (load-bearing — heroes
  ship procedural, never vendor)
- [[feedback_features_md_is_a_working_doc]] (operator-visible UI catches in
  FEATURES; hero adds qualify)
- [[feedback_baby_must_surface_scope_drift]]
- [[feedback_stash_isolate_per_file]]
- [[project_arborist_quartet]]
- BACKLOG.md G.0 (strong-leader) + G.1 entries
- ARCHITECTURE.md two-tier substitution section
- The 2026-05-19 walk-the-knobs conversation in coordinator session memory
