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
import { loadImpostorTexture, pageArrived, pageFailed } from './impostorTexture.js'
import { markFailed } from '../lib/startupMarks.js'
import * as THREE from 'three'
import { buildOverheadBandDisc } from './impostorGeometry.js'
import { OVERHEAD_ALPHA_TEST } from './overheadCore.js'
import { injectOverheadStamp, overheadLightUniforms, litCards, treeWindUniforms } from './treeAtlasMaterial.js'
import { treeGroundRaw, groundPairs } from '../utils/elevation'
import useAtmosphere from '../hooks/useAtmosphere.js'
import useSkyState from '../hooks/useSkyState.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { resolveGroupAtMinute, getTodSlotMinutes } from '../cartograph/animatedParam.js'
import { CANOPY_FIELD_KEYS, CANOPY_FLAT_DEFAULTS, TREE_WIND_FIELD_KEYS, TREE_WIND_FLAT_DEFAULTS, kitDayChannel } from '../cartograph/skyLightChannels.js'

// Boot-time envelope for a look whose slab predates the channel — identical to what
// bake-scene emits for an unauthored town, so first paint matches the bake rather
// than flashing a different canopy for a frame.
const CANOPY_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('canopy'))
const TREE_WIND_DEFAULT_CHANNEL = Object.freeze(kitDayChannel('treeWind'))
import { useTownShot } from './townContext.js'
import { slabUrl } from '../lib/slabUrl.js'

// ── Debug instrument (dev-only; ?treeDebug=flag,flag — NEVER affects prod) ────
// Names the "chips": ?treeDebug=bandTint tints the 3 overhead bands branch=red /
// mid=green / canopy=blue so you can see WHICH slice draws a fragment; ?treeDebug=
// noBand:branch (or mid/canopy) hides that band. Path-level toggles live in
// InstancedTrees.jsx (noMesh/noImpostor/noOverhead). Kit-generic, any scene.
const _DBG = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
export const treeDbg = (k) => { const v = _DBG.get('treeDebug'); return v ? v.split(',').includes(k) : false }
// Valued sibling — `?meshLod=far`. treeDbg answers yes/no; some
// instruments need a NUMBER, and an eye-gate that cannot be swept is not an instrument.
export const treeDbgVal = (k) => _DBG.get(k)
const BAND_DEBUG_COLOR = [[1, 0.15, 0.15], [0.15, 1, 0.15], [0.3, 0.5, 1]]  // branch / mid / canopy

// Overhead discs are impostor billboards, never pick targets — disabling raycast
// lets top-down clicks pass THROUGH to whatever they're a stand-in for (in the
// Grove, the ground selection plate; in the slab, the ground/buildings).
const NO_RAYCAST = () => null
const _lp = new THREE.Vector3(), _tp = new THREE.Vector3()

