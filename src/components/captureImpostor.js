/**
 * captureImpostor — in-browser render-to-texture capture of the REAL tree, the
 * texture that skins the X cross-billboard impostor (Arc 2, Phase 1).
 *
 * The analytic impostor (cross-quads sampling the bark/leaf ATLAS TILES) was a
 * dead end — it read as floating dark leaf-slabs + a stone trunk at every
 * distance (operator, 2026-06-25). The fix: the billboard must be textured with
 * an actual RENDER of the species, so the silhouette is correct BY CONSTRUCTION.
 *
 * Phase 1 proves the look the fastest way — capture in the LS runtime at load
 * (no backend, no bake round-trip; Salon-authored capture + a baked texture is
 * Phase 2). For each impostor-role species we:
 *   1. load its lod1 GLB (the same one the mesh path loads, via drei's cache),
 *   2. apply the shared `treeMaterial` + stamp the per-vertex bark/leaf/wind/
 *      height attributes exactly as the LS mesh path + Salon preview do
 *      (`stampTreeVertexAttrs`) so bark/leaf render with full atlas parity,
 *   3. frame an OrthographicCamera FRONT-ON, fit to the tree's real
 *      height/width (reusing SpecimenViewport's `studioFraming` proportions but
 *      ortho, so a billboard has no perspective foreshortening),
 *   4. render to a transparent-clear WebGLRenderTarget (real alpha for the
 *      billboard's alphaTest), with full save/restore of the renderer's
 *      target / autoClear / clear color+alpha / toneMapping / outputColorSpace
 *      so the main scene render is undisturbed,
 *   5. cache `rt.texture` per species in a module-level map and bump a counter
 *      so the X-billboards mount.
 *
 * The capture runs ONCE per species in a useEffect (NOT useFrame) — gated until
 * the atlas is ready + GLBs loaded. Flat-lit (one hemisphere light, NO harsh
 * directional) so no shadow bakes into the texture and the billboard doesn't pop
 * darker/brighter than its mesh neighbours; per-azimuth octahedral capture +
 * normal-map relight are the accepted v1 deferrals (BATON-tree-render-next.md).
 */
import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { stampTreeVertexAttrs } from './treeAtlasMaterial.js'

// One shared loader for all captures. The tree GLBs carry no DRACO/meshopt (only
// EXT_texture_webp, which we don't read — the material is overridden with the
// shared atlas treeMaterial), so a plain GLTFLoader parses them fine.
const _gltfLoader = new GLTFLoader()
function loadGltf(url) {
  return new Promise((resolve, reject) => _gltfLoader.load(url, resolve, undefined, reject))
}

// Module-level cache: species -> THREE.Texture (the captured RT color texture).
// Mirrors treeAtlasMaterial.js#_cache — sharing across remounts keeps the
// expensive capture a once-per-species cost even if the tree component
// re-renders. Keyed by `${lookName}:${species}` so two Looks don't collide.
const _captureCache = new Map()

// One square capture per species. 512² is enough for a far/occluded impostor
// (the whole point is it's small on screen) and cheap to render once. Higher
// would only matter if impostors crept into mid-distance — they don't (role at
// bake; DoF is the cover).
const CAPTURE_SIZE = 512

// Front-on ortho framing proportions mirror SpecimenViewport.studioFraming's
// padding, but ORTHO (no perspective) so the captured image is a clean flat
// elevation — a billboard textured with a perspective render would look wrong
// at the silhouette edges. The camera distance is irrelevant for ortho; we only
// need the half-span the frustum spans.
const FRAME_PAD_M = 1.5   // metres of headroom around the tree's box

export function invalidateImpostorCaptures(lookName) {
  if (!lookName) {
    for (const tex of _captureCache.values()) { try { tex.dispose() } catch {} }
    _captureCache.clear()
    return
  }
  const prefix = `${lookName}:`
  for (const key of [..._captureCache.keys()]) {
    if (key.startsWith(prefix)) {
      try { _captureCache.get(key)?.dispose() } catch {}
      _captureCache.delete(key)
    }
  }
}

/**
 * Render one tree (its lod1 GLB scene) to a transparent RT, front-on ortho, and
 * return the RT's color texture. Pure capture: saves + restores every renderer
 * state it touches so the caller's main render is byte-undisturbed.
 *
 * @param {THREE.WebGLRenderer} gl
 * @param {THREE.Object3D} glbScene   the loaded GLB scene (cloned + materialized by caller)
 * @param {number} heightM            real tree height (metres) for the ortho fit
 * @param {number} canopyRadiusM      real half-width (metres) for the ortho fit
 */
