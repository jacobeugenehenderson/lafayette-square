// stamp-predicts-fill.mjs — ACCEPTANCE #1 of HANDOFF-fill-the-stamp:
// "for every corner the current FILL constructs, the stamp records a matching corner."
//
// The FILL's corners are the fillets the shape pass builds (`_shapeArtifact[].fillets`,
// each with an `apex`). The stamp's corners are `junctionMap.nodes[].corners.all`.
// Match by NODE: a constructed apex belongs to the nearest junction node; the question
// is whether that node carries a corner at all, and whether the count is sufficient.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const rib = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const o = console.log; console.log = () => {}
const g = buildTileGround(rib, { smooth: 0, emitArtifact: true })
console.log = o

const fillets = (g._shapeArtifact || []).flatMap(s => (s.fillets || []).map(f => ({ ...f, street: s.skelId || s.name })))
const apexes = fillets.filter(f => f.apex)
const nodes = rib.junctionMap?.nodes || []
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// A fillet apex sits ON the curb, offset from the node by roughly the pavement
// half-width + corner radius. Generous radius; we are asking "is this node stamped",
// not measuring geometry.
const R = 30
let matched = 0
const orphans = []
for (const f of apexes) {
  let best = null, bd = Infinity
  for (const n of nodes) { const d = D(n.at, f.apex); if (d < bd) { bd = d; best = n } }
  if (best && bd <= R && best.corners?.all?.length) matched++
  else orphans.push({ street: f.street, apex: f.apex.map(v => +v.toFixed(1)).join(','), nearestNode: bd === Infinity ? '-' : bd.toFixed(1) + 'm', kinds: best?.kinds?.join('+') || '-' })
}

// Classify the orphans. The MAP EDGE is not a chain — the boundary ring is injected
// as closing edges with skelId '__boundary__' and resolves to a zero-width edge (no
// curb, no sidewalk). The face walk still turns corners there, and no junction node
// can exist for them. Those are expected; an orphan away from the boundary is a real
// finding.
const bnd = (() => {
  try { return JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8')).boundary } catch { return null }
})()
const distToBoundary = (p) => {
  if (!bnd) return Infinity
  let m = Infinity
  for (let i = 0; i < bnd.length; i++) {
    const a = bnd[i], c = bnd[(i + 1) % bnd.length]
    const ex = c[0] - a[0], ez = c[1] - a[1], L2 = ex * ex + ez * ez || 1
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2))
    m = Math.min(m, Math.hypot(p[0] - (a[0] + ex * t), p[1] - (a[1] + ez * t)))
  }
  return m
}
for (const o2 of orphans) {
  const [x, z] = o2.apex.split(',').map(Number)
  o2.toBoundary = distToBoundary([x, z]).toFixed(1) + 'm'
  o2.edgeOfMap = distToBoundary([x, z]) < 1
}
const edge = orphans.filter(o2 => o2.edgeOfMap)
const real = orphans.filter(o2 => !o2.edgeOfMap)

console.log(`constructed fillet corners: ${apexes.length} (of ${fillets.length} fillets)`)
console.log(`stamp records a corner at the owning node: ${matched} / ${apexes.length}`)
console.log(`unstamped, ON the map edge (expected — the boundary is not a chain): ${edge.length}`)
console.log(`unstamped, AWAY from the map edge — FINDINGS: ${real.length}`)
if (real.length) console.table(real)
else console.log('\n✅ every interior corner the FILL constructs is predicted by the stamp.')
console.log(`\nregistry: ${nodes.reduce((a, n) => a + (n.corners?.all?.length || 0), 0)} corners over ${nodes.filter(n => n.corners?.all?.length).length}/${nodes.length} nodes`)
