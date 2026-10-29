// latticeNode.js — THE PAINT'S NODING RULE AND ITS PINCH SPLIT: ONE HOME (moved out of cartograph/bake-ground.js, 2026-10-21).
// Two producers node and split with it: the bake's paint stack before the flatten (bake-ground.js) and the land evidence as it leaves the pour
// (cartograph/derive.js#layerLandEvidence: one partition, BRIEF from Boz 2026-10-21). One rule, one bound, never a copy.
import { CLIP_SCALE, LATTICE_M } from './lattice.js'

// one lattice step in Clipper's integer units
export const LATTICE_STEP = CLIP_SCALE * LATTICE_M

// ⭐ THE RINGS AGREE BEFORE FLATTEN (BRIEF-the-stamp-lands-on-the-lattice §3b). Two groups' rings can meet on the lattice
// without sharing their vertices: one carries a lattice vertex within the rounding of the other's straight edge, which
// does not carry it (a T-JUNCTION), and `layer − above` then emits a 3-vertex hole below the lattice that the flatten
// rightly refuses (LS face:recreation × mat:asphalt, HPDM face:recreation × face:industrial, 2026-10-20). So every vertex
// of one GROUP within NODE_BOUND of an edge of ANOTHER group, projecting strictly inside it, is inserted into that edge,
// both directions, to a fixpoint. ⛔ Cross-group only: a ring's own edges (a needle narrower than the bound would pinch),
// an outer and its own hole, and two rings of one group (`layerRegion` unions a group first) are never noded.
// The bound is the rounding's own: each axis rounds independently (`_ringToPath`, Clipper's crossings), so a rounded
// point lies up to √2/2 of a step off the line it traces. ⛔ A vertex further off is untouched and still refuses: this
// conforms rings, it never tolerates a hole. Inserted vertices are the other ring's own coordinates, never a projection.
// The count per group pair is printed: a large one says a producer is wrong.
// ▶ node checks/claims-the-paint-stack-flattens.mjs
export const NODE_BOUND = Math.SQRT1_2 * LATTICE_STEP
export function nodeAcrossGroups(entries, { bound = NODE_BOUND, maxRounds = 8, who = 'flatten' } = {}) {
  // every ring of the stack, its vertices in integer units: { g: entry index, p: [[x, z]…] metres, k: [[X, Y]…] }
  const ringsOf = (it) => Array.isArray(it) ? [it] : [it?.outer, ...(it?.holes || [])]
  const R = [], slots = entries.map((e, g) => e.items.map(it => ringsOf(it).map(r => {
    if (!r || r.length < 3) return -1
    for (const [x, z] of r) if (Math.abs(x * CLIP_SCALE - Math.round(x * CLIP_SCALE)) > 1e-6 || Math.abs(z * CLIP_SCALE - Math.round(z * CLIP_SCALE)) > 1e-6)
      throw new Error(`[${who}] ⛔ node: ${e.groupKey} carries (${x}, ${z}), off the lattice (1 / ${CLIP_SCALE} m) — every ring of the paint stack must already be on it. Refusing.`)
    R.push({ g, p: r.slice() }); return R.length - 1 })))
  const B2 = bound * bound, pairs = new Map()
  let total = 0, near = new Map()
  for (let round = 0; ; round++) {
    if (round === maxRounds) throw new Error(`[${who}] ⛔ node: the rings did not agree in ${maxRounds} rounds — an insertion keeps making another`)
    const K = R.map(r => r.p.map(([x, z]) => [Math.round(x * CLIP_SCALE), Math.round(z * CLIP_SCALE)]))
    // every edge in a grid of cells (cell = the median edge, never smaller than the extent shared over the edges), listed in
    // each cell its box widened by the bound touches; a vertex reads only its own cell
    const E = []; K.forEach((k, ri) => k.forEach((a, i) => { const b = k[(i + 1) % k.length]
      E.push([ri, i, Math.min(a[0], b[0]) - bound, Math.min(a[1], b[1]) - bound, Math.max(a[0], b[0]) + bound, Math.max(a[1], b[1]) + bound]) }))
    if (!E.length) break
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity
    for (const e of E) { if (e[2] < gx0) gx0 = e[2]; if (e[3] < gy0) gy0 = e[3]; if (e[4] > gx1) gx1 = e[4]; if (e[5] > gy1) gy1 = e[5] }
    const lens = E.map(e => Math.max(e[4] - e[2], e[5] - e[3])).sort((x, y) => x - y)
    const C = Math.max(lens[lens.length >> 1], Math.sqrt((gx1 - gx0 + 1) * (gy1 - gy0 + 1) / E.length)), NX = Math.floor((gx1 - gx0) / C) + 1
    const cells = new Map()
    E.forEach((e, n) => { for (let cx = Math.floor((e[2] - gx0) / C); cx <= Math.floor((e[4] - gx0) / C); cx++) for (let cy = Math.floor((e[3] - gy0) / C); cy <= Math.floor((e[5] - gy0) / C); cy++) {
      const c = cy * NX + cx; let l = cells.get(c); if (!l) cells.set(c, l = []); l.push(n) } })
    const has = K.map(k => new Set(k.map(([X, Y]) => X + ',' + Y))), best = new Map()
    near = new Map()
    K.forEach((k, vi) => k.forEach(([X, Y], v) => {
      const l = cells.get(Math.floor((Y - gy0) / C) * NX + Math.floor((X - gx0) / C)); if (!l) return
      for (const en of l) { const [ri, i] = E[en]
        if (R[ri].g === R[vi].g) continue
        const a = K[ri][i], b = K[ri][(i + 1) % K[ri].length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy
        if (!L2) continue
        const dot = (X - a[0]) * dx + (Y - a[1]) * dy, cr = (X - a[0]) * dy - (Y - a[1]) * dx
        if (dot <= 0 || dot >= L2 || cr * cr > B2 * L2) {                 // strictly inside the edge, within the bound
          // ⭐ PAST THE BOUND, WITHIN TWO ROUNDINGS: two rounded copies of one point lie up to 2·bound apart (√2 of a step), and
          // this rule never joins them — counted (the last round's) and printed so the class stays loud (at the rim it is BRIEF-the-rim-is-cut-once's B1 and B2 residues)
          if (!has[ri].has(X + ',' + Y)) { const t = Math.max(0, Math.min(1, dot / L2)), ex = X - a[0] - t * dx, ey = Y - a[1] - t * dy, d2 = ex * ex + ey * ey
            if (d2 && d2 <= 4 * B2) { const nk = ri + '|' + X + ',' + Y, was = near.get(nk); if (was === undefined || d2 < was) near.set(nk, d2) } }
          continue }
        // ⛔ A POINT ENTERS A RING ONCE. One the ring already carries is already shared, and a needle narrower than the bound
        // has two edges within it of one point: inserting there folds the ring (LS mat:alley, HPDM face:underived,
        // 2026-10-20), so the point goes into its NEAREST edge of that ring only
        const key = X + ',' + Y
        if (has[ri].has(key)) continue
        const d2 = cr * cr / L2, bk = ri + '|' + key, was = best.get(bk)
        if (!was || d2 < was.d2) best.set(bk, { ri, i, d2, p: R[vi].p[v], t: dot / L2, pk: entries[R[vi].g].groupKey + ' → ' + entries[R[ri].g].groupKey }) } }))
    if (!best.size) break
    total += best.size
    const add = R.map(r => r.p.map(() => null))
    for (const b of best.values()) { (add[b.ri][b.i] ||= []).push(b); pairs.set(b.pk, (pairs.get(b.pk) || 0) + 1) }
    R.forEach((r, ri) => { if (!add[ri].some(Boolean)) return
      const out = []
      r.p.forEach((q, i) => { out.push(q); if (add[ri][i]) for (const { p } of add[ri][i].sort((x, y) => x.t - y.t)) out.push(p) })
      r.p = out })
  }
  if (total) console.log(`  [${who}] node: ${total} vertex(es) inserted where two groups' rings meet without sharing a vertex — `
    + [...pairs].sort((x, y) => y[1] - x[1]).map(([k, c]) => `${k} ${c}`).join(' · '))
  const worst = Math.sqrt(Math.max(0, ...near.values())) / CLIP_SCALE * 1000
  if (near.size) console.log(`  [${who}] node: ${near.size} vertex(es) of one group past the bound of another's ring yet within two roundings of it, worst ${worst.toFixed(3)} mm — not joined (two rounded copies of one point, or a sliver past the rounding)`)
  const noded = entries.map((e, g) => ({ ...e, items: e.items.map((it, j) => {
    const rs = slots[g][j].map(s => s < 0 ? null : R[s].p)
    return Array.isArray(it) ? (rs[0] || it) : { ...it, outer: rs[0] || it.outer, holes: (it.holes || []).map((h, m) => rs[m + 1] || h) } }) }))
  noded.inserted = total; noded.pairs = Object.fromEntries(pairs); noded.pastBound = { vertices: near.size, worstMm: +worst.toFixed(4) }
  return noded
}

// ⭐⭐ THE CROSSINGS, NODED ONCE: SNAP ROUNDING BY HOT PIXELS (Hobby; Guibas–Marimont). Two producers mint crossings
// between rings that only overlap, and each used to round a crossing, insert it into both edges and test again, a loop
// that need not end on shallow crossings (PTown's land-use stamp, 2026-10-25: "did not settle in 8 rounds"). Here,
// in ONE pass and never re-intersected:
//   1. every proper crossing between two rings the caller lets meet (`pairs`) is computed ONCE from the INPUT segments
//      and rounded ONCE to the lattice; that one point goes to both segments;
//   2. the HOT PIXELS are those crossings plus every input vertex (already lattice points);
//   3. EVERY segment, of every ring and whatever its pair, is routed through each hot pixel whose half-open unit square
//      [X − ½, X + ½) × [Y − ½, Y + ½) it enters, in order along it. ⛔ Honouring is universal: a segment that skipped a hot
//      pixel another one takes could end up across it, at no hot pixel, and that is the crossing this exists to end.
// Then, only where the caller asks (`tjoin`, a crease cutter), the home's own T-junction rule (`nodeAcrossGroups`, above)
// as a second step. ⭐ The topology is PROVEN for step 3 on the square; it is also VERIFIED on every run: any proper
// crossing left between two rings that may meet, or an output vertex that is neither an input vertex nor a hot pixel, is a
// named refusal with the ring's tag and the coordinate, never a cap to raise. ⭐ EXACT AT ANY EXTENT (`crossOf`, below): the
// predicates in doubles under 2^24 units and in BigInt past it; the crossing POINT in BigInt always, ties half-up. ⛔ No
// extent bound: two fixed ones refused PTown in turn (2^25 absolute, 50 km out; 2^24 per segment, its 17.7 km frame side).
// `rings` [{ p: [[x, z]…] metres on the lattice, tag }], `pairs(a, b)` (ring indices) → may they cross. Returns per ring
// [{ p, k, src, edge }] (src = input vertex index, or null for an inserted point on input edge `edge`), plus `.counts`:
// insertions by "ringTag ← origin" (a crossing's two tags, or a vertex's tag), which the stamp's build log prints summed.
// the shared machinery of the noding and its verification: a grid over boxes, a segment's box, a proper crossing
// a grid over every segment (cell = the median segment, never smaller than the extent shared over the segments)
const grid = (items, box) => { const B = items.map(box)
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity
  for (const b of B) { gx0 = Math.min(gx0, b[0]); gy0 = Math.min(gy0, b[1]); gx1 = Math.max(gx1, b[2]); gy1 = Math.max(gy1, b[3]) }
  const lens = B.map(b => Math.max(b[2] - b[0], b[3] - b[1])).sort((x, y) => x - y)
  const C = Math.max(1, lens[lens.length >> 1] || 1, Math.sqrt((gx1 - gx0 + 1) * (gy1 - gy0 + 1) / Math.max(1, B.length))), NX = Math.floor((gx1 - gx0) / C) + 1
  const cells = new Map(), cellOf = (x, y) => Math.floor((y - gy0) / C) * NX + Math.floor((x - gx0) / C)
  B.forEach((b, n) => { for (let cx = Math.floor((b[0] - gx0) / C); cx <= Math.floor((b[2] - gx0) / C); cx++) for (let cy = Math.floor((b[1] - gy0) / C); cy <= Math.floor((b[3] - gy0) / C); cy++) {
    const c = cy * NX + cx; let l = cells.get(c); if (!l) cells.set(c, l = []); l.push(n) } })
  return { cells, cellOf, B, near: (x0, y0, x1, y1) => { const out = new Set()
    for (let cx = Math.floor((x0 - gx0) / C); cx <= Math.floor((x1 - gx0) / C); cx++) for (let cy = Math.floor((y0 - gy0) / C); cy <= Math.floor((y1 - gy0) / C); cy++) for (const n of cells.get(cy * NX + cx) || []) out.add(n)
    return out } } }
const sbox = (s) => [Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1])]
// ⭐ EXACT AT ANY EXTENT, ONE ROUNDING RULE (Zob's ruling, 2026-10-25). A PREDICATE (a sign) multiplies differences within
// one segment, or between two whose boxes overlap (< 2E), so under 2^24 units every product is under 2^51 and exact in
// doubles; past it the same predicate runs in BigInt (`small` decides, per call; `numberOnly` is the check's mutant; the
// same switch in `entersPixel` and `alongOf`, below). THE
// POINT is never a predicate: rx·tn is up to 4E³ and not exact in doubles at any extent we use, so it is computed in BigInt on
// EVERY crossing, rounded once, ties half-UP (⌊v + ½⌋), the rule that puts a tie inside its own half-open square.
const SMALL = 2 ** 24
const small = (...v) => v.every(x => Math.abs(x) < SMALL)
const sgnB = (v) => (v > 0n ? 1 : v < 0n ? -1 : 0)
const halfUp = (n, d) => { const q = 2n * n + d, e = 2n * d; return q >= 0n ? q / e : -((-q + e - 1n) / e) }   // ⌊n/d + ½⌋, d > 0
export const crossOf = (s, t, numberOnly = false) => {
  const rx = s.b[0] - s.a[0], ry = s.b[1] - s.a[1], sx = t.b[0] - t.a[0], sy = t.b[1] - t.a[1], ex = t.a[0] - s.a[0], ey = t.a[1] - s.a[1]
  // proper crossing ⇔ 0 < tn/den < 1 and 0 < un/den < 1 (the same test on both paths; zero is a literal of each)
  const inside = (v, d, z) => (d > z ? v > z && v < d : v < z && v > d)
  if (numberOnly || small(rx, ry, sx, sy, ex, ey)) { const den = rx * sy - ry * sx; if (!den) return null
    if (!inside(ex * sy - ey * sx, den, 0) || !inside(ex * ry - ey * rx, den, 0)) return null }
  const [Rx, Ry, Sx, Sy, Ex, Ey] = [rx, ry, sx, sy, ex, ey].map(BigInt)
  let D = Rx * Sy - Ry * Sx, T = Ex * Sy - Ey * Sx
  if (!(numberOnly || small(rx, ry, sx, sy, ex, ey))) { if (!D || !inside(T, D, 0n) || !inside(Ex * Ry - Ey * Rx, D, 0n)) return null }
  // the point: exact, once, half-up — a + r·tn/den, with den made positive
  if (D < 0n) { D = -D; T = -T }
  return [Number(halfUp(BigInt(s.a[0]) * D + Rx * T, D)), Number(halfUp(BigInt(s.a[1]) * D + Ry * T, D))] }
