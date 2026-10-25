// absorbInk.js — THE ε INK IS ABSORBED INTO THE FACES AT THE MINT'S EXIT (BRIEF-the-ink-is-owned-by-its-labels §3.1–§3.2;
// Jacob, 2026-10-25: "after the mint there is no 5mm overlap. That is math that becomes absorbed and disappears").
//
// ① is the ink of the network, ε wide; its holes are the faces (blocks, and the water). Before this the strip belonged to NO
// face and was painted by re-stroked quads resolved by overlap (`inkByOwner` / `inkPiecesByOwner`, deleted). Now:
//   1. ONE noding pass (`latticeNode#nodeCrossings`) over ①'s ink rings, the frame rect and the water rings (closed) and the
//      sealed centrelines (open). Zob's read (Boz, 2026-10-25): the faces are walked from THIS noded set, never matched to
//      the boolean's faces afterwards, because that boolean split ink edges at the frame and the water (up to 1 unit off).
//   2. A half-edge walk of the arrangement. Each cycle's LEFT region is read off the edges it runs along — the ink's own
//      winding, the frame's, the water's — never by a point test: an ink CELL, a land face, the water, or nothing.
//      A land cycle is NAMED by its ink edges' labels: each ① label lies on exactly one face's edge, so the label says
//      which face (`blocks[k]`, holes included). Identity, carried.
//   3. Each cell joins the ONE group across its ink edges (a land face, or the water — "yes, coast slit joins the water").
//      Zero (inside the frame) or two REFUSES by name; the census prints per town. A cell beyond the frame is counted.
//   4. The face's painted boundary is SPLICED from the arrangement, not unioned: the half-edges with the face on their left
//      and another group on their right, linked at each vertex. No boolean, so nothing is rounded twice and every vertex
//      is one the neighbour shares — neighbours meet on the centreline exactly. Each edge carries a label: a centreline
//      edge the stroke's pass on the face's side (`own` right, `ownL` left), the frame its owner, the water its owner.
//      A dead end's spur is a dangling centreline inside one face's cell, so it is never a boundary: the face closes round it.
// → { paint: [{ outer, outerLabels, holes, holeLabels, winding: 'block' } | null per face], cells: [{ rings, outer, labels, group,
//   winding: 'left' }] (the cells whose owners are water or a grade-separated highway — the classes the ground paints apart
//   from the road), census }. ⭐ THE TWO WIND OPPOSITE WAYS, and each record says which: a painted face is in the BLOCK
//   convention (①'s holes: its outer clockwise, its holes counter-clockwise, the face on their RIGHT); a cell keeps the walk's
//   (its region on the LEFT of every ring: the outer counter-clockwise). A cell's `outer` says whether `rings[0]` is its outer.
// ⛔ ② never reads this (Boz's ruling A(i)): it offsets the un-absorbed face, so the authoring keys cannot move.
import { nodeCrossings } from './latticeNode.js'
import { CLIP_SCALE } from './lattice.js'

const rl = (v) => Math.round(v * CLIP_SCALE) / CLIP_SCALE
const area2 = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a }

// THE POINT A HOLE CYCLE IS LINKED BY: a quarter unit to the LEFT (the face it bounds) of its longest edge with its antennas
// removed — a spur's edge is walked both ways in one cycle (its twin is in it too), and a point off it lies on the spur, not
// in the face (Zob, 2026-10-25). Exported for the check's planted row.
export function holeProbe(hs, who = '①') {
  const inN = new Set(hs), real = hs.filter(g => !inN.has(g.twin)), len = (g) => Math.hypot(g.to[0] - g.from[0], g.to[1] - g.from[1])
  if (!real.length) throw new Error(`[${who}][absorb] ⛔ a hole cycle at (${hs[0].from.map(v => v / CLIP_SCALE)}) is all antenna — no side to probe. Refusing.`)
  const h = real.reduce((m, g) => len(g) > len(m) ? g : m, real[0])
  const dx = h.to[0] - h.from[0], dy = h.to[1] - h.from[1], L = Math.hypot(dx, dy)
  return [(h.from[0] + h.to[0]) / 2 - dy / L * 0.25, (h.from[1] + h.to[1]) / 2 + dx / L * 0.25]
}

