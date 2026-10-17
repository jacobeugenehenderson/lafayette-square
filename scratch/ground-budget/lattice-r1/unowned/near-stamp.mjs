// near-stamp.mjs — for each unowned vertex, the tile whose RING contains it in its own bake's producer capture, and the
// nearest iA vertex the other construction's iA (same point, its own containing tile) does not carry: a vertex one
// construction added (B: a stamp crossing or a rounding-moved vertex).
import { readFileSync } from 'fs'
const J = (f) => JSON.parse(readFileSync(f)), D = { A: J('unowned/trunk.json'), B: J('unowned/B.json') }
const C = { A: J('cap-trunkpts-hipointedemun.json').dump, B: J('cap-Bpts-hipointedemun.json').dump }
const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]
  if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c } return c }
const tileAt = (cap, p) => cap.find(d => inRing(p, d.ring))
const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
for (const [me, other] of [['B', 'A'], ['A', 'B']]) {
  const ko = new Set(D[other].pts.map(q => q.x + ',' + q.z)), hist = {}, ex = []
  for (const q of D[me].pts) { if (ko.has(q.x + ',' + q.z)) continue
    const p = [q.x, q.z], t = tileAt(C[me], p), to = tileAt(C[other], p)
    if (!t || !to) { hist['no tile in capture'] = (hist['no tile in capture'] || 0) + 1; continue }
    const oset = (to.iA || []).flat().map(v => v), has = (v) => oset.some(w => Math.hypot(w[0] - v[0], w[1] - v[1]) < 0.002)
    let dE = Infinity; for (const r of t.iA || []) for (let i = 0; i < r.length; i++) dE = Math.min(dE, segD(p, r[i], r[(i + 1) % r.length]))
    let best = Infinity, bv = null; for (const v of (t.iA || []).flat()) { const d = Math.hypot(v[0] - p[0], v[1] - p[1]); if (d < best && !has(v)) { best = d; bv = v } }
    const b = best < 0.5 ? '<0.5m' : best < 3 ? '<3m' : best < 10 ? '<10m' : '>=10m'
    hist[b] = (hist[b] || 0) + 1; if (ex.length < 12 && best < 3) ex.push({ p: p.map(v => +v.toFixed(3)), added: bv, d: +best.toFixed(3), dCurb: +dE.toFixed(3) })
  }
  console.log(`${me}-only vertices: nearest iA vertex that ${other}'s iA lacks →`, JSON.stringify(hist)); for (const e of ex) console.log('  ', JSON.stringify(e))
}
