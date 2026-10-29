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
 * ⚠️ KNOWN AND NOT HIDDEN: chunk generation is on the critical path — roughly one
 * new chunk per 12 m of camera travel — so fast flight along the shore can hitch.
 * Prefetch is the obvious answer and is deliberately not built here; it was named
 * as unbuilt in the spike (`bee17a58`) and it is still unbuilt.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import InstancedBoulders from './InstancedBoulders.jsx'
import { makeRevetmentMaterial } from './revetmentMaterial.js'
import { boulderPalette } from '../lib/boulderGeometry.js'
import { revetmentDrape, drapeGlobals } from '../lib/revetmentDrape.js'
import { shoreContext, chunkStones, CHUNK_M } from '../lib/shoreChunks.js'
import { revetmentFaces, loadRevetment, toeFor } from '../lib/revetmentFromSlab.js'
import { drawnGroundParts, onDrawnGround } from '../utils/elevation'
import { terrainBed, terrainWater, terrainDatum, patchTerrain, patchTerrainInstancedBaked, onTerrainReload } from '../utils/terrainShader'
import { waterLevelsIfWet } from '../../cartograph/waterLevel.mjs'
import { phaseNow } from './WaterSurface.jsx'
import { MIN_ARMOUR_D50_M } from '../../cartograph/shore-armour.mjs'

let _saidNoBerm = false
let _saidNoLevel = false
let _saidNoLevels = false
import { slabFetch, slabManifest } from '../lib/slabUrl.js'

/** How far from the camera the DETAILED drape and the stones are built, metres.
 *  ⛔ A BUDGET, not a look: it sets how much work one camera move can trigger.
 *  ⛔⛔ AND IT IS NO LONGER WHERE THE WALL ENDS. It used to gate both loops with
 *  nothing beyond it, so the revetment did not degrade at distance — it VANISHED,
 *  which is the one thing Jacob's close-inspection ruling forbids ("never an LOD
 *  that degrades to nothing"). Nobody decided that; the radius was inherited from
 *  the harness, which only ever looked at one arc from close up, and it was simply
 *  the only mechanism present. The far layer below is the other half. */
const NEAR_RADIUS_M = 90

/** ⭐ THE FAR LAYER'S RESOLUTION, and it is measured, not chosen by taste.
 *  ▶ node scratch/boulder-farfield-cost.mjs · node scratch/boulder-lod-deviation.mjs
 *  Octaves 1 builds the WHOLE armoured shore of huron for ~23.5k triangles, against
 *  ~441k at the near layer's octaves 3 — and its median deviation from that near
 *  surface is at or below the measurement's own noise floor, i.e. the two are the
 *  same shape and differ only in detail. Octaves 2 halves the remaining deviation
 *  for 4x the triangles, which buys ~2 px at the swap distance while several hundred
 *  BOULDERS appear at the same moment. Not worth it. ⛔ Octaves 0 is identical to 1
 *  by construction (lamMin = lam0 / 2^max(0, octaves-1)), so 1 is the floor. */
const FAR_OCTAVES = 1

/** ⛔ The far build is sliced across frames: ~204 ms in one pass is a visible hitch,
 *  and it was ALREADY visible — the tab stopped answering while generating. This is
 *  a per-frame ceiling in milliseconds, not a face count, because faces differ in
 *  size by two orders of magnitude and a count would stall on the 10 km one. */
const FAR_BUILD_MS_PER_FRAME = 4

/** Rebuild only after the camera has moved this far. ⛔ Without it every frame
 *  re-selects chunks on a 26 km shore for a camera that has not moved. */
const RESELECT_M = 6

/** The DRAWN ground at exaggeration 1 (`drawnGroundParts`: its terrain part + its own part) — what the revetment is built
 *  against, so the stone meets the ground the slab draws, never the field under it. */
const drawnAt1 = (x, z) => { const g = drawnGroundParts(x, z); return g.raw + g.y }

/** ⭐ THE DRAPE, GROUND-RELATIVE (Argon, 2026-10-07). Each vertex's TERRAIN part, the DRAWN ground's raw at that vertex
 *  (`drawnGroundParts`: a ground vertex's pin, else the field, barycentric over the drawn triangle), moves out of the geometry
 *  and rides as the vertex's own pin (`aDrawnRaw`, drawnGround.js), which the shader lifts back × uExag (patchTerrain
 *  perVertex + drawn), so the stone rides the live exaggeration like the drawn ground beneath it; the rest stays in the
 *  geometry. ⛔ It was the FIELD, while the drape is built at drawnAt1: at uExag ≠ 1 the stone stood off the pinned shore by
 *  (pin − field)(1 − uExag) (Ward-seat review, 2026-10-27). The bounds are taken first, from the drawn exag-1 positions.
 *  `revetmentDrape` itself stays absolute: the checks read real heights. */
