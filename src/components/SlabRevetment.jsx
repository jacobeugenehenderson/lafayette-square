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
 * in the harness at `/boulders.html` before anything reached the operator's map:
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
import { revetmentFaces } from '../lib/revetmentFromSlab.js'
import { ASSET_BASE } from '../lib/bakedUrl.js'

/** How far from the camera stone and drape are built, metres. ⛔ A BUDGET, not a
 *  look: it sets how much work one camera move can trigger. Raising it does not
 *  make the shore longer, it makes each step cost more. */
const VIEW_RADIUS_M = 90

/** Rebuild only after the camera has moved this far. ⛔ Without it every frame
 *  re-selects chunks on a 26 km shore for a camera that has not moved. */
const RESELECT_M = 6

export default function SlabRevetment({ lookId, bakeLastMs, visible = true }) {
  const camera = useThree(s => s.camera)
  const [doc, setDoc] = useState(null)

  // ── the instruction ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lookId) return
    let dead = false
    // ⛔ CACHE-BUST OR THE OPERATOR EYE-GATES THE PREVIOUS BAKE. Preview mounted its
    // baked consumers at unchanging URLs until 2026-09-20 and the browser served the
    // stale slab; a re-bake read as "unchanged" and the A/B was recorded backwards.
    const t = bakeLastMs ? `?t=${bakeLastMs}` : ''
    fetch(`${ASSET_BASE}baked/${lookId}/revetment.json${t}`)
      .then(r => {
        // ⭐ 404 is NORMAL and is not a failure: `bake-revetment` writes nothing for a
        // town with no shoreline, or whose terrain datum is not the water. Most towns
        // have none. ⛔ Anything else is loud — a revetment that fails to load must
        // not read as a coast that has no wall.
        if (r.status === 404) return null
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => { if (!dead) setDoc(d) })
      .catch(e => { console.error(`[revetment] ${lookId}: FAILED to load revetment.json —`, e) })
    return () => { dead = true }
  }, [lookId, bakeLastMs])

  // ── one palette + one material for the whole shore ─────────────────────────
  // ⭐ Seeded from the slab so two towns do not wear the same rocks and a re-bake
  // does not reshuffle a shore the operator has already looked at.
  const palette = useMemo(() => (doc ? boulderPalette({ seed: doc.seed }) : null), [doc])
  // ⛔ `makeRevetmentMaterial` returns `{ material, uniforms }`, NOT a bare material.
  // Treating it as one threw on unmount (`material.dispose is not a function`), React
  // tore the component down through its error boundary, and the shore rendered
  // nothing — with the artifact loaded and every station correct. ⭐ It failed on the
  // CLEANUP path, so the first frame looked fine and the failure only appeared once
  // something remounted: a stone wall that is missing for no visible reason.
  const { material } = useMemo(() => makeRevetmentMaterial({ waterY: 0 }), [])
  useEffect(() => () => material.dispose?.(), [material])
  useEffect(() => () => { palette?.forEach(g => g.dispose()) }, [palette])

  // ── the buildable faces, and their chunk lattices ──────────────────────────
  // ⚠️ Built once per document. `drapeGlobals` is ARC-GLOBAL on purpose: every chunk
  // of a face derives its vertices from the same lattice, which is what makes the
  // seam exact rather than approximately exact.
  const faces = useMemo(() => {
    if (!doc) return []
    return revetmentFaces(doc).filter(f => f.anyArmour).map(f => {
      const G = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, octaves: 3 })
      const per = Math.max(4, Math.round(CHUNK_M / G.step))
      const ranges = []
      for (let i = 0; i < G.nAlong - 1; i += per) ranges.push([i, Math.min(G.nAlong - 1, i + per)])
      // Where each drape chunk sits, so the camera can pick by distance instead of
      // by walking the whole arc every time.
      const at = ranges.map(([a, b]) => {
        const m = f.poly[Math.min(f.poly.length - 1, Math.round(((a + b) / 2 / (G.nAlong - 1)) * (f.poly.length - 1)))]
        return m || f.poly[0]
      })
      const ctx = shoreContext({ poly: f.poly, crestAt: f.crestAt, oversample: 10, paletteSize: palette.length, seed: doc.seed })
      return { ...f, G, ranges, at, ctx, cache: new Map() }
    })
  }, [doc, palette])

  const [built, setBuilt] = useState({ drape: [], stones: [] })
  const lastAt = useRef(null)

  useFrame(() => {
    if (!visible || !faces.length) return
    const c = camera.position
    if (lastAt.current && Math.hypot(c.x - lastAt.current.x, c.z - lastAt.current.z) < RESELECT_M) return
    lastAt.current = { x: c.x, z: c.z }

    const drape = [], stones = []
    for (const f of faces) {
      // Drape chunks within reach of the camera.
      for (let k = 0; k < f.ranges.length; k++) {
        const p = f.at[k]
        if (Math.hypot(p.x - c.x, p.z - c.z) > VIEW_RADIUS_M) continue
        if (!f.cache.has(k)) {
          try {
            f.cache.set(k, revetmentDrape({ poly: f.poly, crestAt: f.crestAt, octaves: 3, globals: f.G, stations: f.ranges[k] }))
          } catch (e) { console.error(`[revetment] drape chunk ${f.key}#${k} failed —`, e); continue }
        }
        const built = f.cache.get(k)
        if (built?.stats?.tris) drape.push(built)
      }
      // Stones, over the same reach. ⭐ margin 2 is MEASURED, not chosen: at margin 1
      // four stones go missing at a seam, at 2 the two windows resolve identically.
      const n = f.ctx.nChunks
      for (let ci = 0; ci < n; ci++) {
        const t = (ci + 0.5) / n
        const p = f.poly[Math.min(f.poly.length - 1, Math.round(t * (f.poly.length - 1)))]
        if (Math.hypot(p.x - c.x, p.z - c.z) > VIEW_RADIUS_M) continue
        stones.push(...chunkStones(f.ctx, ci, 2))
      }
    }
    setBuilt({ drape, stones })
  })

  if (!visible || !doc || !palette) return null
  return (
    <group name="revetment">
      {built.drape.map((d, i) => (
        <mesh key={i} geometry={d.geometry} material={material} castShadow receiveShadow />
      ))}
      {!!built.stones.length && (
        <InstancedBoulders palette={palette} instances={built.stones} material={material} />
      )}
    </group>
  )
}
