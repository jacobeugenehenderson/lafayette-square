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
import { injectHeroImpostorStamp } from './treeAtlasMaterial.js'
import { treeGroundY } from '../utils/elevation'
import { treeDbg } from './OverheadTrees.jsx'

// ⭐ THE CARD STACK — canopy <> trunk/branches <> canopy.
// Jacob's intended design is a SANDWICH: the trunk sits BETWEEN two canopy
// shells, so it can be glimpsed through the front leaves with more canopy
// behind it. That is the strongest intra-tree parallax cue the impostor has.
//
// What ships today is leaf(0.25) → leaf(0.75) → bark(1.0): the trunk is behind
// EVERYTHING, so it can never read between layers. `captureImpostor.js:602`
// cites "ditch the trunk on the near slice, leave it in the rear"
// (Jacob 2026-07-17) — bark at 0.5 still honours that (it is off the near slice
// and behind the front canopy); it just stops being behind the rear shell too.
//
// ⛔ Placement is DECOUPLED from the capture (`impostorGeometry.js:359` — the
// bark layer captures FULL depth), so this is a card-position change and needs
// NO re-shoot. null = use the baked value, so the map is bit-identical until
// someone turns it. Dial by eye: `?barkDepth=0.5`.
export const heroImpostorStack = { barkDepth: null }
export function setHeroImpostorStack({ barkDepth } = {}) {
  heroImpostorStack.barkDepth = Number.isFinite(barkDepth)
    ? Math.max(0, Math.min(1, barkDepth))
    : null
  return { ...heroImpostorStack }
}
if (typeof window !== 'undefined') {
  window.__setHeroImpostorStack = setHeroImpostorStack
  try {
    const v = parseFloat(new URLSearchParams(window.location.search).get('barkDepth'))
    if (Number.isFinite(v)) heroImpostorStack.barkDepth = Math.max(0, Math.min(1, v))
  } catch { /* no URL, no dial */ }
}

const NO_RAYCAST = () => null
const _IDENTITY_QUAT = new THREE.Quaternion()

