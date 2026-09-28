/**
 * groundCover.mjs — which ground groups are AREAL COVER (a land use, a wood, a lawn) and which are LINEAR FEATURES
 * (roads, stripes, curbs, sidewalks, treelawns, paths) or water. One definition, read by the bake and its checks.
 *
 * ⭐ The horizon past the rim takes a town's COVER, never its linear features (Jacob, 2026-09-28: a single edge sample
 * "extended outward" streaked every road, stripe and water band that crossed the rim, out to the horizon).
 */

/** Landscape overlays the ground bake draws as areal fills (bake-ground refines them as hard overlays). */
export const LANDSCAPE_OVERLAY_KEYS = new Set([
  'parking_lot', 'garden', 'playground', 'swimming_pool',
  'pitch', 'sports_centre', 'wood', 'scrub',
])

/** Areal cover: a land-use FACE or a landscape overlay. Everything else — the ribbon bands, treelawns, stripes, the
 *  bed and the water — is not cover. */
export const isSoftCover = (group) => group?.kind === 'face' || LANDSCAPE_OVERLAY_KEYS.has(group?.id)

/**
 * The horizon record: for each of `sectors` directions round the rim, the DOMINANT areal cover over a band just
 * inside it, and sample points (x, z) lying on that cover — the colour the horizon carries outward is the town's own
 * ground there, never a road that happens to cross the rim.
 * @param groups    [{ kind, id, renderOrder }] parallel to `tris`
 * @param triOf     (i) → { positions: Float32Array (x,y,z…), indices: Uint32Array } for group i
 * @param stencil   { center, radius, fade: { inner } }
 * @returns { sectors, band, of, cover: [id|null], points: [[x, z, x, z, …]] }
 */
export function horizonRecord(groups, triOf, stencil, { sectors = 256, band = [0.80, 0.99], radii = 12, spread = 5, keep = 12 } = {}) {
  const [cx, cz] = stencil.center, rim = stencil.fade?.inner ?? stencil.radius, r0 = rim * band[0], r1 = rim * band[1]
  const CELL = Math.max(5, (r1 - r0) / 8), grid = new Map(), tris = []
  groups.forEach((g, gi) => {
    const { positions: P, indices: I } = triOf(gi)
    for (let t = 0; t < I.length; t += 3) {
      const v = [0, 1, 2].map(e => [P[I[t + e] * 3], P[I[t + e] * 3 + 2]])
      const d = v.map(q => Math.hypot(q[0] - cx, q[1] - cz))
      if (Math.max(...d) < r0 - CELL || Math.min(...d) > r1 + CELL) continue
      const k = tris.push({ v, g }) - 1, xs = v.map(q => q[0]), zs = v.map(q => q[1])
      for (let a = Math.floor(Math.min(...xs) / CELL); a <= Math.floor(Math.max(...xs) / CELL); a++)
        for (let b = Math.floor(Math.min(...zs) / CELL); b <= Math.floor(Math.max(...zs) / CELL); b++) {
          const kk = a + ',' + b; (grid.get(kk) || grid.set(kk, []).get(kk)).push(k)
        }
    }
  })
  // The group drawn on top at (x, z): the one with the highest paint order among those containing it.
  const top = (x, z) => {
    let best = null
    for (const k of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
      const [a, b, c] = tris[k].v, d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
      if (!d) continue
      const w0 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d, w1 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d
      if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue
      if (!best || tris[k].g.renderOrder > best.renderOrder) best = tris[k].g
    }
    return best
  }
  const cover = [], points = []
  for (let s = 0; s < sectors; s++) {
    const a0 = ((s + 0.5) / sectors) * Math.PI * 2, byId = new Map()
    for (let ri = 0; ri < radii; ri++) for (let ai = 0; ai < spread; ai++) {
      const r = r0 + (r1 - r0) * (ri + 0.5) / radii, a = a0 + ((ai + 0.5) / spread - 0.5) * (Math.PI * 2 / sectors)
      // Stored rounded to the centimetre, and judged AT the stored point: a point on a cover's very edge can round
      // onto the road beside it (measured: 2 of Lafayette Square's 3,044 at 0.1 m).
      const x = +(cx + Math.cos(a) * r).toFixed(2), z = +(cz + Math.sin(a) * r).toFixed(2), g = top(x, z)
      if (!isSoftCover(g)) continue
      ;(byId.get(g.id) || byId.set(g.id, []).get(g.id)).push(x, z)
    }
    const dom = [...byId.entries()].sort((p, q) => q[1].length - p[1].length)[0]
    cover.push(dom ? dom[0] : null)
    const pts = dom ? dom[1] : []
    // keep at most `keep` of them, spread through the list
    const n = pts.length / 2, step = Math.max(1, n / keep), out = []
    for (let i = 0; i < n && out.length / 2 < keep; i += step) { const j = Math.floor(i) * 2; out.push(pts[j], pts[j + 1]) }
    points.push(out)
  }
  return { sectors, band, of: 'fade.inner', cover, points }
}
