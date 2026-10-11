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
// THAT chain nearest [x, z]. The chain comes from the caller's label (`tile.runs[].skelId`), so this is a projection onto
// a known chain, never a recovery of which chain is near (`A15`).

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
    const P = st.points, ids = [], ss = []
    let s = 0
    for (let i = 0; i < P.length; i++) {
      const k = key(P[i]), v = nodeAt.get(k) ?? add(P[i][0], P[i][1]); nodeAt.set(k, v)
      if (i > 0) {
        const [ax, az] = P[i - 1], [bx, bz] = P[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step))
        let prev = ids[ids.length - 1]
        for (let j = 1; j < n; j++) { const t = j / n, w = add(ax + (bx - ax) * t, az + (bz - az) * t); link(prev, w); ids.push(w); ss.push(s + L * t); prev = w }
        link(prev, v); s += L
      }
      ids.push(v); ss.push(s)
    }
    byId.set(id, { ids, ss, P })
  }
  // heat diffusion: each sweep adds variance α·step², so σ² needs σ²/(α·step²) sweeps
  const alpha = 0.5, sweeps = Math.round(sigma * sigma / (alpha * step * step))
  let h = Float64Array.from(H), g = new Float64Array(h.length)
  for (let k = 0; k < sweeps; k++) {
    for (let i = 0; i < h.length; i++) { const N = nbr[i]; if (!N.length) { g[i] = h[i]; continue }
      let a = 0; for (const j of N) a += h[j]; g[i] = (1 - alpha) * h[i] + alpha * a / N.length }
    ;[h, g] = [g, h]
  }
  function heightAt(skelId, p) {
    const c = byId.get(skelId)
    if (!c) return null
    let best = Infinity, out = null
    for (let i = 0; i + 1 < c.ids.length; i++) {
      const a = c.ids[i], b = c.ids[i + 1], dx = X[b] - X[a], dz = Z[b] - Z[a], L2 = dx * dx + dz * dz
      const u = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - X[a]) * dx + (p[1] - Z[a]) * dz) / L2)) : 0
      const d = (p[0] - X[a] - u * dx) ** 2 + (p[1] - Z[a] - u * dz) ** 2
      if (d < best) { best = d; out = h[a] + u * (h[b] - h[a]) }
    }
    return out
  }
  return { heightAt, sigma, step, stations: X.length, chains: byId.size, bridges }
}
