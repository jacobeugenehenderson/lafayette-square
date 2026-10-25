// ⛔ FROZEN — NOT A LIVE RULE. tileGround.js#stampCrossings verbatim as of 9764b474, the round-then-retest noding the stamp
// used until latticeNode.js#nodeCrossings replaced it (2026-10-25). Kept ONLY as the mutant of
// checks/claims-the-crossings-are-noded-once.mjs: the PTown capture must still make it refuse ("did not settle"), so the
// fixture keeps proving the class the new rule ends. Never import this from src/.
import { CLIP_SCALE as SCALE } from "../../src/lib/lattice.js"
// The lattice key of a point the stamp is given. ⛔ Off the lattice is REFUSED, never rounded here: the contour is rounded
// once where it is born (`onLattice`) and the evidence is poured on a coarser grid, so an off-lattice input is a ring that
// skipped its rounding.
const _lk = (p) => { const k = [Math.round(p[0] * SCALE), Math.round(p[1] * SCALE)]
  if (Math.abs(p[0] * SCALE - k[0]) > 1e-6 || Math.abs(p[1] * SCALE - k[1]) > 1e-6) throw new Error(`[tileGround][stamp] ⛔ (${p}) is off the lattice (1 / ${SCALE} m) — every ring the stamp nodes must already be on it. Refusing.`)
  return k }
function stampCrossings(rings, skip, maxRounds = 8) {
  // each vertex keeps its own coordinates (src = its index in the input ring) or is a crossing (src = null) on input edge `edge`
  let R = rings.map(r => r.map((p, i) => ({ p, k: _lk(p), src: i, edge: i })))
  for (let round = 0; round < maxRounds; round++) {
    const add = R.map(r => r.map(() => []))
    let n = 0
    const inside = (v, d) => d > 0 ? (v > 0 && v < d) : (v < 0 && v > d)
    const onEdge = (P, s0, s1) => (s1[0] - s0[0]) * (P[1] - s0[1]) - (s1[1] - s0[1]) * (P[0] - s0[0]) === 0
      && Math.min(s0[0], s1[0]) <= P[0] && P[0] <= Math.max(s0[0], s1[0]) && Math.min(s0[1], s1[1]) <= P[1] && P[1] <= Math.max(s0[1], s1[1])
      && !(P[0] === s0[0] && P[1] === s0[1]) && !(P[0] === s1[0] && P[1] === s1[1])
    // candidate pairs through one grid of every edge (cell = the median edge, never smaller than the extent shared over the
    // edges): each pair of edges from two different rings is tested once, in the first cell they share
    const E = []; R.forEach((r, i) => r.forEach((v, p) => { const w = r[(p + 1) % r.length].k; E.push([i, p, Math.min(v.k[0], w[0]), Math.min(v.k[1], w[1]), Math.max(v.k[0], w[0]), Math.max(v.k[1], w[1])]) }))
    if (!E.length) return R
    const lens = E.map(e => Math.max(e[4] - e[2], e[5] - e[3])).sort((x, y) => x - y)
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity; for (const e of E) { gx0 = Math.min(gx0, e[2]); gy0 = Math.min(gy0, e[3]); gx1 = Math.max(gx1, e[4]); gy1 = Math.max(gy1, e[5]) }
    const C = Math.max(1, lens[lens.length >> 1], Math.sqrt((gx1 - gx0 + 1) * (gy1 - gy0 + 1) / E.length))
    const NX = Math.floor((gx1 - gx0) / C) + 1, cells = new Map()
    E.forEach((e, n2) => { for (let cx = Math.floor((e[2] - gx0) / C); cx <= Math.floor((e[4] - gx0) / C); cx++) for (let cy = Math.floor((e[3] - gy0) / C); cy <= Math.floor((e[5] - gy0) / C); cy++) {
      const c = cy * NX + cx; let l = cells.get(c); if (!l) cells.set(c, l = []); l.push(n2) } })
    const cellOf = (x, y) => Math.floor((y - gy0) / C) * NX + Math.floor((x - gx0) / C)
    for (const [c, l] of cells) for (let u = 0; u < l.length; u++) for (let w = u + 1; w < l.length; w++) {
      const eA = E[l[u]], eB = E[l[w]], i = eA[0], j = eB[0]
      if (i === j || skip(Math.min(i, j), Math.max(i, j))) continue
      if (eA[2] > eB[4] || eB[2] > eA[4] || eA[3] > eB[5] || eB[3] > eA[5]) continue
      // test the pair only in the first cell both boxes share (the lower-left of their overlap), so it counts once
      if (cellOf(Math.max(eA[2], eB[2]), Math.max(eA[3], eB[3])) !== c) continue
      const p = eA[1], q = eB[1], A = R[i], B = R[j]
      const a0 = A[p].k, a1 = A[(p + 1) % A.length].k, b0 = B[q].k, b1 = B[(q + 1) % B.length].k
      const rx = a1[0] - a0[0], ry = a1[1] - a0[1], sx = b1[0] - b0[0], sy = b1[1] - b0[1], den = rx * sy - ry * sx
      if (den !== 0) { const ex = b0[0] - a0[0], ey = b0[1] - a0[1], tn = ex * sy - ey * sx, un = ex * ry - ey * rx
        if (inside(tn, den) && inside(un, den)) { const X = Math.round(a0[0] + rx * tn / den), Y = Math.round(a0[1] + ry * tn / den)
          add[i][p].push([X, Y]); add[j][q].push([X, Y]); n++ } }
      if (onEdge(b0, a0, a1)) { add[i][p].push(b0); n++ }
      if (onEdge(a0, b0, b1)) { add[j][q].push(a0); n++ }
    }
    if (!n) return R
    R = R.map((r, i) => { const out = []
      for (let p = 0; p < r.length; p++) { const v0 = r[p], a0 = v0.k, a1 = r[(p + 1) % r.length].k; out.push(v0)
        const dx = a1[0] - a0[0], dy = a1[1] - a0[1], L2 = dx * dx + dy * dy, seen = new Set([a0.join(','), a1.join(',')])
        const pts = add[i][p].filter(v => { const s = v.join(','); if (seen.has(s)) return false; seen.add(s); return true })
          .map(v => ({ v, t: ((v[0] - a0[0]) * dx + (v[1] - a0[1]) * dy) / L2 })).sort((x, y) => x.t - y.t)
        for (const { v } of pts) out.push({ p: [v[0] / SCALE, v[1] / SCALE], k: v, src: null, edge: v0.src != null ? v0.src : v0.edge }) }
      return out })
  }
  throw new Error(`[tileGround][stamp] ⛔ the crossing pass did not settle in ${maxRounds} rounds — a crossing keeps making another (${rings.length} rings)`)
}
export { stampCrossings }
