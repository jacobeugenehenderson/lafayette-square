// coclaim-by-nodekind.mjs — partition the co-claim m2 by the nearest junctionMap
// node kind, to learn whether the co-claim total is dominated by ordinary corners
// (in brief scope) or divided-transition / corridor-terminus apexes (the §7
// out-of-scope median/loop class). Wren, 2026-07-23.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8'))
const o = console.log; console.log = () => {}
const g = buildTileGround(r, { smooth: 0, emitArtifact: true, blockCustoms: design.blockCustoms || null, curbWidth: design.curbWidth ?? 0.15 })
console.log = o
const corners = []
for (const st of (g._shapeArtifact || [])) for (const f of (st.fillets || [])) if (f.apex) corners.push(f.apex)
const jm = r.junctionMap
const kindOf = (p) => { let best = null, bd = 16; for (const n of (jm?.nodes || [])) { const d = Math.hypot(n.at[0] - p[0], n.at[1] - p[1]); if (d < bd) { bd = d; best = n } } return best ? (best.kinds || ['?']).join('+') : 'NONE(no stamp <16m)' }
const prep = (rings) => (rings || []).map(rr => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of rr) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1] } return { r: rr, x0, y0, x1, y1 } })
const inR = (idx, x, y) => { let ins = false; for (const b of idx) { if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue; const r = b.r; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins } } return ins }
const TL = prep(Object.values(g.treelawnByLu || {}).flat())
const LU = prep(Object.values(g.luByClass || {}).flat())
const SW = prep(g.sidewalk)
const R = 9, STEP = 0.3, A = n => n * STEP * STEP
const byKind = {}
for (const apex of corners) { let co = 0; for (let dx = -R; dx <= R; dx += STEP) for (let dy = -R; dy <= R; dy += STEP) { if (dx * dx + dy * dy > R * R) continue; const x = apex[0] + dx, y = apex[1] + dy; const n = (inR(SW, x, y) ? 1 : 0) + (inR(TL, x, y) ? 1 : 0) + (inR(LU, x, y) ? 1 : 0); if (n >= 2) co++ } const k = kindOf(apex); byKind[k] = (byKind[k] || 0) + A(co) }
const rows = Object.entries(byKind).sort((a, b) => b[1] - a[1])
let tot = 0; for (const [, v] of rows) tot += v
console.log(`co-claim m2 by nearest junctionMap node kind (STEP=${STEP} approx, ${corners.length} apexes):`)
for (const [k, v] of rows) console.log('  ' + v.toFixed(1).padStart(7) + ' m2  ' + (100 * v / tot).toFixed(0).padStart(3) + '%   ' + k)
console.log('  TOTAL approx', tot.toFixed(1))