function renderTreeToTexture(gl, glbScene, heightM, canopyRadiusM, opts = {}) {
  // Throwaway scene + ONE neutral light. Hemisphere (sky/ground) only — no
  // directional, so no baked-in shadow and no side that goes black. Flat-lit is
  // the v1 tradeoff (TOD relight via captured normals is deferred).
  const scene = new THREE.Scene()
  const lights = []
  if (opts.shaded) {
    // SHADED + SHADOW-CASTING pass (the stamp): an angled directional key with real
    // shadow maps so the LEAVES CAST SHADOWS on each other + on the branches
    // beneath, and LOW ambient so those darks are actually dark (branches read dark,
    // not flat grey). The atlas normal map also shades each leaf by orientation.
    lights.push(new THREE.AmbientLight(0xffffff, 0.22))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    const D = Math.max(1, heightM, canopyRadiusM * 2)
    key.position.set(0.45 * D, 1.25 * D, 0.35 * D)     // above + angled → shadows fall sideways
    key.target.position.set(0, heightM * 0.4, 0)
    key.castShadow = true
    const S = canopyRadiusM + FRAME_PAD_M + heightM * 0.5 + 1   // cover the angled projection
    key.shadow.camera.left = -S; key.shadow.camera.right = S
    key.shadow.camera.top = S; key.shadow.camera.bottom = -S
    key.shadow.camera.near = 0.1
    key.shadow.camera.far = D * 5
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.bias = -0.0008
    lights.push(key, key.target)
  } else {
    // COLOR (albedo) pass — flat hemisphere, no directional, so no shading bakes in.
    lights.push(new THREE.HemisphereLight(0xffffff, 0xffffff, 1.0))
    lights.push(new THREE.AmbientLight(0xffffff, 0.6))
  }
  for (const l of lights) scene.add(l)
  scene.add(glbScene)

  let cam
  if (opts.topDown) {
    // OVERHEAD (plan-view) capture — the canopy from directly above, the skin
    // for the overhead "hula" impostor (HANDOFF-overhead-hula-impostor.md). Frame
    // the canopy FOOTPRINT (2·canopyRadius) square; camera high above looking
    // straight down, up = -Z so +X reads image-right (mirrors the Browse camera).
    const half = Math.max(0.5, canopyRadiusM + FRAME_PAD_M)
    const camY = heightM + half * 2 + 50
    // Optional height-BAND slice (canopy / mid / branch) for the 3-slice overhead
    // snapshot (HANDOFF-overhead-snapshot-impostor-wireup.md). The camera looks
    // straight DOWN (-Y), so a world height wy sits at view-distance (camY − wy);
    // clamping near/far to [camY−yHi, camY−yLo] renders ONLY that horizontal slab,
    // leaving the rest transparent. No geometry mutation — three renders, three
    // slabs, stacked as parallax planes at runtime. Absent band → whole tree.
    let near = 0.01, far = 4000
    if (opts.band) {
      const { yLo, yHi } = opts.band
      near = Math.max(0.01, camY - yHi)
      far = Math.max(near + 0.05, camY - yLo)
    }
    cam = new THREE.OrthographicCamera(-half, half, half, -half, near, far)
    cam.position.set(0, camY, 0)
    cam.up.set(0, 0, -1)
    cam.lookAt(0, 0, 0)
  } else if (opts.sideOn) {
    // HERO (low side-on) capture — the CANOPY-ONLY leaf mass seen level from the
    // side, the skin for the hero canopy-band billboard (HANDOFF-hero-impostor-
    // foundation.md). The 90°-rotated twin of the overhead band cut: overhead looks
    // DOWN and clips HEIGHT bands; hero looks HORIZONTAL and clips DEPTH shells.
    //
    //  • Canopy-only: the frustom is framed on [canopyBaseY, maxY] (trunk excluded),
    //    centred on the canopy mid-height, looked at DEAD-HORIZONTAL (Jacob's pitch
    //    call 2026-07-17 — cleanest side elevation, no foreshortening).
    //  • Azimuth: the camera orbits the tree about Y by opts.sideOn.azimuthRad, so N
    //    azimuths capture N sides; the runtime billboard shows the one nearest the
    //    view direction (classic azimuthal impostor).
    //  • Depth shell: the view axis is horizontal, so a world point at view-distance
    //    d renders only when d ∈ [near,far]. The canopy spans depth [D−R, D+R] about
    //    the orbit centre; slicing that into M shells gives front/back parallax
    //    layers — the exact overhead height-band trick, turned on its side.
    const { azimuthRad = 0, canopyBaseY = 0, maxY = heightM, depthLoFrac = 0, depthHiFrac = 1 } = opts.sideOn
    const R = Math.max(0.5, canopyRadiusM)
    const halfW = R + FRAME_PAD_M
    const halfH = Math.max(0.5, (maxY - canopyBaseY) / 2 + FRAME_PAD_M)
    const half = Math.max(halfW, halfH)                 // square frame + square RT (like overhead)
    const midY = (canopyBaseY + maxY) / 2
    const D = half * 4 + 50                              // orbit radius (arbitrary for ortho)
    // Depth shell → near/far clip along the (horizontal) view axis. The canopy's
    // depth extent about the centre is ±R; fractions [0,1] map front(D−R)→back(D+R).
    const near = Math.max(0.01, D - R + depthLoFrac * 2 * R)
    const far = Math.max(near + 0.05, D - R + depthHiFrac * 2 * R)
    cam = new THREE.OrthographicCamera(-half, half, half, -half, near, far)
    cam.position.set(Math.sin(azimuthRad) * D, midY, Math.cos(azimuthRad) * D)
    cam.up.set(0, 1, 0)
    cam.lookAt(0, midY, 0)
  } else {
    // Fit an ortho frustum to the tree's real box: width = 2·canopyRadius,
    // height = heightM, both padded. The capture frame is wider of the two so the
    // whole silhouette fits with the same metres-per-pixel on both axes (square
    // RT), then the billboard quad is sized to the SAME real metres so it lands
    // 1:1 on the world tree.
    const halfW = Math.max(0.5, canopyRadiusM + FRAME_PAD_M)
    const halfH = Math.max(0.5, heightM / 2 + FRAME_PAD_M)
    const half = Math.max(halfW, halfH)
    cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 1000)
    // Centre the frustum on the tree's mid-height; look down -Z (front-on), the
    // GLB's +Y up. Distance is arbitrary for ortho — sit well outside the box.
    const midY = heightM / 2
    cam.position.set(0, midY, half * 4 + 50)
    cam.up.set(0, 1, 0)
    cam.lookAt(0, midY, 0)
  }
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()

  // Overhead-band captures pass a smaller, mipmap-free RT (opts.size/noMipmap) —
  // 3 renders/tree, so keep each cheap (a lighter GPU load, no TDR watchdog trip).
  const size = opts.size || CAPTURE_SIZE
  const noMip = !!opts.noMipmap
  const rt = new THREE.WebGLRenderTarget(size, size, {
    minFilter: noMip ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    colorSpace: THREE.SRGBColorSpace,   // match the main scene's output space
    generateMipmaps: !noMip,
    depthBuffer: true,
  })
  if (!noMip) rt.texture.anisotropy = 4

  // ── Save every renderer state we mutate ──────────────────────────────────
  const prevTarget = gl.getRenderTarget()
  const prevActiveCubeFace = gl.getActiveCubeFace?.() ?? 0
  const prevActiveMipLevel = gl.getActiveMipmapLevel?.() ?? 0
  const prevAutoClear = gl.autoClear
  const prevClearColor = new THREE.Color()
  gl.getClearColor(prevClearColor)
  const prevClearAlpha = gl.getClearAlpha()
  const prevToneMapping = gl.toneMapping
  const prevOutputColorSpace = gl.outputColorSpace
  const prevShadowEnabled = gl.shadowMap.enabled
  const prevShadowType = gl.shadowMap.type
  // Capture mask (hero leaf/bark isolation) — flip the shared material's
  // uCaptureMask for THIS pass only (1 = leaf-only, 2 = bark-only, 0/absent =
  // whole tree). Reset in finally so no other render sees it. The overhead +
  // front-on paths never pass it → unaffected.
  let maskUniform = null, prevMask = 0
  const wantMask = opts.captureMask || 0
  if (wantMask) {
    glbScene.traverse((o) => {
      if (maskUniform || !o.isMesh) return
      const u = o.material?.userData?.shader?.uniforms?.uCaptureMask
      if (u) maskUniform = u
    })
    if (maskUniform) { prevMask = maskUniform.value; maskUniform.value = wantMask }
    else console.warn('[captureImpostor] uCaptureMask not found (shader not compiled yet?) — capturing whole tree')
  }

  try {
    // Capture in a KNOWN, neutral state: no tone-mapping (the texture is the
    // tree's raw lit color — tone-mapping is re-applied when the billboard
    // renders into the main scene, so applying it here would double it), sRGB
    // output to match the atlas/textures. Transparent clear → real alpha.
    gl.setRenderTarget(rt)
    gl.toneMapping = THREE.NoToneMapping
    gl.outputColorSpace = THREE.SRGBColorSpace
    // Soft shadow maps for the shaded (stamp) pass → leaves cast shadows.
    gl.shadowMap.enabled = !!opts.shaded
    gl.shadowMap.type = THREE.PCFSoftShadowMap
    gl.autoClear = true
    gl.setClearColor(0x000000, 0)   // transparent
    gl.clear(true, true, true)
    gl.render(scene, cam)
    // Read back the pixels for PERSISTENCE (the Salon encodes → PNG → POSTs into the
    // slab). WebGL origin is bottom-left, so this buffer is Y-flipped vs a canvas.
    if (opts.readback) {
      const px = new Uint8Array(size * size * 4)
      gl.readRenderTargetPixels(rt, 0, 0, size, size, px)
      rt.texture.userData.readback = { data: px, width: size, height: size }
    }
  } finally {
    // ── Restore — main scene render must be undisturbed ─────────────────────
    gl.setRenderTarget(prevTarget, prevActiveCubeFace, prevActiveMipLevel)
    gl.autoClear = prevAutoClear
    gl.setClearColor(prevClearColor, prevClearAlpha)
    gl.toneMapping = prevToneMapping
    gl.outputColorSpace = prevOutputColorSpace
    gl.shadowMap.enabled = prevShadowEnabled
    gl.shadowMap.type = prevShadowType
    if (maskUniform) maskUniform.value = prevMask
  }

  // Detach the GLB so disposing the throwaway scene's lights doesn't take the
  // shared GLB geometry with it (the GLB scene is a fresh clone owned here, but
  // its geometry/material are shared — detach to be safe before GC).
  scene.remove(glbScene)
  for (const l of lights) l.dispose?.()
  // The RT keeps its own depth/color buffers alive; the texture is what we cache.
  return rt.texture
}

