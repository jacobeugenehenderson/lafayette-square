/**
 * Per-effect post-FX stack for Preview. Mirrors Stage's chain but
 * each effect is individually toggleable so we can pinpoint which one
 * (if any) breaks rendering on the Preview scene.
 *
 * Effects sourced directly from Stage so behavior matches.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { EffectComposer, Bloom, N8AO } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import {
  AerialPerspective, FilmGrade, FilmGrain, envState,
} from '../stage/StageApp.jsx'
import useTimeOfDay from '../hooks/useTimeOfDay'
import useCartographStore from '../cartograph/stores/useCartographStore.js'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import {
  BLOOM_FIELD_KEYS, BLOOM_FLAT_DEFAULTS,
  AO_FIELD_KEYS, AO_FLAT_DEFAULTS,
} from '../cartograph/skyLightChannels.js'

// Mirrors Stage's per-frame ref tweaks for AO + Bloom. Bloom now resolves
// from the cartograph store's TOD `bloom` channel (Sky & Light card);
// sun-altitude `dk` adaptive bump still rides on top.
function FxDriver({ aoRef, bloomRef }) {
  useFrame(() => {
    const ao = aoRef.current
    if (ao?.configuration) {
      const tod = useTimeOfDay.getState()
      const slotMins = getTodSlotMinutes(tod.currentTime)
      const aoTriple = resolveGroupAtMinute(
        useCartographStore.getState().ao,
        tod.getMinuteOfDay(), slotMins,
        AO_FIELD_KEYS, AO_FLAT_DEFAULTS,
      )
      ao.configuration.aoRadius = aoTriple.radius
      ao.configuration.intensity = aoTriple.intensity
      ao.configuration.distanceFalloff = aoTriple.distanceFalloff
    }
    const bloom = bloomRef.current
    if (bloom) {
      const tod = useTimeOfDay.getState()
      const alt = tod.getLightingPhase().sunAltitude
      const dk = alt > 0.1 ? 0 : alt < -0.15 ? 1 : 1 - (alt + 0.15) / 0.25
      const bch = useCartographStore.getState().bloom
      const slotMins = getTodSlotMinutes(tod.currentTime)
      const base = resolveGroupAtMinute(
        bch, tod.getMinuteOfDay(), slotMins,
        BLOOM_FIELD_KEYS, BLOOM_FLAT_DEFAULTS,
      )
      // postprocessing v6: `intensity` is a real setter on BloomEffect,
      // but threshold/smoothing must be set on `luminanceMaterial`, not on
      // the effect directly. The latter look like setters but silently
      // do nothing — they're constructor-only options.
      bloom.intensity = base.intensity + dk * 0.5
      const lm = bloom.luminanceMaterial
      if (lm) {
        lm.threshold = base.threshold - dk * 0.5
        lm.smoothing = base.smoothing + dk * 0.4
      }
    }
  })
  return null
}

export default function PreviewPostFx({
  ao = false, bloom = false, aerial = false, grade = false, grain = false,
}) {
  const aoRef = useRef()
  const bloomRef = useRef()

  const anyOn = ao || bloom || aerial || grade || grain
  if (!anyOn) return null

  return (
    <>
      <FxDriver aoRef={aoRef} bloomRef={bloomRef} />
      <EffectComposer>
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
        {grain  && <FilmGrain />}
      </EffectComposer>
    </>
  )
}
