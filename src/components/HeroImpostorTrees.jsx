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
import { useThree } from '@react-three/fiber'
import { useTownFrame } from '../lib/useTownFrame.js'
import { loadImpostorTexture, pageArrived, pageFailed } from './impostorTexture.js'
import { markFailed } from '../lib/startupMarks.js'
import * as THREE from 'three'
import { buildHeroImpostorCard, HERO_FRAME_VERSION } from './impostorGeometry.js'
import { injectHeroImpostorStamp } from './treeAtlasMaterial.js'
import { groundPairs } from '../utils/elevation'
import { anchoredRaw } from '../lib/anchorGate.js'
import { treeDbg } from './OverheadTrees.jsx'
import { slabUrl } from '../lib/slabUrl.js'
import { buildCells, planesOf, visibleCells, sameSet, windReachM, floorReachPx, treeCull } from '../lib/treeCells.js'
import { treeWindUniforms } from './treeAtlasMaterial.js'
import { terrainExag } from '../utils/terrainShader.js'
import { getLiveWind, WIND_SPRING } from '../lib/windSheet.js'
import { getSceneStencil } from './sceneStencilState.js'

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
  // KTX2 needs the renderer to know the device's block formats before it can load.
  const gl = useThree((st) => st.gl)

  const assets = useMemo(() => {
    if (!enabled || !heroImpostorBySpecies || !species?.length) return null
    const out = new Map()
    const stale = []
    const noDepth = []
    for (const sp of species) {
      const rec = heroImpostorBySpecies[sp]
      if (!rec?.layers?.length) continue
      const url = (p) => (p && p.startsWith('/trees/') ? slabUrl(lookName, p) : p)
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
          aoTex: loadImpostorTexture(url(l.ao), { srgb: false, gl, channels: l.aoDepth ? 'rg' : null }),
          // The page's depth range (m, tree-local); 0 = this layer carries no depth (a capture older than hero format 7).
          depthHalfM: l.aoDepth ? (rec.depth?.halfM ?? 0) : 0,
        })
      }
      const azSets = [...byAz.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([azIdx, layers]) => ({ azIdx, layers }))
      if (!azSets.length) continue
      if (rec.frame?.v !== HERO_FRAME_VERSION) stale.push(sp)
      if (!rec.depth?.halfM || !rec.layers.every((l) => l.aoDepth)) noDepth.push(sp)
      out.set(sp, {
        heightM: rec.heightM, canopyRadiusM: rec.canopyRadiusM, canopyBaseNorm: rec.canopyBaseNorm,
        frame: rec.frame ?? null,
        azimuths: rec.azimuths, shells: rec.shells, azSets,
      })
    }
    if (stale.length) console.error(`[HeroImpostorTrees] ⛔ ${lookName}: hero cards shot before the ground frame — ${stale.join(', ')}. `
      + `Their trunks stop above the ground until the Grove re-shoots them (Bake → Slab in the Grove).`)
    // ⛔ A hero card without its depth page draws as a flat plane (the chopping it was baked to end). Loud, not silent.
    if (noDepth.length) console.error(`[HeroImpostorTrees] ⛔ ${lookName}: hero cards with no depth page — ${noDepth.join(', ')}. `
      + `They slice neighbouring crowns as flat planes until the Grove re-shoots them (Bake → Slab in the Grove).`)
    return out.size ? out : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lookName, heroImpostorBySpecies, species, gl])

  // ⭐ ARRIVED = every page's image has landed (impostorTexture.js#pageArrived, read off the texture itself). It
  // re-renders the consumer once, and it is what the reveal reads for the trees (InstancedTrees → `prepared:trees`).
  // ⛔ It waited on `texture.onUpdate` — the GPU UPLOAD — which a tree held hidden for the reveal never does.
  const [arrived, setArrived] = useState(false)
  useEffect(() => { setArrived(false) }, [assets])
  useTownFrame(() => {
    if (!assets || arrived) return
    let all = true
    for (const a of assets.values()) for (const s of a.azSets) for (const l of s.layers) for (const t of [l.albedoTex, l.aoTex]) {
      if (pageFailed(t)) markFailed('trees', `a hero card page did not arrive (${a.heightM != null ? 'species page' : 'page'})`)
      if (!pageArrived(t)) all = false
    }
    if (all) { setArrived(true); setReady((x) => x + 1) }
  })

  return { assets, arrived }
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
// Front shell keeps the shipped 20×20; the occluded layers drop to a flat quad that
// still leans. Both overridable from the URL so the canopy can be eye-gated live.
const _q = (k, d) => {
  try {
    const v = parseInt(new URLSearchParams(window.location.search).get(k), 10)
    return Number.isFinite(v) && v > 0 ? v : d
  } catch { return d }
}
// ⭐ EYE-GATED DEFAULTS (Jacob, 2026-09-22, on huron at the hero pan and at rest):
// front 8 / back 1 = 2.32 M tris/frame against the shipped 20/20/20's 42.18 M — 18×.
// His verdict: "we can see 8 when the camera is still and with some finessing it would
// probably be worth it. However: the pan hides the effect and what we get from simple
// parallax from the layered cards does all the work."
// ⇒ The flutter's spatial detail is only legible at rest; during motion the layered
// cards' parallax carries the canopy, so the fine grid is paying for something the shot
// hides. ⛔ AMPLITUDE IS FREE — the Look's treeWind figures are uniforms, so
// a coarser grid is compensated by turning Amplitude UP, not by more triangles.
const _PV = new THREE.Matrix4()
// The disc the cells tile: the town's stencil radius when the ground has published it, else this draw's own extent.
function discRadiusOf(list) {
  const st = getSceneStencil()
  if (st?.radius > 0) return st.radius
  let r = 0, cx = 0, cz = 0
  for (const t of list) { cx += t.x; cz += t.z } cx /= Math.max(1, list.length); cz /= Math.max(1, list.length)
  for (const t of list) r = Math.max(r, Math.hypot(t.x - cx, t.z - cz))
  return Math.max(r, 1)
}
const FRONT_GRID = _q('frontGrid', 8)
const BACK_GRID  = _q('backGrid', 1)

