/**
 * CascadedShadows — N shadow maps across the view range instead of one.
 *
 * ⛔ WHY, and it is arithmetic, not taste. `SHADOW_MAP_SIZE = 4096` over a single box
 * fitted to the whole town is `2·townHalf/4096` = **1.806 m per texel on huron**, so a
 * building's shadow edge can only land on a 1.8 m grid — the staircase. Capping the box by
 * `__maxMPerTexel` fixes the staircase and buys a HARD BOUNDARY instead: beyond the box
 * nothing is shadowed, so shadows wipe off and on as the camera turns (operator, 2026-09-22:
 * "when the camera 'turns a corner' the shadows wipe away/on"). One map cannot be both fine
 * near and far-reaching. Cascades are the only construction that is.
 *
 * ⭐ Built on three's own `examples/jsm/csm`, not hand-rolled: it already owns the split
 * scheme, the per-cascade frustum fit, and — the part that answers the wipe — `fade`, which
 * blends across cascade boundaries instead of cutting.
 *
 * ⛔⛔ THE INTEGRATION HAZARD, and it is the whole reason this is not a two-line mount:
 * `CSM.setupMaterial()` ASSIGNS `material.onBeforeCompile`. This project puts custom
 * `onBeforeCompile` on nearly every receiver — BakedGround (weather, rim fade, lamp pools),
 * SlabBuildings (weather, x-ray dissolve, sky visibility), the tree atlas (billboarding,
 * wind, ground lift), water. A bare `setupMaterial` would DESTROY every one of them and the
 * look would silently collapse. So CSM is applied through `attachCSM` below, which composes
 * rather than replaces — the same "run the previous one first" discipline the terrain
 * displacement patch already uses.
 *
 * ⚠️ GATED. `?csm=1` mounts it; absent, nothing here runs and the single fitted map in
 * `CelestialBodies` is untouched. Cascades change the shadow of every surface in the scene,
 * so they land dark and get eye-gated before they become the default.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CSM } from 'three/examples/jsm/csm/CSM.js'

/** `?csm=1` → cascades on. Read once, at module load. */
export const CSM_ENABLED = (() => {
  try { return new URLSearchParams(window.location.search).get('csm') === '1' }
  catch { return false }
})()

// ⛔⛔ EVERY CASCADE COSTS ONE FRAGMENT TEXTURE UNIT ON EVERY RECEIVER, AND THIS SCENE HAS
// ALMOST NO HEADROOM. Measured 2026-09-22 at 3 cascades:
//   "FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)"
//   → VALIDATE_STATUS false → the program does not link → NOTHING DRAWS.
// BakedGround alone binds map + lightmap + poolmap + colormap + ground-fx + weather; the
// buildings bind their own. Three shadow samplers on top blows the 16-unit ceiling.
// ⚠️ This is the SAME class that once made every tree vanish — the tree shader sat at
// exactly MAX_VERTEX_ATTRIBS=16 and one more attribute killed the link (see
// treeAtlasMaterial's `aWindRadialNorm` note). ⛔ The ceiling is the design constraint here,
// not an implementation detail: cascades are not free per-cascade, they are free only while
// units remain.
// ▶ `?cascades=N` to sweep. Default 2 — the most that has any chance of linking here.
export const CSM_CASCADES = (() => {
  try {
    const v = parseInt(new URLSearchParams(window.location.search).get('cascades'), 10)
    return Number.isFinite(v) && v >= 1 && v <= 4 ? v : 2
  } catch { return 2 }
})()

// The live CSM instance, published so material owners can attach without prop-drilling
// through every consumer. ⛔ One instance, one publisher — the same discipline
// `sceneStencilState` and `groundColorState` use.
if (typeof window !== 'undefined') window.__csmModule = 'loaded'
let _csm = null
const _pending = new Set()
const _attached = new Set()

/**
 * Compose CSM's shader patch onto a material that already has its own.
 * ⛔ NEVER call `csm.setupMaterial` directly — it assigns `onBeforeCompile` and would drop
 * the material's existing patch. This keeps both: ours runs, then CSM's.
 * Safe to call before CSM exists; the material is queued and attached on mount.
 */
export function attachCSM(material) {
  if (!CSM_ENABLED || !material || material.userData.__csmAttached) return material
  material.userData.__csmAttached = true
  if (_csm) _apply(_csm, material)
  else _pending.add(material)
  return material
}

