/**
 * Per-effect post-FX stack for Preview. Mirrors Stage's chain but
 * each effect is individually toggleable so we can pinpoint which one
 * (if any) breaks rendering on the Preview scene.
 *
 * Effects sourced directly from Stage so behavior matches.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { EffectComposer, Bloom, N8AO, SMAA } from '@react-three/postprocessing'
import { BlendFunction, SMAAPreset } from 'postprocessing'
import { AerialPerspective, FilmGrade, FilmGrain, _postFxRefs } from '../components/PostProcessing.jsx'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { useSceneJson } from '../lib/useSceneJson.js'
import { INSTANCE } from '../instance.js'
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

// First-paint default channels — mirror PostProcessing.jsx so an unauthored
// Look (or the ~100ms before scene.json resolves) reads identically.
const _ch = (flat) => ({ values: flat })

function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

// Resolves the SAME authored post-FX channels PostProcessing reads, but from
// the baked scene.json (the slab) — NOT useCartographStore. Preview runs in a
// separate entry point (`/preview.html`) where the cartograph store holds only
// boot defaults, so the old store read silently ignored both the operator's
// authoring AND the bake. Reading scene.json is "Preview = LS literally": the
// chain reflects exactly what's published. Per-effect mounting (the toggles
// below) is Preview's only sanctioned divergence from the shared consumer.
function FxDriver({ aoRef, bloomRef, lookId }) {
  const scene = useSceneJson(resolveLookId(lookId))
  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const slotMins = getTodSlotMinutes(tod.currentTime)
    const minute = tod.getMinuteOfDay()

    // AO — N8AOPostPass params per-frame.
    const ao = aoRef.current
    if (ao?.configuration) {
      const aoTriple = resolveGroupAtMinute(
        scene?.ao ?? _ch(AO_FLAT_DEFAULTS), minute, slotMins, AO_FIELD_KEYS, AO_FLAT_DEFAULTS,
      )
      ao.configuration.aoRadius = aoTriple.radius
      ao.configuration.intensity = aoTriple.intensity
      ao.configuration.distanceFalloff = aoTriple.distanceFalloff
    }

    // Bloom — operator-authored only (via the `bloom` channel). The
    // hardcoded sun-altitude `dk` night boost was removed 2026-06-07 for
    // parity with PostProcessing.jsx: it overrode the authored channel and
    // drove the luminance threshold negative at night, blooming the whole
    // frame (incl. the dark sky). Night darkness lives in Sky Layer Gain;
    // lamp glow (independent geometry) carries night legibility.
    const bloom = bloomRef.current
    if (bloom) {
      const base = resolveGroupAtMinute(
        scene?.bloom ?? _ch(BLOOM_FLAT_DEFAULTS), minute, slotMins, BLOOM_FIELD_KEYS, BLOOM_FLAT_DEFAULTS,
      )
      bloom.intensity = base.intensity
      const lm = bloom.luminanceMaterial
      if (lm) {
        lm.threshold = base.threshold
        lm.smoothing = base.smoothing
      }
    }

    // Grade / Grain / Halo / Exposure / Warmth / Fill → write into the
    // shared module-level ref bag exported by PostProcessing.jsx.
    // FilmGrade.update() / FilmGrain.update() / AerialPerspective.update()
    // read these refs each pass, so Preview's chain picks up authored
    // channel values without mounting the full PostProcessing component.
    _postFxRefs.exposure.current = resolveGroupAtMinute(scene?.exposure ?? _ch(EXPOSURE_FLAT_DEFAULTS), minute, slotMins, ['value'], EXPOSURE_FLAT_DEFAULTS).value
    _postFxRefs.warmth.current   = resolveGroupAtMinute(scene?.warmth   ?? _ch(WARMTH_FLAT_DEFAULTS),   minute, slotMins, ['value'], WARMTH_FLAT_DEFAULTS).value
    const fillVal                = resolveGroupAtMinute(scene?.fill     ?? _ch(FILL_FLAT_DEFAULTS),     minute, slotMins, ['value'], FILL_FLAT_DEFAULTS).value
    _postFxRefs.fillToe.current  = fillVal <= 1 ? fillVal * 0.28 : 0.28 + (fillVal - 1) * 0.72

    const grade = resolveGroupAtMinute(scene?.grade ?? _ch(GRADE_FLAT_DEFAULTS), minute, slotMins, GRADE_FIELD_KEYS, GRADE_FLAT_DEFAULTS)
    _postFxRefs.gradeContrast.current = grade.contrast
    _postFxRefs.gradeSat.current      = grade.saturation
    _postFxRefs.gradeVignette.current = grade.vignette

    const grain = resolveGroupAtMinute(scene?.grain ?? _ch(GRAIN_FLAT_DEFAULTS), minute, slotMins, ['scale'], GRAIN_FLAT_DEFAULTS)
    _postFxRefs.grainScale.current = grain.scale

    const halo = resolveGroupAtMinute(scene?.halo ?? _ch(HALO_FLAT_DEFAULTS), minute, slotMins, HALO_FIELD_KEYS, HALO_FLAT_DEFAULTS)
    _postFxRefs.haloStrength.current = halo.strength
    _postFxRefs.haloColor.current.set(halo.color)
  })
  return null
}

export default function PreviewPostFx({
  lookId, ao = false, bloom = false, aerial = false, grade = false, grain = false, smaa = true,
}) {
  const aoRef = useRef()
  const bloomRef = useRef()

  const anyOn = ao || bloom || aerial || grade || grain
  if (!anyOn) return null

  return (
    <>
      <FxDriver aoRef={aoRef} bloomRef={bloomRef} lookId={lookId} />
      {/* key flips with the conditional-effect set so the composer rebuilds its
          pipeline when any effect is toggled on/off (EffectComposer doesn't
          reconcile added/removed effects on its own — this fixes the Preview
          on/off toggles, SMAA included). */}
      <EffectComposer key={`fx-${ao}-${bloom}-${aerial}-${grade}-${grain}-${smaa}`}>
        {ao && (
          <N8AO ref={aoRef} halfRes={false} aoRadius={15} intensity={2.5}
            distanceFalloff={0.3} quality="medium" />
        )}
        {bloom && (
          <Bloom ref={bloomRef} intensity={0.5} luminanceThreshold={0.85}
            luminanceSmoothing={0.4} mipmapBlur
            blendFunction={BlendFunction.SCREEN} />
        )}
        {aerial && <AerialPerspective />}
        {grade  && <FilmGrade />}
        {/* SMAA — parity with production PostProcessing (AA the final contrast,
            before grain). Preview must match what ships; toggleable here. */}
        {smaa && <SMAA preset={SMAAPreset.ULTRA} />}
        {grain  && <FilmGrain />}
      </EffectComposer>
    </>
  )
}
