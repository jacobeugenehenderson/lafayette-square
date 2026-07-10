/**
 * OverheadTrees — the runtime consumer of the baked overhead SNAPSHOT impostor.
 *
 * Doctrine (HANDOFF-overhead-snapshot-impostor-wireup.md): the 3-slice overhead
 * asset is a PREBAKED per-species Grove asset (authored in the Salon Browse view),
 * poured + cured into the slab. At RUNTIME we read the cured slab's
 * `overheadBySpecies` manifest, LAZY-LOAD its layers in the background (behind the
 * hero shot), and — when the camera pulls up to plan/Browse height — swap the
 * WHOLE scene from mesh trees to the overhead disc-stack (no per-instance role, no
 * culling: in Browse we see all 7,000 trees at once).
 *
 * The asset is instanced exactly like the mesh path: ONE disc-stack per species,
 * instanced across that species' placements (per-instance translate/rotY/scale).
 * The stamps are relit at runtime from the shared atmosphere (overheadLightUniforms)
 * so the plan-view canopy tracks the weather — albedo × (ambient + sun·AO).
 *
 * Manifest contract (`trees-atlas.json#overheadBySpecies[species]`):
 *   { heightM, canopyRadiusM, bands: [ { key, albedo, ao, yLoNorm, yHiNorm } ] }   // bottom→top
 * where `albedo`/`ao` are `/trees/overhead/<species>/…png` paths (look-prefixed at
 * load, same as the mesh GLB URLs). Until persistence populates it, the manifest
 * has no entry → Browse falls back to the mesh (graceful, never blank).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildOverheadBandDisc } from './impostorGeometry.js'
import { injectOverheadStamp, overheadLightUniforms } from './treeAtlasMaterial.js'
import { getElevationRaw } from '../utils/elevation'
import useAtmosphere from '../hooks/useAtmosphere.js'
import useCamera from '../hooks/useCamera'

// ── Weather relight driver ───────────────────────────────────────────────────
// Feeds the shared overheadLightUniforms from the atmosphere directive so the
// plan-view canopy tracks the weather: overcast (high ambient floor) → flat,
// clear (low ambient floor / strong sun) → the baked AO deepens → contrast. Same
// directive the sky (Atmosphere.jsx) + the wind (SwayDriver) read — one weather
// system. No directive (e.g. the Salon, which has no weather) → leaves the shared
// uniforms alone so the Salon's Light slider / the default still governs.
// uAmbient + uSun ≈ 1 keeps brightness; the ratio is the CONTRAST. Curve tunable.
export function OverheadLightDriver({ enabled = true }) {
  useFrame(() => {
    if (!enabled) return
    const d = useAtmosphere.getState().tweenedDirective
    const af = d?.lightDome?.ambientFloor
    if (af == null) return
    const amb = Math.min(0.92, Math.max(0.34, af))
    overheadLightUniforms.uAmbient.value = amb
    overheadLightUniforms.uSun.value = 1.0 - amb
  })
  return null
}

// ── Selection = the CAMERA VIEW, not a height heuristic ───────────────────────
// The swap keys off the app's own view-context signal: useCamera().viewMode. In
// the 'browse' view we show the overhead snapshot imposters; in 'hero'/street we
// render the authored mesh trees (close enough to draw them easily). Browse is
// straight-down by construction (the camera SSOT holds it there), so there's no
// angle/height to guess — this is the browse-vs-hero seam the camera mode already
// carries (the LsoD's Street/Hero/Browse contexts; do NOT invent a parallel one).
// If the user hot-key-overrides Browse into a tilt, billboarding the discs to face
// the camera is a later refinement — for now the view context is the whole gate.
export function useOverheadMode(enabled) {
  const viewMode = useCamera(s => s.viewMode)
  return enabled && viewMode === 'browse'
}

// ── Lazy asset load (behind the hero shot) ───────────────────────────────────
// Loads every species' baked band layers (albedo + AO) via TextureLoader in the
// background — no Suspense, so it never blocks the hero render; the discs simply
// aren't ready until their textures resolve. AO is DATA (occlusion), so it loads
// with linear colour space (no sRGB decode); albedo is colour (sRGB).
const _texCache = new Map()   // `${look}:${url}` → THREE.Texture
function loadTex(url, { srgb }) {
  const key = url
  if (_texCache.has(key)) return _texCache.get(key)
  const t = new THREE.TextureLoader().load(url)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  _texCache.set(key, t)
  return t
}

/**
 * useOverheadAssets — resolve + lazy-load the baked overhead layers for every
 * species present in the scene. Returns Map<species, { heightM, canopyRadiusM,
 * bands:[{key, albedoTex, aoTex, yLoNorm, yHiNorm}] }> (only species with a full
 * manifest record + resolved textures). `enabled` gates the whole load so LS looks
 * without the asset pay nothing.
 */
