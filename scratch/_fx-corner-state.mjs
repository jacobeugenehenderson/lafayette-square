// ⛔ ONE CORNER, ALL ITS CARRIED FACTS — no aggregate, no inference.
import { feed, buildProto } from './_proto-feed.mjs'
const [scene = 'lafayette-square', xs, zs, rs] = process.argv.slice(2)
const X = +xs, Z = +zs, R = +(rs || 14)
const f = feed(scene)
const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
let best = null
for (let ti = 0; ti < T.length; ti++) {
  const st = T[ti], iA = st.iaFull || []
  for (let ri = 0; ri < iA.length; ri++) for (let i = 0; i < iA[ri].length; i++) {
    const d = Math.hypot(iA[ri][i][0] - X, iA[ri][i][1] - Z)
    if (!best || d < best.d) best = { d, ti, ri, i }
  }
}
if (!best) { console.log('no contour found'); process.exit(1) }
const st = T[best.ti], ring = st.iaFull[best.ri], runs = st.runs || []
console.log(`tile ${best.ti} · ring ${best.ri} · ${ring.length} vertices · nearest ${best.d.toFixed(2)} m`)
console.log(`  iaCorner:${!!st.iaCorner?.[best.ri]}  iaArc:${!!st.iaArc?.[best.ri]}  iaStamp:${!!st.iaStamp?.[best.ri]}`)
const corner = st.iaCorner?.[best.ri] || [], arc = st.iaArc?.[best.ri] || [], stamp = st.iaStamp?.[best.ri] || []
console.log('   i       x        z     dist  CORNER  arc  owner')
for (let i = 0; i < ring.length; i++) {
  const d = Math.hypot(ring[i][0] - X, ring[i][1] - Z); if (d > R) continue
  const r = stamp[i], own = r == null ? '-' : `${runs[r]?.skelId}|${runs[r]?.side}|${runs[r]?.segOrd}`
  console.log(`  ${String(i).padStart(3)} ${ring[i][0].toFixed(1).padStart(8)} ${ring[i][1].toFixed(1).padStart(8)} ${d.toFixed(2).padStart(6)}  ${corner[i] ? 'YES' : '   '}   ${arc[i] ?? '-'}   ${own}`)
}
