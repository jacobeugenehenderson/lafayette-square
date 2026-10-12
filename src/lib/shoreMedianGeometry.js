/**
 * shoreMedianGeometry.js — the shore median diagnostic's geometry, as a pure module (no React, no vite), so a check
 * imports exactly what Stage draws. The component is `src/components/ShoreMedian.jsx`; the colours are explained there.
 */
import * as THREE from 'three'

export const SHORE_MEDIAN_COLORS = { seaward: new THREE.Color('#ff7a1a'), landward: new THREE.Color('#e93cff'), edge: new THREE.Color('#22e6ff') }

/** Pure: the artifact → region triangles (coloured) and edge segments, each vertex carrying the DRAWN ground's two parts
 *  under it (`partsAt(x, z)` → { raw, y }: the terrain part, scaled by the live exaggeration, and the mesh's own part, never
 *  scaled — `src/utils/elevation.js#drawnGroundParts`). The caller writes y = raw × exag + y (`setExag`). ⛔ A vertex whose
 *  ground is not a number throws, naming it — never drawn at 0. For checks. */
export function shoreMedianBuffers(doc, partsAt) {
  if (!doc || doc.version !== 2) throw new Error(`ShoreMedian: shore-median.json version ${doc && doc.version} — this reads v2 (the traced waterline). ▶ re-run bake-shore-median`)
  if (typeof partsAt !== 'function') throw new Error('ShoreMedian: no drawn-ground reader')
  const rp = [], rc = [], rr = [], ry = [], ep = [], er = [], ey = []
  const at = (x, z, P, R, Y) => { const g = partsAt(x, z)
    if (!Number.isFinite(g?.raw) || !Number.isFinite(g?.y)) throw new Error(`ShoreMedian: no ground under (${x.toFixed(2)}, ${z.toFixed(2)})`)
    P.push(x, 0, z); R.push(g.raw); Y.push(g.y) }
  for (const kind of ['seaward', 'landward']) for (const poly of doc.regions?.[kind] || []) {
    const outer = poly.outer.map(([x, z]) => new THREE.Vector2(x, z)), holes = (poly.holes || []).map(h => h.map(([x, z]) => new THREE.Vector2(x, z)))
    const all = [...outer, ...holes.flat()]
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outer, holes)) for (const v of [all[a], all[b], all[c]]) { at(v.x, v.y, rp, rr, ry); rc.push(SHORE_MEDIAN_COLORS[kind].r, SHORE_MEDIAN_COLORS[kind].g, SHORE_MEDIAN_COLORS[kind].b) }
    for (const ring of [poly.outer, ...(poly.holes || [])]) for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length]
      at(ax, az, ep, er, ey); at(bx, bz, ep, er, ey)
    }
  }
  return { region: { p: rp, c: rc, raw: rr, y: ry }, edge: { p: ep, raw: er, y: ey } }
}

/** Write each vertex's height at exaggeration `exag`: raw × exag + y (the drawn ground's own law). */
export function setExag(positions, raw, y, exag) {
  for (let i = 0; i < raw.length; i++) positions[3 * i + 1] = raw[i] * exag + y[i]
}
