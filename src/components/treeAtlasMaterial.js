/**
 * treeAtlasMaterial — runtime side of the per-Look tree atlas.
 *
 * The Arborist's Grove bakes a per-Look atlas (color + normal PNGs for bark
 * and leaves) plus UV-rewritten GLBs into public/baked/<look>/. This hook
 * reads the manifest, loads the four atlas textures, and returns two shared
 * MeshStandardMaterials (one bark, one leaves). Every InstancedTrees
 * primitive picks its material via `mesh.userData.atlasKind` (set by the
 * rewriter) and shares the same material instance across all variants.
 *
 * The point: 60+ unique GLB materials → 2 materials → 2 shader programs.
 * That's what unblocks Bloom in cartograph Stage at scale.
 */

import { useEffect, useState, useMemo } from 'react'
import * as THREE from 'three'
import { lampGlow as _lampGlow } from '../preview/lampGlowState'
import { groundColor as _groundColor } from './groundColorState'
import { patchTerrainInstancedBaked } from '../utils/terrainShader'

// Module-level cache: one material set per look. Sharing materials across
// component remounts keeps program count at 2 even if the tree component
// tree re-renders.
const _cache = new Map()  // lookName -> { manifest, barkMaterial, leavesMaterial, status, error }

// Shared completion subscription. The async atlas build is owned by whichever
// useTreeAtlas() instance kicks it off, but its result lands in the shared
// _cache — so EVERY mounted consumer must be re-rendered when it completes, not
// just the initiator. Without this, a second consumer (or the SAME component
// remounting while a load is in flight — e.g. React StrictMode's dev
// mount→unmount→remount, which fires on nearly every load) returns early from
// the load effect, never attaches a completion callback, and stays stuck on
// 'loading' until some unrelated re-render re-reads the now-ready cache ("trees
// don't reliably come on; jiggle a knob to remind them"). A module-level
// listener set fixes it: status changes notify all live consumers.
const _atlasListeners = new Set()
function _notifyAtlasChange() { _atlasListeners.forEach((fn) => { try { fn() } catch {} }) }

// Shared sway uniforms — single object mutated each frame by the runtime.
// Both the LS InstancedTrees consumer and the Salon workstage preview
// write into the SAME object; only one renders at a time (different
// routes) so they don't fight, and sharing the uniform set keeps the
// shader program count at one regardless of which surface is active.
//
// Brief 9a (Sough, 2026-05-22) — Phase 7a wind contract. Replaces the
// Phase 5a scalar `uSwayWindSpeed` + `uSwayWindDir` pair (retired) with
// the wind-field.js contract: a composed force/intensity pair plus the
// gust-front velocity for spatial advection inside the vertex shader,
// plus a tiny rustle-floor amplitude.
export const treeSwayUniforms = {
  uTime:              { value: 0 },
  // Composed wind vector (m/s, world-space XZ) from `windAt(t, camera, ws)`.
  // Direction = unit(uWindForce.xz); amplitude = uWindIntensity.
  uWindForce:         { value: new THREE.Vector3(0, 0, 0) },
  uWindIntensity:     { value: 0 },
  // Spatial advection — vertex shader offsets its phase by
  // dot(instanceWorldXZ, uGustFrontVelocity.xz) / |front|² so gust fronts
  // visibly travel through the scene.
  uGustFrontVelocity: { value: new THREE.Vector3(10, 0, 0) },
  // Phase 7a gust parameters — vertex shader computes the spike itself
  // (spatially advected per tree). CPU windAt() is used by non-shader
  // consumers (Atmosphere in Brief 9b for cloud advection); the tree
  // shader keeps full per-tree spatial variation by sampling its own
  // spike phase. Both reach the same answer in expectation.
  uGustsScale:        { value: 0 },
  uGustEnvelope:      { value: 0 },
  // Rustle floor amplitude in metres (operator spec: ~5 mm leaf-tip sway).
  uRustleAmplitude:   { value: 0.005 },
}

// Brief 10A (Cork, 2026-05-23) — view-aware bark tier selector. Single
// uniform gates which fragment path runs on bark fragments:
//   0 = aerial (gradient-LUT-only, sampled at the SAME luminance axis as
//       hero — Brief 2.1's Rec.601 luminance + uBarkGradientHashAmp; the
//       aerial path skips the Brief 2.1a detail Overlay composite, that's
//       the only difference from hero. Camera-angle-independent sampling.)
//   1 = hero   (current Brief 2.1 + 2.1a path — posterized substrate lands in 10B)
//   2 = street (full PBR — tier 2 falls back to hero until 10C ships)
// Promoted to module-scope (mirrors `treeSwayUniforms` pattern) so flipping
// the value once propagates to BOTH the LS-runtime material and every
// Salon-preview material simultaneously, with no per-draw plumbing. Honors
// the single-shader-program doctrine: uniform branch, NOT customProgramCacheKey.
export const treeBarkTierUniform = { value: 1 }

// ⭐ TRUNK-GROUND CONTACT — shared, module-scoped, defaulting to TODAY'S values
// so the map renders bit-identical until someone turns a knob. Same pattern as
// treeSwayUniforms / treeBarkTierUniform: one write drives every mounted tree.
//   blend     — how strongly the trunk base takes the ground colour
//   blendTop  — how far UP the trunk that reaches, in metres
//   shadowStr — how hard the ground's contact-shadow (G) darkens it
// A solo surface (diorama, street view) wants this tighter and darker than the
// map does; the map keeps the defaults by not touching them.
export const treeTrunkGround = {
  blendUniform:     { value: 0.55 },
  blendTopUniform:  { value: 1.5 },
  shadowStrUniform: { value: 0.5 },
}
export function setTrunkGround({ blend, blendTop, shadowStr } = {}) {
  if (Number.isFinite(blend))     treeTrunkGround.blendUniform.value     = Math.max(0, Math.min(1, blend))
  if (Number.isFinite(blendTop))  treeTrunkGround.blendTopUniform.value  = Math.max(0, blendTop)
  if (Number.isFinite(shadowStr)) treeTrunkGround.shadowStrUniform.value = Math.max(0, Math.min(2, shadowStr))
  return {
    blend: treeTrunkGround.blendUniform.value,
    blendTop: treeTrunkGround.blendTopUniform.value,
    shadowStr: treeTrunkGround.shadowStrUniform.value,
  }
}

// ⭐ WIND TIERING — how per-vertex sway amplitude is distributed through the
// tree. Shared, module-scoped, defaulting to TODAY'S values so every tree in
// the map is bit-identical until someone turns `blend`. Same pattern as
// treeSwayUniforms / treeTrunkGround: one write drives every mounted tree.
//
// blend = 0 → the legacy FOUR BUCKETS (aWindTier 0/1/2/3 → 0.05/0.30/0.60/1.00).
// blend = 1 → a CONTINUOUS ramp from a near-still bole to whipping tips, driven
//             by height × radial distance:
//                 whip = pow(clamp(wH*aTreeHeightNorm + wR*aWindRadialNorm), gamma)
//                 amp  = mix(ampMin, ampMax, whip)
//
// Why the buckets were wrong: they classified by RADIUS ALONE, so an outer
// branch tip 5 m from the axis read "branch" (0.30) while the upper trunk core
// within 6 cm of the axis read "twig" (0.60) — the whippiest parts moved least,
// the bole moved more than they did, and leaves at a flat 1.00 moved 3x the
// branches they hang on. Height × radial is the physical axis: sway grows with
// distance travelled from the base along the structure, whether that distance
// is up the bole or out along a cantilever.
//
// leafFlutter is the leaf card's OWN motion, ADDED to the whip of the branch it
// hangs on — so a leaf rides its branch instead of moving independently of it.
export const treeWindTiering = {
  blendUniform:       { value: 0 },     // 0 = legacy buckets, 1 = continuous ramp
  heightWUniform:     { value: 0.55 },  // how much HEIGHT contributes to whip
  radialWUniform:     { value: 0.45 },  // how much RADIAL DISTANCE contributes
  gammaUniform:       { value: 1.6 },   // >1 keeps the bole still, tips loose
  ampMinUniform:      { value: 0.04 },  // amplitude at the base of the bole
  ampMaxUniform:      { value: 1.15 },  // amplitude at the whippiest tip
  tempoMinUniform:    { value: 0.65 },  // slow, heavy period at the bole
  tempoMaxUniform:    { value: 1.70 },  // quick, light period at the tips
  leafFlutterUniform: { value: 0.35 },  // leaf's own flutter, ON TOP of its branch
}
const _wtClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export function setWindTiering(opts = {}) {
  const t = treeWindTiering
  const set = (key, uni, lo, hi) => {
    if (Number.isFinite(opts[key])) uni.value = _wtClamp(opts[key], lo, hi)
  }
  set('blend',       t.blendUniform,       0, 1)
  set('heightW',     t.heightWUniform,     0, 4)
  set('radialW',     t.radialWUniform,     0, 4)
  set('gamma',       t.gammaUniform,    0.05, 8)
  set('ampMin',      t.ampMinUniform,      0, 4)
  set('ampMax',      t.ampMaxUniform,      0, 8)
  set('tempoMin',    t.tempoMinUniform, 0.05, 8)
  set('tempoMax',    t.tempoMaxUniform, 0.05, 8)
  set('leafFlutter', t.leafFlutterUniform, 0, 4)
  return {
    blend: t.blendUniform.value,
    heightW: t.heightWUniform.value,
    radialW: t.radialWUniform.value,
    gamma: t.gammaUniform.value,
    ampMin: t.ampMinUniform.value,
    ampMax: t.ampMaxUniform.value,
    tempoMin: t.tempoMinUniform.value,
    tempoMax: t.tempoMaxUniform.value,
    leafFlutter: t.leafFlutterUniform.value,
  }
}

// Brief 13 refinement (Vantage 2026-05-23) — auto-tier binding from
// Salon camera distance + preset. The Salon viewport drives the uniform
// per-frame from `cameraStateRef` (Overhead → 0, Ground+distance>20 → 1,
// Ground+distance<20 → 2). The debug setter still works as an override:
// calling `__setBarkShaderTier(n)` PINS the tier so the auto-binding
// yields; `__releaseBarkShaderTier()` releases the pin and auto-binding
// resumes. Use the pin to verify "what does street tier look like from
// overhead camera" — the inspection that motivated the conservative
// no-coupling stance in Brief 13's original draft.
export const treeBarkTierPinned = { value: false }

// Debug setter — drives the shared uniform AND pins it so per-frame
// auto-binding (Salon SpecimenViewport) yields until release.
export function setBarkShaderTier(tier) {
  if (tier == null) { treeBarkTierPinned.value = false; return }
  const t = Number(tier)
  if (!Number.isFinite(t)) return
  treeBarkTierUniform.value = Math.max(0, Math.min(2, Math.round(t)))
  treeBarkTierPinned.value = true
}
export function releaseBarkShaderTier() { treeBarkTierPinned.value = false }

// ── LEAF TRANSMISSION (Jacob, 2026-08-23) ──────────────────────────────────
//
// A leaf is not opaque. Ours was: leaves are double-sided MeshStandard faces, so
// one lit from BEHIND shows an unlit back face and the canopy goes flat exactly
// when it should be at its most alive — golden hour, sun through the crown.
//
// ⭐ WHAT WAS NOT WRONG, because it was measured first and cost a day to rule
// out: the alpha. `trees-atlas.json#atlas` carries alphaMode MASK, alphaCutoff
// 0.5, alphaTest 0.5, doubleSided TRUE — backlit cards are NOT culled, and
// distance erosion is already handled by the coverage-preserving mip chain.
// There was simply no path for light to come THROUGH a leaf.
//
// ⛔ A UNIFORM BRANCH, NEVER A SHADER VARIANT. The single-program constraint is
// load-bearing for Bloom (see uUseBarkGradient below, same rule). A second
// compiled program is the one outcome to avoid.
//
// ⭐ DEFAULT 0 — with this at zero every scene renders bit-identical to before
// it landed, which is what makes it safe to put on the SHARED material ahead of
// anyone authoring a value. Turn it up per Look; the street view then inherits
// it by moving a knob rather than by reimplementing it.
export const treeLeafTransmission = { value: 0 }

// How tightly the glow hugs the light's own direction. Low = a broad wash across
// the canopy; high = only leaves almost directly in front of the sun. 3 is a
// leaf-like falloff; it is a knob rather than a constant because a needle canopy
// and a broad one do not want the same answer.
export const treeLeafTransmissionSharpness = { value: 3 }

// Debug/authoring setter. Drives every mounted tree at once — one write, because
// the uniform object is shared by reference, exactly like treeSwayUniforms.
export function setLeafTransmission(amount, sharpness) {
  const a = Number(amount)
  if (Number.isFinite(a)) treeLeafTransmission.value = Math.max(0, Math.min(4, a))
  if (sharpness != null) {
    const k = Number(sharpness)
    if (Number.isFinite(k)) treeLeafTransmissionSharpness.value = Math.max(0.25, Math.min(16, k))
  }
  return { amount: treeLeafTransmission.value, sharpness: treeLeafTransmissionSharpness.value }
}
if (typeof window !== 'undefined') {
  window.__setBarkShaderTier = setBarkShaderTier
  window.__releaseBarkShaderTier = releaseBarkShaderTier
}

