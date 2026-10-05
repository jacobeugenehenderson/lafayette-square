/**
 * fieldAxis.js — WHICH FIELD A GROUND TRIANGLE BELONGS TO, AND WHICH WAY THAT FIELD'S ROWS RUN.
 *
 * ⭐ The crop surface (`cartograph/surfaces.mjs` SURFACES.crop, `perField`) needs each field's own
 * row bearing: rows follow the field's long axis, and a fixed bearing across a town reads as
 * wallpaper (`_archive/BRIEF-field-shader-2026-10-04 §4①`). The bake merges every face of a class into one mesh, so
 * the field a vertex belongs to is written here, at bake, from the class's own face polygons.
 *
 * ⛔ PURE (no fs, no three): the bake and `checks/claims-crop-rows-derived-per-field.mjs` both
 * import it.
 */

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

function convexHull(pts) {
  const p = pts.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const lo = [], hi = []
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q) }
  return lo.slice(0, -1).concat(hi.slice(0, -1))
}

const xy = (v) => (Array.isArray(v) ? v : [v.x, v.z ?? v.y])

/**
 * The minimum-area enclosing rectangle of a ring (rotating an edge of the convex hull).
 * Returns { bearing, cx, cz, halfLen, halfWid } — `bearing` (radians, world XZ, atan2(dz, dx))
 * runs along the LONG side, which is the way the rows run.
 */
export function minAreaRect(ring) {
  const h = convexHull(ring.map(xy))
  if (h.length < 3) throw new Error(`⛔ minAreaRect: degenerate field ring (${h.length} hull points)`)
  let best = null
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-9) continue
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const q of h) {
      const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v
    }
    const area = (u1 - u0) * (v1 - v0)
    if (!best || area < best.area) best = { area, ux, uz, u0, u1, v0, v1 }
  }
  const { ux, uz, u0, u1, v0, v1 } = best
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2
  const cx = um * ux - vm * uz, cz = um * uz + vm * ux
  const lu = (u1 - u0) / 2, lv = (v1 - v0) / 2
  // Rows along the long side.
  return lu >= lv
    ? { bearing: Math.atan2(uz, ux), cx, cz, halfLen: lu, halfWid: lv }
    : { bearing: Math.atan2(ux, -uz), cx, cz, halfLen: lv, halfWid: lu }
}

function inRing(x, z, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = xy(ring[i]), [xj, zj] = xy(ring[j])
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
function distToRing(x, z, ring) {
  let d = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = xy(ring[j]), [bx, bz] = xy(ring[i])
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0
    d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz))
  }
  return d
}

/**
 * Split a class's merged ground mesh by field. `fields` = the class's face polygons
 * ({ outer, holes }) — one per face interior ring, since `luByClass` unions a class's faces.
 * Every triangle goes to the field containing its centroid; one the mesh draws outside every
 * polygon is placed and COUNTED (`outside`), never silently. Vertices are duplicated where two
 * fields meet, so each vertex carries exactly one field.
 * Returns { positions, indices, fieldOfVertex, edgeOfVertex (m to the field's own boundary): Float32Array,
 *           outside, emptyFields, fields: [{ ...minAreaRect, areaM2 }] }.
 */
