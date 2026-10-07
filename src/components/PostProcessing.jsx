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
import { setPcss, clearPcss } from './pcssShadows.js'
import { onSceneStencil, getSceneStencil } from './sceneStencilState'
import { penumbraBudgetTexels, penumbraMetresPerTexel } from '../lib/townRange.js'
import * as THREE from 'three'

import useTimeOfDay from '../hooks/useTimeOfDay'
import useSkyState from '../hooks/useSkyState'
import { WATER_MIST } from './waterMaterial.js'
import { EDGE_RUFFLE } from '../lib/neighborhoodFade.js'
import { weatherExposureScale } from '../lib/sky-scalars.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { resolveGroupAtMinute, getTodSlotMinutes, resolveLampGlowAtMinute } from '../cartograph/animatedParam.js'
import { lampGlow as _lampGlowUniforms } from '../preview/lampGlowState'
import {
  EXPOSURE_FLAT_DEFAULTS, migrateFill,
  MIST_FIELD_KEYS, MIST_FLAT_DEFAULTS, mistFogDensity,
  EDGE_RUFFLE_FIELD_KEYS, EDGE_RUFFLE_FLAT_DEFAULTS,
  SHADOW_FIELD_KEYS, SHADOW_FLAT_DEFAULTS,
  DOF_FLAT_DEFAULTS, migrateDof, kitDayChannel } from '../cartograph/skyLightChannels.js'

// The pipeline is DECLARED once (POSTFX_PIPELINE) and installed by RenderPipeline
// (renderPipeline.jsx). PostProcessing is now just the mode wrapper: it resolves
// the authored channels, drives them per-frame via usePostFxDriver, and mounts
// the one installer. Production (Scene.jsx), Stage (CartographApp.jsx), AND
// Preview (PreviewApp.jsx via `inspect`) mount THIS file — the "ONE consumer"
// doctrine made structural (PreviewPostFx's forked composer + driver retired
// 2026-06-30). ExposureTicker still writes _exposureRef.
import { usePostFxDriver, _exposureRef, townExposure } from './usePostFxDriver.js'
import { RenderPipeline } from './renderPipeline.jsx'
import { lookOf } from '../lib/lookOf.js'

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

export function ExposureTicker({ lookId, bakeLastMs, exposureOverride, revealOverride }) {
  const { gl } = useThree()
  const scene = useSceneJson(lookOf(lookId, 'PostProcessing'), bakeLastMs)
  const channel = exposureOverride ?? scene?.exposure ?? EXPOSURE_DEFAULT_CHANNEL
  const reveal = revealOverride ?? scene?.reveal ?? null
  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const v = townExposure(channel, reveal, tod.getMinuteOfDay(), getTodSlotMinutes(tod.currentTime))
    gl.toneMappingExposure = v
    _exposureRef.current = v
  })
  return null
}

// ── Shared PostProcessing consumer ──────────────────────────────────────────

const _tmpColor = new THREE.Color()
const _tmpHorizon = new THREE.Color()

