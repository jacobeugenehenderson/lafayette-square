// lineHeight.mjs — THE HEIGHT ALONG ①, ONCE (BRIEF-the-ground-knows-its-height §5 step 1).
//
// ⭐ Every street's line gets its height from the terrain sampled ALONG it and SMOOTHED along it ("smoothing is skeleton":
// it happens at the line, before anything is built from it). ① is two back-to-back ε offsets of each chain, so a height
// along ① IS a height along the chain; it is DERIVED here, like Section's bands, and never stored on ① itself.
// ⭐ ONE GRAPH, NOT ONE CHAIN AT A TIME. The at-grade network is smoothed as a single graph (heat diffusion over stations
// shared at every exact chain vertex, 0.1 mm — the mint's own node key), so a crossing has ONE height. Smoothed chain by
// chain, two streets disagree at their shared node (measured on HPDM at a 10 m window: p90 0.20 m, max 2.2 m —
// `scratch/ground-height/line-height.mjs`).
// ⭐ THE WINDOW is the town's (`design.json#groundLineSigmaM`, metres), else ONE TERRAIN GRID STEP — the scale below which
// the raster has no information, so smoothing at it removes the bilinear grid's facets without flattening real grade
// (Boz's ruling, 2026-10-11). ⛔ Never a constant chosen here.
// ⛔ A BRIDGE IS NOT ON THE GROUND: grade-separated chains get no line height, and are counted.
//
// The record: `heightAt(skelId, [x, z])` → the line's RAW height (pre-exaggeration, like `terrain.bin`) at the point of
// THAT chain nearest [x, z] — interpolated across the inside of a bend, so it is a continuous function of [x, z]. The chain
// comes from the caller's label (`tile.runs[].skelId`), so this is a projection onto a known chain, never a recovery of which
// chain is near (`A15`).

/** @param streets ribbons.json streets · @param raw (x, z) → raw terrain height · @param sigma metres (> 0)
 *  @returns { heightAt, sigma, step, stations, chains, bridges } */