/**
 * Clone a loaded GLB scene, bake each prim's world transform into a merged-frame
 * clone, apply the shared `treeMaterial`, and stamp the per-vertex attributes
 * the shared shader reads (aBark / aBarkRegion / aWindTier / aTreeHeightNorm /
 * aLampGlow / aHeroTier) — exactly as the Salon preview does
 * (SpecimenViewport#Skeleton), so bark + leaves render with full atlas parity.
 * Returns { scene, heightM } where heightM is the chassis Y-extent (the real
 * height the ortho frames + the billboard is sized to).
 */
function materializeForCapture(gltfScene, treeMaterial, { skipStamp = false } = {}) {
  const root = gltfScene.clone(true)
  root.updateMatrixWorld(true)
  // Chassis-wide Y range so aTreeHeightNorm normalizes consistently (mirrors
  // InstancedTrees#meshes + SpecimenViewport).
  let chMinY = Infinity, chMaxY = -Infinity
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    o.geometry.computeBoundingBox()
    const bb = o.geometry.boundingBox
    if (bb) { chMinY = Math.min(chMinY, bb.min.y); chMaxY = Math.max(chMaxY, bb.max.y) }
  })
  const chassisMinY = Number.isFinite(chMinY) ? chMinY : 0
  const chassisYRange = Math.max(1e-4, chMaxY - chMinY)
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    // skipStamp: when the source is the LIVE, already-stamped preview scene, the
    // clone SHARES its geometry buffers — re-stamping / deleting attributes would
    // mutate buffers the live canvas is drawing (→ GL crash). The attrs are
    // already present, so only swap the material (cheap, per-clone-mesh).
    if (!skipStamp) {
      stampTreeVertexAttrs(o.geometry, { chassisMinY, chassisYRange }, o)
      if (o.geometry.attributes?.color) o.geometry.deleteAttribute('color')
    }
    o.material = treeMaterial
    o.castShadow = true      // leaves cast shadows on each other + the branches
    o.receiveShadow = true
  })
  const heightM = Number.isFinite(chMaxY) ? Math.max(1, chMaxY) : 12
  return { scene: root, heightM }
}

