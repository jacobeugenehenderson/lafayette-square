// Chamfer A/B — per-tile block (iA) area deltas vs a saved baseline.
// Usage: node chamfer-ab.mjs save → writes baseline; node chamfer-ab.mjs → compares.
import { build, R } from './voussoir-setup.mjs'
import fs from 'fs'
const g = build()
const art = g._shapeArtifact
const area = (rs) => rs.reduce((a, r) => {
  let s = 0
  for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; s += r[i][0] * r[j][1] - r[j][0] * r[i][1] }
  return a + s / 2
}, 0)
const cent = (rs) => {
  let x = 0, z = 0, n = 0
  for (const r of rs) for (const p of r) { x += p[0]; z += p[1]; n++ }
  return n ? [x / n, z / n] : [0, 0]
}
const rows = art.map((st, i) => ({ i, a: area(st.iA || []), c: cent(st.iA || []), nv: (st.iA || []).reduce((s, r) => s + r.length, 0) }))
const FILE = 'scratch/chamfer-ab-baseline.json'
if (process.argv[2] === 'save') {
  fs.writeFileSync(FILE, JSON.stringify(rows))
  console.log('baseline saved,', rows.length, 'tiles')
} else {
  const base = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  const jm = R.junctionMap
  const nearNode = (c) => {
    let best = Infinity, bn = null
    for (const nd of jm.nodes) { const d = Math.hypot(c[0] - nd.at[0], c[1] - nd.at[1]); if (d < best) { best = d; bn = nd } }
    return { d: best, at: bn?.at }
  }
  let changed = 0
  for (const r of rows) {
    const b = base[r.i]
    const dA = r.a - b.a
    if (Math.abs(dA) > 0.5 || r.nv !== b.nv) {
      changed++
      const nn = nearNode(r.c)
      console.log(`tile#${r.i} ΔiA=${dA.toFixed(1)}m² verts ${b.nv}→${r.nv} centroid(${r.c.map(v => v.toFixed(0))}) nearest jm node ${nn.at?.map(v => v.toFixed(1))} d=${nn.d.toFixed(0)}m`)
    }
  }
  console.log(`${changed}/${rows.length} tiles changed`)
}
