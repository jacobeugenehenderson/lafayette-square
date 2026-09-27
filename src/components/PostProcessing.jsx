/**
 * PostProcessing — shared consumer for the operator's authored post-FX
 * chain (bloom, AO, exposure, warmth, fill, mist, halo) plus the
 * existing TOD/sun-altitude physics modifiers and the grade/grain
 * stage-only sliders.
 *
 * Doctrine: ONE consumer, made structural. Production (Scene.jsx), Stage
 * (CartographApp.jsx), and Preview (PreviewApp.jsx, with an `inspect` prop for
 * the per-pass toggle matrix) all mount THIS file — no forked Preview composer.
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

import { useRef, useEffect, useState, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { SoftShadows } from '@react-three/drei'
import { onSceneStencil, getSceneStencil } from './sceneStencilState'
import { penumbraBudgetTexels, penumbraMetresPerTexel } from '../lib/townRange.js'
import { CSM_ENABLED } from './CascadedShadows.jsx'
import * as THREE from 'three'

import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import { weatherExposureScale } from '../lib/sky-scalars.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { resolveGroupAtMinute, getTodSlotMinutes, resolveLampGlowAtMinute } from '../cartograph/animatedParam.js'
import { lampGlow as _lampGlowUniforms } from '../preview/lampGlowState'
import {
  EXPOSURE_FLAT_DEFAULTS, migrateFill,
  MIST_FIELD_KEYS, MIST_FLAT_DEFAULTS, mistFogDensity,
  SHADOW_FIELD_KEYS, SHADOW_FLAT_DEFAULTS,
  DOF_FLAT_DEFAULTS, migrateDof, kitDayChannel } from '../cartograph/skyLightChannels.js'

// The pipeline is DECLARED once (POSTFX_PIPELINE) and installed by RenderPipeline
// (renderPipeline.jsx). PostProcessing is now just the mode wrapper: it resolves
// the authored channels, drives them per-frame via usePostFxDriver, and mounts
// the one installer. Production (Scene.jsx), Stage (CartographApp.jsx), AND
// Preview (PreviewApp.jsx via `inspect`) mount THIS file — the "ONE consumer"
// doctrine made structural (PreviewPostFx's forked composer + driver retired
// 2026-06-30). ExposureTicker still writes _exposureRef.
import { usePostFxDriver, _exposureRef } from './usePostFxDriver.js'
import { RenderPipeline } from './renderPipeline.jsx'
import { resolveLookId } from '../lib/resolveLookId.js'

// Look id resolution — same shape as CelestialBodies / BakedGround.

// The kit's day for first paint (~100ms before scene.json resolves) — the same channels bake-scene.js seeds for
// an unauthored Look, so the two read identically.
const BLOOM_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('bloom'))
const AO_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('ao'))
const EXPOSURE_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('exposure'))
const WARMTH_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('warmth'))
const FILL_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('fill'))
const MIST_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('mist'))
const HALO_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('halo'))
const GRADE_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('grade'))
const GRAIN_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('grain'))
const SHADOW_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('shadow'))
const DOF_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('dof'))

// The FilmGrade / FilmGrain / AerialPerspective passes live in renderPipeline.jsx
// (the manifest references them); they read the driving refs owned by
// usePostFxDriver.js.

// ── ExposureTicker — Canvas-level gl.toneMappingExposure ────────────────────
// Independent of PostProcessing/FilmGrade so a Canvas mount that DOESN'T run the
// full PostProcessing chain still picks up the authored exposure. SC.3
// (2026-05-13). Preview mounts both this and PostProcessing (inspect); both
// resolve the same exposure channel → same value, harmless double-write.

export function ExposureTicker({ lookId, bakeLastMs, exposureOverride }) {
  const { gl } = useThree()
  const scene = useSceneJson(resolveLookId(lookId), bakeLastMs)
  const channel = exposureOverride ?? scene?.exposure ?? EXPOSURE_DEFAULT_CHANNEL
  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const slotMins = getTodSlotMinutes(tod.currentTime)
    const v = resolveGroupAtMinute(channel, tod.getMinuteOfDay(), slotMins, ['value'], EXPOSURE_FLAT_DEFAULTS).value
      * weatherExposureScale(useSkyState.getState().storminess)
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
  fillOverride, haloOverride, gradeOverride, grainOverride, dofOverride,
  inspect,   // Preview only: { toggles } — per-pass visibility matrix (see RenderPipeline).
}) {
  const bloomRef = useRef()
  const aoRef = useRef()
  const scene = useSceneJson(resolveLookId(lookId), bakeLastMs)

  const bloomChannel    = bloomOverride    ?? scene?.bloom    ?? BLOOM_DEFAULT_CHANNEL
  const aoChannel       = aoOverride       ?? scene?.ao       ?? AO_DEFAULT_CHANNEL
  const exposureChannel = exposureOverride ?? scene?.exposure ?? EXPOSURE_DEFAULT_CHANNEL
  const warmthChannel   = warmthOverride   ?? scene?.warmth   ?? WARMTH_DEFAULT_CHANNEL
  // migrateFill: an older scene.json carries Shadow lift's `value`, not `crush`.
  const fillChannel     = useMemo(() => migrateFill(fillOverride ?? scene?.fill ?? FILL_DEFAULT_CHANNEL), [fillOverride, scene?.fill])
  const haloChannel     = haloOverride     ?? scene?.halo     ?? HALO_DEFAULT_CHANNEL
  const gradeChannel    = gradeOverride    ?? scene?.grade    ?? GRADE_DEFAULT_CHANNEL
  const grainChannel    = grainOverride    ?? scene?.grain    ?? GRAIN_DEFAULT_CHANNEL
  // SMAA has no switch: antialiasing always runs (Jacob, 2026-09-26). The mobile tier decides per device
  // what else runs; on mobile SMAA is the ONLY AA (Canvas MSAA is off there).
  // DoF / Focus — desktop-only convolution pass. Blur 0 is off, so the pass mounts when any key's (or the flat)
  // Blur is above 0. migrateDof folds a legacy `enabled` (older design.json / scene.json) the way it rendered.
  const dofChannel = useMemo(() => migrateDof(dofOverride ?? scene?.dof ?? DOF_DEFAULT_CHANNEL), [dofOverride, scene?.dof])
  const dofOn = dofChannel?.animated === 'tod'
    ? Object.values(dofChannel.values || {}).some(s => (s?.blur ?? 0) > 0)
    : (dofChannel?.values?.blur ?? DOF_FLAT_DEFAULTS.blur) > 0

  // DoF drives (applyDofFrame) exactly when the DoF pass is MOUNTED: in
  // production/Stage that's the channel gate (dofOn); in Preview it's the
  // inspect toggle (the operator forces DoF on to tune it, independent of the
  // Look's authored enable). Drive-when-mounted keeps _dofRefs from going stale.
  const dofMounted = inspect ? (inspect.toggles?.dof ?? false) : dofOn

  // The per-frame post-FX driving — one hook for all three surfaces. It resolves
  // every channel above → the module refs (owned there) → uniforms, drives the
  // N8AO/CustomBloom pass configs + gl.toneMappingExposure, and calls the shared
  // DoF driver. Stage passes live-store overrides; production + Preview pass
  // scene.json-baked channels (Preview = no overrides) — no behavior fork.
  usePostFxDriver({
    bloomChannel, aoChannel, exposureChannel, warmthChannel, fillChannel,
    haloChannel, gradeChannel, grainChannel, dofChannel, dofOn: dofMounted,
    viewMode, aoRef, bloomRef,
  })

  // Mount the ONE installer from the manifest. Ordering, per-platform inclusion
  // (mobile drops AO/pyramid/DoF/bloom/aerial), the DoF mount gate, the
  // composer remount key, and Preview's per-pass toggle matrix (`inspect`) all
  // live in renderPipeline.jsx — production and Stage install with no `inspect`,
  // byte-identical to the old hand-wired chain.
  return (
    <RenderPipeline
      inspect={inspect}
      refs={{ ao: aoRef, bloom: bloomRef }}
      viewMode={viewMode}
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

let _penumbraWarned = false
export function StageShadows({ lookId, bakeLastMs, shadowOverride }) {
  const sceneJson = useSceneJson(resolveLookId(lookId), bakeLastMs)
  const channel = shadowOverride ?? sceneJson?.shadow ?? SHADOW_DEFAULT_CHANNEL
  const tod = useTimeOfDay()
  const slotMins = getTodSlotMinutes(tod.currentTime)
  const minute = tod.getMinuteOfDay()
  const resolved = resolveGroupAtMinute(channel, minute, slotMins, SHADOW_FIELD_KEYS, SHADOW_FLAT_DEFAULTS)

  // ⭐⭐ `resolved.size` IS METRES OF PENUMBRA. drei's PCSS wants TEXELS:
  // `offset = texelSize * 2 * PENUMBRA_FILTER_SIZE` (softShadows.js), where
  // texelSize = 1/shadowMapWidth. So a fixed `size` is a fixed number of
  // TEXELS, and a texel's real-world width depends on the shadow frustum —
  // which is now derived per town. Without this conversion huron's authored
  // softness became an 83 m smear (46 texels × 1.81 m) across a town whose
  // buildings are ~20 m wide: shadows with no edges at all.
  // ⛔ NO FALLBACK: unknown scene size = we cannot convert, so PCSS is not
  // mounted and three's standard PCF-soft filter stands. Correct, just not
  // contact-hardening — and it says so, rather than inventing a radius.
  const [stencil, setStencil] = useState(null)
  useEffect(() => onSceneStencil(setStencil), [])
  // ⛔⛔ THE DENOMINATOR WAS THE TOWN-WIDE TEXEL, WHICH THE RENDERER STOPPED USING.
  // `shadowMetresPerTexel(stencil)` is `2·townHalf/4096` — 1.806 m on huron. But the sun's
  // frustum has been CAMERA-FITTED since 3dcb5dd3, and since 2026-09-22 it is additionally
  // capped by `__maxMPerTexel`, so the real texel is at most the cap and usually far less.
  // Converting the authored penumbra against 1.806 asked for 10.11/1.806 ≈ 5.6 texels of
  // blur; at a real texel of a few centimetres that is a few centimetres of softening —
  // i.e. a HARD edge, which is why the texel grid stayed visible as fine jags on every
  // cast-shadow edge even after the box was capped.
  // ⭐ The cap is the right denominator: it is the COARSEST the texel may be, it is
  // authored rather than derived from one town's size, and — unlike the live fitted texel —
  // it does not change per frame. ⚠️ THAT LAST PART IS LOAD-BEARING: drei's `SoftShadows`
  // bakes `size`/`samples` into `#define`s via THREE.ShaderChunk and calls `reset()` on
  // change, which disposes EVERY material in the scene and recompiles it. Feeding it a
  // per-frame texel would be far worse than the bug it fixes.
  // ⛔ Falls back to the town-wide texel only when no cap is authored, which is the
  // uncapped fit — the one case where the town-wide value IS the real texel.
  // ⛔⛔ PCSS AND CASCADES CANNOT BOTH OWN THE SHADOW CHUNK. drei's <SoftShadows>
  // GLOBALLY overwrites `THREE.ShaderChunk.shadowmap_pars_fragment` to install its Vogel-disk
  // sampler; three's CSM injects its own cascade selection into that same chunk. Whichever
  // lands second wins and the other's sampling is silently gone — which reads as NO SHADOWS
  // AT ALL, not as a subtle difference. Under `?csm=1` the cascade rig owns shadow sampling
  // and this component stands down; the authored penumbra then rides CSM's own filtering.
  // ⚠️ OWED: cascades currently give up contact-hardening. Restoring it means a PCSS
  // sampler written INTO the cascade path, not two libraries fighting over one chunk.
  if (CSM_ENABLED) return null
  const mPerTexel = penumbraMetresPerTexel(stencil)
  if (mPerTexel == null) return null

  // ⛔⛔ THE FILTER RADIUS AND THE SAMPLE COUNT ARE ONE DECISION, NOT TWO.
  // drei's PCSS takes `samples` points off a Vogel disk of `2 × size` texels,
  // rotated per fragment (softShadows.js:116). Spread a fixed sample budget
  // over a huge radius and the penumbra stops being soft and becomes NOISE.
  // Once the shadow frustum follows the camera, a texel can be 0.03 m — so a
  // world-constant 10 m penumbra is a 345-TEXEL radius sampled 11 times.
  // ⭐ Cap the radius at what the sample budget can actually carry. The
  // authored metres govern whenever they are achievable; this only bites when
  // they are not, and it says so rather than quietly rendering mush.
  // ⛔ drei writes BOTH into GLSL #defines and recompiles every material when either changes. Tweened between
  // keys, Samples went fractional (`i < 12.5` doesn't compile) and both changed every frame of a transition.
  // Whole samples, and the radius on a half-texel grid, so a tween recompiles in steps, not per frame.
  const samples = Math.round(resolved.samples)
  const wanted = resolved.size / mPerTexel
  const budget = penumbraBudgetTexels(samples)   // the Penumbra slider's max reads the same budget
  const sizeTexels = Math.max(0.5, Math.round(Math.min(wanted, budget) * 2) / 2)
  if (wanted > budget * 1.05 && !_penumbraWarned) {
    _penumbraWarned = true
    console.warn(`[StageShadows] penumbra ${resolved.size} m = ${wanted.toFixed(0)} texels at ` +
      `${mPerTexel.toFixed(3)} m/texel, but ${samples} samples only carry ~${budget.toFixed(0)}. ` +
      `Clamped. Lower the Penumbra (m) knob or raise Samples. ` +
      `⭐ The sun's real penumbra is ~0.0093 × blocker distance — a 10 m wall throws ~0.09 m, ` +
      `so a large value here is compensating for a coarse map that no longer exists.`)
  }

  return <SoftShadows size={sizeTexels} samples={samples} focus={0.35} />
}

// ── Atmospheric fog (blends ground into sky at horizon) ─────────────────────
// scene.mist (or `mistOverride` from Stage) drives FogExp2 density + color.

// `enabled` (default true) lets a consumer toggle fog non-destructively
// without unmounting — fog is a scene property, not a drawn layer, so the
// Preview "Atmospheric Fog" toggle nulls scene.fog rather than churning the
// mount. Production + Stage pass no `enabled` → unchanged.
let _mistWarned = false
export function StageFog({ lookId, bakeLastMs, mistOverride, enabled = true }) {
  const { scene: threeScene } = useThree()
  const fogRef = useRef()
  const sceneJson = useSceneJson(resolveLookId(lookId), bakeLastMs)
  const mistChannel = mistOverride ?? sceneJson?.mist ?? MIST_DEFAULT_CHANNEL

  useEffect(() => {
    if (!enabled) { threeScene.fog = null; fogRef.current = null; return }
    threeScene.fog = new THREE.FogExp2(MIST_FLAT_DEFAULTS.color, 0)
    fogRef.current = threeScene.fog
    return () => { threeScene.fog = null; fogRef.current = null }
  }, [threeScene, enabled])

  useFrame(() => {
    if (!fogRef.current) return
    const tod = useTimeOfDay.getState()
    const slotMins = getTodSlotMinutes(tod.currentTime)
    const m = resolveGroupAtMinute(mistChannel, tod.getMinuteOfDay(), slotMins, MIST_FIELD_KEYS, MIST_FLAT_DEFAULTS)
    const density = mistFogDensity(m.amount, getSceneStencil()?.radius)
    if (density == null) {   // ⛔ no town size ⇒ no fog, loudly — never a density guessed for some other town
      if (!_mistWarned) { _mistWarned = true; console.error('[StageFog] the scene disc has no radius — Mist cannot be sized to the town, so fog is OFF') }
      fogRef.current.density = 0
    } else fogRef.current.density = density
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
const LAMPGLOW_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('lampGlow'))

export function LampGlowDriver({ lookId, bakeLastMs, lampGlowOverride }) {
  const sceneJson = useSceneJson(resolveLookId(lookId), bakeLastMs)
  const channel = lampGlowOverride ?? sceneJson?.lampGlow ?? LAMPGLOW_DEFAULT_CHANNEL
  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const minute = tod.getMinuteOfDay()
    const slotMinutes = channel.animated ? getTodSlotMinutes(tod.currentTime) : null
    const triple = resolveLampGlowAtMinute(channel, minute, slotMinutes)
    // Shares of the lamp's output; StreetLights multiplies them by it (0 by day, follows Brightness).
    _lampGlowUniforms.share.trees = triple.trees
    _lampGlowUniforms.share.pool  = triple.pool
    _lampGlowUniforms.share.radius = triple.radius
    _lampGlowUniforms.share.centre = triple.centre
  })
  return null
}