// does segment s ENTER hot pixel h's half-open square [X − ½, X + ½) × [Y − ½, Y + ½)? In doubled units (the square is
// [2X−1, 2X+1)), so integer endpoints are even and a segment can lie along no pixel edge: the box test, then the four
// corners' sides of the line, signs in doubles while every difference is under 2^24 and in BigInt past it.
// ⛔ A CORNER TOUCH (Zob, 2026-10-28; checks/fixtures/huron-close-self-noding-2026-10-28.json): a diagonal can pass EXACTLY
// through a corner (odd, odd), the midpoint of a unit diagonal step. When the line meets the square only there (one
// corner on it, the other three strictly on one side), the segment enters iff that corner is the square's OWN, the
// included (x0, y0), and lies on the segment. The other three are excluded: counting them routed a segment through two
// pixels it never enters, which made the antennas that collapsed a ring and left a crossing un-noded.
export const entersPixel = (s, h, numberOnly = false) => {
  const ax = 2 * s.a[0], ay = 2 * s.a[1], bx = 2 * s.b[0], by = 2 * s.b[1], x0 = 2 * h.X - 1, x1 = 2 * h.X + 1, y0 = 2 * h.Y - 1, y1 = 2 * h.Y + 1
  if (Math.max(ax, bx) < x0 || Math.min(ax, bx) >= x1 || Math.max(ay, by) < y0 || Math.min(ay, by) >= y1) return false
  const dx = bx - ax, dy = by - ay, f = numberOnly || small(dx, dy, x0 - ax, y0 - ay, x1 - ax, y1 - ay)
    ? (x, y) => Math.sign(dx * (y - ay) - dy * (x - ax))
    : (x, y) => sgnB(BigInt(dx) * BigInt(y - ay) - BigInt(dy) * BigInt(x - ax))
  const v = [f(x0, y0), f(x1, y0), f(x0, y1), f(x1, y1)]
  if (!(Math.min(...v) <= 0 && Math.max(...v) >= 0)) return false
  const zeros = v.filter(z => z === 0).length
  if (zeros === 1 && (Math.min(...v) === 0 || Math.max(...v) === 0)) {   // the line meets the square at one corner only
    if (v[0] !== 0) return false                                           // an excluded corner
    return Math.min(ax, bx) <= x0 && x0 <= Math.max(ax, bx) && Math.min(ay, by) <= y0 && y0 <= Math.max(ay, by)
  }
  return true }
