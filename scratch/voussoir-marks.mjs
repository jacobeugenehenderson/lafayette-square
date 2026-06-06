// Mark validation: per mark, (1) PRODUCTION residual (⊥dist to the live
// asphalt boundary), (2) PROPOSED-construction residual (the §4.3 de-taper
// rule: carriageway outer curb = offset of the chain with the taper run
// replaced by the straight-body extension; spine curb = plain offset), with
// CURRENT authored widths, (3) the trace-implied width per chain (current w +
// median signed deviation) — the E1-class datum report.
import { build, R, marks } from './voussoir-setup.mjs'
const g = build()

// ── helpers ──
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const norm = (v) => { const l = Math.hypot(v[0], v[1]); return l > 1e-9 ? [v[0] / l, v[1] / l] : [0, 0] }
const distToPolyline = (p, pts) => {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az
    const L2 = dx * dx + dz * dz
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2)) : 0
    best = Math.min(best, Math.hypot(p[0] - (ax + dx * t), p[1] - (az + dz * t)))
  }
  return best
}
const distToRings = (p, rings) => {
  let best = Infinity
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length]
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
      best = Math.min(best, Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t)))
    }
  }
  return best
}
const offsetPolyline = (pts, d) => {
  // d > 0 = measure-RIGHT ((-dz,dx) of forward); per-vertex bisector-free simple offset
  const out = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    const t = norm(sub(b, a))
    out.push([pts[i][0] + (-t[1]) * d, pts[i][1] + t[0] * d])
  }
  return out
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN }

// ── the §4.3 de-taper: replace a carriageway's taper run (gap-to-mate <
// NOSE_GAP at its transition end(s)) with the straight extension of the body ──
const NOSE_GAP = 2.0
const byId = new Map(R.streets.map(s => [s.skelId, s]))
const mateOf = (s) => {
  const ph = s.phase
  if (!ph?.pairKey) return null
  return R.streets.find(o => o !== s && o.phase?.pairKey === ph.pairKey && o.phase?.corridorName === ph.corridorName)
}
const deTaper = (s) => {
  const pts = s.points.map(p => [p[0], p[1]])
  const mate = mateOf(s)
  if (!mate) return pts
  const gap = (p) => distToPolyline(p, mate.points)
  const fix = (arr) => {  // de-taper the START of arr
    let k = 0
    while (k < arr.length && gap(arr[k]) < NOSE_GAP) k++
    if (k === 0 || k >= arr.length - 1) return arr
    // straight-extend the body's first segment back over the taper window
    const A = arr[k], B = arr[k + 1]
    const t = norm(sub(A, B))   // pointing back toward the node
    const span = Math.hypot(arr[0][0] - A[0], arr[0][1] - A[1])
    const ext = [A[0] + t[0] * span, A[1] + t[1] * span]
    return [ext, ...arr.slice(k)]
  }
  let out = fix(pts)
  out = fix(out.slice().reverse()).reverse()
  return out
}

// ── per-mark primary chains (from the earlier nearest-chain scan) ──
// [markIdx, [chainId,...]] — the chains whose curbs the mark traces
const PRIMARY = [
  [0, ['truman-parkway-0', 'lafayette-avenue-1']],
  [1, ['lafayette-avenue-6', 'truman-parkway-1', 'lafayette-avenue-1']],
  [2, ['lafayette-avenue-5', 'lafayette-avenue-1']],
  [3, ['south-jefferson-avenue-3', 'lafayette-avenue-7', 'lafayette-avenue-3', 'lafayette-avenue-8']],
  [4, ['south-jefferson-avenue-7', 'south-jefferson-avenue-6']],
  [5, ['south-jefferson-avenue-5', 'south-jefferson-avenue-6']],
  [6, ['south-jefferson-avenue-5', 'south-jefferson-avenue-4']],
  [7, ['south-jefferson-avenue-7', 'south-jefferson-avenue-4']],
]
console.log('mark | n | prod med/p90 | proposed med/p90 (current datums) | per-chain trace-implied width')
for (const [mi, chainIds] of PRIMARY) {
  const pts = marks[mi].map(q => [q.x, q.z])
  // production residual
  const prod = pts.map(p => distToRings(p, g.asphalt))
  // proposed curbs: for each chain, offset the de-tapered line by the authored
  // outer width on BOTH sides; residual per point = min over all candidate curbs
  const curbs = []
  const fitRows = []
  for (const id of chainIds) {
    const s = byId.get(id)
    if (!s) continue
    const line = s.phase?.kind === 'divided' && /carriageway/.test(s.phase?.role || '') ? deTaper(s) : s.points.map(p => [p[0], p[1]])
    for (const side of ['left', 'right']) {
      const w = s.measure?.[side]?.pavementHW || 0
      if (w <= 0.01) continue
      const d = side === 'right' ? w : -w
      const curb = offsetPolyline(line, d)
      curbs.push({ id, side, w, curb, line })
    }
  }
  const prop = pts.map(p => Math.min(...curbs.map(c => distToPolyline(p, c.curb))))
  // trace-implied width for the chain that wins most points
  const winner = new Map()
  pts.forEach(p => {
    let best = { d: Infinity }
    for (const c of curbs) { const d = distToPolyline(p, c.curb); if (d < best.d) best = { d, c } }
    if (best.c) {
      const k = best.c.id + '/' + best.c.side
      if (!winner.has(k)) winner.set(k, { c: best.c, pts: [] })
      winner.get(k).pts.push(p)
    }
  })
  for (const [k, { c, pts: wp }] of winner) {
    if (wp.length < 2) continue
    // signed: distance from chain line minus w, sign = outward
    const devs = wp.map(p => distToPolyline(p, c.line) - c.w)
    fitRows.push(`${k}: w=${c.w.toFixed(2)}→${(c.w + median(devs)).toFixed(2)} (${wp.length}pt)`)
  }
  const p90 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(0.9 * (s.length - 1))] }
  console.log(`#${mi} | ${pts.length} | ${median(prod).toFixed(2)}/${p90(prod).toFixed(2)} | ${median(prop).toFixed(2)}/${p90(prop).toFixed(2)} | ${fitRows.join(' · ')}`)
}