export function lineHeights({ streets, raw, sigma }) {
  if (!(sigma > 0)) throw new Error(`lineHeights: the smoothing window must be metres > 0, got ${sigma}`)
  const step = sigma / 5                                      // stations well inside the window (the kernel spans ~6σ)
  const X = [], Z = [], H = [], nbr = []
  const nodeAt = new Map(), key = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`
  const add = (x, z) => { X.push(x); Z.push(z); H.push(raw(x, z)); nbr.push([]); return X.length - 1 }
  const link = (a, b) => { if (a === b) return; if (!nbr[a].includes(b)) nbr[a].push(b); if (!nbr[b].includes(a)) nbr[b].push(a) }
  const byId = new Map()
  let bridges = 0
  for (const st of streets || []) {
    if (!(st?.points?.length >= 2)) continue
    const id = st.skelId ?? st.name
    if (st.gradeSeparated) { bridges++; continue }
    if (byId.has(id)) throw new Error(`lineHeights: two at-grade chains share the id ${id} — a run's label could not name its line`)
    const P = st.points, ids = [], ss = [], at = []      // at[i]: the station index of chain vertex i
    let s = 0
    for (let i = 0; i < P.length; i++) {
      const k = key(P[i]), v = nodeAt.get(k) ?? add(P[i][0], P[i][1]); nodeAt.set(k, v)
      if (i > 0) {
        const [ax, az] = P[i - 1], [bx, bz] = P[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step))
        let prev = ids[ids.length - 1]
        for (let j = 1; j < n; j++) { const t = j / n, w = add(ax + (bx - ax) * t, az + (bz - az) * t); link(prev, w); ids.push(w); ss.push(s + L * t); prev = w }
        link(prev, v); s += L
      }
      at.push(ids.length); ids.push(v); ss.push(s)
    }
    // legOf[k]: the leg (P[j] → P[j + 1]) that station segment k lies on
    const legOf = new Int32Array(Math.max(0, ids.length - 1)); for (let j = 0; j + 1 < at.length; j++) legOf.fill(j, at[j], at[j + 1])
    byId.set(id, { ids, ss, P, at, legOf })
  }
  // heat diffusion: each sweep adds variance α·step², so σ² needs σ²/(α·step²) sweeps
  const alpha = 0.5, sweeps = Math.round(sigma * sigma / (alpha * step * step))
  let h = Float64Array.from(H), g = new Float64Array(h.length)
  for (let k = 0; k < sweeps; k++) {
    for (let i = 0; i < h.length; i++) { const N = nbr[i]; if (!N.length) { g[i] = h[i]; continue }
      let a = 0; for (const j of N) a += h[j]; g[i] = (1 - alpha) * h[i] + alpha * a / N.length }
    ;[h, g] = [g, h]
  }
  // a point's foot on station segment i of chain c: its squared distance and its height there (clamped to the segment)
  const foot = (c, i, p) => { const a = c.ids[i], b = c.ids[i + 1], dx = X[b] - X[a], dz = Z[b] - Z[a], L2 = dx * dx + dz * dz
    const w = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - X[a]) * dx + (p[1] - Z[a]) * dz) / L2)) : 0
    return { h: h[a] + w * (h[b] - h[a]), d2: (p[0] - X[a] - w * dx) ** 2 + (p[1] - Z[a] - w * dz) ** 2 } }
  // a point's foot on LEG j of chain c (the straight P[j] → P[j + 1], its stations collinear on it): the height at the foot,
  // clamped to the leg, read off the leg's own stations; the leg's direction and length
  const legFoot = (c, j, p) => { const A = c.P[j], B = c.P[j + 1], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz)
    const u = L > 0 ? ((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / (L * L) : 0, n = c.at[j + 1] - c.at[j], f = Math.max(0, Math.min(1, u)) * n
    const k = Math.min(n - 1, Math.floor(f)), a = c.ids[c.at[j] + k], b = c.ids[c.at[j] + k + 1]
    return { h: h[a] + (f - k) * (h[b] - h[a]), dx: L > 0 ? dx / L : 0, dz: L > 0 ? dz / L : 0, L } }
  // ⭐ A CONTINUOUS FUNCTION OF THE POINT (Boz, 2026-10-17). The nearest segment alone JUMPS on the inside of a bend: there P's
  // foot lies past V on neither of the two legs meeting there, and which is nearer flips across the bisector (HPDM, the bare
  // nearest answer: 6,690 of 18,135 turning vertices, ▶ the check below; berthold-avenue-3 30.818 → 30.788 m between points
  // 2 mm apart). THE WEDGE is that inside sector, a = (P − V)·d_out ≥ 0 and b = −(P − V)·d_in ≥ 0: there the height is
  // (1 − t)·h_in + t·h_out, each leg's height read at its own foot (clamped to the leg), t = w_out / (w_out + w_in) with
  // w_out = a·(1 − 2b/L_in)⁺ and w_in = b·(1 − 2a/L_out)⁺. On the wedge's edges one weight is 0 and its foot is V itself — where
  // the other leg alone answers outside the wedge; and each weight falls to 0 at its own half-leg's end, so a wedge reaches only
  // the half-legs beside V (no leg far along is mixed in, and two wedges never compete). So the lookup is continuous, with no
  // constant. For a turn under 90° no point of either leg is in the wedge, so ON the chain it is the leg's own height.
  // ⛔ A turn of 90° or more keeps the nearest answer (its wedge would hold the legs themselves); and farther from the chain
  // than half a leg beside the nearest one, or where the nearest leg does not meet V (a chain that doubles back), the nearest
  // point can lie on legs that do not meet (the offset's swallowtail), which no local rule resolves.
  // ▶ checks/claims-the-line-is-continuous.mjs
  function heightAt(skelId, p) {
    const c = byId.get(skelId)
    if (!c) return null
    let best = Infinity, k = -1
    for (let i = 0; i + 1 < c.ids.length; i++) { const f = foot(c, i, p); if (f.d2 < best) { best = f.d2; k = i } }
    if (k < 0) return null
    const L = c.legOf[k]
    for (const [i, j] of [[L, L + 1], [L - 1, L]]) {
      if (i < 0 || j + 1 >= c.P.length) continue
      const A = legFoot(c, i, p), B = legFoot(c, j, p)
      if (!(A.L > 0 && B.L > 0) || !(A.dx * B.dx + A.dz * B.dz > 0)) continue
      const V = c.P[j], vx = p[0] - V[0], vz = p[1] - V[1], b = -(vx * A.dx + vz * A.dz), a = vx * B.dx + vz * B.dz
      if (!(a >= 0 && b >= 0)) continue
      const wOut = a * Math.max(0, 1 - 2 * b / A.L), wIn = b * Math.max(0, 1 - 2 * a / B.L)
      // a wedge whose weight on the other leg is 0 adds nothing to the nearest leg's answer: the next wedge decides
      if ((i === L ? wOut : wIn) > 0) return A.h + (B.h - A.h) * wOut / (wOut + wIn)
    }
    return foot(c, k, p).h
  }
  return { heightAt, sigma, step, stations: X.length, chains: byId.size, bridges }
}