// where hot pixel h falls along segment s: the projection's integer numerator (the common /|ab|² dropped), compared with
// < and > only, in doubles while the segment is under 2^24 units and in BigInt past it (one segment never mixes the two)
export const alongOf = (s, h, numberOnly = false) => { const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1]
  return numberOnly || small(2 * dx, 2 * dy) ? (h.X - s.a[0]) * dx + (h.Y - s.a[1]) * dy
    : BigInt(h.X - s.a[0]) * BigInt(dx) + BigInt(h.Y - s.a[1]) * BigInt(dy) }
// ⛔ THE VERIFICATION, run by nodeCrossings on every output and exported so a check can hand it a planted bad output: no
// proper crossing left between two rings that may meet, no vertex that is neither an input vertex nor a hot pixel, and no
// retrace (an antenna A,B,A).
// `K` the input rings' lattice points, `R` the output, `tags` per ring, `hot` the hot pixels ("X,Y" keys). Throws, by name.
export function verifyNoded(K, R, pairs, tags, who, hot, open = []) {
  const known = new Set(hot.keys())
  R.forEach((o, ri) => o.forEach((v, n) => { if (open[ri] && (n === 0 || n === o.length - 1)) return
    const u = o[(n - 1 + o.length) % o.length], w = o[(n + 1) % o.length]
    if (o.length >= 3 && u.k[0] === w.k[0] && u.k[1] === w.k[1]) throw new Error(`[${who}] ⛔ nodeCrossings: ${tags[ri]} retraces through (${v.k.map(c => c / CLIP_SCALE)}) and back to (${u.k.map(c => c / CLIP_SCALE)}) — an antenna. Refusing.`) }))
  R.forEach((o, ri) => o.forEach(v => { if (!known.has(v.k[0] + ',' + v.k[1])) throw new Error(`[${who}] ⛔ nodeCrossings: ${tags[ri]} carries (${v.k.map(c => c / CLIP_SCALE)}), neither an input vertex nor a hot pixel — an invented point. Refusing.`) }))
  const outSegs = []; R.forEach((o, ri) => o.forEach((v, n) => { if (open[ri] && n === o.length - 1) return; outSegs.push({ ri, a: v.k, b: o[(n + 1) % o.length].k }) }))
  const OG = grid(outSegs, sbox)
  for (const [c, l] of OG.cells) for (let u = 0; u < l.length; u++) for (let w = u + 1; w < l.length; w++) {
    const s = outSegs[l[u]], t = outSegs[l[w]]; if (s.ri === t.ri || !pairs(s.ri, t.ri)) continue
    const A = OG.B[l[u]], B = OG.B[l[w]]; if (A[0] > B[2] || B[0] > A[2] || A[1] > B[3] || B[1] > A[3]) continue
    if (OG.cellOf(Math.max(A[0], B[0]), Math.max(A[1], B[1])) !== c) continue
    const X = crossOf(s, t)
    if (X) throw new Error(`[${who}] ⛔ nodeCrossings: ${tags[s.ri]} and ${tags[t.ri]} still cross at (${X.map(v => v / CLIP_SCALE)}) after the noding — a hot pixel was not honoured. Refusing.`) }
}
// ⭐ AN INPUT MAY BE AN OPEN PATH (`{ p, tag, open: true }`, BRIEF-the-ink-is-owned-by-its-labels §3.1; Zob's read, Boz
// 2026-10-25): a centreline is a polyline, not a ring. It has no closing segment, its two ENDPOINTS are its own (never
// popped: the stack pass keeps the first of an A,B,A, and an open path skips the cyclic seam), and verifyNoded reads it
// the same way. A closed ring is the default and unchanged. ⛔ `tjoin` does not take open paths (its t-join rule nodes
// rings), and refuses rather than guess.
export function nodeCrossings(rings, { pairs, tjoin = false, who = 'stamp' } = {}) {
  if (typeof pairs !== 'function') throw new Error(`[${who}] ⛔ nodeCrossings: no \`pairs\` — which rings may cross is the caller's to say`)
  const open = rings.map(r => !!r.open)
  if (tjoin && open.some(Boolean)) throw new Error(`[${who}] ⛔ nodeCrossings: \`tjoin\` with an open path — the t-join rule nodes rings only. Refusing.`)
  const K = rings.map((r, ri) => (r.p || []).map(([x, z]) => {
    const X = Math.round(x * CLIP_SCALE), Y = Math.round(z * CLIP_SCALE)
    if (Math.abs(x * CLIP_SCALE - X) > 1e-6 || Math.abs(z * CLIP_SCALE - Y) > 1e-6) throw new Error(`[${who}] ⛔ (${x}, ${z}) of ${rings[ri].tag} is off the lattice (1 / ${CLIP_SCALE} m) — every ring the noding is given must already be on it. Refusing.`)
    return [X, Y] }))
  const segs = []; K.forEach((k, ri) => k.forEach((a, i) => { if (open[ri] && i === k.length - 1) return; segs.push({ ri, i, a, b: k[(i + 1) % k.length] }) }))
  const SG = grid(segs, sbox)
  // 1 + 2: the hot pixels. A crossing's point is computed once per pair and shared, so its two sides cannot round apart.
  const hot = new Map()                                     // "X,Y" → { X, Y, from: tag string }
  K.forEach((k, ri) => k.forEach(([X, Y]) => { const key = X + ',' + Y; if (!hot.has(key)) hot.set(key, { X, Y, from: rings[ri].tag }) }))
  let crossings = 0
  for (const [c, l] of SG.cells) for (let u = 0; u < l.length; u++) for (let w = u + 1; w < l.length; w++) {
    const s = segs[l[u]], t = segs[l[w]]; if (s.ri === t.ri || !pairs(s.ri, t.ri)) continue
    const A = SG.B[l[u]], B = SG.B[l[w]]; if (A[0] > B[2] || B[0] > A[2] || A[1] > B[3] || B[1] > A[3]) continue
    if (SG.cellOf(Math.max(A[0], B[0]), Math.max(A[1], B[1])) !== c) continue          // each pair once, in its first shared cell
    const X = crossOf(s, t); if (!X) continue
    crossings++; const key = X[0] + ',' + X[1]
    if (!hot.has(key)) hot.set(key, { X: X[0], Y: X[1], from: `${rings[s.ri].tag}×${rings[t.ri].tag}` }) }
  // 3: route every segment through every hot pixel whose half-open square it enters (doubled units: the square is
  // [2X−1, 2X+1) on each axis; integer endpoints are even, so a segment can lie along no pixel edge)
  const H = [...hot.values()], HG = grid(H, h => [h.X, h.Y, h.X, h.Y])
  const counts = {}, out = K.map(() => [])
  segs.forEach(s => { const { ri, i, a, b } = s, o = out[ri]
    o.push({ p: [a[0] / CLIP_SCALE, a[1] / CLIP_SCALE], k: a, src: i, edge: i })
    const via = [...HG.near(Math.min(a[0], b[0]) - 1, Math.min(a[1], b[1]) - 1, Math.max(a[0], b[0]) + 1, Math.max(a[1], b[1]) + 1)]
      .map(n => H[n]).filter(h => !(h.X === a[0] && h.Y === a[1]) && !(h.X === b[0] && h.Y === b[1]) && entersPixel(s, h))
      .map(h => ({ h, t: alongOf(s, h) })).sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : 0))
    for (const { h } of via) { o.push({ p: [h.X / CLIP_SCALE, h.Y / CLIP_SCALE], k: [h.X, h.Y], src: null, edge: i })
      const ck = `${rings[ri].tag} ← ${h.from}`; counts[ck] = (counts[ck] || 0) + 1 } })
  // an open path's last vertex starts no segment: it closes the path
  K.forEach((k, ri) => { if (open[ri] && k.length) { const a = k[k.length - 1]; out[ri].push({ p: [a[0] / CLIP_SCALE, a[1] / CLIP_SCALE], k: a, src: k.length - 1, edge: k.length - 1 }) } })
  // consecutive duplicates collapse, then the ANTENNAS: routing a ring through its own vertices' pixels turns a reversal
  // within a pixel into a retrace A,B,A (HPDM tile 144, 2026-10-25: a 2 mm zigzag became A,B,A,B). A retrace encloses no
  // area and decides nothing, so it is removed here, the last step of snap rounding (Zob's rules, Boz's ruling): one stack
  // pass, then the cyclic seam; only an EXACT lattice retrace k[i−1] = k[i+1], never a near one, and never a self-touch
  // (A…loop…A keeps its area). The survivor sits at A with the SECOND A's outgoing edge (the label names the edge leaving
  // its vertex) and whichever A's `src`, the first's if both (the second's then dropped). Every input vertex the collapse
  // drops is reported (`R.dropped`), and a survivor whose `src` came from the first A with the second's edge
  // (`R.relabelled`: { src, edge }), so the caller checks its own flags against them; nothing there decides geometry.
  const dropped = K.map(() => []), relabelled = K.map(() => [])
  let R = out.map((o, ri) => { const d = o.filter((v, n) => { if (open[ri] && n === o.length - 1) return true; const w = o[(n + 1) % o.length]; return o.length < 2 || !(v.k[0] === w.k[0] && v.k[1] === w.k[1]) })
    const same = (u, w) => u.k[0] === w.k[0] && u.k[1] === w.k[1]
    const merge = (a1, a2) => { if (a1.src == null) return a2
      if (a2.src != null && a2.src !== a1.src) dropped[ri].push(a2.src)
      relabelled[ri].push({ src: a1.src, edge: a2.edge }); return { ...a2, src: a1.src } }
    const pop = (b) => { if (b.src != null) dropped[ri].push(b.src); const ck = `${rings[ri].tag} ✂ antenna`; counts[ck] = (counts[ck] || 0) + 1 }
    // ⭐ AN OPEN PATH KEEPS ITS EXTENT: a retrace AT AN END (A, B, A with A the endpoint) drops the ENDPOINT — the return —
    // so the path still reaches B (an out-and-back keeps its far end); an interior retrace is removed as on a ring
    const trimEnds = (q) => { if (!open[ri]) return q
      while (q.length >= 3 && same(q[0], q[2])) { const e = q.shift(); if (e.src != null) dropped[ri].push(e.src) }
      while (q.length >= 3 && same(q[q.length - 1], q[q.length - 3])) { const e = q.pop(); if (e.src != null) dropped[ri].push(e.src) }
      return q }
    const c = []
    for (const v of trimEnds(d)) { if (c.length >= 2 && same(c[c.length - 2], v)) { pop(c.pop()); c.push(merge(c.pop(), v)) } else c.push(v) }
    trimEnds(c)
    for (let n = c.length; !open[ri] && n >= 3; n = c.length) {       // the seam: …A1, B | A2… or …A1 | B, A2… (a ring only)
      if (same(c[n - 2], c[0])) { pop(c.pop()); c[0] = merge(c.pop(), c[0]) }
      else if (same(c[n - 1], c[1])) { pop(c.shift()); c[0] = merge(c.pop(), c[0]) }
      else if (same(c[n - 1], c[0])) c.pop()
      else break }
    if (new Set(c.map(v => v.k.join(','))).size < (open[ri] ? 2 : 3)) throw new Error(`[${who}] ⛔ nodeCrossings: ${rings[ri].tag} at (${K[ri][0]?.map(v => v / CLIP_SCALE)}) collapsed under ${open[ri] ? 'two distinct points (an open path)' : 'three distinct points'} when routed through its hot pixels. Refusing.`)
    return c })
  if (tjoin) {
    // ⭐ the home's own T-junction rule, as a SECOND step: an existing vertex within NODE_BOUND of another ring's edge enters
    // it. One ring per group, so `nodeAcrossGroups` nodes across every pair of rings; the caller's `pairs` then keeps only the
    // insertions between rings that may meet (a vertex nodeAcrossGroups added to a ring that may not meet its owner is dropped).
    const N = nodeAcrossGroups(R.map((o, ri) => ({ groupKey: `${rings[ri].tag}#${ri}`, items: [o.map(v => v.p)] })), { who: `${who} t-join` })
    R = R.map((o, ri) => { const pts = N[ri].items[0], next = []; let m = 0
      for (const p of pts) { const k = [Math.round(p[0] * CLIP_SCALE), Math.round(p[1] * CLIP_SCALE)]
        if (m < o.length && o[m].k[0] === k[0] && o[m].k[1] === k[1]) { next.push(o[m]); m++; continue }
        const owner = K.findIndex((kk, rj) => rj !== ri && kk.some(q => q[0] === k[0] && q[1] === k[1]))
        if (owner >= 0 && !pairs(ri, owner)) continue
        next.push({ p, k, src: null, edge: o[Math.max(0, m - 1)].edge }); const ck = `${rings[ri].tag} ← t-join`; counts[ck] = (counts[ck] || 0) + 1 }
      return next })
  }
  verifyNoded(K, R, pairs, rings.map(r => r.tag), who, hot, open)
  R.counts = counts; R.crossings = crossings; R.dropped = dropped; R.relabelled = relabelled
  return R
}

