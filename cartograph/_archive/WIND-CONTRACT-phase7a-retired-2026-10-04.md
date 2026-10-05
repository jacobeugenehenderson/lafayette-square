# Diary — the Phase 7a wind contract, retired 2026-10-04 (Gale)

Retired when its last caller (`Atmosphere.jsx`) moved onto the wind sheet's live state. `resolveWindState`, `defaultWindState` and the time-based `windAt(t, …)` were deleted from `src/lib/wind-field.js`. The live design is `cartograph/ARCHITECTURE.md §8` "The wind sheet". Known defect of the retired path: `resolveWindState` mapped FROM to TO as (−sin, −cos), mirroring the wind north↔south (the world is +X east, +Z south).

## From arborist/ARCHITECTURE.md — "Arborist ↔ Meteorologist wind contract", the seam + tree-consumer bullets

Second frozen seam between the helpers (after the canary contract). Same discipline: no helper-to-helper imports; both helpers import `src/lib/wind-field.js`. ADR at `scratch/wind-contract-phase7a.md` records the design decisions (S1–S5).

- **The module.** `src/lib/wind-field.js` exports `windAt(t, pos, windState) → { force: Vector3 (m/s), intensity: number (m/s) }`, plus `resolveWindState(directive)` and `defaultWindState()`. Pure — identical inputs return identical outputs, no global state.
- **Three temporal scales composed inside `windAt`.** (1) DRIFT = `baseDirection × baseSpeedMps`, scene-uniform. (2) GUST ENVELOPE — a [0,1] slow modulator (~30s period) authored by Phase 6 modulators. (3) GUST SPIKES — `smoothmax`-shaped 1–2 s spikes whose phase is offset per `pos` by `dot(pos, gustFrontVelocity)/|front|²` seconds, so spikes visibly travel across the scene at `|gustFrontVelocity|`.
- **`windState` shape (publisher contract).** `{ baseSpeedMps, baseDirection: Vector3, gustsScale, gustEnvelope, gustFrontVelocity: Vector3 }`. Resolved from the existing tweened directive channel — no new store key, no new React context.
- **Independent gust-front velocity (ADR S2).** `gustFrontVelocity` is independent of base wind, default `baseDirection × 10 m/s`; modulators may author it. Real-world outflow boundaries can outrun ambient wind, and the richer model is the architectural extension (`feedback_spec_compression`).
- **Tree consumer (`InstancedTrees.jsx` + shared `treeAtlasMaterial.js`).** Per-frame `SwayDriver` calls `resolveWindState(tweenedDirective)`, writes drift force + gust parameters into `treeSwayUniforms`. The vertex shader synthesises its own per-tree spatially-advected gust spike from `uGustsScale` + `uGustEnvelope` + `uGustFrontVelocity` — the spatial advection (AC #5) lives in the shader, not the CPU sample point. Multi-scale damping per `aWindTier` (0=trunk, 1=branch, 2=twig, 3=leaf).

## From arborist/ARCHITECTURE.md bullet

- **Retired uniforms.** Phase 5a's `uSwayWindSpeed` + `uSwayWindDir` are removed from the tree side (replaced by `uWindForce`/`uWindIntensity`). Atmosphere still owns `uWindScale`/`uWindDir` for its own cloud advection — Brief 9b retargets Atmosphere onto `windAt` too.

## From arborist/ARCHITECTURE.md bullet

- **Salon preview parity (`feedback_salon_preview_is_authoring_surface`).** SpecimenViewport's former `userData.__workstageWindPatched` onBeforeCompile patch is RETIRED — the workstage drives the same shared `treeSwayUniforms` the LS runtime drives. One vertex path, two consumers.

## From meteorologist/ARCHITECTURE.md §9 "Wind contract" body

Wind direction + speed live in the atmospheric directive Meteorologist publishes (Almanac + Phase 6 modulators). Phase 7a / Brief 9a (Sough, 2026-05-23) landed the cross-helper seam at `src/lib/wind-field.js` — ADR at `scratch/wind-contract-phase7a.md`.

**The seam.** Both helpers import `src/lib/wind-field.js`; neither helper imports the other (mirrors the canary contract discipline in `arborist/ARCHITECTURE.md`). Exports `windAt(t, pos, windState) → { force, intensity }` (pure, m/s) + `resolveWindState(directive)` + `defaultWindState()`.

**Three temporal scales composed inside `windAt`.** Drift (`baseDirection × baseSpeedMps`), gust envelope ([0,1] slow modulator-authored), gust spikes (smoothmax-shaped 1–2 s spikes phase-offset by `dot(pos, gustFrontVelocity)/|front|²` seconds — spatial advection makes fronts visibly travel across the scene).

**Directive fields (post-Brief 9b, see `pipeline/schema/directive.schema.json`):**
- `wind.scale` — legacy unitless multiplier. Post-Brief 9b, no live consumer reads it directly; `resolveWindState` only references it via the `baseSpeedMps = scale * 3` fallback for un-migrated look files lacking `wind.speed`. Safe to drop once those look files are migrated.
- `wind.dir` — bearing the wind blows TO (degrees). Note: the runtime treats it as FROM and flips internally; the schema-vs-code wording disagreement predates 9a.
- `wind.speed` — m/s, the m/s authority for `wind-field.js`.
- `wind.gustsScale` — m/s peak gust-spike amplitude. Modulators author it.
- `wind.gustEnvelope` — [0,1] slow modulator on spike amplitude.
- `wind.gustFrontVelocity` — `{x, z}` independent of base wind (default `baseDirection × 10 m/s`; modulators may override).

**Consumers.**
- **InstancedTrees + the shared `treeAtlasMaterial.js`** — drift + gust params flow into `treeSwayUniforms`; vertex shader synthesises per-tree spatially-advected spikes from `uGustFrontVelocity`. Multi-scale damping per runtime-merged `aWindTier` (trunk/branch/twig/leaf). Salon-preview parity preserved.
- **`<Atmosphere />`** — Brief 9b (Wisp, 2026-05-23) retargeted onto `windAt(clock.elapsedTime, camera.position, ws)`. `uWindScale = sample.intensity / 3.0` (the `/3` mirrors `resolveWindState`'s `baseSpeedMps = scale * 3` legacy heuristic so Phase 5a calm-weather cloud advection is byte-identical pre/post 9b). `uWindDir = normalize(sample.force)` — the FROM→TO flip lives inside `resolveWindState`, not at the consumer. Cloud advection now inherits gust spikes; far trees catch the spatial gust front later than the cloud canopy and the trees nearest the camera, in lockstep.
- **Future.** Rain particles (already wind-tilted; could subscribe), audio (gated on speed thresholds), heat-haze (low-wind gated).