// Phase A (Azimuth) — hero-tier QC overlay. READ-ONLY visualization: when > 0,
// every tree fragment tints by its per-instance `aHeroTier` (mesh → green,
// impostor → magenta) so the operator can eyeball the DERIVED classification
// through the hero pan (the A→B seam). Default 0 → bit-identical render (the
// gate short-circuits; no functional change). Module-scope shared uniform +
// debug setter mirror the treeBarkTier pattern, so flipping it once drives every
// mounted tree material (LS runtime + Salon preview) with no per-draw plumbing,
// honoring the single-shader-program constraint (uniform branch, not a variant).
export const treeHeroTierQC = { value: 0 }
export function setHeroTierQC(on) { treeHeroTierQC.value = on ? 1 : 0 }
if (typeof window !== 'undefined') {
  window.__setHeroTierQC = setHeroTierQC
  // URL opt-in so Stage/Preview can boot straight into the QC view: ?heroTierQC=1
  try { if (/[?&]heroTierQC=1\b/.test(window.location.search)) treeHeroTierQC.value = 1 } catch {}
  // ── Z-prepass measurement toggle (2026-06-25) ──────────────────────────────
  // `window.__treeAlphaTest(0)` flips the LEAF mask OFF on every live tree
  // material → solid rectangles (ugly!) but FULLY OPAQUE → early-Z kicks in,
  // so the gauge shows the no-overdraw CEILING. `window.__treeAlphaTest(0.5)`
  // restores the normal cutout. If the gauge drops hard at 0, the real z-prepass
  // (early-Z while KEEPING the cutout look) is worth building. _cache holds the
  // live MeshStandardMaterial per look (alphaTest is a #define → needsUpdate).
  window.__treeAlphaTest = (v = 0) => {
    let n = 0
    for (const e of _cache.values()) {
      if (e?.treeMaterial) { e.treeMaterial.alphaTest = v; e.treeMaterial.needsUpdate = true; n++ }
    }
    console.log(`[tree] alphaTest=${v} on ${n} material(s) — ${v === 0 ? 'SOLID/early-Z (overdraw ceiling; rectangles)' : 'normal cutout'}. Watch the gauge.`)
  }
}

// Phase B (2026-05-15) — per-(species, draw) bark retint uniforms. These
// live on the SHARED tree material; InstancedTrees mutates the values in
// each submesh's onBeforeRender right before the draw, so bark fragments
// in different species' draw calls see different (tintBase, jitter,
// roughness) — but the COMPILED PROGRAM is the same one. Bloom needs a
// single tree-fragment program (see bake-look.js:200 "non-negotiable"); we
// honor that by driving variance through uniforms, not #define branches.
//
// Per-fragment gating: the vertex shader passes `aBark` (1 for bark, 0 for
// leaf — stamped into the merged geometry by InstancedTrees at runtime)
// through a `vBark` varying. The fragment shader mixes the retint with
// (1,1,1) by vBark so leaf fragments pass through untouched.
//
// Per-instance hue jitter: hashes world-XZ to keep neighboring trees from
// looking like color clones. World-Y is intentionally excluded so a tall
// branch and a low one in the same tree share a tint.
// ── Tree fragment OUTPUT sanitize (the black-block root fix, 2026-06-26) ────
// A foliage fragment writes a non-finite / huge / negative HDR value; the SHARED
// bloom+DoF pyramid (which must stay shared for the GPU budget) spreads it into
// dark blocks. We clamp the final lit color `outgoingLight` (a plain vec3, BEFORE
// <opaque_fragment> writes gl_FragColor — avoids the gl_FragColor/mix(bvec3) trap
// that nuked all trees on the prior attempt): NaN→0 (ternary select, never
// arithmetic on a NaN), Inf/huge→ceiling, negative→0. Default ON. Live A/B via
// window.__treeSanitize(0/1) — flip it to confirm it kills the blocks.
const treeSanitizeUniform = { value: 1 }   // 1 = on, 0 = off (shared across all tree materials)
if (typeof window !== 'undefined') {
  window.__treeSanitize = (v) => {
    treeSanitizeUniform.value = (v === 0 || v === false) ? 0 : 1
    console.log(`[tree] fragment output sanitize ${treeSanitizeUniform.value ? 'ON' : 'OFF'} (NaN/Inf/neg → clamped)`)
  }
}

