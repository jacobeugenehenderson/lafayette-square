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