export function splitByField(positions, indices, fields) {
  const F = fields.map(f => {
    const o = f.outer.map(xy)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, a = 0
    for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
      x0 = Math.min(x0, o[i][0]); x1 = Math.max(x1, o[i][0]); z0 = Math.min(z0, o[i][1]); z1 = Math.max(z1, o[i][1])
      a += (o[j][0] * o[i][1] - o[i][0] * o[j][1]) / 2
    }
    const holes = (f.holes || []).map(h => h.map(xy))
    for (const h of holes) { let ha = 0; for (let i = 0, j = h.length - 1; i < h.length; j = i++) ha += (h[j][0] * h[i][1] - h[i][0] * h[j][1]) / 2; a -= Math.abs(ha) }
    return { outer: o, holes, x0, x1, z0, z1, areaM2: Math.abs(a) }
  })
  const triCount = indices.length / 3
  const triField = new Int32Array(triCount)
  const outside = { tris: 0, m2: 0, maxM: 0 }
  for (let t = 0; t < triCount; t++) {
    let cx = 0, cz = 0
    for (let k = 0; k < 3; k++) { const v = indices[t * 3 + k]; cx += positions[v * 3] / 3; cz += positions[v * 3 + 2] / 3 }
    let hit = -1
    for (let f = 0; f < F.length && hit < 0; f++) {
      const g = F[f]
      if (cx < g.x0 || cx > g.x1 || cz < g.z0 || cz > g.z1) continue
      if (inRing(cx, cz, g.outer) && !g.holes.some(h => inRing(cx, cz, h))) hit = f
    }
    if (hit < 0) {
      // ⚠️ MEASURED on huron 2026-09-26: the conformed ground mesh draws 0.77 ha of a class OUTSIDE
      // the class's own polygons — holes it fills (a 6,170 m² one) and a sliver at the disc rim.
      // Cause not established; it is the ground bake's, not this split's. Such a triangle goes to
      // the field whose OUTLINE holds it, else the nearest, and is COUNTED and reported every bake.
      let best = Infinity
      for (let f = 0; f < F.length && hit < 0; f++) if (inRing(cx, cz, F[f].outer)) { hit = f; best = 0 }
      if (hit < 0) for (let f = 0; f < F.length; f++) {
        const d = distToRing(cx, cz, F[f].outer)
        if (d < best) { best = d; hit = f }
      }
      let a = 0
      { const v = [0, 1, 2].map(k => indices[t * 3 + k]); a = Math.abs((positions[v[1] * 3] - positions[v[0] * 3]) * (positions[v[2] * 3 + 2] - positions[v[0] * 3 + 2]) - (positions[v[2] * 3] - positions[v[0] * 3]) * (positions[v[1] * 3 + 2] - positions[v[0] * 3 + 2])) / 2 }
      outside.tris++; outside.m2 += a; outside.maxM = Math.max(outside.maxM, best)
    }
    triField[t] = hit
  }
  // Re-index: one vertex per (source vertex, field).
  const key = new Map(), pos = [], fov = [], idx = new Uint32Array(indices.length)
  for (let t = 0; t < triCount; t++) for (let k = 0; k < 3; k++) {
    const v = indices[t * 3 + k], f = triField[t], kk = v * 65536 + f
    let n = key.get(kk)
    if (n === undefined) { n = fov.length; key.set(kk, n); pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); fov.push(f) }
    idx[t * 3 + k] = n
  }
  // Each vertex's distance (m) to ITS field's own boundary, outer ring and holes — the headland reads
  // it (surfaces.mjs crop `headlandRows`). Exact at the vertex; the GPU interpolates it linearly, which
  // is exact beside a straight edge and rounds a sharp corner off.
  const segs = F.map(g => {
    const out = []
    for (const r of [g.outer, ...g.holes]) for (let i = 0, j = r.length - 1; i < r.length; j = i++) out.push(r[j][0], r[j][1], r[i][0], r[i][1])
    return out
  })
  const edgeOfVertex = new Float32Array(fov.length)
  for (let n = 0; n < fov.length; n++) {
    const x = pos[n * 3], z = pos[n * 3 + 2], S = segs[fov[n]]
    let d2 = Infinity
    for (let k = 0; k < S.length; k += 4) {
      const ax = S[k], az = S[k + 1], dx = S[k + 2] - ax, dz = S[k + 3] - az, L = dx * dx + dz * dz
      const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0
      const ex = x - ax - t * dx, ez = z - az - t * dz, e = ex * ex + ez * ez
      if (e < d2) d2 = e
    }
    edgeOfVertex[n] = Math.sqrt(d2)
  }
  const used = new Set(triField)
  return {
    positions: new Float32Array(pos), indices: idx, fieldOfVertex: new Float32Array(fov), edgeOfVertex, outside,
    emptyFields: F.length - used.size,
    fields: fields.map((f, i) => ({ ...minAreaRect(f.outer), areaM2: Math.round(F[i].areaM2) })),
  }
}
