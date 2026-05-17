# Cartograph — Operator Handoff

This document explains how to (re)build the Lafayette Square neighborhood map from
scratch, the principles behind the pipeline, and the work-in-progress problems the
next operator should pick up. Read this top-to-bottom before touching any code.

---

## 2026-05-15 — Procedural trees v1.5: in-Arborist authoring + skeleton-first roadmap — MAXI BRIEF

**Status (rolling, end of 2026-05-16):** Project goal: **ship 5 hero species at Hero quality** on top of morphology fillers, sharing one bark+leaf material pipeline via the Grove's master atlas. The 7-phase machinery is the *means*, not the end. **Phases shipped:** A (`2323a78` + `f6aaf61`), D (`06f903e`), B-core (`0b2f6cb`), B.1.a (`6c5c957` + revisions through `54355a4`), C (this commit — Phase C SHIPPED 2026-05-16 EOD). **Phase C pulled forward** per the 2026-05-16 EOD doctrine pivot below — the maxi-brief's original D → E → C → B → F → G ordering had C *before* B for the right reason, and Phase B's visual-quality ceiling on smooth-cylinder trunks confirmed it. **Remaining:** F (per-species PSD-authored cluster atlases — compositor dropped) → G.1–G.5 (five hero proving passes). Phases B.1.b/c (Workstage Bark panel + Stage debug overlay) deferred indefinitely — bark authoring iteration value is bounded by the geometric ceiling C addresses, not by UI surface. Phase F.5 (parametric leaf editor) **killed** — PS-authoring obviates the parametric path for 5 heroes. Phase E (conifer monopodial) priority-dropped; conifer is 7% of inventory; ship the algorithm if/when needed but it's not blocking heroes. Each phase ships its own commit + acceptance test; implementation handoffs are separate baby-agent sessions per [[feedback_user_spawns_baby_agents]]. This entry is the architecture record per [[feedback_notes_md_holds_architecture]] — every baby reads this end-to-end before touching code.

**Cross-phase orchestrator note (after A → D → B-core → B.1.a, 2026-05-15 + 2026-05-16):**

*Scope-drift transparency is teachable.* Phase A's baby silently extended `src/arborist/Workstage.jsx` to accept `source: 'procedural'` (necessary but undisclosed); orchestrator's Phase A trust-but-verify caught it and the Phase D brief explicitly required surfacing scope drift. Phase D baby then disclosed all three deviations (envelope.offsetYFrac, `effective` field in seedlings GET, PRESETS attractor-count tuning) in the commit body without prompting. B-core's baby (warm continuation through B.1.a) caught a load-bearing B-core bug in passing (the `mesh.userData?.atlasKind` lookup was reading wrong — primitive extras land on `geometry.userData`, not `mesh.userData`, so every vert silently got `aBark = 0` and the entire retint+roughness+jitter pipeline never fired; identity defaults made the regression invisible). The "surface anything not in this brief" clause is now a standard brief element.

*Skeleton-first ordering was right; we shipped out of order.* The maxi-brief's phase ordering put C (geometric polish) before B (bark surface) deliberately — a bark shader on smooth-cylinder trunks is polish on a CAD-looking substrate. The operator's call to ship B first to explore the bark space surfaced exactly that constraint: photo PBR on smooth `THREE.CylinderGeometry` produces visibly stretched + warped bark wraps because tapered-cylinder UV unwrap distributes texels non-uniformly across radius, and any uvScale/tile-wrap shader-side fix runs into mipmap derivative discontinuities at tile boundaries (recorded in NOTES Phase B.2 deferred — texture-arrays or pre-tile-in-atlas are the proper fixes, both pipeline changes). **The bark quality ceiling at v1.5 is geometric, not shader-side.** Phase C's multi-segment cylinders + non-linear taper + per-vertex radial noise + flange rings + root flare break up the regularity that makes the bark wrap look computer-generated. Phase B's photo-PBR + retint infrastructure stays; what changes is the substrate it wraps onto. Resuming skeleton-first ordering: **C lands before any further visual-quality work on bark.**

*PS-authored leaves obviate the parametric compositor.* Phase F's original scope included `arborist/leafCluster.js` — a sharp-based programmatic cluster compositor with per-leaf jitter/rotation/scale knobs. That infrastructure was designed to *scale* the leaf-authoring path to all 60 inventory species. For 5 heroes, Photoshop is faster + better: artist controls overlap, density, color variation, accent leaves directly; per-season variants are additional PSDs; no parametric tuning struggles (which we just lived through with bark's uvScale). **Phase F shrinks to "import authored cluster PNGs, atlas + tint + sparse-occupancy at runtime"; Phase F.5 dies entirely.** Substitution-fallback still uses shared per-morph PNGs (`public/textures/leaves/<morph>.png`) for filler species; only heroes get per-species PSD-authored clusters.

*ProceduralWorkstage layout: single-focused slot + tabs (2026-05-16, post-Phase-C).* The Phase A / D grid-of-cards layout (`auto-fill, minmax(320px, 1fr)` with 280-px-tall viewports per card) cropped vertically-composed silhouettes — columnar/weeping read as stubs because the canopy and the trunk-extension below it both need vertical headroom the small card can't give. Operator feedback (2026-05-16, immediately after Phase C landed): "I don't think we need to see all three at once, and in many cases a tree will be vertically composed." Replaced with: **slot tabs strip in the header (with a dirty-dot indicator), one focused card filling the main area, viewport as `flex: 1` left, 300-px controls rail (Envelope / Tropism / Seed / Dice / Adopt) right.** No functionality added or removed — controls behavior identical to Phase D. New affordance: tab switcher (necessitated by single-focus). The operator's explicit constraint — *"do not add or remove any functionality or innovate on the controls in any way"* — became the rule: a layout pass is purely spatial, and a slot selector is the only permitted new affordance because single-focus requires it. See [[feedback_focus_one_over_grid_for_3d_inspection]] for the general rule. This unblocks the eyes-on hero-iteration loop ahead of G.1–G.5: columnar/weeping silhouettes are now legible at workstage scale, which matters because G's hero passes are silhouette-driven (per the "Hero = silhouette + density + color" framing above).

### Why this exists

v1 procedurals (commit `dbbd1ed`, shipped 2026-05-14) work end-to-end through the pipeline but are not visually sufficient by any metric. Free-form recursive growth + single-leaf cards + flat bark texture = trees that read as "procedural toys" at every distance. SpeedTree is the eventual answer but carries a learning curve; the operator is willing to do procedural the hard-but-awesome way to ship something tailored to our distance profile (Hero/Browse dominant; Street view deferred to v2).

The critical reframing from 2026-05-15 design conversation:

- **At Hero distance the trees are the star but you can't see detail.** What carries is silhouette accuracy, crown density distribution, and per-species color.
- **At Browse we're directly overhead.** Disk-shaped canopy, trunk dot. Silhouette and color again.
- **Photoreal only matters in Street view** — deferred to v2 entirely. Don't over-build for it.

So the visual targets are silhouette + density + color, not leaf-vein fidelity or bark-micro-texture.

### Design pillars

**0. Two-tier substitution: heroes on top of morphology fillers.** The five morphology buckets (`procedural_broadleaf`, `procedural_conifer`, `procedural_ornamental`, `procedural_columnar`, `procedural_weeping`) stay in the roster as **fillers** at `quality: 2` — they catch every park-inventory species that doesn't have its own hero authored yet. Hand-tuned **hero species** (`acer_saccharum_procedural`, `ginkgo_biloba_procedural`, `salix_babylonica_procedural`, `gleditsia_triacanthos_procedural`, plus a fifth TBD per G.5) sit on top at `quality: 4`, each carrying its own envelope tuning, leaf cluster atlas, bark settings, and fall-color ramp. `arborist/bake-trees.js:pickVariant` already implements the two-tier lookup: `speciesMap.map?.[parkSpecies]` (preferred-species via `src/data/park_species_map.json`) wins first; category fallback covers everything else. Heroes win their bucket's quality lottery automatically because of `quality: 4 > 2`. The same mechanism is how SpeedTree slots in at v2: SpeedTree imports get authored at `quality: 4+` and the procedural heroes silently drop out. **Substitution is the safety net; heroes are the visible product.** No new code is needed for the two-tier doctrine — just authoring.

**0.5. The Grove's single master atlas is the load-bearing innovation.** `arborist/bake-look.js:unifyAtlases` composites bark + leaf sub-atlases into one master PNG per Look; `atlas-survey.js` dedupes tiles by sha1 hash before pack. Adding hero species costs nearly nothing in atlas footprint because their bark + leaf-cluster tiles dedupe against the existing roster's identical content. Combined with Phase B (procedural bark shader applying roster-wide — vendor + procedural materials both lose their bark color tiles to a shared 4×4 placeholder via material extras), the unified atlas after the v1.5 arc may actually be **smaller than today's atlas even with 5 hero species added**. The Grove's atlas pipeline is the engine that makes the heroes-on-fillers doctrine feasible — without sha1 dedup + roster-wide shader unification, adding 5 hand-tuned species would multiply atlas footprint and shred GPU memory budgets.

**1. Skeleton-first ordering, like the map maker.** Centerlines (branching topology) → surface (cylinders, flanges, root flare) → shader (bark, leaf clusters, tints). A bark shader on wrong-silhouette trees is polish on a broken script. Phase order matches this strictly: skeleton algorithms (Phases D, E) land before geometric polish (C) before surface shaders (B) before foliage (F) before per-species tuning (G).

**2. Two algorithms, not one.** Conifers (gymnosperms) and broadleaves (angiosperms) have fundamentally different growth architectures. Forcing them through one model is why generic procedural trees look fake.

- **Broadleaf / weeping / columnar / ornamental → Space Colonization (Runions 2007) + tropism vector.** Define envelope; scatter N attractors inside; branches grow toward nearest attractors; branch kills attractors within range. Tropism vector handles all silhouette variants from one algorithm: `(0,0,0)` = broad symmetric, `(0,-0.4,0)` = weeping recurve, `(0,+0.3,0)` = columnar bias, `(0,-0.05,0)` = ornamental. Sympodial topology (two-way splits).
- **Conifer → monopodial whorl.** Single dominant central leader extends top-most all the way up; emits horizontal whorls of N lateral branches at regular vertical spacing; per-whorl branch length f(height) → cone shape; lower-whorl droop f(age). Botanically correct; SCA produces wrong topology for any conifer.

**3. Dice + adopt, not slider tune.** Procedural trees produce unique topology per seed. Authoring workflow is roll-the-dice-until-good, not turn-knobs-precisely. Each species carries ~3 adopted variants (operator can adopt more or fewer); per-instance runtime jitter (Y-rotation, independent XZ + Y scale, hue shift, wind phase) provides visible diversity across the 745 LS placements. Three baked variants × strong shader jitter = looks like 30 distinct trees in scene.

Baking is required (SCA in JS is ~50–500ms/tree × 745 placements = unacceptable; leaf clusters need sharp-composited atlases; bake-look needs source GLBs to atlas-pack) but **baking ≠ posing**. Adoption = "freeze this rolled topology to a GLB so the GPU can instance it cheaply."

**4. Minimum-viable UI per phase.** Each phase exposes only the knobs its algorithm needs. Phase A is just dice/adopt buttons (generator unchanged). Envelope panel arrives with SCA (Phase D). Conifer-whorl panel arrives with monopodial (E). Bark pattern dropdown arrives with shader (B). Leaf cluster swatches arrive with clusters (F). No premature param surfaces — they'd just need re-tooling as the underlying algorithm grows.

### Generator contract (the load-bearing API)

`generateTreeMesh(params) → {barkGeo, leafGeo}` is the signature every phase preserves. UI binds to it; CLI binds to it; tests bind to it. The params object grows fields per phase but never breaks back-compat:

```js
generateTreeMesh({
  // Identity (Phase A)
  species,           // 'procedural_broadleaf' etc.
  morphology,        // 'broadleaf' | 'weeping' | 'columnar' | 'ornamental' | 'conifer'
  seed,              // integer; macro seed driving topology

  // Silhouette (Phase D for SCA species; Phase E for conifer)
  envelope: { profile, height, width, asymmetry },
  branching: {
    mode,            // 'sca' | 'monopodial'  — selected per morphology
    phyllotaxis,     // 'alternate' | 'opposite' | 'whorled'
    tropism,         // [x,y,z] gravity bias (SCA)
    attractorCount, influenceRadius, killRadius, stepLength,  // SCA tunables
    whorlsPerHeight, branchesPerWhorl, leaderDominance, droopPerWhorlAge,  // monopodial tunables
  },

  // Geometry (Phase C)
  geometry: { lodTier, segmentsPerBranch, radialNoise, flangeRingScale, rootFlareScale, buttressFinCount },

  // Surface (Phase B)
  bark: { pattern, darkColor, lightColor, scale, roughness },

  // Foliage (Phase F)
  leafCluster, tintRamp: { summer: {inner, outer}, fall: {inner, outer}, ... },
})
```

PRESETS table in `arborist/generate-procedural.js` is the committed canonical seedling defaults (5 morphology fillers × ~3 seedlings each, today; growing to +5 hero species over G.1–G.5). Per-variant `params: {}` overrides in `arborist/state/procedural_<species>/seedlings.json` overlay on top — operator's diced + adopted choices live there.

**Hero species are first-class citizens at this same API.** The params object grows for heroes — full per-species `bark` extras (pattern + colors + scale + roughness), `leafCluster` reference to a per-species cluster atlas, two-stop `tintRamp` per season — but the `generateTreeMesh()` signature does not change. Heroes get their own PRESETS table entries (e.g. `acer_saccharum_procedural`, `ginkgo_biloba_procedural`); `park_species_map.json` routes inventory entries to them via preferred-species lists; `bake-look.js`'s `unifyAtlases` round-trips them through the same atlas pipeline as fillers. Fillers continue to use morphology-bucket defaults via `DEFAULT_SCA_BY_PRESET` (or new `DEFAULT_BARK_BY_PRESET` / `DEFAULT_LEAFCLUSTER_BY_PRESET` tables introduced by Phases B and F). The mechanical distinction between "hero" and "filler" is **quality rating + per-species tuning depth**, not pipeline location.

### Phase table

Each phase is a separate commit + acceptance + visible-bug coverage statement.