// ── Weather relight driver ───────────────────────────────────────────────────
// Feeds the shared overheadLightUniforms from the atmosphere directive so the
// plan-view canopy tracks the weather: overcast (high ambient floor) → flat,
// clear (low ambient floor / strong sun) → the baked AO deepens → contrast. Same
// directive the sky (Atmosphere.jsx) reads — one weather
// system. No directive (e.g. the Salon, which has no weather) → leaves the shared
// uniforms alone so the Salon's Light slider / the default still governs.
// uAmbient + uSun sum to 1: the ratio is the CONTRAST. The BRIGHTNESS is the scene's own lights (below).
export function OverheadLightDriver({ enabled = true, canopyChannel }) {
  // The AUTHORED canopy response, resolved per frame against the live TOD minute —
  // the same `resolveGroupAtMinute` every other look channel uses (dirSun, ambient,
  // bloom…). ⭐ The operator's Stage edit is what the map ships with; the URL dial
  // is only an override on top, so a look that authors `directional: 0.8` renders
  // that way for every viewer, with nothing to remember to append.
  const resolved = canopyChannel ?? CANOPY_DEFAULT_CHANNEL
  const scene = useThree((st) => st.scene)
  const lights = useRef({ list: [], age: Infinity })

  useFrame(() => {
    if (!enabled) return

    // ── BRIGHTNESS — what the scene's own lights deliver ──────────────────────
    // The cards are MeshBasic, so no light reaches them; this hands them the diffuse an up-facing
    // MeshStandard surface gets from the live rig — ambient + hemisphere sky + each directional
    // light × its elevation, ÷ π — so a card is as lit as the ground under it (see uSceneLight).
    // Lights mount and unmount rarely; the scene is re-walked for them twice a second, not per frame.
    const lr = lights.current
    if (++lr.age > 30) {
      lr.list = []
      scene.traverse((o) => { if (o.isAmbientLight || o.isHemisphereLight || o.isDirectionalLight) lr.list.push(o) })
      lr.age = 0
    }
    const out = overheadLightUniforms.uSceneLight.value.setRGB(0, 0, 0)
    for (const l of lr.list) {
      if (!l.visible || !(l.intensity > 0)) continue
      let k = l.intensity
      if (l.isDirectionalLight) {
        l.getWorldPosition(_lp); l.target.getWorldPosition(_tp)
        k *= Math.max(0, _lp.sub(_tp).normalize().y)
      }
      out.r += l.color.r * k; out.g += l.color.g * k; out.b += l.color.b * k
    }
    out.multiplyScalar(1 / Math.PI)

    // ── The authored channel → the shared card uniforms ───────────────────────
    // ⛔ A live override (?litCards / __setLitCards) WINS, and is deliberately
    // sticky: the operator A/B-ing on the pan must not have their dial silently
    // overwritten every frame by the baked value they are comparing against.
    if (!litCards.overridden) {
      const tod = useTimeOfDay.getState()
      const minute = tod.getMinuteOfDay()
      const slotMinutes = resolved.animated ? getTodSlotMinutes(tod.currentTime) : null
      const c = resolveGroupAtMinute(resolved, minute, slotMinutes, CANOPY_FIELD_KEYS, CANOPY_FLAT_DEFAULTS)
      overheadLightUniforms.uLitCards.value  = c.directional ?? 0
      overheadLightUniforms.uKeyGain.value   = c.gain ?? CANOPY_FLAT_DEFAULTS.gain
      overheadLightUniforms.uCardBulge.value = c.bulge ?? CANOPY_FLAT_DEFAULTS.bulge
    }

    // ── DIRECTION — where the light actually is ────────────────────────────────
    // Read, never derived. `useSkyState.keyDirection` is published by
    // CelestialBodies off the very `primary.lightPosition` its <directionalLight>
    // is built from, so the cards and the mesh trees light from ONE fact: the sun
    // by day, the sun→moon blend after dusk. ⛔ Recomputing a sun vector here
    // would be a second derivation of one physical quantity — the defect class
    // that produced both the tree-height bug and the capture-frame bug.
    // Runs unconditionally (not behind the directive check below) so the Salon,
    // which has no weather, still gets a real light direction.
    const sky = useSkyState.getState()
    overheadLightUniforms.uKeyDir.value.copy(sky.keyDirection)
    overheadLightUniforms.uKeyColor.value.copy(sky.keyColor)

    // ── CONTRAST — how hard that light is ─────────────────────────────────────
    const d = useAtmosphere.getState().tweenedDirective
    const af = d?.lightDome?.ambientFloor
    if (af == null) return
    const amb = Math.min(0.92, Math.max(0.34, af))
    overheadLightUniforms.uAmbient.value = amb
    overheadLightUniforms.uSun.value = 1.0 - amb
  })
  return null
}

