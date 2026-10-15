/**
 * SlabRevetment.jsx — THE STONE WALL ALONG THE SHORE, BUILT FROM THE SLAB.
 *
 * ⭐⭐ THE SLAB SHIPS AN INSTRUCTION, NOT A MESH. `bake-revetment.js` writes the
 * shoreline stations, the crest above the water at each, whether each is armoured,
 * which face carries stone, and a 4-byte seed. Everything you see here — the drape
 * and every boulder on it — is generated from that, near the camera, at runtime.
 * ⛔ Baking the geometry would have put ~47 MB of drape and ~33 MB of stone
 * transforms into one town's slab, downloaded in full and mostly never looked at.
 * Stone costs ZERO slab bytes.
 *
 * ⛔ NOT A SECOND IMPLEMENTATION. Every piece here already existed and was proven
 * in the harness at `/boulders.html` (now the surface lab, `/lab.html?look=huron&at=revetment`) before anything reached the operator's map:
 *   · `revetmentFromSlab.js` — the artifact → `{poly, crestAt}` adapter, and the
 *     ORIENTATION RULE. Shared with `checks/`, so the check audits what renders.
 *   · `shoreChunks.js`      — candidate stones as a function of position, with
 *     seam determinism measured exact at margin 2 (▶ `scratch/boulder-chunk-sweep.mjs`).
 *   · `revetmentDrape.js`   — the bed the stone sits on, chunked identically.
 *   · `InstancedBoulders`   — one draw call per boulder shape, the same instancing
 *     shape as `StreetLights` and `InstancedTrees`. Not a third path.
 *
 * ⛔⛔ MOUNT IT IDENTICALLY EVERYWHERE (Jacob, 2026-09-23: *"Preview should just
 * mount it identically"*). Every decision that could differ between Stage, Preview
 * and production is INSIDE this component, so there is no second place to keep in
 * sync. A caller passes the look and the bake token and nothing else.
 *
 * ⭐ BUILT OFF THE FRAME (2026-10-14). Every drape chunk, the far layer and every stone are built by a worker
 * (`src/workers/revetment.worker.js` running `src/lib/revetmentBuild.js`, the composition this component used to hold);
 * this component only chooses which chunks are near, queues them, and adopts what comes back. While a near chunk is in
 * flight the far layer stands in FOR THAT CHUNK. A flight's destination is prepared in the air (`flightDestination.js`),
 * and the stone's programs are linked behind the emblem (the primer below, `town:revetmentPrimer`).
 * ▶ node checks/claims-the-shore-builds-off-the-frame.mjs — the worker's stone byte-equal to the in-frame build; no chunk
 *   drawn by neither layer; no long frame and no program linked in Provincetown's flight into the plan.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import InstancedBoulders from './InstancedBoulders.jsx'
import { makeRevetmentMaterial } from './revetmentMaterial.js'
import { boulderPalette } from '../lib/boulderGeometry.js'
import { revetmentResponseKind } from '../lib/revetmentFromSlab.js'
import { farIndex, withinReach } from '../lib/revetmentBuild.js'
import { onDrawnGround, drawnGroundSource } from '../utils/elevation'
import { terrainBed, terrainWater, currentTerrain, currentTerrainIdentity, patchTerrain, patchTerrainInstancedBaked, onTerrainReload } from '../utils/terrainShader'
import { waterLevels } from '../../cartograph/waterLevel.mjs'
import { phaseNow } from './WaterSurface.jsx'
import { onFlightDestination } from '../camera/flightDestination.js'
import { isRevealed, subscribeStartup } from '../lib/startupMarks.js'

let _saidNoLevels = false
import { slabFetch, slabUrl } from '../lib/slabUrl.js'

/** Rebuild only after the camera has moved this far. ⛔ Without it every frame
 *  re-selects chunks on a 26 km shore for a camera that has not moved. */
const RESELECT_M = 6

