// spur-sliver-anatomy.mjs — WHERE are the junction-band slivers at a spur mouth?
// Rebuilds the detector's invariant-8 measurement for ONE junction and dumps each
// offending ped fragment: area, centroid, distance from the node, and which tile it
// came from. Aggregate counts cannot tell you what to fix; this can.
//   node scratch/spur-sliver-anatomy.mjs <x> <z>
import fs from 'fs'
import { buildTileGround, sectionPass } from '../src/lib/tileGround.js'

const px = parseFloat(process.argv[2] ?? '340.0')
const pz = parseFloat(process.argv[3] ?? '-120.6')
const THROAT = 14, SLIVER = 8

const rib = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const o = console.log; console.log = () => {}
const g = buildTileGround(rib, { smooth: 0, emitArtifact: true })
console.log = o

const st = g._shapeArtifact || []
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a / 2) }
const cent = (r) => { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1] } return [x / r.length, y / r.length] }
const nearD = (r, p) => { let m = Infinity; for (const v of r) { const d = Math.hypot(v[0] - p[0], v[1] - p[1]); if (d < m) m = d } return m }

const rows = []
for (let ti = 0; ti < st.length; ti++) {
  const t = st[ti]
  if (!t?.ring) continue
  if (nearD(t.ring, [px, pz]) > 60) continue
  const sp = sectionPass([t], 0.15, { outer: 'LU', inner: 'SW' }, null)
  const peds = [...Object.values(sp.tlByLu || {}).flat(), ...(sp.Wacc || [])].filter(r => r && r.length >= 3)
  for (const r of peds) {
    if (nearD(r, [px, pz]) >= THROAT) continue
    const a = area(r)
    if (a >= SLIVER) continue
    const c = cent(r)
    rows.push({ tile: ti, road: !!t.road, areaM2: +a.toFixed(2), verts: r.length, at: c.map(v => +v.toFixed(1)).join(','), dFromNode: +Math.hypot(c[0] - px, c[1] - pz).toFixed(1) })
  }
}
rows.sort((a, b) => a.dFromNode - b.dFromNode)
console.log(`junction (${px}, ${pz}) — ped fragments < ${SLIVER} m² within ${THROAT} m: ${rows.length}`)
console.table(rows)
