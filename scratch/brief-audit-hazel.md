# Brief audit — Hazel

Auditor: Hazel (advisory baby; reads + flags, does not modify briefs)
Date: 2026-05-22
Scope: Briefs 6, 7, 8, 9, 10 in `scratch/`

Per-criterion register below for each brief. Categories: Hidden dep, AC, Doctrine, Scope drift, Prereq, Sequencing, File conflict, Footgun, Discipline, Vibe. Citations point to brief line numbers.

---

## Brief 6 — Geometry-Aware Tree Decimation Pass (`brief-decimation-pass.md`)

### Hidden dep
- None substantive. Brief is correctly framed as orthogonal to 7/9/10. Touches `publish-glb.js` + upstream generators only; runtime is out of scope.

### AC
- **AC 4 / AC 5 ("no perceptible silhouette difference")** is operator-eye-only. Acceptable but should be tagged explicitly as operator-eye, not algorithmically verifiable. Currently the brief implies the baby self-verifies via screenshot comparison; that's not a real verification — Jacob will need to sign-off. Recommend: "operator sign-off required after baby provides before/after screenshots."
- **AC 2 (~30% reduction average)** — averaging across 5 species could be gamed by one species over-decimating. Suggest reporting per-species AND the average.
- **AC 6 (byte-identical sha1)** assumes deterministic node ordering inside `gltf-transform`. Worth flagging that gltf-transform's `Document` is not guaranteed deterministic on iteration; verify before relying on sha1 stability. (Birch verified sha1 for `generate-salon.js`, but that's a different write path.)

### Doctrine
- Honors `feedback_smallness_as_precondition` (load-bearing, called out at line 37, 91).
- Honors `feedback_beautiful_first_lightweight_51`.
- Honors `project_vendor_leaf_topologies` correctly — lines 54–56 distinguish card-based (lever applies) from connected-mesh (let Meshopt handle). Good.
- `feedback_unique_program_cache_key_before_wrappers` is correctly noted as inapplicable (bake-time only) — line 95.

### Scope drift
- Brief lists "Surface anything not in this brief" comprehensively (lines 215–225). ✓

### Prereq
- References `arborist/BACKLOG.md` "~line 605" for the quality-bracket sub-item (line 48). I did not verify the line; coordinator should confirm before dispatch — line refs in BACKLOG drift fast.
- References `arborist/survey-deleaf.js` (line 50) — verified to exist.
- References `project_writeifchanged_touches_mtime`, `project_view_aware_baking`, `project_vendor_leaf_topologies` — all exist in memory.

### Sequencing
- Brief 6 is correctly orthogonal — can ship before, parallel-to, or after Brief 7. No dep on 7/8/9/10.

### File conflict
- Brief 6 declares NO modifications to `treeAtlasMaterial.js`, `InstancedTrees.jsx`, `bake-look.js`, `bake-trees.js`, `survey-deleaf.js`. Zero file-surface overlap with 7/8/9/10. ✓

### Footgun
- **`bake-tree.py` is Python; decimate-tree.mjs is Node.** Line 179: "+5 LOC" to wrap a Node script from Python via subprocess. Operator-side dispatch pattern (env, cwd, exit-code handling, JSON IO) is not specified. Surface concretely; a brief that says "+5 LOC" here is hand-wavy.
- **Determinism + idempotency interact** (AC 6 + 7). Two runs same input → byte-identical. Re-running on already-decimated input → byte-identical no-op. Both true imply the decimator must detect "already decimated" via a metadata stamp (else it re-runs lever 1–3 and may produce a different-but-stable output). Brief doesn't specify the stamp.
- **Lever 3 (canopy-hull leaf reduction) assumes leaf cards have detectable centroids**, but for the connected-mesh class (Linden) line 56 admits cards don't exist. Brief should explicitly say lever 3 is **skipped** for connected-mesh, not just "may not apply." Today it's ambiguous — a baby could try to compute centroids on Linden's sculpted mesh and produce nonsense.
- **`heightRange` reference (line 142) — does it exist in chassis metadata today?** Brief assumes yes. Worth spot-checking before dispatch.

