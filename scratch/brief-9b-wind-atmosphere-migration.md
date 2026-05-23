# Brief 9b — Atmosphere migration to `wind-field.js`

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Name yourself however feels right — pick whatever lands when you read this — and use that name in your status updates and commit body. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

This is **Brief 9b — Atmosphere side**. Sibling Brief 9a is the tree-side consumer + `wind-field.js` authoring. **9b depends on 9a landing first** — the `windAt()` contract module must exist before Atmosphere can subscribe.

## Where you are

You're joining the cross-helper Arborist↔Meteorologist work. Brief 9a shipped `src/lib/wind-field.js` and wired the tree-side consumer; the architecture is now: Meteorologist publishes `windState` → `windAt(t, pos, windState) → {force, intensity}` → consumers subscribe.

Today (post-9a): trees subscribe through `treeAtlasMaterial.js`. `<Atmosphere />` still reads `directive.windDir` directly (Phase 5a's wiring). That's the gap. Cloud advection and tree sway aren't sharing a source-of-truth — they happen to look similar in calm weather but diverge under gusts (trees see spikes via `wind-field.js`; clouds don't).

Your brief retargets Atmosphere to read through `wind-field.js#windAt(t, cameraPos, windState)` so cloud advection becomes gust-aware AND synchronized with trees.

**Doctrine you're operating within:**
- **Frozen-seam contract** — `wind-field.js` (shipped in 9a) is the only coupling between Arborist and Meteorologist on wind. Don't add a sibling path.
- **Phase 5a's existing Atmosphere wiring is largely preserved** — your job is retargeting the source of `uWindScale` + `uWindDir`, not redesigning Atmosphere.
- **Visual continuity with Phase 5a** — clouds should look the same in calm weather pre- and post-Brief 9b. Only gust-spike-driven cloud motion is new behavior.

## Mission

Retarget `<Atmosphere />`'s wind uniforms from reading `directive.windDir` directly to reading through `wind-field.js#windAt(t, cameraPos, windState)`. Specifically:

- `uWindScale` ← `windAt(t, cameraPos, ...).intensity` (was: from directive's wind amplitude)
- `uWindDir` ← normalize(`windAt(t, cameraPos, ...).force`) (was: directive's wind direction directly)

Per Meteorologist BACKLOG line 151: *"Atmosphere subscribes too — `uWindScale` + `uWindDir` populated from `windAt(t, cameraPos, ...)`. Cloud advection becomes gust-aware."*

**Use `cameraPos` for the spatial argument** so the cloud field samples wind at where the camera is looking, which gives a natural read for the operator. Trees use their per-instance world position; clouds use camera position.

## Files you'll touch

| File | Status | ~LOC |
|---|---|---|
| `src/components/Atmosphere.jsx` | edit — replace direct `directive.windDir`/`directive.wind*` reads with `windAt(t, cameraPos, windState)` subscription | +30, -15 |
| `src/components/atmosphere-materials.js` | verify — uniform names `uWindScale` + `uWindDir` unchanged; only their source changes (no GLSL edit needed) | 0 |
| `src/lib/wind-field.js` | verify — `windAt(t, pos, windState)` exists per Brief 9a's shape; you consume it unchanged | 0 |
| `meteorologist/ARCHITECTURE.md` | edit — document Atmosphere's migration; cross-reference Brief 9a's contract section | +15 |
| `meteorologist/BACKLOG.md` | edit — mark Phase 7a [Atmosphere side] shipped | +5 |
| `meteorologist/NOTES.md` | edit — session entry | ~30 |

Total: ~80 LOC. Smallest of the queued briefs. Half a baby day.

## Acceptance criteria

1. **`<Atmosphere />` reads `windAt(t, cameraPos, windState)`** — not `directive.windDir` directly. Grep `directive.windDir` in `Atmosphere.jsx` should return zero matches (or only legacy comments).
2. **Cloud advection direction matches tree sway direction** under variable weather. Open LS with a Phase 6 modulator authoring an east-blowing wind; clouds advect east; trees sway east. Synchronized.
3. **Gust-aware cloud advection**: when a Phase 6 modulator pulses `gustsScale` upward, clouds visibly accelerate during the gust spike window — same temporal signature trees show. Spatial advection: clouds catch the gust simultaneously with trees near the camera. (Far-away trees may catch slightly later per spatial gust-front advection — same wind-field, just different `pos` argument.)
4. **No regression on Phase 5a calm-weather behavior.** Clouds in calm weather render visually identical pre/post Brief 9b. Compare against a fixed-weather fixture; snapshot match.
5. **No regression on directive tween (Phase 5a)** — the existing directive tween path still produces smooth transitions in `windState`'s upstream channel. Your migration is downstream of the tween.
6. **Single shader program preserved.** Atmosphere's `programs` count unchanged.
7. **Cross-helper contract is one frozen seam.** Same grep test as 9a: `src/lib/wind-field.js` is the only coupling between Arborist and Meteorologist on wind.
8. **Determinism.** Same weather + same time → identical cloud frame across renders. Wind sampling is deterministic per 9a's `windAt` shape.

## Approach guidance

- **`wind-field.js#windAt` is the only contract you consume.** Don't add a parallel pathway. Don't read directive wind directly anywhere new.
- **`cameraPos` for the spatial argument.** Atmosphere is a single full-sky shader; clouds don't have per-instance positions. Sample at camera position (or scene-anchor — operator decides) so the gust spikes reach the cloud canopy at the right moment.
- **Preserve uniform names**: `uWindScale` and `uWindDir` exist today and feed cloud advection. Just change their SOURCE.
- **`force` vec3 → `uWindDir` + `uWindScale`** — `uWindDir = normalize(force.xz extended to vec3)`, `uWindScale = intensity` (or `length(force)` if `intensity` doesn't match what Atmosphere wants). Verify against current Phase 5a math; preserve scale.
- **Don't change Atmosphere's cloud shader.** The GLSL chunks that consume `uWindDir` + `uWindScale` are unchanged; only the JS-side wiring changes.
- **Phase 5a's directive tween still applies** — `windState` (Meteorologist's runtime publication) is downstream of the tween, so smooth transitions land in `windAt`'s input. No additional tween needed in Brief 9b.

## Surface anything not in this brief

Per [[feedback_baby_must_surface_scope_drift]] — if you find:
- `windState`'s shape on Meteorologist's runtime channel needs adjustment to feed `windAt` cleanly (e.g., `gustFrontVelocity` not published; need to add publishing-side wiring)
- Atmosphere's existing `uWindDir`/`uWindScale` semantics don't match `force`/`intensity` naturally — e.g., `uWindDir` expects scale baked in, or `uWindScale` is wind speed in different units. Surface the conversion math.
- Phase 5a's snapshot tests / fixtures break because the wind source changed — propose retuning vs holding (operator's call)
- Cloud advection visibly desynchronizes from trees because of `cameraPos` vs per-tree-pos sampling difference — this might be the right behavior (gusts traveling), but verify operator expectation
- Bloom or shader-program drift introduced by the migration

Surface in status update AND commit body.

## Out of scope

- **Tree-side wind work** — Brief 9a's territory. If `wind-field.js` needs changes for Atmosphere's consumption, coordinate with Brief 9a's author or escalate; don't modify `wind-field.js` unilaterally.
- **Rain/snow/lightning weather effects** — Phase 7b/c/d shipped; don't retarget them in this brief (they may need their own wind-field migration in a follow-up, but not here).
- **New cloud parameters** — Phase 5a's existing cloud shader uniforms are preserved; this brief is wiring only.
- **Modulator authoring** — Phase 6 modulators that drive `gustsScale` already exist. Don't add new ones.
- **Per-Look gust overrides** — future feature.
- **Anything in `arborist/`** beyond reading from `src/lib/wind-field.js` — your changes live in `meteorologist/` + `src/components/Atmosphere.jsx` + `src/components/atmosphere-materials.js`.

## Memory refs

Read at session start:
- `project_kit_helpers_pattern` — frozen-seam discipline
- `project_per_vertex_spatial_advection` — Sough's Brief 9a established this pattern (vertex shader synthesizes spatial advection from uniforms when per-instance uploads would otherwise be needed). For Atmosphere your consumer is camera-point sampling (single position, not per-fragment) — CPU `windAt(t, cameraPos)` is the right path. The doctrine confirms you're on the CPU side; per-fragment shader-side advection is the tree side's optimization, not yours.
- `feedback_unique_program_cache_key_before_wrappers` — Bloom-stability constraint
- `feedback_geometry_briefs_need_artifact_inspection` — pre-code grep: Phase 5a's existing `uWindDir`/`uWindScale` wiring may have semantic conventions you should preserve (units, normalization). Inspect before drafting math.
- `feedback_baby_briefs_need_identity_framing` (you are the baby)
- `feedback_baby_must_surface_scope_drift` (see above)
- Meteorologist BACKLOG line 147–152 (Phase 7a entry) + your sibling Brief 9a's `scratch/wind-contract-phase7a.md` ADR

## After you ship

Commit body should:
- Lead with one sentence summarizing what changed
- Reference Brief 9b (this doc)
- List files touched + LOC delta per file
- Acceptance-criteria checklist with status per item
- Surface any scope drift in a "Doesn't fix / open follow-ups" section
- Co-author: `Claude` (you)

Status update to Jacob and Boz should be ≤300 words, lead with the most surprising finding.

After Brief 9b lands, cloud advection and tree sway share the wind source — visually synchronized, gust-aware, with spatial front advection visible across the canopy + cloud layer. Phase 7a fully shipped. Audio (rain/snow/thunder) remains future (Audiologist helper). Wind-driven leaf detachment remains future (Phase F+).

Welcome to the cross-helper closer.
