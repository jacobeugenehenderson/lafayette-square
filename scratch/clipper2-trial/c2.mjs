// c2.mjs — the Clipper2 side of the trials, and the shared measures. Light: no build, reads in-<scene>.json.
// Clipper2 (clipper2-ts 2.0.1-18, node_modules beside this file) offsets with a DeltaCallback that is asked ONCE PER
// VERTEX (Offset.ts `offsetPoint(group, path, j, k)`: one `groupDelta` for both edges meeting at j). Our depth is per
// EDGE, a [start, end] ramp allowed. Two ways to hand it over, both measured:
//   'vertex' — the path is the working ring as is; vertex j takes edge j's START depth. An edge's offset then runs from
//              its own start depth to the NEXT edge's start depth: a step becomes a ramp over the whole edge before it.
//   'stub'   — each edge gets two extra points STUB m in from its ends, carrying its own start / end depth, so an
//              edge keeps its depth to within STUB of each end; the original vertex takes the SMALLER of the two depths
//              meeting there ('stub-min') or the LARGER ('stub-max').
// JoinType.Miter with a miter limit that never bites (MITER_LIMIT): our construction has no limit either.
// Coordinates go to Clipper2 relative to the block's first vertex at SCALE2 units per metre (the integer products must
// stay under 2^53: |x| ≤ 5 km → 5e7 units, products ≤ 2.5e15).
import { ClipperOffset, JoinType, EndType, Clipper64, ClipType, FillRule } from 'clipper2-ts'

export const SCALE2 = 1e4, STUB = 0.1, MITER_LIMIT = 1e6
const dS = (d) => Math.max(0, (Array.isArray(d) ? d[0] : d) || 0), dE = (d) => Math.max(0, (Array.isArray(d) ? d[1] : d) || 0)
export const signedArea = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }

// → { rings (metres), raw: the same, before nothing (Clipper2 has no floor) }
export function c2Offset(ring, depth, outward, mode) {
  const o = ring[0], P = [], D = []
  const put = (p, d) => { P.push({ x: Math.round((p[0] - o[0]) * SCALE2), y: Math.round((p[1] - o[1]) * SCALE2) }); D.push(d) }
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    const prev = depth[(i - 1 + n) % n], cur = depth[i]
    if (mode === 'vertex') { put(a, dS(cur)); continue }
    put(a, mode === 'stub-max' ? Math.max(dE(prev), dS(cur)) : Math.min(dE(prev), dS(cur)))
    if (L > 3 * STUB) { const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L
      put([a[0] + ux * STUB, a[1] + uz * STUB], dS(cur)); put([b[0] - ux * STUB, b[1] - uz * STUB], dE(cur)) }
  }
  // the callback's sign: + grows the path's own area, whatever its winding (Offset.ts negates for a reversed group)
  const sgn = outward ? 1 : -1
  const co = new ClipperOffset(MITER_LIMIT)
  co.addPath(P, JoinType.Miter, EndType.Polygon)
  const sol = []
  co.executeWithCallback((path, norms, j) => sgn * D[j] * SCALE2, sol)
  return sol.map(p => p.map(q => [q.x / SCALE2 + o[0], q.y / SCALE2 + o[1]]))
}

export function xorArea(A, B) {
  const sc = (R) => R.map(r => r.map(p => ({ x: Math.round(p[0] * 1000), y: Math.round(p[1] * 1000) })))
  const c = new Clipper64(); c.addSubject(sc(A)); c.addClip(sc(B)); const out = []
  c.execute(ClipType.Xor, FillRule.NonZero, out)
  return out.reduce((s, r) => s + signedArea(r.map(p => [p.x, p.y])), 0) / 1e6
}

// boundary samples every STEP m, and a segment grid for nearest-distance
export const STEP = 0.25
export function samples(R) { const S = []
  for (const r of R) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / STEP))
    for (let t = 0; t < k; t++) S.push([a[0] + (b[0] - a[0]) * t / k, a[1] + (b[1] - a[1]) * t / k]) }
  return S }
export function segIndex(R, cell = 4) {
  const segs = [], g = new Map()
  for (const r of R) for (let i = 0; i < r.length; i++) segs.push([r[i], r[(i + 1) % r.length]])
  segs.forEach(([a, b], id) => { const x0 = Math.floor(Math.min(a[0], b[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0]) / cell), y0 = Math.floor(Math.min(a[1], b[1]) / cell), y1 = Math.floor(Math.max(a[1], b[1]) / cell)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; (g.get(k) || g.set(k, []).get(k)).push(id) } })
  const d2 = (p, [a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0
    const ex = p[0] - a[0] - t * dx, ey = p[1] - a[1] - t * dy; return ex * ex + ey * ey }
  const near = (p) => { if (!segs.length) return Infinity
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell); let best = Infinity
    for (let rad = 0; rad < 4096; rad++) {
      for (let x = cx - rad; x <= cx + rad; x++) for (let y = cy - rad; y <= cy + rad; y++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== rad) continue
        for (const id of g.get(x + ',' + y) || []) { const v = d2(p, segs[id]); if (v < best) best = v } }
      if (best < Infinity && Math.sqrt(best) <= rad * cell) break }
    return Math.sqrt(best) }
  return { near }
}
// symmetric Hausdorff (sampled at STEP), optionally only over samples within `r` of point `at`
export function hausdorff(A, B, at = null, r = Infinity) {
  if (!A.length && !B.length) return 0
  if (!A.length || !B.length) return Infinity
  const iA = segIndex(A), iB = segIndex(B)
  const inR = (p) => !at || Math.hypot(p[0] - at[0], p[1] - at[1]) <= r
  let h = 0
  for (const p of samples(A)) if (inR(p)) h = Math.max(h, iB.near(p))
  for (const p of samples(B)) if (inR(p)) h = Math.max(h, iA.near(p))
  return h
}
// spike vertices: interior angle under SPIKE_DEG — the thorn's signature
export const SPIKE_DEG = 30
export function spikes(R) { let n = 0; const at = []
  for (const r of R) { const m = r.length
    for (let i = 0; i < m; i++) { const p = r[(i - 1 + m) % m], v = r[i], q = r[(i + 1) % m]
      const a = Math.atan2(p[1] - v[1], p[0] - v[0]), b = Math.atan2(q[1] - v[1], q[0] - v[0])
      let ang = Math.abs(a - b) * 180 / Math.PI; if (ang > 180) ang = 360 - ang
      if (ang < SPIKE_DEG && Math.hypot(p[0] - v[0], p[1] - v[1]) > 0.01 && Math.hypot(q[0] - v[0], q[1] - v[1]) > 0.01) { n++; at.push(v) } } }
  return { n, at } }