// ── Lazy asset load (behind the hero shot) — mirrors useOverheadAssets ──────────
// Loads each species' baked layer PNGs (albedo + AO) via TextureLoader in the
// background — no Suspense, so the hero first-frame paints as soon as each species'
// textures resolve. AO is DATA (linear); albedo is colour (sRGB).
const _texCache = new Map()   // url → THREE.Texture
function loadTex(url, { srgb }) {
  if (_texCache.has(url)) return _texCache.get(url)
  // TextureLoader.load() returns the texture BEFORE the image loads and sets
  // needsUpdate itself in its onLoad. Do NOT force needsUpdate here — it makes
  // three try to upload an imageless texture every frame ("no image data found"
  // flood) and the card's map never gets the real pixels → nothing paints.
  const t = new THREE.TextureLoader().load(url)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace
  t.anisotropy = 4
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
          // Bark card position is overridable (see `heroImpostorStack`); leaf
          // shells always keep their baked slice centres.
          cardDepthFrac: (l.kind === 'bark' && heroImpostorStack.barkDepth != null)
            ? heroImpostorStack.barkDepth
            : l.cardDepthFrac,
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

// ── Per-species instanced hero cards ─────────────────────────────────────────
// One species → its instances partitioned by assigned azimuth (variety); each
// (azimuth × layer) is an InstancedMesh of billboarded cards. Matrices are
// TRANSLATION+SCALE only (no rotY) — injectHeroImpostorStamp owns orientation
// (Y-billboard to face the camera). Front leaf shell bright → back darker; the bark
// layer sits at the rear. Relights + sways off the shared atmosphere/wind.
export function HeroImpostorSpecies({ asset, instances, visible = true, opacity = 1 }) {
  const refs = useRef({})
  const invalidate = useThree(s => s.invalidate)

  const rec = useMemo(() => ({
    heightM: asset.heightM || 14,
    canopyRadiusM: asset.canopyRadiusM || 5,
    canopyBaseNorm: asset.canopyBaseNorm,
  }), [asset])

  // Partition instances by assigned azimuth (the variety pool).
  const groups = useMemo(() => {
    const N = asset.azimuths || asset.azSets.length
    const byAz = new Map()
    const has = new Set(asset.azSets.map(s => s.azIdx))
    for (const inst of instances) {
      let az = azimuthForInstance(inst.x, inst.z, N)
      if (!has.has(az)) az = asset.azSets[0].azIdx    // fall back if that azimuth didn't bake
      if (!byAz.has(az)) byAz.set(az, [])
      byAz.get(az).push(inst)
    }
    return byAz
  }, [asset, instances])

  // Draw list: one entry per (azimuth × layer). Each carries its own geometry +
  // relight material + the subset of instances assigned that azimuth.
  const draws = useMemo(() => {
    const out = []
    for (const azSet of asset.azSets) {
      const groupInstances = groups.get(azSet.azIdx) || []
      if (!groupInstances.length) continue
      for (const layer of azSet.layers) {
        const geo = buildHeroImpostorCard(rec, { cardDepthFrac: layer.cardDepthFrac })
        if (!geo) continue
        const bright = layer.kind === 'bark'
          ? 0.8
          : (layer.shellCount > 1 ? 1.0 - 0.4 * (layer.shellIdx / (layer.shellCount - 1)) : 1.0)
        const mat = new THREE.MeshBasicMaterial({
          map: layer.albedoTex, color: new THREE.Color(bright, bright, bright),
          transparent: false, alphaTest: 0.4,
          side: THREE.DoubleSide, depthWrite: true, toneMapped: false,
        })
        injectHeroImpostorStamp(mat, layer.aoTex)
        out.push({ key: `az${azSet.azIdx}_${layer.kind}${layer.shellIdx}`, geo, mat, instances: groupInstances })
      }
    }
    return out
  }, [asset, groups, rec])

  useEffect(() => () => {
    for (const d of draws) { try { d.geo.dispose() } catch {} try { d.mat.dispose() } catch {} }
  }, [draws])

  // Crossfade opacity (impostor→geometry stream swap, Phase 3). Default 1 → untouched.
  useEffect(() => {
    for (const d of draws) {
      const t = opacity < 1
      if (d.mat.transparent !== t) { d.mat.transparent = t; d.mat.needsUpdate = true }
      d.mat.opacity = opacity
      d.mat.depthWrite = !t
    }
  }, [draws, opacity])

  // Fill per-instance matrices: translation + uniform scale, NO rotation (the shader
  // billboards). instanceMatrix[3].xyz is the world pivot the billboard faces from.
  useEffect(() => {
    const pos = new THREE.Vector3(), scl = new THREE.Vector3(), M = new THREE.Matrix4()
    for (const d of draws) {
      const im = refs.current[d.key]
      if (!im) continue
      for (let i = 0; i < d.instances.length; i++) {
        const inst = d.instances[i]
        // ⛔ WAS `typeof inst.y === 'number' ? inst.y : …` — and `inst.y` is the 0 SENTINEL
        // on every slab, so the fallback never fired and every card sat 2.6–34.8 m UNDER
        // the terrain. One shared rule now, same ground the mesh path seats on.
        const y = treeGroundY(inst)
        const s = inst.scale || 1
        pos.set(inst.x, y, inst.z); scl.set(s, s, s)
        M.compose(pos, _IDENTITY_QUAT, scl)
        im.setMatrixAt(i, M)
      }
      im.instanceMatrix.needsUpdate = true
    }
    invalidate()
  }, [draws, invalidate])

  if (!instances.length || !draws.length) return null
  return (
    <>
      {draws.map((d) => (
        <instancedMesh
          key={d.key}
          ref={(el) => { refs.current[d.key] = el }}
          args={[d.geo, d.mat, d.instances.length]}
          visible={visible && !treeDbg('noHeroImpostor')}
          frustumCulled={false}
          castShadow={false}
          receiveShadow={false}
          raycast={NO_RAYCAST}
        />
      ))}
    </>
  )
}
