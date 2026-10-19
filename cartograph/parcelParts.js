// parcelParts.js — an assessor parcel's PARTS, from its rings by containment.
// An ArcGIS polygon (`fetch-parcels.mjs` keeps `geometry.rings` as served) may carry several OUTER rings, and Esri promises
// no ring order, so `rings[0]` is not the parcel: it may be one part of several, or a hole. A ring held by an even number of
// the parcel's other rings is a part's outer; one held by an odd number is a hole of the smallest outer one level up.
// Containment is by the ring's vertices (most of them inside), never by winding or order: two parts may share an edge.
// ⛔ A hole with no outer around it throws: the parcel's geometry cannot be read, and is never guessed.
// ▶ checks/claims-a-parcel-keeps-all-its-parts.mjs

const pip = (x, z, r) => { let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c }
  return c }
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(a) / 2 }

/** a point inside ring `r` ([[x, z], …]): the middle of the widest span its mid-height line cuts through it. ⛔ Never the
 *  vertex mean, which a concave ring need not hold (measured: PTown's seashore parcel, 11.7 km², clipped to the wrong block) */
export function pointInside(r) {
  let z0 = Infinity, z1 = -Infinity; for (const [, z] of r) { z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  const z = (z0 + z1) / 2, xs = []
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
    if ((zi > z) !== (zj > z)) xs.push(xi + (z - zi) * (xj - xi) / (zj - zi)) }
  xs.sort((a, b) => a - b)
  let best = null; for (let k = 0; k + 1 < xs.length; k += 2) if (!best || xs[k + 1] - xs[k] > best[1] - best[0]) best = [xs[k], xs[k + 1]]
  if (!best) throw new Error(`parcelParts: ⛔ the ring at (${r[0][0].toFixed(2)}, ${r[0][1].toFixed(2)}) has no interior at its mid-height — degenerate`)
  return [(best[0] + best[1]) / 2, z]
}

/** [[x, z], …] rings → [{ outer, holes }], one per part */
export function parcelParts(rings, name = 'a parcel') {
  const R = (rings || []).filter(r => r?.length >= 3)
  const inside = (a, b) => { let n = 0; for (const [x, z] of a) if (pip(x, z, b)) n++; return 2 * n > a.length }
  const depth = R.map((r, i) => R.reduce((d, o, j) => d + (j !== i && inside(r, o) ? 1 : 0), 0))
  const parts = R.map((r, i) => depth[i] % 2 === 0 ? { outer: r, holes: [] } : null)
  R.forEach((r, i) => { if (depth[i] % 2 === 0) return
    let best = -1
    for (let j = 0; j < R.length; j++) if (parts[j] && depth[j] === depth[i] - 1 && inside(r, R[j]) && (best < 0 || area(R[j]) < area(R[best]))) best = j
    if (best < 0) throw new Error(`parcelParts: ⛔ ${name}: ring ${i} (at (${r[0][0].toFixed(2)}, ${r[0][1].toFixed(2)})) lies inside ${depth[i]} of its parcel's rings but in no outer one level up — the parcel's geometry cannot be read`)
    parts[best].holes.push(r) })
  return parts.filter(Boolean)
}
