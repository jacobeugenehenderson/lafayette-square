# Brief 3A — Per-instance deformer engine (lean + twist + wander)

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — and it MUST be a name that has not already been used in this project.** Babies here pattern-match heavily to names in NOTES.md / BACKLOG.md / commits and pick collisions; Jacob has had to redirect repeated misfires (Holm, Cambium). This brief touches the wind-sway code (Sough), the bark shader (Birch/Cinder/Cork/Vellum), and the attribute-stamping helper — all those names will be in your field of view. **Do not reach for any name you see in the code.**

**Names already claimed — do NOT reuse any of these:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Plumb, Vellum, Lintel, Gnomon, Corbel, Quartz, Sextant, Mistral, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Boz.

**Pick something novel** — a word, a symbol, a sound, another language, an invention. The plant-adjacent namespace is saturated AND the obvious next reaches are now taken too: architectural elements (Lintel/Mullion/Corbel), minerals (Quartz), instruments (Sextant), weather (Mistral). Go somewhere genuinely else — a verb, a knot, a current, a foodstuff, an invented sound. State your name in your first message; sign your commits with it.

---

## Why this brief exists — the artistic-integrity capstone

The Arborist's v1.5 doctrine is **compose, don't synthesize**: one vendor chassis per species, diversity manufactured at runtime rather than by baking many variants. Today that diversity is thin — scalar per-instance jitter (Y-rotation, XZ/Y scale, hue shift) makes ~3 baked variants "look like 30." The operator's target is **~100 visually-distinct reads from a single chassis** so the LS roster never reads as a copy-paste forest.

> **PREMISE NOW SOLID (refresh 2026-05-25).** This brief was first drafted when chassis shipped off-origin (trunk base at e.g. Y≈−1.3, X≈−3, Z≈−0.7), which would have forced a per-chassis pivot computed at merge time. **Brief 20 (Sextant) recentered every chassis's dominant-trunk base to origin `(0,0,0)`**, and Brief 23 (Mistral) rescaled the mis-scaled ones — so the chassis library is now **centered, scaled, split, and correct.** The consequence for you: **the deformer pivot is trivially the origin** — no per-chassis pivot, no merge-time pivot scan, no "is the base at Y=0?" inspection. `aTreeHeightNorm` normalizes against `[0, maxY]` since the base sits at Y=0. The brief below has been updated to this centered premise; where you see references to off-origin handling, they're resolved.

Brief 3 fills the `composition.deformer` schema (reserved-but-empty since Brief 1). **This is 3A — the procedural-fill diversity engine.** Per-instance vertex-shader displacement (lean + twist + wander) parameterized by authored per-species ranges and sampled by a per-instance hash. It is the capstone that validates the compose-don't-synthesize approach end-to-end. (Designed hero slots + PlaceCard binding are 3B, deferred post-integration; canopy asymmetry + branch jitter are 3C.)

## Read first

- `arborist/BACKLOG.md` — Brief 3 entry (architecture-pivot version) + the 3A/3B/3C split
- `arborist/NOTES.md` — Brief 9a (Sough, wind seam — you compose with it), Brief 10A (Cork — retired `aBarkWorldYNorm`, the attribute pattern you revive), the `project_runtime_merge_vertex_attributes` precedent
- `src/components/treeAtlasMaterial.js`:
  - `injectFoliageSway` (line ~113) — the vertex patch. Your deformer chunk goes in the `<begin_vertex>` patch (line ~225) **before** the wind-sway block (lines ~255-345). `transformed` is the standard three.js local-space position var; wind modifies it; you modify it *first*.
  - `instWorld` computation + `vWorldXZ` (line ~345) — how instance world position is derived. Your per-instance hash seeds from the **instance anchor** (instanceMatrix translation column), NOT per-vertex world pos — so every vertex of one tree shares one deformer signature.
  - jh1-4 hash pattern (lines ~426-458) — `fract(sin(dot(xz, vec2(C1,C2))) * 43758.5453)`. You add jh5/jh6 with fresh constant vectors, computed in the **vertex** shader (jh1-4 are fragment-side; yours are vertex-side from the instance anchor).
  - `stampTreeVertexAttrs` (line ~777) — stamps `aBark`, `aWindTier`. You add `aTreeHeightNorm` following the `aWindTier` block shape (line ~813-831).
