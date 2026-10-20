// crossings-once.mjs — THE CROSSING PASS, standalone for its test (it moves into tileGround as `stampTile`'s first step):
// every proper crossing between edges of DIFFERENT rings is computed ONCE from its two known segments, rounded to the
// lattice once, and written into BOTH rings at the edges that made it; a vertex of one ring lying exactly on another's
// edge (integer test) is written into that edge. Repeated until no new crossing appears (a rounded point can make one
// more; bounded, and REFUSED loudly if it does not settle). No search radius, no tolerance: positions come from which
// segments made them. Rings are lattice integers ([X, Y]); `skip(i, j)` excludes ring pairs (iaFull × iA: the disc cut).
export function crossingsOnce(rings, skip = () => false, maxRounds = 8) {
  const R = rings.map(r => r.map(p => [p[0], p[1]]))
  for (let round = 0; round < maxRounds; round++) {
    const add = R.map(r => r.map(() => []))            // add[ri][edge] = points to insert into that edge
    let n = 0
    const bb = R.map(r => { let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, y] of r) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y } return b })
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      if (skip(i, j)) continue
      const a = bb[i], b = bb[j]; if (a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]) continue
      const A = R[i], B = R[j]
      for (let p = 0; p < A.length; p++) { const a0 = A[p], a1 = A[(p + 1) % A.length]
        for (let q = 0; q < B.length; q++) { const b0 = B[q], b1 = B[(q + 1) % B.length]
          const rx = a1[0] - a0[0], ry = a1[1] - a0[1], sx = b1[0] - b0[0], sy = b1[1] - b0[1], den = rx * sy - ry * sx
          const ex = b0[0] - a0[0], ey = b0[1] - a0[1]
          if (den !== 0) {
            const tn = ex * sy - ey * sx, un = ex * ry - ey * rx     // t = tn/den, u = un/den
            const inside = (v, d) => d > 0 ? (v > 0 && v < d) : (v < 0 && v > d)   // strictly inside both
            if (inside(tn, den) && inside(un, den)) {
              const X = Math.round(a0[0] + rx * tn / den), Y = Math.round(a0[1] + ry * tn / den)
              add[i][p].push([X, Y]); add[j][q].push([X, Y]); n++ }
          }
          // a vertex of one ring exactly ON the other's edge interior (exact integer collinearity + strict betweenness)
          const on = (P, s0, s1) => (s1[0] - s0[0]) * (P[1] - s0[1]) - (s1[1] - s0[1]) * (P[0] - s0[0]) === 0
            && Math.min(s0[0], s1[0]) <= P[0] && P[0] <= Math.max(s0[0], s1[0]) && Math.min(s0[1], s1[1]) <= P[1] && P[1] <= Math.max(s0[1], s1[1])
            && !(P[0] === s0[0] && P[1] === s0[1]) && !(P[0] === s1[0] && P[1] === s1[1])
          if (on(b0, a0, a1)) { add[i][p].push([b0[0], b0[1]]); n++ }
          if (on(a0, b0, b1)) { add[j][q].push([a0[0], a0[1]]); n++ }
        } }
    }
    if (!n) return { rings: R, rounds: round }
    for (let i = 0; i < R.length; i++) {
      const r = R[i], out = []
      for (let p = 0; p < r.length; p++) { const a0 = r[p], a1 = r[(p + 1) % r.length]; out.push(a0)
        const dx = a1[0] - a0[0], dy = a1[1] - a0[1], L2 = dx * dx + dy * dy
        const pts = add[i][p].filter((v, k, s) => s.findIndex(w => w[0] === v[0] && w[1] === v[1]) === k)
          .filter(v => !(v[0] === a0[0] && v[1] === a0[1]) && !(v[0] === a1[0] && v[1] === a1[1]))
          .map(v => ({ v, t: ((v[0] - a0[0]) * dx + (v[1] - a0[1]) * dy) / L2 })).sort((x, y) => x.t - y.t)
        for (const { v } of pts) out.push(v) }
      R[i] = out
    }
  }
  throw new Error(`[stamp] the crossing pass did not settle in ${maxRounds} rounds — a crossing keeps making another (${rings.length} rings)`)
}