export function injectFoliageSway(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTreeSanitizeOn    = treeSanitizeUniform
    shader.uniforms.uTime              = treeSwayUniforms.uTime
    shader.uniforms.uWindForce         = treeSwayUniforms.uWindForce
    shader.uniforms.uWindIntensity     = treeSwayUniforms.uWindIntensity
    shader.uniforms.uGustFrontVelocity = treeSwayUniforms.uGustFrontVelocity
    shader.uniforms.uGustsScale        = treeSwayUniforms.uGustsScale
    shader.uniforms.uGustEnvelope      = treeSwayUniforms.uGustEnvelope
    shader.uniforms.uRustleAmplitude   = treeSwayUniforms.uRustleAmplitude
    // Wind tiering — shared by REFERENCE (see `treeWindTiering`). Defaults
    // reproduce the legacy buckets exactly; uWhipBlend=0 is bit-identical.
    shader.uniforms.uWhipBlend         = treeWindTiering.blendUniform
    shader.uniforms.uWhipHeightW       = treeWindTiering.heightWUniform
    shader.uniforms.uWhipRadialW       = treeWindTiering.radialWUniform
    shader.uniforms.uWhipGamma         = treeWindTiering.gammaUniform
    shader.uniforms.uWhipAmpMin        = treeWindTiering.ampMinUniform
    shader.uniforms.uWhipAmpMax        = treeWindTiering.ampMaxUniform
    shader.uniforms.uWhipTempoMin      = treeWindTiering.tempoMinUniform
    shader.uniforms.uWhipTempoMax      = treeWindTiering.tempoMaxUniform
    shader.uniforms.uWhipLeafFlutter   = treeWindTiering.leafFlutterUniform
    // Shared by REFERENCE, so one write drives every mounted tree.
    shader.uniforms.uLeafTransmission          = treeLeafTransmission
    shader.uniforms.uLeafTransmissionSharpness = treeLeafTransmissionSharpness
    // Per-tree lamp-glow uniform — driven by CartographApp from the
    // per-Look TOD curve (lampGlow.trees slider). The per-instance
    // `aLampGlow` attribute (pre-baked at tree position) carries the
    // gaussian sum over nearby lamps; the uniform scales it.
    shader.uniforms.uLampGlow = _lampGlow.treesUniform
    // Trunk-base ground blend — the lowest ~uTrunkBlendTop metres of the trunk
    // blend toward the ACTUAL ground colour beneath the tree, sampled from the
    // baked per-Look ground-color map at the tree's world-XZ. Marries the tree
    // into the ground (pairs with the baked AO contact ring). Bark-gated.
    // LS-driven: the map's shared uniforms are written by BakedGround when the
    // colormap loads; the Salon never mounts BakedGround → uHasGroundColor 0 →
    // OFF. `uTrunkBlend` is the strength (still 0 == no effect).
    shader.uniforms.uGroundColorMap  = _groundColor.mapUniform
    shader.uniforms.uGroundColorMin  = _groundColor.minUniform
    shader.uniforms.uGroundColorSpan = _groundColor.spanUniform
    shader.uniforms.uHasGroundColor  = _groundColor.hasUniform
    shader.uniforms.uTrunkBlend      = treeTrunkGround.blendUniform
    shader.uniforms.uTrunkBlendTop   = treeTrunkGround.blendTopUniform
    // FX map (G contact shadow / R lamp pool) so the trunk blends toward the
    // COMBINED EFFECTIVE ground colour, not raw albedo — same map + math as
    // grassMaterial, so the trunk base sits in its own shadow ring.
    shader.uniforms.uGroundFxMap    = _groundColor.fxMapUniform
    shader.uniforms.uGroundFxMin    = _groundColor.fxMinUniform
    shader.uniforms.uGroundFxSpan   = _groundColor.fxSpanUniform
    shader.uniforms.uGroundFxScale  = _groundColor.fxScaleUniform
    shader.uniforms.uTrunkShadowStr = treeTrunkGround.shadowStrUniform  // matches grass uShadowStr
    shader.uniforms.uTrunkPool      = _lampGlow.poolUniform
    shader.uniforms.uTrunkPoolColor = _lampGlow.colorUniform
    // Phase B bark retint uniforms (per-draw mutation pattern).
    shader.uniforms.uBarkTintBase = { value: new THREE.Color(1, 1, 1) }
    shader.uniforms.uBarkTintJitterRange = { value: 0 }
    shader.uniforms.uBarkRoughnessOverride = { value: -1 }
    // Phase L Cycle 2 (per-region bark binding). Each draw call carries
    // BOTH region specs; the fragment shader selects via vBarkRegion
    // (per-vertex, stamped at runtime merge time from primitive identity).
    // uBarkRegionSplit gates the path — 0 disables region-select (legacy
    // single-spec path uses uBarkTintBase only); 1 enables.
    shader.uniforms.uBarkRegionSplit = { value: 0 }
    shader.uniforms.uBarkTrunkTintBase = { value: new THREE.Color(1, 1, 1) }
    shader.uniforms.uBarkBranchTintBase = { value: new THREE.Color(1, 1, 1) }
    shader.uniforms.uBarkTrunkJitterRange = { value: 0 }
    shader.uniforms.uBarkBranchJitterRange = { value: 0 }
    shader.uniforms.uBarkTrunkRoughness = { value: -1 }
    shader.uniforms.uBarkBranchRoughness = { value: -1 }
    // Brief 2 (Holm) — per-variant gradient ramp. The LUT lives in the same
    // unified atlas as the bark/leaf tiles (no new sampler), and the
    // fragment shader reads it via `map` at vec2(t, 0.5) * Scale + Offset
    // where `t` is a per-instance hash. uUseBarkGradient gates the path so
    // legacy single-tint compositions render unchanged — a uniform-driven
    // branch, NOT a sibling material variant, per the single-program
    // constraint Bloom needs.
    shader.uniforms.uUseBarkGradient = { value: 0 }
    shader.uniforms.uBarkGradientTileOffset = { value: new THREE.Vector2(0, 0) }
    shader.uniforms.uBarkGradientTileScale = { value: new THREE.Vector2(1, 1) }
    // Brief 2.1 (Birch) — per-pixel luminance pivot. uBarkGradientHashAmp
    // adds optional cross-tree modulation on top of the luminance base
    // sampling axis. Default 0 = pure luminance → identical bark+gradient
    // pairs render pixel-identical across instances. >0 sub-amplitude
    // hash offset preserves species character with subtle variety.
    shader.uniforms.uBarkGradientHashAmp = { value: 0 }
    // Brief 2.1a (Cinder) — bark Detail Texturing composite. Detail tile
    // packs into the same unified atlas as bark/leaves/gradient; sampled
    // via `map` at vMapUv * Scale + Offset, Overlay-blended over whatever
    // bark color the prior path produced (single-tint, gradient-on,
    // gradient-off all unaffected). Identity baseline: when no slot is
    // bound (default 0.5-grey offset + zero scale → samples top-left of
    // atlas which may be non-grey), uBarkDetailStrength=0 forces identity.
    shader.uniforms.uBarkDetailTileOffset = { value: new THREE.Vector2(0, 0) }
    shader.uniforms.uBarkDetailTileScale = { value: new THREE.Vector2(0, 0) }
    shader.uniforms.uBarkDetailStrength = { value: 1.0 }
    // The species's primary bark tile bounds in unified-atlas space; the
    // shader uses these to recover [0,1] local-UV from vMapUv before
    // mapping into the detail sub-region. Without this, vMapUv (which
    // lives inside a small atlas sub-region) would alias to a single
    // detail-tile corner. Scale=0 keeps the composite identity-safe when
    // no slot is bound.
    shader.uniforms.uBarkTileOffset = { value: new THREE.Vector2(0, 0) }
    shader.uniforms.uBarkTileScale = { value: new THREE.Vector2(1, 1) }
    // Brief 10B (Vellum) — posterized substrate sub-region. Under tier ≤ 1,
    // the bark fragment chunk resamples from this region at the same tile-
    // local UV used for detail (recovered from vMapUv via uBarkTileOffset/
    // Scale) and replaces diffuseColor.rgb's bark pixels BEFORE Brief 2.1's
    // luminance gradient REPLACE runs. Identity-safe when scale=0 (no slot
    // bound — fresh checkout, no posterized.png, first cold bake fallback).
    // Tier 2 (street) keeps vendor color via the same gating shape Brief 10A
    // uses for the detail composite (forward-compat with 10C street-PBR).
    shader.uniforms.uBarkPosterizedTileOffset = { value: new THREE.Vector2(0, 0) }
    shader.uniforms.uBarkPosterizedTileScale = { value: new THREE.Vector2(0, 0) }
    // Brief 10A (Cork) — view-aware bark tier. Shared module-scope uniform
    // object so a single mutation drives every mounted tree material at
    // once (LS runtime + Salon preview). Aerial samples the gradient LUT
    // at the same Brief 2.1 luminance axis as hero but skips the Brief 2.1a
    // detail composite; hero is the existing path; street currently falls
    // back to hero (10C wires full PBR).
    shader.uniforms.uBarkShaderTier = treeBarkTierUniform
    // Phase A (Azimuth) — hero-tier QC overlay gate (shared module-scope uniform).
    shader.uniforms.uHeroTierQC = treeHeroTierQC
    // Brief 3A (Cant) — per-instance deformer ranges. Three vec2 [lo,hi]
    // ranges (lean/twist in radians, wander in metres) sampled per-instance
    // by a world-XZ hash in the vertex shader. Default (0,0) → identity, so
    // any species without an authored deformer renders pixel-identical
    // (regression-safe). uDeformSeed perturbs the hash anchor — 0 in LS
    // (real per-instance anchors give the spread), non-zero in Salon preview
    // so the single-tree preview can re-roll across the authored range.
    shader.uniforms.uDeformLeanRange   = { value: new THREE.Vector2(0, 0) }
    shader.uniforms.uDeformTwistRange  = { value: new THREE.Vector2(0, 0) }
    shader.uniforms.uDeformWanderRange = { value: new THREE.Vector2(0, 0) }
    shader.uniforms.uDeformSeed        = { value: new THREE.Vector2(0, 0) }
    // Overhead "hula" impostor deformers (HANDOFF-overhead-hula-impostor.md).
    // Two authored knobs, both metres-as-fraction: uRuffleDepth flexes the
    // baked rim scallop (the ruche), uHulaAmount drives the base-anchored
    // per-layer disc rock (the hula). Gated per-vertex by aOverhead (only the
    // overhead disc geometry carries it), so on every mesh tree — which lacks
    // aOverhead/aRuffle → both default 0 → the block is a no-op, bit-exact
    // regression-safe. Default 0 here too (belt-and-suspenders identity).
    shader.uniforms.uRuffleDepth = { value: 0 }
    shader.uniforms.uHulaAmount  = { value: 0 }
    // Hero-impostor CAPTURE MASK (RTT only). 0 = off — every normal render (LS
    // runtime + Salon) leaves it 0, so this is a bit-exact no-op there. 1 = leaf-
    // only (discard bark verts), 2 = bark-only (discard leaf verts): the hero
    // capture bakes the leaf-parallax shells and the single woody layer as separate
    // passes off the SAME tree (HANDOFF-hero-impostor-foundation.md). Set + reset
    // around the RTT render in captureImpostor#renderTreeToTexture (like toneMapping).
    shader.uniforms.uCaptureMask = { value: 0 }
    // Phase B.1.a (revised): UV tiling is now PRE-BAKED into the bark
    // source texture at publish time (see arborist/generate-procedural.js
    // → preTileBark). The atlas tile content already carries N×M tiled
    // bark, so the runtime shader samples normally and the hardware
    // mipmap + anisotropic filter chains work as God intended. No
    // shader-side fract(), no per-draw wrap uniforms.
    // Stash the shader on the material so InstancedTrees can mutate the
    // uniforms per (species, draw) without redoing onBeforeCompile.
    material.userData.shader = shader
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform vec3  uWindForce;
         uniform float uWindIntensity;
         uniform vec3  uGustFrontVelocity;
         uniform float uGustsScale;
         uniform float uGustEnvelope;
         uniform float uRustleAmplitude;
         attribute float aLampGlow;
         attribute float aBark;
         attribute float aBarkRegion;
         attribute float aWindTier;
         attribute float aTreeHeightNorm;
         attribute float aWindRadialNorm;
         uniform float uWhipBlend;
         uniform float uWhipHeightW;
         uniform float uWhipRadialW;
         uniform float uWhipGamma;
         uniform float uWhipAmpMin;
         uniform float uWhipAmpMax;
         uniform float uWhipTempoMin;
         uniform float uWhipTempoMax;
         uniform float uWhipLeafFlutter;
         attribute float aHeroTier;
         uniform vec2 uDeformLeanRange;
         uniform vec2 uDeformTwistRange;
         uniform vec2 uDeformWanderRange;
         uniform vec2 uDeformSeed;
         // Overhead "hula" impostor — per-vertex gate + baked standing scallop.
         attribute float aOverhead;   // 1 on overhead disc verts; absent → 0 on mesh
         attribute float aRuffle;     // baked sin(FOLDS·θ) rim scallop, [-1,1]
         uniform float uRuffleDepth;  // ruche flex amplitude (knob 1)
         uniform float uHulaAmount;   // hula rock amplitude (knob 2)
         varying float vLampGlow;
         varying float vCanopyW;
         varying float vLocalY;
         varying float vBark;
         varying float vBarkRegion;
         varying float vHeroTier;
         varying vec3 vWorldXZ;
         // Brief 3A (Cant) — per-instance deformer. Builds the lean∘twist
         // rotation about the trunk base (= origin, Brief 20 recenter) and the
         // per-height wander XZ offset, seeded by the instance anchor so every
         // vertex of one tree shares one signature. Pure rigid rotation, so the
         // SAME matrix rotates the normal exactly (no inverse-transpose — that's
         // the canopy-asymmetry work deferred to 3C). All-zero ranges → identity
         // matrix + zero offset, bit-exact regression-safe.
         mat3 cantDeformBasis(vec2 anchorXZ, float hNorm, out vec2 wanderOut) {
           float dh5 = fract(sin(dot(anchorXZ, vec2(73.1, 458.3)))  * 43758.5453); // lean+twist mag
           float dh6 = fract(sin(dot(anchorXZ, vec2(151.7, 619.2))) * 43758.5453); // wander mag
           float dh7 = fract(sin(dot(anchorXZ, vec2(311.3, 97.5)))  * 43758.5453); // lean azimuth
           float dh8 = fract(sin(dot(anchorXZ, vec2(57.9, 271.4)))  * 43758.5453); // wander dir/phase
           float leanAmt   = mix(uDeformLeanRange.x,   uDeformLeanRange.y,   dh5);
           float twistAmt  = mix(uDeformTwistRange.x,  uDeformTwistRange.y,  dh5);
           float wanderAmt = mix(uDeformWanderRange.x, uDeformWanderRange.y, dh6);
           // Lean: tip toward a per-instance compass azimuth, angle grows with
           // height so the base stays planted and the canopy tilts. Rotation
           // axis is horizontal, perpendicular to the lean direction.
           float az = dh7 * 6.2831853;
           vec2  leanDir = vec2(cos(az), sin(az));
           vec3  k = vec3(leanDir.y, 0.0, -leanDir.x);   // already unit
           float la = leanAmt * hNorm;
           float lc = cos(la), ls = sin(la), lC = 1.0 - lc;
           mat3 leanRot = mat3(
             lc + k.x*k.x*lC,  k.z*ls,           k.x*k.z*lC,
             -k.z*ls,          lc,               k.x*ls,
             k.x*k.z*lC,       -k.x*ls,          lc + k.z*k.z*lC
           );
           // Twist: rotate about local Y, angle grows with height.
           float ta = twistAmt * hNorm;
           float tc = cos(ta), ts = sin(ta);
           mat3 twistRot = mat3(
             tc,  0.0, -ts,
             0.0, 1.0, 0.0,
             ts,  0.0, tc
           );
           // Wander: sinusoidal-in-height XZ drift along a per-instance
           // direction, fixed frequency (1.5 half-cycles over the trunk).
           // Pure translation per height-slice — normal unaffected (the small
           // tangent shear is ignored per 3A scope).
           float wAz    = dh8 * 6.2831853;
           float wPhase = fract(dh8 * 1.7 + 0.37) * 6.2831853;
           float wander = wanderAmt * sin(hNorm * 3.14159265 * 1.5 + wPhase);
           wanderOut = vec2(cos(wAz), sin(wAz)) * wander;
           return leanRot * twistRot;
         }`
      )
      .replace(
        // Brief 3A (Cant): the deformer rotation must touch the NORMAL here,
        // not in <begin_vertex>. In MeshStandardMaterial the normal chunks
        // (<beginnormal_vertex>→<defaultnormal_vertex>→<normal_vertex>) all run
        // BEFORE <begin_vertex>, so by the time `transformed` exists the normal
        // is already baked into vNormal. We compute the lean∘twist matrix here,
        // rotate objectNormal, and stash the matrix + wander offset in main()
        // scope for the <begin_vertex> patch to reuse on the position. Anchor
        // accessor mirrors the wind block's instWorld (instanceMatrix in the LS
        // instanced path, modelMatrix fallback for the non-instanced Salon
        // preview — Cambium Brief 7).
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
         #ifdef USE_INSTANCING
           vec2 cantAnchorXZ = vec2(instanceMatrix[3].x, instanceMatrix[3].z) + uDeformSeed;
         #else
           vec2 cantAnchorXZ = vec2(modelMatrix[3].x, modelMatrix[3].z) + uDeformSeed;
         #endif
         float cantH = clamp(aTreeHeightNorm, 0.0, 1.0);
         vec2 cantWander;
         mat3 cantRot = cantDeformBasis(cantAnchorXZ, cantH, cantWander);
         objectNormal = cantRot * objectNormal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         // Brief 3A (Cant): reshape the rest pose BEFORE wind sway. cantRot +
         // cantWander were computed in the <beginnormal_vertex> patch above
         // (same main() scope). Wind then oscillates around this deformed pose.
         transformed = cantRot * transformed;
         transformed.xz += cantWander;
         // ── Overhead "hula" impostor deformers (ruche → hula → [wind below]) ──
         // Layered in order of intrinsic-ness, BEFORE the shared wind sway, so
         // wind oscillates around this deformed pose (exactly as cantRot does).
         // Gated by aOverhead: on mesh trees (aOverhead=0) this whole block is a
         // no-op — bit-exact regression-safe. See HANDOFF-overhead-hula-impostor.md.
         if (aOverhead > 0.5) {
           // 1. RUCHE — a gentle VERTICAL undulation of the canopy surface
           //    (aRuffle is the rim-weighted standing scallop sin(FOLDS·θ)·rFrac);
           //    NO travel term (fold #3 stays fold #3) and, deliberately, NO
           //    radial displacement — pushing verts outward stretched the capture
           //    into a starfish (Jacob, 2026-07-06). Vertical-only keeps the
           //    canopy silhouette intact and just ripples the surface up/down.
           //    Amplitude in metres, flexed gently over time. Scale ~2 m at full.
           float breathe = 1.0 + 0.15 * sin(uTime * 0.5);
           transformed.y += aRuffle * uRuffleDepth * 2.0 * breathe;
           // 2. HULA — the tree's own gentle life. The whole disc-stack rocks on
           //    a horizontal axis whose direction slowly DRIFTS (non-directional),
           //    base-anchored (amplitude ∝ aTreeHeightNorm → trunk-height layers
           //    barely move, the crown rocks) and phase-LAGGED up the stack so
           //    the column bends in a soft S-wave rather than swinging rigidly.
           float hulaT   = uTime * 0.7;
           float hulaDrA = uTime * 0.22;                 // slow drift of the bend axis
           vec2  hulaDir = vec2(cos(hulaDrA), sin(hulaDrA));
           float hulaLag = aTreeHeightNorm * 2.4;        // lag up the column → S-curve
           float hulaBend = uHulaAmount * aTreeHeightNorm * sin(hulaT - hulaLag);
           transformed.xz += hulaDir * hulaBend;
         }
         vLampGlow = aLampGlow;
         vBark = aBark;
         vBarkRegion = aBarkRegion;
         vHeroTier = aHeroTier;
         // Canopy weight: hard-zero on the trunk, ramping in only above
         // the canopy break. Earlier 1.5→4.0 left ~20% contribution at 2m
         // which still showed as a faint trunk stripe. 3.0→4.5 gives a
         // tight transition: trunk stays fully dark, canopy fully lit.
         vCanopyW = smoothstep(3.0, 4.5, position.y);
         vLocalY = position.y;  // local height up the tree (0 = trunk base) — trunk-base ground blend
         {
           // Per-instance phase from instanceMatrix translation column when
           // rendered via InstancedMesh (LS path). Brief 7 (Cambium) added
           // the non-instanced fallback so the same material can mount on a
           // plain Mesh in the Salon preview — modelMatrix's translation
           // column substitutes; per-tree variety degrades to a single
           // constant value, which is fine for one-tree preview rendering.
           #ifdef USE_INSTANCING
             vec3 instWorld = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
           #else
             vec3 instWorld = vec3(modelMatrix[3].x, 0.0, modelMatrix[3].z);
           #endif
           float phase = instWorld.x * 0.05 + instWorld.z * 0.07;
           float h = max(position.y, 0.0);
           // ── Brief 9a (Sough): two-layer wind composition ──────────────
           // RUSTLE FLOOR — deterministic per-(instance, vertex) noise,
           // always on, very small (~5 mm at leaf tier). Per the operator's
           // 2026-05-22 spec: "a very subtle 'rustle' as the 'floor' for
           // ambient 'life'." Calm weather → only this layer is visible.
           //
           // Per-tier amplitude scale (aWindTier: 0=trunk, 1=branch,
           // 2=twig, 3=leaf — assigned at runtime-merge time in
           // InstancedTrees.jsx). Trunks stay still; leaves flutter.
           // LEGACY path (uWhipBlend = 0) — the four buckets, kept verbatim so
           // the map is bit-identical until the knob is turned.
           float ampLegacy, tempoLegacy;
           if (aWindTier < 0.5)      { ampLegacy = 0.05; tempoLegacy = 0.7; }  // trunk
           else if (aWindTier < 1.5) { ampLegacy = 0.30; tempoLegacy = 1.0; }  // branch
           else if (aWindTier < 2.5) { ampLegacy = 0.60; tempoLegacy = 1.3; }  // twig
           else                      { ampLegacy = 1.00; tempoLegacy = 1.6; }  // leaf
           // CONTINUOUS path (uWhipBlend = 1) — one smooth ramp, no buckets.
           // whip is how far this vertex has travelled from the base ALONG
           // THE STRUCTURE: up the bole (aTreeHeightNorm) and out along a
           // cantilever (aWindRadialNorm). A branch tip is far out AND high, so
           // it whips; the bole core is high but at r=0, so it stays heavy.
           float whip = clamp(uWhipHeightW * clamp(aTreeHeightNorm, 0.0, 1.0)
                            + uWhipRadialW * clamp(aWindRadialNorm, 0.0, 1.0),
                            0.0, 1.0);
           whip = pow(whip, max(uWhipGamma, 1e-3));
           float ampCont   = mix(uWhipAmpMin,   uWhipAmpMax,   whip);
           float tempoCont = mix(uWhipTempoMin, uWhipTempoMax, whip);
           // A leaf RIDES ITS BRANCH: it takes the whip of the wood it hangs on
           // and adds its own small flutter on top, rather than moving at an
           // unrelated flat amplitude.
           if (aWindTier > 2.5) {
             ampCont   += uWhipLeafFlutter;
             tempoCont *= 1.25;
           }
           float ampScale   = mix(ampLegacy,   ampCont,   uWhipBlend);
           float tempoScale = mix(tempoLegacy, tempoCont, uWhipBlend);
           {
             float rt = uTime * 2.5 * tempoScale;
             float rphase = phase + position.y * 0.3;
             vec2 rustle = vec2(
               sin(rt + rphase),
               sin(rt * 0.83 + rphase * 1.4 + 1.7)
             ) * uRustleAmplitude * ampScale * h;
             transformed.xz += rustle;
           }
           // DIRECTIVE WIND — sampled from wind-field.js#windAt on the
           // CPU side; uWindForce already encodes direction × intensity
           // (m/s, XZ-plane). Vertex shader applies spatial advection so
           // gust fronts visibly travel across the scene at
           // |uGustFrontVelocity| m/s. Multi-scale damping per aWindTier.
           //
           // Composition is additive on top of the rustle floor — calm
           // weather has uWindIntensity ≈ 0 and this block contributes
           // ~nothing; storm weather swamps the floor.
           {
             // Spatial advection: phase-offset proportional to position
             // along the gust-front direction. Far-upwind trees lead
             // far-downwind trees by Δd/|front| seconds. The gust
             // contribution alone uses this offset; the drift component
             // is spatially uniform (all trees feel the same baseline).
             float frontLenSq = dot(uGustFrontVelocity.xz, uGustFrontVelocity.xz);
             float phaseOffset = (frontLenSq > 1e-4)
               ? dot(instWorld.xz, uGustFrontVelocity.xz) / frontLenSq
               : 0.0;
             // Drift (uniform across scene) — uses raw uTime.
             float wtDrift = uTime;
             // Gust spike (per-tree advected) — uses offset uTime.
             float wtGust  = uTime - phaseOffset;
             // Direction of horizontal sway: prefer the composed wind
             // direction; fall back to gust-front direction if drift is
             // zero (calm with active gust front — unusual but possible
             // under e.g. a thunderstorm outflow).
             vec2 windDirXZ;
             if (uWindIntensity > 1e-3) {
               windDirXZ = uWindForce.xz / uWindIntensity;
             } else if (frontLenSq > 1e-4) {
               windDirXZ = uGustFrontVelocity.xz / sqrt(frontLenSq);
             } else {
               windDirXZ = vec2(0.0);
             }
             // Sway amplitude: drift component (constant intensity) +
             // spike component (per-tree advected). The 0.012 converts
             // m/s of wind into roughly metres of leaf-tip sway per
             // metre of height — tuned for the operator's "flutter
             // visibly but trunks barely move" target.
             //
             // Spike: cheap noise-product gated by max(_,0) to give the
             // smoothmax-shaped sharp positive spikes the CPU windAt
             // produces. Spatial correlation length ~100 m (0.01 m⁻¹).
             float spikePhase  = wtGust * 1.5 + instWorld.x * 0.01 + instWorld.z * 0.007;
             float spikeRaw    = sin(spikePhase) * 0.6
                               + sin(spikePhase * 1.7 + 1.3) * 0.3
                               + sin(spikePhase * 0.31 + 0.7) * 0.1;
             float spikeShape  = max(spikeRaw - 0.35, 0.0) * 2.2;
             float gustAmp     = uGustsScale * uGustEnvelope * spikeShape;
             float driftOsc    = sin(wtDrift * tempoScale + phase);
             float gustOsc     = sin(wtGust  * tempoScale * 1.9 + phase * 1.7);
             // Drift sway scales with intensity; gust sway is its own
             // amplitude on top. Both pass through the per-tier ampScale.
             float swayMps     = uWindIntensity * driftOsc + gustAmp * gustOsc;
             float swayMetres  = ampScale * swayMps * 0.012 * h;
             transformed.xz += windDirXZ * swayMetres;
             // Static lean — small constant offset toward wind dir
             // proportional to total intensity. Sustained wind tips
             // the canopy; trunks barely lean (heavy damping); leaves
             // lean a lot.
             float leanMps     = uWindIntensity + gustAmp * 0.5;
             transformed.xz += windDirXZ * (ampScale * leanMps * 0.012 * h * 0.3);
           }
           // Per-instance world-XZ for fragment hue jitter. We sample the
           // instance translation column (constant within a draw) so every
           // fragment of one tree gets ONE jitter value, not noise per
           // vertex. Y intentionally excluded so trunk and canopy share it.
           vWorldXZ = vec3(instWorld.x, 0.0, instWorld.z);
         }`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uLeafTransmission;
         uniform float uLeafTransmissionSharpness;
         uniform float uLampGlow;
         uniform sampler2D uGroundColorMap;
         uniform vec2  uGroundColorMin;
         uniform vec2  uGroundColorSpan;
         uniform float uHasGroundColor;
         uniform float uTrunkBlend;
         uniform float uTrunkBlendTop;
         uniform sampler2D uGroundFxMap;
         uniform vec2  uGroundFxMin;
         uniform vec2  uGroundFxSpan;
         uniform float uGroundFxScale;
         uniform float uTrunkShadowStr;
         uniform float uTrunkPool;
         uniform vec3  uTrunkPoolColor;
         uniform vec3  uBarkTintBase;
         uniform float uBarkTintJitterRange;
         uniform float uBarkRoughnessOverride;
         uniform float uBarkRegionSplit;
         uniform vec3  uBarkTrunkTintBase;
         uniform vec3  uBarkBranchTintBase;
         uniform float uBarkTrunkJitterRange;
         uniform float uBarkBranchJitterRange;
         uniform float uBarkTrunkRoughness;
         uniform float uBarkBranchRoughness;
         uniform float uUseBarkGradient;
         uniform vec2  uBarkGradientTileOffset;
         uniform vec2  uBarkGradientTileScale;
         uniform float uBarkGradientHashAmp;
         uniform vec2  uBarkDetailTileOffset;
         uniform vec2  uBarkDetailTileScale;
         uniform float uBarkDetailStrength;
         uniform vec2  uBarkTileOffset;
         uniform vec2  uBarkTileScale;
         uniform vec2  uBarkPosterizedTileOffset;
         uniform vec2  uBarkPosterizedTileScale;
         uniform float uBarkShaderTier;
         uniform float uHeroTierQC;
         uniform float uTreeSanitizeOn;
         uniform float uCaptureMask;
         varying float vLampGlow;
         varying float vCanopyW;
         varying float vLocalY;
         varying float vBark;
         varying float vBarkRegion;
         varying float vHeroTier;
         varying vec3  vWorldXZ;`
      )
      .replace(
        // Phase B (revised): UV tiling is pre-baked into the bark source
        // texture at publish time (see arborist/generate-procedural.js
        // preTileBark) so the shader samples the atlas directly via the
        // standard <map_fragment> chunk and hardware mipmap + aniso work
        // as God intended. We patch AFTER the chunk to apply the
        // per-(species, Look, instance) bark retint, gated by vBark so
        // leaf fragments pass through identity.
        '#include <map_fragment>',
        `#include <map_fragment>
         // Hero-impostor CAPTURE MASK (RTT only; uCaptureMask is 0 = off in every
         // normal LS/Salon render → no-op there). 1 = leaf-only (discard the woody
         // vBark verts), 2 = bark-only (discard the leaf verts) — so the hero capture
         // bakes leaf-parallax shells + one woody layer as separate passes.
         if (uCaptureMask > 0.5) {
           if (uCaptureMask < 1.5) { if (vBark > 0.5) discard; }
           else                    { if (vBark < 0.5) discard; }
         }
         {
           // Brief 10B (Vellum) — posterized substrate swap (tier ≤ 1).
           // localUV computation lifted to the top of the bark chunk so both
           // the substrate swap (10B) and the detail Overlay composite (2.1a)
           // share one local-UV recovery from vMapUv. vMapUv lives inside the
           // bark sub-region of the unified atlas; (vMapUv - uBarkTileOffset)
           // / uBarkTileScale recovers the [0,1] tile-local UV. fract()
           // wraps in case the bark UVs spilled past [0,1] pre-rewrite (per
           // arborist/NOTES.md Cinder 2026-05-21 local-UV recovery).
           vec2 localUV = (uBarkTileScale.x > 0.0 && uBarkTileScale.y > 0.0)
             ? (vMapUv - uBarkTileOffset) / uBarkTileScale
             : vec2(0.5);
           localUV = fract(localUV);
           // Posterized substrate sample at the same tile-local UV. When no
           // slot is bound (uBarkPosterizedTileScale=0 — fresh checkout / no
           // posterized.png yet), the ternary clamps postUV to (0.5, 0.5) so
           // the wasted sample stays inside the atlas; havePosterized then
           // gates the mix and the vendor diffuseColor passes through.
           vec2 postUV = (uBarkPosterizedTileScale.x > 0.0 && uBarkPosterizedTileScale.y > 0.0)
             ? (localUV * uBarkPosterizedTileScale + uBarkPosterizedTileOffset)
             : vec2(0.5);
           vec3 posterizedSample = texture2D(map, postUV).rgb;
           // tier 0+1 → use posterized; tier 2 → keep vendor (street-PBR
           // forward-compat with 10C). havePosterized gates the unbound case.
           float useVendor = step(1.5, uBarkShaderTier);
           float havePosterized = step(0.001, uBarkPosterizedTileScale.x * uBarkPosterizedTileScale.y);
           vec3 substrate = mix(posterizedSample, diffuseColor.rgb, max(useVendor, 1.0 - havePosterized));
           // Bark-fragment-only substrate replacement; leaves pass through
           // <map_fragment>'s vendor sample untouched. Brief 2.1's luminance
           // math + Brief 2.1a's detail Overlay below now operate on the
           // kit-quantized substrate when tier ≤ 1 — cleaner LUT indexing
           // (discrete luminance buckets → discrete gradient stops) + kit
           // illustrated look at Browse + Hero distance.
           diffuseColor.rgb = mix(diffuseColor.rgb, substrate, vBark);

           float jh1 = fract(sin(dot(vWorldXZ.xz, vec2(127.1, 311.7))) * 43758.5453);
           float jh2 = fract(sin(dot(vWorldXZ.xz, vec2(269.5, 183.3))) * 43758.5453);
           float jh3 = fract(sin(dot(vWorldXZ.xz, vec2(419.2, 371.9))) * 43758.5453);
           vec3 jitter = vec3(jh1, jh2, jh3);
           // Phase L Cycle 2: when uBarkRegionSplit > 0, pick trunk vs
           // branch spec from per-vertex vBarkRegion (1=trunk, 0=branch).
           // Otherwise fall back to legacy single-spec uBarkTintBase. Both
           // paths preserve Bloom's single shader program — variation lives
           // in uniforms + per-vertex gate, not branch-and-compile.
           vec3  baseTint = mix(uBarkBranchTintBase, uBarkTrunkTintBase, vBarkRegion);
           float baseJit  = mix(uBarkBranchJitterRange, uBarkTrunkJitterRange, vBarkRegion);
           vec3  regionTint = baseTint;
           float regionJitter = baseJit;
           vec3  effTintBase = mix(uBarkTintBase, regionTint, uBarkRegionSplit);
           float effJitter   = mix(uBarkTintJitterRange, regionJitter, uBarkRegionSplit);
           vec3 perInstanceTint = mix(vec3(1.0), 0.5 + jitter, effJitter);
           vec3 barkTint = effTintBase * perInstanceTint;
           // Brief 2.1 (Birch) per-pixel luminance gradient with REPLACE
           // semantics: when bound, the gradient LUT-sampled-at-luminance
           // IS the bark color — it does NOT tint or multiply the PBR
           // sample. "Luminance is the substrate; gradient is the palette."
           // Same gradient stops across different bark refs → distinct
           // species identities (Maple furrow vs Oak furrow drive the LUT
           // differently). Rec.601 luminance computed on post-<map_fragment>
           // diffuseColor (linearized via SRGBColorSpace atlas tag).
           // uBarkGradientHashAmp adds optional sub-amplitude per-instance
           // modulation on top of the luminance base; default 0 = pure
           // luminance, identical bark+gradient pairs render pixel-identical.
           // jh4 stays uncorrelated with jh1/jh2/jh3 used by tintJitter.
           // Final mix is between two complete bark colors: legacy tinted-PBR
           // (no gradient bound) vs gradient-replaced (gradient bound).
           float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
           float jh4 = fract(sin(dot(vWorldXZ.xz, vec2(521.7, 233.1))) * 43758.5453);
           float gradT = clamp(lum + (jh4 - 0.5) * uBarkGradientHashAmp, 0.0, 1.0);
           vec2 lutUV = vec2(gradT, 0.5) * uBarkGradientTileScale + uBarkGradientTileOffset;
           vec3 gradientColor = texture2D(map, lutUV).rgb;
           vec3 legacyBark = diffuseColor.rgb * barkTint;
           vec3 barkColor = mix(legacyBark, gradientColor, uUseBarkGradient);
           // Brief 2.1a (Cinder) Detail Texturing composite — Unreal Detail
           // Texture / Unity HDRP Detail Albedo. Uses the localUV computed
           // at the top of this block (lifted by Brief 10B so substrate
           // swap + detail composite share one local-UV recovery). Overlay
           // blend on the final bark color, additive over the tint/gradient
           // path. Identity-safe when uBarkTileScale=0 (no slot bound) since
           // uBarkDetailStrength is mixed against the unmodified barkColor.
           vec2 detailUV = localUV * uBarkDetailTileScale + uBarkDetailTileOffset;
           vec3 detailSample = texture2D(map, detailUV).rgb;
           // Overlay blend: per-channel, energy-preserving, bidirectionally
           // clamped. step() midtone branch is sRGB-standard; the
           // atlas texture is SRGBColorSpace-tagged so sample is linearized
           // on read — the blend lives in linear space, which is fine for
           // an additive luminance multiplier.
           vec3 ovLo = 2.0 * barkColor * detailSample;
           vec3 ovHi = 1.0 - 2.0 * (1.0 - barkColor) * (1.0 - detailSample);
           vec3 composite = mix(ovLo, ovHi, step(vec3(0.5), barkColor));
           // Brief 10A revision (Cork, post-review pivot 2026-05-23) — aerial
           // tier samples the gradient LUT at the SAME luminance axis as hero
           // (Brief 2.1's Rec.601 luminance + uBarkGradientHashAmp), not at a
           // per-vertex normalized chassis Y. The original world-Y axis read
           // camera-angle-dependent (Overhead vs Ground saw different gradient
           // distributions because different portions of bark surface were
           // visible per framing); luminance is per-pixel texture-driven and
           // identical regardless of camera. The only architectural difference
           // between aerial (tier 0) and hero (tier 1) becomes: aerial skips
           // the Brief 2.1a detail Overlay composite; hero includes it. Gate
           // the detail step by step(0.5, uBarkShaderTier): aerial → 0 → no
           // detail; hero/street → 1 → full detail.
           //   tier 0 (aerial) — Brief 2.1 luminance REPLACE, NO detail Overlay
           //   tier 1 (hero)   — Brief 2.1 luminance REPLACE + Brief 2.1a detail Overlay
           //   tier 2 (street) — falls back to hero; 10C wires full-PBR
           float tierDetail = step(0.5, uBarkShaderTier);
           barkColor = mix(barkColor, composite, uBarkDetailStrength * tierDetail);
           diffuseColor.rgb = mix(diffuseColor.rgb, barkColor, vBark);
           // Phase A (Azimuth) hero-tier QC overlay — read-only. Tints the whole
           // tree (bark + leaf) by its derived class so the operator eyeballs the
           // mesh/impostor split through the hero pan. Gated → no-op when off.
           if (uHeroTierQC > 0.5) {
             // 0 = mesh (green), 1 = impostor (magenta), 2 = cull (blue — these
             // are dropped entirely in production; tinted here only so the
             // operator can confirm nothing visible is being culled), 3 = opaque
             // (ORANGE — the Phase-B opaque-articulated middle tier: real
             // trunk/branches + a solid opaque canopy shell).
             vec3 qc = vHeroTier < 0.5 ? vec3(0.15, 0.95, 0.35)
                     : vHeroTier < 1.5 ? vec3(1.0, 0.20, 0.85)
                     : vHeroTier < 2.5 ? vec3(0.15, 0.45, 1.0)
                     :                   vec3(1.0, 0.55, 0.05);
             diffuseColor.rgb = mix(diffuseColor.rgb, qc, 0.65);
           }
           // Trunk-base ground blend — the lowest ~uTrunkBlendTop metres of
           // the trunk take on the ground colour beneath the tree (sampled
           // per-Look at the tree's world-XZ). Marries the tree into the
           // ground. Bark-gated; off when no colormap (Salon).
           if (uHasGroundColor > 0.5) {
             float baseF = smoothstep(uTrunkBlendTop, 0.0, vLocalY) * uTrunkBlend * vBark;
             if (baseF > 0.001) {
               vec2 gcUV = (vWorldXZ.xz - uGroundColorMin) / uGroundColorSpan;
               if (all(greaterThanEqual(gcUV, vec2(0.0))) && all(lessThanEqual(gcUV, vec2(1.0)))) {
                 vec3 gcol = texture2D(uGroundColorMap, gcUV).rgb;
                 // Combined EFFECTIVE ground colour — apply the same baked contact
                 // shadow (G) + lamp pool (R) the ground shader does (grassMaterial),
                 // so the trunk base sits in its own shadow ring instead of reading
                 // as bright raw albedo.
                 vec2 fxUV = (vWorldXZ.xz - uGroundFxMin) / uGroundFxSpan;
                 if (all(greaterThanEqual(fxUV, vec2(0.0))) && all(lessThanEqual(fxUV, vec2(1.0)))) {
                   vec4 gfx = texture2D(uGroundFxMap, fxUV);
                   gcol *= (1.0 - gfx.g * uTrunkShadowStr);
                   gcol += uTrunkPoolColor * gfx.r * uGroundFxScale * uTrunkPool;
                 }
                 diffuseColor.rgb = mix(diffuseColor.rgb, gcol, baseF);
               }
             }
           }
         }`
      )
      .replace(
        // Roughness override slot: clamp roughnessFactor on bark fragments
        // when the per-species override is >= 0. Leaf fragments untouched.
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         {
           float regionRough = mix(uBarkBranchRoughness, uBarkTrunkRoughness, vBarkRegion);
           float effRough = mix(uBarkRoughnessOverride, regionRough, uBarkRegionSplit);
           if (effRough >= 0.0) {
             roughnessFactor = mix(roughnessFactor, effRough, vBark);
           }
         }`
      )
      .replace(
        // Slot the warm contribution into the standard emissive accumulator
        // so tone-mapping + Bloom see it correctly. Same warm amber tint
        // grassMaterial uses (vec3(0.55, 0.40, 0.20)) for visual continuity.
        // vCanopyW gates contribution to upper foliage only.
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         totalEmissiveRadiance += vec3(0.55, 0.40, 0.20) * vLampGlow * uLampGlow * vCanopyW;`
      )
      .replace(
        // Sanitize the final lit color before it becomes gl_FragColor — kills the
        // non-finite/huge/negative foliage texel that the shared pyramid spreads
        // into dark blocks. outgoingLight is a plain vec3 here (set just above by
        // the lighting chunks); clamping it is safe in any GLSL version. NaN via
        // ternary select (NaN != NaN), never mix() (NaN*0==NaN).
        '#include <opaque_fragment>',
        `// ⭐ LEAF TRANSMISSION — light coming THROUGH the leaf, not off it.
         // Sits after the lighting chunks, where outgoingLight is a plain vec3
         // and diffuseColor still holds this fragment's own sampled albedo.
         //
         // ⛔ GATED ON vBark, so bark is untouched. The gate ALREADY EXISTED —
         // aBark is interpolated to vBark for the bark retint — so this needs no
         // new attribute and no re-bake: the GLBs stay byte-identical.
         //
         // ⭐ EVERY DIRECTIONAL LIGHT, NOT JUST THE SUN. The moon is its own
         // directional light on a TOD channel (scene.json#dirMoon, night x2), so
         // looping means a moonlit canopy transmits too — which is the reason
         // this was asked for on a single tree at night in the first place.
         //
         // tBack = how nearly the light comes from BEHIND this fragment toward
         // the eye. Tinted by diffuseColor so a lit leaf glows its OWN colour
         // rather than washing out to the light's.
         #if NUM_DIR_LIGHTS > 0
         if (uLeafTransmission > 0.0 && vBark < 0.5) {
           vec3 tView = normalize(vViewPosition);
           float tK = max(uLeafTransmissionSharpness, 0.001);
           for (int tI = 0; tI < NUM_DIR_LIGHTS; tI++) {
             vec3 tL = normalize(directionalLights[tI].direction);
             float tBack = pow(clamp(dot(-tL, tView), 0.0, 1.0), tK);
             outgoingLight += diffuseColor.rgb * directionalLights[tI].color
                            * tBack * uLeafTransmission;
           }
         }
         #endif
         if (uTreeSanitizeOn > 0.5) {
           outgoingLight = vec3(
             (outgoingLight.r != outgoingLight.r) ? 0.0 : clamp(outgoingLight.r, 0.0, 1000.0),
             (outgoingLight.g != outgoingLight.g) ? 0.0 : clamp(outgoingLight.g, 0.0, 1000.0),
             (outgoingLight.b != outgoingLight.b) ? 0.0 : clamp(outgoingLight.b, 0.0, 1000.0)
           );
         }
         #include <opaque_fragment>`
      )
  }
}

