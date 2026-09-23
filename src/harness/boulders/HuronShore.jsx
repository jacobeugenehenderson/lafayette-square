/**
 * HuronShore.jsx — the harness, on huron's ACTUAL shoreline.
 * ⛔ Reads baked artifacts. Nothing bakes, nothing writes, nothing in the operator's map.
 *
 * ⭐ One arc at a time, chosen by index, because that is how the failures separate:
 * a 10 km arc and a 2 m stub are different objects and averaging them hides both.
 * ▶ The per-arc diagnosis this view is the eye-check for is a CHECK:
 *   node scratch/boulder-huron-arcs.mjs   ·   node scratch/boulder-drape-chunk.mjs
 *
 * ⭐⭐ BOTH THE STONE AND THE DRAPE ARE CHUNKED, so the cost follows the CAMERA and
 * not the arc. The drape used to build the whole arc eagerly — 606,570 triangles for
 * arc #3, 99% of that arc's total cost — so standing at one end of a 10 km shore paid
 * for all 10 km of it.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import InstancedBoulders from '../../components/InstancedBoulders.jsx'
import { revetmentDrape, drapeGlobals } from '../../lib/revetmentDrape.js'
import { loadHuronShore, profileArc, crestFn, arcFaces } from './huron.js'
import { shoreContext, chunkStones, CHUNK_M } from '../../lib/shoreChunks.js'

/** How far from the camera a chunk is built. ⛔ A budget: it sets how much work one
 *  camera move can trigger, for the stone and the drape alike. */
const VIEW_RADIUS_M = 70

