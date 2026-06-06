// Chamfer E3.3 sweep — classify every achieved fillet near each junction-
// construction node: do its legs ride identified OUTER curb lines (good), a
// carriageway STUB's taper-stroke edge (the false-corner class — must be 0),
// or neither (unidentified)? Verification surface for the E3.3 gate.
import { build, R } from './voussoir-setup.mjs'
const g = build()
const jm = R.junctionMap
const byId = new Map(R.streets.map(s => [s.skelId, s]))
const norm = (x, z) => { const L = Math.hypot(x, z) || 1; return [x / L, z / L] }
const ptOf = (s, end) => end === 'start' ? s.points[0] : s.points[s.points.length - 1]
const plen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L }
// body tangent + point at arclength d from end (mirrors derive.js stationAt)
const stationAt = (s, end, d) => {
  const p = s.points
  const idx = (i) => end === 'start' ? i : p.length - 1 - i
  let acc = 0
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[idx(i)], b = p[idx(i + 1)]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (acc + L >= d || i === p.length - 2) {
      const f = L > 0 ? Math.min(1, (d - acc) / L) : 0
      const pt = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
      const t = end === 'start' ? norm(b[0] - a[0], b[1] - a[1]) : norm(a[0] - b[0], a[1] - b[1])
      return { pt, t }
    }
    acc += L
  }
  return { pt: ptOf(s, end), t: [1, 0] }
}
const sidePerp = (t, side) => side === 'right' ? [-t[1], t[0]] : [t[1], -t[0]]
const wOf = (s, side) => Math.max(0, s.measure?.[side]?.pavementHW || 0)
// distance from point q to the infinite line through p along dir u
const lineDist = (q, p, u) => Math.abs((q[0] - p[0]) * u[1] - (q[1] - p[1]) * u[0])
const SIN_TOL = Math.sin(14 * Math.PI / 180)
const D_TOL = 0.9 // m lateral
const fillets = Object.entries(g.cornerFillets).map(([k, f]) => ({ k, ...f }))
let nStub = 0, nGood = 0, nOther = 0, nodesSwept = 0
for (const nd of jm.nodes) {
  const stubs = nd.corners?.stub || []
  const outers = nd.corners?.outer || []
  if (!stubs.length && !outers.length) continue
  nodesSwept++
  // allowed outer curb lines (body tangent past taper, offset w)
  const lines = []
  for (const { chain, side } of outers) {
    const s = byId.get(chain); if (!s) continue
    const leg = (nd.legs || []).find(l => l.chain === chain)
    let pt, t
    if (leg && leg.end !== 'through') ({ pt, t } = stationAt(s, leg.end, Math.min(25, plen(s.points) * 0.4)))
    else {
      // through chain: tangent at the node vertex
      const p = s.points
      let vi = -1
      for (let i = 1; i < p.length - 1; i++) if (Math.abs(p[i][0] - nd.at[0]) < 5e-3 && Math.abs(p[i][1] - nd.at[1]) < 5e-3) { vi = i; break }
      if (vi < 0) continue
      pt = p[vi]; t = norm(p[vi + 1][0] - p[vi - 1][0], p[vi + 1][1] - p[vi - 1][1])
    }
    const w = wOf(byId.get(chain), side)
    const nh = sidePerp(t, side)
    lines.push({ kind: 'outer', chain, side, p: [pt[0] + nh[0] * w, pt[1] + nh[1] * w], u: t })
  }
  // stub stroke edges: the node-side TAPER segment offset by each side's w
  const stubEdges = []
  for (const { chain, end } of stubs) {
    const s = byId.get(chain); if (!s) continue
    const p = s.points
    const [a, b] = end === 'start' ? [p[0], p[1]] : [p[p.length - 1], p[p.length - 2]]
    const u = norm(b[0] - a[0], b[1] - a[1])
    for (const side of ['left', 'right']) {
      const w = wOf(s, side)
      if (!(w > 0.05)) continue
      const nh = sidePerp(end === 'start' ? u : [-u[0], -u[1]], side)
      stubEdges.push({ kind: 'stub', chain, end, side, p: [a[0] + nh[0] * w, a[1] + nh[1] * w], u })
    }
  }
  const RJ = 14
  for (const f of fillets) {
    const d = Math.hypot(f.apex[0] - nd.at[0], f.apex[1] - nd.at[1])
    if (d > RJ) continue
    const legs = [
      { dir: norm(f.tA[0] - f.apex[0], f.tA[1] - f.apex[1]), foot: f.tA },
      { dir: norm(f.tB[0] - f.apex[0], f.tB[1] - f.apex[1]), foot: f.tB },
    ]
    const cls = legs.map(L => {
      let hit = null
      for (const e of stubEdges) {
        const cr = Math.abs(L.dir[0] * e.u[1] - L.dir[1] * e.u[0])
        if (cr < SIN_TOL && lineDist(L.foot, e.p, e.u) < D_TOL && lineDist(f.apex, e.p, e.u) < D_TOL) { hit = e; break }
      }
      if (hit) return { c: 'STUB', hit }
      for (const e of lines) {
        const cr = Math.abs(L.dir[0] * e.u[1] - L.dir[1] * e.u[0])
        if (cr < SIN_TOL && lineDist(L.foot, e.p, e.u) < D_TOL) { hit = e; break }
      }
      return hit ? { c: 'outer', hit } : { c: 'other' }
    })
    const tag = cls.some(c => c.c === 'STUB') ? 'STUB' : cls.every(c => c.c === 'outer') ? 'good' : 'other'
    if (tag === 'STUB') { nStub++
      console.log(`STUB-FILLET node(${nd.at[0].toFixed(1)},${nd.at[1].toFixed(1)}) [${nd.kinds}] apex(${f.apex[0].toFixed(1)},${f.apex[1].toFixed(1)}) r=${f.r.toFixed(2)} legs=${cls.map(c => c.c + (c.hit ? ':' + c.hit.chain + '/' + (c.hit.side || c.hit.end) : '')).join(' | ')}`)
    } else if (tag === 'good') nGood++
    else nOther++
  }
}
console.log(`\nswept ${nodesSwept} nodes — fillets near constructed nodes: ${nStub} STUB-legged, ${nGood} outer-clean, ${nOther} other/mixed`)
