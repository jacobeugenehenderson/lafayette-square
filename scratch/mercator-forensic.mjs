// Mercator — forensic: where does production buildTileGround put the park-corner
// block vertex at Mississippi×Lafayette, vs the operator's true corner ≈(174,208)?
import { readFileSync } from 'fs'
import { buildTileGround, extractFaces } from '../src/lib/tileGround.js'

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, scl = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * scl, cz + (z - cz) * scl])
const base = { stencil: clip, curbWidth: d.curbWidth, smooth: 0, blockLandUse: d.blockLandUse, cornerRadiusScale: 1, cornerCornerRadiusOverrides: d.cornerCornerRadiusOverrides || null, blockCustoms: d.blockCustoms || null }

const TRUE_C = [174.1, 208.3]   // where strokes 0+1 meet
const NODE = [166.5, 221.9]

const pr = buildTileGround(r, base)

// Find block rings with a vertex near the node / true corner region
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
console.log('block rings:', pr.block.length)
pr.block.forEach((ring, i) => {
  let dTrue = Infinity, vTrue = null, dNode = Infinity
  for (const p of ring) {
    const dt = dist(p, TRUE_C); if (dt < dTrue) { dTrue = dt; vTrue = p }
    const dn = dist(p, NODE); if (dn < dNode) dNode = dn
  }
  if (dTrue < 60) {
    // ring bbox to identify which block
    const xs = ring.map(p => p[0]), zs = ring.map(p => p[1])
    console.log(`ring#${i} verts:${ring.length} bbox x:[${Math.min(...xs).toFixed(0)},${Math.max(...xs).toFixed(0)}] z:[${Math.min(...zs).toFixed(0)},${Math.max(...zs).toFixed(0)}]`)
    console.log(`   nearest-to-TRUE: (${vTrue[0].toFixed(1)},${vTrue[1].toFixed(1)}) d=${dTrue.toFixed(1)}m | nearest-to-NODE d=${dNode.toFixed(1)}m`)
  }
})

// The raw tiles at the node — which tile edges leave the node, on which streets
const streets = (r.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
const tiles = extractFaces(streets)
console.log('\ntiles touching node:', NODE.join(','))
tiles.forEach((t, ti) => {
  const hit = t.ring.findIndex(p => dist(p, NODE) < 0.5)
  if (hit < 0) return
  const xs = t.ring.map(p => p[0]), zs = t.ring.map(p => p[1])
  // the two edges at the node vertex
  const n = t.ring.length
  const A = t.ring[(hit - 1 + n) % n], B = t.ring[(hit + 1) % n]
  const eIn = t.edges[(hit - 1 + n) % n], eOut = t.edges[hit]
  const sname = e => { const s = streets[e.streetIdx]; return `${s.skelId}/${e.side}${e.forward ? '+' : '-'}` }
  console.log(`tile#${ti} verts:${n} bbox x:[${Math.min(...xs).toFixed(0)},${Math.max(...xs).toFixed(0)}] z:[${Math.min(...zs).toFixed(0)},${Math.max(...zs).toFixed(0)}]`)
  console.log(`   at node: in-edge ${sname(eIn)} from (${A[0].toFixed(1)},${A[1].toFixed(1)})  out-edge ${sname(eOut)} to (${B[0].toFixed(1)},${B[1].toFixed(1)})`)
})
