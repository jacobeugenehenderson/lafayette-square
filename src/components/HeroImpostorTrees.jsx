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
import { loadImpostorTexture } from './impostorTexture.js'
import * as THREE from 'three'
import { buildHeroImpostorCard } from './impostorGeometry.js'
import { injectHeroImpostorStamp } from './treeAtlasMaterial.js'
import { treeGroundRaw } from '../utils/elevation'
import { treeDbg } from './OverheadTrees.jsx'
import { ASSET_BASE } from '../lib/bakedUrl.js'

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
// NO re-shoot. Dial by eye: `?barkDepth=`.
//
// ⭐ DEFAULT 0.5 SINCE 2026-09-04 — the sandwich is now what ships, on the
// operator's direct call at the eye: "trunk is between front and back, like a
// real tree." This slot used to default to null (= the baked 1.0, trunk behind
// everything), which is the arrangement the paragraph above already described as
// NOT the intended design. It is a card position, so nothing re-bakes.
export const heroImpostorStack = { barkDepth: 0.5 }
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
// Page loading lives in `impostorTexture.js` — one place for both the hero cards
// and the overhead discs, because the baked pages are KTX2/ETC1S now and the loader
// choice must not diverge between the two consumers. AO is DATA (linear); albedo is
// colour (sRGB). No Suspense: the hero first frame paints as each species resolves.

/**
 * useHeroImpostorAssets — resolve + lazy-load the baked hero layers for every species
 * in the scene, grouped by azimuth (the variety pool). Returns
 *   Map<species, { heightM, canopyRadiusM, canopyBaseNorm, azimuths, shells,
 *                  azSets: [ { azIdx, layers:[{kind,shellIdx,cardDepthFrac,albedoTex,aoTex}] } ] }>
 * `enabled` gates the whole load so a look without the asset pays nothing.
 */
export function useHeroImpostorAssets({ enabled, lookName, heroImpostorBySpecies, species }) {
  const [ready, setReady] = useState(0)
  const base = ASSET_BASE
  // KTX2 needs the renderer to know the device's block formats before it can load.
  const gl = useThree((st) => st.gl)

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
          albedoTex: loadImpostorTexture(url(l.albedo), { srgb: true, gl }),
          aoTex: loadImpostorTexture(url(l.ao), { srgb: false, gl }),
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
  }, [enabled, lookName, heroImpostorBySpecies, species, gl])

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
        // isBark gates the trunk/ground joint to the woody layer — the card's
        // equivalent of the mesh path's per-vertex vBark gate.
        injectHeroImpostorStamp(mat, layer.aoTex, { isBark: layer.kind === 'bark' })
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
        // ⛔ y = 0 — THE GROUND LIFT IS THE SHADER'S JOB (`OVERHEAD_GROUND_LIFT`), off the
        // live per-shot `uExag`. It was `inst.y` (the 0 sentinel → cards 2.6-34.8 m UNDER the
        // terrain), then a matrix-baked `raw × V_EXAG` (→ up to 52 m OVER it once Browse
        // tweened the ground flat). A constant cannot follow an animated exag; the mesh path
        // never tried to, and that is exactly why it has always seated correctly.
        const s = inst.scale || 1
        pos.set(inst.x, 0, inst.z); scl.set(s, s, s)
        M.compose(pos, _IDENTITY_QUAT, scl)
        im.setMatrixAt(i, M)
      }
      im.instanceMatrix.needsUpdate = true
      // The RAW ground under each card (pre-exag); the shader multiplies by the live uExag.
      const raw = new Float32Array(d.instances.length)
      for (let i = 0; i < d.instances.length; i++) raw[i] = treeGroundRaw(d.instances[i])
      d.geo.setAttribute('aGroundRaw', new THREE.InstancedBufferAttribute(raw, 1))
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
