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
import { patchTerrainInstanced } from '../utils/terrainShader'

// Module-level cache: one material set per look. Sharing materials across
// component remounts keeps program count at 2 even if the tree component
// tree re-renders.
const _cache = new Map()  // lookName -> { manifest, barkMaterial, leavesMaterial, status, error }

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
function injectFoliageSway(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime              = treeSwayUniforms.uTime
    shader.uniforms.uWindForce         = treeSwayUniforms.uWindForce
    shader.uniforms.uWindIntensity     = treeSwayUniforms.uWindIntensity
    shader.uniforms.uGustFrontVelocity = treeSwayUniforms.uGustFrontVelocity
    shader.uniforms.uGustsScale        = treeSwayUniforms.uGustsScale
    shader.uniforms.uGustEnvelope      = treeSwayUniforms.uGustEnvelope
    shader.uniforms.uRustleAmplitude   = treeSwayUniforms.uRustleAmplitude
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
    shader.uniforms.uTrunkBlend      = { value: 0.55 }
    shader.uniforms.uTrunkBlendTop   = { value: 1.5 }
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
         attribute float aHeroTier;
         uniform vec2 uDeformLeanRange;
         uniform vec2 uDeformTwistRange;
         uniform vec2 uDeformWanderRange;
         uniform vec2 uDeformSeed;
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
           float ampScale;
           if (aWindTier < 0.5)      ampScale = 0.05;  // trunk
           else if (aWindTier < 1.5) ampScale = 0.30;  // branch
           else if (aWindTier < 2.5) ampScale = 0.60;  // twig
           else                      ampScale = 1.00;  // leaf
           float tempoScale;
           if (aWindTier < 0.5)      tempoScale = 0.7;
           else if (aWindTier < 1.5) tempoScale = 1.0;
           else if (aWindTier < 2.5) tempoScale = 1.3;
           else                      tempoScale = 1.6;
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
         uniform float uLampGlow;
         uniform sampler2D uGroundColorMap;
         uniform vec2  uGroundColorMin;
         uniform vec2  uGroundColorSpan;
         uniform float uHasGroundColor;
         uniform float uTrunkBlend;
         uniform float uTrunkBlendTop;
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
             // operator can confirm nothing visible is being culled).
             vec3 qc = vHeroTier < 0.5 ? vec3(0.15, 0.95, 0.35)
                     : vHeroTier < 1.5 ? vec3(1.0, 0.20, 0.85)
                     :                   vec3(0.15, 0.45, 1.0);
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
      // SOURCE clamp (2026-06-25): bound the tree's final HDR colour so NO
      // foliage fragment — mesh OR impostor — can emit Inf/huge values that
      // poison the shared bloom/DoF pyramid (the black→gray square flashes that
      // grow with pyramid levels). Kill NaN via equal(x,x) (NaN != NaN), clamp
      // to a sane max — trees never exceed ~lamp-emissive brightness, so 8.0 is
      // generous headroom. three #defines gl_FragColor for GLSL1+GLSL3 alike, so
      // referencing it in an injected chunk is version-safe.
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         gl_FragColor.rgb = clamp(mix(vec3(0.0), gl_FragColor.rgb, vec3(equal(gl_FragColor.rgb, gl_FragColor.rgb))), 0.0, 4.0);`
      )
  }
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.flipY = false  // GLTF convention — matches the rewritten UVs
        tex.anisotropy = 4
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
    loadTexture(withBase(atlas.colorPath)),
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
  patchTerrainInstanced(treeMaterial)

  return { manifest, treeMaterial, roster }
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

  useEffect(() => {
    if (!lookName) return
    let cached = _cache.get(lookName)
    if (cached?.status === 'ready' || cached?.status === 'loading') return
    cached = { status: 'loading' }
    _cache.set(lookName, cached)
    setBump(b => b + 1)
    buildMaterials(lookName)
      .then((built) => {
        _cache.set(lookName, { status: 'ready', ...built })
        setBump(b => b + 1)
      })
      .catch((err) => {
        console.warn('[treeAtlas] bake failed for', lookName, err)
        _cache.set(lookName, { status: 'error', error: err })
        setBump(b => b + 1)
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
    loadTexture(atlas.colorPath + cacheBust),
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
  // Brief 9a (Sough) — per-vertex wind tier for multi-scale sway. Mirrors
  // InstancedTrees.jsx's classifier so Salon preview and LS see the same
  // tier per vertex. Leaves: tier 3. Bark: tier from radial distance
  // around the tree's local Y-axis (trunk ≈ X=Z=0 thanks to clean
  // chassis-bake coordinate frame). Stamped once per geometry.
  if (!geometry.attributes.aWindTier) {
    const arr = new Float32Array(pos.count)
    const isBark = atlasKind === 'bark'
    if (!isBark) {
      arr.fill(3)
    } else {
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const y = pos.getY(i)
        const z = pos.getZ(i)
        const r = Math.sqrt(x * x + z * z)
        let tier
        if (r > 0.15 && y < 3.0) tier = 0
        else if (r > 0.06)       tier = 1
        else                     tier = 2
        arr[i] = tier
      }
    }
    geometry.setAttribute('aWindTier', new THREE.BufferAttribute(arr, 1))
  }
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