// a ring of [x, z] metres ↔ its lattice points ({ X, Y } in Clipper units): what the pinch search and the split read
const ringToPath = (ring) => ring.map(([x, z]) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(z * CLIP_SCALE) }))
const pathToRing = (path) => path.map(pt => [pt.X / CLIP_SCALE, pt.Y / CLIP_SCALE])
// the winding number of (x, y) about a ring of lattice points
export const windingOf = (q, x, y) => {
  let w = 0
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const a = q[j], b = q[i]
    const c = (b.X - a.X) * (y - a.Y) - (x - a.X) * (b.Y - a.Y)
    if (a.Y <= y) { if (b.Y > y && c > 0) w++ } else if (b.Y <= y && c < 0) w-- }
  return w
}

// A ring's pinches below the lattice, on Clipper's integer path: each vertex j within `bound` of another of its own edges i
// (not one it ends), projecting strictly inside it — [j, i] for the vertex's nearest such edge. `first`: stop at the first.
export function pinchesOfRing(q, bound, first = false) {
  const n = q.length, B2 = bound * bound, found = []
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const v of q) { if (v.X < x0) x0 = v.X; if (v.X > x1) x1 = v.X; if (v.Y < y0) y0 = v.Y; if (v.Y > y1) y1 = v.Y }
  const C = Math.max(1, Math.sqrt((x1 - x0 + 1) * (y1 - y0 + 1) / n)), NX = Math.floor((x1 - x0 + 2 * bound) / C) + 1, cells = new Map()
  for (let i = 0; i < n; i++) { const a = q[i], b = q[(i + 1) % n]
    for (let cx = Math.floor((Math.min(a.X, b.X) - x0) / C); cx <= Math.floor((Math.max(a.X, b.X) + 2 * bound - x0) / C); cx++)
      for (let cy = Math.floor((Math.min(a.Y, b.Y) - y0) / C); cy <= Math.floor((Math.max(a.Y, b.Y) + 2 * bound - y0) / C); cy++) {
        const c = cy * NX + cx; let l = cells.get(c); if (!l) cells.set(c, l = []); l.push(i) } }
  for (let j = 0; j < n; j++) { const P = q[j], l = cells.get(Math.floor((P.Y - y0 + bound) / C) * NX + Math.floor((P.X - x0 + bound) / C)); if (!l) continue
    let best = null
    for (const i of l) { if (i === j || (i + 1) % n === j) continue
      const a = q[i], b = q[(i + 1) % n]
      if ((a.X === P.X && a.Y === P.Y) || (b.X === P.X && b.Y === P.Y)) continue
      const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy; if (!L2) continue
      const dot = (P.X - a.X) * dx + (P.Y - a.Y) * dy, cr = (P.X - a.X) * dy - (P.Y - a.Y) * dx
      if (dot <= 0 || dot >= L2 || cr * cr > B2 * L2) continue
      if (!best || cr * cr / L2 < best.d2) best = { i, d2: cr * cr / L2 } }
    if (best) { found.push([j, best.i, best.d2]); if (first) break } }
  return found
}

