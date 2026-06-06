// (b) false-corner residual: distance from the production block ring (iA) to
// the known true corners; + (c) Benton stem-joint + T-bulge probe: block-ring
// vertices that deviate from the straight avenue-offset line near a node.
import { build, R, turnDeg } from './voussoir-setup.mjs'
const g = build()
const art = g._shapeArtifact
const targets = [
  ['Mississippi×Lafayette NW true', [174.1, 207.9]],
  ['Park×S-18th true', [419.0, -78.1]],
]
for (const [label, T] of targets) {
  let best = { d: Infinity }
  art.forEach((st, ti) => {
    for (const ia of (st.iA || [])) {
      for (let i = 0; i < ia.length; i++) {
        const d = Math.hypot(ia[i][0] - T[0], ia[i][1] - T[1])
        if (d < best.d) best = { d, p: ia[i], ti }
      }
    }
  })
  console.log(label, `nearest iA vtx [${best.p[0].toFixed(1)},${best.p[1].toFixed(1)}] tile#${best.ti} d=${best.d.toFixed(2)}m`)
}
// ── Benton Place chains + stem joint ──
console.log('\nBenton chains:')
for (const s of R.streets) {
  if (!/benton/i.test(s.skelId || s.name || '')) continue
  const m = s.measure
  console.log(` ${s.skelId} pts=${s.points.length} ends=[${s.points[0].map(v => v.toFixed(1))}]..[${s.points[s.points.length - 1].map(v => v.toFixed(1))}]`,
    `hwL=${m?.left?.pavementHW?.toFixed(2)} hwR=${m?.right?.pavementHW?.toFixed(2)} loopish=${Math.hypot(s.points[0][0] - s.points[s.points.length - 1][0], s.points[0][1] - s.points[s.points.length - 1][1]).toFixed(1)}m`)
}
