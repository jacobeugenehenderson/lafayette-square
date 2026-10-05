/**
 * shoreMedianGeometry.js — the shore median diagnostic's geometry, as a pure module (no React, no vite), so a check
 * imports exactly what Stage draws. The component is `src/components/ShoreMedian.jsx`; the colours are explained there.
 */
import * as THREE from 'three'

export const SHORE_MEDIAN_COLORS = { seaward: new THREE.Color('#ff7a1a'), landward: new THREE.Color('#e93cff'), edge: new THREE.Color('#22e6ff') }

/** Pure: the artifact → region triangles (coloured) and edge segments, draped at `groundAt` (raw metres). For checks. */
export function shoreMedianBuffers(doc, groundAt) {
  if (!doc || doc.version !== 2) throw new Error(`ShoreMedian: shore-median.json version ${doc && doc.version} — this reads v2 (the traced waterline). ▶ re-run bake-shore-median`)
  if (typeof groundAt !== 'function') throw new Error('ShoreMedian: no ground sampler')
  const rp = [], rc = [], ep = []
  const y = (x, z) => { const h = groundAt(x, z); return Number.isFinite(h) ? h : 0 }
  for (const kind of ['seaward', 'landward']) for (const poly of doc.regions?.[kind] || []) {
    const outer = poly.outer.map(([x, z]) => new THREE.Vector2(x, z)), holes = (poly.holes || []).map(h => h.map(([x, z]) => new THREE.Vector2(x, z)))
    const all = [...outer, ...holes.flat()]
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outer, holes)) for (const v of [all[a], all[b], all[c]]) { rp.push(v.x, y(v.x, v.y), v.y); rc.push(SHORE_MEDIAN_COLORS[kind].r, SHORE_MEDIAN_COLORS[kind].g, SHORE_MEDIAN_COLORS[kind].b) }
    for (const ring of [poly.outer, ...(poly.holes || [])]) for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length]
      ep.push(ax, y(ax, az), az, bx, y(bx, bz), bz)
    }
  }
  return { region: { p: rp, c: rc }, edge: { p: ep } }
}

