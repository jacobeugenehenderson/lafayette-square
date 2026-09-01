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
import { loadImpostorTexture } from './impostorTexture.js'
import * as THREE from 'three'
import { buildOverheadBandDisc } from './impostorGeometry.js'
import { injectOverheadStamp, overheadLightUniforms } from './treeAtlasMaterial.js'
import { treeGroundRaw } from '../utils/elevation'
import useAtmosphere from '../hooks/useAtmosphere.js'
import useCamera from '../hooks/useCamera'
import { ASSET_BASE } from '../lib/bakedUrl.js'

// ── Debug instrument (dev-only; ?treeDebug=flag,flag — NEVER affects prod) ────
// Names the "chips": ?treeDebug=bandTint tints the 3 overhead bands branch=red /
// mid=green / canopy=blue so you can see WHICH slice draws a fragment; ?treeDebug=
// noBand:branch (or mid/canopy) hides that band. Path-level toggles live in
// InstancedTrees.jsx (noMesh/noImpostor/noOverhead). Kit-generic, any scene.
const _DBG = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
export const treeDbg = (k) => { const v = _DBG.get('treeDebug'); return v ? v.split(',').includes(k) : false }
// Valued sibling — `?meshLod=2` / `?meshLod=auto:60`. treeDbg answers yes/no; some
// instruments need a NUMBER, and an eye-gate that cannot be swept is not an instrument.
export const treeDbgVal = (k) => _DBG.get(k)
const BAND_DEBUG_COLOR = [[1, 0.15, 0.15], [0.15, 1, 0.15], [0.3, 0.5, 1]]  // branch / mid / canopy

// Overhead discs are impostor billboards, never pick targets — disabling raycast
// lets top-down clicks pass THROUGH to whatever they're a stand-in for (in the
// Grove, the ground selection plate; in the slab, the ground/buildings).
const NO_RAYCAST = () => null

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
// ⛔⛔ AND IT MUST HONOUR `shotOverride` OR PREVIEW NEVER SWAPS (Jacob, 2026-08-28:
// "the radially arranged impostors from the hero shot are showing [in Browse]... I
// believe I am seeing mesh trees in Browse *in preview*"). Preview owns its own camera
// and DELIBERATELY does not drive `viewMode` — it publishes `shotOverride` instead
// (`PreviewApp.jsx:932`), scoped so it "can't perturb terrain-exag / clouds / frameloop".
// That scoping was right, but this consumer was never added to it: `viewMode` is pinned
// to 'hero' in Preview forever, so `overheadMode` was ALWAYS false — the hero cards and
// mesh trees never hid, and the overhead discs NEVER RENDERED AT ALL. Browse in Preview
// has never shown the browse trees.
// ⭐ It stayed invisible because the hero cards were themselves buried under the terrain
// until `4486d0dc`/`2aaca5ca`; un-burying them is what exposed this, not what caused it.
// ⛔ This is a PARITY break, and parity is Preview's entire job (`PREVIEW.md`: "renders
// production's exact tree"). Same one-line idiom `useSceneJson.js:87` already uses —
// production sets no `shotOverride`, so it falls through and is byte-identical there.
export function useOverheadMode(enabled) {
  const viewMode = useCamera(s => s.shotOverride ?? s.viewMode)
  return enabled && viewMode === 'browse'
}

// ── Load gate: keep overhead OFF the startup critical path ─────────────────────
// The overhead disc PNGs (60 for LS) only ever render in Browse, but the asset
// load used to be gated on CAPABILITY (does the slab have overhead) — so all of
// them fetched + decoded during the HERO shot, competing with the mesh GLBs +
// atlas the first frame actually needs (the density-stress load-in). This gate
// defers the overhead pull past startup WITHOUT inventing a parallel height
// heuristic (the swap doctrine forbids that — see useOverheadMode): it latches
// true on whichever comes first —
//   (a) the browser goes idle after the hero has settled (requestIdleCallback,
//       so the hero frame is never blocked but discs are warm before you pull up), or
//   (b) Browse is actually entered (belt-and-suspenders; if you dive to plan view
//       before idle fires, load immediately).
// Once warm it stays warm (no thrash). enabled=false → never warms (LS looks with
// no overhead pay nothing).
export function useOverheadWarm(enabled) {
  const inBrowse = useOverheadMode(enabled)
  const [warm, setWarm] = useState(false)
  useEffect(() => {
    if (!enabled || warm) return
    const w = () => setWarm(true)
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(w, { timeout: 4000 })
      return () => window.cancelIdleCallback?.(id)
    }
    const id = setTimeout(w, 3000)
    return () => clearTimeout(id)
  }, [enabled, warm])
  useEffect(() => { if (inBrowse) setWarm(true) }, [inBrowse])
  return enabled && warm
}

// ── Lazy asset load (behind the hero shot) ───────────────────────────────────
// Page loading lives in `impostorTexture.js` — shared with the hero cards, because
// the baked pages are KTX2/ETC1S now and the two consumers must not diverge.

/**
 * useOverheadAssets — resolve + lazy-load the baked overhead layers for every
 * species present in the scene. Returns Map<species, { heightM, canopyRadiusM,
 * bands:[{key, albedoTex, aoTex, yLoNorm, yHiNorm}] }> (only species with a full
 * manifest record + resolved textures). `enabled` gates the whole load so LS looks
 * without the asset pay nothing.
 */
export function useOverheadAssets({ enabled, lookName, overheadBySpecies, species }) {
  const [ready, setReady] = useState(0)
  const base = ASSET_BASE
  // KTX2 needs the renderer to know the device's block formats before it can load.
  const gl = useThree((st) => st.gl)

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
          albedoTex: loadImpostorTexture(url(b.albedo), { srgb: true, gl }),
          aoTex: loadImpostorTexture(url(b.ao), { srgb: false, gl }),
        }
      })
      out.set(sp, { heightM: rec.heightM, canopyRadiusM: rec.canopyRadiusM, bands })
    }
    return out.size ? out : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lookName, overheadBySpecies, species, gl])

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
export function OverheadSpecies({ asset, instances, visible, opacity = 1 }) {
  const refs = useRef([])
  const invalidate = useThree(s => s.invalidate)

  const discs = useMemo(() => {
    const rec = { heightM: asset.heightM || 14, canopyRadiusM: asset.canopyRadiusM || 5 }
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
        transparent: false, alphaTest: 0.4,
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
      const raw = new Float32Array(instances.length)
      for (let i = 0; i < instances.length; i++) raw[i] = treeGroundRaw(instances[i])
      discs[d].geo.setAttribute('aGroundRaw', new THREE.InstancedBufferAttribute(raw, 1))
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
          visible={visible && !treeDbg((['noBranch', 'noMid', 'noCanopy'])[i])}
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
