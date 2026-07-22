import fs from 'fs'
const r = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const g = id => r.streets.find(s => (s.skelId || s.id) === id)

// vertex → set of {skelId,name,interior} touching it (0.6m tol)
const V = []
for (const s of r.streets) {
  if (!s.points || s.points.length < 2) continue
  s.points.forEach((p, i) => V.push({ p, skelId: s.skelId || s.id, name: s.name, interior: i > 0 && i < s.points.length - 1, phase: s.phase }))
}
const streetsAt = (pt, tol = 1.0) => {
  const out = new Map()
  for (const v of V) if (len(v.p, pt) < tol) { const k = v.skelId; const e = out.get(k) || { name: v.name, interior: false, phase: v.phase }; e.interior = e.interior || v.interior; out.set(k, e) }
  return out
}
const bodyHeadingAt = (pts, endIsStart) => {
  // unit tangent over ~20m of body from the end
  const tip = endIsStart ? 0 : pts.length - 1, step = endIsStart ? 1 : -1
  let i = tip, acc = 0
  while (i + step >= 0 && i + step < pts.length && acc < 20) { acc += len(pts[i + step], pts[i]); i += step }
  const a = pts[i], b = pts[tip]
  return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI
}
const tipApproach = (pts, endIsStart) => {
  const tip = endIsStart ? 0 : pts.length - 1, step = endIsStart ? 1 : -1
  let n = tip + step
  while (n >= 0 && n < pts.length && len(pts[n], pts[tip]) < 1e-6) n += step
  return Math.atan2(pts[tip][1] - pts[n][1], pts[tip][0] - pts[n][0]) * 180 / Math.PI
}
const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

const flagged = [12, 17, 21, 24, 25, 26, 31, 32, 39, 42, 45, 48]
for (const idx of flagged) {
  const m = r.medians[idx]
  if (!m || !m.ring) continue
  const [ca, cb] = m.chains || []
  const A = g(ca), B = g(cb)
  // pinch = ring centroid (small degenerate rings) — good enough to probe the node
  const cx = m.ring.reduce((s, p) => s + p[0], 0) / m.ring.length, cz = m.ring.reduce((s, p) => s + p[1], 0) / m.ring.length
  const node = [cx, cz]
  const at = streetsAt(node, 12)
  // through-road = a DIFFERENT-name street with an interior vertex near the node
  const corr = A?.phase?.corridorName || A?.name
  const thru = [...at.entries()].filter(([sk, e]) => e.interior && e.name !== (A?.name) && e.name !== (B?.name) && (e.name) !== corr)
  // is the node the divided corridor's OWN convergence (both A,B ends meet here)?
  const endAtNode = (s) => s ? (len(s.points[0], node) < len(s.points[s.points.length - 1], node) ? 'start' : 'end') : null
  const eA = endAtNode(A), eB = endAtNode(B)
  const aEndDist = A ? Math.min(len(A.points[0], node), len(A.points[A.points.length - 1], node)) : 99
  const bEndDist = B ? Math.min(len(B.points[0], node), len(B.points[B.points.length - 1], node)) : 99
  const bothEndHere = aEndDist < 15 && bEndDist < 15
  // kink angles (would §5h fire?) — only meaningful if a leg ENDS here
  let kinkA = null, kinkB = null
  if (A && aEndDist < 15) kinkA = angDiff(tipApproach(A.points, eA === 'start'), bodyHeadingAt(A.points, eA === 'start'))
  if (B && bEndDist < 15) kinkB = angDiff(tipApproach(B.points, eB === 'start'), bodyHeadingAt(B.points, eB === 'start'))
  // classify
  let cls
  if (thru.length) cls = `THROUGH-T (into ${thru.map(t => t[1].name).join('/')})`
  else if (bothEndHere) cls = 'DIVIDED NOSE (corridor own end — no through-road)'
  else cls = 'CROSSING / mid-corridor (neither carriageway ends here)'
  const overlayWould = thru.length
    ? `${(kinkA > 30 || kinkB > 30) ? 'FIRE (a leg kinks)' : 'SKIP (both legs <30° kink)'}`
    : 'N/A (no through-road → §5h trigger never matches)'
  console.log(`#${idx} ${m.streets?.[0]} @[${cx.toFixed(0)},${cz.toFixed(0)}]  ${cls}`)
  console.log(`     kinkA=${kinkA?.toFixed(0)}° kinkB=${kinkB?.toFixed(0)}°  bothEndHere=${bothEndHere}  →  §5h overlay: ${overlayWould}`)
}
