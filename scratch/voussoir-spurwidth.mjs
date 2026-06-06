// For every >150° spike near a transition node, measure the FOLD WIDTH:
// walk 2 m back along the incoming edge and 2 m forward along the outgoing
// edge; the distance between those two points ≈ the spur's opening. ~0 →
// degenerate quantization sliver; >0.2 m → real fold geometry.
import { build, transitionEnds, turnDeg } from './voussoir-setup.mjs'
const g = build()
const art = g._shapeArtifact
const ends = transitionEnds()
const nodes = new Map()
for (const e of ends) {
  const k = e.p[0].toFixed(1) + ',' + e.p[1].toFixed(1)
  if (!nodes.has(k)) nodes.set(k, e.p)
}
const walk = (ring, i, dir, dist) => {
  // walk `dist` along the ring from vertex i in direction dir (+1/-1)
  let d = 0, k = i
  while (d < dist) {
    const nk = (k + dir + ring.length) % ring.length
    const seg = Math.hypot(ring[nk][0] - ring[k][0], ring[nk][1] - ring[k][1])
    if (d + seg >= dist) {
      const f = (dist - d) / seg
      return [ring[k][0] + (ring[nk][0] - ring[k][0]) * f, ring[k][1] + (ring[nk][1] - ring[k][1]) * f]
    }
    d += seg; k = nk
    if (k === i) break
  }
  return ring[k]
}
const scan = (rings, label, nd, near) => {
  const out = []
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      if (!near(r[i])) continue
      const t = turnDeg(r[(i - 1 + r.length) % r.length], r[i], r[(i + 1) % r.length])
      if (t <= 150) continue
      const pBack = walk(r, i, -1, 2.0)
      const pFwd = walk(r, i, +1, 2.0)
      const w = Math.hypot(pBack[0] - pFwd[0], pBack[1] - pFwd[1])
      out.push({ p: r[i], t, w, label })
    }
  }
  return out
}
for (const [k, p] of nodes) {
  const near = (q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 22
  const found = [
    ...scan(g.asphalt, 'asphalt', p, near),
    ...art.flatMap((st, ti) => scan(st.iA || [], 'iA#' + ti, p, near)),
  ]
  if (!found.length) { console.log('ok   ', k); continue }
  console.log('SPIKE', k, found.map(f =>
    `${f.label}@[${f.p[0].toFixed(1)},${f.p[1].toFixed(1)}] ${f.t.toFixed(0)}° w=${f.w.toFixed(2)}m`).join('  '))
}
