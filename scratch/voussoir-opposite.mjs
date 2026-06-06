// At every deg-3 T node: measure the FAR-SIDE (opposite the stem) block-edge
// deviation from the through-street's straight offset chord, and the
// through-centerline's own kink at the node. Separates: dogleg-caused bulges
// (kink > 5°) vs construction-caused (kink ~0 but edge deviates).
import { build, R, turnDeg } from './voussoir-setup.mjs'
import fs from 'fs'
const sk = JSON.parse(fs.readFileSync('/Users/jacobhenderson/Desktop/lafayette-square.nosync/cartograph/data/lafayette-square/clean/skeleton.json', 'utf8'))
const g = build()
const art = g._shapeArtifact
const Ts = sk.junctions.filter(j => j.degree === 3)
const distToSeg = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t))
}
const rows = []
for (const J of Ts) {
  const P = [J.x, J.z]
  // streets whose interior contains the node = through-street
  let thr = null, ki = -1
  for (const s of R.streets) {
    if (!s.points || s.gradeSeparated) continue
    for (let i = 1; i < s.points.length - 1; i++) {
      if (Math.abs(s.points[i][0] - P[0]) < 0.01 && Math.abs(s.points[i][1] - P[1]) < 0.01) { thr = s; ki = i; break }
    }
    if (thr) break
  }
  if (!thr) continue
  const kink = turnDeg(thr.points[ki - 1], thr.points[ki], thr.points[ki + 1])
  // chord across the node (neighbors ±1)
  const A = thr.points[ki - 1], B = thr.points[ki + 1]
  // far-side block edge: find iA vertices within 14m of node; the far side =
  // the side with no third street. Use max deviation of iA points (within
  // 14m, on the far side) from the chord-offset at the through-street's hw.
  const stem = R.streets.find(s => s !== thr && s.points && !s.gradeSeparated &&
    (Math.hypot(s.points[0][0] - P[0], s.points[0][1] - P[1]) < 0.01 ||
     Math.hypot(s.points[s.points.length - 1][0] - P[0], s.points[s.points.length - 1][1] - P[1]) < 0.01))
  if (!stem) continue
  const sp = stem.points[0], sq = stem.points[Math.min(3, stem.points.length - 1)]
  const stemDir = Math.hypot(sq[0] - P[0], sq[1] - P[1]) > 0.1 ? [sq[0] - P[0], sq[1] - P[1]] : [sp[0] - P[0], sp[1] - P[1]]
  const chordT = [B[0] - A[0], B[1] - A[1]]
  const cross = chordT[0] * stemDir[1] - chordT[1] * stemDir[0]
  const farSign = -Math.sign(cross)   // opposite side from the stem
  const sideOf = (p) => Math.sign(chordT[0] * (p[1] - P[1]) - chordT[1] * (p[0] - P[0]))
  let worst = 0, wp = null
  for (const st of art) {
    for (const ia of (st.iA || [])) {
      for (const p of ia) {
        if (Math.hypot(p[0] - P[0], p[1] - P[1]) > 14) continue
        if (sideOf(p) !== farSign) continue
        const d = distToSeg(p, A, B)
        // expected = the through-street's far-side hw (+curb fillet tolerance)
        const m = thr.measure
        const hw = Math.max(m?.left?.pavementHW || 0, m?.right?.pavementHW || 0)
        const dev = d - hw
        if (Math.abs(dev) > Math.abs(worst) && Math.abs(dev) > 1.0) { worst = dev; wp = p }
      }
    }
  }
  if (wp) rows.push({ P, kink, worst, wp, thr: thr.skelId, stem: stem.skelId })
}
rows.sort((a, b) => Math.abs(b.worst) - Math.abs(a.worst))
let kinky = 0, clean = 0
for (const r of rows) { if (r.kink > 5) kinky++; else clean++ }
console.log(`far-side deviations >1m at T nodes: ${rows.length} (kink>5°: ${kinky}, straight: ${clean})`)
for (const r of rows.slice(0, 20))
  console.log(`  dev=${r.worst.toFixed(1)}m kink=${r.kink.toFixed(1)}° @[${r.P[0].toFixed(1)},${r.P[1].toFixed(1)}] thr=${r.thr} stem=${r.stem} iA@[${r.wp[0].toFixed(1)},${r.wp[1].toFixed(1)}]`)
