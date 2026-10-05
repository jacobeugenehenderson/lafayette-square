/**
 * ShoreFill — THE SHORE MEDIAN, FILLED WITH MATERIAL (BRIEF-the-shore-is-closed; Jacob, 2026-10-04: "for now, let's
 * just get the linear distance of the medians filled with material. How the medians meet the shoreline and the
 * waterline can be managed once we've closed all the gaps that matter").
 *
 * Every station whose median is known gets a solid, lit strip from the drawn shoreline to the median's other end, at
 * the LIDAR's heights (`h` at the shoreline, `he` at the other end — `cartograph/bake-shore-median.mjs`). The
 * revetment's boulders stand on top of it where they exist.
 *
 * COLOURS ARE READ, NOT CHOSEN — three bands across each strip (`src/lib/shoreFill.js`): the edge that meets land takes
 * the town's ground colour there (`ground.colormap.png`, the map the tree trunks blend into) · the middle takes the
 * grain the slope calls for (`cartograph/shoreGrain.mjs`), from the town's bed sand to the revetment's stone · the edge
 * that meets the water takes the bed's colour (`ground.json` group `bed`).
 *
 * Filled: 'seaward' · 'landward' · 'drawn-water-dry' (the lidar shows ground across the whole drawn water: the strip runs
 * to the drawn water's far edge) · 'lidar-ends' (to the last lidar value). NOT filled, and printed by the bake in
 * metres: 'no-waterline' · 'no-lidar'. Two neighbouring stations whose far ends lie more than one terrain grid step
 * apart are not one strip, so the fill breaks there (the same rule as the diagnostic).
 */
import { useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useShoreMedianDoc } from './ShoreMedian.jsx'
import { shoreFillBuffers } from '../lib/shoreFill.js'
import { slabFetch } from '../lib/slabUrl.js'
import { terrainExag } from '../utils/terrainShader'

/** The town's bed colour and a CPU sampler over its ground-colour map. ⛔ Loud when either is missing: a fill coloured
 *  from nothing would be a plausible-looking guess. */
function useGroundColours(lookId, bakeLastMs) {
  const [out, setOut] = useState(null)
  useEffect(() => {
    if (!lookId) return
    let dead = false
    ;(async () => {
      const gj = await (await slabFetch(lookId, 'ground.json', undefined, bakeLastMs || null)).json()
      const bed = (gj.groups || []).find(g => g.kind === 'mat' && g.id === 'bed')
      if (!bed?.color) throw new Error('ground.json has no `bed` group — re-bake the ground')
      const cm = gj.colormap
      if (!cm?.image || !(cm.size > 0)) throw new Error('ground.json has no colormap — ▶ bake-ground-ao')
      const blob = await (await slabFetch(lookId, cm.image, undefined, bakeLastMs || null)).blob()
      const bmp = await createImageBitmap(blob)
      const cv = new OffscreenCanvas(bmp.width, bmp.height), cx = cv.getContext('2d')
      cx.drawImage(bmp, 0, 0)
      const px = cx.getImageData(0, 0, bmp.width, bmp.height).data
      // The bake writes pixel (u, v) at u = (x − min.x)/span.x·size, v = (z − min.z)/span.z·size (bake-ground-ao).
      const landAt = (x, z) => {
        const u = Math.floor((x - cm.min[0]) / cm.span[0] * cm.size), v = Math.floor((z - cm.min[1]) / cm.span[1] * cm.size)
        if (u < 0 || v < 0 || u >= bmp.width || v >= bmp.height) return null
        const i = (v * bmp.width + u) * 4
        if (px[i + 3] === 0) return null
        return new THREE.Color().setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, THREE.SRGBColorSpace)
      }
      if (!dead) setOut({ bedColor: new THREE.Color(bed.color), landAt, landOffM: 1.5 * cm.span[0] / cm.size })
    })().catch(e => console.error(`[ShoreFill] ${lookId}: ⛔ the fill has no colours to blend into — ${e.message}`))
    return () => { dead = true }
  }, [lookId, bakeLastMs])
  return out
}

export default function ShoreFill({ lookId, bakeLastMs }) {
  const doc = useShoreMedianDoc(lookId, bakeLastMs)
  const colours = useGroundColours(lookId, bakeLastMs)
  const built = useMemo(() => {
    if (!doc || !colours) return null
    const b = shoreFillBuffers(doc, colours)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3))
    g.computeVertexNormals()
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
    console.log(`[ShoreFill] ${lookId}: ${(b.filledM / 1000).toFixed(2)} km of drawn shore filled · ${(b.brokenM / 1000).toFixed(2)} km broken where neighbouring far ends lie more than ${doc.gridM} m apart` +
      (b.offMap ? ` · ⚠️ ${b.offMap} land edge(s) beyond the ground-colour map took the grain's colour` : ''))
    return { g, m }
  }, [doc, colours, lookId])
  useEffect(() => () => { if (built) { built.g.dispose(); built.m.dispose() } }, [built])
  // Heights are RAW metres above the datum; the town's exaggeration pivots about y = 0, as the terrain shader does.
  const [group, setGroup] = useState(null)
  useFrame(() => { if (group) group.scale.y = terrainExag.value })
  if (!built) return null
  return <group ref={setGroup} name="shoreFill"><mesh geometry={built.g} material={built.m} receiveShadow /></group>
}
