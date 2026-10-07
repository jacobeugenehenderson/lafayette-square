/**
 * usePostFxDriver — the ONE per-frame post-FX driver.
 *
 * Lifts PostProcessing.jsx's per-frame `useFrame` driving into a single hook:
 * it resolves every authored post-FX channel (exposure, warmth, fill, halo,
 * grade, grain, ao, bloom, dof) at the current TOD minute and writes the
 * module-level refs the Effect classes read + the N8AO/CustomBloom pass configs
 * + gl.toneMappingExposure, and calls the shared DoF driver (dofDriver.js).
 *
 * Why this module owns the refs (2026-06-30, render-pipeline install,
 * HANDOFF-render-pipeline-install.md): the driving refs ARE the driver's state —
 * the effect classes (renderPipeline.jsx) read them each pass. Keeping refs + the
 * per-frame writer together in one module makes the dependency one-directional
 * (its readers import FROM here) and is the seam the installer plugs into. This
 * hook is the SINGLE driver for all three surfaces (production, Stage, Preview) —
 * there is no second copy to hand-sync (PreviewPostFx's forked driver is retired).
 */
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import { weatherExposureScale } from '../lib/sky-scalars.js'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import {
  BLOOM_FIELD_KEYS, BLOOM_FLAT_DEFAULTS,
  AO_FIELD_KEYS, AO_FLAT_DEFAULTS,
  EXPOSURE_FLAT_DEFAULTS,
  WARMTH_FLAT_DEFAULTS, WARMTH_FIELD_KEYS,
  FILL_FLAT_DEFAULTS,
  HALO_FIELD_KEYS, HALO_FLAT_DEFAULTS,
  GRADE_FIELD_KEYS, GRADE_FLAT_DEFAULTS,
  GRAIN_FLAT_DEFAULTS,
  REVEAL_FIELD_KEYS, REVEAL_FLAT_DEFAULTS,
} from '../cartograph/skyLightChannels.js'
import { revealProgress, markDetail } from '../lib/startupMarks.js'
import { applyDofFrame } from './dofDriver.js'
import { movieFocus, resolveFocusId, focusBox } from '../lib/focusObject.js'
import useSlabBuildingIndex from '../hooks/useSlabBuildingIndex.js'
import { terrainExag } from '../utils/terrainShader.js'

// ── Module-level driving refs ────────────────────────────────────────────────
// All operator-authored params flow through these; the hook's useFrame populates
// them from the resolved channels, and the Effect's own update() pass (in
// PostProcessing.jsx) reads them into uniforms — keeps the per-frame path
// identical to the SC.1 sky/lighting consumer pattern.
export const _fillToeRef         = { current: 1 - FILL_FLAT_DEFAULTS.crush }
export const _exposureRef        = { current: EXPOSURE_FLAT_DEFAULTS.value }

/**
 * THE exposure, the one expression both writers use (this driver, PostProcessing.jsx#ExposureTicker): the Look's
 * authored exposure × the weather's neutral density (one stop down at full storm) × THE DAWN — rising to 1 over the
 * Look's `reveal.dawn` seconds from the splash sky's level (Jacob, 2026-10-07: "the light fades up too, like the
 * world is coming alive"). A uniform: nothing recompiles. On a page with no reveal gate the dawn is 1.
 */