// ── TREE WIND — the Look's channel → the shared tree-wind uniforms (treeAtlasMaterial.js#treeWindUniforms) ─────────
// Every tree program (cards and mesh) reads those uniforms by reference, so one write per frame moves them all.
// Resolved per frame against the live TOD minute, like every look channel; the per-shot fork is already applied to
// `scene` (useSceneJson), and Stage's live edit arrives as `channel` before a bake. A slab baked before the channel
// existed boots on exactly what bake-scene emits for an unauthored town (kitDayChannel('treeWind')).
const TREE_WIND_UNIFORM_OF = {
  floorPx: 'uTreeWindFloorPx',
  leanRefM: 'uTreeWindLeanRefM', leanPerMps: 'uTreeWindLeanPerMps', flutterRefM: 'uTreeWindFlutRefM',
  flutterPerMps: 'uTreeWindFlutPerMps', meshRustleM: 'uTreeWindMeshRustleM', meshSwayPerMps: 'uTreeWindMeshSwayPerMps',
  meshLeanShare: 'uTreeWindMeshLeanShare',
}
export function TreeWindDriver({ channel }) {
  const resolved = channel ?? TREE_WIND_DEFAULT_CHANNEL
  useFrame(() => {
    const tod = useTimeOfDay.getState()
    const slotMinutes = resolved.animated ? getTodSlotMinutes(tod.currentTime) : null
    const c = resolveGroupAtMinute(resolved, tod.getMinuteOfDay(), slotMinutes, TREE_WIND_FIELD_KEYS, TREE_WIND_FLAT_DEFAULTS)
    for (const k of TREE_WIND_FIELD_KEYS) treeWindUniforms[TREE_WIND_UNIFORM_OF[k]].value = c[k] ?? TREE_WIND_FLAT_DEFAULTS[k]
  })
  return null
}

// ── Selection = the CAMERA VIEW, not a height heuristic ───────────────────────
// The swap keys off the shot the town is drawn in (<Town>'s context, townContext.js). In
// the 'browse' view we show the overhead snapshot imposters; in 'hero'/street we
// render the authored mesh trees (close enough to draw them easily). Browse is
// straight-down by construction (the camera SSOT holds it there), so there's no
// angle/height to guess — this is the browse-vs-hero seam the camera mode already
// carries (the LsoD's Street/Hero/Browse contexts; do NOT invent a parallel one).
// If the user hot-key-overrides Browse into a tilt, billboarding the discs to face
// the camera is a later refinement — for now the view context is the whole gate.
// ⛔ IT READS the shot <Town> is drawn in (its context), the same in every app — never the old
// player's `viewMode`. Reading viewMode is what kept Preview's Browse on the hero cards and
// never drew the overhead discs (Jacob, 2026-08-28), because only production drives it.
export function useOverheadMode(enabled) {
  const viewMode = useTownShot()
  return enabled && viewMode === 'browse'
}

// ── Asset load (prepared with the trees, behind the emblem) ─────────────────
// Page loading lives in `impostorTexture.js` — shared with the hero cards, because
// the baked pages are KTX2/ETC1S now and the two consumers must not diverge.

/**
 * useOverheadAssets — resolve + load the baked overhead layers for every
 * species present in the scene. Returns { assets: Map<species, { heightM, canopyRadiusM,
 * bands:[{key, albedoTex, aoTex, yLoNorm, yHiNorm}] }> (only species with a full
 * manifest record + resolved textures), arrived }. `enabled` gates the whole load so LS looks
 * without the asset pay nothing.
 */
