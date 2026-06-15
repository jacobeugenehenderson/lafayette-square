// READ-ONLY — pin the junction node at tile-16's bump [521,-407] for the
// constructed-corner design: which streets meet, their offset depths, the node
// classification (corner vs through), and the nearest ribbons intersection.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const cw = d.curbWidth
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: cw, blockLandUse: d.blockLandUse || null, cornerRadiusScale: d.cornerRadiusScale ?? 1, blockCustoms: d.blockCustoms || null, emitArtifact: true })
const T = pr._shapeArtifact[16]
const focus = [521, -407]
const near = (p, R) => Math.hypot(p[0] - focus[0], p[1] - focus[1]) < R

console.log('=== tile 16 runs (which streets bound it, depths) ===')
for (const run of (T.runs || [])) {
  const so = r.streets[run.streetIdx]
  const nm = so ? (so.name || so.skelId || run.streetIdx) : run.streetIdx
  // does this run pass near the bump?
  const hits = (run.poly || []).filter(p => near(p, 14))
  const m = run.measure || {}
  const side = run.side
  const sd = m[side] || {}
  console.log(`  run skelId=${run.skelId} street="${nm}" side=${side} pavHW=${sd.pavementHW} tl=${sd.treelawn} sw=${sd.sidewalk} term=${sd.terminal}  polyPtsNearBump=${hits.length}/${(run.poly||[]).length}`)
}

console.log('\n=== ribbons intersections near the bump (the node) ===')
for (const ix of (r.intersections || [])) {
  if (!near(ix.point, 12)) continue
  const names = (ix.streets || []).map(si => { const s = r.streets[typeof si === 'object' ? si.street ?? si.idx : si]; return s ? (s.name || s.skelId) : si })
  console.log(`  node @[${ix.point.map(x => x.toFixed(1))}] degree=${(ix.streets || []).length} streets=${JSON.stringify(names)}`)
}

console.log('\n=== tile-16 ring vertices near the bump + edge street identity ===')
const ring = T.iA[0] || []
// reconstruct which street each ring edge belongs to is not in the artifact; instead
// report the ring geometry + turn so we see the notch structure precisely.
const n = ring.length
for (let i = 0; i < n; i++) {
  const v = ring[i]; if (!near(v, 10)) continue
  const a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n]
  const inx = v[0] - a[0], iny = v[1] - a[1], ox = b[0] - v[0], oy = b[1] - v[1]
  const li = Math.hypot(inx, iny) || 1, lo = Math.hypot(ox, oy) || 1
  const turn = Math.acos(Math.max(-1, Math.min(1, (inx / li) * (ox / lo) + (iny / li) * (oy / lo)))) * 180 / Math.PI
  console.log(`  iA[${i}] @[${v[0].toFixed(2)},${v[1].toFixed(2)}] turn=${turn.toFixed(0)}° segIn=${li.toFixed(2)}m segOut=${lo.toFixed(2)}m`)
}

// Does the existing junction organ touch this curb? Report E3.2/THRU windows near the node.
console.log('\n=== junction-organ artifacts near the bump (if exposed on artifact) ===')
for (const k of ['windows', 'aprons', 'thruWindows', 'cornerIds', 'junctions']) {
  const arr = T[k]
  if (!Array.isArray(arr)) continue
  const hits = arr.filter(w => { const p = w.p || w.point || w.at || (w.poly && w.poly[0]); return p && near(p, 14) })
  if (hits.length) console.log(`  T.${k}: ${hits.length} near bump`)
}
console.log('  (artifact keys:', Object.keys(T).join(','), ')')
