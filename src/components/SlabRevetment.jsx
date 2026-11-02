/**
 * SlabRevetment.jsx — THE STONE WALL ALONG THE SHORE, BUILT FROM THE SLAB.
 *
 * ⭐⭐ THE NEAR LAYER IS AN INSTRUCTION, THE FAR LAYER IS BAKED. `bake-revetment.js` writes the
 * shoreline stations, the crest above the water at each, whether each is armoured,
 * which face carries stone, and a 4-byte seed; the detailed drape and every boulder on
 * it are generated from that, near the camera, at runtime. ⛔ Baking THOSE would put
 * 76.5 MB (provincetown) to 401 MB (huron) of drape into a slab, mostly never looked at
 * (▶ scratch/far-shore/oct3-weight.mjs). The FAR layer — the whole armoured shore,
 * coarse, camera-independent — is baked by `bake-revetment-far.js` (quantized, `farQuant.js`;
 * the bake prints its weight) with its overhead band, because building it here
 * stalled a cold load for seconds (BRIEF-the-far-shore-is-not-built-at-load).
 *
 * ⛔ NOT A SECOND IMPLEMENTATION. Every piece here already existed and was proven
 * in the harness at `/boulders.html` (now the surface lab, `/lab.html?look=huron&at=revetment`) before anything reached the operator's map:
 *   · `revetmentFromSlab.js` — the artifact → `{poly, crestAt}` adapter, and the
 *     ORIENTATION RULE. Shared with `checks/`, so the check audits what renders.
 *   · `shoreChunks.js`      — candidate stones as a function of position, with
 *     seam determinism measured exact at margin 2 (▶ `scratch/boulder-chunk-sweep.mjs`).
 *   · `revetmentDrape.js`   — the bed the stone sits on, chunked identically (the far bake runs it too).
 *   · `InstancedBoulders`   — one draw call per boulder shape, the same instancing
 *     shape as `StreetLights` and `InstancedTrees`. Not a third path.
 *
 * ⛔⛔ MOUNT IT IDENTICALLY EVERYWHERE (Jacob, 2026-09-23: *"Preview should just
 * mount it identically"*). Every decision that could differ between Stage, Preview
 * and production is INSIDE this component, so there is no second place to keep in
 * sync. A caller passes the look and the bake token and nothing else.
 *
 * ⚠️ KNOWN AND NOT HIDDEN: chunk generation is on the critical path — roughly one
 * new chunk per 12 m of camera travel — so fast flight along the shore can hitch.
 * Prefetch is the obvious answer and is deliberately not built here; it was named
 * as unbuilt in the spike (`bee17a58`) and it is still unbuilt.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useThree } from '@react-three/fiber'
import { useTownFrame } from '../lib/useTownFrame.js'
import * as THREE from 'three'
import InstancedBoulders from './InstancedBoulders.jsx'
import { makeRevetmentMaterial } from './revetmentMaterial.js'
import { boulderPalette } from '../lib/boulderGeometry.js'
import { revetmentDrape, drapeLattices, drapeRelative, FAR_OCTAVES, NEAR_OCTAVES, VERTS_PER_WAVELENGTH } from '../lib/revetmentDrape.js'
import { decodeFarChunk } from '../lib/farQuant.js'
import { shoreContext, chunkStones, drapeChunks, CHUNK_M } from '../lib/shoreChunks.js'
import { revetmentFaces, loadRevetment, loadRevetmentFar, loadRevetmentFarUnseen, toeFromBaked, chunkBox } from '../lib/revetmentFromSlab.js'
import { overheadResolves } from '../lib/cameraRegimes.js'
import { useTownShot } from './townContext.js'
import { subscribeStartup, isRevealed } from '../lib/startupMarks.js'
import { drawnGroundParts, onDrawnGround } from '../utils/elevation'
import { terrainWater, terrainDatum, terrainExag, sceneExag, patchTerrain, patchTerrainInstancedBaked, onTerrainReload } from '../utils/terrainShader'
import { waterLevelsIfWet } from '../../cartograph/waterLevel.mjs'
import { phaseNow } from './WaterSurface.jsx'

let _saidNoBerm = false
let _saidNoLevel = false
let _saidNoLevels = false
import { slabFetch, slabManifest } from '../lib/slabUrl.js'
import { Refusal } from '../lib/refusal.js'

/** How far from the camera the DETAILED drape and the stones are built, metres.
 *  ⛔ A BUDGET, not a look: it sets how much work one camera move can trigger.
 *  ⛔⛔ AND IT IS NO LONGER WHERE THE WALL ENDS. It used to gate both loops with
 *  nothing beyond it, so the revetment did not degrade at distance — it VANISHED,
 *  which is the one thing Jacob's close-inspection ruling forbids ("never an LOD
 *  that degrades to nothing"). Nobody decided that; the radius was inherited from
 *  the harness, which only ever looked at one arc from close up, and it was simply
 *  the only mechanism present. The far layer below is the other half. */
