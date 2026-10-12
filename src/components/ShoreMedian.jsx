/**
 * ShoreMedian — THE SHORE MEDIAN, DRAWN AS A SOLID DIAGNOSTIC REGION (BRIEF-the-shore-is-closed).
 *
 * The region between the DRAWN SHORELINE and the TRACED LIDAR WATERLINE, as `cartograph/bake-shore-median.mjs` baked it
 * (`baked/<look>/shore-median.json`, v2). It shows the space with every treatment OFF (<Town> hides the revetment while
 * this layer is on; the ground's own `shore` sand is what it replaces), so Jacob can tell apart: (a) the median is
 * missing or wrong (the region and its outline) · (b) a treatment failed (what the shipped render draws there).
 *
 * COLOURS (unlit, drawn over everything, so they read at any hour and through the ground):
 *   ORANGE — drawn water the lidar shows dry (the lidar ground runs on into the drawn water)
 *   MAGENTA — drawn land the lidar shows wet (the lidar water reaches in behind the drawn shore)
 *   CYAN — every edge of the median: the drawn shoreline where it bounds it, and the traced waterline
 * Where the bake found NO lidar value the median is not known and is not drawn (the bake prints the hectares).
 *
 * Off by default: a diagnostic, not part of the shipped render (`<Town layers={{ shoreMedian: true }}>`).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { slabFetch } from '../lib/slabUrl.js'
import { revetmentResponseKind } from '../lib/revetmentFromSlab.js'
import { terrainExag, onTerrainReload } from '../utils/terrainShader'
import { drawnGroundParts, onDrawnGround } from '../utils/elevation'
import { shoreMedianBuffers, setExag, SHORE_MEDIAN_COLORS as C } from '../lib/shoreMedianGeometry.js'

const geom = (p, c) => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  if (c) g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3))
  return g
}

/** The baked median, fetched once per bake. `warnAbsent`: the diagnostic says so when a town has none (the operator
 *  turned it on to look). */
export function useShoreMedianDoc(lookId, bakeLastMs, { warnAbsent = false } = {}) {
  const [doc, setDoc] = useState(null)
  useEffect(() => {
    if (!lookId) return
    let dead = false
    slabFetch(lookId, 'shore-median.json', undefined, bakeLastMs || null)
      .then(r => {
        const kind = revetmentResponseKind(r.status, r.headers.get('content-type'))
        if (kind === 'present') return r.json()
        if (kind === 'absent') { if (warnAbsent) console.warn(`[ShoreMedian] ${lookId}: no shore-median.json — an inland town, or one not baked since the median step landed. ▶ node cartograph/bake-shore-median.mjs --scene=<id>`); return null }
        if (kind === 'unverifiable') { console.warn(`[ShoreMedian] ${lookId}: the server answered ${r.status} '${r.headers.get('content-type')}' — not the artifact, and NOT proof the town has none.`); return null }
        throw new Error(`HTTP ${r.status}`)
      })
      .then(d => { if (!dead) setDoc(d) })
      .catch(e => console.error(`[ShoreMedian] ${lookId}: FAILED to load shore-median.json —`, e))
    return () => { dead = true }
  }, [lookId, bakeLastMs, warnAbsent])
  return doc
}

export default function ShoreMedian({ lookId, bakeLastMs }) {
  const doc = useShoreMedianDoc(lookId, bakeLastMs, { warnAbsent: true })

  // ⭐ ON THE DRAWN GROUND (`drawnGroundParts`), the ground the slab draws and every mover stands on — re-seated when the
  // terrain or the drawn ground is re-pointed (a look switch, the ground loading).
  const [gen, setGen] = useState(0)
  useEffect(() => onTerrainReload(() => setGen(g => g + 1)), [])
  useEffect(() => onDrawnGround(() => setGen(g => g + 1)), [])
  const built = useMemo(() => {
    if (!doc) return null
    const b = shoreMedianBuffers(doc, drawnGroundParts)
    return {
      parts: b,
      region: geom(b.region.p, b.region.c), edge: geom(b.edge.p),
      regionMat: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.85 }),
      edgeMat: new THREE.LineBasicMaterial({ color: C.edge, depthTest: false }),
    }
  }, [doc, gen])
  useEffect(() => () => { if (built) for (const v of Object.values(built)) v.dispose?.() }, [built])

  // Each vertex at the drawn ground's own law, raw × the live exaggeration + its unexaggerated part — rewritten only when
  // the exaggeration moves (it tweens per shot: flat in Browse, 1 in Street, the town's value in Hero).
  const last = useRef(null)
  useFrame(() => {
    if (!built) return
    const e = terrainExag.value
    if (last.current === e && last.current !== null) return
    last.current = e
    for (const [g, k] of [[built.region, 'region'], [built.edge, 'edge']]) {
      const pos = g.getAttribute('position'); setExag(pos.array, built.parts[k].raw, built.parts[k].y, e); pos.needsUpdate = true; g.computeBoundingSphere() }
  })
  useEffect(() => { last.current = null }, [built])

  if (!built) return null
  return (
    <group name="shoreMedian">
      <mesh geometry={built.region} material={built.regionMat} renderOrder={40} />
      <lineSegments geometry={built.edge} material={built.edgeMat} renderOrder={41} />
    </group>
  )
}
