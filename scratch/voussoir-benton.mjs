// (c) Benton stem-joint: dump tiles + iA + asphalt boundary near the joint,
// and measure the protrusion (block-ring deviation from the loop's clean offset).
import { build, R, turnDeg } from './voussoir-setup.mjs'
const J = process.argv[2] ? process.argv[2].split(',').map(Number) : [58.7, -234.0]
const RAD = Number(process.argv[3] || 22)
const near = (p, r = RAD) => Math.hypot(p[0] - J[0], p[1] - J[1]) < r
const g = build()
const art = g._shapeArtifact
art.forEach((st, ti) => {
  if (!st.ring.some(p => near(p))) return
  console.log(`TILE#${ti} runs=[${st.runs.map(r => r.skelId + '/' + r.side).join(' ')}]`)
  const seg = []
  for (let i = 0; i < st.ring.length; i++) if (near(st.ring[i], RAD)) {
    const t = turnDeg(st.ring[(i - 1 + st.ring.length) % st.ring.length], st.ring[i], st.ring[(i + 1) % st.ring.length])
    seg.push(`[${st.ring[i][0].toFixed(1)},${st.ring[i][1].toFixed(1)}]${t > 30 ? '∠' + t.toFixed(0) : ''}`)
  }
  console.log('  ring near:', seg.join(' '))
  for (const ia of (st.iA || [])) {
    const s2 = []
    for (let i = 0; i < ia.length; i++) if (near(ia[i], RAD)) {
      const t = turnDeg(ia[(i - 1 + ia.length) % ia.length], ia[i], ia[(i + 1) % ia.length])
      s2.push(`[${ia[i][0].toFixed(1)},${ia[i][1].toFixed(1)}]${t > 30 ? '∠' + t.toFixed(0) : ''}`)
    }
    if (s2.length) console.log('  iA near:', s2.join(' '))
  }
})
// asphalt boundary spikes
for (const r of g.asphalt) {
  for (let i = 0; i < r.length; i++) {
    if (!near(r[i])) continue
    const t = turnDeg(r[(i - 1 + r.length) % r.length], r[i], r[(i + 1) % r.length])
    if (t > 100) console.log(`asphalt ∠${t.toFixed(0)} at [${r[i][0].toFixed(2)},${r[i][1].toFixed(2)}]`)
  }
}