### Discipline
- Identity-first preamble present (line 3). ✓
- Second-person voice throughout. ✓
- "Surface anything not in this brief" clause present (line 215). ✓

### Vibe
- Reads as written FOR a baby. Doctrine is foregrounded, levers are concrete, file plan has LOC budget. Strong brief. The architectural levers (1–4) are well-justified; Lever 4's "iterate until in bracket" loop is the only soft spot — could under-specify what "tighten levers" means in code.

---

## Brief 7 — Salon Preview Atlas (`brief-7-salon-preview-atlas.md`)

### Hidden dep
- Brief assumes `bake-look.js` exports `compileGradientLUT`, `gradientSha1`, `bakeGradientAtlas`, `unifyAtlases` (line 174). **Verified** — all four exist at bake-look.js:149, 186, 194, 397. ✓
- Assumes `applyBarkUniforms` is reusable as-is with a "preview-shaped manifest" (lines 42, 177). Birch's handoff says it works. Worth confirming the live patch from Brief 2.1 still exposes the signature the brief assumes.
- Assumes Brief 2.1's `gradientHashAmpByRef` slot exists in `trees-atlas.json` shape (line 44). Birch shipped it; verify before dispatch.

### AC
- **AC 10 (`trees-atlas.json` byte-identical before/after Brief 7)** is verifiable and good.
- **AC 6/7 perf budgets** (<1s full, <200ms gradient-only) are stretchable; if baby misses, will be tempted to "good enough." Suggest fail-loud thresholds vs nice-to-have.
- **AC 11 ("All other Brief 2.1 effects fire live")** is a multi-item assertion bundled into one criterion. Split per-effect (gradient, hashAmp, detail, tintBase, leaf-pack) so partial regressions are catchable.

### Doctrine
- LOAD-BEARING: this brief IS the implementation of `feedback_salon_preview_is_authoring_surface`. Doctrine memory is correctly cited (line 26, 210).
- `feedback_atlas_subregion_uv_recovery` (line 215) — brief notes UV-rewrite work; subregion recovery is not explicitly required here because the preview atlas is being constructed FRESH (no existing-bake aliasing). Worth a one-line acknowledgment that recovery math is N/A for fresh-built preview-atlas tiles.
- Single shader program / single atlas binding — both called out (AC 4, AC 5). ✓
- `feedback_unique_program_cache_key_before_wrappers` — line 216. Brief mounts `treeAtlasMaterial` directly without wrapping; if a baby adds an `onBeforeCompile` patch for wind chunks (line 110–112) it should preserve `customProgramCacheKey`. Worth one explicit line.

### Scope drift
- Surface clause present (line 183). Good list of candidates.

### Prereq
- `public/trees/_chassis/<name>.glb` (Birch handoff point 2, line 40) — **verified to exist** (acer_saccharum_*.glb present in `_chassis/`).
- `bake-look.js` UV-rewrite helper (Birch point 2): brief says "extract to a helper if not already factored." Worth scoping LOC budget for that extraction; otherwise the +400 LOC estimate for `salon-preview-atlas.js` floats.

### Sequencing
- Brief 7 is upstream of Brief 9 (Brief 9 reads "wind chunks live in `treeAtlasMaterial.js` (the shared material post-Brief 7)") and Brief 10 (Brief 10 line 164 explicitly says Brief 7 must land first). Order in Boz's queue (7 → 8, 9, 10) is correct on this axis. Brief 8 parallel.

### File conflict
- **Brief 7 + Brief 9 BOTH touch `SpecimenViewport.jsx`.** Brief 7 removes Brief 2.1's gradient chunk replication + adds wind-chunk patch on `treeAtlasMaterial`. Brief 9 then REMOVES the wind chunks from `SpecimenViewport` and promotes them into `treeAtlasMaterial.js` itself. Sequencing 7→9 is consistent BUT Brief 7's intermediate state (wind chunks on `onBeforeCompile` wrapping `treeAtlasMaterial`) needs a clear contract for Brief 9 to delete from. Brief 7 line 111–112 says wind chunks stay on `SpecimenViewport.jsx`'s patch path — Brief 9 will rip those out. As long as the patch is grep-able (the Birch precedent: comment-flagged "retired by Brief 9" markers), this is clean. **Recommend Brief 7 add the same retired-by-Brief-9 marker convention for the wind chunks.**
- **Brief 7 + Brief 10D BOTH touch `salon-preview-atlas.js` and `SpecimenViewport.jsx`.** Brief 10D explicitly waits for Brief 7. ✓

