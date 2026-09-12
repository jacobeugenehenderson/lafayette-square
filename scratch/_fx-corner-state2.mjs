import { feed, buildProto } from './_proto-feed.mjs'
import { sectionDump } from '../src/lib/tileGround.js'
const [scene = 'lafayette-square', xs, zs, rs] = process.argv.slice(2)
const X = +xs, Z = +zs, R = +(rs || 14)
const f = feed(scene)
const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
let best = null
for (let ti = 0; ti < T.length; ti++) { const st = T[ti], iA = st.iaFull || []
  for (let ri = 0; ri < iA.length; ri++) for (let i = 0; i < iA[ri].length; i++) {
    const d = Math.hypot(iA[ri][i][0] - X, iA[ri][i][1] - Z); if (!best || d < best.d) best = { d, ti, ri, i } } }
const st = T[best.ti], ring = st.iaFull[best.ri], runs = st.runs || []
const corner = st.iaCorner?.[best.ri] || [], arc = st.iaArc?.[best.ri] || [], stamp = st.iaStamp?.[best.ri] || []
const rows = new Map((sectionDump.rows || []).filter(r => r.ri === best.ri).map(r => [r.i, r]))
console.log(`tile ${best.ti} ring ${best.ri} · dump rows for this ring: ${rows.size}`)
console.log('   i   dist COR arc  owner                         outer/inner   tl    sw   dOut  outWalk inWalk')
for (let i = 0; i < ring.length; i++) {
  const d = Math.hypot(ring[i][0] - X, ring[i][1] - Z); if (d > R) continue
  const r = stamp[i], own = r == null ? '-' : `${runs[r]?.skelId}|${runs[r]?.side}|${runs[r]?.segOrd}`
  const w = rows.get(i) || {}
  console.log(`  ${String(i).padStart(3)} ${d.toFixed(2).padStart(6)} ${corner[i] ? 'YES' : '   '} ${String(arc[i] ?? '-').padStart(3)}  ${own.padEnd(28)} ${String(w.resolved ?? '-').padEnd(12)} ${String(w.tl ?? '-').padStart(5)} ${String(w.sw ?? '-').padStart(5)} ${String(w.dOut?.toFixed?.(2) ?? '-').padStart(5)}  ${String(w.outWalk)} ${String(w.inWalk)}`)
}