// ── Captured-impostor billboard material (Arc 2, Phase 1) ──────────────────
//
// The X cross-billboard (impostorGeometry.js#buildXImpostorGeometry) is textured
// with a render-to-texture CAPTURE of the real tree (captureImpostor.js), NOT
// the shared atlas — so it can't ride injectFoliageSway's bark-retint/atlas
// path. It gets its OWN slim MeshStandardMaterial with a captured texture as
// `map`, plus the SAME base-anchored sway (off the shared treeSwayUniforms — the
// whole forest moves as one weather system) and the SAME lamp-glow emissive as
// the mesh trees, so it rides full optical parity (tone-mapped + fogged → DoF /
// fog / bloom all apply). Flat-lit billboard: no per-leaf-tier damping, just a
// single horizontal sway growing with aTreeHeightNorm (base planted, canopy
// flutters), reusing the sway/lamp shader slices of injectFoliageSway.
export function injectImpostorBillboard(material) {
  material.onBeforeCompile = (shader) => {
    // Reuse the SHARED sway uniforms (same object the mesh trees mutate per
    // frame in SwayDriver) so impostor + mesh move as one weather system.
    shader.uniforms.uTime              = treeSwayUniforms.uTime
    shader.uniforms.uWindForce         = treeSwayUniforms.uWindForce
    shader.uniforms.uWindIntensity     = treeSwayUniforms.uWindIntensity
    shader.uniforms.uGustFrontVelocity = treeSwayUniforms.uGustFrontVelocity
    shader.uniforms.uGustsScale        = treeSwayUniforms.uGustsScale
    shader.uniforms.uGustEnvelope      = treeSwayUniforms.uGustEnvelope
    // Per-instance lamp glow (same per-Look TOD uniform + per-tree baked attr).
    shader.uniforms.uLampGlow          = _lampGlow.treesUniform
    // Hero-tier QC overlay (shared module uniform) so ?heroTierQC=1 tints the
    // captured-impostor billboards magenta too — the operator's eye-gate for the
    // mesh/impostor split must cover impostors (these ARE the impostor tier).
    shader.uniforms.uHeroTierQC        = treeHeroTierQC
    material.userData.shader = shader

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform vec3  uWindForce;
         uniform float uWindIntensity;
         uniform vec3  uGustFrontVelocity;
         uniform float uGustsScale;
         uniform float uGustEnvelope;
         attribute float aLampGlow;
         attribute float aTreeHeightNorm;
         varying float vLampGlow;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vLampGlow = aLampGlow;
         {
           // Per-instance phase + advection from the instance translation column
           // (same seam injectFoliageSway uses). Base-anchored horizontal sway
           // ∝ aTreeHeightNorm: trunk base planted, canopy top fluttering.
           #ifdef USE_INSTANCING
             vec3 instWorld = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
           #else
             vec3 instWorld = vec3(modelMatrix[3].x, 0.0, modelMatrix[3].z);
           #endif
           float phase = instWorld.x * 0.05 + instWorld.z * 0.07;
           float frontLenSq = dot(uGustFrontVelocity.xz, uGustFrontVelocity.xz);
           float phaseOffset = (frontLenSq > 1e-4)
             ? dot(instWorld.xz, uGustFrontVelocity.xz) / frontLenSq
             : 0.0;
           vec2 windDirXZ;
           if (uWindIntensity > 1e-3)      windDirXZ = uWindForce.xz / uWindIntensity;
           else if (frontLenSq > 1e-4)     windDirXZ = uGustFrontVelocity.xz / sqrt(frontLenSq);
           else                            windDirXZ = vec2(0.0);
           float wtGust  = uTime - phaseOffset;
           float spikePhase = wtGust * 1.5 + instWorld.x * 0.01 + instWorld.z * 0.007;
           float spikeRaw   = sin(spikePhase) * 0.6
                            + sin(spikePhase * 1.7 + 1.3) * 0.3
                            + sin(spikePhase * 0.31 + 0.7) * 0.1;
           float spikeShape = max(spikeRaw - 0.35, 0.0) * 2.2;
           float gustAmp    = uGustsScale * uGustEnvelope * spikeShape;
           float driftOsc   = sin(uTime * 1.6 + phase);
           float gustOsc    = sin(wtGust * 1.9 + phase * 1.7);
           float swayMps    = uWindIntensity * driftOsc + gustAmp * gustOsc;
           // The whole canopy is one billboard, so sway it as a unit (no per-
           // tier damping); aTreeHeightNorm keeps the base planted. 0.05 m / (m/s)
           // / m of height ≈ the mesh canopy's flutter at the leaf tier.
           float swayM = swayMps * 0.05 * aTreeHeightNorm;
           transformed.xz += windDirXZ * swayM;
           // Static lean toward the wind, also base-anchored.
           transformed.xz += windDirXZ * (uWindIntensity * 0.05 * aTreeHeightNorm * 0.3);
         }`
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uLampGlow;
         uniform float uHeroTierQC;
         varying float vLampGlow;`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         // Hero-tier QC overlay — impostors are tier 1 (magenta). Gated → no-op
         // when off (bit-identical capture render). Matches the mesh material's
         // QC tint so the operator's eye-gate reads the whole forest uniformly.
         if (uHeroTierQC > 0.5) {
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.20, 0.85), 0.65);
         }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         // Lamp glow — same warm amber the mesh canopy emits (no vCanopyW gate:
         // the whole billboard IS canopy), so impostor trees under a lamp warm
         // up consistently with their mesh neighbours.
         totalEmissiveRadiance += vec3(0.55, 0.40, 0.20) * vLampGlow * uLampGlow;`
      )
  }
}

// ── Coverage-preserving mipmaps (Castano/NVIDIA alpha-to-coverage) ──────────
// The leaf atlas is alpha-tested at a FIXED cutoff (0.5). GPU auto-mipmaps
// box-average the alpha channel, so as the camera backs away each leaf card's
// coverage-at-cutoff shrinks and the canopy erodes to specks — "far leaves
// useless" (2026-07-07). A single global alphaTest can't fix it: lower it and
// dense-leaf species halo up close; raise it and sparse species vanish far
// away (the "not all trees got it" result). So we build the mip chain on the
// CPU and rescale each level's alpha so its coverage-at-cutoff MATCHES mip 0 —
// per-texel, independent of each tile's alpha density. Bark tiles (alpha 1)
// and empty atlas gutters (alpha 0) are invariant under the scale; only the
// intermediate leaf-edge alpha is corrected. Texture-DATA only — no shader /
// program change (honors Bloom's single-program constraint), one-time CPU cost
// at atlas load, zero per-frame cost.
function alphaCoverage(data, threshold) {
  let covered = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] >= threshold) covered++
  return covered / (data.length / 4)
}

// Rescale `data`'s alpha in place so coverage-at-`threshold` matches
// `targetCoverage`. Uses an alpha histogram + suffix sums so each candidate
// scale is evaluated in O(1), not O(texels).
function scaleAlphaToCoverage(data, threshold, targetCoverage) {
  const n = data.length / 4
  const hist = new Float64Array(256)
  for (let i = 3; i < data.length; i += 4) hist[data[i]]++
  const atLeast = new Float64Array(258)   // atLeast[a] = # texels with alpha >= a
  for (let a = 255; a >= 0; a--) atLeast[a] = atLeast[a + 1] + hist[a]
  const coverageForScale = (s) => {
    // alpha*s >= threshold  ⇔  alpha >= ceil(threshold / s)
    let cut = Math.ceil(threshold / s)
    if (cut < 0) cut = 0
    if (cut > 256) return 0
    return atLeast[cut] / n
  }
  let lo = 0, hi = 64, s = 1
  for (let it = 0; it < 24; it++) {
    s = (lo + hi) / 2
    if (coverageForScale(s) < targetCoverage) lo = s; else hi = s
  }
  if (Math.abs(s - 1) < 1e-3) return
  for (let i = 3; i < data.length; i += 4) {
    const v = data[i] * s
    data[i] = v > 255 ? 255 : v
  }
}

// 2×2 box downsample. RGB is ALPHA-WEIGHTED (premultiplied): transparent gutter
// texels around a leaf contribute ZERO colour, so foliage keeps its saturated
// green at coarse mips instead of washing to the neutral gutter grey as the
// camera backs away ("leaves are there but grey, fade to green on pan-in",
// 2026-07-07 — the actual far-tree defect; straight RGB averaging, GPU auto-mips
// included, bled the gutter into the leaves). Alpha stays a straight box average
// (coverage-corrected afterwards). Bark tiles are α=255 → weighting is a no-op.
function boxDownsampleRGBA(src, sw, sh) {
  const dw = Math.max(1, sw >> 1), dh = Math.max(1, sh >> 1)
  const dst = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const y0 = y * 2, y1 = Math.min(y0 + 1, sh - 1)
    for (let x = 0; x < dw; x++) {
      const x0 = x * 2, x1 = Math.min(x0 + 1, sw - 1)
      const i00 = (y0 * sw + x0) << 2, i10 = (y0 * sw + x1) << 2
      const i01 = (y1 * sw + x0) << 2, i11 = (y1 * sw + x1) << 2
      const a00 = src[i00 + 3], a10 = src[i10 + 3], a01 = src[i01 + 3], a11 = src[i11 + 3]
      const aSum = a00 + a10 + a01 + a11
      const o = (y * dw + x) << 2
      if (aSum > 0) {
        dst[o]     = (src[i00] * a00 + src[i10] * a10 + src[i01] * a01 + src[i11] * a11) / aSum
        dst[o + 1] = (src[i00 + 1] * a00 + src[i10 + 1] * a10 + src[i01 + 1] * a01 + src[i11 + 1] * a11) / aSum
        dst[o + 2] = (src[i00 + 2] * a00 + src[i10 + 2] * a10 + src[i01 + 2] * a01 + src[i11 + 2] * a11) / aSum
      } else {
        dst[o] = dst[o + 1] = dst[o + 2] = 0
      }
      dst[o + 3] = (aSum + 2) >> 2
    }
  }
  return { data: dst, width: dw, height: dh }
}

// Full chain, base → 1×1 (LinearMipmapLinear + texStorage2D require a complete
// pyramid; three's getMipLevels uses mipmaps.length). GL floor/clamp mip dims
// are matched by the >>1 / max(1,…) downsample.
// STOP the chain before tiles collapse to the desaturated atlas mean. Below
// ~this size a leaf tile is a few texels and box-averages together with its
// OPAQUE neighbour tiles (bark / other leaves) — no gutter, so alpha-weighting
// can't save it — converging every leaf to a grey ~(130,130,120). Measured on
// the LS atlas: saturation holds ≥0.86 through the 113px level (m5) then crashes
// to 0.26 at 56px (m6). Capping here makes GL clamp far minification to the last
// green level (slightly aliased, but green — not grey). Cap on the FINE-side dim
// so it's atlas-size agnostic (LS 3640² and HiPointe 4091² both stop at m5).
const MIN_MIP_DIM = 96

// DIAGNOSTIC (?mipTint=1): paint the coarse/far mip levels magenta so it's
// visually unmistakable whether these custom mips are sampled at distance at
// all (breaks the "is the fix even live?" ambiguity without reading the noisy
// console). Distant trees magenta → live. Distant trees still grey → the custom
// mip chain is NOT in use (silent fallback / stale bundle) and THAT is the bug.
const MIP_TINT = typeof window !== 'undefined' && /[?&]mipTint=1\b/.test(window.location.search)

function buildCoveragePreservingMipmaps(image, alphaTest) {
  const threshold = Math.round(alphaTest * 255)
  const w0 = image.width, h0 = image.height
  const canvas = document.createElement('canvas')
  canvas.width = w0; canvas.height = h0
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0)
  const base = ctx.getImageData(0, 0, w0, h0)   // sRGB bytes, straight alpha
  const refCoverage = alphaCoverage(base.data, threshold)

  const mipmaps = [base]
  let src = base.data, sw = w0, sh = h0
  while ((sw > 1 || sh > 1) && Math.max(sw >> 1, sh >> 1) >= MIN_MIP_DIM) {
    const { data, width, height } = boxDownsampleRGBA(src, sw, sh)
    if (refCoverage > 0 && refCoverage < 1) scaleAlphaToCoverage(data, threshold, refCoverage)
    mipmaps.push(new ImageData(data, width, height))
    src = data; sw = width; sh = height
  }
  const last = mipmaps[mipmaps.length - 1]
  console.log(`[treeAtlas] coverage mips ✓ ${mipmaps.length} levels (alpha-weighted colour, capped), ${w0}×${h0} → ${last.width}×${last.height}`)
  return mipmaps
}

function loadTexture(url, { coveragePreserving = false, alphaTest = 0.5 } = {}) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.flipY = false  // GLTF convention — matches the rewritten UVs
        tex.anisotropy = 4
        // Coverage-preserving CPU mip chain for the alpha-tested leaf atlas so
        // the far canopy keeps its silhouette instead of eroding to specks.
        if (coveragePreserving) {
          try {
            tex.mipmaps = buildCoveragePreservingMipmaps(tex.image, alphaTest)
            tex.generateMipmaps = false
            tex.minFilter = THREE.LinearMipmapLinearFilter
            tex.magFilter = THREE.LinearFilter
            tex.needsUpdate = true
          } catch (e) {
            console.warn('[treeAtlas] coverage-preserving mipmaps failed; using auto mipmaps', e)
          }
        }
        resolve(tex)
      },
      undefined,
      reject
    )
  })
}

function loadNormalTexture(url) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (tex) => {
        // Normal maps stay in linear space
        tex.colorSpace = THREE.NoColorSpace
        tex.flipY = false
        tex.anisotropy = 4
        resolve(tex)
      },
      undefined,
      reject
    )
  })
}

async function buildMaterials(lookName) {
  const manifestUrl = `${import.meta.env.BASE_URL}baked/${lookName}/trees-atlas.json?t=${Date.now()}`
  const designUrl = `${import.meta.env.BASE_URL}looks/${lookName}/design.json?t=${Date.now()}`
  const [manifestRes, designRes] = await Promise.all([
    fetch(manifestUrl),
    fetch(designUrl),
  ])
  if (!manifestRes.ok) throw new Error(`atlas manifest ${manifestUrl} → ${manifestRes.status}`)
  if (!designRes.ok) throw new Error(`design ${designUrl} → ${designRes.status}`)
  const manifest = await manifestRes.json()
  const design = await designRes.json()
  const roster = new Set()
  for (const t of (design.trees || [])) {
    roster.add(`${t.species}:${t.variantId}`)
  }

  const { atlas, materialDefaults } = manifest
  if (!atlas) throw new Error(`atlas missing in manifest for ${lookName}`)
  const roughness = materialDefaults?.roughness ?? 0.85
  const metalness = materialDefaults?.metalness ?? 0

  // The manifest stores absolute `/baked/...` paths (the bake is base-unaware).
  // Route them through Vite's BASE_URL so the PNGs resolve under a deploy
  // subpath (e.g. staging's /lafayette-square-staging/) — otherwise they 404,
  // the atlas load rejects, and InstancedTrees gates ALL trees off. Mirrors the
  // base-join pattern used for every other baked asset. (treeAtlasMaterial bug
  // 2026-06-17: the lone runtime fetch that bypassed BASE_URL.)
  const base = import.meta.env.BASE_URL
  const withBase = (p) => `${base}${String(p).replace(/^\//, '')}`
  const [color, normal] = await Promise.all([
    loadTexture(withBase(atlas.colorPath), { coveragePreserving: true, alphaTest: atlas.alphaTest ?? 0.5 }),
    loadNormalTexture(withBase(atlas.normalPath)),
  ])

  // Single shared material for every tree primitive — bark and leaf tiles
  // both live in this atlas. One material → one shader program, which is
  // the constraint Bloom requires for trees in this scene. alphaTest+
  // alphaToCoverage gives crisp leaf edges without per-frame jitter under
  // Bloom; bark fragments are alpha=1 and pass the cutoff trivially.
  const treeMaterial = new THREE.MeshStandardMaterial({
    map: color,
    normalMap: normal,
    roughness,
    metalness,
    side: atlas.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    transparent: false,
    alphaTest: atlas.alphaTest ?? 0.5,
  })
  treeMaterial.name = `tree-atlas:${lookName}`
  injectFoliageSway(treeMaterial)
  // Each tree is an instance; lift every instance to its own ground sample
  // via the shared uExag uniform. Chains AFTER sway so the foliage
  // begin_vertex modifications still run; terrain adds y += sample*uExag
  // on top of the per-instance translation, sway leaves the canopy alone.
  patchTerrainInstancedBaked(treeMaterial)

  // Phase B (2026-06-25) — sibling OPAQUE canopy material for the opaque-
  // articulated middle tier. SAME atlas color+normal, SAME injectFoliageSway +
  // terrain chunks (so sway/bark/QC/terrain uniforms all apply identically and
  // it stays in the one shader-program FAMILY — same chunk structure → Bloom-
  // stable), but alphaTest OFF + transparent:false → genuinely opaque: it writes
  // depth and gets early-Z, so the opaque canopy SHELL has ~zero overdraw. That
  // is the whole perf point of the tier (alpha-tested leaf cards defeat early-Z;
  // an opaque hull shades each pixel once). Tradeoff documented: this is a 2nd
  // compiled program (the alphaTest #define differs from the shared material's),
  // but its shader SOURCE is byte-identical to treeMaterial's — same family, no
  // new variance path Bloom can choke on. Doubled-sided OFF so back faces are
  // culled (an opaque convex hull only needs front faces → fewer fragments).
  const opaqueCanopyMaterial = new THREE.MeshStandardMaterial({
    map: color,
    normalMap: normal,
    roughness,
    metalness,
    side: THREE.FrontSide,
    transparent: false,
    alphaTest: 0,          // OFF → opaque → early-Z → zero overdraw (the tier's point)
  })
  opaqueCanopyMaterial.name = `tree-atlas:${lookName}:opaque`
  injectFoliageSway(opaqueCanopyMaterial)
  patchTerrainInstancedBaked(opaqueCanopyMaterial)

  return { manifest, treeMaterial, opaqueCanopyMaterial, roster }
}

/**
 * Resolve atlas materials for a Look. Returns:
 *   { status: 'idle' | 'loading' | 'ready' | 'error',
 *     barkMaterial, leavesMaterial, manifest, error }
 *
 * If lookName is falsy, returns idle.
 * Caches per lookName at module scope.
 */
export function useTreeAtlas(lookName) {
  const [bump, setBump] = useState(0)

  const entry = lookName ? _cache.get(lookName) : null

  // Subscribe to shared completion notifications: ANY status change (from any
  // instance's load, or invalidateTreeAtlas) re-renders this consumer. This is
  // what makes the trees reliably appear when the async build finishes —
  // independent of which instance owns the in-flight promise (see _atlasListeners).
  useEffect(() => {
    const listener = () => setBump((b) => b + 1)
    _atlasListeners.add(listener)
    return () => { _atlasListeners.delete(listener) }
  }, [])

  useEffect(() => {
    if (!lookName) return
    const cached = _cache.get(lookName)
    if (cached?.status === 'ready' || cached?.status === 'loading') return
    _cache.set(lookName, { status: 'loading' })
    _notifyAtlasChange()
    buildMaterials(lookName)
      .then((built) => {
        _cache.set(lookName, { status: 'ready', ...built })
        _notifyAtlasChange()
      })
      .catch((err) => {
        console.warn('[treeAtlas] bake failed for', lookName, err)
        _cache.set(lookName, { status: 'error', error: err })
        _notifyAtlasChange()
      })
  }, [lookName])

  return useMemo(() => {
    if (!lookName) return { status: 'idle' }
    const e = _cache.get(lookName) || { status: 'idle' }
    return e
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookName, bump, entry?.status])
}

/**
 * Force a refresh — call after the Grove rebakes the atlas (e.g. after a
 * roster change). Drops cache for that Look and triggers reload.
 */
export function invalidateTreeAtlas(lookName) {
  if (!lookName) return
  _cache.delete(lookName)
  // Wake live consumers so they re-run their load effect against the now-empty
  // cache (re-bake after a Grove republish), instead of waiting for a stray
  // re-render.
  _notifyAtlasChange()
}

// ── Brief 7 (Cambium): Salon-preview material path ──────────────────────
//
// The workstage preview mounts the SAME material the LS runtime mounts. The
// only differences are: (a) the atlas is a per-composition preview atlas
// (one bark + one leaf + optional gradient LUT + optional detail), and
// (b) preview isn't on terrain, so patchTerrainInstanced is skipped. Every
// shader-side feature — bark gradient luminance REPLACE, detail Overlay
// composite, region split, lamp glow, sway — runs through the SAME
// injectFoliageSway path. Birch's interim chunk-replication in
// SpecimenViewport is retired by this hook.
//
// Cache keyed by manifestUrl (which carries `?v=<ts>` from the workstage
// so a new build naturally invalidates). Each cache entry owns its own
// MeshStandardMaterial + two textures (atlas color + normal). On URL bump
// for the same (species, slot) — the operator authoring loop — the old
// entry is disposed and dropped, so material/texture allocation doesn't
// grow unbounded across an authoring session. Without this, every keystroke
// leaks a material + two ~3 MB PNGs; the workstage's WebGL context dies
// after ~10 edits of a slider.
const _previewCache = new Map()
const MAX_PREVIEW_CACHE = 4

function disposePreviewEntry(entry) {
  if (!entry || entry.status !== 'ready') return
  try { entry.treeMaterial?.map?.dispose() } catch {}
  try { entry.treeMaterial?.normalMap?.dispose() } catch {}
  try { entry.treeMaterial?.dispose() } catch {}
}

function evictOldPreviewEntries() {
  if (_previewCache.size <= MAX_PREVIEW_CACHE) return
  // Map iteration is insertion-order — oldest first. Drop the oldest
  // entries (with disposal) until size <= MAX_PREVIEW_CACHE.
  const keys = [..._previewCache.keys()]
  for (let i = 0; i < keys.length - MAX_PREVIEW_CACHE; i++) {
    const k = keys[i]
    disposePreviewEntry(_previewCache.get(k))
    _previewCache.delete(k)
  }
}

async function buildPreviewMaterials(manifestUrl) {
  const manifestRes = await fetch(manifestUrl)
  if (!manifestRes.ok) throw new Error(`preview manifest ${manifestUrl} → ${manifestRes.status}`)
  const manifest = await manifestRes.json()
  const { atlas, materialDefaults } = manifest
  if (!atlas) throw new Error(`atlas missing in preview manifest`)
  const roughness = materialDefaults?.roughness ?? 0.85
  const metalness = materialDefaults?.metalness ?? 0

  // Inherit the manifest's cache-bust into the texture URLs so the new
  // atlas bytes are picked up by TextureLoader (otherwise a same-named
  // PNG fetched earlier would serve from the browser cache).
  const cacheBust = manifestUrl.includes('?') ? manifestUrl.slice(manifestUrl.indexOf('?')) : ''
  const [color, normal] = await Promise.all([
    loadTexture(atlas.colorPath + cacheBust, { coveragePreserving: true, alphaTest: atlas.alphaTest ?? 0.5 }),
    loadNormalTexture(atlas.normalPath + cacheBust),
  ])

  const treeMaterial = new THREE.MeshStandardMaterial({
    map: color,
    normalMap: normal,
    roughness,
    metalness,
    side: atlas.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    transparent: false,
    alphaTest: atlas.alphaTest ?? 0.5,
  })
  treeMaterial.name = `tree-atlas:salon-preview`
  injectFoliageSway(treeMaterial)
  // NB: NO patchTerrainInstanced — workstage preview is a flat-ground
  // single-tree composition; LS-runtime terrain lift isn't applicable.
  return { manifest, treeMaterial }
}

/**
 * Salon-preview variant of useTreeAtlas. Returns the same shape:
 *   { status, manifest, treeMaterial, error }
 * Cache-keyed by manifestUrl; the workstage cache-busts on each successful
 * preview-atlas build so a new URL drives a fresh build automatically.
 */
export function useSalonPreviewAtlas(manifestUrl) {
  const [bump, setBump] = useState(0)
  const entry = manifestUrl ? _previewCache.get(manifestUrl) : null
  useEffect(() => {
    if (!manifestUrl) return
    let cached = _previewCache.get(manifestUrl)
    if (cached?.status === 'ready' || cached?.status === 'loading') return
    cached = { status: 'loading' }
    _previewCache.set(manifestUrl, cached)
    setBump(b => b + 1)
    buildPreviewMaterials(manifestUrl)
      .then((built) => {
        _previewCache.set(manifestUrl, { status: 'ready', ...built })
        evictOldPreviewEntries()
        setBump(b => b + 1)
      })
      .catch((err) => {
        console.warn('[salonPreviewAtlas] failed for', manifestUrl, err)
        _previewCache.set(manifestUrl, { status: 'error', error: err })
        setBump(b => b + 1)
      })
  }, [manifestUrl])
  return useMemo(() => {
    if (!manifestUrl) return { status: 'idle' }
    return _previewCache.get(manifestUrl) || { status: 'idle' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestUrl, bump, entry?.status])
}

// Brief 9a (Sough) — per-vertex wind TIER. Kept as the leaf/wood flag and as
// the legacy bucket axis (see `treeWindTiering`): the continuous ramp reads
// aTreeHeightNorm x aWindRadialNorm, and uses this only to know which vertices
// are leaf cards so they can ride their branch and flutter on top of it.
//
// ⛔ ONE definition, called by BOTH the LS runtime (InstancedTrees#meshes) and
// the Salon preview / diorama (stampTreeVertexAttrs). It was duplicated in the
// two files until 2026-08-24 and the copies had to be kept in step by hand.
export function stampWindTier(geometry, isBark) {
  if (!geometry?.attributes?.position) return
  if (geometry.attributes.aWindTier) return
  const p = geometry.attributes.position
  const arr = new Float32Array(p.count)
  if (!isBark) {
    arr.fill(3)  // leaf cards
  } else {
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const r = Math.sqrt(x * x + z * z)
      arr[i] = (r > 0.15 && y < 3.0) ? 0 : (r > 0.06 ? 1 : 2)
    }
  }
  geometry.setAttribute('aWindTier', new THREE.BufferAttribute(arr, 1))
}

// Chassis-wide max radial distance from the tree's local Y-axis, in metres.
// Shared by the LS runtime and the Salon preview so bark and leaf primitives
// normalize against the SAME canopy radius — they have different extents, and
// normalizing each on its own would put a leaf tip and the branch tip it hangs
// on at different points on the whip ramp, which is the very independence we
// are removing. Base sits at X=Z=0 thanks to the clean chassis-bake frame.
export function measureChassisRadius(geometries) {
  let r2Max = 0
  for (const g of geometries) {
    const p = g?.attributes?.position
    if (!p) continue
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i)
      const r2 = x * x + z * z
      if (r2 > r2Max) r2Max = r2
    }
  }
  return Math.max(1e-4, Math.sqrt(r2Max))
}