export function PostProcessing({
  lookId, bakeLastMs, viewMode,
  bloomOverride, aoOverride, exposureOverride, warmthOverride, revealOverride,
  fillOverride, haloOverride, gradeOverride, grainOverride, dofOverride, heroSubjectOverride,
  inspect,   // Preview only: { toggles } — per-pass visibility matrix (see RenderPipeline).
}) {
  const bloomRef = useRef()
  const aoRef = useRef()
  const scene = useSceneJson(lookOf(lookId, 'PostProcessing'), bakeLastMs)

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

  // DoF drives (applyDofFrame) exactly when the DoF pass is MOUNTED: the channel gate (dofOn), which Preview's
  // inspect toggle can only switch OFF — never force on (renderPipeline.jsx#mountedPasses). Tuning DoF is Stage's.
  // Drive-when-mounted keeps _dofRefs from going stale.
  const dofMounted = dofOn && (inspect?.toggles?.dof ?? true) !== false

  // The per-frame post-FX driving — one hook for all three surfaces. It resolves
  // every channel above → the module refs (owned there) → uniforms, drives the
  // N8AO/CustomBloom pass configs + gl.toneMappingExposure, and calls the shared
  // DoF driver. Stage passes live-store overrides; production + Preview pass
  // scene.json-baked channels (Preview = no overrides) — no behavior fork.
  usePostFxDriver({
    bloomChannel, aoChannel, exposureChannel, warmthChannel, fillChannel,
    haloChannel, gradeChannel, grainChannel, dofChannel, revealChannel: revealOverride ?? scene?.reveal ?? null, dofOn: dofMounted,
    // The town's hero: what a keyframe's 'hero' focus names (src/lib/focusObject.js). Stage's live pick overrides the bake.
    // undefined until the scene has loaded: "not yet", never "no hero".
    heroSubject: heroSubjectOverride !== undefined ? heroSubjectOverride : scene ? (scene.heroSubject ?? null) : undefined,
    viewMode, aoRef, bloomRef,
  })

  // Mount the ONE installer from the manifest. Ordering, per-platform inclusion
  // (mobile drops ao/pyramid/heroLadder/bloom/dof/aerial), the DoF mount gate, the
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
// `shadow` channel resolves to {size, samples} at the current TOD minute and is stamped on the shadow-casting lights
// (pcssShadows.js#setPcss): a new value costs nothing, no material is disposed and no program relinks. Stage retints
// by passing shadowOverride; production reads scene.shadow.
// ⭐ PER SHOT (Jacob, 2026-10-07): `pcss={false}` draws three's plain PCF instead — the Hero shot, where the depth of
// field blurs the shadowed town and PCSS's contact-hardening is invisible (PCSS 16 vs PCF: ~7 ms huron, ~12 ms
// provincetown per frame at 2268×1270, scratch/shadow-plan/probe.mjs). Street keeps PCSS: close and sharp, it shows.
// The switch is the light's radius — the stamp off, radius back to the light's own — a uniform: nothing relinks.

let _penumbraWarned = false
export function StageShadows({ lookId, bakeLastMs, shadowOverride, pcss = true }) {
  const sceneJson = useSceneJson(lookOf(lookId, 'PostProcessing'), bakeLastMs)
  const channel = shadowOverride ?? sceneJson?.shadow ?? SHADOW_DEFAULT_CHANNEL
  const tod = useTimeOfDay()
  const slotMins = getTodSlotMinutes(tod.currentTime)
  const minute = tod.getMinuteOfDay()
  const resolved = resolveGroupAtMinute(channel, minute, slotMins, SHADOW_FIELD_KEYS, SHADOW_FLAT_DEFAULTS)

  // ⭐⭐ `resolved.size` IS METRES OF PENUMBRA. PCSS wants TEXELS:
  // `offset = texelSize * 2 * size` (pcssShadows.js#findBlocker), where
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
  // it does not change per frame.
  // ⛔ Falls back to the town-wide texel only when no cap is authored, which is the
  // uncapped fit — the one case where the town-wide value IS the real texel.
  if (!pcss) return null   // plain PCF in this shot (above): no stamp, the light's own radius
  const mPerTexel = penumbraMetresPerTexel(stencil)
  if (mPerTexel == null) return null

  // ⛔⛔ THE FILTER RADIUS AND THE SAMPLE COUNT ARE ONE DECISION, NOT TWO.
  // PCSS takes `samples` points off a Vogel disk of `2 × size` texels,
  // rotated per fragment (pcssShadows.js#findBlocker). Spread a fixed sample budget
  // over a huge radius and the penumbra stops being soft and becomes NOISE.
  // Once the shadow frustum follows the camera, a texel can be 0.03 m — so a
  // world-constant 10 m penumbra is a 345-TEXEL radius sampled 11 times.
  // ⭐ Cap the radius at what the sample budget can actually carry. The
  // authored metres govern whenever they are achievable; this only bites when
  // they are not, and it says so rather than quietly rendering mush.
  // Whole samples (the shader loops over a count), and the radius on a half-texel grid as it always was, so the
  // shadows render exactly as they did.
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

  return <PcssStamp sizeTexels={sizeTexels} samples={samples} />
}

function PcssStamp({ sizeTexels, samples }) {
  useEffect(() => {
    const token = setPcss(sizeTexels, samples)
    return () => clearPcss(token)
  }, [sizeTexels, samples])
  return null
}

// ── Atmospheric fog (blends ground into sky at horizon) ─────────────────────
// scene.mist (or `mistOverride` from Stage) drives FogExp2 density + color.

// `enabled` (default true) lets a consumer toggle fog non-destructively
// without unmounting — fog is a scene property, not a drawn layer, so off is
// density 0 (below), never a removed scene.fog. Production + Stage pass no
// `enabled` → unchanged.
let _mistWarned = false
export function StageFog({ lookId, bakeLastMs, mistOverride, enabled = true }) {
  const { scene: threeScene } = useThree()
  const fogRef = useRef()
  const sceneJson = useSceneJson(lookOf(lookId, 'PostProcessing'), bakeLastMs)
  const mistChannel = mistOverride ?? sceneJson?.mist ?? MIST_DEFAULT_CHANNEL

  // ⛔ THE FOG IS NEVER REMOVED, ONLY ZEROED. Fog is part of every material's program key (USE_FOG), so taking
  // `scene.fog` away — as entering Browse did (Town: off in plan) — relinked the whole town on the first Browse flight:
  // ground, buildings, lamps, the revetment, every tree card (measured on huron, the 761 + 652 ms freeze, 2026-10-07).
  // Off is density 0, a uniform: the same picture (exp(-0) leaves every fragment unfogged) and nothing recompiles.
  useEffect(() => {
    threeScene.fog = new THREE.FogExp2(MIST_FLAT_DEFAULTS.color, 0)
    fogRef.current = threeScene.fog
    return () => { threeScene.fog = null; fogRef.current = null }
  }, [threeScene])
  // ⛔ No town size ⇒ no fog, loudly — said on the EVENT that no disc is coming (sceneStencilState's `missing`), never
  // on the frames before the ground publishes one: a per-frame null check said "fog is OFF" on every load (2026-10-07).
  useEffect(() => onSceneStencil((st, missing) => {
    if (!st && missing && !_mistWarned) { _mistWarned = true; console.error(`[StageFog] the scene has no disc (${missing}) — Mist cannot be sized to the town, so fog is OFF`) }
  }), [])

  useFrame(() => {
    if (!fogRef.current) return
    if (!enabled) { fogRef.current.density = 0; return }
    const tod = useTimeOfDay.getState()
    const slotMins = getTodSlotMinutes(tod.currentTime)
    const m = resolveGroupAtMinute(mistChannel, tod.getMinuteOfDay(), slotMins, MIST_FIELD_KEYS, MIST_FLAT_DEFAULTS)
    const density = mistFogDensity(m.amount, getSceneStencil()?.radius)
    fogRef.current.density = density ?? 0   // no disc (yet) ⇒ no fog — never a density guessed for some other town
    // ⭐ THE HAZE MEETS THE SKY: far fog takes the dome's live horizon colour, and the authored Mist colour TINTS it
    // (a quarter). A fixed colour per slot met the sky only where the two happened to agree — a flat slab with a
    // hard line where it met the dome (Jacob's Dawn pass, 2026-09-27). The bands are sRGB display values
    // (skyGrid.js), so they are decoded on the way in.
    const h = useSkyState.getState().skyBands.horizon
    _tmpHorizon.setRGB(h.r, h.g, h.b, THREE.SRGBColorSpace)
    _tmpColor.set(m.color).lerp(_tmpHorizon, 0.75)
    fogRef.current.color.copy(_tmpColor)
    WATER_MIST.value = Math.min(1, Math.max(0, m.water ?? MIST_FLAT_DEFAULTS.water))
  })

  return null
}

// ── The town edge's ruffle (channel-driven) ─────────────────────────────────
// Sets the ONE shared ruffle uniform every faded material binds (src/lib/neighborhoodFade.js#EDGE_RUFFLE) from the
// Look's `edgeRuffle` channel at the current time of day — scene.json in production, Stage's live channel as an
// override. One town per page: one driver per <Town>. No channel ⇒ the flat default, 0, a straight edge.
/** Set the shared ruffle from a channel at the current time of day — the one resolution, used by <Town>'s driver
 *  and by the Designer's map layers (which draw no <Town>). No channel ⇒ 0, a straight edge. */
export function driveEdgeRuffle(channel) {
  if (!channel) { EDGE_RUFFLE.value = EDGE_RUFFLE_FLAT_DEFAULTS.ruffle; return }
  const tod = useTimeOfDay.getState()
  const m = resolveGroupAtMinute(channel, tod.getMinuteOfDay(), getTodSlotMinutes(tod.currentTime), EDGE_RUFFLE_FIELD_KEYS, EDGE_RUFFLE_FLAT_DEFAULTS)
  EDGE_RUFFLE.value = Math.min(1, Math.max(0, Number(m.ruffle) || 0))
}
export function EdgeRuffleDriver({ lookId, bakeLastMs, ruffleOverride }) {
  const sceneJson = useSceneJson(lookOf(lookId, 'EdgeRuffleDriver'), bakeLastMs)
  const channel = ruffleOverride ?? sceneJson?.edgeRuffle ?? null
  useFrame(() => driveEdgeRuffle(channel))
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
  const sceneJson = useSceneJson(lookOf(lookId, 'PostProcessing'), bakeLastMs)
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
    _lampGlowUniforms.share.centreSoft = triple.centreSoft
  })
  return null
}
