// Census: per mark, (a) every cornerFillets apex (= magenta handle) within 8m
// of the stroke, (b) the residual profile mark→block boundary (peaks = the
// artifact), (c) nearest junction node + JM coverage for each flagged apex.
import { R, build, markPts } from './tresaguet-setup.mjs'

const g = build()
const fk = Object.entries(g.cornerFillets || {})
const blocks = g.block || []

const dSeg = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t))
}
const dRing = (p, r) => { let d = 1e9; for (let i = 0; i < r.length; i++) d = Math.min(d, dSeg(p, r[i], r[(i + 1) % r.length])); return d }
const dStroke = (p, pts) => { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, dSeg(p, pts[i], pts[i + 1])); return d }

for (const [mi, pts] of markPts.entries()) {
  // residual profile: distance from each mark point to nearest block boundary
  let maxR = 0, maxAt = null, sum = 0
  const res = pts.map(p => { let d = 1e9; for (const r of blocks) d = Math.min(d, dRing(p, r)); return d })
  res.forEach((d, i) => { sum += d; if (d > maxR) { maxR = d; maxAt = pts[i] } })
  const sorted = res.slice().sort((a, b) => a - b)
  console.log(`\n══ mark#${mi}  residual med=${sorted[Math.floor(res.length / 2)].toFixed(2)} p90=${sorted[Math.floor(res.length * 0.9)].toFixed(2)} max=${maxR.toFixed(2)} @(${maxAt[0].toFixed(1)},${maxAt[1].toFixed(1)})`)
  // fillet apexes near the stroke
  const hits = fk.filter(([k, f]) => dStroke(f.apex, pts) < 8)
  for (const [k, f] of hits) {
    // junction node from the key prefix
    const at = k.split('|')[0].split(',').map(Number)
    let jn = null, dj = 1e9
    for (const j of R.junctions) { const d = Math.hypot(j.x - at[0], j.z - at[1]); if (d < dj) { dj = d; jn = j } }
    const inJM = R.junctionMap.nodes.find(n => Math.hypot(n.at[0] - at[0], n.at[1] - at[1]) < 0.5)
    console.log(`   handle apex(${f.apex[0].toFixed(1)},${f.apex[1].toFixed(1)}) r=${f.r.toFixed(1)} node(${at}) ${jn?.kind || '?'}${inJM ? ' JM[' + inJM.kinds + ']' : ' plain'} :: ${k.slice(k.indexOf('|') + 1)}`)
  }
}