### Footgun
- **`/tmp/salon-preview/` cleanup ambiguous** (line 179). Brief acknowledges `os.tmpdir()` semantics may vary; suggests "use a known path under repo root if needed." But there's a real choice to make: macOS dev wipes `/tmp` on reboot; production server may not. Baby should not be left to pick. Recommend: pin to `arborist/state/.preview-atlas-cache/` (or similar repo-relative) so it's predictable.
- **Atomic rename** (line 180) — write-temp-then-rename is correct but needs to be specified at both atlas PNG AND chassis GLB writes, and the workstage fetch ordering needs to wait for the POST response (not fire pre-rename). Brief implies this; could be tighter.
- **Per-composition isolation key `(species, slot)`** (line 139). Slot numbering — Brief 8 also keys on slot (line 64). Consistent. ✓
- **Wind chunks on a `treeAtlasMaterial` patch path (line 111–112)** — the patch interleaves with `treeAtlasMaterial`'s own `onBeforeCompile`. Brief should specify whether the wind patch chains via prev-call delegation or replaces the patch wholesale. Cache-key collision risk if not handled.

### Discipline
- Identity-first preamble (line 3). ✓
- Surface clause present (line 183). ✓
- Memory refs listed (line 207–217). ✓

### Vibe
- Strong brief. Birch's handoff observations are integrated cleanly (lines 34–48). The "two rebuild tiers" architecture is concrete. The deletion targets are grep-able ("retired by Brief 7" markers) — operationalizes the doctrine well.

---

## Brief 8 — Salon canary setter (`brief-8-salon-canary-setter.md`)

### Hidden dep
- Brief assumes Grove has the canary writer at the contract shape `{species, variantId, lookId}`. **Verified** — `Grove.jsx:66` writes exactly `localStorage.setItem('meteorologist-canary-tree', JSON.stringify(payload))` with that payload. ✓

### AC
- **AC 2 (DevTools verify)** is fine but operator-eye.
- **AC 3 (Meteorologist sibling-tab swap)** — depends on Meteorologist `CanaryScene` being mounted; not in the baby's control. Acceptance criterion should clarify the test scenario (operator opens Meteorologist in a separate tab).
- **AC 6 (Active visual indicator)** — read localStorage on mount + subscribe to `storage` events. The `storage` event does NOT fire in the writing tab, so a within-tab indicator needs the `setSalonCanary` action to also update a local store atom. Brief 8 surfaces this (line 97). Good.

### Doctrine
- `project_kit_helpers_pattern` (frozen-seam discipline) — brief explicitly preserves the contract (line 23–24, 113). ✓
- No new feedback or doctrine concerns.

### Scope drift
- Surface clause present (line 101). ✓
- Brief flags variantId mapping question + Grove writer signature divergence as surface candidates. Good.

### Prereq
- Brief assumes composition slot → variantId mapping is "slot N → variantId N (1-indexed)" matching Brief 2's documented emission order. Verify in `publish-glb.js` before dispatch — emission order CAN drift if chassis bundles decompose (the "bundle-aware de-leaf" Brief 1.5c logic could re-order slots → variants). Already flagged as surface candidate (line 106). ✓
- Brief asks baby to check `species + variantId` exists in `public/trees/<species>/manifest.json#variants` (line 81) — verify this field name matches actual manifest shape today.

### Sequencing
- Parallel-safe with Brief 7. Per Boz's queue: correct. ✓

### File conflict
- Touches `SalonWorkstage.jsx` + `useArboristStore.js`. Brief 7 touches `SpecimenViewport.jsx` + a new server endpoint. **No overlap.** ✓
- Brief 8 line 5 says "Zero file-surface overlap with Brief 7." Verified.
- Brief 8 line 84 also says it may need `SalonWorkstage.jsx` "5-LOC adjustment" — Brief 9 line 83 ALSO lists `SalonWorkstage.jsx` for a ~+5 LOC wind-toggle verification. **Minor potential overlap** between Brief 8 and Brief 9 on `SalonWorkstage.jsx`. Both small; just be aware on merge.