export function townExposure(exposureChannel, revealChannel, minute, slotMins) {
  const dawn = resolveGroupAtMinute(revealChannel, minute, slotMins, REVEAL_FIELD_KEYS, REVEAL_FLAT_DEFAULTS).dawn
  return resolveGroupAtMinute(exposureChannel, minute, slotMins, ['value'], EXPOSURE_FLAT_DEFAULTS).value
    * weatherExposureScale(useSkyState.getState().storminess)
    * dawnLevel(dawn)
}
// The dawn rises FROM THE SPLASH'S SKY (Jacob, 2026-10-07): the reveal mark carries `from`, the town sky's brightness
// at that moment against its brightest that day (Town.jsx#RevealGate) — near 0 at night (a true dawn out of the dark),
// near 1 at noon (a gentle brightening). 1 on a page with no gate.
function dawnLevel(seconds) {
  const p = revealProgress(seconds)
  if (p >= 1) return 1
  const from = markDetail('reveal')?.from ?? 0
  return from + (1 - from) * p
}
export const _warmthRef          = { current: WARMTH_FLAT_DEFAULTS.value }
export const _tintRef            = { current: WARMTH_FLAT_DEFAULTS.tint }
export const _gradeContrastRef   = { current: GRADE_FLAT_DEFAULTS.contrast }
export const _gradeSatRef        = { current: GRADE_FLAT_DEFAULTS.saturation }
export const _gradeVignetteRef   = { current: GRADE_FLAT_DEFAULTS.vignette }
export const _gradeBrightnessRef = { current: GRADE_FLAT_DEFAULTS.brightness }
export const _grainScaleRef      = { current: GRAIN_FLAT_DEFAULTS.scale }
// AerialPerspective — uHazeStrength × uHazeColor authored by the Halo channel.
export const _haloStrengthRef    = { current: HALO_FLAT_DEFAULTS.strength }
export const _haloColorRef       = { current: new THREE.Color(HALO_FLAT_DEFAULTS.color) }


/**
 * Drive all post-FX channels each frame. Called once by PostProcessing (the one
 * consumer). Identical for production and Stage — Stage just passes the resolved
 * channels from its live store overrides; production passes the scene.json-baked
 * channels. Zero behavior fork by construction.
 *
 * @param resolved  the already-resolved channels + drive targets:
 *   { bloomChannel, aoChannel, exposureChannel, warmthChannel, fillChannel,
 *     haloChannel, gradeChannel, grainChannel, dofChannel, dofOn, heroSubject (the town's hero — what a keyframe's
 *     'hero' focus names; src/lib/focusObject.js), viewMode,
 *     aoRef, bloomRef }
 */