// ⭐ A RING THAT PINCHES BELOW THE LATTICE IS SPLIT THERE (Boz, 2026-10-21). The flatten's own differences can emit a ring
// that comes within the rounding of ITSELF: one of its vertices within NODE_BOUND of another of its edges, projecting
// strictly inside it — a needle narrower than the bound (LS treelawn:commercial, 82.5 m), or a neck where the ring runs
// out and back past its own vertex (LS asphalt at (128.902, 426.562), 0.05 mm). The noding cannot conform such a ring:
// the point is already the ring's, and inserting it again folds it (`nodeAcrossGroups`, a point enters a ring once), so
// its neighbour's edge stays unmatched. The noding can make one: a vertex it inserts into one side of a needle
// (`nodeThePlane` cuts after it nodes). So the ring is cut at the pinch into the two loops it already is, and a loop
// thinner than one lattice step (mean width 2·area / perimeter, the bow-tie's own measure) is DROPPED — a part below the
// grid is not drawable — COUNTED and stamped with its area, a point, its width and which ring it came `from`
// (ground.json#flatten.subLattice[group].pinches): off an outer it is paint removed, off a hole it is paint filled. A loop
// at or above the step is kept, and searched again. A kept loop that winds against its ring (a hole joined to its outer
// below the lattice) becomes a hole of the outer loop holding it, or an island of a hole becomes an outer; with one outer
// loop every hole is its; with several, one that nothing holds THROWS.
// ▶ node checks/claims-the-paint-stack-flattens.mjs --selftest
export function splitAtPinches(items, groupKey, subLattice, { bound = NODE_BOUND, who = 'flatten' } = {}) {
  const B2 = bound * bound, dropped = []
  let revisits = 0
  const areaOf = (q) => { let a = 0; for (let i = 0, j = q.length - 1; i < q.length; j = i++) a += q[j].X * q[i].Y - q[i].X * q[j].Y; return a / 2 }
  const perimOf = (q) => q.reduce((t, a, i) => t + Math.hypot(q[(i + 1) % q.length].X - a.X, q[(i + 1) % q.length].Y - a.Y), 0)
  // ⭐ TWO KINDS (Zob's pinch row, 2026-10-21): a NECK, a vertex within the bound of one of its ring's own edges
  // (`pinchesOfRing`), and a REVISIT, the ring touching itself at one exact lattice point, two lobes joined there (the kind
  // Clipper emits): the same point twice, non-consecutively. A revisit is cut there into its two lobes, by the same rule.
  const revisitOf = (q) => { const seen = new Map(), n = q.length
    for (let i = 0; i < n; i++) { const s = q[i].X + ',' + q[i].Y, j = seen.get(s)
      if (j !== undefined && j !== (i - 1 + n) % n) return [j, i]
      seen.set(s, i) }
    return null }
  const pinchOf = (q) => { const r = revisitOf(q); if (r) return { kind: 'revisit', j: r[0], i: r[1] }
    const h = pinchesOfRing(q, bound, true)[0]; return h ? { kind: 'neck', j: h[0], i: h[1] } : null }
  // a ring → its loops at or above the step (each with the ring's sign or against it); the thinner ones dropped and recorded
  const loopsOf = (ring, from) => {
    const todo = [ring], kept = [], n0 = ring.length
    let cuts = 0
    while (todo.length) {
      const q = todo.pop(), hit = pinchOf(q)
      if (!hit) { kept.push(q); continue }
      if (++cuts > n0) throw new Error(`[${who}] ${groupKey}: a ring of ${n0} vertices at (${ring[0].X / CLIP_SCALE}, ${ring[0].Y / CLIP_SCALE}) was cut at more pinches than it has vertices — refusing`)
      const { kind, j, i } = hit, n = q.length, P = q[j], walk = (from, to) => { const o = [P]; for (let k = from; k !== to; k = (k + 1) % n) o.push(q[k]); return o }
      // a neck — q[i] → P → q[i+1] … q[j] = P … q[i]: the loop P, q[i+1] … q[j-1] and the loop P, q[j+1] … q[i]
      // a revisit — q[j] = q[i] = P: the lobe P, q[j+1] … q[i-1] and the lobe P, q[i+1] … q[j-1]
      const halves = kind === 'revisit' ? [walk((j + 1) % n, i), walk((i + 1) % n, j)] : [walk((i + 1) % n, j), walk((j + 1) % n, (i + 1) % n)]
      if (kind === 'revisit') revisits++
      const loops = halves.map(loop => {
        const A = areaOf(loop), w = loop.length < 3 || !A ? 0 : 2 * Math.abs(A) / perimOf(loop)
        return { loop, A, w, keep: w >= LATTICE_STEP } })
      for (const { loop, A, w, keep } of loops) if (!keep)
        dropped.push({ from, m2: +(Math.abs(A) / (CLIP_SCALE * CLIP_SCALE)).toFixed(9), at: [P.X / CLIP_SCALE, P.Y / CLIP_SCALE], widthMm: +(w / CLIP_SCALE * 1000).toFixed(4) })
      // ⭐ A DROPPED LOOP'S VERTICES STAY ON THE BOUNDARY: a needle's far side can carry a neighbour's vertex (the noding put it
      // in its nearest edge), and the kept loop's edge runs within the bound of it — so each goes into the kept loop's
      // nearest edge it projects strictly inside, unless the kept loop carries it already. Otherwise the cut would undo the
      // noding there (LS mat:curb against treelawn:recreation, 25 m)
      const kept2 = loops.filter(l => l.keep)
      if (kept2.length === 1) { const k = kept2[0].loop, on = new Set(k.map(v => v.X + ',' + v.Y)), add = k.map(() => [])
        for (const l of loops) if (!l.keep) for (const V of l.loop) { if (on.has(V.X + ',' + V.Y)) continue
          let best = null
          for (let e = 0; e < k.length; e++) { const a = k[e], b = k[(e + 1) % k.length], dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy; if (!L2) continue
            const dot = (V.X - a.X) * dx + (V.Y - a.Y) * dy, cr = (V.X - a.X) * dy - (V.Y - a.Y) * dx
            if (dot <= 0 || dot >= L2 || cr * cr > B2 * L2) continue
            if (!best || cr * cr / L2 < best.d2) best = { e, d2: cr * cr / L2, t: dot / L2 } }
          if (best) { add[best.e].push({ V, t: best.t }); on.add(V.X + ',' + V.Y) } }
        if (add.some(x => x.length)) kept2[0].loop = k.flatMap((v, e) => [v, ...add[e].sort((p, r) => p.t - r.t).map(x => x.V)]) }
      for (const l of kept2) todo.push(l.loop) }
    return kept
  }
  const inside = (outer, hole) => {
    const on = new Set(outer.map(v => v.X + ',' + v.Y)), v = hole.find(v => !on.has(v.X + ',' + v.Y))
    if (!v) throw new Error(`[${who}] ${groupKey}: a loop split at a pinch has every vertex on another loop's ring, at (${hole[0].X / CLIP_SCALE}, ${hole[0].Y / CLIP_SCALE}) — refusing`)
    return windingOf(outer, v.X, v.Y) !== 0
  }
  const out = []
  for (const it of items) {
    // a ribbon band's item is a bare ring (`toPolys` reads both); a ring too short to bound anything has no pinch
    const src = Array.isArray(it) ? { outer: it, holes: [] } : it
    if (!src?.outer || src.outer.length < 3) { out.push(it); continue }
    const o = ringToPath(src.outer), s = Math.sign(areaOf(o)), was = dropped.length
    const outers = [], holes = []
    for (const q of loopsOf(o, 'outer')) (Math.sign(areaOf(q)) === s ? outers : holes).push(q)
    for (const h of src.holes || []) if (h?.length >= 3) for (const q of loopsOf(ringToPath(h), 'hole')) (Math.sign(areaOf(q)) === s ? outers : holes).push(q)
    if (outers.length === 1 && holes.length === (src.holes || []).filter(h => h?.length >= 3).length && dropped.length === was) { out.push(it); continue }
    const bySize = outers.map(q => ({ q, a: Math.abs(areaOf(q)), holes: [] })).sort((p, r) => p.a - r.a)
    // ⭐ ONE OUTER LOOP HOLDS EVERY HOLE: the item's own holes and any cut loop that winds against it. Only when the cut leaves
    // several outers is a hole placed by a point of it — and a hole that touches its outer at every vertex has none to offer
    // (HPDM mat:curb at (323.74, 1111.476), 2026-10-21: a 0.41 mm hole the flatten emitted along its own outer, sent here
    // because the item's other holes were needles the cut dropped)
    // ⭐ NO OUTER LOOP LEFT: the item was below the lattice whole (every loop of its outer thinner than a step, so all dropped),
    // and its holes go with it — a hole whose outer is gone removes no paint, the flatten's own orphan rule — COUNTED as
    // `from: 'orphan'`, neither paint removed nor filled (LS mat:treelawn:underived at (124.008, -252.635), 2026-10-21: a
    // 0.000106 m² outer with a 0.000042 m² hole on it). Where outers remain and none holds a hole, it still THROWS.
    if (!bySize.length) { for (const h of holes) dropped.push({ from: 'orphan', m2: +(Math.abs(areaOf(h)) / (CLIP_SCALE * CLIP_SCALE)).toFixed(9), at: [h[0].X / CLIP_SCALE, h[0].Y / CLIP_SCALE], widthMm: +(2 * Math.abs(areaOf(h)) / perimOf(h) / CLIP_SCALE * 1000).toFixed(4) }); continue }
    for (const h of holes) { const o2 = bySize.length === 1 ? bySize[0] : bySize.find(o2 => o2.a > Math.abs(areaOf(h)) && inside(o2.q, h))
      if (!o2) throw new Error(`[${who}] ${groupKey}: a hole loop split at a pinch that no outer loop holds, at (${h[0].X / CLIP_SCALE}, ${h[0].Y / CLIP_SCALE}) — refusing`)
      o2.holes.push(h) }
    for (const o2 of bySize) out.push({ ...src, outer: pathToRing(o2.q), holes: o2.holes.map(pathToRing) })
  }
  if (revisits) { const rec = (subLattice[groupKey] ||= { rings: 0, m2: 0 }); rec.revisits = (rec.revisits || 0) + revisits
    console.log(`  [${who}] ${groupKey}: ${revisits} revisit(s) cut into their lobes (a ring touching itself at one lattice point)`) }
  if (dropped.length) { const rec = (subLattice[groupKey] ||= { rings: 0, m2: 0 }); rec.pinches = [...(rec.pinches || []), ...dropped]
    console.log(`  [${who}] ${groupKey}: ${dropped.length} loop(s) below the lattice cut off at a pinch (${dropped.filter(r => r.from === 'outer').length} off an outer, paint removed · ${dropped.filter(r => r.from === 'hole').length} off a hole, paint filled · ${dropped.filter(r => r.from === 'orphan').length} hole(s) of an item dropped whole), ${dropped.reduce((t, r) => t + r.m2, 0).toFixed(9)} m², widest ${Math.max(...dropped.map(r => r.widthMm)).toFixed(4)} mm`) }
  return out
}
