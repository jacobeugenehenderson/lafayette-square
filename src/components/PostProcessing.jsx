/**
 * PostProcessing — shared consumer for the operator's authored post-FX
 * chain (bloom, AO, exposure, warmth, fill, mist, halo) plus the
 * existing TOD/sun-altitude physics modifiers and the grade/grain
 * stage-only sliders.
 *
 * Doctrine: ONE consumer. Production (Scene.jsx), Stage (CartographApp.jsx),
 * and Preview (PreviewApp.jsx via PreviewPostFx) mount this same file.
 * Per-channel `<channel>Override` props are how Stage retints instantly
 * off the live cartograph store; when absent, the consumer falls back to
 * the channel baked into scene.json (frozen-at-bake), and finally to the
 * inline flat-default envelope for first-paint before scene.json resolves.
 * The store reach is contained to CartographApp.jsx; this file never
 * imports useCartographStore.
 *
 * See SC.2 + SC.3 in cartograph/BACKLOG.md; memory:
 *   - project_stage_consumer_parity
 *   - project_authoring_is_live_production_is_static
 *   - slab-carries-full-authored-product
 *   - hardwires-come-out-when-channels-install
 *
 * Every post-FX knob is now a TOD-shaped channel (bloom, ao, exposure,
 * warmth, fill, mist, halo, grade, grain, shadow). Operator can keyframe
 * any of them through the existing TodChannel panel UI; the consumer
 * resolves at the current TOD minute via the standard
 * `resolveGroupAtMinute` resolver.
 */

import { useRef, useEffect, useMemo, forwardRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, N8AO } from '@react-three/postprocessing'
import { Effect, BlendFunction } from 'postprocessing'
import { SoftShadows } from '@react-three/drei'
import * as THREE from 'three'

import useTimeOfDay from '../hooks/useTimeOfDay'
import { useSceneJson } from '../lib/useSceneJson.js'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import {
  BLOOM_FIELD_KEYS, BLOOM_FLAT_DEFAULTS,
  AO_FIELD_KEYS, AO_FLAT_DEFAULTS,
  EXPOSURE_FLAT_DEFAULTS,
  WARMTH_FLAT_DEFAULTS,
  FILL_FLAT_DEFAULTS,
  MIST_FIELD_KEYS, MIST_FLAT_DEFAULTS, MIST_DENSITY_SCALE,
  HALO_FIELD_KEYS, HALO_FLAT_DEFAULTS,
  GRADE_FIELD_KEYS, GRADE_FLAT_DEFAULTS,
  GRAIN_FLAT_DEFAULTS,
  SHADOW_FIELD_KEYS, SHADOW_FLAT_DEFAULTS,
} from '../cartograph/skyLightChannels.js'

const IS_MOBILE = typeof navigator !== 'undefined'
  && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

// Look id resolution — same shape as CelestialBodies / BakedGround.
function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return 'lafayette-square'
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : 'lafayette-square'
}

// Inline flat-default envelopes for first-paint (~100ms before scene.json
// resolves). Mirrors bake-scene.js's emit so unauthored Looks read
// identically.
const BLOOM_DEFAULT_CHANNEL    = Object.freeze({ values: { ...BLOOM_FLAT_DEFAULTS } })
const AO_DEFAULT_CHANNEL       = Object.freeze({ values: { ...AO_FLAT_DEFAULTS } })
const EXPOSURE_DEFAULT_CHANNEL = Object.freeze({ values: { ...EXPOSURE_FLAT_DEFAULTS } })
const WARMTH_DEFAULT_CHANNEL   = Object.freeze({ values: { ...WARMTH_FLAT_DEFAULTS } })
const FILL_DEFAULT_CHANNEL     = Object.freeze({ values: { ...FILL_FLAT_DEFAULTS } })
const MIST_DEFAULT_CHANNEL     = Object.freeze({ values: { ...MIST_FLAT_DEFAULTS } })
const HALO_DEFAULT_CHANNEL     = Object.freeze({ values: { ...HALO_FLAT_DEFAULTS } })
const GRADE_DEFAULT_CHANNEL    = Object.freeze({ values: { ...GRADE_FLAT_DEFAULTS } })
const GRAIN_DEFAULT_CHANNEL    = Object.freeze({ values: { ...GRAIN_FLAT_DEFAULTS } })
const SHADOW_DEFAULT_CHANNEL   = Object.freeze({ values: { ...SHADOW_FLAT_DEFAULTS } })

