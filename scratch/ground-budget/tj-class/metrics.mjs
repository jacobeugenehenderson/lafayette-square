// metrics.mjs — what a conformity output looks like, for the T-junction class (Boz 2026-10-18). Read-only on buffers.
// bufs: [{positions, indices}] per group (as conformAndRefine returns) · ids: group ids · det: { stock, exact } detectors
//  T-junctions: by the stock (1 mm welded) detector and by the exact-identity one
//  degenerate: triangles of zero float32 area, and triangles with two corners in one 1 mm weld cell
//  inverted: triangles whose signed area has the opposite sign to the mesh's own (emit winds every one the same way)
//  non-manifold: edges used by more than 2 triangles (exact identity; and welded on 1 mm)
//  sub-mm: edges shorter than the lattice (exact)
import { CLIP_SCALE, LATTICE_M } from '/Users/jacobhenderson/Desktop/lafayette-square.nosync/src/lib/lattice.js'
export function metrics(bufs, ids, det, near = null) {
  const m = { tris: 0, zeroArea: 0, weldCollapsed: 0, inverted: 0, nonManifoldExact: 0, nonManifoldWelded: 0, subMM: 0 }
  const wk = (x, z) => Math.round(x * CLIP_SCALE) + ',' + Math.round(z * CLIP_SCALE), xk = (x, z) => x + ',' + z
  let pos = 0, neg = 0; const sg = []
  const eX = new Map(), eW = new Map(), sub = new Set()
  for (const b of bufs) { const P = b.positions, I = b.indices
    for (let t = 0; t < I.length; t += 3) { m.tris++
      const v = [0, 1, 2].map(k => [P[I[t + k] * 3], P[I[t + k] * 3 + 2]])
      const A = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1])
      if (A === 0) m.zeroArea++; else if (A > 0) pos++; else neg++
      sg.push(Math.sign(A))
      const W = v.map(p => wk(...p)), X = v.map(p => xk(...p))
      if (W[0] === W[1] || W[1] === W[2] || W[2] === W[0]) m.weldCollapsed++
      for (let k = 0; k < 3; k++) { const p = v[k], q = v[(k + 1) % 3]
        const ex = X[k] < X[(k + 1) % 3] ? X[k] + '|' + X[(k + 1) % 3] : X[(k + 1) % 3] + '|' + X[k]; eX.set(ex, (eX.get(ex) || 0) + 1)
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < LATTICE_M && X[k] !== X[(k + 1) % 3]) sub.add(ex)
        if (W[k] !== W[(k + 1) % 3]) { const ew = W[k] < W[(k + 1) % 3] ? W[k] + '|' + W[(k + 1) % 3] : W[(k + 1) % 3] + '|' + W[k]; eW.set(ew, (eW.get(ew) || 0) + 1) } } } }
  const dom = pos >= neg ? 1 : -1; m.inverted = sg.filter(s => s === -dom).length
  for (const n of eX.values()) if (n > 2) m.nonManifoldExact++
  for (const n of eW.values()) if (n > 2) m.nonManifoldWelded++
  m.subMM = sub.size
  const g = bufs.map((b, i) => ({ id: ids[i], ...b }))
  for (const [k, f] of Object.entries(det)) { const r = f(g); m['tj_' + k] = r.total
    if (near) m['tjNear_' + k] = r.found.filter(x => Math.max(Math.abs(x.x - near[0]), Math.abs(x.z - near[1])) < near[2]).length }
  return m
}