const NEAR_RADIUS_M = 90

/** ⭐ THE FAR LAYER IS BAKED (cartograph/bake-revetment-far.js, 2026-10-29): the whole armoured shore at its far
 *  resolution, ground-relative, cut on the near layer's chunks and laid out in the order the movie first sees them. It was
 *  built here in a frame loop at load, one face per frame however long the face (provincetown: one 3.2 s task on a cold
 *  load), and it never depended on the camera. This component only mounts it, as views on the fetched bytes. */
/** Rebuild only after the camera has moved this far. ⛔ Without it every frame
 *  re-selects chunks on a 26 km shore for a camera that has not moved. */
const RESELECT_M = 6
/** …or turned this far (radians): the overhead regime leans and zooms without moving much. */
const RESELECT_RAD = 0.05

/** The DRAWN ground at exaggeration 1 (`drawnGroundParts`: its terrain part + its own part) — what the revetment is built
 *  against, so the stone meets the ground the slab draws, never the field under it. */
const drawnAt1 = (x, z) => { const g = drawnGroundParts(x, z); return g.raw + g.y }

/** ⭐ THE DRAPE, GROUND-RELATIVE (Argon, 2026-10-07). Each vertex's TERRAIN part, the DRAWN ground's raw at that vertex
 *  (`drawnGroundParts`: a ground vertex's pin, else the field, barycentric over the drawn triangle), moves out of the geometry
 *  and rides as the vertex's own pin (`aDrawnRaw`, drawnGround.js), which the shader lifts back × uExag (patchTerrain
 *  perVertex + drawn), so the stone rides the live exaggeration like the drawn ground beneath it; the rest stays in the
 *  geometry. ⛔ It was the FIELD, while the drape is built at drawnAt1: at uExag ≠ 1 the stone stood off the pinned shore by
 *  (pin − field)(1 − uExag) (Ward-seat review, 2026-10-27). The bounds are taken first, from the drawn exag-1 positions.
 *  `revetmentDrape` itself stays absolute: the checks read real heights. The step is `drapeRelative`, the bake's own: a vertex
 *  lying on the far's row between two far vertices takes their raws' lerp, so the seam holds at every exaggeration, and the
 *  row is the far as DECODED (`step`, the table's grid), so the near meets the far's quantized bytes exactly. */
function groundRelative(built, step) {
  const g = built?.geometry
  if (!g) return built
  g.computeBoundingSphere(); g.computeBoundingBox()
  const { rel, normal, raws } = drapeRelative(built, (x, z) => drawnGroundParts(x, z).raw, step), pins = new Float32Array(raws.length * 4)
  for (let i = 0; i < raws.length; i++) { pins[i * 4] = 1; pins[i * 4 + 1] = raws[i] }
  g.setAttribute('position', new THREE.BufferAttribute(rel, 3)); g.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  g.setAttribute('aDrawnRaw', new THREE.BufferAttribute(pins, 4))
  return built
}

