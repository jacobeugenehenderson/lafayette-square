// Map-wide census: ASPHALT-WIDTH STEPS at junction vertices — wherever two
// consecutive runs around a tile meet at a node and their effective asphalt
// depths differ. Classify: same-street (per-fe/per-segment step at a through
// junction), same-name different chains (Benton class), same corridor
// carriageway↔spine (divided join), different streets (real corner — only
// flagged when the CONTINUATION is near-straight, i.e. not a real corner).
import { build, R, turnDeg } from './voussoir-setup.mjs'
const g = build()
const art = g._shapeArtifact
const meta = g._perRunMeta
const tiles = g._tiles
const edgeDepthA = (m, side) => Math.max(0, m?.[side]?.pavementHW ?? 0)
const nameOf = (id) => { const s = R.streets.find(s => s.skelId === id); return s?.phase?.corridorName || s?.name || id }
const chainHeadingAt = (id, p) => {
  const s = R.streets.find(s => s.skelId === id)
  if (!s) return null
  let bi = 0, bd = Infinity
  s.points.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; bi = i } })
  const a = s.points[Math.max(0, bi - 1)], b = s.points[Math.min(s.points.length - 1, bi + 1)]
  return Math.atan2(b[1] - a[1], b[0] - a[0])
}
const rows = []
for (let ti = 0; ti < art.length; ti++) {
  const runs = meta[ti]
  if (!runs || runs.length < 2) continue
  for (let i = 0; i < runs.length; i++) {
    const A = runs[i], B = runs[(i + 1) % runs.length]
    const V = B.poly[0]   // shared boundary vertex
    const dA = edgeDepthA(A.measure, A.side), dB = edgeDepthA(B.measure, B.side)
    const step = Math.abs(dA - dB)
    if (step < 0.5 || (dA === 0 && dB === 0)) continue
    let cls
    if (A.skelId === B.skelId) cls = 'SAME-STREET'
    else if (nameOf(A.skelId) === nameOf(B.skelId)) cls = 'SAME-CORRIDOR'
    else {
      // different streets: only a "step" if their headings at V are near-collinear
      const hA = chainHeadingAt(A.skelId, V), hB = chainHeadingAt(B.skelId, V)
      if (hA == null || hB == null) continue
      let d = Math.abs(hA - hB) % Math.PI
      if (d > Math.PI / 2) d = Math.PI - d
      if (d > 25 * Math.PI / 180) continue   // a genuine corner, not a step
      cls = 'COLLINEAR-X'
    }
    rows.push({ cls, ti, V, step, a: `${A.skelId}/${A.side}=${dA.toFixed(2)}`, b: `${B.skelId}/${B.side}=${dB.toFixed(2)}` })
  }
}
rows.sort((p, q) => q.step - p.step)
const byCls = {}
for (const r of rows) (byCls[r.cls] = byCls[r.cls] || []).push(r)
for (const cls of Object.keys(byCls)) {
  console.log(`\n== ${cls}: ${byCls[cls].length} steps ==`)
  for (const r of byCls[cls].slice(0, 18))
    console.log(`  ${r.step.toFixed(2)}m @[${r.V[0].toFixed(1)},${r.V[1].toFixed(1)}] tile#${r.ti}  ${r.a} → ${r.b}`)
}
console.log('\ntotal steps ≥0.5m at run boundaries:', rows.length)
