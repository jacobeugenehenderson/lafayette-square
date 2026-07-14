// inhabitedMask.js — the automatic "inhabited shape" of a poured neighborhood.
//
// WHY: an extent boundary far larger than the real neighborhood (e.g. an
// Altadena-CDP-sized disc, ~2× the walkable hood) pours ground-fill tiles for a
// vast empty periphery of buildingless blocks nobody will ever see — tens of
// millions of flat triangles / hundreds of MB (2026-07-14). This derives the
// developed footprint and lets the tile ground CULL to it: keep the inhabited
// core + one block of context, drop the sprawl.
//
// The shape is derived from the MEMBER building set (post-exclusion-loops /
// overrides), so the pen's exclusion authoring flows through for free — exclude
// a cluster and its ground drops with it — and it re-derives whenever the
// operator changes the extent. Purely automatic for now; a later pass can
// surface the derived edge as an operator-editable band.
//
// Algorithm — O(buildings + cells), ~6 ms at 15k buildings:
//   1. occupancy — mark the grid cell of each member building's centroid
//   2. dilate    — grow occupied by ~marginM ("one block of context", a knob)
//   3. fill holes — flood empties inward from the border; any empty NOT reached
//      is ENCLOSED (a park/plaza ringed by houses) → keep it (park-safe)
//
// Dense hoods (LS) dilate to full disc coverage → the cull is a NO-OP there;
// only oversized/sparse extents (the CDP) actually get trimmed. Self-disabling.

export const DEFAULT_CONTEXT_MARGIN_M = 80   // ≈ one block; per-hood override via nb.contextMargin

// buildingRings: array of rings ([{x,z}|[x,z], …]); marginM: context margin (m);
// cell: raster resolution (m). Returns { cellIn(x,z), coverage, nx, nz } where
// cellIn is the tile-keep predicate and coverage is inhabited/total cells.
export function buildInhabitedMask(buildingRings, marginM = DEFAULT_CONTEXT_MARGIN_M, cell = 25) {
  const cents = []
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const r of buildingRings || []) {
    if (!r || r.length < 3) continue
    let sx = 0, sz = 0
    for (const p of r) { sx += (p.x ?? p[0]); sz += (p.z ?? p[1]) }
    const cx = sx / r.length, cz = sz / r.length
    cents.push([cx, cz])
    if (cx < minX) minX = cx; if (cx > maxX) maxX = cx
    if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz
  }
  if (!cents.length) return { cellIn: () => true, coverage: 1, nx: 0, nz: 0 }  // no buildings → cull nothing

  const pad = marginM + cell * 2
  minX -= pad; minZ -= pad; maxX += pad; maxZ += pad
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell))
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell))
  const gx = (x) => Math.max(0, Math.min(nx - 1, Math.floor((x - minX) / cell)))
  const gz = (z) => Math.max(0, Math.min(nz - 1, Math.floor((z - minZ) / cell)))

  // 1. occupancy
  const occ = new Uint8Array(nx * nz)
  for (const [x, z] of cents) occ[gz(z) * nx + gx(x)] = 1

  // 2. dilate by r cells (~marginM), circular
  const r = Math.max(1, Math.ceil(marginM / cell)), r2 = r * r
  const dil = new Uint8Array(nx * nz)
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    if (!occ[z * nx + x]) continue
    for (let dz = -r; dz <= r; dz++) { const zz = z + dz; if (zz < 0 || zz >= nz) continue
      for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx < 0 || xx >= nx) continue
        if (dx * dx + dz * dz <= r2) dil[zz * nx + xx] = 1 } }
  }

  // 3. fill holes: flood the empty (non-dilated) cells reachable from the border;
  //    any empty cell NOT reached is enclosed → part of the inhabited shape.
  const outside = new Uint8Array(nx * nz)
  const stack = []
  for (let x = 0; x < nx; x++) { stack.push(x); stack.push((nz - 1) * nx + x) }
  for (let z = 0; z < nz; z++) { stack.push(z * nx); stack.push(z * nx + nx - 1) }
  while (stack.length) {
    const i = stack.pop()
    if (outside[i] || dil[i]) continue
    outside[i] = 1
    const x = i % nx, z = (i - x) / nx
    if (x > 0) stack.push(i - 1); if (x < nx - 1) stack.push(i + 1)
    if (z > 0) stack.push(i - nx); if (z < nz - 1) stack.push(i + nx)
  }

  let inhab = 0
  const mask = new Uint8Array(nx * nz)
  for (let i = 0; i < mask.length; i++) { if (dil[i] || !outside[i]) { mask[i] = 1; inhab++ } }

  return {
    cellIn: (x, z) => mask[gz(z) * nx + gx(x)] === 1,
    coverage: inhab / (nx * nz),
    nx, nz,
  }
}
