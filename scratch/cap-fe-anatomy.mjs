// cap-fe-anatomy.mjs — WHAT does v2 actually emit for a dead-end chain? Prints
// every frontageEdge on that chain (side, segOrds, endpoints, whether its
// polyline WRAPS the cap tip), next to the runs the renderer reads.
//   node scratch/cap-fe-anatomy.mjs [skelId] [capEnd]
import fs from 'fs'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'
import { feCustomKey } from '../src/lib/feCustomKey.js'

const skelId = process.argv[2] || 'preston-place'
const capEnd = process.argv[3] || 'end'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
const nb = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
let design = {}
try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const sc0 = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])

const orig = console.log; console.log = () => {}
const v2 = buildBlockGeometryV2(ribbons, {
  stencil, blockCustoms: design.blockCustoms || null,
  cornerRadiusScale: design.cornerRadiusScale,
  cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides,
  curbWidth: design.curbWidth ?? 0.15, blockLandUse: design.blockLandUse,
})
console.log = orig

let tip = null
for (const t of shape.tiles) for (const v of [...(t.roundTips || []), ...(t.bluntTips || [])]) {
  if (v.skelId === skelId && v.capEnd === capEnd) tip = v.p
}
const f2 = (p) => `[${p[0].toFixed(1)},${p[1].toFixed(1)}]`
console.log(`chain ${skelId}  cap ${capEnd} tip ${tip ? f2(tip) : '(none)'}`)

const mine = (v2.frontageEdges || []).filter(fe => fe.chainSkelId === skelId)
console.log(`\nFES v2 emits on this chain: ${mine.length}`)
for (const fe of mine) {
  const pts = fe.points
  let dMin = Infinity
  if (tip) for (const p of pts) dMin = Math.min(dMin, Math.hypot(p[0] - tip[0], p[1] - tip[1]))
  console.log(`  side=${fe.side} segOrds=[${fe.segOrds}] key=${feCustomKey(fe)?.join('|')}` +
    ` pts=${pts.length} ${f2(pts[0])}→${f2(pts[pts.length - 1])}` +
    (tip ? `  nearest approach to tip = ${dMin.toFixed(2)} m${dMin < 12 ? '   <-- WRAPS THE CAP' : ''}` : ''))
}

console.log(`\nRUNS the renderer reads on this chain:`)
for (const t of shape.tiles) for (const run of (t.runs || [])) {
  if (run.skelId !== skelId) continue
  const a = run.poly[0], b = run.poly[run.poly.length - 1]
  console.log(`  side=${run.side} segOrd=${run.segOrd} pts=${run.poly.length} ${f2(a)}→${f2(b)}`)
}