- `src/components/InstancedTrees.jsx#meshes` — the chassis-wide bbox scan + merge. `aTreeHeightNorm` needs chassis-wide Y range (base→top), same as Cork's retired `aBarkWorldYNorm` used. Cork removed that scan in the 10A pivot; you reintroduce it for the deformer's height-norm.
- `src/arborist/SalonWorkstage.jsx` — the slot card panels (Chassis / Bark / Leaves). You add a **Deformer** panel (three range sliders).
- `src/arborist/SpecimenViewport.jsx` — Salon preview. Per `[[feedback_salon_preview_is_authoring_surface]]` (LOAD-BEARING): the deformer MUST fire in preview so the operator sees the diversity as they author the ranges. `applyBarkUniforms` is shared (Cambium Brief 7) — you'll add the deformer-range uniforms to the same shared binding path.
- `arborist/generate-salon.js` — `patchManifestForSalon` writes per-species specs into `manifest.json`; the deformer range goes here so `bake-look.js`/runtime can read it.
- `arborist/BACKLOG.md` Brief 20 + 23 entries — the chassis library is now centered (base at origin) + scaled + split. This is your foundation; the deformer pivot = origin because of it.
- Memory: `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`, `[[feedback_geometry_briefs_need_artifact_inspection]]` (still inspect the normal-var availability + instance-anchor accessor — the pivot is now resolved to origin), `[[project_runtime_merge_vertex_attributes]]`, `[[project_per_vertex_spatial_advection]]` (no per-frame buffer uploads — ranges are uniforms, variation is hash), `[[feedback_salon_preview_is_authoring_surface]]`, `[[feedback_load_bearing_files_serial_dispatch]]`.

## Goal — and what this phase explicitly does NOT do

**Goal:** a single chassis renders ~100 visually-distinct instances via per-instance lean + twist + wander, authored as per-species ranges in Salon, sampled per-instance by a world-XZ hash, applied in the vertex shader before wind sway. Normals stay correct (rotational ops). Single shader program preserved. Visible + authorable in Salon preview.