/**
 * captureTreeOverhead — one-shot OVERHEAD (plan-view) RTT capture of a loaded
 * tree GLB, skinned with the shared atlas material so the captured canopy carries
 * the authored bark/leaves/size/density. This is the "overhead look": the REAL
 * tree from directly above, the photographic skin for the overhead hula impostor
 * (returns a THREE.Texture the caller owns + disposes). See the Salon Browse
 * preset in SpecimenViewport.
 *
 * @param {THREE.WebGLRenderer} gl
 * @param {THREE.Object3D} gltfScene    a loaded GLB scene (e.g. useGLTF().scene)
 * @param {THREE.Material}  treeMaterial the shared/preview atlas material
 * @param {object} dims                 { canopyRadiusM }
 */
export function captureTreeOverhead(gl, gltfScene, treeMaterial, { canopyRadiusM } = {}) {
  if (!gl || !gltfScene || !treeMaterial) return null
  const { scene, heightM } = materializeForCapture(gltfScene, treeMaterial)
  const tex = renderTreeToTexture(gl, scene, heightM, Math.max(1, canopyRadiusM || 5), { topDown: true })
  tex.name = 'impostor-overhead-capture'
  return tex
}

/**
 * Measure the canopy-base Y (where foliage starts) off a MATERIALIZED capture
 * scene — the runtime twin of bake-impostors.js#measureCanopyBase, but reading
 * the stamped `aBark` vertex attribute (1 = bark, 0 = leaf) instead of a
 * gltf-transform doc. Returns { minY, maxY, canopyBaseY } in the scene's local
 * frame (chassis GLBs are baked flat, base ≈ 0 — the same frame the ortho
 * framing + band clips use). Falls back to a ~1/3-up broadleaf break when no
 * classified foliage is present.
 */
