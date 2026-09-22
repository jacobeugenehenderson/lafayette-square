/**
 * HuronShore.jsx — the harness, on huron's ACTUAL shoreline.
 * ⛔ Reads baked artifacts. Nothing bakes, nothing writes, nothing in the operator's map.
 *
 * ⭐ One arc at a time, chosen by index, because that is how the failures separate:
 * a 10 km arc and a 2 m stub are different objects and averaging them hides both.
 * The per-arc diagnosis that this view is the eye-check for is a CHECK:
 * ▶ node scratch/boulder-huron-arcs.mjs
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import InstancedBoulders from '../../components/InstancedBoulders.jsx'
import { revetmentDrape } from '../../lib/revetmentDrape.js'
import { loadHuronShore, profileArc, crestFn, arcFaces } from './huron.js'
import { shoreContext, chunkStones, CHUNK_M } from './chunked.js'

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
    const poly = faces[0]
    const prof = profileArc(arc, shore.elevAt, shore.armourAt)
    const crestAt = crestFn(prof)
    const drapes = []
    for (const f of faces) {
      try { drapes.push(revetmentDrape({ poly: f, crestAt, octaves: 3 })) }
      catch (e) { console.error('drape failed on arc', arcIndex, e) }
    }
    const drape = drapes[0] || null
    // Stones: chunked, and only the chunks near the camera once it is placed.
    const ctx = shoreContext({ poly, crestAt, oversample: 10, paletteSize: palette.length })
    const armoured = prof.armour.reduce((a, b) => a + b, 0)
    return { arc, poly, prof, crestAt, drape, drapes, ctx, armouredPct: (100 * armoured) / prof.armour.length }
  }, [shore, arcIndex, palette.length])

  // ⭐ Frame the camera on the TALLEST armoured stretch of this arc — the place the
  // wall actually exists. A fixed camera on a 26 km shore looks at water.
  useEffect(() => {
    if (!built) return
    const { prof, poly } = built
    let best = 0, bi = 0
    for (let i = 0; i < prof.crest.length; i++) if (prof.armour[i] && prof.crest[i] > best) { best = prof.crest[i]; bi = i }
    const p = poly[Math.min(poly.length - 1, bi)]
    const a = poly[Math.max(0, bi - 1)], b = poly[Math.min(poly.length - 1, bi + 1)]
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1
    const nx = dz / L, nz = -dx / L                 // waterward, by the arc's own winding
    camera.position.set(p.x + nx * 14, Math.max(1.2, best * 0.55), p.z + nz * 14)
    if (controls?.target) { controls.target.set(p.x, best * 0.4, p.z); controls.update() }
  }, [built, camera, controls])

  const [instances, setInstances] = useState([])
  useEffect(() => {
    if (!built) { setInstances([]); return }
    const { ctx } = built
    const t0 = performance.now()
    // The chunks around the framed point; the rest of a 10 km arc is not in view.
    const here = Math.max(0, Math.min(ctx.nChunks - 1, Math.round(
      (ctx.total * 0.5) / CHUNK_M)))
    const out = []
    let n = 0
    for (let c = Math.max(0, here - 5); c <= Math.min(ctx.nChunks - 1, here + 5); c++) { out.push(...chunkStones(ctx, c, 2)); n++ }
    setInstances(out)
    onStats({
      arc: built.arc.id, verts: built.arc.verts, len: built.arc.len, flip: built.arc.flip,
      armouredPct: built.armouredPct,
      drapeTris: built.drape ? built.drape.stats.tris : 0,
      drapeBytes: built.drape ? built.drape.stats.bytes : 0,
      chunks: n, stones: out.length, genMs: performance.now() - t0,
      calls: new Set(out.map(o => o.i)).size,
    })
  }, [built])

  if (!built) return null
  return (
    <>
      {built.drapes.map((d, i) => <mesh key={i} geometry={d.geometry} material={material} castShadow receiveShadow />)}
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
