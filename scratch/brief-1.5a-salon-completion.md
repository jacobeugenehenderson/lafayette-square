# Brief 1.5a — Salon Completion (visible quality pass)

You are the dispatched baby agent for **Salon completion** — a warm continuation of Brief 1 (which you shipped as Sequoia). This is a tightly-scoped follow-up that fixes the gap between Brief 1's data-layer success and its visible-output failures. The operator can compose in Salon and the data persists correctly, but bark knobs don't visibly drive output, leaves render at procedural scale (miniscule for Salon's sparse-anchor regime), and the leaves picker shows different names but renders the same fallback PNG everywhere. Brief 2 (bark gradient maps) is structurally downstream of working bark plumbing, so 1.5a unblocks 1.5b's deferred curation AND Brief 2's per-instance gradient work.

**Warm dispatch — you are Sequoia continuing.** Keep your name in publishing notes. Your Brief 1 file context survives; do not re-read the world from scratch.

## Read first (recap, light)

- **Your own Brief 1 work** — `arborist/generate-salon.js`, `src/arborist/SalonWorkstage.jsx`, `src/arborist/stores/useArboristStore.js`, `arborist/serve.js` Salon block
- **`arborist/NOTES.md`** — your own session-end entry (the Surface items you flagged at Brief 1 ship are this brief's scope)
- **`scratch/brief-1-arborist-salon-standup.md`** — your prior brief; constraints carry forward unless this brief explicitly overrides
- **`src/components/treeAtlasMaterial.js`** — read end-to-end (you didn't touch it in Brief 1; you may touch it carefully in 1.5a for item 4 only)
- **`src/components/InstancedTrees.jsx`** — focus on `applyBarkUniforms` and how it reads from species manifest
- **`arborist/generate-procedural.js`** — focus on the manifest-writing step at publish time (the procedural path that already drives bark knobs visibly; you're matching its plumbing)
- **`assets/botanical-reference-hires/`** README — covers which LeafSet packs exist; you'll pull 3 into the kit for item 3
- Memory: `feedback_unique_program_cache_key_before_wrappers`, `feedback_effective_payload_layering`, `feedback_classifier_keyword_cross_check`, `feedback_baby_must_surface_scope_drift`

## Goal — and what this phase explicitly does NOT do

Make Salon's visible output reflect operator intent. Four items, ordered by likely-difficulty (do them in this order so item 4 lands on a stable substrate):

1. **Bark plumbing** — Salon's bark spec (tintBase, tintJitterRange, uvScale, roughnessOverride) visibly drives runtime bark appearance via `applyBarkUniforms`, matching procedural's working behavior
2. **Leaf-pack shape shim** — populate `public/textures/leaves/shapes/{palmate,lobed,ovate}/shape.png` from `assets/botanical-reference-hires/LeafSet{010,016,005}/` so the leaves picker visibly differentiates between picks
3. **Leaf scale operator slider** — Salon Leaves panel gets a Scale slider (0.5x – 3x, default tuned so a single card reads ~10cm at world scale), persisted in `composition.leaves.scale`, consumed by the leaf-emission step in `generate-salon.js`
4. **PROGRAMS reduction** — Salon viewport perf gauge shows 12 programs (red, >5 tripwire). Diagnose: (a) is this workstage-preview-only inflation from overlays, or (b) does LS Stage also show >5 after a Salon-curated bake. If (b), fix the divergence so LS shows ≤5. If (a), document and move on — don't chase workstage-only inflation.

**Do NOT:**
- Add gradient-map bark + multi-stop tint editor (that's Brief 2; you're enabling it, not building it)
- Add deformer rig (Brief 3)
- Add camera-aware hemisphere cull (Brief 4)
- Build the chassis curation surface (rename, approved flag) — that's deferred to Brief 1.5b
- Touch `survey-deleaf.js` or `bake-look.js` or `bake-trees.js` or `publish-glb.js`
- Refactor `treeAtlasMaterial.js` beyond what item 4 strictly requires (uniqueProgramCacheKey, uniform consolidation)
- Bring full Phase F runtime gradient-map tinting — item 2 is shape-only, not tinted-runtime
- Re-derive Brief 1's data model; the schema is already in `compositions.json`

## Architecture per item

### Item 1: Bark plumbing

Diagnose path: at Salon publish, `generate-salon.js` writes per-variant bark spec into the species's `manifest.json` (the same shape procedural writes). At runtime, `InstancedTrees.jsx#applyBarkUniforms` reads from manifest and drives shader uniforms. Either generate-salon writes a different shape than applyBarkUniforms reads, or it doesn't write the spec at all.

Compare your generate-salon.js manifest emission against `generate-procedural.js` end-of-publish manifest writing. Match the shape exactly. Verify by:
- Adopt a Salon composition with a saturated tintBase (e.g., `#ff0000`)
- Re-publish species
- Open the resulting `public/trees/<species>/manifest.json`
- Confirm the `bark` field carries your tint
- Curate via Grove, reload LS Stage, confirm the tree renders saturated red

Same pattern for uvScale, roughnessOverride, tintJitterRange. The runtime path is already wired (procedural works); you're matching its manifest shape.

### Item 2: Leaf-pack shape shim

Three vendor packs from `assets/botanical-reference-hires/`:
- `LeafSet010/` → `public/textures/leaves/shapes/palmate/shape.png` (maple-shape)
- `LeafSet016/` → `public/textures/leaves/shapes/lobed/shape.png` (oak-shape)
- `LeafSet005/` → `public/textures/leaves/shapes/ovate/shape.png` (general broadleaf)

Use the pack's existing Color or Opacity texture as the shape PNG. If multiple candidates exist per pack, pick the one closest to "greyscale alpha + luminance" — the operator's leaf rendering uses alpha-test cards so the alpha channel matters most.

Update the Salon leaves picker source list to expose these three packs by their semantic names (`palmate`, `lobed`, `ovate`). Salon UI's `/salon/:species/leaves` endpoint may need to update its source dir scan accordingly.

DO NOT bring runtime gradient-map tinting (Phase F). Leaf color falls back to whatever the current rendering path supplies (texture color directly, or default tint). Item 2 is shape-only.

### Item 3: Leaf scale operator slider

Add `composition.leaves.scale` field, defaulting to a sensible value (likely ~3.0 if the current default emits 3cm cards and we want 10cm). Add DraftSlider in Salon Leaves panel (0.5 – 3.0 range). Persist to disk via existing `setSalonSlotParams` action.

In `generate-salon.js`, the leaf-emission step (you lifted from generate-procedural.js's D.1b helpers) needs to accept a scale multiplier. Find the card-size constant in those helpers, parameterize it, pass `composition.leaves.scale * baseSize` per emission.

Verify by adopting two compositions with scale=1 and scale=3, confirming the second renders 3x card area.

### Item 4: PROGRAMS reduction (conditional)

**Diagnosis-first sub-step**: before any code change, Grove-curate one Salon composition into LS, reload LS Stage, and read the in-Stage perf gauge `programs` count. Report this number in your commit body.

- If LS-PROGRAMS ≤ 5: workstage-only inflation. Document in your NOTES entry that the workstage perf gauge inflates due to overlay materials (rotator ring, obelisk, height indicator, perf probe). Move on. Do NOT change anything.
- If LS-PROGRAMS > 5: there's real shader-program divergence in the Salon publish path. Find it. Possibilities:
  - `generate-salon.js` creates per-composition material clones that differ in uniform signature → consolidate to one material with uniform-driven variation
  - Missing `customProgramCacheKey` on Salon-published materials per `feedback_unique_program_cache_key_before_wrappers` → set the same key across all Salon variants
  - Leaf-emission helpers create separate materials per chassis → consolidate
- If the fix requires modifying `treeAtlasMaterial.js`, you may, but ONLY for program-consolidation purposes (key-setting, uniform structure). Any shader logic changes are out of scope; surface and ask.

## File-by-file plan (likely)

| File | Status | ~LOC |
|---|---|---|
| `arborist/generate-salon.js` | edit (manifest bark shape match + leaf scale param) | +50 |
| `src/arborist/SalonWorkstage.jsx` | edit (leaf scale DraftSlider in Leaves panel) | +20 |
| `arborist/serve.js` | edit (extend leaves endpoint to expose new packs) | +20 |
| `src/arborist/stores/useArboristStore.js` | edit (scale field in composition action) | +10 |
| `public/textures/leaves/shapes/{palmate,lobed,ovate}/shape.png` | new (3 PNG files copied from vendor) | data |
| `src/components/treeAtlasMaterial.js` | edit (CONDITIONAL on item 4 finding LS-PROGRAMS > 5) | ≤20 if needed |
| `arborist/FEATURES.md` | edit (Salon completion notes, leaf-pack shim mention) | +20 |
| `arborist/NOTES.md` | edit (dated session-end entry continuing Sequoia's record) | +40 |

Total: ~150–170 new LOC + 3 PNGs. Probably 1 baby day.

## Acceptance criteria

1. Salon composition with non-default `bark.tintBase` (e.g., red) → tree visibly renders that tint in Salon viewport AND in LS Stage after Grove bake
2. Same for `bark.uvScale` (visibly different bark scale), `bark.roughnessOverride` (visibly different bark shine), `bark.tintJitterRange` (per-instance bark color variation in LS)
3. Leaves picker showing 3 packs (`palmate`, `lobed`, `ovate`) → picking each renders visibly distinct leaf shapes in Salon viewport
4. Leaf Scale slider in Salon Leaves panel; default value renders ~10cm cards at world scale (verify against obelisk for reference); 3x scale renders ~30cm cards
5. LS Stage perf gauge `programs` count after Salon publish = ≤5, OR documented as workstage-only inflation with diagnosis in NOTES
6. Single shader program preserved end-to-end (per Brief 1's AC#7, now actually verified at LS)
7. Determinism preserved: same composition + same params → byte-identical published GLB
8. No regression on Brief 1's procedural / LiDAR / Grove modes (smoke-test by opening each mode briefly)

## Constraints

- **Stash-isolate per `feedback_stash_isolate_per_file`** — working tree has Brief 1's uncommitted output plus prior-arc dirt; commit ONLY Brief 1.5a work
- Single shader program preserved (this is the entire point of item 4)
- Per `feedback_unique_program_cache_key_before_wrappers` — any new material work sets unique `customProgramCacheKey` BEFORE wrappers
- Per `feedback_effective_payload_layering` — leaf scale field follows DEFAULTS → CHASSIS_DEFAULTS → overlay layering
- Determinism via `mulberry32` seed stream
- No modifications to `survey-deleaf.js`, `bake-look.js`, `bake-trees.js`, `publish-glb.js`, `InstancedTrees.jsx` shader path (only manifest-reading side if needed)
- `treeAtlasMaterial.js` modifications ONLY if item 4 finds LS-PROGRAMS > 5, and ONLY for program-consolidation purposes (key-setting, uniform structure). Surface and ask before any shader logic change.
- Do NOT bring Phase F runtime gradient-map tinting; leaf packs are shape-only in this brief
- Do NOT touch chassis library or `_chassis-curation.json` (Brief 1.5b territory)

## Surface anything not in this brief

Per `feedback_baby_must_surface_scope_drift`:
- **The LS-PROGRAMS number you observed** — must be reported in commit body even if ≤5 (we need the data point)
- Any difference between your Salon-emitted manifest bark shape vs procedural's manifest bark shape that you fixed (itemize the field deltas)
- Any procedural-side tooling you found tempting to also tune for visual parity — flag, don't tune
- Whether the LeafSet pack files needed any preprocessing (resize, channel-swap, etc.) or copied-as-is
- Any new uniforms you found yourself wanting to add (flag, don't add — Brief 2 territory)
- Any other consumers of the bark uniform path you noticed reading from manifest (Meteorologist? Cartograph?) that should also see the matching shape
- Whether bark texture binding in your generate-salon.js bypassed the uniform path (in which case binding-via-uniform is the architecturally-correct fix, not a tweak)

## Out of scope

- Chassis curation surface — rename, approved flag, picker filter (Brief 1.5b)
- Gradient-map bark + multi-stop tint editor (Brief 2)
- Deformer rig (Brief 3)
- Camera-aware hemisphere cull (Brief 4)
- Phase F runtime leaf-tint gradient maps
- Phase F per-season annual cycle anchors
- More than 3 leaf-pack shapes (additional packs are operator follow-on)
- Atlas-pack natural-leaf-size metadata (Phase F architecture, not 1.5a)
- Any work in `meteorologist/` or `cartograph/`
- Any work on `arborist/survey-deleaf.js` or chassis library files