function measureCanopyBaseLocal(scene) {
  let minY = Infinity, maxY = -Infinity, leafMinY = Infinity, sawLeaf = false
  scene.traverse((o) => {
    const g = o.isMesh ? o.geometry : null
    const pos = g?.attributes?.position
    if (!pos) return
    const bark = g.attributes.aBark
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      const isLeaf = bark ? bark.getX(i) < 0.5 : false
      if (isLeaf) { sawLeaf = true; if (y < leafMinY) leafMinY = y }
    }
  })
  if (!isFinite(minY) || !isFinite(maxY)) return { minY: 0, maxY: 12, canopyBaseY: 4 }
  const H = maxY - minY
  if (!sawLeaf || !isFinite(leafMinY) || H <= 0) {
    return { minY, maxY, canopyBaseY: minY + H * 0.35 }
  }
  const frac = Math.min(0.7, Math.max(0.1, (leafMinY - minY) / H))
  return { minY, maxY, canopyBaseY: minY + H * frac }
}

/**
 * captureTreeOverheadBands — the 3-SLICE overhead snapshot: three top-down RTT
 * captures of the SAME tree, each clipped to a height band (branch / mid /
 * canopy), the layered skin for the overhead snapshot impostor
 * (HANDOFF-overhead-snapshot-impostor-wireup.md). Stacked as parallax planes at
 * runtime, the branches (lowest band) still read through the crown and the
 * canopy (top band) still catches the wind — real vertical motion parallax from
 * above that one flat snapshot can't give.
 *
 * Band cuts are derived from the measured canopy base + total height: the crown
 * [canopyBase, top] splits into thirds, and the lowest (branch) band dips a
 * touch below the leaf base to catch the main limbs. Returned BOTTOM→TOP so the
 * caller stacks them low→high.
 *
 * ⚠️ Do the 3 renders ONE-PER-FRAME (via captureOverheadBand across successive
 * frames), off the ALREADY-LOADED live scene (skipStamp) — NOT a fresh 2nd copy
 * of the (21MB) GLB, and NOT 3 heavy renders in one blocking frame. Either of
 * those bursts the GPU alongside the live preview render → WebGL context loss.
 * This split (prepareOverheadBands + captureOverheadBand) is the crash-safe path.
 *
 * @param {THREE.Object3D}  gltfScene    the LIVE preview scene (useGLTF().scene)
 * @param {THREE.Material}  treeMaterial the shared/preview atlas material
 * @param {object} opts                  { canopyRadiusM, alreadyStamped }
 * @returns {{ scene, heightM, rM, minY, H, canopyBaseY, cuts }|null}
 */
export function prepareOverheadBands(gltfScene, treeMaterial, { canopyRadiusM, alreadyStamped = false } = {}) {
  if (!gltfScene || !treeMaterial) return null
  // Clone SHARES geometry (no 2nd GPU copy of the heavy tree); skipStamp avoids
  // mutating those shared, live-rendered buffers.
  const { scene, heightM } = materializeForCapture(gltfScene, treeMaterial, { skipStamp: alreadyStamped })
  const rM = Math.max(1, canopyRadiusM || 5)
  const { minY, maxY, canopyBaseY: Cb } = measureCanopyBaseLocal(scene)
  const H = Math.max(1e-3, maxY - minY)
  const s = Math.max(1e-3, maxY - Cb)           // crown vertical span
  // Bottom→top. The branch band dips ~12% of tree height below the leaf base so
  // the woody structure (main limbs) reads through the crown from above.
  const cuts = [
    { key: 'branch', yLo: Math.max(minY, Cb - 0.12 * H), yHi: Cb + s / 3 },
    { key: 'mid',    yLo: Cb + s / 3,                    yHi: Cb + (2 * s) / 3 },
    { key: 'canopy', yLo: Cb + (2 * s) / 3,              yHi: maxY },
  ]
  return { scene, heightM, rM, minY, H, canopyBaseY: Cb, cuts }
}

/**
 * captureOverheadBand — render ONE band (index i) of a prepared overhead capture
 * to a light 256² texture. Call once per frame across successive frames so the
 * three slice renders never burst the GPU in one blocking frame.
 *
 * @returns {{ key, tex, yLo, yHi, yLoNorm, yHiNorm }}
 */
