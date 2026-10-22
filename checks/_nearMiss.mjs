// _nearMiss.mjs — ONE LINE DRAWN TWICE, edge against edge: the one detector (moved here 2026-10-22 from
// claims-no-edge-is-drawn-twice.mjs, so the paint stack and the land evidence are measured by one rule).
// Its definition (a NEAR-MISS: overlap longer than a step, both ends of the overlap within a step, not one integer line) is
// documented in claims-no-edge-is-drawn-twice.mjs's header. ⭐ Why a STEP and not NODE_BOUND: the noder joins a VERTEX within
// NODE_BOUND of an edge; two copies of a line diverging from a shared vertex carry no such vertex (Huron's evidence, 0 to
// 0.91 mm over 30 m, 2026-10-22), and NODE_BOUND at the overlap's far end would miss it.
import { CLIP_SCALE, LATTICE_M } from '../src/lib/lattice.js'

const STEP = CLIP_SCALE * LATTICE_M          // one lattice step, in the integer units the flatten works in

// the detector: entries [{ groupKey, items }] → near-miss pairs
export function nearMisses(entries) {
  // the edges, in typed arrays (a town's stack is ~10⁶ edges): integer lattice ends, and which entry/item/ring drew each
  let n = 0
  const ringsOf = (it) => Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]
  for (const e of entries) for (const it of e.items) for (const r of ringsOf(it)) if (r && r.length >= 2) n += r.length
  const AX = new Int32Array(n), AY = new Int32Array(n), BX = new Int32Array(n), BY = new Int32Array(n), G = new Int32Array(n), I = new Int32Array(n), R = new Int32Array(n)
  const NXT = new Int32Array(n), PRV = new Int32Array(n)            // the ring's next / previous edge (skipping degenerate ones)
  let m = 0
  entries.forEach((e, gi) => e.items.forEach((it, ii) => ringsOf(it).forEach((r, ri) => { if (!r || r.length < 2) return
    const first = m
    for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]
      const ax = Math.round(a[0] * CLIP_SCALE), ay = Math.round(a[1] * CLIP_SCALE), bx = Math.round(b[0] * CLIP_SCALE), by = Math.round(b[1] * CLIP_SCALE)
      if (ax === bx && ay === by) continue
      AX[m] = ax; AY[m] = ay; BX[m] = bx; BY[m] = by; G[m] = gi; I[m] = ii; R[m] = ri; m++ }
    for (let k = first; k < m; k++) { NXT[k] = k + 1 < m ? k + 1 : first; PRV[k] = k > first ? k - 1 : m - 1 } })))
  // a grid sized to the edges themselves; each edge listed in every cell its box, widened a step, meets — a compressed
  // index (counts, then offsets), keyed by an integer per cell. The cell is the median edge, but never smaller than the
  // extent shared out over the edges (√(area / edges)): a town of long edges and a tiny median otherwise asks for more
  // cells than a Map holds (2²⁴) — measured on HPDM's unclipped tile rings, 2026-10-14, a RangeError, not a finding.
  const lens = new Float64Array(m); for (let k = 0; k < m; k++) lens[k] = Math.hypot(BX[k] - AX[k], BY[k] - AY[k])
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let k = 0; k < m; k++) { x0 = Math.min(x0, AX[k], BX[k]); x1 = Math.max(x1, AX[k], BX[k]); y0 = Math.min(y0, AY[k], BY[k]); y1 = Math.max(y1, AY[k], BY[k]) }
  const C = Math.max(STEP, Float64Array.from(lens).sort()[m >> 1] || STEP, Math.sqrt((x1 - x0 + 2 * STEP) * (y1 - y0 + 2 * STEP) / Math.max(1, m)))
  const NX = Math.floor((x1 - x0 + 2 * STEP) / C) + 1
  const cellsOf = (k, f) => { for (let gx = Math.floor((Math.min(AX[k], BX[k]) - STEP - x0 + STEP) / C), gx1 = Math.floor((Math.max(AX[k], BX[k]) + STEP - x0 + STEP) / C); gx <= gx1; gx++)
    for (let gy = Math.floor((Math.min(AY[k], BY[k]) - STEP - y0 + STEP) / C), gy1 = Math.floor((Math.max(AY[k], BY[k]) + STEP - y0 + STEP) / C); gy <= gy1; gy++) f(gy * NX + gx) }
  const slot = new Map(); let cnt = []
  for (let k = 0; k < m; k++) cellsOf(k, (c) => { let s = slot.get(c); if (s === undefined) { slot.set(c, s = cnt.length); cnt.push(0) } cnt[s]++ })
  const start = new Int32Array(cnt.length + 1); for (let s = 0; s < cnt.length; s++) start[s + 1] = start[s] + cnt[s]
  const fill = start.slice(0, cnt.length), list = new Int32Array(start[cnt.length]); cnt = null
  for (let k = 0; k < m; k++) cellsOf(k, (c) => { list[fill[slot.get(c)]++] = k })
  const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0
    return Math.hypot(px - ax - t * dx, py - ay - t * dy) }
  const out = [], seen = new Set()
  for (let s = 0; s < start.length - 1; s++) for (let i = start[s]; i < start[s + 1]; i++) for (let j = i + 1; j < start[s + 1]; j++) {
    const p = list[i], q = list[j]
    // ⭐ ONE ITEM TOO (Zob, 2026-10-22, PTown's flatten refusal): a ring that folds back along itself — a 1 mm spur, the
    // line out and the line back — is one line drawn twice by ONE producer. Two edges of one item are tested like any
    // pair; a pair of adjacent edges qualifies only where the ring reverses within a step (a corner's overlap leaves the
    // step at once). Marked `self`, reported apart.
    if (p === q) continue
    const ex = BX[p] - AX[p], ey = BY[p] - AY[p]
    const c1 = ex * (AY[q] - AY[p]) - ey * (AX[q] - AX[p]), c2 = ex * (BY[q] - AY[p]) - ey * (BX[q] - AX[p])
    if (c1 === 0 && c2 === 0) continue                                             // one integer line: shared, the goal
    const L = lens[p], t = (x, y) => ((x - AX[p]) * ex + (y - AY[p]) * ey) / L
    const lo = Math.max(0, Math.min(t(AX[q], AY[q]), t(BX[q], BY[q]))), hi = Math.min(L, Math.max(t(AX[q], AY[q]), t(BX[q], BY[q])))
    if (!(hi - lo > STEP)) continue                                                  // a line drawn twice overlaps longer than a step
    const xa = AX[p] + ex / L * lo, ya = AY[p] + ey / L * lo, xb = AX[p] + ex / L * hi, yb = AY[p] + ey / L * hi
    const d0 = segD(xa, ya, AX[q], AY[q], BX[q], BY[q]); if (d0 > STEP) continue
    const d1 = segD(xb, yb, AX[q], AY[q], BX[q], BY[q]); if (d1 > STEP) continue
    const key = p < q ? p * m + q : q * m + p; if (seen.has(key)) continue; seen.add(key)
    const A = entries[G[p]].groupKey, B = entries[G[q]].groupKey
    // the shape: does an end vertex of one edge sit on the other's interior with its ring running on along that edge?
    const onInterior = (vx, vy, k) => { const dx = BX[k] - AX[k], dy = BY[k] - AY[k], L2 = dx * dx + dy * dy, t = ((vx - AX[k]) * dx + (vy - AY[k]) * dy) / L2
      return t * Math.sqrt(L2) > STEP && (1 - t) * Math.sqrt(L2) > STEP && segD(vx, vy, AX[k], AY[k], BX[k], BY[k]) <= STEP }
    const runsOn = (x, k) => { // edge x's two ring neighbours: does the one through a vertex on k's interior continue along k?
      if (onInterior(BX[x], BY[x], k)) { const nx = NXT[x]; if (segD(BX[nx], BY[nx], AX[k], AY[k], BX[k], BY[k]) <= STEP) return true }
      if (onInterior(AX[x], AY[x], k)) { const px = PRV[x]; if (segD(AX[px], AY[px], AX[k], AY[k], BX[k], BY[k]) <= STEP) return true }
      return false }
    const shape = runsOn(p, q) || runsOn(q, p) ? 'straight-through-vertex' : 'ends-or-parallel'
    out.push({ a: `${A}#${I[p]}.${R[p]}`, b: `${B}#${I[q]}.${R[q]}`, ga: A, gb: B, same: A === B, self: G[p] === G[q] && I[p] === I[q], shape, m: (hi - lo) / CLIP_SCALE,
      gap: Math.max(d0, d1), at: [(xa + xb) / 2 / CLIP_SCALE, (ya + yb) / 2 / CLIP_SCALE], seg: [[xa / CLIP_SCALE, ya / CLIP_SCALE], [xb / CLIP_SCALE, yb / CLIP_SCALE]] })
  }
  return out
}
