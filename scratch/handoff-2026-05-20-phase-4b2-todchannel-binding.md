# Phase 4b.2 — TodChannel uniform binding

**From:** Meteorologist orchestrator
**To:** baby (fresh agent)
**Date:** 2026-05-20

---

You're closing the authoring loop. Today the operator drags a slider in Teacup, the value autosaves to `public/clouds/presets.json`, and the cloud in the canary viewport ignores it. Your job: make the viewport actually respond.

Phase 4b.1 shipped the `<Atmosphere />` raymarched shader (commit `d1c66fe`). All 12 shape + lighting uniforms are hardcoded to `cumulus_humilis` values. You're swapping the hardcode for a per-frame read from the active preset.

## Read first

1. `meteorologist/README.md` — the "Start here in the morning" section literally describes this phase
2. `src/components/Atmosphere.jsx` — the consumer
3. `src/components/atmosphere-materials.js` lines 298-357 — the uniform table you're wiring
4. `src/meteorologist/cloudParamFields.js` — the 12-param metadata (slider → channel key)
5. `src/meteorologist/stores/useMeteorologistStore.js` — has `activePresetId` already; you need a selector that returns the active preset's `params` map
6. `src/cartograph/animatedParam.js` lines 270+ — `resolveGroupAtMinute(channel, minute, slotMinutes, fieldKeys, defaults)` is the resolver. Note: each cloud param is its own single-field channel (shape `{ values: { value: 0.42 } }` or animated equivalent), so each resolves independently
7. `src/hooks/useTimeOfDay.js` — `currentTime` (Date) is the truth; convert to minute-of-day with the existing helper or inline `(d.getHours()*60 + d.getMinutes())`

## What to build

### 1. Selector in `useMeteorologistStore.js`

Add a selector that returns the active preset object (not just id):

```js
// Inside the store, alongside existing actions
getActivePreset: () => {
  const { activePresetId, presets } = get()
  return presets?.find(p => p.id === activePresetId) || null
}
```

(Or `selectActivePreset(state)` outside the store — match the existing convention.)

### 2. Param-to-uniform mapping

Twelve params from `CLOUD_PARAM_FIELDS` map 1:1 to shader uniforms (camelCase param → `u`+PascalCase uniform):

| Param key       | Uniform           |
|-----------------|-------------------|
| coverage        | uCoverage         |
| density         | uDensity          |
| thickness       | uThickness        |
| baseAlt         | uBaseAlt          |
| warpFreq        | uWarpFreq         |
| warpAmp         | uWarpAmp          |
| noiseSeed       | uNoiseSeed        |
| octaves         | uOctaves          |
| sunScatter      | uSunScatter       |
| ambientFloor    | uAmbientFloor     |
| edgeSilver      | uEdgeSilver       |
| shadowStrength  | uShadowStrength   |

`uWindScale` is wind (lives in Conditions/directive, NOT in CLOUD_PARAM_FIELDS); leave alone for this phase.

A small lookup table inside `Atmosphere.jsx` is cleanest:

```js
const PARAM_TO_UNIFORM = {
  coverage: 'uCoverage', density: 'uDensity', thickness: 'uThickness',
  baseAlt: 'uBaseAlt', warpFreq: 'uWarpFreq', warpAmp: 'uWarpAmp',
  noiseSeed: 'uNoiseSeed', octaves: 'uOctaves',
  sunScatter: 'uSunScatter', ambientFloor: 'uAmbientFloor',
  edgeSilver: 'uEdgeSilver', shadowStrength: 'uShadowStrength',
}
```

### 3. Per-frame resolution in `Atmosphere.jsx`

In the existing `useFrame` (where `uTime` and `uCameraPos` are already written each frame):

```js
useFrame(({ clock, camera }) => {
  if (!material) return
  material.uniforms.uTime.value = clock.elapsedTime
  material.uniforms.uCameraPos.value.copy(camera.position)

  // NEW: drive shape + lighting uniforms from active preset
  const preset = useMeteorologistStore.getState().getActivePreset()
  if (preset?.params) {
    const minute = currentMinuteOfDay()                 // helper, see below
    const slotMinutes = getTodSlotMinutes(currentTime)  // existing helper
    for (const [paramKey, uniformKey] of Object.entries(PARAM_TO_UNIFORM)) {
      const channel = preset.params[paramKey]
      if (!channel) continue
      const resolved = resolveGroupAtMinute(channel, minute, slotMinutes, ['value'], { value: material.uniforms[uniformKey].value })
      material.uniforms[uniformKey].value = resolved.value
    }
  }
})
```

`getTodSlotMinutes` is already in `animatedParam.js` exports. `currentMinuteOfDay()` — grep for any existing helper (`CelestialBodies.jsx` may have one); if none, just `(d => d.getHours() * 60 + d.getMinutes())(useTimeOfDay.getState().currentTime)`.

### 4. Subscribe to active preset changes

The `useFrame` reads via `getState()` so it auto-picks-up store changes, but the material itself doesn't re-render. If active preset switches mid-session (operator picks a different preset in TeapotLibrary), the next frame reads new params automatically — no extra work. **However**, autosave's debounce means the just-edited slider value may not be in the store-side preset yet. Two options:

- **A (simpler):** Atmosphere reads from the working store's `params` directly (the same object Teacup's sliders mutate before autosave flushes). Sliders mutate → store reflects immediately → next frame's resolver picks up the new value. Verify the store mutation path actually updates `presets[i].params` synchronously (it should; check `useMeteorologistStore.js`).
- **B (defensive):** if there's a separate `draftParams` shape, prefer reading the draft. Less likely needed — Meteorologist explicitly has no draft/published split per the architecture.

Option A is almost certainly the right one. Verify in the store; if `setPresetParam` (or similar) updates the in-memory `presets` array synchronously, you're done.

## Verification

- `npm run dev` → open `/meteorologist.html` → pick a preset → drag `Coverage` slider → cloud in viewport gets denser/sparser **immediately** (no debounce wait). This is the primary success criterion.
- Drag `Density`, `Warp amp`, `Sun scatter`, `Edge silver` — each visibly affects the cloud.
- Author a TOD-animated channel (slot-keyframe a param across `dawn` → `noon` → `dusk`), scrub the time strip — value lerps between waypoints frame-to-frame.
- Switch active preset in TeapotLibrary — viewport cloud instantly updates to the new preset's character.
- Build clean: `npm run build`.

## Disclosure expectations

Commit body:

- Whether you went store-direct (option A) or draft-shape (option B); if A, confirm the mutation path you verified
- Any uniform that didn't map cleanly (e.g., if `noiseSeed` needs an int cast)
- Whether you added a minute-of-day helper or reused an existing one (and where it lives)
- Any deviation from this brief that you decided was a better path

## Stash isolate

Jacob's working tree is wide. `git status --short` before commit; stage only:

- `src/components/Atmosphere.jsx`
- `src/meteorologist/stores/useMeteorologistStore.js` (selector addition)
- `meteorologist/NOTES.md` (add a 2026-05-20 entry: "Phase 4b.2 shipped — TodChannel uniform binding")
- `meteorologist/BACKLOG.md` (mark 4b.2 complete)
- `meteorologist/README.md` (update "Start here in the morning" — 4b.3 becomes next)

Anything else gets stashed.

## Why this matters

Phase 4b.1 proved the shader exists. Phase 4b.2 proves the authoring tool actually authors. Phase 4b.3 (next) flips the production runtime to consume this. Without 4b.2 you can't visually tune presets; without 4b.3 nothing the operator authors reaches LS. Sequential gates.

— Claude (Meteorologist orchestrator)