export function HuronShore({ palette, material, arcIndex, onStats, onArcs }) {
  const [shore, setShore] = useState(null)
  const camera = useThree(s => s.camera)
  const controls = useThree(s => s.controls)

  useEffect(() => {
    let dead = false
    loadHuronShore({}).then(s => { if (!dead) { setShore(s); onArcs(s.arcs) } })
      // ⛔ Loud. A missing artifact must not degrade to an empty shore that looks
      // like a town with no revetment.
      .catch(e => { console.error('huron shore load FAILED —', e); onArcs([]) })
    return () => { dead = true }
  }, [])

  const built = useMemo(() => {
    if (!shore || !shore.arcs[arcIndex]) return null
    const arc = shore.arcs[arcIndex]
    // ⭐ TWO FACES where the arc is a bank between two waters. One face would armour
    // a jetty on one side and leave the other bare.
    const faces = arcFaces(arc)
    const prof = profileArc(arc, shore.elevAt, shore.armourAt)
    const crestAt = crestFn(prof)

    const faceBuilds = faces.map(poly => {
      // ⭐ The lattice is ARC-GLOBAL and shared by every chunk of this face. That is
      // what makes the seam exact rather than approximately exact: a chunk's vertex
      // for station i is computed from exactly the inputs its neighbour uses for i.
      // ▶ Proven identical to the eager build, positions AND normals:
      //   node scratch/boulder-drape-chunk.mjs
      const G = drapeGlobals({ poly, crestAt, octaves: 3 })
      // Chunk length in STATIONS, derived so a chunk spans ~CHUNK_M of shore whatever
      // the lattice step is on this arc. ⛔ Not a fixed station count: `step` is a
      // function of the crest and differs arc to arc.
      const per = Math.max(4, Math.round(CHUNK_M / G.step))
      const ranges = []
      for (let i = 0; i < G.nAlong - 1; i += per) ranges.push([i, Math.min(G.nAlong - 1, i + per)])
      return { poly, G, ranges, cache: new Map() }
    })

    const ctx = shoreContext({ poly: faces[0], crestAt, oversample: 10, paletteSize: palette.length })
    const armoured = prof.armour.reduce((a, b) => a + b, 0)
    return { arc, poly: faces[0], prof, crestAt, faceBuilds, ctx, armouredPct: (100 * armoured) / prof.armour.length }
  }, [shore, arcIndex, palette.length])

  // ⭐ Frame the camera on the TALLEST armoured stretch of this arc — the place the
  // wall actually exists. A fixed camera on a 26 km shore looks at water.
  const focus = useRef(0)
  useEffect(() => {
    if (!built) return
    const { prof, poly } = built
    let best = 0, bi = 0
    for (let i = 0; i < prof.crest.length; i++) if (prof.armour[i] && prof.crest[i] > best) { best = prof.crest[i]; bi = i }
    focus.current = prof.t[Math.min(prof.t.length - 1, bi)] || 0
    const p = poly[Math.min(poly.length - 1, bi)]
    const a = poly[Math.max(0, bi - 1)], b = poly[Math.min(poly.length - 1, bi + 1)]
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1
    const nx = dz / L, nz = -dx / L                 // waterward, by the arc's own winding
    camera.position.set(p.x + nx * 14, Math.max(1.2, best * 0.55), p.z + nz * 14)
    if (controls?.target) { controls.target.set(p.x, best * 0.4, p.z); controls.update() }
  }, [built, camera, controls])

  const [drapeChunks, setDrapeChunks] = useState([])
  const [instances, setInstances] = useState([])

  useEffect(() => {
    if (!built) { setInstances([]); setDrapeChunks([]); return }
    const { ctx, faceBuilds, crestAt } = built
    const half = Math.ceil(VIEW_RADIUS_M / CHUNK_M)

    // ── stone ──────────────────────────────────────────────────────────────────
    const t0 = performance.now()
    const here = Math.max(0, Math.min(ctx.nChunks - 1, Math.round((ctx.total * focus.current) / CHUNK_M)))
    const stones = []
    let sChunks = 0
    for (let c = Math.max(0, here - half); c <= Math.min(ctx.nChunks - 1, here + half); c++) {
      stones.push(...chunkStones(ctx, c, 2)); sChunks++
    }
    const stoneMs = performance.now() - t0

    // ── drape ──────────────────────────────────────────────────────────────────
    const t1 = performance.now()
    const meshes = []
    let dChunks = 0, dTris = 0
    for (const fb of faceBuilds) {
      const mid = Math.round((fb.ranges.length - 1) * focus.current)
      for (let k = Math.max(0, mid - half); k <= Math.min(fb.ranges.length - 1, mid + half); k++) {
        if (!fb.cache.has(k)) {
          try {
            fb.cache.set(k, revetmentDrape({ poly: fb.poly, crestAt, octaves: 3, globals: fb.G, stations: fb.ranges[k] }))
          } catch (e) { console.error('drape chunk failed', k, e); continue }
        }
        const c = fb.cache.get(k)
        dChunks++
        if (c.stats.tris) { meshes.push(c); dTris += c.stats.tris }
      }
    }
    const drapeMs = performance.now() - t1

    setInstances(stones)
    setDrapeChunks(meshes)
    onStats({
      arc: built.arc.id, verts: built.arc.verts, len: built.arc.len, flip: built.arc.flip,
      twoFaced: !!built.arc.twoFaced, armouredPct: built.armouredPct,
      drapeChunks: dChunks, drapeTris: dTris, drapeMs,
      chunks: sChunks, stones: stones.length, genMs: stoneMs,
      calls: new Set(stones.map(o => o.i)).size,
      arcChunks: faceBuilds.reduce((s, f) => s + f.ranges.length, 0),
    })
  }, [built])

  if (!built) return null
  return (
    <>
      {drapeChunks.map((d, i) => <mesh key={i} geometry={d.geometry} material={material} castShadow receiveShadow />)}
      {!!instances.length && <InstancedBoulders palette={palette} instances={instances} material={material} />}
      {/* the lake, at y = 0 — the terrain's datum IS the water */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[9000, 9000]} />
        <meshStandardMaterial color="#20404e" roughness={0.25} metalness={0.15} />
      </mesh>
    </>
  )
}
export default HuronShore
