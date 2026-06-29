// groundSampler.js — the shared "where is the DRAWN ground at (x,z)" sampler.
//
// The single SSoT for seating ground-anchored objects on the SAME surface the
// slab actually renders, instead of each object re-deriving height from the
// smooth terrain field (which the coarse ground mesh only approximates between
// its vertices → the "nothing sits on the ground" float). This is the
// buildings/foundations `aCentroidY` regime, generalized: a consumer bakes a
// per-object anchor `groundRawAt(x,z)` and rigid-lifts by `anchor × uExag` at
// runtime, so it sits exactly on the drawn ground at every exaggeration.
//
// Returns the RAW field value (pre-uExag), barycentric-interpolated over the
// ground triangle the point falls in, taken from the TOP-MOST group at that XZ
// (what you visually stand on). After the 2026-06-29 CPU↔GPU reconcile the CPU
// `getElevationRaw` used here equals what the GPU renders per vertex, so the
// interpolation matches the drawn surface exactly. (2026-06-29)

const CELL_M = 8   // spatial-grid cell size for the triangle lookup

// groundJson  — parsed ground.json manifest (groups + bbox)
// groundAB    — ground.bin as an ArrayBuffer (float32 XYZ positions, uint32 indices)
// elevationSampler — from terrainCommon.makeElevationSampler (getElevationRaw)
export function makeGroundSampler(groundJson, groundAB, elevationSampler) {
  const { groups, bbox } = groundJson
  const getRaw = elevationSampler.getElevationRaw

  // Flatten every ground triangle, tagged with its group's renderOrder, with
  // the raw field precomputed at each vertex (the per-vertex lift the GPU draws).
  const tris = []  // flat: [ax,az,ra, bx,bz,rb, cx,cz,rc, renderOrder] × N
  for (const g of groups) {
    const positions = new Float32Array(groundAB, g.vertexByteOffset, g.vertexCount * 3)
    const indices   = new Uint32Array(groundAB, g.indexByteOffset, g.indexCount)
    const vraw = new Float32Array(g.vertexCount)
    for (let v = 0; v < g.vertexCount; v++) vraw[v] = getRaw(positions[v * 3], positions[v * 3 + 2])
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i], i1 = indices[i + 1], i2 = indices[i + 2]
      tris.push(
        positions[i0 * 3], positions[i0 * 3 + 2], vraw[i0],
        positions[i1 * 3], positions[i1 * 3 + 2], vraw[i1],
        positions[i2 * 3], positions[i2 * 3 + 2], vraw[i2],
        g.renderOrder,
      )
    }
  }
  const STRIDE = 10
  const triCount = tris.length / STRIDE

  // Uniform grid: bucket each triangle into every cell its XZ-bbox overlaps.
  const minX = bbox.min[0], minZ = bbox.min[2], maxX = bbox.max[0], maxZ = bbox.max[2]
  const nx = Math.max(1, Math.ceil((maxX - minX) / CELL_M))
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / CELL_M))
  const grid = Array.from({ length: nx * nz }, () => [])
  const cx = (x) => Math.max(0, Math.min(nx - 1, Math.floor((x - minX) / CELL_M)))
  const cz = (z) => Math.max(0, Math.min(nz - 1, Math.floor((z - minZ) / CELL_M)))
  for (let t = 0; t < triCount; t++) {
    const o = t * STRIDE
    const tminx = Math.min(tris[o], tris[o + 3], tris[o + 6]), tmaxx = Math.max(tris[o], tris[o + 3], tris[o + 6])
    const tminz = Math.min(tris[o + 1], tris[o + 4], tris[o + 7]), tmaxz = Math.max(tris[o + 1], tris[o + 4], tris[o + 7])
    for (let gz = cz(tminz); gz <= cz(tmaxz); gz++)
      for (let gx = cx(tminx); gx <= cx(tmaxx); gx++)
        grid[gz * nx + gx].push(t)
  }

  // Barycentric raw-field at (px,pz) inside triangle t, or null if outside.
  function sampleTri(px, pz, t) {
    const o = t * STRIDE
    const ax = tris[o], az = tris[o + 1], ra = tris[o + 2]
    const bx = tris[o + 3], bz = tris[o + 4], rb = tris[o + 5]
    const cxx = tris[o + 6], czz = tris[o + 7], rc = tris[o + 8]
    const v0x = cxx - ax, v0z = czz - az
    const v1x = bx - ax, v1z = bz - az
    const v2x = px - ax, v2z = pz - az
    const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z
    const d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z
    const denom = d00 * d11 - d01 * d01
    if (Math.abs(denom) < 1e-12) return null
    const wc = (d11 * d20 - d01 * d21) / denom
    const wb = (d00 * d21 - d01 * d20) / denom
    const wa = 1 - wc - wb
    const EPS = 1e-4
    if (wa < -EPS || wb < -EPS || wc < -EPS) return null
    return ra * wa + rb * wb + rc * wc
  }

  // Raw drawn-ground field at (x,z): the top-most group's triangle wins; if the
  // point is off the mesh, fall back to the smooth field so a caller never NaNs.
  function groundRawAt(x, z) {
    const cell = grid[cz(z) * nx + cx(x)]
    let best = null, bestRO = -Infinity
    for (const t of cell) {
      const ro = tris[t * STRIDE + 9]
      if (ro < bestRO) continue
      const r = sampleTri(x, z, t)
      if (r !== null) { best = r; bestRO = ro }
    }
    return best !== null ? best : getRaw(x, z)
  }

  return { groundRawAt, triCount }
}