// Per-vertex radial distance from the trunk axis, normalized to the chassis
// radius. The second axis of the continuous wind ramp (see `treeWindTiering`);
// aTreeHeightNorm is the first. Falls back to this geometry's own extent when
// no chassis-wide radius is supplied, matching aTreeHeightNorm's contract.
export function stampWindRadialNorm(geometry, chassisRadius) {
  if (!geometry?.attributes?.position) return
  if (geometry.attributes.aWindRadialNorm) return
  const p = geometry.attributes.position
  const rMax = (typeof chassisRadius === 'number' && chassisRadius > 0)
    ? chassisRadius
    : measureChassisRadius([geometry])
  const arr = new Float32Array(p.count)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i)
    const t = Math.sqrt(x * x + z * z) / rMax
    arr[i] = t < 0 ? 0 : t > 1 ? 1 : t
  }
  geometry.setAttribute('aWindRadialNorm', new THREE.BufferAttribute(arr, 1))
}

// Per-vertex attribute stamper shared between the LS runtime
// (InstancedTrees#meshes) and the Salon preview (SpecimenViewport#Skeleton).
// Reads atlasKind / barkRegion from prim extras (geometry.userData populated
// by three.js's GLTFLoader from gltf-transform's prim.extras) and stamps
// constant arrays of length === position.count. Keeps both consumers using
// the exact same aBark/aBarkRegion contract the shader expects.
export function stampTreeVertexAttrs(geometry, fallback = {}, owner = null) {
  if (!geometry?.attributes?.position) return
  const pos = geometry.attributes.position
  // GLTFLoader puts primitive-level extras in different places depending on
  // version / extension. Match InstancedTrees#meshes' three-location lookup
  // exactly so the LS runtime and Salon preview see the same atlasKind for
  // the same on-disk GLB.
  const atlasKind  = geometry.userData?.atlasKind
                  ?? owner?.userData?.atlasKind
                  ?? owner?.userData?.gltfExtras?.atlasKind
                  ?? fallback.atlasKind
  const barkRegion = geometry.userData?.barkRegion
                  ?? owner?.userData?.barkRegion
                  ?? owner?.userData?.gltfExtras?.barkRegion
                  ?? fallback.barkRegion
  if (!geometry.attributes.aBark) {
    const arr = new Float32Array(pos.count)
    if (atlasKind === 'bark') arr.fill(1)
    geometry.setAttribute('aBark', new THREE.BufferAttribute(arr, 1))
  }
  if (!geometry.attributes.aBarkRegion) {
    const arr = new Float32Array(pos.count)
    if (barkRegion === 'trunk') arr.fill(1)
    geometry.setAttribute('aBarkRegion', new THREE.BufferAttribute(arr, 1))
  }
  if (!geometry.attributes.aLampGlow) {
    // Preview = no lamp contribution. LS runtime overwrites with the per-
    // instance baked attribute via InstancedBufferAttribute.
    const arr = new Float32Array(pos.count)
    geometry.setAttribute('aLampGlow', new THREE.BufferAttribute(arr, 1))
  }
  // Phase A (Azimuth) — hero-tier QC attribute. Preview has no hero classification
  // (single specimen); default 0 (= mesh) keeps the shader's aHeroTier valid. The
  // LS runtime overwrites this with the per-instance baked tier (InstancedTrees).
  if (!geometry.attributes.aHeroTier) {
    geometry.setAttribute('aHeroTier', new THREE.BufferAttribute(new Float32Array(pos.count), 1))
  }
  stampWindTier(geometry, atlasKind === 'bark')
  // Brief 3A (Cant) — normalized trunk-base→top height [0,1], drives the
  // per-instance deformer's lean/twist angle ramp. The chassis-wide (minY,
  // yRange) is passed in via fallback so the Salon preview shares the exact
  // normalization the LS runtime computes in InstancedTrees#meshes; if absent
  // (no scan), fall back to this geometry's own Y extent. Base sits at Y≈0
  // (Brief 20 recenter) so minY≈0 in practice, but normalizing base→top works
  // for any frame.
  if (!geometry.attributes.aTreeHeightNorm) {
    const arr = new Float32Array(pos.count)
    let minY = fallback.chassisMinY
    let yRange = fallback.chassisYRange
    if (typeof minY !== 'number' || typeof yRange !== 'number' || !(yRange > 0)) {
      let lo = Infinity, hi = -Infinity
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        if (y < lo) lo = y
        if (y > hi) hi = y
      }
      minY = Number.isFinite(lo) ? lo : 0
      yRange = Math.max(1e-4, hi - lo)
    }
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - minY) / yRange
      arr[i] = t < 0 ? 0 : t > 1 ? 1 : t
    }
    geometry.setAttribute('aTreeHeightNorm', new THREE.BufferAttribute(arr, 1))
  }
  // The whip ramp's radial axis. `fallback.chassisRadius` carries the
  // chassis-wide value the same way chassisMinY/chassisYRange do.
  stampWindRadialNorm(geometry, fallback.chassisRadius)
}

