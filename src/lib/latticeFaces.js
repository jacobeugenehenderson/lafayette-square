// latticeFaces.js — THE ARRANGEMENT'S OTHER HALF: the regions of a NODED set of lattice segments, by winding (Zob's ruling (ii),
// 2026-10-28, BRIEF-cut-once-in-full-precision; DESIGN in scratch/cut-once/DESIGN-candidate-3.md). latticeNode.js#nodeCrossings
// makes the segments meet only at shared vertices; this walks the faces they bound and returns the boundary of the region a
// predicate keeps, EVERY VERTEX A NODED VERTEX BY CONSTRUCTION: no intersection is computed here, so nothing is rounded twice.
// ⛔ It replaced clipper's union on noded input, which emitted 621 vertices that were no noded vertex and 1,358 edges that were
// no noded segment on Huron's eroded water (▶ node scratch/cut-once/step0.mjs --fixture=huron; cause not established).
//
// `edges` [{ a: [X, Y], b: [X, Y], set, tag }]: directed integer segments, each a piece of a ring of input set `set` (0 … sets−1),
// wound as clipper winds (an outer positive). `keep(w)`: w[s] is the winding number of set s on a face → is the face kept.
// Returns { rings: [[{ X, Y }]], tags: [[tag]] }: each ring has the kept region on its LEFT (outers positive, holes negative),
// and `tags[r][i]` is the tag of edge i → i+1, from the input edge running the SAME way. Refuses by name:
//  · a vertex strictly inside another segment (a T or a collinear overlap: the noding's precondition broke; snap rounding
//    routes every segment through every vertex pixel it enters, so an overlap arrives as IDENTICAL segments, merged here)
//  · a proper crossing left between two segments
//  · a face reached with two different windings (the input is not a set of closed rings)
//  · a boundary edge whose same-way input edges carry different tags (unless every claimant's line passes within the rounding of
//    both its ends: a TRANSITION, both tags; or it is ONE lattice step long: a CONCURRENCE, all of them; or one is the `prefer`red set's own, which wins; or `allTags`: then every tag is the list of them,
//    for a caller that names what several tags on one segment mean; ⛔ none picks one)
// ⭐ THE RULES. Identical segments MERGE into one undirected edge carrying each set's signed multiplicity (two opposite edges
// cancel; an edge whose multiplicities are all zero bounds nothing and is dropped). The half-edges round each vertex are sorted
// by EXACT angle (the half-plane, then the cross product; doubles under 2^24 units, BigInt past it, as latticeNode.js), never
// atan2. Each connected component's outer face is the one left of the LAST half-edge leaving its lowest-leftmost vertex (all
// its edges go up or right there); its winding is counted by a ray from a quarter-unit below that vertex (on no vertex: every
// vertex is integer; inside that vertex's pixel, which no other component's segment enters), and propagated across each edge
// by its multiplicity. ⭐ A PINCH (the kept region touching itself at one vertex) leaves as SEPARATE rings meeting there: at a
// vertex the boundary turns to the next kept edge CLOCKWISE from where it came in, the tightest turn.
// ▶ node checks/claims-the-faces-are-walked-once.mjs
import { crossOf, NODE_BOUND } from './latticeNode.js'

const SMALL = 2 ** 24
const small = (...v) => v.every(x => Math.abs(x) < SMALL)
const crossSign = (ax, ay, bx, by, numberOnly) => { if (numberOnly || small(ax, ay, bx, by)) return Math.sign(ax * by - ay * bx)
  const c = BigInt(ax) * BigInt(by) - BigInt(ay) * BigInt(bx); return c > 0n ? 1 : c < 0n ? -1 : 0 }
// counter-clockwise order of directions from +x: the upper half (dy > 0, or dy = 0 and dx > 0) first, then by the cross product
const half = (dx, dy) => (dy > 0 || (dy === 0 && dx > 0) ? 0 : 1)
export const angleCmp = (d1, d2, numberOnly = false) => { const h1 = half(d1[0], d1[1]), h2 = half(d2[0], d2[1])
  if (h1 !== h2) return h1 - h2
  return -crossSign(d1[0], d1[1], d2[0], d2[1], numberOnly) }