### Footgun
- **Tooltip wording on disabled state** (line 99): "say specifically WHY." Three conditions are independent — baby must compose precedence (which message takes priority when multiple fail). Brief leaves this implicit; could specify ordering: lookId > publish-status > adopt-status.

### Discipline
- Identity-first preamble (line 3). ✓
- Surface clause present (line 101). ✓
- Memory refs listed (line 121–127). ✓

### Vibe
- Clean small brief. Half-baby-day estimate (line 56) is honest. Hands the baby a concrete pattern to mirror (Grove's writer). The frozen-seam framing (line 23–24) gives the baby permission to NOT extend the contract.

---

## Brief 9 — Phase 7a wind production wiring (`brief-9-wind-production-wiring.md`)

### Hidden dep
- **CRITICAL — wind contract shape disagrees with Meteorologist's existing plan.** Brief 9 line 49–56 sketches `windAt(t, worldPos) → {amplitude, direction}` (two outputs). Meteorologist's BACKLOG line 149 (Phase 7a entry) specifies `windAt(t, pos, windState) → { force, intensity }` (two-output but different names) plus **three temporal scales** (drift / gust envelope / gust spikes via `smoothmax`) plus **spatial gust-front advection so gusts visibly travel through the scene** (BACKLOG line 150). Brief 9 collapses this to a single amplitude scalar (line 53–55), then notes multi-scale is v1.6 (line 116). **This is `feedback_spec_compression` in action** — Meteorologist already has the richer architecture documented; Brief 9 quietly simplifies it. Coordinator should restate the translation + confirm with operator BEFORE dispatch (per `feedback_spec_compression` step 2).
- **Brief 9 preamble (line 9) says "Salon Preview Atlas (Brief 7) … shipped."** Per Boz's queue Brief 7 is IN FLIGHT. The preamble is written from a post-Brief-7 vantage but the brief itself depends on Brief 7. Either restate as "depends on Brief 7 (in flight; do not pick up Brief 9 until 7 lands)" or keep the post-7 framing and add an explicit dispatch-gate. The current wording could mislead a baby into starting before Brief 7 lands.
- **AC 3 (cloud + tree wind synchronized) requires `<Atmosphere />` to ALSO subscribe to `wind-field.js`.** Per Meteorologist BACKLOG line 151: "Atmosphere subscribes too — uWindScale + uWindDir populated from windAt(t, cameraPos, ...)." Brief 9 says (line 11) "Cloud advection is already wind-driven" — true via Phase 5a's `uWindDir` from the directive — but Phase 5a is NOT yet driven by the sampled `wind-field.js` (that's deferred per BACKLOG line 147). So to satisfy AC 3 the baby must also migrate Atmosphere from "reads directive `windDir` directly" to "reads `wind-field.js#windAt`." **This work is not in the file list** (lines 76–89). Either drop AC 3 or add Atmosphere migration to the file list.

### AC
- **AC 4 (programs count ~11)** is verifiable. ✓
- **AC 8 (gust spikes fire on directive)** depends on Phase 6's gust-modulator path being wired through. Brief 9 line 84 says "confirm/add `wind.gustsScale`" — Phase 6 may or may not have it. Verify before dispatch.
- **AC 11 (`trees-atlas.json` byte-identical)** — wind is pure runtime so this is correct. ✓