// Brief 3A (Cant) — per-draw deformer ranges. Sibling of applyBarkUniforms
// (NOT a widened arity) so bark and deformer stay separable and the preview
// re-roll seed is deformer-only. Same per-draw mutation pattern: the shared
// material carries the prior species' range until we overwrite it right
// before the draw. Absent/empty range → (0,0) → identity (AC #5). lean/twist
// are radians, wander metres; seed perturbs the hash anchor (0 in LS).
export function applyDeformerUniforms(material, deformerRange, seed = null) {
  const shader = material?.userData?.shader
  if (!shader) return
  const r = deformerRange || {}
  const set2 = (uniform, pair) => {
    if (!uniform) return
    if (Array.isArray(pair) && pair.length >= 2) uniform.value.set(pair[0], pair[1])
    else uniform.value.set(0, 0)
  }
  set2(shader.uniforms.uDeformLeanRange,   r.lean)
  set2(shader.uniforms.uDeformTwistRange,  r.twist)
  set2(shader.uniforms.uDeformWanderRange, r.wander)
  if (shader.uniforms.uDeformSeed) {
    if (Array.isArray(seed) && seed.length >= 2) shader.uniforms.uDeformSeed.value.set(seed[0], seed[1])
    else shader.uniforms.uDeformSeed.value.set(0, 0)
  }
}

