// corner-coclaim.mjs — DO THE LEG BANDS AND THE CORNER PAD CLAIM THE SAME GROUND?
//
// The operator's symptom (2026-07-22): at the leg→corner seam a thin sidewalk
// sliver is stranded in the treelawn with a notch behind it — on ordinary street
// corners, not just dead-ends. SECTION §6.1 step 2 says tangentTrim exists so the
// leg strips "meet the arc with no cream step / green sliver", so this is the
// corner construction breaking its own contract.
//
// cap-mouth-classify.mjs found the mouths carry ~15 m2 of DOUBLE-claimed ground
// and 0 m2 unclaimed. This asks the same question at EVERY frozen fillet, so we
// learn whether co-claim is a mouth quirk or the corner construction generally.
//
//   node scratch/corner-coclaim.mjs [topN] [step_m]
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const TOP = +(process.argv[2] || 15)
const STEP = +(process.argv[3] || 0.2)
const R = 9                      // sample radius around each corner apex

const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
let design = {}
try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const o = console.log; console.log = () => {}
const g = buildTileGround(ribbons, {
  smooth: 0, emitArtifact: true,
  blockCustoms: design.blockCustoms || null,
  curbWidth: design.curbWidth ?? 0.15,
})
console.log = o

const inR = (rings, x, y) => {
  let ins = false
  for (const r of rings || []) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins
  }
  return ins
}
const TL = Object.values(g.treelawnByLu || {}).flat()
const LU = Object.values(g.luByClass || {}).flat()

// every frozen corner on the map
const corners = []
for (const st of (g._shapeArtifact || [])) for (const f of (st.fillets || [])) if (f.apex) corners.push(f.apex)

const A = (n) => n * STEP * STEP
const rows = []
let totalCo = 0, totalUn = 0, withCo = 0
for (const apex of corners) {
  let co = 0, un = 0
  for (let dx = -R; dx <= R; dx += STEP) for (let dy = -R; dy <= R; dy += STEP) {
    if (dx * dx + dy * dy > R * R) continue
    const x = apex[0] + dx, y = apex[1] + dy
    const sw = inR(g.sidewalk, x, y), tl = inR(TL, x, y), lu = inR(LU, x, y)
    const asph = inR(g.asphalt, x, y), curb = inR(g.curb, x, y)
    const n = (sw ? 1 : 0) + (tl ? 1 : 0) + (lu ? 1 : 0)
    if (n >= 2) co++
    else if (n === 0 && !asph && !curb) un++
  }
  totalCo += A(co); totalUn += A(un)
  if (A(co) > 0.5) withCo++
  rows.push({ apex, co: A(co), un: A(un) })
}
rows.sort((a, b) => b.co - a.co)
console.log(`${corners.length} frozen corners sampled (r=${R} m, ${STEP} m grid)\n`)
console.log(`  CO-CLAIMED (>=2 ped layers own the same point): ${totalCo.toFixed(1)} m2 total`)
console.log(`  UNCLAIMED  (no layer, not asphalt/curb):        ${totalUn.toFixed(1)} m2 total`)
console.log(`  corners carrying >0.5 m2 of co-claim: ${withCo} of ${corners.length}\n`)
console.log(`  worst corners:`)
for (const r of rows.slice(0, TOP)) {
  console.log(`    [${r.apex[0].toFixed(0)},${r.apex[1].toFixed(0)}]  co-claim=${r.co.toFixed(1)} m2   unclaimed=${r.un.toFixed(1)} m2`)
}