// ⭐ THE TIERED BOUND, ONE HOME (Zob, 2026-10-29): is point q on line l at the lattice's resolution? An EMITTED point: within
// NODE_BOUND of the line (exact: 2·cross² ≤ |dir|²). A NODING-INSERTED point (`segs`: the emitted segments it was routed into):
// within NODE_BOUND of ANY of them (snap rounding's own guarantee), so up to 2·NODE_BOUND from the line. The emission invariant
// (scratch/cut-once/cand3.mjs) and facesOf's transition test both call this, so the two cannot drift
export function onLineTiered(l, q, segs = null) {
  if (segs?.length) return segs.some(([a, b]) => { const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey, t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * ex + (q[1] - a[1]) * ey) / L2)) : 0
    return Math.hypot(q[0] - a[0] - t * ex, q[1] - a[1] - t * ey) <= NODE_BOUND })
  const dx = BigInt(l[1][0] - l[0][0]), dy = BigInt(l[1][1] - l[0][1]), cr = dx * BigInt(Math.round(q[1]) - l[0][1]) - dy * BigInt(Math.round(q[0]) - l[0][0])
  return 2n * cr * cr <= dx * dx + dy * dy }
export function facesOf(edges, keep, { sets, who = 'facesOf', numberOnly = false, allTags = false, prefer = null, inserted = null, tags: withTags = true } = {}) {
  if (!(sets > 0)) throw new Error(`[${who}] ⛔ facesOf: no \`sets\` count — the windings are per input set`)
  if (typeof keep !== 'function') throw new Error(`[${who}] ⛔ facesOf: no \`keep\` predicate — which faces are the region is the caller's to say`)
  // ── the vertices, and the merged edges: lo → hi by vertex id, m[s] the signed multiplicity of set s along lo → hi
  const vid = new Map(), V = []
  const idOf = (p) => { const k = p[0] + ',' + p[1]; let i = vid.get(k); if (i === undefined) { i = V.length; vid.set(k, i); V.push(p) } return i }
  const eid = new Map(), E = []
  for (const e of edges) { const u = idOf(e.a), v = idOf(e.b); if (u === v) continue
    if (!(e.set >= 0 && e.set < sets)) throw new Error(`[${who}] ⛔ facesOf: an edge of set ${e.set}, outside 0…${sets - 1}`)
    const lo = Math.min(u, v), hi = Math.max(u, v), k = lo + ',' + hi, dir = u === lo ? 1 : -1
    let me = eid.get(k); if (!me) { me = { lo, hi, m: new Array(sets).fill(0), tags: [] }; eid.set(k, me); E.push(me) }
    me.m[e.set] += dir; me.tags.push({ dir, tag: e.tag, set: e.set }) }
  const live = E.filter(me => me.m.some(x => x !== 0))
  // ── the precondition: no vertex strictly inside a segment, no proper crossing (the noding's own guarantee, re-proven here)
  const box = (me) => { const a = V[me.lo], b = V[me.hi]; return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] }
  const B = live.map(box)
  const lens = B.map(b => Math.max(b[2] - b[0], b[3] - b[1])).sort((x, y) => x - y)
  // the cell: the median segment, never smaller than the extent shared over the segments (latticeNode.js's own grid rule): with the
  // median alone, many short segments beside one long diagonal registered it in millions of cells (Map overflow, 2026-10-29)
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity; for (const b of B) { gx0 = Math.min(gx0, b[0]); gy0 = Math.min(gy0, b[1]); gx1 = Math.max(gx1, b[2]); gy1 = Math.max(gy1, b[3]) }
  const C = Math.max(1, lens[lens.length >> 1] || 1, Math.sqrt((gx1 - gx0 + 1) * (gy1 - gy0 + 1) / Math.max(1, B.length))), cells = new Map(), ck = (cx, cy) => cx + ',' + cy
  B.forEach((b, n) => { for (let cx = Math.floor(b[0] / C); cx <= Math.floor(b[2] / C); cx++) for (let cy = Math.floor(b[1] / C); cy <= Math.floor(b[3] / C); cy++) { const c = ck(cx, cy); (cells.get(c) || cells.set(c, []).get(c)).push(n) } })
  const touched = new Set(live.flatMap(me => [me.lo, me.hi]))
  for (const i of touched) { const p = V[i], l = cells.get(ck(Math.floor(p[0] / C), Math.floor(p[1] / C))) || []
    for (const n of l) { const me = live[n]; if (me.lo === i || me.hi === i) continue; const a = V[me.lo], b = V[me.hi]
      if (p[0] < B[n][0] || p[0] > B[n][2] || p[1] < B[n][1] || p[1] > B[n][3]) continue
      if (crossSign(b[0] - a[0], b[1] - a[1], p[0] - a[0], p[1] - a[1], numberOnly) === 0)
        throw new Error(`[${who}] ⛔ facesOf: the vertex (${p}) lies inside the segment (${a}) → (${b}) — a T or a collinear overlap the noding should have split (snap rounding's precondition broke). Refusing.`) } }
  for (const l of cells.values()) for (let u = 0; u < l.length; u++) for (let w = u + 1; w < l.length; w++) { const s = live[l[u]], t = live[l[w]]
    const X = crossOf({ a: V[s.lo], b: V[s.hi] }, { a: V[t.lo], b: V[t.hi] }, numberOnly)
    if (X) throw new Error(`[${who}] ⛔ facesOf: (${V[s.lo]}) → (${V[s.hi]}) and (${V[t.lo]}) → (${V[t.hi]}) cross at (${X}) — the input is not noded. Refusing.`) }
  // ── the half-edges: 2n = lo → hi, 2n + 1 = hi → lo; each vertex's outgoing ones in counter-clockwise order
  const H = live.length * 2, org = new Int32Array(H), dst = new Int32Array(H)
  live.forEach((me, n) => { org[2 * n] = me.lo; dst[2 * n] = me.hi; org[2 * n + 1] = me.hi; dst[2 * n + 1] = me.lo })
  const out = new Map(); for (let h = 0; h < H; h++) (out.get(org[h]) || out.set(org[h], []).get(org[h])).push(h)
  const pos = new Int32Array(H), dirOf = (h) => [V[dst[h]][0] - V[org[h]][0], V[dst[h]][1] - V[org[h]][1]]
  for (const l of out.values()) { l.sort((x, y) => angleCmp(dirOf(x), dirOf(y), numberOnly)); l.forEach((h, i) => { pos[h] = i }) }
  const twin = (h) => h ^ 1
  const next = (h) => { const l = out.get(dst[h]), i = pos[twin(h)]; return l[(i - 1 + l.length) % l.length] }
  // ── the face cycles
  const cyc = new Int32Array(H).fill(-1); let nc = 0
  const members = []
  for (let h = 0; h < H; h++) { if (cyc[h] >= 0) continue; const m = []; let g = h; do { cyc[g] = nc; m.push(g); g = next(g) } while (g !== h); members.push(m); nc++ }
  // ── the components (union-find over vertices), each one's lowest-leftmost vertex
  const par = new Map(), find = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x) } return x }
  for (const i of touched) par.set(i, i)
  for (const me of live) { const a = find(me.lo), b = find(me.hi); if (a !== b) par.set(a, b) }
  const low = new Map(); for (const i of touched) { const r = find(i), j = low.get(r), p = V[i]; if (j === undefined || p[1] < V[j][1] || (p[1] === V[j][1] && p[0] < V[j][0])) low.set(r, i) }
  // ── the ray: the winding per set of the point a quarter-unit below vertex v (×4 to stay integer: y₀ = 4·v.Y − 1)
  const rows = new Map(), R = 4 * C
  live.forEach((me, n) => { const y0 = 4 * Math.min(V[me.lo][1], V[me.hi][1]), y1 = 4 * Math.max(V[me.lo][1], V[me.hi][1])
    for (let r = Math.floor(y0 / R); r <= Math.floor(y1 / R); r++) (rows.get(r) || rows.set(r, []).get(r)).push(n) })
  const windAt = (v) => { const qx4 = 4 * V[v][0], y4 = 4 * V[v][1] - 1, w = new Array(sets).fill(0)
    for (const n of rows.get(Math.floor(y4 / R)) || []) { const me = live[n], a = V[me.lo], b = V[me.hi]
      if ((4 * a[1] > y4) === (4 * b[1] > y4)) continue
      const dy = b[1] - a[1], num = small(a[0], b[0], a[1], b[1]) && !numberOnly ? (4 * a[0] - qx4) * dy + (y4 - 4 * a[1]) * (b[0] - a[0])
        : Number(BigInt(4 * a[0] - qx4) * BigInt(dy) + BigInt(y4 - 4 * a[1]) * BigInt(b[0] - a[0]))
      if (Math.sign(num) !== Math.sign(dy)) continue                 // the crossing lies left of the point
      const up = dy > 0 ? 1 : -1; for (let s = 0; s < sets; s++) w[s] += up * me.m[s] }
    return w }
  // ── propagate: across half-edge h (lo → hi when h is even), the face on its right is the face on its left minus m
  const W = new Array(nc).fill(null)
  for (const [, v] of low) { const l = out.get(v), start = cyc[l[l.length - 1]]
    if (W[start]) continue
    W[start] = windAt(v); const queue = [start]
    // the cycles of this component, reached face to face
    while (queue.length) { const c = queue.pop()
      for (const h of members[c]) {
        const me = live[h >> 1], sg = h & 1 ? -1 : 1, t = cyc[twin(h)], wt = W[c].map((x, s) => x - sg * me.m[s])
        if (!W[t]) { W[t] = wt; queue.push(t) }
        else if (W[t].some((x, s) => x !== wt[s])) throw new Error(`[${who}] ⛔ facesOf: a face reached with two windings ([${W[t]}] and [${wt}]) across (${V[org[h]]}) → (${V[dst[h]]}) — the input is not a set of closed rings. Refusing.`) } } }
  // ── the boundary: each edge whose two faces the predicate splits, oriented with the kept face on its left
  const isB = new Uint8Array(H)
  live.forEach((me, n) => { const kl = !!keep(W[cyc[2 * n]]), kr = !!keep(W[cyc[2 * n + 1]]); if (kl !== kr) isB[kl ? 2 * n : 2 * n + 1] = 1 })
  const used = new Uint8Array(H), rings = [], tags = []
  // `tags: false` (Zob, 2026-10-29): an arrangement whose tags NOTHING reads computes none, so it can neither refuse on them nor hand
  // a later reader tags that were never checked
  const tagOf = (h) => { if (!withTags) return null; const me = live[h >> 1], dir = h & 1 ? -1 : 1, same = me.tags.filter(t => t.dir === dir && t.tag != null)
    const keys = new Set(same.map(t => JSON.stringify(t.tag)))
    if (allTags) return [...keys].map(k => JSON.parse(k))
    // `prefer` (Zob, 2026-10-29): on ∩ or a difference, where the region's boundary coincides with the PREFERRED input's own
    // segment, its tag is that input's (P's own line): the other claimants' lines lie within the lattice's rounding of it
    // ⭐ A TRANSITION SEGMENT (Zob, 2026-10-29): two LINE claimants (tags of two points each) that BOTH pass within the rounding's
    // bound of BOTH of the segment's ends (exact: 2·cross² ≤ |dir|² per end) are one transition collapsed by rounding, not a
    // conflict: the segment carries both tags
    if (keys.size > 1) { const L = [...keys].map(k => JSON.parse(k)), A = V[org[h]], Bv = V[dst[h]]
      // a LINE is two points of two numbers (a tag may also be a pair of lines, an earlier transition's: not a line)
      const isLine = (l) => Array.isArray(l) && l.length === 2 && l.every(pt => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite))
      const within = (l, q) => isLine(l) && onLineTiered(l, q, inserted?.get(q[0] + ',' + q[1]))
      if (L.every(l => within(l, A) && within(l, Bv))) return L
      // ⭐ A CONCURRENCE (Zob, 2026-10-29): a segment ONE lattice step long (length² ≤ 2, straight or diagonal) carries no direction;
      // every line passing within half a pixel claims it. Its tag set says "these lines meet here", a vertex of the boundary, not
      // a conflict; the caller takes its neighbour's line (as for a transition)
      const sx = Bv[0] - A[0], sy = Bv[1] - A[1]
      if (sx * sx + sy * sy <= 2 && L.every(isLine)) return L }
    if (keys.size > 1 && prefer != null) { const own = new Set(same.filter(t => t.set === prefer).map(t => JSON.stringify(t.tag)))
      if (own.size === 1) return JSON.parse([...own][0]) }
    if (keys.size > 1) throw new Error(`[${who}] ⛔ facesOf: the boundary edge (${V[org[h]]}) → (${V[dst[h]]}) carries ${keys.size} different tags from its same-way inputs (${same.map(t => `set ${t.set}: ${JSON.stringify(t.tag)}`).join(' · ')}) — refusing to pick one.`)
    return same.length ? same[0].tag : null }
  for (let h = 0; h < H; h++) { if (!isB[h] || used[h]) continue
    const ring = [], tg = []; let g = h
    do { used[g] = 1; ring.push({ X: V[org[g]][0], Y: V[org[g]][1] }); tg.push(tagOf(g))
      const l = out.get(dst[g]); let i = pos[twin(g)], f = -1
      for (let k = 1; k <= l.length; k++) { const c = l[(i - k + l.length * 2) % l.length]; if (isB[c]) { f = c; break } }
      if (f < 0) throw new Error(`[${who}] ⛔ facesOf: the boundary stops at (${V[dst[g]]}) — no kept edge leaves it. Refusing.`)
      if (used[f] && f !== h) throw new Error(`[${who}] ⛔ facesOf: the boundary walk from (${V[org[h]]}) re-entered (${V[org[f]]}) without closing. Refusing.`)
      g = f } while (g !== h)
    rings.push(ring); tags.push(tg) }
  // ⭐ THE BOOKS BALANCE (Zob, 2026-10-28; PTown's deck, a ring whose shoelace and region disagreed): the kept region's exact area,
  // as the walk knows it (Σ over kept faces of their cycles' exact shoelace), equals Σ of the emitted rings' exact shoelace. A
  // ring that winds twice round a lobe, or a lobe walked by no ring, breaks it; refused by name, never emitted.
  const sh = (pts) => { let a = 0n; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += BigInt(p[0]) * BigInt(q[1]) - BigInt(q[0]) * BigInt(p[1]) } return a }
  let faceA = 0n
  members.forEach((m, c) => { if (!keep(W[c])) return; faceA += sh(m.map(g => V[org[g]])) })
  const ringA = rings.reduce((t, r) => t + sh(r.map(q => [q.X, q.Y])), 0n)
  if (faceA !== ringA) { const worst = rings.map((r, k) => ({ k, n: r.length, at: [r[0].X, r[0].Y], a2: sh(r.map(q => [q.X, q.Y])) }))
    throw new Error(`[${who}] ⛔ facesOf: the books do not balance — the kept faces enclose ${faceA}/2 units² and the emitted rings ${ringA}/2 (Δ ${ringA - faceA}/2) over ${rings.length} ring(s); rings: ${JSON.stringify(worst.slice(0, 12), (k, v) => typeof v === 'bigint' ? v.toString() : v)}. Refusing.`) }
  return { rings, tags }
}