export function usePostFxDriver({
  bloomChannel, aoChannel, exposureChannel, warmthChannel, fillChannel,
  haloChannel, gradeChannel, grainChannel, dofChannel, revealChannel, dofOn, heroSubject,
  viewMode, aoRef, bloomRef,
}) {
  const { gl, camera, scene } = useThree()
  const controls = useThree((s) => s.controls)

  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMins = getTodSlotMinutes(tod.currentTime)

    // Exposure / Warmth / Fill → module refs consumed by FilmGrade.update(). The exposure is townExposure (above).
    _exposureRef.current = townExposure(exposureChannel, revealChannel, minute, slotMins)
    const wb = resolveGroupAtMinute(warmthChannel, minute, slotMins, WARMTH_FIELD_KEYS, WARMTH_FLAT_DEFAULTS)
    _warmthRef.current   = wb.value
    _tintRef.current     = wb.tint
    _fillToeRef.current  = 1 - resolveGroupAtMinute(fillChannel, minute, slotMins, ['crush'], FILL_FLAT_DEFAULTS).crush

    // Halo strength + color → module refs consumed by AerialPerspective.update().
    const halo = resolveGroupAtMinute(haloChannel, minute, slotMins, HALO_FIELD_KEYS, HALO_FLAT_DEFAULTS)
    _haloStrengthRef.current = halo.strength
    _haloColorRef.current.set(halo.color)

    // Grade contrast / sat / vignette / brightness + Grain scale → module refs
    // consumed by FilmGrade.update() / FilmGrain.update(). Same channel +
    // resolver shape as bloom/ao — operator can flip these to {animated:'tod',...}
    // through the standard panel UI without touching the consumer.
    const grade = resolveGroupAtMinute(gradeChannel, minute, slotMins, GRADE_FIELD_KEYS, GRADE_FLAT_DEFAULTS)
    _gradeContrastRef.current   = grade.contrast
    _gradeSatRef.current        = grade.saturation
    _gradeVignetteRef.current   = grade.vignette
    _gradeBrightnessRef.current = grade.brightness
    // grade.toe is the literal FilmGrade uniform; the Fill channel's piecewise
    // mapping above overrides it (operator-facing "distinct ↔ soft shadows"
    // axis). Fill remains canonical.
    const grain = resolveGroupAtMinute(grainChannel, minute, slotMins, ['scale'], GRAIN_FLAT_DEFAULTS)
    _grainScaleRef.current = grain.scale
    // ⛔ THE OVERHEAD PLAN ('browse') IS A MAP, NOT WEATHER (Jacob, 2026-09-29: the mist and fog "must not show in
    // browse"): no aerial haze and no film grain there, whatever the Look authors. Zeroed here, per frame, rather than
    // unmounting the passes — that would remount the composer on every shot change. The movie and street keep theirs;
    // Stage (viewMode undefined) shows the authored values. The fog itself is Town.jsx's (StageFog, off in plan).
    if (viewMode === 'browse') { _haloStrengthRef.current = 0; _grainScaleRef.current = 0 }

    // gl.toneMappingExposure tracks the authored exposure. EffectComposer
    // overrides this in the FilmGrade pass; we still mirror it so any
    // composer-bypass path (none today, but cheap insurance) reads the same
    // number.
    gl.toneMappingExposure = _exposureRef.current

    // AO — N8AOPostPass params resolved from the operator's `ao` channel.
    const ao = aoRef.current
    if (ao?.configuration) {
      const aoTriple = resolveGroupAtMinute(aoChannel, minute, slotMins, AO_FIELD_KEYS, AO_FLAT_DEFAULTS)
      ao.configuration.aoRadius        = aoTriple.radius
      ao.configuration.intensity       = aoTriple.intensity
      ao.configuration.distanceFalloff = aoTriple.distanceFalloff
    }

    // Bloom — operator-authored only (via the `bloom` channel). Planetarium
    // viewMode preserves Scene.jsx's old dramatic bump (intensity 1.8 /
    // threshold 0.15 / spread 0.5 neutral). (The hardcoded sun-altitude night
    // boost was removed 2026-06-07 — a hidden hardwire that drove the luminance
    // threshold negative at night and washed the whole frame.)
    const bloom = bloomRef.current
    if (bloom) {
      const lm = bloom.luminanceMaterial
      if (viewMode === 'planetarium') {
        bloom.intensity = 1.8
        bloom.warmCool = 0.5
        bloom.spread = 0.5
        if (lm) { lm.threshold = 0.15 }
      } else {
        const base = resolveGroupAtMinute(bloomChannel, minute, slotMins, BLOOM_FIELD_KEYS, BLOOM_FLAT_DEFAULTS)
        bloom.intensity = base.intensity
        bloom.warmCool = base.warmCool
        bloom.spread = base.spread
        if (lm) {
          lm.threshold = base.threshold
        }
      }
    }

    // DoF / Focus — the ONE shared per-frame driver (./dofDriver.js). Since all
    // three surfaces drive through this hook, the hero-pocket VIEW-Z anchor + the
    // browse look-down gate cannot drift between production and the publish gate.
    // Focus = the movie's focus OBJECTS (src/lib/focusObject.js — the keyframes' `focus`, the hero by default), boxed
    // from what is drawn this frame; else the default controls' target (the orbit pivot, the street's aim).
    // Only meaningful when dofOn (i.e. the DoF pass is mounted).
    if (dofOn) {
      let focus = null
      if (movieFocus.on) {
        const ctx = { scene, index: useSlabBuildingIndex.getState().index, exag: terrainExag.value }
        const box = (id) => { const r = resolveFocusId(id, heroSubject); return r ? focusBox(r, ctx) : null }
        const a = box(movieFocus.from), b = movieFocus.to === movieFocus.from ? a : box(movieFocus.to)
        if (a || b) focus = { a, b, lam: movieFocus.lam }
      }
      applyDofFrame({ camera, dofChannel, minute, slotMins, focusPoint: controls?.target, focus })
    }
  })
}