export function HeroImpostorSpecies({ asset, instances, visible = true, opacity = 1 }) {
  const refs = useRef({})
  const invalidate = useThree(s => s.invalidate)

  const rec = useMemo(() => ({
    heightM: asset.heightM || 14,
    canopyRadiusM: asset.canopyRadiusM || 5,
    canopyBaseNorm: asset.canopyBaseNorm,
    frame: asset.frame,
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
        // ⭐⭐ THE FRONT-SHELL LEVER (Jacob, 2026-08-28: "only the FRONT leaf shell needs
        // to flutter; the under shell and bark can be flat cards").
        // The card's tessellation exists for ONE term: the flutter (CARD_FLUTTER_VERTEX,
        // the wind sheet's windDetail at `position.xz`) needs interior vertices to warp. Hula and lean scale by `aTreeHeightNorm` and survive on a
        // 2×2 card, so a flat under-shell still LEANS with the wind, it just stops
        // paying for per-vertex flutter nobody can see through the front shell's
        // alphaTest. ⛔ Not a blanket cut: a previous attempt flattened EVERY layer and
        // the canopy went visibly dead (reverted, c0056ffd) — the front shell's flutter
        // is the motion the operator actually sees.
        // ⛔ Derived from the layer's own role, not a scene name: shellIdx 0 of a leaf
        // layer is the front shell on every town. `?frontGrid=` / `?backGrid=` override
        // for eye-gating; defaults leave the front shell exactly as it shipped.
        const isFrontShell = layer.kind !== 'bark' && (layer.shellIdx ?? 0) === 0
        const geo = buildHeroImpostorCard(rec, {
          cardDepthFrac: layer.cardDepthFrac,
          grid: isFrontShell ? FRONT_GRID : BACK_GRID,
        })
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
        injectHeroImpostorStamp(mat, layer.aoTex, { isBark: layer.kind === 'bark', depthHalfM: layer.depthHalfM, heroHalfM: geo.userData.heroHalfM })
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
      const ground = groundPairs(d.instances, t => anchoredRaw(t, 'tree'))
      d.geo.setAttribute('aGround', new THREE.InstancedBufferAttribute(ground.slice(), 2))
      // The per-tree lamp light the bake stamped (`lampGlow`, src/lib/lampPool.js) — the same value the mesh path reads.
      const glow = new Float32Array(d.instances.length)
      for (let i = 0; i < d.instances.length; i++) glow[i] = Number(d.instances[i].lampGlow) || 0
      d.geo.setAttribute('aLampGlow', new THREE.InstancedBufferAttribute(glow.slice(), 1))
      // ⭐ THE CULL'S SOURCE (src/lib/treeCells.js): the full arrays, kept, and the cells built once over this draw's instances.
      // A card's static reach = half its card at its own scale (the card spans the canopy: max(height, 2 × canopy radius) / 2).
      const half = Math.max(rec.heightM, 2 * rec.canopyRadiusM) / 2
      let rawLo = Infinity, rawHi = -Infinity, yLo = Infinity, yHi = -Infinity, sMax = 0
      for (let i = 0; i < d.instances.length; i++) { const r = ground[2 * i], y = ground[2 * i + 1], sc = d.instances[i].scale || 1
        rawLo = Math.min(rawLo, r); rawHi = Math.max(rawHi, r); yLo = Math.min(yLo, y); yHi = Math.max(yHi, y); sMax = Math.max(sMax, sc) }
      d.full = { mat: im.instanceMatrix.array.slice(), ground, glow, n: d.instances.length, rawLo, rawHi, yLo, yHi, topM: rec.heightM * sMax }
      d.cells = buildCells(d.instances.map((t) => ({ x: t.x, z: t.z, reach: half * (t.scale || 1) })), discRadiusOf(d.instances)).cells
      d.vis = null
    }
    invalidate()
  }, [draws, invalidate])

  // ⭐ DRAW ONLY THE TREES THE FRAME CAN SHOW (src/lib/treeCells.js). Each frame tests the cells; a draw's buffers are rewritten
  // only when its set of visible cells changes. ⛔ Not-yet (no live wind: the sheet is not mounted) culls nothing.
  useTownFrame(({ camera, gl }) => {
    // OFF (the probe's A/B, or ?treeDebug=noCull): every instance, once, then nothing.
    if (!treeCull.on || treeDbg('noCull')) {
      for (const d of draws) { const im = refs.current[d.key]; if (!im || !d.full || d.vis === 'all') continue
        im.instanceMatrix.array.set(d.full.mat); d.geo.attributes.aGround.array.set(d.full.ground); d.geo.attributes.aLampGlow.array.set(d.full.glow)
        im.count = d.full.n; im.instanceMatrix.needsUpdate = true; d.geo.attributes.aGround.needsUpdate = true; d.geo.attributes.aLampGlow.needsUpdate = true; d.vis = 'all' }
      return
    }
    const live = getLiveWind()
    if (!live?.ws || !camera.isPerspectiveCamera) return
    const ws = live.ws, z = WIND_SPRING.DAMPING
    // the strongest felt wind: base + the gust peak, × the sheet spring's own overshoot (a damped spring: e^(−ζπ/√(1−ζ²)))
    const feltMax = (ws.baseSpeedMps + ws.gustsScale * (ws.gustEnvelope ?? 1)) * (1 + Math.exp(-z * Math.PI / Math.sqrt(1 - z * z)))
    const tw = { leanRefM: treeWindUniforms.uTreeWindLeanRefM.value, leanPerMps: treeWindUniforms.uTreeWindLeanPerMps.value,
      flutterRefM: treeWindUniforms.uTreeWindFlutRefM.value, flutterPerMps: treeWindUniforms.uTreeWindFlutPerMps.value, floorPx: treeWindUniforms.uTreeWindFloorPx.value }
    camera.updateMatrixWorld()
    const planes = planesOf(_PV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements)
    const H = gl.domElement.height, k = 2 * Math.tan((camera.fov * Math.PI) / 360) / Math.max(1, H)
    const ex = terrainExag.value, camPos = [camera.position.x, camera.position.y, camera.position.z]
    const windM = windReachM(tw, feltMax), pxMargin = floorReachPx(tw)
    for (const d of draws) {
      const im = refs.current[d.key]
      if (!im || !d.full || !d.cells) continue
      const f = d.full
      const yLo = Math.min(f.rawLo * ex, f.rawHi * ex) + f.yLo, yHi = Math.max(f.rawLo * ex, f.rawHi * ex) + f.yHi + f.topM
      const vis = visibleCells(d.cells, planes, { yLo, yHi, windM, pxMargin, camPos, metresPerPx: (dist) => dist * k })
      if (sameSet(vis, d.vis)) continue
      d.vis = vis
      const mat = im.instanceMatrix.array, gr = d.geo.attributes.aGround.array, gw = d.geo.attributes.aLampGlow.array
      let n = 0
      for (let c = 0; c < d.cells.length; c++) {
        if (!vis[c]) continue
        for (const i of d.cells[c].idx) { mat.set(f.mat.subarray(16 * i, 16 * i + 16), 16 * n); gr[2 * n] = f.ground[2 * i]; gr[2 * n + 1] = f.ground[2 * i + 1]; gw[n] = f.glow[i]; n++ }
      }
      im.count = n
      im.instanceMatrix.needsUpdate = true; d.geo.attributes.aGround.needsUpdate = true; d.geo.attributes.aLampGlow.needsUpdate = true
    }
  }, undefined, 'hero impostor cull')

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
