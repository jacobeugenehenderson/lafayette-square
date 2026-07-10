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
import { injectOverheadStamp } from './treeAtlasMaterial.js'
import { getElevationRaw } from '../utils/elevation'

// ── Camera-height selection (whole-scene Browse switch, with hysteresis) ──────
// Calibrated against Scene.jsx PRESETS (browse default y≈600m, hero y≈55m). The
// swap needs a DEAD BAND so trees don't pop/thrash when the camera hovers near the
// boundary: rising past HIGH → overhead, falling below LOW → mesh, in-between holds
// whatever it was. (Mirrors the TierDriver altitude read; SEPARATE concern — this
// is a Browse-context representation SELECT, not the retired GeoTierDriver geometry
// swap.)
const OVERHEAD_ENTER_Y = 220   // rise above → snapshot
const OVERHEAD_EXIT_Y  = 150   // fall below → mesh

export function useOverheadMode(enabled) {
  const camera = useThree(s => s.camera)
  const [overhead, setOverhead] = useState(false)
  const ref = useRef(false)
  useFrame(() => {
    if (!enabled) { if (ref.current) { ref.current = false; setOverhead(false) } return }
    const y = camera.position.y
    let next = ref.current
    if (!ref.current && y > OVERHEAD_ENTER_Y) next = true
    else if (ref.current && y < OVERHEAD_EXIT_Y) next = false
    if (next !== ref.current) { ref.current = next; setOverhead(next) }
  })
  return overhead
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