**Do NOT:**
- Implement canopy asymmetry or branch jitter — those are 3C (they need inverse-transpose normal work; out of scope here precisely because 3A stays normal-free).
- Implement designed slots or PlaceCard binding — that's 3B, deferred post-integration. 3A is procedural-fill ranges only.
- Add per-frame buffer uploads. Ranges are per-draw uniforms; per-instance variation is the hash. Per `[[project_per_vertex_spatial_advection]]`.
- Touch the wind-sway math (Sough's Brief 9a). You compose *before* it — your deformer reshapes `transformed`, then the existing sway block runs on the reshaped position. Don't modify the sway; just make sure you write `transformed` before it reads.
- Re-derive normals via inverse-transpose. 3A's three ops are rotational/translational — rotate the normal by the same per-height rotation matrix; treat wander's tangent shear as negligible. If you find yourself reaching for inverse-transpose, you've drifted into 3C territory.
- Touch `customProgramCacheKey`. Single program preserved — the deformer is a uniform+attribute-driven branch in the existing vertex patch.
- Bake anything into the GLB. The deformer is runtime-only; `aTreeHeightNorm` is computed at merge time per `[[project_runtime_merge_vertex_attributes]]`; `trees-atlas.json` + chassis GLBs stay byte-identical.

## Architecture

**Per-vertex attribute — `aTreeHeightNorm` (revive Cork's retired pattern):**

Normalized trunk-base→top Y, [0,1]. Stamped at runtime-merge time:
- `InstancedTrees#meshes`: chassis-wide bbox Y-scan over collected primitives BEFORE merge (Cork removed this for `aBarkWorldYNorm`; reintroduce for height-norm), then stamp each primitive against shared `(minY, yRange)`.
- `stampTreeVertexAttrs`: add an `aTreeHeightNorm` block mirroring the `aWindTier` block (line ~813). Accept `fallback.chassisMinY/chassisYRange`; fall back to per-geometry Y min/max if absent.
- `SpecimenViewport`: pre-scan scene meshes for chassis-wide bbox, pass into `stampTreeVertexAttrs` (same as Cork did) so preview shares normalization with LS.

**Per-instance hash (vertex-side, jh5/jh6):**

In the `<begin_vertex>` patch, derive the instance anchor's world XZ from the instance matrix translation column (e.g. `instanceMatrix[3].xz` — confirm the exact accessor for the three.js instanced path during inspection). Then:
```glsl
float dh5 = fract(sin(dot(instAnchorXZ, vec2(73.1, 458.3))) * 43758.5453);
float dh6 = fract(sin(dot(instAnchorXZ, vec2(151.7, 619.2))) * 43758.5453);
```
Fresh constant vectors, uncorrelated with jh1-4. Same anchor for every vertex of the instance → one coherent deformer signature per tree.

**Range uniforms (per-draw, like bark settings):**

Three vec2 uniforms carrying authored [lo,hi] ranges: `uDeformLeanRange`, `uDeformTwistRange`, `uDeformWanderRange`. Default `(0,0)` → identity (no deformation when unbound; regression-safe). Set per-draw via the shared `applyBarkUniforms` path (extend its signature, or add a sibling `applyDeformerUniforms` — your call; surface which). Per-instance value = `mix(range.x, range.y, dh5)` for lean/twist, `mix(range.x, range.y, dh6)` for wander (so lean and wander don't correlate).

**The three ops (local space, applied to `transformed` before sway):**

Let `h = aTreeHeightNorm` (0 at base, 1 at top). All operations pivot about the trunk base, which is **origin `(0,0,0)`** post-Brief-20's dominant-trunk recenter — so no per-chassis pivot, no `uDeformPivot` uniform, no merge-time pivot scan. Lean/twist rotate about the local origin; wander offsets the XZ centerline relative to origin.

1. **Lean** — rotate about a per-instance azimuth by angle `leanAmt * h` (angle grows with height → base stays planted, canopy tilts). Azimuth from a third hash or a fixed range. Normal rotates by the same matrix.
2. **Twist** — rotate about local Y by angle `twistAmt * h`. Normal rotates by the same matrix.
3. **Wander** — offset XZ by a sinusoidal-in-h curve scaled by `wanderAmt` (e.g. `wanderAmt * sin(h * π * freq + phase)`), phase per-instance. Pure translation per height-slice; normal unaffected (ignore the small tangent shear).

Compose as a single per-height transform: build the rotation (lean ∘ twist), apply to `transformed` and to `objectNormal`/`normal`, then add the wander offset to `transformed.xz`. Then the existing wind block runs on the result.

**Normals:** rotate `objectNormal` (the var three.js uses pre-`<beginnormal_vertex>` / inside `<begin_vertex>` — confirm the exact normal var available at this injection point) by the same lean∘twist matrix. Because the ops are rigid rotations, this is exact — no inverse-transpose. This is the whole reason 3A is scoped to these three ops.

**Salon Deformer panel:**

New panel in the slot card (sibling of Bark/Leaves): three range sliders (Lean / Twist / Wander), each a dual-handle [lo,hi] range or two `DraftSlider`s. Persists to `composition.deformer.range` via the existing overlay POST. Empty/absent deformer → identity (regression-safe). The preview viewport should show the *range* somehow — simplest: preview renders a few instances (or cycles the hash) so the operator sees the spread, not just one sample. If multi-instance preview is too big for 3A, surface it — a single-sample preview that re-rolls on a button is an acceptable MVP.

**Manifest + runtime read:**

`generate-salon.js#patchManifestForSalon` writes `manifest.json#deformer.range`. Runtime (`InstancedTrees` applyBark/Deformer path) reads per-species and sets the range uniforms per draw. `bake-look.js` passes it through if needed (it's runtime-consumed, not atlas-baked — likely no bake-look change, confirm).

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `src/components/treeAtlasMaterial.js` | edit — deformer chunk in `<begin_vertex>` (before sway) + `aTreeHeightNorm` attribute/varying + jh5/jh6 + 3 range uniforms + normal rotation; `stampTreeVertexAttrs` gains `aTreeHeightNorm` block | +120 |
| `src/components/InstancedTrees.jsx` | edit — chassis-wide Y-bbox scan + stamp `aTreeHeightNorm`; deformer-range uniform binding per draw | +40 |
| `src/arborist/SpecimenViewport.jsx` | edit — chassis-wide bbox scan into `stampTreeVertexAttrs`; deformer-range binding in preview (parity) | +30 |
| `src/arborist/SalonWorkstage.jsx` | edit — Deformer panel (3 range sliders) | +60 |
| `arborist/generate-salon.js` | edit — `patchManifestForSalon` writes `deformer.range` | +15 |
| `arborist/state/<species>/compositions.json` schema | doc — `deformer.range` shape | — |
| `arborist/FEATURES.md` / `ARCHITECTURE.md` / `BACKLOG.md` / `NOTES.md` | edit — document the deformer engine + 3A scope | +40 |

Estimated ~400 LOC.

## Acceptance criteria

1. **One chassis, visible per-instance variety.** With authored ranges, a single chassis rendered as multiple instances (in Salon preview if multi-instance, else in LS / Grove) shows distinct lean/twist/wander per tree — not a copy-paste forest. **Operator-eye sign-off in Salon is the load-bearing visual AC.**
2. **Deterministic.** A tree at a fixed world-XZ always deforms identically (hash from instance anchor). Same scene → byte-identical render. Re-roll only when the placement moves.
3. **Normals correct.** No lighting artifacts on leaned/twisted trees — the bark shading reads correctly because normals rotate with positions. Verify at Salon Ground camera (hero tier).
4. **Wind composes.** With wind on (Sough's sway), a deformed tree sways *from* its deformed pose — the lean/twist is the rest position, wind oscillates around it. No fighting, no double-displacement artifacts.
5. **Identity-safe when unbound.** A composition with no `deformer.range` (or `(0,0)` ranges) renders exactly as today — zero deformation, no regression. Every existing species without a deformer authored stays pixel-identical.
6. **Salon preview parity.** The deformer fires in `SpecimenViewport`, not just LS runtime. Operator authors a range and sees the effect in the workstage. Per `[[feedback_salon_preview_is_authoring_surface]]` — brief is unshipped if this fails.
7. **Single shader program.** PerfGauge `programs` count unchanged with deformer bound vs unbound, ranges zero vs non-zero.
8. **Bake artifacts byte-identical.** `aTreeHeightNorm` is runtime-merge-computed; no `publish-glb`/`bake-look` geometry change; `trees-atlas.json` + chassis GLBs untouched.
9. **`aTreeHeightNorm` clean.** Stamped at merge in both LS (`InstancedTrees`) and preview (`SpecimenViewport`); chassis-wide normalization shared; no orphan stampers.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`:

- **Trunk-base pivot — RESOLVED (was an inspection point; no longer).** Brief 20 recentered the dominant-trunk base to origin, so the pivot is `(0,0,0)`. You can trust this — but a 30-second sanity check (load a chassis, confirm base ≈ Y=0) costs nothing and de-risks the whole transform. If a chassis surprises you (base NOT near origin), STOP and surface — it'd mean a Brief-20 gap.
- **Instance-anchor accessor.** The exact way to read the instance matrix translation in the three.js instanced vertex path (`instanceMatrix[3].xz` vs a computed `instWorld` already in the existing code). The wind code already derives `instWorld` — reuse its source if it's the instance anchor, not the deformed vertex.
- **Normal var at injection point.** Confirm which normal variable is live in `<begin_vertex>` (`objectNormal` may not be set until `<beginnormal_vertex>`). If the normal isn't available where you inject, you may need to inject the rotation into both the position and normal chunks. Surface the approach.
- **Multi-instance preview.** If showing the *range* spread in Salon preview (vs a single hash sample) is too heavy for 3A, surface it — a re-roll button on a single sample is an acceptable MVP, but flag the limitation.
- **applyBarkUniforms vs sibling.** Whether you extended the shared `applyBarkUniforms` arity or added `applyDeformerUniforms` alongside. Either's fine; document the choice.
- **Lean azimuth source.** Where the lean *direction* comes from (third hash channel vs authored). Surface your call.
- **Wander frequency/phase.** Whether `freq`/`phase` are authored, hashed, or fixed constants. Surface.
- **Reintroducing the chassis-wide bbox scan** Cork retired — confirm it doesn't conflict with anything 10A removed for a reason. (Cork retired it because `aBarkWorldYNorm` was camera-angle-dependent; the *scan* itself was fine — only the bark consumer was wrong. The height-norm consumer is legitimate. But verify.)

## Out of scope

- Canopy asymmetry, branch jitter (3C — they need inverse-transpose normals)
- Designed slots, PlaceCard binding (3B — post-integration)
- Per-Look deformer override
- Scale-along-axis beyond existing instance affine
- Animated/temporal deformer (it's a static rest-pose reshape; wind owns the temporal axis)
- Any bake/atlas/decimation change
- Cartograph-side work

## Dispatch posture

Cold dispatch. Touches load-bearing files (`treeAtlasMaterial.js` vertex patch, `InstancedTrees`, both authoring surfaces) — wants the serial-dispatch slot, which is currently clear (no babies in flight). Single commit when AC 1-9 pass. Title: `arborist: Salon — Brief 3A (<your-name>) — per-instance deformer engine (lean/twist/wander)`.

Per `[[feedback_geometry_briefs_need_artifact_inspection]]`: **two** inspection points before writing the transform (the third — trunk-base pivot — is resolved to origin by Brief 20): (1) which normal var is live at the `<begin_vertex>` injection point, and (2) the exact instance-anchor accessor for the three.js instanced path. Surface in an alignment check if either premise is wrong. (Plus the 30-second base≈origin sanity check noted above.)

— Boz
