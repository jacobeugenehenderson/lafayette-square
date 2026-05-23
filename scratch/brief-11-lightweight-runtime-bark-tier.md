# Brief 11 (lightweight) — LS runtime distance-driven bark-tier auto-bind

**You are the baby executing this brief.** Not the orchestrator, not a router. The work is yours to do directly. Boz (coordinator) drafted this; Jacob (operator) dispatched it.

**Name yourself — and it MUST be a name that has not already been used in this project.** Babies in this project pattern-match heavily to names they see in NOTES.md / BACKLOG.md / code comments / commits and pick collisions; Jacob has had to redirect repeated misfires (Holm 2026-05-23, Cambium same-day). Pattern-match risk on this brief is moderate — Cork (10A) and Vantage (13) ship the tier seam your work activates; their names will appear in adjacent code. **Do not reach for either.**

**Names already claimed — do NOT reuse any of these:** Whittle, Sequoia, Quill, Riven, Fern, Holm, Birch, Cinder, Tendril, Cambium, Spindle, Linnet, Cork, Vantage, Sough, Wisp, Mullion, Adze, Hazel, Olmsted, Wren, Penzias, Nimbus, Sorrel, Boz.

**Pick something novel.** Anything — a word, a symbol, a string of sounds, something in another language, something invented, a non-plant noun, a mineral, a tool, a star name, a piece of weather, a body of water, an architectural term, a verb conjugation. The project has saturated the plant-adjacent namespace; reach further. State your name in your first message back; sign your commits with it.

---

## Why this brief exists

Brief 10A (Cork, 2026-05-23) shipped `treeBarkTierUniform` — a module-scope tier value (0=aerial, 1=hero, 2=street) read by the bark fragment shader to gate the detail Overlay composite (and, when Brief 10B lands, the posterized-vs-vendor substrate swap). Brief 13 (Vantage) wired the per-frame auto-bind in Salon's `SpecimenViewport`: `topDown` camera → tier 0, ground camera distance > 20m → tier 1, < 20m → tier 2.

