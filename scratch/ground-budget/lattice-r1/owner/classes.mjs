// classes.mjs <cap.json> [--all] — each unowned ② edge (on a kept tile, or every one with --all) joined to labelOf's null record
// at its start point, and put in short-edges.mjs's classes (Screed, 9773284d): R one operand corner on two grid points ·
// G two operand corners · M one end at an operand corner, the other minted · X no operand corner. Plus why labelOf refused it.
import { readFileSync } from 'fs'
import { LATTICE_M } from '../../../../src/lib/lattice.js'
const D = JSON.parse(readFileSync(process.argv[2], 'utf8')), ALL = process.argv.includes('--all'), TOLC = 2 * LATTICE_M
const key = (p) => p.join(','), byP = new Map(D.offNull.map(o => [key(o.p), o]))
const cls = new Map(), why = new Map(), len = []
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1)
let noRec = 0
for (const a of D.at.filter(a => ALL || a.kept)) {
  let o = byP.get(key(a.p)); if (!o) { let bd = 1e-3; for (const r of D.offNull) { const d = Math.hypot(r.p[0] - a.p[0], r.p[1] - a.p[1]); if (d < bd) { bd = d; o = r } } }
  if (!o) { noRec++; continue }
  len.push(o.eL)
  const corners = o.ops.flatMap(c => [{ v: c.a, c }, { v: c.b, c }])
  const near = (pt) => corners.reduce((b, k) => { const d = Math.hypot(k.v[0] - pt[0], k.v[1] - pt[1]); return d < b.d ? { d, k } : b }, { d: Infinity, k: null })
  const np = near(o.p), nq = near(o.q)
  const c = np.d > TOLC && nq.d > TOLC ? 'X' : np.d <= TOLC && nq.d <= TOLC && Math.hypot(np.k.v[0] - nq.k.v[0], np.k.v[1] - nq.k.v[1]) < 1e-6 ? 'R' : np.d <= TOLC && nq.d <= TOLC ? 'G' : 'M'
  bump(cls, c)
  // labelOf's two tests against the best contributor (smallest max off-line)
  let nb = null
  for (const k of o.ops) { const dx = k.b[0] - k.a[0], dy = k.b[1] - k.a[1], L = Math.hypot(dx, dy); if (!(L > 0)) continue
    const off = (r) => Math.abs((r[0] - k.a[0]) * dy - (r[1] - k.a[1]) * dx) / L, mo = Math.max(off(o.p), off(o.q))
    const tp = ((o.p[0] - k.a[0]) * dx + (o.p[1] - k.a[1]) * dy) / L, tq = ((o.q[0] - k.a[0]) * dx + (o.q[1] - k.a[1]) * dy) / L
    const ov = Math.min(L, Math.max(tp, tq)) - Math.max(0, Math.min(tp, tq))
    if (!nb || mo < nb.mo) nb = { mo, ov, L, kind: k.kind } }
  bump(why, `${c} · ${o.eL <= TOLC ? 'edge ≤ TOLC' : 'edge > TOLC'} · ${!nb ? 'no contributor within 5 mm' : nb.mo > TOLC ? 'off every line > TOLC' : nb.ov > TOLC ? '?? passes' : `on a kind-${nb.kind} line, overlap ${nb.ov <= 0 ? '≤ 0' : '≤ TOLC'} (line ${nb.L < 0.005 ? '< 5 mm' : '≥ 5 mm'})`}`)
}
len.sort((a, b) => a - b)
console.log(`${ALL ? 'all' : 'kept-tile'} unowned edges: ${[...cls].map(([k, v]) => `${k} ${v}`).join(' · ')} · no labelOf record ${noRec} · edge length p50 ${(len[len.length >> 1] * 1000).toFixed(2)} mm, max ${(len.at(-1) * 1000).toFixed(2)} mm`)
for (const [k, v] of [...why].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
