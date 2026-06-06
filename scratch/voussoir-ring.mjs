// Dump the asphalt ring(s) carrying spikes near a node + the median-tile iA,
// to see exactly what shape survives the union.
import { build, turnDeg } from './voussoir-setup.mjs'
const J = process.argv[2] ? process.argv[2].split(',').map(Number) : [481.9, 272.1]
const near = (p, r = 25) => Math.hypot(p[0] - J[0], p[1] - J[1]) < r
const g = build()
const signedArea = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] } return a / 2 }
for (const r of g.asphalt) {
  let hasSpike = false
  for (let i = 0; i < r.length; i++) {
    if (!near(r[i])) continue
    const t = turnDeg(r[(i - 1 + r.length) % r.length], r[i], r[(i + 1) % r.length])
    if (t > 150) hasSpike = true
  }
  if (!hasSpike) continue
  console.log(`RING n=${r.length} signedArea=${signedArea(r).toFixed(1)} (${signedArea(r) >= 0 ? 'outer' : 'HOLE'})`)
  // print the portion of the ring within 45m of J
  const segs = []
  let cur = []
  for (let i = 0; i < r.length; i++) {
    if (Math.hypot(r[i][0] - J[0], r[i][1] - J[1]) < 45) cur.push(i)
    else if (cur.length) { segs.push(cur); cur = [] }
  }
  if (cur.length) segs.push(cur)
  for (const seg of segs) {
    console.log('  …' + seg.map(i => {
      const t = turnDeg(r[(i - 1 + r.length) % r.length], r[i], r[(i + 1) % r.length])
      return `[${r[i][0].toFixed(1)},${r[i][1].toFixed(1)}]${t > 30 ? '∠' + t.toFixed(0) : ''}`
    }).join(' ') + '…')
  }
}
// the median tile's iA (block) near J
const art = g._shapeArtifact
art.forEach((st, ti) => {
  if (!st.med || !st.ring.some(p => near(p, 40))) return
  console.log(`\nmedian TILE#${ti}: ring=${st.ring.map(p => `[${p[0].toFixed(1)},${p[1].toFixed(1)}]`).join(' ')}`)
  for (const ia of (st.iA || [])) console.log('  iA:', ia.map(p => `[${p[0].toFixed(1)},${p[1].toFixed(1)}]`).join(' '))
  for (const md of (st.med || [])) console.log('  med:', md.map(p => `[${p[0].toFixed(1)},${p[1].toFixed(1)}]`).join(' '))
})