export default function SlabRevetment({ lookId, bakeLastMs, visible = true }) {
  const camera = useThree(s => s.camera)
  const [doc, setDoc] = useState(null)

  // ── the instruction ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lookId) return
    let dead = false
    // ⛔ RE-READ OR THE OPERATOR EYE-GATES THE PREVIOUS BAKE. Preview mounted its
    // baked consumers at unchanging URLs until 2026-09-20 and the browser served the
    // stale slab; a re-bake read as "unchanged" and the A/B was recorded backwards.
    // bakeLastMs is the re-read key; the resolver carries it on disk.
    // ⭐ Only what the town's manifest names is asked for: an inland town has none and says nothing
    // (revetmentFromSlab.js#loadRevetment).
    // ⭐ The instruction and the baked far shore arrive together: a face is never mounted without its far chunks and toe.
    const fetchFile = (rel) => slabFetch(lookId, rel, undefined, bakeLastMs || null)
    slabManifest(lookId)
      .then(manifest => Promise.all([loadRevetment(lookId, { manifest, fetchFile, say: console.error }), loadRevetmentFar(lookId, { manifest, fetchFile, say: console.error })]))
      .then(([d, far]) => { if (!dead) setDoc(d && far ? { ...d, far: far.far, farBins: far.bins } : null) })
      .catch(e => { console.error(`[revetment] ⛔ ${lookId}: the shore could not be read — ${e?.message || e}. No shore is drawn.`) })
    return () => { dead = true }
  }, [lookId, bakeLastMs])

  // ── the shore the movie never sees, fetched once the town is revealed ─────────
  const revealed = useSyncExternalStore(subscribeStartup, isRevealed)
  const [unseenBin, setUnseenBin] = useState(null)
  useEffect(() => {
    if (!doc || !revealed) return
    let dead = false
    loadRevetmentFarUnseen(lookId, { fetchFile: (rel) => slabFetch(lookId, rel, undefined, bakeLastMs || null), say: console.error })
      .then(b => { if (!dead && b) setUnseenBin(b) })
    return () => { dead = true; setUnseenBin(null) }
  }, [doc, revealed, lookId, bakeLastMs])

  // ── one palette + the materials for the whole shore ────────────────────────
  // ⭐ Seeded from the slab so two towns do not wear the same rocks and a re-bake
  // does not reshuffle a shore the operator has already looked at.
  const palette = useMemo(() => (doc ? boulderPalette({ seed: doc.seed }) : null), [doc])
  // ⛔ `makeRevetmentMaterial` returns `{ material, uniforms }`, NOT a bare material.
  // Treating it as one threw on unmount (`material.dispose is not a function`), React
  // tore the component down through its error boundary, and the shore rendered
  // nothing — with the artifact loaded and every station correct. ⭐ It failed on the
  // CLEANUP path, so the first frame looked fine and the failure only appeared once
  // something remounted: a stone wall that is missing for no visible reason.
  // ⭐⭐ THE STONE RIDES THE KIT'S TERRAIN LIFT, like the ground, the lamps and the trees (Argon, 2026-10-07). It was
  // draped ONCE at raw height (exag 1), so in Plan (exag 0), through the reveal's swell, and on any town authored at
  // another exaggeration it floated or sank against the drawn shore. Its geometry is now GROUND-RELATIVE to the DRAWN
  // ground and the shader adds its terrain part × the live uExag: the drape through the field per vertex (the ground's
  // own lift), the boulders through the lamps' and trees' instanced one (aGround = [raw, y]). TWO materials, because one cannot
  // carry both: the per-vertex lift ignores instanceMatrix. ⛔ The shadow pass repeats each lift (checks/claims-displaced-casters-have-a-depth-material.mjs).
  const drape = useMemo(() => makeRevetmentMaterial({ waterY: 0 }), [])
  const stone = useMemo(() => makeRevetmentMaterial({ waterY: 0 }), [])
  const drapeMaterial = useMemo(() => { patchTerrain(drape.material, { perVertex: true, drawn: true }); return drape.material }, [drape])
  const stoneMaterial = useMemo(() => { patchTerrainInstancedBaked(stone.material); return stone.material }, [stone])
  const drapeDepth = useMemo(() => { const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); patchTerrain(d, { perVertex: true, drawn: true }); return d }, [])
  const stoneDepth = useMemo(() => { const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); patchTerrainInstancedBaked(d); return d }, [])
  // the terrain or the drawn ground re-pointed (a look switch, the ground loading, a same-Look re-bake): the levels and the faces re-read
  const [groundGen, setGroundGen] = useState(0)
  useEffect(() => onTerrainReload(() => setGroundGen(g => g + 1)), [])
  useEffect(() => onDrawnGround(() => setGroundGen(g => g + 1)), [])
  // ⭐ The wetted band stands at the LIVE level where the camera is (cartograph/waterLevel.mjs), so it moves with the tide.
  // ⭐ Re-read on a terrain reload (`groundGen`): a same-Look re-bake reloads the terrain ASYNC, and the levels are the terrain's record.
  // ⛔ Not swallowed (BRIEF-tide finding): a town whose water record cannot be read SAYS so, once, and its wetted band
  // stays unlit — never a quiet dry band.
  const levels = useMemo(() => { try { return waterLevelsIfWet({ datum: terrainDatum(), water: terrainWater() }) } catch (e) {
    if (!_saidNoLevels) { _saidNoLevels = true; console.error(`[SlabRevetment] ⛔ ${e.message} — the stone's wetted band has no level to stand at`) }
    return null } }, [doc, groundGen])
  useTownFrame(({ camera: cam }) => { if (levels) drape.uniforms.uWaterY.value = stone.uniforms.uWaterY.value = levels.levelAt(cam.position.x, cam.position.z, phaseNow()) })
  useEffect(() => () => { drapeMaterial.dispose(); stoneMaterial.dispose(); drapeDepth.dispose(); stoneDepth.dispose() }, [drapeMaterial, stoneMaterial, drapeDepth, stoneDepth])
  useEffect(() => () => { palette?.forEach(g => g.dispose()) }, [palette])

  // ── the buildable faces, and their chunk lattices ──────────────────────────
  // ⚠️ Built once per document. The lattices are ARC-GLOBAL on purpose (revetmentDrape.js#drapeLattices): every chunk
  // of a face derives its vertices from the same lattice, nested in the far's, which is what makes the seam exact.
  // Re-built when the terrain or the drawn ground is re-pointed (a look switch, the ground loading): `groundGen`, declared above
  const faces = useMemo(() => {
    if (!doc) return []
    const farFaces = new Map(doc.far.faces.map(b => [b.key, b]))
    return revetmentFaces(doc).filter(f => f.anyArmour).map(f => {
      if (f.levelM == null && !_saidNoLevel) { _saidNoLevel = true; console.warn('[SlabRevetment] ⛔ this revetment.json predates the water levels — its heaps stand on the terrain\'s zero, not the town\'s high water. ▶ re-bake the revetment') }
      const waterY = f.levelM ?? 0
      // ⭐ The toe is BAKED: toeFor's walk down to the bed (at least one course below LOW, no deeper than the bottom can be
      // seen), run by bake-revetment-far.js and read back through toeFor's own interpolation
      const baked = farFaces.get(f.key)
      if (!baked) throw new Refusal(`[revetment] ⛔ face ${f.key} is in revetment.json but not in revetment-far.json — the two were baked apart. ▶ re-bake`)
      const toeAt = baked.toe ? toeFromBaked(f, baked.toe) : () => 1
      if (!f.toeBerm && !_saidNoBerm) { _saidNoBerm = true; console.warn('[SlabRevetment] ⛔ this revetment.json carries no material.toeBerm — the heaps have no toe berm. ▶ re-bake the revetment') }
      f = { ...f, toeAt, berm: f.toeBerm, groundAt: drawnAt1, waterY }
      // ⭐ the near lattice nested in the far's, and the chunks cut on far stations: the bake's own (bake-revetment-far.js#chunkRanges)
      const [G1, G] = drapeLattices({ poly: f.poly, crestAt: f.crestAt, crestBreaks: f.crestBreaks, toeAt, berm: f.berm, octaves: [FAR_OCTAVES, NEAR_OCTAVES] })
      const ranges = drapeChunks(G1, G).map(r => r.near)
      // Where each drape chunk sits, so the camera can pick by distance instead of
      // by walking the whole arc every time.
      const at = ranges.map(([a, b]) => {
        const m = f.poly[Math.min(f.poly.length - 1, Math.round(((a + b) / 2 / (G.nAlong - 1)) * (f.poly.length - 1)))]
        return m || f.poly[0]
      })
      const ctx = shoreContext({ poly: f.poly, crestAt: f.crestAt, taperAt: f.taperAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, oversample: 10, paletteSize: palette.length, seed: doc.seed })
      return { ...f, G, G1, ranges, at, ctx, step: doc.far.quant.step, cache: new Map() }
    })
  }, [doc, palette, groundGen])

  const [built, setBuilt] = useState({ drape: [], stones: [], nearKeys: new Set() })
  const lastAt = useRef(null)

  // ── THE FAR LAYER — the whole armoured shore, always, at every distance ─────
  // ⭐ BAKED, mounted here as views on the fetched bins: one mesh per chunk of the near layer's lattice, so a near chunk
  // hides only the far chunk it replaces. (It hid the WHOLE FACE: with one near chunk drawn, the rest of a 33 km face was
  // empty past 90 m — the failure this layer exists to prevent. ▶ node checks/claims-the-far-shore-is-not-built-at-load.mjs)
  // ⭐ THE BAND is the overhead tier: the same chunk's triangles laid flat on the drawn ground, drawn in Browse instead of
  // the stone (Jacob, 2026-10-29). Never a stand-in for a far chunk that failed: those fail the bake.
  // ⭐ the near layer's index: EVERY near chunk's bounds, stone size and what each layer keeps there, from the bake
  const infoByKey = useMemo(() => new Map((doc?.far.info || []).map(c => [`${c.face}#${c.k}`, c])), [doc])
  const farChunks = useMemo(() => {
    if (!doc) return []
    const bins = { ...doc.farBins, ...(unseenBin ? { 'revetment-far-unseen.bin': unseenBin } : {}) }
    const out = []
    for (const c of doc.far.chunks) {
      const bin = bins[c.bin]
      if (!bin) continue                                  // the never-seen bin, before the reveal
      // ⭐ decoded on the town's grid (farQuant.js, format 3): the bytes the bake wrote, and the row the near meets
      const A = decodeFarChunk(bin, c, doc.far.quant.step), attr = (a, size) => new THREE.BufferAttribute(a, size)
      const index = attr(A.index, 1), pin = attr(A.pin, 4)
      const far = new THREE.BufferGeometry(), band = new THREE.BufferGeometry()
      far.setAttribute('position', attr(A.pos, 3)); far.setAttribute('normal', attr(A.normal, 3))
      band.setAttribute('position', attr(A.band, 3)); band.setAttribute('normal', attr(A.bandNormal, 3))
      far.setAttribute('aDrawnRaw', pin); band.setAttribute('aDrawnRaw', pin)
      far.setIndex(index); band.setIndex(index)
      // three's culling bounds: the chunk's box over every exaggeration it can be drawn at (0 … the town's ceiling, or 1 at Street),
      // from the SAME function the overhead selection reads (revetmentFromSlab.js#chunkBox)
      const key = `${c.face}#${c.k}`, info = infoByKey.get(key)
      if (!info?.box) throw new Refusal(`[revetment] ⛔ far chunk ${key} has no info row — revetment-far.json is malformed. ▶ re-bake`)
      const [x0, y0, z0, x1, y1, z1] = chunkBox(info.box, 0, Math.max(1, sceneExag()))
      for (const g of [far, band]) { g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)); g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere()) }
      out.push({ key, c, far, band })
    }
    return out
  }, [doc, unseenBin, infoByKey])
  useEffect(() => () => { for (const m of farChunks) { m.far.dispose(); m.band.dispose() } }, [farChunks])

  // ── THE NEAR LAYER — the detailed drape and the stones, by the camera ────────
  const overhead = useTownShot() === 'browse'
  const viewH = useThree(s => s.size.height)
  const frustum = useMemo(() => new THREE.Frustum(), [])
  const _m = useMemo(() => new THREE.Matrix4(), [])
  const _c = useMemo(() => new THREE.Vector3(), [])
  useTownFrame(() => {
    if (!visible || !faces.length) return
    const c = camera.position, q = camera.quaternion
    if (lastAt.current && lastAt.current.overhead === overhead && c.distanceTo(lastAt.current.p) < RESELECT_M && q.angleTo(lastAt.current.q) < RESELECT_RAD) return
    lastAt.current = { p: c.clone(), q: q.clone(), overhead }
    // ⭐ WHICH NEAR CHUNKS, BY REGIME. Overhead (Browse, Society): the ones inside the view whose stones resolve on screen
    // (cameraRegimes.js#overheadResolves: d50 over metres per pixel at the chunk ≥ the drape's own sampling rule). The
    // movie and Street: within NEAR_RADIUS_M of the camera. ⚠️ KNOWN OPEN: two selections until Street's brief.
    if (overhead) { camera.updateMatrixWorld(); frustum.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)) }
    const e = terrainExag.value
    const wants = (f, k, p) => {
      const info = infoByKey.get(`${f.key}#${k}`)
      if (!info) throw new Refusal(`[revetment] ⛔ near chunk ${f.key}#${k} has no info row — revetment.json and revetment-far.json were baked apart. ▶ re-bake`)
      if (!info.nearTris) return false                     // the bake built it: nothing is kept here at any distance
      if (!overhead) return Math.hypot(p.x - c.x, p.z - c.z) <= NEAR_RADIUS_M
      // at the LIVE exaggeration: Browse draws at 0, so a box at exag 1 stands metres above what is drawn (Zob, 2026-10-29)
      const [x0, y0, z0, x1, y1, z1] = chunkBox(info.box, e, e)
      _c.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
      return overheadResolves(camera, viewH, frustum, _c, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2, info.d50, VERTS_PER_WAVELENGTH)
    }

    const drape = [], stones = [], nearKeys = new Set()
    for (const f of faces) {
      const chosen = new Set()
      for (let k = 0; k < f.ranges.length; k++) {
        if (!wants(f, k, f.at[k])) continue
        chosen.add(k)
        if (!f.cache.has(k)) {
          try {
            f.cache.set(k, groundRelative(revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, globals: f.G, stations: f.ranges[k], conform: f.G1 }), f.step))
          } catch (e) { console.error(`[revetment] drape chunk ${f.key}#${k} failed —`, e); continue }
        }
        const built = f.cache.get(k)
        if (built?.stats?.tris) { drape.push(built); nearKeys.add(`${f.key}#${k}`) }
      }
      // Stones, where a drape chunk their span overlaps is chosen. A stone chunk spans the arc [ci·CHUNK_M, (ci+1)·CHUNK_M]
      // (shoreChunks.js; the last is short), a drape chunk the arc of its stations: matched by ARC LENGTH, never by the
      // stone chunk's index fraction, which runs behind by the last chunk's shortfall (Zob, 2026-10-29).
      // ⭐ margin 2 is MEASURED, not chosen: at margin 1 four stones go missing at a seam, at 2 the two windows resolve identically.
      const n = f.ctx.nChunks, total = f.ctx.total, per = f.ranges[0] ? f.ranges[0][1] - f.ranges[0][0] : 1, nA = f.G.nAlong - 1
      const kAt = (s) => Math.min(f.ranges.length - 1, Math.floor(((s / total) * nA) / per))
      for (let ci = 0; ci < n; ci++) {
        const sA = ci * CHUNK_M, sB = Math.min(total, sA + CHUNK_M)
        let any = false
        for (let k = kAt(sA); k <= kAt(sB) && !any; k++) any = chosen.has(k)
        if (!any) continue
        // ground-relative, like the drape: the drawn ground's two parts ride along as `ground` + `groundY` (the lift's aGround)
        for (const st of chunkStones(f.ctx, ci, 2)) { const g = drawnGroundParts(st.p[0], st.p[2]); stones.push({ ...st, p: [st.p[0], st.p[1] - g.raw - g.y, st.p[2]], ground: g.raw, groundY: g.y }) }
      }
    }
    setBuilt({ drape, stones, nearKeys })
  })

  if (!visible || !doc || !palette) return null
  return (
    <group name="revetment">
      {/* ⭐ THE FAR LAYER: every armoured metre, at every distance, one mesh per chunk. ⛔ A far chunk is HIDDEN while its
          near chunk is drawn, never drawn under it: two coincident surfaces would z-fight, a worse artifact than the
          ~4 px detail pop the swap costs (measured: p95 0.273 m at the 90 m boundary, ▶ scratch/boulder-lod-deviation.mjs).
          Overhead, the BAND is drawn instead of the far stone. */}
      {farChunks.map(m => (
        <mesh key={`far-${m.key}`} geometry={overhead ? m.band : m.far} material={drapeMaterial}
          visible={!built.nearKeys?.has(m.key)} receiveShadow />
      ))}
      {built.drape.map((d, i) => (
        <mesh key={i} geometry={d.geometry} material={drapeMaterial} customDepthMaterial={drapeDepth} castShadow receiveShadow />
      ))}
      {!!built.stones.length && (
        <InstancedBoulders palette={palette} instances={built.stones} material={stoneMaterial} depthMaterial={stoneDepth} />
      )}
    </group>
  )
}
