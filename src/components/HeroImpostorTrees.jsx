/**
 * HeroImpostorTrees — the runtime consumer of the baked HERO canopy impostor (the
 * side-on twin of OverheadTrees). The FOUNDATION: every tree paints as a canopy
 * impostor by default; geometry is layered onto the tall foreground/midground trees
 * (the height × pan-distance split, wired in InstancedTrees).
 *
 * Manifest contract (`trees-atlas.json#heroImpostorBySpecies[species]`):
 *   { heightM, canopyRadiusM, canopyBaseNorm, azimuths, shells,
 *     layers: [ { azIdx, azimuthDeg, kind:'leaf'|'bark', shellIdx, cardDepthFrac,
 *                 albedo, ao } ] }
 * where albedo/ao are `/trees/hero-impostor/<species>/…png` paths (look-prefixed at
 * load, like the mesh GLB URLs + the overhead PNGs).
 *
 * The N azimuths are the per-instance VARIETY pool (Jacob 2026-07-17), NOT a view
 * swap — each instance is assigned ONE fixed azimuth by hash so a species' hundreds
 * of instances aren't identical cards. The card billboards about Y to face the camera
 * and relights from the shared atmosphere (injectOverheadStamp / overheadLightUniforms),
 * exactly like the overhead disc — so the hero canopy tracks the weather + wind.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildHeroImpostorCard } from './impostorGeometry.js'
import { injectOverheadStamp } from './treeAtlasMaterial.js'
import { getElevationRaw } from '../utils/elevation'
import { treeDbg } from './OverheadTrees.jsx'

const NO_RAYCAST = () => null

// ── Lazy asset load (behind the hero shot) — mirrors useOverheadAssets ──────────
// Loads each species' baked layer PNGs (albedo + AO) via TextureLoader in the
// background — no Suspense, so the hero first-frame paints as soon as each species'
// textures resolve. AO is DATA (linear); albedo is colour (sRGB).
const _texCache = new Map()   // url → THREE.Texture
function loadTex(url, { srgb }) {
  if (_texCache.has(url)) return _texCache.get(url)
  const t = new THREE.TextureLoader().load(url)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  _texCache.set(url, t)
  return t
}

/**
 * useHeroImpostorAssets — resolve + lazy-load the baked hero layers for every species
 * in the scene, grouped by azimuth (the variety pool). Returns
 *   Map<species, { heightM, canopyRadiusM, canopyBaseNorm, azimuths, shells,
 *                  azSets: [ { azIdx, layers:[{kind,shellIdx,cardDepthFrac,albedoTex,aoTex}] } ] }>
 * `enabled` gates the whole load so a look without the asset pays nothing.
 */
export function useHeroImpostorAssets({ enabled, lookName, heroImpostorBySpecies, species }) {
  const [ready, setReady] = useState(0)
  const base = import.meta.env.BASE_URL

  const assets = useMemo(() => {
    if (!enabled || !heroImpostorBySpecies || !species?.length) return null
    const out = new Map()
    for (const sp of species) {
      const rec = heroImpostorBySpecies[sp]
      if (!rec?.layers?.length) continue
      const url = (p) => (p && p.startsWith('/trees/') ? `${base}baked/${lookName}${p}` : p)
      // Group the flat layer list by azimuth so the runtime picks one azSet per instance.
      const byAz = new Map()
      for (const l of rec.layers) {
        if (!byAz.has(l.azIdx)) byAz.set(l.azIdx, [])
        byAz.get(l.azIdx).push({
          kind: l.kind, shellIdx: l.shellIdx, shellCount: rec.shells,
          cardDepthFrac: l.cardDepthFrac,
          albedoTex: loadTex(url(l.albedo), { srgb: true }),
          aoTex: loadTex(url(l.ao), { srgb: false }),
        })
      }
      const azSets = [...byAz.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([azIdx, layers]) => ({ azIdx, layers }))
      if (!azSets.length) continue
      out.set(sp, {
        heightM: rec.heightM, canopyRadiusM: rec.canopyRadiusM, canopyBaseNorm: rec.canopyBaseNorm,
        azimuths: rec.azimuths, shells: rec.shells, azSets,
      })
    }
    return out.size ? out : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lookName, heroImpostorBySpecies, species])

  // Re-render once textures finish decoding (async upload lands after the map builds).
  useEffect(() => {
    if (!assets) return
    let live = true
    const texes = []
    for (const a of assets.values()) for (const s of a.azSets) for (const l of s.layers) { texes.push(l.albedoTex, l.aoTex) }
    Promise.all(texes.map(t => t.image ? Promise.resolve() : new Promise(r => { t.onUpdate = r }))).then(() => { if (live) setReady(x => x + 1) })
    return () => { live = false }
  }, [assets])

  return assets
}

// Deterministic per-instance hash → [0, n) for azimuth variety assignment. World-XZ
// seeded so the choice is stable per placement (no reseed across rebuilds) + spatially
// de-correlated (neighbours land on different azimuths → no visible banding).
function azimuthForInstance(x, z, n) {
  if (n <= 1) return 0
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
  return Math.floor((h - Math.floor(h)) * n) % n
}
