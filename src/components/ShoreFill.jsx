/**
 * ShoreFill — THE SHORE MEDIAN, FILLED (BRIEF-the-shore-is-closed; Jacob, 2026-10-04: "for now, let's just get the
 * linear distance of the medians filled with material").
 *
 * The fill's SHAPE, as a geometry, from the baked median (`src/lib/shoreFill.js` builds it). It draws nothing itself:
 * `BakedGround` draws it with the bed group's own surface material, so it is the town's sand — "supposed to meet with
 * sand, not 'yellow'" (Jacob, 2026-10-04). The revetment's boulders stand on top of it.
 */
import { useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useShoreMedianDoc } from './ShoreMedian.jsx'
import { shoreFillBuffers } from '../lib/shoreFill.js'

/** @returns THREE.BufferGeometry | null — raw heights above the datum (the caller applies the town's exaggeration). */
export function useShoreFillGeometry(lookId, bakeLastMs, enabled = true) {
  const doc = useShoreMedianDoc(enabled ? lookId : null, bakeLastMs)
  const geometry = useMemo(() => {
    if (!doc) return null
    const b = shoreFillBuffers(doc)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3))
    g.computeVertexNormals()
    console.log(`[ShoreFill] ${lookId}: ${(b.filledM / 1000).toFixed(2)} km of drawn shore filled · ${(b.brokenM / 1000).toFixed(2)} km broken where neighbouring far ends lie more than ${doc.gridM} m apart`)
    return g
  }, [doc, lookId])
  useEffect(() => () => geometry?.dispose(), [geometry])
  return geometry
}
