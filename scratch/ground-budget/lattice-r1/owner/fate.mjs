// fate.mjs <before cap> <after cap> — each kept unowned ② edge BEFORE, in short-edges.mjs's class (R · G · M · X, against the
// old contributors), and what it is AFTER: owned, or still unowned with how many ① edges' contributors hold both its ends.
import { readFileSync } from 'fs'
import { LATTICE_M } from '../../../../src/lib/lattice.js'
const [B, A] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8'))), TOLC = 2 * LATTICE_M, key = (p) => p.join(',')
const recB = new Map(B.offNull.map(o => [key(o.p), o])), recA = new Map(A.offNull.map(o => [key(o.p), o])), stillA = new Set(A.at.filter(a => a.kept).map(a => key(a.p) + '>' + key(a.q)))
const dseg = (c, r) => { const dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L2 = dx * dx + dy * dy, u = Math.max(0, Math.min(1, ((r[0] - c.a[0]) * dx + (r[1] - c.a[1]) * dy) / L2)); return Math.hypot(r[0] - c.a[0] - u * dx, r[1] - c.a[1] - u * dy) }
const cls = (o) => { const cs = o.ops.flatMap(c => [c.a, c.b]), near = (pt) => cs.reduce((b, v) => { const d = Math.hypot(v[0] - pt[0], v[1] - pt[1]); return d < b.d ? { d, v } : b }, { d: Infinity })
  const np = near(o.p), nq = near(o.q); return np.d > TOLC && nq.d > TOLC ? 'X' : np.d <= TOLC && nq.d <= TOLC ? (Math.hypot(np.v[0] - nq.v[0], np.v[1] - nq.v[1]) < 1e-6 ? 'R' : 'G') : 'M' }
const t = new Map()
for (const a of B.at.filter(a => a.kept)) { const o = recB.get(key(a.p)), c = cls(o)
  let f = 'owned after'
  if (stillA.has(key(a.p) + '>' + key(a.q))) { const oa = recA.get(key(a.p)); f = `still unowned · ${new Set(oa.ops.filter(k => dseg(k, oa.p) <= TOLC && dseg(k, oa.q) <= TOLC).map(k => k.lab)).size} ① edge(s) hold both ends` }
  t.set(`${c} → ${f}`, (t.get(`${c} → ${f}`) || 0) + 1) }
for (const [k, v] of [...t].sort()) console.log(`  ${String(v).padStart(3)}  ${k}`)
console.log(`  unowned after that were not unowned before: ${A.at.filter(a => a.kept && !B.at.some(b => b.kept && key(b.p) === key(a.p) && key(b.q) === key(a.q))).length}`)
