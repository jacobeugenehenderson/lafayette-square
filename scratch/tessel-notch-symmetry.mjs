// READ-ONLY. Is the dead-end NOTCH in iA symmetric about its spur centerline?
//
// iA is the block (tile − roadway). Along a dead-end spur the block lies on BOTH
// sides, so marching outward from the centerline until we enter iA gives the
// half-width the block actually yields, per side, per station. That is the
// distance test Layer 0 demands — never an area one — and it runs WITH the
// scene's authored blockCustoms, because shape.json is the authored bake.
//
//   node scratch/tessel-notch-symmetry.mjs [skelId]
import fs from 'fs'
import crypto from 'crypto'
const o = console.log
const RAW = fs.readFileSync('public/baked/lafayette-square/shape.json')
const sh = JSON.parse(RAW)
const rb = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
o(`shape.json sha256 ${crypto.createHash('sha256').update(RAW).digest('hex').slice(0, 10)}   (uncommitted authoring — state it with any count)`)

const ONLY = process.argv[2] || null
const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
const K = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4)
const stBySkel = new Map(rb.streets.map(s => [s.skelId || s.name, s]))
const deg = new Map()
for (const s of rb.streets) {
  if (!(s.points?.length >= 2) || s.gradeSeparated) continue
  for (let i = 0; i < s.points.length; i++) deg.set(K(s.points[i]), (deg.get(K(s.points[i])) || 0) + ((i === 0 || i === s.points.length - 1) ? 1 : 2))
}
const inRing = (p, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
const inIA = (p, rings) => { let c = 0; for (const r of rings) if (inRing(p, r)) c++; return c % 2 === 1 }

const STEP = 0.02, MAXOUT = 40

const rows = []
sh.tiles.forEach((t, ti) => {
  const rings = t.iA || []; if (!rings.length) return
  for (const c of (rb.tiles[ti].caps || [])) {
    if (ONLY && c.skelId !== ONLY) continue
    const st = stBySkel.get(c.skelId); if (!st) continue
    const seq = c.capEnd === 'end' ? [...st.points].reverse() : st.points   // seq[0] = tip
    const cum = [0]; for (let i = 1; i < seq.length; i++) cum[i] = cum[i - 1] + d(seq[i - 1], seq[i])
    let spurLen = cum[cum.length - 1]
    for (let i = 1; i < seq.length; i++) if ((deg.get(K(seq[i])) || 0) >= 3) { spurLen = cum[i]; break }
    // station → point + unit tangent on the chain
    const at = (s) => {
      for (let i = 1; i < seq.length; i++) if (cum[i] >= s || i === seq.length - 1) {
        const a = seq[i - 1], b = seq[i], L = Math.max(1e-9, cum[i] - cum[i - 1]), u = (s - cum[i - 1]) / L
        return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] }
      }
      return null
    }
    const hw0 = Math.max(st.measure?.left?.pavementHW || 0, st.measure?.right?.pavementHW || 0)
    const lo = hw0 + 3, hi = spurLen - hw0 - 3
    if (!(hi > lo)) { rows.push({ ti, c, spurLen, short: true }); continue }
    const A = [], B = []
    for (let s = lo; s <= hi; s += 1) {
      const q = at(s); if (!q) continue
      const nx = -q.t[1], nz = q.t[0]
      for (const [sgn, acc] of [[1, A], [-1, B]]) {
        let hit = null
        for (let r = STEP; r < MAXOUT; r += STEP) {
          if (inIA([q.p[0] + nx * sgn * r, q.p[1] + nz * sgn * r], rings)) { hit = r; break }
        }
        if (hit != null) acc.push(hit)
      }
    }
    const med = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1] }
    const rt = (t.roundTips || []).find(x => x.skelId === c.skelId && x.capEnd === c.capEnd)
    rows.push({ ti, c, spurLen, a: med(A), b: med(B), nA: A.length, nB: B.length, n: Math.floor(hi - lo) + 1,
      mL: st.measure?.left?.pavementHW, mR: st.measure?.right?.pavementHW, tipHW: rt?.hw ?? null })
  }
})

o('')
o('tile skelId                       end    spur   measure L/R      notch A   notch B     Δ    tip.hw  stations')
const sortable = rows.filter(r => !r.short && r.a != null && r.b != null)
for (const r of [...rows].sort((x, y) => ((y.a != null && y.b != null ? Math.abs(y.a - y.b) : -1) - (x.a != null && x.b != null ? Math.abs(x.a - x.b) : -1)))) {
  if (r.short) { o(`${String(r.ti).padStart(4)} ${r.c.skelId.padEnd(28)} ${r.c.capEnd.padEnd(6)} ${r.spurLen.toFixed(0).padStart(5)}  — spur too short to sample`); continue }
  const dd = (r.a != null && r.b != null) ? Math.abs(r.a - r.b) : null
  o(`${String(r.ti).padStart(4)} ${r.c.skelId.padEnd(28)} ${r.c.capEnd.padEnd(6)} ${r.spurLen.toFixed(0).padStart(5)}  ${(+r.mL).toFixed(2).padStart(5)}/${(+r.mR).toFixed(2).padEnd(5)} ` +
    `${(r.a?.toFixed(2) ?? '  —').padStart(9)} ${(r.b?.toFixed(2) ?? '  —').padStart(9)} ${(dd?.toFixed(2) ?? '  —').padStart(6)}  ${String(r.tipHW?.toFixed(2) ?? '—').padStart(6)}  ${r.nA}/${r.nB} of ${r.n}`)
}
o(`\ncaps ${rows.length} · sampled both sides ${sortable.length} · |A−B| > 0.10 m: ${sortable.filter(r => Math.abs(r.a - r.b) > 0.10).length}`)
