// Classify remaining >150° real folds: on a median hole edge (E2's parked
// wobble class), a merge-patch seam, or the true outer curb (E3.2's gate).
import { build, R, transitionEnds, turnDeg } from './voussoir-setup.mjs'
const g = build()
const ends = transitionEnds()
const nodes = new Map()
for (const e of ends) nodes.set(e.p[0].toFixed(1) + ',' + e.p[1].toFixed(1), e.p)
const walk = (ring, i, dir, dist) => {
  let d = 0, k = i
  while (d < dist) {
    const nk = (k + dir + ring.length) % ring.length
    const seg = Math.hypot(ring[nk][0] - ring[k][0], ring[nk][1] - ring[k][1])
    if (d + seg >= dist) { const f = (dist - d) / seg; return [ring[k][0] + (ring[nk][0] - ring[k][0]) * f, ring[k][1] + (ring[nk][1] - ring[k][1]) * f] }
    d += seg; k = nk
    if (k === i) break
  }
  return ring[k]
}
const dRing = (p, ring) => {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
    best = Math.min(best, Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t)))
  }
  return best
}
const meds = (R.medians || []).filter(m => m.kind === 'median').map(m => m.ring)
const mrgs = (R.medians || []).filter(m => m.kind === 'merge').map(m => m.ring)
for (const [k, p] of nodes) {
  const near = (q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 22
  for (const r of g.asphalt) {
    for (let i = 0; i < r.length; i++) {
      if (!near(r[i])) continue
      const t = turnDeg(r[(i - 1 + r.length) % r.length], r[i], r[(i + 1) % r.length])
      if (t <= 150) continue
      const w = Math.hypot(...((a, b) => [a[0] - b[0], a[1] - b[1]])(walk(r, i, -1, 2), walk(r, i, 1, 2)))
      if (w <= 0.2) continue
      const dM = Math.min(...meds.map(m => dRing(r[i], m)), Infinity)
      const dG = Math.min(...mrgs.map(m => dRing(r[i], m)), Infinity)
      const cls = dM < 0.6 ? 'MEDIAN-EDGE' : dG < 0.6 ? 'MERGE-SEAM' : 'CURB'
      console.log(`${cls.padEnd(12)} node ${k}  @[${r[i][0].toFixed(1)},${r[i][1].toFixed(1)}] ${t.toFixed(0)}° w=${w.toFixed(2)} dMed=${dM.toFixed(2)} dMrg=${dG.toFixed(2)}`)
    }
  }
}
