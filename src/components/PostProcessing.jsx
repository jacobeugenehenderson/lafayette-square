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

import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { SoftShadows } from '@react-three/drei'
import * as THREE from 'three'

import useTimeOfDay from '../hooks/useTimeOfDay'
import { useSceneJson } from '../lib/useSceneJson.js'
import { resolveGroupAtMinute, getTodSlotMinutes, resolveLampGlowAtMinute } from '../cartograph/animatedParam.js'
import { lampGlow as _lampGlowUniforms } from '../preview/lampGlowState'
import { INSTANCE } from '../instance.js'
import {
  BLOOM_FLAT_DEFAULTS,
  AO_FLAT_DEFAULTS,
  EXPOSURE_FLAT_DEFAULTS,
  WARMTH_FLAT_DEFAULTS,
  FILL_FLAT_DEFAULTS,
  MIST_FIELD_KEYS, MIST_FLAT_DEFAULTS, MIST_DENSITY_SCALE,
  HALO_FLAT_DEFAULTS,
  GRADE_FLAT_DEFAULTS,
  GRAIN_FLAT_DEFAULTS,
  SMAA_FLAT_DEFAULTS,
  SHADOW_FIELD_KEYS, SHADOW_FLAT_DEFAULTS,
  DOF_FLAT_DEFAULTS,
} from '../cartograph/skyLightChannels.js'

// The pipeline is DECLARED once (POSTFX_PIPELINE) and installed by RenderPipeline
// (renderPipeline.jsx). PostProcessing is now just the mode wrapper: it resolves
// the authored channels, drives them per-frame via usePostFxDriver, and mounts
// the one installer. The film-effect passes live in renderPipeline.jsx (the
// manifest references them) — re-exported here so PreviewPostFx's import path
// stays intact until Phase 3 retires it. ExposureTicker still writes _exposureRef.
import { usePostFxDriver, _exposureRef } from './usePostFxDriver.js'
import { RenderPipeline } from './renderPipeline.jsx'
export { _postFxRefs } from './usePostFxDriver.js'
export { FilmGrade, FilmGrain, AerialPerspective } from './renderPipeline.jsx'

