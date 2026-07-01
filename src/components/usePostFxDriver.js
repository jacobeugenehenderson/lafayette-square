/**
 * usePostFxDriver — the ONE per-frame post-FX driver.
 *
 * Lifts PostProcessing.jsx's per-frame `useFrame` driving into a single hook:
 * it resolves every authored post-FX channel (exposure, warmth, fill, halo,
 * grade, grain, ao, bloom, dof) at the current TOD minute and writes the
 * module-level refs the Effect classes read + the N8AO/CustomBloom pass configs
 * + gl.toneMappingExposure, and calls the shared DoF driver (dofDriver.js).
 *
 * Why this module owns the refs (2026-06-30, Phase 1 of the render-pipeline
 * install, HANDOFF-render-pipeline-install.md): the driving refs ARE the
 * driver's state — the effect classes in PostProcessing.jsx read them, Preview's
 * PreviewPostFx writes them (via the `_postFxRefs` bag). Keeping refs + the
 * per-frame writer together in one module makes the dependency one-directional
 * (PostProcessing imports FROM here) and is the seam the Phase-2 installer plugs
 * into. This is a PURE REFACTOR — the per-frame math is byte-identical to the
 * inline useFrame it replaced.
 */
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import useTimeOfDay from '../hooks/useTimeOfDay'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import {
  BLOOM_FIELD_KEYS, BLOOM_FLAT_DEFAULTS,
  AO_FIELD_KEYS, AO_FLAT_DEFAULTS,
  EXPOSURE_FLAT_DEFAULTS,
  WARMTH_FLAT_DEFAULTS,
  FILL_FLAT_DEFAULTS,
  HALO_FIELD_KEYS, HALO_FLAT_DEFAULTS,
  GRADE_FIELD_KEYS, GRADE_FLAT_DEFAULTS,
  GRAIN_FLAT_DEFAULTS,
} from '../cartograph/skyLightChannels.js'
import { applyDofFrame } from './dofDriver.js'

// ── Module-level driving refs ────────────────────────────────────────────────
// All operator-authored params flow through these; the hook's useFrame populates
// them from the resolved channels, and the Effect's own update() pass (in
// PostProcessing.jsx) reads them into uniforms — keeps the per-frame path
// identical to the SC.1 sky/lighting consumer pattern.
export const _fillToeRef         = { current: FILL_FLAT_DEFAULTS.value }
export const _exposureRef        = { current: EXPOSURE_FLAT_DEFAULTS.value }
export const _warmthRef          = { current: WARMTH_FLAT_DEFAULTS.value }
export const _gradeContrastRef   = { current: GRADE_FLAT_DEFAULTS.contrast }
export const _gradeSatRef        = { current: GRADE_FLAT_DEFAULTS.saturation }
export const _gradeVignetteRef   = { current: GRADE_FLAT_DEFAULTS.vignette }
export const _gradeBrightnessRef = { current: GRADE_FLAT_DEFAULTS.brightness }
export const _grainScaleRef      = { current: GRAIN_FLAT_DEFAULTS.scale }
// AerialPerspective — uHazeStrength × uHazeColor authored by the Halo channel.
export const _haloStrengthRef    = { current: HALO_FLAT_DEFAULTS.strength }
export const _haloColorRef       = { current: new THREE.Color(HALO_FLAT_DEFAULTS.color) }

// Exposed ref bag so non-PostProcessing consumers (e.g. PreviewPostFx, which
// mounts FilmGrade/FilmGrain/AerialPerspective without the full chain) can
// populate the same module-level refs from their own per-frame driver. Without
// this, Preview's effects render with boot defaults regardless of authored
// channel values. (Re-exported from PostProcessing.jsx for its import path.)
export const _postFxRefs = {
  fillToe:         _fillToeRef,
  exposure:        _exposureRef,
  warmth:          _warmthRef,
  gradeContrast:   _gradeContrastRef,
  gradeSat:        _gradeSatRef,
  gradeVignette:   _gradeVignetteRef,
  gradeBrightness: _gradeBrightnessRef,
  grainScale:      _grainScaleRef,
  haloStrength:    _haloStrengthRef,
  haloColor:       _haloColorRef,
}

/**
 * Drive all post-FX channels each frame. Called once by PostProcessing (the one
 * consumer). Identical for production and Stage — Stage just passes the resolved
 * channels from its live store overrides; production passes the scene.json-baked
 * channels. Zero behavior fork by construction.
 *
 * @param resolved  the already-resolved channels + drive targets:
 *   { bloomChannel, aoChannel, exposureChannel, warmthChannel, fillChannel,
 *     haloChannel, gradeChannel, grainChannel, dofChannel, dofOn, viewMode,
 *     aoRef, bloomRef, archValues, heroSubject }
 */
export function usePostFxDriver({
  bloomChannel, aoChannel, exposureChannel, warmthChannel, fillChannel,
  haloChannel, gradeChannel, grainChannel, dofChannel, dofOn,
  viewMode, aoRef, bloomRef, archValues, heroSubject,
}) {
  const { gl, camera } = useThree()

  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMins = getTodSlotMinutes(tod.currentTime)

    // Exposure / Warmth / Fill → module refs consumed by FilmGrade.update().
    _exposureRef.current = resolveGroupAtMinute(exposureChannel, minute, slotMins, ['value'], EXPOSURE_FLAT_DEFAULTS).value
    _warmthRef.current   = resolveGroupAtMinute(warmthChannel,   minute, slotMins, ['value'], WARMTH_FLAT_DEFAULTS).value
    const fillVal        = resolveGroupAtMinute(fillChannel,     minute, slotMins, ['value'], FILL_FLAT_DEFAULTS).value
    _fillToeRef.current  = fillVal <= 1 ? fillVal * 0.28 : 0.28 + (fillVal - 1) * 0.72

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

    // DoF / Focus — the ONE shared per-frame driver (./dofDriver.js), also
    // called by Preview's PreviewPostFx so the hero-pocket VIEW-Z anchor + the
    // browse look-down gate cannot drift between production and the publish gate.
    // Prefer the LIVE (store) arch + hero subject in Stage; fall back to the
    // baked scene.json in production (resolved by the caller). Cheap; only
    // meaningful when dofOn.
    if (dofOn) {
      applyDofFrame({ camera, dofChannel, minute, slotMins, archValues, heroSubject })
    }
  })
}