export function useOverheadAssets({ enabled, lookName, overheadBySpecies, species }) {
  const [ready, setReady] = useState(0)
  // KTX2 needs the renderer to know the device's block formats before it can load.
  const gl = useThree((st) => st.gl)

  const assets = useMemo(() => {
    if (!enabled || !overheadBySpecies || !species?.length) return null
    const out = new Map()
    for (const sp of species) {
      const rec = overheadBySpecies[sp]
      if (!rec?.bands?.length) continue
      // ⛔ A band below the top with no baked DEEP CORE (overheadCore.js) is a capture older than
      // CAPTURE_FORMAT overhead 6. It still draws, as shot, but never silently: a re-bake of the Grove clears it.
      const stale = rec.bands.slice(0, -1).filter((b) => !b.core).map((b) => b.key)
      if (stale.length) console.error(`[overhead] ⛔ ${lookName}/${sp}: band(s) ${stale.join(', ')} carry no baked deep core — `
        + 'a capture older than the core; re-bake the Grove (Bake → Slab) to re-shoot it')
      const bands = rec.bands.map((b) => {
        const url = (p) => (p && p.startsWith('/trees/') ? slabUrl(lookName, p) : p)
        return {
          key: b.key,
          yLoNorm: b.yLoNorm, yHiNorm: b.yHiNorm,
          albedoTex: loadImpostorTexture(url(b.albedo), { srgb: true, gl }),
          aoTex: loadImpostorTexture(url(b.ao), { srgb: false, gl }),
        }
      })
      out.set(sp, { heightM: rec.heightM, canopyRadiusM: rec.canopyRadiusM, bands })
    }
    return out.size ? out : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lookName, overheadBySpecies, species, gl])

  // ⭐ ARRIVED = every page's image has landed (impostorTexture.js#pageArrived, read off the texture itself), as the
  // hero cards do. It re-renders the consumer once, and it is part of what the reveal reads for the trees
  // (InstancedTrees → `prepared:trees`): the discs are uploaded behind the emblem, so the first Browse flight draws
  // nothing new. ⛔ It waited on `texture.onUpdate` — the GPU upload — which a disc held hidden in the hero shot never does.
  const [arrived, setArrived] = useState(false)
  useEffect(() => { setArrived(false) }, [assets])
  useFrame(() => {
    if (!assets || arrived) return
    let all = true
    for (const a of assets.values()) for (const b of a.bands) for (const t of [b.albedoTex, b.aoTex]) {
      if (pageFailed(t)) markFailed('trees', 'an overhead disc page did not arrive')
      if (!pageArrived(t)) all = false
    }
    if (all) { setArrived(true); setReady((x) => x + 1) }
  })

  return { assets, arrived }
}