// Overhead "hula" impostor — per-draw knob binding (HANDOFF-overhead-hula-impostor.md).
// Sibling of applyDeformerUniforms: the overhead disc preview (and, later, the LS
// impostor-tier draw) sets uRuffleDepth/uHulaAmount right before its draw. Gated
// per-vertex by aOverhead, so setting these never touches a mesh tree that shares
// the material. Absent/nullish → 0 → identity (the discs sit flat + still).
export function applyOverheadDeformerUniforms(material, overhead) {
  const shader = material?.userData?.shader
  if (!shader) return
  const o = overhead || {}
  const num = (v, d) => (Number.isFinite(v) ? v : d)
  if (shader.uniforms.uRuffleDepth) shader.uniforms.uRuffleDepth.value = num(o.ruffleDepth, 0)
  if (shader.uniforms.uHulaAmount)  shader.uniforms.uHulaAmount.value  = num(o.hulaAmount, 0)
}

// injectOverheadWiggle — the FLAT-shader deformer for the overhead impostor's
// procedural parts (branch skeleton, umbrella shells): the SAME base-anchored
// hula wiggle + shared wind + vertical ruffle as injectFoliageSway's overhead
// block, but with NO atlas/bark fragment machinery — a plain MeshStandard
// fragment (flat-shaded, solid color, no map). Reuses the shared treeSwayUniforms
// (one weather system) and the same uRuffleDepth/uHulaAmount the knobs drive via
// applyOverheadDeformerUniforms. Gated per-vertex by aOverhead. Cheap: opaque,
// flat, writes depth (early-Z) — the branch structure you see from directly above.
// Shared overhead-wind vertex GLSL (used by both the procedural relic wiggle and
// the stamp material). fBm turbulence + hula + flutter; wind-only, no floor.
const OVERHEAD_WIND_COMMON = `
         uniform float uTime;
         uniform vec3  uWindForce;
         uniform float uWindIntensity;
         uniform float uGustsScale;
         uniform float uGustEnvelope;
         attribute float aOverhead;
         attribute float aTreeHeightNorm;
         attribute float aLeafBody;   // 0 at the glued stem → 1 at the blade tip
         attribute float aLeafPhase;  // per-leaf random flutter phase
         // Fractal (fBm) value-noise — real wind is turbulent, not a clean sine.
         float ovHash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
         float ovVNoise(vec2 p){
           vec2 i = floor(p), f = fract(p);
           float a = ovHash21(i), b = ovHash21(i + vec2(1.0, 0.0));
           float c = ovHash21(i + vec2(0.0, 1.0)), d = ovHash21(i + vec2(1.0, 1.0));
           vec2 u = f * f * (3.0 - 2.0 * f);
           return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
         }
         float ovFbm(vec2 p){
           float v = 0.0, a = 0.5;
           for (int o = 0; o < 3; o++) { v += a * ovVNoise(p); p *= 2.0; a *= 0.5; }
           return v;   // ~[0,1]
         }`
