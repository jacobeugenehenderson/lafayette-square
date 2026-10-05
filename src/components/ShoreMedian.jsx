/**
 * ShoreMedian — THE SHORE MEDIAN, DRAWN AS A SOLID DIAGNOSTIC REGION (BRIEF-the-shore-is-closed step 1).
 *
 * The region between the DRAWN SHORELINE and the LIDAR'S WATERLINE, as `cartograph/bake-shore-median.mjs` baked it
 * (`baked/<look>/shore-median.json`). Nothing here decides a treatment; it shows the space a treatment must fill, so
 * Jacob can tell three failures apart:
 *   (a) the median is missing or wrong — the solid region, its two edges and its named failures (red) show it;
 *   (b) a treatment failed to generate — <Town> hides the revetment while this layer is on, so what shows is the
 *       region with every treatment off. Today no treatment fills the median at all: everything shown is (b);
 *   (c) a seam or precision failure — the region stands at the LIDAR's heights (station at its lidar height, the
 *       waterline at y = 0), not the 5 m baked ground's: where the baked ground covers it or it floats above the
 *       ground, the two surfaces disagree there.
 *
 * COLOURS (unlit, so they read at any hour):
 *   region — ORANGE where the lidar ground runs on into the drawn water ('seaward') · MAGENTA where the lidar water
 *            reaches in behind the drawn shore ('landward')
 *   drawn shoreline — WHITE · YELLOW where the two lines touch (width under one station: SAND, never nothing) · RED
 *            where the median is NOT KNOWN (no-waterline · lidar-ends · no-lidar — the bake prints each in metres)
 *   lidar waterline — CYAN
 *
 * Off by default: a diagnostic, not part of the shipped render (`<Town layers={{ shoreMedian: true }}>`).
 */
import { useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { slabFetch } from '../lib/slabUrl.js'
import { revetmentResponseKind } from '../lib/revetmentFromSlab.js'
import { terrainExag } from '../utils/terrainShader'

const C = {
  seaward: new THREE.Color('#ff7a1a'), landward: new THREE.Color('#e93cff'),
  shore: new THREE.Color('#ffffff'), sand: new THREE.Color('#ffe14a'), unknown: new THREE.Color('#ff1e1e'),
  waterline: new THREE.Color('#22e6ff'),
}

/** Pure: the artifact → { region, shore, waterline } position/colour arrays (metres, raw heights). Exported for checks. */
export function shoreMedianBuffers(doc) {
  if (!doc || doc.version !== 1) throw new Error(`ShoreMedian: unsupported shore-median.json version ${doc && doc.version}`)
  const K = doc.kinds, sea = K.indexOf('seaward'), land = K.indexOf('landward')
  if (sea < 0 || land < 0) throw new Error('ShoreMedian: shore-median.json names no seaward/landward kinds')
  const stationM = doc.stationM
  // Two neighbouring crossings further apart than one terrain grid step are not one waterline: the transects met it in
  // different places (a bend, a channel). The line and the region BREAK there rather than bridge the gap.
  const joinM = doc.gridM
  if (!(stationM > 0) || !(joinM > 0)) throw new Error('ShoreMedian: shore-median.json carries no stationM/gridM')
  const rp = [], rc = [], sp = [], sc = [], wp = []
  for (const f of doc.faces) {
    const n = f.xs.length
    const known = (i) => f.k[i] === sea || f.k[i] === land
    const hy = (i) => Number.isFinite(f.h[i]) ? f.h[i] : 0
    for (let i = 0; i + 1 < n; i++) {
      // The drawn shoreline, coloured by what the median is at this station.
      const col = !known(i) ? C.unknown : f.w[i] < stationM ? C.sand : C.shore
      sp.push(f.xs[i], hy(i), f.zs[i], f.xs[i + 1], hy(i + 1), f.zs[i + 1]); for (let k = 0; k < 2; k++) sc.push(col.r, col.g, col.b)
      if (!known(i) || !known(i + 1)) continue
      if (Math.hypot(f.ex[i + 1] - f.ex[i], f.ez[i + 1] - f.ez[i]) > joinM) continue
      // The lidar waterline (y = 0 by definition).
      wp.push(f.ex[i], 0, f.ez[i], f.ex[i + 1], 0, f.ez[i + 1])
      // The region: a quad from the shoreline to the waterline, where both stations agree which way it lies.
      if (f.k[i] !== f.k[i + 1]) continue
      const c = f.k[i] === sea ? C.seaward : C.landward
      const a = [f.xs[i], hy(i), f.zs[i]], b = [f.xs[i + 1], hy(i + 1), f.zs[i + 1]]
      const e = [f.ex[i], 0, f.ez[i]], g = [f.ex[i + 1], 0, f.ez[i + 1]]
      rp.push(...a, ...b, ...g, ...a, ...g, ...e); for (let k = 0; k < 6; k++) rc.push(c.r, c.g, c.b)
    }
  }
  return { region: { p: rp, c: rc }, shore: { p: sp, c: sc }, waterline: { p: wp } }
}

const geom = (p, c) => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  if (c) g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3))
  return g
}

export default function ShoreMedian({ lookId, bakeLastMs }) {
  const [doc, setDoc] = useState(null)
  useEffect(() => {
    if (!lookId) return
    let dead = false
    slabFetch(lookId, 'shore-median.json', undefined, bakeLastMs || null)
      .then(r => {
        const kind = revetmentResponseKind(r.status, r.headers.get('content-type'))
        if (kind === 'present') return r.json()
        // ⛔ An inland town writes none, and that is normal — but the operator turned this layer ON to look, so say it.
        if (kind === 'absent') { console.warn(`[ShoreMedian] ${lookId}: no shore-median.json — an inland town, or one not baked since the median step landed. ▶ node cartograph/bake-shore-median.mjs --scene=<id>`); return null }
        if (kind === 'unverifiable') { console.warn(`[ShoreMedian] ${lookId}: the server answered ${r.status} '${r.headers.get('content-type')}' — not the artifact, and NOT proof the town has none.`); return null }
        throw new Error(`HTTP ${r.status}`)
      })
      .then(d => { if (!dead) setDoc(d) })
      .catch(e => console.error(`[ShoreMedian] ${lookId}: FAILED to load shore-median.json —`, e))
    return () => { dead = true }
  }, [lookId, bakeLastMs])

  const built = useMemo(() => {
    if (!doc) return null
    const b = shoreMedianBuffers(doc)
    return {
      region: geom(b.region.p, b.region.c), shore: geom(b.shore.p, b.shore.c), waterline: geom(b.waterline.p),
      regionMat: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      shoreMat: new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }),
      waterMat: new THREE.LineBasicMaterial({ color: C.waterline, depthTest: false }),
    }
  }, [doc])
  useEffect(() => () => { if (built) for (const v of Object.values(built)) v.dispose?.() }, [built])

  // Heights are RAW metres above the datum; the town's exaggeration pivots about y = 0, as the terrain shader does.
  const [group, setGroup] = useState(null)
  useFrame(() => { if (group) group.scale.y = terrainExag.value })

  if (!built) return null
  return (
    <group ref={setGroup} name="shoreMedian">
      <mesh geometry={built.region} material={built.regionMat} renderOrder={40} />
      <lineSegments geometry={built.shore} material={built.shoreMat} renderOrder={41} />
      <lineSegments geometry={built.waterline} material={built.waterMat} renderOrder={41} />
    </group>
  )
}