// ── Per-species instanced disc-stack ─────────────────────────────────────────
// One OverheadSpecies per rendered species: 3 flat band discs (branch→canopy),
// each an InstancedMesh across that species' placements. Per instance: translate +
// rotY + scale (the pour treatment). Bands bottom→top get a brightness ramp
// (0.3→1.0) so the crown-shadowed lower layers read as depth through the top's
// gaps. Materials relight from the shared atmosphere (injectOverheadStamp).
export function OverheadSpecies({ asset, instances, opacity = 1 }) {
  const refs = useRef([])
  const invalidate = useThree(s => s.invalidate)

  const discs = useMemo(() => {
    const rec = { heightM: asset.heightM, canopyRadiusM: asset.canopyRadiusM }
    const n = asset.bands.length
    return asset.bands.map((b, i) => {
      const bright = n > 1 ? 0.3 + 0.7 * (i / (n - 1)) : 1.0
      const geo = buildOverheadBandDisc(rec, { yLoNorm: b.yLoNorm, yHiNorm: b.yHiNorm })
      // Debug: solid-tint each band to name the "chips". Keep the albedo map so the
      // real silhouette + alphaTest still read (that's what shows WHICH pixels are
      // the artifact); only the COLOR is overridden. Skip the AO relight so the tint
      // is pure (leaving it on zeroed alpha → nothing drew, the first bandTint bug).
      const dbgC = treeDbg('bandTint') ? (BAND_DEBUG_COLOR[i] || [1, 1, 0]) : null
      const mat = new THREE.MeshBasicMaterial({
        map: b.albedoTex,
        color: dbgC ? new THREE.Color(dbgC[0], dbgC[1], dbgC[2]) : new THREE.Color(bright, bright, bright),
        transparent: false, alphaTest: OVERHEAD_ALPHA_TEST,
        side: THREE.DoubleSide, depthWrite: true, toneMapped: false,
      })
      if (!dbgC) injectOverheadStamp(mat, b.aoTex)
      return { key: b.key, geo, mat }
    })
  }, [asset])

  useEffect(() => () => {
    for (const d of discs) { try { d.geo.dispose() } catch {} try { d.mat.dispose() } catch {} }
  }, [discs])

  // Crossfade opacity (the Grove Hero↔Browse transition). Default 1 → the slab is
  // untouched. Flip `transparent` only when it actually changes (a recompile);
  // `opacity` alone is a cheap uniform, safe to set every frame during the fade.
  useEffect(() => {
    for (const d of discs) {
      const t = opacity < 1
      if (d.mat.transparent !== t) { d.mat.transparent = t; d.mat.needsUpdate = true }
      d.mat.opacity = opacity
      d.mat.depthWrite = !t
    }
  }, [discs, opacity])

  // Per-instance matrices (translate + rotY + scale) — the same per-placement
  // transform the mesh path bakes, so the disc-stack pours across all placements.
  const matrices = useMemo(() => {
    const arr = new Array(instances.length)
    const M = new THREE.Matrix4()
    const T = new THREE.Matrix4(), R = new THREE.Matrix4(), S = new THREE.Matrix4()
    // Axial repeller — a deterministic per-instance Y offset so two overlapping
    // trees' coplanar band-planes don't z-fight ("axial fighting"). The plan view
    // ignores Y, so this is invisible except for killing the fight; different XZ
    // positions hash to different offsets, so neighbours land at different heights.
    const AXIAL_SPREAD_M = 2.0
    const fract = (x) => x - Math.floor(x)
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]
      // ⛔ 0, not the ground — the lift is applied in the SHADER from the live per-shot uExag
      // (`OVERHEAD_GROUND_LIFT`). Browse tweens the ground FLAT, so anything baked here floats.
      // The axial spread below stays world-metres, added on top of the shader's lift.
      const y0 = 0
      const y = y0 + fract(Math.sin(inst.x * 12.9898 + inst.z * 78.233) * 43758.5453) * AXIAL_SPREAD_M
      const s = inst.scale || 1
      T.makeTranslation(inst.x, y, inst.z)
      R.makeRotationY(inst.rotY || 0)
      S.makeScale(s, s, s)
      // clone(): multiply() mutates + returns the receiver, so an un-cloned
      // arr[i] would alias the one scratch matrix and every instance would
      // land on the LAST placement. Same idiom as VariantInstances.
      arr[i] = M.identity().multiply(T).multiply(R).multiply(S).clone()
    }
    return arr
  }, [instances])

  useEffect(() => {
    for (let d = 0; d < discs.length; d++) {
      const im = refs.current[d]
      if (!im) continue
      for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i])
      im.instanceMatrix.needsUpdate = true
      // The RAW ground under each disc (pre-exag); the shader lifts by the live uExag, so the
      // discs ride the ground down when Browse tweens it flat instead of hanging in the air.
      discs[d].geo.setAttribute('aGround', new THREE.InstancedBufferAttribute(groundPairs(instances, treeGroundRaw), 2))
      // The per-tree lamp light the bake stamped (`lampGlow`, src/lib/lampPool.js) — the same value the mesh path reads.
      const glow = new Float32Array(instances.length)
      for (let i = 0; i < instances.length; i++) glow[i] = Number(instances[i].lampGlow) || 0
      discs[d].geo.setAttribute('aLampGlow', new THREE.InstancedBufferAttribute(glow, 1))
    }
    invalidate()
  }, [matrices, discs, instances, invalidate])

  if (!instances.length) return null
  return (
    <>
      {discs.map((d, i) => (
        <instancedMesh
          key={d.key}
          ref={(el) => { refs.current[i] = el }}
          args={[d.geo, d.mat, instances.length]}
          visible={!treeDbg((['noBranch', 'noMid', 'noCanopy'])[i])}
          renderOrder={i}
          frustumCulled={false}
          castShadow={false}
          receiveShadow={false}
          raycast={NO_RAYCAST}
        />
      ))}
    </>
  )
}
