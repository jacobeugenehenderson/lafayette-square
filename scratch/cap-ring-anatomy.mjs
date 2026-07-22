// cap-ring-anatomy.mjs — the BLOCK RING around a dead-end tip: which vertices
// form the cap arc (the fold), and are the two shoulders cleanly identifiable?
import fs from 'fs'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'
const skelId = process.argv[2] || 'preston-place'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
const nb = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
let design = {}; try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const sc0 = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const o = console.log; console.log = () => {}
const v2 = buildBlockGeometryV2(ribbons, { stencil, blockCustoms: design.blockCustoms || null,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, curbWidth: design.curbWidth ?? 0.15,
  blockLandUse: design.blockLandUse, __debugRings: true })
console.log = o
let tip = null, hw = null
for (const t of shape.tiles) for (const v of [...(t.roundTips || []), ...(t.bluntTips || [])]) if (v.skelId === skelId) { tip = v.p; hw = v.hw }
console.log('tip', tip, 'hw', hw)
// the fe that wraps it — its points ARE the ring slice
const fe = (v2.frontageEdges || []).filter(f => f.chainSkelId === skelId)
  .find(f => f.points.some(p => Math.hypot(p[0] - tip[0], p[1] - tip[1]) < 12))
console.log('\nwrapping fe side=' + fe.side + ' segOrds=[' + fe.segOrds + '] pts=' + fe.points.length)
fe.points.forEach((p, i) => {
  const d = Math.hypot(p[0] - tip[0], p[1] - tip[1])
  console.log(`  ${String(i).padStart(3)} [${p[0].toFixed(2)},${p[1].toFixed(2)}]  d(tip)=${d.toFixed(2)}${d < hw * 1.12 ? '  <arc>' : ''}`)
})