// ⭐⭐ AN ANNULUS SPLIT BY ITS OWN CLASS CHANGES (Boz's ruling with Zob's read, 2026-10-25). A cell round a face whose corners
// are all node-less meetings (no outline point, so no spoke reached the face) is a RING: an outer cycle (the centrelines) and a
// hole (the face's ink outline), holding two classes. Each class change on either cycle carries the OWNER PAIR {a, b} — the
// two strokes meeting there, read off the labels — and a change on the outer pairs with the change on the hole carrying the
// SAME pair (identity first, as everywhere in ①). Only where one pair occurs more than once on a cycle are its matchings
// tried (rotations and both senses), and exactly one must be SIMPLE, or the cell refuses by place. The chosen chords are then
// VERIFIED exactly, in integers (BigInt orientation, no floats): no chord crosses or touches another chord or either cycle
// except at its own ends, and each chord's midpoint lies inside the outer and outside the hole. One chord opens the ring, each
// further chord splits a band — pieces of the cell's own vertices, no new vertex, no search. Exported for its planted rows.
//   O, H: the outer and hole cycles as edges { from: [X, Y], to } (lattice integers), walked with the cell on their left.
//   cls(e): the edge's class or null; own(e): the stroke that owns it (for the pair) or null.
//   → { pieces: [[edge…]…] } or { refused: why }
const orientB = (a, b, c) => { const v = (BigInt(b[0]) - BigInt(a[0])) * (BigInt(c[1]) - BigInt(a[1])) - (BigInt(b[1]) - BigInt(a[1])) * (BigInt(c[0]) - BigInt(a[0])); return v > 0n ? 1 : v < 0n ? -1 : 0 }
const onSegB = (a, b, p) => orientB(a, b, p) === 0 && BigInt(Math.min(a[0], b[0])) <= BigInt(p[0]) && BigInt(p[0]) <= BigInt(Math.max(a[0], b[0])) && BigInt(Math.min(a[1], b[1])) <= BigInt(p[1]) && BigInt(p[1]) <= BigInt(Math.max(a[1], b[1]))
const sameP = (p, q) => p[0] === q[0] && p[1] === q[1]
// do segments p1p2 and q1q2 meet anywhere except at an endpoint they SHARE?
function meetsB(p1, p2, q1, q2) {
  const shared = [p1, p2].filter(p => sameP(p, q1) || sameP(p, q2))
  const o1 = orientB(p1, p2, q1), o2 = orientB(p1, p2, q2), o3 = orientB(q1, q2, p1), o4 = orientB(q1, q2, p2)
  if (o1 !== o2 && o3 !== o4 && o1 && o2 && o3 && o4) return true                       // a proper crossing
  for (const [a, b, p] of [[p1, p2, q1], [p1, p2, q2], [q1, q2, p1], [q1, q2, p2]]) if (onSegB(a, b, p) && !shared.some(x => sameP(x, p))) return true
  if (shared.length === 1 && !o1 && !o2) {                                               // collinear from a shared end: overlap?
    const s0 = shared[0], far = (u, v) => sameP(u, s0) ? v : u, a = far(p1, p2), b = far(q1, q2)
    if ((BigInt(a[0]) - BigInt(s0[0])) * (BigInt(b[0]) - BigInt(s0[0])) + (BigInt(a[1]) - BigInt(s0[1])) * (BigInt(b[1]) - BigInt(s0[1])) > 0n) return true }
  return false
}
const insideB = (pt2, ring) => { let w = false   // pt2 in DOUBLED units (a chord midpoint), ring in units
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = [2 * ring[i][0], 2 * ring[i][1]], b = [2 * ring[j][0], 2 * ring[j][1]]
    if ((a[1] > pt2[1]) !== (b[1] > pt2[1])) { const s = orientB(b, a, pt2); if ((a[1] > b[1]) ? s > 0 : s < 0) w = !w } } return w }
export function splitAnnulus(O, H, cls, own) {
  const changes = (E) => { const n = E.length, c = E.map(cls), o = E.map(own)
    for (let pass = 0; pass < 2; pass++) for (let k = 0, last = null, lo = null; k < 2 * n; k++) { const i = k % n
      if (c[i] != null) { last = c[i]; lo = o[i] } else if (last != null) { c[i] = last; if (o[i] == null) o[i] = lo } }
    const T = []
    for (let k = 0; k < n; k++) { const p = (k - 1 + n) % n; if (c[k] != null && c[p] != null && c[k] !== c[p]) T.push({ k, key: [o[p], o[k]].map(String).sort().join('|') }) }
    return T }
  const TO = changes(O), TH = changes(H)
  if (!TO.length || TO.length !== TH.length) return { refused: `${TO.length} class change(s) on the outer, ${TH.length} on the hole` }
  const byKey = (T) => { const m = new Map(); for (const t of T) (m.get(t.key) || m.set(t.key, []).get(t.key)).push(t); return m }
  const MO = byKey(TO), MH = byKey(TH)
  for (const [k, v] of MO) if ((MH.get(k)?.length || 0) !== v.length) return { refused: `owner pair ${k} occurs ${v.length}× on the outer and ${MH.get(k)?.length || 0}× on the hole` }
  // the choices: a pair occurring once is fixed; one occurring m times tries its m rotations in both senses
  let options = [[]]
  for (const [k, os] of MO) { const hs = MH.get(k), m = os.length
    const local = m === 1 ? [[[os[0], hs[0]]]] : [...Array(m).keys()].flatMap(r => [os.map((x, j) => [x, hs[(r + j) % m]]), os.map((x, j) => [x, hs[((r - j) % m + m) % m]])])
    options = options.flatMap(prev => local.map(l => [...prev, ...l]))
    // ⛔ this bound is on WORK, not geometry: past it the matchings are not tried, and the cell refuses by name rather than
    // spend unbounded time (Zob, 2026-10-25). No cell of the four poured towns comes near it.
    if (options.length > 256) return { refused: `too many matchings to try (${options.length}) — a work bound, not a geometric verdict` } }
  // the two senses coincide for small m (m = 2: each rotation is its own reverse), so a matching is counted ONCE, by its chord set
  { const seen = new Set(); options = options.filter(o => { const id = o.map(([x, c]) => x.k + '>' + c.k).sort().join(','); if (seen.has(id)) return false; seen.add(id); return true }) }
  const ringO = O.map(e => e.from), ringH = H.map(e => e.from)
  const simple = (pairs) => { const ch = pairs.map(([x, c]) => [O[x.k].from, H[c.k].from])
    for (let i = 0; i < ch.length; i++) {
      const [a, b] = ch[i]; if (sameP(a, b)) return false
      for (let j = i + 1; j < ch.length; j++) if (meetsB(a, b, ch[j][0], ch[j][1])) return false
      for (const E of [O, H]) for (const e of E) if (meetsB(a, b, e.from, e.to)) return false
      const mid = [a[0] + b[0], a[1] + b[1]]
      if (!insideB(mid, ringO) || insideB(mid, ringH)) return false }
    return true }
  // the pieces a matching cuts: one chord opens the ring (the outer from x1, the chord, the hole from c1, the chord back), and
  // each further chord splits a band
  const build = (match) => { const pairs = [...match].sort((p, q) => p[0].k - q[0].k), [x1, c1] = pairs[0]
    const rot = (E, k) => [...E.slice(k), ...E.slice(0, k)]
    let pieces = [[...rot(O, x1.k), { from: O[x1.k].from, to: H[c1.k].from, chord: true }, ...rot(H, c1.k), { from: H[c1.k].from, to: O[x1.k].from, chord: true }]]
    for (const [x, c] of pairs.slice(1)) { const ex = O[x.k], eh = H[c.k], P = pieces.find(q => q.includes(ex) && q.includes(eh))
      if (!P) return null
      const ia = P.indexOf(ex), ib = P.indexOf(eh), lo = Math.min(ia, ib), hi = Math.max(ia, ib)
      pieces.splice(pieces.indexOf(P), 1, P.slice(lo, hi), [...P.slice(hi), ...P.slice(0, lo)]) }
    return pieces }
  // ⭐ A MATCHING IS THE CELL'S OWN only if its chords are simple AND every piece it cuts holds ONE class: in a ring a rotated
  // matching can give simple chords that spiral, each piece mixing two classes (a valid partition, not the cell's). ⛔ Exactly
  // one matching may pass; none, or more than one (a thick ring whose classes repeat), refuses.
  const oneClass = (P) => new Set(P.filter(e => !e.chord).map(cls).filter(c => c != null)).size === 1
  const valid = options.map(o => { if (!simple(o)) return null; const P = build(o); return P && P.every(oneClass) ? P : null }).filter(Boolean)
  if (valid.length !== 1) return { refused: `${valid.length} of ${options.length} matching(s) give simple chords and one class per piece (exactly one must)` }
  return { pieces: valid[0] }
}