function groundRelative(built) {
  const g = built?.geometry
  if (!g) return built
  g.computeBoundingSphere(); g.computeBoundingBox()
  const p = g.attributes.position, pins = new Float32Array(p.count * 4)
  for (let i = 0; i < p.count; i++) { const raw = drawnGroundParts(p.getX(i), p.getZ(i)).raw
    p.setY(i, p.getY(i) - raw); pins[i * 4] = 1; pins[i * 4 + 1] = raw }
  p.needsUpdate = true
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
    slabManifest(lookId)
      .then(manifest => loadRevetment(lookId, { manifest, fetchFile: (rel) => slabFetch(lookId, rel, undefined, bakeLastMs || null), say: console.error }))
      .then(d => { if (!dead) setDoc(d) })
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
  useFrame(({ camera: cam }) => { if (levels) drape.uniforms.uWaterY.value = stone.uniforms.uWaterY.value = levels.levelAt(cam.position.x, cam.position.z, phaseNow()) })
  useEffect(() => () => { drapeMaterial.dispose(); stoneMaterial.dispose(); drapeDepth.dispose(); stoneDepth.dispose() }, [drapeMaterial, stoneMaterial, drapeDepth, stoneDepth])
  useEffect(() => () => { palette?.forEach(g => g.dispose()) }, [palette])

  // ── the buildable faces, and their chunk lattices ──────────────────────────
  // ⚠️ Built once per document. `drapeGlobals` is ARC-GLOBAL on purpose: every chunk
  // of a face derives its vertices from the same lattice, which is what makes the
  // seam exact rather than approximately exact.
  // Re-built when the terrain or the drawn ground is re-pointed (a look switch, the ground loading): `groundGen`, declared above
  const faces = useMemo(() => {
    if (!doc) return []
    // ⭐ The heap runs on below the water to rest on the bed, down to where the bottom stops showing.
    const floorM = terrainBed()?.visibleToM ?? 0
    return revetmentFaces(doc).filter(f => f.anyArmour).map(f => {
      if (f.levelM == null && !_saidNoLevel) { _saidNoLevel = true; console.warn('[SlabRevetment] ⛔ this revetment.json predates the water levels — its heaps stand on the terrain\'s zero, not the town\'s high water. ▶ re-bake the revetment') }
      const waterY = f.levelM ?? 0
      // The toe runs down to the bed, at least one course below the LOW level (so it stays under water at low tide),
      // and no shallower than the depth the bottom can be seen to.
      const toeFloor = Math.max(floorM, f.lowM != null ? waterY - f.lowM + MIN_ARMOUR_D50_M : 0)
      const toeAt = toeFor(f, drawnAt1, toeFloor, waterY)
      if (!f.toeBerm && !_saidNoBerm) { _saidNoBerm = true; console.warn('[SlabRevetment] ⛔ this revetment.json carries no material.toeBerm — the heaps have no toe berm. ▶ re-bake the revetment') }
      f = { ...f, toeAt, berm: f.toeBerm, groundAt: drawnAt1, waterY }
      const G = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, toeAt, berm: f.berm, octaves: 3 })
      const per = Math.max(4, Math.round(CHUNK_M / G.step))
      const ranges = []
      for (let i = 0; i < G.nAlong - 1; i += per) ranges.push([i, Math.min(G.nAlong - 1, i + per)])
      // Where each drape chunk sits, so the camera can pick by distance instead of
      // by walking the whole arc every time.
      const at = ranges.map(([a, b]) => {
        const m = f.poly[Math.min(f.poly.length - 1, Math.round(((a + b) / 2 / (G.nAlong - 1)) * (f.poly.length - 1)))]
        return m || f.poly[0]
      })
      const ctx = shoreContext({ poly: f.poly, crestAt: f.crestAt, taperAt: f.taperAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, oversample: 10, paletteSize: palette.length, seed: doc.seed })
      return { ...f, G, ranges, at, ctx, cache: new Map() }
    })
  }, [doc, palette, groundGen])

  const [built, setBuilt] = useState({ drape: [], stones: [], nearKeys: new Set() })
  const lastAt = useRef(null)

  // ── THE FAR LAYER — the whole armoured shore, always, at every distance ─────
  // ⭐ Built ONCE per face, coarse, and never rebuilt: it does not depend on the
  // camera, which is the entire point. Sliced across frames against a millisecond
  // ceiling because doing it in one pass is a hitch the operator can see.
  const [farMeshes, setFarMeshes] = useState([])
  const farQueue = useRef(null)
  useEffect(() => { farQueue.current = faces.map((f, i) => i); setFarMeshes([]) }, [faces])
  useFrame(() => {
    const q = farQueue.current
    if (!q || !q.length) return
    const t0 = performance.now()
    const made = []
    // ⛔ At least one per frame even if the budget is already blown — otherwise a
    // face bigger than the ceiling is never built at all and that stretch of shore
    // is silently missing forever, which is the failure this whole layer exists to
    // prevent. Better one long frame than a permanent hole.
    do {
      const i = q.shift()
      const f = faces[i]
      if (!f) continue
      try {
        const G = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, octaves: FAR_OCTAVES })
        const d = revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: FAR_OCTAVES, globals: G })
        if (d?.stats?.tris) made.push({ key: f.key, geometry: groundRelative(d).geometry })
      } catch (e) {
        // ⛔ Loud. A face that cannot build its far layer is a stretch of shore that
        // will be empty at distance, which is exactly the defect being fixed here.
        console.error(`[revetment] FAR layer failed for face ${f.key} — that stretch will be empty at distance:`, e)
      }
    } while (q.length && performance.now() - t0 < FAR_BUILD_MS_PER_FRAME)
    if (made.length) setFarMeshes(prev => [...prev, ...made])
  })

  useFrame(() => {
    if (!visible || !faces.length) return
    const c = camera.position
    if (lastAt.current && Math.hypot(c.x - lastAt.current.x, c.z - lastAt.current.z) < RESELECT_M) return
    lastAt.current = { x: c.x, z: c.z }

    const drape = [], stones = [], nearKeys = new Set()
    for (const f of faces) {
      // Drape chunks within reach of the camera.
      for (let k = 0; k < f.ranges.length; k++) {
        const p = f.at[k]
        if (Math.hypot(p.x - c.x, p.z - c.z) > NEAR_RADIUS_M) continue
        if (!f.cache.has(k)) {
          try {
            f.cache.set(k, groundRelative(revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: 3, globals: f.G, stations: f.ranges[k] })))
          } catch (e) { console.error(`[revetment] drape chunk ${f.key}#${k} failed —`, e); continue }
        }
        const built = f.cache.get(k)
        if (built?.stats?.tris) { drape.push(built); nearKeys.add(f.key) }
      }
      // Stones, over the same reach. ⭐ margin 2 is MEASURED, not chosen: at margin 1
      // four stones go missing at a seam, at 2 the two windows resolve identically.
      const n = f.ctx.nChunks
      for (let ci = 0; ci < n; ci++) {
        const t = (ci + 0.5) / n
        const p = f.poly[Math.min(f.poly.length - 1, Math.round(t * (f.poly.length - 1)))]
        if (Math.hypot(p.x - c.x, p.z - c.z) > NEAR_RADIUS_M) continue
        // ground-relative, like the drape: the drawn ground's two parts ride along as `ground` + `groundY` (the lift's aGround)
        for (const st of chunkStones(f.ctx, ci, 2)) { const g = drawnGroundParts(st.p[0], st.p[2]); stones.push({ ...st, p: [st.p[0], st.p[1] - g.raw - g.y, st.p[2]], ground: g.raw, groundY: g.y }) }
      }
    }
    setBuilt({ drape, stones, nearKeys })
  })

  if (!visible || !doc || !palette) return null
  return (
    <group name="revetment">
      {/* ⭐ THE FAR LAYER: every armoured metre, at every distance. ⛔ A face is
          HIDDEN here while its detailed near chunks are drawn, never drawn under
          them — two coincident surfaces would z-fight, which is a worse artifact
          than the ~4 px detail pop the swap costs (measured: p95 0.273 m at the
          90 m boundary, ▶ scratch/boulder-lod-deviation.mjs). */}
      {farMeshes.map(m => (
        <mesh
          key={`far-${m.key}`}
          geometry={m.geometry}
          material={drapeMaterial}
          visible={!built.nearKeys?.has(m.key)}
          receiveShadow
        />
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