export function useOverheadAssets({ enabled, lookName, overheadBySpecies, species }) {
  const [ready, setReady] = useState(0)
  const base = import.meta.env.BASE_URL

  const assets = useMemo(() => {
    if (!enabled || !overheadBySpecies || !species?.length) return null
    const out = new Map()
    for (const sp of species) {
      const rec = overheadBySpecies[sp]
      if (!rec?.bands?.length) continue
      const bands = rec.bands.map((b) => {
        const url = (p) => (p.startsWith('/trees/') ? `${base}baked/${lookName}${p}` : p)
        return {
          key: b.key,
          yLoNorm: b.yLoNorm, yHiNorm: b.yHiNorm,
          albedoTex: loadTex(url(b.albedo), { srgb: true }),
          aoTex: loadTex(url(b.ao), { srgb: false }),
        }
      })
      out.set(sp, { heightM: rec.heightM, canopyRadiusM: rec.canopyRadiusM, bands })
    }
    return out.size ? out : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lookName, overheadBySpecies, species])

  // Re-render once the textures finish decoding (they load async; the map is
  // stable but the GPU upload lands later — poke a paint when any resolves).
  useEffect(() => {
    if (!assets) return
    let live = true
    const texes = []
    for (const a of assets.values()) for (const b of a.bands) { texes.push(b.albedoTex, b.aoTex) }
    Promise.all(texes.map(t => t.image ? Promise.resolve() : new Promise(r => { t.onUpdate = r }))).then(() => { if (live) setReady(x => x + 1) })
    return () => { live = false }
  }, [assets])

  return assets
}

// ── Per-species instanced disc-stack ─────────────────────────────────────────
// One OverheadSpecies per rendered species: 3 flat band discs (branch→canopy),
// each an InstancedMesh across that species' placements. Per instance: translate +
// rotY + scale (the pour treatment). Bands bottom→top get a brightness ramp
// (0.3→1.0) so the crown-shadowed lower layers read as depth through the top's
// gaps. Materials relight from the shared atmosphere (injectOverheadStamp).
export function OverheadSpecies({ asset, instances, visible }) {
  const refs = useRef([])
  const invalidate = useThree(s => s.invalidate)

  const discs = useMemo(() => {
    const rec = { heightM: asset.heightM || 14, canopyRadiusM: asset.canopyRadiusM || 5 }
    const n = asset.bands.length
    return asset.bands.map((b, i) => {
      const bright = n > 1 ? 0.3 + 0.7 * (i / (n - 1)) : 1.0
      const geo = buildOverheadBandDisc(rec, { yLoNorm: b.yLoNorm, yHiNorm: b.yHiNorm })
      const mat = new THREE.MeshBasicMaterial({
        map: b.albedoTex, color: new THREE.Color(bright, bright, bright),
        transparent: false, alphaTest: 0.4,
        side: THREE.DoubleSide, depthWrite: true, toneMapped: false,
      })
      injectOverheadStamp(mat, b.aoTex)
      return { key: b.key, geo, mat }
    })
  }, [asset])

  useEffect(() => () => {
    for (const d of discs) { try { d.geo.dispose() } catch {} try { d.mat.dispose() } catch {} }
  }, [discs])

  // Per-instance matrices (translate + rotY + scale) — the same per-placement
  // transform the mesh path bakes, so the disc-stack pours across all placements.
  const matrices = useMemo(() => {
    const arr = new Array(instances.length)
    const T = new THREE.Matrix4(), R = new THREE.Matrix4(), S = new THREE.Matrix4()
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]
      const y = typeof inst.y === 'number' ? inst.y : getElevationRaw(inst.x, inst.z)
      const s = inst.scale || 1
      T.makeTranslation(inst.x, y, inst.z)
      R.makeRotationY(inst.rotY || 0)
      S.makeScale(s, s, s)
      arr[i] = T.multiply(R).multiply(S)
    }
    return arr
  }, [instances])

  useEffect(() => {
    for (let d = 0; d < discs.length; d++) {
      const im = refs.current[d]
      if (!im) continue
      for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i])
      im.instanceMatrix.needsUpdate = true
    }
    invalidate()
  }, [matrices, discs, invalidate])

  if (!instances.length) return null
  return (
    <>
      {discs.map((d, i) => (
        <instancedMesh
          key={d.key}
          ref={(el) => { refs.current[i] = el }}
          args={[d.geo, d.mat, instances.length]}
          visible={visible}
          renderOrder={i}
          frustumCulled={false}
          castShadow={false}
          receiveShadow={false}
        />
      ))}
    </>
  )
}