export function absorbInk({ inkRings, inkLabels, frame, frameOwner, waterRings = [], waterOwner = null, centrelines, spokes = [], outlineRefused = [], faces, owners, who = '①', diag = null }) {
  // `diag` (optional, a diagnostic's): filled with the PLACES behind a refusal — what each refused face or cell is made of
  if (!Array.isArray(centrelines)) throw new Error(`[${who}][absorb] ⛔ no sealed centreline — nothing to cut the ink by. Refusing.`)
  // ── 1. the inputs, on the lattice, each knowing what it is ──
  const inputs = []
  inkRings.forEach((r, i) => { if (r?.length >= 3) inputs.push({ tag: 'ink', p: r.map(q => [rl(q[0]), rl(q[1])]), kind: 'ink', i }) })
  inputs.push({ tag: 'frame', p: frame.map(q => [rl(q[0]), rl(q[1])]), kind: 'frame' })
  waterRings.forEach((r, i) => { if (r?.length >= 3) inputs.push({ tag: 'water', p: r.map(q => [rl(q[0]), rl(q[1])]), kind: 'water', i }) })
  // ⭐ EACH CENTRELINE SEGMENT IS ITS OWN PATH: nodeCrossings nodes two different inputs, never an input against itself, and a
  // stroke can cross ITSELF (a cloverleaf ramp looping over its own carriageway, LS's interchange). Fed whole, that crossing was
  // never noded, the arrangement was not planar, and its walk returned a loop wound backwards (the probe, 2026-10-25). Fed per
  // segment, every crossing of two segments — a stroke's own included — is a vertex. The segment index rides on the tag.
  centrelines.forEach((c, i) => { const P = c.points.map(q => [rl(q[0]), rl(q[1])]), n = P.length, m = c.closed ? n : n - 1
    for (let k = 0; k < m; k++) { const a = P[k], b = P[(k + 1) % n]; if (a[0] !== b[0] || a[1] !== b[1]) inputs.push({ tag: 'centreline', p: [a, b], kind: 'cl', i, seg: k, open: true }) } })
  // the wedge spokes (mint: node → outline point): they divide a cell between the strokes meeting at a node
  spokes.forEach((sp, i) => { const p = sp.map(q => [rl(q[0]), rl(q[1])]); if (p[0][0] !== p[1][0] || p[0][1] !== p[1][1]) inputs.push({ tag: 'spoke', p, kind: 'spoke', i, open: true }) })
  const R = nodeCrossings(inputs.map(x => ({ tag: x.tag, p: x.p, open: !!x.open })), { pairs: () => true, who: `${who} absorb` })
  // the ink's filled side: Clipper winds an outer and its holes opposite, the region always on one side — read off the
  // largest ring (an outer), never assumed. The frame rect and each water ring by their own winding.
  let big = -1, bigA = 0; inputs.forEach((x, n) => { if (x.kind === 'ink') { const a = Math.abs(area2(x.p)); if (a > bigA) { bigA = a; big = n } } })
  const inkOnLeft = big < 0 ? true : area2(inputs[big].p) > 0
  const sideOf = inputs.map(x => x.kind === 'cl' ? 0 : (area2(x.p) > 0 ? 1 : -1))   // +1: the filled side is LEFT of the ring's direction
  // ── 2. the arrangement ──
  const key = (k) => k[0] + ',' + k[1]
  const edges = new Map()      // "a|b" (a < b by key) → { a, b, tags: [] }
  R.forEach((o, n) => { const x = inputs[n], m = o.length, last = x.open ? m - 1 : m
    for (let j = 0; j < last; j++) { const u = o[j], v = o[(j + 1) % m]
      if (u.k[0] === v.k[0] && u.k[1] === v.k[1]) continue
      const ku = key(u.k), kv = key(v.k), fwd = ku < kv, id = fwd ? ku + '|' + kv : kv + '|' + ku
      let e = edges.get(id); if (!e) edges.set(id, e = { a: fwd ? u.k : v.k, b: fwd ? v.k : u.k, tags: [] })
      // `along`: this input runs a → b along the edge
      if (x.kind === 'ink') e.tags.push({ kind: 'ink', label: inkLabels[x.i]?.[u.edge] ?? null, along: fwd, ring: x.i })
      else if (x.kind === 'cl') e.tags.push({ kind: 'cl', rec: x.i, seg: x.seg, along: fwd })
      else if (x.kind === 'spoke') e.tags.push({ kind: 'spoke' })
      else e.tags.push({ kind: x.kind, along: fwd, side: sideOf[n] })
    } })
  // half-edges: two per edge; `out` per vertex sorted counter-clockwise
  const H = [], out = new Map()
  for (const e of edges.values()) {
    const h0 = { from: e.a, to: e.b, e, fwd: true }, h1 = { from: e.b, to: e.a, e, fwd: false }; h0.twin = h1; h1.twin = h0
    H.push(h0, h1)
    for (const h of [h0, h1]) { const k = key(h.from); (out.get(k) || out.set(k, []).get(k)).push(h) } }
  for (const L of out.values()) { L.forEach(h => { h.ang = Math.atan2(h.to[1] - h.from[1], h.to[0] - h.from[0]) }); L.sort((p, q) => p.ang - q.ang); L.forEach((h, i) => { h.at = i }) }
  // next(h): at h's head, the outgoing half-edge just CLOCKWISE of h's twin — the walk keeps the face on its left
  const next = (h) => { const L = out.get(key(h.to)), i = h.twin.at; return L[(i - 1 + L.length) % L.length] }
  // ── the cycles, and what lies on their left ──
  const cycles = []
  for (const h of H) { if (h.cyc != null) continue
    const c = { hs: [], n: cycles.length }
    for (let g = h, guard = 0; g.cyc == null; g = next(g)) { if (++guard > 1e7) throw new Error(`[${who}][absorb] ⛔ a face walk did not close. Refusing.`); g.cyc = c.n; c.hs.push(g) }
    cycles.push(c) }
  const cycArea = (c) => c.area ??= c.hs.reduce((t, h) => t + h.from[0] * h.to[1] - h.to[0] * h.from[1], 0)
  const leftOf = (h, t) => { const along = t.along === h.fwd       // this half-edge runs the input's way
    return t.kind === 'ink' ? (along === inkOnLeft) : (along === (t.side > 0)) }
  // ⭐ A FACE IS ITS OUTER CYCLE AND THE HOLE CYCLES IT HOLDS. A block's ink outline never touches a centreline (it sits ε off
  // it), so in the walk every block is a separate cycle — a HOLE of the cell around it — and the cell's own outer cycle is all
  // centreline. So typing and naming read a FACE (every cycle of it), never one cycle. Each hole (a clockwise cycle) joins the
  // smallest counter-clockwise cycle enclosing a point just off its own edge (the standard hole-to-face link of a face walk;
  // geometry only joins a face's boundaries, it never names one); a hole no cycle encloses belongs to the unbounded face.
  const pos = cycles.filter(c => cycArea(c) > 0), neg = cycles.filter(c => cycArea(c) < 0)
  const F = pos.map(c => ({ cycles: [c] })), unbounded = { cycles: [] }
  pos.forEach((c, n) => { c.face = F[n]; let a = Infinity, b = Infinity, x = -Infinity, y = -Infinity
    for (const h of c.hs) { if (h.from[0] < a) a = h.from[0]; if (h.from[1] < b) b = h.from[1]; if (h.from[0] > x) x = h.from[0]; if (h.from[1] > y) y = h.from[1] }
    c.bb = [a, b, x, y] })
  { const G = 2e5, grid = new Map()   // 200 m cells over the counter-clockwise cycles' bounds
    pos.forEach((c, n) => { for (let gx = Math.floor(c.bb[0] / G); gx <= Math.floor(c.bb[2] / G); gx++) for (let gy = Math.floor(c.bb[1] / G); gy <= Math.floor(c.bb[3] / G); gy++) (grid.get(gx + ',' + gy) || grid.set(gx + ',' + gy, []).get(gx + ',' + gy)).push(n) })
    const inPoly = (pt, c) => { let w = false; const hs = c.hs; for (const h of hs) { const [xi, yi] = h.to, [xj, yj] = h.from; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) w = !w } return w }
    for (const N of neg) {
      // the longest edge of the cycle with its antennas removed: a spur's edge is walked both ways in one cycle (its twin is
      // in it too), and a point off it lies on the spur, not in the face the hole bounds
      const pt = holeProbe(N.hs, who)
      let best = null
      for (const n of (grid.get(Math.floor(pt[0] / G) + ',' + Math.floor(pt[1] / G)) || [])) { const P = pos[n]
        if (pt[0] < P.bb[0] || pt[0] > P.bb[2] || pt[1] < P.bb[1] || pt[1] > P.bb[3] || !(cycArea(P) < (best ? cycArea(best) : Infinity))) continue
        if (inPoly(pt, P)) best = P }
      if (diag && !best) (diag.unlinked ||= []).push({ pt: pt.map(v => v / CLIP_SCALE), area: cycArea(N) / 2 / CLIP_SCALE / CLIP_SCALE, n: N.hs.length,
        containers: cycles.filter(c => c !== N && inPoly(pt, c)).map(c => ({ area: cycArea(c) / 2 / CLIP_SCALE / CLIP_SCALE, n: c.hs.length, kinds: [...new Set(c.hs.flatMap(g => g.e.tags.map(u => u.kind)))] })).sort((x, y) => Math.abs(x.area) - Math.abs(y.area)).slice(0, 5) })
      N.face = best ? best.face : unbounded; N.face.cycles.push(N); if (diag) N.linkProbe = { pt: pt.map(v => v / CLIP_SCALE), into: best ? cycArea(best) / 2 / CLIP_SCALE / CLIP_SCALE : 'unbounded' } } }
  const allFaces = [...F, unbounded]
  for (const f of allFaces) {
    let ink = null, water = false, frameIn = null, flags = false
    for (const c of f.cycles) for (const h of c.hs) { if (h.e.tags.some(t => t.kind === 'cl' || t.kind === 'spoke')) continue   // a centreline or a spoke: ink on both sides, says nothing
      for (const t of h.e.tags) { flags = true; const L = leftOf(h, t)
        if (t.kind === 'ink') { if (ink === null) ink = L; else if (ink !== L) {
          if (diag) diag.bothInkCycles = f.cycles.map(c => ({ area: cycArea(c) / 2 / CLIP_SCALE / CLIP_SCALE, n: c.hs.length, at: c.hs[0].from.map(v => v / CLIP_SCALE),
            kinds: [...new Set(c.hs.flatMap(g => g.e.tags.map(u => u.kind)))], inkLeft: [...new Set(c.hs.flatMap(g => g.e.tags.filter(u => u.kind === 'ink').map(u => leftOf(g, u))))],
            outer: c === f.cycles[0], linkedBy: c.linkProbe || null }))
          if (diag) diag.bothInk = f.cycles.flatMap(c => c.hs.flatMap(g => g.e.tags.filter(u => u.kind === 'ink').map(u => ({ at: g.from.map(v => v / CLIP_SCALE), to: g.to.map(v => v / CLIP_SCALE), label: u.label, ring: u.ring, inkLeft: leftOf(g, u), cycle: g.cyc }))))
          throw new Error(`[${who}][absorb] ⛔ a face at (${h.from.map(v => v / CLIP_SCALE)}) is both ink and not ink by its own edges. Refusing.`) } }
        else if (t.kind === 'water') { if (L) water = true }
        else if (t.kind === 'frame') frameIn = L } }
    f.type = (ink === true || (ink === null && !flags)) ? 'cell' : water ? 'water' : (frameIn === false || f === unbounded) ? 'outside' : 'land'
  }
  // ── a land face is named by its ink edges' labels ──
  // ⭐ A LABEL MAY BORDER MORE THAN ONE FACE: where a road crosses another with no node (grade separation, §5a's true-geometry
  // crossing), one ① edge is cut by the other's ink into pieces on faces either side. So a label names the SET of faces it
  // borders, and a land face is the one face common to all of its labels — never the first face a label was seen on.
  const facesOfLabel = new Map()
  faces.forEach((f, k) => { if (!f) return; for (const L of [f.labels, ...(f.holeLabels || [])]) for (const l of (L || [])) if (l != null) (facesOfLabel.get(l) || facesOfLabel.set(l, new Set()).get(l)).add(k) })
  const census = { cells: 0, joined: 0, toWater: 0, zero: [], two: [], outside: 0, landUnnamed: 0, landTwoNames: [], mixed: [], annuli: 0 }
  // ⭐ where the mint REFUSED a node's outline (acute · degenerate · noVertex) it drew no spokes, so a cell there may span two
  // strokes: a refusal at such a cell says so, so it is read as the outline's, never as an absorb defect (Zob, 2026-10-25)
  const refusedAt = new Map(outlineRefused.map(r => [Math.round(rl(r.p[0]) * CLIP_SCALE) + ',' + Math.round(rl(r.p[1]) * CLIP_SCALE), r.why]))
  const refusedNote = (f) => { for (const c of f.cycles) for (const h of c.hs) { const w = refusedAt.get(key(h.from)); if (w) return ` (outline refused here: ${w})` } return '' }
  const at0 = (f) => { const h = f.cycles[0]?.hs[0]; return h ? `(${h.from.map(v => (v / CLIP_SCALE).toFixed(3)).join(', ')})${refusedNote(f)}` : '(?)' }
  for (const f of allFaces) {
    if (f.type === 'water') { f.group = 'water'; continue }
    if (f.type === 'outside') { f.group = 'none'; continue }
    if (f.type !== 'land') continue
    let ks = null
    for (const c of f.cycles) for (const h of c.hs) for (const t of h.e.tags) { if (t.kind !== 'ink' || t.label == null || !facesOfLabel.has(t.label)) continue
      const S = facesOfLabel.get(t.label); ks = ks ? new Set([...ks].filter(k => S.has(k))) : new Set(S) }
    ks ||= new Set()
    if (ks.size === 1) f.group = [...ks][0]
    else if (!ks.size) { f.group = 'none'; census.landUnnamed++
      if (diag) (diag.unnamed ||= []).push({ at: at0(f), cycles: f.cycles.length, area: f.cycles.reduce((t, c) => t + cycArea(c), 0) / 2 / CLIP_SCALE / CLIP_SCALE,
        labels: [...new Set(f.cycles.flatMap(c => c.hs.flatMap(h => h.e.tags.filter(t => t.kind === 'ink').map(t => t.label))))].map(l => ({ l, owner: owners[l] ? `${owners[l].skelId}/${owners[l].side}/${owners[l].segOrd}` : null, faces: [...(facesOfLabel.get(l) || [])] })),
        tags: [...new Set(f.cycles.flatMap(c => c.hs.flatMap(h => h.e.tags.map(t => t.kind))))] }) }
    else { f.group = 'none'; census.landTwoNames.push(`${[...ks].join('+')}@${at0(f)}`) } }
  // ── 3. every cell joins the one group across its ink edges ──
  const fr = frame.map(q => [rl(q[0]) * CLIP_SCALE, rl(q[1]) * CLIP_SCALE]), fx0 = Math.min(...fr.map(p => p[0])), fx1 = Math.max(...fr.map(p => p[0])), fz0 = Math.min(...fr.map(p => p[1])), fz1 = Math.max(...fr.map(p => p[1]))
  const inFrame = (f) => f.cycles.every(c => c.hs.every(h => h.from[0] >= fx0 && h.from[0] <= fx1 && h.from[1] >= fz0 && h.from[1] <= fz1))
  const faceOfH = (h) => cycles[h.cyc].face
  for (const f of allFaces) {
    if (f.type !== 'cell') continue
    census.cells++
    const gs = new Set()
    for (const c of f.cycles) for (const h of c.hs) if (h.e.tags.some(t => t.kind === 'ink') && !h.e.tags.some(t => t.kind === 'cl' || t.kind === 'spoke')) { const g = faceOfH(h.twin).group; if (g != null && g !== 'none') gs.add(g) }
    if (gs.size === 1) { f.group = [...gs][0]; census.joined++; if (f.group === 'water') census.toWater++ }
    else if (!gs.size) { f.group = 'none'; if (inFrame(f)) census.zero.push(at0(f)); else census.outside++ }
    else { f.group = 'none'; census.two.push(`${[...gs].join('+')}@${at0(f)}`)
      if (diag) (diag.two ||= []).push({ cycles: f.cycles.map(c => ({ area: cycArea(c) / 2 / CLIP_SCALE / CLIP_SCALE, kinds: [...new Set(c.hs.flatMap(g => g.e.tags.map(u => u.kind)))], edges: c.hs.map(g => ({ at: g.from.map(v => v / CLIP_SCALE), kinds: g.e.tags.map(u => u.kind).join('+'), twin: cycles[g.twin.cyc].face?.group ?? null })) })), at: at0(f), groups: [...gs], area: f.cycles.reduce((t, c) => t + cycArea(c), 0) / 2 / CLIP_SCALE / CLIP_SCALE,
        labels: [...new Set(f.cycles.flatMap(c => c.hs.flatMap(h => h.e.tags.filter(t => t.kind === 'ink').map(t => t.label))))].map(l => ({ l, owner: owners[l] ? `${owners[l].skelId}/${owners[l].side}/${owners[l].segOrd}` : null })) }) }
  }
  for (const c of cycles) c.group = c.face.group ?? null
  const print = `[${who}][absorb] the ink cut by its centrelines: ${census.cells} cell(s) · ${census.joined} joined ONE face (${census.toWater} the water) · ${census.zero.length} touch none · ${census.two.length} touch two · ${census.outside} beyond the frame · land faces with no ① label ${census.landUnnamed}${census.landTwoNames.length ? ` · ⛔ ${census.landTwoNames.length} land face(s) named by two faces' labels` : ''}`
  console.log(`    ${print}`)
  if (census.zero.length || census.two.length || census.landTwoNames.length) throw new Error(`${print} — ⛔ a cell must touch exactly one face: ${[...census.zero.map(a => 'none ' + a), ...census.two.map(a => 'two ' + a), ...census.landTwoNames.map(a => 'land ' + a)].slice(0, 8).join(' · ')}. Refusing.`)
  // ── 4. the splice: each face's boundary, read off the arrangement ──
  const groupOf = (h) => cycles[h.cyc].group
  const labelOf = (h) => {   // the label of the boundary edge h, the face on its LEFT
    const cl = h.e.tags.find(t => t.kind === 'cl')
    if (cl) { const C = centrelines[cl.rec], along = cl.along === h.fwd   // h runs the stroke's way: the face is on its left
      return along ? (C.ownL?.[cl.seg] ?? null) : (C.own?.[cl.seg] ?? null) }
    if (h.e.tags.some(t => t.kind === 'frame')) return frameOwner
    const ink = h.e.tags.find(t => t.kind === 'ink'); if (ink) return ink.label
    if (h.e.tags.some(t => t.kind === 'water')) return waterOwner
    return null }
  const bound = new Map()   // group → boundary half-edges
  for (const h of H) { const g = groupOf(h); if (g == null || g === 'none' || g === 'water' || groupOf(h.twin) === g) continue; (bound.get(g) || bound.set(g, []).get(g)).push(h) }
  let unlabelled = 0
  const paint = faces.map(() => null)
  for (const [g, hs] of bound) {
    const isB = (h) => groupOf(h) === g && groupOf(h.twin) !== g, seen = new Set(), rings = []
    for (const h0 of hs) { if (seen.has(h0)) continue
      const pts = [], labs = []
      for (let h = h0, guard = 0; !seen.has(h); ) { if (++guard > 1e7) throw new Error(`[${who}][absorb] ⛔ face ${g}'s boundary did not close. Refusing.`)
        seen.add(h); pts.push([h.from[0] / CLIP_SCALE, h.from[1] / CLIP_SCALE]); const l = labelOf(h); if (l == null) unlabelled++; labs.push(l)
        // rotate clockwise from h's twin at its head to the next boundary half-edge of this face
        const L = out.get(key(h.to)); let i = h.twin.at, nx = null
        for (let s = 1; s <= L.length; s++) { const c = L[(i - s + L.length) % L.length]; if (isB(c)) { nx = c; break } }
        if (!nx) throw new Error(`[${who}][absorb] ⛔ face ${g}'s boundary stops at (${h.to.map(v => v / CLIP_SCALE)}). Refusing.`)
        h = nx }
      rings.push({ pts, labs, a: area2(pts) }) }
    const outers = rings.filter(r => r.a > 0)
    if (outers.length !== 1) throw new Error(`[${who}][absorb] ⛔ face ${g} absorbs into ${outers.length} outer boundaries (want 1). Refusing.`)
    // the block convention (`blocks` wound as ①'s holes): the outer negative, a hole positive, labels rotated with a reversal
    const flip = (r) => { const p = [...r.pts].reverse(), l = [...r.labs].reverse(); l.push(l.shift()); return { p, l } }
    const o = flip(outers[0]), H2 = rings.filter(r => r.a < 0).map(flip)
    paint[g] = { outer: o.p, outerLabels: o.l, holes: H2.map(x => x.p), holeLabels: H2.map(x => x.l), winding: 'block' }
  }
  // ⭐ A FACE THAT BORDERS NO INK HAS NOTHING TO ABSORB: its painted face IS its face, exactly (an absorption with no cells is
  // the identity; Boz, 2026-10-25), named and counted. "Borders no ink" is exact: none of its labels is one of ①'s ink labels
  // (a bb corner between the water ring and the frame). ⛔ A face that DOES border ink and came out with no boundary still refuses.
  const inkLabel = new Set(inkLabels.flat().filter(l => l != null))
  let noInk = 0
  faces.forEach((f, k) => { if (!f || paint[k] || !f.ring?.length) return
    const ls = [...(f.labels || []), ...(f.holeLabels || []).flat()]
    if (ls.some(l => inkLabel.has(l))) return
    paint[k] = { outer: f.ring, outerLabels: [...f.labels], holes: (f.holes || []).map(h => h), holeLabels: (f.holeLabels || []).map(L => [...L]), winding: 'block' }; noInk++ })
  if (noInk) console.log(`    [${who}][absorb] ${noInk} face(s) border no ink — painted as themselves (nothing to absorb)`)
  const unpainted = faces.map((f, k) => f && !paint[k] ? k : null).filter(k => k != null)
  if (diag && unpainted.length) diag.unpainted = unpainted.map(k => ({ k, labels: [...new Set([...(faces[k].labels || []), ...(faces[k].holeLabels || []).flat()])].map(l => ({ l, owner: owners[l] ? `${owners[l].skelId}/${owners[l].side}/${owners[l].segOrd}` : null, faces: [...(facesOfLabel.get(l) || [])] })) }))
  if (unpainted.length) throw new Error(`[${who}][absorb] ⛔ ${unpainted.length} face(s) came out of the arrangement with no boundary (e.g. ${unpainted.slice(0, 6).join(', ')}). Refusing.`)
  if (unlabelled) throw new Error(`[${who}][absorb] ⛔ ${unlabelled} painted edge(s) carry no label — an edge whose owner the splice could not read. Refusing.`)
  // ── the cells the ground paints apart from the road: water and grade-separated owners ──
  const cells = []
  const ringOf = (c) => { const ring = []   // a cycle as a polygon: its spur antennas (an exact retrace) removed
    for (const h of c.hs) { const p = [h.from[0] / CLIP_SCALE, h.from[1] / CLIP_SCALE]
      if (ring.length >= 2 && ring[ring.length - 2][0] === p[0] && ring[ring.length - 2][1] === p[1]) ring.pop(); else ring.push(p) }
    while (ring.length >= 3 && ring[0][0] === ring[ring.length - 2][0] && ring[0][1] === ring[ring.length - 2][1]) { ring.pop(); ring.shift() }
    return ring.length >= 3 && area2(ring) !== 0 ? ring : null }
  // the three classes the ground paints apart: water (the shore) · a grade-separated HIGHWAY (left to H) · road. ⛔ A street's
  // own bridge is road (Boz, 2026-10-25): `hwy` is stamped by the mint on a highway's owners only, never `gradeSeparated`.
  const classOfLabel = (l) => owners[l]?.water ? 'water' : owners[l]?.hwy ? 'hwy' : 'road'
  const classOfH = (h) => { if (!h.e) return null; const ink = h.e.tags.find(t => t.kind === 'ink' && t.label != null); if (ink && !h.e.tags.some(t => t.kind === 'cl')) return classOfLabel(ink.label)
    const cl = h.e.tags.find(t => t.kind === 'cl'); if (cl) { const l = centrelines[cl.rec]?.own?.[cl.seg]; return l != null ? classOfLabel(l) : null }
    return null }
  // the stroke that owns an edge, for an annulus's owner pairs: an ink edge's label's street, a centreline edge's run's
  const ownOfH = (h) => { if (!h.e) return null; const cl = h.e.tags.find(t => t.kind === 'cl')
    if (cl) { const C = centrelines[cl.rec], r = C?.runs?.find(r => cl.seg >= r.from && cl.seg < r.to); return r?.skelId ?? null }
    const ink = h.e.tags.find(t => t.kind === 'ink' && t.label != null); return ink ? (owners[ink.label]?.skelId ?? null) : null }
  const inkLabelsOf = (hs) => [...new Set(hs.filter(h => h.e).flatMap(h => h.e.tags.filter(t => t.kind === 'ink' && t.label != null).map(t => t.label)))]
  // a PIECE of a cycle (a run of its half-edges, closed by a chord): its points are each edge's start AND the last edge's end,
  // where the chord back to the first begins. ⛔ The starts alone dropped that vertex, so a two-edge piece came out degenerate
  // and every split piece lost a corner at its chord (the probe, 2026-10-25).
  const pieceRing = (hs) => ringOf({ hs: [...hs, { from: hs[hs.length - 1].to }] })
  // a whole cell's record: its cycles as rings, `cycles[0]` its outer (the counter-clockwise cycle it was founded on)
  const cellOf = (f, labels) => { const R = f.cycles.map(ringOf), rings = R.filter(Boolean); return rings.length ? { rings, outer: !!R[0], labels, group: f.group, winding: 'left' } : null }
  for (const f of allFaces) { if (f.type !== 'cell' || f.group == null || f.group === 'none') continue
    const labels = [...new Set(f.cycles.flatMap(c => inkLabelsOf(c.hs)))]
    // kept: every cell the WATER absorbed (whoever's ink it was — a breakwater's water side is the water's), and every land cell
    // holding a water or highway owner (the shore, the highway's); a land cell of road alone is the tile's asphalt, not kept
    if (f.group === 'water') { const c = cellOf(f, labels); if (c) cells.push(c); continue }
    if (!labels.some(l => owners[l]?.water || owners[l]?.hwy)) continue
    const kinds = new Set(labels.map(classOfLabel))
    if (kinds.size === 1) { const c = cellOf(f, labels); if (c) cells.push(c); continue }
    // ⭐ A CELL AT A CROSSING WITH NO NODE (a grade separation, a street over the coast) has no outline point, so no spoke split it:
    // its boundary runs one class, then the other. It changes class at exactly TWO of its own vertices — where the centrelines
    // cross, and where the two strokes' ink edges meet — and the chord between them splits it, one piece per class: topology,
    // no new vertex, no search. ⛔ A cell that cannot be split so (an odd pairing, or a hole) REFUSES by name and place, as a
    // cell touching zero or two faces does (Boz, 2026-10-25: no precedence fallback).
    const hs = f.cycles.length === 1 ? f.cycles[0].hs : null
    let split = false
    if (hs) {
      const cls = hs.map(classOfH), n = hs.length
      for (let k = 0, last = null; k < 2 * n; k++) { const c = cls[k % n]; if (c != null) last = c; else if (last != null && k >= n) cls[k % n] = last }
      for (let k = 0, last = null; k < 2 * n; k++) { const c = cls[k % n]; if (c != null) last = c; else if (last != null) cls[k % n] = last }
      const T = []; for (let k = 0; k < n; k++) if (cls[k] != null && cls[(k - 1 + n) % n] != null && cls[k] !== cls[(k - 1 + n) % n]) T.push(k)
      // the transitions pair across the band: walking the cycle, its centreline side meets them in one order (X1, X2, …) and
      // its ink side in the reverse (…, c2, c1), so the j-th centreline-side transition faces the j-th from the END of the ink side
      const onCl = (k) => hs[k].e.tags.some(t => t.kind === 'cl'), X = T.filter(onCl), C = T.filter(k => !onCl(k))
      if (diag) f.splitWhy = { T: T.length, X: X.length, C: C.length }
      if (T.length >= 2 && X.length === C.length) {
        // rotate the ink-side list so it follows the centreline side in cycle order, then pair end to end
        const after = (k, from) => (k - from + n) % n, x0 = X[0]
        X.sort((p, q) => after(p, x0) - after(q, x0)); C.sort((p, q) => after(p, x0) - after(q, x0))
        const chords = X.map((x, q) => [x, C[C.length - 1 - q]])
        let pieces = [hs.map((_, k) => k)]
        for (const [a, b] of chords) { const P = pieces.find(p => p.includes(a) && p.includes(b)); if (!P) { pieces = null; break }
          const ia = P.indexOf(a), ib = P.indexOf(b), lo = Math.min(ia, ib), hi = Math.max(ia, ib)
          pieces.splice(pieces.indexOf(P), 1, P.slice(lo, hi), [...P.slice(hi), ...P.slice(0, lo)]) }
        const rings = pieces && pieces.map(P => pieceRing(P.map(k => hs[k])))
        if (diag) Object.assign(f.splitWhy, { chords: chords.map(c => c.join('-')), pieces: pieces ? pieces.map(P => P.length) : 'chord endpoints not in one piece', rings: rings ? rings.map(r => r ? r.length : 'degenerate') : null })
        if (rings && rings.every(Boolean)) { split = true
          pieces.forEach((P, q) => { const L = inkLabelsOf(P.map(k => hs[k])); if (L.some(l => owners[l]?.water || owners[l]?.hwy)) cells.push({ rings: [rings[q]], outer: true, labels: L, group: f.group, winding: 'left' }) }) }
      }
    }
    // an annulus (a cell round a face no spoke reached): split by its own class changes, paired by owner (splitAnnulus)
    if (!split && f.cycles.length === 2 && cycArea(f.cycles[0]) > 0 && cycArea(f.cycles[1]) < 0) {
      const A = splitAnnulus(f.cycles[0].hs, f.cycles[1].hs, classOfH, ownOfH)
      if (A.pieces) { const rings = A.pieces.map(pieceRing)
        if (rings.every(Boolean)) { split = true; census.annuli++
          A.pieces.forEach((P, q) => { const L = inkLabelsOf(P.filter(h => h.e)); if (L.some(l => owners[l]?.water || owners[l]?.hwy)) cells.push({ rings: [rings[q]], outer: true, labels: L, group: f.group, winding: 'left' }) }) } }
      else if (diag) f.splitWhy = { annulus: A.refused } }
    if (!split) { census.mixed.push(`${[...kinds].join('+')}@${at0(f)}`)
      if (diag) { const why = { at: at0(f), cycles: f.cycles.length, area: f.cycles.reduce((t, c) => t + cycArea(c), 0) / 2 / CLIP_SCALE / CLIP_SCALE }
        if (hs) { const n = hs.length, cl = hs.map(classOfH); why.n = n
          why.seq = []; for (let k = 0; k < n; k++) { const c = cl[k] ?? '·', side = hs[k].e.tags.some(t => t.kind === 'cl') ? 'cl' : hs[k].e.tags.some(t => t.kind === 'ink') ? 'ink' : hs[k].e.tags.map(t => t.kind).join('+'); const last = why.seq[why.seq.length - 1]
            if (last && last.c === c && last.side === side) last.n++; else why.seq.push({ c, side, n: 1 }) } }
        why.split = f.splitWhy || null
        why.rings = f.cycles.map((c, q) => { const L = [...new Set(c.hs.flatMap(h => h.e.tags.filter(t => t.kind === 'ink' && t.label != null).map(t => t.label)))]
          return { outer: q === 0, area: cycArea(c) / 2 / CLIP_SCALE / CLIP_SCALE, n: c.hs.length, bb: (() => { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const h of c.hs) a = [Math.min(a[0], h.from[0]), Math.min(a[1], h.from[1]), Math.max(a[2], h.from[0]), Math.max(a[3], h.from[1])]; return a.map(v => +(v / CLIP_SCALE).toFixed(3)) })(),
            kinds: [...new Set(c.hs.flatMap(h => h.e.tags.map(t => t.kind)))], classes: [...new Set(L.map(classOfLabel))],
            owners: [...new Set(L.map(l => owners[l] ? `${owners[l].skelId}/${owners[l].side}` : '?'))].slice(0, 6),
            across: [...new Set(c.hs.map(h => cycles[h.twin.cyc].face?.group ?? null))].slice(0, 6),
            touchesSpokeOrCl: c.hs.some(h => h.e.tags.some(t => t.kind === 'spoke' || t.kind === 'cl')) } })
        ;(diag.mixed ||= []).push(why) } }
  }
  if (census.annuli) console.log(`    [${who}][absorb] ${census.annuli} cell(s) round a face no spoke reached, split by their own class changes (paired by owner)`)
  if (census.mixed.length) throw new Error(`[${who}][absorb] ⛔ ${census.mixed.length} cell(s) hold two classes of owner and cannot be split at their class changes (an odd pairing, or a hole): ${census.mixed.slice(0, 8).join(' · ')}${census.mixed.length > 8 ? ' …' : ''}. Refusing.`)
  return { paint, cells, census }
}