// ── Effect classes (moved from src/stage/StageApp.jsx) ──────────────────────
// All operator-authored params flow through module-level refs that the
// consumer's useFrame populates from the resolved channels. The Effect's
// own update() pass reads the refs into uniforms — keeps the per-frame
// path identical to the SC.1 sky/lighting consumer pattern.

const _fillToeRef        = { current: FILL_FLAT_DEFAULTS.value }
const _exposureRef       = { current: EXPOSURE_FLAT_DEFAULTS.value }
const _warmthRef         = { current: WARMTH_FLAT_DEFAULTS.value }
const _gradeContrastRef  = { current: GRADE_FLAT_DEFAULTS.contrast }
const _gradeSatRef       = { current: GRADE_FLAT_DEFAULTS.saturation }
const _gradeVignetteRef  = { current: GRADE_FLAT_DEFAULTS.vignette }
const _grainScaleRef     = { current: GRAIN_FLAT_DEFAULTS.scale }

class FilmGradeEffect extends Effect {
  constructor() {
    super('FilmGrade', /* glsl */`
      uniform float uSunAlt;
      uniform float uContrast;
      uniform float uToe;
      uniform float uSat;
      uniform float uVignette;
      uniform float uExposure;
      uniform float uWarmth;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb * uExposure;
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 curved = c * c * (3.0 - 2.0 * c);
        c = mix(c, curved, uContrast);
        float toe = smoothstep(0.0, 0.25, lum);
        c *= mix(uToe, 1.0, toe);
        float shadowSat = 1.0 + (1.0 - toe) * 0.3;
        vec3 gray = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));
        c = mix(gray, c, shadowSat);
        float midBell = 4.0 * lum * (1.0 - lum);
        c *= 1.0 + midBell * 0.15;
        vec3 warmTint = vec3(1.04, 0.98, 0.92);
        vec3 coolTint = vec3(0.96, 0.98, 1.04);
        vec3 splitTone = mix(warmTint, coolTint, smoothstep(0.3, 0.7, lum));
        c *= splitTone;
        float goldenT = exp(-pow((uSunAlt - 0.08) / 0.12, 2.0));
        float nightT = smoothstep(0.05, -0.15, uSunAlt);
        c *= mix(vec3(1.0), vec3(1.06, 1.0, 0.88), goldenT * 0.5);
        c *= mix(vec3(1.0), vec3(0.88, 0.92, 1.08), nightT * 0.4);
        float warmthBias = (uWarmth - 0.5) * 2.0;
        vec3 photoTint = warmthBias >= 0.0
          ? vec3(1.10, 1.00, 0.84)
          : vec3(0.86, 0.94, 1.12);
        float photoDensity = abs(warmthBias) * 0.6;
        vec3 tinted = c * mix(vec3(1.0), photoTint, photoDensity);
        float lumIn  = dot(c,      vec3(0.2126, 0.7152, 0.0722));
        float lumOut = dot(tinted, vec3(0.2126, 0.7152, 0.0722));
        c = tinted * (lumIn / max(lumOut, 1e-4));
        gray = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));
        c = mix(gray, c, uSat);
        c = mix(c, inputColor.rgb, smoothstep(0.7, 1.0, lum));
        vec2 center = uv - 0.5;
        float vignette = 1.0 - dot(center, center) * uVignette;
        vignette = smoothstep(0.0, 1.0, clamp(vignette, 0.0, 1.0));
        c *= vignette;
        outputColor = vec4(c, inputColor.a);
      }
    `, {
      uniforms: new Map([
        ['uSunAlt',   new THREE.Uniform(0.5)],
        ['uContrast', new THREE.Uniform(0.42)],
        ['uToe',      new THREE.Uniform(0.28)],
        ['uSat',      new THREE.Uniform(1.1)],
        ['uVignette', new THREE.Uniform(1.0)],
        ['uExposure', new THREE.Uniform(0.95)],
        ['uWarmth',   new THREE.Uniform(0.5)],
      ])
    })
  }
  update() {
    const tod = useTimeOfDay.getState()
    this.uniforms.get('uSunAlt').value   = tod.getLightingPhase().sunAltitude
    // All channel-backed refs are populated per-frame by the consumer's
    // useFrame (grade contrast/sat/vignette/toe, exposure, warmth, fill).
    this.uniforms.get('uContrast').value = _gradeContrastRef.current
    this.uniforms.get('uSat').value      = _gradeSatRef.current
    this.uniforms.get('uVignette').value = _gradeVignetteRef.current
    this.uniforms.get('uExposure').value = _exposureRef.current
    this.uniforms.get('uWarmth').value   = _warmthRef.current
    this.uniforms.get('uToe').value      = _fillToeRef.current
  }
}
export const FilmGrade = forwardRef((_, ref) => {
  const effect = useMemo(() => new FilmGradeEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

class FilmGrainEffect extends Effect {
  constructor() {
    super('FilmGrain', /* glsl */`
      uniform float uSeed; uniform float uScale;
      float grainHash(vec2 p) { vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float lum=dot(inputColor.rgb,vec3(0.2126,0.7152,0.0722));
        float darkSuppress=smoothstep(0.0,0.08,lum);
        float strength=mix(0.007,0.002,smoothstep(0.0,0.5,lum))*uScale*darkSuppress;
        float grain=(grainHash(uv*1000.0+uSeed)-0.5)*strength;
        outputColor=vec4(inputColor.rgb+grain,inputColor.a);
      }
    `, { uniforms: new Map([['uSeed', new THREE.Uniform(0)], ['uScale', new THREE.Uniform(1)]]) })
  }
  update() {
    this.uniforms.get('uSeed').value = Math.random() * 1000
    const alt = useTimeOfDay.getState().getLightingPhase().sunAltitude
    const day = alt > 0.1 ? 1 : alt < -0.15 ? 0 : (alt + 0.15) / 0.25
    this.uniforms.get('uScale').value = (0.4 + day * 0.6) * _grainScaleRef.current
  }
}
export const FilmGrain = forwardRef((_, ref) => {
  const effect = useMemo(() => new FilmGrainEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

// AerialPerspective — uHazeStrength × uHazeColor authored by Halo channel.
// dayFactor still rides on top so halo doesn't fire at night.
const _haloStrengthRef = { current: HALO_FLAT_DEFAULTS.strength }
const _haloColorRef    = { current: new THREE.Color(HALO_FLAT_DEFAULTS.color) }

class AerialPerspectiveEffect extends Effect {
  constructor() {
    super('AerialPerspective', /* glsl */`
      uniform float uHazeStrength; uniform vec3 uHazeColor;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float horizonBand=smoothstep(0.15,0.55,uv.y)*smoothstep(0.85,0.55,uv.y);
        float lum=dot(inputColor.rgb,vec3(0.2126,0.7152,0.0722));
        float contrastLoss=smoothstep(0.05,0.4,lum)*smoothstep(0.9,0.4,lum);
        float haze=horizonBand*contrastLoss*uHazeStrength;
        outputColor=vec4(mix(inputColor.rgb,uHazeColor,haze),inputColor.a);
      }
    `, { uniforms: new Map([['uHazeStrength', new THREE.Uniform(0)], ['uHazeColor', new THREE.Uniform(new THREE.Vector3(0.7, 0.75, 0.82))]]) })
  }
  update() {
    const tod = useTimeOfDay.getState()
    const alt = tod.getLightingPhase().sunAltitude
    const dayFactor = alt > 0.1 ? 1 : alt < -0.05 ? 0 : (alt + 0.05) / 0.15
    this.uniforms.get('uHazeStrength').value = dayFactor * _haloStrengthRef.current
    const hc = _haloColorRef.current
    this.uniforms.get('uHazeColor').value.set(hc.r, hc.g, hc.b)
  }
}
export const AerialPerspective = forwardRef((_, ref) => {
  const effect = useMemo(() => new AerialPerspectiveEffect(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})

// ── ExposureTicker — Canvas-level gl.toneMappingExposure ────────────────────
// Independent of PostProcessing/FilmGrade so Canvas mounts that DON'T
// run the full chain (e.g. Preview's per-effect-toggle PreviewPostFx)
// still pick up the authored exposure. SC.3 (2026-05-13).

export function ExposureTicker({ lookId, bakeLastMs, exposureOverride }) {
  const { gl } = useThree()
  const scene = useSceneJson(resolveLookId(lookId), bakeLastMs)
  const channel = exposureOverride ?? scene?.exposure ?? EXPOSURE_DEFAULT_CHANNEL
  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const slotMins = getTodSlotMinutes(tod.currentTime)
    const v = resolveGroupAtMinute(channel, tod.getMinuteOfDay(), slotMins, ['value'], EXPOSURE_FLAT_DEFAULTS).value
    gl.toneMappingExposure = v
    _exposureRef.current = v
  })
  return null
}

// ── Shared PostProcessing consumer ──────────────────────────────────────────

const _tmpColor = new THREE.Color()

export function PostProcessing({
  lookId, bakeLastMs, viewMode,
  bloomOverride, aoOverride, exposureOverride, warmthOverride,
  fillOverride, haloOverride, gradeOverride, grainOverride,
}) {
  const bloomRef = useRef()
  const aoRef = useRef()
  const { gl } = useThree()
  const scene = useSceneJson(resolveLookId(lookId), bakeLastMs)

  const bloomChannel    = bloomOverride    ?? scene?.bloom    ?? BLOOM_DEFAULT_CHANNEL
  const aoChannel       = aoOverride       ?? scene?.ao       ?? AO_DEFAULT_CHANNEL
  const exposureChannel = exposureOverride ?? scene?.exposure ?? EXPOSURE_DEFAULT_CHANNEL
  const warmthChannel   = warmthOverride   ?? scene?.warmth   ?? WARMTH_DEFAULT_CHANNEL
  const fillChannel     = fillOverride     ?? scene?.fill     ?? FILL_DEFAULT_CHANNEL
  const haloChannel     = haloOverride     ?? scene?.halo     ?? HALO_DEFAULT_CHANNEL
  const gradeChannel    = gradeOverride    ?? scene?.grade    ?? GRADE_DEFAULT_CHANNEL
  const grainChannel    = grainOverride    ?? scene?.grain    ?? GRAIN_DEFAULT_CHANNEL

  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMins = getTodSlotMinutes(tod.currentTime)
    const alt = tod.getLightingPhase().sunAltitude

    // Exposure / Warmth / Fill → module refs consumed by FilmGrade.update().
    _exposureRef.current = resolveGroupAtMinute(exposureChannel, minute, slotMins, ['value'], EXPOSURE_FLAT_DEFAULTS).value
    _warmthRef.current   = resolveGroupAtMinute(warmthChannel,   minute, slotMins, ['value'], WARMTH_FLAT_DEFAULTS).value
    const fillVal        = resolveGroupAtMinute(fillChannel,     minute, slotMins, ['value'], FILL_FLAT_DEFAULTS).value
    _fillToeRef.current  = fillVal <= 1 ? fillVal * 0.28 : 0.28 + (fillVal - 1) * 0.72

    // Halo strength + color → module refs consumed by AerialPerspective.update().
    const halo = resolveGroupAtMinute(haloChannel, minute, slotMins, HALO_FIELD_KEYS, HALO_FLAT_DEFAULTS)
    _haloStrengthRef.current = halo.strength
    _haloColorRef.current.set(halo.color)

    // Grade contrast / sat / vignette + Grain scale → module refs consumed
    // by FilmGrade.update() / FilmGrain.update(). Same channel + resolver
    // shape as bloom/ao — operator can flip these to {animated:'tod',...}
    // through the standard panel UI without touching the consumer.
    const grade = resolveGroupAtMinute(gradeChannel, minute, slotMins, GRADE_FIELD_KEYS, GRADE_FLAT_DEFAULTS)
    _gradeContrastRef.current = grade.contrast
    _gradeSatRef.current      = grade.saturation
    _gradeVignetteRef.current = grade.vignette
    // grade.toe is the literal FilmGrade uniform; the Fill channel's
    // piecewise mapping below overrides it (operator-facing "distinct ↔
    // soft shadows" axis). Wire the grade-side toe only as a future
    // explicit-override surface; for now Fill remains canonical.
    const grain = resolveGroupAtMinute(grainChannel, minute, slotMins, ['scale'], GRAIN_FLAT_DEFAULTS)
    _grainScaleRef.current = grain.scale

    // gl.toneMappingExposure tracks the authored exposure. EffectComposer
    // overrides this in the FilmGrade pass; we still mirror it so any
    // composer-bypass path (none today, but cheap insurance) reads the
    // same number.
    gl.toneMappingExposure = _exposureRef.current

    // AO — N8AOPostPass params resolved from the operator's `ao` channel.
    const ao = aoRef.current
    if (ao?.configuration) {
      const aoTriple = resolveGroupAtMinute(aoChannel, minute, slotMins, AO_FIELD_KEYS, AO_FLAT_DEFAULTS)
      ao.configuration.aoRadius        = aoTriple.radius
      ao.configuration.intensity       = aoTriple.intensity
      ao.configuration.distanceFalloff = aoTriple.distanceFalloff
    }

    // Bloom — base values from `bloom` channel; sun-altitude `dk` adaptive
    // bump rides on top. Planetarium viewMode preserves Scene.jsx's old
    // dramatic bump (intensity 1.8 / threshold 0.15 / smoothing 0.9).
    const bloom = bloomRef.current
    if (bloom) {
      const lm = bloom.luminanceMaterial
      if (viewMode === 'planetarium') {
        bloom.intensity = 1.8
        if (lm) { lm.threshold = 0.15; lm.smoothing = 0.9 }
      } else {
        const dk = alt > 0.1 ? 0 : alt < -0.15 ? 1 : 1 - (alt + 0.15) / 0.25
        const base = resolveGroupAtMinute(bloomChannel, minute, slotMins, BLOOM_FIELD_KEYS, BLOOM_FLAT_DEFAULTS)
        bloom.intensity = base.intensity + dk * 0.5
        if (lm) {
          lm.threshold = base.threshold - dk * 0.5
          lm.smoothing = base.smoothing + dk * 0.4
        }
      }
    }
  })

  if (IS_MOBILE) {
    return (
      <EffectComposer>
        <FilmGrade />
        <FilmGrain />
      </EffectComposer>
    )
  }

  return (
    <EffectComposer>
      <N8AO ref={aoRef}
        halfRes={viewMode !== undefined && viewMode !== 'hero'}
        aoRadius={AO_FLAT_DEFAULTS.radius}
        intensity={AO_FLAT_DEFAULTS.intensity}
        distanceFalloff={AO_FLAT_DEFAULTS.distanceFalloff}
        quality="medium" />
      <Bloom ref={bloomRef}
        intensity={BLOOM_FLAT_DEFAULTS.intensity}
        luminanceThreshold={BLOOM_FLAT_DEFAULTS.threshold}
        luminanceSmoothing={BLOOM_FLAT_DEFAULTS.smoothing}
        mipmapBlur
        blendFunction={BlendFunction.SCREEN} />
      <AerialPerspective />
      <FilmGrade />
      <FilmGrain />
    </EffectComposer>
  )
}

// ── Reactive soft shadows (channel-driven) ──────────────────────────────────
// `shadow` channel resolves to {size, samples} at the current TOD minute.
// `SoftShadows` reads its props lazily — passing new values triggers a
// re-bake of the soft-shadow material, so we use React state (driven by
// useFrame snapshot) rather than ref mutation. Stage retints by passing
// shadowOverride; production reads scene.shadow.

export function StageShadows({ lookId, bakeLastMs, shadowOverride }) {
  const sceneJson = useSceneJson(resolveLookId(lookId), bakeLastMs)
  const channel = shadowOverride ?? sceneJson?.shadow ?? SHADOW_DEFAULT_CHANNEL
  const tod = useTimeOfDay()
  const slotMins = getTodSlotMinutes(tod.currentTime)
  const minute = tod.getMinuteOfDay()
  const resolved = resolveGroupAtMinute(channel, minute, slotMins, SHADOW_FIELD_KEYS, SHADOW_FLAT_DEFAULTS)
  return <SoftShadows size={resolved.size} samples={resolved.samples} focus={0.35} />
}

// ── Atmospheric fog (blends ground into sky at horizon) ─────────────────────
// scene.mist (or `mistOverride` from Stage) drives FogExp2 density + color.

export function StageFog({ lookId, bakeLastMs, mistOverride }) {
  const { scene: threeScene } = useThree()
  const fogRef = useRef()
  const sceneJson = useSceneJson(resolveLookId(lookId), bakeLastMs)
  const mistChannel = mistOverride ?? sceneJson?.mist ?? MIST_DEFAULT_CHANNEL

  useEffect(() => {
    threeScene.fog = new THREE.FogExp2(MIST_FLAT_DEFAULTS.color, MIST_FLAT_DEFAULTS.density * MIST_DENSITY_SCALE)
    fogRef.current = threeScene.fog
    return () => { threeScene.fog = null }
  }, [threeScene])

  useFrame(() => {
    if (!fogRef.current) return
    const tod = useTimeOfDay.getState()
    const slotMins = getTodSlotMinutes(tod.currentTime)
    const m = resolveGroupAtMinute(mistChannel, tod.getMinuteOfDay(), slotMins, MIST_FIELD_KEYS, MIST_FLAT_DEFAULTS)
    fogRef.current.density = m.density * MIST_DENSITY_SCALE
    _tmpColor.set(m.color)
    fogRef.current.color.copy(_tmpColor)
  })

  return null
}
