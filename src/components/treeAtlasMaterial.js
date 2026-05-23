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
  // Phase 5a — wind cross-helper subscriber. The driver in
  // AtmosphereDirectiveDriver.jsx writes directive.wind into these each
  // frame. uSwayWindSpeed scales the existing time-driven oscillation
  // (1.0 = today's hardcoded behavior). uSwayWindDir is a unit XZ
  // vector that biases the sway in the wind's direction (so leaves
  // lean +wind, not just oscillate symmetrically). Phase 7a will
  // replace this scalar with a multi-timescale gust envelope.
  uSwayWindSpeed: { value: 1.0 },
  uSwayWindDir: { value: new THREE.Vector2(1, 0) },
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
    shader.uniforms.uSwayWindSpeed = treeSwayUniforms.uSwayWindSpeed
    shader.uniforms.uSwayWindDir = treeSwayUniforms.uSwayWindDir
    // Per-tree lamp-glow uniform — driven by CartographApp from the
    // per-Look TOD curve (lampGlow.trees slider). The per-instance
    // `aLampGlow` attribute (pre-baked at tree position) carries the
    // gaussian sum over nearby lamps; the uniform scales it.
    shader.uniforms.uLampGlow = _lampGlow.treesUniform
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
         uniform float uSwayWindSpeed;
         uniform vec2  uSwayWindDir;
         attribute float aLampGlow;
         attribute float aBark;
         attribute float aBarkRegion;
         varying float vLampGlow;
         varying float vCanopyW;
         varying float vBark;
         varying float vBarkRegion;
         varying vec3 vWorldXZ;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vLampGlow = aLampGlow;
         vBark = aBark;
         vBarkRegion = aBarkRegion;
         // Canopy weight: hard-zero on the trunk, ramping in only above
         // the canopy break. Earlier 1.5→4.0 left ~20% contribution at 2m
         // which still showed as a faint trunk stripe. 3.0→4.5 gives a
         // tight transition: trunk stays fully dark, canopy fully lit.
         vCanopyW = smoothstep(3.0, 4.5, position.y);
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
           // Phase 5a: scalar wind. uSwayWindSpeed scales the time
           // basis (gentle 1.0 today → faster oscillation under stronger
           // wind). uSwayWindDir biases the sway so leaves lean toward
           // the wind direction (constant offset proportional to speed)
           // on top of the symmetric oscillation. Phase 7a replaces with
           // a multi-timescale gust envelope.
           float swayAmp = 0.04;
           float t = uTime * (0.6 + 0.4 * (uSwayWindSpeed - 1.0));
           float swayX = sin(t + phase) * swayAmp * h;
           float swayZ = cos(t * 0.83 + phase * 1.3) * swayAmp * h;
           // Static lean — small offset in the wind direction proportional
           // to speed. Keeps the canopy's neutral position slightly
           // tipped under sustained wind.
           float lean = clamp((uSwayWindSpeed - 1.0) * 0.25, -0.6, 0.6) * swayAmp * h;
           transformed.x += swayX + uSwayWindDir.x * lean;
           transformed.z += swayZ + uSwayWindDir.y * lean;
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
         varying float vLampGlow;
         varying float vCanopyW;
         varying float vBark;
         varying float vBarkRegion;
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
           // Texture / Unity HDRP Detail Albedo. Recover the [0,1] tile-local
           // UV from vMapUv (which lives in the bark sub-region of the
           // unified atlas), then sample the detail sub-region. Overlay
           // blend on the final bark color, additive over the tint/gradient
           // path. Identity-safe when uBarkTileScale=0 (no slot bound) since
           // uBarkDetailStrength is mixed against the unmodified barkColor.
           vec2 localUV = (uBarkTileScale.x > 0.0 && uBarkTileScale.y > 0.0)
             ? (vMapUv - uBarkTileOffset) / uBarkTileScale
             : vec2(0.5);
           localUV = fract(localUV);
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
           barkColor = mix(barkColor, composite, uBarkDetailStrength);
           diffuseColor.rgb = mix(diffuseColor.rgb, barkColor, vBark);
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
}

// Applies per-draw bark uniforms. Moved here from InstancedTrees.jsx by
// Brief 7 so the Salon preview path (SpecimenViewport) reuses the SAME
// per-draw uniform setup. Single implementation across LS runtime and
// workstage preview — drift-prevention is the structural reason this
// function lives here, next to its uniform contract.
export function applyBarkUniforms(material, barkSettings, gradientSlot, detailSlot) {
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
  // Detail slot
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