**Phase A — Procedural mode: dice + adopt** (UI iteration surface) — **SHIPPED 2026-05-15** (commits `2323a78` + `f6aaf61` query-string fix)
- New `src/arborist/ProceduralWorkstage.jsx`; top-level mode toggle in `ArboristApp.jsx` (Procedural button next to Grove)
- Per-species panel: variant slots, each with 🎲 dice + ✓ adopt buttons + SpecimenViewport thumbnail (blob-URL'd GLB from the generate endpoint, keyed on {species, slot, seed, params} so dice rolls re-fetch and revoke the prior blob URL)
- Endpoints: `GET /procedural/species`, `GET/POST /procedural/:species/seedlings`, `POST /procedural/generate` (returns `model/gltf-binary` directly), `POST /procedural/:species/publish?look=<id>` (shells out to `node arborist/generate-procedural.js --species <id>` + fires per-Look atlas auto-bake fire-and-forget)
- Generator unchanged; `generate-procedural.js` refactored to export `generateSingleVariantGLB`, `readEffectiveSeedlings`, `writeSeedlings` + `PRESETS` + `BARK_BY_SPECIES`. `main()` now consumes the seedlings overlay (PRESETS fallback on fresh checkouts), gated on an `import.meta.url === argv[1]` script check so importing the module from `arborist/serve.js` is side-effect-free. CLI gained `--species procedural_<id>` flag.
- Store: `proceduralOpen`, `proceduralActiveSpecies`, `proceduralSeedlings` (per-species), `proceduralDirtyBySpecies` (per-slot dirty markers), `proceduralSpeciesList`, plus `loadProceduralSpecies`, `loadProceduralSeedlings`, `setProceduralSlotSeed` / `diceProceduralSlot`, `adoptProceduralSlot`, `republishProceduralSpecies`. Republish blocked until all dirty slots are adopted (UI disables the button).
- Determinism verified end-to-end: same {species, slot, seed, params} → byte-identical GLB across re-requests. Republish round-trips through publish-glb unmodified (~1.7s for a 2-variant species on a Mac).
- **Fixes:** operator iterates in seconds via UI; no CLI round-trip for new variants
- **Doesn't fix:** trees still look the same as v1 (no algorithm change — Phases D/E/C/B/F/F.5/G.1–G.5 follow)

**Phase D — SCA + tropism** (skeleton for broadleaf / weeping / columnar / ornamental) — **SHIPPED 2026-05-15** (commit `06f903e`)
- New `arborist/spaceColonization.js` (~270 LOC). Runions 2007 SCA + tropism, pure kernel (no three.js imports — emits raw position/parent arrays; mesh assembly stays in generate-procedural.js). Exports `runSCA`, `ENVELOPE_PROFILES`, `DEFAULT_SCA_BY_PRESET`, `mulberry32`.
- 5 named envelope profiles as 2D (t, r) revolution curves: `rounded_oval`, `umbrella`, `tight_column`, `broad_low`, `asymmetric_oval`. Profile r-values multiply by `envelope.width` (=canopyR semantics) to get max radius at each normalized height.
- **`envelope.offsetYFrac` added beyond the brief.** Negative values let the envelope hang below trunkBase — load-bearing for weeping (initial -0.4 tropism alone wasn't enough; branches just slowed their upward growth, never curtained). With `offsetYFrac=-0.6` the umbrella envelope straddles the trunk top so attractors include the curtain zone; tropism then physically pulls branches into it. The willow signature emerges from envelope geometry + tropism together, not tropism alone.
- `generateTreeMesh()` dispatch: `useSCA = preset !== 'conifer'`. Conifer falls through to the existing free-growth `if (preset === 'conifer')` block untouched (Phase E will replace). SCA path emits one tapered cylinder per node→parent edge (6 radial segs; `buildTaperedCylinderBetween` helper rotates Y-aligned CylinderGeometry to align with the edge), Murray's-law radii via post-order traversal (leaf=tipRadius, internal=sqrt(sum(child.r²))). Leaf cards at every tip via existing addLeaf.
- `resolveVariantParams` extended to do one-level-deep merge for nested `envelope` / `sca` / `branching` objects, so a partial overlay (e.g. operator dragging just `sca.tropism.Y`) doesn't wipe sibling fields off the PRESET base.
- PRESETS table grew `envelope` + `sca` per non-conifer variant. Variants 2-3 of broadleaf + variant 2 of weeping have higher `killRadius` / `stepLength` and lower `attractorCount` than the brief's starter defaults — necessary to keep lod0 tri counts in a reasonable Phase D range (1.8K–19K per variant after publish-glb's prune pass; conifer unchanged at ~6K). Phase C's geometric polish will absorb the silhouette quality cost.
- Seedlings GET endpoint extended with an `effective` field per variant (PRESETS base merged with operator overlay) so UI slider positions bind to resolved values. Adopt POSTs back the overlay-only `{slot, seed, params}` shape — disk state stays minimal, touched fields only.
- ProceduralWorkstage gains per-slot SCAPanel: Profile dropdown + Width/Height/Asymmetry/Y-offset sliders + Tropism XYZ sliders. Hidden for `procedural_conifer`. Debounced via local `DraftSlider` (150ms idle commit + pointer-up final-commit, same pattern as cartograph/Panel.jsx's DraftRangeInput — pulled into ProceduralWorkstage rather than crossing the cartograph↔arborist boundary).
- Silhouette verification (geometric, from SCA node positions): broadleaf W/H 1.87 (rounded oval), weeping W/H 2.29 with 3.2m of branches dropping below trunk top (CURTAIN), columnar W/H 0.29 (narrow vertical), ornamental W/H 1.99 (broad-low). All four visibly distinct from each other and from conifer.
- Determinism preserved end-to-end (same {species, slot, seed, params} → byte-identical GLB; CLI `node arborist/generate-procedural.js [--species <id>]` round-trips). Conifer GLB byte count identical to Phase A (549,532 bytes) — confirmed non-regression.
- **Fixes:** species silhouettes finally correct. Weeping recurves from physics. Columnar narrows. Ornamental broad-low-attached.
- **Doesn't fix:** conifers (Phase E); bark/leaf shaders (B/F); geometric polish — branches still plain tapered cylinders (C); per-species hero tuning (G.1–G.5).

**Phase E — Monopodial whorl** (skeleton for conifer) — **priority-dropped after Phase D**
- New `arborist/monopodialWhorl.js` (~150 LOC). `generate-procedural.js` swaps conifer path to `runMonopodial(envelope, params)`. ProceduralWorkstage gains conifer panel: whorlsPerHeight, branchesPerWhorl, leaderDominance, droopPerWhorlAge.
- **Priority drop rationale:** conifer is 7% of `src/data/park_trees.json` inventory (55/745 placements). Park-trees shape distribution is broadleaf 528 (71%), ornamental 139 (19%), conifer 55 (7%), columnar 31 (4%), weeping 3 (<1%). The operator's eye-level visual mix at LS is maple / willow / ginkgo / locust — conifer conspicuously absent. Ship the algorithm so those 55 placements don't fall back to SCA broadleaf and look wrong, but **per-conifer-species hero authoring (Spruce vs Pine vs Fir as distinct hero species ids) defers to v1.6** unless visual review at LS demands otherwise. The G.5 slot reserves the option to elevate one conifer hero in the v1.5 arc if visual review insists.
- **Fixes:** conifers read as conifers from Browse/Hero. Central leader visible; whorls + skirt droop correct.
- **Doesn't fix:** per-conifer-species variants (Spruce/Pine/Fir) need authoring, not code — and that authoring is deferred to v1.6 except for an optional G.5 conifer hero.

**Phase C — Geometric polish on correct skeletons** — **SHIPPED 2026-05-16 EOD.**
All five primitives landed in `arborist/generate-procedural.js`:
- `nonLinearTaper(rBase, rTop, t, exp=2)` replaces linear lerp inside `makeBranch`'s per-segment loop, sampled at branch-global `t = s/n`. SCA edges keep linear taper across each (already-short) edge; the aggregate non-linear taper emerges from Murray's law radii × the SCA chain. Flagged: per-edge non-linear taper buys little when individual edges are ~0.4 m.
- Radial-segment count bumped to a flat `PHASE_C_RADIAL_SEGS = 12` everywhere (trunk, flare, conifer leader, makeBranch cylinders, SCA edges). Previous gen-aware ladder (6 / 4 / 3) dropped — radial resolution is now uniform; `nBend` (axial-bend count) stays gen-aware.
- `applyRadialNoise(geo, branchHStart, branchHLen, scale=0.05, seedOffset)` runs in LOCAL cylinder frame BEFORE any transforms. Hashed by `(angle, branchHStart + localFrac*branchHLen)`. For makeBranch's per-segment chain, adjacent segments share the same noise at their interface H — seam-continuous along straight branches. **Flagged seam case:** SCA edges share a node position but their local cylinder frames don't align across edges (different `setFromUnitVectors(Y, dir)` per edge), so noise is NOT continuous across SCA-node interfaces. Visible at Hero close-up as faint per-edge facet flips; acceptable at v1.5 — fix is post-merge normal computation, deferred. Per-vertex displacement gated on `r > 0.05` (twigs skipped — sub-mm noise on a ~1 cm twig is invisible and wastes `computeVertexNormals` time).
- `makeFlangeRing(parentPos, childPos, childRadius, segs=12, scale=1.3)` short flared frustum at the BASE of child branches. Emitted at every recursive `growBranch` call's root (conifer free-growth path) AND at children of true branching nodes (`parent.children.length > 1`) in the SCA path — NOT at every SCA edge. Trunk-to-first-branch joints get one because growBranch's top-level call from the conifer layer loop hits the emit path.
- Root flare + 6 subtle buttress fins replace the prior single-flare cylinder block. `makeButtressFin(trunkRadius, outward, height, thickness)` builds a triangular wedge that tapers to nothing at the top, so silhouette reads as Midwestern broadleaf (maple/oak/locust) rather than tropical/banyan. Starter values: outward 0.08, height 0.12, thickness 0.04. ~8 tris × 6 fins = ~48 tris/tree. Per-fin azimuth jittered via `r(700+f)`.

**Measurements (lod0 / lod1 / lod2 tri counts, pre → post Phase C):**
- broadleaf-1: 11,648 → 22,352 / 7,790 → 10,730 / 6,900 → 6,180
- broadleaf-2: 10,444 → 23,140 / 5,714 → 10,978 / 5,524 → 6,200
- broadleaf-3: 19,538 → **41,522** / 14,460 → 19,988 / 13,750 → 11,668
- conifer-1:  6,442 → 14,058 / 3,064 → 6,648 / 2,190 → 2,114
- conifer-2:  5,580 → 12,618 / 2,676 → 5,988 / 2,052 → 1,972
- ornamental-1: 2,930 → 5,806 / 1,774 → 2,760 / 1,184 → 1,276
- ornamental-2: 5,064 → 9,826 / 2,592 → 4,664 / 2,252 → 2,364
- columnar-1: 1,796 → 3,904 / 860 → 1,852 / 644 → 678
- columnar-2: 2,422 → 5,346 / 1,162 → 2,538 / 892 → 946
- weeping-1:  5,784 → 11,346 / 2,588 → 5,384 / 2,250 → 2,356
- weeping-2:  17,320 → **32,558** / 13,830 → 15,818 / 13,422 → 10,336

**Tri-budget flag.** Brief expected ~30–40% lod0 growth; observed ~80–115% (radial-segs doubling 6→12 dominates). Two variants pierce the brief's 30K lod0 advisory: broadleaf-3 at 41.5K, weeping-2 at 32.6K. Per brief acceptance #6: VRAM at LS scale is dominated by atlas (13.6 MB color + 15.4 MB normal master PNGs), not source GLBs (745 placements × shared instanced geometry per variant — geometry is reused, not duplicated). lod1 & lod2 grow proportionally because publish-glb's `simplify({ratio: 0.85, 0.40, 0.10})` runs against the single source. Lever available if perf review flags it: drop `PHASE_C_RADIAL_SEGS` to 10 (single-line change). Not pulled at landing time — visual cross-section quality on the trunk is the load-bearing reason for 12.

**Determinism preserved:** `sha1sum public/trees/procedural_broadleaf/skeleton-1-lod0.glb` = `d07d4ba6...` on two consecutive `node arborist/generate-procedural.js --species procedural_broadleaf` runs. All noise displacement uses `seed()` deterministic hash.

**No shader / pipeline touches.** `publish-glb.js`, `bake-look.js`, `bake-trees.js`, `atlas-pack.js`, `atlas-survey.js`, `treeAtlasMaterial.js`, `InstancedTrees.jsx` — all untouched. `generateTreeMesh()` signature unchanged. Single shader program preserved.

**Surfaced scope-drift items** (per [[feedback_baby_must_surface_scope_drift]]):
1. `growBranch` gained an optional `emitFlange=true` parameter — only `false` would be needed if a caller wants to suppress the flange (none currently do). Worth noting because the brief's "files-touched" line was generate-procedural.js only and this signature change is fully internal to that file but worth flagging.
2. `buildTaperedCylinderBetween` gained an optional `noise = {scale, seedOffset}` parameter. Same rationale — internal-only to the file but adds a param to an exported-shape helper. Default null = no-op for any future caller that doesn't pass it.
3. `BARK_BY_SPECIES.uvScale` was NOT touched; the v3 baseline from `54355a4` (all uvScale [1,1]) stays. Phase C does not retune bark tiling.

**Fixes:** branches taper realistically; joints buttress smoothly at true branching events; trunks look planted via root flare + subtle fins; close-up Hero substrate is non-trivial enough that bark photo wraps stop showing the obvious tapered-cylinder-stretch artifact (the load-bearing acceptance criterion — Phase C exists to unblock the bark visual ceiling).

**Doesn't fix:** SCA-edge noise seam continuity (faint per-edge facet flips at Hero close-up — flagged above); foliage still sparse (Phase F); per-species hero tuning (G). Phase B.1.a's bark wrap-line crawl is unchanged — Phase C does NOT address shader-side bark issues; it changes the substrate the shader wraps onto.

**Phase C.1 — SCA canopy-bias fix** — **SHIPPED 2026-05-16** (this commit, post-Phase-C, pre-Phase-F)
Bug Phase C polish caught at the orchestrator-trust-but-verify step (visual canopy lean independent of trunk lean, on every seed). Diagnosis (Phase C baby's bypass run): SCA root at (0, 4.75, 0) with no lean still produced tip centroid at (-3.79, 7.75, 1.54) — ~4 m off-axis. Root cause is a positive-feedback bias in `runGrowthLoop`: a single growing tip's ~5 cm random asymmetry from rejection-sampled attractor averaging gets amplified by attractor-killing into a metastable canopy drift over ~100 iters. Independent of trunk lean, independent of geometry primitives, per-seed-variable.

Fix is structural, lives entirely in `arborist/spaceColonization.js` (~80 LOC; `generateTreeMesh()` signature unchanged; zero pipeline / shader / artifact touches).

- **§1 Force axial trunk extension.** After the existing auto-grow lift, deterministically extend the trunk straight up the central axis to `branchingStartY = trunkBase[1] + yOffset + envelope.height × branchingStartFrac`. Extension nodes carry `axial: true` and are skipped in `runGrowthLoop`'s nearest-node search for attractor pull — so they don't shape the canopy, they just paint a straight trunk to the branching-start height. Attractors near them still get killed by the normal kill pass so the central column clears cleanly. Per-morphology fraction: 0.5 for non-weeping, 0.2 for weeping (so the weeping trunk doesn't pierce above the curtain zone).
- **§2 N-child azimuthal seed.** At the trunk top, seed `initialChildCount = 6` children spaced evenly around `TAU`. Each becomes a normal (non-axial) SCA tip from iter 1. Per-wedge attractor assignment splits cleanly across 6 sectors so iter-1 pull is symmetric and bias on one sector is balanced by tips on opposing sectors.
- **§3 Weeping carve-out.** `branchingStartFrac=0.2` + `seedStep = stepLength × 0.5` (vs `max(0.5×step, 0.25×width)` for others). Tight central cluster + strong −Y tropism keeps the curtain effect intact; wider seeds in weeping breaks the curtain. Detected by `envelope.profile === 'umbrella'` OR `envelope.offsetYFrac < -0.1` so future PRESETS overlays naming a weeping morphology pick the carve-out automatically.
- **Brief tuning deviation.** Brief specified `seedStep = stepLength × 0.5` (≈ 0.2 m). At that distance, the 6 children clustered too tightly for iter-1 wedge-balancing to fire — they all competed for the same attractors before the kill pass cleaned up. Widened to `max(0.5×stepLength, 0.25×envelope.width)` (≈ 1 m at LS scale) — each child lands firmly inside its own 60° wedge. 20-seed broadleaf sweep mean dropped from 0.92 m to 0.87 m, columnar 0.59 → 0.32, ornamental 0.65 → 0.31. Weeping exempt (carve-out above) — 0.247 m unchanged.

**Bypass-script verification.** Canonical 5-seed (seeds 101/202/303/404/505) bypass with trunkBase=(0, 4.75, 0), canopyR=4, canopyH=8 — tip-XZ-centroid offset from trunk axis:
- broadleaf:  mean 0.604 m, max 2.273 m (4/5 < 0.25 m; one runaway-chain at 2.27 m)
- columnar:   mean 0.207 m, max 0.282 m (5/5 < 0.30 m)
- ornamental: mean 0.317 m, max 1.087 m (4/5 < 0.20 m; one runaway at 1.09 m)
- weeping:    mean 0.249 m, max 0.736 m (4/5 < 0.26 m; one at 0.74 m)
- Baseline (pre-C.1): ~4 m offset always, independent of seed. Median improvement 10–20×; mean 5–15×.

**Residual not-fixed (flagged, separate failure class).** ~5–35% of seeds per non-weeping morphology in 20-seed sweeps still produce 1–3 m offsets, but the failure mode is "runaway chain" not "initial-tip bias": those seeds have 4× the tip count (~250 vs ~60) because attractor-kill barely keeps up with N=6 expansion when rejection sampling produces isolated outlier attractor pockets. Tips chase those outliers at 0.4 m/iter (stepLength) but killRadius=1 m → 7–8 iter chase, chains off-axis. **Fix is outside C.1 scope** — candidates are per-tip chain length cap, raised killRadius, or outlier-attractor pruning. Visual review (e.g. broadleaf seeds 749/1391/1819) decides whether this needs follow-on tuning. Median canopy is well-centred which is the dominant LS-scale read.

**Constants exposed.** `sca.branchingStartFrac` + `sca.initialChildCount` are now PRESETS-overlay-resolvable through `resolveVariantParams`'s existing effective-field plumbing — per-variant overrides if a particular species's silhouette demands tighter or looser tuning. Defaults sit on each preset in `DEFAULT_SCA_BY_PRESET`.

**Tri-count delta.** Force-extension adds ~10 axial trunk segments × `PHASE_C_RADIAL_SEGS=12` × 6 tris/seg ≈ 720 tris/tree at lod0. Well inside the Phase C lod0 envelope.

**Conifer untouched.** Conifer (`runMonopodial`) doesn't call `runSCA`; the bias fix is structurally outside conifer code. Confirmed by code path inspection.

**Determinism preserved.** All randomness via `mulberry32(seedN × 1664525 + 1013904223)` (same stream as Phase D). Same `seedN` + params → byte-identical attractor cloud + byte-identical node graph + byte-identical GLB.

**Surfaced scope-drift items** (per [[feedback_baby_must_surface_scope_drift]]):
1. `runSCA`'s `envelope` input now reads `envelope.offsetYFrac` as a weeping-detection signal in addition to the existing `yOffset` computation — same input value, second consumer. Not a schema change.
2. Internal node shape grew an optional `axial: true` flag on root + auto-grow + force-extension nodes. Default-falsy; no other consumer reads it. `computeRadii`'s post-order walk treats axial nodes normally (single-child chain → radius = child.radius, which is correct trunk behavior).
3. `seedStep` widening deviates from the brief's `stepLength × 0.5`. Documented above with measurements. Brief's value left columnar/ornamental still failing the 0.5 m criterion; widened value passes columnar/ornamental and is ~equivalent on broadleaf.
4. No tests written. Phase D shipped without an in-repo test harness for `spaceColonization.js`; C.1 follows the established pattern (bypass-script for verification, then deletion).

**C.2 next.** Post-merge normal computation to seal SCA-edge facet flips (Phase C's flagged "not-fixed" item) — separate brief.

**Phase C.1b — runaway-cluster fix** — **SHIPPED 2026-05-16** (this commit, post-C.1)
Resolves C.1's flagged "residual not-fixed" failure class. Diagnosis differed from C.1's "runaway chain" framing: linear chains weren't the load-bearing mechanism — per-node BRANCH FAN-OUT was. When one of the N=6 initial seeds landed in a dense attractor pocket, that node accumulated pulls iter after iter and spawned a new child every iter, with each new tip inheriting the pocket and spawning further. One seed converted into a 200+ tip clump 1–3 m off-axis while the other 5 seeds waited for their attractors to be reached.

Fix is one structural rule in `arborist/spaceColonization.js` (~6 LOC + 1 constant): a node that has already accumulated `MAX_CHILDREN_PER_NODE_DEFAULT = 3` direct children no longer accepts attractor pull. Capped attractors flow to next-nearest tip (usually a sibling or further-out tip), so canopy density is redistributed rather than lost. Same gate mechanism as `axial:true`. Overridable per-preset via `sca.maxChildrenPerNode`.

**Three options compared via bypass-script** (`arborist/_c1b_bypass.mjs`, 20-seed sweep, deleted on ship):
- **A. Raise killRadius** (broadleaf 1.0→1.5, columnar 0.9→1.3, ornamental 1.0→1.5): centroid mean barely moved (broadleaf 0.89→0.79 m); worst runaway seeds persisted (seed 101: 410 tips, centroid 2.71 m). Mechanism kills LATERALLY around the chain, not BEHIND it — kill-corridor stays open.
- **B. Prune sparse attractors** (K=4 D=1.2 m): WORSE (broadleaf centroid 0.89→1.47 m, tip count up). K=2 D=0.8: broadleaf better (0.46) but ornamental tipped (0.44→0.77). Per-seed brittle — wrong outliers got pruned.
- **C. Per-node children cap (=3)**: clean across all four morphologies. Selected.

**Bypass-script verification** (20 seeds × 4 morphologies, trunkBase=(0, 4.75, 0), canopyR=4, canopyH=8):
- broadleaf:  centroid mean 0.156 m (was 0.889 m), max 0.300 m (was 2.879 m); tips mean 62.3 (was 173.7), max 74 (was 629). 0/20 runaway.
- columnar:   centroid mean 0.154 m (was 0.341 m), max 0.344 m (was 2.310 m); tips mean 45.3 (was 70.8), max 50 (was 384). 0/20 runaway.
- ornamental: centroid mean 0.171 m (was 0.435 m), max 0.437 m (was 2.953 m); tips mean 52.4 (was 80.2), max 57 (was 242). 0/20 runaway.
- weeping:    centroid mean 0.166 m (was 0.294 m), max 0.487 m (was 2.554 m); tips mean 63.6 (was 86.2), max 72 (was 295). Mean tip-Y vs trunkBase = −2.01 m (curtain descent intact; cap didn't break the weeping silhouette).

**Tri-count delta.** Tip count drop is ~64% (broadleaf 173 → 62 mean) and max-tip outlier drop is ~88% (629 → 74). Tri count is roughly proportional to total node count (per-cylinder emission in `generateTreeMesh`), so the lod0 envelope improves substantially relative to Phase C's 41.5K broadleaf-3 figure. Actual re-publish-vs-baseline GLB tri-counts not measured in this commit (no pipeline / shader / artifact touches); will surface when Jacob next runs `republish-all.js`.

**`generateTreeMesh()` signature unchanged.** Kernel-only edit; no pipeline / shader / artifact touches.

**Determinism preserved.** Same seedN + params → identical node graph (broadleaf seed 101: 279 nodes, identical positions across two runs; weeping seed 303: 302 nodes, identical positions).

**Conifer untouched.** `runMonopodial` doesn't call `runSCA`; fix is structurally outside conifer code.

**Surfaced scope-drift items** (per [[feedback_baby_must_surface_scope_drift]]):
1. Weeping was NOT exempted from the cap — initial expectation was that the curtain morphology would need a higher cap (long descending chains), but bypass-script showed the curtain is a CHAIN morphology (single tip arcing −Y for many iters) not a fan-out morphology, so cap=3 doesn't restrict curtain strands. Weeping mean offset actually IMPROVED (0.29 → 0.17 m). `MAX_CHILDREN_PER_NODE_DEFAULT = 3` applies uniformly to all four morphologies.
2. A `chainDepth` mechanism (cap=12 in growth-loop, per-node continuation tracking) was prototyped before the diagnosis converged on fan-out — discarded as dead code before commit. The simpler single-rule cap covers the failure mode cleanly.
3. The brief's three-option menu reflected a different mental model (linear-chain failure mode) than what actually drives the runaway (branch fan-out from pocket-dominance). The fix that worked is closer to "Option C — chain cap" in spirit but lands on a structurally different lever (per-node child count, not per-tip chain length).
4. `_c1b_bypass.mjs` was created at session start for variant comparison and deleted on ship (follows Phase D / C.1 verify-then-delete pattern).

**C.1c next** (the cosmetic crag↔SCA radius joint at trunk top, flagged in chat by Jacob during C.1 review) — separate brief. **C.2 still next** (post-merge normal computation for SCA-edge facet flips) — separate brief.

**Phase B (core) — Photo-PBR bark + retint shader infra** — **SHIPPED 2026-05-15** (commit `0b2f6cb` + post-ship fix `0cd853b` for the `barkBySpeciesEffective` useMemo placement bug)
- **Scope pivot from the original brief:** the GLSL pattern-library approach (5 procedural bark patterns via world-space noise + normal perturbation in shader) was DROPPED before code landed. Jacob (correctly) had zero faith we could ship 5 convincing GLSL bark patterns at Hero visual quality without significant craft, and the single-shader-program constraint (Bloom, see `bake-look.js:200`) makes uniform-branched-shader paths risky. The actual Phase B is **per-species photo-PBR bark materials + shader-side retinting infrastructure** — no GLSL pattern library. Phase B core lands the load-bearing infra; Workstage Bark panel + Stage debug overlay defer to **Phase B.1**.
- 5 tileable CC0 PBR bark materials sourced from ambientCG, dropped under `public/textures/bark/<materialRef>/` (color.jpg + normal.jpg (NormalGL convention) + roughness.jpg + LICENSE.txt). Filler-species mapping: broadleaf→Bark007 (heavy furrowed), conifer→Bark012 (scaly), ornamental→Bark003, columnar→Bark004 (smooth), weeping→Bark015. Hero species (G.1–G.5) will publish their own mappings on top.
- `arborist/generate-procedural.js` replaces `buildBarkPng` (32×32 sharp-generated noisy brown per species) with `loadBarkBundle(materialRef)` (reads photo color+normal bytes from disk + embeds into the GLB material as `baseColorTexture` + `normalTexture`). `BARK_BY_SPECIES` rewritten from hex colors to per-species bark spec `{materialRef, uvScale, tintBase, tintJitterRange, roughnessOverride}`. `patchManifestForFillTier` extended to stamp `manifest.bark` on each species's published manifest.json.
- `arborist/bake-look.js` reads each species's `manifest.bark` while gathering the roster and surfaces a `barkBySpecies` block in `trees-atlas.json`. Also changes the per-primitive `atlasKind` extras from the constant `'unified'` to `tile.classification` (`'bark'` or `'leaf'`) so the runtime can distinguish bark vs leaf fragments without re-classifying.
- `src/components/treeAtlasMaterial.js` adds 3 uniforms — `uBarkTintBase` (vec3), `uBarkTintJitterRange` (float), `uBarkRoughnessOverride` (float) — to the shared tree material. Vertex shader passes `aBark` attribute through `vBark` varying + per-instance `vWorldXZ`. Fragment shader patches at `<map_fragment>` (post-texture-sample retint, gated by `vBark` so leaf fragments pass through identity) and `<roughnessmap_fragment>` (per-species roughness clamp, also gated by `vBark`). Per-instance hue jitter hashes world-XZ so adjacent trees of the same species look different but the whole tree is one color. Bloom-stable: same compiled shader program for every (species, draw call); only uniform VALUES differ per draw.
- `src/components/InstancedTrees.jsx` bakes a per-vertex `aBark` attribute on each cloned geometry at runtime-merge time based on `mesh.userData.atlasKind`. Derives species from the GLB URL (regex on `/trees/<species>/`) since out-of-roster placements substitute URL but retain original `inst.species`; the URL is the authoritative species for retint purposes. `onBeforeRender` on each submesh `applyBarkUniforms` mutates the shared material's uniforms per (species, draw). Per-Look palette override: `scene.materialColors[<species>]` wins over species default `tintBase` at runtime — no rebake required (instant retint on reload).
- **Pipeline survives SpeedTree migration unchanged.** SpeedTree-imported species would write the same `manifest.bark` shape and run through the same shader. Heroes drop out of the procedural roster via the `quality` mechanism when their SpeedTree replacements land. Phase B becomes infrastructure that outlives the v1.5 procedurals.
- **Measurements (lafayette-square Look post-Phase-B-bake):** 11 bark tiles + 19 leaf tiles in atlas (same count as pre-B since each of the 5 filler species picks a unique materialRef — sha1 dedup will fire when G.1–G.5 heroes share refs with their fillers, e.g. Sugar Maple on Bark007). Atlas dims 4040×2600. Atlas color PNG 13.6 MB / normal PNG 15.4 MB (heavier than pre-Phase-B because the photo textures are genuinely 1K each; pre-Phase-B used 32×32 placeholders). The Grove pillar 0.5 holds: with hero-on-filler shared refs, atlas size will not grow proportionally to species count.
- **Determinism preserved.** Same {species, slot, seed, params} + same materialRef on disk → byte-identical published GLBs across re-runs (verified `sha1sum public/trees/procedural_broadleaf/skeleton-1-lod0.glb` before/after a re-publish of the same species).
- **Fixes:** bark looks like photo bark (not 32×32 noisy brown); per-(species, Look, instance) retint via uniforms; per-Look pink-tinted maples possible via `materialColors[procedural_broadleaf]` reload; per-instance hue jitter ready; per-species roughness override ready; single shader program preserved; pipeline ready for SpeedTree drop-in.
- **Doesn't fix:** UV tiling — the 1K photo bark sample stretches across full cylinder height (a 12m tree gets the same sample density as a 0.4m twig); tighter per-cylinder tiling is a follow-on requiring a `uvScale` shader uniform + per-cylinder UV multiply. No Workstage authoring UI (Phase B.1). No Stage debug overlay (Phase B.1). Acceptance criteria 5/6/7 from the original brief (WebGLProgram count check + Bloom flicker test + per-instance jitter visual) deferred to Phase B.1's debug overlay; the core infra above is structurally correct (single material → single program; aBark per-vertex → leaf fragments untouched; world-XZ hash → per-tree jitter).

**Phase B.1 — split into B.1.a (shipped) / B.1.b + B.1.c (deferred)**

**Phase B.1.a — UV-scale wiring** — **SHIPPED 2026-05-15 / 2026-05-16** (commits `6c5c957` initial + `e77278e` `textureGrad` polish + `94519db` aniso polish — last two reverted as no-ops in `d50dd7b`; `fd187d7` pre-tile-at-source v2; `54355a4` v3 revert to baseline = current state)
- 3 new uniforms on the shared tree material — `uBarkUVScale` (vec2), `uBarkTileOffset` (vec2), `uBarkTileScale` (vec2) — initialized to identity (no-tile, full-atlas-span). Set per-draw in `applyBarkUniforms` from `barkBySpeciesEffective` resolved against the per-species manifest entry + the manifest's `tiles[].uvTransform` lookup (search tile by `classification==='bark'` AND `refs.some(r => r.species === <species>)`).
- Fragment shader replaces the entire `#include <map_fragment>` chunk (the standard chunk hardcodes `texture2D(map, vMapUv)` — insertion before/after can't intercept the texture sample). Replacement reconstructs the chunk's `#ifdef USE_MAP` body verbatim BUT inserts a wrap-within-tile-bounds step before the sample: `localUV = fract((vMapUv − tileOffset) / tileScale × uvScale)`, then `mapUV = localUV × tileScale + tileOffset`. Gated by `vBark > 0.5 && uvScale != (1,1)` so leaves bypass entirely and bark species with explicit uvScale=identity also no-op. fract() wrap stays strictly inside the tile, so no bleed into neighbor atlas tiles. Mipmap gradient discontinuity at wrap lines is the standard tile-wrap artifact; mitigation via `textureGrad()` is a follow-on if visible at Hero.
- Architectural deviation from the brief's per-vertex `aBarkTileOffset`/`aBarkTileScale` attributes: switched to per-draw UNIFORMS because within a merged geometry (one URL = one species + variant), all bark verts share the same tile bounds and all leaf verts share the same tile bounds — per-vertex would have been ~30 MB of VBO at LS scale (50K verts × 36 variants × 16 bytes) for what is effectively per-primitive-constant data. Per-draw uniforms align with the `applyBarkUniforms` pattern Phase B core already established for tint/jitter/roughness. Single compiled program preserved.
- Per-species `uvScale` starter values shipped in PRESETS — broadleaf `[1.5, 4.0]`, conifer `[1, 3]`, ornamental `[1.5, 3]`, columnar `[1, 4]`, weeping `[1.5, 2]`. Tightest vertical tiling on broadleaf + columnar (long trunks, photo bark would otherwise smear). Tune visually in Phase B.1.b.
- **Phase B core bug fixed in passing:** the B-core merge-time stamp checked `o.userData?.atlasKind` for the bark vs leaf signal, but GLTFLoader assigns primitive-level extras to `geometry.userData` (see three's `GLTFLoader.js:4649`), not `mesh.userData`. Effect: in B core every vert silently got `aBark = 0` → the retint + roughness + jitter paths never fired on any fragment. Trees rendered fine because the uniforms defaulted to identity; the regression was invisible-by-design. B.1.a's UV-wrap path also relies on the gate, so the fix is load-bearing for this phase. Lookup now reads `geometry.userData.atlasKind` first with the old paths as fallbacks. Per-instance jitter, per-Look pink-tint reload, and roughness overrides all become functional for the first time with this commit.
- **Determinism preserved.** uvScale is runtime-driven (read from `trees-atlas.json` by the shader); same source manifest → byte-identical GLB output (`sha1sum public/trees/procedural_broadleaf/skeleton-1-lod0.glb` matched pre-B.1.a). Only the manifest's `barkBySpecies` block + species `manifest.bark.uvScale` updated.
- **Single shader program preserved.** New uniforms + varyings ride the existing material via `onBeforeCompile`; no `customProgramCacheKey` divergence. Bloom-stable.

**Phase B.2 — Proper bark tile wrap (atlas vs tiling tradeoff, deferred)**
- Phase B.1.a's `fract`-inside-atlas approach has an unavoidable derivative
  discontinuity at wrap lines: the GPU picks the coarsest mip there →
  narrow blurry stripes that "crawl" slightly under tree sway at close-up
  Hero distance. We tried `textureGrad` with the math-correct gradient
  (`dFdx(vMapUv) × uBarkUVScale`) — it eliminated the crawl but produced
  *uniform* mip-blur because dense tiling legitimately requires coarser
  sampling per pixel. That's honest GPU mipmap math, not a bug; it's the
  cost of atlas-tile + dense-repeat combined. Bumped anisotropy 4 → 16
  hoping the aniso hardware would compensate; no visible difference,
  meaning the wider gradient is already past the regime where aniso helps.
  Reverted both polish attempts (`e77278e` textureGrad and `94519db`
  aniso bump are no-ops in the final code path; the comments record the
  reasoning so future babies don't re-walk this).
- **Proper-fix paths** (pick one when B.2 lands):
  1. **Texture arrays** — one atlas layer per unique bark `materialRef`,
     each with `GL_REPEAT`. Sampler index from a per-draw uniform.
     Hardware tiling, hardware mipmap, hardware aniso. Single shader
     program preserved (one sampler binding, different layer index per
     draw). WebGL 2 standard. Pipeline change in bake-look.
  2. **Pre-tile in atlas** — bake-look composites an N×M-tiled version
     of the source into the atlas tile content; shader samples directly
     with no shader-side wrap. Atlas footprint grows N×M for bark tiles.
     Simpler pipeline change but heavier atlas.
  3. **Separate textures per species** — clean GL_REPEAT but breaks the
     single-program Bloom constraint (`bake-look.js:200` "non-negotiable").
     Not viable without re-evaluating that constraint.
- For now: plain `texture2D` + `fract` wrap. Sharp bark away from wrap
  lines; narrow wrap-line crawl at close Hero. Accept as the smaller cost
  until B.2 lands.

**Phase B.1.b — Workstage Bark panel** (deferred)
- Per-species Bark panel in `src/arborist/Workstage.jsx`: material dropdown w/ 128×128 thumbnails (cached server-side), UV scale X/Y sliders, tintBase color picker, tintJitterRange + roughnessOverride sliders, "Apply & republish species" button.
- `GET /procedural/bark/materials` lists available CC0 materials under `public/textures/bark/`; `POST /procedural/:species/bark` writes `manifest.bark` and re-triggers republish + per-Look atlas rebake.

**Phase B.1.c — Stage debug overlay** (deferred)
- `renderer.info.programs.length` readout + active bark uniform values for the focused species; toggle-able dev surface so visual gates (criterion 5: WebGLProgram count; 6: per-Look pink-tint reload; 7: per-instance jitter visual) close mechanically.

**Phase F — Per-species PSD-authored leaf cluster atlases + 2-stop tint ramp + sparse occupancy** (scope reframed 2026-05-16 EOD)
- **Scope reframe:** the original Phase F scope included `arborist/leafCluster.js`, a sharp-based parametric cluster compositor with per-leaf rotation/scale/position jitter knobs. **That infrastructure is dropped.** It was designed to *scale* leaf authoring to all 60 inventory species; for 5 heroes, Photoshop is faster + better (artist controls overlap, density, color, accents directly; per-season variants are additional PSDs; no parametric tuning struggles).
- **New scope: import PSD-authored cluster PNGs at `public/textures/leaves/<species>/cluster.png` (or per-season subfolder), atlas + tint + sparse-occupancy at runtime.** Operator authors clusters in Photoshop for each hero; the pipeline picks them up via species manifest `leafCluster.textureRef`. Workstage Leaf panel = picker + tint stops + occupancy slider, not a slider-driven compositor UI.
- Fillers continue to use shared per-morph PNGs (`public/textures/leaves/<morph>.png`) via the existing v1 single-leaf-card pipeline — substitution-fallback covers them at v1.5 quality. Heroes override with PSD-authored clusters.
- **Sparse-cluster mode is still load-bearing.** `PRESETS.leafCluster` carries an `occupancy` field even for PSD-authored clusters — the shader uses it for per-tree alpha-density variation that the PSD's alpha channel can't carry. Honeylocust ~25% occupancy (dappled translucent canopy — the signature), oak ~70%, conifer needles ~95%.
- `buildLeafGeometry` uses cluster cards; fewer cards per tree, each card visually denser.
- Material extras carry 2-stop tint ramp (inner/outer × per-season); leaf shader samples UV.y for inner-vs-outer mix.
- Workstage gains per-species foliage panel: cluster texture preview, summer/fall inner+outer color pickers, occupancy slider. NO density / jitter / cluster-count sliders (those would be compositor knobs; compositor is dropped).
- **Fixes:** foliage reads dense at distance; fall color has inner-to-outer gradient that's the species signature; sparse-canopy species (honeylocust) read correctly translucent.
- **Doesn't fix:** still need per-species PSD authoring for any new hero beyond the 5 (the substitution-fallback safety net per pillar 0 covers the rest until v1.6+ authoring passes scale up via the same PSD-import path).

**Phase F.5 — Leaf editor** — **KILLED 2026-05-16 EOD**
- The parametric leaf editor (lobe count / lobe depth / edge serration / venation density → generated PNG) was pulled forward from v1.6 as Phase G.1's enabling tool. **Obviated by PS-authoring.** For 5 heroes, hand-authoring in Photoshop produces better species character than any parametric generator at less engineering cost.
- If the inventory ever scales to 60 species (v1.6+), the parametric editor may return — but only if the PSD-authoring workflow itself becomes the bottleneck. Until then, the kill stands.

**Phase G — Five hero proving passes (G.1–G.5)**

With Phases A → D → B-core → B.1.a → C → F landed (E priority-dropped; F.5 killed), the full machinery exists. G is where the **5 hero species at Hero quality** product goal is achieved. Each sub-phase is its own commit, its own acceptance criterion, its own visible-bug-coverage statement. G.5's species is operator-decided after G.1–G.4 ship.

- **G.1 — Sugar Maple** (`acer_saccharum_procedural`). Dominant inventory species, canonical broadleaf, strictest visual bar. Includes Phase F.5 leaf-editor enabling work — author the palmate leaf first, generalize the editor surface out of it. Envelope: rounded oval 12m × 20m. Tropism: zero. Phyllotaxis: opposite (the species signature). Attractor count: ~600. Bark: furrowed, `#3a2820`/`#6a5040`. Leaf cluster: palmate × 8 per card, ~70% occupancy. Tint ramp summer `#2a5825→#3a7530`, fall `#a85020→#d4801f`. **Acceptance:** reads as Sugar Maple to a botanist at Hero from 30 m up. **Fixes:** ~60+ park trees mapping to acer_saccharum via species map ship at hero quality; reference implementation for what tuned procedurals look like.
- **G.2 — Ginkgo** (`ginkgo_biloba_procedural`). Tests per-species leaf authoring (F.5) on the most leaf-defined species in temperate forestry. Bilobed fan + uniformly luminous gold fall is the signature. Authored as a new procedural_ginkgo species (envelope: rounded-cone variant; tropism: zero; leafMorph: `fan` with luminous gold tint ramp), **NOT as a substitution into procedural_broadleaf** — the silhouette (narrower than oak, fuller than columnar) doesn't sit inside the existing morphology buckets. **Acceptance:** ginkgo reads as ginkgo (bilobed fan + brilliant uniform-gold fall) at Hero; reference photo overlap with Lafayette Square's actual ginkgos is visually convincing.
- **G.3 — Willow** (`salix_babylonica_procedural`). Weeping algorithm validation at hero quality. Authored on top of `procedural_weeping` (Phase D's envelope + tropism doctrine already producing the recurve via physics). Only 3 placements in inventory but iconic — Lafayette Square's willows are landmark trees. **Acceptance:** weeping curtain reads as Salix babylonica specifically, not generic-weeping; narrow lance leaves; gold-green summer / yellow fall.
- **G.4 — Honeylocust** (`gleditsia_triacanthos_procedural`). **Sparse-cluster machinery validation.** Authored on top of `procedural_broadleaf` filler via the category fallback path (no new morphology bucket needed — honeylocust's silhouette fits the broadleaf SCA envelope; the species character is in the leaves + occupancy). Bipinnately compound leaves (F.5), ~25% cluster occupancy (Phase F), dappled translucent canopy. **Acceptance:** the dappled-shadow signature comes through at Hero — the canopy reads translucent, not solid; sun spots dapple the ground.
- **G.5 — TBD 5th hero.** Decision deferred to operator after G.1–G.4 ship. Candidates:
  - **Spruce or Pine** (conifer slot). Exercises Phase E's monopodial-whorl algorithm at hero quality. Resolves the Phase E priority-drop question by elevating one conifer to v1.5 if visual review at LS demands it.
  - **Pin Oak.** Second broadleaf character — lobed (not palmate like maple). Lets the broadleaf bucket prove it can carry two distinct hero silhouettes without one bleeding into the other.
  - **Sycamore** (`platanus_acerifolia` family). Closes the loop on the existing hand-modeled `platanus_acerifolia` ×9 variants that Grove curation would otherwise prune out — replaces them with a procedural hero rather than maintaining two parallel sources for the same species.
- **Doesn't fix:** other 60+ inventory species still need per-species hero authoring eventually (ongoing operator workflow now that the editor + workstage + atlas pipeline all exist). The two-tier substitution safety net per pillar 0 keeps the unauthored species visually plausible until each gets its own hero pass — v1.6+ work.

### Constraints carried across every phase

- **Stash-isolate every commit** per [[feedback_stash_isolate_per_file]]. Operator working tree always has unrelated dirty files; each baby plumbs design.json / index.json the same way the v1 commit (`dbbd1ed`) did.
- **No fork of foundational pipeline.** `publish-glb.js`, `bake-look.js`, `bake-trees.js`, `atlas-pack.js`, `atlas-survey.js` stay untouched. Generator output adapts to what they expect.
- **`generateTreeMesh()` params signature is the contract.** UI binds to it; CLI binds to it. Never bypass.
- **Trinity touch every phase.** FEATURES update for visible-bug-resolution; this NOTES maxi-brief gets a rolling update reflecting what shipped per [[feedback_features_md_is_a_working_doc]]; BACKLOG tick-off.
- **Determinism.** Same params + same seed → byte-identical GLB. Required for `writeIfChanged` mtime stability + cache predictability.
- **No `procedural` token in `src/` beyond the already-shipped `treeAtlasMaterial.js` extras** (which will gain bark + leaf shader patches in B + F respectively). Generator + state stays in `arborist/` and `public/trees/`.
- **Hero species are first-class citizens at the same `generateTreeMesh()` API.** They get their own PRESETS table entries; `park_species_map.json` routes inventory entries to them via preferred-species lists; `bake-look.js`'s `unifyAtlases` round-trips them through the same atlas pipeline as fillers. The mechanical distinction between "hero" and "filler" is **quality rating + per-species tuning depth**, not pipeline location. Every hero must work through the published artifacts pipeline per [[feedback_preview_uses_production_pipeline]].
- **Surface scope drift in every status update + commit body** per [[feedback_baby_must_surface_scope_drift]]. Phase A's silent `Workstage.jsx` extension → Phase D's proactive 3-item disclosure is the pattern; every subsequent phase brief carries the explicit "surface anything not in this brief" clause and every baby discloses extra files / schema extensions / retuned defaults.

### Deferred / out of scope

- **Full 60-species hero coverage** — eventually, but explicitly **not urgent for v1.5**. The two-tier substitution fallback (pillar 0) covers the gap until each species gets its own hero authoring pass. v1.6+.
- **Street-view photoreal.** v2. Don't trade Hero/Browse quality for Street fidelity that won't ship.
- **Real bark/leaf photographic scans.** v2 (SpeedTree replacement window). Phase B's procedural-bark-shader path is deliberately the shape SpeedTree migration plugs into unchanged — heroes drop out via the same `quality` mechanism when their SpeedTree replacements land.
- **Per-conifer-species hero variants beyond Phase E's algorithm** (Norway Spruce vs Blue Spruce vs White Pine vs Bald Cypress as distinct hero species ids) — Phase E ships ONE generic conifer algorithm at v1.5; per-conifer-species hero authoring defers to v1.6 unless G.5 elects a conifer.
- **Plant tool / interactive placement editor.** Per SPEC.md, v1.1+ work in Cartograph Designer; not procedural-trees scope.
- **Runtime tree generation.** Bake is structurally required; no path to runtime SCA.

### Architecture record cross-references

- v1 ship doctrine: NOTES entry "## 2026-05-14 — Procedural-trees fallback: shipped (commit `dbbd1ed`)"
- Original ParkTrees algorithm (resurrected for v1): `git show 43c4aa3~1:src/components/LafayettePark.jsx | sed -n '440,880p'`
- Arborist UI patterns to mirror: `src/arborist/Workstage.jsx` (per-species toolbar/viewport/panel), `src/arborist/SpecimenViewport.jsx` (R3F GLB renderer), `src/arborist/Grove.jsx` (gallery)
- Memories: [[project_v1_no_trees]], [[project_slab_is_the_instance_identity]], [[project_kit_helpers_pattern]], [[feedback_no_parallel_pipeline_for_scenes]], [[feedback_stash_isolate_per_file]], [[project_doped_artifact_placecard_edit_pattern]], [[feedback_phase_scope_explicitness]], [[feedback_d3_bundling_failure_modes]], [[feedback_features_md_is_a_working_doc]], [[feedback_baby_must_surface_scope_drift]], [[feedback_notes_md_holds_architecture]], [[feedback_preview_uses_production_pipeline]]

---

## 2026-05-14 PM — Polygon-graph restructure (multi-session arc) — MAXI BRIEF

**Status:** designed end-to-end, not yet coded. This is the canonical implementation plan for the polygon-graph restructure named in the FEATURES "ribbon doctrine — the stage wall" section. Read end-to-end before touching any geometry code per [[feedback_notes_md_holds_architecture]].

This is a multi-session arc. Phases A→D land in order; each closes its own commit and acceptance test. The work is meant for baby agents in sequence — the maxi-brief format is intentional per Jacob's note: "the key is a solid plan that borders on having done most of the work for the baby." Agents executing this should be able to land their phase WITHOUT re-litigating the architecture or asking design questions.

### Why this exists

The ribbon doctrine establishes that **chains and points end at the bake wall (Stage 5)**; surface-stage code (Designer / Stage / Preview / bake-output consumers) reads only frozen polygons. Today's V2 implementation runs Stages 2–4 in the surface hot path: `buildBlockGeometryV2` re-walks `chain.points` on every Designer store update, builds per-chain rectangles using `pts[ni] - V` tangents, unions them into `asphaltSharp`, derives blocks as `stencil − asphalt`. Chain noise (OSM micro-bends near IXs) leaks all the way to corner geometry every render.

This isn't a bug fix; it's a structural alignment. The implementation is being migrated to match the doctrine. Specifically:

- Pre-bake (Stages 1–5) produces a frozen polygon graph artifact.
- Surface stage reads only that artifact. No `chain.points` references in surface code, ever.
- Operator interaction is polygon-attribute editing, not chain editing (Survey is the one place chains are still touched; Survey edits trigger a polygon-graph rebake).
- Print-like UX: corners stop wobbling on widening, blocks stop re-deriving on every drag, geometry stops "looking alive."

### End state

| Artifact | Lives at | Read by | Written by |
|---|---|---|---|
| `chain.points` (raw) | `cartograph/data/<scene>/raw/centerlines.json`, OSM data | **Pipeline only** (Stages 1–4) | Survey + OSM imports |
| Polygon graph (frozen) | `public/baked/<scene>/polygons.json` | All surface code | Pipeline at bake time |
| Operator overlays | `cartograph/data/<scene>/clean/overlay.json` | Pipeline (merged into chain set before Stage 1) | Designer (Survey/Measure) |
| Polygon attribute overlays | `cartograph/data/<scene>/clean/polygon-overlay.json` (NEW) | Pipeline (merged into polygons.json at Stage 5) | Designer (couplers, lane offsets, drag widths) |

After this lands, Designer's hot path has zero `chain.points` references in surface emission. `buildBlockGeometryV2` becomes a `loadPolygonGraph` that reads the artifact. Drag handles operate on `polygon-overlay.json`, which retriggers a partial rebake.

---

### Phase A — Long-run tangent extraction (foundation, smallest)

**This is also "task #2" from the 2026-05-14 PM session — folded in as Phase A because it's the foundation for the cleaner asphalt geometry that the polygon graph will freeze.**

**Visible-bug coverage:** fixes the park-corner failures the operator hit at Mississippi×Lafayette (NE/SE worked because the park polygon was just authored; NW/SW failed because residential block polygons inherit chain bends). After this phase, residential corners get the same cleanliness for free.

**Files:** `src/lib/buildBlockGeometryV2.js` (`cornersAtIx` ~line 273, `buildLeg` ~line 296, plus the per-chain rectangle emission upstream around line 1370–1410).

**The change:**

In `buildLeg(dir)`, replace:
```js
const ni = ixIdx + dir
if (ni < 0 || ni >= pts.length) return null
const dx = pts[ni][0] - V[0], dz = pts[ni][1] - V[1]
const L = Math.hypot(dx, dz)
```

With a long-run tangent extractor:
```js
// Long-run tangent: walk the chain in `dir` from ixIdx, skipping vertices
// within IX_NOISE_RADIUS of V (these are OSM micro-bends near the IX that
// distort the leg direction); the first vertex beyond the noise zone gives
// the leg's clean tangent. Anchor the leg at V; tangent vector = (Ps - V)/|Ps - V|
// where Ps is the first stable vertex.
const IX_NOISE_RADIUS = 10  // meters; tunable via NOTES + commit message
const ps = findStableVertex(pts, ixIdx, dir, V, IX_NOISE_RADIUS)
if (!ps) return null
const dx = ps[0] - V[0], dz = ps[1] - V[1]
const L = Math.hypot(dx, dz)
```

`findStableVertex` walks `pts[ixIdx + dir * k]` for k=1, 2, 3, …; for each, computes distance from V; returns the first whose distance ≥ `IX_NOISE_RADIUS`. Falls back to the chain endpoint if no vertex satisfies (short chain).

**Symmetric fix:** the per-chain asphalt rectangle emission in `buildBlockGeometryV2.js:1370–1410` builds rectangles from `chain.points` segment by segment. The end of each rectangle that abuts an IX needs to use the long-run tangent at that IX (not the noisy `pts[ni] - V`). Two approaches:
- **(preferred)** Pre-process `chain.points` once at the top of `buildBlockGeometryV2` to produce a "stable polyline" — the chain with near-IX noise stripped (replaced by a single straight segment from IX to first stable vertex). Use the stable polyline everywhere downstream. Single intervention, all consumers consistent.
- **(fallback)** Patch each per-chain emission site to call long-run tangent helpers. More touch points; more error-prone.

Use approach (preferred). New helper `stabilizeChainNearIxs(chain, ixVertices, IX_NOISE_RADIUS) → chainStabilized`. Apply at the top of `buildBlockGeometryV2` after `streets` is destructured.

**Tunable params (document in NOTES at end of Phase A):**
- `IX_NOISE_RADIUS` (default 10m) — distance from IX inside which vertices are skipped. Park's worst case had vertices 5m from IX with 5° bends; 10m clears them.
- Edge case: chain shorter than 2× IX_NOISE_RADIUS between two IXs (small connector stub). Falls back to direct IX→IX line.

**Acceptance:**
- Run pipeline + bake; visually inspect Mississippi×Lafayette and Mississippi×Park IXs in Stage. All 4 corners at each show clean three-component plug geometry (asphalt mouth + curb arc + concrete pad). No regressions at clean rectilinear residential corners.
- Console-log a sample IX's leg tangents pre/post stabilization at first run; verify they differ for the park corners and match for clean corners. Strip the log before commit.

**Trinity touch:**
- BACKLOG: tick off "Big park intersections" line 2746–2750 once visual passes (note now: relevant entry already retired in this restructure's parent context).
- NOTES: append a Phase-A-shipped sub-entry to this maxi-brief.

**Estimated scope:** ~50 LOC, one focused commit. Foundation for B/C/D.

**Phase A shipped — per-leg walker (2026-05-15, commits 09a276a + 47f2f0a).**
First implementation (5559a37) used a polyline stabilizer that mutated V2's
in-memory copy of `chain.points` — dropped non-IX, non-endpoint vertices
within R=16m of any IX. Visibly clean in LS (silhouette simplifications
from dropping noise) but destroyed authored fixture geometry in Toy: HW3
saw-tooth dropped 1 vertex (saw-tooth gone), BENT-BODY dropped 2 (circle
deformed), WV-S/WV-N dropped 2 each (carriageway bows straightened). Root
cause: a "drop any vertex near an IX" formulation can't distinguish OSM
micro-bend noise from authored geometry intent. Reverted in 09a276a.

Replaced with a per-leg read-only walker in `cornersAtIx.buildLeg`
(47f2f0a): walks `pts[ixIdx + dir * k]` from the IX vertex until distance
from V ≥ `IX_NOISE_RADIUS` (=16m); the first vertex past R supplies the
leg's tangent. Falls back to chain's far endpoint for short stubs.
`chain.points` is NEVER mutated by V2 — `naturalSegments`, `emitChain`,
`buildFrontageEdges` continue to read raw points, so authored geometry
renders intact. Doctrine wall (FEATURES.md "stage wall") preserved: V2
reads chains, never writes them.

LS visible-bug coverage from Phase A is SMALL: the asphalt silhouette is
unchanged (silhouette is a function of `chain.points` × per-segment
rectangles, neither of which the walker touches). Only the corner-tangent
direction at IXs changes — which is invisible in cases where the tangent
was already approximately right. The original park-corner NW/SW/SE failure
at Mississippi×Lafayette is NOT addressed by Phase A. Root cause is
leg-formation at chain-endpoint IXs: Lafayette divided-pair carriageway
endpoints (`lafayette-avenue-5` ixIdx=0/7 [ENDPOINT], `lafayette-avenue-6`
ixIdx=0/5 [ENDPOINT]) emit near-parallel adjacent legs from V (both with
T ≈ east), producing a degenerate ~5° wedge in `cornersAtIx`'s
CCW-sorted pair → degenerate corner Q → corner records not produced →
no plug + no control dot. This is **Phase A.5** territory; see BACKLOG
"Big park intersections" → Phase A.5 sub-bullet. Phase A.5 needs its own
brief + Toy-first iteration (Waverly couplet endpoints in Toy likely
already exercise this).

Files changed: `src/lib/buildBlockGeometryV2.js` (+28 / −3 LOC vs revert
base). Toy fixtures Toy-validated; LS bake clean (44 groups, 371714
verts, 617834 tris).

---

### Phase A.6 — Polygon-edge corner-Q (shipped, supersedes A.5)

**Status:** SHIPPED 2026-05-16. Replaced `cornersAtIx`'s tangent-Q derivation (corner = intersection of two extrapolated tangent rays at `V ± half-width · P_T`) with polygon-edge-Q (corner = first crossing of two adjacent legs' chain-offset polylines). This is the fix `cartograph/FEATURES.md` line 89 has named verbatim all along — *"compute corner records off polygon edges, not off extended chain tangents"*. Phase A.5 (composite-leg coalesce) retires in this commit; Phase A (long-run tangent walker via `findStableVertex`) stays — its `T` output is still consumed by `corner.T_A`/`corner.T_B` for `buildCornerPadQuad` and is not load-bearing for the corner Q anymore. The A.5 brief (formerly above this entry) is stripped — the failure mode it was patching (divided-pair endpoint degeneracy) is now handled structurally by polygon-edge-Q skipping median wedges where the two offset polylines don't cross.

**Algorithm.** Two helpers added above `cornersAtIx` in `src/lib/buildBlockGeometryV2.js`:

1. `buildLegSidePolyline(chain, ixIdx, dir, sideSign, hw)` walks `chain.points` from `ixIdx` outward in `dir` for up to `CORNER_Q_POLY_DEPTH=6` vertices. At each vertex it perpendicular-offsets by `sideSign · hw · perps[k]` where `perps` is the chain's full `computePerps` array — *the exact same bisector-perp construction `emitChain` uses for its per-segment asphalt rectangles*. So the polyline tracks the actual asphalt-union silhouette at the IX corner, not the far-field tangent extrapolation.
2. `polylineCross(polyA, polyB)` iterates the two polylines' segment pairs and returns the first valid segment-segment intersection. Standard 2D crossing math with 1e-3 SLOP for vertex-coincidence at the polyline starts.

In the corner-pair loop, A.outerR drives polyA's offset with `sideSign=+1` and B.outerL drives polyB's offset with `sideSign=-1`. Side convention preserved exactly from today's tangent-Q line `V + A.outerR · P_A` / `V - B.outerL · P_B` (verified by inspecting the four-line tangent-Q math the rewrite replaces). On no-intersection, the corner record is **skipped** rather than falling back to tangent-Q. The skip is the structural fix that retires A.5 — see "Algorithm deviation from brief" below.

**Pre-step audits documented in commit body.**

1. *Offset-polyline source.* Option (b) — compute fresh via `computePerps`. Option (a) "reuse per-chain rectangles" was rejected: rectangles are closed polygons in `byChain[chainIdx].asphaltRings`, and there's no near-V slice keyed by leg. Option (c) Clipper offset was overkill for the local 6-vertex polyline. (b) reuses `emitChain`'s exact perp construction in ~15 LOC; polylines land on the same asphalt-union vertex that round-corners is trying to match.
2. *`findStableVertex` consumers (Phase A retirement audit).* `leg.T` flows through `corner.T_A`/`corner.T_B` (set at the corner-record construction site) and is consumed by `buildCornerPadQuad` (`src/lib/buildBlockGeometryV2.js:585`) for the concrete pad quad's tangent basis. **Phase A is NOT retired** — its tangent is still load-bearing for pad-quad geometry; polygon-edge-Q replaces the corner Q math only. `IX_NOISE_RADIUS=16` and the per-leg walker stay.
3. *Per-corner kit leg-pair keys.* `legKey = ${skel}:${dir}` and `sortedCornerKey(V, legKey_A, legKey_B)` are both unchanged. Polygon-edge-Q only mutates `corner.point`; the per-corner authoring kit's keying round-trips identically.

**Algorithm deviation from brief: no-intersection ⇒ skip, not fallback.** The brief proposed falling back to tangent-Q when `polylineCross` returns null. I made the executive call to **skip the corner record instead**. Reasoning: the canonical no-intersection case is the median wedge between two paired carriageways converging at one IX (LS's four park-corner IXs, Toy's Waverly couplet endpoint). Both legs' facing-side offset polylines are parallel-ish and never cross within 6 segments. Tangent-Q at that geometry produces near-infinity Vc — the exact degenerate that retired A.5 was patching by composite-coalesce. Skipping is structurally honest: the median between two paired carriageways isn't a block corner, so no plug belongs there. The `theta < 5° / > 355°` filter at the top of the corner-pair loop already drops the most parallel cases; the no-intersection skip handles wider parallel cases that pass the angular gate. Jacob confirmed this call before implementation. Surfaced for visual verification on the four park-corner IXs — the expectation is 2 corner records per IX (NE + SE relative to the asphalt mouth), not 4.

**Phase A.5 retirement (deletes in this commit).** Removed: `synthesizeCompositeLeg`, the `isEndpointLeg` predicate, `COMPOSITE_ANGLE_THRESHOLD_RAD` constant, the entire `claimedIdx` + `composites` coalesce loop, the post-coalesce `legs.length = 0; push survivors; push composites` rewrite step. Leg-record `chain` + `ixIdx` fields STAY (polygon-edge-Q needs them via `buildLegSidePolyline`); added one new `dir` field for the offset-polyline walk direction. The legKey scheme is unchanged (`${skel}:f` or `${skel}:b`), so the per-corner authoring kit's keys at LS look identical pre/post commit.

**Bake.** `node cartograph/bake-ground.js` clean. `look=default: 44 groups, 303889 verts, 507886 tris, 9513.0 KB`. `look=lafayette-square: 44 groups, 303401 verts, 506386 tris, 9489.7 KB`. Compared to A.5 baseline (`44 groups, 371291 verts, 617001 tris, 11581.5 KB`), `default` drops ~18% in vert/tri/size. The most likely cause is fewer corner records emitted at divided-pair-style IXs (no record → no concrete pad quad, no asphalt-plug carve target, no arc subdivision in `applyRoundCornersToRing`). The `[V2] PAD INVARIANT` console error did not trip — pads still emit at real block corners. Visual verification on the four park-corner IXs + curved-street IXs + Geyer × Mississippi regression baseline + Toy 3×3 grid / teardrop / Waverly couplet is left to Jacob — agent cannot view Designer.

**Watchouts standing post-ship.**

- *Skip vs. silent regression.* If a real block corner sits between two near-parallel legs whose offset polylines genuinely don't cross within 6 segments, polygon-edge-Q will silently skip its corner record. The degeneracy filter at `theta < 5°` already covers this in the angular domain; the polyline depth covers it in the spatial domain (curved chains can bend toward each other beyond segment 6, but that's an LS-curvature-scale edge case). If a missing corner shows up at an unexpected IX, the diagnostic is to widen `CORNER_Q_POLY_DEPTH` first (single constant at the top of the file) rather than reinstate the tangent-Q fallback.
- *`buildCornerPadQuad` reads T_A/T_B from `findStableVertex`-stable tangents, not from the offset polylines.* The pad quad's basis vectors are still far-field. If polygon-edge-Q lands Vc significantly different from the far-field intersection (curved chain case), the pad quad and the rounded asphalt mouth could disagree visually in the inset area. Flag if a pad-vs-mouth misalignment surfaces at a curved IX — the fix would be to re-derive T_A/T_B from the local polyline segment at Vc, but I'd want Jacob's call before doing that.
- *Bake-size delta is large (~18%).* Plausible explanations exist (see above) but the magnitude warrants a second look at Designer / Stage / Preview to make sure no class of corner geometry silently disappeared. If LS Designer comes back showing missing plugs at non-park IXs, the skip is over-firing.

**Trinity touch in this commit.** NOTES.md: A.5 brief + "Phase A.5 shipped" sub-entry stripped, this A.6 entry inserted. BACKLOG.md: A.6 ship line added under polygon-graph restructure. FEATURES.md: the divided-pair-endpoint-coalesce sub-bullet in V2 corner kit (line 494) stripped — divided-pair endpoints no longer need their own surface mention; polygon-edge-Q handles them via the no-intersection skip without any special case. The historical BACKLOG tick for A.5 stays (git-history archeology) but the trinity now reflects only the current state.

#### A.6 fix — dir-sign perp flip in `buildLegSidePolyline` (2026-05-16, follow-up)

Initial A.6 commit (`8249e74`) was visually broken on rectilinear residential IXs across LS: ~half the corner plugs missing in an "every other corner" pattern. Root cause: `buildLegSidePolyline` used `computePerps(chain.points)` which returns the **chain-canonical** perp-LEFT-of-chain-forward at each vertex. For a leg with `dir=-1`, the leg's tangent `T` is anti-parallel to chain-forward, so the leg's actual perp-LEFT-of-T is the *opposite sign* of the chain-canonical perp. The `sideSign` convention in `cornersAtIx` is keyed to perp-LEFT-of-T (matching the prior tangent-Q math's `V + outerR · [-T_y, T_x]`), so dir=-1 legs were producing offset polylines on the geometrically wrong side. At a clean 4-way IX (typically 2 legs dir=+1, 2 legs dir=-1), exactly half the corner-pairs had one leg's polyline on the wrong side → polylines didn't cross at the expected corner → no-intersection skip fired → no plug. Every-other-corner pattern is the structural fingerprint.

Diagnosed by Jacob from the visual symptom; verified by logging `dot(perps[ixIdx], perpLeftOfT)` per leg-side polyline call at LS bake — every `dir=+1` row dotted `+1`, every `dir=-1` row dotted `-1`. The diagnostic firstPolyStep-vs-T test from Jacob's brief would NOT have caught this (firstPolyStep ≈ T_leg by edge-vector arithmetic regardless of perp sign); the tighter `dot(perps[V], perp-LEFT-of-T)` check is what isolated the perp-sign bug.

Fix: `perpSign = dir === -1 ? -1 : +1`; multiply into the offset along with `sideSign`. Single-line change at the polyline-vertex push. Walk order is unchanged — the polyline still starts at V's offset and walks outward in `dir`, so `polylineCross` finds the V-nearest crossing first.

**Bake post-fix.** `look=default: 44 groups, 387511 verts, 644332 tris, 12091.9 KB`. `look=lafayette-square: 44 groups, 385753 verts, 640664 tris, 12028.3 KB`. ~+4–5% over pre-A.6 A.5 baseline (`11581.5 KB`) — plausible: polygon-edge-Q now lands on the real asphalt-union vertex at curved IXs that previously fell through tangent-Q's 0.5m match, so more corners get arc-subdivided by `applyRoundCornersToRing`.

**Methodological footnote.** A.6's initial commit was bake-clean and audit-clean but visually wrong because no automated visual check exists between algorithm and Jacob's eyes. The "dir=-1 means perp flips" reasoning is exactly the kind of side-convention trap [[feedback_walker_corner_detection_is_identity_not_angle]] points at — leg/chain identity mismatches are geometric, not numeric. When the visual symptom is a structural pattern (every-other-corner), the diagnosis lives in chain-vs-leg identity asymmetry, not in tuning constants; apply ONE structural fix and verify rather than iterating against the wrong model per [[feedback_rewrite_v2_alongside_v1]].

#### A.7 — Polygon simplification at source (2026-05-16, follow-up)

Per `cartograph/FEATURES.md` line 95–104 ("clean THE POLYGON: apply Douglas-Peucker / corner-detection at derivation"). A.6 + A.6-fix put `corner.point` on the real asphalt-union vertex, but on dense-chain IXs (Mississippi has ~5–10 chain vertices within 16 m of each IX → ~10–20 offset-polygon vertices clustered at each asphalt-mouth corner) the adjacent polygon sides between corners are 1–3 m long. `arcReplaceVertex` in `applyRoundCornersToRing` caps the rounding arc at 49% of the shorter adjacent side as a safety against arc overshoot — at 1–3 m, that's a 0.5–1.5 m maximum effective radius regardless of slider setting. Result: high-slider Mississippi looked like low-slider Mississippi.

**Where to apply, surfaced as scope drift.** The brief pointed at `chainPavementRing` (line 137). That function is **dead code** in this file — defined but never called anywhere in the codebase (only referenced in a comment in `src/cartograph/CornerEditHandles.jsx:183`). The actual asphalt-ring construction lives in `emitChain` at line 1481, which builds **per-natural-segment** rectangles via `segPts.map(...)` for `leftEdge`/`rightEdge` and unions them into `asphaltSharp`. Per-segment construction means each rectangle's endpoints sit at IX vertices (or chain endpoints), and adjacent segments' rectangles meet exactly at the corner. Douglas-Peucker preserves first and last points by construction, so the meeting-at-corner invariant is preserved post-simplification.

**Implementation.** Two helpers added near top of `buildBlockGeometryV2.js`: `perpDistToSegment(p, a, b)` (standard 2D perp distance with degenerate a≈b fallback) and `simplifyPolylineDP(pts, eps)` (iterative DP with explicit stack to avoid recursion depth issues on long chains; preserves endpoints; deterministic). At the per-segment rectangle emission site in `emitChain`, both `leftEdge` and `rightEdge` are simplified by `simplifyPolylineDP(..., SIMPLIFY_EPS)` BEFORE the ring is assembled. Endpoint preservation means adjacent rectangles still meet at IXs; cap construction (`quarterCap` etc.) reads `pts[0]` / `pts[n-1]` directly from the chain, not from edge endpoints, so caps are unaffected.

**ε = 0.5 m.** Starting guess from brief; not tuned visually yet — agent can't view Designer. Reasoning: 0.5 m collapses OSM micro-bends (sub-degree wobbles within a few meters of an IX) without touching authored curvature (typically meters-scale deviation). Lower (0.1–0.2) if Mississippi corners still don't get visible big arcs; higher (0.8–1.5) only if the saving is too small. **Do not raise past 1 m without checking Truman Parkway's curved sides** — at 1.5–2 m the S-curves visibly facet.

**Bake.** `look=default: 43 groups, 375787 verts, 625016 tris, 11728.2 KB` (vs pre-A.7 44/387511/644332/12091.9). `look=lafayette-square: 43 groups, 373815 verts, 620723 tris, 11654.7 KB` (vs 44/385753/640664/12028.3). -3% verts/tris/size — consistent with smaller rectangles unioning into a slightly smaller asphaltSharp boundary with fewer micro-bend vertices.

**Group-count drop (44 → 43).** Surfaced as scope-drift concern. `mat:treelawn:institutional` is absent from A.7's output groups (present in the residential/commercial/vacant/parking/recreation/industrial/park/unknown set; institutional missing). `face:institutional` still has area, so an institutional block exists; its treelawn band collapsed to zero area somewhere. **Hypothesis:** a single thin institutional-block treelawn fragment had its band-polygon width crushed below numeric area threshold when its adjacent asphalt rectangle simplified. This is plausibly fine — a band that thin wasn't visually meaningful — but flag if any institutional block at LS shows visibly missing treelawn after A.7. The fix would be to lower ε locally for institutional-tagged frontages, or accept the loss as a real polygon-cleanup signal.

**Phase 2 (sidewalk/treelawn arc-following) DEFERRED.** Per brief: if A.7's visual outcome shows the perpendicular sidewalk cap reads as "fine, intentional cap" against the now-bigger curb wrap, Phase 2 isn't needed. Jacob decides post-visual.

**Doctrine alignment.** A.7 is the canonical implementation of FEATURES line 101 ("If the polygon is wrong: clean THE POLYGON, not the chains. Either author it directly, apply Douglas-Peucker / corner-detection at derivation, or change the source"). The chain-points authored geometry is untouched; only the *local* offset-polyline derivation gets cleaned. Same chain-points → same simplified polygon every time (determinism preserved).

#### Bezier corners shipped (supersedes A through A.7) — 2026-05-16

**Status:** SHIPPED 2026-05-16 (commit `7db2d32`). Replaced circular-arc corner geometry (`arcReplaceVertex` + the 49%-maxInset clamp it was carrying) with cubic Bezier corners. Doctrine: Bezier is shape-agnostic about local polygon-vertex density — it samples a smooth curve between two endpoints (`tA`, `tB`) + tangent directions, and overwrites whatever polygon vertices lie between them. The dense-corner→clamp-fires failure mode A.7 was patching no longer exists; A.7's `simplifyPolylineDP` + the inline Phase-A `findStableVertex` walk (via `IX_NOISE_RADIUS=16`) both retire structurally. A.6's `polylineCross` + `buildLegSidePolyline` stay — they now produce *both* the corner point `Vc` and the local-polyline tangents at `Vc` (single source of truth).

**Math (§2 calibration).** `tA = Vc + insetA · T_A`, `tB = Vc + insetB · T_B`, `insetA = insetB = R/tan(θ/2)`. Handle length `(4/3) · R · tan((π−θ)/4)` — the canonical cubic-Bezier circular approximation, with the arc *central* angle (`π − θ`) substituted for the brief's `θ/4` because θ in `cornersAtIx` is the polygon's *block-interior* angle, not the arc's central angle. Brief invited verification per "Doctrine-author humility"; parity test (`scratch/bezier-parity-test.mjs`) caught the mismatch — at θ=90° both formulas coincide (`tan(22.5°)`), but at any other angle the brief's formula diverges. Fixed inline before bake.

**AASHTO parity.** Bezier-vs-inscribed-circle max deviation (geometric, not per-index parameter): at θ=90°, R=4.5m → 0.0012 m. Across θ ∈ [60°, 170°], R ∈ [3, 15] m → max 0.023 m at θ=60°, R=15m. Well under the 0.1m gate. At default residential settings the sampled Bezier is visually indistinguishable from a circular arc — the doctrine-aligned model preserves all of the prior commit's clean-IX behavior.

**Curved-chain handling.** Bezier `insetA`/`insetB` are placed `R/tan(θ/2)` from `Vc` along the LOCAL polyline tangent (`polylineCross` segment direction at the hit point), not along an adjacent polygon vertex. They can therefore land *past* intermediate polygon vertices between two clean tangent points — the polygon's micro-bend density is overwritten by the sampled Bezier. Mississippi-class IXs at high `cornerRadiusScale` finally produce visibly big arcs that wrap cleanly to the curb without depending on A.7's pre-emptive simplification.

**Corner record additions.** `corner.T_A` / `corner.T_B` now carry LOCAL tangents at `Vc` (from `polylineCross`), replacing the prior far-field tangents from the `findStableVertex` walk. `corner.tA` / `corner.tB` are written by `applyRoundCornersToRing` post-Bezier-emission for `buildCornerPadQuad` to consume.

**`buildCornerPadQuad` migration.** Pad anchored at `tA`/`tB` (the Bezier endpoints) instead of `V` (the IX center). Inward direction = perpendicular to `tA`-`tB` segment on the side away from V (robust on curved chains). Per-side depth `cw + rightDepth_A` / `cw + leftDepth_B` so the pad reaches each band's outer edge. Legacy V-anchored parallelogram retained as a fallback for the case where `applyRoundCornersToRing` didn't emit a Bezier at this vertex (R≤0.05 or block-convex check failed). Concrete-plug-as-stroke-band redesign explicitly deferred to a separate phase per brief §5.

**Retirement audit.** `arcReplaceVertex`, `IX_NOISE_RADIUS`, `simplifyPolylineDP`, `SIMPLIFY_EPS`, `perpDistToSegment` all deleted (grep-confirmed no external consumers). The inline `findStableVertex` walk in `buildLeg` collapses to a single first-segment local-tangent read.

**Bake delta.** LS: `385,408 verts, 642,661 tris, 12,047.7 KB` (vs A.7's `373,815/620,723/11,654.7 KB`). +3% verts/tris/size — A.7's simplification is gone, so raw chain-offset vertices pass through to the union; Bezier then overwrites them at corners but the asphalt-side polygons retain their natural density. Determinism re-bake confirmed byte-identical.

**Deferred.** Per-corner Bezier authoring UI (Illustrator handles), per-corner override data model in `design.json`, concrete-plug-as-stroke-band, FEATURES corner-section rewrite, and the en-masse housekeeping pass that strips A.5/A.6/A.7 sections. The A.x brief sections above remain as live history until the housekeeping commit.

#### Phase 1 — Multi-vertex Bezier consumption (retires A.7 structurally) — 2026-05-16

**Status:** SHIPPED 2026-05-16 (this commit). Rewrote `applyRoundCornersToRing` as a two-pass span-aware walker: Pass 1 identifies, per corner-matched ring vertex, the CONSUME-SPAN of polygon vertices around the apex that lie within the Bezier's `inset = R/tan(θ/2)` arc-length along the ring (walking outward in both directions, stopping at another corner-matched vertex to avoid stomping adjacent spans); Pass 2 rotates to a non-consumed starting index so no span wraps in iteration order, then walks forward emitting literals or per-span Bezier output once per span. The pre-Phase-1 walker matched only the single TOL=0.5 vertex per corner; cluster vertices around the matched apex remained in the output, producing angular polygon kinks immediately before tA and after tB on curved-chain IXs even though the Bezier itself was smooth. Phase 1's span-walker eliminates those kinks structurally — the Bezier output replaces the entire consumed range with `[tA, ...samples, tB]`.

**Span magnitudes (LS post-Phase-1 probe).** Of 421 corners emitted at LS scale: 366 (87%) singleton (straight-chain, no cluster), 42 size 2 (one extra vertex consumed), 10 size 3, 3 size 4. Max span = 4 vertices. Total extra vertices consumed past the apex = 71. The brief's "5–10 cluster vertices within 2m of Vc" was a worst-case estimate; at LS's current chain density most corners had no cluster to consume. The structural fix matters for the cases where clusters do appear (Mississippi-class) and for future chain-density shifts (operator drags creating new curvature).

**A.7 retirement (structural).** `simplifyPolylineDP` + `SIMPLIFY_EPS` + `perpDistToSegment` were already retired at the Bezier ship commit (`7db2d32`) on the theory that Bezier overwrites cluster vertices in flight; Phase 1 fulfills that theory at the ring-walker. `chainPavementRing` and `emitChain` retain their direct `pts.map` per-vertex offset edges (no simplification).

**Phase A retirement audit.** Confirmed retired at HEAD: zero live consumers of `findStableVertex` / `IX_NOISE_RADIUS` in `src/`, `scripts/`, or `cartograph/`. Both Bezier handles and `buildCornerPadQuad` consume `corner.T_A`/`corner.T_B`, which now come exclusively from `polylineCross`'s local segment tangents at Vc. No resurrection.

**Bake delta (vs `7db2d32`'s HEAD baseline).** LS: 43 groups, 381,672 verts (−3,736, −1.0%), 635,585 tris (−7,076, −1.1%), 11,921 KB (−126 KB, −1.1%). Determinism preserved (re-bake byte-identical).

**Pads unchanged from prior state.** Phase 1 does not touch `buildCornerPadQuad`, `cornerSidewalkPads`, `cornerPadUnion`. Spiky pads at curved IXs persist; Phase 2 owns that.

**Algorithmic edge cases.**
- *Overlapping spans.* Prevented structurally: walk-back/walk-forward each stop at the first corner-matched neighbor (`matched[prevIdx] / matched[nextIdx]` test), so one corner's span never consumes another corner's apex. Two adjacent corners' spans can touch back-to-back at the boundary corner-vertex but never share consumed indices.
- *Wraparound.* Pass 2 rotates `i0` to the first non-consumed index before walking. As long as one ring vertex is non-consumed, no span wraps the iteration boundary. Pathological fallback (entire ring consumed by one or more spans): iterate from 0; spans emit at their first encountered consumed index.
- *R = 0 / degenerate angles.* Pass 1 explicitly skips corners with `R ≤ 0.05` or `tan(θ/2) ≤ 1e-6` — the consume-span is never recorded and the apex copies through unchanged. The pre-existing 5°/355° and 150°/210° (same-named through-T) gates in `cornersAtIx` mean those degenerate corners never make it to `applyRoundCornersToRing` as records anyway, but the local guard is kept for robustness.
- *Performance.* Pre-pass match is O(n × |corners|), same complexity as the pre-Phase-1 walker. At LS this is invisible (`buildBlockGeometryV2` runs in tens of ms). Bucket-index by bbox if a future scene multiplies ring length or corner count by 10× per [[feedback_polygon_walking_needs_spatial_index]]. Surfaced, not implemented.

**Deferred.** Same list as the Bezier-shipped entry — Phase 2 (path B + three-regime emitter + ramp wedge + asymmetric step) is the next phase to dispatch. Concrete-plug-as-stroke-band is its territory. FEATURES corner-section rewrite + A.x housekeeping still deferred to the trinity housekeeping pass after Phase 2.

---

### Phase B — Polygon-graph schema + producer

**Goal:** define the frozen polygon graph artifact and produce it at pipeline time. No consumers yet; runs in shadow mode.

**New artifact:** `public/baked/<scene>/polygons.json`. Schema:

```json
{
  "version": 1,
  "generatedAt": "ISO8601",
  "scene": "lafayette-square",
  "blocks": [
    {
      "id": "block-NNNN",
      "sharp": [[x, z], ...],
      "rounded": [[x, z], ...],
      "use": "residential" | "park" | "commercial" | ... ,
      "provenance": {
        "chainIds": ["lafayette-avenue-3", ...],
        "authoredPolygonRef": null | "park-polygon.json"
      }
    }
  ],
  "intersections": [
    {
      "id": "ix-NNNN",
      "point": [x, z],
      "corners": [
        {
          "id": "corner-ix-NNNN-A:dir|B:dir",
          "Q": [x, z],
          "rEffective": 5.0,
          "blockId": "block-NNNN",
          "asphaltPlugRing": [[x, z], ...] | null,
          "concretePlugRing": [[x, z], ...] | null
        }
      ]
    }
  ],
  "asphaltRings": [[[x, z], ...]],
  "curbBands": [[[x, z], ...]],
  "frontageBands": [
    {
      "blockId": "block-NNNN",
      "edgeOrd": 0,
      "treelawnRing": [[x, z], ...] | null,
      "sidewalkRing": [[x, z], ...] | null
    }
  ]
}
```

**Producer:** new file `cartograph/bake-polygons.js` (sibling to `bake-ground.js`). Reads:
- `cartograph/data/<scene>/clean/map.json` (which already carries `ribbons.streets` etc.)
- `cartograph/data/<scene>/clean/park-polygon.json` (authored polygon override)
- `cartograph/data/<scene>/clean/polygon-overlay.json` (NEW — placeholder for now; empty JSON `{}`)

Outputs `public/baked/<scene>/polygons.json`.

**Implementation:** essentially refactor `buildBlockGeometryV2` into a function that takes `(streets, intersections, opts)` and returns the polygon-graph object. Move it from `src/lib/` (where Designer mounts it) to `src/lib/polygonGraph.js` so both Node and Vite can import it. The existing `buildBlockGeometryV2` becomes a thin wrapper that calls `polygonGraph.compute(...)` and adapts the output.

**Pipeline integration:** add a step to `cartograph/pipeline.js` that runs `bake-polygons.js` after `derive.js`. Ensure `writeIfChanged` semantics + mtime touch per [[project_writeifchanged_touches_mtime]]. Output should be deterministic given identical inputs.

**Acceptance:**
- `node cartograph/pipeline.js` produces `public/baked/lafayette-square/polygons.json` (~few hundred KB; estimate based on ~250 IXs × ~4 corners + ~200 blocks).
- Re-running with no input changes produces byte-identical output (deterministic).
- Visual diff: Designer rendering UNCHANGED (consumers haven't migrated yet — shadow mode).
- Console summary: "[bake-polygons] 250 IXs, 200 blocks, 800 corner records, 12 KB."

**Trinity touch:**
- BACKLOG: NEW entry "Polygon-graph restructure (Phase B shipped)" pointing back here.
- FEATURES: add `polygons.json` to the slab artifact list.
- NOTES: Phase-B-shipped sub-entry to this brief.

**Estimated scope:** ~200 LOC (refactor + new file), one focused commit. No visible change.

---

### Phase C — Surface consumer migration

**Goal:** every surface-stage consumer reads `polygons.json` instead of computing from chains. The wall is now structural.

**Files:**
- `src/cartograph/BlockGeometryV2Debug.jsx` — replace the `buildBlockGeometryV2(liveRibbons, ...)` call with a `loadPolygonGraph()` hook that fetches `/baked/<look>/polygons.json` and returns the graph. The component renders directly from the graph's `blocks`, `asphaltRings`, `frontageBands`, `intersections[].corners[]`.
- `cartograph/bake-ground.js` — replace its `buildBlockGeometryV2(ribbons, ...)` call with reading the already-baked `polygons.json`. The bake becomes a polygon-graph-to-mesh translator (no recomputation).
- Any other `buildBlockGeometryV2` consumers: grep `cd /Users/jacobhenderson/Desktop/lafayette-square.nosync && grep -rn 'buildBlockGeometryV2' src/ cartograph/ --include='*.js' --include='*.jsx'` — currently 3 sites (file itself + 2 callers); migrate both callers.

**Reactivity:**
- Survey/Measure edits trigger pipeline rerun (today's flow). Pipeline rerun produces new polygons.json. BlockGeometryV2Debug re-fetches on `bakeLastMs` change (existing pattern from `BakedLamps`). Geometry refreshes; no chain re-walk in Designer.
- Phase D will optimize this further (partial rebake on polygon-overlay edits) but Phase C just gets the consumers off chains.

**Performance check:**
- Designer's BlockGeometryV2Debug should render fast (no Clipper booleans, no triangulation, just polygon-graph traversal + ShapeGeometry from pre-computed rings).
- Bake-ground.js may run faster too (no V2 compute).

**Acceptance:**
- Designer renders identically to pre-Phase-C (visual regression check at Hero / Browse / Street shots; aerial-overlay alignment unchanged).
- Bake produces identical ground.bin / scene.json (or trivially different — checksum diff acceptable if all geometry unchanged within float precision).
- Grep `chain\.points\|street\.points` in surface-stage code returns zero hits OR documented exceptions (e.g., Survey overlay still reads chain.points for handle rendering; that's NOT surface-stage).

**Trinity touch:**
- FEATURES: ribbon doctrine "stage wall" section gets a "shipped" annotation (today's V2 `re-walks chains on every Designer store update` line is no longer true).
- NOTES: Phase-C-shipped sub-entry.

**Estimated scope:** ~200 LOC (consumer migration), one focused commit. Visible: nothing changes (correctness check).

---

### Phase D — Operator interaction layer

**Goal:** Designer's drag handles, couplers, and per-block authoring operate on the polygon-overlay file (Stage 5 input), not on chain edits.

**Files:**
- `cartograph/data/lafayette-square/clean/polygon-overlay.json` — gains real schema. Per-corner radius overrides (already exist as `cornerRadiusOverrides` in design.json — migrate or alias). Per-block-edge widths. Coupler attachment points.
- `src/cartograph/MeasureOverlay.jsx` — drag handles read polygon edge geometry from `polygons.json`, write to `polygon-overlay.json`.
- `src/cartograph/CornerEditHandles.jsx` — already polygon-edge-based for Q-point computation; verify it reads from polygons.json corner records, not from `cornersAtIx`-recomputed records.
- `src/cartograph/SurveyorPanel.jsx` — Survey tool stays chain-focused (this is the ONE allowed chain consumer in Designer; chains are Stage 1 input). Unchanged.

**Behavior:**
- Operator drags a sidewalk-width handle on Block 0042's south edge. MeasureOverlay writes `{"block-0042": {"south": {"sidewalk": 3.5}}}` to polygon-overlay.json. Pipeline reruns (debounced ~300ms). polygons.json regenerates with the new sidewalk ring on that edge. BlockGeometryV2Debug re-fetches. Geometry updates.
- Operator drags a per-IX corner radius. CornerEditHandles writes to polygon-overlay.json. Pipeline reruns. polygons.json regenerates with the new corner geometry. Designer re-fetches.
- The corner / drag never touches chains. Chains are Survey-only.

**Reactivity tier:** debounced pipeline rerun is fine for Phase D. Phase E (future, out of scope) could add a "partial rebake" path that only recomputes the affected polygon-graph subset.

**Acceptance:**
- Drag a handle in Measure → polygon-overlay.json updates → polygons.json regen → Designer reflects new geometry within ~500ms.
- Drag a per-corner radius → same flow.
- Survey edits (centerline drag) → triggers full pipeline rerun (chain → polygons.json full regen).
- All authoring round-trips (save → reload → same state).

**Trinity touch:**
- FEATURES: "operator interaction model" paragraph in the stage wall section becomes shipped reality, not aspirational.
- BACKLOG: full polygon-graph restructure marked done; new Phase-E ticket if needed.
- NOTES: Phase-D-shipped sub-entry; the parent maxi-brief retired.

**Estimated scope:** ~300 LOC (overlay schema + drag-write rewires + reactivity), one or two commits. Visible: Designer feels different (more deliberate; corners don't wobble; drags feel "frozen and committed" rather than "live recompute"). UX win.

---

### Curved streets — first-class case, ground laid here

Some streets are intentionally curved between IXs (Truman Parkway's S-curves, Waverly Place's loop, the slight arcing of long park-edge runs). The polygon graph + long-run tangent extraction must handle these as gracefully as straight streets. **The corner geometry contract at the IX is the same** (clean tangent → clean asphalt intersection → clean rounded corner → three plug components); what changes is the **side geometry** between corners.

**Phase A clarification.** The `IX_NOISE_RADIUS=10m` skip is meant to discard OSM micro-bends near IXs (sub-degree wobbles within 5–10m of the corner). Intentional curves arc consistently over a long distance — the chain bends 30°+ over 100m of travel. The two cases are distinguishable: noise is short-distance + small-angle; intent is long-distance + cumulative-large-angle. Phase A's `findStableVertex` walks until distance from IX exceeds `IX_NOISE_RADIUS` AND returns that vertex's tangent — which IS the chain's intentional direction at the IX (curved or straight). So Phase A handles curved streets correctly **at the IX** without further work.

What Phase A DOESN'T do: emit polygon-edge geometry that follows the curve between IXs. Today's V2 emits per-segment rectangles, so a curved chain produces a faceted asphalt edge (each segment its own rectangle, mitered at chain-vertex joints). That's fine visually for slight curves; bad for sharp curves. Smoothing arcs into a single polyline edge is Phase B's polygon-graph schema problem.

**Phase B schema implication.** The polygon graph's block representation needs to support curved sides. Two options:
- **(a)** `block.sides[]` where each side is a polyline `[[x,z], ...]` (chain-vertex-dense between corners). Faithful to chain shape, accepts arbitrary curvature, no spline math. Polygon-walking band emission already handles this (D.3c walks vertex-by-vertex along block rings). Recommend this.
- **(b)** `block.sides[]` where each side has `{from: corner, to: corner, geometry: 'straight' | 'arc' | 'spline', ... }`. More semantic; requires renderer to interpret. More schema, more code, more places to break. Defer unless we hit a real need.

Use (a). The polyline is the canonical representation; whether it's 2 vertices (straight) or 30 vertices (smooth curve) is just data density. Round-corners op at IX corners works on the polyline endpoints (clean tangents per Phase A). Side rendering walks the polyline. Curved streets just have denser side polylines — no special case.

**Phase C/D unchanged in spirit.** Surface consumers read polygon-graph sides as polylines and render accordingly. No "if curved then …" branches.

**What's NOT solved here (out of scope for this brief).** Smooth-arc INTERPOLATION of intentional curves — taking a sparse OSM polyline (5 vertices over 100m) and densifying it to a Catmull-Rom spline (30 vertices over the same arc) for visual smoothness. The chain has a `smooth` parameter today (per `subdividePolyline` in `streetProfiles.js:419`); Phase A could optionally apply it during stabilization. But that's authorial smoothing intent, separate from this brief. Phase E (future) if needed.

**Concrete: Truman Parkway**. Today renders as a faceted ribbon; under this brief it'll render the same (Phase B schema preserves polyline density), with cleaner corner plugs at IXs (Phase A). If later it needs visual smoothness along the side, Phase E adds spline-densification at Stage 3 (still pre-bake; surface stage stays polygon-only).

### Loop streets — first-class case, ground laid here

The L.0–L.6 loop-street sprint has its own arc (see BACKLOG / NOTES 2026-05-10 "Loop streets: L.0 architecture lock"). This polygon-graph restructure does NOT take over that work — but if loop-aware geometry needs schema or Phase A handling baked in now, it should be done in round 1 to avoid retrofitting later. Per the loop-street doctrine, the median enclosed by loop members is **emergent** (`stencil − asphalt`, painted `lu='park'`); no separate median polygon primitive. So the polygon graph absorbs loops through metadata, not new geometry shapes.

**What round 1 must encode:**

- **Phase A — closed-chain wrap.** A Type A teardrop's body chain is `points[0] === points[points.length-1]`. `findStableVertex(pts, ixIdx, dir, V, IX_NOISE_RADIUS)` walks from `ixIdx` in `dir`; for a closed chain, `pts[ixIdx + dir]` may wrap around the end. Handle: if `ni < 0` or `ni >= pts.length` AND chain is closed, wrap to `(ni + n) % n`. Test against Benton Place (real LS data) and `BENT-BODY` (Benton-toy fixture in `src/data/toy/toy-input.json`).
- **Phase B schema — block metadata.** Each `block` in `polygons.json` gains optional fields:
  - `loopId: string | null` — set when this block is the interior face of a loop (e.g. `"loop-benton-place"`).
  - `loopMedian: boolean` — marks loop-interior blocks for `lu='park'` painting (matches existing `blockMeta[i].loopMedian` doctrine in BACKLOG line 1140).
- **Phase B preservation — loop registry.** The producer reads `overlay.json#loops` (canonical) AND `chains[].loop` (denormalized, on each chain). Carries both through to the polygon-graph artifact's chain provenance. Phase D's polygon-overlay can layer additional loop overrides.
- **Phase B side roles.** A block-edge whose owning chain has `chain.loop.role === 'cut-thru'` emits the bare profile (curb + asphalt, no treelawn / no sidewalk). The polygon-graph schema already supports per-side measures per block-edge (Phase B's `frontageBands[]` per (blockId, edgeOrd)); cut-thru is just a measure that zeros treelawn + sidewalk on both sides. No schema addition needed beyond what's in Phase B.
- **Phase B detection seam.** `detectLoops(skeleton)` runs at pipeline time (per the L.x plan); its output writes to `overlay.loops[]` AND populates `chains[].loop`. The polygon-graph producer (Phase B's `bake-polygons.js`) reads downstream; it does NOT need to detect loops itself. Detection is L.x sprint's owner.

**What round 1 does NOT do:**

- Loop-aware Survey UI (cards, enable/disable toggles, role flips) — that's L.x.
- Auto-detection of teardrop / couplet / ring topologies — L.x.
- The `cut-thru` profile rendering itself — falls out of Phase B's frontageBands work as long as the schema supports per-edge measure overrides; L.x sets the role.

**Acceptance touch in Phase B.** Ship Benton Place's body chain as a real test case: pipeline produces a polygon-graph block with `loopId: 'loop-benton-place'`, `loopMedian: true`, ring derived from the body chain's closed loop. Bake renders it as park-green. (If L.x detection isn't in by then, hand-author the loop in `overlay.json#loops` for the test.)

### Cross-phase watchouts

- **Don't bundle phases.** Each phase has its own visible-bug coverage and acceptance test. Bundling A+B or B+C makes regression bisection impossible per [[feedback_d3_bundling_failure_modes]]. Four commits, four acceptance gates.
- **Phase A is the only one with operator-visible improvement until D.** Phases B and C are correctness/structure changes; visual output should be identical pre and post. If a visual change appears in B or C, something is wrong.
- **`MeasureOverlay.jsx:360` still calls `innerEdgeMeasure` directly.** That's drag-handle preview, not surface emission — allowed to read live measure (it's the operator authoring it). Distinguish carefully when auditing for chain references.
- **Survey/Measure tools (in Designer) ARE allowed to read chains.** They author the chains. The wall is between authoring and surface emission; Survey is on the authoring side. Any "chain reference" check should exclude `src/cartograph/SurveyorOverlay.jsx`, `MeasurePanel.jsx`, `SurveyorPanel.jsx`, `useCartographStore` chain-edit actions.
- **Determinism matters in Phase B.** Two pipeline runs with identical inputs MUST produce byte-identical polygons.json. If not, downstream `bakeLastMs` cache-bust will fire spuriously and Designer will re-fetch on every save. Worth testing explicitly.
- **The park-polygon override pattern from `0850f3d`** (today's commit) is the template for any other authored block polygons that come along. Don't generalize prematurely; one override file per block-of-record is fine.
- **Couplers semantics.** Per [[feedback_couplers_are_segment_local]], couplers are per-segment, not per-pair. In polygon terms: a coupler attaches to a single block-edge or corner, not to a "pair." Make sure Phase D's polygon-overlay schema reflects this — no "pair coupler" entries.
- **Don't cargo-cult invent new geometry primitives.** Per the corner-plug section of the doctrine, the three plug components (asphalt / curb / concrete) are canonical. Don't add a fourth. The polygon-graph schema reflects only what V2 already emits.

### Read order for the next baby

1. `cartograph/FEATURES.md` ribbon doctrine (lines 17–79) — the why
2. THIS entry — the how
3. `src/lib/buildBlockGeometryV2.js` — the what-exists-today (target of refactor)
4. `cartograph/bake-ground.js` lines 282–290 (V2 invocation site) and lines 320–330 (asphalt routing) — the bake-side consumer
5. `src/cartograph/BlockGeometryV2Debug.jsx` — the Designer-side consumer
6. The [[feedback_data_flow_split_first_check]] memory — generalizable pattern when something looks off mid-phase
7. Today's commits `7854094`, `c3f13da`, `0850f3d` — the doctrine + park polygon work that motivated this brief

### Memories that govern this work

`project_v2_curb_is_unified_stroke`, `project_v2_block_ring_extends_to_asphalt`, `feedback_corner_pad_continuity_first`, `feedback_load_bearing_corner_pads`, `feedback_clipping_mask_does_the_geometry`, `feedback_d3_bundling_failure_modes`, `feedback_notes_md_holds_architecture`, `feedback_data_flow_split_first_check`, `project_writeifchanged_touches_mtime`, `feedback_couplers_are_segment_local`, `project_doped_artifact_placecard_edit_pattern`, `feedback_no_parallel_pipeline_for_scenes`.

---

## 2026-05-14 — Procedural-trees fallback: shipped (commit `dbbd1ed`)

**Status:** v1 landed. Five procedural species (`procedural_broadleaf` ×3 / `_conifer` ×2 / `_ornamental` ×2 / `_columnar` ×2 / `_weeping` ×2) publish through the unmodified `publish-glb` → `bake-look` → `bake-trees` pipeline. ~140/745 LS park placements now substitute procedurals (procedural_weeping has no shape-match placements; sits in roster ready). The architecture record below stands as written — the design landed verbatim.

### What's true post-ship that wasn't fully captured pre-ship

- **Grove is the operator's roster knob.** `src/arborist/Grove.jsx` already implements per-Look roster curation: scope toggle `In Look` / `All Rated`, click-to-toggle membership, fires `/api/cartograph/looks/<id>/trees` + `/api/arborist/atlas/bake?look=<id>` automatically. The "manually edit `design.json#/trees`" path my generator uses is the script-side equivalent; in normal operation an operator opens Grove → curates → done. **The 14 heavy hand-authored variants are pruned by clicking them out in Grove, not by editing design.json.**
- **Per-Look atlas budget unlocks once roster shrinks.** `bake-look.js`'s `CONTENT_CAP` caps tiles at `bark 512×1024 / leaf 512×512`. The 25-tree LS roster today produces a 4040×1560 unified atlas (~6 MB color PNG); pruning to ~10 trees frees ~60% of atlas area, opening room for `bark 1024×2048 / leaf 1024×1024` at no runtime cost. One-line knob in `arborist/bake-look.js:39` — defer until operator finishes Grove curation so the actual roster size drives the cap.
- **Bark variation deferred to SpeedTree.** The original ParkTrees palette (`['#5a4030', '#4d3828', '#634838', '#554030', '#4a3525']`) drove per-tree bark color via vertex colors; bake-look's atlas rewriter strips `COLOR_0` (bake-look.js:459), so v1 procedurals get one bark texture per species (5 distinct browns across the roster). SpeedTree restores per-instance bark via tinted baked-card atlas tiles — already the SpeedTree migration plan, no new gap.
- **`cartograph/serve.js` Bake-button chain runs `bake-trees.js --look default`** (not `--look <id>`). With procedurals at `quality=2` in `public/trees/index.json`, the default Look's placements file now substitutes procedurals — but the default Look's `design.json#/trees` doesn't include them and `bake-look` won't atlas them under `public/baked/default/`. Runtime fetches to `/baked/default/trees/procedural_*/...` will 404 when the default Look is the active one. **Risk window:** only when an operator deploys against `?look=` unset or `=default`. Mitigation when relevant: add procedurals to default's roster via Grove + per-Look atlas-bake (the same mechanism), or gate the universal `public/trees/index.json` per-Look (out of scope for v1 stopgap).
- **The publish-glb `quality` knob: `qualityOverride: 2`, not `quality: 2`.** publish-glb writes `quality: 0` (Untouched sentinel) on every newly-published variant; the Rating UI writes `qualityOverride: <N>` and that's what `build-index.js` consults (`effQuality = v.qualityOverride ?? v.quality ?? 0`). My generator patches `qualityOverride` on each procedural variant post-publish — preserves the "operator-rated" doctrine without forking publish-glb.

### Deferred: procedural authoring UI in Arborist (~1 day, no algorithm change)

Designed in the "Eventual UI" block below. `generateTreeMesh()` exposes the exact params signature the UI will bind to: `{preset, seed, dbh, canopyR, canopyH, branching, leafMorph}`. Slot-in plan:

1. Top-level mode toggle in `ArboristApp.jsx`: `[Scan] | [Procedural]`. Procedural mode shows the 5 species in Library; per-species detail view shows the current `PRESETS` table entries as editable variants.
2. Right-pane tune panel mirrors Workstage's voxelSize/minRadius/tipRadius pattern, with: shape preset dropdown / dbh / canopyR / canopyH / branching dropdowns (primaryN, childN, spread, baseTilt, droopPerGen, maxGen) / leaf morphology dropdown (from leafTypes.json) / seed integer + dice button.
3. `POST /procedural/generate` in `arborist/serve.js`: reads body params, calls `generateTreeMesh()`, packages into a single-variant GLB (the existing `buildSourceGLB` helper, refactored to accept one variant), streams the binary back. `SpecimenViewport.jsx` renders it.
4. "Adopt as seedling" button writes the params + seed to `arborist/state/procedural_<morph>/seedlings.json` and triggers `publish-glb.js` (mirrors the scan workflow's adoption).

Not v1-blocking. Carried as a BACKLOG line.

---

## 2026-05-14 — Procedural-trees fallback: pre-ship design memorial (archival, kept for reference)

The entry below is the pre-ship architecture record per [[feedback_notes_md_holds_architecture]]. Preserved verbatim because the design landed without changes; future migrations should trace from here.

### Why this exists

Current `lafayette-square` Look roster carries 14 hand-modeled/scanned variants (`platanus_acerifolia` ×9, `alaskan_cedar_2`, `broadleaf_rt3`, three generics). Total 138 MB baked GLBs + 10 MB atlas — too heavy for the mobile target per [[feedback_beautiful_first_lightweight_51]]. SpeedTree is the eventual destination (cards + LODs + impostor baker) but it carries a learning-curve cost. Procedurals are the v1 stopgap per [[project_v1_no_trees]].

The wiring to remove the old procedural component was already done at commit `43c4aa3` (Arborist library split); `{false && <ParkTrees />}` and its dependencies are gone from `src/`. Only stale doc-comment residue remains (`src/components/R3FErrorBoundary.jsx`, `arborist/SPEC.md:16`). The deployed live site still mounts those procedurals because it ships from a pre-`43c4aa3` build.

### Design: roster mix, not generator-only

The decisive insight: **procedural and hand-authored trees coexist in the same roster.** InstancedTrees' substitution pool is keyed by category, ranked by `quality` (0=Untouched/excluded, 1=Trash, 2=Fill, 3=Mid, 4=Hero). One roster can carry:

- `procedural_broadleaf` ×3 variants at `quality=2`
- `platanus_acerifolia` ×9 variants at `quality=4`
- `procedural_ornamental` ×2 variants at `quality=2`
- vendor `dogwood` ×4 variants at `quality=4`

All four pool into their category bucket; per-placement hash picks deterministically. Operator tunes mix via the Grove's quality slider alone — no rebake of placements, no code touch. SpeedTree replaces by raising its ratings; procedurals stay in roster at low rating as a permanent floor. This is [[project_doped_artifact_placecard_edit_pattern]] applied to trees: roster carries options, runtime samples by category × rating, operator refines.

**The Grove becomes the tree experiment surface.** Each Look has its own roster mix; an operator can author a `lafayette-square-procedural-only` Look (zero SpeedTrees rated), a `lafayette-square-cinematic` Look (all hand-authored, full quality), and any combination, without ever changing tree placements.

### Pipeline: reuse, don't fork

Generator emits a multi-node source GLB (one top-level node per variant, named `procedural_<morph>_1..N`). `publish-glb.js`'s existing variant detection (`namesSuggestVariants` / `nodesSpatiallySeparated`) splits it; LOD simplification, manifest emission, helper-mesh filtering, `normalizeScale` from approxHeightM — all unchanged. `bake-look.js` atlas-packs procedural leaf-card PNGs (already present in `public/textures/leaves/`) + a 1×1 solid-color bark swatch into the unified Look atlas. No fork of `publish-glb` / `atlas-pack` / `bake-look` / `bake-trees`. No `src/components/` edits beyond the 2-line stale-residue cleanup.

`InstancedTrees` consumes the published artifacts unchanged. The runtime sees one uniform tree-publishing channel.

### Generator: parameter-first, UI-additive

`arborist/generate-procedural.js` exposes one pure function:

```
generateTreeGLB({
  preset,          // 'broad' | 'conifer' | 'ornamental' | 'columnar' | 'weeping'
  seed,            // integer for deterministic regen
  dbh,             // trunk size driver (matches old ParkTrees signature)
  canopyR, canopyH,
  branching: { maxGen, primaryN, childN, spread, droopPerGen, ... },
  leafMorph,       // 'palmate' | 'lobed' | 'ovate_large' | ... (from leafTypes.json)
  barkPalette,     // array of 5 hex strings
}) → GLB buffer
```

The v1 commit ships a CLI wrapper iterating a small hardcoded preset table (one config per morphology × 1–2 seed variants). The eventual Arborist UI (top-level mode alongside scan-import per Jacob 2026-05-14) binds sliders to the same parameter object — same function, no algorithm change. **Discipline:** every variant in v1 must be expressible as a `params` object. No hardcoded shortcuts that bypass the parameter contract.

Algorithm resurrection target: commit `43c4aa3~1`, `src/components/LafayettePark.jsx` lines 450–880. Lift `growBranch`, `addLeaf`, `makeBranch`, `paint`, the per-shape branching configs (`conifer` whorl logic, `weeping` droop, `columnar` upright, `broad`/`ornamental` recursive crown). Drop the runtime-only bits: `useEffect` instance-matrix wiring, `onBeforeCompile` shaders, panel-color reactivity — those live in `treeAtlasMaterial.js` (atlas side) or are obviated by the per-instance pipeline.

### Species model: one per morphology

Five published species in `public/trees/`: `procedural_broadleaf` / `procedural_conifer` / `procedural_ornamental` / `procedural_columnar` / `procedural_weeping`. Mirrors `src/data/leafTypes.json` morphology axis; the eventual UI species-picker maps cleanly; bake substitution stays per-category.

(Rejected alternatives: one catch-all `procedural` species — wrong shape for UI; mirroring real species names like `procedural_acer_saccharum` — maximally substitutable but bloats state for a v1 stopgap.)

### Eventual UI (deferred, ~1 day on top)

Top-level mode toggle in the Arborist app: `[Scan] | [Procedural]`. Procedural mode owns the viewport. Right-pane tune panel mirrors the existing voxelSize/minRadius/tipRadius scan-panel pattern, with params instead:

- Shape preset dropdown
- Trunk: dbh, lean
- Crown: canopyR, canopyH
- Branching: maxGen, primaryN, childN, spread, droopPerGen
- Leaf morphology dropdown (sourced from `leafTypes.json`)
- Bark palette: 5 swatches
- Seed: integer + dice button

`POST /procedural/generate` endpoint on `arborist/serve.js` returns a GLB buffer; viewport renders it via `SpecimenViewport.jsx`. "Adopt as seedling" writes to `arborist/state/procedural_<morph>/seedlings.json` and triggers `publish-glb.js`. Not v1-blocking; build the function now with the API the UI will need.

### Constraints carried into the brief

- [[feedback_stash_isolate_per_file]] — the procedural commit must NOT bundle the 23 unrelated dirty files in the tree
- [[project_kit_helpers_pattern]] — Arborist owns trees end-to-end; cartograph never imports tree code
- [[feedback_no_parallel_pipeline_for_scenes]] — no procedural-only mount path bypassing InstancedTrees; the fallback is roster entries, not parallel renderers
- [[project_slab_is_the_instance_identity]] — procedurals travel through bake into the slab artifact like everything else; deployed runtime sees one uniform tree channel
- [[project_writeifchanged_touches_mtime]] — if the generator or pipeline writes files conditionally, mtime touches on no-op

### Acceptance for the v1 commit

- `node arborist/generate-procedural.js` + `node arborist/bake-trees.js --look lafayette-square` produces a `trees-atlas.json` whose roster includes all 5 procedural species at authored quality rating
- LS Stage / Preview / production render trees via `InstancedTrees` substituting procedurals into every park placement
- No `procedural` token appears in `src/` (only in `arborist/`, `public/trees/`, `public/baked/<look>/`)
- 2-line stale-residue cleanup (`R3FErrorBoundary.jsx` doc-comment, `arborist/SPEC.md:16`) lands in same commit

---

## 2026-05-14 — Lafayette Park: 4-corner authored polygon replaces OSM 41-vertex trace

The park's main corners were producing dirty corner plug geometry (asphalt + curb + concrete) because the polygonized park face inherited OSM's `leisure=park` 41-vertex trace, which has 5–6-vertex slow-turn clusters at each corner instead of 4 decisive corners. V2's round-corners op + per-corner plug emission inherit that noise; the three corner-plug components couldn't form cleanly.

Per the ribbon doctrine just landed in FEATURES (`7854094`): polygons are the authority for corner geometry. Cleaned the polygon, the plugs reconcile.

Three-part fix in this session:

1. **`cartograph/data/lafayette-square/clean/park-polygon.json`** — new authored polygon. 4 corners derived from `PARK_HALF=175m` half-width on the park's natural axes, rotated `tiltDegrees=-9.2`. Single source of truth for park face geometry.
2. **`src/components/LafayettePark.jsx`** reads from the same JSON for `PARK_HALF` + `tiltDegrees`, so the fence and the face stay in sync. Fence still inset by `FENCE_INSET=2m` inside the face polygon.
3. **`cartograph/derive.js`** — prefers the authored polygon over OSM's 41-vertex trace for `parkPolygon`. After the faceFills loop, finds the largest park-classified face whose centroid sits inside the authored polygon and replaces its ring with the 4 authored corners. Other park faces in the neighborhood (small parks, etc.) unaffected.

Pipeline + bake clean. Park face is now 4 verts (bbox 401×401, centered at origin); was 41 verts (bbox 446×443).

The OSM trace was ~45m larger in each dimension than the authored polygon — divergence between OSM's loose tracing and the operator's deliberate `PARK_HALF=175m` authoring. Authored value wins per doctrine.

Operator visual verification on Stage at all 4 park corners (Lafayette × Mississippi, Lafayette × Missouri, Park × Mississippi, Park × Missouri) is the next step. If any corner still looks dirty, the failure is downstream of the polygon (round-corners op, plug emission, frontage band walking) — addressable on its own merits without polygon-noise contamination.

---

## 2026-05-14 — Corner kit restored to 3 tiers (per-IX dot was the drift)

The corner-authoring kit had silently collapsed from 3 tiers to 2: `CornerEditHandles.jsx` had a dead-comment retiring the per-IX center handle, leaving the operator with only the global slider + per-corner cyan dots. The middle tier — "tune all four corners at one IX with one drag" — was missing, even though FEATURES line 72–76 still documented it as live and `cornerRadiusOverrides` was still consumed by the V2 emitter. The map was dormant, not gone.

Restored across two commits:

- **Phase 1** — per-IX dot back in place. Big blue dot at every IX, drag math + snap-to-reset + origin marker + tap-to-toggle all mirror the per-corner pattern. Per-corner hit-test still wins on overlap so per-corner clicks aren't swallowed by an adjacent IX dot.
- **Phase 2** — right-click on the IX dot calls `setIxCornerRadius(point, null)`, which already does the prefix-walk-and-delete on `cornerCornerRadiusOverrides` (one call clears both per-IX + per-corner entries at that IX). Browser context menu suppressed while corner-edit mode is active. Global Revert button untouched — keeps the "nuke and start over" affordance.

Doctrine note: this was an Illustrator-handles-doctrine restore, not a new feature. The per-IX retirement was drift; per-IX/corner/vertex authoring belongs in the scene as draggable dots, look-level / global belongs in the panel slider. Color-coding (blue default / gold override / white drag) matches the spec.

## 2026-05-14 — Labels consolidated; ramps z-disappeared; halo % fix

Landed across ~20 commits this session. Three related threads:

**Z-stack: motorway-class asphalt below arterials.** `bake-ground.js` PAINT_ORDER swap (`highway` group painted *before* `asphalt` rather than after) so motorway_link ramps z-disappear behind Jefferson / Lafayette where their geometry overlaps. Eliminates the dark-on-gray seams the operator circled at the cloverleafs. One-line change; renderOrder propagates via the manifest. Sibling label-side fix: skip `highway ∈ {motorway, motorway_link, trunk_link}` in label data — those synthetic `motorway_link 13` names are positional indices from `skeleton.js`'s unnamed-vehicular pass, not walkable destinations.

**SceneLabel + shared streetLabels module (consolidation).** Designer and Preview/LS used to render labels through two parallel paths — `MapLayers.LabelSprite` (canvas texture) and `LafayetteScene.StreetLabel` (drei `<Text>` with type-tier sizing) — that drifted in style and placement. Both retired. Single canonical path now:

- `src/lib/streetLabels.js` — module-scope memoized compute over `ribbonsData.streets`. Longest-chain-by-arclength selection, label position at the chain's arclength midpoint (fixes Preston Place's previous "label anchored at one terminal segment" symptom), `widthM` derived from `measure.{left,right}.pavementHW`, gate via the tight 4-corridor `labelBoundary` (Jefferson/Lafayette/Truman/Chouteau corners + 30 m pad — supersedes the LS-side `EAST_OF_TRUMAN_ALLOWED` regex whitelist).
- `src/components/SceneLabel.jsx` — drei `<Text>` (TroikaText/SDF), world-space sizing in meters, width-aware per-label multiplier (clamped 0.5×..2× of base `size` based on chain's pavement width). Designer Labels panel drives Size, Weight, Fill, Halo color+%, Tracking, Case, Font, Opacity.
- Google Fonts: dropdown of ~1500 families fetched once from `api.fontsource.org/v1/fonts`; URL derived from family + weight at render time as `https://cdn.jsdelivr.net/fontsource/fonts/<id>@latest/latin-<weight>-normal.ttf`. No bake impact.

`MapLayers.LabelSprite`, `LafayetteScene.StreetLabel`, `getStreetLabelPlacements`, `SAME_NAME_MIN_DIST` / `ANY_LABEL_MIN_DIST`, `EAST_OF_TRUMAN_ALLOWED`, the `streetsData` → labels path — all gone. `streets.json` still imported by `SidePanel.jsx` for a count display (separate consumer, intentional).

**Park title is custom-authored, not panel-parametric.** Phase C briefly routed `LAFAYETTE PARK` through SceneLabel with a `tier="park"` multiplier. Jacob's call after testing: park is a singular landmark, custom direct-author beats parametric. Reverted to hardcoded drei `<Text>` in `LafayettePark.jsx`; the `tierScale` / Park × machinery came back out of the store, panel, and SceneLabel. Doctrine update in `project_labels_encourage_walking.md`: world-space sizing (not screen-space as originally drafted), uniform across all named streets, no class tier.

**Surprises caught along the way:**
- Troika's `outlineWidth` reads raw numbers as world units, not fontSize-relative; `outlineWidth={0.07}` always meant 7 cm of absolute outline, *never* 7% of glyph. Fixed by passing `"7.0%"` (string) so the halo scales with the type. The earlier "halo is reduced on small labels / overpowered on big" complaint was the same bug — *perceived* as proportional, never was.
- Cartograph Designer uses `OrthographicCamera`; an aborted screen-space-pixel sizing iteration's perspective `worldPerPx` formula yielded NaN → invisible labels. Caught and branched on `camera.isOrthographicCamera` before the whole approach got reverted to world-space.
- Panel sliders without draft+debounce → re-render-per-pixel-of-drag → starves the browser pointermove stream → "slider clicks but doesn't slide". `DraftRangeInput` helper (mirrors `CornersSubsection`'s pattern) now wraps every numeric label slider. Memory: `feedback_heavy_render_sliders_need_draft.md`.

`labelBoundary` derivation: pairwise segment intersection between each adjacent corridor pair, fall back to nearest-endpoint pair if T-junction (no crossing). The 1.8 km `neighborhood_boundary.json` polygon is too generous to gate anything in this scene — every street in the OSM cutout sits inside.

---

## 2026-05-14 PM — Inner-edge anchor: course-corrected to authoring-mode flag (NOT geometry override)

Earlier today's commit (`4ed353c`) forced `inboard.pavementHW = 0` in `innerEdgeMeasure`, treating the chain as though it sits at the inner pavement edge. But skeleton positions chains at OSM way center (= carriageway center), so the geometry shifted instead of carving a median. Operator-visible failure: carriageway pavement collapsed to one side of the chain, median nowhere near correct.

**Course correction.** Reverted `streetProfiles.innerEdgeMeasure` back to zeroing only the inboard ped zone (`treelawn` / `sidewalk` / `terminal`) — the original 2026-04-26 PM pivot model was right; pavement + curb stay operator-authored on both sides. The actual fix lives in `useCartographStore.setAnchor`:

- Flipping anchor to `'inner-edge'` now ALSO sets `measure.symmetric = false` and seeds `inboard.pavementHW = 0` (option (b) — visible feedback that the mode took effect; operator widens inboard back to taste).
- Flipping anchor to `'center'` restores `symmetric = true` and mirrors outboard onto inboard (returns to symmetric defaults).
- Same transform applied to every entry of `segmentMeasures`.
- Pair-aware mirror to the mate (`pairId`) carries the whole flip in lockstep.

The drag mechanism (NOTES 2552–2553 + 2564) and the chain-at-carriageway-center model (NOTES 1609) were always right; the error was implementing the BACKLOG 2745–2750 ask as a geometry override instead of riding the existing `measure.symmetric` mechanism.

**Median emerges by construction** when both paired chains carry `inner-edge` anchor and the chain-to-chain gap exceeds the sum of inboard pavement HWs. Operator widens inboard → median shrinks → at zero gap it disappears. Free per the locked positive-carriageway doctrine.

The earlier Phase 2 transform at `buildBlockGeometryV2`'s entry stays in place — it now wraps the corrected (lighter) `innerEdgeMeasure` and only strips the inboard ped zone, never pavement.

**Trinity touch:** FEATURES divided-road section rewritten in this same session. The 2026-04-26 PM pivot wording ("chain stays at carriageway center; cross-section authored two-sided") is once again canonical. The earlier session-entry below is superseded by this one.

---

## 2026-05-14 AM — Inner-edge anchor: pavement now flips too (asymmetric lane spawn) — SUPERSEDED by PM entry above

Closed the symmetric-lane-spawn bug tracked in BACKLOG line 2745–2750. `streetProfiles.innerEdgeMeasure` (`src/cartograph/streetProfiles.js` ~line 398) now zeros inboard `pavementHW` in addition to the previously-zeroed `treelawn` / `sidewalk` / `terminal`. The block comment was rewritten to be the canonical reference; **supersedes** the 2026-04-26 PM pivot's "chain stays at carriageway center; pavement spans both sides as usual" wording.

---

## 2026-05-11 (EOD-2) — D.7 walker identity-driven + D.7a customs flow through corners

The walker no longer detects corners by turn-angle threshold. It uses
**chain-ownership-per-segment** as the corner signal, and threads a
stable `(chain, side, segOrd)` identity into D.7a's customs flow so
operator drags propagate to corner pads, adjacent legs, and the
unified curb stroke after release/deselect.

### Walker — chain-ownership-per-segment

`buildFrontageEdges(streets, blockSharp, chainIndex, ixByChain)` walks
`blockSharp` rings. For each ring **segment** (consecutive vertex pair)
it probes outward with `findAdjacentChainForBlockEdge` to identify the
owning chain. A vertex is then classified as a block corner iff the
owning chain on the segment BEFORE it differs from the one AFTER it.
Two different chains meeting = real corner; same chain on both sides
= chain interior bend (e.g. HW3 saw-tooth's 45° jogs in toy) — keep
the polyline whole. Stencil/parcel-only vertices (both sides null-
owned) fall back to a 30° angle test so the ring still partitions at
parcel-side turns.

This replaces the prior purely-geometric 30° angle test, which
conflated "chain bends" with "two chains meeting at an IX." Toy's HW3
saw-tooth has 45° turns at non-IX vertices that the old walker
fragmented into multiple frontage edges with butted band caps; the
new walker keeps that block-edge as one polyline and `computePerps`
miters the bend interior cleanly.

### IX identity — coordinate-match, not stale `intersections[].ix`

`resolveChainSegmentation(streets)` (exported) returns
`Map<street, Set<pointIdx>>` of IX vertices identified by
coordinate-match: a chain point is an IX iff its coordinate is shared
by ≥2 distinct chains within 0.5m. Single source of truth — used by
`naturalSegments`, the walker, `chainSegOrdsAlongEdge`, `cornersAtIx`,
`buildChainBandsLive`, and `MeasureOverlay.naturalSegmentOrdinal`.
Stale `intersections[].ix` integers (~36% stale on LS per
`feedback_customs_identity_must_unify_across_consumers`) are no
longer trusted.

### Index translation — centerlineData vs liveRibbons

Two arrays, different orderings, both indexed against:

- `centerlineData.streets` — skeleton order (N entries).
  `MeasureOverlay`'s `selectedStreet` indexes this.
- `liveRibbons.streets` — ribbons order (M ≥ N entries; `derive.js`
  inserts extra carriageways for divided roads). V2's `chainIdx`,
  `byChain`, and `frontageEdges.chainIdx` index this.

Toy hits this hard (M=15 vs N=9; VW2 at index 5 in centerlineData,
index 11 in liveRibbons). Pre-fix, every drag bailed at `findFeForSide`
because `streetIdx === chainIdx` matched the wrong chain. Fix:

- `BlockGeometryV2Debug.jsx` enriches each fe with `chainSkelId` and
  `chainName` before stashing into `_v2FrontageEdges`.
- `MeasureOverlay.findFeForSide` matches by `chainSkelId` (with name
  fallback), not by chainIdx.
- A `selectedRibbonsChainIdx` memo translates `selectedStreet` →
  liveRibbons index for every `byChain[...]` consumer in
  `BlockGeometryV2Debug.jsx`.

When threading new state across these two consumers, identity (skelId,
sometimes name) is the source of truth. Array indices are not.

### segOrd uniqueness — midpoint + projection-in-range

`chainSegOrdsAlongEdge(chain, edgePoints, ixByChain)` resolves which
natural-segment ordinals run alongside a block-edge polyline. Three
guards together make `(chain, side, segOrd) → fe` unique:

1. Probe by natural-segment **midpoint only** — endpoints sit at IX
   corners shared with adjacent block-edges and overcount.
2. Require projection `t ∈ [0, 1]` on each polyline segment — no
   clamping. Out-of-range projections register the chain point as
   "near a clamped endpoint" of the wrong block-edge, which lets
   adjacent natural segments leak into another block's `segOrds`.
3. Tolerance is `max(12, hwMax + 25)` — adaptive to the chain's
   default pavementHW so wide customs (operator dragged to e.g.
   pavementHW=18) don't push the midpoint past a fixed band.

Pre-fix, `findFeForSide` (first-wins) and `buildChainBandsLive`'s
`feBySegSide` (last-wins, overwrite loop) disagreed when multiple
fees matched — operator wrote to one block's custom, live overlay
read from another. Structurally impossible now: one fe per
`(chain, side, segOrd)`.

### D.7a customs identity preservation across pass-2 rebuild

D.7a's two-pass emitter runs pass-1 with chain defaults, detects
which chains have any custom via `blockCustoms[fe.blockKey]?.[fe.edgeOrd]`,
re-emits those with `customsResolver`, then rebuilds
`asphaltSharp / blockSharp / frontageEdges / feLookup` so bands and
corner geometry track the new asphalt silhouette.

The bug pre-fix: `blockKeyFromRing` rounds the block bbox center to
0.5m. When asphalt widens by 2m+ (a normal drag), the block bbox
center shifts > 0.5m and the rounded blockKey flips. The pass-2
`frontageEdges` have NEW `(blockKey, edgeOrd)` keys; the operator
wrote customs against pass-1 keys. `cornersAtIx` (which uses the
rebuilt feLookup) reads pass-2 keys → blockCustoms misses → corner
legs fall back to default widths. Visible symptom: asphalt expands,
corner pads stay at default widths.

Fix: after the pass-2 `buildFrontageEdges` call, iterate the new fees
and match each one back to its pass-1 counterpart by the stable
triple `(chainIdx, segOrds[0], side)`. Copy `(blockKey, edgeOrd)`
forward onto the pass-2 fe. cornersAtIx now resolves the same
blockCustoms entry the operator wrote against; the stashed
`_v2FrontageEdges` (= pass-2 fees with pass-1 keys) preserves stable
keys so the operator's NEXT drag also writes against pass-1 keys.
Geometry is pass-2 (new positions); identity is pass-1 (stable).

**Why this is a pattern, not a one-off:** `blockLandUse` is keyed by
`blockKey` too. Same drift applies — a wide custom shifts the block's
bbox center, the operator's authored LU lookup misses, the block
falls through to the hash-default LU and visually flips color. Same
preservation pattern would fix it (carry pass-1 blockKey onto pass-2
block records). Not done in this pass; tracked in BACKLOG follow-ups.

---

## 2026-05-10 (EOD-3) — D.3c polygon-walking + D.5/D.6 customs migration shipped

The D-phase block-edge migration is architecturally complete. The
canonical implementation of the PM-2 "block as positive space" spec
ships in `src/lib/buildBlockGeometryV2.js`:

**`buildFrontageEdges(streets, blockSharp)`** — for each ring in
`blockSharp`, walks vertices, classifies each as a block corner if
the per-vertex turn angle exceeds 30°, and emits one frontage edge
per (block, block-edge). Adjacent chain identified by spatial probe
(`findAdjacentChainForBlockEdge` — outward from edge midpoint, find
the chain whose centerline is parallel and closest). Output:
`{ points, blockKey, edgeOrd, chainIdx, side, segOrds, ringCcw }`.
`points` is a slice of the block ring vertices (the block-edge
polyline, INCLUDING both block corners). `segOrds` is which chain
natural segments run alongside the edge (computed by projecting
chain.points onto the block-edge polyline).

**`buildFrontageBands(streets, frontageEdges, curbWidth, blockRounded, blockCustoms)`**
— for each fe, parallel-offsets the block-edge polyline INWARD into
the block by `cw / cw + tl / cw + tl + sw` to produce treelawn +
sidewalk rings. Inward direction = +leftPerp for CCW block ring,
-leftPerp for CW. Customs lookup: `blockCustoms[fe.blockKey]?.[fe.edgeOrd]`
overrides chain default. ONE ring per band per fe. Bands clipped to
`blockRounded` so they don't bleed past the rounded silhouette.
`frontageCaps` always returned empty — `cornerSidewalkPads` (load-
bearing per the pad memo) handle corner concrete.

**Why polygon-walking instead of chain-walking:** chain-walking
emits per natural segment, square-ending at every IX. At interior
IXs where the cross-street T's into a through chain but the BLOCK
on the through-chain's far side is continuous, the chain emits two
band rings butting at the IX vertex. With variable hw across
segments (operator-authored customs), the rings step at the IX —
visible perpendicular slash mid-block-face. This is the "Mississippi
sidewalk cuts off at Kennett" canonical bug. Polygon-walking
recognizes that the IX vertex is INTERIOR to the block-edge polyline
(no turn there) and emits one continuous band.

**Customs identity (D.5).** `blockCustoms` re-keyed from
`[chainIdx][segOrd][side]` → `[blockKey][edgeOrd]`. Three visible-
geometry consumers all read the new shape:

1. `buildFrontageBands` — direct lookup at each fe.
2. `cornersAtIx` — for each leg, looks up its containing fe via a
   `feLookup[chainIdx][segOrd][sideKey]` map (built once per V2
   build from `frontageEdges.segOrds`), then reads
   `blockCustoms[fe.blockKey]?.[fe.edgeOrd]`.
3. `buildChainBandsLive` (drag preview) — same fe-lookup pattern,
   filtered to the selected chain.

If any one consumer reads a different keying than the others, you
get the "band moved, plug stayed" mismatch (memory:
`feedback_customs_identity_must_unify_across_consumers`).

**Authoring (D.6).** The Measure UI's per-block-mode drag handler
resolves `(streetIdx, segOrd, sideKey)` → frontage edge via
`findFeForSide` (a small helper that scans the cached
`_v2FrontageEdges` from the store) → `(blockKey, edgeOrd)` →
`setBlockEdgeCustom(blockKey, edgeOrd, measure)`. Handle-positioning
reads the same shape so handles track the operator's edits live.

**What's preserved unchanged.** Per-chain asphalt rectangles, round
endcaps at chain endpoints (`byChain.{tl,sw}CapRings`),
`cornerSidewalkPads`, `cornerAsphaltPlugs`, `applyRoundCornersToRing`
on the asphalt union — none of these change. Polygon-walking only
replaces the BAND emission; everything else flows through the same
pipeline as before.

**Performance regression at LS scale.** `findAdjacentChainForBlockEdge`
iterates `streets × chain.points × probe-steps` per fe. On LS that's
~4M distance computations per V2 full pass. Toy hides the cost (4
chains, 4 blocks). Designer feels sticky on click-to-select / deselect.
Memory `feedback_polygon_walking_needs_spatial_index` records the
fix shape: spatial bbox prefilter on chains before iterating.
Dedicated perf pass is the next sprint.

**Superseded:** D.3b.3 (sharp-corner extension) and D.3b.4 (pullback
+ frontageCaps) shipped as commits `27760e6` and `914eca0` but were
patches on the chain-driven approximation. The D.3c polygon-walking
rewrite makes them structurally unnecessary — the block-edge
polyline IS the curb, no extension needed; pads (load-bearing) do
the corner concrete, no separate cap quad needed. The
`chainStripBandExt` helper persists in the codebase but its
override parameters are dead code (D.7 cleanup will inline).

**Trinity status:** FEATURES.md unchanged this session (still
correct re: per-Look bake artifacts, cap memo, scene-routing).
BACKLOG.md updated. NOTES.md (this entry).

---

## 2026-05-10 — Loop streets: L.0 architecture lock

In-flight architecture for the loop-street effort (BACKLOG entry "Loop
streets — L.0 through L.6"). Read this BEFORE touching anything related
to Benton Place, Waverly Place, `LOOP_STREET_NAMES`, or the V2 emitter's
treatment of closed-body chains. Per `feedback_notes_md_holds_architecture`,
this is the canonical algorithm description; the BACKLOG entry just
tracks status.

### Why this exists

The V1 codebase identifies loop streets via
`LOOP_STREET_NAMES = new Set(['Benton Place', 'Mackay Place'])` in
`cartograph/derive.js:1297`, referenced in 8 places (block-cut skip,
dead-end skip, frontage-gap patch, median creation, SPIKE skip,
sidewalk skip, alley/ROW skip). Three problems compound:

1. **Mackay is misclassified.** It is just a normal street; the constant
   is wrong on top of being hardcoded.
2. **Waverly Place is missing.** Waverly is a real loop street with a
   completely different OSM topology than Benton (divided one-way
   couplet, not stem+closed-body) and the V1 code path can't represent
   it at all.
3. **All of this V1 code is dead in production.** Post the V2 migration
   (commits `1fb456f` / `053f13b`), block geometry comes from
   `buildBlockGeometryV2` reading `ribbons.streets`. `derive.js`'s
   `allBlockPaths` / `blockMeta` / `isMedian` land in `map.json`, which
   `bake-ground.js` reads only for sub-block overlays — not for the
   loop-cut or median-creation logic. Whatever Benton or Waverly looks
   like in production today is whatever V2 falls through to with no
   loop-awareness.

### Definition

A **loop street** is a connected set of same-named street chains in
OSM that bound an enclosed face the operator wants painted as median
(green, no sidewalk). The set is identified by a `loopId`; each
member chain carries a `role` describing how it participates.

A single `chain.isClosed` test is insufficient — Waverly's loop body
exists only as the face *between* its two carriageways, not as any
single closed chain. The real definition is **topological**: a
connected same-named subgraph that encloses a face we want as median.

### Topologies in initial scope

- **Type A "Teardrop"** (Benton Place pattern). Members: 1 stem chain
  + 1 closed body chain, sharing an endpoint at the loop joint.
  Auto-detect: a chain `c` where `points[0] == points[points.length-1]`
  AND another chain shares its name AND has an endpoint coincident
  with `c`'s closure point.
- **Type B "Couplet"** (Waverly Place pattern). Members: ≥2 parallel
  one-way carriageways meeting at endpoints, optionally with cross
  connectors. Auto-detect: ≥2 chains with the same name, all
  `oneway: true`, sharing endpoints to form a planar cycle. Connectors
  are flagged `cut-thru` (bare-street profile through the median) or
  `connector` (ordinary residential piece grouped only for naming).
- **Type C "Pure ring"** (none observed in LS yet) — closed body, no
  stem. Same body geometry as Type A without the stem.

### Per-role visual cross-section

| Role | Outer side | Inner side |
|---|---|---|
| `body` (Type A closed loop) | lawn + sidewalk + treelawn + curb + asphalt (full ROW) | asphalt + curb + treelawn (no sidewalk; treelawn flows into median continuously) |
| `stem` (Type A entering chain) | normal residential ROW both sides | normal residential ROW both sides |
| `outer` (Type B carriageway) | full residential ROW (treelawn + sidewalk) | full residential ROW (treelawn + sidewalk) — *unchanged from a normal street* |
| `cut-thru` (Type B bare cross-street through median) | curb + asphalt only (no treelawn, no sidewalk) | curb + asphalt only |
| `connector` (same-name chain that's just a normal piece of street) | full ROW | full ROW — flagged for grouping only |

The median itself is **emergent**: `stencil − asphalt` produces a
positive block, painted `lu='park'` whenever it's enclosed by chains
belonging to the same `loopId`. There is no separate "median polygon"
emission — the rounded-block-clip model already produces the face.

### Data shape

`overlay.loops` is canonical; `chains[].loop` is denormalized for
hot-path emitter reads. The writer keeps the two in lockstep on save;
the reader trusts whichever it consults.

```jsonc
// overlay.json (per-scene)
{
  "loops": [
    { "id": "loop-benton-place", "name": "Benton Place", "type": "teardrop",
      "members": [
        { "chainId": "benton-place-1", "role": "body" },
        { "chainId": "benton-place-0", "role": "stem" }
      ] },
    { "id": "loop-waverly-place", "name": "Waverly Place", "type": "couplet",
      "members": [
        { "chainId": "waverly-place-0", "role": "outer" },
        { "chainId": "waverly-place-1", "role": "outer" },
        { "chainId": "waverly-place-2", "role": "outer" },
        { "chainId": "waverly-place-3", "role": "cut-thru" }
      ] }
  ],
  "chains": {
    "benton-place-1": { "loop": { "loopId": "loop-benton-place", "role": "body" } /* ... */ }
  }
}
```

### Auto-detect + override

Pipeline runs `detectLoops(skeleton)` after chain emission. Output
candidates by the topology rules above. Survey panel surfaces a
"Loop streets" section: each detected loop is a card with thumbnail,
type label, member chain list, enable/disable toggle. Operator can
also "Mark selected chains as loop" from a marquee selection (override
path). `overlay.loops` writes the operator's final intent;
auto-detect output is merged at load time but operator wins on conflict.

### Smooth-preview (bundled scope)

Loop bodies (especially Benton's 29 polyline points) read as faceted
polygons today because smoothing happens at render time only. To land:

1. **Survey-time bake into `street.points`**: `derive.js` calls
   `subdividePolyline(pts, smooth)` when emitting `ribbons.json` so
   the persisted points are smoothed (BACKLOG Phase 7's open ½-hour
   task; necessary because V2 reads only `ribbons.json`).
2. **Live preview overlay** in SurveyorOverlay: when a chain has
   `smooth > 0`, render the subdivided polyline as a faint solid
   line *under* the original dashed control polyline. No toggle —
   always on when `smooth > 0`. Drag the smooth slider, see the curve
   update in place.

### Ribbon controls — inner/outer authoring

Measure mode on a chain whose `loop.role ∈ {body, outer}` swaps the
"Left / Right" labels for "Outer / Inner" (resolved from `role` +
chain orientation relative to the loop centroid). Default profiles
for inner side reflect the cross-section table above. Everything else
(per-segment customs, treelawn/sidewalk widths) works as today.

### Phasing (matches BACKLOG entry)

L.0 (this spec) → L.1 toy fixtures (Type A + Type B added to
`src/data/toy/toy-input.json` — the canonical toy "OSM" equivalent;
re-derived to `src/data/toy/toy-ribbons.json` via
`cartograph/derive-toy.js`. NOTE: there is also a vestigial file at
`cartograph/data/toy/raw/centerlines.json` from `TOY_AUTHORING_PLAN.md`
that nothing reads — do NOT edit it.) → L.2 V2 emitter (asymmetric ped zones for body chains,
bare profile for cut-thru, median-face park-LU classification) +
smooth bake-into-points → L.3 Survey UI (loop card + auto-detect +
smooth-preview overlay) → L.4 Measure inner/outer relabel → L.5 LS
migration (Benton + Waverly) + sweep of the 12 `*Place` streets to
catch hidden loops → L.6 cleanup (`LOOP_STREET_NAMES` deletion, dead
V1 paths in `derive.js`, docs migration BACKLOG/NOTES → FEATURES +
ARCHITECTURE).

Toy is the iteration surface (per
`feedback_no_parallel_pipeline_for_scenes` and FEATURES.md "Toy is
the canonical pipeline test rig"); LS is the verification target.
Both ship in the same phase — toy fixtures stay committed as
regression coverage. Per `feedback_d3_bundling_failure_modes`,
keep producer changes (V2 emitter) separately commit-able from
consumer changes (renderer, UI).

### Out of scope for this effort

- Other neighborhoods' loop topologies — anything beyond Type A/B/C
  surfaces in a future deployment.
- Roundabouts, traffic circles, cul-de-sac bulbs — these are not loop
  streets; they're single-chain features with cap geometry.
- Cosmetic tuning of the median's `lu='park'` palette — that's a Stage
  Surfaces concern, orthogonal to this work.

---

## 2026-05-10 (EOD-2) — D.1/D.2/D.3a shipped; bundled D.3b+D.3c attempt rolled back; D.3 re-planned

Picking up from the 2026-05-10 EOD pin. Three small additive commits
landed cleanly on `cartograph-looks-pass-ab`:

- `059cc4c` **D.1 `buildFrontageEdges`** — inverse of `adjacentBlockId`.
  Per-block runs of (chain, side, segment) grouped into block-edges.
  Output `frontageEdges: [{ points, chainIdx, segOrds, side, blockKey, edgeOrd }]`
  on the geometry result. Pure additive; no consumer.
- `d113f1f` **D.2 `blockSharp`** — `stencil − asphaltSharp`. Sharp-corner
  figure-ground inverse, returned alongside `blockRounded` (which stays
  the render-time clip mask).
- `fa929d3` **D.3a `buildFrontageBands`** — per-frontageEdge tl+sw rings
  spanning the merged segment run along the chain centerline. Additive;
  no consumer. Caveat: per-segment customs collapse to the first
  segOrd's customs in a run.

### The bundled D.3b+D.3c attempt that didn't ship

Jacob asked for "two so the blast radius is medium" after the D.3a +
production-swap option discussion. I read that as bundle D.3b
(geometry: sharp-corner extension + composition-rule pullback +
`(tl+sw)↔(tl+sw)` caps + clip to `blockRounded`) with D.3c (production
swap: `bake-ground.js` and `BlockGeometryV2Debug.jsx` consume
`frontageBands` + `frontageCaps`; `cornerSidewalkPads` +
`cornerAsphaltPlugs` stay mounted per
`feedback_corner_pad_retirement_caution`). Wrote ~290 LOC across
three files; HMR-loaded into Designer.

Jacob inspected and reported four distinct symptoms:

1. **Concrete plugs mis-shaped on asymmetric/variable corners.** My
   cap polygon was `[S, S+Nin*b, S+Nin*b−T*a, S−T*a]` with
   `a = perp.totalDepth` and `b = this.totalDepth` — exact only for
   90° X with consistent depths. Variable column/row → cap doesn't
   land on the actual band-pullback edges. Fix needs cap corners
   derived from the *actual* pulled-back band end-vertices, not from
   an orthogonal basis.

2. **Round/end caps disrupted at chain endpoints.** Lost. Root cause:
   `emitQuarterCaps` in `buildBlockGeometryV2.js` pushes treelawn
   quarter-cap rings into `byChain.[chainIdx].treelawnRings` and
   sidewalk into `.sidewalkRings` — same arrays as the per-segment
   bands. The D.3c renderer swap stopped consuming
   `byChain.{treelawn,sidewalk}Rings` entirely, taking the round caps
   with it. Fix is structural: split the byChain rings into
   `bandRings` vs `capRings`; bake/Designer consume both, but D.3c
   only swaps the band consumer.

3. **"Changed parcel shape → lost land-use, treelawn/sidewalk
   absorbed/hidden."** `blockKey` is bbox-center keyed
   (`blockKeyFromRing`), so reshaping a parcel shifts the key and
   any `blockLandUse` / `blockCustoms` entries pinned to the OLD key
   become orphans. Pre-existing latent issue; D.3 made it visible by
   routing more state through `blockKey`. Diagnose independently of
   D.3 — possibly key by face-id or persist a
   `blockKey-canonicalization` map.

4. **"Blunt/flat end caps aren't perfect."** Same root as (2) — the
   half-disc round cap geometry exists in `byChain.*Rings` and got
   dropped along with the band consumer.

Rolled back via `git restore src/lib/buildBlockGeometryV2.js
cartograph/bake-ground.js src/cartograph/BlockGeometryV2Debug.jsx`.
Tree clean at `fa929d3`. Memory saved as
`feedback_d3_bundling_failure_modes`.

### Re-planned D.3 sub-phasing (canonical going forward)

Each sub-phase lands without a known regression. **Never** bundle a
renderer/consumer swap with new producer geometry — symptoms compose
and you can't isolate.

- **D.3b.1 — Split `byChain` band rings vs cap rings.** ~30 LOC, no
  visual change. `byChain[i]` gains `treelawnCapRings` +
  `sidewalkCapRings`; `emitQuarterCaps` writes there; bake + Designer
  push both into the same material groups they push today. Pure
  refactor. Foundation for D.3c.
- **D.3b.2 — Per-segment customs within a frontage.** ~80 LOC. Make
  `buildFrontageBands` piecewise across segOrds in a run so the
  band's inner edge tracks variable hw. Removes the D.3a first-segOrd
  caveat. Still data-only.
- **D.3b.3 — Sharp-corner extension only.** ~60 LOC. Build adjacency
  lookup (per fe-end, find perp fe at same chain-IX with same
  blockKey). Extend bands by `perp.hw + cw` along this curb direction
  (90°-exact, oblique approximate via line-line intersection if we
  want it precise). NO pullback, NO caps yet. Still data-only.
- **D.3b.4 — Pullback + spec caps from band ends.** ~100 LOC. Per-end
  pullback per composition rule (`sw` legs run to corner; `tl+sw`
  legs pull back by `perp.totalDepth`). Cap polygon corners come
  from the *actual* pulled-back band end-vertices on each leg, not
  from an orthogonal basis — this fixes (1). Clip bands + caps to
  `blockRounded`. Still data-only.
- **D.3c — Production swap.** ~50 LOC. Bake + Designer consume
  `frontageBands` for treelawn/sidewalk + `frontageCaps` for concrete
  corners. CONTINUE consuming `byChain.{treelawn,sidewalk}CapRings`
  from D.3b.1 so dead-end caps stay — fixes (2)/(4). Asphalt stays
  per-chain-segment via `byChain` (correct per V2 spec).
  `cornerSidewalkPads` + `cornerAsphaltPlugs` stay mounted alongside
  per `feedback_corner_pad_retirement_caution`. After Jacob signs
  off per surface (Designer / Stage / Preview), D.4 retires the
  pads. **Visible-bug coverage of D.3c:** Mississippi/Park sidewalk
  cutoff becomes one continuous band; corners are spec-correct under
  the still-mounted pads.

### Open carry-overs

- **`blockKey` staleness.** Symptom (3) above. Reshaping a parcel
  orphans `blockLandUse` / `blockCustoms`. Investigate independently
  of D.3 (small repro: change a face's outer ring vertex; observe
  stored customs detach). Possible fixes: (a) key by stable face-id
  rather than bbox-center; (b) maintain a `blockKey`-rewrite map at
  reshape time; (c) bbox-center with a tolerance-based nearest-key
  resolver. Pick after diagnosing the actual edit path (Survey?
  derive? Designer face-edit?).

---

## 2026-05-07 (PM session) — V2 lands in toy; parallel-pipeline lesson logged

> **Status update 2026-05-09:** Phase 0 collapse landed. Toy now routes
> through `SCENE_REGISTRY` in `src/cartograph/CartographApp.jsx` —
> same V2 emitter, same Survey/Measure tools, same Designer panel,
> same bake adapter as LS. The parallel-pipeline drift described
> below has been resolved structurally; the only residue is a static
> `import toyRibbons from '../data/toy/toy-ribbons.json'` plus a
> hardcoded `TOY_STENCIL` constant (Phase 0e — scene-keyed routes
> `/api/cartograph/:scene/...` is the remaining cleanup, not load-bearing).
> Corner controls (per-IX + per-corner R) shipped. V2 also cut over
> on LS (`design.useV2Geometry: true`). The active extension is
> block-edge-owned ribbons (BACKLOG 2026-05-09) — see also "Toy is
> the test rig for the next emitter" below.

V2 (rounded-block-clip) now renders live in toy through the shared cartograph
surface pipeline: residential block fills + asphalt corridors + treelawn /
sidewalk strips + corner-rounded asphalt mouths. Look palette (`layerColors`,
`luColors`) and `cornerRadiusScale` slider both wired to V2. Survey + Measure
overlays mount in toy; centerlines and handles render.

Mid-session, Jacob flagged the architectural drift: what landed is a parallel
toy data pipeline (static `toy-ribbons.json` import in `_loadCenterlines`,
toy-only branch in `_saveOverlay`, sibling `ToyV2`/`NeighborhoodV2` wrappers,
duplicate static-`intersections` reads). The right shape is what
`cartograph/TOY_AUTHORING_PLAN.md` already specified: scene-parametric server
routes (`/api/cartograph/:scene/...`), per-scene file layout, one branch in
the store, one V2 wrapper. Toy becomes "cartograph running on a small
persistent Scene" — not a separate code path.

Next session opens on:
1. Corner controls — finish per-IX + per-corner radius overrides in
   `buildBlockGeometryV2.cornersAtIx`; gate `CornerEditHandles` dot/circle
   render on `cornerEditMode` (currently dots show whenever component mounts).
2. Phase 0 refactor per `cartograph/TOY_AUTHORING_PLAN.md` — collapse the toy
   parallel path. Net code goes down.

Detailed punch list in `cartograph/BACKLOG.md` (sections "Lesson logged
2026-05-07" + "Corner controls — known broken").

---

## 2026-05-06 (PM-2) — Corner geometry retired & rebuilt: rounded-block-clip plan

> **Status update 2026-05-09:** The V2 prototype this entry plans
> shipped (`src/lib/buildBlockGeometryV2.js` +
> `src/cartograph/BlockGeometryV2Debug.jsx`), and the corner authoring
> kit (per-IX + per-corner R, smoothing, curb-width) is wired through
> Designer + bake. What this entry describes as the *target* model
> (block-as-figure, asphalt-as-void, ribbons owned by block edges)
> is **not yet** the shipped emission strategy: V2 still emits
> per-chain-segment rectangles and reaches the rounded-block-clip
> via union + round-corners + difference + corner-plug patches. The
> active migration is to flip emission to walk block edges directly
> — see `BACKLOG.md` 2026-05-09 "Block-edge-owned ribbons (NEXT —
> load-bearing)".

Long planning conversation with Jacob. After weeks of corner-plug
construction (per-corner annular sectors, then the IP-rule concentric
stack with shared C and leg-widen+R-shrink algebra), we walked all the
way back and rebuilt the model from scratch. This entry is the plan;
no code yet. Author's intent + step-by-step design follow.

### The new model — figure-ground inversion

Today: street is positive space (asphalt + curbs + sidewalks emanate
from centerline outward). Corner plug is a constructed object we paint
over the block's pointy corner.

New: **block is positive space**. Street is the void around blocks.

1. Centerlines + measured pavement half-widths derive **block polygons**
   (the land masses between streets). Sharp rectilinear shapes; corners
   are pointy where two streets meet.
2. Apply Illustrator-style round-corners to each block polygon. Every
   convex vertex becomes a circular arc tangent to both incident edges,
   inset by R. The block polygon is now a **rounded clipping path**.
3. **The arcs exist only as the boundary of the clip.** No fillet
   primitive, no constructed corner-plug object, no "corner block"
   primitive. The arc is a property of the clip outline.
4. **Inside the clip:** ribbon strips (treelawn, sidewalk) run all the
   way to the underlying *sharp* corner of the block. The clip hides
   what falls outside. Strips don't know about the rounding.
5. **Outside the clip = asphalt.** Its rounded mouths appear
   automatically — they're the inverse of each block's arcs.
6. **Curb = stroke along the clip outline.** Straight along the
   frontage, arc at the corner. One stroke pass; no separate curb-arc
   geometry.

The same arc serves the asphalt's mouth, the curb stroke, and the trim
of inboard strips. We never construct the arc as filled geometry — the
clip does it.

### Strip composition near the corner (still sharp polygon, before clip)

Each block-edge has a leg ribbon running parallel to its curb, with
either `sw` (sidewalk-only, depth = sw) or `tl+sw` (treelawn at curb,
sidewalk inboard, depth = tl+sw) composition. At each corner:

- **`sw ↔ sw` corner.** *No cap.* The two leg sidewalk strips meet
  naturally at the corner — their sw × sw overlap *is* the corner.
  Continuous L-band emerges from the strip union. Elegant minimum.

- **`sw ↔ (tl+sw)` corner.** *No separate cap.* The sw leg's strip runs
  full block length (corner to corner). The (tl+sw) leg's strip
  terminates at depth=sw from the perpendicular block edge — its
  treelawn never reaches the corner because the sw leg's sidewalk
  strip already occupies that area. Leg ribbons do all the work.

- **`(tl+sw) ↔ (tl+sw)` corner.** *Cap exists.* A `(tl+sw) × (tl+sw)`
  concrete square at the corner. Both legs' treelawns terminate at the
  cap's inner edges; both legs' sidewalk portions connect with the cap.
  ADA landing.

**Unifying principle:** the cap appears exactly when the corner geometry
is "fat enough" to need it — when both legs carry treelawn, the corner
area would otherwise be grass-on-grass. At the sw-only end, there's no
fat to cap; the strokes alone are the elegant answer.

Bonus: the cap also gives the rounded-corner arc somewhere logical to
bite. At a `(tl+sw) × (tl+sw)` corner, R has real concrete to cut
through. At a `sw × sw` corner, R must stay small (≤ sw-ish) because
the arc cuts the sw band itself — too big and the sidewalk pinches.
NACTO's "smaller-is-better in dense urban" maps onto this naturally.

### Authoring kit transfers unchanged

Global `cornerRadiusScale` slider, per-IX handles, per-corner handles
(leg-pair-keyed) all feed R into the round-corners operation on the
block polygon. Same UI, same storage shape (`design.json#cornerRadiusScale`,
`design.json#cornerRadiusOverrides`), same color coding (blue = default,
gold = authored, white = mid-drag), same revert button. Only the
geometry consumer changes.

### Dead-ends are safe

Round-corners only operates on **convex** polygon vertices — corners
that bulge outward into asphalt. Dead-ends are notches into the block;
their throats are *concave* vertices (round-corners ignores) and their
caps are arcs (no vertex to round). Today's dead-end + cap geometry is
incorporated into the block polygon's perimeter as a pre-resolved
sub-path. Photoshop analogy: dead-end is a flat layer below; block
polygon is the smart layer with round-corners applied; only the convex
vertices respond. Untouched.

### What gets retired

- `intersectionGeometry.js` — `buildIntersectionPolygon`,
  `buildFilletWedge`, `buildLegRectangle`, `cornerRadiusFor` is kept
  (table feeds R into new op).
- `ribbonsGeometry.js` — `computeIntersectionPolygons`,
  `padWidthForCorner`, `makeLegFromChainVertex`, the per-corner
  annular-sector additions to `buildRibbonUnion`.
- `StreetRibbons.jsx#buildSidewalkPads` — the per-corner asphalt-mouth
  fills + curb annuli, the leg-pair-keyed asphalt L-shape splitter.
- `buildCornerPlug` (already gated dead).
- `buildCurbAnnulus` (Phase 3 dead code, retained for revert-safety).
- The "wider-leg-dominates pad width" rule.
- The shared-C concentric stack, leg-widen+R-shrink algebra.
- The continuity-contract perp checks (made structural by derivation).

### What carries forward

- `CORNER_RADIUS_M` lookup table (AASHTO/NACTO class-pair × angle).
- `cornerRadiusScale` Look-level dial.
- Per-IX and per-corner override schemas in `design.json`.
- `CornerEditHandles.jsx` — UI surface unchanged, just feeds different
  consumer.
- `streetProfiles.js` ribbon composition (sw / tl+sw per side).
- Dead-end + cap geometry (already correct).

### Prototype landed (EOD 2026-05-07)

Files:
- `src/lib/buildBlockGeometryV2.js` — shared helper. Computes asphalt
  union from chain pavement footprints, identifies IX corners from
  `ribbons.intersections`, applies round-corners with the default-R
  rule. Also has a `chainStripBand` helper + treelawn/sidewalk emission
  + `intersectRings` clip step (not currently rendered, see below).
- `src/cartograph/BlockGeometryV2Debug.jsx` — visualizer. Currently
  rendering as: red translucent sharp-asphalt + blue translucent
  rounded-asphalt + yellow IX-corner dots, layered on top of the
  legacy StreetRibbons render. Toy-scene only (gated by `scene==='toy'`).

Smoke test on v1 (90° X with asymmetric ped zones) passes:
- 12-vertex sharp + → 76-vertex rounded (4 corners × 16 arc segs + 12 originals).
- 4 corners detected with correct d_min:
  - NW (tl+sw / tl+sw): d=3, R=4.5m (class wins).
  - NE/SW (mixed): d=1.5, R=3.31m (geometry-cap wins).
  - SE (sw / sw): d=1.5, R=3.31m.

What works in the live render (per Jacob's screenshot):
- Asphalt void renders as +-shape with rounded mouths at all 4 IX corners.
- Visible R difference between NW (4.5m, biggest arc) and others (3.31m).
- Yellow dots land on the correct sharp-corner positions.
- Cap ends stay unrounded (correctly skipped — concave from block POV).

What didn't work yet:
- **Real material colors broke visually.** Attempted to switch from debug
  primary colors to BAND_COLORS (asphalt #3e3e3c, sidewalk #a89e8e,
  treelawn #5a6e42, residential #5A8A3A) using plain `meshBasicMaterial
  opacity={1}`. Result conflicted with the legacy render's fade-shader
  + post-FX pipeline. Reverted to debug colors. Two paths forward next
  session: (a) thread V2 meshes through `makeMaterial` so they
  participate in the fade pipeline, or (b) add a Designer toggle that
  hides the legacy StreetRibbons entirely in toy mode so V2 can use
  plain materials without conflict.
- **Block fill addition felt unclear.** Adding the green block parcel
  fill on top of the legacy render made the visual hard to read (mixed
  signals from two competing models). Reverted — current state is
  asphalt-only V2 overlay.
- **Strip bands not yet rendered.** Helper computes them and the
  intersection-clip works (smoke test on v1 produces 6 sidewalk +
  3 treelawn bands clipped to the rounded block); just not wired into
  the visualizer pending the legacy-occlusion question above.

Open observations from Jacob:
- "The internal rules aren't as simple as I was saying" — the cap-only-
  at-(tl+sw)/(tl+sw) framing may need refinement once the strip bands
  render visibly. Worth revisiting before adding the case-3 cap.

### Next session opener (2026-05-08)

1. Decide legacy-occlusion path: thread V2 through `makeMaterial`, OR
   add a "hide legacy ribbons in toy" toggle. (b) is faster for
   prototype validation; (a) is what production needs anyway.
2. Once V2 can render alone, switch to real material colors and wire
   in the strip bands. Verify v1 looks sane before adding cap rule.
3. Then walk v2-v10 to validate the model on harder cases (acute
   angles, T, Y, 5-way, bent chain, asymmetric pavement).
4. The strip bands' case-2 rule is currently implicit via render order
   (sidewalk paints on top of treelawn). Verify this looks correct on
   v1's NE/SW mixed corners; if not, add explicit case-2 termination.
5. Case-3 cap (concrete square at tl+sw/tl+sw corners) is still
   unimplemented. Add only after v1 looks right without it.

### Resolutions (2026-05-07)

1. **Block polygons derived in a shared helper** (likely
   `src/lib/buildBlockGeometry.js` or similar). Live render
   (`StreetRibbons.jsx` or successor) and offline bake
   (`cartograph/bake-ground.js`) both call it. Same pattern as today's
   `buildRibbonGeometry`. Designer slider/handles update in real time
   without needing a bake.

2. **Asphalt complement bound = neighborhood stencil.** Asphalt =
   stencil polygon MINUS union(rounded blocks). One polygon, one clip.
   Reuses the existing `useBoundary`-style clipping. Toy uses the
   residential face's outer ring; LS uses its existing stencil.

3. **Curb is a single stroke pass** over the union of all block-clip
   outlines. Uniform width + color → one geometry pass, one material.
   Continuous around intersections by construction (no seams at IX
   centers because there's nothing IX-specific in the pass).

### Still open (resolve during prototype)

4. **`(tl+sw) ↔ (tl+sw)` cap implementation** — paint a separate
   sidewalk-material square at the corner and union with strip
   sidewalks? Or extend the strip's sidewalk portion (depth `tl..tl+sw`)
   to wrap the corner via a curb-following stroke at depth `0..tl+sw`
   for the cap region only? Either works; pick whichever is simpler in
   code.

### Default-R rule (added 2026-05-07)

Worked the math on what R should default to at each corner so the new
model produces visually-OK geometry without per-corner authoring.

**The pinch formula:** at a corner with interior angle θ, leg strip
depth d (= sw or tl+sw), and curb radius R, the visible strip width at
the arc midpoint is:

```
w_midpoint = (d - R) / sin(θ/2) + R
```

This pinches as R grows past d. Capping by "strip stays ≥ k·d at arc
midpoint" gives:

```
R_max(d, θ, k) = d × (1 - k·sin(θ/2)) / (1 - sin(θ/2))
```

**The rule (k=0.5, decided this session):**

```
R_default(corner) = min(R_class, R_max(d_min, θ, 0.5))
                  × cornerRadiusScale
                  × per-corner override
d_min = min(legA.depth, legB.depth)
```

Skip rounding if θ ≤ 5° or θ ≥ 175°.

**Toy v1 outcome:** NW (tl+sw/tl+sw) gets R=4.5m (class wins);
NE/SW/SE all get R=3.31m (geometry-cap wins on the sw-side d_min=1.5m).
The class table is the ceiling; geometry-cap kicks in whenever the
strip is too narrow to carry the AASHTO-baseline R.

The class table from `intersectionGeometry.js#CORNER_RADIUS_M` carries
forward unchanged as `R_class`.

### Next session opener

Read this entry. Then bring up the **Toy fixture** (`/cartograph.html`
in toy mode, which loads `src/data/toy/toy-input.json` +
`toy-ribbons.json`) and walk through whether the rounded-block-clip
model produces good corner geometry on the 8-variant grid. Toy v1
(symmetric 4-way 90° X) is the simplest case — make it work there
first. Then v2/v3/v4 (60°/45°/30° X), v5 (T), v6 (Y-120°), v7
(degenerate 175°/5°), v8 (5-way 72° spokes).

The new model should handle obliques and 5-way without special-casing
because round-corners is angle-agnostic. The acute regimes (v3, v4, v7)
that were broken under the IP-rule should be naturally clean here.

---

## 2026-05-06 (PM) — Aborted IP-rule switch + docs hardening (`cartograph-looks-pass-ab`)

A second session today. Net code change: zero. Net doc change: continuity
contract added to BACKLOG, two-pass principle added to ARCHITECTURE,
obsolete `HANDOFF_corner_plugs_2026-04-24.md` retired (commit `94860f4`).

**What was attempted:** rolling the corner-authoring kit (per-IX handles +
Phase 3 per-corner handles) onto Lafayette Square neighborhood data, and
during the roll-out, switching corner construction from per-corner annular
sectors to the IP rule (BACKLOG decision 2026-05-05).

**What broke:** the IP polygon was built without verifying its outer edges
shared perp positions with the leg-ribbon band-stripe pass. The result
floated independently of the legs — corner pads as detached blobs rather
than continuations. Hours of overshoot/trim iteration on top of a broken
foundation. Reverted both `StreetRibbons.jsx` and `ribbonsGeometry.js` to
HEAD; nothing landed.

**Root cause (now in docs):** there was no acceptance test for "did I
build the right polygon?" before staring at corner artifacts. Added one —
see `BACKLOG.md §"Pad geometry from NACTO/AASHTO/ADA convention"` →
"Continuity contract" subsection. Three perp checks per leg-side, must
pass on a symmetric toy IX before iterating on visuals.

**Stash for next agent:**

In-flight neighborhood-rollout testing artifacts were stashed (not
deleted, not committed) under:

```
git stash list
# stash@{0}: in-flight 2026-05-06: LS rollout testing — triage before resuming
```

Contents: `cartograph/data/clean/map.json`, `public/baked/`,
`public/looks/`, `src/data/ribbons.json`. These are a mix of regenerable
bakes and possibly-real authoring edits the prior agent couldn't
disentangle. Triage with `git stash show -p stash@{0}` before resuming.
The bakes are safely regenerable; the data files (`design.json`,
`ribbons.json`, `map.json`, `index.json`) may contain real edits and
should be diffed individually.

**Kept dirty in working tree (intentional, active surface):**
- `src/data/toy/toy-input.json` + `toy-ribbons.json` — adds v9
  (bent-chain) + v10 (asymmetric-pavement) toy variants. Useful
  regression fixtures for the IP-rule re-attempt.
- `src/cartograph/CartographApp.jsx` + `CornerEditHandles.jsx` —
  Phase 3 polish.

**Opener for the next agent:** see the BACKLOG continuity contract first.
Then verify the three perp checks on toy v1 (symmetric 4-way 90° X) BEFORE
touching corner geometry. Then re-attempt the IP-rule switch with the
contract as the gate. Known data-classification issues blocking the LS
rollout are flagged in BACKLOG (undefined `highway` field, divided-road
continuations, missing real IXs from `derive.js`).

---

## 2026-05-06 — Corner-authoring kit, Phases 1 & 2 (`cartograph-looks-pass-ab`)

Two-phase landing of the corner-radius authoring stack. The 4-step plan from
the session's outset (variant testing → global slider → per-IX handles →
per-corner handles → roll to neighborhood) is complete through the per-IX
layer. Phase 3 (per-corner handles, leg-pair-keyed) and the neighborhood
roll-out are tracked in `BACKLOG.md`.

### Variant grid (regression fixture)

`src/data/toy/toy-input.json` was rebuilt as an 8-variant 4×2 grid (80m
spacing) covering the angle regimes that stress corner-plug geometry: 90° X
baseline, 60°/45°/30° X, T-90°, Y-120°, 175°/5° degenerate X, and 5-way at
72° spokes. All chains share an asymmetric measure (left=tl+sw, right=sw)
so angle is the only varying axis. Symmetric/near-symmetric cases (90°, T,
Y) render cleanly; acute regimes show the artifacts that motivate the
deferred "corner-case corners" punchlist.

The grid is now the canonical regression fixture for any future
corner-plug work — flip Designer to the toy scene, drag the corner-radius
slider full range, and visually scan all 8 cells.

Earlier in the session: parcel face inner edges in `toy-input.json` were
extended from ±7 to centerline (0,0) to fix a sliver of background
showing through at sw-only sides. The lesson — *parcel face inner edges
must extend well past any ribbon outer width to let the ribbon-union clip
carve them flush, regardless of treelawn presence* — generalizes to
authoring real LS faces.

### Phase 1 — Look-level `cornerRadiusScale` slider

A single multiplier applied uniformly to every IX corner radius across
the active Look. Persists to `design.json#cornerRadiusScale`. Drives the
"bubbly retro" sponsored-event mode without per-IX authoring.

Threading: `cornerRadiusScale` reaches `buildCornerPadClips` (bake +
face clip) and the live `getR(ix)` callback in `StreetRibbons.jsx`
(curb annulus + sidewalk pad). Multiplied AFTER per-IX overrides, so a
3.5m authored corner becomes 5.25m at scale 1.5.

`buildRibbonGeometry(ribbons, opts)` switched signature: 2nd arg is now
an opts object `{ stencilPolygon?, cornerRadiusScale?, cornerRadiusOverrides? }`.
Legacy-array form auto-rewraps for back-compat. Both `bake-ground.js`
and `StreetRibbons.jsx` updated.

**UX bugs fixed during Phase 1, worth remembering:**
- Slider felt "click-and-jump" — the heavy meshes useMemo was running
  synchronously on every onChange, blocking the input thread. Fix:
  local draft state for the visible thumb, `requestAnimationFrame`-
  throttled commits to the store, final commit on `onPointerUp`. Pattern
  is reusable for any heavy-onChange slider.
- Slider was wired correctly but corners didn't change. Cause: the
  legacy `buildCornerPlug` (line 900 in StreetRibbons.jsx) emits its
  own `corner_sw` / `corner_asph` fills with R derived from sidewalk
  width, ignoring `ix.cornerRadius` entirely. The new `buildCurbAnnulus`
  + `buildSidewalkPads` paint OVER it at higher renderOrder, but at
  scale=0 the new layers go empty and the legacy fills are exposed.
  Fix: gated `buildCornerPlug` behind `if (false && ...)` (function
  body kept for easy revert if regressions surface).
- Slider STILL didn't change corners. Cause: `cornerRadiusScale` was
  added to the wrong useMemo's dep array (caught `pathRibbons` instead
  of `meshes`). Fix: added to the correct one (`meshes` closes ~300
  lines earlier). **Lesson: when adding a dep, verify by line number
  which useMemo's dep array you're editing — multiple in the same file
  can have nearly-identical shapes.**

### Phase 2 — Per-IX center handles in corner-edit mode

New `src/cartograph/CornerEditHandles.jsx` — Illustrator-style draggable
dots at every IX. Mounted unconditionally in Designer mode (toy + LS);
component bails out when `cornerEditMode` is false.

Toggle button (`○ Edit corners` / `● Edit corners`) lives in the Streets >
Corners subsection alongside the global slider. While on:
- Blue dots at every IX center, blue rings at the current effective radius.
- Drag a dot: world distance from cursor to IX = new radius. Live commit
  to store at pointermove rate; geometry rebuilds during drag.
- Release: dot snaps back to IX center. If the value differs from
  default, dot turns gold (override-bearing flag).
- Revert button next to the toggle clears all overrides for the active
  Look. Disabled when no overrides exist; shows count when active.

Persistence: `design.json#cornerRadiusOverrides` — sparse map keyed by
quantized point string (`"x.xxx,z.zzz"`, 3-decimal precision). The same
`ixPointKey` helper is exposed on the store and inlined in
`buildCornerPadClips` so Designer and bake produce the same lookup.

The override stores the BASE radius (what gets multiplied by
`cornerRadiusScale`). Authoring at scale=2 stores half the apparent
size; switching to scale=1 reveals the base. This is intentional —
the slider is a true uniform multiplier on top of authored intent.

### Pattern saved to memory

`feedback_illustrator_handles_for_spatial_authoring`: per-feature spatial
controls (per-IX, per-corner, per-vertex) → in-scene draggable dots with
direct-manipulation gestures, NEVER panel sliders / numeric inputs.
Look-level / global controls → panel slider is fine. Color-code handles
by override status.

### Phase 3 — per-corner handles, leg-pair-keyed (added in same session)

Per-corner overrides keyed by `<pointKey>|<legKeyA>|<legKeyB>` where
legKey = `<skelId>:<dir>` and the two leg keys are sorted alphabetically
(invariant under A/B swap; only invalidates if one of the keyed legs is
removed from the IX — the explicit reason we picked leg-pair keys over
ordinal indices).

Geometry refactor: `buildSidewalkPads` now emits per-corner asphalt-mouth
fills + curb annuli alongside sidewalk pads. Each per-corner asphalt
cover splits into THREE simple polygons (legA-tail rect + legB-tail rect
+ lens) that tile around Q_curb without self-intersection. The naive
single-polygon-around-the-L-shape approach failed because earcut
triangulates the re-entrant Q_curb vertex incorrectly. The dead
`buildCurbAnnulus` (uniform-R Clipper-offset trick) is kept in the file
for revert-safety but no longer called.

Two additional debugging-pattern lessons saved to memory:

- `project_overlay_meshes_must_be_transparent` — every overlay mesh
  added to the cartograph Canvas needs `transparent opacity={1}` on its
  material; opaque meshes silently don't render in Designer mode (the
  post-FX / fade pipeline drops them from the final framebuffer). Cost
  hours during Phase 3 to discover. Symptom: layout/log fires correctly,
  no mesh visible. **Don't go down the renderOrder / frustum-culling /
  sphereGeometry rabbit hole — try `transparent` first.**
- React `useMemo` dep-array gotcha: when adding a new dependency to a
  useMemo, verify by line number which useMemo's dep array you're
  editing — multiple in the same file can have nearly-identical shapes
  (`[ribbons, layerColors, useBoundary, ...]`). Phase 1 of the slider
  silently failed for ~30 minutes because I added `cornerRadiusScale`
  to `pathRibbons`'s deps instead of `meshes`'s.

---

## 2026-04-26 (evening) — Path B Phase 4 SHIPPED (derive consumes phase metadata)

Implemented in this session, on top of Phases 1+2+3:

1. **Skeleton: stable `pairKey` per divided pair.** `analyzePhases`
   already had pair info via `partner: B.osmId`. Promoted that into a
   stable key (`min-max` of the two OSM ids) attached to each
   classified fragment as `c.pairKey`. Both A and B fragments of a
   pair carry the same key.

2. **Welder gates on `(signature, pairKey)`.** Previously the welder
   gated only on signature, so two `divided-A` fragments from
   *different* pairs in the same corridor (Lafayette has 4 A-pairs)
   could weld together if their endpoints happened to coincide. That
   silently fused pair structure. New gate keeps each pair's A and B
   chains separate end-to-end. PairKey threads through `weldChains`
   pool entries and survives extension because the seed chain's
   pairKey carries through.

3. **Skeleton emits `phase.pairKey`** per chain. Joins `kind`, `role`,
   `corridorName`, `startNode`, `endNode` already there.

4. **`ribbonStreets` in derive carries `phase` through** (single line
   added to the construction loop — the earlier omission was the bug
   that silently broke first-pass pairing).

5. **Derive: one corridor pass replaces three.** Deleted ~325 lines:
   the geometric divided-pair detection (`meanPerpDistance` +
   `tanDot < -0.6` + `MEDIAN_MAX_MEAN_GAP=30`), the edge-key oneway
   pair logic inside `buildCorridors`, and the `offsetPolyline` /
   `avgTangent` / `meanPerpDistance` helpers. New ~150-line block
   does endpoint clustering once per corridor name, fills pair slots
   by `phase.pairKey`, walks the node graph for ordering, and emits
   `corridors[]` + `dividedPairs[]` + `medians[]` + anchor stamping
   from the same data.

6. **Skeleton: deleted `splitAtFolds`, `dropShadowedChains`,
   `nearestOnPolyline`.** All three were workarounds for pair-blind
   welding. PairKey gating obviates them — verified visually and by
   chain count.

7. **Dropped `medians[].meanGap`** from the ribbons output. No
   consumer in `src/`. Per the "fix things properly, no patches"
   directive — vestigial fields shouldn't linger.

### Counts (this session)

| Metric | Before P4 | After P4 |
|---|---|---|
| carriageway-A chains | 17 | 23 |
| carriageway-B chains | 17 | 23 |
| Emergent medians | 6 | 23 |
| `anchor='inner-edge'` chains | 0 (silent failure) | 46 |
| Pinch transitions | 0 (not detected) | 18 |
| Total ribbon chains | 154 | 182 |

The +6 carriageway pairs come from pairKey gating revealing pair
structure the old welder was hiding. The +28 ribbon chains are the
cost; they show as visible seams at phase transitions until Phase 5
knits them. Mid-state is structurally correct, visually rough — same
trade as Phase 2.

### Operational lessons (save these)

- **`pipeline.js` does NOT run `skeleton.js`.** They're separate
  scripts. After editing skeleton, run `node skeleton.js` first,
  then `node pipeline.js`. I lost a debug cycle to a stale
  skeleton.json this session before catching it. The fix is workflow,
  not code: think of skeleton + pipeline as a two-step build.
- The first attempt at Phase 4 produced 0 medians and 0 anchored
  chains. Cause: `ribbonStreets.push(...)` was dropping `phase`. Easy
  miss. Future refactors that thread new fields from skeleton through
  derive should sanity-check the construction loop *first*.

### Phase 5 pickup pointer

Phase 5 (knitting) renders geometry across the 18 pinch transitions.
At single→divided, median grass opens as a wedge from zero to full
gap; at divided→single, it tapers back to zero. The
`corridors[].transitions[]` array in `data/clean/map.json →
layers.ribbons` lists every seam location with `at: {x,z}`,
`from`/`to` phase kinds, and a `pinch` flag.

Read order:
1. This entry.
2. `src/components/StreetRibbons.jsx` line ~703 (main fills per-chain loop).
3. `cartograph/derive.js` "Corridors, divided pairs, medians,
   anchors" block — phase data shape that ribbons consume.
4. Memory: `project_phase_aware_skeleton_emission.md`.

Implementation candidates: "merge plug" geometry analogous to corner
plugs, or extend insert-coupler taper logic. Phase 5 is visual
iteration; budget at least one full session.

---

## 2026-04-26 PM (later) — Path B Phases 1+2+3 SHIPPED ("split traffic" works)

Implemented in this session:

1. **Phase 1 — Pre-weld phase analyzer** (`skeleton.js` `analyzePhases`,
   commits `613a6ff` + `6d7045c` tuning). Per name group, classify each
   raw OSM fragment as `divided-A` / `divided-B` / `single-oneway` /
   `single-bidi`. Detects antiparallel oneway pairs by symmetric mean
   perpendicular distance ≤ 60m **and** length ratio ≥ 0.5 **and**
   tangent dot ≤ −0.6, with best-partner resolution (sort all candidate
   pairs by gap ascending, claim greedily).

   Tuning notes: original 30m gap + greedy first-match + asymmetric
   mean-perp let connector stubs lock out same-length carriageway mates.
   Truman Parkway's main 361m carriageway pair sits at symmetric-max
   54m gap, so threshold went to 60m, paired with the length-ratio
   filter to block stub abuse.

   Validation: Lafayette 22 ways → 4 hidden divided pairs surfaced;
   Jefferson 19 ways → 4 (vs the 2 today's `splitAtFolds` recovers
   from a lucky fold). Truman 1 → 3 pairs.

2. **Phase 2 — Phase-aware welding** (commit `78f78bd`, after a
   revert+reinstate dance). `weldChains(fragments, signatureByOsmId)`
   gates every weld on signature equality — `divided-A` only fuses
   with `divided-A`, `single-bidi` only with `single-bidi`, etc.
   This removes the splice bridges where bidi connector fragments at
   intersections previously fused opposing-direction carriageways into
   one super-chain (the Lafayette 22→1 collapse).

   Result: Lafayette 1 → 10 chains (4 divided pairs + 12 bidi
   connector stubs as singletons + 2 unpaired oneway). Jefferson 4 → 8.
   Total streets 123 → 154. **Visible payoff: divided carriageways
   now render as separate parallel ribbons in Designer / Survey.**
   Operator confirmed "we have split traffic."

3. **Phase 3 — Skeleton emits phase metadata** (commit `d6a3c42`).
   Each emitted street carries:
       `phase: { kind: 'single' | 'divided',
                 role: 'spine' | 'carriageway-A' | 'carriageway-B',
                 corridorName, startNode: {x,z}, endNode: {x,z} }`
   Pure data addition. Existing consumers select fields explicitly
   and ignore the new property. Counts: 120 single/spine, 17
   carriageway-A, 17 carriageway-B.

### What still bites mid-Path-B

- **Visible breaks at phase transitions.** With Phase 2 producing
  separate chains for connectors and carriageways, ribbon emission
  (still per-chain, no stitching) leaves visible joins. Phase 5's
  knit step closes these. Mid-state is structurally correct, visually
  rough.
- **Derive still does its own divided detection** (`buildCorridors`,
  `meanPerpDistance`, `innerSign`, `pairId`, `medians`). Phase 4 is
  the rewrite to consume `street.phase` directly and delete that
  whole block plus `splitAtFolds` and `dropShadowedChains` in
  skeleton.

### Operational lesson worth saving

Mid-session the operator reported "no centerlines in Survey, Measure
controls dead, streets look the same." I leapt to a structural
diagnosis (ID churn from Phase 2) and reverted. The actual cause:
**`serve.js` was not running on port 3333.** Vite proxies
`/api/cartograph/*` to localhost:3333 and every fetch was returning
the proxy's connection-refused stub. Reinstating Phase 2 after
restarting `serve.js` worked immediately.

Lesson for next session: when Survey/Measure data goes blank,
**check `lsof -i :3333` first**. If nothing's listening, run
`node serve.js` (background) and reload the browser.

That said, the dependent-map I sketched during the (incorrect) revert
is real and will matter when Phase 4 ships:
- `src/data/ribbons.json` (681KB, dated Apr 25, hand-curated /
  no in-tree writer found) is bundled into the React app and consumed
  by `StreetRibbons.jsx`, `MapLayers.jsx`, `MeasureOverlay.jsx`,
  `MeasurePanel.jsx`, `useCartographStore.js`. Its `streets[].skelId`
  values follow the OLD chain-ID scheme. If Phase 4 (or any later
  refactor) shifts what ribbons.json should contain, we need to find
  or rebuild the producer.
- `useCartographStore._loadCenterlines` matches legacy intent by
  `name` — for Lafayette's 10 chains, only one inherits authored
  intent.
- `corridorByIdx` reads `ribbonsData.corridors[].phases[].chainIds`
  — those IDs correspond to the OLD welding output. Already
  silently empty after Phase 2.
- `overlay.json` is `skelId`-keyed; rewelded streets orphan their
  authored intent. Migration needs to map old IDs → new by name +
  geometry overlap, OR we accept loss for re-welded streets.

### Phase 4 pickup pointer (start of next session)

Read order:
1. This entry.
2. `cartograph/skeleton.js` lines around 379–530 (main, emit site,
   makeStreet) for the phase metadata shape now in skeleton.json.
3. `cartograph/derive.js` lines 2580–2870 (`buildCorridors`,
   `meanPerpDistance`, `medians` emission, `innerSign`/`pairId`
   pass) — this is what Phase 4 deletes/rewrites to consume
   `street.phase` directly.
4. `src/data/ribbons.json` schema — what fields derive currently
   emits and ribbons-consumers depend on. Phase 4 must preserve
   that contract OR coordinate a shape change with the React side.
5. `src/cartograph/stores/useCartographStore.js` `_loadCenterlines`
   — ID-keyed lookups likely to need updating once chain IDs shift
   (which they already have under Phase 2; verify).

Phase 4 is the bigger refactor and deserves a fresh context window.

---

## 2026-04-26 PM — over-welding diagnosed, Path B (phase-aware emission) chosen

**Drove this entry:** operator looked at Jefferson + Lafayette in Measure
mode and noted they show ONE blue centerline despite being divided in
reality. Rather than chase it as a render-visibility issue, we stripped
back to OSM source data. The finding turned a render-side hypothesis
into a structural/architectural one.

### The data finding

| Street | OSM ways | Skeleton chains | Notes |
|---|---|---|---|
| South Jefferson Avenue | 19 | 4 | Mix oneway + bidirectional. Lane counts 1–7. One has explicit `turn:lanes='left\|none\|none\|right'`. |
| Lafayette Avenue | 22 | 1 | 17 oneway + bidirectional ways collapsed into one 2,292m chain. Divided structure entirely lost. |

Skeleton inspection of Jefferson:
- chain-0: 1086m, 6 OSM ways, oneway. Single, NOT detected as divided.
- chain-1: 844m, 5 OSM ways, oneway. Single, NOT detected as divided.
- chain-2: 168m, 4 OSM ways  ┐ paired (welded super-chain folded → splitAtFolds caught it)
- chain-3: 166m, 4 OSM ways  ┘

Of Jefferson's 4 chains, only -2/-3 were tagged as divided — and only
because they happened to fold across themselves during welding, which
`splitAtFolds` then caught. The other 1086m + 844m sections have just
as much divided geometry in reality but their OSM ways didn't fold
during welding, so they stayed as single chains.

**Lafayette is the smoking gun.** No fold occurred during welding (the
17 ways stitched cleanly tail-to-head), so all bidirectional + oneway
fragments collapsed into one polyline running approximately down the
median. The divided pairs the OSM data clearly contains never become
separate chains.

### Why this happens — `skeleton.js` weldChains

The current welder allows any tail-to-head weld, including across
oneway↔bidirectional boundaries. It only forbids FLIPPED welds when one
side is oneway. The "bidirectional connector fragments" at intersections
where carriageways merge act as bridges that splice opposing-direction
oneway carriageways into one super-chain. `splitAtFolds` catches the
180° bend cases (Jefferson -2/-3) but misses the cases where stitching
is geometrically clean (Lafayette).

### Why we can't just make the welder stricter — the ribbon constraint

Ribbon emission in `StreetRibbons.jsx` (line 703 main fills loop, plus
edge strokes + face-clip + caps) operates **per chain**. Each chain
emits its own asphalt + curb + treelawn + sidewalk strips. Caps fire at
each chain's start/end. **There is no stitching between chains** — chain
boundary equals ribbon boundary.

That's why the welder is aggressive: making every road one chain is the
only way the ribbon comes out continuous. The "unified centerline"
strategy isn't a mistake; it's the consequence of how rendering works.

### The three paths considered

**Path A — Stricter welder.** Forbid welds across `oneway` ↔
bidirectional. Result: more chains per road, including isolated
connector stubs at intersections. Ribbons gain visible breaks at every
chain endpoint. Quick to implement. **Rejected — fragile visually.**

**Path C — Manual operator override.** Keep over-welding in skeleton;
operator manually adds couplers + flips `anchor` on chains where
auto-detect missed it. Smallest code change. **Rejected — patch-shaped
and we're past patches.**

**Path B — Phase-aware emission. CHOSEN.** Restructure: skeleton emits
chains per phase. Derive consumes existing phase data. Ribbons gain a
"knit at phase boundary" rule. Architecturally correct; the long-term
shape that matches `project_positive_carriageway_model` ("two
centerlines per divided road, median emergent").

### Path B — comprehensive plan

Goal: every street = a corridor of one or more **phases**. Each phase
emits its own chain(s):
- **Single phase** → 1 chain. Continuous ribbon, two-sided cross-section.
- **Divided phase** → 2 chains (one per carriageway). Two parallel ribbons.
- **Transition node** between adjacent phases is an explicit knit point;
  ribbons join cleanly there (single-phase ribbon merges into two
  parallel divided ribbons, or vice versa).

#### Phase 1 — Skeleton phase analyzer (BEFORE welding)

In `cartograph/skeleton.js`, before `weldChains`:

1. Group OSM ways by name (already done).
2. Within a name group, identify **divided pairs**:
   - Two oneway ways running antiparallel between the same two nodes.
   - Mean perpendicular distance < ~30m (already in derive's
     `meanPerpDistance` logic, move it here).
3. Identify **single-phase fragments**: bidirectional ways, or
   unpaired oneway ways.
4. Identify **transition nodes**: any node where the phase kind changes
   (e.g., bidirectional way ends and a divided pair begins).

Output: a phase decomposition per name — a list of phases ordered
along the corridor's spine, with explicit transition points.

#### Phase 2 — Phase-aware welding

In `weldChains`:

1. Weld within a phase only, not across phases.
   - Single phase → all ways in that phase weld into one chain.
   - Divided phase → ways group by oneway direction; each direction
     welds into its own chain. Output: 2 chains per divided phase.
2. Forbid welds that would cross a transition node.

Output: one chain per phase per direction.

#### Phase 3 — Skeleton emits phase metadata

Each emitted chain carries:
- `id` (existing).
- `name` (existing).
- `oneway` (existing).
- `phase: { kind: 'single' | 'divided', corridorName, role: 'spine' | 'carriageway-A' | 'carriageway-B', transitions: { startNode, endNode } }`.

#### Phase 4 — Derive consumes skeleton's phase info

`derive.js` `buildCorridors` is rewritten to read phase metadata from
skeleton instead of inferring it from welded chain endpoints. Existing
`anchor: 'inner-edge'`, `innerSign`, `pairId` emission still works —
just driven by skeleton's phase info, not derive's after-the-fact
detection.

`splitAtFolds` and `dropShadowedChains` in skeleton are deleted (no
longer needed — the phase analyzer handles separation correctly
upstream).

#### Phase 5 — Ribbon emission with phase-boundary knitting

`StreetRibbons.jsx` main fills loop stays per-chain BUT adds knitting:

At a phase transition node:
- If single → divided: the single chain's endpoint cross-section needs
  to morph into the two divided chains' starting cross-sections.
  Geometrically: the single ribbon "splits" at the node, with the
  median grass appearing as a wedge that opens up.
- If divided → single: inverse — two parallel ribbons converge into
  one centered ribbon, median tapers to zero.
- If single → single (different cross-section): the existing ribbon
  joint suffices; cross-sections share the transition node's
  perpendicular and meet cleanly.
- If divided → divided (different cross-section): each carriageway's
  ribbons join independently at the transition, paired together.

Implementation candidates:
- "Merge plugs" — geometry similar to corner plugs at intersection
  nodes, built at phase transitions to fill the join.
- Or: extend the cross-section taper logic that insert-couplers
  (medians) already use, applying it across phase boundaries.

#### Phase 6 — Emergent grass median + merge points (was Step C)

Once phase-aware ribbons emit, the median between paired carriageways
is the polygon between their inboard pavement edges within a divided
phase. At each transition node where divided meets single, the median
polygon closes (pinches) at the transition point. This is what was
queued as Step C of the inner-edge work; it lands naturally on top of
the phase-aware ribbon system.

### What carries forward from current work

Keep:
- `streetProfiles.innerEdgeMeasure` (zeros inboard treelawn/sidewalk for
  inner-edge chains). The cross-section model is independent of how
  chains are produced.
- `StreetRibbons.inboardPedZoneless` wrapper.
- `MeasureOverlay.selection` using `innerEdgeMeasure`.
- Ordinal-keyed `segmentMeasures` and couplers.
- Overlay file persistence.
- `setAnchor` action (operator override stays).
- Tool-scoped translucency.

Adapt:
- `derive.js` divided-pair detection (`innerSideSign`, `pairId`,
  `meanPerpDistance`) — most logic moves to skeleton, derive consumes.
- `derive.js` `buildCorridors` — driven by skeleton's phase metadata
  rather than detecting from welded chain topology.

Discard:
- `splitAtFolds` (skeleton.js).
- `dropShadowedChains` (skeleton.js).
- Derive's after-the-fact divided detection at lines ~2640–2730.

### Open issues this Path B fix INHERITS (still need addressing after)

- **Auto-survey `pavementHW` values are wrong** for current divided
  chains (Truman 2m, S 14th 5.35m, Park Ave 5.65/6.07m, S Jefferson
  7.72/9.16m). Operator re-measure all 8 inner-edge chains plus any
  newly-detected ones once Path B emits them.
- **Royal-blue authoring centerline visibility** over asphalt. Last
  attempt at depth/render-order fix didn't resolve. Path B doesn't fix
  this directly — still needs the visibility tweak. Top suspect: copy
  MapLayers' yellow-stripe material pattern (`MeshStandardMaterial`,
  `polygonOffsetFactor: -14`, `polygonOffsetUnits: -56`).
- **Loop streets** (Benton, Mackay) still need closed-polyline detection
  for inner-edge anchoring.
- **Corner plug shape at oblique IXes** — still open from 2026-04-24.
- **12 legacy `centerlines.json` measure overrides** — chains flipped
  by 2026-04-25 direction normalization may have left/right swapped.

### Pickup order for next session

1. Phase 1 + 2 (skeleton phase analyzer + phase-aware welding). The
   most invasive single change. Verify by running pipeline and counting
   chains per name — Lafayette should produce ~5–8 chains spanning
   single + divided phases instead of 1.
2. Phase 3 + 4 (skeleton emits phase metadata, derive consumes). Mostly
   plumbing; existing `anchor`/`innerSign`/`pairId` stays the same shape.
3. Phase 5 (ribbon knitting). The hardest part — needs visual iteration.
   Start with the simplest case (divided → single transition where
   carriageways converge) and validate before generalizing.
4. Phase 6 (emergent median polygon + merge points). Step C in the
   prior plan; trivially follows from phase 5.
5. Loop back: re-measure the now-correctly-detected divided chains,
   address the centerline visibility issue, etc.

### Memories to update before next session

- New project memory: `project_phase_aware_skeleton_emission.md` —
  scope of Path B, the data evidence, plan with phases, what carries
  forward.
- Update `project_inner_edge_anchor_in_flight.md` to note the model
  pivot: anchor detection moves from derive (after-the-fact) to
  skeleton (by-construction). Inboard-zoneless cross-section stays.
- Cross-reference from `project_positive_carriageway_model.md` →
  the Path B plan IS its concrete implementation.

---

## 2026-04-26 session (in progress) — inner-edge anchor for divided carriageways: Step A shipped, Step B pivoted, render visibility blocker

**Drove this session:** operator asked for "centerlines offset to the
inside" on split-traffic streets so ribbons emit outward, plus all main
roadways must have visible clickable centerlines. Pickup followed the
3-step plan from `project_inner_edge_anchor_in_flight.md`.

### Step A — auto-detect anchor (SHIPPED)

`derive.js` walks `corridors`, marks each chain in a `kind: 'divided'`
phase with `anchor: 'inner-edge'`, `innerSign`, and `pairId`. Re-runs
`pipeline.js` to refresh `ribbons.json`. Detected 8 chains in current
data: truman-parkway-0/1, south-14th-street-0/1, park-avenue-1/2,
south-jefferson-avenue-2/3.

Store `_loadCenterlines` reads ribbons.json via `ribbonById` lookup;
operator override (in overlay file) wins over auto-detect.
`_autoAnchor` tracks the auto value so persistence only writes anchor
when overridden. `setAnchor` action exposed.

`SurveyorPanel` got an Anchor dropdown (Center / Inner-edge). Disabled
when `innerSign === 0` (no paired chain detected).

### Step B — model PIVOT (operator-driven)

Initial Step B shape: visible centerline OFFSET to inner edge +
synthetic one-sided cross-section (outboard absorbs `inbHW + outbHW`,
inboard zeroed). Polyline shifted, perps recomputed, handles anchored
on offset.

Operator pushed back: "each roadway gets a centerline, and I will have
to manually go thru and correctly expand the center out in both
directions." Even for one-way split traffic.

**Pivoted to simpler model:**

- Chain stays at carriageway center. No offset polyline.
- Visible blue centerline = chain.
- Click hit-test on chain.
- Cross-section authored two-sided (pavement + curb both sides). For
  inner-edge chains, the inboard ped zone (`treelawn`, `sidewalk`,
  `terminal`) is zeroed; pavement + curb stay. Outboard keeps full stack.
- Median grass shows naturally between paired chains' inner pavement
  edges (Step C will replace the existing `ribbons.medians` lens with a
  cleaner runtime polygon).

The pivot ripped out:
- `applyInnerEdgeAnchor` (offset + synth pavement).
- Polyline shifting in MeasureOverlay's `centerlineMeshes` and click
  hit-test.
- Anchor shift in `MeasureOverlay.selection` memo.
- Offset rendering in `SurveyorOverlay`.

Replaced with:
- `streetProfiles.innerEdgeMeasure(baseMeasure, innerSign)` — returns
  base measure with inboard `treelawn`/`sidewalk` zeroed and `terminal: 'none'`.
- `StreetRibbons.inboardPedZoneless(street, baseMeasure)` — wrapper used
  in main fills, edge strokes, and face-clip per-segment loops.

### OPEN BLOCKER — blue authoring centerlines invisible over asphalt

Operator reports MeasureOverlay's royal-blue centerlines aren't visible
over the dark asphalt of any street, only at chain ends extending past
the asphalt onto lighter ped-zone backgrounds. Likely depth/render-order
issue: asphalt has `polygonOffset: -8 / -32` shifting it toward the
camera, and `meshBasicMaterial` opaque queue doesn't strictly respect
`renderOrder`.

Tried this session:
1. `transparent + depthTest:false + depthWrite:false + renderOrder:140`.
   Result: still invisible over asphalt.
2. `polygonOffset: -200 / -800`. Result: blue gone entirely on divided
   roads — likely past the near plane.
3. **Currently set:** `transparent + opacity:1 + polygonOffset: -30 / -120 + depthTest:false + depthWrite:false`.
   Plus a per-divided-chain diagnostic in `centerlineMeshes`. Operator
   went to sleep before testing.

**Next-session pickup:**
- Read the diagnostic to confirm two chains per divided road are emitted.
- If two chains emit but only one shows visually → still depth issue.
  Try matching MapLayers' yellow-stripe pattern exactly (`MeshStandardMaterial`,
  `polygonOffsetFactor: -14`, `polygonOffsetUnits: -56`). Yellow stripes
  work, so the proven pattern should too.
- Or render via R3F `<Line>` primitive instead of extruded ribbon.

### Color separation (clarified)

Two distinct line systems — don't conflate:
- **Yellow road stripes** = real road paint, rendered by `MapLayers`
  from `centerStripe` data. One per two-way road; none on divided.
  Part of the final map's visual story.
- **Royal-blue authoring centerlines** = `MeasureOverlay`/`SurveyorOverlay`,
  visible only with a tool active. One per chain (so two on each
  divided carriageway). Pure click target.

### Data quality finding

Auto-survey populated `pavementHW` for the 8 inner-edge chains using
OSM `width`/heuristics; the values aren't real per-carriageway
half-widths. Truman shows 2m where reality is ~10m (6 lanes ÷ 2). All 8
need operator re-measurement once Step B verifies visually. The new
authoring model (chain at center, drag both sides) makes this a
straightforward exercise.

### Three-step plan status

| Step | Status |
|------|--------|
| A. Auto-detect anchor + Survey toggle | SHIPPED |
| B. Inboard-zoneless cross-section | CODE LANDED, awaiting visual verify (blocked on render visibility) |
| C. Emergent grass median polygon | Not started |

### Memories updated

- `project_inner_edge_anchor_in_flight.md` — pickup-point for next session.

---

## 2026-04-25 session — couplers go live: chain direction normalized, segment-keyed measures, by-id chain merging

**Drove this session:** operator reported couplers "twisting" the ribbon and
edits leaking onto offset chain links. Diagnosis exposed three independent
bugs all rooted in the chain↔segment↔measure plumbing being only
half-built. Goal became: make couplers work end-to-end and lock down the
direction/identity invariants so future authoring isn't fragile.

### The four root problems we untangled

1. **Chain direction was arbitrary.** `skeleton.js` welded fragments and
   kept whichever orientation seeded the chain. Adjacent same-name chains
   could flow opposite ways, so Measure's "left" of chain A landed on
   the same physical side as "right" of chain B. Per-segment perpendicular
   computation flipped at chain joints, causing the centerline-visibility
   flicker on rebuild.

2. **Live merge keyed by name.** `StreetRibbons` matched `centerlineData`
   entries to `ribbons.json` streets by `name`. Mississippi (and every
   divided road) emits multiple same-name chains, so live edits to one
   chain landed on the other carriageway in the merge. Symptom: edits in
   segment X "affected offset chain links."

3. **Skeleton vs. ribbons polylines have different point counts.**
   `derive.js` splices intersection vertices into ribbon polylines, so
   Mississippi has 21 skeleton points but 28 ribbon points. Couplers and
   `segmentMeasures` keyed by point-index ranges (`"0-20"`) didn't match
   render-side ranges (`"0-27"`). The drag wrote to the wrong key, the
   renderer looked up the wrong key, stripes refused to follow the
   handles. Handles moved (read from skeleton store directly), fills
   didn't (read by mismatched range key, fell through to default).

4. **Selection translucency leaked across tools.** Selecting a chain in
   any tool dropped its opacity to 0.15 for aerial alignment. The dim
   stuck around when the user changed tool to null because
   `selectedCorridorNames` was set whenever `selectedStreet` was set,
   regardless of `tool`.

### Shipped (all kept in code, do NOT revert)

1. **Canonical chain direction in `cartograph/skeleton.js`** (just before
   the simplify pass write-out). Non-oneway chains are oriented so the
   dominant component of `(last - first)` is positive. Oneway chains are
   left alone (their direction is the direction of travel). Pass logs
   `flipped N non-oneway chain(s)` — currently 50 of 93. This is the
   load-bearing fix that makes `measure.left` mean physical-left
   everywhere.

2. **Couplers carry world coords.** `useCartographStore.toggleCoupler`
   stores `{ kind: 'split', pointIdx, x, z }` rather than a bare index.
   `streetProfiles.segmentRangesForCouplers(pts, couplers)` projects
   each coupler's `(x, z)` onto whichever polyline you pass — skeleton
   in `MeasureOverlay`, ribbons in `StreetRibbons`. The function
   accepts the legacy `(pointCount, couplers)` signature for back-compat.

3. **`segmentMeasures` keyed by ordinal**, not point-index range.
   `"0", "1", "2"` rather than `"0-7", "7-14", "14-22"`. Ordinal keys
   are stable across coordinate systems (skeleton vs. ribbons), so the
   key the drag writes is the same key the renderer reads.
   `measureForSegment(street, ordinal)` is the single read point.
   `setSegmentMeasure` migrates ordinals on coupler add/remove (split
   one ordinal into two, or merge two adjacent into one).

4. **Live merge by `skelId`.** `derive.js` now emits `skelId: st.skelId`
   on each ribbon street. `StreetRibbons`'s three merge sites
   (main fills, edge strokes, face-clip) build `liveById` from the
   centerline store and `lookupLive(st)` prefers `skelId` match, falls
   back to `name`. Mississippi's two carriageways are now independent.

5. **Survey: Ctrl/⌘-click an interior node to toggle a coupler.**
   `SurveyorOverlay` renders coupler nodes as orange diamonds (regular
   nodes stay white circles). `SurveyorPanel` shows live coupler/segment
   count + the gesture hint.

6. **Measure: per-segment selection.** Click resolves to the segment
   under the projection (`resolveSegmentOrdinal`). Drag, dblclick-insert,
   right-click-delete all scope to that segment. `MeasurePanel` shows
   "segment N of M" when applicable; Reset clears the segment override.
   Empty click off any centerline accepts changes (deselects). Enter
   key also accepts. Esc still works.

7. **`StreetRibbons` per-segment fills + corner plugs.** Main fills,
   edge strokes, caps, corner plugs, and face-clipping all walk segments
   per chain. Corner plug picks up `measureForSegment` for whichever
   segment of each leg contains the intersection.

8. **Translucency scoped to active tool.**
   - Selected corridor in **Measure** → 0.55 (see edits land while
     aerial reads through).
   - Selected corridor in **Survey** → 0.15 (silhouette + alignment).
   - Survey, unselected → 0.28.
   - **Measure, unselected → 1.0** (only the chain you're editing dims).
   - Default (no tool) → 1.0.
   `selectedCorridorNames` in `CartographApp` is gated on
   `tool && inDesigner`, so leaving the tool restores opacity even if
   `selectedStreet` is still set in the store.

### Data shape (current ground truth)

A street in `centerlineData.streets[i]`:

```
{
  id, name, type, oneway, points, divided,
  measure: { left, right, symmetric },               // chain default / fallback
  segmentMeasures: { "0": {...}, "1": {...}, ... },  // ordinal-keyed overrides
  capStart, capEnd,
  couplers: [{ kind: 'split', pointIdx, x, z }, ...],
}
```

A street in `ribbons.json`:

```
{
  skelId,           // matches centerlineData.streets[i].id
  name, points, measure, capEnds, intersections: [...]
}
```

Read order for resolving the effective measure of a segment ordinal:
`segmentMeasures[ord]` → `street.measure` → pipeline-derived → type default.

### Still open

- **Couplers + segmentMeasures are in-memory only.** Edits evaporate on
  reload, same as caps + chain measure. Persistence comes when the
  overlay file lands. Skeleton owns geometry; the overlay file will own
  caps, couplers, and segmentMeasures.
- **Median (insert) coupler + split coupler in same chain not tested.**
  Code paths are independent so it should work but no current data
  exercises both at once.
- **12 legacy `centerlines.json` measure overrides may be cross-wired**
  if their chain was among the 50 flipped by direction normalization.
  Names: Dolman, Mississippi, S. Jefferson, Missouri, Rutger, +7. Easier
  to redo by hand in Measure than to auto-swap.
- **Corner plug shape at oblique IXes** (the 2026-04-24 problem) is
  unaffected by this session — still open. See that entry below.

### Memories updated

- `project_divided_roads_architecture.md` — defers to the
  positive-carriageway model + segment primitive.

---

## 2026-04-24 evening session — corner plug deep dive: lookup fix landed, geometry still unsolved

**Drove this session:** prior session left corner plugs as the singular
priority. Goals: generate plugs at every IX (was missing ~50% at oblique),
fix undersizing, make non-right angles bulletproof.

### Shipped (kept in code, do NOT revert)

1. **IX-lookup fix** in `src/components/StreetRibbons.jsx:647-678`. Root
   cause: `derive.js:2415` shifts `ix.streets[].ix` by *name* during splice,
   not by chain identity. Multi-chain corridors (Lasalle ×5, Park Ave ×4,
   etc.) corrupt each other's IX-level indices. Chain-internal
   `st.intersections[].ix` is still correct — shifted per-chain.
   Runtime fix: `find()` now uses point proximity to `ix.point` plus the
   partner-name witness, ignoring the broken ix-level index. Diagnostic:
   99/183 → 183/183 cross-street pairs resolve. ~80 missing plugs recovered.

2. **R = treelawn + sidewalk** (operator's option ii). `plugSwWidth` uses
   full outside-curb width, not just the sidewalk stripe. Reads at ADA
   ramp scale (~3 m here vs ~1 m before).

### THE open problem — plug shape at oblique IXes (acute *and* obtuse)

Test case: Mississippi × Park (~69°/111° interior). Right-angle IXes look
fine. Oblique IXes show two artifacts:

- **Acute (~70°) sectors:** plug renders as a thin spike / tongue.
- **Obtuse (~110°) sectors:** small "tooth" where plug curb meets leg
  curb. Initially appeared correct at one set of measure values but
  re-measuring exposed the fragility — shape depends on coincidence,
  not on robust geometry.

Both stem from the same root: the parallelogram-overlap geometry
implicitly assumes 90° corners. The plug's leg-end cross-sections sit
on each leg's *parallel* offset line (parallel to leg A or leg B),
while the leg arms terminate on the *perpendicular* at IX. Those lines
coincide at 90° and diverge at every other angle.

### Approaches tried this session — all reverted, do NOT re-try blindly

1. **Property-line outer envelope.** Helped obtuse, broke acute.
2. **Acute-only tangent push-out** (`R · cot(θ/2)`). Curb width became
   inconsistent — coA/coB didn't move with swA/swB.
3. **Lockstep extension** of swA, swB, coA, coB, swA_outer, swB_outer.
   Curb width fixed but plug *shape* still wrong.
4. **Chord-midpoint apex at acute** (drop propCorner when θ < 90°).
   No visible change — wrong target.
5. **Multiplicative clearance `R = 0.85 × min`.** Operator: "Wrong
   approach. Please revert."
6. **"Concentric arcs with control at IX" rewrite.** Plug bounded by
   propCorner (outer) and asph corner (inner), sides on leg perps at
   IX, two false-curb arcs at curb-outer / asph-outer levels. Operator
   final screenshot: NO plug visible at all — broken.

### Operator's mental model (verbatim & confirmed)

- 4 corners of plug come from **ribbon-overlap intersections per IX**,
  not centerlines, no global formula.
- Diagram points: **1** = where leg A's outer edge meets leg B's outer
  edge; **2, 4** = extension of one ribbon width from 1 along each
  leg's outer line; **3** = bezier midpoint between 2 and 4.
- **Arc bows toward IX.**
- "If the shape is squashed, the arc gets squashed" — operator accepts
  oblique shearing in principle.
- "Curb in the plug should exactly meet curb on both legs."
- "Plug outer corner = property-line corner; inner corner = asph corner."
- "No treelawn in the plug; treelawn butts up to sidewalk."

The tension: points 1/2/4 in the parallelogram-overlap model use sw-outer
offset lines (= `oo`, `swA`, `swB` in code). But operator's "outer corner =
property-line corner" wants `oo` to be at propLine, not at curbOuter+R.
For asymmetric IXes these differ. Several attempts to use propLine corner
broke acute sectors. **Unresolved.**

### Where the code lives

- Plug build: `src/components/StreetRibbons.jsx` ~lines 717–803, inside
  the `meshes` useMemo.
- Cross-section data: `src/cartograph/streetProfiles.js` `refEdges()` and
  `sideToStripes()`.
- Render: `StreetRibbons.jsx` ~line 1311 (`{!surveyActive && meshes.map(...)}`).

### Required reading before next session

1. `feedback_corner_arc_rules.md`
2. `project_corner_plug_rules.md`
3. `project_corner_plug_open_problem.md`
4. `feedback_plug_is_angle_aware.md`
5. `feedback_no_global_fixes.md` — operator reminded of this several
   times this session.
6. **The "Approaches tried" list above** — every dead-end so far.

### Loose ends still from prior session

Still unresolved: `MapLayers.jsx:95` color=undefined warning,
`PlaneGeometry` NaN bounding sphere warning. One-line fixes when grepping.

---

## 2026-04-24 session — runtime face clip + Measure wireframe, corner plugs left as the open problem

**What drove this session:** ribbons were updating live on Measure handle
drags but everything around them (block faces, decorations, corner plugs)
either stayed frozen at pipeline-time widths or rendered incorrectly.
Three specific deltas shipped today; the corner plug shape is the
remaining open problem and is the *singular* next-session priority per
the operator: "every corner must be managed."

### Shipped this session

1. **Runtime face clip (live block reshape).** Removed the face-fill
   pre-clip from `cartograph/derive.js`. Added a `clippedFaces` useMemo
   in `src/components/StreetRibbons.jsx` that re-clips face polygons at
   render time using `clipper-lib`. Per-side independent ribbon offsets
   (NOT min(L,R)) so widening one side actually moves the face on that
   side. Debounced 120 ms via `stableLiveCenterlines` so drag stays
   responsive while faces settle a beat after release. Unclipped faces
   in `ribbons.json`; runtime is the only clip path now.

2. **Measure tool wireframe.** `edgeStrokes` now emits a stroke at
   *every* ring boundary (was pavement edge + property line only). The
   6″ curb now reads as a clearly visible 15 cm gap between two hard
   lines instead of a 1px-wide invisible fill. Plus `decorationsHidden`
   in `src/cartograph/CartographApp.jsx` now hides
   alleys/footways/lamps/stripes/edge-lines/bike-lanes/center-stripes
   any time Fills is OFF in Designer (was only in `designAerialOnly`),
   so Measure + Fills OFF leaves only aerial + ribbons + handles.

3. **Aerial bumped to z=19** in `src/cartograph/AerialTiles.jsx`.
   Doubles pixel density for handle/curb visual alignment. Watch for
   dark tiles in some areas — old comment warned of that; add a z18
   fallback if it recurs.

### E.A.1–3 (carried over from prior session) — DONE

- Park Avenue ribbon fills, Measure-drag mesh invalidation, and
  corner-plug bucket routing all fixed by the same edit:
  `selectedCorridorNames` added to `meshes` deps; corner-plug code now
  sets `activeGroups` per-intersection (selected if either meeting
  street is in the corridor) and pushes through `activeGroups[...]`
  instead of `groups[...]` directly. The crash that was nuking the
  whole `meshes` useMemo for certain selections is gone.

### Stencil mask attempt — REVERTED, do not re-litigate

Briefly tried a stencil-buffer face mask (mask mesh writes bit 1, face
materials read NotEqual). Aerial broke; cause un-diagnosed. Runtime
clipper-lib clip is the live path. SVG export concern doesn't apply
("map is published from Stage" — operator confirmation, see
`feedback_one_renderer.md` lineage). If revisiting stencil ever, the
suspicion is unclipped faces visually covering aerial because the
mask's renderOrder/queue interaction wasn't correct, but proceed with
caution.

### THE open problem — corner plugs

Diagnostic during the session confirmed corner plugs ARE generated:
**145 plugs per material** (`corner_asph`, `corner_curb`, `corner_sw`)
across **107 intersections** went into `groups`, 0 into `groupsSelected`
when nothing was selected. So generation works. The problem is the
*size* of the plug fill polygon, not its existence.

Operator's exact diagnosis (with screenshot, 2026-04-24):

> "All the pieces are here but they do not yet function properly. The
> curb is correct, the asphalt fill is correct; but it's neither wide
> nor tall enough to 'plug' the entire corner. It seems like one or
> more values are either hard coded or uses an inflexible ratio that
> needs finesse… The arc and curb are correct, we are only talking
> about the green space inside, caused by the fact that the plug needs
> to fill the space."

> "The corner plugs need to be responsive to the ribbon handles."

> "We also haven't made non-right angles bulletproof either, but we
> should always keep that possibility in mind."

So three demands on the corner plug for next session:

1. **Plug must scale to fill the entire corner.** Currently the plug's
   outer extent (the `swA → oo → swB` bezier in
   `StreetRibbons.jsx`'s corner-plug block, ~lines 690–786) lands
   short of where it needs to be — block-face green peeks through
   inside the (correctly-placed) curb arc. The arc and curb position
   are RIGHT; the plug fill is too small. Suspect the `plugSwWidth`
   reduction (`Math.min(swWidthA, swWidthB)` when both legs have
   sidewalks; falls to `0` when neither does) and the `swOuterA` /
   `swOuterB` derivation. Don't widen the curb arc; widen the plug
   to reach it.

2. **Plug must respond live to ribbon handle drags.** The plug is in
   the `meshes` useMemo whose deps include `liveCenterlines`, so
   geometry SHOULD rebuild on drag. Verify visually — operator
   reports it doesn't appear to update. The `clippedFaces` debounce
   (120 ms) means face fills lag behind ribbons + plugs, which
   could read as a stale plug visually if the face encroaches into
   the plug area. Worth checking whether removing the debounce or
   tightening it helps perception.

3. **Non-right angles must be bulletproof.** Plug bezier math handles
   arbitrary angles in principle (uses `dA_avg`, `dB_avg`, `lineX`)
   but hasn't been audited at acute / obtuse intersections (e.g.
   Park Ave at Mississippi has non-right corners). Pick 2-3
   non-orthogonal IXes, eyeball, fix.

### Where the corner plug code lives

- Generation: `src/components/StreetRibbons.jsx` lines ~636–786
  (inside the `meshes` useMemo). Read the comments at the top of the
  block — they explain the "narrower sidewalk wins" rule and the
  T-vs-X quadrant guards.
- Cross-section data feeding it: `src/cartograph/streetProfiles.js`
  `refEdges()` and `sideToStripes()`.
- Render: same file, ~line 1311 (`{!surveyActive && meshes.map(...)}`)
  using `makeMaterial(m.color, m.pri, streetFade, ...)`.
- Memory pointers: `feedback_corner_arc_rules.md`,
  `project_corner_plug_rules.md`,
  `project_corner_design_spec.md`,
  `feedback_plug_is_angle_aware.md` (these collectively pin the
  corner contract — read all four before changing the plug).

### Loose ends surfaced this session

- `MapLayers.jsx:95` — `THREE.Material: parameter 'color' has value of
  undefined` warning on every load. One of MapLayers' planes ships
  without a color. Separate from corner plugs but worth a single-line
  fix when grepping.
- `BufferGeometry.computeBoundingSphere(): Computed radius is NaN` on
  a `PlaneGeometry` (also from MapLayers). NaN positions somewhere.
  Likewise a one-line fix.

### Files touched this session

- `cartograph/derive.js` — face-fill clip block removed.
- `src/components/StreetRibbons.jsx` — `clippedFaces` useMemo,
  `stableLiveCenterlines` debounced state, `clipper-lib` import,
  per-side polygon clip math (replaced ClipperOffset with explicit
  centerline+offset rings), edgeStrokes filter relaxed.
- `src/cartograph/AerialTiles.jsx` — zoom 18 → 19.
- `src/cartograph/CartographApp.jsx` — `decorationsHidden` extended.
- `src/data/ribbons.json` — regenerated from current `derive.js`
  (120 unclipped faces, 161 intersections, 6 medians, 69 corridors).
- `src/data/ribbons.json.bak` — backup from earlier in the session.

### Memory updated this session

- `project_runtime_face_clip.md` — NEW
- `project_corner_plug_open_problem.md` — NEW
- `MEMORY.md` — index updated

Read those + the four corner memories before touching the plug code.

---

## 2026-04-23/24 session — skeleton-first pipeline landed; selection-based
## aerial reveal in progress (three specific bugs to finish)

**What drove this session:** replace the tangled OSM chain-stitching in
`derive.js` with a cleaner upstream extractor; settle the divided-road
and median representation once; wire selection-based aerial reveal
(click a centerline → aerial visible behind tool controls for that
street) so the operator can align Measure handles to real curb edges.

### Foundational decisions locked this session

Do NOT re-derive these. Memory files document each:

1. **Skeleton-first pipeline** (`project_skeleton_architecture.md`).
   `cartograph/skeleton.js` emits one clean chain per carriageway from
   OSM. `derive.js` consumes skeleton, not raw OSM ways.
2. **Positive-carriageway model**
   (`project_positive_carriageway_model.md`). Divided roads stay as TWO
   separate centerlines. No pair synthesis, no median couplers, no
   collapse to a single spine. The median is an EMERGENT polygon
   between the two carriageways' inner edges, derived at build time,
   never hand-authored.
3. **Couplers are segment-local** (`feedback_couplers_are_segment_local.md`).
   Medians / jogs / bulges live in couplers on a single carriageway.
   They are NOT a cross-section band and NOT a street-wide property.
4. **Corridor = same-name chains walked by endpoint topology**
   (`project_cartograph_pipeline_shape.md`). Emitted in `ribbons.json`
   as `corridors[]` with ordered `phases` (`single` / `divided`) and
   `transitions` (pinch points where phase kind changes). Click any
   chain → whole corridor is selected.

### Pipeline state (working)

- `cartograph/skeleton.js` → `data/clean/skeleton.json`
- `cartograph/derive.js` (reads skeleton) → `data/clean/map.json` with
  `layers.ribbons` containing `streets`, `intersections`, `faces`,
  `alleys`, `paths`, `medians` (new), `corridors` (new).
- Face fills now clipped to stop at the ribbon outer edge (MIN of
  left/right outer widths per street) so they don't bleed under road
  ribbons — critical for letting aerial show under translucent ribbons.
- Pipeline re-run copies `layers.ribbons` to `src/data/ribbons.json`.

### Runtime state (mostly working; three bugs below)

- Store loads skeleton, merges measure/caps from legacy centerlines.json
  by name, builds `corridorByIdx: Map<streetIdx, Set<streetIdx>>`.
- Corridor-level selection: clicking any chain highlights the whole
  corridor (yellow centerline in Survey).
- StreetRibbons deleted `resolveStreetSources` and friends; skeleton
  is the sole geometry source.
- `medians[]` rendered as green parkGrass polygons.
- Survey/Measure ribbon translucency as before; **selected corridor
  is routed into a parallel `groupsSelected` mesh bucket and rendered
  with extra transparency** so aerial shows through it for alignment.
- Fills toggle hides block land-use globally (Fills OFF = aerial visible).

### Open bugs to finish the selection-based aerial reveal

Three related bugs, probably one root cause. All introduced by the
selected-vs-unselected split I added to the mesh-buildup in
`StreetRibbons.jsx`. **The feature itself is required — the operator
needs aerial visible under the selected street to align Measure
handles to real curb edges.** Don't revert; finish the wiring.

- **E.A.1 Park Avenue street fill not rendering in any mode.**
  Centerlines and handles display fine in Survey/Measure/Designer,
  but no ribbon bands. Data in `ribbons.json` is clean (4 chains,
  valid measures). Suspect the `groups` vs `groupsSelected` split
  is mis-routing Park Ave's geometry — possibly when `selectedCorridorNames`
  is populated at initial render, Park Ave's chains get routed into
  `groupsSelected` and never make it out.
- **E.A.2 Measure handle drags don't visibly update ribbons.**
  Measure's handle drag mutates `st.measure` and reassigns
  `centerlineData.streets` (new array ref), so the `meshes` useMemo
  should re-run. But **`selectedCorridorNames` is NOT listed in
  `meshes`' deps array** — so when selection changes, cached mesh
  geometry with stale `m.selected` flags is returned. Add the dep
  AND verify handle drags invalidate correctly.
- **E.A.3 Corner plug regime disrupted near selected corridors.**
  Corner-plug geometry (around line 765 in `StreetRibbons.jsx`)
  pushes directly into `groups['corner_sw'|'corner_curb'|'corner_asph']`
  — it was not updated to use the `activeGroups` reference. Corner
  plugs always land in the opaque `groups` bucket, never `groupsSelected`.
  Visible as corner-plug/band mismatch on selection. Route corner
  plugs through `activeGroups` too.

Likely one pass through `StreetRibbons.jsx` to:
1. Add `selectedCorridorNames` to every useMemo dep list that reads it.
2. Route corner-plug pushes through `activeGroups`.
3. Verify the silhouette split (already separated into `silhouette` +
   `silhouette-selected`) keeps `selectedCorridorNames` as a dep.
4. Trace Park Ave end-to-end: skeleton → ribbonStreets →
   `meshes.map` render. Log `m.selected` for Park Ave to confirm
   routing is correct.

### If any of those aren't enough

Fallback: instead of splitting the mesh buildup, use **three.js
stencil buffer**. Render the selected corridor's ribbon silhouette
to the stencil pass (colorWrite=false, stencilWrite=true). Then
face fills and non-selected ribbon bands render with stencilFunc
set to reject pixels where the selected silhouette already wrote.
Pure render-time masking, doesn't touch geometry buildup, one place
to guard.

### Files changed this session (not exhaustive)

- `cartograph/skeleton.js` — new file
- `cartograph/derive.js` — consumes skeleton; medians, corridors,
  face fill clip
- `cartograph/serve.js` — `/skeleton` endpoint
- `cartograph/NOTES.md` — this entry
- `cartograph/BACKLOG.md` — corresponding entry
- `src/components/StreetRibbons.jsx` — deleted heuristic layer;
  added median render + selection-based split (current bug source)
- `src/cartograph/SurveyorOverlay.jsx` — rewrite/shrink
- `src/cartograph/SurveyorPanel.jsx` — rewrite/shrink
- `src/cartograph/CartographApp.jsx` — corridor selection wiring
- `src/cartograph/api.js` — `fetchSkeleton` added, `saveCenterlines`
  removed
- `src/cartograph/stores/useCartographStore.js` — major prune +
  `corridorByIdx`
- `src/cartograph/NodeContextMenu.jsx` — deleted

### Memories added / updated this session

In `~/.claude/projects/-Users-jacobhenderson-Desktop-lafayette-square/memory/`:

- `project_skeleton_architecture.md` — updated (SHIPPED)
- `project_positive_carriageway_model.md` — NEW (foundational decision)
- `project_cartograph_pipeline_shape.md` — NEW (full pipeline shape +
  "Frequent re-derivations to avoid" checklist)
- `feedback_couplers_are_segment_local.md` — NEW (don't re-derive
  median-as-band)
- `MEMORY.md` — index updated

Read these before proposing architectural changes.

---

## 2026-04-23 — state of the Survey/Measure tools

See BACKLOG.md "2026-04-22 → 2026-04-23 session" entry for the full punch
list. Short version for an operator picking this up fresh:

1. **The pipeline's OSM-way stitching produces tangled loop chains for
   divided roads.** Park Avenue east of 18th, Truman Parkway, Chouteau
   east section, Lafayette, Russell, S. 12th, S. 14th, Gravois. Visible
   symptom: bowtie/chevron at intersections in Survey; parallel
   "two streets stacked" in Design; sometimes missing ribbons in one mode.
2. **The correct model is one centerline per street + `median` as a
   band** in the cross-section. Authored centerline runs down the ROW
   spine (not a lane); median insert coupler carves a center slice
   filled with the `median` band material. Supported end-to-end in code.
3. **centerlines.json data quality needs an operator pass.** Orphans,
   stubs, duplicates, closed-loop errors. Until the data is clean,
   rendering rules are heuristic (authored-vs-pipeline ratio). Once
   every in-neighborhood street has one clean spine centerline, the
   heuristics collapse and everything becomes a one-liner.
4. **Tonight's unresolved issues** (see BACKLOG E.1–E.12) — aerial
   photo visibility under streets in tool+Fills-ON mode, selection-
   driven translucency, dead-end cap previews for all dead-ends,
   right-side pan dead zone, Measure selectability regression, corner
   plugs on authored streets, median coupler inspector UI.

---

## 2026-04-22 additions — read first

### Survey vs. Measure division of labor (finalized)

- **Survey** owns longitudinal structure: centerline shape, nodes,
  couplers (split + insert), caps, terminal, jog/median inserts.
  Renders as translucent blue silhouette envelope + royal-blue
  centerline spine + property-line outline. Internal stripes are
  suppressed — authoring here answers "where does the street *go*."
- **Measure** owns cross-section: pavementHW / curb / treelawn /
  sidewalk per side, per coupler-segment. Renders as per-stripe
  translucent fills with per-material edge strokes. The **color story**.
  Authoring here answers "what's the street *made of* at this point."
- Both write to `centerlines.json`; Designer ribbon + Stage shots read
  the same live source. No parallel state.
- "Fills" toggle unchanged — the tool's subject matter (street-ways +
  paths) is what the tool swaps; Fills governs everything else.

### Insert-coupler data model

Couplers in `centerlines.streets[i].couplers` are a mixed array of
numbers (legacy split couplers — `{kind:'split', pointIdx:n}` normalized)
and objects. New insert form:

```js
{
  kind: 'insert',        // vs. 'split'
  feature: 'median',     // future: 'jog', 'bulge', 'slip'
  pointIdx: 42,          // anchor node (center of hold zone)
  taperIn: 5,            // meters — entry fairing
  hold: 40,              // meters — full-width span
  taperOut: 5,           // meters — exit fairing
  medianHW: 3,           // half-width of the insert
}
```

One coupler carries the whole "rock in the river" insert — taper-in /
hold / taper-out as a composed object, not four loose keyframes the
operator has to coordinate. `resolveInserts(street)` walks arc-length
and returns per-point `{medianHW, lateralOffset}` with cosine-eased
fairings. Extends to jogs (modifies `lateralOffset`) and slip lanes
without adding primitives. See `streetProfiles.js` for
`normalizeCoupler`, `arcLengthsAt`, `resolveInserts`.

`segmentRangesForCouplers` now filters to `kind:'split'` only — insert
couplers don't segment the street, they modify the cross-section
smoothly along it.

### Silhouette renderer (Survey-only)

`StreetRibbons.jsx` gained a `silhouetteMeshes` useMemo that iterates
**live centerlines** (not `ribbons.streets` — pipeline-segmented output
fragments long streets and produces overlapping stripe-stacked
visuals). One translucent blue envelope per centerline via
`halfRingVarRaw(pts, innerArr, outerArr, perps, side)` with per-point
radii from `resolveInserts`. Survey replaces the per-stripe `meshes`
path wholesale; Measure keeps its own per-stripe rendering unchanged.

### Segment direction alignment (pipeline fix)

Long two-way streets had inconsistent point ordering across their
ribbon segments — OSM's way-ordering is a drawing convention for
two-way roads, not a directional one. `measure.left` / `measure.right`
in `centerlines.json` is authored in the centerline's direction; so
when a ribbon segment is reversed vs the centerline, `measure.left`
draws on physical-right. The runtime guard in StreetRibbons swapped
sides to compensate for rendering, but asymmetric Measure drags hit
the swap at different points along a multi-segment street (like Park
Avenue at 1140m, 3 segments), producing "both sides grew" bugs.

Fixed at the pipeline (`derive.js`): each chain emitted by
`chainAllSegments` is tested against the authored centerline's
direction over the span the chain covers (local tangent, not global),
and reversed if it disagrees. Result: 0/122 direction-mismatched
ribbon segments (was 37/122). Affected streets: Park, Rutger,
Lafayette, Lasalle, Geyer, Jefferson, Truman Parkway, Chouteau, and
~17 others — overwhelmingly two-way.

**Deleted the runtime orientation guards** in `StreetRibbons`'
`meshes` + `edgeStrokes` useMemos. Consistency is now an invariant of
`ribbons.json`, not something the renderer patches over.

### Measure stripe-stroke reduction

Per-stripe strokes now emit at the pavement edge (asphalt outer =
curb inner) and property line (outermost ring) only. Intermediate
curb-outer and treelawn-outer strokes dropped — 10 parallel strokes
on a boulevard became 5. Survey mode unchanged (already outer-only).

### What's next

- **D.1 Survey UI for insert couplers.** Right-click node → Split /
  Median insert / Jog insert. Inspector for taperIn/hold/taperOut/
  medianHW with live silhouette feedback. Data model + renderer ready.
- **D.2 Chevron reads as dead-end.** Park Ave × 18th: pipeline still
  terminates Park Ave's segments at the chevron. Probably resolves when
  the chevron is authored as a median+jog insert in Survey rather than
  split at that node.
- **D.3 Jog inserts.** Same coupler shape, modifies `lateralOffset`.
  Handles chevron jogs directly without a new primitive.

---

## 2026-04-21 additions — read first

### Alley clipping: match ribbon geometry or lose

If you change how `StreetRibbons` computes the outer edge of a street, you
MUST mirror it in `derive.js [7/8] Processing alleys...`. They share one
formula — `streetProfiles.getHalfWidth()` line 229:

```
pavementHW + (terminal !== 'none' ? CURB_WIDTH : 0) + treelawn + sidewalk
```

Any drift between ribbon outer-edge and alley-clip ROW re-creates the
pointy-alley artifact that this session spent hours tracking down. Symptoms:

- **Alleys poke through the sidewalk into the street** → ROW too small
  (forgot curb, forgot to pass survey into `defaultMeasure`, or divided by 2).
- **Alleys terminate as black knife-shaped wedges** → clip polygon turns a
  corner inside the alley buffer because ROW is both too small AND uneven
  around the junction.

`derive.js` imports `CURB_WIDTH` from `streetProfiles.js` — don't duplicate
the constant. `defaultMeasure` takes `(type, survey)` — always pass
`correctedSurvey[name]` so fallback streets pick up their measured
pavement/sidewalk offsets.

### No divide-by-2 for divided streets in alley clipping

`render.js` halves `pavementHalfWidth` for divided streets because the
OSM centerline for a divided street represents the whole ROW and each
direction gets its own ribbon. **Do not replicate that halving in the
alley clip.** The alley-clip ROW buffer must reach the outer back-of-
sidewalk regardless of whether the centerline is whole-pavement or
half-pavement. Fixed Park, Lafayette, Chouteau, Jefferson terminals.

### Flat caps (`EndType.etOpenButt`), not rounded

Previous iteration used `etOpenRound` which bulged alley ends past the
clipped polyline endpoint, undoing the trim. Use `etOpenButt` so the cap
terminates exactly at the trim point. The rounded-cap aesthetic is wrong
here anyway — alleys butt into curb/sidewalk, they don't round off.

### Clipping polylines, not polygons

The alley trim is an **open-path** difference: `Clipper.AddPath(linePath,
ptSubject, /*closed=*/false)`, output via `PolyTree +
Clipper.OpenPathsFromPolyTree(tree)`. Buffering happens AFTER the trim.
Do not try to buffer first and then subtract polygons — that re-creates
the pointy-corner wedges. Trim the centerline, then inflate.

### Task #9 still open

"One of these is fixed" confirmed after iter 15, but the full neighborhood
hasn't been swept. Streets with no survey `pavementHalfWidth` at all
still hit `TYPE_PAVEMENT_HW` defaults — those fallback values may under-
estimate arterials that never got surveyed.

---

## 2026-04-20 additions — read first

### Marker FAB → bottom-right of canvas (clear of Panel)

The Marker tool's FAB lives at `right: calc(340px + 14px); bottom: 14px;`
— the canvas's lower-right corner, just left of the 340px Panel. The main
pencil button sits at the bottom of the column; eraser/undo/clear minis
cascade *above* it when marker is active. Update the `340px` if Panel
width ever changes.

### Toolbar: four orthogonal axes, redesigned

Toolbar is now a row of segmented pill controls plus two single-button
toggles. Tool / shot / scene / Fills are truly orthogonal — pick any
combination, the scene composes coherently. CSS tokens live in
`cartograph.css` under the `.cartograph` scope (`--toolbar-*`).

```
Designer:  [Survey · Measure]  [Fills]  [Browse · Hero · Street]  [Toy]
In a shot: [← Designer]  [Publish]  [Browse · Hero · Street]  [Toy]
```

- **Fills** is a single binary toggle (no longer paired with Aerial — that
  was redundant; aerial is always on, and Fills off naturally exposes it).
- **Toy** is a single binary toggle replacing the old Neighborhood/Toy
  segmented pair.

### Fills: per-tool orientation toggle (revised 2026-04-22)

**Fills ON** (default): full digital map, every layer at full opacity.
Per-layer toggles in the Designer panel control individual layers granularly.

**Fills OFF**, behavior depends on active tool:
- **Design (tool = null)**: hide the calculated map entirely — aerial photo
  only. Design is the color/material picker; Fills-off lets the operator see
  what they're coloring over.
- **Survey / Measure**: hide everything except aerial + the tool's
  translucent roadways (Survey silhouette / Measure stripes) + centerline
  affordances. The roadways are the edit surface and must stay visible.

Per-layer state is preserved underneath — Fills back ON returns to whatever
per-layer state existed. The Fills hide-list is in `CartographApp.jsx` as
`decorationsHidden`; Design-mode additional hide-list gates the roadway
composites too.

Supersedes the 2026-04-20 "same gesture same effect regardless of tool"
rule. The earlier uniformity collapsed Design's job (pick colors, see the
underlayer) into Survey/Measure's job (edit roadways); different tools want
different answers.

### Translucency belongs to ribbons (not the rest)

Survey ribbons render translucent blue (#2250E8, opacity 0.28). Measure
ribbons render translucent per-stripe (opacity 0.45) with handles + edge
strokes on top. Face fills, buildings, paths — **opaque** in every tool.

The aerial-through-ribbon affordance is the tool's edit surface; everything
else stays clean. Earlier experiment with translucent face fills was
reverted (too much visual noise at once).

### Pipeline: paths/alleys clipped to curb

`derive.js` now computes `pavementWithCurb = clippedStreets ⊕ CURB_WIDTH`
and runs every footway / cycleway / steps / path / alley through
`clipFeaturesOutsideCurb` before emission. Paths terminate at the curb,
never punching into asphalt at intersections. One foolproof rule —
no per-endpoint tuning needed.

Z-fight fix: MapLayers' path-family meshes (alley, footway, stripes, edge
lines, bike lanes) lifted by `+0.06m` so they clear StreetRibbons face fills
(group y=0.15 in shot mode) under terrain displacement.

### Toy scene fixture

`src/toy/` is a permanent shader/shadow R&D fixture, accessed via the Toy
toolbar toggle. One 4-way intersection at origin, 4 quadrant blocks, 12
houses (1878-1930 era → mansard / hip / flat roof variation + foundation
pedestals via the *real* `Building` and `Foundations` components), 8 trees
(real `ParkTrees`), 8 lamps (real `StreetLights`).

Imports shared components, exports nothing. To stand up another fixture,
copy `src/toy/` and change the data files in `src/data/toy/`.

Hill terrain attempted then flattened — the global `terrainShader` is
wired to the neighborhood elevation map and isn't trivially swappable.
See task #9 (backlog) for the proper integration.

### No destructive operations

The old `splitAtNode` (turned one centerline into two separate entries
with no rejoin) is gone. Replaced by **opt-in split couplers** —
non-destructive markers on existing centerline nodes, fully reversible
by toggling the same marker off.

**Right-click any interior node in Survey** → toggles a split coupler.
Coupled nodes render as paired semicircles oriented along the street
tangent (the "extension cord" affordance). Stored as
`centerlines.streets[i].couplers: [pointIdx]`.

Phase 1A (UI + data) is shipped. Phase 1B (per-segment measure storage,
per-segment reset, pipeline split at coupler nodes) is queued — helpers
`segmentRangesForCouplers` and `measureForSegment` already exist in
`streetProfiles.js`, store actions `toggleCoupler` and `resetSegment`
already exist.

If you find legacy splits (e.g. `Lafayette Avenue` as `-a` / `-b`
entries), run `node cartograph/rejoin-splits.js` — it merges adjacent
same-name centerlines whose endpoints touch within 0.5m. Dry-run with
`--dry-run`. Backs up the file before writing.

### Measure tool fixes

- **Asymmetric drag bug:** the pipeline reverses some ribbon segments
  relative to centerline orientation, so `live.measure.left` would render
  on the visually-right side. New orientation guard in StreetRibbons'
  merge step swaps `left ↔ right` when ribbon tangent disagrees with
  centerline tangent (dot product < 0). Diagnostics gated on
  `window.__measureDebug` if anything regresses.
- **Double-click to insert** now works (empty pointerdown was
  deselecting the street before dblclick could fire).
- **Min stripe width 1.0m** enforced in `applyDrag` so handles can't
  visually collapse onto each other. Right/Ctrl-click is the explicit
  "zero this stripe" gesture.
- **Handles stagger along the street** when `r` values are within
  `HANDLE_LONG + 0.5m` — keeps each independently clickable on tight
  cross-sections (e.g. Park Avenue south-side with 8cm treelawn).

### Stage convergence path locked

After audit: the runtime (lafayette-square.com) is **not** a separate
build target waiting for replacement. It already shares 90% of Stage's
components. The remaining work for "publish" is:

1. Define `public/stage-config.json` schema (arch, SHOTS, palette,
   env defaults).
2. De-fork `StageSky` ↔ `CelestialBodies` (~1150 lines) and `StageArch`
   ↔ `GatewayArch` with a `source: 'runtime' | 'authored'` prop.
3. Wire cartograph "Publish" button to write `stage-config.json`.
4. Delete `VectorStreets` (CSS3D SVG hack); runtime sky goes opaque
   (matching StageSky variant).

Estimated 3-4 focused days. The cartograph map polish is the long pole;
runtime flip is a short tail.

---

## 2026-04-19 additions — read first

### Measure / Survey tool refactor (the big one)

The old 8-band system (`_bands: [{material, width}]`) is gone. Replaced with a
focused per-side model that matches physical reality and the operator's mental
model:

```js
// Per street in centerlines.json (and ribbons.json output):
measure: {
  left:  { pavementHW, treelawn, sidewalk, terminal: 'sidewalk' | 'lawn' | 'none' },
  right: { ...same fields... },
  symmetric: true
}
```

**Hardwired stripe sequence** (from centerline outward, positions imply material):
`asphalt (pavementHW) → curb (fixed CURB_WIDTH) → [treelawn] → [sidewalk | lawn]`

No per-stripe pulldowns — the material of each stripe is determined by its
position in the sequence. Curb is constant-width, not editable. When `terminal`
is `'none'` the side stops at curb (alleys, footways).

**Why this shape:** Previous 8-material system was too much UI for too little
signal. Parking is a separate overlay layer now. Per-side asymmetry is essential
for park-edge streets. `terminal` lets the operator pick one of three real-world
cases (sidewalk / lawn-only / nothing) with one control. See
`src/cartograph/streetProfiles.js` for the helpers (`defaultMeasure`,
`sideToStripes`, `refEdges`).

**Corner plug rules** (see `project_corner_plug_rules.md` memory):
- Every corner has a plug; it's the universal rounding primitive.
- Shape: proven bezier, sized to the NARROWER sidewalk of the two meeting legs.
- Wider sidewalks / treelawns / retail plazas on the other leg BUTT against the
  plug — they do not expand it.
- corner_sw is emitted only when at least one leg has sidewalk; curb + asphalt
  corners emit always.

### Measure tool UX (the new authoring loop)

- **Royal blue centerlines** (architectural color `#2250E8`, 0.7m thick ribbons
  via `polylineRibbon` in `src/cartograph/overlayGeom.js`) in both Measure and
  Survey modes.
- Click a centerline to select. Handles **anchor at the click point** (not the
  midpoint) — store `selectedMeasurePoint` on the store, compute per-click
  tangent frame via `frameAtPoint`.
- Handles are **rectangular pills** (5m × 1.2m, white fill + black outline)
  oriented along the street direction. One handle per real stripe boundary per
  side: `pavementHW`, `treelawnOuter` (only when treelawn > 0), `propertyLine`.
  Curb has no handle (fixed width is inferred).
- **Drag** a handle to resize its boundary. In symmetric mode (default) the
  drag mirrors to the other side. `measure.symmetric: false` unlocks sides.
- **Right / Ctrl-click** a handle to remove that boundary (collapse the stripe).
- **Double-click** anywhere in the sidewalk zone to insert a treelawn/sidewalk
  split. If a side has `terminal: 'none'`, double-click reseeds the pedestrian
  zone at that radius.
- Map rendering when `measureActive`: ribbons render translucent (opacity 0.45)
  with opaque per-material strokes at every stripe's outer boundary. Aerial
  shows through fills; boundaries stay crisp.
- Map rendering when `surveyActive`: ribbons render uniform blue tint
  (#2250E8, opacity 0.28) with slim blue stroke at the outermost (property
  line) boundary only. Per-stripe materials are suppressed.
- Panel has an **Asymmetrical** checkbox that toggles `measure.symmetric`. Each
  side shows its own terminal dropdown + read-only stripe widths.

### Pipeline: survey-aware per-side defaults

`defaultSideMeasure(type, survey, sideKey)` in `streetProfiles.js` now uses
`survey.sidewalkLeft` / `sidewalkRight` per side:
- If present for a sidewalk-eligible street → terminal=`sidewalk`, treelawn
  width computed from the gap between curb-outer and `swDist − SV_SIDEWALK/2`.
- If present on the OTHER side only (asymmetric, park-edge case) → this side
  gets `terminal: 'lawn'` with a modest grass strip.
- If absent on both sides → fallback residential treelawn + sidewalk default.

19 streets came out asymmetric in the current data (park-edges: Park Place,
Park Avenue, Gravois, Soulard, West 18th, Kennett, Singleton, Henrietta,
Waverly, Dillon, Preston, St. Vincent Court, etc.).

Symmetric flag is auto-set: `measure.symmetric = (L.terminal == R.terminal
&& L.treelawn ≈ R.treelawn && L.sidewalk ≈ R.sidewalk)`. Park-edge streets
start asymmetric.

### Stage-view fixes (terrain + markings + alleys)

- **Lamps + glow + pool + base** (4 instanced meshes in `StreetLights.jsx`)
  now terrain-displaced. Added `patchTerrainInstanced` + `UNIFORMS` export in
  `src/utils/terrainShader.js`. The shader samples terrain at each instance's
  world origin (`modelMatrix * instanceMatrix * (0,0,0)`) and lifts all
  vertices of that instance uniformly. No more lamps underground.
- **Street markings** (centerStripe / parkingLine / bikeLane) rebuilt as
  thin quad-strip ribbons (`stripeRibbonGeo` in `MapLayers.jsx`) with
  `makeFlatMat` so they pick up terrain displacement. Previously they were
  `THREE.Line` at fixed y=0.2 — buried under lifted terrain in shots.
- **Alley z-fighting** fixed by reducing `makeFlatMat` polygonOffset from
  `factor=-pri*4, units=-pri*50` to `factor=-pri, units=-pri*4` (matches
  StreetRibbons). Old values were so aggressive they caused precision
  collisions once terrain displaced everything simultaneously.

### Grass shaders wired for residential + treelawn + lawn

- **Residential faces** get a separate `residentialGrass` material
  (`makeGrassMaterial({ color: luColors.residential })`) in shots; same noise
  shader as park, slightly brighter green. Falls back to flat color in Designer.
- **Park grass** already wired; now also `patchTerrain({ perVertex: true })`
  so it displaces with terrain.
- **Treelawn ribbons** use `residentialGrass.material` in shots so the strip
  flows seamlessly into the adjacent block's grass.
- **Lawn ribbons** (park-edge `terminal: 'lawn'`) use `parkGrass.material` in
  shots so the strip reads as an extension of the park lawn.
- Designer keeps flat band colors for plan-view legibility.

### Park data coordinate systems — RECURRING CONFUSER

The data files in `src/data/park_*.json` use different frames. Getting this
wrong produces rotated/misplaced water, trees, or paths.

- `park_trees.json` — **park-local, axis-aligned**. Raw x, z within ±175m
  (matching the `PARK` constants). Must be rotated by `PARK_GRID_ROTATION`
  (-9.2°) to land correctly in world, because the real Lafayette Park is
  tilted 9° from world axes (the street grid is).
- `park_water.json` — **park-local, axis-aligned** (same frame as trees).
  Lake outer / island / grotto polygons are in the park's own frame. Must
  also be rotated by `PARK_GRID_ROTATION`.
- `park_paths.json` — **world-aligned**. Counter-rotates with `-GRID_ROTATION`
  inside LafayettePark to cancel the parent wrapper.

Because LafayettePark wraps its contents in `<group rotation={[0,
GRID_ROTATION, 0]}>`, park-local data (trees, water) needs NO extra rotation
inside LafayettePark, while world-aligned data (paths) counter-rotates.

MapLayers is flat and has no parent rotation, so park-local data needs a
`PARK_GRID_ROTATION` wrapper there to look the same.

**The park face in `ribbons.json`** is already rotated in world (vertex
coords encode the 9° tilt). That's the authority for park boundary — when in
doubt, match what the park face looks like in Designer (which renders the
ribbons face directly).

---

## 2026-04-17 additions — read first

### The big architectural move: Stage is embedded in Cartograph

Previously cartograph had **two Canvases** — a flat ortho one for the
Designer and a perspective one for Stage mode — switched by unmounting one
and mounting the other. This caused a persistent **WebGL context-loss skew
bug**: every time you flipped Designer ↔ Stage, the browser threw away one
GL context and created another, and on return the view-projection matrix
uniforms came back corrupted, producing a "parallelogram" tilt that only a
hard refresh + cache purge could fix. It was the most-reported visual bug
against the cartograph for weeks.

The fix was architectural, not a polish pass: **collapse to a single
Canvas** with two cameras (`OrthographicCamera` for Designer via the
`<Canvas orthographic>` default; `<PerspectiveCamera makeDefault={!inDesigner}>`
for shots). Both cameras always mounted; `makeDefault` swaps which one is
active. `MapControls` is keyed on `inDesigner ? 'ortho' : 'persp'` so it
remounts cleanly when the active camera changes. **No more context loss, no
more skew.**

### Tool vs. Shot: two orthogonal axes

The old `mode` field conflated authoring intent (marker / surveyor / measure
/ stage) with camera intent. These are different concerns. Replaced with:

- **`tool: null | 'surveyor' | 'measure'`** — the authoring tool in use.
  `null` is the default **Design** state (no tool selected). No `'design'`
  enum value; absence is the meaning. Marker is controlled separately via
  `markerActive` because it layers over any tool.
- **`shot: 'designer' | 'browse' | 'hero' | 'street'`** — which camera +
  environment preset is active. `'designer'` = the authoring workspace
  (ortho plan view, aerial tiles, overlays). `'browse'` / `'hero'` /
  `'street'` are the three Stage camera shots authored in `SHOTS` (in
  `src/stage/StageApp.jsx`).

**Toolbar morphs on `shot`:**
- Designer shot → `Marker | Surveyor | Measure` + shot selector
- Any other shot → `← Return to Designer | Publish` + shot selector

Shot selector (`Browse | Hero | Street`) is always visible on the right
side of the toolbar. `Publish` is a stub right now (logs a line) — wire
it up when we're ready to publish.

### Environment pipeline wired into Cartograph

The Stage environment stack now runs inside Cartograph's unified Canvas
whenever a non-Designer shot is active:

- `<StageShadows />` (SoftShadows helper) — gated `{!inDesigner}`
- `<PostProcessing />` (EffectComposer with AO, Bloom, AerialPerspective,
  FilmGrade, FilmGrain) — gated `{!inDesigner}`
- `TimeTicker` + `SkyStateTicker` — always running; ticker callbacks are
  side-effect-only and cheap enough
- `CelestialBodies` + `CloudDome` — wrapped in `<group visible={!inDesigner}>`

All exported from `src/stage/StageApp.jsx`. `StageCanvas.jsx` is deleted —
its entire contents now live inside `CartographApp.jsx` via the shot-only
group.

**Consequence: the Environment panel's sliders in Stage mode now drive live
rendering.** Previously they wrote to `envState` but nothing in cartograph
read that, so they were cosmetic. Now every slider (Exposure, AO, Bloom,
Aerial Haze, Film Grade, Film Grain, Shadows) updates the composer per
frame through refs.

### Arch & Horizon controls + swappable ground disc

Added `archState` to `src/stage/StageApp.jsx` alongside `envState`, exposed
as `setArch` / `useArchState`. Defaults in `ARCH_DEFAULTS`: distance (from
origin along a fixed bearing), scale, rotation, Y offset, and horizon
disc radius + fade band.

`GatewayArch` reads these every frame — no hardcoded constants. A new
`GroundDisc` sibling component renders a soft-edged round plane beneath
the arch, fading from opaque to transparent between `horizonFadeInner` and
`horizonFadeOuter`, colored by the live sky `horizonColor`. Simulates the
horizon so the arch reads as "heroic on the ground" from the shot camera.

`StagePanel` gets a new **Arch & Horizon** collapsible section with sliders
for every archState field. `DesignerArch` (exported from `StageArch.jsx`)
renders a flat-black catenary silhouette in the Designer — the arch is a
plan-view feature of the map, not just a Stage thing.

**This is the first piece of the** `stage-config.json` **authority story**
(see `project_stage_is_scene_authority.md`) — Arch & Horizon values live
in a store that will eventually persist to disk and be consumed by the main
app's scene. For now it's in-memory only.

### Color pickers wired to rendering

The Designer panel's color pickers used to write to `layerColors` in the
store, but neither `MapLayers` nor `StreetRibbons` read that — they used
hardcoded constants (`C.*` in MapLayers, `BAND_COLORS` in streetProfiles).
**All pickers were cosmetic.**

Now:

- `src/cartograph/m3Colors.js` is the single source of truth for defaults.
  It exports `DEFAULT_LAYER_COLORS` (per panel layer id),
  `DEFAULT_LU_COLORS` (per land-use), and `BAND_TO_LAYER` (maps ribbon
  band materials like `'asphalt'` → panel picker ids like `'street'`).
- `MapLayers` subscribes to `store.layerColors` and resolves each material
  via `layerColors[id] || DEFAULT_LAYER_COLORS[id]`. Re-memos on change.
- `StreetRibbons` does the same for band colors, routed through
  `BAND_TO_LAYER` so a single "Streets" picker paints asphalt + parking
  bands, "Curb" paints curb + gutter, "Sidewalk" paints sidewalk + treelawn
  + lawn. Face-fill colors still use `luColors` from the Panel + LU
  defaults.

**Palette direction shifted** from "M3 muted neutrals" → "vibrant graphic
map" during the session. The muted palette was calibrated for flat
pass-through viewing (Designer) but crushed to near-black under ACES tone
mapping in shots. Bumped residential to grass-green (#5A8A3A), asphalt to
#4A4A48, sidewalks to warm cream (#B8B2A4). This is still placeholder —
we'll converge on final colors once the park/shader work lands.

**Pickers currently hidden**: `tree`, `lamp`, `labels`. Each needs its own
authoring section (light color + intensity for lamps, foliage material for
trees, typography + scale for labels) — not a color well. Tree/lamp are
mostly driven by `LafayettePark` / `StreetLights` internals right now;
labels have no renderer.

### Caps propagation bug fixed

**Symptom:** operator set `capStart`/`capEnd` in Survey mode, edit saved to
`centerlines.json`, but the ribbon map didn't update to show the cap.

**Root cause, two parts:**

1. `updateStreetField` in the store was mutating the street in place and
   calling `set({ centerlineData: { ...centerlineData } })` — the outer
   object identity changed but the `streets` array stayed the same
   reference. `StreetRibbons`' `useMemo([liveCenterlines])` therefore
   didn't re-run. Fix: rebuild the streets array in the setter.
2. The merge loop in `StreetRibbons` was blanket-applying
   `capEnds: { start, end }` to every ribbon segment matching the
   centerline's name. For chain-split streets (one centerline → multiple
   ribbon segments), this produced spurious caps at intersection joints.
   Fix: apply `capStart` only when the ribbon segment's first point
   matches the centerline's first point (within 0.5m); same for `capEnd`.

### Park architecture (the unfinished piece)

**Decision made today, work only partly executed.** The park should be a
ribbon-rendered surface like any other block. "Park" is the authored layer;
grass is its current material. Future material variants (snow, autumn,
drought, illuminated night) are Park-surface treatments, not separate
layers. The Park material is picked in Stage like any other surface.

**Current state (end of 2026-04-17):**

- `StreetRibbons` face fills now render every face including the park (the
  earlier filter that skipped `use: 'park'` is removed).
- `DesignerPark.jsx` exists but renders only paths + water (no boundary
  polygon). Path + water **placement is still wrong** — the coords in
  `park_paths.json` and `park_water.json` are in some park-local system;
  neither `rotation = GRID_ROTATION` nor `-GRID_ROTATION` aligns them to
  world, which implies they may already be world-aligned and my rotation
  added the offset. Empirically test with `rotation = 0` first.
- `LafayettePark` still renders its own SVG-backed grass plane in shots,
  which z-fights with the ribbon park face. This is expected during the
  transition.

**Tomorrow's work, in order:**

1. Place paths + water correctly (iterate rotation until they sit inside
   the ribbon park face).
2. Remove `LafayettePark`'s grass plane (its territory is the ribbon park
   face now).
3. Attach the noise-based grass shader (currently living in
   `LafayettePark`'s `ParkGround` component) to the ribbon park face's
   material **only in shots**. In Designer the face stays flat-colored.
4. Once LafayettePark's path/water rendering is what shots use, Designer
   can consume the same component. Then `DesignerPark` dies.

### Ribbon lighting pipeline details

- `SHADOW_TINTED_FLAT` is applied to ribbons in shots (not just Designer).
  Math: extract luminance ratio from PBR output, undo BRDF's 1/π division
  so palette tones land near their Designer values, clamp to `[0.25, 3.5]`
  so shadows don't go to void and bright-lit surfaces have headroom.
- `polygonOffset` on ribbons is `factor = -pri, units = -pri * 4` —
  negative pulls ribbons toward the camera in depth to beat terrain (which
  has zero offset), and `factor = -pri` preserves intra-ribbon priority
  (higher pri = more negative = more forward). Asphalt pri=8 beats
  terrain; sidewalk pri=5 sits behind corner plugs pri=10, etc.
- Ribbon group is lifted to `y = 0.15` in shot mode so it clears the
  terrain mesh (`y = -0.1` with uExag displacement on top). In Designer
  (terrain hidden) the lift is zero so MapLayers' footway polygons at
  `y = 0` aren't buried under ribbons.
- **Terrain mesh is hidden in shots** via `<group visible={false}>` but
  its shader uniforms stay live so ribbons and buildings still get the
  terrain displacement. Good for now; we may bring it back once the park
  is fully owned by ribbons.

### Known issues carried into tomorrow

- **Park paths + water mis-placed** (see Park architecture above)
- **No cast shadows on ribbons at any time of day** (including /stage).
  The shadow map renders, the ribbons have `receiveShadow: true`, the
  shader reads `reflectedLight.directDiffuse` (which includes shadow
  attenuation) — yet visible cast shadows don't appear on the street
  surfaces. Investigate: shadow-camera frustum coverage, bias/normalBias,
  or the SHADOW_TINTED_FLAT clamp swallowing the shadow delta.
- **Ribbons in shots look darker than expected for midday** — palette
  brightening helped significantly but the darker base colors (asphalt
  especially) still crunch through ACES + PostProcessing. This is at
  /stage parity now; diverging further would mean either further palette
  brightening or a graphic-map emissive treatment.
- **Designer sidewalks render too visibly** — the sidewalk tone
  (`#B8B2A4`) is correct for the plan view but shows as prominent white
  strips against dark asphalt. When LafayettePark eventually owns the park
  surface and we refine the palette, revisit.
- **Camera in shots can go underground** — I unlocked `minPolarAngle: 0,
  maxPolarAngle: π` so the operator can diagnose underside rendering.
  Leave unlocked; it's diagnostic-useful.

### Files touched today

- `src/cartograph/CartographApp.jsx` — unified Canvas + camera rig
- `src/cartograph/StageCanvas.jsx` — **deleted**
- `src/cartograph/stores/useCartographStore.js` — `tool` + `shot` replace `mode`
- `src/cartograph/Toolbar.jsx` — morph on shot, shot selector
- `src/cartograph/Panel.jsx` — reads tool, palette from `m3Colors.js`, hides unwired pickers
- `src/cartograph/m3Colors.js` — **new**. Canonical palette + band→layer mapping
- `src/cartograph/DesignerPark.jsx` — **new**. Paths + water (placement unfinished)
- `src/stage/StageApp.jsx` — adds `archState`, exports `StageShadows`/`PostProcessing`, adds `ArchHorizonControls`
- `src/stage/StageArch.jsx` — reads `archState`, adds `GroundDisc` + `DesignerArch`
- `src/stage/StageSky.jsx` — sky-dome ticker fix (confirmed; no change today)
- `src/components/StreetRibbons.jsx` — live `layerColors`, SHADOW_TINTED_FLAT π comp, polygon offset flip, no-face-filter for park, cap-match by terminal point

---

## 2026-04-16 additions — read first

**Dead-end caps are per-endpoint + operator-marked.** Each street in
`centerlines.json` has `capStart: 'round'|'blunt'|null` and `capEnd` set by the
operator in Survey mode (per-endpoint cap dropdown). The pipeline reads these
directly and emits `capEnds: {start, end}` on each ribbon street.
`StreetRibbons.jsx` renders them via `quarterCapRaw`. No auto-detection —
operator is authority. Supersedes the earlier auto-detection attempt which
produced too many false caps on divided-road inner endpoints.

**Divided one-ways remain a distinct class** (Truman Parkway, Benton Place,
Mackay Place loop streets, parts of Russell/Jefferson). The operator can now
correctly leave their inner-facing endpoints uncapped via Survey mode, so caps
are no longer blocked by them. Still want Phase 14 for median rendering and
plug handling.

**Manual measurement snapping.** On drag-release in Measure mode, band width
rounds to the nearest `SNAP_TARGETS` entry (5/6/8/10 ft for sidewalk, 7 or 8 ft
for parking, etc.). At typical map zoom 1 px ≈ 3 inches — sub-foot precision is
fiction. Survey-derived widths stay raw. Enables reliable template duplication.

**Measure caustic ruler (2026-04-16).** Clicking a centerline in Measure mode
draws a perpendicular **ruler** from centerline to property line at the street's
midpoint, colored per band with dots at each boundary. Operator clicks *on the
ruler* at a radius to **insert a new band boundary** — the band being split
keeps its material on both halves; the operator relabels via the panel
dropdown. Drag the dots to tune widths (snap-always). No along-street band
strips — those duplicated what `StreetRibbons` already shows.

**Default band stack is deliberately minimal.** Generic street =
`asphalt + curb`. Sidewalk-eligible (residential/secondary/primary) =
`asphalt + curb + sidewalk`. **No default parking or treelawn** — the operator
adds those via the ruler where reality shows them. This matches the "irregular
geometry" reality of the neighborhood (wide plaza sidewalks at retail,
missing sidewalks next to ramps, non-standard parking).

**Live centerlines → StreetRibbons.** `StreetRibbons.jsx` accepts a
`liveCenterlines` prop (the store's `centerlineData.streets`). For each street,
live `_bands` / `capStart` / `capEnd` override `ribbons.json`'s static values.
Measure / Survey edits show in the rendered map **instantly**, no pipeline
rebuild needed. Intersections and face fills stay static from the pipeline.

**Fills toggle = orientation mode.** Global toolbar button. Off = hide
StreetRibbons + MapLayers fills, keep line features (center stripes, edge
lines, bike lanes) + aerial visible. Operator uses this to visually align the
rendered map against the real aerial imagery.

**Glass-card styling.** Toolbar and each Panel section use the same glass
treatment as Stage (`.glass-panel` values from `src/index.css`, mirrored in
`.carto-glass` in `cartograph.css`): `rgba(0,0,0,0.25)` + blur(20px)
saturate(160%) + subtle border/shadow. Floating over the canvas so the map
shows through.

---

## 1. What the map is

A vector neighborhood map of Lafayette Square (St. Louis, MO) rendered as a Three.js
scene. The cartograph is the authoring tool — it shows the same 3D scene as the main
app but viewed from a flat, top-down orthographic camera. One renderer, two viewports.

The ground plane is built from **ribbon geometry**: each street is a set of
non-overlapping annular ring strips (asphalt, curb, treelawn, sidewalk) generated
from measured centerlines and cross-section profiles. Corner plugs merge sidewalks
at intersections using proven quadratic bezier curves. Block interiors are filled
with a single color per polygonized face based on dominant land-use classification.

**What renders:**
- **Streets** as ribbon rings (asphalt fill + curb edge, sidewalk/treelawn only where measured)
- **Land-use fills** (one color per block face: residential, commercial, park, etc.)
- **Buildings** (footprints positioned to assessor centroids)
- **Corner plugs** (sidewalk merge at intersections)

**Key constraint:** the system does NOT guess at sidewalks or treelawns. An unmeasured
street renders as pavement + curb only. Sidewalks appear only where the operator has
explicitly placed measurement bands. This prevents the map from showing inaccurate
geometry that the user would have to audit and undo.

The pipeline is intended to be reusable — it should not be Lafayette-Square-specific.
Avoid hardcoded coordinates, bespoke fixes, or one-off carve-outs unless truly
unavoidable. Generalizable always wins.

---

## 2. Data sources (inputs)

| File | Source | Contents |
|------|--------|----------|
| `cartograph/data/raw/centerlines.json` | Surveyor mode (seeded from block_shapes + OSM) | **PRIMARY**: 451 street centerlines with metadata (type, oneway, dead-end, loop, smooth). Each street has `_original` for revert. Editable in Surveyor mode. |
| `cartograph/data/raw/measurements.json` | Measure mode | Per-street cross-section overrides. Measurement bands define asymmetric left/right profiles. |
| `cartograph/data/raw/osm.json` | OpenStreetMap (one-time fetch) | All highway features, building footprints, landuse/leisure/amenity polygons. **Fallback** — centerlines.json takes priority. |
| `cartograph/data/raw/survey.json` | City Assessor + OSM sidewalk distance | Per-street `pavementHalfWidth`, lane count, oneway, cycleway. **Fallback** — measurements.json takes priority. |
| `cartograph/data/raw/elevation.json` | USGS National Map (cached) | Sparse elevation samples for building elevations and contour generation |
| `scripts/raw/stl_parcels.json` | St. Louis City Assessor (one-time fetch) | Parcel polygons with land_use_code, zoning, building_sqft, centroid, rings |
| `cartograph/data/neighborhood_boundary.json` | Hand-curated | Polygon defining what's "in the neighborhood" |
| `cartograph/data/clean/marker_strokes.json` | Marker mode | Freehand strokes for debugging — human → operator communication |
| `src/data/ribbons.json` | Pipeline output | Street ribbon geometry for Three.js rendering (streets, profiles, intersections, face fills) |

### CRITICAL: data file safety

These raw files are gitignored but **must never be re-fetched**. The 2026-04-05
incident: a `min_lon` change in `scripts/config.py` from `-90.2255` to `-90.2210`
caused a re-fetch that lost ~4 parcels and changed many parcel vertex positions
permanently. The original 2345 parcels are unrecoverable; we now have 2341 that are
slightly different.

- The correct `min_lon` is **`-90.2255`** (the true original value)
- `.gitignore` now tracks `stl_parcels.json`, `osm.json`, `survey.json`,
  `elevation.json`, `map.json`
- Before doing ANYTHING that re-fetches, back up the existing file first

---

## 3. Architectural principles

These are the load-bearing decisions behind the pipeline. Internalize before changing
the code.

### 3.1 Streets are the master grid
Streets (their measured centerlines + standard widths) define the quadrilateral grid
of the neighborhood. Block faces come from polygonizing the street network. Streets
are the AUTHORITY for "where blocks live."

### 3.2 Variable street/sidewalk gap is intentional
Lafayette Square is a historic neighborhood with non-standard, varied geometry. The
gap between street curb and sidewalk varies street-by-street and sometimes block-by-
block. We measure this from the actual data:
- `survey.json` provides per-street `rowWidth` and `pavementHalfWidth`. The difference
  `(rowWidth/2) − pavementHalfWidth` = the natural variable sidewalk + tree-lawn zone
  on each side
- OSM `footway=sidewalk` lines provide ground-truth confirmation of where sidewalks
  actually exist

### 3.3 Parcels do NOT define block shape
Parcels (assessor data) provide land-use classification and lot detail INSIDE blocks.
They are not the source of truth for block boundaries. The historical neighborhood has
multi-tenant lots, missing parcels, easements, and other irregularities that make
parcel unions an unreliable source for block geometry.

### 3.4 Buildings sit on blocks; they don't define them
Building footprints are decoration. A block exists because of the street grid, not
because there's a building there. Don't use building data to inform block shape.

### 3.5 Sidewalks confirm block existence (positive signal, not geometry)
OSM `footway=sidewalk` lines are inset from the actual block edge (drawn down the
centerline of the sidewalk concrete). They are NOT literal block edges. Use them as
a presence signal: "if there's a sidewalk in a region, that confirms there's a block
nearby." Use this as a fallback validation, not as geometry.

### 3.6 Visual smoothing belongs in the renderer, not the geometry pipeline
Clipper polygon operations should produce sharp-cornered polygons (`jtMiter` joins,
no arc tolerance bloat). All visual corner rounding happens in `render.js` via
`bezierPolyD()` (cubic Bézier corners). This keeps polygon vertex counts low and
gives clean, scale-independent visual output.

---

## 4. Procedure: how to build the map

### 4.1 Prerequisites (do once, then never re-run)
```bash
cd cartograph
node fetch.js              # one-time: fetch OSM data into data/raw/osm.json
node survey.js             # one-time: generate variance data into data/raw/survey.json
# stl_parcels.json should already exist in scripts/raw/ — DO NOT re-fetch
```

### 4.2 Build the map
```bash
cd cartograph
node pipeline.js --skip-elevation     # skips USGS fetch (uses cached elevation)
node render.js                        # generates SVG + preview HTML
open data/clean/preview.html          # view the result
```

### 4.3 Live preview with marker tool
```bash
cd cartograph
node serve.js                         # serves preview at http://localhost:3333
                                      # marker strokes auto-save to marker_strokes.json
                                      # /analyze endpoint reports parcels under strokes
```

The marker tool is the primary way for humans to communicate problem locations to
the operator. When the user says "look at the marker strokes," read
`data/clean/marker_strokes.json` and find which blocks/streets each stroke is near.

---

## 5. Pipeline stages (what happens inside `pipeline.js`)

```
[1] Load raw OSM      → data/raw/osm.json
[2] Snap coordinates  → snap.js (quantize to 0.01m grid)
[3] Derive layers     → derive.js
    [3a] Filter vehicular streets, alleys, sidewalks
    [3b] Polygonize street network → DCEL faces
    [3c] Classify faces (block / park / parking / island / fragment)
    [3d] Assign parcels to block faces
    [3e] Detect dead-end street endpoints
    [3f] Buffer streets → pavement polygons
    [3g] Build blocks per face (current: parcel-union with morph-close)
    [3h] Carve dead-end channels through blocks (Divide rule)
    [3i] Round corners, simplify
    [3j] Derive lot inset, sidewalk strip, alleys, contours
    [3k] Compute building footprints with assessor sizes
[4] Elevation         → USGS interpolation (cached)
[5] Write             → data/clean/map.json
```

`render.js` consumes `map.json` and produces `map.svg` + `preview.html`. It applies
neighborhood boundary filtering, bezier corner rendering, street labels, and the
marker tool UI.

### Key files
| File | Role |
|------|------|
| `pipeline.js` | Top-level orchestration |
| `node.js` | Snap streets to a planar graph (split at intersections) |
| `polygonize.js` | DCEL face extraction from the noded graph |
| `classify.js` | Tag faces as block / park / parking / island / fragment |
| `derive.js` | The big one — does block building, sidewalk derivation, lot inset, alleys, lamps, contours, and building enrichment |
| `render.js` | Convert `map.json` to SVG (bezier corners, layers, labels, preview HTML) |
| `serve.js` | Local dev server with marker tool persistence |
| `standards.js` | Constants for street widths, sidewalk widths, curb radii, etc. |

---

## 6. Block-building approach (current state)

For each polygonized face classified as `block`:

1. **`buildParcelBlock(faceParcels, faceRing)`** unions all parcels in the face using a
   morph-close (4m expand → union → 4m contract) at `jtRound` join with coarse
   `ARC_TOL`. Then `Clipper.CleanPolygon` at 3m removes footway-easement notches.

2. **Curve detection** — if the face has a long run of consecutive short edges (the
   densified S 18th Street arc), replace the parcel block with a face inset at
   `6.5 + sidewalkZone` so the block follows the curve.

3. **Loop-street cutting** — Benton Place and Mackay Place are CLOSED LOOPS. Their
   geometry is cut OUT of surrounding blocks so the sidewalk follows the loop curve.

4. **Dead-end Divide rule** — for each dead-end street endpoint inside a face, buffer
   the street segment by `halfWidth + sidewalk + 2m` and subtract from the block.
   This carves a road channel from the block at the dead end.

5. **roundCorners (jtMiter)** — apply two passes of shrink-expand at `jtMiter` joins
   for smooth structural corners (no arc vertex bloat).

6. **Sidewalk inset** — `shrinkPaths(block, sidewalkWidth)` produces the lot polygon.
   The block is the outer ring; the lot is the inner inset; the sidewalk strip is
   `block − lot`. Both render in `render.js` via `bezierPolyD` for smooth corners.

7. **Land use classification** — count parcels per `land_use_code`, dominant code
   determines the lot fill class (residential / commercial / vacant / etc).

### Files relevant to block building (line numbers approximate)
- `derive.js:1038` — vehicular street filter
- `derive.js:1100-1120` — densify S 18th curve, extend LaSalle
- `derive.js:1123` — `nodeEdges(streetPolylines)`
- `derive.js:1124` — `polygonize(nodedSegments)`
- `derive.js:1316` — assign parcels to block faces
- `derive.js:1438` — dead-end vertex detection (uses noded segments)
- `derive.js:1354` — `buildParcelBlock` function
- `derive.js:1413` — `buildFaceBlock` (face inset fallback)
- `derive.js:1533` — block building loop per face
- `derive.js:1668` — dead-end "Divide" treatment
- `derive.js:1763` — roundCorners + add to allBlockPaths
- `derive.js:1808` — loop street median creation
- `derive.js:1822` — sidewalk strip / lot inset

---

## 7. The work-in-progress problem — REFRAMED 2026-04-07

> The previous operator (§7 in earlier revisions) framed the WIP as "dead-end Place
> streets fail to split faces, leaving missing corner blocks." A long diagnostic
> session on 2026-04-07 disproved that framing for the markers actually on the map.
> Read this section in full before touching any code. It's the most important part
> of this document right now.

### 7.1 What the user actually circled

There are 6 marker strokes in `data/clean/marker_strokes.json` (as of 2026-04-07).
Their centers, the nearest named features, and what layer they fall into:

| # | Center (m)   | Size  | Nearest features              | In any layer? |
|---|--------------|-------|-------------------------------|---------------|
| 0 | (360, -196)  | 46×49 | Mississippi Alley, Rutger ~30m| **void**      |
| 1 | (517, -157)  | 46×27 | service+footway, Dolman ~30m  | **void**      |
| 2 | (288, -37)   | 43×24 | footway+service, Vail Pl ~26m | **void**      |
| 3 | (541,  45)   | 56×82 | service, Truman/Dolman ~33m   | **void**      |
| 4 | (-253,-282)  | 55×52 | 3 service ways, Park Ave ~44m | **void**      |
| 5 | (-217,-197)  | 39×31 | service+footway, Park Ave ~33m| **void**      |

Five of six are nearest to **alleys / service ways**, not to dead-end Place streets.
Only stroke 2 is even *near* a Place (Vail), and it's mid-frontage, not at the tip.
**These are mid-block voids, not corner-lot omissions.** §7 in the previous revision
was solving the wrong problem for these markers.

### 7.2 Diagnostic done, results

A diagnostic with **proper hole testing** (point-in-polygon must respect ring holes,
not just outer rings) confirmed: **all 6 stroke centers lie in pure void** — outside
every block, every pavement polygon, every alley feature. They sit in the geometric
gap between the parcel-union block edge and the street/alley pavement edge, with
gaps of **5–17 m** wide.

A false lead during the diagnostic: an early pass showed 5/6 strokes "inside the
pavement layer" with one giant 2679×2520 m pavement polygon containing 80 holes.
That suggested a street-buffer winding/orientation bug. **It was a mistake in the
diagnostic** — the test ignored hole rings. The pavement polygon has a huge bbox
because the connected vehicular street network (incl. I-44 ramps, Truman Pkwy,
Jefferson Ave) extends well past the visible neighborhood, but the *filled area*
is just thin ribbons with 80 block-shaped holes. **There is no pavement-layer bug.**
Don't go down this path again.

### 7.3 Mechanical cause of the voids

Blocks are built from `buildParcelBlock()` (`derive.js:1354`), which morph-closes
the assessor parcel union. Assessor parcels stop at the property line, not the
ROW edge. The property line is usually back-of-sidewalk, not curb. So the block's
perimeter sits 5–17 m inside the actual face boundary. The 4 m morph-close is too
small to bridge that, and there's nothing else trying to fill the space, so it
renders as void (sometimes pavement-shaped on the outside, but inside the block hole).

### 7.4 The deeper conceptual problem (USER-CONFIRMED 2026-04-07)

While debugging the above we worked out — through several dead ends — what's
*actually* wrong with the model. Quoting and synthesizing the user:

> "Alleys don't get sidewalks. My plan was that alleys render over the block and
> clip to the block or join to the street."

> "There are many places that are paved with concrete that aren't street or
> sidewalk. There are big lawns around the park. The stores that front onto Park
> Avenue by the park have sidewalks 3 or 4× the usual width."

> "The treelawn and sidewalk is attached to the blocks." (i.e., the gap between
> curb and the block edge is NOT a separate zone — it's part of the block.)

> "We worked pretty hard to formalize the streets; if everything is going to come
> from the streets do we need to go back to the streets for the final real cleanup?"

The reframe that came out of this conversation:

**The model has been trying to express THREE categories of ground using only TWO
layers (street + block). The missing third category is "infrastructural space" —
concrete that is neither street nor block-sidewalk:**

- The plaza-like sidewalks in front of the Park Avenue commercial strip
- The wide aprons and lawns around Lafayette Park
- Civic forecourts, ceremonial pavers, oversized sidewalks at notable buildings

Currently these get absorbed into whichever neighbor "wins" the geometry fight,
and none are right.

The cleaner mental model the user converged on:

```
STREET PAVEMENT  →  curb-to-curb fill, includes parking and bike lanes
                    halfwidth = pavementHalfWidth
   |
   curb  ← THE single primitive that defines the block edge
   |
BLOCK            →  everything inside the curb that's "land"
                    INCLUDES tree-lawn AND sidewalk strip on perimeter, plus
                    interior lots and buildings.
                    Block edge = the curb itself, NOT back-of-sidewalk,
                    NOT ROW outer edge, NOT property line.
   ⤷ subdivided visually into: sidewalk strip (perimeter inset) + lot (interior)

INFRASTRUCTURAL  →  paved-but-not-street, not-block (NEW, DOESN'T EXIST YET)
                    ~5-10 polygons, hand-curated, rendered on top of blocks
                    in a sidewalk-ish but distinct color
```

**Implication for the pipeline:** parcels stop being a geometry source. They become
a *land-use classifier and building positioner only*, used to color the lot fill
and place building footprints. **Block geometry comes from streets** — specifically,
each polygonized face has its block built by offsetting each bordering street
inward by `pavementHalfWidth` (so the block edge sits exactly at the curb). The
sidewalk strip is then inset from the block by a sidewalk width as today.

The user has correctly noted that this means the streets are now load-bearing for
the entire pipeline, and any cleanup of blocks goes back to cleaning streets.

### 7.5 Risks and open questions for this reframe

Before any code changes, the new operator should think through:

1. **Are the OSM street centerlines actually clean enough to offset cleanly?**
   The user has done significant work — `survey.json`, `correctedSurvey` overrides,
   `dividedStreets`, S 18th densification, LaSalle extension, loop-street handling.
   Streets are the most-curated layer in the pipeline. But "good enough to use as
   the only geometry source" is a higher bar than "good enough as a master grid
   for polygonize." Test before committing.

2. **Variable, irregular setbacks.** Some lots are *deeper* than the uniform
   pavementHalfWidth offset would suggest (corner clip-offs, churches with
   ceremonial setbacks, the school on Park Ave). A pure street-offset model loses
   these. The user is *willing* to lose them in exchange for a clean curb network,
   but verify on the spike.

3. **Per-edge street resolution.** To offset each face edge by the right amount,
   the new code needs to know which OSM street each face edge came from. The DCEL
   from `polygonize.js` has half-edge → source-segment back-pointers; the resolution
   plumbing is probably already there but should be verified before building on it.

4. **"Infrastructural space" data.** This is a curated polygon list (~5-10 features
   for Lafayette Square). It does not yet exist anywhere. Spec to confirm with user:
   file location (`data/raw/infrastructural.json`?), schema (id, name, ring,
   render class), where in `derive.js` it's loaded, where in `render.js` it's drawn.

### 7.6 Recommended next move (the spike)

Do NOT start with a full reframe. Do the smallest possible test of the reframe:

1. Pick one face you trust visually (e.g., a typical interior block on Mississippi
   Avenue between two cross streets).
2. Build that one block by **only** offsetting its bordering polygonized face edges
   inward by their `pavementHalfWidth` (lookup via `correctedSurvey` / `survey.json`,
   fall back to `STANDARDS`). Discard the parcel union for this experiment.
3. Render it alongside the current parcel-union block for the same face.
4. Visual diff. Does it look right? Does it touch the curb everywhere it should?
   Does the sidewalk inset still work? Are the corners clean?

If the spike looks right, plan a phased migration. If it looks ragged because OSM
centerlines aren't clean enough, the next investment is in cleaning street data
(possibly a curated street centerline file), not in plugging block-builder bugs.

### 7.7 Things explicitly OFF the table now

- **Per-edge variable inset of the parcel-union block by `(rowWidth/2 − pavementHalfWidth)`.**
  This was proposed mid-conversation as a "plug" fix. The user objected: it
  treats block-edge as a derived quantity that needs coaxing into alignment with
  pavement-edge, instead of treating it as the curb itself. Drop this approach.

- **Dead-end Place projection / chord-splitting** (the previous §7 proposal).
  Not relevant to the markers actually on the map. There may still be missing
  corner lots at dead-end Places, but that's a separate problem from what's
  currently circled. If it comes back, address it after the reframe.

- **Pavement layer fixes / megablob hunting.** There is no pavement layer bug.
  The "megablob" was a diagnostic mistake from ignoring hole rings.

---

---

## 8. Recently fixed issues (so you don't redo them)

| Issue | Fix | When |
|-------|-----|------|
| Sidewalk footway notches | `Clipper.CleanPolygon` at 3m after morph-close | 2026-04-03 |
| Street width / sidewalk overlap | `render.js` uses `pavementHalfWidth × 2` (curb-to-curb) instead of full ROW; `survey.js` computes pavement from lane geometry | 2026-04-03 |
| S 18th curve | Catmull-Rom densification at 3m of "West 18th Street" OSM segment in both `derive.js` and `render.js`; LaSalle extended to meet S 18th | 2026-04-03 |
| Land-use lot coloring | Per-class CSS rules driven by dominant parcel `land_use_code` | 2026-04-03 |
| Building relocation | `deriveBuildings()` translates OSM footprint to assessor centroid | 2026-04-05 |
| Neighborhood boundary | `data/neighborhood_boundary.json` polygon filters what renders | 2026-04-05 |
| Polygon vertex bloat (jagged blocks) | `roundCorners` and `shrinkPaths` use `jtMiter` (no arc vertices); visual rounding moved to `render.js` `bezierPolyD()` | 2026-04-06 |
| Smooth block corners at all zoom levels | `bezierPolyD()` in `render.js` emits cubic Bézier curves at corners; straight edges stay as `L` commands | 2026-04-06 |
| Benton/Park corner gap | Park-parcel exclusion only for actual park land-use codes (4800 series) | 2026-04-03 |
| Reframed mid-block voids diagnosis | Confirmed via marker-stroke diagnostic that voids are gap between parcel-union block and curb, not a polygonize / pavement bug. See §7. | 2026-04-07 |

---

## 9. Things that have been TRIED and DID NOT WORK (don't redo these)

- **Excluding dead-end streets from polygonize input** by per-OSM-way endpoint degree.
  Result: misidentified Park Avenue, Lafayette Avenue, Chouteau Avenue, etc. as
  dead-ends because their OSM ways are split into many segments and per-way endpoints
  don't snap perfectly. Lost the entire Park Avenue corridor.
- **Polygonizing OSM sidewalks instead of streets** as the primary face source.
  Result: 86% of sidewalk endpoints are degree-1 (don't connect). Even at 1m snap
  it's 60%. Only 85 face-cycles emerge vs 106 baseline blocks; many fragments and
  duplicates. Sidewalks are useful as a presence signal, not as primary geometry.
- **Using building footprints to fill block gaps via parcel "rescue"** logic.
  Result: extends blocks to where buildings exist, but the user explicitly rejected
  this — buildings sit on blocks; they don't define them.
- **Face-fill via face-polygon inset union** with morph-close result.
  Result: blocks extended into streets (lamp-inside-block jumped from 10% → 19% in
  validation). Inset distances vary too much to use a uniform value.
- **Street-buffer orientation flip + SimplifyPolygons on `streetBufferPaths`** to
  fix a phantom "megablob" pavement polygon (2026-04-07). The megablob doesn't
  exist; it was a diagnostic mistake from skipping hole rings in point-in-polygon.
  Pavement layer is fine. Don't touch the pavement union code in pursuit of this.

---

## 10. Style & quality rules

- **No idiosyncratic fixes**: every change should be principled and generalizable.
  This pipeline must work for OTHER neighborhoods, not just Lafayette Square.
- **No global fixes for local problems**: scope each fix tightly. If something
  breaks one corner, don't apply a global pipeline change to fix it.
- **Curated > automated**: prefer hand-tuned data sources where they exist (the
  `survey.json` ROW values, the `correctedSurvey` overrides in `derive.js`).
- **Don't propose collecting PII**: this map is public-facing. No phone, email,
  real names tied to addresses.
- **Streetlamps must render on lot or sidewalk, never in street**: this is a hard
  constraint. Validation prints `Lamp validation: N/641 lamps inside blocks (N%)`
  at the end of the pipeline. Baseline target: ~10%. If your change pushes this
  significantly higher, blocks are extending into streets — investigate.

---

## 11. Cartograph application modes

The cartograph is a Three.js app with an orthographic top-down camera. It renders
the same scene as the main app (StreetRibbons.jsx) viewed flat. Four modes:

### 11.1 Marker mode
Freehand strokes for debugging. Human→operator communication channel.
Strokes persist to `data/clean/marker_strokes.json`. The `/analyze` endpoint
reports which blocks/parcels overlap the marker bbox.

### 11.2 Surveyor mode
Centerline editor. The operator cleans up street geometry and sets metadata.

- Click a street to select → shows editable centerline with draggable nodes
- Metadata panel: name, type, one-way, dead-end, loop
- Smooth slider (0–100): Catmull-Rom tension for curved streets
- Toggle Node (hide/show individual points), Toggle Street (disable/enable)
- Revert to Original (restores `_original` from seed data)
- Arrow key nudging (0.15m, shift = 1.0m)
- Exit surveyor → saves centerlines.json → rebuilds pipeline → reloads

Data: `data/raw/centerlines.json` (451 streets, seeded by `seed-centerlines.js`)

**Surveyor defines WHAT and WHERE.** Type, direction, topology, geometry.

### 11.3 Measure mode
Cross-section editor. The operator defines per-side widths from aerial imagery.

- Click-click line placement with waypoints
- Per-segment material assignment (asphalt, concrete, brick, etc.)
- Drag endpoints and waypoints, arrow-key nudging
- Aerial overlay with centerlines as reference

Data: `data/raw/measurements.json` (per-street cross-section overrides)

**Measure defines HOW WIDE.** Asymmetric left/right profiles supported.
Only measured cross-sections render — no default sidewalks or treelawns.

### 11.4 Design mode (planned)
Styling controls for the composed map:
- Material colors (asphalt, curb, land-use fills)
- Per-layer strokes (color + width, like Photoshop layer effects)
- Font and text treatments for street labels
- **Launch button** → opens the main app (localhost:5175) with same scene +
  lighting, shadows, terrain, post-processing

### 11.5 Data flow
```
Surveyor → centerlines.json (geometry + metadata)
                ↓
Measure  → measurements.json (per-side cross-section overrides)
                ↓
         survey.json + standards.js (fallbacks)
                ↓
         Pipeline (derive.js) → ribbons.json (ribbon geometry + face fills)
                ↓
         StreetRibbons.jsx ← ONE RENDERER
            ↓                    ↓
   Cartograph (flat)      Main app (3D)
   orthographic cam       perspective cam
   surveyor/measure       lighting/terrain
```

### 11.6 Authority stack for cross-section profiles
```
1. measurements.json  (operator-measured, per-side)     ← highest
2. survey.json        (OSM sidewalk distance + assessor ROW)
3. standards.js       (generic defaults by street type)  ← lowest
```

Only measured data produces sidewalk/treelawn rings. Survey and standards
provide pavement width only.

---

## 12. Build commands cheat sheet

```bash
cd cartograph

# Seed centerlines (one-time, or delete centerlines.json to re-seed)
node seed-centerlines.js

# Full pipeline rebuild
node pipeline.js --skip-elevation

# Legacy SVG preview (being replaced by Three.js cartograph)
node render.js && node serve.js  # http://localhost:3333

# Copy ribbons to app data
node -e 'const m=require("./data/clean/map.json"); require("fs").writeFileSync("../src/data/ribbons.json", JSON.stringify(m.layers.ribbons,null,2))'

# Inspect data
node -e 'const r=require("../src/data/ribbons.json"); console.log("streets:", r.streets.length, "ix:", r.intersections.length, "faces:", r.faces?.length)'
node -e 'const c=require("./data/raw/centerlines.json"); console.log("centerlines:", c.streets.length)'
```

### serve.js endpoints
| Method | URL | Purpose |
|--------|-----|---------|
| GET/POST | `/markers` | Marker strokes |
| GET/POST | `/measurements` | Measurement data |
| GET/POST | `/centerlines` | Surveyor centerline data |
| GET | `/analyze` | Report parcels/blocks under markers |
| POST | `/rebuild` | Run render.js, return when done |

---

## 13. Three.js ground plane (StreetRibbons)

The ground plane is native Three.js ribbon meshes rendered by `StreetRibbons.jsx`.
This component renders the ENTIRE neighborhood from `src/data/ribbons.json` — 122
streets, 180 intersections, 99 face fills. It is used by both the cartograph
(orthographic top-down) and the main app (3D perspective).

### Ring model (WORKING for all 122 streets)

Each street material is a non-overlapping **ring** (annular strip, inner→outer HW),
split at IX into left/right halves. Materials don't overlap on the same street, so
there are NO priority conflicts between same-street layers.

Priority (only matters at crossings where streets overlap):
face_fill(1) < treelawn(3) < sidewalk(5) < curb(6) < asphalt(8)

**Default rendering:** pavement + curb only. Sidewalk and treelawn rings only appear
where the operator has explicitly measured them. The system does not guess.

### Face fills (WORKING)

Each polygonized block face gets a single flat color from its dominant land-use
classification (residential, commercial, park, etc.). 99 faces, rendered at
priority 1 (lowest). Streets render on top.

### Corner plugs (WORKING on Rutger × Missouri, not yet all intersections)

### Conceptual model (established 2026-04-13)

**Streets are positive geometry. Blocks are negative space.**

The street cross-section profile — asphalt, treelawn, sidewalk — is the authoritative
geometry, measured via the cartograph measurement tool. The block is whatever land
remains after the streets and their full cross-sections are accounted for. The block
is never explicitly constructed in this context.

At a corner, two streets meet. The corner problem is: **extend the outermost street
materials around the bend where two cross-sections meet.** This is additive to the
street, not subtractive from the block. There is no "void" to fill — the black area
at the intersection is asphalt (road surface), which is already correct.

**Curb is aesthetic, not measured.** The curb is a colored edge rendered along the
outer boundary of the asphalt, wherever asphalt meets sidewalk or treelawn. It has
configurable color and width but is NOT a measured material in the cross-section
profile. It does not participate in the measurement tool scheme.

### Corner band: what it is

The corner band is **sidewalk** (or grass, if neither street has sidewalk at that
edge). It extends the outermost pedestrian material from one street around the
bend to the other street.

**Shape:**
- **Outside edge (toward the block):** two straight lines meeting at angle θ,
  where θ is the actual angle between the two streets. This is the block corner /
  property line. NOT assumed to be 90° — θ is a real variable computed from street
  directions at the intersection.
- **Inside edge (toward the street):** quadratic bezier curve. This is the curb
  line rounding the corner — the physical curve a pedestrian walks along.

The band is a wedge-like shape: thick at the middle of the curve, tapering to zero
where it meets each arm (because at those points the arm's sidewalk ring is already
the full width).

**Sidewalk arms merge at the corner.** Both streets' sidewalk rings flow into the
same corner band. There is no "which street owns the corner" — the corner is the
merge zone where both sidewalks meet, just as in real life (you walk down one
sidewalk, the corner curves, you're on the other sidewalk).

**Treelawn always dead-ends** before the corner (ADA curb ramp constraint). The
sidewalk fills through behind the treelawn's blunt end.

### Corner materials by case

| Street A outer | Street B outer | Corner band material |
|----------------|----------------|---------------------|
| Sidewalk       | Sidewalk       | Sidewalk (merge)    |
| Sidewalk       | Treelawn       | Sidewalk (treelawn dead-ends) |
| Treelawn       | Sidewalk       | Sidewalk (treelawn dead-ends) |
| Grass          | Grass          | Grass (merge)       |

### Proven corner bezier (reuse this, don't re-derive)

The quadratic bezier with ctrl = 2×mid(P0,P1) − oo has been validated across all
4 quadrants with the oo↔ii distance-check swap. This curve:
- Bows inward (toward IX), rounding the corner
- Is tangent to both streets' straight edges at the endpoints

DO NOT change the bezier formula. It works.

### Things extensively tried that DID NOT WORK (don't redo)

| Approach | Why it failed |
|----------|---------------|
| **Filled ribbons** (center→halfWidth, overlapping layers) | Treelawn/sidewalk overlap on same street; polygonOffset doesn't reliably resolve z-fighting between them |
| **Fan from oo** (triangle fan radiating from block corner) | PBR lighting produces different colors per-triangle due to position-dependent shadow sampling; visible radial artifacts even in merged mesh |
| **Fan from IX** (triangle fan radiating from intersection) | Same PBR artifact, plus the fan center is inside the asphalt zone |
| **Circular arcs centered at IX** | Arc is tangent to arm ring outer edge (same radius); can never extend past the straight edge, so rounding is invisible |
| **Proportional scaling from oo** | Crushes thin layers (curb becomes sub-pixel at the corner) |
| **Merged mesh (same-material rings + fans in one BufferGeometry)** | Did NOT fix color mismatch — PBR shading is position-dependent, not draw-call-dependent |
| **Filled ribbon + arc fans** | Required overlapping layers with priority; treelawn interrupted by sidewalk due to z-fighting |
| **Y offsets between layers** | Causes visible color/lighting differences with MeshStandardMaterial (shadow map position-dependence) |
| **Large polygonOffset multipliers** | "No visible change" — polygonOffset alone cannot resolve coplanar z-fighting in this setup |
| **Stencil buffer clipping** | R3F/Three.js stencil props had no visible effect |
| **Custom shader discard** | Crashed WebGL context |
| **Overlay patches / corner fills at higher priority** | Adding geometry on top of arm strips doesn't remove the sharp L-corner underneath; the patch is either invisible (same color over same color) or creates seams (different mesh = different PBR shading) |
| **Arc geometry near IX** | Buried under full-length asphalt (pri 8 > sidewalk 5); never visible |
| **Per-material corner bands (curb + sidewalk as separate bands)** | Curb is now aesthetic, not a measured band; only one corner band needed (sidewalk) |

### Architecture decisions (locked)

- **Rings, not filled ribbons**: non-overlapping annular strips per material.
  Priority only needed at crossings (asphalt vs everything else).
- **Treelawn never arcs**: dead-ends at corner. Sidewalk fills the curb ramp area.
- **Curb is aesthetic**: a colored edge along the asphalt outer boundary, not a
  measured ring. Configurable color/width, rendered as a visual stripe. Not part
  of the cross-section measurement scheme.
- **Streets are positive, blocks are negative**: the corner band extends the street
  outward, it does not cut into or modify a block polygon.
- **Angle θ is a real variable**: streets don't always meet at 90°. All corner
  geometry must work for any intersection angle.
- **Sidewalk arms merge at corners**: no "ownership" — both streets' sidewalks
  flow into a single corner band.
- **Three.js meshes**: BufferGeometry with MeshStandardMaterial, receiveShadow.
  Must accept terrain and lighting (this surface is the base of a 3D scene).
  All coplanar at Y=0 within the group (group at Y=0.15 world).
- **Coordinates**: [x,z] = Three.js [x,z] directly.
- **NEVER use Y offsets** for coplanar stacking; polygonOffset only.

### Key files

| File | Purpose |
|------|---------|
| `src/components/StreetRibbons.jsx` | Three.js ribbon renderer (arms + corner plugs + face fills) |
| `src/components/Scene.jsx` | Mounts StreetRibbons in the main app scene |
| `src/data/ribbons.json` | Pipeline output: streets, profiles, intersections, face fills |
| `cartograph/data/raw/centerlines.json` | Surveyor-edited street centerlines (canonical) |
| `cartograph/data/raw/survey.json` | Per-street pavement widths (fallback) |
| `cartograph/data/raw/measurements.json` | Per-street cross-section overrides (highest authority) |
| `cartograph/seed-centerlines.js` | One-time script to generate centerlines.json from curated + OSM |
| `cartograph/serve.js` | Dev server with endpoints for markers, measurements, centerlines, rebuild |

---

## 14. Glossary

- **Face**: a closed polygon produced by polygonizing the street network (DCEL output)
- **Block**: the rendered land between streets — derived from a face via parcel union or face inset
- **Lot**: the inner area of a block, after the sidewalk perimeter is inset
- **Sidewalk strip**: the perimeter ring `block − lot` (rendered in sidewalk color)
- **Tree lawn**: the grass/planting strip between curb and sidewalk concrete
- **ROW**: right-of-way (full assessor width including pavement, curbs, tree lawn, sidewalks)
- **Dead-end Divide**: the rule that carves a road channel from a block where a dead-end street terminates inside it
- **Loop street**: a closed-loop street like Benton Place or Mackay Place (rendered with a green median)
- **Morph-close**: ClipperOffset expand → union → contract — fills small gaps between adjacent polygons
- **bezierPolyD**: the render-side function that converts a sharp polygon ring into a Bézier-cornered SVG path