// Look id resolution — same shape as CelestialBodies / BakedGround.
function resolveLookId(propLookId) {
  if (propLookId) return propLookId
  if (typeof window === 'undefined') return INSTANCE.lookId
  const m = window.location.search.match(/look=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : INSTANCE.lookId
}

// Inline flat-default envelopes for first-paint (~100ms before scene.json
// resolves). Mirrors bake-scene.js's emit so unauthored Looks read
// identically.
const BLOOM_DEFAULT_CHANNEL    = Object.freeze({ values: { ...BLOOM_FLAT_DEFAULTS } })
const SMAA_DEFAULT_CHANNEL     = Object.freeze({ values: { ...SMAA_FLAT_DEFAULTS } })
const AO_DEFAULT_CHANNEL       = Object.freeze({ values: { ...AO_FLAT_DEFAULTS } })
const EXPOSURE_DEFAULT_CHANNEL = Object.freeze({ values: { ...EXPOSURE_FLAT_DEFAULTS } })
const WARMTH_DEFAULT_CHANNEL   = Object.freeze({ values: { ...WARMTH_FLAT_DEFAULTS } })
const FILL_DEFAULT_CHANNEL     = Object.freeze({ values: { ...FILL_FLAT_DEFAULTS } })
const MIST_DEFAULT_CHANNEL     = Object.freeze({ values: { ...MIST_FLAT_DEFAULTS } })
const HALO_DEFAULT_CHANNEL     = Object.freeze({ values: { ...HALO_FLAT_DEFAULTS } })
const GRADE_DEFAULT_CHANNEL    = Object.freeze({ values: { ...GRADE_FLAT_DEFAULTS } })
const GRAIN_DEFAULT_CHANNEL    = Object.freeze({ values: { ...GRAIN_FLAT_DEFAULTS } })
const SHADOW_DEFAULT_CHANNEL   = Object.freeze({ values: { ...SHADOW_FLAT_DEFAULTS } })
const DOF_DEFAULT_CHANNEL      = Object.freeze({ values: { ...DOF_FLAT_DEFAULTS } })

// The FilmGrade / FilmGrain / AerialPerspective passes moved to
// renderPipeline.jsx (the manifest references them). Re-exported above for
// PreviewPostFx. They read the driving refs owned by usePostFxDriver.js.

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
  fillOverride, haloOverride, gradeOverride, grainOverride, smaaOverride, dofOverride,
  archOverride, heroSubjectOverride,
}) {
  const bloomRef = useRef()
  const aoRef = useRef()
  const scene = useSceneJson(resolveLookId(lookId), bakeLastMs)

  const bloomChannel    = bloomOverride    ?? scene?.bloom    ?? BLOOM_DEFAULT_CHANNEL
  const aoChannel       = aoOverride       ?? scene?.ao       ?? AO_DEFAULT_CHANNEL
  const exposureChannel = exposureOverride ?? scene?.exposure ?? EXPOSURE_DEFAULT_CHANNEL
  const warmthChannel   = warmthOverride   ?? scene?.warmth   ?? WARMTH_DEFAULT_CHANNEL
  const fillChannel     = fillOverride     ?? scene?.fill     ?? FILL_DEFAULT_CHANNEL
  const haloChannel     = haloOverride     ?? scene?.halo     ?? HALO_DEFAULT_CHANNEL
  const gradeChannel    = gradeOverride    ?? scene?.grade    ?? GRADE_DEFAULT_CHANNEL
  const grainChannel    = grainOverride    ?? scene?.grain    ?? GRAIN_DEFAULT_CHANNEL
  // SMAA on/off — a static per-Look toggle (not TOD-animated): read the flat
  // value at render and mount the pass when on. Default on. Override (Stage) >
  // scene.json (baked) > default.
  const smaaChannel     = smaaOverride     ?? scene?.smaa     ?? SMAA_DEFAULT_CHANNEL
  const smaaOn = (smaaChannel?.values?.value ?? SMAA_FLAT_DEFAULTS.value) > 0.5
  // DoF / Focus — desktop-only convolution pass. Mount when enabled. A
  // TOD-animated dof has its `enabled` nested per slot, so mount if ANY slot
  // enables it (the per-frame dofDriver resolves blur per-minute — sharp slots
  // run a near-noop passthrough). Flat dof keeps the original single-toggle read.
  const dofChannel = dofOverride ?? scene?.dof ?? DOF_DEFAULT_CHANNEL
  const dofOn = dofChannel?.animated === 'tod'
    ? Object.values(dofChannel.values || {}).some(s => (s?.enabled ?? 0) > 0.5)
    : (dofChannel?.values?.enabled ?? DOF_FLAT_DEFAULTS.enabled) > 0.5

  // The per-frame post-FX driving — one hook, identical for production and
  // Stage. It resolves every channel above → the module refs (owned there) →
  // uniforms, drives the N8AO/CustomBloom pass configs + gl.toneMappingExposure,
  // and calls the shared DoF driver. Stage passes live-store overrides;
  // production passes scene.json-baked channels — no behavior fork.
  usePostFxDriver({
    bloomChannel, aoChannel, exposureChannel, warmthChannel, fillChannel,
    haloChannel, gradeChannel, grainChannel, dofChannel, dofOn,
    viewMode, aoRef, bloomRef,
    archValues: archOverride?.values ?? scene?.arch?.values,
    heroSubject: heroSubjectOverride ?? scene?.heroSubject,
  })

  // Mount the ONE installer from the manifest. Ordering, per-platform inclusion
  // (mobile drops AO/pyramid/DoF/bloom/aerial), the DoF/SMAA mount gates, and
  // the composer remount key all live in renderPipeline.jsx — production and
  // Stage install with no `inspect`, byte-identical to the old hand-wired chain.
  return (
    <RenderPipeline
      refs={{ ao: aoRef, bloom: bloomRef }}
      viewMode={viewMode}
      smaaOn={smaaOn}
      dofOn={dofOn}
    />
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

// `enabled` (default true) lets a consumer toggle fog non-destructively
// without unmounting — fog is a scene property, not a drawn layer, so the
// Preview "Atmospheric Fog" toggle nulls scene.fog rather than churning the
// mount. Production + Stage pass no `enabled` → unchanged.
export function StageFog({ lookId, bakeLastMs, mistOverride, enabled = true }) {
  const { scene: threeScene } = useThree()
  const fogRef = useRef()
  const sceneJson = useSceneJson(resolveLookId(lookId), bakeLastMs)
  const mistChannel = mistOverride ?? sceneJson?.mist ?? MIST_DEFAULT_CHANNEL

  useEffect(() => {
    if (!enabled) { threeScene.fog = null; fogRef.current = null; return }
    threeScene.fog = new THREE.FogExp2(MIST_FLAT_DEFAULTS.color, MIST_FLAT_DEFAULTS.density * MIST_DENSITY_SCALE)
    fogRef.current = threeScene.fog
    return () => { threeScene.fog = null; fogRef.current = null }
  }, [threeScene, enabled])

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

// ── Lamp-glow uniform driver (channel-driven) ───────────────────────────────
// Writes the shared `_lampGlow.{grass,trees,pool}` uniforms — consumed by
// grassMaterial (lawn pools), treeAtlasMaterial (canopy under-lamp emissive),
// and StreetLights (pool radial) — from the authored `lampGlow` channel.
// Production + Preview mount this with no override → frozen-at-bake from
// scene.json. Stage drives the same uniforms live via CartographApp's
// LampGlowPump (store-resolved), exactly as NeonPump↔NeonBands does for neon.
// Without a mount, those uniforms sit at module defaults (grass 0, trees 0,
// pool 1.0) and authored lamp pools / tree glow never appear off the slab.
const LAMPGLOW_DEFAULT_CHANNEL = Object.freeze({ values: { grass: 0, trees: 0, pool: 1.0 } })

export function LampGlowDriver({ lookId, bakeLastMs, lampGlowOverride }) {
  const sceneJson = useSceneJson(resolveLookId(lookId), bakeLastMs)
  const channel = lampGlowOverride ?? sceneJson?.lampGlow ?? LAMPGLOW_DEFAULT_CHANNEL
  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMinutes = channel.animated ? getTodSlotMinutes(tod.currentTime) : null
    const triple = resolveLampGlowAtMinute(channel, minute, slotMinutes)
    _lampGlowUniforms.grassUniform.value = triple.grass
    _lampGlowUniforms.treesUniform.value = triple.trees
    // poolUniform is driven by StreetLights (pool follows the lantern's output).
  })
  return null
}
