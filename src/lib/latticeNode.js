// latticeNode.js — THE PAINT'S NODING RULE: ONE HOME (moved out of cartograph/bake-ground.js, 2026-10-21). Two producers
// node with it: the bake's paint stack before the flatten (bake-ground.js) and the land evidence as it leaves the pour
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
