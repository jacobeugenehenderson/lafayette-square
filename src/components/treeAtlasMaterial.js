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
import { patchTerrainInstanced } from '../utils/terrainShader'

// Module-level cache: one material set per look. Sharing materials across
// component remounts keeps program count at 2 even if the tree component
// tree re-renders.
const _cache = new Map()  // lookName -> { manifest, barkMaterial, leavesMaterial, status, error }

// Shared sway uniform — single object mutated each frame by the runtime.
// Using one uniform across all leaves materials means re-baking a Look
// doesn't drop animation continuity, and there's still only one shader
// program for leaves regardless of how many Looks have been visited.
export const treeSwayUniforms = {
  uTime: { value: 0 },
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
    shader.uniforms.uTime = treeSwayUniforms.uTime
    // Per-tree lamp-glow uniform — driven by CartographApp from the
    // per-Look TOD curve (lampGlow.trees slider). The per-instance
    // `aLampGlow` attribute (pre-baked at tree position) carries the
    // gaussian sum over nearby lamps; the uniform scales it.
    shader.uniforms.uLampGlow = _lampGlow.treesUniform
    // Phase B bark retint uniforms (per-draw mutation pattern).
    shader.uniforms.uBarkTintBase = { value: new THREE.Color(1, 1, 1) }
    shader.uniforms.uBarkTintJitterRange = { value: 0 }
    shader.uniforms.uBarkRoughnessOverride = { value: -1 }
    // Phase B.1.a bark UV-tiling uniforms (per-draw, set by
    // applyBarkUniforms in InstancedTrees). uBarkUVScale controls how
    // many times the bark tile repeats across the cylinder UV span;
    // uBarkTileOffset/Scale carry the species's bark tile bounds in
    // master-atlas UV space, so the fract() wrap stays strictly INSIDE
    // the tile (no bleed into neighbor tiles). Leaves bypass the wrap
    // via the vBark gate.
    shader.uniforms.uBarkUVScale = { value: new THREE.Vector2(1, 1) }
    shader.uniforms.uBarkTileOffset = { value: new THREE.Vector2(0, 0) }
    shader.uniforms.uBarkTileScale = { value: new THREE.Vector2(1, 1) }
    // Stash the shader on the material so InstancedTrees can mutate the
    // uniforms per (species, draw) without redoing onBeforeCompile.
    material.userData.shader = shader
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         attribute float aLampGlow;
         attribute float aBark;
         varying float vLampGlow;
         varying float vCanopyW;
         varying float vBark;
         varying vec3 vWorldXZ;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vLampGlow = aLampGlow;
         vBark = aBark;
         // Canopy weight: hard-zero on the trunk, ramping in only above
         // the canopy break. Earlier 1.5→4.0 left ~20% contribution at 2m
         // which still showed as a faint trunk stripe. 3.0→4.5 gives a
         // tight transition: trunk stays fully dark, canopy fully lit.
         vCanopyW = smoothstep(3.0, 4.5, position.y);
         {
           // Per-instance phase from instanceMatrix translation column.
           // Tree trunks anchor at y=0; sway scales with vertex height so
           // canopy moves and base stays planted.
           vec3 instWorld = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
           float phase = instWorld.x * 0.05 + instWorld.z * 0.07;
           float h = max(position.y, 0.0);
           float swayAmp = 0.04;
           transformed.x += sin(uTime * 0.6 + phase) * swayAmp * h;
           transformed.z += cos(uTime * 0.5 + phase * 1.3) * swayAmp * h;
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
         uniform vec3  uBarkTintBase;
         uniform float uBarkTintJitterRange;
         uniform float uBarkRoughnessOverride;
         uniform vec2  uBarkUVScale;
         uniform vec2  uBarkTileOffset;
         uniform vec2  uBarkTileScale;
         varying float vLampGlow;
         varying float vCanopyW;
         varying float vBark;
         varying vec3  vWorldXZ;`
      )
      .replace(
        // Phase B.1.a: replace the whole <map_fragment> chunk (rather than
        // insert before/after) because the standard chunk hardcodes
        // `texture2D(map, vMapUv)`. To wrap bark UVs within the species's
        // atlas tile, we need to compute a modified mapUV BEFORE the
        // sample. Leaves pass through (vBark < 0.5 → identity branch).
        // The wrap stays strictly inside the tile: localUV is normalized
        // to [0,1] within the tile, multiplied by uBarkUVScale (the
        // per-species circumferential / vertical tile-pitch), fract'd to
        // stay in [0,1], then re-projected into atlas space using the
        // same tile bounds. fract() introduces a gradient discontinuity
        // at wrap lines → coarse-mip selection there is the standard
        // tile-wrap artifact; acceptable for v1, mitigation via
        // textureGrad() is a follow-on if visible at Hero.
        '#include <map_fragment>',
        `
         #ifdef USE_MAP
           vec2 mapUV = vMapUv;
           vec4 sampledDiffuseColor;
           if (vBark > 0.5 && (uBarkUVScale.x != 1.0 || uBarkUVScale.y != 1.0)) {
             // Wrap photo bark inside the species's atlas tile. fract()
             // would normally introduce a derivative discontinuity at wrap
             // lines → GPU picks coarsest mip there → as sway moves the
             // trunk those blurry stripes "swim" relative to the bark.
             // Fix: compute the SMOOTH gradient (what the gradient would
             // be without fract, i.e. dFdx(vMapUv) scaled by uBarkUVScale)
             // and feed it to textureGrad so mipmap selection ignores the
             // fract jump. Wrap line still exists but is invisible in mip
             // selection. WebGL 2 standard.
             vec2 localUV = (vMapUv - uBarkTileOffset) / uBarkTileScale;
             localUV = fract(localUV * uBarkUVScale);
             mapUV = localUV * uBarkTileScale + uBarkTileOffset;
             vec2 gradX = dFdx(vMapUv) * uBarkUVScale;
             vec2 gradY = dFdy(vMapUv) * uBarkUVScale;
             sampledDiffuseColor = textureGrad(map, mapUV, gradX, gradY);
           } else {
             sampledDiffuseColor = texture2D(map, mapUV);
           }
           #ifdef DECODE_VIDEO_TEXTURE
             sampledDiffuseColor = vec4(mix(pow(sampledDiffuseColor.rgb * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), sampledDiffuseColor.rgb * 0.0773993808, vec3(lessThanEqual(sampledDiffuseColor.rgb, vec3(0.04045)))), sampledDiffuseColor.w);
           #endif
           diffuseColor *= sampledDiffuseColor;
         #endif
         // Phase B per-instance + per-Look bark retint, gated by vBark so
         // leaf fragments pass through identity.
         {
           float jh1 = fract(sin(dot(vWorldXZ.xz, vec2(127.1, 311.7))) * 43758.5453);
           float jh2 = fract(sin(dot(vWorldXZ.xz, vec2(269.5, 183.3))) * 43758.5453);
           float jh3 = fract(sin(dot(vWorldXZ.xz, vec2(419.2, 371.9))) * 43758.5453);
           vec3 jitter = vec3(jh1, jh2, jh3);
           vec3 perInstanceTint = mix(vec3(1.0), 0.5 + jitter, uBarkTintJitterRange);
           vec3 barkTint = uBarkTintBase * perInstanceTint;
           diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * barkTint, vBark);
         }`
      )
      .replace(
        // Roughness override slot: clamp roughnessFactor on bark fragments
        // when the per-species override is >= 0. Leaf fragments untouched.
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         if (uBarkRoughnessOverride >= 0.0) {
           roughnessFactor = mix(roughnessFactor, uBarkRoughnessOverride, vBark);
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
        // Phase B.1.a: bumped 4 → 16 to handle the dense bark UV tiling.
        // uvScale of e.g. [2, 8] introduces a 4:1 anisotropy ratio in
        // screen-space gradient (vertical 8x, circumferential 2x). With
        // aniso cap of 4 the sampler falls back to isotropic filtering
        // at the LARGER gradient → averages bark grain horizontally →
        // vertical-streak smear. 16 is clamped to GPU max internally by
        // three.js and unlocks proper anisotropic sampling for tiled
        // photo bark. Cost: 16x more texture taps per filtered fragment,
        // but only on bark draw calls (a small fraction of total).
        tex.anisotropy = 16
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
        // Phase B.1.a: bumped 4 → 16 to handle the dense bark UV tiling.
        // uvScale of e.g. [2, 8] introduces a 4:1 anisotropy ratio in
        // screen-space gradient (vertical 8x, circumferential 2x). With
        // aniso cap of 4 the sampler falls back to isotropic filtering
        // at the LARGER gradient → averages bark grain horizontally →
        // vertical-streak smear. 16 is clamped to GPU max internally by
        // three.js and unlocks proper anisotropic sampling for tiled
        // photo bark. Cost: 16x more texture taps per filtered fragment,
        // but only on bark draw calls (a small fraction of total).
        tex.anisotropy = 16
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

  const [color, normal] = await Promise.all([
    loadTexture(atlas.colorPath),
    loadNormalTexture(atlas.normalPath),
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