function _apply(csm, material) {
  const prev = material.onBeforeCompile
  csm.setupMaterial(material)          // assigns its own onBeforeCompile + defines
  const mine = material.onBeforeCompile
  material.onBeforeCompile = function (shader, renderer) {
    if (typeof prev === 'function') prev.call(this, shader, renderer)
    mine.call(this, shader, renderer)
  }
  // The program cache key must move with the defines, or a material compiled before CSM
  // attached is served from cache without the cascade sampling.
  const prevKey = material.customProgramCacheKey
  material.customProgramCacheKey = () =>
    `${typeof prevKey === 'function' ? prevKey.call(material) : ''}-csm${csm.cascades}${csm.fade ? 'f' : ''}`
  material.needsUpdate = true
  _attached.add(material)
}

export default function CascadedShadows({ lightDirection, keyIntensity = 1, keyColor = null,
                                          cascades = CSM_CASCADES, maxFar = 1200, shadowMapSize = 2048 }) {
  if (typeof window !== 'undefined') window.__csmRendered = (window.__csmRendered || 0) + 1
  const camera = useThree(s => s.camera)
  const scene = useThree(s => s.scene)
  const dirRef = useRef(new THREE.Vector3(1, -1, 1).normalize())

  const csm = useMemo(() => new CSM({
    maxFar,
    cascades,
    mode: 'practical',
    parent: scene,
    shadowMapSize,
    camera,
    lightDirection: dirRef.current.clone(),
  }), [scene, camera, cascades, maxFar, shadowMapSize])

  useEffect(() => {
    if (typeof window !== 'undefined') window.__csmMounted = (window.__csmMounted || 0) + 1
    csm.fade = true                    // blend across cascade boundaries — answers the wipe
    csm.updateFrustums()
    _csm = csm
    for (const m of _pending) _apply(csm, m)
    _pending.clear()
    return () => { _csm = null; csm.remove(); csm.dispose?.() }
  }, [csm])

  // ⛔⛔ CSM IS THE KEY LIGHT, NOT AN ADDITION TO IT. `createLights()` makes one
  // DirectionalLight PER CASCADE at full intensity and adds them to the scene. Left beside
  // the existing key that is 1 + N lights on every surface — huron at noon runs dirSun 1.5,
  // so three cascades took the scene to ~4.5× and the ground blew out white. That is not
  // "cascades look bad", it is four suns. (Operator, 2026-09-22: "same bright ground with
  // no shadows" — the shadows were there and invisible against the blowout.)
  // ⭐ So the cascade lights CARRY the key's intensity and colour, and `CelestialBodies`
  // zeroes its own directional under `?csm=1`. One key, still — just split across N frusta.
  // ⛔ And the per-cascade intensity is the KEY's, not a share of it: CSMShader selects
  // exactly ONE cascade per fragment, so they never sum. Dividing would darken the scene.
  useFrame(() => {
    for (const l of csm.lights) {
      l.intensity = keyIntensity
      if (keyColor) l.color.copy(keyColor)
    }
    if (lightDirection) {
      // ⛔ ONE KEY, ONE PUBLISHER. The direction comes from the same vector
      // `CelestialBodies` builds its <directionalLight> from — never re-derived here.
      dirRef.current.copy(lightDirection).normalize().multiplyScalar(-1)
      csm.lightDirection.copy(dirRef.current)
    }
    csm.update()
    csm.updateUniforms()
    // ⚠️ TEMPORARY DIAGNOSTIC — REVERT. Reports the rig's real state so "no change" can be
    // read instead of guessed at.
    if (typeof window !== 'undefined') {
      window.__csmState = {
        enabled: CSM_ENABLED,
        mounted: !!_csm,
        lights: csm.lights.length,
        lightIntensity: csm.lights[0]?.intensity,
        castShadow: csm.lights.map(l => l.castShadow),
        attachedMaterials: _attached.size,
        pendingMaterials: _pending.size,
        keyFromCelestial: window.__csmKey,
        breaks: csm.breaks?.map(b => +b.toFixed(3)),
        camFar: camera.far,
        lightDir: csm.lightDirection.toArray().map(n => +n.toFixed(2)),
      }
    }
  })

  return null
}
