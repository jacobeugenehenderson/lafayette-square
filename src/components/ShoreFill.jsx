/**
 * ShoreFill — THE SHORE MEDIAN, FILLED WITH MATERIAL (BRIEF-the-shore-is-closed; Jacob, 2026-10-04: "for now, let's
 * just get the linear distance of the medians filled with material. How the medians meet the shoreline and the
 * waterline can be managed once we've closed all the gaps that matter").
 *
 * Every station whose median is known gets a solid, lit strip from the drawn shoreline to the median's other end, at
 * the LIDAR's heights (`h` at the shoreline, `he` at the other end — `cartograph/bake-shore-median.mjs`). Its colour
 * runs from sand to stone by the grain the slope across it calls for (`cartograph/shoreGrain.mjs`), and fines to sand
 * at the far end. The revetment's boulders stand on top of it where they exist.
 *
 * COLOURS ARE READ, NOT CHOSEN: sand = the sand surface's kit ramp (`surfaces.mjs` SURFACES.sand sandRamp, its mid
 * value) · stone = the revetment's stone (`revetmentMaterial.js` REVETMENT_STONE_COLOR).
 * ⚠️ The ramp read is the KIT default, not the town's authored ramp — not yet plumbed here.
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
import { terrainExag } from '../utils/terrainShader'

export default function ShoreFill({ lookId, bakeLastMs }) {
  const doc = useShoreMedianDoc(lookId, bakeLastMs)
  const built = useMemo(() => {
    if (!doc) return null
    const b = shoreFillBuffers(doc)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3))
    g.computeVertexNormals()
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
    console.log(`[ShoreFill] ${lookId}: ${(b.filledM / 1000).toFixed(2)} km of drawn shore filled · ${(b.brokenM / 1000).toFixed(2)} km broken where neighbouring far ends lie more than ${doc.gridM} m apart`)
    return { g, m }
  }, [doc, lookId])
  useEffect(() => () => { if (built) { built.g.dispose(); built.m.dispose() } }, [built])
  // Heights are RAW metres above the datum; the town's exaggeration pivots about y = 0, as the terrain shader does.
  const [group, setGroup] = useState(null)
  useFrame(() => { if (group) group.scale.y = terrainExag.value })
  if (!built) return null
  return <group ref={setGroup} name="shoreFill"><mesh geometry={built.g} material={built.m} receiveShadow /></group>
}