/** How many builds are in the worker at once. ⛔ Not a budget on the frame — the frame does none of the work — but the
 *  depth of the worker's queue: a request made now is answered after at most this many others, so a chunk the camera
 *  turned away from is not built ahead of one it turned to. One in flight and one waiting keeps the thread busy. */
const IN_FLIGHT = 2

/** A plain geometry from the worker (`revetmentBuild.js#groundRelativePlain`) as a BufferGeometry, its bounds as built. */
function geometryOf(plain) {
  const g = new THREE.BufferGeometry()
  for (const [n, a] of Object.entries(plain.attributes)) g.setAttribute(n, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized))
  if (plain.index) g.setIndex(new THREE.BufferAttribute(plain.index, 1))
  const b = plain.box, sp = plain.sphere
  g.boundingBox = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(sp[0], sp[1], sp[2]), sp[3])
  return g
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
    slabFetch(lookId, 'revetment.json', undefined, bakeLastMs || null)
      .then(r => {
        // ⭐ 404 is NORMAL and is not a failure: `bake-revetment` writes nothing for a
        // town with no shoreline, or whose terrain datum is not the water. Most towns
        // have none. ⛔ Anything else is loud — a revetment that fails to load must
        // not read as a coast that has no wall.
        // ⛔⛔ AND THE STATUS ALONE CANNOT DECIDE THAT. vite answers 200-with-index.html
        // for a missing file, which made `404` unreachable and sent the ORDINARY
        // no-coast case down the FAILED branch. `revetmentResponseKind` reads the
        // content type too and returns which of three states this is — the third being
        // "this server cannot tell me," which must be SAID, not resolved by guessing.
        const kind = revetmentResponseKind(r.status, r.headers.get('content-type'))
        if (kind === 'present') return r.json()
        if (kind === 'absent') return null
        if (kind === 'unverifiable') {
          console.warn(`[revetment] ${lookId}: the server answered ${r.status} with ` +
            `'${r.headers.get('content-type')}' for revetment.json — that is not the artifact, ` +
            `and it is NOT proof the town has none. Drawing no shore, UNVERIFIED. ` +
            `(A dev server serving its HTML index for a missing file looks exactly like this.)`)
          return null
        }
        throw new Error(`HTTP ${r.status}`)
      })
      .then(d => { if (!dead) setDoc(d) })
      .catch(e => { console.error(`[revetment] ${lookId}: FAILED to load revetment.json —`, e) })
    return () => { dead = true }
  }, [lookId, bakeLastMs])

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
  // ground and the shader adds its terrain part × the live uExag: the drape through the baked lift (aRaw, the ground's
  // own), the boulders through the lamps' and trees' instanced one (aGround = [raw, y]). TWO materials, because one cannot
  // carry both: the per-vertex lift ignores instanceMatrix. ⛔ The shadow pass repeats each lift (checks/claims-displaced-casters-have-a-depth-material.mjs).
  const drape = useMemo(() => makeRevetmentMaterial({ waterY: 0 }), [])
  const stone = useMemo(() => makeRevetmentMaterial({ waterY: 0 }), [])
  const drapeMaterial = useMemo(() => { patchTerrain(drape.material, { baked: true }); return drape.material }, [drape])
  const stoneMaterial = useMemo(() => { patchTerrainInstancedBaked(stone.material); return stone.material }, [stone])
  const drapeDepth = useMemo(() => { const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); patchTerrain(d, { baked: true }); return d }, [])
  const stoneDepth = useMemo(() => { const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); patchTerrainInstancedBaked(d); return d }, [])
  // ⭐ The wetted band stands at the LIVE level where the camera is (cartograph/waterLevel.mjs), so it moves with the tide.
  // ⛔ Not swallowed (BRIEF-tide finding): a town whose water record cannot be read SAYS so, once, and its wetted band
  // stays unlit — never a quiet dry band.
  const levels = useMemo(() => { try { return waterLevels(terrainWater()) } catch (e) {
    if (!_saidNoLevels) { _saidNoLevels = true; console.error(`[SlabRevetment] ⛔ ${e.message} — the stone's wetted band has no level to stand at`) }
    return null } }, [doc])
  useFrame(({ camera: cam }) => { if (levels) drape.uniforms.uWaterY.value = stone.uniforms.uWaterY.value = levels.levelAt(cam.position.x, cam.position.z, phaseNow()) })
  useEffect(() => () => { drapeMaterial.dispose(); stoneMaterial.dispose(); drapeDepth.dispose(); stoneDepth.dispose() }, [drapeMaterial, stoneMaterial, drapeDepth, stoneDepth])
  useEffect(() => () => { palette?.forEach(g => g.dispose()) }, [palette])

  // ── THE WORKER: every chunk is built there (revetmentBuild.js) ────────────────────────────────────────────────────
  // Re-initialised when the document or the palette changes, or the terrain or the drawn ground is re-pointed (a look
  // switch, the ground loading): `gen` stamps every request, and an answer to an older generation is dropped.
  const [groundGen, setGroundGen] = useState(0)
  useEffect(() => onTerrainReload(() => setGroundGen(g => g + 1)), [])
  useEffect(() => onDrawnGround(() => setGroundGen(g => g + 1)), [])
  const W = useRef(null)              // { worker, gen, faces: [faceMeta] | null, queue: { far, dest, near }, inFlight, asked: Set, near: Map, stones: Map }
  const [farMeshes, setFarMeshes] = useState([])
  const [built, setBuilt] = useState({ drape: [], stones: [], nearDrawn: new Map() })
  const lastAt = useRef(null)
  const invalidate = useThree(s => s.invalidate)

  const pump = () => {
    const w = W.current
    if (!w?.faces) return
    while (w.inFlight < IN_FLIGHT) {
      const req = w.queue.far.shift() || w.queue.dest.shift() || w.queue.near.shift()
      if (!req) return
      w.inFlight++
      w.worker.postMessage({ ...req, gen: w.gen })
    }
  }
  // ⭐ One request per chunk per generation. A chunk still waiting in the near lane that a flight now lands beside is
  // MOVED to the destination lane, never asked twice.
  const ask = (lane, req) => {
    const w = W.current, key = `${req.type}:${req.face}:${req.k ?? req.ci ?? ''}`
    if (!w?.faces) return
    if (w.asked.has(key)) {
      if (lane !== 'dest') return
      const i = w.queue.near.findIndex(q => q.key === key)
      if (i < 0) return
      w.queue.near.splice(i, 1)
    }
    w.asked.add(key); w.queue[lane].push({ ...req, key })
  }

  useEffect(() => {
    const worker = new Worker(new URL('../workers/revetment.worker.js', import.meta.url), { type: 'module' })
    W.current = { worker, gen: 0, faces: null }
    worker.onmessage = ({ data: m }) => {
      const w = W.current
      if (!w || m.gen !== w.gen) return                                    // an older generation's answer
      if (m.type === 'error') {
        // ⛔ Loud: a chunk that cannot be built is a stretch of shore drawn coarse (near) or not at all (far).
        console.error(`[revetment] the worker failed on ${m.req?.type} face ${m.req?.face}${m.req?.k != null ? ` chunk ${m.req.k}` : ''}${m.req?.ci != null ? ` stones ${m.req.ci}` : ''} —`, m.message)
        if (m.req?.type !== 'load') w.inFlight = Math.max(0, w.inFlight - 1)
        pump(); return
      }
      if (m.type === 'faces') { w.faces = m.faces; m.faces.forEach((_, fi) => ask('far', { type: 'far', face: fi })); lastAt.current = null; pump(); return }
      w.inFlight = Math.max(0, w.inFlight - 1)
      if (m.type === 'far' && m.plain) {
        // ONE index buffer per far face, full length, refilled in place: the near set changes every few metres of flight
        const geometry = geometryOf({ ...m.plain, index: new Uint32Array(m.plain.index) })
        w.far.push({ face: m.face, key: w.faces[m.face].key, plain: m.plain, geometry, shown: null }); setFarMeshes([...w.far])
      }
      if (m.type === 'near') w.near.set(`${m.face}:${m.k}`, m.plain?.tris ? geometryOf(m.plain) : null)
      if (m.type === 'stones') w.stones.set(`${m.face}:${m.ci}`, m.stones)
      lastAt.current = null                                                // re-choose on the next frame, with this one in
      pump(); invalidate()
    }
    return () => { const w = W.current; worker.terminate(); for (const g of w?.near?.values() || []) g?.dispose(); for (const m of w?.far || []) m.geometry.dispose(); W.current = null }
  }, [])

  useEffect(() => {
    const w = W.current
    if (!w || !doc || !palette) return
    w.gen++
    // the previous generation's geometry goes with it
    for (const g of w.near?.values() || []) g?.dispose()
    for (const m of w.far || []) m.geometry.dispose()
    Object.assign(w, { far: [], faces: null, queue: { far: [], dest: [], near: [] }, inFlight: 0, asked: new Set(), near: new Map(), stones: new Map() })
    setFarMeshes([]); setBuilt({ drape: [], stones: [], nearDrawn: new Map() })
    // ⭐ URLS, NOT BYTES: the worker reads the slab itself (revetmentBuild.js#loadRevetmentInit) — the files BakedGround and
    // fetchTerrain read — and refuses unless they turn out to be the ground and the terrain drawn here. Before the drawn
    // ground has loaded, none: the field, exactly as `drawnGroundParts` falls to it.
    const gen = w.gen, src = drawnGroundSource(), T = currentTerrain(), id = currentTerrainIdentity()
    let dead = false
    ;(async () => {
      const ground = src ? await slabFetch(lookId, 'ground.json', undefined, bakeLastMs).then(r => r.json()).then(gm => ({
        manifest: slabUrl(lookId, 'ground.json', bakeLastMs), bin: slabUrl(lookId, gm.bin, bakeLastMs),
        expect: { binBytes: src.bin.byteLength, groups: src.manifest.groups.map(g => g.id), cell: src.cell } })) : null
      if (dead || gen !== W.current?.gen) return
      w.worker.postMessage({ type: 'load', gen,
        urls: { revetment: slabUrl(lookId, 'revetment.json', bakeLastMs || null), terrainBin: slabUrl(lookId, 'terrain.bin') },
        terrain: id === 'none' ? { width: T.width, height: T.height, bounds: T.bounds, data: T.data } : { width: T.width, height: T.height, bounds: T.bounds, identity: id },
        ground, floorM: terrainBed()?.visibleToM ?? 0, paletteSize: palette.length })
    })().catch(e => console.error(`[revetment] ${lookId}: could not hand the worker its slab —`, e))
    return () => { dead = true }
  }, [doc, palette, groundGen, lookId, bakeLastMs])

  // what lies within reach of (x, z), nearest first: drape chunks and stone chunks
  const within = (x, z) => withinReach(W.current?.faces || [], x, z)

  // ⭐ PREPARED IN THE AIR: a flight's destination is known at its first frame, so what the camera will land beside is
  // queued ahead of what it passes over.
  useEffect(() => onFlightDestination(({ pos }) => { if (!pos) return; for (const req of within(pos[0], pos[2])) ask('dest', req); pump() }), [])

  useFrame(() => {
    const w = W.current
    if (!visible || !w?.faces) return
    const c = camera.position
    if (lastAt.current && Math.hypot(c.x - lastAt.current.x, c.z - lastAt.current.z) < RESELECT_M) return
    lastAt.current = { x: c.x, z: c.z }
    const drape = [], stones = [], nearDrawn = new Map()
    for (const req of within(c.x, c.z)) {
      const key = `${req.face}:${req.k ?? req.ci}`
      if (req.type === 'near') {
        if (!w.near.has(key)) { ask('near', req); continue }
        const g = w.near.get(key)
        if (g) { drape.push(g); (nearDrawn.get(req.face) || nearDrawn.set(req.face, new Set()).get(req.face)).add(req.k) }
      } else {
        if (!w.stones.has(key)) { ask('near', req); continue }
        for (const st of w.stones.get(key)) stones.push(st)
      }
    }
    pump()
    setBuilt({ drape, stones, nearDrawn })
  })

  // ⭐ EVERY CHUNK IS DRAWN BY EXACTLY ONE LAYER: the far layer's index leaves out the chunks the near layer draws.
  // ⛔ It used to hide the whole far face while any near chunk of it was drawn, so the rest of a long face drew nothing,
  // and a half-built near set showed a hole (▶ checks/claims-the-shore-builds-off-the-frame.mjs).
  // Only a face whose near set changed gets a new index (a reselect every 6 m must not re-upload the whole shore's).
  useEffect(() => {
    let changed = false
    for (const m of farMeshes) {
      const near = built.nearDrawn.get(m.face) || new Set(), sig = [...near].sort((a, b) => a - b).join(',')
      if (m.shown === sig) continue
      m.shown = sig; changed = true
      const idx = farIndex(m.plain, near), attr = m.geometry.index
      attr.array.set(idx); attr.needsUpdate = true
      m.geometry.setDrawRange(0, idx.length)
    }
    if (changed) invalidate()
  }, [farMeshes, built, invalidate])

  // ── THE PRIMER: the stone's and the near drape's programs, linked behind the emblem ─────────────────────────────────
  // Stones and the shadow-casting near drape are drawn only near the camera, so their programs were first linked mid-flight
  // (Provincetown's flight into the plan: "terrain-inst-baked-kit-revetment-v1", 2026-10-14). One zero-scale stone and one
  // degenerate drape triangle, carrying every attribute the real ones carry, sit in `town:revetmentPrimer`, which Town's
  // RevealGate compiles and prepare-draws with the town; after the reveal they are hidden.
  const revealed = useSyncExternalStore(subscribeStartup, isRevealed)
  const primer = useMemo(() => {
    if (!palette) return null
    const stoneGeo = palette[0].clone()
    stoneGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(new Float32Array(2), 2))
    const drapeGeo = new THREE.BufferGeometry()
    drapeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
    drapeGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3))
    drapeGeo.setAttribute('aRaw', new THREE.BufferAttribute(new Float32Array(3), 1))
    drapeGeo.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2]), 1))
    return { stoneGeo, drapeGeo }
  }, [palette])
  useEffect(() => () => { primer?.stoneGeo.dispose(); primer?.drapeGeo.dispose() }, [primer])
  const primeStone = (im) => { if (!im) return; im.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0)); im.setColorAt(0, new THREE.Color(0.5, 0.5, 0.5)); im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true }

  if (!visible || !doc || !palette) return null
  return (
    <group name="revetment">
      {farMeshes.map(m => (
        <mesh key={`far-${m.key}`} geometry={m.geometry} material={drapeMaterial} receiveShadow />
      ))}
      {built.drape.map((g, i) => (
        <mesh key={i} geometry={g} material={drapeMaterial} customDepthMaterial={drapeDepth} castShadow receiveShadow />
      ))}
      {!!built.stones.length && (
        <InstancedBoulders palette={palette} instances={built.stones} material={stoneMaterial} depthMaterial={stoneDepth} />
      )}
      {primer && (
        <group name="town:revetmentPrimer" visible={!revealed}>
          <instancedMesh ref={primeStone} args={[primer.stoneGeo, stoneMaterial, 1]} customDepthMaterial={stoneDepth} castShadow receiveShadow frustumCulled={false} />
          <mesh geometry={primer.drapeGeo} material={drapeMaterial} customDepthMaterial={drapeDepth} castShadow receiveShadow frustumCulled={false} />
        </group>
      )}
    </group>
  )
}