const OVERHEAD_WIND_BEGIN = `
         if (aOverhead > 0.5) {
           // MOTION = an always-on ambient FLOOR + the shared WEATHER on top,
           // base-anchored (aTreeHeightNorm). The floor keeps the plan-view canopy
           // alive in dead-calm (mirrors the mesh's rustle floor); weather ADDS, so a
           // breeze reads as more. ALIVE (not a flat rigid slide) = HULA + FLUTTER.
           // WORLD-XZ of this tree (instance translation at runtime, model at Salon)
           // seeds the turbulence + hula phase so 7,000 instanced trees DE-SYNC and
           // the weather ADVECTS across the neighbourhood — while the downwind LEAN
           // stays shared (all trees lean the same way = one moving front).
           #ifdef USE_INSTANCING
             vec2 ovWorldXZ = instanceMatrix[3].xz;
           #else
             vec2 ovWorldXZ = modelMatrix[3].xz;
           #endif
           vec2 wd = uWindIntensity > 1e-3 ? uWindForce.xz / uWindIntensity : vec2(0.0);
           float wI    = uWindIntensity;
           float gust  = uGustsScale * uGustEnvelope * ovFbm(vec2(uTime * 0.4) + wd * uTime * 0.2);
           float drift  = uTime * 0.25;
           vec2  hulaDir = vec2(cos(drift), sin(drift));
           float amp    = (0.12 + 0.035 * wI + 0.07 * gust) * aTreeHeightNorm;  // 0.12 = ambient breeze FLOOR (calm ≠ dead); weather ADDS on top
           float hulaPh = dot(ovWorldXZ, vec2(0.017, 0.011));   // per-tree phase de-sync
           vec2  hula   = hulaDir * (amp * sin(uTime * 0.9 - aTreeHeightNorm * 2.4 + hulaPh));
           vec2  lean   = wd * (amp * 0.7);
           // Flutter noise sampled at WORLD coords → advects downwind across the map.
           vec2  np      = (ovWorldXZ + position.xz) * 0.55 + wd * uTime * 1.2;
           float flutAmp = (0.05 + 0.05 * wI) * aTreeHeightNorm;  // ambient flutter floor + weather
           vec2  flutter = (vec2(ovFbm(np), ovFbm(np + 41.7)) - 0.5) * (2.0 * flutAmp);
           transformed.xz += hula + lean + flutter;
           if (aLeafBody > 0.001) {   // legacy per-leaf flutter (procedural relic)
             float ft  = uTime * 3.4 + aLeafPhase;
             float amp2 = (0.1 + wI * 0.06) * aLeafBody;
             transformed.y  += sin(ft) * amp2;
             transformed.xz += vec2(cos(ft * 0.9), sin(ft * 1.3)) * (amp2 * 0.55);
           }
         }`

function bindOverheadWindUniforms(shader) {
  shader.uniforms.uTime          = treeSwayUniforms.uTime
  shader.uniforms.uWindForce     = treeSwayUniforms.uWindForce
  shader.uniforms.uWindIntensity = treeSwayUniforms.uWindIntensity
  shader.uniforms.uGustsScale    = treeSwayUniforms.uGustsScale
  shader.uniforms.uGustEnvelope  = treeSwayUniforms.uGustEnvelope
}

export function injectOverheadWiggle(material) {
  material.onBeforeCompile = (shader) => {
    bindOverheadWindUniforms(shader)
    material.userData.shader = shader
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>' + OVERHEAD_WIND_COMMON)
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + OVERHEAD_WIND_BEGIN)
  }
}

// Runtime atmosphere for the overhead stamp — ONE shared light state (like
// treeSwayUniforms is one shared wind). The Salon preview drives it via a Light
// control; in LS it's fed from the TOD/meteorologist so the plan-view trees track
// the weather. uAmbient + uSun ≈ 1 keeps brightness; the ratio sets CONTRAST.
export const overheadLightUniforms = {
  uAmbient: { value: 0.5 },
  uSun:     { value: 0.5 },
}

// injectOverheadStamp — the RUNTIME-RELIT overhead stamp material (MeshBasic +
// map=ALBEDO). Vertex: the shared overhead wind. Fragment: albedo × (ambient +
// sun·AO), sampling the baked AO channel — so overcast light (high ambient / low
// sun) flattens the tree and strong sun deepens the occlusion (optical parity).
export function injectOverheadStamp(material, aoTex) {
  material.customProgramCacheKey = () => 'overheadStamp'   // distinct from heroImpostorStamp
  material.onBeforeCompile = (shader) => {
    bindOverheadWindUniforms(shader)
    shader.uniforms.uAO      = { value: aoTex }
    shader.uniforms.uAmbient = overheadLightUniforms.uAmbient
    shader.uniforms.uSun     = overheadLightUniforms.uSun
    material.userData.shader = shader
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>' + OVERHEAD_WIND_COMMON)
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + OVERHEAD_WIND_BEGIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
         uniform sampler2D uAO; uniform float uAmbient; uniform float uSun;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
         // RELIGHT — albedo × (ambient + sun·AO). Occlusion is light-independent
         //   (baked); the atmosphere sets the contrast → parity with the weather.
         float ovAO = texture2D(uAO, vMapUv).r;
         diffuseColor.rgb *= (uAmbient + uSun * ovAO);`)
  }
}

// ── HERO canopy-impostor material — billboard + shared wind + relight ──────────
// The runtime twin of injectOverheadStamp for the SIDE-ON hero card. Adds a Y-axis
// (cylindrical) BILLBOARD so the flat card always faces the camera — per-instance
// variety is which azimuth TEXTURE the card wears, NOT its orientation, so the card
// can freely turn to the viewer without a per-frame swap. The instance matrices are
// built TRANSLATION-ONLY (no rotY) so the shader owns orientation. Local card coords:
// x = canopy width, y = canopy height (world-up, kept vertical), z = shell depth
// (front shells pushed toward the camera → parallax). Then the shared overhead wind
// leans/gusts it (base-anchored) and the relight tracks the weather — same as the disc.
const HERO_BILLBOARD_BEGIN = `
         {
           #ifdef USE_INSTANCING
             vec3 heroPivot = instanceMatrix[3].xyz;
           #else
             vec3 heroPivot = modelMatrix[3].xyz;
           #endif
           vec3 heroToCam = cameraPosition - heroPivot;
           vec3 heroFwd = normalize(vec3(heroToCam.x, 0.0, heroToCam.z) + vec3(1e-4, 0.0, 0.0));
           vec3 heroRight = vec3(-heroFwd.z, 0.0, heroFwd.x);
           // Re-seat the card facing the camera: width→right, height→world-up, depth→toward-cam.
           transformed = heroRight * position.x + vec3(0.0, position.y, 0.0) + heroFwd * position.z;
         }`

export function injectHeroImpostorStamp(material, aoTex) {
  // Distinct program cache key — MeshBasic+map+onBeforeCompile collides with the
  // overhead-disc material otherwise, and three can serve one's compiled program to
  // the other (the billboard/relight silently not applying). [[feedback_unique_program_cache_key_before_wrappers]]
  material.customProgramCacheKey = () => 'heroImpostorStamp'
  material.onBeforeCompile = (shader) => {
    bindOverheadWindUniforms(shader)
    shader.uniforms.uAO      = { value: aoTex }
    shader.uniforms.uAmbient = overheadLightUniforms.uAmbient
    shader.uniforms.uSun     = overheadLightUniforms.uSun
    material.userData.shader = shader
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>' + OVERHEAD_WIND_COMMON)
      // Billboard FIRST (re-seat transformed facing the camera), THEN the shared wind
      // leans/gusts transformed.xz base-anchored on top.
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + HERO_BILLBOARD_BEGIN + OVERHEAD_WIND_BEGIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
         uniform sampler2D uAO; uniform float uAmbient; uniform float uSun;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
         // RELIGHT — albedo × (ambient + sun·AO), same as the overhead disc.
         float ovAO = texture2D(uAO, vMapUv).r;
         diffuseColor.rgb *= (uAmbient + uSun * ovAO);`)
  }
}

// Applies per-draw bark uniforms. Moved here from InstancedTrees.jsx by
// Brief 7 so the Salon preview path (SpecimenViewport) reuses the SAME
// per-draw uniform setup. Single implementation across LS runtime and
// workstage preview — drift-prevention is the structural reason this
// function lives here, next to its uniform contract.
export function applyBarkUniforms(material, barkSettings, gradientSlot, detailSlot, posterizedSlot) {
  const shader = material?.userData?.shader
  if (!shader) return
  // Gradient slot
  if (gradientSlot) {
    shader.uniforms.uUseBarkGradient.value = 1
    shader.uniforms.uBarkGradientTileOffset.value.set(gradientSlot.offsetU, gradientSlot.offsetV)
    shader.uniforms.uBarkGradientTileScale.value.set(gradientSlot.scaleU, gradientSlot.scaleV)
    shader.uniforms.uBarkGradientHashAmp.value = gradientSlot.hashAmp ?? 0
  } else {
    shader.uniforms.uUseBarkGradient.value = 0
    shader.uniforms.uBarkGradientHashAmp.value = 0
  }
  // Detail slot (also carries the species's primary bark tile bounds —
  // uBarkTileOffset/Scale — which the substrate swap reuses for local-UV
  // recovery; if posterized binds but detail doesn't, the bark tile bounds
  // still need to be set, see posterized-only branch below).
  if (detailSlot) {
    const d = detailSlot.uvTransform
    const b = detailSlot.barkTileUV
    shader.uniforms.uBarkDetailTileOffset.value.set(d.offsetU, d.offsetV)
    shader.uniforms.uBarkDetailTileScale.value.set(d.scaleU, d.scaleV)
    shader.uniforms.uBarkTileOffset.value.set(b.offsetU, b.offsetV)
    shader.uniforms.uBarkTileScale.value.set(b.scaleU, b.scaleV)
  } else {
    shader.uniforms.uBarkDetailTileScale.value.set(0, 0)
    shader.uniforms.uBarkTileScale.value.set(0, 0)
  }
  // Brief 10B (Vellum): posterized substrate slot. Shares the bark-tile-
  // bounds uniforms (uBarkTileOffset/Scale) with the detail composite for
  // local-UV recovery; when posterized binds but detail doesn't, lift those
  // bark bounds from posterizedSlot.barkTileUV so local-UV is correct.
  if (posterizedSlot) {
    const p = posterizedSlot.uvTransform
    shader.uniforms.uBarkPosterizedTileOffset.value.set(p.offsetU, p.offsetV)
    shader.uniforms.uBarkPosterizedTileScale.value.set(p.scaleU, p.scaleV)
    if (!detailSlot && posterizedSlot.barkTileUV) {
      const b = posterizedSlot.barkTileUV
      shader.uniforms.uBarkTileOffset.value.set(b.offsetU, b.offsetV)
      shader.uniforms.uBarkTileScale.value.set(b.scaleU, b.scaleV)
    }
  } else {
    shader.uniforms.uBarkPosterizedTileScale.value.set(0, 0)
  }
  // Bark settings (region split or legacy single-spec)
  if (!barkSettings) {
    shader.uniforms.uBarkTintBase.value.set(1, 1, 1)
    shader.uniforms.uBarkTintJitterRange.value = 0
    shader.uniforms.uBarkRoughnessOverride.value = -1
    shader.uniforms.uBarkRegionSplit.value = 0
    return
  }
  const isRegionSplit = !!(barkSettings.trunk || barkSettings.branch)
  if (isRegionSplit) {
    const trunk = barkSettings.trunk || barkSettings.branch
    const branch = barkSettings.branch || barkSettings.trunk
    shader.uniforms.uBarkTrunkTintBase.value.set(trunk.tintBase || '#ffffff')
    shader.uniforms.uBarkBranchTintBase.value.set(branch.tintBase || '#ffffff')
    shader.uniforms.uBarkTrunkJitterRange.value = trunk.tintJitterRange ?? 0
    shader.uniforms.uBarkBranchJitterRange.value = branch.tintJitterRange ?? 0
    shader.uniforms.uBarkTrunkRoughness.value = trunk.roughnessOverride ?? -1
    shader.uniforms.uBarkBranchRoughness.value = branch.roughnessOverride ?? -1
    shader.uniforms.uBarkRegionSplit.value = 1
    shader.uniforms.uBarkTintBase.value.set(1, 1, 1)
    shader.uniforms.uBarkTintJitterRange.value = 0
    shader.uniforms.uBarkRoughnessOverride.value = -1
    return
  }
  shader.uniforms.uBarkTintBase.value.set(barkSettings.tintBase || '#ffffff')
  shader.uniforms.uBarkTintJitterRange.value = barkSettings.tintJitterRange ?? 0
  shader.uniforms.uBarkRoughnessOverride.value = barkSettings.roughnessOverride ?? -1
  shader.uniforms.uBarkRegionSplit.value = 0
}