### Doctrine
- Honors `feedback_salon_preview_is_authoring_surface` — wind goes into `treeAtlasMaterial.js`, both Salon preview AND LS read same uniforms (line 17, 113–114). ✓
- Honors single-shader-program doctrine (line 16) — wind is uniform-driven branch. ✓
- Honors frozen-seam doctrine — `src/lib/wind-field.js` at root, neither helper owns the other (line 15, 70–72). ✓
- `feedback_spec_compression` cited in memory refs (line 150) — but the brief itself violates it (see Hidden dep #1). The citation is necessary but not sufficient.

### Scope drift
- Surface clause present (line 118). ✓
- Notes `generate-procedural.js` may have its own wind story (line 124) — good surface.

### Prereq
- `directive.schema.json` field `wind.gustsScale` — verify whether Phase 6 added it (line 84 hedges). Per Meteorologist BACKLOG line 139 Phase 6 shipped "Per-modulator strengths published to `useAtmosphere.activeStrengths`" but doesn't explicitly mention `gustsScale` in the directive schema. Verify before dispatch.
- `applyBarkUniforms`-adjacent path (line 81) — verify the actual location/name of the per-frame uniform-write hook in `InstancedTrees.jsx`. `applyBarkUniforms` IS the per-draw helper per ARCHITECTURE.md:193; need to confirm it's per-frame-callable for wind.

### Sequencing
- Brief 9 depends on Brief 7. Boz's queue order (7 → 9) is correct. ✓
- **Brief 9 + Brief 10 both edit `treeAtlasMaterial.js` AND `InstancedTrees.jsx#applyBarkUniforms`.** Brief 9 adds vertex-shader wind chunks + `uWindAmplitude/Direction/uRustleAmplitude`; Brief 10 adds fragment-shader bark-tier branches + `uBarkShaderTier`. Mostly orthogonal (vertex vs fragment, sway uniforms vs tier uniforms), but `applyBarkUniforms` will get touched twice. Whichever ships first, the other will rebase. **Recommend explicit merge-order note in both briefs** (probably 9 first since 10 is sub-phased).

### File conflict
- See Sequencing above.
- Brief 9 touches `SpecimenViewport.jsx` for wind-patch removal (line 82). Brief 10D also touches `SpecimenViewport.jsx` for tier-selector overlay (line 117, sub-phase D). Independent surfaces; should not conflict if both careful.

### Footgun
- **Cross-helper contract drafting BEFORE coding is a strong gate** (line 109). Good.
- **`uTime` uniform** (line 112) — brief notes it may or may not exist on `treeAtlasMaterial` at runtime side today. Verify. If not present, the +30 LOC `InstancedTrees.jsx` estimate doesn't cover plumbing it.
- **Performance at LS scale**: 745 placements × per-frame `windAt(t, pos)` call (line 122 surfaces this). If `windAt` is invoked per-instance per-frame from CPU and written into per-instance attribute buffers, that's a real cost. Brief doesn't specify whether wind is per-instance (per-tree) or scene-wide uniform; the contract sketch suggests scene-wide (single amplitude + direction uniform). Clarify.

### Discipline
- Identity-first preamble (line 3). ✓
- Surface clause present (line 118). ✓
- Memory refs (line 143–150). ✓

### Vibe
- Brief is ambitious but the spec-compression on the contract shape is the load-bearing risk. With the contract aligned to Meteorologist's BACKLOG sketch + the Atmosphere migration scoped, this is a strong brief. As drafted, a baby could ship a "works but wrong-shape" wind contract and the post-mortem would feel like Brief 2.

---

## Brief 10 — View-aware bark rendering (`brief-10-view-aware-bark.md`)

### Hidden dep
- Brief 10 line 9 preamble says "Briefs … 7, 8, 9 are recently shipped or in flight." Brief 10 explicitly depends on Brief 7 (line 164) but doesn't depend on Brief 9. Preamble framing is fine; just be aware that picking up Brief 10 before 7 lands is gated (line 164 escalation rule is good).
- Sub-phase D depends on Brief 7's `salon-preview-atlas.js` (line 122). ✓

### AC
- **AC per sub-phase is well-structured** (lines 132–155). Sub-phase A's AC #1 ("operator can flip via debug control") implies a Stage-debug toggle exists — brief says (line 53) "ship: tier=0 renders aerial, tier=1 hero (current behavior), tier=2 errors out / falls back." Concrete.
- **Sub-phase B AC #7 ("5-7 distinct luminance bands")** is operator-eye. Tag explicitly.
- **AC #16 (Sub-phase D determinism)** is byte-identical preview atlas. Brief 7's preview-atlas pipeline must guarantee this; verify Brief 7 ships with deterministic atlas bake.

### Doctrine
- LOAD-BEARING citation: `project_view_aware_baking` at line 16 + 159, brief is the bark-side implementation. ✓
- `feedback_salon_preview_is_authoring_surface` — sub-phase D enforces parity (line 76, 195). ✓
- `feedback_unique_program_cache_key_before_wrappers` — line 99–103 explicitly says NO customProgramCacheKey divergence; uniform branch only. ✓
- `feedback_atlas_subregion_uv_recovery` — line 107 cites it for single-binding doctrine. **But the brief doesn't address recovery math explicitly for posterized + roughness sub-region sampling.** Bark primitives have UVs rewritten into bark's atlas sub-region; sampling posterized (different sub-region) needs `(vMapUv - barkOffset)/barkScale` recovery before mapping to posterized sub-region — exactly Cinder's Brief 2.1a pattern. Brief should either say "extend Cinder's `uBarkTileOffset/Scale` reuse" or call out the recovery is required for posterized + roughness too. **Potential footgun if baby silently writes naive `vMapUv * Pscale + Poffset`.**
- `feedback_spec_compression` — line 200 calls out "don't auto-compress three-tier architecture into two." Good defensive framing.

### Scope drift
- Surface clause present (line 167). Comprehensive list. ✓

### Prereq
- `project_view_aware_baking` is verified to exist (read end-to-end). ✓
- `aBarkWorldYNorm` per-vertex attribute (lines 50–51, 87): baked at runtime-merge time in `InstancedTrees.jsx`, NOT in the chassis GLB. Pattern mirrors `aBark`. Implementation-cheap if chassis bbox is available at merge time. Verify bbox is computed/cached.
- Posterization tool: `sharp.posterize(levels: 6)` — sharp supports it; precedent in Cinder's `extract-bark-detail.mjs`. ✓

### Sequencing
- Sub-phase A first; STOP for operator review BEFORE B (line 161). Strong gate.
- Brief 10 sub-phase order is correct: A (mechanism) → B (posterized) → C (street PBR) → D (Salon preview parity).
- Order with Brief 9: see Brief 9 sequencing note. Recommend 9 ship first, then 10A.

### File conflict
- See Brief 9 #File conflict — both touch `treeAtlasMaterial.js` + `InstancedTrees.jsx#applyBarkUniforms`. Vertex vs fragment + sway-uniforms vs tier-uniforms. Mostly orthogonal but `applyBarkUniforms` body will need careful merge.
- Brief 10 + Brief 7 share `salon-preview-atlas.js` in sub-phase D — gated by Brief 7 landing first.
- Brief 10 + Brief 9 both edit `SpecimenViewport.jsx`. Brief 9 removes wind chunks (line 82). Brief 10D adds tier-selector overlay (line 117). Independent regions.

### Footgun
- **Aerial tier `aBarkWorldYNorm` for leaves**: Brief 10 line 87 says "per-vertex world-Y normalized across chassis bbox (trunk base = 0, canopy top = 1)" — but does this attribute exist on leaf vertices too, or only bark? At aerial tier, leaves still render — what's their fragment path? Brief is silent on leaf rendering at aerial. Either (a) leaves continue using current path uniformly (probably correct), or (b) leaves get their own aerial simplification. Brief 10 line 185 says "aerial leaf rendering is out of scope" — OK, but the baby should explicitly skip the tier branch for leaves (gate via existing `vBark` per-fragment) so leaves render normally. Recommend tightening line 88 with a leaf-bypass note.
- **Posterized "5-7 bands" expectation vs `levels: 6`**: `sharp.posterize(6)` produces 6 distinct levels per channel → up to 6³=216 combinations. The brief frames it as "5-7 distinct luminance bands" (line 142) — visually mostly correct since bark color is near-grayscale, but the AC framing is loose. Consider: levels are per-channel; luminance bands are a downstream visual perception.
- **Atlas budget growth for Street tier**: line 71 "~10-15MB per bark ref" — at multiple bark refs, the master atlas PNG could blow past mobile texture limits. Brief surfaces this (line 175) — but should explicitly say "if growth exceeds budget, surface BEFORE shipping sub-phase C; don't quietly accept."
- **`uBarkShaderTier` as scene-wide uniform** is the right v1.5 shape but the brief sketches "Stage-debug toggle" (line 53) without specifying where the toggle UI lives. Recommend: workstage `SpecimenViewport.jsx` overlay (sub-phase D) is the only authoritative driver; Stage gets a debug knob in a separate brief.
- **Sub-phase B "atlas-survey.js classify tiles by tier"** (line 121) — atlas-survey classifies tiles into bark/leaf/unified today (per ARCHITECTURE.md:396). Adding "posterized" + "roughness" classifications crosses producer-consumer; verify the classifier doesn't double-stamp tiles (one tile could be both bark + posterized variant). Surface candidate.

### Discipline
- Identity-first preamble (line 3). ✓
- Surface clause present (line 167). ✓
- Memory refs (line 192–200). ✓
- Sub-phasing with operator review gates is well-disciplined for a 600–800 LOC brief.

### Vibe
- Strong brief. Sub-phasing is the right risk-reduction pattern for the LOC budget. The "we don't cull geometry, we change shader" operator framing is preserved (line 24). The main weak spot is the implicit UV-recovery math for posterized + roughness sub-regions — Cinder's lesson should be foregrounded.

---

## Cross-brief summary

### Dependency graph (Hazel's read)
```
Brief 6 (decimation)     — orthogonal, ship anytime
Brief 7 (preview atlas)  — IN FLIGHT (Birch); blocks 9, 10
Brief 8 (canary)         — parallel with 7
Brief 9 (wind)           — after 7; spec-compression risk on contract shape
Brief 10A (tier infra)   — after 7
Brief 10B (posterized)   — after 10A
Brief 10C (street PBR)   — after 10B
Brief 10D (Salon parity) — after 7 + 10A
```

Boz's queue order (6, 7, 8, 9, 10) is consistent with this graph.

### Top three risks (Hazel's flag)

1. **Brief 9 wind contract is `feedback_spec_compression` waiting to happen.** Meteorologist BACKLOG line 149 already documents the three-temporal-scale + spatial-gust-front shape. Brief 9 line 49–56 collapses it. Coordinator should surface the translation to operator + reconcile with Meteorologist's BACKLOG sketch BEFORE dispatch. (See Brief 9 Hidden dep.)

2. **Brief 9 AC 3 (cloud/tree wind synchronized) requires Atmosphere migration that's not in the file list.** Either drop the AC or add the work. (See Brief 9 Hidden dep.)

3. **Brief 10 posterized + roughness sub-region sampling needs explicit UV-recovery math** per Cinder's Brief 2.1a precedent — currently implicit, baby may write naive `vMapUv * Bscale + Boffset` and produce near-static samples. (See Brief 10 Doctrine.)

### Secondary risks

- Brief 7's wind-chunk patch on `treeAtlasMaterial` should leave grep-able "retired by Brief 9" markers (mirror Birch's Brief-2.1→Brief-7 precedent).
- Brief 6's `bake-tree.py` cross-language invocation is under-specified.
- Brief 6 lever 3 needs explicit Linden-skip rule (not just "may not apply").
- Brief 8 + Brief 9 both touch `SalonWorkstage.jsx` (small overlap).
- Brief 9 + Brief 10 both touch `applyBarkUniforms` (small overlap; recommend 9 ships first).

### Discipline check (identity + surface clause)

| Brief | Identity-first | Surface clause | Memory refs listed |
|---|---|---|---|
| 6 | ✓ | ✓ | ✓ |
| 7 | ✓ | ✓ | ✓ |
| 8 | ✓ | ✓ | ✓ |
| 9 | ✓ | ✓ | ✓ |
| 10 | ✓ | ✓ | ✓ |

All briefs honor the identity-first + scope-drift discipline.

### Vibe summary

All five briefs feel written FOR a baby, not for an orchestrator. The handoff observations (Brief 7), sub-phasing with operator gates (Brief 10), and load-bearing-doctrine callouts (all five) are all signs of careful authoring. The contract-shape risk on Brief 9 is the load-bearing concern; once resolved, the queue is dispatchable.

— Hazel