// ── AO extraction (the parity-correct bake) ──────────────────────────────────
// We bake TWO light-INDEPENDENT channels per band so the runtime can RELIGHT the
// impostor with the live atmosphere (parity: overcast light → flat trees, sun →
// contrast): the ALBEDO (flat colour) and the AO (structural occlusion). AO is
// derived here as luma(SHADED) / luma(ALBEDO) — how much the shadow-cast pass
// darkens vs the flat pass, i.e. the occlusion factor (1 = exposed, →0 = deep in
// the crown / under branches), which holds under ANY light because it's geometry,
// not a baked sun. Output: AO in rgb, cutout alpha carried from the albedo pass.
let _aoComposite = null
function getAOComposite() {
  if (_aoComposite) return _aoComposite
  const scene = new THREE.Scene()
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uAlbedo: { value: null }, uShaded: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uAlbedo; uniform sampler2D uShaded;
      varying vec2 vUv;
      float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
      void main(){
        vec4 a = texture2D(uAlbedo, vUv);
        float al = luma(a.rgb);
        float sl = luma(texture2D(uShaded, vUv).rgb);
        float ao = clamp(sl / max(al, 0.02), 0.0, 1.0);   // occlusion factor, light-independent
        gl_FragColor = vec4(vec3(ao), a.a);               // AO in rgb, cutout alpha from albedo
      }`,
    depthTest: false, depthWrite: false,
  })
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat))
  _aoComposite = { scene, cam, mat }
  return _aoComposite
}

function compositeAO(gl, albedoTex, shadedTex, size, readback = false) {
  const { scene, cam, mat } = getAOComposite()
  mat.uniforms.uAlbedo.value = albedoTex
  mat.uniforms.uShaded.value = shadedTex
  const rt = new THREE.WebGLRenderTarget(size, size, {
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    colorSpace: THREE.LinearSRGBColorSpace,   // AO is data, not colour → linear
    generateMipmaps: true, depthBuffer: false,
  })
  rt.texture.anisotropy = 4
  const prevTarget = gl.getRenderTarget()
  const prevAutoClear = gl.autoClear
  const prevTone = gl.toneMapping
  const prevCS = gl.outputColorSpace
  try {
    gl.setRenderTarget(rt)
    gl.toneMapping = THREE.NoToneMapping
    gl.outputColorSpace = THREE.LinearSRGBColorSpace
    gl.autoClear = true
    gl.setClearColor(0x000000, 0)
    gl.clear(true, true, true)
    gl.render(scene, cam)
    if (readback) {
      const px = new Uint8Array(size * size * 4)
      gl.readRenderTargetPixels(rt, 0, 0, size, size, px)
      rt.texture.userData.readback = { data: px, width: size, height: size }
    }
  } finally {
    gl.setRenderTarget(prevTarget)
    gl.autoClear = prevAutoClear
    gl.toneMapping = prevTone
    gl.outputColorSpace = prevCS
  }
  return rt.texture
}

/**
 * captureOverheadBand — bake ONE band's two RELIGHT channels: a flat ALBEDO stamp
 * (1024²) and an AO occlusion map (512², derived shaded/albedo). Stepped one band
 * per frame upstream so the renders never burst the GPU. The runtime disc then
 * relights albedo × (ambient + sun·AO) with the live atmosphere → weather parity.
 *
 * @returns {{ key, albedoTex, aoTex, yLo, yHi, yLoNorm, yHiNorm }}
 */
export function captureOverheadBand(gl, prep, i) {
  const { scene, heightM, rM, minY, H, cuts } = prep
  const { key, yLo, yHi } = cuts[i]
  const band = { yLo, yHi }
  // readback:true → keep the pixels so the Salon can encode + auto-POST the layers
  // into the slab (persistence). The albedo pass carries the cutout alpha.
  const albedoTex = renderTreeToTexture(gl, scene, heightM, rM, { topDown: true, band, size: 1024, readback: true })
  // Shaded pass at half-res — it only feeds the (smooth) AO, so 512² is plenty and
  // keeps the per-frame GPU load down (the shaded pass also renders a shadow map).
  const shadedTex = renderTreeToTexture(gl, scene, heightM, rM, { topDown: true, band, size: 512, shaded: true })
  const aoTex = compositeAO(gl, albedoTex, shadedTex, 512, true)
  try { shadedTex.dispose() } catch {}
  albedoTex.name = `overhead-albedo:${key}`
  aoTex.name = `overhead-ao:${key}`
  return { key, albedoTex, aoTex, yLo, yHi, yLoNorm: (yLo - minY) / H, yHiNorm: (yHi - minY) / H }
}

// ── HERO canopy impostor (side-on) — the 90°-rotated twin of the overhead bands ──
// Where overhead slices HEIGHT bands from directly above, the hero slices DEPTH
// shells from the side, across N azimuths, canopy-only. The runtime carrier is a
// vertical billboard (impostorGeometry.js#buildHeroImpostorCard), not a flat disc.
// Same two-channel relight (albedo + AO) → the hero canopy tracks the weather like
// the overhead does, and the same one-render-per-frame stepping keeps it crash-safe.

// Hero capture resolution. The impostor is the FILL between the tall geometry
// anchors and, in the foundation model, is seen CLOSER + across more angle than a
// distant sea — so quality carries. We do NOT trade it away to hedge the
// azimuth×shell count (Jacob 2026-07-17: "don't summarily sacrifice quality"); the
// weight answer is KTX2/Basis compression of the baked pages, not a starved capture.
// 1024² albedo + 512² AO (AO is smooth → half-res is invisible).
const HERO_ALBEDO_SIZE = 1024
const HERO_AO_SIZE = 512

/**
 * prepareHeroBands — clone + materialize a tree for the hero side-on capture and
 * lay out the flat shot list (azimuths × depth-shells). Mirrors prepareOverheadBands:
 * the clone SHARES geometry (no 2nd GPU copy) and `alreadyStamped` skips re-stamping
 * the live preview's buffers. Canopy-only: the vertical frame is [canopyBaseY, maxY].
 *
 * @param {THREE.Object3D} gltfScene    the tree scene (live preview or a fresh load)
 * @param {THREE.Material}  treeMaterial the shared atlas material
 * Layer structure (Jacob 2026-07-17): the PARALLAX lives in the LEAVES, the woody
 * structure does NOT get depth-sliced. So per azimuth we lay out `shells` LEAF-ONLY
 * depth slices (captureMask 1) PLUS exactly ONE BARK-ONLY layer (captureMask 2, full
 * depth, un-sliced) that sits behind the leaves and matches the real species.
 *
 * @param {object} opts    { canopyRadiusM, azimuths=6, shells=2, alreadyStamped }
 * @returns {{ scene, heightM, rM, minY, maxY, canopyBaseY, azimuths, shells, shots }|null}
 *   shots (flat, one capture each): { azIdx, azimuthDeg, azimuthRad, kind:'leaf'|'bark',
 *   captureMask, shellIdx, shellCount, depthLoFrac, depthHiFrac }
 */
export function prepareHeroBands(gltfScene, treeMaterial, { canopyRadiusM, azimuths = 6, shells = 2, alreadyStamped = false } = {}) {
  if (!gltfScene || !treeMaterial) return null
  const { scene, heightM } = materializeForCapture(gltfScene, treeMaterial, { skipStamp: alreadyStamped })
  const rM = Math.max(1, canopyRadiusM || 5)
  const { minY, maxY, canopyBaseY: Cb } = measureCanopyBaseLocal(scene)
  const N = Math.max(1, Math.round(azimuths))
  const M = Math.max(1, Math.round(shells))
  const shots = []
  for (let a = 0; a < N; a++) {
    const azimuthRad = (a / N) * Math.PI * 2
    const azimuthDeg = Math.round((azimuthRad * 180) / Math.PI)
    // LEAF shells — leaf-only, depth-sliced front→back = the parallax.
    for (let s = 0; s < M; s++) {
      shots.push({
        azIdx: a, azimuthDeg, azimuthRad,
        kind: 'leaf', captureMask: 1,
        shellIdx: s, shellCount: M,
        depthLoFrac: s / M, depthHiFrac: (s + 1) / M,
      })
    }
    // ONE woody layer — bark-only, FULL depth, un-sliced (the trunk/branch layer).
    // Depth [0,1] → the card sits at centre depth (z=0), behind the leaf shells.
    shots.push({
      azIdx: a, azimuthDeg, azimuthRad,
      kind: 'bark', captureMask: 2,
      shellIdx: -1, shellCount: M,
      depthLoFrac: 0, depthHiFrac: 1,
    })
  }
  return { scene, heightM, rM, minY, maxY, canopyBaseY: Cb, azimuths: N, shells: M, shots }
}

/**
 * captureHeroBand — bake ONE hero shot (index i) to its two relight channels: a
 * flat ALBEDO stamp + an AO occlusion map (derived shaded/albedo, like overhead).
 * Stepped one shot per frame upstream so the many azimuth×shell renders never burst
 * the GPU. The back shells naturally bake DARKER (the full crown shadows them in the
 * shaded pass → lower AO), which is exactly the front-bright / back-dark depth cue.
 *
 * @returns {{ azIdx, azimuthDeg, kind, shellIdx, shellCount, albedoTex, aoTex, depthLoFrac, depthHiFrac }}
 */
export function captureHeroBand(gl, prep, i) {
  const { scene, heightM, rM, canopyBaseY, maxY, shots } = prep
  const shot = shots[i]
  const sideOn = {
    azimuthRad: shot.azimuthRad,
    canopyBaseY, maxY,
    depthLoFrac: shot.depthLoFrac, depthHiFrac: shot.depthHiFrac,
  }
  // captureMask isolates leaves (1) vs woody (2) at the shader — so the same tree
  // yields both the leaf-parallax shells and the single bark layer, silhouette-true.
  const opts = { sideOn, captureMask: shot.captureMask }
  const albedoTex = renderTreeToTexture(gl, scene, heightM, rM, { ...opts, size: HERO_ALBEDO_SIZE, readback: true })
  const shadedTex = renderTreeToTexture(gl, scene, heightM, rM, { ...opts, size: HERO_AO_SIZE, shaded: true })
  const aoTex = compositeAO(gl, albedoTex, shadedTex, HERO_AO_SIZE, true)
  try { shadedTex.dispose() } catch {}
  albedoTex.name = `hero-albedo:az${shot.azimuthDeg}:${shot.kind}${shot.shellIdx}`
  aoTex.name = `hero-ao:az${shot.azimuthDeg}:${shot.kind}${shot.shellIdx}`
  return {
    azIdx: shot.azIdx, azimuthDeg: shot.azimuthDeg,
    kind: shot.kind, shellIdx: shot.shellIdx, shellCount: shot.shellCount,
    depthLoFrac: shot.depthLoFrac, depthHiFrac: shot.depthHiFrac,
    albedoTex, aoTex,
  }
}

/**
 * useImpostorCaptures — load every impostor-role species' lod1 GLB, capture each
 * to a texture once, and return a per-species texture map (+ a ready flag).
 *
 * @param {object}   args
 * @param {string}   args.lookName
 * @param {object}   args.treeMaterial   the shared LS tree material (atlas-skinned)
 * @param {object[]} args.species        [{ species, glbUrl, heightM, canopyRadiusM }]
 *                                       glbUrl = the look-prefixed lod1 GLB URL.
 * @returns {{ textures: Map<string,THREE.Texture>, ready: boolean }}
 */
export function useImpostorCaptures({ lookName, treeMaterial, species }) {
  const gl = useThree((s) => s.gl)
  const [bump, setBump] = useState(0)

  // Stable signature so the effect only re-runs when the actual capture set
  // changes (species list / GLB URLs / dims), not on every parent render.
  const sig = useMemo(() => {
    if (!species?.length) return ''
    return species
      .map((s) => `${s.species}|${s.glbUrl}|${s.heightM}|${s.canopyRadiusM}`)
      .sort()
      .join('~~')
  }, [species])

  useEffect(() => {
    if (!gl || !treeMaterial || !lookName || !species?.length) return
    let cancelled = false

    // Resolve which species still need a capture (cache miss). Load their GLBs
    // via drei's loader (shares the useGLTF cache with the mesh path), then
    // capture in a microtask so we never block the frame. Each capture is
    // independent; a failed load just leaves that species without an impostor
    // texture (it falls back to mesh in the runtime).
    const pending = species.filter((s) => {
      const key = `${lookName}:${s.species}`
      return !_captureCache.has(key) && s.glbUrl
    })
    if (pending.length === 0) return

    Promise.all(
      pending.map((s) =>
        loadGltf(s.glbUrl)
          .then((gltf) => ({ s, gltf }))
          .catch((err) => {
            console.warn('[captureImpostor] GLB load failed', s.species, s.glbUrl, err)
            return null
          }),
      ),
    ).then((loaded) => {
      if (cancelled) return
      let any = false
      for (const item of loaded) {
        if (!item) continue
        const { s, gltf } = item
        const key = `${lookName}:${s.species}`
        if (_captureCache.has(key)) continue
        try {
          const { scene, heightM } = materializeForCapture(gltf.scene, treeMaterial)
          // Prefer the chassis height from the GLB (exact); fall back to the
          // baked record height. canopyRadius comes from the baked record (the
          // GLB's XZ extent includes stray branches; the record's value is the
          // measured canopy radius the runtime billboard is sized to).
          const tex = renderTreeToTexture(
            gl,
            scene,
            heightM || s.heightM,
            s.canopyRadiusM,
          )
          tex.name = `impostor-capture:${s.species}`
          _captureCache.set(key, tex)
          any = true
        } catch (err) {
          console.warn('[captureImpostor] capture failed', s.species, err)
        }
      }
      if (any && !cancelled) setBump((b) => b + 1)
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, treeMaterial, lookName, sig])

  return useMemo(() => {
    const textures = new Map()
    if (lookName && species?.length) {
      for (const s of species) {
        const tex = _captureCache.get(`${lookName}:${s.species}`)
        if (tex) textures.set(s.species, tex)
      }
    }
    const ready = species?.length ? textures.size === species.length : false
    return { textures, ready }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookName, sig, bump])
}