**LS runtime has no auto-bind today.** `treeBarkTierUniform.value` initializes to 1 (hero) at module load and never changes in production. Browse cameras (overhead, high altitude) and Hero cameras (eye-level) both render at tier 1 in LS. The aerial-tier perf savings (skipping the detail Overlay's `texture2D` per fragment, and — once 10B lands — skipping the vendor color sample in favor of a smaller posterized tile) are shipped-but-not-deployed in production.

This brief wires the same auto-bind logic Vantage shipped in Salon, but for the LS render tree. Per-frame, a mounted driver computes the desired tier from camera state + scene state, mutates the shared uniform if it changed, and honors `treeBarkTierPinned` so the operator's debug pin (`window.__setBarkShaderTier(n)`) still wins.

## Read first

- `arborist/BACKLOG.md` — Brief 11 lightweight entry (scope-locked 2026-05-23 — full cartograph-SHOT-driven per-Look auto-tier is v2; this brief is just the runtime activation)
- `arborist/NOTES.md` — Brief 10A entry (Cork's tier seam), Brief 13 entry (Vantage's Salon auto-bind — your direct precedent)
- `src/arborist/SpecimenViewport.jsx` lines 117–160 — `DollyCam.useFrame` is the *exact* shape your LS driver mirrors. Read the `if (!treeBarkTierPinned.value)` block at line 153 + the `desired = s.topDown ? 0 : (s.distance < 20 ? 2 : 1)` ternary; you'll write the LS equivalent.
- `src/components/treeAtlasMaterial.js` lines 69–93 — exports `treeBarkTierUniform`, `treeBarkTierPinned`, `setBarkShaderTier(n)`, `releaseBarkShaderTier()`. These are your import surface; no edits.
- `src/components/InstancedTrees.jsx` lines 306–331 — `SwayDriver` is the **structural precedent**: a tiny component mounted inside the InstancedTrees render tree that runs a `useFrame` and writes to a shared uniform. Your `TierDriver` looks like a sibling of `SwayDriver`. Read it carefully — same import pattern, same `useFrame((_, delta) => {})` body shape, no DOM.
- Memory: `[[feedback_baby_briefs_need_identity_framing]]`, `[[feedback_baby_must_surface_scope_drift]]`, `[[feedback_smallness_as_precondition]]`, `[[project_authoring_is_live_production_is_static]]` (the doctrine that LS runtime is the production consumer of authored channels — Brief 10A authored the tier seam; you make the LS consumer read it).

## Goal — and what this phase explicitly does NOT do

**Goal:** A new `TierDriver` component mounted inside the InstancedTrees render tree runs a `useFrame` that:
1. Reads the camera (via `useThree`) and computes a single tier value (0 / 1 / 2) from camera state.
2. Reads `treeBarkTierPinned.value`; if pinned, yields (no mutation).
3. Otherwise writes the computed tier into `treeBarkTierUniform.value` only if it changed (avoid every-frame mutations that trigger no-op uniform-flag-dirty cascades).
4. Mirrors Vantage's Salon-side logic structurally so the LS and Salon behaviors are *recognizably the same algorithm* — operator iterating in Salon can predict LS tier behavior from what they see in the workstage.

**Do NOT:**
- Add new uniforms, new exports, or change the tier-seam contract (`treeBarkTierUniform` / `treeBarkTierPinned` / `setBarkShaderTier` stay exactly as Cork + Vantage shipped them).
- Touch `treeAtlasMaterial.js`. The fragment shader logic + uniform declarations are out of scope.
- Touch `SpecimenViewport.jsx` (Salon-side auto-bind). It's the precedent you mirror, not the file you edit.
- Implement cartograph SHOT-driven tier authoring (operator-authors "this SHOT uses this tier" in design.json). That's the full Brief 11 → v2 territory. This is the lightweight runtime activation only.
- Add per-tree distance computation. The tier is *scene-global*, not per-instance — one tier value covers every tree in the scene per frame. Per-tree tiering is a future brief if ever needed.
- Add a debug HUD or UI surfacing of the current tier. Operator inspects via devtools (`treeBarkTierUniform.value`) if needed; the Salon-side display is the authoring channel.
- Add hysteresis, smoothing, or animated tier transitions. Snap-only per Vantage's precedent — operator-locked.
- Touch SwayDriver. Wind and tier are separate concerns mounted as sibling drivers.

## Architecture

**Tier-selection algorithm (mirrors Vantage's Salon-side):**

Vantage: `desired = topDown ? 0 : (distance < 20 ? 2 : 1)`.

LS context is different from Salon in one structural way: there's no "tree at origin" — there are 745 placements scattered across a ~200m park. The signal that maps Vantage's `topDown` (Salon Overhead camera) to LS is **camera altitude above ground** (Browse view = camera at ~50-200m up; Hero view = camera at ~1.8m). The signal that maps Vantage's `distance` to LS is **camera-to-scene-centroid horizontal distance** — but in practice, LS Browse cameras are both high AND look at the park from outside, so altitude alone may carry the signal.

**Recommended first-pass algorithm — inspect actual LS shot framings before committing:**

```js
function computeTier(camera) {
  const altitude = camera.position.y // y-up world frame
  // Camera at Browse altitude → aerial tier (skip detail composite,
  // sample posterized substrate when 10B lands). 50m is a first-pass
  // threshold; tune against actual LS shot framings during inspection.
  if (altitude > 50) return 0
  // Walking-distance / street tier (10C cooled, falls back to hero today).
  // Threshold mirrors Vantage's Salon 20m boundary.
  // ground-distance from camera to scene centroid would refine this if
  // altitude alone reads wrong — surface during inspection.
  if (altitude < 5) return 2
  // Default: Hero.
  return 1
}
```

**Critical: inspect actual LS shot camera positions before locking the thresholds.** Cartograph defines SHOTs in `scene.json` (you can read one via `useSceneJson` or curl `/scene.json?look=lafayette-square`). The 50m / 5m numbers above are starting guesses; the actual Browse / Hero / Street framings in LS scene.json will tell you whether those thresholds put each shot in the intended tier.

**Implementation site — `TierDriver` as a sibling of `SwayDriver`:**

```js
// In src/components/InstancedTrees.jsx, after SwayDriver definition.
function TierDriver() {
  const camera = useThree(s => s.camera)
  useFrame(() => {
    if (treeBarkTierPinned.value) return
    const desired = computeTier(camera)
    if (treeBarkTierUniform.value !== desired) {
      treeBarkTierUniform.value = desired
    }
  })
  return null
}
```

`useThree` import is already in the file (used elsewhere in the render tree); if not, add it alongside the existing `useFrame` import from `@react-three/fiber`.

**Mount site:** wherever `SwayDriver` is mounted today inside `ParkPopulation` (the consuming component) — mount `<TierDriver />` as a sibling immediately after. Both drivers do nothing visual; they just push uniform values per frame.

**Pin-honoring contract** (mirror Vantage exactly):
- If `treeBarkTierPinned.value === true`, `TierDriver` does nothing. The operator's `window.__setBarkShaderTier(n)` call has set the pin; their value sticks across frames.
- When operator calls `window.__releaseBarkShaderTier()`, the pin flips false, `TierDriver` resumes auto-binding from the next frame onward.
- Both Salon's `DollyCam` and LS's `TierDriver` honor the same shared pin. If operator pins in one surface, they have to release before the other resumes.

**Single shader program preserved.** This brief writes uniform values; doesn't touch shader compilation, includes, or chunks. Bloom-stable.

## File-by-file plan

| File | Status | ~LOC |
|---|---|---|
| `src/components/InstancedTrees.jsx` | edit — add `computeTier(camera)` helper + `TierDriver` component + mount call + (if needed) `useThree` import | +35 |
| `arborist/BACKLOG.md` | edit — mark Brief 11 lightweight shipped | +3 |
| `arborist/NOTES.md` | edit — session entry | ~40 |
| `arborist/ARCHITECTURE.md` | edit — extend view-aware bark tiering subsection with the LS runtime driver | +10 |

Estimated total: ~90 LOC, ~half a baby day.

## Acceptance criteria

1. **LS Browse view renders at tier 0 (aerial).** Open LS at the default Browse SHOT framing. Inspect `treeBarkTierUniform.value` in devtools (or via a temporary `console.log` removed before commit) → reads 0. The detail Overlay composite is skipped per `step(0.5, uBarkShaderTier)` in 10A's shader.
2. **LS Hero view renders at tier 1.** Switch to a Hero SHOT framing. Tier auto-binds to 1. Detail Overlay fires correctly; visual identity-equal to today's pre-Brief-11 LS rendering at Hero distance.
3. **Pin-and-release works.** `window.__setBarkShaderTier(0)` in devtools forces tier 0 even at Hero camera; `window.__releaseBarkShaderTier()` resumes auto-binding. Mirror behavior of Salon-side pin.
4. **Salon parity unaffected.** Salon's Overhead/Ground auto-bind continues to work as Vantage shipped it. Both surfaces read the same `treeBarkTierUniform` + `treeBarkTierPinned`; no cross-surface interference.
5. **No regression at Hero quality.** Detail Overlay composite + Brief 2.1 luminance gradient REPLACE render byte-equivalent at Hero distance (since pre-Brief-11 was already tier 1).
6. **Perf signal at Browse distance.** Measure the per-frame `texture2D` count for bark fragments at Browse distance pre- vs post-11. Should drop by one (the detail sub-region sample no longer fires). Surface in survey if measurable through Chrome DevTools' GPU profiling, or just confirm via code-read of the fragment chunk.
7. **Single shader program preserved.** No `customProgramCacheKey` introduced. Three.js's render stats `programs` count unchanged across tier values.
8. **Threshold tuning is data-driven.** Your survey reports the actual camera-altitude distribution across LS's SHOT framings (`scene.json#shots.*.camera`). The threshold values you commit should reflect what the actual LS cameras look like, not the brief's first-pass guess.
9. **Per [[feedback_smallness_as_precondition]]**: net LOC delta + per-tier fragment cost reduction quantified, not asserted.

## Composition with in-flight + queued work

- **Brief 10A (Cork — shipped)**: provides the seam your driver writes to. No file overlap.
- **Brief 13 (Vantage — shipped)**: Salon-side precedent. You read its code, mirror its pattern, don't touch its files.
- **Brief 6.2 (Adze — in flight)**: orthogonal. Touches bake-time decimation; you touch runtime tier-binding. Zero file overlap. Safe to dispatch in parallel.
- **Brief 10B (queued)**: composes naturally — when 10B lands the posterized substrate, your Browse-tier-0 binding gates posterized sampling instead of vendor sampling per the `step(1.5, uBarkShaderTier)` gate 10B will install. Brief 11 makes that gate *actually fire in production*.
- **Brief 3 (deformer rig, queued)**: orthogonal. Vertex-shader displacement; you touch fragment-shader-uniform tier.

## Surface anything not in this brief

Per `[[feedback_baby_must_surface_scope_drift]]`, watch for and disclose in your commit body:

- **Threshold calibration data.** Report the camera altitude (and distance to scene centroid if you ended up using it) at each major LS SHOT framing. Your committed thresholds should land each framing in the intended tier; if you find a SHOT that straddles a threshold awkwardly, surface it.
- **Cartograph SHOT framings that suggest an explicit tier authoring channel** would land cleanly. Brief 11 lightweight is the runtime activation; the v2 story is cartograph-SHOT-driven (operator authors "this SHOT uses tier X" in design.json). If you find a SHOT where distance/altitude don't cleanly determine the right tier, that's evidence the v2 authoring channel is needed sooner — surface as a follow-up.
- **Animation between tiers.** Snap-only per Vantage's precedent and operator-lock. If you find the snap produces a visible pop during SHOT transitions or camera cranes through the threshold, surface it but don't ship animation — that's a v1.6 polish brief.
- **`TierDriver` mount-site question.** SwayDriver is mounted inside `ParkPopulation`. Verify that's the right place — if `ParkPopulation` doesn't mount in some render paths (e.g., Preview, Cartograph live preview), your TierDriver won't fire there either, and LS-but-not-Preview tier swap would be a surprising asymmetry. Surface what you find.
- **Camera reference stability.** `useThree(s => s.camera)` returns the same camera ref across re-renders; subscribing should be fine. If you encounter ref-instability that triggers extra renders, surface it.
- **`treeBarkTierPinned` cross-tab semantics.** The pin is in-process module state; cross-tab (LS open in two tabs) won't share it. Probably fine; surface if you can think of a scenario where it matters.

## Out of scope

- Cartograph SHOT-driven tier authoring (operator authors "this SHOT uses this tier" in design.json) — v2 territory.
- Per-tree tiering — scene-global only.
- Animated tier transitions — snap-only.
- New uniforms or shader edits — pure consumer-side wiring.
- Salon-side changes — Vantage's logic is the precedent, not the editing target.
- Brief 10B's posterized substrate — orthogonal; 10B's gate composes with your tier value but you don't read or write posterized state.
- Performance profiling beyond AC #6's lightweight check.
- HUD or debug-overlay UI for tier inspection — devtools-only.

## Dispatch posture

Cold dispatch. Parallel-safe with Adze's Brief 6.2 (zero file overlap). Single commit when AC 1–9 pass. Title: `arborist: Brief 11 lightweight (<your-name>) — LS runtime auto-binds bark shader tier`.

— Boz
